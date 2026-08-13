# EasyRead API

The engine behind EasyRead: upload a document, get a plain-English rewrite of
every page, streamed in as it's written.

Two processes share one domain — an **API** that answers requests and enqueues
work, and a **worker** that runs the pipeline. Neither does the other's job, so
a slow model call can never tie up a request.

## Running it

Nothing external is required. With no API keys configured the app boots on a
deterministic stand-in model and local disk storage, and the whole flow —
register, upload a PDF, watch pages arrive over SSE, export — works offline.

```bash
docker compose up -d          # MySQL on 3307, Redis on 6380
cp .env.example .env
npm install
npm run migrate:dev
npm start                     # API on :4000
npm run worker                # pipeline worker, second terminal
```

## Layout

```
src/
  business/          the domain — no framework, no SQL, no HTTP
    domain/            entities, value objects, errors
    ports/             interfaces for everything outside the process
    repositories/      interfaces for persistence
    handlers/          one class per command (Template Method + CommandResponse)
  query/             read models, straight to Sequelize, no domain round trip
  pipeline/          orchestrator, queue definitions, job processors
  web/               everything framework-shaped
    controllers/       HTTP surface
    adapters/          port implementations
    repositories/      Sequelize implementations
    security/          auth guard, @CurrentUser, @Public
    validation/        class-validator DTOs
    filters/           domain error -> HTTP envelope
    providers/         binds ports and repositories, chosen by env
  contracts/         the API's public shape, shared verbatim with the frontend
```

Reads bypass the domain on purpose. A library grid asking entities to reassemble
themselves would be slower and no safer, so `query/` talks to the database
directly and `business/` owns everything that changes state.

## The pipeline

```
uploaded ─► convert ─► extract ─┬─► summarize ─► simplify (one job per page)
                                ├─► topics     (also waits on summarize)
                                └─► embed
```

Orchestration is explicit: each job, on success, asks `PipelineOrchestrator`
what is now unblocked. Every step is recorded in `pipeline_runs`, and a step
already marked `done` is never run twice — which is what makes the pipeline safe
to replay after a crash or a redeploy.

The unit of work is **one page**. A page that fails leaves the other 299 intact
and costs one retry to fix, and the reader can start on page 1 while page 40 is
still being written. Jobs also carry the document's `contentVersion`; a job for a
superseded version exits quietly rather than writing stale content.

Progress reaches the browser over SSE (`GET /documents/:id/events`), and the
stream opens with a full `snapshot` so a client that reconnects never has to
replay events it already applied.

## Swapping providers

Everything outside the process sits behind a port, and `web/providers` picks the
implementation from env. The local adapter is the default in each case, so a
fresh clone runs end to end and the offline path can't quietly rot.

| Port         | Default               | Alternative                             | Switch             |
| ------------ | --------------------- | --------------------------------------- | ------------------ |
| Storage      | local disk            | Google Drive                            | `STORAGE_DRIVER`   |
| Converter    | PDF passthrough       | Drive import/export (free Office → PDF) | `CONVERTER_DRIVER` |
| Models       | Vercel AI SDK         | offline stand-in (see below)            | `LLM_DRIVER`       |
| Image search | none (no results)     | Google Programmable Search              | `GOOGLE_SEARCH_*`  |
| Vector store | MySQL + cosine in app | —                                       | —                  |

Office conversion goes through Drive rather than a paid converter: uploading a
DOCX while asking Drive to store it as a Google Doc converts it on import, and
exporting a Google-native file as PDF is free. The intermediate file is always
deleted, and no file is ever given public permissions.

## Models

Every model call goes through one gateway (`AiSdkLlmAdapter`) on the Vercel AI
SDK, so the model is a config value rather than a code change. Models are named
`provider:model-id`:

```bash
AI_MODEL_DEFAULT=openai:gpt-4o-mini
AI_MODEL_SIMPLIFY_STANDARD=anthropic:claude-sonnet-4-5   # optional override
AI_EMBED_MODEL=openai:text-embedding-3-small
```

Providers wired up: `openai`, `anthropic`, `google`. Each reads its own key
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`), and only
providers your config actually names are constructed — running entirely on
OpenAI never needs an Anthropic key. A provider that is named but has no key
**stops the process at boot**, rather than surfacing as a failed document later.

Overrides are per task because the tasks are not the same size: simplification
is one call per page, so a 300-page document is 300 calls, while a highlight is
one. Moving only `AI_MODEL_SIMPLIFY_*` to a cheaper model is usually the whole
cost conversation. Spend is queryable from `ai_call_logs`, which records the
provider-qualified model and token counts for every call.

Page simplification and topic outlining use the SDK's structured output with a
zod schema, so a malformed response raises instead of quietly degrading into a
blank page.

`OPENAI_API_MODE=chat` switches from OpenAI's Responses API to chat completions,
which is what OpenAI-compatible gateways (OpenRouter, Groq, a local server)
speak. Point `OPENAI_BASE_URL` at them.

### The offline stand-in

`LLM_DRIVER=fake` swaps in an adapter that calls no model at all — it
restructures the page's own text into the block shape. It exists so the queue
graph, SSE stream, per-page failure isolation and exports can be exercised with
no key and no spend, and it is **opt-in only**: a missing key never falls back to
it, because a deployment running the stand-in would look like it was working.

## Notes

- Refresh tokens are stored hashed, rotate on every use, and a replayed token
  revokes the whole family.
- Plan limits are resolved from our own `subscriptions` row, never a call to the
  payment provider.
- Usage counters reserve first and verify after, so two requests racing the last
  slot can't both win.
- Deleting is two-phase: instant and reversible, with the purge job hard-deleting
  files and rows 14 days later.
- Billing (checkout, webhooks, cancellation) is deliberately not wired up yet;
  the `PaymentsPort` and its fake are in place for it.

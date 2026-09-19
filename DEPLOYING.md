# Deploying EasyRead

Written for Railway, but nothing here is Railway-specific beyond the variable
references — any platform that can run two Node services against MySQL, Redis
and an S3 bucket will do.

## The shape of it

Nine services. Two of them are this same repository, deployed twice; four
are folders of it, each built from its own Dockerfile.

| Service | What it is | Start command |
| --- | --- | --- |
| **MySQL** | managed database | — |
| **Redis** | queues *and* the live-progress bus | — |
| **Bucket** | S3-compatible object storage | — |
| **API** | this repo, HTTP | `npm run start:prod` |
| **Worker** | this repo, no HTTP | `npm run worker:prod` |
| **Voice** | `speech/kokoro/`, Kokoro on CPU | the Dockerfile's |
| **Tutor Voice** | the same folder, `TTS_MODE=tutor` | the Dockerfile's |
| **LiveKit** | `speech/livekit/`, the room for live tutoring | the Dockerfile's |
| **Tutor** | `speech/tutor/`, the agent that joins the room | the Dockerfile's |

The API answers requests and enqueues work; it never processes a document.
The worker consumes the queues and does everything slow — conversion, text
extraction, OCR, summarising, per-page simplification, exports. **Deploy only
the API and uploads will sit in `processing` forever.**

They never call each other. They meet in three places: Redis (the API pushes
jobs, the worker publishes progress the API relays to browsers over SSE),
MySQL (the worker writes rows the API later reads), and the bucket (the API
writes the upload, the worker reads it back).

## Why the bucket is not optional

A container's filesystem is wiped on every deploy, and a Railway volume can be
attached to only one service — so the API could never hand a file to the
worker. `STORAGE_DRIVER=local` in production means losing every user's
documents at the next deploy. Set `STORAGE_DRIVER=s3`.

Before deploying, prove the credentials work:

```bash
npm run check:storage
```

It round-trips a file through the configured driver — including the ranged
read the PDF reader depends on — and exits non-zero if anything is wrong.

## Variables

Both the API and the worker need the same set. The only ones exclusive to the
API are `PORT` (injected by the platform) and `FRONTEND_URL`.

```
NODE_ENV=production
FRONTEND_URL=https://app.your-domain.com   # exact client origin; drives CORS
DATABASE_URL=${{MySQL.MYSQL_URL}}          # use the private/internal URL
REDIS_URL=${{Redis.REDIS_URL}}             # use the private/internal URL

JWT_ACCESS_SECRET=<fresh random>
JWT_REFRESH_SECRET=<fresh random>

STORAGE_DRIVER=s3
S3_BUCKET=...
S3_ENDPOINT=...            # your bucket's endpoint
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto
S3_FORCE_PATH_STYLE=true   # false only on AWS S3 itself

OPENAI_API_KEY=...
MISTRAL_API_KEY=...        # hosted OCR; without it scans fall back to
                           # per-page vision, which is far slower
FREE_PLAN_UNLIMITED=false  # true is a local testing switch — never ship it
```

Prefer each service's **private** URL for MySQL and Redis: internal traffic is
faster and isn't billed as egress.

## The voice

A learner's own upload is narrated by Kokoro running on CPU in the **Voice**
service: always warm, one page at a time, a few cents an audio hour. A
school's catalogue is narrated by the same Kokoro on a Modal GPU
(`MODAL_TTS_*`), which is fast on a batch and asleep between runs.

Deploy the Voice service from the `speech/kokoro` folder, with the CLI from
inside that folder (`railway up --service voice`) or with the service's root
directory set to it. Give it 8 vCPU and 4 GB, a health check at `/health`,
and two variables:

```
TTS_TOKEN=<fresh random>     # the worker sends it as a bearer token
TTS_VOICE=am_puck
```

Then on the worker, its private address and the same token:

```
KOKORO_TTS_URL=http://easy-read-voice-server.railway.internal:8880
KOKORO_TTS_TOKEN=<the same>
KOKORO_USD_PER_AUDIO_HOUR=0.10   # what the bench measured; prices the ledger
```

A public domain on the Voice service is only needed for a worker running
outside Railway (a laptop); the token guards it either way. With
`KOKORO_TTS_URL` empty, a learner's upload is narrated by OpenAI's voice
instead. That is configuration, not a fallback: a page the Voice service
cannot narrate fails and is retried there, never sent to OpenAI.

## The live tutor

A tutor marked `livekit` in `tutors.ts` talks on our own line: a LiveKit
room, open ears and voice, an OpenAI text brain. Three services, each from
its folder with the root directory set:

- **LiveKit** (`speech/livekit`): `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  (a fresh pair), `REDIS_URL` (the project's Redis), `PORT=7880`, a public
  domain, and a **TCP proxy on application port 7881**. Railway has no UDP;
  the start script advertises the proxy's address so browsers reach the
  media port over TCP. Redeploy once after adding the proxy.
- **Tutor Voice** (`speech/kokoro`): as the Voice service, plus
  `TTS_MODE=tutor`. Replies stream sentence by sentence, unmastered.
- **Tutor** (`speech/tutor`): `LIVEKIT_URL=ws://<livekit>.railway.internal:7880`,
  the same key pair, `OPENAI_API_KEY`, `TUTOR_LLM_MODEL`,
  `TUTOR_VOICE_URL=http://<tutor voice>.railway.internal:8880`,
  `TUTOR_VOICE_TOKEN`, `WHISPER_MODEL=small.en`. No domain; it dials out.

Then on the API: `LIVEKIT_URL=wss://<livekit public domain>`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Without them a `livekit` tutor is
voiced by OpenAI like the rest, which is how it stays off until the line
is proven.

## Migrations

Schema changes do not apply themselves. Set a **pre-deploy command on the API
service only**:

```bash
npm run migrate
```

Putting it on both services makes them race each other on every deploy.

## Health check

`GET /api/v1/health` is public and checks the database. Point the API
service's health check at it. Leave the worker's empty — it has no HTTP
server, and giving it one would fail every deploy.

## The session cookie

The refresh token is an httpOnly cookie, sent `Secure; SameSite=None` in
production so it can travel to an API on another origin. Browsers are
increasingly hostile to that: Safari's tracking prevention can drop it, which
logs people out unpredictably.

Avoid the problem by putting both apps on one registrable domain —
`app.example.com` for the client, `api.example.com` for this API. They are
then same-site, the cookie is first-party, and sessions survive.

## Client

The Next.js app needs one variable:

```
NEXT_PUBLIC_API_URL=https://api.your-domain.com/api/v1
```

Note the `/api/v1` suffix — it is part of the value, not added by the client.

## Scaling, when you get there

- **Worker first.** It is where the time and the money go. Its queues have
  per-queue concurrency, so one instance handles a lot; add instances before
  adding API instances.
- **The API scales horizontally as-is.** Every instance subscribes to the same
  Redis channels, so a reader connected to instance A still sees progress from
  a job that ran on the worker.
- **OCR is uncapped by design.** Every page of a scan is read. That is a
  deliberate product decision, not an oversight — watch the `ai_call_logs`
  table for cost.

## Known sharp edges

- **Uploads are proxied through the API** (50 MB cap). If your platform's
  edge imposes a smaller request limit, that limit wins. Moving to presigned
  PUTs straight to the bucket is the fix, and the storage port already has the
  seam for it (`createUploadTarget`).
- **No native dependencies.** PDF work is pure JavaScript — no canvas, no
  system packages — so the default Node builder is enough. Keep it that way.

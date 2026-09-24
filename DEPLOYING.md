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

## Visualize

A page's video is written by OpenAI (`AI_MODEL_SCENE_WRITE`, default
`openai:gpt-4.1`), drawn by DeepSeek (`AI_MODEL_SCENE_DRAW`, default
`deepseek:deepseek-flash`) and voiced by the Voice service above. The
drawer's default names DeepSeek whatever `AI_MODEL_DEFAULT` says, so
**`DEEPSEEK_API_KEY` must be set on both the API and the worker**: the
boot check stops a process with a named provider and no key.

The Voice service reports when it spoke each word when asked, takes a
voice of its own for any piece of a page (a story's character saying
their line), and a `lead` of quiet before the first word (`/health` says
`version: 6`; redeployed from `speech/kokoro` on 2026-09-24). All three
are asked for only when wanted, so lectures ask it nothing new, and an
older service answers in the page's one voice, with no quiet first. The
Modal home shares `voice.py` and picks the same up on its next deploy.

Drawings are rendered in a child process by `@resvg/resvg-js`, now a
runtime dependency of both the API and the worker, with the fonts that
ship in `pdfjs-dist`.

`npm run scene:page -- <documentId> <page>` makes pages with the worker's
own processor against whatever the environment points at, and writes the
scene, the audio and a gallery of the drawings to `scene-out/`.

The writer tags how each sentence is said, and the voice follows: Kokoro
by each sentence's pace and silence, Gemini by a few words of direction.
`SCENE_VOICE` picks Visualize's voice alone. To try the paid voice, set
`SCENE_VOICE_ENGINE=gemini` and `GEMINI_API_KEY` on the **worker**; the
worker encodes Gemini's WAV to mp3 itself (`@breezystack/lamejs`) and
times the words with the aligner. `npm run scene:voices -- <documentId>
<page>` says one page in a line-up of voices and writes a blind test to
`scene-out/voices/`.

A page's sound (its music, the stage's effects, a drawing's own sound)
plays in the browser from what the scene says; the server sends no
audio for it. The music is a score composed in the browser, one per
document (one key, one tempo), that carries on from page to page: the
writer says what each stretch of a page feels like (`music` on its
sentences: calm, curious, bright, playful, motion, solemn, tense, none),
and compose places the changes (`sound.music`: at least two sentences
and ten seconds each, at most three a page, quiet while maths is worked
or a passage read closely, solemn only where the page tells of a death
or loss). A page made before has one state from its mood. Nothing to
set, no migration; the contract only gains optional fields.

Labels are lifted out of the drawings and set by the stage, and every
page's log line `frame audit` counts anything left overlapping.
Scenes are made by generator `scene-2`: pages made before are made again
the next time they are asked for. Their jobs go on a queue named for the
generator (`visual-scene-2`), so while a deploy runs old and new workers
side by side, an old worker never takes a new page and drops it. The
worker also runs a watchdog: every minute, a page still waiting whose job
is gone is queued again, and one whose job failed for good is marked
failed, so the player moves past it rather than waiting on it. A page
being made is left alone unless it has not moved for ten minutes, so a
page `scene:page` is making in its own process is never made twice.
After the first deploy, jobs left on the old `visual-scene` queue are for
old rows and can be ignored.

Each document gets a profile the first time a page of it is made (one
`gpt-4.1-mini` call, `AI_MODEL_SCENE_PROFILE`), kept in storage beside its
videos as `profile.json`: its subject, kind and tone, and which formats
its pages may use besides the explainer. `maths` lets a page set working
(MathJax, `mathjax-full`, on the worker, as paths: nothing to fetch) and
graphs drawn from their functions (`mathjs`, locked down); `reading` lets
it set a passage in its own words, with notes in its margin (listed under
it where the stage is too narrow for one). The writer's
sums are checked and a quotation must be the page's own words, or the
storyboard goes back. `npm run scene:try -- <page.md>` makes a page from
any text with no document behind it, to try a format.

A book the profile calls a story (a novel, a play: `story` in
`profile.json`) is read for its characters the first time one of its pages
is made: `gpt-4.1-mini` (`AI_MODEL_SCENE_STORY`) reads it in stretches of
about 40,000 characters, four at a time, at most 24 of them, and code
merges what it says into `story.json` beside the videos: each character's
look, what they are like, the page the book meets them on, and who is on
each page and how they feel. The pages being made meanwhile wait on that
one reading. Each character is then drawn once by the artist, with a face
for every feeling, into the book's `cast.json`, and stands on every page
they are on: the same figure, the one met first on the left, with the
face the last page left them with, what they are like set beside them on
the page the book meets them, and what they say in a bubble by their
head. Each place the story happens in is painted once too, into the
book's `sets.json`, and stands faded behind the stage while the story is
there, with its own sound. The three files go when the document is
purged. A character's quoted lines are said in a voice of their own,
chosen by the kind of voice the story gives them and never the
narrator's, and a page whose characters were on the page before opens on
them for two seconds before the voice begins. `npm run scene:try --
<story.md> --story --page 3` tries it on a story whose pages are parted by
lines of three dashes.

People are drawn by code, not by the artist (`scene-figure.ts`, the plan
in `visualize-characters-plan.md`). The story reader says what each
character is (a person, an animal or a creature) and, for a person, their
figure from the kit's closed lists: age, build, skin tone 1–10, hair,
headwear, clothes and colours, up to two extras. The kit draws everyone
from one rig (the same head, eyes, outline and proportions), with the
seven faces, a blink, a breath, and a mouth that moves while the stage
marks them talking; no model is asked, so people cost nothing to draw.
Animals and creatures are still drawn by the artist, in the kit's style,
at their size beside people. The writer shows people on any page, a doctor
or a scientist, as `person` things drawn the same way. On the stage,
everyone standing together is drawn at one scale (a child is always
shorter than a grown-up, a grown-up at most seven tenths of the stage)
and, in front of a set, on its ground. A story character's name is written
under them only on the page the book meets them.

Sheets are now version 2 and sets version 2 (painted to match the people),
so a story book's characters and places are drawn again the next time one
of its pages is made, and a book whose story was read before this is
asked once per character what they are (one `gpt-4.1-mini` call each).
Pages made before keep the people they were made with. To make a book's
made pages again so every page matches: `npm run scene:recast --
<documentId>` says how many pages that is, `--go` queues them for the
worker (behind everything learners asked for), and `--here` makes them in
its own process. Each page stays playable until its new one is ready, and
one that cannot be made again stays as it was. A page costs what making
it costs: the writer and the voice once more. A page's audio is now sent
with an ETag and checked each time (it was kept a day unchecked), so a
page made again is never heard with its old voice. Nothing to set, no
migration; the contract only gains optional fields (`say.saidUntilMs`).
`npm run figures:sheet -- <dir>` draws every choice in the kit on one
sheet (`figures.png`, and `figures.html` where they blink and talk).

## The live tutor

A tutor marked `livekit` in `tutors.ts` talks on our own line: a LiveKit
room, open ears and voice, an OpenAI text brain. Three services, each from
its folder with the root directory set:

- **LiveKit** (`speech/livekit`): `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
  (a fresh pair), `REDIS_URL` (the project's Redis), `PORT=7880`, a public
  domain, and the service's **one TCP proxy on application port 7881**.
  Railway has no UDP and browsers offer no TCP candidate, so a browser
  reaches the room only through TURN. LiveKit's own TURN insists on port
  443, which Railway cannot give, so the container runs coturn on the
  proxied port and LiveKit advertises it: `TURN_DOMAIN`
  (`turn.easiread.com`, an A record at Cloudflare, DNS only, pointing at
  the proxy's IP) and `TURN_SECRET` (a shared secret). ICE over TCP moves
  to a private port the agent uses. Redeploy once after adding the proxy.
- **Tutor Voice** (`speech/kokoro`): as the Voice service, plus
  `TTS_MODE=tutor`. Replies stream sentence by sentence, unmastered.
  The Voice service sleeps between uploads (Railway app sleeping, set on
  the service); the Tutor Voice stays awake so an answer is never 15 s late.
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

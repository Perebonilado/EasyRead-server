# Deploying EasyRead

Written for Railway, but nothing here is Railway-specific beyond the variable
references — any platform that can run two Node services against MySQL, Redis
and an S3 bucket will do.

## The shape of it

Five services. Two of them are this same repository, deployed twice.

| Service | What it is | Start command |
| --- | --- | --- |
| **MySQL** | managed database | — |
| **Redis** | queues *and* the live-progress bus | — |
| **Bucket** | S3-compatible object storage | — |
| **API** | this repo, HTTP | `npm run start:prod` |
| **Worker** | this repo, no HTTP | `npm run worker:prod` |

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

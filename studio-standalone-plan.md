# The Studio as its own app

Written 2026-10-01 on branch `infographic` (server 7768c3c, client 7cb4f32). This is a plan only: no code or config has changed.

Richard (2026-10-01), lightly tidied: the Studio leaves EasiRead and becomes an application of its own, with the same user interface. People can make accounts, but **for now nobody needs to sign in to use or test it**. It gets:
- a landing page;
- personal libraries;
- published videos, with a feel close to YouTube, that people can share;
- later, connected YouTube, TikTok and Instagram accounts, so videos post automatically from a content calendar;
- an AI agent with live internet data that checks what is trending and helps people decide what to make and when to post it.

The name is not chosen yet. This plan says "the app". In code the name lives in one module (§2.7). The earlier working name was LessonReel (`lessonreel-visuals-plan.md`).

---

## Summary

1. **Move, then share.** The app gets a new repository: `apps/api` (NestJS API and worker, as today), `apps/web` (Next.js) and `packages/contracts` (one copy of the types for both sides).
   - It starts as a copy of today's Studio and scene engine.
   - EasiRead keeps its own copy for Visualize and isn't touched until its Studio retires.
   - The engine and player become shared packages only if EasiRead's Visualize needs the engine's later work.
2. **Its own data.** It has its own database, Redis, buckets and Railway project. The Kokoro voice server is reused.
3. **Guests from the first visit.** A visitor is a guest user with a session on their device.
   - Every Studio route works unchanged, because a guest is a user row.
   - Signing up turns that same row into an account, so nothing moves and nothing is lost.
   - Signing in to an existing account moves the guest's films into it.
4. **What needs an account:** publishing publicly, connecting social accounts and scheduling posts. Everything else works for guests within daily limits: cost ceilings, rate limits, Turnstile and the moderation we already have.
5. **The landing page's first element is the real create box**, followed by a short demo film made by the app. One click starts a film with no sign-up.
6. **Library, watch page and channel page, in YouTube's pattern.**
   - Published videos are the MP4s the export already makes.
   - They are kept in a public R2 bucket behind Cloudflare's CDN: $0.015 per GB a month, with free delivery.
   - Cloudflare Stream or Mux only if we ever need adaptive streaming.
7. **Posting to YouTube, TikTok and Instagram works with today's APIs, but each platform reviews the app before public posting.**
   - **YouTube:** Google's OAuth verification, then YouTube's API audit. Uploads stay private until the audit.
   - **TikTok:** an audit. Until then posts are private-only, for at most 5 users a day.
   - **Instagram:** Meta's App Review and Business Verification.

   The reviews take weeks and need a live site with terms and privacy pages, so they are filed early in phase 2.
8. **A calendar like Google Calendar:** month, week and list views; drag to move a post; every post approved by the maker before it goes.
9. **Ideas: an agent on GPT-5.4 mini with web search, YouTube data and search trends.**
   - Search trends come from SerpApi for now. Google's own Trends API is still an alpha you apply for.
   - The agent proposes; the maker approves.
   - It costs about $1–3 per active maker a month, plus $75–150 a month for the trends data.
10. **Phases.** Each phase ships on its own (§10):

| Phase | What | Days of work |
|---|---|---|
| 0 | The Studio as its own app, with guests | 12–16 |
| 1 | Accounts, landing, library, publishing, watch and channel pages | 18–24 |
| 2 | Connections, posting, calendar | 20–26, plus 3–8 weeks of platform reviews running alongside |
| 3 | The Ideas agent | 12–15 |
| 4 | Automation and analytics | 12–16 |

---

## 1. Where the Studio is today, and how tied it is to EasiRead

### 1.1 How big it is

| Part | Lines (without tests) | Shared with EasiRead's reader? |
|---|---|---|
| Scene engine, server (`business/domain/scene-*.ts`) | ~100,000 | Yes. Visualize's book pages use it. |
| Studio domain (`business/domain/studio/*`) | ~28,000 | Partly. `scene-script.ts` and `scene-exact-style.ts` import from it. |
| Studio services (`business/handlers/studio/*`) | ~6,800 | No |
| Studio and scene processors (`pipeline/processors/studio*`, `scene*`) | ~11,900 | `scene.processor.ts` serves both book pages and the Studio's make |
| Player, client (`lib/scene/*`, with sound) | ~29,600 | Yes. The reader's `visual-pane.tsx` uses it. |
| Studio UI, client (`components/studio`, `lib/studio`, the routes) | ~16,000 | No |
| The whole server | ~248,000 | |
| The whole client | ~116,000 | |

The Studio and its engine are about 60% of the server and 40% of the client.

### 1.2 Piece by piece

| Piece | What it is today | How the Studio uses it | In the new app |
|---|---|---|---|
| **Accounts and sessions** | `src/auth`, `handlers/identity`: a 15-minute access token, and a refresh cookie whose 30-day window slides with use. Email and password with verification, Google sign-in from an ID token, reset and delete. A global `AuthGuard`. In the `users` table, email is required. | Every route is owner-checked with `@CurrentUser('id')` (`requireShow`, `requireEpisode`). `studio/shared/:token` and `studio/render/:key` are public. | **Copy, then change.** Same token pattern. Users gain `kind` (guest or member), a nullable email and a handle. A guest endpoint. Email codes instead of passwords. |
| **Plans, metering, balance** | `EntitlementsService` (in `handlers/documents`), `PLAN_LIMITS`, `usage_counters`, payments (Stripe, earlier Paddle), school passes | Film seconds are counted as scenes are made (`STUDIO_SECONDS`), but nothing is capped (`studioMinutesPerMonth: null`). `studioBalance` is sent with the show. Free films get the "Made with EasiRead Studio" end card (`watermarkedExports`). | **Replace** with a small limits module: guest and account ceilings per day, plus a spend counter. Seconds are still counted. No payments yet. |
| **Documents** (a show made from a file) | The reader's upload pipeline: convert (Google Drive), extract (pdfjs), OCR (Mistral, for the chosen pages only), chapters. Studio files are `documents.origin = 'studio'` (migration 0061). `StudioDocumentsService`, `StudioMaterialService`, 30 a month. | Attach a PDF in the chat, pick chapters or pages, then teacher's notes, then the outline. | **Copy a slim intake** (about 3,200 lines today) as the app's own module. |
| **Storage** | `StoragePort` (S3, local, Drive). Keys `studio/<show>/<episode>/…`. Files reach the browser through the API or a signed link. | Scenes, audio, drawings, exports | **Copy.** Add a public media bucket behind a CDN for published videos. |
| **LLM gateway and model registry** | One port and one adapter for every task (`llm.port.ts` 1,273 lines; `ai-sdk-llm.adapter.ts` 3,135; `prompts.ts` 3,377, shared with Visualize). `models.ts` holds `TASK_VAR`, `TASK_DEFAULT` and the boot check. The ledger is `ai_call_logs`; prices are in `cost.ts`. | `studio_chat`, `studio_write`, `studio_check`, `scene_write`, `scene_draw`, `cast_draw`, `set_paint`, `drawing_judge`, `scene_notes`, `explainer_edit`, `explainer_research`, `explainer_board`, `moderate` | **Copy the Studio's part.** Split the port into scene, studio and editor parts. The model rules don't change. |
| **Voice and admin settings** | `SceneVoiceService` reads the single `app_settings` row (engine, voice cast, rates, models), set from a dropdown on EasiRead's `/admin`. Speech adapters: Gemini with the Cloud TTS fallback, Kokoro, OpenAI, ElevenLabs, Cartesia. Plus the aligner and the audio codec. | Every line is voiced by the engine the admin chose. | **Copy**, with the app's own `app_settings` and a small admin page. **The Kokoro server is shared** (EasiRead's Voice service). |
| **Scene engine** | The `scene-*` and `studio/*` domain, `scene-artist.ts`, and `SceneProcessor.make` | Everything that makes a film | **Copy.** The app is its new home. EasiRead keeps its copy for Visualize. |
| **Studio service, processors, controllers** | `studio.service.ts` (2,782 lines), `studio.processor.ts` (3,941), `studio-editor.processor.ts` (1,876), `studio-export.processor.ts`, `studio*.controller.ts`, migrations 0056–0065 | The Studio itself | **Copy (move).** The migrations become one starting schema. |
| **Queues and worker** | BullMQ queues: `studio` (concurrency 4) and `studio-export` (concurrency 1, Chrome and ffmpeg, which can already run as its own service). `WorkerRunner`. The reader's queues and the visual watchdog. | Studio jobs | **Copy the two Studio queues.** Add `posting` (phase 2) and `ideas` (phase 3). |
| **Moderation** | `llm.moderate`: OpenAI's omni-moderation, which is free. `refusesWords` lets plain "violence" through, so history and fairy tales can be told. | Every maker message and brief | **Copy.** Also run it on titles, descriptions, narration and frames when a video is published. |
| **Contracts** | `src/contracts/index.ts` (4,062 lines; the Studio types and `SceneDto` are in it), copied by hand into `easyread/src/lib/api/contracts.ts` | Every DTO | **Replace** with one `packages/contracts` that both sides import. |
| **Email** | The Resend adapter and its templates | Account email | **Copy** for sign-in codes, approvals and posting results. |
| **Session gate and app shell** (client) | `SessionGate` sends anyone signed out to `/login`. `AppHeader`. The auth store keeps the access token in memory, with the refresh cookie and a localStorage backup. | Wraps `/studio` (`app/studio/layout.tsx`) | **Replace** with a gate that makes a guest instead of redirecting, and the new shell (§9). |
| **API client** (client) | `lib/api/client.ts` (bearer token, NDJSON streaming, the local-network URL fix) and the `studio` and `render` endpoint groups | Every call | **Copy.** |
| **Brand modules** | Server `domain/studio/studio-brand.ts` (`APP_NAME = 'EasiRead'`, `STUDIO_NAME`, `MADE_WITH`). Client `lib/brand.ts` (`APP_NAME`, `STUDIO_NAME`, `STUDIO_TAGLINE`). | Titles, end cards | **Replace** with one brand module per side. The server reads the name from one environment value. |
| **Player** (client) | `lib/scene/*` (stage, timeline, edit, film clock, sound). `components/reader/scene-stage.tsx` is a Studio dependency that lives under "reader", and so is `components/reader/perf-overlay.tsx`. | The episode player, the render page and the share page | **Copy.** `scene-stage.tsx` moves out of "reader". |
| **Studio UI** (client) | `components/studio/*`, `lib/studio/*`, `app/studio`, `app/s/[token]`, `app/render/[episodeId]` | The Studio itself | **Copy unchanged.** Only the routes are renamed. |
| **UI kit** | `components/ui/*`, `components/icons.tsx`, `lib/cn`, `use-menu` and other small hooks | Throughout | **Copy.** |
| **Sounds** | `public/sound` (8.2 MB) and `public/samples` (2.5 MB), with their licence records | The score and the effects | **Copy**, with the licence records. |
| **AI provider accounts** | OpenAI, DeepSeek, Google (the Gemini voice and the picture judge), ElevenLabs, Cartesia, Mistral | All of the above | **Separate keys**, in the app's own projects, so costs and rate limits stay apart. |

### 1.3 What the `infographic` branch adds, and moves with it

The work done on `infographic` is part of what moves:
- **The editor's desk:** angles, research with sources, the plan and episode map, the world, the two-column script with the editor's read and fact check, lesson boards, and the "add more?" step. Migration 0064.
- **The package:** title, alternative titles, description, chapters, thumbnail words, hashtags and a pinned comment (`StudioPackageDto`). This is what posting to the platforms will use.
- **MP4 export:** the `studio-export` queue, headless Chrome and ffmpeg, burned-in captions, offline music and effects, wide and vertical, and a whole show with chapters. It also adds the `/render/[episodeId]` page and migration 0065.
- **The nine infographic kinds and the show's one map** (areas inside countries), already merged.
- **Still in flight:** motion (`ig-motion`), illustrated scenes (`ig-illustrated`) and the phone fixes (`ig-mobile`). They should land before the copy, so nothing has to be carried across by hand.

On the server, `infographic` is 34 commits ahead of `origin/main`. The app starts from the commit where it lands on main.

### 1.4 What makes this easier

- **The client's Studio is easy to lift out.** Besides the contracts, the API client, the UI kit, icons and a few small hooks, it imports only:
  - `AppHeader` (2 files);
  - `SessionGate` (the layout);
  - `components/reader/scene-stage.tsx` (2 files);
  - `components/reader/perf-overlay.tsx`.

  The player (`lib/scene`) imports nothing but the contracts, and the reader imports nothing of the Studio's.
- **On the server, ownership is one `userId` check everywhere.** Guests fit without touching the Studio's code.
- **The engine is plain TypeScript.** It imports the contracts and a handful of domain helpers: `lesson-notes`, `lecture`, `spoken`, `drawing-checks`, `maths-work`, `everyday-words`, `wav`, `time-stretch` and `theme-check`.

### 1.5 What is tangled

- **`SceneProcessor` (4,456 lines) does two jobs.** It makes the reader's book pages (with documents, topics, summaries, pages, simplified pages, visuals and a school's pronunciations), and it runs the Studio's `make`. The `make` path itself uses none of the reader's repositories, so it splits out as `SceneMaker`.
- **One LLM port and adapter serve every task.** The fake adapter used by the tests is another 2,633 lines.
- **Entitlements live with the documents handlers**, and carry school passes and Stripe.
- **Studio documents ride the reader's upload pipeline** (convert, extract, topics).
- **Contracts are copied into the client by hand.** A contract change has to merge in both repos together.
- **The global throttler keeps its counts in memory**, so each API instance counts on its own.

---

## 2. How to separate it

### 2.1 Three ways

| | (a) New repos, with the Studio and engine copied | (b) One monorepo, with shared packages for both apps | (c) One backend serving two front ends for a while |
|---|---|---|---|
| **What it is** | The app is a copy. EasiRead keeps its code. | EasiRead and the app move into one repo. The engine, the Studio domain and the contracts become packages that both apps import. | The new web app talks to EasiRead's API. New features (guests, publishing, posting) are added to EasiRead's server. |
| **Time to a working app** | About 2–3 weeks | About 4–6 weeks, because both apps move first | About 1–2 weeks |
| **Risk to EasiRead in production** | None | High: its build, deploys and thousands of import paths change | Medium: every change to the app deploys EasiRead's API |
| **Own database and accounts** | Yes | Yes | No. One users table, and a later split needs a data migration anyway. |
| **The engine maintained** | Twice, if both apps keep changing it | Once | Once |
| **Contracts by hand** | Not if the new repo holds both sides | No | Still |

### 2.2 Recommendation: (a), with the new repo holding both sides

**Move, then share.** The app gets a new repository that holds both sides:

```
app/
  apps/api        NestJS: the API, the worker and the export worker (one code base, three start commands)
  apps/web        Next.js: the landing page and the app
  packages/contracts   the types, written once, imported by both
```

- **Why not (b) now.** Moving EasiRead into a monorepo changes a live product's build, deploys and import paths. The benefit is one engine, and that only matters if Visualize keeps getting engine work. Almost all engine work of the last month was Studio work. If Visualize needs it later, the new repo publishes `engine` (server) and `player` (client) as versioned packages, and EasiRead installs them in place of its copies. EasiRead never has to move.
- **Why not (c).** Putting the app's guests, public videos and social tokens into EasiRead's database is the opposite of the separation Richard asked for. Every app change would deploy EasiRead's API, and splitting later costs more than starting apart.
- **Why both sides in one repo.** A feature lands in one branch and one PR. Today a contract change has to be merged in both repos together, and the client's copy of the contracts is kept by hand. In one repo the contracts are written once. npm workspaces are enough; no new build tool is needed.
- **The rule from the move on:** Studio work happens only in the new repo. EasiRead's Studio gets bug fixes, then retires (§2.4).

### 2.3 The order of moves

Each step leaves something that builds and runs.

1. **Land what's in flight.** Merge `infographic` (and any other Studio branch) to `main` in both repos. Stop adding Studio features in EasiRead from that commit.
2. **Copy with history.** Clone the server into `apps/api` and the client into `apps/web` with a subtree merge, so `git log` still works file by file. Make `packages/contracts` from the server's contracts file.
3. **Delete what the Studio doesn't use, in steps,** with the compiler and the copied tests as the guide:
   - controllers;
   - handlers;
   - processors;
   - repositories and models;
   - the reader's routes and components.

   Along the way:
   - split `SceneMaker` (the make path) out of `SceneProcessor`;
   - cut the LLM port down to scene, studio and editor tasks;
   - cut `TASK_VAR` and `TASK_DEFAULT` to the Studio's tasks, so the boot check asks only for keys the app uses.
4. **One starting migration.** It holds the Studio's tables as they are at 0065, plus:
   - users (with guests) and refresh tokens;
   - usage counters and the ledger;
   - app settings;
   - the slim documents tables.
5. **Guests and limits** (§3).
6. **The web app.** The new shell goes around the copied Studio screens, with the guest-aware gate, the brand module and the render page.
7. **Railway, domain, buckets, variables** (§2.6). Tests green, then deploy.

### 2.4 How EasiRead keeps working

- **During phases 0 and 1:** EasiRead's Studio runs exactly as it does today. Nothing in EasiRead changes.
- **When phase 1 ships** (accounts exist in the app):
  - EasiRead's Studio shows one line, "The Studio has its own home now", with a **Move my films** button.
  - The Studio button in EasiRead's header opens the app.
  - New shows can no longer be started in EasiRead.
  - Old share links (`/s/<token>`) of films that moved redirect to the app's watch page.
- **90 days later:** EasiRead removes the Studio's routes, screens, jobs and tables, after a last export.
  - It keeps the engine files Visualize imports. `scene-script.ts` still imports from `domain/studio`, so those stay until that is untangled.
  - Visualize, lectures and the reader are untouched throughout.

### 2.5 Data

- **Separate stores.** The app has its own MySQL, Redis and buckets. Nothing is shared at the database level.
- **Films already made in EasiRead move when their maker asks, not in bulk.**
  - **Move my films** in EasiRead makes a signed, short-lived transfer link that carries the EasiRead user id and an expiry.
  - The app takes the link, whether the person is signed in or still a guest, and calls a new EasiRead export endpoint with it. That returns the maker's shows, episodes, scenes, messages, exports and Studio documents as JSON.
  - The app copies their files bucket to bucket. The `studio/<show>/…` keys stay the same.
  - It keeps the old share tokens, so old links still resolve.
  - The link itself proves who owns the films, so no email matching is needed, and nobody's data moves unless they ask.

  The Studio reached production on 2026-09-30, so there are few such films.
- **What doesn't move:** usage counted in EasiRead (film seconds) stays there.

### 2.6 Railway, domains and variables

**A new Railway project** for the app, with its own billing and variables:

| Service | From | What it runs |
|---|---|---|
| MySQL, Redis | Railway | as EasiRead's |
| Private bucket | Cloudflare R2 (or Railway's object storage, same price) | Working files: scenes, audio, drawings, exports, documents |
| Public bucket | Cloudflare R2 at `media.<domain>`, behind Cloudflare's CDN | Published videos and thumbnails only |
| **API** | `apps/api`, `npm run start:prod` | HTTP. Health check `/api/v1/health`, pre-deploy `npm run migrate` |
| **Worker** | `apps/api`, `npm run worker:prod`, with `STUDIO_EXPORT=off` | The Studio's jobs; later posting and Ideas |
| **Export** | `apps/api`, `npm run studio:export -- --worker` | Videos (Chromium and ffmpeg through `NIXPACKS_PKGS`, then `CHROME_PATH`), as DEPLOYING.md already describes |
| **Web** | `apps/web` | Next.js: the landing page and the app |
| Voice | **EasiRead's Kokoro service, reused** | Railway gives each project environment its own private network, so the app calls the Voice service's public domain with its token. DEPLOYING.md: "the token guards it either way". Audio is small, so egress is cents. When the app's voice load grows, it deploys its own Voice from a copy of `speech/kokoro`. |

Each service gets watch paths, so a change to the web app doesn't redeploy the API.

**Domains.** DNS sits at Cloudflare, as easiread.com's does.
- `<domain>`: the landing page and the app (one Next.js app);
- `api.<domain>`: the API. Being on the same site keeps the session cookie first-party, as DEPLOYING.md advises;
- `media.<domain>`: the public bucket.

**Running costs at first (rough).** At Railway's $20 per vCPU-month and $10 per GB-month, a quiet API, worker, export service, web app, MySQL and Redis come to about **$50–100 a month** before AI spend. Rendering a video costs about 1–3 cents per minute of film (`studio-vertical-plan.md`).

**Variables** (the same names as EasiRead where they exist):

| Variable | Where | Notes |
|---|---|---|
| `APP_NAME` | API, worker, export | The name, from one place (§2.7) |
| `NODE_ENV=production`, `FRONTEND_URL`, `API_PUBLIC_URL` | API | `FRONTEND_URL=https://<domain>`, `API_PUBLIC_URL=https://api.<domain>/api/v1` |
| `DATABASE_URL`, `REDIS_URL` | API, worker, export | Private URLs |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `STUDIO_EXPORT_SECRET` | API, worker, export | Fresh values, not EasiRead's |
| `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true` | API, worker, export | The private bucket |
| `MEDIA_S3_BUCKET`, `MEDIA_PUBLIC_URL` | API, worker | The public bucket, `https://media.<domain>` |
| `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | API, worker | The app's own keys |
| `GOOGLE_CLOUD_TTS_CREDENTIALS` | Worker | The Gemini voice past 100 requests a day |
| `KOKORO_TTS_URL` (public), `KOKORO_TTS_TOKEN`, `KOKORO_USD_PER_AUDIO_HOUR` | Worker | EasiRead's Voice service |
| `MISTRAL_API_KEY`; optional `CONVERTER_DRIVER`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID` | Worker | OCR of chosen pages; Word and Slides files to PDF |
| `EMAIL_DRIVER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | API | Sign-in codes and notices |
| `GOOGLE_CLIENT_ID` | API, web | Sign in with Google |
| `TURNSTILE_SECRET_KEY` | API | Guests (§3.4) |
| `GUEST_DAILY_FILMS`, `GUEST_DAILY_USD`, `GUESTS_DAILY_USD`, `MEMBER_DAILY_USD` | API, worker | The limits (§3.4) |
| `SCENE_VOICE_ENGINE`, `AI_MODEL_*`, `*_THINKING`, `*_EFFORT` | As today | |
| `RENDER_WEB_URL`, `CHROME_PATH`, `FFMPEG_PATH`, `EXPORT_FPS`, `EXPORT_PAGES`, `NIXPACKS_PKGS` | Export | As DEPLOYING.md |
| Phase 2: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `TOKEN_ENCRYPTION_KEY` | API, worker | Connections (§6) |
| Phase 3: `YOUTUBE_API_KEY`, `SERPAPI_KEY`, `AI_MODEL_IDEAS` | API, worker | Ideas (§8) |
| Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MEDIA_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Web | |

### 2.7 The name in one place

`lessonreel-visuals-plan.md` already set the rule: the name lives in one module on each side, and nothing else spells it out.

- **What the module holds:** the display name, short name and slug; the domain; the email sender; the logo; the colours; the tagline.
- **What reads from it:** page titles, emails, the export's end card, rendered files' metadata, the app manifest, and the OAuth consent screens' copy.
- **On the server,** the name comes from `APP_NAME`.

The Studio's `MADE_WITH` end card becomes "Made with <name>".

---

## 3. Accounts, and no login needed for now

### 3.1 Guests from the first visit

- **Making the guest.** On the first visit the web app calls `POST /auth/guest`. It is public, carries a Turnstile token and is rate-limited per IP.
  - The API creates a `users` row with `kind = 'guest'` and no email.
  - It returns a session exactly as sign-in does: a 15-minute access token, and a refresh cookie (httpOnly, first-party at `api.<domain>`). For guests the cookie lasts a year and renews with each visit.
  - The client keeps the same localStorage backup it keeps today.
- **Every route then works unchanged.** The guest has a user id, and `requireShow` checks it like any other.
- **One guest per browser.** Clearing cookies or switching browsers starts a new guest. The badge says so in one line.
- **The guest badge** at the foot of the shell reads "Guest · Save your work" and opens the sign-up sheet.
- **Agreeing to the terms.** Under the landing box's button: "By making a video you agree to the Terms and Privacy Policy." YouTube's developer policies require users to agree to a privacy policy before they use an API client's features, and Ideas shows YouTube data.
- **Guest films are kept for 30 days after the last visit**, then deleted by a nightly sweep, unless an account claims them.

### 3.2 Signing up keeps everything

**How people sign in:**
- **Continue with Google:** the ID-token sign-in we already have.
- **Continue with email:** a 6-digit code by email. There is no password to forget and no reset flow.
- **Apple later.** It's only needed if an iPhone app comes: App Store rule 4.8 asks for a privacy-focused login next to Google, and Sign in with Apple is the usual answer. The Apple developer membership is $99 a year.

**What happens to the guest's work.** The sign-up request carries the guest's session, and the API does one of two things:
- **A new email or Google account: the guest becomes the account in place.**
  - The guest's own row gets the email or Google id, and `kind = 'member'`.
  - No row moves, so shows, episodes, scenes, exports, messages, documents and counts all stay where they are.
  - A fresh token pair continues the session.
- **An existing account: the guest's work is merged into it.**
  - The person signs in to that account.
  - In one transaction, every row the guest owns moves to the account (`UPDATE … SET user_id = :account WHERE user_id = :guest` over the app's own tables). Usage counters are added together.
  - The guest row is marked `merged_into`, and its tokens are revoked by bumping `tokenVersion`.
  - The app says: "We added your 2 films to your account."

**Edge cases:**
- **A film being made while its guest signs up.** Jobs read the owner from the show row when they write, not from the job's own `userId`, so the film finishes in the account. Today `StudioJob` carries `userId`, so the counting of seconds and the export's owner change to read it from the show.
- **Two devices.** Each has its own guest. Signing in on each device merges each one.
- **Share links** keep their tokens.

### 3.3 What needs an account

| | Guest | Account |
|---|---|---|
| Make films (stories and explainers), chat, edit, watch | Yes, within daily limits | Yes, with higher limits |
| Attach a document | Yes (small files) | Yes |
| Download the MP4 | Yes, with the end card | Yes |
| Share a link to an unlisted film (not indexed by search engines) | Yes | Yes |
| Ideas (the agent) | A few a day | Yes |
| Publish publicly, have a channel page | No | Yes |
| Connect YouTube, TikTok or Instagram; schedule posts | No | Yes |

Why the last two need an account:
- Tokens to someone's social accounts must belong to an account they can recover.
- Public videos need an accountable owner for reports and takedowns.
- The platforms' reviewers expect a real sign-in.

### 3.4 Limits while the app is open

**What a film costs.** Phase 0 measures the real cost per film from the ledger before these numbers are fixed. What we know now:
- The editor's desk measured **$0.57** for the editorial steps of an episode of about 2¾ minutes (one run, 2026-10-01: angles, research with 18 sources, plan, world, script).
- The infographic plan estimates **$3–4.50** for a first explainer episode, including the show's research and art, and $1.10–1.80 for each later episode.
- Kokoro voices for about $0.10 an audio hour.
- Rendering an MP4 costs about 1–3 cents a minute of film.

**Proposed limits** (Richard decides, §11):

| | Guest | Account (until pricing) | Notes |
|---|---|---|---|
| New films a day | 1 (up to 5 minutes) | 3 | Only one film made at a time; the next waits in the queue |
| Chat messages a day | 60 | 200 | The current 20 a minute stays |
| Research runs a day | 1 | 3 | Web search costs money |
| Downloads a day | 3 | 10 | |
| Idea refreshes a day | 3 | 10 | |
| Spend ceiling a day | $3 | $8 | The ledger, summed per user per day |
| Voice | Kokoro | The admin's choice | Economy settings for guests |

**Further controls:**
- **A global ceiling for all guests together:** $50 a day to start. Over it, guests see: "The free studio is full today. Sign up free to keep making, or come back tomorrow." The admin page has a kill switch.
- **Rate limits.** The throttler's counts move to Redis; in memory, each API instance counts on its own. New guests: 5 an hour and 20 a day per IP address.
- **Turnstile** (Cloudflare's free, mostly invisible check) on guest creation and on the first film of each day.
- **Moderation as today** on every message and brief. On publishing, also on the title, description, narration and 8 frames. OpenAI's moderation is free and takes images.
- **Spend per user.** Add `user_id` to the ledger rows (today they're keyed by episode or document), and a daily spend counter in `usage_counters`. `assertSpendAvailable(userId)` runs before each costly step: chat turn, outline, research, script, make, export, idea refresh.
- **Testers.** A tester code that Richard hands out (and can revoke), opened once on a device, lifts that guest's daily limits. Testing without signing in is never blocked by the limits meant for strangers.

---

## 4. Landing page

- **Who it's for:** people who explain things or tell stories on video and want animated films without animating. Educators and tutors, explainer and history channels, science communicators, nonprofits and small brands, students. Anywhere in the world, any subject.
- **The promise,** in one line, from the positioning suggested for LessonReel in September (accuracy, for people whose credibility depends on being right):
  - **"Ask a question. Get a researched, animated video, ready to post."**
  - Under it: "Sources checked. Characters, maps and charts drawn for you. Wide and vertical."

  To be rewritten in the brand's voice once the name is chosen.
- **The first thing on the page is the real create box**, the Studio's home box: "What do you want to make?"
  - Under it are four idea chips that vary in subject and place, for example:
    - "Why does February have 29 days?"
    - "How a vaccine teaches the body"
    - "A bedtime story about a lost kite"
    - "The race to the South Pole"
  - Typing and pressing **Make** creates the guest silently and opens Create with the idea already sent. A chip does the same in one click.
  - There is no sign-up wall.
- **The demo film:**
  - 60–90 seconds made by the app, for example the first act of the leap-year episode;
  - it plays muted with captions when it scrolls into view, in a plain player;
  - a 9:16 version on phones;
  - under it: "Made by the app from one sentence." The claim must stay true.
- **Then:**
  - three short steps (Ask · Choose the question · Watch, then post);
  - a row of example films made by the app, varied in subject and place;
  - a short FAQ;
  - the footer: Terms, Privacy, Community rules, Copyright, Contact.

  The page is light, with no dark hero (ui-less-is-more).
- **Who sees it.** `/` shows the landing page to anyone without a session. With a session (guest or member), `/` opens Create. The box is the same component either way.
- **Speed.** The page is rendered on the server, the film's poster image loads first, and the video loads when it is in view.

---

## 5. Library, publishing and a YouTube-like feel

### 5.1 The words we use

| Word | What it is |
|---|---|
| **Show** | As today: a topic or a story, with its brief, plan, world and cast |
| **Episode** | As today: one film. 3–5 minutes for an explainer, 1–5 for a story. |
| **Video** | A published episode, or a whole show joined end to end with chapters. In one shape or both. It has a title, description, chapters, sources and a thumbnail. |
| **Post** | A video sent to one platform at one time |
| **Channel** | A maker's public page, `@handle` |

### 5.2 Library

- **One list of everything the maker has.** It is shown episode by episode, grouped by show, with filter chips: All · Published · Drafts · Scheduled.
- **Each row:** thumbnail with length, title, show and episode number, a status line, and where it was posted.
  - Status line: Writing scenes / Made, not published / Private / Unlisted / Public · views.
  - Where it was posted: YouTube ✓ · TikTok ✓ · Reels Tue 17:00.
- **One action per row, by its state:** **Continue** while it's being made, **Publish** once made, nothing once published. Tapping the row opens it in Create.
- **The ⋯ menu:** Watch page, Edit details, Visibility, Delete.

### 5.3 Visibility and publishing

- **Visibility on our site:** Private (the default) · Unlisted (anyone with the link; not indexed) · Public (on the channel; indexed). The choice sits in a small popover like Google Docs' sharing card.
- **Publishing, step by step:**
  1. **Checks.** Moderation (§5.7), and the film made in this shape.
  2. **The MP4.**
     - The export is reused if its film hash matches; otherwise the film is rendered on the export queue.
     - Rendering takes about 1.6 times the film's length: a 5-minute film took about 8 minutes on a laptop.
     - Meanwhile the watch page says "Processing", as YouTube does.
  3. **Public copy.** The MP4 and its thumbnail are copied to the public bucket under an unguessable id.
  4. **The watch page goes live.** A public page is indexed; an unlisted one is not.
- **Unpublishing** removes the files from the public bucket and purges the CDN cache. The watch page then says "This video isn't available."
- **The words** come from the editor's package (title, description, chapters, hashtags, thumbnail words) where the episode has one. Otherwise they come from the outline: the title, the logline, and scene titles as chapters. The maker edits them before publishing.
- **The thumbnail** is a frame of the film plus the package's few words. The server already makes stills (`scene-still.ts`). Three frames are suggested, and the maker picks one.
- **Captions:**
  - Phase 1 publishes the export with captions burned in, which is what social video needs.
  - Phase 2 adds a clean copy with a WebVTT track, so the watch page gets a CC button. The word timings already exist.

### 5.4 Watch page

The page follows YouTube's layout.

- **Player:** the MP4. 16:9, or 9:16 centred on a dark band for vertical films.
- **Under the player:** the title; the channel row (avatar, name, @handle); the actions (**Share**, and ⋯ with **Report**; the owner also gets Download and Edit); the views and date.
- **The description box,** folded to three lines, holds:
  - **Chapters**, as clickable timestamps;
  - **Sources**, numbered and linked. These come from the editor's research: a quiet sign of trust that other tools don't show;
  - "What we left out";
  - **Transcript**: the narration, which also helps search and accessibility.
- **A side column** (below the description on phones): the other episodes of the series ("Episode 2 of 3"), then more from the channel.
- **Share** opens a popover like Google Docs':
  - copy link;
  - embed code (`<iframe src="https://<domain>/embed/<id>">`);
  - on phones, the system share sheet.
- **Views** are counted by us.
  - A view counts once playback passes 5 seconds.
  - Each viewer counts once per video per 30 minutes. The viewer is recognised by a hash of IP address and browser that changes daily, so no cookie is needed.
  - Views are stored as daily totals.
- **Link previews.** The page is rendered on the server with `og:title`, `og:description`, `og:image` (the thumbnail), `og:video` (the MP4) and a `twitter:player` card, so links unfold into a preview in chats and on social sites. A schema.org `VideoObject` with the transcript helps search.

### 5.5 Channel page

- **Address:** `/@handle`.
- **On it:** avatar, name, handle, one line about the channel, and counts (videos, views).
- **Two tabs:** **Videos**, and **Series** (shows with more than one published episode, shown like playlists).
- **The owner** sees **Edit channel**.
- **The handle** is chosen at the first publish. It is suggested from the name, 3–30 characters, with reserved words blocked.

### 5.6 First and later

| First (phase 1) | Later |
|---|---|
| Watch page, channel page, share links, embeds, view counts, reports | **Likes** (phase 4: cheap, with little to moderate) |
| | **Subscriptions** (they need notifications) |
| | **Comments** (they bring a moderation load) |
| | **A public feed and search** (they need ranking and moderation, and enough good films first) |

There is no feed at first: a video is reached by its link or its channel. That keeps moderation small.

### 5.7 Moderation, reports, takedowns, terms

- **Where the risk is.** Films are made only by our pipeline: nobody uploads arbitrary video. So the risks are mostly in the words (hate, harassment, misinformation, real people defamed), not in the pictures.
- **At publishing:**
  - moderation on the title, description and narration (OpenAI, free);
  - 8 frames from the MP4 through the same moderation (images are free too);
  - the rule on real people from studio-plan §9: historical and public figures as history, but no living people in made-up situations.

  A flagged video is held, with a plain message and **Ask for a review**.
- **Reports:**
  - A **Report** item on every watch page, with reason chips (misleading, hateful, violent, sexual, copyright, other) and a note.
  - Reports go to a small admin page for Richard. He keeps the video, or removes it with a reason that is sent to the maker; the EU's Digital Services Act asks for a statement of reasons.
  - Three upheld reports: the channel can only publish unlisted. Something serious: the channel is suspended.
- **Copyright:**
  - Our music is our own score from CC0 samples, the effects are licensed (sound-sources-licensing), and the pictures are drawn by code and kits, with no stock photos. Content ID claims are unlikely.
  - Documents a maker uploads are their own responsibility, which the terms say.
  - A copyright page with a notice form, and a registered DMCA agent for safe harbour: $6 at the US Copyright Office, renewed every three years.
- **Pages needed before phase 1 ships,** and before any platform review:
  - **Terms of Service**, including that using the YouTube feature means agreeing to YouTube's Terms, with a link (YouTube's developer policies require both);
  - **Privacy Policy**: what we collect; what Google, TikTok and Meta data we use and why; how to revoke access; a link to Google's privacy policy; deletion within YouTube's limits (§6.1);
  - **Community rules**, **Copyright**, and **Cookies** (essential cookies only).
- **Ages:** accounts are for people 13 and over, or the local age of digital consent. Films for children are fine; they are marked "made for kids" on YouTube.

### 5.8 Video hosting and what it costs

**Our MP4s** (the export's own measurements, 2026-10-01): a 4:39 film is 43.9 MB wide at 1080p and 33.2 MB vertical. That is about 9.4 MB a minute wide and 7.1 MB vertical: 16.5 MB a minute for both shapes, or about 1.3 Mbps, because the films are mostly flat colour.

**Example:** 1,000 published films of 4 minutes, in both shapes, make 8,000 minutes of video, about 66 GB.

| | **Our bucket (R2) and Cloudflare's CDN** | Cloudflare Stream | Mux | Bunny Stream |
|---|---|---|---|---|
| Storing 66 GB (8,000 min) | **~$1 a month** ($0.015 per GB) | $40 ($5 per 1,000 min) | $24 ($0.003 per min) | ~$0.70 (from $0.01 per GB) |
| 100,000 minutes watched a month (~940 GB) | **$0** (free egress) | $100 ($1 per 1,000 min) | $0 (100,000 free) | ~$5 (from $0.005 per GB) |
| 1,000,000 minutes watched a month (~9.4 TB) | **$0**, plus a few dollars of requests | $1,000 | $900 | ~$50 and up |
| Adaptive streaming, smaller copies for slow networks | No: one MP4 | Yes | Yes | Yes |
| Encoding | Ours (the export) | Free | Free (basic) | Free |

**Recommendation: our bucket on R2 behind Cloudflare's CDN.**
- It is the cheapest by far, and we make the MP4s anyway.
- Instagram (`video_url`) and TikTok (`PULL_FROM_URL` from a verified domain) both want a public file address that we control.
- Cloudflare's terms allow serving video through its CDN when it's hosted on its Developer Platform, which includes R2.
- At about 1.3 Mbps, one MP4 plays on most connections. A 720p copy can be added for slow networks.

Move to Stream or Mux if watch time passes about half a million minutes a month, if phones on slow networks stutter, or if their analytics become worth paying for.

**The watch page plays the MP4, not the live player.** Viewers come from links on their phones, and an MP4 plays smoothly everywhere, previews on social sites and embeds anywhere. The live stage stays where it shines: the maker's preview in Create, at no cost per view.

---

## 6. Connecting YouTube, TikTok and Instagram

### 6.1 The rules today

Checked 2026-10-01. Sources, with their page dates, are at the end.

#### YouTube (Data API v3)

| Topic | The rule today |
|---|---|
| **Scopes** | `videos.insert` accepts `youtube.upload` (the narrowest), `youtube`, `youtube.force-ssl` or `youtubepartner`. Reading the channel's name and picture needs `youtube.readonly`; results (phase 4) need `yt-analytics.readonly`. |
| **Google's app verification** | The YouTube scopes go through Google's sensitive-scope verification. It needs a privacy policy on our verified domain, a reason for each scope, and an unlisted YouTube video showing the consent flow. Google says it "typically takes 3-5 business days". Until then users see an "unverified app" screen, at most 100 users can connect, and while the app is in Testing, refresh tokens expire after 7 days. |
| **YouTube's audit** | "All videos uploaded via the `videos.insert` endpoint from unverified API projects created after 28 July 2020 will be restricted to private viewing mode." The fix is a compliance audit through the Audit and Quota Extension form. Google gives no time. Developers report several weeks to several months. |
| **Quota** | Since 1 June 2026, uploads have their own bucket: **100 `videos.insert` calls a day per project** by default, at 1 unit each. Until December 2025 an upload cost about 1,600 of the 10,000 daily units, then about 100. `search.list` also has its own 100 a day. Everything else shares 10,000 units a day: `videos.list` costs 1, `videos.update` 50, `thumbnails.set` 50. More quota needs the audit. An app may have exactly one API project. |
| **Scheduled publishing** | Upload as `private` with `status.publishAt`, and YouTube publishes at that time. |
| **Shorts** | There is no API flag. Since 15 October 2024, any square or vertical video up to 3 minutes is a Short. A vertical episode longer than that is an ordinary vertical video. |
| **Thumbnails** | `thumbnails.set` (50 units; up to 50 MB since 14 September 2026). It answers 403 if the channel may not use custom thumbnails, usually because the channel isn't verified. The post then keeps YouTube's own pick. |
| **AI disclosure** | `status.containsSyntheticMedia` (since 30 October 2024). YouTube asks for it on realistic altered or synthetic content. It lists AI-generated animation in a fully animated video among things that don't need it; AI-generated music does need it. |
| **Children** | `status.selfDeclaredMadeForKids` is set per video. |
| **Policies** | Users must have "final control" over what is published. No uploads are automated without the user's "prior specific and express consent". Our terms must link YouTube's Terms. No API data may be combined across different owners' channels. We must offer an easy way to revoke access. A user's data is deleted within 7 days of them revoking it in our app, or within 30 days if they revoke it on Google's security page. Public YouTube data fetched without a user's authorisation may be kept at most 30 days. |
| **Money** | YouTube's "inauthentic content" rule (15 July 2025): mass-produced, templated videos don't earn from the Partner Program. |

#### TikTok (Content Posting API)

| Topic | The rule today |
|---|---|
| **Two ways to post** | **Direct Post** (`video.publish`): our app posts to the profile. **Upload** (`video.upload`): the video lands in the creator's TikTok inbox as a draft, and they tap the notification and finish the post in TikTok. |
| **Before the audit** | Direct Post from an unaudited app is private ("restricted to private viewing mode"). At most 5 users can post in 24 hours, and their accounts must be private. The audit is its own application, after the app review. Reported time: about three weeks, with at least one rejection. One posting tool's 2026 review ran from 16 June to 7 July with two rejections, over its website's address, "coming soon" wording on its site and its posting screen. TikTok's docs put this restriction on Direct Post; sending to drafts needs the scope approved in the app review. |
| **App review** | A live, public website, "not a landing page or login page". Terms and Privacy linked from it without opening a menu. Demo videos of the whole flow (up to 5, 50 MB each). A reason for each scope. Apps "still in development or testing will not be approved". The app's name may not refer to social platforms. |
| **The posting screen TikTok requires** | Call `creator_info/query` first, and show the creator's nickname. A privacy choice with **no default**. Comment, Duet and Stitch off by default, and greyed out when the creator doesn't allow them. Commercial content toggles ("Your brand", "Branded content"), with the labels TikTok sets. A preview, editable text and explicit consent. A note that processing takes a few minutes. **No watermark, logo or brand may be added to the video.** |
| **Upload** | Either `FILE_UPLOAD` in chunks (5–64 MB each, up to 1,000), or `PULL_FROM_URL` from a verified domain or URL prefix (https, no redirect, reachable for an hour). MP4 with H.264 recommended, at most 4 GB and 10 minutes (and within the creator's `max_video_post_duration_sec`), 23–60 fps, 360–4,096 pixels. |
| **Limits** | 6 requests a minute per user token. A daily post cap per creator, "typically around 15", shared by every app the creator uses. |
| **AI label** | `is_aigc` on the post |
| **Tokens** | The access token lasts 24 hours; the refresh token 365 days, and it may change when used. |

#### Instagram

| Topic | The rule today |
|---|---|
| **Accounts** | Professional accounts only (Business or Creator). Personal accounts can't be published to; switching is free. |
| **Two set-ups** | **The Instagram API with Instagram Login** (`instagram_business_basic`, `instagram_business_content_publish`) needs no Facebook Page, so it is the one to use. The other is the API with Facebook Login (`instagram_content_publish` and `pages_read_engagement`, with a linked Page). |
| **Access** | Standard Access works only for accounts with a role on our app, which is enough for testing. Serving anyone else needs **Advanced Access: Meta's App Review, with a screencast of the flow, and Business Verification**, which takes legal documents of the business that owns the app. Reported: 2–4 weeks a review round. |
| **Publishing a Reel** | Create a container (`media_type=REELS`, with `video_url` on a public server, or a resumable upload to `rupload.facebook.com`). Check `status_code` until it is `FINISHED`; a container expires after 24 hours. Then call `media_publish`. The cover comes from `cover_url` or `thumb_offset`. Also `share_to_feed`, up to 3 collaborators, and `is_ai_generated`. |
| **The video** | MP4 or MOV, H.264 or HEVC; AAC audio at most 48 kHz (128 kb/s in Meta's spec); 23–60 fps; 3 seconds to 15 minutes; at most 300 MB; 9:16 recommended |
| **Limits** | 100 posts published through the API per account per 24 hours; `content_publishing_limit` tells the usage. At most 5 hashtags a post since December 2025. |
| **Tokens** | Short-lived for 1 hour; long-lived for 60 days, refreshable before they expire |

### 6.2 Connecting accounts

- **The Connections page** has **Connect** for each platform. It opens the platform's own sign-in (OAuth with an authorization code, and PKCE where offered). The callback goes to our API, which keeps the tokens.
- **Tokens are encrypted at rest** (AES-256-GCM, with the key in `TOKEN_ENCRYPTION_KEY`, which can be rotated). They are never sent to the browser.
- **Only the scopes needed** (the table below). Playlists for a series would need the broad `youtube` scope, so they are left out at first.
- **Refresh.**
  - A sweep every hour refreshes tokens that expire within a day: TikTok's daily, Instagram's before 60 days, Google's when needed.
  - If a refresh fails, the connection is marked **Reconnect needed**, the maker gets an email, and its scheduled posts wait.
- **Disconnect** revokes access at the platform and deletes the tokens and stored platform data within YouTube's limits.
- **One account per platform per maker at first.** Several come later.
- **The table:** `connections`: user, platform, account id, name, avatar, scopes, encrypted tokens, expiry, status.

| Platform | Scopes now | Added in phase 4 |
|---|---|---|
| YouTube | `youtube.upload`, `youtube.readonly` | `yt-analytics.readonly` |
| TikTok | `user.info.basic`, `video.upload`, `video.publish` | the video list, for results |
| Instagram | `instagram_business_basic`, `instagram_business_content_publish` | insights |

### 6.3 One film, in the right shape and words for each platform

The app already makes both shapes from one script (vertical twins), and the package already holds the title, description, chapters and hashtags.

| | YouTube | YouTube Shorts | TikTok | Instagram Reels |
|---|---|---|---|---|
| **Shape** | Wide, 16:9 | Vertical, up to 3:00 | Vertical | Vertical |
| **File** | The export, captions burned in | Same | The export **without the end card** (TikTok allows no branding) | As for TikTok, with the audio encoded to Meta's spec |
| **Title or caption** | The package's title (up to 100 characters) | Title and hook | Hook line and hashtags (up to 2,200 characters) | Hook and at most 5 hashtags (up to 2,200 characters) |
| **Description** | The package's description: chapters from 0:00, sources, what we left out | Short | (in the caption) | (in the caption) |
| **Cover** | `thumbnails.set` with the chosen frame | (YouTube picks) | `video_cover_timestamp_ms` | `thumb_offset` |
| **AI label** | `containsSyntheticMedia` by rule: on for realistic depictions of real people or events, off for animation by default | Same | `is_aigc` on | `is_ai_generated` on |
| **Other** | Made for kids (from the brief's audience; the maker confirms); category | | Privacy (the maker picks; no default), interactions, commercial toggles | Share to feed |

- **Per-platform captions.** The package gains a hook line under 150 characters and a set of 5 hashtags. It's a small extension of the editor's stage 8, written by the same model.
- **Long vertical films on YouTube.** An episode over 3 minutes posted vertically to YouTube is an ordinary vertical video. A "Shorts cut" (the hook and first act, under a minute) is a later feature.
- **The "Made with" end card** never goes on TikTok or Instagram posts. TikTok forbids it, and Meta's reviewers dislike it. Guests' downloads keep it.

### 6.4 Posting jobs

- **The `posts` table:** video, connection, platform, shape, words, privacy, `scheduled_at` (UTC) with the maker's time zone, status, approval time, the platform's id and link, error, attempts, and the film's hash at approval.
- **Statuses:** draft · needs approval · scheduled · posting · posted · failed · cancelled.
- **A `posting` queue** (BullMQ) holds one delayed job per post at its time. A sweep every minute also queues anything due that isn't queued, so posts survive a Redis flush.
- **The steps of a post:**
  1. **The MP4 for that platform exists.** If not, it is rendered, starting 2 hours ahead. YouTube posts are uploaded ahead with `publishAt`, so YouTube keeps the time even if our side is busy.
  2. **The token is fresh.**
  3. **Upload:**
     - YouTube: a resumable upload.
     - TikTok: `creator_info` first, then chunks, or a pull from `media.<domain>`.
     - Instagram: a container from a signed `media.<domain>` address, checked until it is ready, then published.
  4. **Thumbnail.**
  5. **Done.** Save the platform's id and link, set the status to `posted`, and tell the maker by email and in the app.
- **Retries.**
  - Network errors, server errors and rate limits retry with backoff after 1, 5 and 15 minutes, at most 3 tries within an hour. A YouTube resumable upload carries on rather than starting over.
  - Errors that won't go away fail at once, with a plain message and the one action that fixes it (Reconnect, Edit, Try tomorrow). These are: a revoked token, a policy refusal, TikTok's `spam_risk_*`, Instagram's daily limit.
- **Never twice.** A post keeps its upload session and the platform's id, and a retry checks them before uploading again.
- **Checks before sending:**
  - the film hasn't changed since approval (if it has, the post goes back to needs approval);
  - the platform's limits (TikTok's longest video, Instagram's 100 a day, YouTube's 3-minute Shorts rule);
  - moderation has passed.

### 6.5 What Richard has to do, and how long it takes

| Step | What it's for | What it needs | How long |
|---|---|---|---|
| Choose the name, buy the domain, set the DNS at Cloudflare | Everything | | A day |
| Terms, Privacy, Community rules and Copyright pages live | Every review | The business's legal name and address | A few days. A lawyer's read is advisable. |
| The business entity and its documents | Meta's Business Verification; payouts later | Registration documents, proof of address | About 1–2 weeks at Meta (an estimate) |
| A Google Cloud project for the app, its OAuth consent screen, the domain verified in Search Console | Google sign-in and YouTube | The live site | A day; brand verification 2–3 business days |
| Sensitive-scope verification (the YouTube scopes) | YouTube for everyone, past 100 users | Reasons per scope, an unlisted demo video | 3–5 business days by Google's word, up to about 10 |
| The YouTube API audit (Audit and Quota Extension form) | Public uploads; more than 100 uploads or searches a day | The working flow, privacy policy, terms | Not stated. Several weeks to several months reported. |
| A TikTok developer account, an app with Login Kit and the Content Posting API, and its app review | Sending to TikTok drafts | The live site, a demo video | Days to 2 weeks (an estimate) |
| TikTok's Content Posting audit | Public Direct Post | The required posting screen, a demo | About 3 weeks reported, with at least one rejection |
| A Meta developer account, a business portfolio, an app with Instagram Login, App Review for Advanced Access | Instagram for everyone | Business Verification, a screencast, the privacy policy | 2–4 weeks a round reported |
| A SerpApi account; apply for Google's Trends API alpha | Ideas | | A day. Alpha access is uncertain. |
| A Cloudflare R2 bucket with the `media.` domain; Turnstile keys | Hosting, guests | | An hour |
| A DMCA agent at the US Copyright Office | Public videos | $6 | A day |
| A sending domain at Resend (SPF, DKIM) | Sign-in codes | DNS | An hour |

**In what order.** The reviews need the live site and a working flow to film, so:
1. The legal pages and the domain come in phase 1.
2. Connect and post are built in phase 2 against test access: Richard's own YouTube while the app is in Testing, TikTok's unaudited private posts, Instagram with Richard's account as a tester.
3. The demos are filmed, and all three reviews are filed in the first week of phase 2.
4. Each platform goes live as its approval lands.

Meanwhile the maker can always **Download** and post by hand. Sending to TikTok drafts works once the app review passes, without the audit.

---

## 7. The content calendar

- **The pattern is Google Calendar.**
  - **Header:** Today · ‹ › · October 2026 · Month | Week | List.
  - **On phones,** List (an agenda) is the default, with Month as an option.
- **An item** shows its platform icons, time, title and a status colour.
  - A click opens a side sheet (a bottom sheet on phones) with the preview, platforms, time and status.
  - The sheet has one main action, set by the status: **Approve** (needs approval), **Reschedule** (scheduled), **Try again** (failed), **View** (posted).
- **Drag to reschedule.** On a desktop, drag between days and times. On a phone, Reschedule opens a date and time picker. Dropping on a time in the past asks "Post now?".
- **A "Ready to post" tray** holds made videos that aren't scheduled. Dragging one onto a day opens the Publish dialog, filled in.
- **Time zones.**
  - Times are stored in UTC with the maker's time zone (an IANA name), and shown in the maker's zone with its name.
  - Settings holds the zone: detected, and editable.
  - A recurring series is kept as a local time and a zone ("Tuesdays 17:00 Europe/Madrid"), so summer time doesn't shift it.
- **Statuses:**
  - Draft (planned, not yet approved, or the video isn't made yet);
  - Needs approval;
  - Scheduled;
  - Posting;
  - Posted;
  - Failed;
  - Cancelled.
- **Approval before anything posts.**
  - At first, the maker approves every post.
  - Scheduling a post yourself counts as approving it.
  - A post the agent proposes needs a tap. "Approve all 3" approves exactly those three, with the time recorded: YouTube's policy asks for prior, specific consent.
  - A film changed after approval goes back to Needs approval.
- **A series from a show's episodes.**
  - After episode 1 is published, **Plan the series** offers the plan's next episodes (the "add more?" episodes) on a rhythm the maker picks, for example weekly on Tuesday at 17:00.
  - They appear as Draft items, such as "Episode 2: Why did it nearly fall apart?".
  - Each must still be made and approved. The day before, if it isn't made yet, a note says: "Episode 2 is planned for tomorrow. Make it now?", with its cost.
  - Making episodes ahead automatically comes in phase 4, within a budget.
- **Data:** `posts` (§6.4), plus `series`: the show, the rhythm, the time zone, the platforms, the next number.

---

## 8. Ideas: the agent with live internet data

### 8.1 What it does

1. **Finds what's rising in the maker's areas:**
   - on YouTube: the most popular videos by country and category, and new videos on a topic with outsized views;
   - in search interest: interest over time, rising related searches, and what's trending now in a country;
   - in the news.
2. **Explains why each topic is worth a video.** It shows the evidence with numbers, dates and links, for example:
   - "Searches up 340% this week in Canada and Australia";
   - "3 videos from small channels passed 500k views in 5 days";
   - "No good explainer in the last year".

   It also gives an angle: a driving question, as the editor's desk asks for.
3. **Drafts the brief and starts the show.** **Make this** creates the show with its format, audience, takeaway and question. Create then opens on the angles card, and the maker still picks.
4. **Plans a posting schedule:** Draft items on the calendar (a series rhythm, the platforms), waiting for approval.
5. **Later (phase 4), reads the maker's own results** (YouTube Analytics, TikTok's video list, Instagram's insights) and suggests what to make next.

### 8.2 Its tools

Each tool is a small server function the model can call.

| Tool | Where the data comes from | Cost |
|---|---|---|
| `youtube_popular(region, category)` | `videos.list chart=mostPopular` (1 unit). Since July 2025 this chart shows trending music, movies and gaming, so it is used only for those. | Free (quota) |
| `youtube_rising(topic, regions?, language?, days)` | `search.list` sorted by views, published in the last days, by country or language (its own 100 a day). Then `videos.list` and `channels.list` (1 unit per 50) for views a day, and views compared with subscribers to spot outliers. | Free (quota). Cached for 12 hours per query and shared by all makers. |
| `search_trends(topic, geo, period)` | SerpApi's Google Trends: interest over time, rising related searches | About $0.01–0.015 a search on the $75–150 plans; cached |
| `trending_now(geo, hours, category)` | SerpApi's Google Trends Trending Now | The same; cached for an hour per country |
| `news(topic, days, regions?)` and `research(question)` | OpenAI's web search, the editor's research tool | $10 per 1,000 searches, plus tokens |
| `start_show(brief)` | The Studio's `POST /studio/shows` and its first turn | A film costs only when it is made |
| `propose_schedule(items)` | Draft items on the calendar | Free |
| Phase 4: `channel_results(connection, period)` | The YouTube Analytics API, TikTok's video list with counts, Instagram's insights | Free. Each maker's own channels only. |

**Google Trends.**
- Google announced an official Trends API on 24 July 2025. Its page still says "We're now accepting applications for alpha testers", and it publishes no quotas.
- Apply now, and use SerpApi until access comes. When it does, the tool switches source and nothing else changes.

### 8.3 Model, memory, guardrails

**The model.**
- GPT-5.4 mini (`openai:gpt-5.4-mini`) with OpenAI's web search, as on the editor's desk.
- It runs as a new task, `ideas_agent` (`AI_MODEL_IDEAS`), with low reasoning effort.
- Never gpt-4.1.
- No Google model is used here: Google stays the voice and the picture judge. YouTube's and Google Trends' APIs provide data, not AI.

**Its memory:**
- the maker's interests (chips and their own words);
- their languages and regions (chosen by the maker; empty means worldwide);
- their channel's past topics;
- the ideas they turned down.

**Guardrails.**
- **It proposes; the maker approves.** Nothing is made, scheduled or posted without a tap, and nothing is spent beyond the idea itself.
- **Budgets per maker per day:** 10 refreshes and 50 messages for accounts, 3 refreshes for guests. Searches are capped per turn (OpenAI's `maxToolCalls`), and the same queries share caches.
- **No spam:**
  - never more often than the rhythm the maker set, and never more than a platform allows;
  - never the same topic twice in a month on one channel;
  - no near-identical films (YouTube's "inauthentic content" rule);
  - titles and thumbnails held to the editor's packaging rules: no false claims.
- **No copying.** A trend is a topic, never someone's video. The agent never suggests re-uploading or remaking a particular video.
- **Platform rules:**
  - YouTube data is shown with YouTube's attribution;
  - results are never combined across different makers' channels;
  - YouTube data is kept within its 30-day rule.
- **Global.** No region is the default. Trends are fetched for the countries the maker chose, or worldwide, and examples and wording vary (global-not-regional).
- **Care.** No trend-chasing on tragedies. A sensitive news topic is only suggested with the editor's fairness rules.

### 8.4 What it costs per maker per month (rough)

- **An idea refresh:** about $0.06–0.10.
  - About 30k tokens in and 4k out: $0.04.
  - 1–2 web searches: $0.01–0.02.
  - 2–3 trend calls: about $0.03, less with caching.
- **A chat message:** $0.01–0.03.
- **A typical active maker** (8 refreshes, 20 messages and 4 weekly summaries a month): about **$1–2**. A heavy user: $3–5.
- **Fixed:** SerpApi at $75 a month (5,000 searches) to $150 (15,000).
- **The films it leads to** cost what films cost: $1–4.50 an explainer episode by the infographic plan's estimate. That's the real money, which is why making always waits for the maker.

---

## 9. The UI

The rules are Richard's: less is more; patterns people already know (ChatGPT for the create box, YouTube for watching and channels, Google Calendar for the calendar, Google Docs for share popovers); one main action per card; it works on phones.

### 9.1 The app shell

- **Purpose:** get to the five places without thinking.
- **Desktop.** A slim left sidebar, like YouTube's and ChatGPT's: **+ Create**, Ideas, Calendar, Library, Your channel. The guest badge or the avatar sits at the foot. The account menu holds Connections, Settings and Sign out.
- **Phone.** A bottom bar with five items: Create · Ideas · Calendar · Library · You. "You" holds the channel, connections, settings and account. A top bar appears only on pages that need a title.
- **Items appear as their phase ships:**
  - phase 0: Create, and Library as today's list of films;
  - phase 1: the full Library, and Your channel;
  - phase 2: Calendar;
  - phase 3: Ideas.

```
Desktop                                         Phone
+-----------+----------------------------+      +--------------------------+
| (logo)    |                            |      | (logo)          (Guest)  |
| + Create  |   What do you want to make?|      |                          |
|   Ideas   |  +----------------------+  |      |  What do you want to     |
|   Calendar|  | Describe a story...^ |  |      |  make?                   |
|   Library |  +----------------------+  |      |  +--------------------+  |
|   Channel |  (idea) (idea) (idea)      |      |  | Describe...      ^ |  |
|           |                            |      |  +--------------------+  |
|           |  Your films                |      |  (idea) (idea)           |
|           |  [film] [film] [film]      |      |  Your films              |
| Guest:    |                            |      |  [film] [film]           |
| Save your |                            |      |--------------------------|
| work      |                            |      | Create Ideas Cal Lib You |
+-----------+----------------------------+      +--------------------------+
```

### 9.2 Landing page

- **Purpose:** show what it makes, and start a film in one click.
- **On it:** the promise, the create box with idea chips, the agreement line, the demo film, three steps, example films, FAQ, footer (§4).
- **Main action:** **Make**.

```
+--------------------------------------------------------------+
| (logo) Name                                        Sign in   |
|                                                              |
|           Ask a question. Get a researched, animated         |
|                    video, ready to post.                     |
|   +------------------------------------------------------+   |
|   | What do you want to make?                     (Make) |   |
|   +------------------------------------------------------+   |
|   (Why does February have 29 days?) (A bedtime story ...)    |
|   (How a vaccine teaches the body)  (The race to the Pole)   |
|   By making a video you agree to the Terms and Privacy.      |
|                                                              |
|   +------------------------------------------------------+   |
|   |          > demo film, 75 s, muted, captions          |   |
|   +------------------------------------------------------+   |
|   Made by the app from one sentence.                         |
|   1 Ask        2 Choose the question       3 Watch, post     |
|   [film]  [film]  [film]  [film]                             |
|   FAQ                                                        |
|   Terms . Privacy . Community rules . Copyright . Contact    |
+--------------------------------------------------------------+
```

**Phone:** one column. The promise in three lines, then the box, then the chips wrapping (no sideways scroll). The demo film is vertical, 9:16. Examples are one per row.

### 9.3 Create (today's Studio, unchanged)

- **Purpose:** make the film, as today.
- **The Create home** is today's `/studio`: the ChatGPT-style box and the maker's films.
- **The workspace** is today's `/studio/[showId]`: the chat beside the panel, with its tabs (Brief · Plan · Script · Scenes · Film for an explainer; a story's Story, Outline and Cast), and all the cards, chips and steps.
- **Only three changes:**
  1. The shell's sidebar is around it.
  2. On the Film tab, **Publish** becomes the main button. Download and Share (an unlisted link) stay beside it.
  3. A guest who taps Publish gets the sign-up sheet (§9.11).

```
+-----------+------------------------------+--------------------+
| sidebar   | chat (as today)              | Brief Plan Script  |
|           |  ...thread cards...          | Scenes  Film       |
|           |                              | +----------------+ |
|           |                              | |    player      | |
|           |                              | +----------------+ |
|           | [Answer, or tell me more.. ^]| (Publish) Download |
|           |                              |  Share             |
+-----------+------------------------------+--------------------+
```

**Phone:** as today. The chat and the panel switch, and Publish sits under the film.

### 9.4 Library

- **Purpose:** everything the maker has made, and where each film stands.
- **On it:** filter chips, and one row per episode (§5.2).
- **Main action:** one per row, by state: **Continue** or **Publish**.

```
+--------------------------------------------------------------+
| Library          (All) (Published) (Drafts) (Scheduled)      |
|--------------------------------------------------------------|
| [4:39] Why February Gets an Extra Day                        |
|        Leap years . Episode 1 . Public . 1.2k views          |
|        YouTube: posted . TikTok: posted . Reels: Tue 17:00   |
|--------------------------------------------------------------|
| [3:52] How a pope made ten days disappear       (Publish)    |
|        Leap years . Episode 2 . Made, not published          |
|--------------------------------------------------------------|
| [ .. ] The lost kite                            (Continue)   |
|        Bedtime stories . Episode 1 . Writing scenes          |
+--------------------------------------------------------------+
```

**Phone:** one card per row, with the thumbnail full width, the title, one status line and the one button. The chips wrap.

### 9.5 Watch page

- **Purpose:** a viewer watches, learns where the facts came from, and shares.
- **On it:** the player, title, channel row, actions, description with chapters, sources and transcript, then the series and more from the channel (§5.4).
- **Main action:** **Play**. Share comes next.

```
+--------------------------------------------------------------+
| (logo)                                             (avatar)  |
| +--------------------------------------+  Leap years         |
| |                                      |  Episode 1 of 3     |
| |            video player              |  > Why February...  |
| |                                      |    2 How a pope...  |
| +--------------------------------------+    3 What if we...  |
| Why February Gets an Extra Day                               |
| (av) Sky Explained  @skyexplained           (Share) (...)    |
| +--------------------------------------+  More from          |
| | 1.2k views . 2 Oct 2026              |  @skyexplained      |
| | Every four years February gets...    |  [film] title       |
| | ...more                              |  [film] title       |
| | Chapters  0:00 The missing quarter   |                     |
| |           1:13 Caesar's fix          |                     |
| | Sources   1 NASA Space Place ...     |                     |
| | Transcript                           |                     |
| +--------------------------------------+                     |
+--------------------------------------------------------------+
```

**Phone:**
- the player full width at the top (a vertical film fills the screen width);
- then the title, the channel row and the actions;
- then the description folded to two lines;
- then the series, then more.

### 9.6 Channel page

- **Purpose:** a maker's public page.
- **On it:** avatar, name, @handle, counts, one line about it, and the Videos and Series tabs (§5.5).
- **Main action:** for viewers, play a video. For the owner, **Edit channel**.

```
+--------------------------------------------------------------+
|  (avatar)  Sky Explained                                     |
|            @skyexplained . 12 videos . 48k views             |
|            Space and time, explained with sources.           |
|            (Edit channel)                  <- owner only     |
|  (Videos) (Series)                                           |
|  [film]    [film]    [film]    [film]                        |
|  title     title     title     title                         |
+--------------------------------------------------------------+
```

**Phone:** the header stacks, and the grid shows one film per row.

### 9.7 Calendar

- **Purpose:** see and arrange what posts when, and approve it.
- **On it:** the views, the items, and the Ready-to-post tray (§7).
- **Main action:** on an item, the one its status calls for (**Approve**, **Reschedule**, **Try again**).

```
+--------------------------------------------------------------+
| (Today) < >  October 2026            (Month|Week|List)       |
|--------------------------------------------------------------|
| Mon      Tue          Wed    Thu    Fri         | Ready to   |
|          1            2      3      4           | post       |
|          YT 17:00 ok                            | [film]     |
|          Why Feb...                             | [film]     |
| 7        8            9      10     11          |            |
| TT 9:00  YT 17:00 !                 Ep 3        |            |
| Why Feb  How a pope                 (draft)     |            |
+--------------------------------------------------------------+

Item sheet                              Phone (List)
+----------------------------------+    +--------------------------+
| How a pope made ten days...  [x] |    | October 2026     (Month) |
| [film]  YouTube . wide           |    | Tue 1                    |
|         Tue 8 Oct, 17:00 Madrid  |    |  17:00 YT Why Feb...  ok |
|         Needs your OK            |    | Tue 8                    |
| Title and description            |    |  09:00 TT Why Feb...     |
|           (Approve)  Reschedule  |    |  17:00 YT How a pope.. ! |
+----------------------------------+    | Fri 11                   |
                                        |  --  Ep 3 (draft)        |
                                        |--------------------------|
                                        | Create Ideas Cal Lib You |
                                        +--------------------------+
```

**Phone:** the list by default, and tapping an item opens a bottom sheet with the same content as the side sheet. There's no dragging on phones; Reschedule opens a picker.

### 9.8 Publish and Schedule dialog

- **Purpose:** decide who sees the film on our site, where else it goes, and when, in one place.
- **On it:**
  - the preview and a choice of three thumbnail frames;
  - the title and description, filled from the package;
  - visibility on our site;
  - "Also post to": each connected platform, with what its rules require shown only when it is switched on;
  - when;
  - the AI label line.
- **Main action:** **Publish**, which becomes **Schedule** when a time is set.

```
+--------------------------------------------------------------+
| Publish "Why February Gets an Extra Day"                [x]  |
|--------------------------------------------------------------|
| +------------------+   Title  [Why February Gets an Extra..] |
| |    preview       |   Description [Every four years..] more |
| +------------------+                                         |
| Thumbnail (o)[f1] ( )[f2] ( )[f3]                            |
|                        On Name   (o) Public                  |
|                                  ( ) Unlisted ( ) Private    |
|                        Also post to                          |
|                        [x] YouTube (wide)          Edit      |
|                            Made for kids? (o) No ( ) Yes     |
|                        [x] TikTok  @skyexplained             |
|                            Who can watch [ Choose...   v]    |
|                            [ ] Comments [ ] Duet [ ] Stitch  |
|                            [ ] Promotes a brand              |
|                        [ ] Instagram Reels         Connect   |
|                        When  ( ) Now  (o) Schedule           |
|                              [Tue 7 Oct] [17:00] Madrid      |
|                        AI label: on (why?)                   |
|                                              ( Schedule )    |
+--------------------------------------------------------------+
```

**Phone:** a full-screen sheet with the fields stacked: the preview at the top, then each section folded until needed, and one button at the bottom.

**Guests:** the sign-up sheet first.

### 9.9 Connections

- **Purpose:** connect, check and disconnect the maker's social accounts.
- **On it:** one row per platform, with its account, status and needs. The promise: "We post only what you approve. Disconnect any time."
- **Main action:** **Connect**, or **Reconnect** when needed.

```
+--------------------------------------------------------------+
| Connections                                                  |
| We post only what you approve. Disconnect any time.          |
|--------------------------------------------------------------|
| [YT] YouTube    (av) Sky Explained         Connected  (...)  |
| [TT] TikTok     (av) @skyexplained         Reconnect needed  |
|                                                (Reconnect)   |
| [IG] Instagram  Needs a Business or Creator account          |
|                 How to switch                  (Connect)     |
+--------------------------------------------------------------+
```

**Phone:** the same rows, with the button under the text.

### 9.10 Ideas

- **Purpose:** know what to make next, and why.
- **On it:**
  - the maker's interests and regions at the top (chips, "Everywhere" by default);
  - the agent's thread, with **trend cards**: the topic, the evidence with links and dates, the question, the format and length;
  - schedule proposals, as a small calendar card with **Add to calendar**;
  - the box at the foot.
- **Main action:** on a card, **Make this**. Save and Not for me are quiet links.

```
+--------------------------------------------------------------+
| Ideas    (Space) (History) (+)          Where: Everywhere    |
|--------------------------------------------------------------|
| Three topics are rising in your areas this week.             |
| +----------------------------------------------------------+ |
| | Why a telescope stopped seeing                           | |
| | Why now: searches up 280% in 7 days (UK, US, India);     | |
| | 2 small channels passed 400k views in 4 days. (3 links)  | |
| | The question: "How do you fix a telescope in space?"     | |
| | Explainer . about 4 min . wide and vertical              | |
| |                                        ( Make this )     | |
| | Save . Not for me                                        | |
| +----------------------------------------------------------+ |
| [ Ask about trends, or say what you want to make...     ^ ]  |
+--------------------------------------------------------------+
```

**Phone:** the same thread, with the cards full width and the chips wrapping. The box sits above the keyboard (the `ig-mobile` fixes apply here too).

### 9.11 Sign-up sheet (for guests)

- **Purpose:** keep a guest's work by turning them into an account, at the moment it matters.
- **When it appears:**
  - on Publish, Connect and Schedule (it blocks, because these need an account);
  - as a one-line banner after the first film is made (it can be dismissed);
  - from the guest badge, at any time.

  **Never on the first visit.**
- **Main action:** **Continue with Google**.

```
+----------------------------------------+
| Keep your films                    [x] |
| Your 2 films come with you.            |
| [ G  Continue with Google ]            |
| [    Continue with email  ]            |
| Already have an account? Sign in, and  |
| we'll add these films to it.           |
+----------------------------------------+
```

**Phone:** a bottom sheet.

### 9.12 Settings

- **Purpose:** the few things a maker sets once.
- **On it:**
  - **Profile:** name, picture, @handle;
  - **Account:** email, sign-in methods, delete account;
  - **Defaults:** time zone, languages, where the viewers are ("Everywhere" by default), visibility, AI label;
  - **Notifications:** approvals, posted or failed, weekly ideas;
  - **Usage:** film minutes this month, spend today;
  - **Your data:** download it, delete it.
- **Main action:** none. Each field saves as it changes.

**Phone:** one list of sections, each opening its own page.

### 9.13 The addresses

| Address | Page | Phase |
|---|---|---|
| `/` | The landing page, or Create for someone with a session | 0 (Create), 1 (landing) |
| `/create`, `/create/<show>` | Create: today's `/studio` and `/studio/[showId]` | 0 |
| `/library` | Library: today's list of films, then the full Library | 0, then 1 |
| `/s/<token>` | A film's share link, on the live player, as today | 0 |
| `/render/<episode>` | The export's render page (no session; a signed key) | 0 |
| `/v/<id>`, `/embed/<id>` | Watch page, and its embed | 1 |
| `/@<handle>` | Channel page | 1 |
| `/settings` | Settings | 1 |
| `/connections`, `/calendar` | Connections, Calendar | 2 |
| `/ideas` | Ideas | 3 |

---

## 10. Phases

Effort is in working days for one developer. Run with parallel agents, as the Studio was built, the calendar time is roughly half, plus the platforms' review waits.

| Phase | What ships | Days | What Richard tests at the end |
|---|---|---|---|
| **0. The Studio as its own app, with guests** | The repo and `packages/contracts` (1–2). The server copied and pruned, with `SceneMaker` split out and the LLM port cut down (3–4). The starting schema (1). Guests, limits, Turnstile, the Redis throttler, spend per user (2–3). The web shell, brand module and guest gate (2). The slim document intake (1–2). Railway, a temporary address, the Kokoro link and the export service (1). An admin page for the voice and spend (1). | 12–16 | In a private window on the new address, without signing in: make a story and an explainer; attach a PDF; download the MP4; share a link and open it on the phone; hit the daily limit and read the message. EasiRead is unchanged. |
| **1. Accounts, landing, library, publishing, watch and channel pages** | Google and email-code sign-in, with guests kept in place or merged (2–3). The landing page and demo film (2–3). The Library (2). Publish to our site: public bucket and CDN, thumbnails, moderation at publishing (3–4). The watch page, previews, embeds, views, transcript (3–4). The channel page and handle (2). Reports, the admin queue, the legal pages (2–3). "Move my films" in EasiRead, the importer, old links redirected (2–3). | 18–24 | Make a film as a guest on the phone, sign up with Google, and find it still there. Sign in on the laptop. Publish it publicly and open the watch page from a link preview in a chat. Embed it in a test page. Report it from another browser and remove it in the admin. Move one of his EasiRead films over. |
| **2. Connections, posting, calendar** | OAuth for the three platforms, with encrypted tokens and refresh (3–4). Publishers for YouTube (2), TikTok (2–3) and Instagram (2), and the posting queue with statuses and retries (2). Per-platform files and captions (1–2). The Publish and Schedule dialog with each platform's rules (2–3). The calendar: views, dragging, the tray, approvals, series (4–5). Notification emails (1). Demo videos and review submissions (1–2). | 20–26, plus 3–8 weeks of reviews alongside | Connect his YouTube, TikTok and Instagram. Schedule one episode to all three for tomorrow at 9:00 his time, approve it, and see it post. YouTube is private until the audit, TikTok private until its audit (or sent to drafts), Instagram with his account as a tester. Move an item by dragging. Disconnect one platform to make a post fail, and see Reconnect. |
| **3. Ideas** | The data tools and caches (3–4). The agent loop, budgets and memory (3–4). The Ideas screen, trend cards and Make this (3–4). Schedule proposals (2). A weekly summary email (1). | 12–15 | Set two interests, worldwide, and refresh. Open the evidence links. Turn one idea into a film. Accept a three-week plan into the calendar. |
| **4. Automation and analytics** | Results from the platforms (each maker's own channels) and our own views (4–5). "What next" suggestions (2). Autopilot with approval (3–4): the agent keeps the calendar filled from the plan and the trends, and makes episodes ahead within a monthly budget, but every post is still approved ("approve the week"). Likes (1). A Shorts cut of each episode (2–4). | 12–16 | Run one week where the agent proposes and makes ahead, and he approves the week in one place. Read the results page. Check that spending stayed within the budget. |

**About 74–97 working days in all.**

### 10.1 New tables, by phase

| Phase | Table | What it holds |
|---|---|---|
| 0 | `users` (changed) | `kind` (guest or member), email optional, `merged_into`, last seen |
| 0 | The Studio's tables | As they are at migration 0065 |
| 0 | `usage_counters`, `ai_call_logs` (changed) | A daily spend counter; the ledger gains `user_id` |
| 1 | `users` (changed) | Handle, picture, the line about the channel, time zone, languages, regions |
| 1 | `videos` | Episode or show, shape, visibility, public id, title, description, chapters, sources, thumbnail, file keys, status, published date |
| 1 | `video_views` | Views per video per day |
| 1 | `reports` | Video, reason, note, who reported, decision, reason sent |
| 1 | `transfers` | Films moved from EasiRead: the EasiRead user, when, what came over |
| 2 | `connections` | §6.2 |
| 2 | `posts`, `series` | §6.4 and §7 |
| 3 | `ideas`, `idea_messages` | Each idea with its evidence (sources, numbers, dates) and status; the agent's thread |
| 3 | `trend_cache` | Shared answers from YouTube and SerpApi, with the time they were fetched (YouTube data at most 30 days) |

### 10.2 Risks

| Risk | What it would do | How it's handled |
|---|---|---|
| Platform reviews are slow or rejected | No public posting | File all three in phase 2's first week. Follow each reviewer's list: a live, finished site with no "coming soon" wording, legal pages that are easy to find, demo videos, TikTok's posting screen exactly as required. Download, and TikTok's drafts, work meanwhile. |
| YouTube's audit takes months | Uploads stay private | Apply as soon as the flow works. Makers can download and upload themselves until then. |
| Quotas: 100 uploads and 100 searches a day for the whole app | Posting or Ideas stops for the day | Uploads are queued and spread out. Searches are cached and shared. More quota is asked for in the audit. SerpApi's YouTube search is a paid overflow. |
| Costs (guests, the agent, films) | Spending runs away | Per-guest and all-guest ceilings, economy settings for guests, budgets, the ledger per user, a kill switch. Phase 0 measures before the numbers are fixed. |
| Abuse: bots, spam, illegal or hateful content | Cost and reputation | Turnstile, per-IP limits, moderation on words and frames, no public videos from guests, reports and takedowns, no feed at first. |
| Copyright claims | Takedowns, Content ID | Our own score, CC0 and licensed sounds with records, no stock photos, the terms, a DMCA agent and process. |
| AI-content labels | Less reach, or penalties | Labels set per platform by rule, and the maker sees them. |
| A platform changes its API (YouTube's quota changed twice in a year) | Posting breaks | Each platform sits behind its own adapter, with tests. Errors show as Failed, with the fix. |
| Leaked tokens | Someone posts as a maker | Tokens encrypted at rest and only on the server; the fewest scopes; revoked on disconnect. |
| EasiRead breaks during the move | EasiRead's users are hurt | EasiRead isn't touched until its Studio retires. The move is a copy. |
| Two copies of the engine | Double work if Visualize keeps changing | Studio work happens only in the new repo. EasiRead installs the engine as a package if Visualize needs its progress. |
| The name changes after the reviews | Reviews and consent screens are redone | Decide the name before phase 1, and keep it in one module. |
| Children | Privacy law | Accounts 13 and over. "Made for kids" on YouTube. No personalised features on children's films. |

---

## 11. Decisions for Richard

1. **The name and domain.**
   - **Recommended:** decide before phase 1. The consent screens, the platform reviews and the privacy policy all carry the name, and renaming afterwards means reviewing again.
   - "LessonReel" fits explainers but not stories. If stories matter as much, a name about films or explaining fits better.
   - TikTok refuses app names that mention social platforms.
   - Whatever it is, it lives in one module (§2.7).
2. **How to separate it.**
   - **Recommended:** move, then share.
     - A new repository holds both sides (API and web, with one contracts package).
     - EasiRead isn't touched.
     - Its Studio points to the app from phase 1 and is removed 90 days later.
     - Visualize keeps its own engine copy until it needs the new one.
3. **The films already made in EasiRead.** **Recommended:** they move when each maker asks ("Move my films"), not in bulk.
4. **Which platform first.**
   - **Recommended:** build YouTube first. Long explainers and Shorts fit it, it schedules natively, and Google's verification is the quickest.
   - File TikTok's and Meta's reviews in the same week.
   - TikTok's "send to drafts" is likely the first public route that works.
5. **Guest limits.**
   - **Recommended:** 1 film a day of up to 5 minutes, a $3 daily ceiling, the Kokoro voice, guest films kept 30 days after the last visit, and $50 a day for all guests together.
   - The numbers are set after phase 0's measurements.
6. **Hosting.** **Recommended:** R2 behind Cloudflare's CDN, with one MP4 per shape. Stream or Mux only when watch time or slow networks call for it.
7. **The watch page's player.** **Recommended:** the MP4 for viewers. The live stage stays for makers in Create.
8. **Signing in.** **Recommended:** Google and email codes. Apple when there's an iPhone app.
9. **Trends data.** **Recommended:** SerpApi's Developer plan ($75 a month) now, and apply for Google's Trends API alpha.
10. **A public feed.** **Recommended:** none at first; links and channel pages only.
11. **Pricing.** **Recommended:** later. Keep counting film seconds and spending per user from phase 0, and propose plans after phase 2 with real costs.
12. **The voice server.** **Recommended:** reuse EasiRead's Kokoro service at first, then give the app its own when its load grows.

---

## Sources

Checked on 2026-10-01. The date after a page is its own "last updated" date where it shows one.

**YouTube and Google**
- YouTube Data API, `videos.insert` (2026-09-14): https://developers.google.com/youtube/v3/docs/videos/insert
- YouTube Data API, quota costs (2026-09-15): https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube Data API, revision history (entries of 30 Oct 2024, 10 Jul 2025, 4 Dec 2025, 1 Jun 2026, 14 Sep 2026): https://developers.google.com/youtube/v3/revision_history
- YouTube, quota and compliance audits (2026-09-14): https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits
- YouTube API Services, Developer Policies (2026-09-14): https://developers.google.com/youtube/terms/developer-policies
- YouTube Data API, `videos.list` (2026-09-14): https://developers.google.com/youtube/v3/docs/videos/list
- YouTube Data API, `thumbnails.set` (2026-09-14): https://developers.google.com/youtube/v3/docs/thumbnails/set
- YouTube Help, Shorts up to three minutes: https://support.google.com/youtube/answer/15424877
- YouTube Help, disclosing altered or synthetic content: https://support.google.com/youtube/answer/14328491
- Google, sensitive scope verification (2026-08-19): https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Google, OAuth 2.0 (refresh tokens expire after 7 days in Testing): https://developers.google.com/identity/protocols/oauth2
- Google, OAuth scopes: https://developers.google.com/identity/protocols/oauth2/scopes
- Audit waiting times as developers report them (Phyllo, 2026-06-25): https://www.getphyllo.com/post/is-the-youtube-api-free-in-2026-quota-limits-costs-when-to-pay
- YouTube's "inauthentic content" update (Search Engine Journal, July 2025): https://www.searchenginejournal.com/youtube-targets-mass-produced-content-in-monetization-update/550337/
- Google Trends API (alpha): https://developers.google.com/search/apis/trends

**TikTok**
- Content Posting API, Direct Post: https://developers.tiktok.com/doc/content-posting-api-get-started
- Direct Post reference (fields, `is_aigc`, errors, 6 requests a minute): https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- Upload to the inbox: https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content
- Media transfer guide: https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- Query creator info: https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info
- Content sharing guidelines (the posting screen, no watermarks, 5 users for unaudited apps, about 15 posts a day): https://developers.tiktok.com/doc/content-sharing-guidelines
- App review guidelines: https://developers.tiktok.com/doc/app-review-guidelines
- Access token management: https://developers.tiktok.com/doc/oauth-user-access-token-management
- A 2026 review in practice: about three weeks, two rejections (PostWire, verified August 2026): https://postwire.io/platforms/tiktok/approval/

**Instagram and Meta**
- Content publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- IG User Media reference (the Reels spec, `is_ai_generated`): https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- Instagram Platform overview (access levels, App Review, Business Verification, tokens): https://developers.facebook.com/docs/instagram-platform/overview
- Advanced Access in practice (review time): https://singhamandeep.com/instagram-api-advanced-access-approval/
- The five-hashtag cap (Later, 2026): https://later.com/blog/ultimate-guide-to-using-instagram-hashtags/

**Hosting, data and tools**
- Cloudflare Stream pricing (2026-09-08): https://developers.cloudflare.com/stream/pricing/
- Cloudflare R2 pricing (2026-10-01): https://developers.cloudflare.com/r2/pricing/
- Cloudflare's service-specific terms, video through the CDN (2026-09-28): https://www.cloudflare.com/service-specific-terms-application-services/
- Cloudflare Turnstile plans (2026-08-14): https://developers.cloudflare.com/turnstile/plans/
- Mux pricing: https://www.mux.com/pricing
- Bunny Stream pricing: https://bunny.net/pricing/stream/
- Railway pricing (object storage $0.015 per GB-month, free egress): https://railway.com/pricing
- Railway private networking ("Each environment has its own isolated network"): https://docs.railway.com/reference/private-networking
- SerpApi pricing: https://serpapi.com/pricing
- SerpApi Google Trends Trending Now: https://serpapi.com/google-trends-trending-now
- OpenAI moderation (free, takes text and images): https://developers.openai.com/api/docs/guides/moderation
- Apple App Review Guidelines 4.8 (login services): https://developer.apple.com/app-store/review/guidelines/
- US Copyright Office, DMCA designated agent directory: https://www.copyright.gov/dmca-directory/faq.html

**In this repository**
- `infographic-editor-plan.md` (GPT-5.4 mini prices, web search at $10 per 1,000 searches, cost estimates)
- `studio-plan.md`
- `studio-explainer-plan.md`
- `lessonreel-visuals-plan.md`
- `studio-vertical-plan.md` (render cost)
- `DEPLOYING.md` (services, the export and its measurements)

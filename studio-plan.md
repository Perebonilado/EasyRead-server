# Studio: make animated episodes from a blank page

Richard, 2026-09-26:
- There is a Studio button that **anyone** can use to make their own videos.
- You chat with it: it asks what you want to make and in what style (a story, an infographic…).
- What the Studio makes lives **in its own place**, not the library, as **episodes**, not pages. It's a whole animation made from nothing.
- **Every scene is decided before anything is drawn or animated.** For each scene we decide its setting, who is in it, what each character does and exactly what each says. Each character is then drawn correctly and says only their own lines. We see only what the scene describes, and nothing overlaps.
- Everything is planned step by step.

This replaces the first draft (admin-only, page-based).

---

## 1. The words we use

| Word | What it is |
|---|---|
| **Show** | What you make: its title, format, audience and style, plus its cast and sets (the *bible*). One show has one or more episodes. |
| **Episode** | One finished animation, usually 1–5 minutes, played start to finish like a cartoon. |
| **Scene** | One continuous stretch in one place: an episode has about 3–12. |
| **Beat** | One thing that happens in a scene: a line, a narration, an action, handling a prop, a reaction, a pause. |
| **Cast** | The characters, each with a fixed look, voice and personality. |
| **Sets** | The places, each with a fixed look. |
| **Production script** | The bible plus every scene sheet of an episode. It's the single source of truth: the stage plays it and adds nothing of its own. |

## 2. What the user does, step by step

1. **Opens Studio.** A **Studio** button in the header, for everyone, goes to `/studio`. There they see **My shows**: cards with a thumbnail, title and episode count, plus **New show**.
2. **Says what they want** in a chat ("a funny 2-minute story about a boy who loses his dog", "explain photosynthesis for 10-year-olds", "an infographic on how Nigeria's population grew").
3. **Answers a few questions.** The Studio asks only what's missing, with tap-to-choose answers (typing works too):
   - the **format**: *Story*, *Explainer*, *Infographic*;
   - who it's for (age), how long, the tone (funny, gentle, serious, exciting), and the language;
   - for a story: roughly how many characters, and where it's set.

   A **Brief** card beside the chat fills in as they answer, so they see what's understood. **Continue** is enabled once the brief is complete.
4. **Approves the outline.** The Studio proposes a title, a logline and a numbered list of scenes, one sentence each ("Tobi's dog runs off at the market"). They can reorder, delete, add or rewrite scenes, or ask in the chat ("make the ending happier"). Then **Approve outline**.
5. **Meets the cast and sees the sets.**
   - Each character appears as drawn by our figure kit, with their name, a one-line personality, and a **voice sample** (a line of theirs, spoken).
   - They can change a look (hair, clothes, age…), swap a voice or rename someone.
   - Each set shows as a painted backdrop.
   - Then **Approve cast**.
6. **Reads the script.** Every scene becomes a **scene card**:
   - the setting;
   - who's there and where they stand;
   - then each beat in order, like a screenplay: `TOBI (to Mama, worried): "Have you seen Bingo?"` and `Mama puts down the basket.`

   They can edit any card directly or ask the chat ("make Tobi braver in scene 3"). The **check** runs on every change, and problems show on the card in plain words ("Mama speaks in scene 4 but isn't there").
7. **Makes the episode.** **Make episode** renders each scene, with a progress bar per scene. Scenes can be watched as soon as each is done.
8. **Watches it.** It plays as one film: the scenes flow with cuts or fades, the music carries through, and there are opening titles and an end card. A scene strip under the player jumps to any scene.
9. **Fixes what they don't like.** They pause on a moment and say what's wrong in the chat ("Mama should hug him here"), or edit the card. Only the scenes that changed are made again, and only the lines that changed are voiced again.
10. **Adds episodes.** **New episode** in the same show reuses its cast and sets and remembers what happened before. The outline step starts from "previously…".
11. **Shares or downloads.** It can be shared by link and downloaded as MP4 with captions, a thumbnail and a title. Free plans get a watermark.

## 3. How it's made underneath, step by step

Each step's output is JSON, **checked by code before the next step starts**. If a check fails, it goes back to the writer with the reasons (up to 2 repairs) before the user sees it.

| # | Step | Made by | Input | Output | The check |
|---|---|---|---|---|---|
| 1 | **Intake** | chat model | the chat | **Brief** (format, audience, length, tone, language, premise, setting, cast size) | Every required field is filled; length fits the plan's allowance; passes moderation |
| 2 | **Bible** | writer | brief | **Cast** (name, look as a kit `FigureSpec`, personality, voice, what they carry), **Sets** (look, stand/table/front), **Props** | Every look is a valid kit spec; no two characters look alike (a distance on the spec); voices are distinct; names are unique; every prop is in the prop library or drawable |
| 3 | **Outline** | writer | brief, bible, earlier episodes | Title, logline, **scene list** (purpose, set, who's in it, rough seconds) | Scene seconds add up to the length; every set and character exists; every character is used; a clear beginning, middle and end |
| 4 | **Scene sheets** | writer, **one call per scene** | bible, outline, the scene before's **end state** | A full **scene sheet** (§4) | Everything in §5 |
| 5 | **Voice** | TTS | each line, with its speaker's voice | One audio clip per line, **cached by text + voice**, plus word timings | Each clip's length is within a normal speaking rate |
| 6 | **Timing** | code | scene sheet + audio | Every beat's start and end; actions land on their words; pauses held | The scene fits its seconds, within ±25% |
| 7 | **Stage** | code (+ artist for anything new) | timed sheet, cast, sets | One **SceneDto** per scene: the figure kit, blocking, acting, props, faces and camera, all from the sheet | Only what the sheet lists is drawn; no two people's boxes overlap; every speaker is visible (or marked off-stage) |
| 8 | **Assemble** | code | the SceneDtos | An **EpisodeDto**: scene order, transitions, the episode's music score, titles, end card | The total length; seamless audio at each join |
| 9 | **Export** (later) | render worker | the EpisodeDto | MP4 + captions (SRT/VTT) + thumbnail | Frame count = duration × fps; the audio is in sync |

The writer model is DeepSeek (never gpt-4.1), with thinking on for the outline and the scene sheets. The chat model is DeepSeek Flash. Both run through the existing LLM gateway, with their costs recorded in the existing ledger.

## 4. The scene sheet: what each scene spells out

```jsonc
{
  "scene": 3,
  "title": "At the market",
  "set": "market",                       // must exist in the bible
  "time": "afternoon", "weather": "sunny", "mood": "worried", "music": "tense",
  "onStage": [                            // exactly who and what is present: nothing else is drawn
    { "who": "tobi", "spot": "left",   "facing": "right", "pose": "standing" },
    { "who": "mama", "spot": "centre", "facing": "left",  "pose": "standing" }
  ],
  "props": [ { "prop": "basket", "with": "mama" } ],   // who holds it, or where it rests
  "beats": [
    { "kind": "narration", "say": "The market was loud and full of people." },
    { "kind": "line", "who": "tobi", "to": "mama", "feeling": "worried",
      "say": "Mama, have you seen Bingo?", "gesture": { "do": "reach", "on": "Bingo" } },
    { "kind": "business", "who": "mama", "do": "put", "prop": "basket", "on": "put down" },
    { "kind": "reaction", "who": "mama", "feeling": "surprised" },
    { "kind": "line", "who": "mama", "to": "tobi", "feeling": "sad", "say": "No, my dear." },
    { "kind": "action", "who": "tobi", "do": "leave", "toward": "right" },
    { "kind": "pause", "ms": 800 }
  ],
  "camera": [ { "from": 0, "shot": "wide" }, { "from": 1, "shot": "close", "on": "tobi" } ],
  "endState": { "onStage": ["mama"], "props": [ { "prop": "basket", "at": "ground" } ] }
}
```

- The **feelings** are the kit's faces: neutral, happy, sad, angry, afraid, surprised, thinking, pain.
- **Doings** come only from what the stage can act: enter, leave, walk to, hug, reach, point, look, sit, stand, take, raise, break, give, eat, drink, dip, put, plus the kit's signs (shaking, jumping…). **The writer is given this menu**, and the check rejects anything outside it, so we never promise what we can't show.
- A line's `from` handles voices that aren't on stage: off, above, phone, letter, thought, dream.
- The **narrator** is a cast member with a voice, and can't be put `onStage`.

## 5. The check (runs on every sheet, and on every edit)

**Lines, so each character says only their own part:**
- Every line has exactly one speaker from the cast. That speaker is `onStage`, or the line's `from` says where the voice comes from.
- The narrator never says a quoted line. A character never says narration.
- A line's `to` is on stage (or it's said to everyone).
- Lines never overlap: one voice at a time, except for a beat explicitly marked `together`.

**Presence, so we see only what the scene describes:**
- Everyone who acts, reacts, is spoken to or is handed something is `onStage`, or enters first.
- Nobody not listed appears. Entrances and exits add up within the scene, and `endState` matches.
- A scene starts from the previous scene's `endState`, unless it's in a different set or time. Then it starts from its own `onStage`.
- One character can't be in two scenes that happen at the same time.

**Space, so nothing overlaps:**
- One person per spot. At most 5 people, plus a crowd, drawn on a set.
- A hug, a give or a reach happens only between people next to each other; otherwise a `walk to` is added first.
- Anyone in a close-up is on stage.

**Props:**
- Every prop is listed before it's used. It's in someone's hand before it's eaten, given or raised (a `take` is added if not).
- It's where the previous scene left it. It can't be eaten twice.

**Story:**
- Each scene covers what its outline line promised.
- The scene's length is within its budget; the episode's is within the brief's.

**Safety:**
- The sheet's text passes moderation.

Each rule has a fixed message the UI shows on the card. Rules that can be fixed without changing the story are **mended by code** without asking:
- adding a `take`;
- adding a `walk to`;
- moving someone to a free spot.

## 6. Why nothing extra appears or overlaps

The stage goes **from the sheet, not from guessing**. The book pipeline guesses who's on stage (the bible's presence), who speaks (quotes and speaker detection), where they stand (layout), and what else shows (the writer's "show"). The Studio uses none of those guesses:
- **Who's drawn** = `onStage` + entrances. The composer rejects any other drawing.
- **Where** = `spot` → a fixed slot per set (left, centre-left, centre, centre-right, right, plus a back row). The layout honours it and never re-flows people into each other.
- **Who speaks** = the line's `who`. The caption, the mouth moving and the voice all come from that one field.
- **What they do** = the beats, timed to the words by the existing acting, business and IK code.
- **Faces** = each line's `feeling`, plus the listener reactions and blinks we already have.
- **Camera** = the sheet's shots, cut at beat boundaries.

## 7. Episodes, not pages

Pages were separate videos of 20–60 seconds. An episode is one film:
- **Scenes are rendered separately** (so edits re-render only what changed), but **played as one timeline.**
- **The episode player** (new, built on the existing stage):
  - loads scene *n+1* while *n* plays;
  - joins them with the sheet's transition (cut, fade, or a dip to black between sets);
  - has one scrubber across the whole episode, with scene marks and a scene strip;
  - has full screen and captions.
- **The music** is scored per episode: the show's motif opens it, each scene's `music` sets the state, and the score cross-fades at the joins rather than restarting.
- **Titles and end card:** the show title, the episode title, and "made with Studio" (the watermark on free plans).
- **Continuity:** each scene sheet is written from the previous scene's `endState`. The cast's looks and voices are fixed in the bible for every episode.

## 8. Editing without starting again

- Every sheet has a **content hash**. When one changes, only that scene becomes stale. **Update episode** re-renders stale scenes only.
- Voice clips are cached by text and voice, so changing one line re-voices one line.
- A chat edit returns a **patch** to a card (change a line, add a beat, move a person). It's shown as a highlighted change, the check runs, and the user can undo it.
- **Versions:** each approved or made state of the script is saved, and the user can go back to an earlier version.
- Changing a character's look or voice in the bible marks every scene they're in as stale.

## 9. For everyone: plan limits, cost, safety

- **Metered like everything else** (the `Entitlements` model: open on Free, time runs out).
  - A new allowance, **Studio minutes per month**, is charged on *finished, rendered* episode minutes. Chatting and writing scripts are free but rate-limited.
  - The limit is checked before **Make episode**, and the estimate is shown on the button ("about 2 min 30 s · uses 2.5 of your 3 minutes").
  - Numbers for Richard to set. Suggestion: **Free 3 min/month, Pro 30 min/month**, with credit packs on top (like voice credits).
- **Cost per finished minute (to measure in step 5; my estimate):**
  - writing: a few cents;
  - Gemini voice: about $0.014 per minute of speech (Kokoro is nearly free);
  - drawing new props or sets with the artist: cents, cached per show.

  Target: under **$0.15 per finished minute**. We measure it on real episodes before setting the limits.
- **Safety** (anyone, including children, can use this):
  - moderation on the brief and on every sheet;
  - no sexual content, no graphic violence, and no real living people shown doing things they didn't do (historical and public figures can be shown as history);
  - a report button on shared episodes.
- **Privacy:** shows are private to their maker. A share link is opt-in and can be switched off.
- **Fair use:** at most 1 episode making at a time per user and 10 script generations an hour. Big jobs are queued.

## 10. Data and API

**New tables (migration 0056):**
- `studio_shows`: id, user_id, title, format, brief (json), bible (json), created/updated.
- `studio_episodes`: id, show_id, number, title, logline, outline (json), status (drafting | outlined | cast | scripted | making | ready | failed), duration_ms, thumbnail_key, share_token.
- `studio_scenes`: id, episode_id, position, sheet (json), sheet_hash, check (json), render_status, scene_key (the stored SceneDto), rendered_hash, duration_ms.
- `studio_messages`: id, show_id, episode_id?, role, content, patch (json)?, created.
- `studio_versions`: id, episode_id, script (json), label, created.
- `studio_usage`: the minutes used per user per month. Or it's added to the existing usage snapshot.

**API (NestJS, all owner-checked):**
- `GET/POST /studio/shows`, `GET/PATCH/DELETE /studio/shows/:id`
- `POST /studio/shows/:id/turn`: the chat, **NDJSON streaming** like document chat. Each turn returns `{token}` lines, then `{done, reply, question?, choices?, patch?}`.
- `POST /studio/shows/:id/episodes`, `GET /studio/episodes/:id`
- `POST /studio/episodes/:id/outline | /cast | /script`: run a writer step (queued)
- `PATCH /studio/scenes/:id`: edit a sheet. Returns the check.
- `POST /studio/episodes/:id/make`: render stale scenes and assemble. Checks entitlements.
- `GET /studio/episodes/:id/events`: SSE progress (same as documents)
- `GET /studio/episodes/:id/play`: the EpisodeDto
- `POST /studio/episodes/:id/share`, `GET /s/:token` (public, read-only)
- `GET /studio/figure?spec=…`: draws a cast sheet preview

**Queue:** `studio`, with jobs `write-bible`, `write-outline`, `write-scene`, `voice-scene`, `stage-scene` and `assemble`. It's separate from `visual-…`, so book pages and studio episodes don't block each other.

**Client routes:**
- `/studio` (My shows), `/studio/new` (the chat);
- `/studio/[show]` (episodes, cast, sets);
- `/studio/[show]/[episode]` (the workspace: chat + script + player);
- `/s/[token]` (the public player).

**Naming:** the product name (Studio for now; LessonReel later) sits in one module on each side (`src/lib/brand.ts` / `src/business/domain/brand.ts`). The UI never hard-codes it.

## 11. The build, step by step

Each step ends with something that works and is tested. Steps 1–4 have no UI: they prove the engine on fixed scripts before we build screens on top of it.

### Step 1: The production script and its check
- Write the types `StudioBrief`, `StudioBible`, `SceneSheet`, `EpisodeScript` in `src/business/domain/studio/`.
- `checkSheet(sheet, bible, before)` implements every rule in §5, returning `{rule, message, beat?}[]`.
- `mendSheet` adds the missing takes and walk-tos and moves people to free spots.
- Fixtures, written by hand:
  - **"Tobi and Bingo"** (an original kids story, 4 scenes);
  - **"The Last Supper"** (3 scenes);
  - **"How plants eat"** (an explainer, 3 scenes).
- Tests: every rule has one passing and one failing case, and the fixtures pass.
- **Done when:** the checker catches every broken variant of the fixtures that we make on purpose.

### Step 2: One scene sheet → one SceneDto, with no guessing
- Add `stageSheet(sheet, bible, audio)` to the existing compose path. It maps beats into the screenplay drafts `composeScene` already takes, and turns off `castStory` presence, speaker detection and the writer's "show" for studio scenes.
- Spots become fixed slots in `scene-layout` (a new "blocked" layout that honours the given spots). Camera shots are mapped onto the existing stagings and cuts.
- Voices come from each cast member's voice, through the existing TTS adapters (Gemini, Kokoro or OpenAI by the admin setting), with a line cache keyed by `hash(text+voice)`.
- Try it in the **stage lab** (`/dev/stage?scene=`) with the fixtures.
- **Done when:**
  - each fixture scene plays with only its listed people;
  - every line comes from the right mouth, in the right voice, with its caption;
  - nobody overlaps;
  - props are handled on the right words;
  - a test fails if anything unlisted is drawn.

### Step 3: The episode player
- Client `src/lib/episode/`: `EpisodeDto` (scenes with offsets, transitions, score, titles).
- `EpisodePlayer` wraps the stage:
  - preloads the next scene;
  - joins scenes with transitions;
  - one scrubber with scene marks, a scene strip, full screen, captions;
  - music carried across joins.
- Title card and end card.
- A dev route `/dev/episode?fixture=tobi`.
- **Done when:** the Tobi fixture plays start to finish as one film, with no gap or pop at the joins, on desktop and phone.

### Step 4: The writer chain (script only, command line)
- Prompts for **bible**, **outline** and **scene sheet**:
  - each is given the check's rules, the doings menu, the faces and the prop library;
  - each is given the previous `endState`;
  - each goes through the repair loop (check → reasons back → up to 2 repairs → `mendSheet`).
- Add a `studio:make --brief brief.json` script that writes an episode's script and renders it to local files for the dev player.
- Try it on 8 briefs: 3 kids stories, 1 fable, 1 Bible story, 1 history story, 2 explainers.
- **Done when:** all 8 pass the check without a person's help, and Richard has watched and approved them.

### Step 5: Measure cost and speed
- Log each episode's model, voice and artist cost from the existing ledger, and the time for each step.
- Tune: which steps need thinking, caching the bible prompt, running scene sheets in parallel after the outline.
- **Done when:** we have real cost per finished minute and time-to-first-scene figures. These set the plan limits in step 11.

### Step 6: Storage and API
- Migration 0056, repositories, `StudioController` and the handlers.
- The `studio` queue and `StudioProcessor` running the jobs in §10, with SSE progress.
- Owner checks on every route. Tests for handlers and the processor with the fake LLM.
- **Done when:** a show can be made, outlined, scripted and made into an episode through the API alone.

### Step 7: The chat intake
- `LlmGatewayPort.studioTurn(messages, brief, stage, onToken)` returns a reply plus structured actions (`askFormat`, `setBrief`, `proposeOutline`, `patchScene`…). There's a fake adapter version for tests.
- The stage of the conversation decides what it's allowed to do (intake → brief only; script → patch scenes).
- Choice chips for the format, age, length and tone.
- Moderation on every user message.
- **Done when:** "a funny story about a lost dog" becomes a complete brief in 3 questions or fewer.

### Step 8: The Studio shell
- A **Studio** button in `AppHeader` for everyone, desktop and phone, with the name from the brand module.
- `/studio` (My shows, empty state, New show) and `/studio/new` (full-width chat + Brief card).
- The show page: episodes, cast, sets.
- **Done when:** a user can go from the header to a new show with a complete brief.

### Step 9: Outline, cast and sets
- The outline editor: reorder, add, delete, rewrite, **Approve**.
- Cast cards:
  - the figure drawn by the kit (`/studio/figure`);
  - a look editor from the kit's own choices (age, build, skin, hair, clothes…);
  - a voice picker with samples.
- Set cards.
- **Done when:** the user can change Tobi's shirt and voice before any scene is written.

### Step 10: Scene cards, editing, making and watching
- The workspace: chat on the left and script cards on the right, with the player above them.
- **On phone,** the chat, script and watch views sit in tabs.
- **Scene cards:**
  - a screenplay view, editable in place;
  - check messages inline;
  - a "stale" badge when the card has changed since it was made.
- Chat patches show as highlighted changes, with undo, and versions.
- **Make episode:**
  - shows the minutes it will use;
  - shows progress per scene;
  - lets each scene be watched as soon as it's ready;
  - re-renders only stale scenes.
- "Pause and say what's wrong": the moment's scene and beat are sent along with the chat message.
- **Done when:** Richard makes a 2–3 minute episode from a blank page in the Studio, fixes two things by chat, and only those scenes are made again.

### Step 11: Limits, safety and fair use
- The `studioMinutesPerMonth` allowance, with credit packs. The check sits in `Entitlements`, and the UI names the limit when it's hit.
- Moderation on briefs, sheets and titles. Rate limits and one job at a time.
- The watermark on Free.
- **Done when:** a Free account hits the limit cleanly, and unsafe briefs are declined with a kind message.

### Step 12: Sharing
- A share link (`/s/[token]`, read-only player, can be switched off) and a report button.
- An episode thumbnail, taken from a chosen moment.
- **Done when:** an episode opens on another device from its link without an account.

### Step 13: More episodes in a show
- A "previously" summary from earlier episodes goes into the outline step.
- Characters' growth is kept in the bible, and sets are reused.
- **Done when:** episode 2 of Tobi's show remembers Bingo and reuses the market.

### Step 14: Explainer and infographic
- Same shows, episodes, scenes and check. A scene's `onStage` lists *visuals* (diagram, chart, list, labelled drawing) instead of people, and beats are narration with `show`/`point`/`build` doings.
- This reuses the lesson pipeline's board, diagram, chart and pacing code and the teacher's notes.
- An infographic takes a table the user pastes or uploads; the chart code draws it, with the numbers checked by code.
- **Done when:** "explain photosynthesis for 10-year-olds" and "Nigeria's population since 1960" each make a clean episode.

### Step 15: Download as MP4
- A render worker opens the episode player in headless Chrome, steps it frame by frame (as the lab capture does now), and encodes the video with ffmpeg together with the episode's audio.
- It also produces SRT/VTT captions and the thumbnail, and adds the watermark on Free.
- It's our own renderer (not Remotion, so no licence fee). It runs as its own Railway service because it needs Chrome and ffmpeg.
- **Done when:** a downloaded MP4 uploads to YouTube and plays in sync.

### Step 16: Launch
- A feature flag rollout: internal → a beta list of the users who asked → everyone.
- Analytics: briefs started, outlines approved, episodes made, minutes used, where people stop.
- The name moves to LessonReel by changing the brand modules when you decide.

## 12. What we need to grow for a blank page

Books bring their own story; the Studio has to be able to show whatever people ask for. The check keeps the writer inside what we can draw, but that list needs to grow. Each of these is done alongside the steps above:
- **Props:** from 9 stage props to about 60 common ones (ball, phone, book, bag, toys, tools, foods). Beyond those, the artist draws a new prop once per show, in the kit's style, and it's cached.
- **Sets:** a library of about 20 common places (home, kitchen, classroom, market, street, park, forest, beach, shop, hospital, bus). The artist paints others once per show.
- **Animals:** a small kit for dogs, cats, birds and farm animals, with the same rig ideas (walk, sit, wag, look), because kids' stories need pets.
- **Doings:** add `sit`, `stand up`, `run`, `wave`, `shake hands`, `high five`, `cry` and `laugh` to the rig, as poses on the existing springs.

## 13. Decisions for Richard

1. **Name in the app:** "Studio" for now, shown from the brand module. Is that right?
2. **Allowance:** Free 3 finished minutes a month, Pro 30, plus credit packs. The numbers get confirmed after step 5's cost figures.
3. **Formats at first:** Story first (steps 1–13), then Explainer and Infographic (step 14). Or do you want Explainer at launch too?
4. **Who can see episodes:** private by default with opt-in share links. No public gallery for now.
5. **Real people:** allow historical and public figures as history, but not living people in made-up situations?
6. **Downloads:** is MP4 download needed at launch, or can it follow sharing (step 15 after 12)?
7. **Animals kit:** build it early (kids' stories need it) or after launch?

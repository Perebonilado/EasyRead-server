# Visualize, next: livelier, readable, taught by subject

Technical plan for the four goals agreed on 2026-09-23:
1. Better graphics, and no overlapping elements (text above all).
2. Teaching by subject: maths shown and worked without interruption; literature taught through its own words.
3. Stories with characters that build up and stay consistent across pages.
4. A livelier voice, plus sound design (music and effects). Also a paid-voice pilot on **Gemini TTS**.

It spans both repos: the server, `easyread-server`, and the client, `easyread`, on the branch `visualize-next` in each.

The rule that made the rebuild work carries through: **models decide what, code decides where and when**. Every change below moves one more decision out of a model's hands and into code that can be measured and tested:
- text placement;
- how maths is typeset;
- what a character looks like;
- how the voice is paced;
- when a sound plays.

## Status, 2026-09-24

All six phases are built and committed on `visualize-next` in both repos, locally; nothing is pushed.

- **Phase 1 (the voice, directed):** built. The Gemini pilot is written and tested against a fake; the live test waits for a key.
- **Phase 2 (sound design):** built.
- **Phase 3 (a readable stage):** built. The frame audit finds nothing on any sample page.
- **Phase 4 (teaching by subject):** built: the profile, `math`, `plot`, `quote` and `stack`. A passage's notes go in its margin, or are listed under it when the room is narrow. Not built: 4b (timelines, charts, an admin override of the profile).
- **Phase 5 (stories that continue):** built:
  - the story bible (`story.json`) and the cast drawn once (`cast.json`);
  - the `character` kind, with one face at a time;
  - first met stands on the left;
  - trait notes on the page the book meets someone, while there is room;
  - speech bubbles.

  Not built:
  - places as backdrops behind the stage;
  - the "previously" opening;
  - a who's-who panel;
  - character voices, which need `speech/kokoro/voice.py` to take a voice per piece and the Railway voice service to be redeployed.
- **Phase 6 (the yardstick):** `npm run scene:bench -- <parts dir> [--stills] [--against report.json]`.
  - **First run:** 5 of 5 pages have nothing found by the audit, and 0 of 5 pass the text bar.
  - **Why:** the stage's own words (labels at 24 units, arrow labels at 26, bubbles at 28) come out at 11–13px on a 560px pane, and at 8–9px at 390px.
  - **The fix:** a floor of 30 units in the box staging, which is 14px on the pane. It costs the drawings room and cuts more labels short, so it waits on a decision.

---

## 0. Ground rules

- **Additive contract.** `SceneDto` goes to `version: 4`, and every new field is optional. The player keeps playing v3 scenes, so the client and server can deploy in either order.
- **One generator bump.** `SCENE_GENERATOR_VERSION` becomes `scene-2` when phases 1–3 land together. Rows are kept per generator, so pages are remade on their next request, at about $0.035 each. Visualize is two days old in production, so few pages are affected. The later phases (4, 5) add abilities without needing another bump: an old page just lacks them.
- **Flags, not forks.** Everything new sits behind configuration, with defaults that match today, until it is proven:
  - `SCENE_VOICE_ENGINE` (`kokoro` | `gemini`) and `SCENE_VOICE`
  - `GEMINI_API_KEY` and `GEMINI_TTS_MODEL`/`VOICE`
  - `SCENE_FORMATS`
- **Pure first.** Each new decision is a pure function in `src/business/domain/scene-*.ts`, with a spec written the way `scene-layout.spec.ts` is: property tests that use the pipeline's own functions (the f02be9b lesson).
- **Verified live.** Every phase ends with real pages through `npm run scene:page`, looked at in the browser, at desktop and phone widths.

---

## Phase 1: the voice, directed

### 1.1 Delivery tags (writer → code → voice)

**Why.** Today every sentence is sent at `speed: 1` with a 0.35 s or 0.8 s pause (`scene.processor.ts:462-468`). The prompt asks for uniform 6–22-word sentences. The result is a metronome.

**Script.**
- `SceneBeat` gains `delivery`: `hook | explain | key | aside | question | recap`. The schema adds it to `beats[]`, and `mendScript` defaults an unknown value to `explain`.
- The page gains `mood`: `calm | bright | curious | serious | playful`, used by the sound design in phase 2.

**Prompt (`sceneWrite`).** Add a *rhythm* paragraph:
- open with a hook;
- ask a question before its answer;
- follow a long sentence with a short one;
- use contrasts and speak to "you";
- end with a payoff;
- use punctuation the voice can hear (question marks, dashes, the rare exclamation mark).

Keep the plain-words rule for the audience. Loosen "each sentence makes sense heard alone" to "no sentence depends on a word the ear missed". Tag every sentence.

**Code (`scene-voice.ts`, new, pure).** `deliveryPieces(beats) → { speed, pauseAfter }[]`:

| delivery | speed | pause after (s) |
|---|---|---|
| hook | 1.03 | 0.45 |
| explain | 1.00 | 0.35 |
| key | 0.93 | 0.70 |
| aside | 1.07 | 0.30 |
| question | 1.00 | 0.75 (time to think) |
| recap | 0.96 | 0.50 |

Adjustments:
- A `long` pause (idea change) adds 0.4 s.
- The sentence before a `key` gets at least 0.55 s, a beat of silence before the reveal.
- Clamp: speed 0.88–1.10, pause 0.2–1.4 s. Tests pin the table and the clamps.

**Processor.** `voice()` sends `pieces[i].speed` and `pauseAfter` from `deliveryPieces`, replacing the flat 1.0. The timing code already carries per-piece pauses (`pausesS`) and needs no change.

### 1.2 Choosing the voice

- `SCENE_VOICE` (a Kokoro voice or even blend, e.g. `af_heart` or `af_heart,af_bella`) overrides the upload home's default for Visualize only. The processor passes it as `voice`. Lectures are untouched.
- **`scripts/scene-voices.ts`** takes a document and page, or a stored scene. It writes one narration in a line-up of voices to `scene-out/voices/`:
  - Kokoro: `af_heart`, `af_bella`, `am_michael`, `am_fenrir`, `am_puck`, `bf_emma`, `af_heart,af_bella`;
  - Gemini voices, when a key is set.

  It also writes `index.html`, a blind test: the voices shuffled as A, B, C…, with the key revealed on a click. It can be published as a private artifact for demo users.

### 1.3 Gemini TTS pilot (`gemini-speech.adapter.ts`, new)

- It implements `SpeechPort`, with the request built from the research notes in §1.4. The key is `GEMINI_API_KEY`, falling back to `GOOGLE_GENERATIVE_AI_API_KEY`. The model is `GEMINI_TTS_MODEL` and the voice `GEMINI_TTS_VOICE`.
- **Direction.**
  - A page-level style note built from the page's `mood` and the voice's persona, e.g. "Read like a warm, lively teacher explaining to one student…".
  - Per-sentence colour from `delivery`, where the model follows inline direction.
- **Pauses.** Paragraph breaks carry the `long` pauses. Exact silences are not promised, and the aligner measures what was actually said.
- **Audio.** The response is WAV. Its `data` chunk is read as PCM, which gets:
  1. its duration from the byte count;
  2. an mp3 encoding with `@breezystack/lamejs`, a pure-JS LAME port, at 64 kbps mono, since there is no encoder on the server today;
  3. storage exactly as Kokoro's mp3 is stored.
- **Timing.** No word times come back, so the existing path runs: echogarden `dtw` (already on, `LECTURE_ALIGN_ENGINE` defaults to it), then `pinSpokenWords`, then `timeBeats`. The row's `timing` says `aligned`.
- **Selection.** `SCENE_VOICE_ENGINE=gemini` binds a new `SCENE_SPEECH` token to the Gemini adapter. Otherwise it is the upload home (Kokoro), as today. A long page is split at sentence boundaries under the model's input limit and joined, and piece starts are measured from the PCM lengths, so `sentenceWindows` works too.
- **Ledger.** `cost.ts` gains the Gemini TTS rates. The call is logged as `tts_visual`, costed from input tokens and audio tokens (or seconds). The audio key already carries voice and model, so a Gemini page never overwrites a Kokoro one.
- **Tests.**
  - A recorded response shape is parsed.
  - PCM to mp3 gives a playable file of the right duration.
  - A long page is split and rejoined.
  - An error is mapped the way the Modal adapter does it: a 4xx is permanent, a 5xx is retried.

  The live test waits for the key.

### 1.4 Gemini API facts (researched 2026-09-23 from ai.google.dev)

**Models.**
- `gemini-3.8-flash-tts` is GA (2026-09-22) and is Google's pick for quality and long-form narration. It is our default (`GEMINI_TTS_MODEL`).
- `gemini-3.8-flash-lite-tts` is GA, for cost.
- The 2.5 previews only serve projects that already used them.

**Request.** `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`.
- Body:
  - `{ model, store: false, input: [{ type: "user_input", content: [ …text items… ] }], response_format: { type: "audio" }, generation_config: { speech_config: [{ voice }] } }`.
  - Each text item is `{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }`.
  - One text item per sentence carries that sentence's delivery as its `style`.
- Response: `steps[].content[]` holds `{ type: "audio", mime_type: "audio/wav", data: base64 }`. The audio is WAV, 24 kHz mono s16le.
- `store: false` so Google keeps nothing. The legacy `generateContent` still works, and is kept behind `GEMINI_TTS_API=generate`.

**Direction.**
- 3.8 reads the text *verbatim*, so no "Say cheerfully:" preambles. Style belongs in `speech_metadata.style`, and Google suggests keeping it short.
- Inline sounds use angle brackets: `<short pause>`, `<long pause>`, `<breath>`, `<chuckle>`. A pause of 0.6 s or more becomes `<long pause>`, and 0.4–0.6 s becomes `<short pause>`.
- Capitalised words are stressed. Not used, so the aligner's text stays plain.

**Voices.** 30 prebuilt. For a narrator:
- Sulafat (Warm) is the default;
- Sadachbia (Lively), Achird (Friendly), Puck and Laomedeia (Upbeat) go in the line-up.

**Limits.**
- No word or character timestamps in any form, so the aligner is required.
- 8,192 input tokens, and about 655 s of audio per request. A page is 45–90 s, so it is one request.

**Price** (3.8 Flash). $0.50 per 1M text tokens in, $9 per 1M audio tokens out, at 25 audio tokens per second. That is about $0.0135 per audio minute, so **≈ $0.01–0.02 a page**.
- From 2027-01-01 the prices double: $1 in and $18 out, ≈ $0.027 per minute.
- Flash-Lite costs $6 per 1M audio tokens out, ≈ $0.009 per minute.

Streaming exists, but it isn't needed: the drawings take longer than the voice.

---

## Phase 2: sound design

Everything plays in the browser, on the audio's clock, with no files. The sounds are synthesised with WebAudio, so there is nothing to license, download or host, and a sound is a function of the scene and the time, like the picture.

### 2.1 What the server says (contract v4)

- `SceneDto.sound?: { mood: SceneMood }` comes from the writer's `mood`, later bounded by the document profile (phase 4).
- **Ambient sound.** A drawing can carry `ambience?: 'heartbeat' | 'bubbles' | 'water' | 'wind' | 'rain' | 'fire' | 'electric' | 'machine' | 'clock' | null`. The writer picks it in a new cast field, `sound`, only when the thing makes that sound in life. `mendScript` validates it against the palette.

### 2.2 What the client derives (`src/lib/scene/sound/cues.ts`, pure)

`cuesOf(scene) → Cue[]`, each `{ atMs, kind, gain, pan }`, placed exactly when the picture moves. It reuses the timeline constants (`STAGGER_MS`, `ENTER_MS`, `DRAW_MS`).

| event on the stage | cue |
|---|---|
| a drawing pops or grows in | `pop` (soft, pitched by size) |
| slides in | `swish` |
| wipes in | `wipe` |
| a title fades in | `shimmer` |
| a number (stat) arrives | `chime` |
| a keyword card arrives | `pop-soft` |
| something leaves | `whoosh-out` (quiet) |
| an arrow draws itself | `draw` |
| the voice points at a part | `tick` |
| a state appears / disappears | `shimmer` / `pluck-down` |
| zoom in | `whoosh-in` |
| a pulse (the writer's, not a filler) | `tap` |

- **Pan** follows the thing's x on the stage (±0.35).
- **Spacing.** Cues within 90 ms merge. At most 3 sound at once. The pulses that fill quiet stretches make no sound.

### 2.3 Synthesis (`src/lib/scene/sound/synth.ts`)

- Each effect is rendered once, per session, into an `AudioBuffer` with an `OfflineAudioContext`. Examples:
  - `pop`: a sine falling from 620 Hz to 280 Hz over 70 ms, plus a click;
  - `chime`: two sine partials a fifth apart, with an exponential tail;
  - `swish`/`whoosh`: bandpass-swept noise.
- **Ambient loops** are 3–4 s seamless loops rendered the same way:
  - heartbeat: two low thumps;
  - bubbles: random sine chirps;
  - rain and water: filtered noise textures;
  - clock: ticks.
- **Music bed.** One loop per mood, 16–24 s, rendered offline:
  - a warm pad (detuned saws through a low-pass) on a four-chord progression;
  - a soft pluck arpeggio for `bright`/`playful`/`curious`;
  - a slower, darker voicing for `serious`, and sparse for `calm`.

  The progression, key and tempo are seeded by the scene's title, so pages vary but each page always sounds the same.

### 2.4 The engine (`src/lib/scene/sound/engine.ts`)

`SceneSound(audioElement, scene, options)`:
- **Audio context.** One `AudioContext`, resumed on the first play gesture, as autoplay rules require.
- **Scheduling.** A look-ahead scheduler runs every 25 ms. It reads `audio.currentTime` and schedules cues in the next 120 ms on the context's clock. On `seeking`/`seeked` it forgets what was scheduled and starts from the new time. On pause it stops everything.
- **Playback rate.** Cue timing follows the rate, and the music drops out above 1.25×.
- **Music and ambience.** The music loop plays from offset `t mod L`, so a seek lands in the right place. Each ambient loop plays while its thing is on stage, faded with the thing's opacity and gained low.
- **Ducking.** The music sits at about -24 dB under the voice and rises about 6 dB in the pauses. The envelope comes from `scene.beats` (speech windows), via `setTargetAtTime`.
- **Controls.**
  - A "Sounds" switch in the player controls: effects, ambience and music together. It is on by default, and the choice is remembered (`localStorage`, try/catch).
  - The admin's silent run plays no sound.

### 2.5 Wiring

- `visual-pane.tsx` Player: the engine is created when the scene and `<audio>` are ready, destroyed with the player, and given the Sounds switch.
- **Checks.** Pure specs for `cuesOf`: every step and effect maps to one cue, merging works, filler pulses are silent. A browser check covers play, pause, seek, 2× and the switch. A listening pass follows.

---

## Phase 3: a readable stage (no overlapping text)

### 3.1 Labels leave the drawing (server, gate)

In `gateDrawing`, after framing, each part's label group is **lifted out**:
- its text, from `textOf`;
- its weight and size;
- its original text position;
- its **anchor**, the point on the part it names. This is the end of the leader line inside or nearest to the part's box, else the point of the part's box nearest the old label, else the box's centre.

The label group is then removed from the SVG. `GatedDrawing` gains `callouts: { part, text, anchor: [x, y], was: [x, y] }[]`. A label that cannot be lifted, with no text or an unknown structure, stays in the drawing as today.

**Part boxes, measured.**
- `renderSvg` takes extra variants in the same child process. Each variant is the drawing pruned to one part's group, plus `<defs>` and `<style>`, built from the parsed DOM. The child returns one ink box per variant.
- The drawing without labels is also rendered at 64 px across. The child returns a coarse alpha mask (48×48 bits), the **ink map**, so a label can sit in the drawing's empty space but never on its ink.

DeepSeek is still asked for labels. The drawings are better for it (2161504), and the lifted text and anchors are what the stage needs.

### 3.2 A text layer the server lays out

New `scene-labels.ts`, pure: `placeLabels(step, staging) → per thing: { part, lines, x, y, w, h, size, leader }[]`, in stage units, stored per step on `ScenePlaceDto.labels`.

- **Size.** `LABEL_SIZE` is clamp(slot height × 0.045, 26, 34) in stage units, measured with `measureText` at weight 600, which is what the stage renders. One or two lines.
- **Room.** When a drawing has callouts, `fitInSlot` leaves a **gutter** beside it. Wide slots get it left and right, tall slots top and bottom, sized to the widest label plus leader room, and at most 24% of the slot. The drawing is scaled into what remains.
- **Candidates, in order:**
  1. The artist's own spot, mapped to the stage, if it is clear of everything.
  2. A **callout column** in the gutter on the anchor's side. Labels are sorted by anchor y, which prevents leaders from crossing, then packed in one dimension with a minimum gap.
  3. Free spots around the anchor, in 8 directions at 3 radii, on empty cells of the ink map.
- **Obstacles:**
  - every other text box: captions, stats, words, other labels, arrow pills;
  - every drawing's ink cells;
  - arrow paths, as thick polylines;
  - the stage edge.
- **Leaders.** A straight line from the label's nearest edge to the anchor. Two leaders that cross are fixed by swapping their slots.

**Client.** The labels are drawn in the thing's `words` layer, which is in stage units and already moves with the thing. Label visibility (hidden until pointed at) moves from drawing groups to these elements: `groupsAt` becomes `labelsAt` for labels, and keeps states as they are.

### 3.3 Arrow labels placed and measured

- Pills are measured with `measureText` (today they are estimated from a character count at 0.58 em).
- They are placed by the same solver, on candidates along the arrow (t = 0.5, 0.4, 0.6, 0.3, 0.7) and on both sides.
- Each is stored per step as an offset from the arrow's midpoint in the final layout: `stagings[s].pills[k][arrowId]`. The client keeps the pill on the moving arrow during transitions.

### 3.4 The frame audit (the test that was missing)

- `auditFrame(scene, staging, k) → Collision[]` reports:
  - text on text;
  - text on another thing's ink;
  - text on an arrow;
  - text off the stage.
- It is checked **at every step and through every transition**, by sampling `framesAt` every 50 ms, so the client's timeline logic is mirrored.
- The processor logs the audit for every page.
- `scene-labels.spec.ts` runs property tests over random casts, layouts and label sets, asserting zero collisions after placement.

### 3.5 Legibility on every screen

- Text is never set under the size floor in stage units. The client measures the stage's pixels per unit.
- On a **narrow stage** (under 520 px), the camera *follows* instead of drifting. It zooms onto the thing the voice is on (the newest arrival, the target of the last point or pulse, else the step's focus), so that thing fills about 88% of the view. The text layer is inside the camera, so labels grow with it.
- This is a pure change to `cameraAt(… , follow)`, with its own checks.

### 3.6 Choreography and motion hierarchy (client timeline)

- **Exits clear the stage first.** In a step that both removes and adds, newcomers start at `atMs + EXIT_MS × 0.7`. Moves start with the exits. Arrow draws follow the later end.
- **Calm neighbours.** A drawing that is not the focus runs its own animation at 0.45×. The time warp is a pure integral over steps, `localTime(t) = Σ rate × duration`, so pause and seek stay exact. The focus and anything just pointed at run at 1×.

---

## Phase 4: teaching by subject

### 4.1 The document profile

- **Storage.** Table `document_profiles` (migration `0054`):
  - key: `(document_id, content_version)`, unique;
  - fields: `subject`, `kind`, `level`, `tone`, `formats` (JSON), `style` (JSON: palette name, line weight, detail), `voice` (JSON: persona, pace), `mood`, `story` (bool), `status`, `error`, timestamps.
- **Generation.** New LLM task `scene_profile` on `gpt-4.1-mini`, with a strict schema. Its input:
  - the title;
  - the chapter titles, from topics;
  - about 6k characters sampled from the first content pages and two pages further in.

  It costs about $0.001 per document.
- **When.**
  - The scene processor calls `ensureProfile(documentId)` before writing.
  - The first caller inserts a `making` row (unique key) and writes the profile.
  - Others wait up to 20 s, then use the default (explainer, as today).
- **Admin override.** `PUT /documents/:id/visuals/profile` (admin only), plus a small editor among the pane's admin tools.
- **Downstream use.**
  - `formats` bound what the writer may use.
  - `style` goes at the head of every drawing prompt, which also helps DeepSeek's cache.
  - `voice` sets the persona line for Gemini and the pace bias for Kokoro.
  - `mood` bounds the music.

### 4.2 Maths the writer can see

`noteProse` turns a maths block into "(an equation: …)" cut at 120 characters (`follow.ts:660`). Scenes get their own `sceneProse(blocks)`, which keeps display maths as `$$…$$` and inline maths as `$…$`, whole. Other callers of `noteProse` are unchanged.

### 4.3 Code-drawn things

These are drawings made by code. They reuse the drawing contract, so the client needs almost no change: a code-drawn thing *is* a `drawing` DTO, with `svg`, `aspect`, `parts`, `states` and `hidden`, plus `source: 'math' | 'plot' | 'quote'` for styling. The writer gives the content and code draws it.

- **`math`**, a worked block of one to six lines.
  - **Writer fields.** `lines: [{ latex, check }]`. Terms are marked with `\term{name}{…}`. `check` is a plain-syntax numeric equality ("50/0.1 = 500") or null.
  - **Rendering.** Server-side MathJax (TeX → SVG, paths only, `fontCache: 'local'`):
    - the lines are joined in `aligned` at the first top-level `=`;
    - each line is wrapped in `\cssId{line-k}{…}`, and each term in `\cssId{term-slug}{…}`;
    - colour is `currentColor`, set to the stage ink.
  - **Reveal and pointing.** Lines are **states**, revealed by `show` effects. Code fills in any line the writer never reveals: line k appears on its first spoken mention, or k beats after the block enters. Terms are **parts**, so pointing at a term tints it with the accent colour and rings it.
  - **Checks.** `check` is evaluated with `mathjs` (a safe parser, no code evaluation). A false equality is a *problem* for the one repair round, so a wrong sum never reaches the screen.
- **`plot`**, a graph drawn by code.
  - `{ fn, x: [min, max], y?: [min, max], points?: [{ x, name }], xLabel, yLabel }`.
  - `fn` is compiled by `mathjs` and sampled at 200 points, with asymptotes clipped.
  - Axes and ticks come from nice numbers. The curve and each point are parts, and the curve draws itself on entry (a CSS dash animation driven by the stage's clock).
- **`quote`**, the text's own words.
  - `{ text, parts: [{ name, phrase, note }] }`. The text must be verbatim from the page, which is checked; otherwise it is refused and becomes a problem.
  - It is typeset in the stage font at a generous size, with measured line breaks and a quote rule. Each phrase is a `<tspan>` group, as a part.
  - **Annotations** are callouts whose text is the `note` ("metaphor: time as a thief"), placed by the phase 3 solver in the margin.
  - A pointed phrase is highlighted: a rounded accent band behind the phrase instead of a ring (`source: 'quote'`).
- **`stack` layout.** One to four things in a column, full width, with heights shared by content. It is used for maths and quotes; `focus` holds maths plus a drawing.

### 4.4 Formats in the writer

- The writer is told the profile and the formats allowed on this page, and gets only those formats' sections of guidance:
  - **explainer**: today's prompt;
  - **maths**:
    - the board rules: keep the working on screen;
    - say each line in words (the stage shows the symbols);
    - `\term` for what the voice points at;
    - a `check` for every numeric line;
    - 200–400 words;
    - `key` delivery on results;
  - **close reading**:
    - quote verbatim;
    - annotate with notes;
    - use pictures only as motifs;
    - `serious` or `calm` mood unless the text is comic.
- A format is chosen per page, and a page may mix them: a biology page opens a `math` thing for its one calculation.

### 4.5 Later formats (4b)

- `timeline`: an axis with events as parts.
- `chart`: bars or lines from the page's numbers.
- Argument maps: `words` cards and arrows in `hub`/`row` layouts. Mostly prompt work.

---

## Phase 5: stories that continue

### 5.1 The story bible

- **Storage.** Table `story_bibles` (migration `0055`), keyed by document and content version, with JSON for:
  - `characters`: id, name, aliases, role, look (palette, build, hair, clothing, marks), personality, relationships, arc;
  - `places`;
  - `objects`;
  - `pages`: per page, a summary, who is present, their mood, and where.
- **Building it.**
  - Built when the profile says `story: true` and Visualize is first asked for.
  - Map-reduce over chapters with `gpt-4.1-mini`: each chapter's text is extracted, then merged by id with alias resolution.
  - Costs a few cents a book.
  - Pages wait for it inside their job.

### 5.2 Characters and places drawn once

- **Storage.** Table `visual_assets`: document, key (`character:ralph`, `place:beach`), SVG, parts, states, viewBox, aspect and status. The SVG is in the bucket beside the scenes.
- **Character sheets.**
  - Drawn by DeepSeek with a character-sheet prompt:
    - the look from the bible;
    - parts `head`, `eyes`, `mouth`, `body`, `arms`, `legs`;
    - expression states `happy`, `sad`, `angry`, `afraid`, `surprised`, `thinking`;
    - pose states `walk`, `point`.
  - Passed through the same gate.
  - Drawn once per document and reused by every page. Places become **backdrops**: a new full-stage layer behind the things, at low contrast.
- **Writer cast kinds.** The writer refers to assets by id, and the processor draws only what is missing:
  - `character` (`ref`, `state`);
  - `place` (`ref`), as a backdrop.

### 5.3 Continuity rules (compose, pure)

- **Screen side.** A character keeps its side: order of first appearance in the book, alternating left and right. The slot order in each layout honours it, the 180° rule.
- **Mood.** A character's mood carries over. Its starting state is the bible's entry for the previous page, unless the writer shows another.
- **"Previously".** When the page's first cast overlaps the previous page's, a 1.5–2 s opening step brings them back in their last states before the narration starts.

### 5.4 Build-up and dialogue

- **Introductions.** A character's first appearance in the book gets an introduction step: a name card and two or three trait tags as callouts.
- **"Who's who".** An endpoint plus a pane panel. The sheets are drawn from the bible's relationships, as `hub`/arrows.
- **Speech bubbles.** Effect `say`: when the narration quotes a character, a bubble is drawn by the stage at the character's `head` part, sized and placed by the phase 3 solver.
- **Character voices.**
  - A per-piece `voice` in `SpeechPort.pieces`.
  - Kokoro needs `voice.py` to accept a voice per piece.
  - Gemini uses multi-speaker for two voices, or separate calls otherwise.
  - Voices are assigned in the bible, so a character always sounds the same.

---

## Phase 6: the yardstick (woven through every phase)

- **`scripts/scene-bench.ts`** runs a fixed list of about 20 pages from the local database across subjects (renal, Alzheimer's and microbiology today, plus maths and literature documents to be added). It writes, for each run:
  - a contact sheet of every step, in both stagings;
  - the frame audit;
  - text size in pixels at 390 / 560 / 1440 widths;
  - timing coverage;
  - cost;
  - an HTML gallery that compares two runs.
- **Pass bar for a phase.** Zero audit collisions, no text under 14 px at 560 px, and no page regressions.

---

## Order of work

1. **Phase 1:** delivery tags, the voice line-up, and the Gemini adapter (live test when the key arrives).
2. **Phase 2:** sound design.
3. **Phase 3:** the readable stage. Then bump to `scene-2`, re-run the bench, and ship 1–3 together.
4. **Phase 4:** the profile, maths (`math`, `plot`, `stack`), close reading (`quote`, annotations).
5. **Phase 5:** the story bible, sheets, continuity, dialogue and voices.

Each phase is committed on `visualize-next` in both repos and verified locally. Nothing is pushed without Richard's word.

## Costs, per page unless noted

| item | cost |
|---|---|
| today (writer + drawings + Kokoro) | ≈ $0.035 |
| delivery tags | $0 (a few more output tokens) |
| sound design | $0 (client-side synthesis) |
| label lifting and placement | $0 (code; ~1 s of rendering) |
| profile | ≈ $0.001 per document |
| maths / plot / quote rendering | $0 (code) |
| story bible | ≈ $0.02–0.10 per book |
| character sheets | ≈ $0.004 each, once per book |
| Gemini TTS pilot (3.8 Flash) | ≈ $0.01–0.02 extra per page (≈ $0.02–0.04 from 2027) |

## Risks and open questions

- **MathJax on the worker.** `mathjax-full` is large, about 30 MB installed. We accept it for the worker image, or use MathJax 4's `@mathjax/src` if it is leaner. Render time is milliseconds.
- **Label lifting quality** depends on the artist's structure (a label group holding text plus a leader). Where it fails, the label stays in the drawing, no worse than today. The audit will show how often that happens.
- **Follow-cam on phones** trades the whole picture for a readable part. It is used under 520 px only, and the full view comes back in full screen.
- **Procedural music** can sound cheap. The bed is kept sparse and quiet. If it doesn't hold up, licensed stems can replace a mood without any contract change.
- **Gemini timing** relies on the aligner (echogarden `dtw`, about 8 s a page on the worker). If alignment fails, the estimate inside each sentence remains.

# Studio and Visualize: better explainer videos

A plan only; no code has been changed. Written 2026-09-30 on branch `studio` (server HEAD 672af96, client `studio`).
It covers Richard's nine asks: voice pacing, themes, motion, build-ups, story clips, sound, documents, audience and uniqueness.

---

## Summary

1. **Pace is measured, then corrected in code.** Each audience gets a target in words a minute. After voicing, every sentence's real rate is measured from the word times we already have. Rates that are off are fixed with a small time-stretch (±12 %) and pause shaping. Nothing is voiced again.
2. **Engines differ.** Kokoro and Cartesia take a rate. Gemini, which is the default, ignores it, so it gets pace words plus that code correction. OpenAI currently gets no pacing at all.
3. **Viewers can change the speed.** The Studio player gets a speed menu from 0.75× to 1.5× (the film clock already supports it). The Visualize player gets 0.75× and 0.9×.
4. **Themes.** Six named themes are built from tokens, and two of them are dark. They are chosen by subject and audience, or by the maker with one "Look" row in the brief. Every theme passes contrast and colour-blind checks run by code. AI drawings are recoloured by mapping the house palette to the theme's tokens.
5. **A motion grammar.** The camera drifts, layers move against each other, and drawings stay a little alive, so the picture is never static. Everything that appears is tied to the words.
6. **Text holds still while it is read.** Each piece of text gets a reading time for its audience. Until that time is up, nothing moves it or replaces it.
7. **Continuous build.** One diagram grows across a whole section. Things already placed never move, earlier parts fade back, and the section ends on a wide view of the whole diagram.
8. **New transitions:** a match cut, a morph of the same thing into its next form, and a zoom that goes through a part into the next scene. The joins are chosen by code, not by a model.
9. **Story clips.** An explainer outline may mark one or two scenes as `clip`. Each clip is a short acted scene of 6–20 s, made with the Studio story pipeline: kit cast, pack sets, no table read, no rewrites. Each clip costs about 2–4 cents, and the people in it come back in later clips.
10. **Sound.** Explainers get their own sound kit, built on S10 and S11: reveal pops, pen and paper sounds, whooshes timed to their transitions, a tuned chime on key ideas, and a quiet music bed that ducks under the voice.
11. **Documents in the chat.** The composer gets an attach button. An uploaded file shows as a document card in the chat, followed by a "Choose what to explain" card with chapter chips and a page range. The chosen pages are condensed into teacher's notes, which become the outline. A big selection is offered as a series of episodes.
12. **Audience profile.** The maker gives an age band, what the viewer already knows, their goal and their language level, in one chip question, or it is inferred from the idea or the document. The profile drives words, pace, density, motion, text size and understanding checks. Readability is checked by code.
13. **What makes it ours.** In order of priority: pause-and-think checkpoints inside the video, idea marks with "back one idea", end recap cards with "teach it back", a recurring host character, and "what next?" chips that make the next episode. Later come analogy worlds, zooms across scales and draw-along boards.
14. **Cost.** A 3-minute explainer costs about $0.25–0.55 today. Afterwards it costs about $0.25–0.60 without clips and about $0.30–0.70 with two clips. Continuous builds save drawings, and the new work in motion, sound and themes runs in the browser for free.
15. **Roadmap.** Phases E0–E10, about 6–8 weeks for one developer, or 3–4 weeks with parallel agents. E0 (1–2 days) is measurement plus ten quick wins.

---

## 0. How explainers work today (a short map)

**Two entry points share one engine.**
- **Visualize (book pages).** `SceneProcessor.write` in `src/pipeline/processors/scene.processor.ts:1413` calls `llm.sceneScript`:
  - task `scene_write`, run on `deepseek:deepseek-flash` with thinking off;
  - prompt `PROMPTS.sceneWrite` in `src/web/adapters/prompts.ts:1319-1837`;
  - the prompt is given the chapter's teacher's notes (`lesson-notes.ts`, task `scene_notes`).
- **Studio explainers.** `writeExplainerScene` (`studio.processor.ts:1956-2066`) reuses that same writer. It passes the outline scene's `teach` as the material and its `points` as notes, and describes the scene with `describeScene(stage, seconds)` from `studio-words.ts:245`.
  - The resulting `ExplainerSheet` is `{kind:'explainer', title, transition, draft: SceneScriptDraft}` (`studio.ts:1230`).
  - `checkExplainer` (`studio-check.ts:3383`) runs `mendScript`, sends the sheet back once, then `repairExplainer` fixes what is left without telling anyone.

**The draft (`scene-script.ts:825-913`).**
- `beats[]` are sentences. Each has `say`, `pause`, `delivery` (hook, explain, key, aside, question or recap) and `music`.
- `cast[]` is one of: drawing, stat, words, math, plot, quote, timeline, chart, character, person or place.
- `steps[]` each have `beat`, `phrase`, `layout` (one, row, grid, compare, hub, cycle, focus or stack), `show`, `arrows` and `effects` (point, show, hide, pulse, zoom and others).
- Limits: `MAX_ON_STAGE` 5, `MAX_ARROWS` 6, `MAX_DRAWINGS` 8.

**Code that makes the page move** (`mendScript`, all code):
- `buildUp` (:3199), with `WORDS_A_STAGE` 30;
- `showSpokenLists` / `listsIn` (:2969 / :2871);
- `flowOrder` (:3084);
- `zoomsOnWhatIsSaid` (:3150).

The draft is sent back once for `quietStretches` (`STILL_WORDS` 40) or `fewStageChanges`. After voicing, `fillQuiet` (`scene-compose.ts:4707`, `FILL_EVERY_MS` 6500) points at or zooms in on what is being said. `rhythmOf` and `wordsPerMinute` are only logged.

**Drawings.**
- Most drawings are animated SVG written by DeepSeek (`scene_draw`, `PROMPTS.sceneDraw` at `prompts.ts:2415`), with up to 2 tries and a code gate. There is no vision judge for explainer drawings.
- Charts, plots, timelines, maths and quotes are drawn by code (`scene-chart.ts`, `scene-plot.ts`, `scene-timeline.ts`).
- People are drawn with the figure kit.

**Voice.**
- `ScenePipeline.voice()` (`scene.processor.ts:1790-2067`) calls `deliveryPieces()` (`scene-voice.ts:88`), which turns delivery tags into a speed and a pause, scaled by the stage recipe.
- Gemini gets one request per run of one voice. Silences are found in the audio and lengthened by code (`gemini-speech.adapter.ts` `voiceRuns`, `sentenceGaps`, `pausedRun`).
- Word times come from the aligner.

**Client.**
- `src/lib/scene/timeline.ts` (pure state at time t) and `stage.ts` (the DOM) play both Visualize pages and Studio films.
- Studio films are cut together by `edit.ts` (cut, dissolve or dip, with handles) and clocked by `film-clock.ts`.
- Sound comes from `src/lib/scene/sound/` (`cues.ts`, `engine.ts`, `conductor.ts`, `score.ts`).

**Surprises found while reading.** Each is used below.
- **Explainers have no controls in Studio.** `production.tsx:255` hides the Choices for explainers, `controlWords` is skipped for them (`studio-words.ts:42`), and `styled()`/`energyOf` apply to stories only. The brief's `pace` and `style` do nothing for an explainer.
- **The voice gets no audience pace.** For Studio, the voice path receives `stage: null`, so a "young children" explainer is voiced at the adult rate. The writer does get the stage.
- **Per-sentence speed only works on Kokoro and Cartesia.**
  - Gemini ignores `speed` (adapter L99).
  - ElevenLabs takes no speed (L103).
  - OpenAI drops both speed and `instructions` for scenes (`openai-voice.adapters.ts:111`).
- **Pauses behave inconsistently.**
  - Gemini's gap search never shortens the voice's own long gaps, and adds no pause when it cannot find a gap.
  - Kokoro caps a pause at 3 s (`voice.py` `PAUSE_LIMIT`), while `HOLD_LIMIT_S` is now 20.
- **The speed-up figures disagree.**
  - Outline `teach` is written at about 3 words a second.
  - The word budget uses 2.4 (`WORDS_A_SECOND`, `studio.ts:379`).
  - The "fuller" check uses ×1.4, the cap uses ×1.25, and the length warning uses ×1.7.
  - The prompt says "never thirty words with nothing new", while the send-back uses 40.
- **There is no reading-time rule for on-screen text anywhere.** Labels sit inside the drawing's float bob (`timeline.ts:585`), so they move while they are being read. On narrow screens the follow camera zooms again on every point.
- **Colours are hardcoded.** They live in `theme.ts` (client) and again in `scene-compose.ts:4511` (`STAGE_PAINT`), `scene-chart.ts`, `scene-plot.ts`, `scene-timeline.ts` and the drawing prompt's palette.
  - Charts have a single bar colour.
  - The player chrome is violet (`globals.css`), which clashes with the coral stage accent.
- **The Studio explainer bible says "no characters and no sets"** (`studio-prompts.ts:451`). Scene sheets already dispatch on `kind` (`sheetOf`), but about a dozen show-level branches test `brief.format`, so story clips need those branches changed.
- **Sound for explainers.** S10 music scoring is skipped for explainers (`studio.service.ts`), and S11's beds and foley need `setting.full`, which explainers never get. Explainers keep the synthesised interface sounds.
- **Documents.**
  - Studio accepts no files. Pasting 900 characters or more silently becomes `brief.source`, capped at 12,000 characters.
  - Chapter detection is an LLM guess over a digest. PDF bookmarks are never read.
- **Audience.**
  - `professional` cannot be reached from Studio.
  - No readability check runs on explainers. `plainWordsProblems` exists, but only the lecture writer uses it.
  - The `levelIn` patterns (`scene-stage.ts`) lean on West African and UK terms (JSS, WAEC, Nigerian Law School). They need widening for a global product.
- **Cost logging.** Studio explainer calls are recorded under `studio_write`, although the model used is `scene_write`'s.

---

## Ground rules for this plan

- **Code before models.** Every new rule is a code check or a code fix. Where a model call is unavoidable, it goes into the single send-back that already exists. No new rewrite rounds: Richard cut them on 2026-09-30.
- **DeepSeek writes and draws. Google provides the voice and the picture judge. Never gpt-4.1.** Kokoro remains the cheap fallback voice.
- **Fixes stay silent.** A check never blocks the maker and never shows them a warning.
- **Less is more in the interface.** Use familiar patterns (the YouTube speed menu, ChatGPT's attach button, Google Docs-style chips), with one primary action per card.
- **Global by default.** Examples, analogies and names vary. A region appears only when the maker's story or document names it.
- **Clarity is the floor** (see films-must-be-clear). Movement and effects never compete with the idea being taught.

---

## Research digest (the craft, in brief)

**What good explainer channels do.**
- **Kurzgesagt:**
  - It storyboards the whole script before any animation, planning visual metaphors and transitions scene by scene.
  - The voice-over sets the timing for the animation.
  - Everything on screen moves a little, but only one thing asks for attention at a time.
- **3Blue1Brown (Manim):**
  - One object transforms continuously instead of being replaced. An equation morphs into its next form, and a grid bends in place.
  - Continuity of identity is the teaching device.
- **TED-Ed and Khan Academy:**
  - A single voice, with the drawing appearing as it is spoken.
  - Guo et al.'s study of 6.9 million edX sessions found engagement fell sharply after about 6 minutes.
  - Khan-style drawing that appears as it is spoken held viewers longer than slides.
  - Speakers who talked fairly quickly and with enthusiasm held attention better.
- **Vox:** uses real-world anchors (a map, a chart, a document) and animated highlighting of the evidence.

**Mayer's multimedia principles.**
- **Signalling:** cues that point at the key idea help.
- **Segmenting:** lessons split into learner-paced segments improve transfer. The reported effect is large (about d≈0.98 in early studies, and consistent across 14 of 14 tests).
- **Redundancy:** graphics with narration beat graphics with narration plus the same text on screen.
- **Coherence:** interesting but irrelevant extras ("seductive details") hurt learning, with a large median effect.
- **Modality:** narration with pictures beats on-screen text with pictures.
- **Pacing and learner control:** letting the learner pause and step through segments helps.

**Reading speed for on-screen text.**
- Children's subtitle guidance for ages 5–13 is about 160–180 words a minute.
- Netflix caps children's content at about 17 characters a second (~170 wpm) and adults' at 20 (~200 wpm).
- Readers reach caption speed (~150 wpm) only around the fourth grade. Adults read about 250 wpm.
- Younger readers need much more time.

**Narration speed.**
- Reading aloud to children works best at about 100–125 wpm. Understanding drops above about 125.
- For beginners and new vocabulary, 110–130 wpm.
- Educational narration for adults: 130–160 wpm, slower for dense or new material.
- Our own teacher's-notes research picked about 145 wpm on new ideas and about 165 on recaps.

**Progressive disclosure and build-up.**
- In studies of whiteboard animation, the gradual drawing guides attention to what is being drawn right now. It improves recall and enjoyment over slides, audio or text alone (Türkay; a 2023 Heliyon study).
- Start with the big picture, then add detail as it is needed.

**Motion design.**
- Ease out for things entering, ease in for things leaving, and ease in-out for moves.
- Staging directs attention to one thing at a time.
- Continuity: things persist and travel, rather than blinking in and out.
- Most interface motion lasts 200–500 ms.
- Aim for "never static, never frantic": a slow ambient layer under brief, meaningful accents.

**Colour and accessibility.**
- WCAG 2.x asks for 4.5:1 contrast for body text and 3:1 for large text and meaningful graphics (SC 1.4.11).
- The Okabe–Ito palette stays distinguishable across the common colour-vision deficiencies.
- Blue with orange is the safest pairing.
- Contrast and colour-blind safety are separate checks, and both are needed.

**Stories and characters.**
- Worked examples reduce cognitive load for novices.
- A familiar story frame around a worked example lowers load further.
- Case vignettes (a patient, a shopkeeper) anchor abstract rules.

**Sound design.**
- Effects accompany individual actions, and music sets rhythm and tone.
- Levels: voice as the anchor, effects well below it, and music ducked a long way under speech but brought up in gaps.
- Ducking is the single biggest fix for amateur-sounding audio.
- Whooshes should sit back and not fight the music.

Sources are listed at the end.

---

## Ask 1: Voice pacing ("sometimes too slow… it depends")

### Today

**Per-sentence pace and pause** come from `deliveryPieces()` (`scene-voice.ts:88-129`) and the `DELIVERY` table (:28):

| Delivery | Speed | Pause (s) |
|---|---|---|
| hook | 1.03 | 0.45 |
| explain | 1 | 0.35 |
| key | 0.93 | 0.7 |
| aside | 1.07 | 0.3 |
| question | 1 | 0.75 |
| recap | 0.96 | 0.5 |

- Extra pause: +0.4 s for `IDEA_CHANGE_S`, `BEFORE_KEY_S` 0.55, and `TERM_LANDS_S` 0.7 (`scene.processor.ts:258`).
- Clamps: `SPEED_RANGE` [0.88, 1.1] and `PAUSE_RANGE` [0.2, 1.4].
- Stage multipliers (`STAGE_RECIPES`): early 0.9 / 1.3, middle 0.95 / 1.1, higher 1 / 1. Studio's voice path receives `stage: null`, so none of this applies.

**Engines:**

| Engine | Takes a rate? | How pace reaches it today |
|---|---|---|
| Kokoro (`modal-speech.adapter.ts`, `voice.py`) | Yes: per-piece `speed`, 0.5–2.0 | Honoured. Pauses are inserted, up to 3 s (`PAUSE_LIMIT`). |
| Cartesia sonic-3.6 | Yes: `<speed ratio>` tags, 0.6–1.5 | Honoured. |
| Gemini 3.8 Flash TTS (default) | No numeric rate | Words in `speech_metadata.style` (`MOOD_STYLE` + `DELIVERY_STYLE`). Pauses come from gaps found in the audio. |
| ElevenLabs eleven_v3 (dialogue) | Not used here | At most 2 audio tags. `withSilences` lengthens and shortens pauses. |
| OpenAI gpt-4o-mini-tts | Takes `instructions`; tts-1 takes `speed` 0.25–4 | **Nothing:** pieces are spoken plain (L111). |

**Measurement.** `wordsPerMinute()` (`lesson-notes.ts:703`) is logged only. Nothing checks the rate after voicing.

**Players.**
- Visualize: `SPEEDS [1, 1.25, 1.5, 2]` (`visual-pane.tsx:744`), nothing slower than 1×.
- Studio: no speed control, although `FilmClock.playbackRate` exists (`film-clock.ts:195`).

**No time-stretch exists anywhere.** `@echogarden/rubberband-wasm` is present only as a transitive dependency.

### What's wrong

- **"Too slow" has several causes that stack up.**
  - Gemini reads "calm and unhurried" plus "narration" style notes slowly, around 120–135 wpm in our logs of past pages (to be confirmed in E0).
  - The pauses add up: the delivery pause, the idea change, the pause before a key idea, and the term landing, each multiplied by the stage.
  - The gap search can leave Gemini's own long gaps in place.
- **"It depends" is also true.**
  - A child needs slower.
  - A recap should be quicker.
  - A dense sentence with a number and a new term needs slower.
  - A viewer revising for an exam wants quicker.
- There is no single target, and no loop that measures and corrects the rate.

### Design

**1. A target rate per sentence**, computed in a new `scene-pace.ts` in the server domain as a pure function:

```
targetWpm(sentence) = BASE[band] × PRIOR[prior] × DENSITY(sentence) × DELIVERY_RATE[delivery] × MAKER[pace]
```

- **`BASE[band]`, from the audience profile (Ask 8):**

  | Band | wpm |
  |---|---|
  | early-years (4–6) | 110 |
  | primary-lower (6–8) | 120 |
  | primary-upper (8–11) | 132 |
  | secondary-lower (11–14) | 142 |
  | secondary-upper (14–18) | 150 |
  | university | 155 |
  | professional | 160 |
  | general adult | 155 |

- **`PRIOR`:** new 0.95, some 1, revising 1.08.
- **`DENSITY`:**
  - −6 % for each new term in the sentence (the notes' `newHere`, or a term index hit);
  - −5 % for a number with a unit, or a formula;
  - −4 % for a sentence over the band's word cap;
  - clamped to ≥ 0.85.
- **`DELIVERY_RATE`:** hook 1.04, explain 1, key 0.94, aside 1.08, question 1, recap 1.07, example 1.02 (a new delivery tag, optional).
- **`MAKER[pace]`:** relaxed 0.93, natural 1, brisk 1.08. This reuses Studio's `pace` control (gentle, lively, snappy), which is now shown for explainers too.
- **Language learner** (Ask 8): ×0.9.

`deliveryPieces()` keeps its shape but returns `{targetWpm, pauseAfter}`. `speed` is derived from targetWpm ÷ the voice's calibrated natural rate (item 3).

**2. Pause shaping, one function instead of stacked additions** (`shapePauses` in `scene-pace.ts`):
- Every reason for a pause proposes a length: sentence end, idea change, before a key idea, a term landing, a question, a hold. The pause taken is the **largest** proposal plus 0.15 s when two or more agree. Pauses are no longer summed.
- **Per-band limits:**
  - question pauses 1.2–2.5 s for children, 0.8–1.2 s for adults;
  - ordinary sentence ends 0.25–0.45 s;
  - idea changes 0.5–0.9 s.
- **Silence budget:** total silence ≤ 22 % of the scene for adults and ≤ 30 % for young children, not counting holds for action or clips. Anything over the budget is shaved proportionally from the ordinary pauses first.
- **Inside a sentence:** gaps longer than 600 ms that the voice made itself are trimmed to 250 ms, for Gemini as well. Port `withSilences`' shortening (`SILENT_SHARE`, `KEEP_S`) into the Gemini path.
- **A pause the gap search misses** is inserted at the aligner's end-of-sentence time. Today it is dropped.
- **Kokoro:** `PAUSE_LIMIT` is raised to match `HOLD_LIMIT_S`, or holds longer than 3 s are padded by the server after voicing.

**3. Calibrate each voice once.**
- A `voice:calibrate` script voices a fixed 12-sentence neutral passage per engine and voice, measures the natural wpm and stores it in `app_settings.voice_rates` (JSON by engine and voice).
- For Gemini, it also measures the effect of 3 pace words ("brisk and clear", "natural", "unhurried") and stores those rates. A pace word can then be picked by target, not by feel.
- Cost: pennies, run once when a voice is added.

**4. Measure, then correct in code (no second voicing).**
- After alignment, `measuredWpm` per sentence = words ÷ (last word end − first word start).
- **Per sentence:** ratio = measured ÷ target.
  - Within ±6 %: leave it alone.
  - Between ±6 % and ±14 %: time-stretch that sentence's audio by the ratio, clamped to [0.88, 1.14]. Use Rubber Band (WASM, R3 "finer" engine, formant-preserving) on the worker. Word times scale with it.
  - Beyond ±14 % (rare): stretch by the limit and log it. On Kokoro or Cartesia the next page's `speed` is nudged; on Gemini the next request's pace word.
- **Engine by engine:**
  - Kokoro and Cartesia: the rate is sent up front (`speed` = target ÷ calibrated), so stretching is rarely needed.
  - **Gemini:** the pace word is chosen per voice run from the calibrated table. Code then stretches each sentence into its band. This is the main way pace works on Gemini.
  - ElevenLabs: its `speed` voice setting (0.7–1.2) is used where the model accepts it; otherwise stretch.
  - OpenAI: pass `instructions` ("Speak at a natural, clear pace; slightly slower on new terms") and keep the stretch.
- The stretch happens once, inside `voice()`. The stored scene audio is the corrected audio, so the player does nothing special.

**5. Viewer control (a familiar speed menu).**
- **Studio player:** a gear-style menu item "Speed" with 0.75, 0.9, 1, 1.25 and 1.5, using `FilmClock.playbackRate` and setting `preservesPitch = true` on the decks. The choice is remembered per viewer in `localStorage`. Music already stops above 1.25×.
- **Visualize:** the cycle becomes `[0.75, 0.9, 1, 1.25, 1.5, 2]`.
- Motion follows the clock, so everything stays in sync.

**6. Maker control, with no new widget.**
- The brief card's existing Pace chips (gentle, lively, snappy) are shown for explainers. They set `MAKER[pace]` and the motion factor (Ask 3).
- **In chat:** "the voice is a bit slow" becomes a producer action `repace` with delta +6 %. It re-stretches the cached audio (it does not re-voice) and re-times the scene. Cost: CPU only.

### Checks and tests

**Unit tests.**
- `targetWpm` is monotonic by band.
- DENSITY never goes below 0.85.
- `shapePauses` takes the largest proposal, not the sum, and keeps within the silence budget.
- The stretch ratio clamps.
- Word times scale correctly after a stretch.

**Adapter tests.**
- OpenAI sends `instructions`.
- Gemini picks the pace word from the calibrated table.
- The Gemini path trims long gaps inside a sentence.

**Bench: `npm run pace:bench`.** It voices 6 fixture scenes (a kids' science scene, a teen history scene, a university economics scene, and others) on Kokoro locally, where it is free, and on Gemini only with Richard's OK. It reports:
- measured wpm per sentence;
- silence share;
- longest pause.

**Pass bar:**
- ≥ 90 % of sentences within ±8 % of target;
- no unmarked silence over 1.6 s;
- silence share within budget.

**Listening A/B:** Richard hears the same scene before and after (3 scenes).

### Effort
3–4 days: pace module and shaping 1.5 d, stretch plus calibration 1 d, player menus 0.5 d, adapters 0.5 d.

---

## Ask 2: Themes beyond the warm paper look

### Today

**Where the colours live.**
- Client `src/lib/scene/theme.ts`: paper `#FBF7EF`, edge `#E4DCCB`, ink `#1F2A37`, muted `#5B6675`, accent coral `#E0663A`, card white, screen `#10151F`.
- Server copies: `STAGE_PAINT` in `scene-compose.ts:4511`, plus local constants in `scene-chart.ts:27-31` (one bar colour, sky `#3D8FD1`), `scene-plot.ts`, `scene-timeline.ts`, `scene-quote.ts` and `scene-still.ts`.
- **AI drawings:** the palette is in the prompt (`prompts.ts:2428`): ink, coral, amber `#F2B33D`, leaf, sky, violet, rose, sand, cloud, slate and white. It is baked into every SVG, and labels are ink at weight 600.

**Where they don't reach.**
- Studio's `STYLE_PRESETS` (`studio-style.ts`) and `scene-style-packs.ts` colour story sets only.
- The stage has no dark mode, on purpose: dark outlines would vanish on a dark stage.
- The player chrome uses violet `accent-*` from `globals.css`.

### What's wrong

- There is one look for every subject and every age.
- The colours are copied in six or more places.
- Charts have no categorical palette.
- There is no contrast or colour-blind check.
- The maker cannot choose a look for an explainer, and viewers cannot get a dark picture.

### Design

**1. One theme table, shared by both repos.**
- `src/business/domain/scene-themes.ts` on the server is the source of truth. It is copied to the client as `src/lib/scene/themes.ts`, with an equality test like the existing contracts sync.
- The server's `STAGE_PAINT`, chart, plot and timeline constants read from it.

```ts
interface ExplainerTheme {
  id: ThemeId; name: string; dark: boolean; twin: ThemeId;   // light↔dark partner
  paper: string; paperEdge: string; grain: number;            // 0–0.04 noise opacity
  ink: string; muted: string; card: string; cardInk: string;
  accent: string; accent2: string; highlight: string;          // highlighter for key words
  line: string;                                                // arrows/leaders
  chart: [string, string, string, string, string, string];     // categorical, CVD-safe
  good: string; bad: string;                                   // right/wrong, never alone (icon + word too)
  drawingMap: Record<HouseColour, string>;                     // house palette → theme
  rim: string | null;                                          // sticker rim for drawings on dark themes
  sound: 'paper' | 'chalk' | 'digital' | 'playful';            // Ask 6 kit variant
  font: 'jakarta' | 'rounded' | 'serif-display';               // titles only; body stays Jakarta
}
```

**2. Six themes to start.** The hex values are proposals, tuned on the bench.

| Theme | Feel | Paper / ink / accent | Best for |
|---|---|---|---|
| **Paper** (today, tidied) | warm, bookish | #FBF7EF / #1F2A37 / #E0663A | history, literature, general |
| **Clean Lab** | cool, crisp | #F7F9FC / #14213D / #2F6FDE, accent2 #F28C28 | science, health, business |
| **Sunny** | bright, rounded | #FFF9E8 / #2A2350 / #FF7A59, accent2 #2BB3A3 | young children |
| **Chalkboard** (dark) | classroom | #1F3B34 / #F2F2EC / #F7D35C | maths and working, teens |
| **Blueprint** (dark) | technical | #0F2744 / #E6F0FF / #56C7F2 | engineering, computing, physics |
| **Night Sky** (dark) | cinematic, deep | #111827 / #F5F3FF / #F59E0B, accent2 #22D3EE | space, biology at small scales, big-picture topics |

**Twins:** Paper↔Night Sky, Clean Lab↔Blueprint, Sunny↔Chalkboard. The twin serves the viewer's dark mode (item 6).

**Chart palettes:**
- Light themes: the Okabe–Ito order (blue #0072B2, orange #E69F00, bluish green #009E73, vermillion #D55E00, sky #56B4E9, reddish purple #CC79A7).
- Dark themes: lighter variants of the same hues, re-checked for contrast.

**3. Recolouring AI drawings without drawing them again.**
- The drawing prompt already pins colours to the house palette. At compose time, `themedDrawing(svg, theme)` rewrites `fill` and `stroke` values:
  - an exact house hex is mapped through `drawingMap`;
  - any other colour is snapped to its nearest house colour (ΔE2000 < 8 in OKLab), then mapped;
  - anything else is left alone. Real colours, such as blood red or a leaf, are allowed to stay.
- The result is cached per theme under `drawings/{hash}/{theme}.svg`.
- **Dark themes:**
  - Ink outlines stay dark. The drawing gets a 3 px `rim` sticker outline in the theme's paper-light colour, made with SVG `feMorphology` dilate plus a flood. It is the cut-out look used by many animated channels, and it keeps every line visible.
  - Labels and leaders are set by the stage, not the drawing, so they take `ink` and `line` directly.
- Code-drawn charts, plots and timelines read theme tokens directly.
- Figure-kit people keep their skin tones. Clothes may use `accent` and `accent2`.
- **Contract:**
  - `SceneDto.theme?: ThemeId`, defaulting to `paper` so old scenes are unchanged.
  - `StudioPlayDto.theme`.
  - The client `theme.ts` becomes `themeOf(id)`. `stage.ts` sets CSS custom properties on the stage root, and every hardcoded stage colour reads them.
  - `sanitize.ts` must allow `var(--t-*)` in paint attributes.

**4. Choosing a theme: code, not a model.**
- `themeFor({subject, band, tone, maths})`:
  - early-years and primary bands get Sunny;
  - maths or working at secondary level gets Chalkboard;
  - engineering, computing or physics gets Blueprint;
  - space, astronomy or cells gets Night Sky;
  - medicine, health, science or business gets Clean Lab;
  - everything else gets Paper.
- The subject comes from the bible's `subject` or the document profile.
- The maker can override it: one **Look** row in the explainer brief card, showing six small swatch circles with names. This is the explainer's version of the story `style` row, stored as `brief.look`.
- **In chat:** "make it dark" or "use a chalkboard look" becomes a brief patch. The producer prompt learns the six names.

**5. Checks by code** (`theme-check.ts`, run in unit tests for every theme and at startup in development):
- **Contrast:** ink on paper ≥ 7:1, muted on paper ≥ 4.5:1, cardInk on card ≥ 4.5:1, and accent against paper ≥ 3:1 (SC 1.4.11).
- **Chart:** every chart colour against paper ≥ 3:1. Every pair keeps ΔE2000 ≥ 12 after simulating protanopia, deuteranopia and tritanopia (Machado 2009 matrices, about 30 lines of code).
- `good`/`bad` never differ by hue alone: the stage always adds a ✓ or ✗ icon and a word.
- **Recoloured drawings:** after mapping, the mean contrast between the main shape and the paper is ≥ 3:1, or the rim is forced on.

**6. Dark mode for viewers.**
- The maker's theme is the art direction and plays by default.
- The player's settings menu gets one item, **Dark picture** (Off / On / Match device). It swaps to the theme's twin in the browser: tokens and recolour happen at mount, and the drawings' themed SVGs are fetched per theme.
- The chrome around the stage becomes neutral dark. The violet scrubber moves to the theme's accent.

### Checks and tests

- The theme table matches between repos (a contracts test).
- `theme-check` passes for all six themes.
- `themedDrawing` maps every house colour and leaves off-palette colours alone. Tested on 10 fixture drawings from `drawing-bench`.
- The stage renders with each theme: a snapshot of the computed CSS variables.
- The chart bars use distinct palette entries.
- **Bench:** the `set:bench`-style contact sheet renders 6 explainer fixtures in 6 themes (36 stills via `scene-still.ts`) for Richard to look at. An optional Gemini picture check scores legibility, only with Richard's OK.

### Effort
3–4 days: table and plumbing 1.5 d, drawing recolour and dark rim 1.5 d, checks 0.5 d, brief row and player item 0.5 d.

---

## Asks 3 and 4: Animation, transitions and build-ups

### Today

**Timing constants** (`timeline.ts:48-72`): `MOVE_MS` 700, `ENTER_MS` 520, `EXIT_MS` 380, `STAGGER_MS` 180, `DRAW_MS` 600, `POINT_MS` 1700, `REVEAL_MS` 320, `ZOOM_MS` 900, `CALM_RATE` 0.45, `ATTENTION_MS` 2500.

**Entrances:** pop (easeOutBack), slide, wipe, grow and fade, chosen by the server in `scene-compose.ts:683 entranceFor`.

**Ambient motion:**
- AI drawings bob: `sin(t/1100) × 0.6 %` of the height (`timeline.ts:585`).
- Every shot pushes in slowly (`PUSH` 2.5 % over at least 4 s).
- Drawings the voice is not on run at 0.45× (`CALM_RATE`).

**Camera:**
- Zooms are kept only when the thing is named, and framed by `framedWhole`/`seenBox`.
- The follow camera on narrow screens zooms up to 2.4× on each new or pointed thing.

**Build-up:**
- `buildUp` splits a stage so each thing arrives as it is named.
- `fillQuiet` fills gaps.
- There is no persistent canvas across stages or scenes. The rebuild plan's "stability" (things keep their slots) is not built.

**Transitions:**
- Film joins are cut, dissolve or dip (`edit.ts` `HANDLES`).
- Explainer sheets carry only `cut|fade`.

**Code-drawn animation:** charts grow and plots draw with CSS keyframes, driven by the clock.

### What's wrong

- **Text moves while it is being read.** Labels sit inside the bobbing drawing, the push-in drifts everything, and the follow camera zooms again on every point.
- There is no reading time, so a keyword card can be replaced before a young viewer has read it.
- "Constant movement" is really only the bob and the push. Between changes the picture feels still.
- Every scene or stage change replaces pictures. There is no single evolving diagram, which is what 3Blue1Brown-style teaching relies on.
- Transitions are generic dissolves. There are no match cuts, morphs or zooms through a part.

### Design

**A. A motion grammar of three layers** (client `timeline.ts`, pure functions of t):

1. **The ambient layer never stops, and is always slow.**
   - **Camera drift:** a smooth, low-frequency path of two summed sines per axis, seeded per scene. Amplitude 1.2 % of the frame and period 9–14 s, on top of the existing push.
   - **Parallax:** explainer steps get up to three depth layers, reusing `layers.ts` depth factors:
     - backdrop at 0.6: a faint theme texture, grid or big subject silhouette (see B);
     - things at 1.0;
     - the text layer at 1.0 and pinned (see B).
   - **Idle life:**
     - drawings without their own animation "breathe" (scale 1 ± 0.6 %, period 4–6 s, phase per thing);
     - `flow` arrows keep marching;
     - `motion` drawings keep their loops at `CALM_RATE`;
     - a pointed-at part pulses once, then glows.
   - **Speed caps by audience:** camera `ZOOM_MOST` and `PAN_MOST`, and entrance durations, are multiplied by `motionFactor` (young ×0.75 speed and ×1.25 duration; adults ×1).
2. **The attention layer, tied to words (as today).** Reveals, points and arrows land on their words (temporal contiguity).
   - **One accent at a time:** at least 600 ms between accents on screen, except a thing plus its label.
   - **Easing:**
     - entrances ease out (cubic), or a damped spring from `springs.ts` for pops, with overshoot ≤ 6 % for adults and ≤ 10 % for children;
     - exits ease in;
     - moves ease in-out.
3. **The structure layer:** stage changes, builds and transitions (C and D).

**B. Text never moves while it is being read.**
- `readMs(text, band) = 400 + 60 000 × words ÷ READ_WPM[band]`, with a minimum of 1200 ms for a single word.

  | Band | `READ_WPM` |
  |---|---|
  | early-years | 60 |
  | primary-lower | 90 |
  | primary-upper | 130 |
  | secondary-lower | 160 |
  | secondary-upper | 180 |
  | adults | 200 |

  The values are drawn from subtitle guidance and cut for younger readers.
- **Reading windows.** Every text element (label, card, stat caption, list item, title, maths line) opens a window `[appearMs, appearMs + readMs]`. Inside a window:
  1. **Text lives in a pinned type layer.** Labels and leaders move out of the drawing's bob group: the bob applies to the art group only, and leaders are recomputed each frame to the moving anchor. A label's position therefore changes by < 0.5 px.
  2. **The camera holds.** The drift amplitude eases to 0 over 300 ms, and the push is limited to ≤ 0.2 % scale a second. Zooms or pans that were planned inside a window are deferred to its end, or dropped if the next step comes first. `cameraAt` gets `windows[]`.
  3. **No replacement.** An exit of that text, or a stage change that removes it, is delayed until the window closes. If that would push the next reveal more than 1.5 s past its word, the server makes the fix instead.
  4. **The follow camera on narrow screens does not zoom again** while a window is open.
- **Server side** (`scene-compose.ts`): `textPacing(script, timing, band)` finds reveals that come too fast and fixes them in code.
  - It moves a later text reveal to the start of the next word after the window closes.
  - A list shown faster than it can be read shows its items two at a time.
  - A keyword card whose text is longer than the band's `cardWords` (kids 3, teens 5, adults 7) is cut to its key noun phrase.
- **Redundancy (Mayer):** on-screen text stays at keywords and labels. The narration is never put on screen. Captions stay opt-in.

**C. Continuous build mode: one diagram that grows.**
- **When it is used:**
  - A section teaches parts of one system (the heart chamber by chamber, a food web, a network request's path, the water cycle), or a derivation.
  - The outline sets `build: 'start' | 'continue' | null` per scene, which is new in `OutlineScene`.
  - The writer's prompt gets one line: "this scene continues the diagram: keep its things, add yours".
  - A code rule turns it on when two or more neighbouring scenes share at least 2 of the bible's `pictures`.
- **The canvas.**
  - A section has one virtual board, 2× the stage width and 1.5× its height.
  - A new layout, `board`, places each newcomer in the nearest free cell next to what it connects to (arrow `from`/`to`), with a fixed 4×3 grid and gutters.
  - **Placed things never move** (stability); only the camera moves.
  - The camera frames the newest thing plus its neighbours, up to 60 % of the board. At a section's end, and at a `recap` beat, it pulls out to show the whole board.
- **Receding:** things the voice has not named for 2 stage changes fade to 55 % opacity and desaturate by 40 % (signalling). When named again they return to full.
- **Across scenes:**
  - Scene k+1 starts with scene k's end state already on stage, with no entrance.
  - The film join becomes a new `continue` kind: no dissolve, clips simply abut, and the camera carries on.
  - The server passes the previous scene's `endsOn` (thing ids and positions) into compose, as Visualize's `carryOver` already does for continued pages.
- **Draw-on:** things in a build enter with `draw`. It is a stroke-dash reveal of the SVG's paths over 600–1200 ms (by path length), then the fills fade in, which gives the whiteboard feel. Each drawing's path lengths are measured once when it is mounted.
- **Limits:** at most 12 things on a board. After that the section must end, or the board "pages": the oldest row slides out to the left.
- **Cost:** a build reuses drawings across scenes, so fewer drawings are made (this saves money; see Cost).

**D. Transitions** (`edit.ts` join kinds plus server rules; chosen by code):

| Join | When (server rule, `joinFor(prev, next)`) | How (client) |
|---|---|---|
| `continue` | next scene has `build: 'continue'` | no transition; the stage carries on |
| `match` | the last focused thing and the next scene's first thing share a bible picture, or have the same kind and shape (circle→circle, chart→chart) | hold that thing's box; its art crossfades in place over 500 ms while the rest dissolves |
| `morph` | same thing id in both, with a changed state or position | interpolate the transform box over 700 ms ease in-out and crossfade the art. For code-drawn charts and plots, interpolate the data (bars grow or shrink, curves tween point by point) |
| `zoom-through` | next scene's `teach` or points name a part of the last focused drawing ("inside the nucleus") | the camera pushes into the part until it fills the frame (900–1400 ms, ease in), dissolves at the peak, and the next scene opens at 1.3× and settles out |
| `push` | list-like sequence of sibling scenes (steps 1, 2, 3) | the old stage slides left and the new one comes from the right, 600 ms |
| `dissolve` / `dip` | new place / time passes (as today) | unchanged |

- The writer can suggest a join with an optional outline field `into: string | null`, naming the part to zoom into. Code decides, and falls back to dissolve.
- Motion blur on fast whooshes: none, to keep it light on phones.

### Checks and tests

**Client `node:test` in `timeline.test.ts`:**
- A label's screen position varies < 0.5 px across its window.
- Camera speed stays at or under the window cap.
- No text element exits before `appearMs + readMs`.
- Drift and parallax are deterministic by seed.
- In board layout, no existing thing moves when a newcomer arrives.
- A receding thing returns to full when named.
- Joins: `match` keeps the shared box, `morph` interpolates, `zoom-through` peaks at the dissolve.

**Server:**
- `textPacing` fixes: a fixture with 4 rapid keyword cards for early-years becomes cards 2 at a time.
- The `joinFor` rules table.
- `build` carry-over keeps ids.

**Rhythm log:** `rhythmOf` gains the shortest reading window left, accents per minute and the longest still ambient stretch. The new rule: "still" means no accent for more than 12 s, and the ambient layer is always on.

**Performance:** the `?perf` overlay on a mid-range Android keeps ≥ 50 fps with parallax plus breathing on 5 things. There is a fallback: the ambient layer is off under `prefers-reduced-motion`, and only the drift is kept on low-end devices (a `perf.ts` heuristic).

**Watch test:** Richard's favourite pacing page (System Design Interview p253) is remade and compared, together with two Studio explainers, one of them for children.

### Effort
- Motion grammar and text-still: 3 d.
- Transitions: 3–4 d.
- Continuous build: 4–5 d.
- Total 10–12 d, of which about 4 d is server and 7 d client.

---

## Ask 5: Story clips inside explainers

### Today

**Explainer bibles have no people or places.** `studio-prompts.ts:451` says "An explainer has no characters and no sets". The writer can still put kit `character`, `person` or `place` cast into a lesson page, and early-stage recipes suggest a "friendly guide character".

**The story pipeline:** bible → cast (kit or artist) → sets (packs, parts, `set_paint`) → `prepare` (draws once per show) → story sheet (`writeStoryScene`) → table read (score only) → stage (`studio-stage.ts`: acting, faces, camera, interactions) → voice (per-speaker voices) → S10 score and S11 sound.

**Sheets are already typed per scene.** `sheetOf` dispatches on `kind`, and the client player plays both kinds. But the show-level code branches on `brief.format`:
- `studio.processor.ts` :726, 1205, 1382, 1459 and 1682;
- `studio.service.ts` :907–1205.

### What's wrong

A concept that is really about people and situations becomes abstract icons. Examples: a nurse taking a patient's temperature to explain fever, a shopkeeper choosing a price to explain supply and demand, a scientist checking a control group. We already make acted scenes well, but explainers can't use them.

### Design

**1. Outline: a scene can be a clip.**
- `OutlineScene.kind: 'lesson' | 'clip'`. For a clip: `set` (an id), `cast` (ids), `seconds` 6–20, `teach` (what it shows, one line), and `hook` (the lesson line that points back to it).
- **Prompt rule** (`studioOutline`, explainer paragraph): use a clip only where a concrete situation makes the idea easier, such as a case, a moment of cause and effect, or a before-and-after.
  - At most 1 clip per 90 s, and 2 per episode.
  - A clip sits before the lesson scene that explains it ("watch, then understand"), or after it as the worked example.
- **Code gate** (`checkOutline`): the limits `CLIP_MOST = 2`, `CLIP_SECONDS = [6, 20]` and clip share ≤ 25 % of the runtime. A clip over the limits becomes a lesson scene. This is fixed silently.

**2. A cheap cast and set, reused.**
- The explainer bible gains `characters` (≤ 3) and `sets` (≤ 2), used only by clips.
- **Characters are kit-only:** `rig: 'kit'`, so there is no artist drawing and the cost is $0. Their looks are generated from the kit's own choices, varied and neutral: a nurse, a customer, a student. The mascot from Ask 9 can be one of them.
- **Sets:**
  - first choice: a style-pack layout plus building parts (`scene-style-packs.ts`) for common places (a clinic room, a classroom, a market stall, a kitchen, a street, a lab, an office), at $0;
  - otherwise one `set_paint` call, cached for the show.
- **Reuse:** the outline prompt is told to reuse the same people across clips. A code check allows at most 1 new person per clip after the first. The characters then come back in later episodes of the show, so a viewer learns "Ana and Kofi" or "Mei and Luca" as the show's recurring pair. Names vary by show and follow the maker's setting if one is given.

**3. Writing the clip.**
- It reuses `writeStoryScene` with a clip profile:
  - no story-development step, no table read, thinking off;
  - 2–6 beats;
  - lines of ≤ 12 words;
  - `narrator: 'light'`, so the explainer's narrator may open or close the clip in the same voice;
  - an acted action at the idea's moment: the thermometer is read and the number is shown.
- The idea is kept visible:
  - one `insert` close-up on the key thing (it already exists: "an insert is a true close-up on its thing");
  - an on-screen label in the theme's type, and a freeze-frame at the idea moment (a new 600 ms `hold` beat).

**4. In and out of the clip.**
- **Into the clip:** a dissolve, or an iris for Sunny and Chalkboard.
- **Out of it: "the clip becomes a card".**
  - The clip's last frame is frozen and taken as a still (`scene-still.ts` already makes stills from layers).
  - It shrinks into a rounded card that becomes the first thing on the next lesson scene's stage, as a normal `card` thing with the still as its art.
  - The diagram then builds around it, and the narrator's `hook` line refers back to it.
  - This is a `match` join whose shared box is the card.
- The client needs to support a scene-still image thing. The server writes `still:{sceneId, atMs}` and the stage renders a raster or SVG snapshot.

**5. Pipeline changes.**
- Replace the show-level `brief.format` branches with per-scene checks: `scene.kind === 'clip'` counts as a story.
- `prepare` runs for explainer episodes that contain clips.
- The S10 score applies to clip scenes only, as a light cue: an ambience bed plus one sting at the idea moment.
- The voice cast gives clip characters their own voices, and the narrator stays the lesson voice.
- The theme tints clip sets through `setLookOf`, so clips match the explainer's look.

**6. Cost and time budget per clip:**

| Item | Model | Cost |
|---|---|---|
| Clip sheet | DeepSeek flash, no thinking, ~6k in / 1.5k out | ≈ $0.004 |
| One send-back, only if the check fails | same | ≈ $0.004 × 30 % |
| Cast | kit | $0 |
| Set | pack, or one `set_paint` cached per show | $0 – $0.02 |
| Voice, 15 s | Gemini (Kokoro ≈ $0) | ≈ $0.004 (doubles from 2027-01-01) |
| Picture check (Gemini) | skipped for clips; code checks only | $0 |
| **Clip total** | | **≈ $0.01–0.03** |

- Time: a clip is made in parallel with the lesson scenes. It adds about 20–40 s to the first episode only when a set must be painted.
- Maker controls: none by default. In chat, "no clips" or "add a clip with a patient" set `brief.clips: 'auto' | 'none' | 'more'`.

**7. Later: Visualize books.** Teacher's notes could mark a page's `kind: 'case'` and use the same clip maker. This is not in scope now.

### Checks and tests

- Outline check: limits, share and fixes; a clip without a following hook gains one.
- Processor test with the fake LLM: a mixed episode of lesson → clip → lesson makes 3 scenes, `prepare` runs once, and the clip is recorded under the right task.
- Client:
  - the edit list with a clip → lesson `match` join keeps the card box;
  - the still card renders;
  - the voice switches narrator → character → narrator.
- **Clarity bench** (`studio-clarity-bench.spec.ts` style, code-only): each clip names its idea in the lesson line after it.
- One watch test for Richard: "fever" for children, with a nurse and a child patient.

### Effort
5–7 days: server 3–4, client 2–3.

---

## Ask 6: Sound effects

### Today

**Explainers get synthesised effects only** (`sound/synth.ts`), placed by `cues.ts`:

| Moment | Sound |
|---|---|
| stat | chime |
| title | shimmer |
| words | pop-soft |
| slide | swish |
| wipe | wipe |
| enter | pop |
| leave | whoosh-out |
| arrow | draw |
| point | tick |
| zoom | whoosh-in |
| say | tap |

- **Thinning:** `MERGE_MS` 90, at most 3 per 400 ms.
- **Levels:** `LEVELS.effects` 0.3.
- **Tuning:** `EFFECT_NOTE` tunes chimes to the chord.
- **Ducking:** music ducks under speech (`score.ts` `DUCK.speech` −12). Effects are not ducked on main.
- **Switches:** Visualize has separate Effects and Music switches. The Studio player has a Music switch only.

**S10 and S11 are in progress, all uncommitted.**
- **S10** (`../easyread-server-music`: `studio-score.ts`; `../easyread-music`: `film-score.ts`, `hits.ts`) adds motifs, hits, drop-outs and `FILM_DUCK` speech −10. It is skipped for explainers.
- **S11** (`../easyread-sfx`, client only) adds:
  - `sfx.ts` (51 recorded sounds with 2–4 takes each, including `whoosh`, `paper`, `switch` and `comic-pop`);
  - `beds.ts` (16 ambience beds);
  - `foley.ts`;
  - `DUCK_DB` effects −3 and beds −6.
  - The recordings are Kenney (CC0) plus Pixabay, credited.
  - It needs `setting.full`, so explainers get none of it. Its `ducks` bus appears to apply to lesson pages too.

### What's wrong

- Synthesised pops sound thin next to a recorded film score.
- Transitions have no matching sound.
- Nothing marks the key idea beyond a chime.
- The explainer music does not follow the lesson's shape (hook, build, key, recap).
- The Studio player has no effects switch.

### Design

**1. An explainer sound kit**, `sound/explainer-kit.ts` on the client. It maps stage moments to recorded sounds with 2–3 takes each, from S11's library where one fits. Any gaps are filled from CC0 packs (Kenney "Interface Sounds" and "UI Audio" are CC0), which falls under Richard's approval of 2026-09-30 for allowed sources. Credits are recorded, and the expected size is about 0.6 MB.

| Moment | Sound (variant per theme `sound`) |
|---|---|
| thing enters (pop/grow) | soft pop · paper: paper tap · chalk: chalk tap · digital: soft click · playful: bloop |
| draw-on / arrow | marker or pen stroke, length-matched (short, medium or long take); chalk scrape on Chalkboard |
| card / keyword | paper slide |
| list item | light click (children: every item; adults: first, then every other one) |
| point | tick (as now, tuned) |
| key idea (`delivery: key`, first mention of a new term) | the tuned chime, plus a two- or three-note "idea" motif from the show's key (from S10's `motifsOf` when present), at most 1 per 45 s |
| stat / big number | low soft thump, then the chime |
| transitions | a whoosh sized to the join (short 300 ms for `push`, medium 600 ms for `match`/`dissolve`, long rising 1.2 s for `zoom-through`), peak aligned to the cut point |
| build completes (wide pull-out) | a soft resolving chord from the conductor (the home chord, rolled) |
| checkpoint (Ask 9) | a two-note question rise, then quiet |

**2. Mix and ducking.**
- Effects duck −3 dB under speech, using S11's `speechWindows` for explainers too.
- Music ducks as today (−12 in lessons, −10 in films).
- **Targets:**
  - voice normalised per scene to about −16 LUFS integrated, done once on the server with ffmpeg `loudnorm` two-pass after voicing (check whether it already exists; add it if not);
  - music under speech about −28 LUFS;
  - effect peaks 14–18 dB under the voice.
- **Density:**
  - at most 1 effect per 700 ms;
  - for adults, reveals inside one step collapse to one sound;
  - under reduced motion, only the key-idea chime and the transitions play.

**3. A lesson-shaped music bed.** This reuses S10's machinery with a lesson profile, `explainerScore(sheets)`:
- The energy curve comes from delivery tags: hook → bright, explain → curious or calm, key → a thinned bed (`THIN.key` exists), recap → bright resolve.
- Silence while maths is worked, as now.
- A short sting only at the end of the episode.
- Clips (Ask 5) get S11 beds and foley automatically, because clip scenes carry `setting.full`.
- Theme link: Night Sky and Blueprint get the pad-free "curious" colours, Sunny gets "playful", and Paper gets the felt piano.

**4. Viewer switches.** The Studio player gets "Sound effects" next to "Music" in the same menu, remembered in `localStorage` like `visual-pane.tsx`.

### Checks and tests

- `cues.ts` tests:
  - every explainer cue kind maps to a kit sound;
  - spacing ≥ 700 ms;
  - the idea motif appears at most once per 45 s;
  - each whoosh peak lands within 30 ms of its join.
- `score.ts`: the lesson curve fixtures (hook → key → recap) produce the expected states.
- Loudness: the server `loudnorm` result is within ±1 LU of −16 on 5 fixture scenes.
- `/dev/music` gets an "Explainer" tab to audition every kit sound per theme.
- Richard listens to 2 explainers, one for children and one for adults, with sound on and off.

### Effort
2–3 days after S10 and S11 are merged: kit and cues 1.5 d, lesson score 0.5–1 d, loudness 0.5 d. Blocked on S10 and S11 landing in `studio`.

---

## Ask 7: A document in the chat → an explainer

### Today

**Teach Me:**
- `TeachMeFloat` → `TeachChoiceModal` (a video lesson via Visualize, or an audio lecture).
- `teachDecision()` in `lib/lecture/teach.ts` works per chapter.
- Chapters are chosen in `LectureSetup` (`components/reader/lecture-setup.tsx`), a checklist of whole chapters labelled "Pages X to Y". There is no page-range picker.

**Uploads** (`documents.controller.ts`):
- `upload-intent` → `content` or `complete` → pipeline: convert (Drive → PDF for docx, pptx, odt, rtf and txt) → extract (`pdfjs-toolkit`, `reading-order.ts` for columns) → OCR (Mistral, then vision fallback; only for empty or maths pages) → summarize + embed → topics.
- Limits: 50 MB (`MAX_UPLOAD_BYTES`), `MAX_PAGES` 5000, no EPUB and no images. Free plan: 3 documents a month.

**Chapters (topics)** are an LLM pass over a 48k-character digest (`topics.processor.ts`, `digest.ts`). PDF bookmarks are ignored.

**Studio:**
- No file intake. A paste of 900 characters or more becomes `brief.source` (12,000 characters at most), with an excerpt for the producer.
- `DocumentProfile` / `levelIn` / `settleStage` (`scene-profile.ts`, `scene-stage.ts`) can already infer the subject and level.

### What's wrong

A teacher or student with a 300-page PDF cannot get an explainer of "chapter 4" or "pages 112–131" without copying text. The 12,000-character cap silently drops most of a chapter.

### Design

**1. Attach, in the familiar way.**
- The composer (`components/studio/composer.tsx`) gets a paperclip button left of the text box. It opens a two-item menu: **Upload a file** and **From my documents**.
- Files can also be dropped onto the chat. Accepted types are `ACCEPTED_MIME_TYPES`, up to 50 MB.
- Upload reuses the existing intent → content → complete endpoints. The document is an ordinary `documents` row, with a new `origin: 'studio'` so it shows in the library too, and can be taught with Teach Me as well.
- `studio_shows` gains `document_id` (nullable; migration 0060).

**2. A document card in the thread** (new `DocumentCard` in `thread.tsx`, from a new `StudioEventName` `document`):
- title, page count and a first-page thumbnail;
- a one-line status from the existing SSE events (`use-document-sync.ts`): "Reading 214 pages…", then "Found 12 chapters";
- one button, **Change**, which picks another file.

**3. A "Choose what to explain" card** (new `PagesCard`, familiar chips plus a range):
- **Chapters** are shown as chips with their page ranges ("4 · Cell membranes · p. 41–58"). Several can be selected, and chapters already used in this show are marked. The producer's reply is one line above the card ("Which part should the video cover?").
- **A Pages toggle** switches to a compact range: two number boxes ("from 41 to 58") and a dual-thumb slider along the page count, with chapter tick marks. The first page's text is previewed on hover or long-press.
- **A live estimate line:** "18 pages · about a 4-minute video". If the selection is more than the length allows: "That's a lot for 5 minutes. Make it 3 episodes, one per chapter?", with two chips, **Make a series** and **Just the main ideas**.
- **One primary button: Use these pages.**
- **In chat:** "chapter 4", "pages 40-55" or "the part about osmosis" become a producer action `pickPages`. A subject phrase is matched against topic titles and their short descriptions, in code first, then by the producer turn that already runs.

**4. Faster chapters, better for Teach Me too.**
- **Outline first:** `pdfjs getOutline()` → page indices, used as topics (`source: 'bookmarks'`).
- **Headings second:** large-font lines from `extract` that match heading patterns.
- **LLM digest last**, as now.
- A **light Studio intake:** a Studio upload skips `simplify_standard` and `embed` until the document is opened in the reader. OCR runs only for the selected pages. The card can therefore offer chapters within seconds for PDFs with bookmarks.

**5. From pages to an outline, with no text limit.**
- `brief.document = {documentId, ranges: [[from, to]], topicIds}` replaces the pasted `source` for documents.
- **Selected text ≤ 12,000 characters:** used as `source`, as now.
- **Otherwise it is condensed with teacher's notes.** `lesson-notes.ts` `readChapter` (task `scene_notes`, DeepSeek, thinking on) runs over the selected pages in parts of 20 pages. It produces `ChapterNotes`: points, pictures, terms (`newHere`), pitfalls, checks and handoffs.
  - The outline prompt then gets the notes, not raw text, so it fits the 3-words-a-second budget.
  - Each episode scene is tied to its pages (`pages: [from, to]` on `OutlineScene`), and the writer gets those pages' text as `material`.
- **Studio explainers now get notes.** `drawnAsTheyAre` and the "term before its time" check run on them too.
- **Audience from the document:** `profileFor` (subject, kind, stage, `stageWhy`) pre-fills the audience ("This reads like a first-year university textbook"), shown as one confirm chip (Ask 8).
- **Series:** "Make a series" creates one episode per chosen chapter, each outlined from its own notes. Episodes are made one after another, and the thread shows them as they finish.

**6. Limits and cost.**
- **An episode covers up to 60 pages.** More than that offers a series. At most 12 episodes a series at a time.
- **Condensing:** about 3,000 characters a page, so 20 pages ≈ 15k tokens in ≈ $0.005 plus thinking output ≈ $0.01–0.02 per 20 pages.
- **Intake:** OCR ≈ $0.001 a page, only for scanned selected pages. Topics are one call.
- **Big documents:**
  - extraction and topics finish before the heavy steps;
  - the card appears as soon as the topics exist;
  - a 500-page PDF with bookmarks has chips within about 10–20 s;
  - without bookmarks, after the topics call (about 30–60 s).

### Checks and tests

- Server:
  - `getOutline` topics on a fixture PDF with bookmarks; the fallback on one without;
  - `pickPages` parsing ("ch 4", "pages 40–55", "p. 40 to 55", "the osmosis part");
  - range clamping;
  - a series split;
  - notes condensation stays within the outline's word budget.
- Processor with the fake LLM: a 40-page selection gives notes, then an outline with page-tied scenes.
- Client: `PagesCard` selection gives the right brief patch, the estimate is correct, and it works on a phone (chips wrap, the range stays usable, no horizontal scroll).
- End to end, locally: upload a 150-page open-licence textbook PDF, choose chapter 3, and make a 3-minute film.

### Effort
5–6 days: client cards and attach 2.5 d, server intake, `pickPages` and notes 2 d, bookmarks and headings 1 d.

---

## Ask 8: Who the explainer is for

### Today

- **Brief audience:** 4 values (`STUDIO_AUDIENCES`), mapped to stages by `AUDIENCE_STAGE` (young children and children → early, teens → middle, adults → higher). `professional` cannot be reached.
- **`STAGE_RECIPES`** (`scene-stage.ts`) hold the reader, sentence words, spoken words, terms, labels, pace, pause, explain, checks, pictures and tone per stage.
- **Voice:** the stage pace is not passed to the voice in Studio.
- **Readability:** there is no formula. The lecture-only `plainWordsProblems` (`lecture.ts:1322`, `PLAIN_BARS`, `EVERYDAY_WORDS`, `syllablesOf`) is not used for explainers.
- **Three pace vocabularies:** Studio gentle/lively/snappy, lecture gentle/steady/brisk, and the learner profile slower/steady/faster.
- **Users** have no age or grade. Institutions carry levels.

### What's wrong

- "Kids in grade 5" and "a uni student new to the topic who needs hand-holding" are both squeezed into two coarse buckets.
- Nothing distinguishes "new to it" from "revising", or a language learner from a native speaker.
- The profile does not reach the voice, the motion or the text size.

### Design

**1. The profile** (`AudienceProfile`, server `studio/studio-audience.ts`), stored as `brief.who`. The old `audience` is kept and derived from it for compatibility.

```ts
interface AudienceProfile {
  band: 'early-years'|'primary-lower'|'primary-upper'|'secondary-lower'|'secondary-upper'|'university'|'professional'|'general-adult';
  said?: string;              // their words: "grade 5", "Year 9", "first-year nursing", "my book club"
  prior: 'new'|'some'|'revising';
  goal: 'understand'|'exam'|'apply'|'curious';
  language: 'fluent'|'learning';   // learning English (or the film's language)
  support: 'normal'|'extra';       // "needs hand-holding"
}
```

**2. Asking briefly, or inferring.**
- **Inferred first, by code** (`audienceIn(text)`), from the idea, the pasted text or the document profile. The patterns are **global**:
  - "grade 5" / "5th grade", "Year 9", "Key Stage 2", "primary 4", "form 2";
  - "high school", "secondary", "sixth form", "IB", "AP", "A level", "GCSE";
  - "freshman", "first-year", "undergraduate", "master's", "nursing / law / medical students";
  - ages ("10-year-olds", "ages 6–8");
  - "for my team", "onboarding", "CPD".
  - The regional terms already in `levelIn` stay and are joined by these, so no region is the default.
  - "Needs hand-holding", "complete beginner" or "new to" set `prior: 'new'` and `support: 'extra'`. "Revising", "exam next week" or "refresher" set `revising`. "English learners", "ESL" or "EAL" set `language: 'learning'`.
- **Asked only when missing:** the producer's existing audience question becomes one chips row: *Young kids (4–7) · Kids (8–11) · Teens · University · Work · Anyone curious*.
- **An optional second row,** only if nothing hints at it: *New to it · Knows a bit · Revising*.
- The brief card shows it as one line, "For: Grade 5 · new to it". A tap edits it with the same chips.
- **One vocabulary:** the maker's `pace` chip for explainers (relaxed, natural, brisk) maps onto Ask 1. The lecture and learner-profile dials map onto the same three words where they meet (a later tidy-up).

**3. Recipes v2** (`AUDIENCE_RECIPES[band]`, extending `StageRecipe`):

| Field | Kids 8–11 (example) | University, new to it (example) |
|---|---|---|
| sentence words | 5–13 | 8–20 |
| FK grade target (max) | 5 | 12 |
| hard-word share max | 4 % | 10 % |
| new terms a minute | ≤ 2 | ≤ 4 |
| ideas a minute (points) | ≤ 2 | ≤ 3 |
| narration wpm (Ask 1) | 132 | 155 × 0.95 |
| read wpm (Ask 3) | 130 | 200 |
| text size floor (stage units) | 44 | 32 |
| card words max | 3 | 7 |
| labels a drawing | 2 | 5 |
| motion factor | 0.8 | 1 |
| check for understanding | every 60–90 s, answer after a pause | every ~2 min + recap |
| analogies from | play, food, animals, sports, weather, school | everyday tech, money, transport, work, cooking |
| humour | welcome | light |
| mascot default | on | off |

**Modifiers:**
- `prior: new` or `support: extra`:
  - +1 check;
  - pre-training (name the parts before the process; Mayer);
  - one worked example per idea;
  - −5 % wpm;
  - a recap every 2 scenes.
- `revising`:
  - +8 % wpm;
  - fewer analogies;
  - more recaps and an exam-style question at the end.
- `goal: exam`:
  - keep the exam's exact terms;
  - end with an exam-style question.
- `language: learning`:
  - sentences 25 % shorter;
  - no idioms;
  - −10 % wpm;
  - captions on by default;
  - key terms shown as cards when first said.

The recipe text reaches the writer through `describeScene` (studio-words) and the outline prompt. The numbers reach the voice, the motion, the theme and the checks by code.

**4. Readability checks by code** (`plainScript(script, recipe)`, reusing `lecture.ts` helpers):
- average and longest sentence;
- hard-word share (not in `EVERYDAY_WORDS` and not a lesson term, with ≥ 3 syllables or ≥ 9 characters);
- Flesch–Kincaid grade over the scene (via `syllablesOf`);
- for bands up to primary-upper, the share of words outside the top 3,000 of the everyday list.

**Fixes, in order:**
1. **Code:** split sentences at "; ", ", which", ", and then", and " because " when a part is longer than the cap. Swap a short list of stiff words (utilise → use, commence → start).
2. **If still over by 2 or more grades:** add the problem to the existing single send-back, with no extra call when a send-back is already happening.
3. **Otherwise accept it silently.** Clarity checks are logged.

English only. Other languages skip the formula and keep the sentence-length check.

**5. Checks for understanding.** The recipe decides how often there is a question. Questions use the existing `delivery: 'question'` with a band-length pause, and become interactive checkpoints in the player (Ask 9).

### Checks and tests

- `audienceIn` tests with 40 phrasings from many systems (US, UK, IB, Indian, East African, Australian and French-style classes), plus adult phrasings. It never guesses from names or places.
- Recipes are monotonic across bands (sentence caps, wpm, text size).
- `plainScript` on fixtures: a grade-5 fixture passes, and a university paragraph given to grade 5 fails and is split by code.
- Clarity bench: add 4 explainer briefs to `studio-clarity-bench` (grade 5 water cycle; teen algebra; a nursing student on blood pressure; an adult learning English on budgets). Code-only scoring; no live DeepSeek bench without asking.

### Effort
3–4 days.

---

## Ask 9: What makes our explainers unique

Ranked by impact against effort. Cost is per video unless stated.

| # | Idea | What it is, in this codebase | Impact | Effort | Cost |
|---|---|---|---|---|---|
| 1 | **Pause-and-think checkpoints** | The player pauses at a `question` beat and shows 2–3 answer chips from the sheet (a new `choices` on question beats, with one marked right). Choosing reveals the answer beat with the ✓/✗ sound. It skips itself after 8 s for passive viewing. Answers go to the tutor chat when watched in the reader (teacher's-notes Step 7). | very high (testing effect, segmenting) | 2–3 d | ~$0 (the writer adds 3 short fields) |
| 2 | **Idea marks and "back one idea"** | Scrubber ticks per point, and ← goes back one idea, not 5 s. The chapters list shows the ideas. | high | 1–2 d | $0 |
| 3 | **Recap cards + "teach it back"** | The end card holds 3 recap cards built by code from the `key` beats and new terms. Then "Now you explain it" lets the viewer type or say it; one DeepSeek call checks it against the notes' points and replies kindly with what's missing. | high | 3 d | $0.001 per use |
| 4 | **A recurring host (mascot)** | One kit character or animal-kit creature per show (the maker picks from 3 on the existing `ChooseCard`). It opens, asks the checkpoint questions from a corner, reacts to reveals (faces rig), and stars in clips. It gives the show a face. | high (brand, kids) | 3–4 d | $0 (kit) |
| 5 | **"What next?" chips** | At the end, 2–3 follow-up questions written with the outline (no extra call) appear as chips. A tap makes the next episode: branching by the viewer's curiosity. | high | 1–2 d | the next episode's normal cost |
| 6 | **Explain it again for…** | One action remakes an episode for another audience (grade 5 ↔ university). Drawings and board are reused; only the narration is rewritten and voiced again. Teachers differentiate in one tap. | high (teachers) | 2 d | ≈ 40 % of a new video |
| 7 | **Analogy worlds** | When the writer uses an analogy ("a cell is like a city"), a small world set is built from pack parts and each diagram part is paired with a world part. A `morph` then swaps between them (nucleus ↔ city hall) at the words. | high (unique) | 4–5 d (after E4, E8) | ≈ $0.01 (set) |
| 8 | **Scale journeys** | Chained `zoom-through` joins with a code-drawn scale bar (1 m → 1 mm → 1 µm → 1 nm): powers-of-ten moments for biology, physics and geography. | medium–high | 3 d (after E4) | $0 |
| 9 | **Draw-along board** | A "Whiteboard" theme plus draw-on entrances plus a kit hand that "draws" each path. For maths workings (`maths-board.ts`), the steps are written line by line. | medium–high | 2–3 d | $0 |
| 10 | **Wrong-way-first contrasts** | The notes' `pitfall` becomes a split `compare` stage: the common mistake crossed out beside the right way, with ✓/✗ icons (never red and green alone). | medium | 1 d | $0 |
| 11 | **Play with it** | After a plot, chart or maths scene, an interactive card lets the viewer drag a slider on the code-drawn plot (change the mass, see the force). The data already lives in code. | medium–high (STEM) | 3–4 d | $0 |
| 12 | **Kinetic keywords** | Key terms set into the art in the theme's display font, landing with the voice. Keywords only, never whole sentences (redundancy). | medium | 1–2 d | $0 |
| 13 | **Cold-open question** | A code check that scene 1 opens with a question, a surprise or a situation within 8 s. If not, the send-back asks for one (no extra call when a send-back is already due). | medium | 0.5 d | $0 |
| 14 | **Sound logo per show** | S10's motif played on the title card and the end card, so the show becomes recognisable. | low–medium | 0.5 d | $0 |
| 15 | **Personal touch without per-viewer cost** | The maker's context on the title card ("For Ms. Ortiz's Year 6 class") and in the host's first line. It is voiced once per film, not per viewer. | low–medium | 0.5 d | $0 |
| 16 | **Shareable idea clips** | A 15–30 s vertical export of one idea. Needs MP4 export, which is not built (studio-plan step 15). | medium | 5+ d | render time |

**Recommended first set** (E9): 1, 2, 3, 4, 5 and 13. The next set (E10) is 6, 7, 8, 9 and 11.

---

## Roadmap

| Phase | What | Days | Depends on | Runs in parallel with |
|---|---|---|---|---|
| **E0** | Measure (wpm, silence share, text-read windows on 10 existing explainers) and quick wins (below) | 1–2 | – | – |
| **E1** | Voice pace: target, shaping, calibration, stretch, speed menus | 3–4 | E0; E2's band interface agreed on day 1 | E2, E3 |
| **E2** | Audience profile, recipes v2, `audienceIn`, readability by code | 3–4 | E0 | E1, E3 |
| **E3** | Themes: table, recolour, dark rim, checks, Look row, dark picture | 3–4 | – | E1, E2 |
| **E4** | Motion grammar, text-still windows, new transitions | 6–7 | E2 (read wpm, motion factor), E3 (tokens for highlights) | E7 |
| **E5** | Continuous build (board layout, recede, `continue` join, draw-on) | 4–5 | E4 | E6, E7 |
| **E6** | Explainer sound kit, lesson score, loudness, effects switch | 2–3 | S10 + S11 merged into `studio`; E4's joins for whoosh timing | E5, E7 |
| **E7** | Document → explainer (attach, cards, bookmarks, notes, series) | 5–6 | E2 (audience from the document) | E4, E5, E6 |
| **E8** | Story clips in explainers | 5–7 | E4 (match join, still card), S10/S11 for clip sound | E9 |
| **E9** | Creative set A: checkpoints, idea marks, recap + teach-back, host, what-next chips, cold open | 6–8 | E2 (check frequency), E8 (host in clips, optional) | E8 |
| **E10** | Creative set B: explain-again, analogy worlds, scale journeys, draw-along, play-with-it | 10–14 | E4, E5, E8 | – |

- **Total:** about 6–8 weeks for one developer.
- **With background agents, one per phase** (as the Studio phases were run): E1, E2 and E3 together, then E4 and E7 together, then E5, E6 and E8, then E9. That is about 3–4 weeks elapsed.
- **Each phase ends with:** tests green, a contact sheet or recording for Richard, a push only with his OK, and a restart of his API and worker.

---

## Quick wins (first 1–2 days, E0)

1. **Speed menus.** The Studio player gets 0.75 / 0.9 / 1 / 1.25 / 1.5 (`FilmClock.playbackRate` plus `preservesPitch`). The Visualize player adds 0.75× and 0.9×.
2. **Studio passes the audience stage to the voice** (`learners` pace and pause), so children's explainers are slower and adults' are not slowed.
3. **Pauses:** take the largest reason rather than the sum; trim Gemini's long gaps inside a sentence (>600 ms); insert a pause the gap search missed; fix Kokoro's `PAUSE_LIMIT` against `HOLD_LIMIT_S`.
4. **Labels leave the bob:** move the float to the art group only. The follow camera does not zoom again during the 1.5 s after a label appears (a fixed window until E4's `readMs`).
5. **Show the Pace chips for explainers** (`production.tsx:255`), wired to a voice multiplier (0.93 / 1 / 1.08) and `motionFactor`.
6. **OpenAI scenes pass `instructions`** with the pace words, and per-piece speed where the model takes it.
7. **Constants agree:** one `STILL_WORDS` (30), one `WORDS_A_SECOND` for the budget and the outline's `teach` (2.4 → teach at about 2.6 words a second), and one "fuller" rule.
8. **Logging:** per scene wpm, silence share, and fastest text window into the studio log. Explainer calls are recorded as `scene_write`.
9. **Widen `levelIn`** with global grade and year patterns (US grades, UK Years, IB, AP, ages).
10. **Chart palette:** code-drawn charts use a 6-colour Okabe–Ito order instead of one blue.

---

## Cost per video (a 3-minute Studio explainer, 5 scenes)

**Estimates** from `cost.ts` prices, with ranges:
- DeepSeek flash: $0.30 in / $1.20 out per million tokens.
- Gemini 3.8 Flash TTS: ≈ $0.0135 a minute of speech, doubling from 2027-01-01.
- The rebuild plan's measured $0.04–0.10 a page for writing plus drawing.

E0 replaces these with ledger figures.

| Item | Before | After (no clips) | After (+2 clips) |
|---|---|---|---|
| Producer chat, bible, outline | $0.01–0.02 | $0.01–0.02 | $0.01–0.02 |
| Scene scripts (5 × writer + ~40 % one send-back) | $0.03–0.06 | $0.03–0.06 (readability fixes by code; issues only ride along on existing send-backs) | $0.03–0.06 |
| Drawings (DeepSeek SVG; ~20–30 per film, up to 2 tries) | $0.15–0.35 | $0.12–0.30 (builds reuse drawings across scenes; theme recolour is code) | $0.12–0.30 |
| Clips (2 × sheet + pack or painted set) | – | – | $0.02–0.06 |
| Voice (Gemini, 3 min) | $0.04 ($0.08 from 2027) | $0.04 (stretch and shaping are CPU) | $0.045 |
| Voice (Kokoro instead) | ≈ $0.005 | ≈ $0.005 | ≈ $0.006 |
| Document condensing (only when a document is used, per 20 pages) | – | $0.01–0.02 | $0.01–0.02 |
| Motion, themes, sound, player features | $0 | $0 (client) | $0 |
| Teach-back check (per viewer use) | – | $0.001 | $0.001 |
| **Total (Gemini voice)** | **≈ $0.25–0.55** | **≈ $0.25–0.60** | **≈ $0.30–0.70** |

- **Time to film:** about the same as now. Clips run in parallel. A painted set adds 20–40 s once per show. Time-stretch adds about 1–2 s per scene on the worker.
- **The first-class cost lever stays the drawings.** The build mode, reusing bible `pictures` across scenes, and a per-show drawing cache (key: picture name plus theme) are the main savings.

---

## Risks

1. **DeepSeek credits.**
   - Every new rule is code-first.
   - No new rewrite rounds; no live benches without Richard's OK.
   - Clips have no table read.
2. **Gemini quota and price.**
   - Quota is 100 requests a day on Tier 1, and the price doubles on 2027-01-01.
   - Pace control relies on code stretching, not extra requests.
   - Kokoro stays the fallback, and the admin switch already exists.
3. **Time-stretch quality.** Beyond ±12 % some voices smear.
   - Clamp to [0.88, 1.14], use the formant-preserving mode, and prefer Kokoro's native `speed`.
   - Listen-test each engine.
4. **Recolouring AI drawings.** Off-palette colours and gradients may not map.
   - Nearest-colour snapping with a ΔE limit, the dark-theme rim, and a contrast check that forces the rim.
   - Worst case, a drawing keeps its colours on a light twin theme.
5. **Motion versus clarity.**
   - Constant motion can distract (coherence).
   - The ambient layer is slow, pauses inside reading windows, is off under reduced motion, and is capped by audience.
6. **Build mode crowding.**
   - At most 12 things, then the board pages.
   - The camera never shows more than 60 % of the board except on the recap wide.
7. **Clips hurting clarity** (films-must-be-clear).
   - Clips are optional and short, and each is tied to an idea by its `hook` line and freeze-frame label.
   - Limits are enforced by code.
8. **Interactive pauses annoy passive viewers.** They skip themselves after 8 s, and there is a player switch "Pause for questions" (on for children, off for adults by default).
9. **Wrong audience inference.** It is always shown as one editable line, and a tap fixes it. It never guesses from names or places.
10. **Big documents.** Slow OCR on scanned books, and chapter detection without bookmarks.
    - The light intake, OCR only for the selected pages, and the card appearing as soon as topics exist.
    - Series for more than 60 pages.
11. **Merge conflicts with S10/S11 and the ongoing studio work.** E6 waits for those merges. E4 touches `timeline.ts` and `edit.ts`, which the story work also changes, so land it in small commits and run the full client tests.
12. **Mobile performance.** Parallax, breathing and more sounds cost CPU.
    - Check with `?perf` on a mid-range phone.
    - The `perf.ts` fallback keeps only the drift on low-end devices.
13. **Licensing.** Only CC0, Sonniss or Pixabay-with-conditions sounds, with credits recorded. The Kenney UI packs are CC0. Any other source needs Richard's OK.

---

## Decisions (Richard, 2026-09-30)

- **Documents uploaded in Studio stay out of the reader's documents screen.** They are Studio-only (`origin: 'studio'`, hidden from the library).
- **Story clips:** the model decides whether a scene becomes a story cutaway. There is no maker switch by default, and the code limits in Ask 5 still apply.
- **Studio will become its own standalone app.** New explainer work keeps Studio code in Studio modules with clean boundaries: no new coupling to the reader, library or Teach Me beyond shared domain helpers, and shared helpers are imported, not reached into.
- **Other open choices take the plan's recommendations:**
  - Sunny for children;
  - checkpoints on for children, off for adults;
  - Studio speed 0.75–1.5;
  - order E0 → (E1, E2, E3) → (E4, E7) → (E5, E6, E8) → E9.

## Decisions for Richard (original questions)

1. **The six themes and their names.** Is the default for children Sunny, or does everyone start on Paper?
2. **Clips on by default ("auto"), or only when asked?** Recommended: auto, with at most 2 per episode.
3. **Should Studio uploads appear in the reader library too** (so Teach Me works on them)? Recommended: yes.
4. **Pause-and-think checkpoints:** on for children and off for adults by default? Recommended: yes.
5. **The speed menu range:** 0.75–1.5 in Studio (2× is left out, because the music stops above 1.25×). Recommended: yes.
6. **Order:** E0 → (E1, E2, E3) → (E4, E7) → (E5, E6, E8) → E9, as above? Or start with documents (E7) if uploads matter most to users right now.

---

## Sources

- Mayer's principles (signalling, segmenting, redundancy, coherence, modality): [Devlin Peck: Mayer's 12 principles](https://www.devlinpeck.com/content/mayers-principles-of-multimedia-learning); [Mayer, Multimedia Instruction (TRU)](https://eddl.tru.ca/wp-content/uploads/2020/01/mayer-multimedia-instruction.pdf); [Cambridge: Segmenting principle](https://www.cambridge.org/core/books/abs/multimedia-learning/segmenting-principle/37240877DDA0362355ADB39936027982); [Cambridge Handbook: reducing extraneous processing](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E)
- Video length and engagement: [Guo, Kim & Rubin 2014](https://summeracademy.academic.wlu.edu/files/2020/07/Guo-et-al-2014-videos-and-student-engagement.pdf); [UBC: optimal video length](https://flexible.learning.ubc.ca/news-events/optimal-video-length-for-student-engagement/)
- Caption reading speed: [Game Accessibility Guidelines: WPM by age](https://gameaccessibilityguidelines.com/ensure-that-subtitles-captions-are-cut-down-to-and-presented-at-an-appropriate-words-per-minute-for-the-target-age-group/); [Closed Caption Creator: CPS and WPM limits](https://www.closedcaptioncreator.com/blog/articles/subtitle-reading-speed.html); [Kids Read Now: captions on](https://kidsreadnow.org/blog/30-minutes-captions-on); [Capital Captions: subtitles for children](https://www.capitalcaptions.com/subtitles-and-captioning/video-subtitles-for-children/)
- Narration speed: [Speech rate and young EFL learners](https://www.researchgate.net/publication/371830992_Speech_Rate_and_Young_EFL_Learners'_Listening_Comprehension); [GoTeleprompter: speaking rate guide](https://goteleprompter.com/blog/words-per-minute-speaking-rate-guide/); [eLearning timing in WPM](https://kimhandysidesvoiceover.com/2022/08/16/timing-in-elearning-videos/)
- Build-up and progressive drawing: [Successful learning with whiteboard animations (Heliyon, PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9898452/); [Türkay et al., whiteboard animations and retention](https://www.researchgate.net/publication/298423912_The_Effects_of_Whiteboard_Animations_on_Retention_and_Subjective_Experiences_when_Learning_Advanced_Physics_Topics); [Progressive disclosure in eLearning](https://community.articulate.com/blog/e-learning-challenges/how-are-designers-using-progressive-disclosure-in-e-learning-463/1133899)
- Explainer craft: [How Kurzgesagt videos are made (10.studio)](https://10.studio/the-incredible-amount-of-work-behind-kurzgesagts-beautiful-animated-videos/); [Kurzgesagt: what we do](https://kurzgesagt.org/what-we-do?visit=videos); [Manim explained](https://nibble-app.com/blog/manim)
- Motion design: [Disney's principles in UI (Marvel)](https://marvelapp.com/blog/disneys-motion-principles-in-designing-interface-animations/); [Toptal: motion design principles](https://www.toptal.com/designers/ux/motion-design-principles); [UX in Motion: UI animation principles](https://medium.com/ux-in-motion/ui-animation-principles-disney-is-dead-8bf6c66207f9)
- Colour and accessibility: [Okabe–Ito palette](https://easystats.github.io/see/reference/scale_color_okabeito.html); [Colour-blind palettes and SC 1.4.11](https://fuselabcreative.com/color-blind-friendly-palette/); [Adobe colour-blind safe tool](https://color.adobe.com/create/color-accessibility)
- Worked examples and narrative: [Worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect); [Narrative-based e-learning and cognitive load](https://www.researchgate.net/publication/352755011_The_effect_of_narrative-based_E-learning_systems_on_novice_users%27_cognitive_load_while_learning_software_applications); [NSW CESE: cognitive load theory](https://education.nsw.gov.au/content/dam/main-education/about-us/educational-data/cese/2017-cognitive-load-theory.pdf)
- Sound design: [Motion The Agency: sound design for explainers](https://www.motiontheagency.com/blog/sound-design-for-explainer-videos); [MyTasker: levels, mixing and ducking](https://mytasker.com/blog/the-complete-guide-to-sound-design-for-video-creators); [Krotos: designing whooshes](https://www.krotosaudio.com/how-to-design-whoosh-sound-effects/)
- TTS pace controls: [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation); [ElevenLabs speed control](https://elevenlabs.io/docs/eleven-agents/customization/voice/speed-control); [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI); [OpenAI TTS (Spring AI reference)](https://docs.spring.io/spring-ai/reference/api/audio/speech/openai-speech.html)
- Readability: [Readable: Flesch–Kincaid](https://readable.com/readability/flesch-reading-ease-flesch-kincaid-grade-level/); [Dale–Chall formula](https://en.wikipedia.org/wiki/Dale%E2%80%93Chall_readability_formula)

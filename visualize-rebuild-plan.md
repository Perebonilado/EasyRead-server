# Visualize, rebuilt — plan

**As built, 22 Sep 2026**, on `visualize-rebuild` in both repos, committed
locally and not pushed. Everything below is in, with these differences:

- **No thinking by default.** `SCENE_DRAW_THINKING` is off; the spike was
  folded into the build, and Flash without thinking drew well.
- **One slot function.** Rows share their width by each thing's
  proportions (`slotsOf`), so a wide drawing beside a round one is not a
  strip; the layout spec uses the same function.
- **Framing is always to the ink.** A drawing is framed round its ink
  unless it already fills its canvas; any spill past the edge grows the
  frame. A title that repeats the caption is taken out.
- **A restated stage is effects only.** A step that restates the stage
  as it stands adds its effects, not a change.
- **Not done: stability.** Things keep the writer's order when the
  layout changes. The prompt asks the writer to keep things in place;
  code does not reorder them.

Tested on real pages from the local library with gpt-4.1, deepseek-flash
and the Kokoro voice built from this branch:

| Page | Made in | Audio | Timed by | Drawings |
| --- | --- | --- | --- | --- |
| Renal function tests, p3 | 72 s | 74 s | voice | 6 of 6 |
| Pharmacology of Alzheimer's, p5 | 88 s | 52 s | voice | 5 of 5 |
| General microbiology, p6 | 45–61 s | 47 s | voice | 5 of 5 |

Each was played in the browser in both stagings, with checks on:

- **Pause.** The drawings' own animations hold still.
- **Seek.** They jump by exactly the seek.
- **2×.** They track the audio within a frame.

Original draft follows.

---

Draft, 22 Sep 2026. Nothing is built yet. Line numbers are from the
working trees on that day: the server at `f02be9b` and the client at
`bd9361b`, each with its uncommitted Visualize edits (§10.1).

## The idea

Each page becomes a short animated explainer, like a YouTube video made
for that page. The voice explains the page. While it talks, drawings
come on, move aside, get pointed at and labelled, and go off again.
Arrows grow between them with a flow running along them. It is one
continuous stage that builds and changes as the explanation goes on,
never a flip to the next slide.

Three parties, each doing one thing:

- **OpenAI writes and directs.** One call per page writes the narration,
  names the cast, and storyboards when each thing appears, moves, is
  pointed at, or leaves. For every drawing it writes a brief for an
  illustrator who has not read the page.
- **DeepSeek draws.** One call per drawing, from its brief. Each is a
  standalone SVG with its own looping animation: the blood flows, the
  gear turns, the leaf sways.
- **Our code stages and times.** It decides where everything sits. It
  pins every change to the moment its words are spoken in the Kokoro
  audio from the Railway voice. The player then runs the scene off the
  audio clock.

The rule that keeps it sane: **the models decide what; code decides
where and when.** The writer never gives a coordinate, and the artist
never sees the stage. Layout is a handful of templates computed in code,
so nothing can overlap or fall off the edge. Timing comes from the
measured audio, never from a model counting words.

### Twenty seconds of it

| s | Voice | Stage |
| --- | --- | --- |
| 0.0 | "Plants make their own food." | A leaf wipes on, centre; its veins shimmer (its own loop). |
| 1.9 | "To do it, they need sunlight," | The leaf slides left. A sun pops in on the right, its rays pulsing. An arrow grows from the sun to the leaf, dashes flowing along it. |
| 4.2 | "water from the soil," | A water drop enters below with its own arrow in. The stage becomes a hub with the leaf at its centre. |
| 6.0 | "and carbon dioxide from the air." | A cluster of CO₂ bubbles drifts in; a third arrow. |
| 8.6 | "All three meet inside the leaf, in tiny parts called chloroplasts." | Sun, drop and bubbles leave. The leaf grows to fill the stage, the camera pushes in, and the chloroplasts glow as their label appears. |

### Why today's plays nonsense

Found while mapping it (the inventory is §10):

- **Pictures are looked up by name, not drawn for the idea.** The cast
  is a list of nouns matched to a drawing library by spelling and
  embeddings. The drawer fills the gaps from the bare term. A page gets
  whatever its nouns matched, and "page", "rules" and "voice" came back
  as grey boxes (`drawings/tried-page.png`). Nothing is drawn for what
  the sentence is explaining.
- **The staging is rules applied to the narrator's tags.** Both paths do
  it: `cards`, the default, and `events`, which this checkout's `.env`
  runs. Either way a narrator's tags ("introduces", "connects",
  "compares") become cues by rule. A relationship gets whatever form the
  rule has for its verb. A thing the library cannot place becomes a card
  with its name in it (685c450).
- **The player's motion runs on the wrong clock.** Entrances and pulses
  are fire-and-forget Web Animations on wall-clock time
  (`visual-pane.tsx` 2550–2773). They do not pause with the audio, do
  not follow a seek, and ignore 1.25–2×.
- **Nine layers, each patching the last.** Plan, narrate, direct, menu,
  layout, repair, judge, redo and ship-plain. What reaches the screen is
  whatever survives them all. Most of the last twenty commits went into
  the drawing gate and the rasteriser, not into what a learner sees.

## 0. Decisions fixed here

| Question | Decision |
| --- | --- |
| Replace, or run beside? | Replace, on a branch in each repo. No `VISUAL_STAGE`/`VISUAL_DIRECTOR`-style switch keeping the old way alive: git history is the way back. |
| What stays | The player shell (`visual-pane.tsx` 1–2083): transport, captions, full screen, page to page, Up next, More videos, autoplay, the position memory, polling, prefetch. On the server: the five handlers and `queueVisuals` (`visual.handlers.ts`), every route but `/sheet`, `visual_positions`, the ahead policy (`visual-ahead.ts`), the admin batch, and the `visual-scene` queue (concurrency 3, two attempts). |
| Who writes | OpenAI. One `generateObject` call per page returns narration, cast and storyboard. Task `scene_write`, variable `AI_MODEL_SCENE_WRITE`, default `openai:gpt-4.1`. The spike measures `gpt-4.1-mini` against it; the cheaper wins if it holds up. |
| Who draws | DeepSeek. One `generateText` call per drawing, the SVG taken out of the reply (79c2523). Task `scene_draw`, variable `AI_MODEL_SCENE_DRAW`, default `deepseek:deepseek-flash` (V4.1 Flash). It has a default of its own and never falls back to `AI_MODEL_DEFAULT`: 2161504 found every "DeepSeek" drawing had been drawn by gpt-4o-mini. |
| Library | None. Every picture is drawn by DeepSeek for its page, when the page is made, from what the page says. Nothing is looked up by name, drawn in advance, or carried to another page. |
| Where things go | Code. Seven layout templates, computed on the server for both stagings, box 4:3 for the pane and wide 16:9 for full screen, shipped as rectangles per step. |
| When things happen | Every change is anchored to a phrase copied verbatim from its sentence. Word times come from Kokoro itself (§5), then echogarden, then an estimate inside the sentence; the voice already reports where each sentence starts. |
| Motion inside a drawing | The artist's own CSS keyframes or SMIL. The player drives it from the audio clock, so it pauses, seeks and speeds up with the voice. |
| Motion of the stage | Code: enter, leave, move, arrows, pointing, camera. Each is a pure function of audio time. |
| Where a scene is kept | A JSON file in the bucket beside its mp3. The row keeps status, keys, title and duration. |
| Security | The server sanitises every SVG to an allowlist. The client sanitises again and gives each drawing its own shadow root. |
| Generator | `scene-1`. Every `visual-4` row, plan and term is deleted by migration. |
| Deploy | Server and client ship together, as last time. |

## 1. One page, end to end

```
material ─► WRITE ─► check ─┬─► DRAW ×N, in parallel ─► gate ─────┐
            (OpenAI)        │   (DeepSeek)                         ├─► COMPOSE ─► store
                            └─► VOICE ─► TIME ─────────────────────┘
                                (Kokoro on Railway)
```

Drawing and voicing run side by side, since both need only the script.
The row's `step` walks `writing → drawing → voicing → timing →
composing`.

1. **Material.** The existing helper, unchanged: the simplified note,
   else the page's text, up to 14,000 characters. The writer is told
   where the page sits: the chapter title and range, and the titles of
   the pages before it that are made. A page under 40 words is still
   `not_suitable`. The chapter plan call and its table go; the writer
   does not need them.
2. **Write.** One call returns a `SceneScript` (§2).
3. **Check**, in code only.
   - Every anchor is found in its sentence, and every id is known.
   - Counts are in bounds, and each layout is legal for what it shows.
   - The cadence is estimated from word counts.
   - Code mends what it can: it drops an unknown id, moves a lost anchor
     to its sentence's start, and trims an overfull stage to its newest
     things.
   - What is left goes back in one repair call, with the list. After
     that the page ships with the mends: a storyboard fault never fails
     a page.
4. **Draw.** A page's drawings are drawn at once, at most 8 in flight.
   Each passes the gate (§3), gets one retry with the gate's notes, then
   ships what renders. If nothing renders, a type card stands in: the
   thing's name in the reading font, gently floating. No drawing blocks
   the page.
5. **Voice.** The sentences go to `UPLOAD_SPEECH` as pieces with a pause
   after each (§5). Back come the mp3, where each piece starts and, new,
   word times.
6. **Time.** Anchors become milliseconds, and the cadence rule is applied
   (§5).
7. **Compose.**
   - Both stagings are laid out (§4) and the `SceneDto` assembled (§6).
   - The thumb is a still of the fullest step. It goes through the
     child-process rasteriser, placed with transforms rather than nested
     `<svg>`, with every drawing's ids namespaced (29050a6, f2e4368).
8. **Store.**
   - The bucket gets `…/p{n}-scene-1-scene.json`,
     `…-{voice}-{model}.mp3` and `…-thumb.png`.
   - The row goes to `done` with its title, duration and keys.
   - The ledger gets `scene_write`, one `scene_draw` per call, and
     `tts_visual`.

A page fails only when the write call or the voice fails through the
queue's attempts. Everything else degrades.

## 2. The writer (OpenAI)

```ts
SceneScript = {
  fit: 'good' | 'poor';
  fitReason: string | null;         // one sentence, shown when poor
  title: string;                    // ≤ 60 characters, the video card's title
  beats: { say: string; pause: 'short' | 'long' }[];    // 5–30 spoken sentences
  cast: Thing[];                    // ≤ 12, of which ≤ 8 drawings
  steps: Step[];                    // the storyboard, in order
}

Thing =
  | { id: string; kind: 'drawing';
      name: string;                 // 1–3 words, the page's own; shown as its caption
      brief: string;                // what to draw, for an illustrator who has not read the page
      motion: string;               // what moves while it is on screen, and why
      parts: { name: string; label: boolean }[];  // ≤ 8 things the voice names inside it
      states: { name: string; look: string }[];   // ≤ 3 overlays shown later ("the bulb lit")
      shape: 'square' | 'wide' | 'tall' }
  | { id: string; kind: 'stat'; value: string; caption: string }        // "70%", "1.5 million", as on the page
  | { id: string; kind: 'words'; text: string; style: 'title' | 'keyword' }   // ≤ 4 words

Step = {
  at: { beat: number; phrase: string };   // 1–5 words copied exactly from that beat
  stage?: {                               // absent: the stage stays as it is
    layout: 'one' | 'row' | 'grid' | 'compare' | 'hub' | 'cycle' | 'focus';
    show: string[];                       // ids on stage after this step, in slot order
    arrows: { from: string; to: string; label: string | null; flow: boolean }[];
  };
  effects?: { target: string; do: 'point' | 'show' | 'hide' | 'pulse' | 'zoom' }[];
  // target: an id; id.part for point or pulse; id.state for show or hide
}
```

Each step says what stands on the stage after it, the way a storyboard
panel does, rather than listing adds and removes. A panel read on its
own says what is on screen, and code works out who enters, who leaves
and who moves. A step with only effects is a moment on the same stage,
such as naming the next part of a diagram.

What the prompt asks for, in substance:

- **Narration.**
  - A friendly teacher explaining this page to someone who finds reading
    hard.
  - Faithful: nothing that is not on the page, beyond everyday framing.
  - Sentences of 6–22 words, about 60–120 seconds in all, longer only for
    a dense page.
  - It makes sense heard alone, and points at the stage now and then
    ("here", "watch").
- **Visual grammar by what the page is saying.**
  - A thing: one drawing, then point at its parts in turn.
  - A process: a row with flowing arrows, left to right.
  - A cycle: a cycle.
  - Two things set against each other: compare.
  - Many causes of one effect: a hub.
  - Cause and effect: an arrow.
  - A number: a stat.
  - A new term: a keyword, briefly.
  - Before and after: a state shown later.
- **Cadence.** The stage changes every sentence or two, roughly every 15
  spoken words. Each step is anchored on the words that name what
  appears.
- **Crowding.**
  - At most 4 things on stage, or 5 in a row or hub.
  - Within the page, bring back a thing already drawn rather than draw
    its twin.
  - Send off what the voice has left behind.
- **Briefs.**
  - Concrete and drawable: one subject, and the view (side,
    cross-section).
  - Say what must be visible and which parts are labelled.
  - Schematic, textbook style.
  - No maps of real places, real people's faces, logos or gore.
- **Motion.**
  - It shows how the thing works: flow, turning, growth, beating.
  - Calm, one to six seconds a cycle.
  - Nothing flashes.
- **Poor fit.** Only for a page this cannot teach: an index, references,
  a bare table, a blank.

It carries one worked example, on a subject outside the golden set, and
says the example is a register, not a menu. In f3f18ed a worked example
came straight back as an answer.

It is `generateObject`, like every structured call in the adapter.
`ai` 7.0.64 marks `generateObject` deprecated in favour of `generateText`
with an output setting. Moving the adapter off it is its own change, not
this one.

**One call, not two.** The words and the pictures are designed together.
Narration written without the stage cannot point at it. A storyboard
fitted afterwards has to guess its anchors. One call also takes a round
trip off the wait. If the spike finds the narration suffers, it splits
into write then direct, with the same schema.

## 3. The artist (DeepSeek)

One call per drawing. The system prompt is identical on every call, so
DeepSeek bills it at its cheaper rate for a repeated prompt. Only the
instructions repeat: every drawing is new.

The user message carries:

- the brief, the motion, the parts and states, and the shape;
- one line of context: the lesson's subject and what the drawing will
  stand beside, so scale and style agree.

The system prompt, in substance:

- **House style.**
  - Flat illustration with clean shapes.
  - A fixed palette: the stage's colours and neutrals.
  - Two or three tones to a shape.
  - One dark outline weight, round caps and joins.
  - Soft gradients are fine; photorealism is not.
  - A transparent background, never a backdrop rectangle.
- **Canvas.** The viewBox follows the shape: square 800×800, wide
  960×600, tall 600×800, drawn inside a margin.
- **Structure.**
  - Each named part is a `<g id="part">`.
  - Its label, text and leader line, is `<g id="part-label">`.
  - Each state is a `<g id="state">` drawn over the base, fully visible
    in the file; the player hides it until its moment.
  - Labels only where asked, at font-size 28 or more at this scale. The
    player sets the font.
- **Motion.**
  - CSS `@keyframes` in one `<style>`, or SMIL.
  - CSS animates only `transform`, `opacity`, `fill`, `stroke` and
    `stroke-dashoffset`.
  - Anything that turns or scales sets `transform-box: fill-box` and its
    `transform-origin`.
  - A path changes shape only through SMIL `<animate
    attributeName="d">`. Safari will not animate CSS `d`.
  - Loops run 1.5–8 seconds and are `infinite`.
  - An optional build-in runs in the first 1.5 seconds.
  - Nothing changes brightness or colour more than three times a second.
- **Never.** Script, `foreignObject`, `image`, links, external URLs, event
  attributes, `@import`, web fonts.
- **Reply.** Only the SVG.

Thinking is set explicitly on every call, through
`providerOptions.deepseek.thinking`, from `SCENE_DRAW_THINKING`. The spike
chooses the default: on draws better geometry, off is quicker and
cheaper.

- The API thinks by default on `deepseek-flash`.
- The installed `@ai-sdk/deepseek` 3.0.39 only knows `deepseek-reasoner`
  and `deepseek-v4*` as thinking models.
- Left unset, the provider and the API would disagree.

No DeepSeek option is passed anywhere in the adapter today.

**The gate** (`scene-svg.ts`, grown out of today's `visual-svg.ts`):

1. **Parse.** A real XML parser must find one `<svg>`. Its viewBox is four
   finite numbers with a positive size. Nothing reaches resvg until it
   has passed (861bad6).
2. **Sanitise** to an allowlist.
   - Elements: shapes, `g`, `defs`, gradients, `clipPath`, `mask`,
     `filter` and the common `fe*`, `text`/`tspan`, `style`, and SMIL
     `animate`, `animateTransform`, `animateMotion`, `mpath` and `set`.
   - `href` only to `#…`.
   - SMIL `attributeName` from a list that never includes `href`: the
     classic SMIL script hole.
   - CSS loses `@import`, `url()` to anything but `#…`, `expression` and
     `javascript:`.
3. **Mend**, without asking.
   - A first shape covering 85% or more of the canvas is a backdrop, and
     is removed.
   - The viewBox is pulled in around the ink, with room for motion
     (today's `framed()`).
   - Ids are keyed on letters, so `renal pelvis`, `renal-pelvis` and
     `renalPelvis` agree (242b871).
   - Every id, class and keyframe name is prefixed with the thing's id.
4. **Check.** Each failure is a note for the retry.
   - It renders in the child process and has ink (b8a4b01).
   - It is at most 80 KB and 600 elements.
   - Every part asked for has a non-empty group.
   - It moves when motion was asked for: a keyframes rule in use, or a
     SMIL element.
   - Labels come out at 20 or more at render scale.
   - A brightness or colour cycle faster than three a second is slowed
     to one second without asking.

After the retry it ships if it renders. A missing part turns its point
into a pulse of the whole drawing. A drawing that does not move gets the
stage's gentle float. One that will not render at all becomes the type
card.

**No library, and no reuse.** Every picture is drawn for its own page.
Nothing is kept for another page, even in the same document. A kidney
on page 12 and a kidney on page 14 are drawn twice, each for what its
own page says (Richard, 22 Sep).

**One drawing, start to finish.** The brief the writer gives for a
photosynthesis page:

```
Draw: a cross-section of a green leaf. Shape: wide.
Show: the waxy top skin, a row of tall cells packed with small oval
chloroplasts, loose round cells below, two small openings on the underside.
Parts, each its own group: chloroplasts (labelled), stomata (labelled).
Moves: small bubbles rise out of the openings and fade, every few seconds;
the chloroplasts glow softly.
Context: a lesson on how plants make food; it stands beside a sun and a
water drop.
```

What comes back from DeepSeek, shortened:

```svg
<svg viewBox="0 0 960 600" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes rise { to { transform: translateY(-70px); opacity: 0 } }
    @keyframes glow { 50% { fill: #7bd389 } }
    .bubble { animation: rise 2.6s ease-out infinite }
    .chloroplast { animation: glow 3s ease-in-out infinite }
  </style>
  <g id="leaf">…the skin, the tall cells, the loose cells…</g>
  <g id="chloroplasts"><ellipse class="chloroplast" …/>…</g>
  <g id="chloroplasts-label"><line …/><text …>chloroplasts</text></g>
  <g id="stomata"><path …/><circle class="bubble" …/>…</g>
  <g id="stomata-label"><line …/><text …>stomata</text></g>
</svg>
```

On the stage:

- The leaf comes on with its labels hidden, and the bubbles rise for as
  long as it stays.
- At "tiny parts called chloroplasts", the chloroplasts label fades in
  and a ring circles them.
- At "openings on the underside", the stomata label follows.
- When the voice pauses, so does the leaf.

**Not in the first version: a judge.** V4.1 Flash reads images, so
looking at the rendered PNG against the brief would be one cheap call.
It comes in only if the golden set shows drawings that pass the gate and
still do not look like their names.

## 4. The stage (code)

**Design spaces.** Wide is 1600×900 and box is 1200×900. They share a
height, so type sizes match.

**Seven templates**, each a function of (how many, staging) that gives
slots:

| Template | Shape |
| --- | --- |
| `one` | One thing, large, centred. |
| `row` | 2–5 in reading order. In the box, 4 or 5 wrap to two lines. |
| `grid` | Four, as 2×2. |
| `compare` | Two halves with a divider, the two names as headers. |
| `hub` | One in the centre, 2–5 around it. |
| `cycle` | 3–5 on a ring, the arrows following the ring. |
| `focus` | One large, about 60% across, with 1–3 small in a column beside it. |

**Fit.**

- A drawing keeps its proportions inside its slot.
- Its caption sits under it: the name, in the reading font, at the
  staging's size, at most two lines.
- A stat is a big number with its caption, and it counts up as it
  enters.
- Words are a chip or a title.

**Stability.** When the template changes, things already on stage keep
their order, so the moves are short and easy to follow.

**Entrances**, chosen by code:

- Pop by default.
- Slide in from the right in a row.
- Wipe for a wide drawing.
- Grow out of its source when an arrow joins it to something already
  there.
- Newcomers in one step come 180 ms apart.

**Arrows.**

- Computed on the client every frame from the current rectangles, so
  they follow things as they move.
- An arrow leaves from the side facing its target and stops short of it.
- It curves on a cycle.
- A label sits on a pill at the middle.
- `flow` sends dashes marching along it, the stage's steady motion.

**Output.** For each staging, for each step, a place per thing:
`{ x, y, w, h, caption?: { x, y, w, size } }`.

## 5. Timing

**Pieces.** Each sentence is one piece to Kokoro, with 0.35 s after a
`short` pause and 0.8 s after a `long`. Kokoro honours `pause_after`.
The service already returns where each piece starts (`x-piece-starts`).

**Word times from the voice.** New: about 40 lines in
`speech/kokoro/voice.py`, plus the adapter.

- Kokoro 0.9.4's pipeline already puts `start_ts` and `end_ts` on every
  token of every English result.
- The renderer knows where each result lands in the page, because it
  concatenates them. `trimmed()` only has to say how much it cut from the
  head.
- With `"timestamps": true` the route answers JSON:
  `{ audio (base64), piece_starts, words: [[text, start, end], …] }`.
  JSON rather than a header, because a long page's word list outgrows a
  16 KB header limit.
- The mp3 route without the flag is unchanged, so lectures do not notice.
- `/health` reports `version: 5`. The Voice service is redeployed once.

**Fallbacks.**

- A voice that gave no words (an old deploy) is timed with echogarden,
  pinned inside each sentence's window.
- If that fails, an estimate by characters inside each sentence.
- Today's `estimateVisualWordTimes` and `pinWordTimes` logic moves into
  the new timing module. `wordTimesFromAligned` (`board.ts`) is already
  shared.

**Written to spoken.** Anchors are found in the written sentence.
`spokenForm().spans` maps them onto spoken words, so "in 1918", said as
"nineteen eighteen", still lands.

**Anchor to time.**

- The phrase is matched in its sentence, ignoring case and punctuation.
- Failing that, the best window with 60% word overlap.
- Failing that, the sentence's start, logged.
- The change starts 200 ms before the phrase's first word, the lead
  today's player uses.

**Cadence**, the "always moving" rule, enforced after timing:

- Stage changes are at least 450 ms apart; closer ones are staggered.
- Six seconds with no change and no effect gets one added: a pulse on the
  thing last named, or a slow camera push toward the focus.
- Each addition is logged as filled, so a page that needs many is
  visible.

## 6. The scene the client gets

```ts
export interface SceneDto {
  version: 3;
  page: number;
  title: string;
  durationMs: number;
  timing: 'voice' | 'aligned' | 'estimated';
  /** One per spoken sentence; one word entry per whitespace word of text: [charStart, charEnd, startMs, endMs]. */
  beats: { text: string; startMs: number; endMs: number; words: number[][] }[];
  things: (
    | { id: string; kind: 'drawing'; svg: string; aspect: number; caption: string | null;
        parts: string[];        // part ids that exist in the drawing
        hidden: string[] }      // label and state groups hidden until their effect
    | { id: string; kind: 'stat'; value: string; caption: string }
    | { id: string; kind: 'words'; text: string; style: 'title' | 'keyword' }
  )[];
  steps: {
    atMs: number;
    show: string[];
    arrows: { id: string; from: string; to: string; label: string | null; flow: boolean }[];
    enter: Record<string, { how: 'pop' | 'fade' | 'slide' | 'wipe' | 'grow'; from?: string }>;
    focus: string | null;
  }[];
  effects: { atMs: number; target: string; part: string | null;
             do: 'point' | 'show' | 'hide' | 'pulse' | 'zoom' }[];
  stagings: Record<'box' | 'wide', {
    w: number; h: number;
    /** One map per step: where each thing on stage sits. */
    places: Record<string, { x: number; y: number; w: number; h: number;
                             caption?: { x: number; y: number; w: number; size: number } }>[];
  }>;
}
```

`VisualSceneDto` becomes `{ page, title, durationMs, scene: SceneDto }`.
It is served by `GET documents/:id/visuals/:page` from the bucket file.
What the shell reads today maps straight across:

| The shell reads today | It reads instead |
| --- | --- |
| `timeline.durationMs` | `scene.durationMs` |
| `segments`, for captions through `captionAt` | `beats`. `captionAt` only needs `startMs` and each word's start, so it ports with a rename. |
| `title` | `title` |
| `stagings[s].space`, for the aspect | `stagings[s].w` and `.h` |
| `moments`, for the ticks, ←/→ and n/N | the times of steps that change the stage |

`VisualPageDto.timing` gains `'voice'`, and `step` takes the new names.

## 7. The player's new stage (client)

`SceneStage` replaces `SceneCanvas` at the shell's two call sites (1343
and 1465). The rest of the shell stays.

**Clock.**

- It takes `clock: () => number`, the audio time in milliseconds.
- It runs its own `requestAnimationFrame` and writes styles directly.
- React renders only when the set of things on stage changes.
- Today the whole Player re-renders every frame through `setMs`. The
  shell keeps `ms` for the scrubber and captions, updated ten times a
  second.

**Layers**, bottom to top:

1. The stage colour.
2. The drawings. Each is an absolutely placed box whose shadow root holds
   the sanitised SVG and a small reset: the reading font forced, overflow
   visible.
3. One overlay SVG for arrows, captions, stats, words and the pointing
   ring.

**Everything is a function of t.**

- A place moves from one step's rectangle to the next over 700 ms,
  easing in and out.
- Entrances and exits take 450 ms from their step's time.
- A drawing's own animation runs on its local time: t minus the moment it
  entered.
  - CSS: `shadowRoot.getAnimations()`, paused once, then `currentTime =
    local` every frame.
  - SMIL: `pauseAnimations()`, then `setCurrentTime(local / 1000)`.
- So pause, seek and 1.25–2× stay in step with the voice, which today's
  player cannot do.

**Effects.**

- `point`: the part's label group fades in, hidden until then. A ring is
  drawn round the part's box (`getBBox`, mapped to the stage) for 1.5 s.
- `show` and `hide`: a state group fades in or out.
- `pulse`: the thing or part scales to 1.06 and back.
- `zoom`: the camera pushes toward a thing until the stage next changes.
- The camera also drifts 1.00 → 1.03 toward the focus across each step.

**Reduced motion.** Under `prefers-reduced-motion`:

- fades only;
- no camera;
- drawings held still at 1.5 s of their own time;
- arrows without flowing dashes.

**A second sanitiser.**

- DOMPurify with a scene profile that allows `<style>` and SMIL.
- A hook enforces the `attributeName` list and strips CSS `url()`.
- Today `Drawn` injects model SVG through `dangerouslySetInnerHTML` with
  no sanitising at all (2935–2951).
- `sanitizeSketchSvg` cannot be reused: it strips `<style>` and
  `<animate>`.

**Load.** At most five drawings are live at once. Each container has
`will-change: transform`, and a thing is unmounted after it leaves.

**Shell edits.**

- `loadScene` keeps `scene` rather than `timeline` (812–847).
- `captionAt` moves into the new module.
- The loader's `Sketch` stops building a figure (595–670) and becomes a
  quiet animated placeholder.
- `STAGE`, `GRID`, `STAGE_EDGE` and `PAINT` move to a small theme file:
  Cover, Up next and the cards use them.
- `STEP_LINE` gets the new step names.
- The admin "Stills" button and `/sheet` go; the thumb stays.
- The mobile sheet's title map gains `"visuals"`. Today that sheet reads
  "Chat" (`reader-shell.tsx` 513–525).

## 8. Cost and time per page

These are estimates at DeepSeek's peak prices; the spike replaces them
with the ledger's numbers. Off-peak, DeepSeek is half.

| Part | Assumption | Per page |
| --- | --- | --- |
| Write, `gpt-4.1` | 6k tokens in, 2.5k out | ≈ $0.03 (`gpt-4.1-mini` ≈ $0.006) |
| Draw, `deepseek-flash` | 6 drawings × ~4k out at $1.20/M, 20% retries; system prompt at the cache-hit rate | ≈ $0.03, up to $0.06 thinking |
| Voice, Kokoro on Railway | 90 s at $0.10 an audio hour | ≈ $0.003 |
| **Total** | | **≈ $0.04–0.10** |

One Visualize press queues the learner's chapter, so a 20-page chapter
is about $1–2 and a 300-page book $12–30. That is more than the rest of
a document costs: $3 on the last plan's numbers. The levers, in order:

1. The writer on `gpt-4.1-mini`, if it holds up.
2. Thinking off.
3. At most 6 drawings a page.
4. School batches queued for DeepSeek's off-peak hours.

Drawing everything fresh for each page is the deliberate cost here.
Nothing is reused to save calls.

The ledger needs two fixes, or it misprices every drawing:

- `cost.ts` prices only `deepseek-chat` and `deepseek-reasoner`, so a
  `deepseek-flash` call would be logged at a cost of null. It gets
  `deepseek-flash` at $0.30 in and $1.20 out, and `deepseek-v4-pro`.
- The adapter reads only total input tokens. The provider also reports
  the cache-hit share (`inputTokens.cacheRead`), which has to be priced
  at the hit rate, $0.006/M.

**Time.**

| Part | Time |
| --- | --- |
| Writing | about 20–40 s |
| Drawing | 40–120 s in parallel, the slow end with thinking |
| Voicing and timing | 15–40 s, alongside drawing |
| Composing | a few seconds |

That is about 1.5–3 minutes a page, much as the wait is now.

The upload voice allows two requests at once, and lecture voicing shares
those slots (`KOKORO_HOME`). A busy worker can make voicing wait.

## 9. Build order

**Phase 0 — spike, 1–2 days, nothing merged.** Three questions, each
answered by something Richard can look at:

1. **Can DeepSeek draw and animate to the contract?**
   `scripts/scene-spike.ts` sends ten briefs, one per golden subject, to
   `deepseek-flash` with thinking on and off, and to `deepseek-v4-pro`.
   The output is a gallery page with every SVG live, and its brief,
   tokens, seconds and cost.
2. **Can the player hold drawings to a clock?** A bare HTML page puts
   three drawings in shadow roots, driven by a fake clock with a scrubber
   and speed buttons. It is checked in Chrome, Firefox, Safari and iOS
   Safari.
3. **Are Kokoro's own word times good enough?** One page is run through
   the changed voice in Docker and compared with echogarden on the same
   audio.

It goes ahead if:

- at least 8 of the 10 drawings are recognisable and animated within two
  tries;
- the drawings' own animation pauses, seeks and speeds correctly in every
  browser;
- word starts agree with echogarden within about 80 ms.

**Phase 1 — server, one PR.**

- Take the old pipeline down (§10).
- New domain files, flat like the rest of the folder:

  | File | Holds |
  | --- | --- |
  | `scene-script.ts` | the schema's types, the checks and the mends |
  | `scene-svg.ts` | the gate |
  | `scene-layout.ts` | the templates, and `measureText` carried over from `visual-font.ts` |
  | `scene-timing.ts` | word times, anchors and cadence |
  | `scene-compose.ts` | the `SceneDto` and the thumb |
  | `scene-raster.ts` | the child-process rasteriser |

- `scene.processor.ts`, on the same `visual-scene` queue.
- Two LLM methods, `sceneScript` and `sceneDrawing`.
- The voice change and migration `0053`.
- The ledger tasks and the tests (§11).
- `npm run scene:page -- --doc <id> --page <n>`. It runs the real
  processor for one page against the local stack, and writes the scene,
  the mp3, every SVG and a gallery of the drawings to the scratch folder.

**Phase 2 — client, one PR.**

- The contract, and `SceneStage`.
- The shell edits and the second sanitiser.
- Delete `src/lib/visual/**` and the old renderer.

**Phase 3 — once it plays well.**

- Off-peak batches.
- The judge, if the golden set asks for it.
- An admin still per step, if reviewing wants it.

## 10. What comes down, and what stays

### 10.1 Before starting

Both repos have uncommitted Visualize work: drawing the library's
missing terms during a lesson, and the renderer taking a drawing's own
markup.

- Server: `visual-render.ts`, `visual.ts`, `visual-scene.processor.ts`.
- Client: `visual-pane.tsx`, `contracts.ts`, `packs/drawn.ts`.

All of it is in code this plan deletes. It is either committed to `main`
as the last of the old pipeline, so the way back is one revert, or
discarded. Richard's call (§13). The rebuild then starts from a clean
tree on `visualize-rebuild` in each repo. Nothing is pushed without his
say.

### 10.2 Server

Nothing outside Visualize imports the visual code. The only non-visual
files that touch it use it for visual work.

**Carried out first.** These pieces are proven and move into the new
files before the old ones go:

| From | What | To |
| --- | --- | --- |
| `visual-svg.ts` | `framed`, `boxOf`, `partsOf`, `renderable`, `idKey`, the allowlist | `scene-svg.ts` |
| `visual-render.ts` | `rasterise`, with `scripts/rasterise-one.js` as its child | `scene-raster.ts` |
| `visual.ts` | `sceneSpoken`, `estimateVisualWordTimes`, `sentenceWindows`, `pinWordTimes` | `scene-timing.ts` |
| `visual-font.ts` | `measureText` | `scene-layout.ts` |

**Deleted.**

- **Domain.** `visual.ts`, `visual-cards.ts`, `visual-direct.ts`,
  `visual-draw.ts`, `visual-figures.ts`, `visual-font.ts`,
  `visual-icons.generated.ts`, `visual-layout.ts`,
  `visual-mechanisms.ts`, `visual-menu.ts`, `visual-presets.ts`,
  `visual-render.ts`, `visual-stage.ts`, `visual-svg.ts`,
  `visual-vectors.ts` and `visual-vectors.generated.ts`, all in
  `src/business/domain/`. Also the whole `living.generated/` folder.
- **Their specs.** `visual.spec.ts`, `visual-cards.spec.ts`,
  `visual-direct.spec.ts`, `visual-direct-stage.spec.ts`,
  `visual-director.spec.ts`, `visual-draw.spec.ts`,
  `visual-figures.spec.ts`, `visual-layout.spec.ts`,
  `visual-mechanisms.spec.ts`, `visual-presets.spec.ts`,
  `visual-render.spec.ts`, `visual-stage.spec.ts`,
  `visual-vectors.spec.ts` and `motion.spec.ts`. `visual-ahead.spec.ts`
  stays.
- **The processor.** `visual-scene.processor.ts`, replaced by
  `scene.processor.ts`.
- **The LLM layer.**
  - Seven methods: `visualPlan`, `visualJudge`, `visualNarration`,
    `judgeDrawings`, `thingDrawing`, `stageNarration` and
    `visualDirector`.
  - Each sits in one block per file: the port at 475–580, the adapter at
    701–991, the fake at 514–757. Their imports go too: port 7 and
    196–201, adapter 4, 7, 25–33 and 46–51, fake 6 and 22–27.
  - Their schemas in `schemas.ts`: 2–8, 459–689, 763–799 and 858–1001.
  - Their prompts in `prompts.ts`: 1160–1720, 1763–1816 and 1830–1871.
  - In `models.ts`: `TASK_SHARED`, and the `AI_MODEL_VISUAL_*` and
    `AI_MODEL_THING_*` entries.
  - The `LlmTask` names `visual_plan`, `visual_script`, `visual_repair`,
    `visual_judge`, `visual_narration`, `visual_director`, `thing_form`
    and `thing_draw`. `sketch_judge` stays for `judgeSketch`.
- **Already dead, in the same sweep.** `objectOrJson`, `withoutNulls`,
  `visualTutorialSchema`, `thingFormSchema`, `PROMPTS.thingForm`, and
  the repository's `missingTerms`.
- **Models.** `visual-plan.model.ts` and `visual-term.model.ts`, with
  their lines in `models/index.ts`.
- **Scripts.** `visual-accept.ts` (it writes into the client),
  `visual-draw.ts`, `visual-embed.ts`, `visual-motion-sheet.ts`,
  `visual-rules-check.ts` and `visual-stage-check.ts`.
- **The rest.**
  - The `visual:draw` and `visual:accept` npm scripts.
  - `docs/visual-motion-sheet.png`.
  - `drawings/`, which git ignores.
  - The `living.generated` entry in `eslint.config.mjs`.
  - The `/sheet` route.

**Edited in place.**

- **`visual.handlers.ts`.**
  - The generator comes from the new files.
  - `VisualSceneHandler` wants a `scene_key` rather than a timeline.
  - `timing` takes `'voice'`.
  - Access, `queueVisuals` and positions are untouched.
- **`visuals.controller.ts`.**
  - `GET :page` serves the scene JSON.
  - `/thumb` reads `thumb_key`, with no film fallback.
  - `mode` is passed through (§10.6).
- **The repository and `visual-scene.model.ts`.** They lose the plan
  and term methods, and gain `sceneKey` and `thumbKey` in place of
  `timeline`.
- **`contracts/index.ts` 868–970.** `VisualTimelineDto` gives way to
  `SceneDto`, and `VisualSceneDto.timeline` becomes `scene`.
- **`materials.query.ts`.** Only its import of the generator changes.
- **`worker.module.ts` and `worker-runner.service.ts`.** The new
  processor on the same queue.
- **The ledger.** `cost.ts` and the adapter's usage (§8).
- **The voice.** `voice.port.ts`, `modal-speech.adapter.ts` and
  `speech/kokoro/voice.py` gain word timestamps (§5). The Modal home
  gets them free, since it shares `voice.py`.
- **`package.json`.**
  - `@resvg/resvg-js` moves to `dependencies`. The worker and the API
    load it at runtime, yet it is a devDependency today.
  - `scene:page` and `scene:spike` are added.
- **`.env.example`** (§10.5).

**Untouched.**

- Lecture code: `board.ts`, `spoken.ts`, `speech.ts`, `follow.ts`,
  `delivery.ts`, and `lecture-ahead.ts`, whose `runwayDue` the kept
  `visual-ahead.ts` still uses.
- The voice and the models: the echogarden aligner, `ModalSpeechAdapter`
  and `UPLOAD_SPEECH`, `ModelRegistry` and its DeepSeek provider.
- The queue and the admin: `enqueueKeyed`, `VisualsMaterialsHandler`,
  `admin-materials.controller.ts`, `batches.ts`, and `MaterialDto.visuals`
  and `BatchDto.visuals`.
- Image search, which only shares the name: `VisualizeHandler`,
  `visualize_query`, the highlight route.
- The other drawing tasks: `sketch`, `lecture_sketch`, `diagram`,
  `sketch_judge` and `embed`.

### 10.3 Client

| Goes | Why it is safe |
| --- | --- |
| `src/lib/visual/**`: geometry, figures, mechanisms, packs, presets, strokes, staged, scene, motion, font, `icons.generated.ts` | Nothing but `visual-pane.tsx` imports it. There are no client tests. |
| `visual-pane.tsx` 2085–3876, the renderer | Replaced by `SceneStage`. |
| Contract types for the element model and timeline (`contracts.ts` 369–657) | Replaced by `SceneDto`. |
| `scripts/visual-living.mjs`, `scripts/visual-icons.mjs`, `scripts/pack-sheet.mjs` | They copy the library into the server's `living.generated/` and draw its icons, and both go. |
| devDependency `@phosphor-icons/core` | Only `visual-icons.mjs` and `icons.generated.ts` use it. |

Stays: `visualize-panel.tsx` and `reader.visualize`. Despite the name,
that is image search on a selection, and it shares no code with the
player.

### 10.4 Database

Migration `0053-scenes`:

- `DELETE FROM visual_scenes`.
- Drop `visual_plans` and `visual_terms`.
- Add `scene_key` and `thumb_key` to `visual_scenes`.
- Drop `timeline`.

`visual_positions` is untouched. `down` puts back the columns and the
tables, empty. The old files in the bucket stay as orphans: harmless,
and regenerable.

Migrations `0049`–`0052` are not deleted. `origin/main` already carries
them, so a deployed database has run them, and the repo does not edit a
migration once it has run.

Old jobs in Redis drain themselves: the processor finds no `scene-1`
row for them and returns.

### 10.5 Environment

- **Removed.** None of these has a reader outside Visualize:
  - `VISUAL_STAGE` and `VISUAL_DIRECTOR`;
  - `AI_MODEL_VISUAL_PLAN`, `_SCRIPT`, `_REPAIR`, `_JUDGE`, `_NARRATION`
    and `_DIRECTOR`;
  - `AI_MODEL_THING_FORM` and `AI_MODEL_THING_DRAW`.

  The local `.env` sets three of them today: `VISUAL_STAGE=events`,
  `AI_MODEL_VISUAL_SCRIPT` and `AI_MODEL_THING_DRAW`.
- **Added.** `AI_MODEL_SCENE_WRITE=openai:gpt-4.1`,
  `AI_MODEL_SCENE_DRAW=deepseek:deepseek-flash` and
  `SCENE_DRAW_THINKING`.
- `DEEPSEEK_API_KEY` stays required at boot while a task names DeepSeek,
  which is already the rule.

### 10.6 Bugs fixed on the way

The inventory found four, all in code this rebuild touches anyway:

1. **The top-up never runs.** The controller drops `mode`
   (`visuals.controller.ts` 134–139), so the pane's `ahead` top-up runs
   as `page`.
2. **A voice error can strand a row.** A 4xx from the voice leaves the
   row in `making` for good: the runner makes the error unrecoverable,
   and `queueVisuals` never re-queues a row in `making`. The new
   processor marks the row `failed` on an unrecoverable error, so it can
   be asked for again.
3. **A purge leaves visuals behind.** The visual tables have no foreign
   keys, and `purge.service.ts` 83–92 never deletes
   `documents/<id>/visuals/`. The purge takes both the rows and the
   files.
4. **One bad file stops an admin batch.** A ready file with no chapters
   throws inside `queueVisuals` and stops the batch partway. It is
   skipped and counted instead.

## 11. Tests, and how "good" is judged

**Specs on the server.**

- **Layout.** For every template, count and staging: no two places
  overlap, and everything is inside the margins with room for its
  caption. A property test over random casts.
- **Anchors.** Verbatim, case, punctuation, a missing phrase, a number
  said as words.
- **Cadence.** Staggering, and filling.
- **Gate.**
  - Each hole is closed: script, `on*`, `foreignObject`, SMIL `href`,
    CSS `url()` and `@import`.
  - The backdrop is removed.
  - Prefixing reaches `url(#…)`, `href="#…"`, keyframe names and class
    selectors.
  - A panic-shaped viewBox is refused before resvg.
- **Voice words.** Kokoro's tokens map onto spoken words, punctuation
  tokens included.

The rule from f02be9b: the processor's steps are exported functions, and
the specs import those very functions, never a copy of a predicate.

**The golden set.** Twelve pages, made together and watched in the app:

- the opioids chapter (`modal/opioids-chapter.txt`)
- a maize plant
- a simple circuit
- filtration
- a volcano
- the kidney
- a history page
- an economics page
- a maths word problem
- a poem
- a page that is mostly a table
- a thin page

Each is scored yes or no on:

1. Faithful and clear.
2. Every picture is about what is being said.
3. Something changes every few seconds.
4. Nothing overlaps or is cut off, in either staging.
5. The drawings are recognisable and look like one set.
6. The motion shows how things work.
7. Things arrive within about a third of a second of their words.
8. Pause, seek and 2× stay in step.

Every page logs its steps, drawings, retries, type cards, fills, lost
anchors, cost and seconds.

## 12. Risks

| Risk | Answer |
| --- | --- |
| DeepSeek's animation is uneven. | The spike comes first, with the house style and the contract. Engine motion carries a still drawing, and the type card is the floor. |
| Model SVG in the page is an XSS door. | An allowlist on the server, DOMPurify on the client, a shadow root per drawing. `attributeName` is policed, and no link or external URL survives. |
| Safari. | CSS `d` is banned in favour of SMIL, and `transform-box` is required. The spike's player page runs on iOS. |
| Faithfulness. | The writer's rule, and the golden set's first question. If errors show, add the lecture's verifier, on a stronger model than the writer as the lecture has it. |
| Cost. | §8's levers. The ledger shows it from the first day. |
| A heavy drawing stutters on a phone. | Size and element caps, filters kept off animated groups, and at most five drawings live. |

## 13. For Richard

1. **The uncommitted work.** The Visualize edits in both repos (§10.1):
   commit them as the last of the old pipeline, or discard them?
2. **Cost.** Is roughly $0.04–0.10 a page acceptable to start, measured
   in the spike, with the levers after? Or should the writer be
   `gpt-4.1-mini` from the first day?
3. **Gating.** Visuals have no plan, credit or study-time check today.
   The image search has one. One press queues the rest of the learner's
   chapter, or a whole book of 40 pages or fewer. At a few cents a page,
   should a press count against something?

Captions stay a learner toggle, off by default, as now, unless you say
otherwise.

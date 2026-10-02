# Explainer animation: the assets and the motion

Written 2026-10-02. This is the build plan for how explainer films are drawn and moved. It comes from three things:
- our talk: build our own animation studio inside the app, use ready-made engines where they fit, and build ourselves the pieces the AI has to drive;
- the audit of today's frames in `explainer-visual-research.md`;
- Lukas Margerie's video on how Claude Opus 5.5 makes motion graphics (§2).

The 3D engine is left as a to-do (§11).

**Rules this plan keeps** (Richard's):
- **No human in the loop.** People make videos with AI only: no artists, reviewers or approvals per video. One-off work by us (kits, rules, recipes) is fine.
- **Editorial style for every audience.** The audience only sets how simply things are explained. It is never on screen.
- **Truth over decoration.**
  - No invented places.
  - No word cards standing in for places or people.
  - No stock figures for real groups.
  - Real people appear as verified portraits; groups as silhouettes.
  - Archive images are allowed with a source tag.
- **One stage per episode:** one world the camera travels in.
- **Global, not regional.** Nothing defaults to a country.
- **The bar:** films that beat human-made YouTube explainers.

It replaces the visual parts of `infographic-editor-plan.md` (stages 6 and 6c) where they conflict:
- kit figures with "described likenesses" become portraits and silhouettes;
- small code kinds become full-frame shots;
- the Gemini scene judge becomes the checks in §9.

### What changed from what we agreed

1. **The motion engine is our own, not GSAP.** GSAP's licence has a clause that may cover us, and the video's best films used a small home-made spring library like the one we already half have. GSAP stays an option (decision 1).
2. **A harness around the AI** (the video's main lesson):
   - a rules file;
   - stills and contact sheets of every scene;
   - code checks;
   - a critic that scores the frames and sends fixes back.
3. **Sound is tied to motion.** Every recipe carries its sound, and changes land on the music's beats.
4. **Code-drawn sets come before AI-painted backdrops,** which wait (decision 3).
5. **Later: a strong model can write a custom shot as code** when nothing in the kit fits. The checks are its gate, and what passes joins the kit.

---

## 1. Why the frames are poor today

From the audit (research §3 and §5):
- **A failed drawing becomes a word card.** In the Nigeria episode a word card was on screen 34% of the time.
- **The model draws main objects freehand** (DeepSeek writes SVG). The jet engine came out as a strip covering 0.7% of the frame.
- **The world job invented places** ("Kano market square"). The kit added stock figures for real groups and stand-ins for the audience ("Teen student", "Mechanic").
- **Small pictures sit in stacked layouts on blank paper.** Things fade or pop in; nothing moves with intent.
- **Maps are flat.** They are SVGs built on the server and animated by CSS classes, so they can't tilt, fly, or light up region by region.
- **Nobody looks at a frame before it ships.** Rendering a few stills and checking them would have caught every failure above.

## 2. What the video shows

The video is Lukas Margerie, *Opus 5.5 Makes Insane Videos. Here's the Full Workflow* (YouTube, 20 minutes). It builds on an X article by Movez.
- **Most examples are product promos.**
- **One is close to what we make:** a Steve Jobs biography made entirely in code. It has:
  - a year counter and a timeline ruler;
  - full-frame flat illustrated scenes (a bridge at sunset, a night street with a phone booth);
  - one simple figure that ages through the film.

**How those films are made.**
- **The model writes code, not video.** A page draws any frame for a given time, a headless browser steps through the frames, and ffmpeg makes the MP4.
  - **Our player and export already work this way.** `film-capture.ts` seeks `window.__render` frame by frame.
- **The harness matters more than the prompt.** The video's main point is that the prompt is a small part of the result and the rest is the harness around the model. It names six parts: brand assets, a style guide, a beat grid, a spring library, a critique loop, and sound.
- **A rules file** in four parts:
  1. a render contract: a frame depends only on time; no timers or CSS transitions; seeded randomness;
  2. the look:
     - it bans generic defaults (a centred title on a gradient, everything fading in, corner labels, glows, generic particles);
     - it keeps one display face and one accent colour;
     - it asks for something new every 2–4 seconds;
  3. sound: music and effects made in code, hits placed on the beat grid, mixed to −14 LUFS;
  4. a loop that runs before anything is shown (below).
- **A beat grid before any code:** a table of what happens on each beat, written and checked first.
- **One timeline with three lanes:** music, effects and picture.
  - A click on every press, a whoosh on every morph, a thump on the logo.
  - Big moments land on downbeats.
- **References become a style guide.**
  - Frames are sampled from a reference video every half second.
  - They are turned into a written guide: palette, type, shot lengths, transitions, camera moves, texture, and how text enters and leaves.
  - It takes the grammar of the reference, never its content.
- **The critique loop:**
  1. Render one still per beat and tile the stills into a contact sheet.
  2. Score the sheet from 1 to 10 on about seven axes: the hook in the first 2 seconds, readability at phone size, motion, composition, depth, sound sync and polish.
  3. Fix the three worst problems.
  4. Repeat until every score is 8 or more. Only then render the full film.
  - The rounds shown in the video found real faults: everything flat, frames unreadable on a phone, a link on screen for 0.05 s.
- **It takes many rounds.** One widely shared short took 163 model calls and nearly seven hours. One-shot results were passable; the looped ones were what people shared.
- **The model matters.** The same prompt in Codex gave a much weaker film than Opus 5.5.
- **It ends as a packaged skill:** fixed inputs, pipeline steps and hard rules. For a product film the hard rule is real product screens only, never invented ones.

**What we take, and what we don't.**

| From the video | Here |
|---|---|
| Render contract | §4. We already render this way. We write the rules down and enforce them. |
| Look rules and bans | §4, in our editorial version, enforced by code where possible |
| Beat grid before code | The shot plan (§5.3), checked by code before anything is built |
| A small spring library | Our own motion core (§5.1), most of which exists |
| Sound on one timeline | §8. Every recipe carries its sound; changes snap to the score's beats. |
| Critique loop with contact sheets | §9. Code checks always, plus a model that scores the contact sheet. Automatic, capped at three rounds. |
| Real product screens only | Real places and people only: the map, verified photos and portraits |
| Reference → style guide | Once, by us, for the house style. Later for makers ("make it look like this"). |
| One HTML file per film, written by the model | **Not the default.** Our films are minutes long, made by many people, and must be cheap and reliable. The AI writes a shot plan against our kit. A model writing custom code for a shot comes later (§7.3), with the loop as its gate. |
| A person approving the beat grid | **Not taken.** Our gates are code checks and the critic. |

## 3. How a film is made

```
script row (SAY | SHOW)                    the editor's desk, unchanged
   │
   ▼
shot plan (the beat grid)                  GPT-5.4 mini, from closed lists
   │   code checks the plan: pace, focal subject, words on screen, truth links
   ▼
build: sets, kit pieces, photos, maps      code (no freehand drawing)
   │
   ▼
stills: one per beat, plus each shot's start, middle and end → contact sheet
   │   code checks (always) + the critic's scores (§9)
   │   fix the 3 worst → rebuild → check again   (at most 3 rounds)
   ▼
ready: the player plays it; the MP4 export renders it frame by frame
```

**Every shot is four layers and a camera, all timed to words:**

| Layer | What can be in it | The AI decides | Code does |
|---|---|---|---|
| Set | a map, an archive photo, a code-drawn set (sky, land, townscape), a full-frame chart or timeline, a document, a 3D machine (to-do) | the kind and its settings, from closed lists | draws and lights it |
| Actors | kit pieces (silhouettes, crowds, buildings, vehicles, objects, 2D machines) and portrait cards | which pieces, where, and their moves | draws them from generators, rigs and moves them |
| Information | labels, numbers, arrows, routes, pins, highlights, counters, quotes, source chips | recipe + target + the word it lands on | animates it by recipe |
| Life | weather, smoke, water, light, crowds shifting, grain, a few Lottie effects | which ones, from a list | draws them procedurally, seeded |
| Camera | establish, push, pull, travel, follow, cut-to, zoom-through, return | the move, its target and its word | moves on springs and frames each shape (16:9, 9:16) around the focal subject |

Everything is a pure function of time. The player, the stills and the MP4 show the same frames.

## 4. The rules file

One file holds the rules: `src/business/domain/studio/explainer-rules.ts`. The prompts quote it and the checks enforce it. It is the "skill" in the video's sense.

**Render contract.**
- A frame depends only on its time. The render page's `seek(t)` paints it.
- In render mode: no CSS transitions, no timers, no `requestAnimationFrame` loops, and nothing carried over from the previous frame.
- Randomness is seeded, one seed per shot.
- Before a capture, fonts are loaded, images decoded and the map idle.
- No `will-change` on layers the camera scales. Chrome rasterises them small, so text goes soft when the camera zooms.
- The same code runs in the player, the stills and the export.

**The look.** Research §3.6 and §3.8 hold the numbers.
- **Banned:**
  - word cards as pictures;
  - a centred title on a gradient;
  - everything fading in;
  - generic sparkles, bursts and glows;
  - corner labels and frame borders;
  - stacked layouts on blank paper;
  - stock figures for real groups;
  - invented places;
  - the audience on screen.
- **Type and colour:** one display face and one text face from the show's style; colours from the show's visual system, with one colour held back for the payoff.
- **One focal subject per beat, and big.** In 9:16 it fills at least half the frame height.
- **Pace:**
  - something new every 2–4 seconds in explain passages;
  - the first change by 1.5 s;
  - no gap over 6 s outside a declared hold.
- **Easing:** springs with a small overshoot; no bouncy easing.
- **Text:** up long enough to read, at least max(1.5 s, 0.35 s × words + 0.5 s), and big enough at phone size.

**Truth.**
- A named real place appears only as the map or a verified photo of it.
- A named real person appears only as a verified portrait, never as a drawn likeness. Without a portrait, use a trace of them: a signature, a document, a newspaper.
- Groups are silhouettes in their side's colour, counted honestly when a number is said.
- A code-drawn set shows a kind of place (a port, a farm, a city at night), never a named one. If it stands for a real event, it carries an "Illustration" tag.
- Every number, place, person and photo on screen links to the research log. Code rejects a shot whose target isn't there.

## 5. Motion

### 5.1 The engine: our own small core

We agreed GSAP. Two things changed my recommendation:
1. **GSAP's licence.** It is free for commercial use, plugins included. But it forbids use in tools that let people build visual animations without code, where the tool competes with Webflow's animation building.
   - We are a no-code animation maker, though not a website builder.
   - Webflow's FAQ says to ask when unsure.
2. **The video.** Its best films used a small home-made spring library, not a big engine. We already have most of one in the client:
   - `timeline.ts`: eases, camera and acting, all pure functions of time;
   - `springs.ts`;
   - `morph.ts`;
   - `edit.ts`.

So the core is ours, in client `src/lib/motion/`. GSAP stays an option behind the same interface, used only if a gap appears and Webflow confirms in writing (decision 1). The core has:
- **tracks** for numbers, colours, points, paths and transforms;
- **eases and closed-form springs.** A value with several targets is the sum of one spring per change, so any moment can be computed directly and a change of target stays smooth;
- **stagger, overlap and follow-through** (research §3.6):
  - children enter 30–60 ms apart;
  - attached parts settle 60–120 ms after their parent;
  - a small counter-move comes before a big move;
  - things travel on arcs, not straight lines;
- **path following, stroke draw-on, and text split** by word or letter;
- **morphs** with flubber (MIT), on top of `morph.ts`.

### 5.2 Recipes

A recipe is a named piece of motion with professional timing, a sound and checks. The AI picks recipe + target + word and never writes timings. The list is the research's closed verb list (§3.2), built once in code.

| Group | Recipes (default length) | Sound |
|---|---|---|
| Camera | establish; travel (0.4–1.2 s; flights 2–4 s); push; pull; follow; cut-to; zoom-through (1.2 s); return | soft air on travel and push |
| Build | draw (0.3–0.8 s per stroke group); label (0.25 s, with a leader to the part's edge); pin (0.35 s); fill (0.5–0.7 s); seam (0.7–1.2 s) | pencil on draw, tick on pin |
| Change | count (1–2 s); grow (0.7–1.0 s); transfer (0.6–0.9 s per token); morph (0.8–1.2 s, same thing only); run (a machine starts); strike (cross out and replace) | ticks on count, whoosh on morph, thump on a stamp |
| Attention | flow (a wave along the causal path, 1.5–4 s); spotlight (everything else dims to 40%); mark (a ring or underline, 0.3–0.5 s) | low swell on flow |
| Windows | open-photo; open-portrait; open-document; burst (3–7 items) | paper on documents |
| Rests | hold (2–10 s, with life running); ask (a question over an open state, then up to 1.5 s of quiet) | a rising tone on ask |

**Craft rules inside every recipe**, for example:
- text inside something that changes shape enters after the change starts and leaves before the next one;
- the leading and trailing edges of a highlight move on different springs, so it stretches;
- a label never covers its subject or another label.

### 5.3 What the AI writes: the shot plan

The board step (`explainer_board`, GPT-5.4 mini) turns each script row into shots, choosing only from closed lists. Code turns words into times with the existing timing (`scene-timing.ts`, `anchorMs`).

```ts
type Shot = {
  id: string;
  from: Anchor; to: Anchor;            // { row, words: "exact words" }
  set: SetSpec;                        // map | photo | set | chart | document | machine3d (to-do)
  actors: { id: string; kit: KitId; params: object; place: Place; moves: Move[] }[];
  info: { recipe: RecipeId; target: TargetRef; on: string; until?: string; text?: LabelId }[];
  life: LifeId[];
  camera: { move: CameraMove; target?: TargetRef; on: string }[];
  join: 'continue' | 'cut' | 'match' | 'morph' | 'zoom-through' | 'dissolve' | 'dip' | 'push';
};
```

**Example: the research's Kano row A1.** The line is: "In 1946, an eighty-one-year-old engineer set out across Nigeria to fight a new constitution. In Kano, he fell ill."

| Words | Set | Information | Camera | Life and sound |
|---|---|---|---|---|
| "In 1946" | the show's map, tilted, terrain on, 1946 layer | pin Lagos | establish at country framing | cloud shadows drift |
| "engineer" | open-portrait: Herbert Macaulay's verified portrait with its chip, if one clears the desk; otherwise his signature on a document he signed | — | push 5% over 2.5 s | paper |
| "fight a new constitution" | return to the map | draw the tour route north, through stops named in sources | follow the route's head | pencil |
| "In Kano" | the map | the route reaches Kano; on "fell ill" its head stops and greys | cut to a closer framing | the music thins to one note |

**Code checks the plan before anything is built:** gaps, dwell, one cue at a time, the focal subject, words on screen, and every target in the research log.
- A plan that fails goes back once, with the reasons.
- If it fails again, the failing shot becomes a safe shot: the map, a verified photo, or a quote card for exact words only.
- **Never a word card.**

## 6. The set layer

### 6.1 Maps on MapLibre

- **MapLibre GL JS (BSD-3) in the player, driven by our clock.**
  - Every frame sets the map's camera (`jumpTo`), with the map's own fades and transitions turned off.
  - Region colours come from our tracks (feature state). "Three regions fill one after another" is a fill recipe on each region.
- **Pins, labels and routes** are drawn in our information layer and placed with `map.project`, so they use the same recipes as everywhere else.
- **Data:**
  - borders and groups from the Natural Earth admin-1 work we already have (`scene-map.ts`: groups, seams, pins, the show frame), sent as GeoJSON;
  - terrain from Terrain Tiles (public-domain sources, with attribution lines in the description), cached in our bucket so a render never depends on someone else's server;
  - satellite and relief layers later (research §3.1).
- **The server keeps the geography** (groups, seams, period layers, the show's base map). The client draws it. Server-side map SVGs with CSS animations are retired for explainers.
- **The export needs WebGL.** On this Mac, headless Chrome had no WebGL and the software fallback didn't appear by itself (research §6.1).
  1. First try explicit software-GL flags on the current worker, and measure.
  2. If that fails or is too slow, render map shots on a GPU worker on Modal, which we already use for voice.
  3. The fallback: render map "plates" once and move a 2D camera over them.

### 6.2 Charts, timelines and documents at full frame

The code kinds we have stop being small pictures in stacked layouts: counter, icons, calendar, seats, strike, transfer, document, split, chart, plot, timeline, flow and quote.
- **Each becomes a full-frame stage with named parts** (`data-part="bar-3"`). Recipes can then grow a bar, light a seat, flip a page, or push the camera into the number that matters.
- **The server still draws the geometry** (`scene-<kind>.ts`). The client moves the parts.

### 6.3 Archive photos and portraits

Built on research §3.4–3.5, the picture desk.
- **Sources with clear licences:** Wikidata and Wikimedia Commons, NASA, Smithsonian and the Met (CC0), and US government sources such as VOA and DVIDS.
  - Licence and provenance are checked.
  - A source chip goes on screen and the full credit in the description.
- **Real people:** their Wikidata portrait, licence checked, on a portrait card with name and dates.
- **The editorial treatment:**
  - crop to the subject;
  - duotone or halftone in the show's colours;
  - paper texture;
  - a cut-out with a border for collage.
- **Depth.** A depth model splits the photo into 2–3 planes, and the camera moves slowly through them (3–12% scale over 2.5–6 s).
  - The model is Depth Anything V2 **Small** (Apache-2.0). The larger sizes are non-commercial.
- **A photo is rejected** when its caption, date or place disagrees with the research log.

### 6.4 Code-drawn sets

For feelings and atmosphere, a set generator draws in the show's style. It never uses a country preset; everything comes from settings:
- the sky, by time of day and weather;
- the land: plain, hills, mountains, coast, desert or forest;
- water;
- townscape silhouettes, by density and era.

Everything in a set can move: the sun sets, lights come on, clouds drift.
- This is the Steve Jobs film's look (a bridge at sunset, a night street), with no image model.
- Silhouettes and kit pieces act in front of it.

**AI-painted backdrops: not now** (decision 3).
- The gpt-image-1 family is being retired this year.
- Painted images can't be trusted for real places anyway.

## 7. The actor layer: our rig format and the editorial kit

### 7.1 The rig format

A kit piece is a layered SVG with named parts, plus a small JSON file:

```json
{
  "id": "vehicle.ship.steam",
  "parts": {
    "hull":   { "pivot": [0.5, 0.9], "z": 1 },
    "funnel": { "pivot": [0.5, 1.0], "z": 2 },
    "smoke":  { "life": "smoke", "anchor": "funnel.top" }
  },
  "states": { "moored": {}, "sailing": { "hull": { "bob": 0.01 } } },
  "moves": ["enter", "sail-to", "dock", "leave"],
  "focal": [0.1, 0.2, 0.9, 0.95],
  "colours": ["side", "accent"]
}
```

- **Moves are recipes:** walk, stand, point, turn, leave, open, spin, wave, sail-to, light-up.
- **Charts and documents use the same named parts** (§6.2).
- **It extends the existing rig work** (`scene-sheet-rig.ts`, the figure views, dangles) in the editorial style.

### 7.2 Kit v1

Built once by us with code generators, then grown topic by topic from what makers ask for. We log every ask that no piece could serve.

| Family | First pieces | Settings |
|---|---|---|
| People as silhouettes | standing, walking, pointing, seated, at a lectern, raising a hand, holding a sign; pairs; groups; crowds in the hundreds | era cues (hats, coats), posture, side colour; no faces |
| Buildings | house, block of flats, office tower, factory, warehouse, assembly hall, court, school, hospital, market stalls, port cranes, farm | era, climate, size, materials |
| Vehicles | cart, car, bus, lorry, train, ship (sail, steam, container), plane (propeller, jet), rocket | era, size, side colour |
| Documents | letter, charter or treaty, newspaper, ballot, banknote-like note, booklet, stamp | text from the research log only |
| Objects | phone, computer, book, coins, sack of grain, oil barrel, crate, battery, lamp, key, lock, chain | size, colour |
| 2D machines | gears, belts, pistons, pumps, turbines; a jet-engine cutaway with the fan, compressor stages, combustor, turbine stages and nozzle as named parts | stages, and proportions from research |

**Example: the jet-engine line before 3D exists.** The line is: "The air is packed tight and hot. What lights it?"
- The turbofan cutaway fills 70% of the frame width.
- On "packed tight and hot", particles narrow through the compressor and warm from blue to amber.
- On "What lights it?":
  - the camera pushes to the combustor;
  - everything else dims to 40%;
  - the "combustor" label pins to its part.
- Then a 1.5 s ask, with the flow still moving.

### 7.3 How the kit grows

- **Now:** by us, as one-off development, in the order of the topics people make.
- **Later (phase 7):** a strong model draws a missing piece as code against our toolkit.
  - The checks in §9 test it. For a real thing, it is also compared with a reference photo.
  - If it passes, it is rigged, tagged and saved, so the next film reuses it.
  - The library grows itself, with no people involved.

## 8. Life and sound

**Life** (research §3.6's life channel):
- **Procedural and seeded:**
  - rain, snow, wind in grass;
  - smoke and steam, dust in light, water shimmer;
  - lights flickering;
  - cloth and flags (existing dangles);
  - crowds shifting;
  - paper grain;
  - a slow camera drift (existing `ambient.ts`).
- **Capped, so it never competes with the information:** small brightness changes, nothing faster than once a second, and never crossing a label.
- **Lottie for the few things code does badly** (fire, an explosion, a splash):
  - 10–20 effects from LottieFiles' free library, picked once and recoloured to the show's palette;
  - their licence allows commercial use without credit, but we must not gather them into a library others can use;
  - lottie-web (MIT) can be set to any frame, so it obeys the render contract;
  - downloading them needs your OK (decision 7).

**Sound on one timeline:**
- **The voice is the clock.**
- **The music comes from our own score,** so its beats are known exactly and nothing needs measuring.
- **A change snaps to the nearest beat** when the beat is within ±120 ms of its word. Big reveals land on downbeats where the words allow.
- **Every recipe has its sound** (§5.2), from the approved CC0 sets (sound-sources-licensing).
- **The music ducks under the voice,** and the mix ends at −14 LUFS.

## 9. The checks: look at every frame before it ships

### 9.1 Stills and contact sheets

The export's capture (`film-capture.ts`) gets a "times" mode. It renders one still per beat, plus the start, middle and end of every shot, in both 16:9 and 9:16, and tiles them per scene. A still takes about a second on the worker; map stills take longer.

### 9.2 Code checks (always on, and free)

| Check | Fails when |
|---|---|
| Focal subject | the named subject's box is under its share of the frame (in 9:16, under half the height) |
| Overlap | labels hit each other, their subject, or the caption band |
| Readable size | text is under the size floors at phone size (research §3.8) |
| Contrast | text is under 4.5:1, or marks under 3:1, against what's behind them |
| Dwell | a label, number or photo is up for less than its reading time |
| Pace | 6 s pass with no information event outside a hold, or two cues come at once |
| Blank and strobe | a frame is empty, or brightness flips more than 3 times a second |
| Safe areas | text sits outside the safe area for its shape |
| Truth links | a target, number, place or person isn't in the research log |
| Banned | a word card, a stock figure, an audience stand-in, or a centred title on a gradient |

### 9.3 The critic

- **A model looks at each scene's contact sheet next to the script rows** and scores it from 1 to 10 on:
  - **clarity:** does the picture show what the voice says?
  - **readability** at phone size;
  - **composition;**
  - **motion;**
  - **depth;**
  - **truth and fit:** does anything look wrong or invented?
  - **polish;**
  - and, for the opening scene, **the hook.**
- **It writes the three worst problems as fixes from a closed list:**
  - enlarge or reframe the subject;
  - change the set kind;
  - split or merge shots;
  - move an event to another word;
  - lengthen a hold;
  - add or change a camera move;
  - swap a recipe;
  - remove clutter;
  - fall back to a safe shot.
- **The board applies the fixes, the scene is rebuilt, and the stills are checked again.** This repeats up to three rounds, or until every score is 8 or more. A shot that still fails becomes a safe shot.
- **The model is GPT-5.4 mini with images,** at about $0.13 a round for an episode's 60 stills (research §6.2), so at most about $0.40.
  - You said to skip the extra Gemini picture check for now. The video makes this kind of check the biggest single lever, so it is back as decision 2, on a cheaper OpenAI model.
  - It comes late (phase 5). Code checks cover the floor until then.
- **Calibration.** Once, we score contact sheets of 3–5 of the best human-made editorial explainers with the same critic, so an 8 means "as good as those". That turns "beat human-made videos" into a number we track (decision 6).
- **The ledger.** Scores per episode go to the ledger, so we can see quality move.

## 10. What stops

This applies to explainers only. Stories keep their path.
- **DeepSeek's freehand SVG as a main subject** (`scene_draw` for explainers).
- **Kit figures and described likenesses for real people,** and stand-ins for the audience.
- **Word cards as a fallback:**
  - the card from `thingDto` in `scene-compose.ts`;
  - the keyword cards from `plainBoard` in `studio-editor.processor.ts`.
- **Small kinds in stacked layouts** on blank paper.
- **Server-side map SVGs animated by CSS classes.**
- **`STUDIO_ILLUSTRATED`** stays off; sets, silhouettes and photos replace it.

## 11. To-do: the 3D engine

Skipped for now. It is kept here so the rest is built to take it.
- **A three.js (MIT) stage in the set layer:**
  - orbit;
  - a section plane sweeping through a machine;
  - exploded views;
  - flows through the machine;
  - labels pinned to 3D anchors.
- **Machine generators.** For example, a turbofan built from a fan, compressor stages, a combustor, turbine stages and a nozzle, each a named part with proportions from research.
- **It needs WebGL in the export,** so it uses the GPU path from the map stage.
- **Until then,** 2D cutaways from the kit cover machines.

## 12. Where it lives in the code

| Piece | Where |
|---|---|
| Rules file | server `src/business/domain/studio/explainer-rules.ts` |
| Shot plan schema and checks | server `studio/explainer-shots.ts`; zod in `editor-schemas.ts`; prompt in `prompts.ts` |
| Map geography as GeoJSON | server `scene-map.ts` (existing groups, seams, frames) |
| Picture desk | server `studio/picture-desk.ts` (new) |
| Kit generators and rigs | server `src/business/domain/kit/*` (new), reusing ideas from `scene-sheet-rig.ts` |
| Stills and contact sheets | server `src/pipeline/export/film-capture.ts` ("times" mode) |
| Critic | a new model task, `explainer_critic` (`models.ts`, `ai-sdk-llm.adapter.ts`) |
| Motion core and recipes | client `src/lib/motion/*` (new) |
| Shot stage (four layers and a camera) | client `src/lib/shots/*` (new), next to `SceneStage`, which stories keep |
| Map stage | client `src/lib/shots/map-stage.ts` (MapLibre) |
| Contracts | `SceneDto` gets `engine: 'shots'` and its shots |
| Render page | `render-film.tsx`: `seek` waits until the shot stage is ready (fonts, images, map idle) |

## 13. Phases

Each phase can be tested on its own, on your account. Shipping to production is a separate step: migrations, Chrome and ffmpeg on the worker, and the GPU worker if maps need it.

| Phase | What | Days | You test |
|---|---|---|---|
| 0. Floor and eyes | Switch off the worst failures in today's path (word cards, stand-ins, stock figures, invented places); the rules file; stills and contact sheets; code checks; baseline scores for the Nigeria and jet-engine episodes | 4 | Contact sheets and scores of the old episodes, and a new episode with no cards or stand-ins |
| 1. Motion and shots | The motion core; recipes with their sounds; the shot plan and its checks; the shot stage; charts, timelines and documents at full frame; the export working | 9 | A new explainer whose numbers, dates, causes and quotes are full-frame shots with camera moves |
| 2. Maps | The MapLibre stage: regions, routes, pins, terrain and flights; WebGL in the export (software GL or the GPU worker) | 7 | The Kano rows on the new map, in the player and in the MP4 |
| 3. Kit and sets | The rig format, kit v1, code-drawn sets | 11 | An episode with silhouettes, buildings, vehicles, objects, the jet-engine cutaway and atmospheric sets |
| 4. Photos and portraits | The picture desk, portrait cards, photos with depth, chips and credits | 8 | A history episode with verified portraits and archive photos |
| 5. The critic | The critic, its fixes and rounds, and calibration against human-made references | 5 | An episode's scores round by round, and the final film |
| 6. Life | The life layer and Lottie effects | 4 | Before-and-after clips |
| 7 (later) | Custom shots written by a strong model; the kit growing itself | 8–10 | — |
| 8 (later) | Motion blur from sub-frames on fast moves; a 60 fps option; makers' references ("make it look like this") | 5 | — |
| To-do | The 3D stage and machine generators (§11) | — | — |

**Phases 0–6 come to about 48 days of work.** After phase 1, three tracks can run side by side, which brings it to about five weeks:
- maps, then life (2 → 6);
- the kit (3);
- photos, then the critic (4 → 5).

## 14. Risks

| Risk | How it's handled |
|---|---|
| WebGL in the export | Measure software GL first; use a GPU worker on Modal if needed; map plates as the fallback |
| A mini model writes weak shot plans | Closed lists, code checks, the critic, and safe shots as the fallback |
| Licences | Our own motion core (GSAP only with Webflow's written OK); Lottie used inside films only; photos PD, CC0 or CC BY only at first; Depth Anything Small only; attribution lines for terrain |
| Something untrue on screen | Truth links to the research log; real places only as the map or a photo; people only as verified portraits |
| The kit has gaps | Every miss is logged, and we fill them in topic order; custom shots later |
| Cost and render time | Critic rounds capped at three; only stills, not full renders, inside the loop; the GPU billed per second |
| The critic is wrong | Code checks run regardless; calibration against human-made references; scores tracked over time |

## 15. Decisions for Richard

1. **Motion engine:** our own core plus flubber, or GSAP?
   - *Recommendation:* our own core now. We have most of it, and the video's best results came from the same kind of small spring library.
   - Keep GSAP behind the same interface, used only if Webflow confirms in writing that its licence allows our app.
2. **The critic's model:** GPT-5.4 mini with images, code checks only, or Gemini Flash when its credit is back?
   - *Recommendation:* GPT-5.4 mini, at about $0.40 an episode at most.
3. **AI-painted backdrops.**
   - *Recommendation:* none for now. Use code-drawn sets plus archive photos.
   - Test an image model only if contact sheets show sets that look empty.
4. **Map renders.**
   - *Recommendation:* try software GL on the current worker first. If it's slow, use a Modal GPU worker for map shots.
5. **Custom shots (phase 7).** The video's results come from Opus 5.5, which needs an Anthropic key.
   - *Recommendation:* when we get there, test Opus 5.5, GPT-5.4 mini and DeepSeek on the same 10 shot briefs, then choose on quality per dollar.
6. **Calibration references.** Is it OK to capture frames from 3–5 human-made explainers, for internal scoring only?
   - *Recommendation:* yes.
7. **Lottie downloads.** Is it OK to download about 15 effects from LottieFiles' free library?
   - *Recommendation:* yes, from a list I'll show you first.
8. **Photo licences.**
   - *Recommendation:* public domain, CC0 and CC BY only at first; CC BY-SA after a legal read.
9. **Scope.**
   - *Recommendation:* explainers move fully to the new shot stage; stories stay on today's stage.

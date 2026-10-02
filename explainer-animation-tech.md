# Explainer animation: the technical plan

Written 2026-10-02, from `explainer-animation-plan.md` (the product plan), which Richard approved to build "top to bottom", with agents working in parallel.

It takes the product plan's recommended answer to every open decision. Richard can change any of them at any point:
1. Our own motion core; GSAP is not used.
2. The critic runs on GPT-5.4 mini with images.
3. No AI-painted backdrops.
4. Software GL for maps first; a GPU worker only if that is too slow.
5. Custom shots get a model test before a model is chosen; until then, the models we have.
6. and 7. Calibration frames and Lottie files wait for Richard's OK; nothing that needs them blocks the build.
8. Photos are public domain, CC0 or CC BY only.
9. Explainers move fully to the new stage; stories stay on today's stage.

The 3D engine stays a to-do (§10).

---

## 1. Architecture

```
SERVER (easyread-server)                                CLIENT (easyread)
editor's desk → script rows → cut into scenes
        │
 board ─┼─ EXPLAINER_SHOTS off: today's lesson board
        └─ on:  shots/shot-board  → ShotPlan (closed lists + target registry)
                  shots/shot-check  (plan checks, one retry, mend, safe shots)
        │
 make ──┼─ voice + word times (unchanged)
        └─ shots/shot-build   → assets: charts (shot-charts), maps (geo),
                                  kit pieces (kit/*), pictures (pictures/*)
           shots/shot-time    → every "on" phrase → ms (settle rule)
           shots/shot-sound   → recipe sounds, snapped to the score's beats
           shots/shot-compose → SceneDto { engine:'shots', shots: ShotSceneDto }
        │
 frames ── film-capture (times) → stills + inspect   ──►  /render/[episodeId]
           shots/frame-checks (code)                         __render.seek / inspect / ready
           shots/shot-critic (GPT-5.4 mini, images)          ShotStage (lib/shots)
           shots/shot-fix → rebuild → again (≤3 rounds)        set · actors · info · life
        │                                                      camera · joins
 export ── film-capture (frames) + ffmpeg (unchanged)       recipes (lib/shots/recipes)
                                                            motion core (lib/motion)
                                                            MapLibre map set
```

**The one rule** is that every picture is a pure function of time:
- the server writes all times in ms;
- the client paints any `ms` without remembering the frame before;
- the export steps through time (`film-capture.ts`, as today).

**Two engines side by side.** `SceneDto.engine === 'shots'` selects ShotStage. Anything else plays on today's `SceneStage`, so stories are untouched.

**The flag** `EXPLAINER_SHOTS` (off/on) switches the board and the make for explainer scenes. It stays off on main until Richard switches it, so the new path can be compared with today's on the same episode (§8).

## 2. The contract (done in wave 0)

The contract lives in server `src/contracts/index.ts` and its double-quoted copy in client `src/lib/api/contracts.ts`.
- `SceneDto` gains:
  - `engine?: 'shots'`
  - `shots?: ShotSceneDto`
- `ShotSceneDto` holds `{ version: 1, look, assets, shots, sounds }`.
- **Assets:**
  - `svg`: markup with `data-part` ids, a viewBox `box`, parts with box, pivot, path, value and role, an optional `rig`, and a `focal` box;
  - `image`: url, size, optional `depthUrl`, `focal` and `credit`;
  - `geo`: a GeoJSON FeatureCollection with `id`s, bounds and period;
  - `lottie`.
- **ShotDto:**
  - `id`, `startMs`, `endMs`;
  - the set: map, photo, portrait, document, set, chart or plain;
  - `actors`, each with moves;
  - `info`: one of 18 recipes, a target, `atMs`, `durMs` and `untilMs`;
  - `life`: an effect with a seed and an amount;
  - `camera`: one of 9 moves, with `atMs`, `durMs`, a target and an amount;
  - `focal`, `join`, `joinMs`, `chip` and `illustration`.
- **Targets:** an asset part, an actor part, a geo point, a geo feature, or a box.

**Rules for changing it:**
- Only add; never rename or remove.
- Both copies change in the same branch.
- A scene with `engine: 'shots'` keeps `beats`, `ideas`, `timing`, `sound` (music) and `durationMs` exactly as today, with `things`, `steps` and `effects` left empty.

## 3. The rules file (done in wave 0)

`src/business/domain/studio/explainer-rules.ts` holds:
- the pace numbers;
- `dwellMs()`;
- attention limits;
- text sizes as fractions of frame height;
- the focal share;
- contrast floors;
- safety limits;
- safe areas per shape;
- the life cap;
- `BANNED`;
- `LOOP` (3 rounds; a scene passes at a mean of 8 over its axes with none under 6, the references' own bar; fix the worst 3);
- `CRITIC_AXES`;
- `RULES_PROMPT`.

Checks and prompts import from it, and no other file restates a number.

## 4. Server modules

### 4.1 `src/business/domain/shots/` (new)

| File | What it does | WP |
|---|---|---|
| `types.ts` | `ShotPlan`, `PlanShot`, `PlanSet`, `PlanActor`, `PlanInfo`, `PlanCamera`, `TargetRegistry`, `RegistryEntry`, `ShotProblem` (done in wave 0) | 0 |
| `shot-registry.ts` | Builds a scene's registry from the research log (people, places, numbers, claims), the world (sides, show-map regions and seams), place coordinates, the picture desk (once WP11 lands) and charts; `entries()`, `resolve(name)`, `promptList()` | 4 |
| `shot-check.ts` | `checkPlan(plan, narration, registry)`, which checks the closed lists, anchors that exist in the words, targets in the registry, one focal per shot, the words-on-stage budget and banned patterns. `mendPlan()` repairs silently; `safeShot()` falls back to the show map held with a push, a verified photo, or a quote card for exact words only, never a word card. `checkTimed(shots)` checks gaps, dwell, cues at once and the first change. | 4 (plan), 5 (timed) |
| `shot-board.ts` | Orchestrates the board: registry → prompt → model → check → one retry with the problems → mend → safe shots | 4 |
| `shot-build.ts` | `buildShots(plan, ctx)` turns each set, actor, info and camera into assets and resolved targets: charts via `shot-charts.ts`; maps via `mapGeo()` (WP8; until then the SVG map asset); kit pieces via `kit/registry`; pictures via `pictures/desk` | 5 |
| `shot-charts.ts` | The code kinds drawn full frame with named parts (`data-part`) and part boxes: counter, icons, calendar, seats, strike, transfer, document, split, chart, plot, timeline, flow, quote. Also the SVG map (regions, seams and pins as parts) until MapLibre lands. | 6 |
| `shot-time.ts` | Every `on` phrase → ms on the voice's word times (reusing `scene-timing.ts`'s `anchorMs`), with the settle rule (a change settles 50–150 ms before its word); shot `startMs`/`endMs`, `durMs` defaults by recipe, `joinMs` | 5 |
| `shot-sound.ts` | Recipe → sound id + gain; snaps a cue to the score's nearest beat within ±120 ms; one cue per heard event | 12 (5 writes the hook) |
| `shot-compose.ts` | `composeShotScene()`: the look from the world's palette and fonts, assets, timed shots and sounds → `SceneDto` with `engine:'shots'` | 5 |
| `frame-checks.ts` | Pure checks on `InspectReport`s plus pixel stats: focal share, overlap, readable size, contrast, dwell, pace, blank, strobe, safe areas, banned; with a score summary | 2 |
| `shot-critic.ts` | The critic's prompt input (contact sheet + rows + plan), its closed list of fixes, `applyFixes(plan, fixes)` | 13 |

### 4.2 `src/business/domain/kit/` (new, WPs 9–10)

| File | What it does |
|---|---|
| `rig.ts` | KitPiece = `{ id, svg, parts, rig, focal, colours }`; validation (every rig part exists, pivots inside boxes) |
| `style.ts` | Editorial style tokens from the show's look: line weights, fills by role, paper texture, shadow, corner radius |
| `registry.ts` | Kit ids → `{ family, params (closed lists), about (for the prompt), make(params, style) }` |
| `people.ts` | Silhouettes: standing, walking, pointing, seated, at a lectern, raising a hand, holding a sign; pairs; groups; crowds in the hundreds (far rows instanced); era cues; side colours; rigs with walk, turn, point, sit, stand, leave and wave |
| `vehicles.ts` | Cart, car, bus, lorry, train, ship (sail, steam, container), plane (propeller, jet), rocket, by era; moves: enter, travel-to, stop, leave |
| `buildings.ts` | House, flats, office tower, factory, warehouse, assembly hall, court, school, hospital, market stalls, port cranes, farm, by era and climate (ports `scene-eras.ts` from `ig-illustrated`) |
| `documents.ts` | Letter, charter or treaty, newspaper, ballot, banknote-like note, booklet, stamp; text only from the research log |
| `objects.ts` | Phone, computer, book, coins, sack, barrel, crate, battery, lamp, key, lock, chain |
| `machines.ts` | Gears, belts, pistons, pumps, turbines (ports `scene-machine.ts`'s ratio logic from `ig-motion`); the turbofan cutaway with named parts and a core-flow path |
| `sets.ts` | Sky by time of day and weather, land, water, townscape silhouettes by density and era; parts for the sun, lights and clouds; states for dusk, night and lights-on |

### 4.3 `src/business/domain/pictures/` and `src/web/adapters/pictures/` (new, WP11)

- **`desk.ts`:** `find({ qid?, name, kind, year?, place? })` → candidates with licence and provenance; `pick()`; a cache keyed by sha1 in our storage bucket.
- **`licence.ts`:** allows PD, CC0 and CC BY. It rejects anything unclear and the red flags in research §3.4 (AP, Reuters, Getty and AFP credits; screenshots; "own work" that is really an agency photo).
- **Adapters:** `wikidata`, `commons`, `nasa-images`, `met`. Smithsonian needs an api.data.gov key, so it's added if one exists.
- **QIDs:** Wikidata `wbsearchentities` gives people and places their QIDs. A portrait is a person's P18 image, licence checked.
- **Depth:** the depth model (Depth Anything V2 Small, ONNX) is optional and sits behind `PICTURE_DEPTH=on`; its weights need Richard's OK to download. Without it, a photo is one plane.

### 4.4 The processor and other changes

- **Flag:** `EXPLAINER_SHOTS`, read the way `STUDIO_ILLUSTRATED` is read (§9).
- **Board:** for a lesson scene with the flag on, `shot-board` writes and stores a ShotPlan where the scene's board is stored today (§9).
- **Make:** for a scene with a ShotPlan, voice and timing run as today; then build, time, sound, compose and store; the artist steps are skipped.
- **Frames (WP2 → WP13):** after the make, a scene's stills are captured and checked. From WP13 the critic loop runs here (≤ 3 rounds, with a budget cap).
- **LLM tasks** (`llm.port.ts`, `models.ts`, the adapter, the fake):
  - `explainer_shots`: the board, GPT-5.4 mini, effort low;
  - `explainer_critic`: GPT-5.4 mini with image input;
  - `kit_custom`: WP16.
- **Endpoints:** `GET /tiles/terrain/:z/:x/:y.png`, a terrain-tile proxy that caches tiles in our bucket (WP8).
- **Migrations** (additive only):
  - 0066: picture cache (WP11);
  - 0067: frame scores per scene (WP13);
  - 0068: the kit library (WP16).
- **CLIs:**
  - `scripts/frames.ts` (stills, checks, contact sheets, scores);
  - `scripts/shots-remake.ts` (copy an episode and remake it with the shots engine, for side-by-side comparison);
  - `scripts/shots-board.ts` (board one scene and print its plan).

## 5. Client modules

### 5.1 `src/lib/motion/` (pure maths; WP3)

| File | Exports |
|---|---|
| `types.ts` | `Track`, `Ease`, `Point`, `SpringSpec`, `Key`, `Lerp` (done in wave 0) |
| `seed.ts` | `mulberry32(seed)`, `hashSeed(str)`, `rand(seed, i)` |
| `noise.ts` | Seeded value/simplex noise in 1–3 D, `fbm` |
| `ease.ts` | linear, `cubicBezier(x1,y1,x2,y2)`, the house eases (editorial ease-out `cubic-bezier(0.22,1,0.36,1)`), `steps(n)` (on twos) |
| `spring.ts` | A closed-form damped oscillator from `{durationMs, bounce}`; `springAt(t)`; `springTrack(changes)`, where a value with several targets is the sum of one spring per change; `settleMs` |
| `track.ts` | `track(keys, lerp)` with ease and spring keys; number, colour, point and transform lerps |
| `colour.ts` | Parse and format hex/rgb; OKLab mixing; contrast ratio (shared with the checks) |
| `path.ts` | Path length, point and tangent at a length, a sub-path for draw-on (uses `svg-path-properties`, MIT, pure JS) |
| `morph.ts` | `morpher(fromD, toD)` via `flubber` (MIT), cached |
| `stagger.ts` | Offsets for children (30–60 ms); follow-through (60–120 ms); anticipation (2–4% over 80–150 ms) |
| `text.ts` | Splitting into words and letters (the logic; measuring is the stage's) |

### 5.2 `src/lib/shots/` (ShotStage; WP7, with recipes from WP3)

| File | What it does |
|---|---|
| `types.ts` | `RecipeContext`, `RecipeInstance`, `Recipe`, `ResolvedTarget`, `InspectItem`, `InspectReport`, `ShotStageApi`, `ShotStageOptions` (done in wave 0) |
| `stage.ts` | `class ShotStage implements ShotStageApi`: builds the DOM (an SVG world for set, actors and info, a canvas for life, an HTML overlay for chips and tags), mounts shots lazily around `ms`, and renders by time |
| `camera.ts` | The camera solver: frames a focal box per shape with padding; moves on springs (establish, travel, push, pull, follow, cut-to, zoom-through, return, hold); parallax per layer depth; `speed(ms)` |
| `joins.ts` | continue, cut, match (shared-silhouette overlap), morph (same entity), zoom-through (into a pin or part, the next shot opening from it), dissolve, dip, push |
| `targets.ts` | Resolves a `ShotTargetDto` at ms: asset parts (boxes from the DTO, elements by `data-part`), actors (moving), geo (through the map's projection), features |
| `set-svg.ts` | The svg, chart, document and set kinds: sanitised once (`sanitize-svg.ts`), parts indexed, state changes |
| `set-photo.ts` | Photos and portraits (WP11): planes from the depth map, treatments by SVG filter (duotone, halftone, cut-out), the portrait card |
| `set-map.ts` | MapLibre (WP8) |
| `actors.ts` | Kit pieces on the set: rig states and moves (walk cycles from pivots), side colours |
| `info.ts` | Mounts a recipe per info item and renders them |
| `life.ts` | The life layer on a canvas (WP14) |
| `recipes/*.ts` | One file per recipe group: build (draw, label, pin, fill, seam), change (count, grow, transfer, morph, run, strike, stamp), attention (flow, spotlight, mark), enter/exit and ask; `recipes/index.ts` maps id → Recipe |
| `sounds.ts` | Plays `ShotSoundDto` cues in the player (WP12) |

**Integration (WP7):**
- `src/components/studio/shot-stage-view.tsx` is the React wrapper.
- `episode-player.tsx` and `render-film.tsx` choose it when `scene.engine === 'shots'` (§9).
- The render page's `window.__render` gains:
  - `inspect(ms)` → `InspectReport` (WP2 adds it for `SceneStage` too);
  - `ready()`: waits for fonts, images and map idle;
  - `speed(ms)`.
- **Labs:**
  - `/dev/shots` plays a `ShotSceneDto` JSON from `public/dev-scenes/shots/`, with a time slider, the wide/tall shapes, and stills;
  - `/dev/recipes` shows each recipe on a mock context (WP3).

## 6. Work packages

Agents work in worktrees `/Users/richard/.easyread-worktrees/an-<name>`, on branches `an-<name>` made from `animation`. The lead merges into `animation`, with the main trees on `animation`.

| WP | Agent | Repos | Builds | Needs |
|---|---|---|---|---|
| 0 | lead | both | Contract, rules, types, flag, this plan, briefs | — |
| 1 | `floor` | server | Phase 0 switches in today's path: no word cards (safe fallbacks), no audience stand-ins, no stock figures for groups, no invented places | — |
| 2 | `frames` | both | `__render.inspect` (SceneStage + the hook ShotStage fills); film-capture "times"; `frame-checks.ts`; contact sheets; `scripts/frames.ts`; baselines for the Nigeria and jet-engine episodes | — |
| 3 | `motion` | client | The motion core, all 18 recipes against `RecipeContext`, `/dev/recipes` | 0 |
| 4 | `board` | server | Registry, shot schema and prompt, the `explainer_shots` task, plan checks, mend and safe shots, the board under the flag, `scripts/shots-board.ts` | 0 |
| 5 | `compose` | server | Build, time, compose; timed checks; the make under the flag; the sound hook; `scripts/shots-remake.ts` | 0, 4's plan type, 6's chart API |
| 6 | `charts` | server | The code kinds full frame with named parts, the SVG map asset, sample scenes for `/dev/shots` | 0 |
| 7 | `stage` | client | ShotStage, camera, joins, targets, the set/actor/info layers, player and render integration, `/dev/shots` | 0, 3's recipes (merged as they land) |
| 8 | `maps` | both | MapLibre set, `mapGeo()`, the terrain proxy and cache, export GL flags, map readiness | 5, 7 |
| 9 | `people` | both | Kit rig format, style tokens, registry, people and crowds, vehicles; actor moves on the client | 5, 7 |
| 10 | `things` | both | Buildings, documents, objects, 2D machines with the turbofan, sets; set states and the machine `run` on the client | 9's rig format |
| 11 | `pictures` | both | Picture desk, licence rules, cache, QIDs, the portrait/photo/document sets with treatments and planes | 5, 7 |
| 12 | `sound` | both | Code-made effects (click, tick, pop, thump, whoosh, pencil, paper, swell, rise); recipe sounds; beat snapping; mix in the export; playback in the player | 5, 7 |
| 13 | `critic` | server | The critic task, fixes, the loop, scores (migration 0067), calibration tooling | 2, 5 |
| 14 | `life` | both | Procedural life effects under the cap; Lottie playback and recolouring; life defaults per set | 7 |
| 15 | `polish` | both | Adaptive motion blur in the export, a 60 fps option, render speed | 8 |
| 16 | `custom` | both | Custom kit pieces written by a model as declarative SVG and rig JSON (never script), sanitised, checked by frames and the critic, saved to the kit library (migration 0068) | 9, 10, 13 |

**Waves:**
1. **Wave 1, now:** 1, 2, 3, 4, 5, 6, 7.
2. **Wave 2,** when 5 and 7 are merged: 8, 9, 11, 12, then 10 when 9's rig format is in.
3. **Wave 3:** 13, 14, then 15 and 16.

At most five agents run at once (the Mac has 8 GB). Heavy commands go through `heavy.sh`.

## 7. Acceptance per work package

Every WP needs:
- tsc clean in both repos;
- `npm test` passing;
- eslint clean on touched files;
- tests for every pure function;
- for anything visible, stills the agent looked at;
- a report.

| WP | Done when |
|---|---|
| 1 | A new explainer made with today's engine has no word card, no audience figure and no stock group figure, and no invented place. Specs cover each switch. |
| 2 | `scripts/frames.ts --episode <id> --user <id> [--shape tall]` writes a contact sheet per scene, `checks.json` and a score summary. Baselines for two old episodes are in the report, and checks run in under 2 minutes per episode. |
| 3 | Every recipe passes the purity test (the same ms gives the same DOM, in any call order), and `/dev/recipes` shows each one. The springs match the closed form to 1e-6. |
| 4 | `scripts/shots-board.ts --scene <id>` prints a valid plan for three real lesson scenes. Bad plans are mended or fall back, with zero word cards. The fake LLM drives the specs. |
| 5 | The flag on and `scripts/shots-remake.ts --episode <id> --copy` gives a copy whose scenes have `engine:'shots'`, timed, with sounds. `checkTimed` passes or is mended. |
| 6 | Each code kind renders full frame with every addressable part named. Sample scenes play in `/dev/shots`. |
| 7 | `/dev/shots` and the Studio player play the sample scenes and a remade episode. The MP4 export renders them. `inspect` and `ready` work. |
| 8 | The Kano rows play on a tilted terrain map in the player and in the MP4. Map frames are ready before capture, and frame time is measured. |
| 9, 10 | An episode shows silhouettes, crowds, vehicles, buildings, documents, objects, the turbofan cutaway and sets, each in the editorial style, with rig moves. |
| 11 | A history episode shows verified portraits and archive photos with chips and credits, and every licence is checked. |
| 12 | Every heard motion has its sound; cues snap to beats; the MP4 mix includes them. |
| 13 | A remade episode runs the loop: scores per round are stored, fixes are applied, and nothing falls below a safe shot. |
| 14 | Life runs on every set it belongs to, under the cap, seeded, in the export. |
| 15 | Motion blur appears on fast camera moves only; 60 fps works. |
| 16 | A missing piece is drawn, checked, saved and reused by a second episode. |

## 8. How Richard compares old and new

`scripts/shots-remake.ts --episode <id> --copy` makes a copy of any episode with the shots engine. The copy sits on the same account next to the original, so the same story can be watched both ways. `scripts/frames.ts` scores both.

## 9. Insertion points in today's code

Full detail with line numbers is in this build's maps (`…/scratchpad/anim/maps/server-pipeline.md`, `client-player.md`, `failures-kinds-maps.md`). In short:

**Server**
- **The switch.** `EXPLAINER_SHOTS` is read through the editor's `deps.setting(name)`, as `STUDIO_ILLUSTRATED` is: the worker resolves `config.get ?? process.env`; scripts pass `process.env`; specs inject it.
  - The parser is `shotsSwitchOn(value)`, next to `illustratedSwitchOn` (`studio-editor-cut.ts:55`), default off.
  - The decision is stored on the sheet (`engine: 'shots'`), so make, twin, repace and recompose decide from the stored value, never from the switch at that moment.
- **The board.** In `boards()` (`studio-editor.processor.ts:1207-1209`), a lesson scene with the switch on goes to `shotsBoard` (new, beside `lessonBoard` :1262).
  - It writes an `ExplainerSheet` with:
    - `draft`: the beats only, one per row, word for word, via `onTheLines`; `things: []`, `steps: []`;
    - `engine: 'shots'`;
    - `shots: ShotPlan`;
    - `rowClaims`: each row's claim ids. Today's board loses them.
  - Extend `ExplainerSheet`/`SceneSheet`, `explainerSheetOf`, `sheetOf`, `secondsOf` and `spokenOf` (`studio.ts:1446, 1654, 1738, 1766, 1755`) so the new fields survive. Today they are silently dropped.
  - The LLM call is a new `editorBoard` kind or a new port method on task `explainer_shots` (`llm.port.ts:1001`; adapter :3061; fake :2609; prompt beside `editor-prompts.ts:498`).
  - The fallback in `plainBoard` (:1231) for a shots scene is the safe shots, never keyword cards.
- **The make.** In the explainer branch of `studioMakeOf` (`studio.processor.ts:353-590`), a sheet with `engine:'shots'` skips the things checks and passes `shots: ShotsInput` (the plan, the registry entries, the look and the show map) into `scenes.make` (:3161).
  - In `SceneProcessor.make`, `drawAll` has nothing to draw, and `voice` runs as today.
  - `composeStored`'s compose closure (`scene.processor.ts:1041-1059`) calls `composeShotScene(input, timedBeats, …)` instead of `composeScene`. The same branch goes in `recompose` (:1402/1487), `repace` (:1531) and twins (`makeTwinScene`, SP:3676).
  - The stored SceneDto keeps `beats`, `ideas`, `timing`, `sound`, `durationMs` and `settledMs`, with `things: []`, `steps: []`, `effects: []` and `stagings = { box: {w,h,places:[]}, wide: {w,h,places:[]} }`: 1600×900 wide, or 900×1600 tall.
- **Sound.** The shots composer writes `shots.sounds`.
- **Storage and serving are unchanged:** the SceneDto JSON goes to storage at `sceneKey`, served by `GET /studio/scenes/:id/scene`. Don't bump `SCENE_GENERATOR_VERSION`.

**Client**
- **One switch.** `components/reader/scene-stage.tsx:92-108` makes `new ShotStage(host, scene, opts)` when `scene.engine === "shots"`. That covers the player (`episode-player.tsx:862`) and the render page (`render-film.tsx:466`).
  - Guard the reads of `scene.things` and `stagings` (:84-90, :134).
  - ShotStage takes the SceneDto and plays `scene.shots`, sized like today's stage: `stagings.wide.w/h`, an aspect box, `contain: layout paint`.
- **Render readiness.** In `render-film.tsx`, after `flushSync(setMounted)` (:327), `seek` awaits every mounted ShotStage's `ready(ms)`. The page's `ready` (:408-415) also awaits the first scene's.
  - `__render` gains `inspect(ms)` (an `InspectReport` from the mounted stages) and `speed(ms)`.
- **Sound.**
  - Live: in `episode-player.tsx:459-490`, a shots clip passes `options.cues` (from `shots.sounds`) to its `SceneSound` (`lib/scene/sound/engine.ts:218`). Music is unchanged (`scene.sound.music` through the Conductor).
  - Offline: `offline-effects.ts:88-113` reads the same cues for the export.
- **Photos.** `sanitize.ts` forbids `<image>`, so ShotStage draws photos itself (HTML `<img>`/canvas planes), never inside a sanitised SVG.
- **Names.** `lib/scene/shots.ts` already exists (shot framing for stories). The new engine lives in `lib/shots/`.

## 11. Decisions made during the build

### 2026-10-02 (Richard)
After sending two references of his own, a cartoon world-history film and a UI/UX redesign walkthrough:
1. **Both looks, chosen per show.**
   - **Editorial:** portraits for named people, silhouettes for groups.
   - **Illustrated:** cute era-dressed characters for groups, and named characters with a label, on the same maps and sets.
   - Archive portraits and paintings appear in both looks.
   - The app picks the look from the topic and the maker can switch. It is stored with the show's visual system, and `ShotLookDto` gains `style?: 'editorial' | 'illustrated'` (an addition only).
2. **The UI kit for tech and how-to explainers:**
   - device frames;
   - screens built from UI parts by code;
   - a cursor that moves, clicks and drags;
   - numbered callouts;
   - state swaps behind a short blur;
   - before and after;
   - chapter breaks.
   - A generic UI only, never a fake screen of a real product.

Richard then left the remaining calls to the lead overnight ("Make the decisions").

### New work packages

| WP | Agent | Repos | Builds | Needs |
|---|---|---|---|---|
| 17 | `characters` | both | The illustrated look: era-dressed characters built on the figure kit (`scene-figure.ts`, with eras, wardrobe and likeness ported from `ig-illustrated`), restyled flat and clean with a consistent big-head proportion. Groups get varied characters in their side's colour; a named person gets a labelled character (plus their archive portrait when one clears). They stand on maps (geo) and in sets. Also a `say` recipe (a speech bubble of up to 6 words, used sparingly), "eyes" on map regions (personified countries, illustrated look only), and the look switch (the board's kit choice, the stored look). | 9 (rig, registry) |
| 18 | `ui` | both | Device frames (phone, tablet, laptop, browser, app window); screens from UI parts by code (bars, cards, lists, buttons, inputs, toggles, sliders, small charts, image slots); component states; a cursor actor (move, click with a press ripple, drag, scroll, type); recipes `callout` (numbered dots on leaders) and `swap` (a state change behind a short blur); a `frost` chapter break; before and after. | 7, 9 (rig) |

### Calls made while merging (2026-10-02)

- **The critic's pass.** A scene passes at a mean of 8 over its axes with no axis under 6. The brief's "every axis 8 or more" is stricter than the references themselves: only 6 of their 21 calibration sheets meet it, against 9 for this bar. Under the old rule nearly every scene would use all its rounds and the episode's budget.
- **A kit setting's `text` limit counts characters**, for every family. The characters and UI kits had given the same field two meanings: characters and words.
- **A swap's state and a type's words are a device's own small print.** The mend keeps them as written (a type keeps up to four words) and never counts them as words on the stage.

## 12. To-do: the 3D engine

This is the product plan's §11:
- a three.js stage in the set layer (orbit, section sweep, exploded views, flows, labels on 3D anchors);
- machine generators.

It is not scheduled. The contract will add `'machine3d'` to `ShotSetDto` when it is built.

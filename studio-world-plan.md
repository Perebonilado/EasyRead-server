# The Studio's world: physics, micro-interactions and 3D scenery

> **2026-09-28: Track B (3D scenery) is replaced by `studio-scenery-plan.md` (layered 2D scenery).** Track A (physics) stands.

A technical plan, 2026-09-28. It covers two tracks that ship together:

- **Track A, physics and micro-interactions.** Bodies with weight, parts that swing, walks that plant their feet, action moves with a wind-up and a landing, and a world that reacts to the people in it.
- **Track B, 3D scenery.** Places built as real 3D sets from the AI's layout, in any era or region, with a camera that moves through them.

It builds on the code as it is today. Section 1 records the facts the plan rests on, with file references, so each change below has a place to land.

---

## 0. Principles

1. **Everything is a function of the film's clock.** A frame at 0:42.300 looks the same whether it is reached by playing, jumping or scrubbing, on any device. Anything with memory (springs) is stepped on a fixed time grid from a known starting point, never from "the last frame".
2. **Code decides the world; models only name things.** The AI writes what a place has and roughly where (the layout). Geometry, physics, reactions and camera moves are all code. No model reasons about coordinates or forces.
3. **Picture and sound come from the same events.** Every landing, footfall, brush past a bush or door slam is one event, used by both the renderer and the sound engine, as `landingsOf` already is for bounces.
4. **Old films keep working.** New behaviour lives mostly in the player and is keyed by new fields, so existing scene files play as before or better. Anything that changes a drawing's bytes is versioned.
5. **One look.** 3D sets and 2D characters share one ink line, one palette and flat light, so nothing looks pasted on.
6. **A floor under every device.** High-end phones get everything. A device that can't keep up gets the current flat stage with the 2D reactions. Nothing ever fails to play.

---

## 1. What exists today (the facts this plan rests on)

### 1.1 The player (client `easyread`, `src/lib/scene/`)

- **DOM and SVG only.** There is no canvas, WebGL or three.js. Each drawing lives in its own shadow root (`stage.ts` `mount()` :1165). The camera is a CSS transform on a `camera` div (:659-682). Sets are mounted in `back` with a parallax of 0.4 (`timeline.ts` `sceneryCamera` :2343).
- **Layer order:**
  - `back` (sets, per-set weather, `setShade`)
  - `camera`, which holds, in order:
    - `under`
    - `pieces` (features behind people)
    - `resting`
    - thing layers
    - `over`
    - `handled`
    - `piecesOver`
  - `front`
  - `allShade`
  - `fog`
  - `sky`
  - `glory`
  - `talk`
- **A frame is mostly a pure function of `t`.** `timeline.ts` keeps no state. The one stateful piece is `ActingMotion.follow()` (`motion.ts` :1462): semi-implicit Euler springs at 120 Hz, reset to target on a seek or on a gap over 400 ms. So a frame reached by seeking shows no overshoot, while the same frame reached by playing does.
- **Rigs are driven by CSS variables** set each frame:
  - kit figures (`act()` :1396): `--ar --arf --al --alf --legr --legl --knr --knl --low --lean --flip --gx --gy --turn --tilt --nod --brow`;
  - artist, animal and creature rigs (`pose()` :1438): `--head --tail --low`.
  - Each drawing's own CSS/SMIL animations are paused and have their `currentTime` set from the clock (`drive()` :1472).
- **Springs** (`SPRINGS` :51-70) cover gaze, head, arms, lean, legs, `low` and face. `squash`, `hop`, `roll`, `flip` and `tail` are unsprung pass-throughs, so there is no follow-through on landings or tails.
- **Walks:** `walkEase` is a trapezoid (15% in and out; `timeline.ts` :122). The body slides; legs lift vertically in a 0.64 s CSS loop (`scene-figure.ts` `ACTS.walking` :2880). There is no swing and no foot plant, and footfall sounds play only for runs (`cues.ts` `footfallsOf` :343).
- **Props** are analytic in `t` (`business.ts` flights; `motion.ts` `flyingAt` :1000, `lyingAt` :952): parabolic arcs, bounces decaying by 0.62 per bounce, rolls with `easeOut`.
- **Environment motion** is fixed CSS loops only: `.sway`, `.ripple`, `.flicker`, `.drift`, `.twinkle` (`LIVING_SET` :250). Nothing reacts to anyone.
- **Performance:** the player re-renders React every frame (`episode-player.tsx` :198, `setFilmMs`). Each stage calls `getAnimations()` per drawing per frame and rewrites prop `innerHTML` each frame.
- **Dependencies:** Next 16.3.3 and React 19.2.4. No three.js and no physics library.

### 1.2 The scene the player receives (`src/contracts/index.ts`, mirrored in the client)

- `SceneDto` gives `things` (drawings with `parts`, `states`, `joints`, `legs`), `steps` (`enter`/`exit`/`pace`/`hurry`), `effects` (faces, signs, zooms, speech), `acting` (`moves: [atMs, move, ms, toward]`, `look`, `mouth`), `props` (`does`), `setting` (time, weather, crowd, `features` with `at`/`way`/`seat`/`leaf`) and `stagings` (box and wide places per step).
- **No depth, no z and no set layout reach the client.** The set arrives as one finished SVG.

### 1.3 Characters (server `easyread-server`, `src/business/domain/`)

- **Figure kit** (`scene-figure.ts`, byte-locked):
  - Group tree: `flip > whole > legs | breathe > behind | body | arms | head | faces | mouths | signs`.
  - Legs have hip, knee and foot pivots. Arms have shoulder and elbow pivots.
  - Hair behind, cloak, scarf and wings are **not** separate pivoted groups: they ride on the head or body.
- **Animal kit** (`scene-animal*.ts`) and **creature kit** (`scene-creature*.ts`) use artist-rig classes with code-written pivots (`rig-leg-a/b`, `rig-tail`, `rig-ear`, `rig-head`, `rig-flap`). Tails are one rigid group driven by fixed loops or `--tail`.
- **Artist rig** (`scene-sheet-rig.ts`, `RIG_VERSION` 5): measured pivots; `SWINGS` amplitudes; legs step ±22° over 0.92 s.

### 1.4 Places (`scene-set-layout.ts`)

- The AI writes a `SetLayout`:
  - sky (day, dawn, dusk, night)
  - weather (clear, cloudy, snow)
  - 12 ground kinds
  - 9 backdrops
  - walls or vessel (bus, train, plane, boat)
  - up to 14 items `{kind, x share, row back|middle|front, scale, colour}`
  - up to 2 own items
- Code draws it at 1600×900 (`buildSet` :1637) and stores it as `SetSheet.layout`.
- **The perspective is already a pinhole ground plane.** Constants:
  - `FEET` = 820
  - `UNIT` = 2.357 set units per kit unit at the feet
  - `FLOOR_LINE`: outdoor 576, indoor 630, vessel 648
  - `EYE` = floor − 80 outdoors
  - `rowFeet(kind, row)` and `scaleAtFeet(kind, y) = UNIT·(y−EYE)/(FEET−EYE)` (:698-732)

  **A 3D camera can be fitted to this exactly.**
- The world (era, region, landscape, homes) reaches the painter through `layoutBrief`/`worldText` (:639-694). Culture is not passed.

### 1.5 Timing (server)

- **Before voicing:** `studio-stage.ts` `timeQuiet` (:484) chains the silent items. If the chain passes `QUIET_MOST_S` = 6 s, it bisects one uniform `share` so everything shrinks toward its `leastS`. This is where wind-ups and settles are lost. The result becomes `holdS`, the pause the voice leaves after a line.
- **After voicing:** `scene-compose.ts` `quietShare` (:1111) scales a quiet down again if the voice left less than 90% of `holdS`. `scene-film.ts` `hurried` (:314) speeds walks up to 1.7×, then turns them into runs. `scene-film.ts` :15-35 duplicates the player's walk timings.

### 1.6 Stills

`scene.processor.ts` `thumb()` (:1984) rasterises each layer with resvg in a child process. resvg renders static SVG: no CSS, no JS, rigs at rest.

---

## 2. Architecture decisions

### 2.1 Characters stay live SVG and are projected, not textured

Painting each character onto a canvas texture every frame (the earlier 3D doc's idea) would throw away:

- the CSS-variable rigs,
- the shadow-root isolation,
- the paused-animation clock,
- the face blinks and signs.

It would also cost a rasterisation per character per frame. So the characters keep rendering exactly as they do; we move them.

- A 3D camera (three.js `PerspectiveCamera`) renders the set to a WebGL canvas.
- Each character's floor position `(x, z)` is projected through the same camera to a screen point and a scale.
- That becomes the character layer's CSS transform. Today it comes from `place()` in 2D stage units; it would come from the projection instead.
- Characters face the viewer. The camera is kept within a front arc (§6.4), so flat characters never show their edge.

### 2.2 Depth by layered canvases ("the sandwich")

- **Scenery** is rendered in two passes of one WebGL scene into two canvases:
  - `setBack`: everything behind the actors' floor band (sky, backdrop, back and middle rows, ground);
  - `setFront`: front-row items and anything nearer the camera than the nearest actor.
- **Characters** are DOM layers between the two canvases.
- **Features** people interact with (gate, door, bed, bench, stall, danfo…) stay the existing code-drawn 2D pieces with their leaf, seat and "over" copies (`mountPiece` :1011). They are positioned and scaled by the 3D projection, so a vendor still stands behind her stall exactly as today, with no per-pixel depth test.
- A 3D version of features is a later step (§6.9). It needs per-actor interleaving, which we avoid until the prototype proves the rest.

### 2.3 The 3D camera is fitted to today's 2D perspective

- From `FLOOR_LINE`, `EYE`, `FEET` and `UNIT`, solve for the camera height, pitch and field of view so the 3D ground plane projects exactly where the 2D set's ground lies.
- The **main camera** then reproduces today's framing. Every spot, station, feature position and walk the composer writes stays valid unchanged.
- New camera moves are deltas from this main camera. Server staging does not change for 3D.

### 2.4 The set is described, not shipped

- The server sends the layout plus a style id (§6.2). It does not send geometry.
- The client builds the 3D set deterministically from them (seeded by place id and name, as `buildSet` already is).
- The payload stays small. Improving the kit improves every old film. The 2D `buildSet` SVG stays as the fallback and for thumbnails.

### 2.5 Determinism for anything with memory

Every spring-driven quantity is stepped on a fixed global grid (`k·STEP_MS`, 120 Hz).

- To show time `t`, start from rest at `t0 = t − PREROLL_MS` (1500 ms, clamped to the clip start) and step forward.
- During continuous play, keep the state and advance from the last grid step. Because the grid is absolute, the result is identical to a fresh pre-roll.
- Cost: at most 180 steps × the springs in view, only after a seek. This replaces the present "reset to target after a seek over 400 ms" rule, so a seek shows the same overshoot as playback.

### 2.6 One event model

A new pure module, `src/lib/scene/world-events.ts`, derives a sorted list of `WorldEvent {atMs, kind, x, z, strength, who?, what?}` from the scene. It uses existing functions: `framesAt`, `businessOf`, `landingsOf`, the stride phase (§4.2) and feature states.

| Kind | Source |
|---|---|
| footfall | Stride contact frames, walks and runs |
| land | Jump or leap landing, `lyingAt` bounces, prop drops |
| brush | A character's x crosses a sway-able item in the band next to their z |
| slam / creak | Feature open or shut, `SWING_MS` |
| loud | Shout lines, thuds, barks, crowd cheers |
| splash | A landing on a water ground or item |
| gust | Scene wind, a door opening indoors, a vehicle passing |

The renderer (2D or 3D reactions) and the sound engine (`cues.ts`) both read this list. `footfallsOf` becomes a consumer of it.

---

## 3. Track A, phase 0: foundations

### 3.1 Get the player off React's per-frame render

- **Change.** `EpisodePlayer` subscribes `film.subscribe(ms => setFilmMs(ms))` (:198), so the whole React tree re-renders every frame. Instead, `SceneStage` receives the `FilmClock` (or a `ClipView`) and calls `stage.render(localMs)` from the clock's subscription directly. React state updates only for the UI chrome (scrubber, time), throttled to about 10 Hz.
- **Also:**
  - Cache `getAnimations()` per shadow root; refresh only on mount or state change.
  - Stop rewriting prop `innerHTML` each frame: mount prop SVG once and move it with transforms (`drawHandled` :1535).
- **Done when:** a 3-character market scene holds 60 fps on a 2021 mid-range phone in the 2D player. Measure with a new `?perf` overlay: frame time p50/p95 and long tasks.

### 3.2 A fixed-step spring engine

- **New `src/lib/scene/springs.ts`:**
  - `SpringBank`, a keyed set of `{x, v}` channels with `[ω, ζ]` params.
  - `stepTo(tGrid)` on the absolute grid.
  - `settleFrom(t0, targetFn)` for the pre-roll.
- **Move `ActingMotion.follow()` onto it** (§2.5). Add springs for:
  - `squash` (ω 22, ζ 0.35): the landing wobble;
  - `hop` (ω 18, ζ 0.5);
  - `tail` (ω 9, ζ 0.3);
  - the new dangles (§4.3).
- **Tests** (node:test, like `motion.test.ts`):
  - seeking to `t` equals playing to `t`, within 1e-6;
  - two devices at 30 and 144 fps give identical states at the same `t`.

### 3.3 The motion bench

- **New internal page** `/dev/motion` in the client, like the drawing bench:
  - every figure, animal plan and creature body, and every move and walk gait;
  - timing sliders, a scrubber, and a frame-by-frame step;
  - an overlay showing joints, foot contacts and spring channels.
- Every value in this plan is tuned here, never inside a real film.

### 3.4 The picture check, now (independent of 3D)

- After `make`, pick 2–4 moments: the fullest step, each asked-for change's beat, and the last frame.
- Render stills with the existing resvg path, extended to set each rig's CSS variables as inline attributes at that moment so poses show.
- Send them to `drawing_judge` (Gemini Flash) with the scene sheet's own claims: who is on stage, what each feature is, what the asked change should show.
- It returns `{matches: bool, wrong: string[]}`. A mismatch (an ark drawn as a bus, a missing character) goes through the existing one free retry (`checkAsk` path) with the notes as problems.
- Cost is about 0.4¢ per still.
- **Done when:** replaying the Noah "vehicle ark" case flags "a yellow minibus where the sheet says an ark".

---

## 4. Track A, phase 1: bodies with weight

### 4.1 Give actions their time (server)

- **`scene-doings.ts` `Doing`:** add `idealMs` next to `ms`/`leastMs`, and a `phases?: {windUp, act, follow, settle}` share split for moves that have them.
- **`studio-stage.ts` `timeQuiet`:**
  - When a chain would pass 6 s, **extend** the hold instead of shrinking below `idealMs`, up to `ACTION_MOST_S` = 10 s for chains containing an action move.
  - Pauses between lines stay capped at 6 s. Wordless *action* no longer counts against it.
  - A chain made only of small gestures still compresses as today.
- **`scene-compose.ts` `quietShare`:** never scale a move below its `leastMs`. If the voice left less time, let the move run into the next line's first 300 ms (overlap is natural), not compress.
- **`scene-film.ts` `hurried`:**
  - Start the walk earlier, pulling it into the previous line's tail, before resorting to a hurry.
  - Hurry at most 1.35× (from 1.7) before a run.
  - Mirror any constant change in the client's `timeline.ts` (the duplicated values at `scene-film.ts` :15-35).
- **Test:** in the Maya fixture, the throw's wind-up is at least 250 ms and the settle at least 300 ms, where today they are compressed to about 140 ms.

### 4.2 Walks that plant their feet

- **Stride phase:**
  - `phase = distanceTravelled / strideLength`, where `strideLength = 0.55 × leg length × gaitFactor`.
  - Distance comes from the exact `walkPlace`/`walkEase` position, so feet never slide. Speed-up and slow-down change the cadence naturally.
- **Pose curves** over one cycle: contact → down → passing → up → contact, per leg, offset by half a cycle.
  - Hip swing ±24° (walk) / ±38° (run).
  - Knee bend at passing: 35° / 70°.
  - Foot counter-rotation keeps the sole flat at contact.
  - Body bob: lowest at *down*, highest at *passing*, 0.015 × height.
  - Arms swing opposite the legs (±18° / ±40°) with a 60 ms lag.
- **Kit figures:** drive `--legr/--legl/--knr/--knl` from the curves. Remove the `ACTS.walking` CSS loop (`scene-figure.ts` :2880), or leave it for old drawings, gated by the new rig version (§4.6). Update `drive()`'s special case for the `step`/`bob` names (`stage.ts` :1472).
- **Animal and creature kits:** a phase-driven `--step-a/--step-b` replaces the `step` keyframes:
  - quadrupeds: diagonal pairs;
  - waddle: side sway;
  - hop: both legs, big bob;
  - slither: a travelling sine on `rig-tail` segments (§4.3).

  Gaits come from `Built.gait`.
- **Artist rigs:** keep the ±22° swing but phase it by distance instead of a 0.92 s loop.
- **Footfalls:** each contact emits a `footfall` world event (§2.6), which becomes a soft step cue for walks too (runs only today), plus dust on dusty ground (§5.3).
- **Turn-arounds:** before walking the other way, a 180 ms weight shift and a flip at mid-shift, instead of an instant flip.

### 4.3 Dangles: parts that swing

- **Data** (new, on `SceneThingDto`):
  - `dangles?: {id, root: [x,y], segments: number, length, stiff, damp, rest, limit, wind}[]`
  - `root` is in viewBox units, as `joints` are.
- **Figure kit** (byte lock respected, see §4.6):
  - Wrap hair behind (ponytail, pigtails, braids, locs, long), the cloak or cape, the scarf end and wings in `<g class="dg dg-<id>">` groups. Each segment is nested `<g>`s with `transform-origin` at its joint.
  - A cloak becomes 3 panels: shoulder yoke, middle, hem.
  - A scarf end has 2 segments.
  - A ponytail has 3.
  - New `FIGURE_EXTRAS`: `cape` as its own item (separate from the long cloak), `ribbon`, `headscarf tail`.
- **Animal and creature kits:** tails become 3–4 segment chains, ears 1–2, manes 2. These are the existing `rig-tail`/`rig-ear` groups split at code-written joints, as `Built.tail`/`Built.ears` already give roots.
- **Artist rig:** a tail found by measurement stays one segment but is sprung (`--tail` from a spring) instead of looping.
- **Simulation** (`springs.ts`, per dangle):
  - Each segment angle is a damped spring toward `rest + inherited`.
  - Its drive is the root's acceleration in the character's frame: body `x''` from walks and hops, `lean`, head `tilt`/`nod` for hair. Plus wind (§5.5).
  - Children inherit the parent's angle with a lag (a chain of springs, each segment's ω × 0.8 of the one before), which gives the whip.
  - Clamp to `limit`.
  - Output: `--dg-<id>-<k>` CSS variables.
- **Budget:** at most 4 dangles × 4 segments per character; skip off-screen characters; turn off on slow devices (§7.3).

### 4.4 Overlap and weight

- **Head leads, arms follow:**
  - On a turn or start of motion, arm springs get a 60–90 ms input delay (a short delay line on the target) and a lower ζ (0.45), so they trail and overshoot.
  - The head gets the lead: its targets are advanced 50 ms.
- **Squash and stretch:**
  - Take-off: stretch 0.08 for 90 ms.
  - Landing: squash `0.12 × drop height factor` through the new `squash` spring (ω 22, ζ 0.35), so it wobbles once and settles.
  - Applied in `shape()` (`stage.ts` :889) about the feet, as today.
- **Anticipation:** every body move in §4.5 carries its own wind-up. Small everyday moves get a generic 120 ms counter-move (crouch before a jump, lean back before a throw, head down before a nod).
- **Weight shifts at rest:** every 3–7 s (seeded per character) a listening character moves their weight from one leg to the other: `--lean` ±1.5° and hip 3 units, over 700 ms. This replaces part of the sine drift in `live()`.
- **Listening:**
  - Listeners look at the speaker (exists).
  - They also react to line *endings*: a small nod or brow on statements, a head tilt on questions, placed at the last word + 150 ms.
  - Excluded while they act.

### 4.5 Action moves

- **Format** (client `src/lib/scene/moves/`):
  ```ts
  interface MoveClip {
    id: 'leap' | 'land' | 'dodge' | 'punch' | 'fall-hard' | 'get-up' | 'hero' | 'run-fast' | 'spin-kick' | ...;
    plans: ('person' | 'quadruped' | 'biped-animal' | 'bird' | 'creature')[];
    phases: { windUp: [minMs, idealMs]; act: [..]; follow: [..]; settle: [..] };
    channels: Partial<Record<ActingChannel, Keyframe[]>>; // keyframes in 0..1 per phase, eased
    travel?: { dx: number; dy: number };  // body travel in heights, e.g. leap dx 1.2, dy 0.6
    contacts?: { at: number; foot: 'l' | 'r' | 'both' }[]; // feet touching ground → world events
    camera?: 'wide' | 'follow' | 'crane';  // what framing it wants
  }
  ```
- **The stage plan stores the name, not the frames:** `acting.moves: [atMs, 'leap', ms, toward]`. This is the existing tuple, with new names added to `SceneActingMove` in both contract files. The player expands moves with `moveAt(clip, localT)`. Improving a clip improves every film.
- **Targets:** a leap `toward: 'f:wall'` reads the feature's `perch` point (`scene-set-pieces.ts`: wall perch 106, steps 66, tree 150, palm 270). It adjusts `travel` so the feet land exactly there, then holds the perch pose (`up:<f>` station, which exists).
- **The first nine moves:** jump (rebuilt with phases), leap, land, run-fast, dodge, punch, fall-hard, get-up, hero pose. Each is tuned on the motion bench on every body plan.
- **Server:**
  - Add the nine to `DOINGS` (`scene-doings.ts`) with `by`, `words` (e.g. "springs onto the wall", "ducks", "throws a punch" (gentle only: no contact on another person's face), "strikes a pose"), `fallback` (a creature with no legs dodges as a lean), `ms`/`leastMs`/`idealMs` and phases.
  - The writer prompt (`studio-prompts.ts`) lists them with when to use each, and "at most one or two big moves a scene unless the maker asks for action".
  - The mender maps words to them.
  - `auditScene` checks that every phase played at no less than its minimum, the feet were down at `land`, and no one passed through another character (box overlap at the same z band).
- **Safety:** the moves stay in the gentle picture-book register the SAFE rule asks for. A punch never shows contact; the target reacts with a stagger.

### 4.6 Versioning the figure kit

The figure kit's output is byte-locked so old drawings never change.

- New groups (dangles, the phase-driven walk) are drawn only when the drawing is made with `FIGURE_RIG = 2`, a new field on the figure's `CharacterSheet`/`SceneThingDto` (`rig: 2`).
- `drawFigure(spec, {rig: 2})` adds the wrappers. `rig` 1 output stays byte-identical, with a test hashing every spec (as the eyes-closed work did).
- A scene made after the change gets rig 2. An old scene plays rig 1 with the new springs on the channels it already has (arms, head, `squash`, `tail` on animals), so old films still gain weight and overlap without a remake.

---

## 5. Track A, phase 2: the world reacts

All reactions read the event list (§2.6) and are analytic in `t`: an impulse response `A·e^(−ζωΔt)·sin(ω_d·Δt)` summed over recent events. They never keep state, so they are seek-exact for free. Each runs in the 2D player first, then in 3D (§6.8).

### 5.1 Plants

- **Which items:** grass tufts, bushes, ferns, flowers, reeds, palm fronds, tree crowns (the pieces with `lives: 'sway'` in `scene-set-scenery.ts`).
- **What they do:**
  - They keep the idle sway.
  - A `brush` event within 0.08 of the width and the same depth band adds a bend away from the mover. It is sized by speed: 6° walk, 14° run, ω 7, ζ 0.25.
  - A `gust` adds a whole-set lean.
- **2D:** today the whole item is wrapped in one `.sway` group. Split crowns and fronds into 2 segments and drive `--bend` by CSS variable.

### 5.2 Water

- Sea, river, pond and puddle get ripples: expanding rings from `splash` and footfall-in-water events (radius `v·Δt`, alpha fading over 1.2 s).
- Idle glints are kept.
- Boats bob (a pendulum, ω 1.1) and take impulses when someone steps aboard.

### 5.3 Dust, sand and snow

- `footfall` on dirt, sand, red earth, path or snow, and every `land`, emits 3–8 particles.
- Motion is analytic: a ballistic arc with drag and a fade over 500–900 ms.
- Size and colour come from the ground kind.
- Snow and sand also leave footprints, which fade over 6 s. This is cheap in 3D (decals) and in 2D (a small ellipse group).

### 5.4 Things that hang, open and swing

| What | Reaction |
|---|---|
| Curtains | Split into 3 panels with pivots, and bulge on a `gust` (a door opening in the same room, wind) |
| Lamps and lanterns | Pendulum on a bump or loud event (ω from length, ζ 0.1) |
| Bunting, flags | Travelling sine along the string, driven by wind |
| Swing | Pendulum after someone leaves it |
| Well bucket | Sways after use |
| Gates and doors | Swing past open, then settle: a spring on `open` with ζ 0.5 instead of the linear 300 ms `SWING_MS` |
| Vehicles | Rock when someone boards |
| Stall awnings | Flap with wind |

### 5.5 Wind

- Scene wind strength comes from weather (wind or storm 1.0, rain 0.4, clear outdoors 0.15, indoor 0) plus a slow gust noise, seeded by scene id.
- It drives dangles (§4.3), plants, curtains, flags and drifting leaves (`weatherPieces` exists).

### 5.6 Animals and life in the world

- **Birds:**
  - A flock of 3–7 sits on perches (roofs, walls, trees, lampposts: pieces with `perch`/`crown`).
  - They take off on a `loud` event or a runner within 0.15 of the width.
  - They fly an analytic path (arc out and up, a wing-flap cycle), then return after 8–15 s or leave the frame.
- **Ambient life** by style pack (§6.2), all non-speaking and far from the floor band:
  - city: pigeons, a passing car behind a fence;
  - riverside: a heron;
  - farm: chickens.

### 5.7 Sound for every reaction

`cues.ts` gains:

- footfalls for walks, with surface-specific timbres (grass, sand, wood, tile, road);
- a rustle on brush;
- a splash on water;
- flutter on bird take-off;
- the door's settle bounce.

All are gain-limited through the existing `thin()` (at most 3 per 400 ms) and panned by x.

---

## 6. Track B: 3D scenery

### 6.1 Technology

- **three.js**, loaded only by the player and the Studio preview (dynamic `import()`, about 150 KB gzipped). No other 3D library.
- **One `WebGLRenderer`, one `Scene` per place**, reused across the scenes in that place.
- **Two render passes** (§2.2) into two stacked canvases, each at the stage's pixel size, capped at devicePixelRatio 2.
- **Rendering on demand:**
  - A frame re-renders the static set only when the camera moves or a reacting object changes.
  - Reacting objects (plants, water, birds, dust) live in a small dynamic group.
  - A still shot with no reactions costs almost nothing after the first frame.

### 6.2 Style packs: any era, any place

A style pack is data plus code that decides materials and shapes, chosen from the show's world.

```ts
interface StylePack {
  id: 'ancient-near-east' | 'biblical-village' | 'west-african-town' | 'lagos-today' | 'western-city'
    | 'american-suburb' | 'european-old-town' | 'east-asian-village' | 'village-farm' | 'nature' | ...;
  walls: MaterialSet;      // mud brick, lime plaster, painted block, brick, glass curtain wall…
  roofs: RoofKind[];       // flat parapet, thatch, zinc, tile, pitched shingle
  windows: WindowKind[];   // slit, arched, louvred, sash, storefront, curtain wall grid
  ground: Record<GroundKind, GroundMaterial>;
  backdrop: Record<BackdropKind, BackdropBuilder>; // dunes+pyramids, river+reeds, skyline, hills…
  props: SceneryKind[];    // which scenery each pack offers and with what look
  palette: PaletteShift;   // stays inside the house palette, nudged per pack
  light: LightPreset;      // sun colour and hardness, haze colour, ambient
  life: AmbientKind[];     // birds, pigeons, heron, chickens…
}
```

- **Choosing the pack:**
  - `bible.world` (era, region, culture, landscape, homes) is classified by code into a pack using keyword rules ("moses", "egypt", "bc", "biblical" → ancient-near-east; "lagos", "danfo" → lagos-today; "new york", "manhattan" → western-city…).
  - When code isn't sure, the set painter chooses from the list: a new `style` field on `SetLayout`, from `STYLE_PACKS`.
  - The chosen pack is stored on the set so every scene in the place agrees.
  - `worldText` starts passing `culture` too.
- **First five packs:** ancient near east (Moses, Egypt, Babylon), biblical village (Galilee, Bethlehem), Lagos today, western city (New York, London), village and farm. Nature (forest, beach, desert, river, mountain) is shared by all.

### 6.3 The set kit

- **Everything is code-built low-poly geometry,** in `src/lib/scene/world3d/pieces/`. There are no model files, so the look stays one hand and every piece takes parameters.
- **Structure:**
  - Grounds.
  - Backdrops: distant, fading into haze.
  - Buildings from parts: walls with openings, roofs, windows, doors, awnings, balconies, signboards, stoops, parapets.
  - Vessels: bus, train, plane and boat interiors, each with a cutaway wall toward the camera and scenery passing behind windows (as `setting.moving` does today).
- **The 35 existing scenery kinds are rebuilt in 3D under the same names,** so every existing layout still builds.
- **New kinds for the packs:**
  - ancient near east: mud-brick house, obelisk, temple columns, pyramid, clay pots, reeds, palm grove, cart;
  - western city: brownstone, skyscraper, fire hydrant, streetlamp, taxi, hot-dog cart, subway entrance, bench;
  - Lagos today: kiosk, yellow danfo, okada, umbrella stall, zinc-roof house, gutter bridge.
- **Look:**
  - `MeshToonMaterial` with a 3-step gradient map.
  - Ink outlines by the inverted-hull method: back-faces pushed out along the normal by a width in screen pixels (so the line matches the 2D ink weight at every distance) in the house ink `#2d2a32`.
  - Flat colours snapped to the house palette.
  - One directional light for sun and shadows (1024² shadow map, only for pieces over 1.5 m); blob shadows under small items and characters.
  - Height-based haze toward the backdrop colour.
- **Weather in 3D:** rain streaks and snow as instanced quads in view space, clouds as flat cards on the sky dome, fog as scene fog. Values come from the existing `setting.weather` and `setShade` grades (`gradeOf`, `timeline.ts` :889), turned into light colour and intensity.

### 6.4 From layout to 3D

The layout's shape stays the same; code turns it into space.

1. **Rows become depth bands.** Using the fitted camera (§2.3):
   - back row at `z = rowFeet(back)`;
   - middle at `rowFeet(middle)`;
   - front at `FEET−4`;
   - the backdrop at `z_far`.
   - `x` shares map across the frustum at that z.
2. **The floor band stays clear.** The actors' band, between the middle row and the front row, gets no items. Tall items are pushed out of x 0.3–0.7, as `buildSet` does now.
3. **Features keep their positions.** Each feature's `at`/`way`/`seat` from `SceneFeatureDto` is back-projected onto the floor plane to a 3D anchor. The 2D piece is drawn there (§2.2) and the 3D set leaves room for it.
4. **Code checks and nudges, never re-asks:**
   - everything snaps to the ground height (plus terrain);
   - no item intersects another;
   - no item blocks more than 15% of the floor band from the main camera (a ray test);
   - buildings don't cover features.
5. **Built once, cached.** The same layout and pack always build the same set (seeded). The client caches built sets per place in memory for the session.

### 6.5 Landmarks by parameters

- Things the kit lacks are built by registered parametric builders:
  - `ark {length, decks, houseLength, door, ramp}`
  - `pyramid {base, steps, smooth}`
  - `tower`, `bridge {span, arches}`, `temple {columns, pediment}`, `statue {pose, plinth}`, `ship`, `tent`, `throne`
- **The layout's `own` items gain `build?: {kind, params}`.** The painter picks a builder from the list when one fits ("the half-built ark" → `ark {length 3.0, decks 2, ramp true, unfinished 0.4}`), and the params are clamped by code.
- **If nothing fits, the existing AI-drawn cutout.** `drawOwn`'s SVG becomes a texture on an upright card with an ink sticker outline, placed like a piece. It is logged to `drawing-bench/failures` as "wanted in 3D", so the kit grows from real requests.

### 6.6 The camera in 3D

- **Everything is kept:** the writer's `wide`, `close` and `two` shots, the establishing open, the cut rules (`CUT_SCALE`, `CUT_CENTRE`), the push-in and the lean. `makePlan` (`timeline.ts` :2091) still decides *what* to frame. A new `camera3d.ts` decides *from where*.
- **New moves**, chosen by rules from the scene:

  | Move | Trigger |
  |---|---|
  | Track | A walk over 0.3 of the width in a wide shot. Camera x follows the walker with 400 ms lag, set sliding past with true parallax. |
  | Crane | Scene open (from 1.4 m above to eye height over 2 s), ending (rise and pull back over the last 2 s), and `camera: 'crane'` moves (leap). |
  | Arc | Establishing shots in outdoor sets: ±12° over 3 s. |
  | Push | As today, now a real dolly, so parallax shows. |
- **Limits:**
  - azimuth within ±20° of front when a 2D feature is on screen, ±35° otherwise;
  - never below the floor, never through a set piece (a ray test pulls it in);
  - no roll.
- **Output:** the camera is still `f(t)`. The stage plan needs no new server fields for these, because they are chosen by rules from existing data, in the player.

### 6.7 How characters sit in the 3D set

- **Floor position:** a character's 2D stage position `(x, y_feet)` from `place()` is back-projected through the main camera to `(X, Z)` on the floor.
- **Each frame,** `(X, 0, Z)` is projected through the *current* camera to the screen and a scale. The layer transform uses those instead of the 2D values.
- **Result:** in a track or crane, people stay planted on the ground and hold their depth relative to the set.
- **Contact shadows:** a soft ellipse on the floor under each character, rendered in 3D so it falls on terrain.
- **Sitting and lying** still use the 2D feature pieces (bench, bed), which are positioned by the same projection, so seat heights stay exact.
- **Lighting match:** a CSS filter per character layer from the scene's light (dusk warms, night cools) replaces `setShade`'s multiply for the people. The set gets real light.

### 6.8 Micro-interactions in 3D

These are the same events (§2.6) as in 2D:

- **Grass:** an instanced blade field on grass and reeds grounds, with a vertex-shader sway, plus brush impulses sent as a uniform array (the last 16 events).
- **Dust and splashes:** instanced particles.
- **Footprints:** decals.
- **Water:** a shader with ripple rings from an events uniform.
- **Hanging things and birds:** curtains, flags and awnings bend in the vertex shader. Birds are instanced low-poly with a flap cycle.

All are functions of `t` passed as uniforms. Nothing is simulated per frame beyond evaluating the formulas.

### 6.9 Later: features in 3D

Once the prototype holds up, features can move into 3D as well:

- **Gates, doors and vehicles** as 3D pieces with a real hinge and slide.
- **Benches and beds** with real seats.

That needs per-actor depth interleaving: canvases split by each actor's z, or characters rendered into the WebGL scene as DOM-synced sprites via `CSS3DRenderer`. Only do it if the prototype shows the 2D features look out of place.

### 6.10 Stills and the 3D picture check

- **Stills for 3D films** come from real frames: the worker opens a private render route (`/render/scene/:id?t=…`, token-protected) in headless Chromium with software WebGL, and captures PNGs at chosen moments. It is the same code as the player, so stills match the film.
- **Decision needed:** this adds Chromium to the worker image (about 170 MB) and a download needs your OK. Until then, 3D films keep 2D stills from resvg, which still work for the picture check at lower fidelity.

### 6.11 Fallback

- **Tiering:** at player start, check for WebGL2 and a 1-second render probe.
- **Below the floor** (median frame over 22 ms): use the 2D stage with the 2D reactions (Track A still applies).
- **If it drops mid-film:** fall back at the next scene join, never mid-scene.
- **The 2D set** (`buildSet` SVG) is always shipped alongside the layout.

---

## 7. Performance budgets

### 7.1 Per frame, high-end phone (iPhone 13+ / Pixel 7+)

| | Budget |
|---|---|
| Frame | 60 fps, p95 under 16.7 ms |
| Set | under 120k triangles, under 120 draw calls (merge static geometry per material, instance repeats) |
| Dynamic | under 3k grass instances, 200 particles, 8 birds |
| Characters | at most 5, dangles at most 16 each |

### 7.2 Mid-range floor (2021 Android)

- 30 fps, p95 under 33 ms, with grass density halved and shadows off.
- Below that: the 2D fallback.

### 7.3 Controls

- `?perf` overlay.
- A per-device tier kept in localStorage.
- Automatic tier drop after 2 s under budget: grass, then shadows, then dangles off-screen, then the 2D fallback at the next join.

---

## 8. Data and contract changes

### 8.1 Server `contracts/index.ts`, mirrored in the client `src/lib/api/contracts.ts`

- **`SceneSettingDto.world3d?`:**

  ```ts
  { layout: SetLayout; style: StylePackId; seed: string;
    camera: { eye: number; feet: number; floor: number; unit: number };
    features: Record<string, { anchor: [x, z]; seatY?: number }> }
  ```

  Sent when the place has a layout. Old scenes lack it and play 2D.
- **`SceneThingDto`:** add `rigVersion?: 2`, `dangles?` (§4.3), and `stride?: {length, gait}`.
- **`SceneActingMove`:** add the nine action moves.

### 8.2 Server domain

- `SetLayout`: add `style` and `own[].build`. Add the new scenery kinds.
- `Doing`: add `idealMs` and `phases`.
- `timeQuiet`: add the action allowance.
- `hurried`: new limits.
- `drawFigure`: `rig: 2`.
- Animal and creature kits: segmented tails and ears.
- Pass `culture` to the painter.
- The painter prompt: the style list and the landmark builders.

### 8.3 Migrations

None. Everything lives in the scene files and the stored sheets.

---

## 9. Order of work, estimates, and "done when"

| Phase | Work | Estimate | Done when |
|---|---|---|---|
| **0 Foundations** | Player off React per-frame (§3.1), fixed-step springs (§3.2), motion bench (§3.3), picture check with 2D stills (§3.4) | 4–5 days | 60 fps on a mid-range phone in 2D; seek equals play in tests; the Noah bus is flagged |
| **1 Bodies with weight** | Timing change (§4.1), planted walks (§4.2), dangles (§4.3), overlap, squash and listening (§4.4), rig v2 (§4.6) | 1.5 weeks | Maya re-made: capes, tails and hair swing; feet don't slide; the throw has its wind-up; old films gain springs without a remake |
| **2 The world reacts (2D)** | Event model (§2.6), plants, water, dust, hanging things, wind, birds, sounds (§5) | 1 week | The market sways as Maya runs past, dust at landings, pigeons lift at a shout, all seek-exact |
| **3 Action moves** | Move format, nine moves on the bench, writer, mender, audit (§4.5) | 1.5 weeks | "Pip leaps onto the wall" plays with a wind-up, lands on the perch, is audited |
| **4 3D prototype** | three.js player path, camera fit, sandwich layering, projected characters, toon and ink look; 2 hand-tuned places built from real layouts (Lagos market, Moses riverside); 3D grass, dust, water, birds; the tiering probe | 2 weeks | Both places play real episodes; 60 fps high-end, 30 fps mid-range; you judge the look. **Go or no-go.** |
| **5 Set kit and style packs** | All 35 kinds in 3D, building parts, vessels, 5 packs, pack choosing, landmark builders, cutout fallback, code checks, a set bench judged by Gemini | 3–4 weeks | 12 test places across all packs pass the bench |
| **6 Camera moves** | Track, crane, arc, dolly push, limits (§6.6) | 1 week | Walks are tracked, openings crane, no clipping on the bench's 50-scene run |
| **7 3D stills** | Headless render route and worker capture (§6.10), after your OK for Chromium | 3–4 days | Thumbnails and picture checks from real 3D frames |
| **8 Roll-out** | A per-show flag, then the default for new shows; old films stay 2D until remade | — | — |

Tracks A (phases 0–3) and B (phases 4–7) can run side by side after phase 0. Phase 4's prototype is the one hard gate.

---

## 10. Risks

- **Style clash between 3D sets and 2D characters.** This is the biggest risk. Mitigations:
  - matched ink width in screen pixels;
  - one palette;
  - flat toon light;
  - camera arcs kept small near 2D features.

  Judged in phase 4 before anything else is built.
- **Phone heat and battery on long films.** Mitigated by render-on-demand, tiering, and falling back at joins.
- **Timing change lengthens scenes.** Action allowance grows films by roughly 5–10%. The outline length check (±35%) tolerates it, and the writer is told big moves cost time.
- **Server and client timing drift.** `scene-film.ts` duplicates client constants. Move them into one shared JSON (`scene-timings.json`) read by both repos' tests.
- **Seek cost with pre-roll.** Bounded to 1.5 s of 120 Hz steps for visible springs only, which is under 2 ms on the bench target.
- **Chromium on the worker** (phase 7) needs a download and a larger image. It's deferred, with 2D stills in the meantime.
- **Overuse of action moves.** The writer is capped at one or two big moves a scene unless asked. The audit warns on more.
- **Old scene files.** No `world3d` means they play in 2D. No `rigVersion` means rig 1 plus the new springs. Nothing breaks.

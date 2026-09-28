# Layered scenery: richer places without 3D

A technical plan, 2026-09-28. It replaces Track B (3D sets) of `studio-world-plan.md`.

Places become stacks of flat layers at different depths. Characters stand on a floor that has depth, and a camera moves across one wide set, the way South Park and many 2D cartoons are built. Everything stays SVG in the existing player: no new library, and nothing new to break on phones. Track A (physics and micro-interactions) runs on top unchanged.

It starts from Richard's "Layered scenery for EasiRead Studio" doc and adds what the code needs.

---

## 0. What we are aiming for

A place that feels like a space:

- **Distance.** Far things are small, hazy and move slowly. Near things are crisp and move fast. Something passes in front of the characters now and then.
- **Busy, specific scenery.** Every street differs. A Lagos street has zinc roofs, kiosks, poles and wires, and a danfo parked at the back. A Moses-era riverside has reeds, mud-brick houses, palms and pyramids in the haze.
- **People who use the depth.** They stand near and far, cross the space diagonally, and walk behind a stall and in front of a bench.
- **A camera that moves.** It pans across a wide set, tracks a walker, and pushes in on a feeling. The layers slide at different speeds; that is where depth comes from.

---

## 1. What exists today, and what we build on

Facts with file references, from the code map.

### 1.1 The set is already built in layers

It's just flattened into one picture.

- `buildSet` (`scene-set-layout.ts` :1637) draws, back to front:
  - `#sky`
  - `#backdrop` (hills, sea, city, dunes…)
  - room walls or a vessel's outside and side
  - `#ground`
  - back-row items
  - `#props` (counters)
  - middle and front items
  - `#front`
  - `f-<id>` feature groups
- The result is one 1600×900 SVG. The parts are named (`BuiltSet.parts`).

### 1.2 The perspective is already real

- Feet at 820.
- `FLOOR_LINE`: outdoor 576, indoor 630, vessel 648.
- `EYE` = floor − 80 outdoors.
- `rowFeet(kind, row)` places the rows.
- `scaleAtFeet(kind, y) = UNIT·(y − EYE)/(FEET − EYE)` gives the size at any ground height (:698-732). It is a pinhole ground plane.
- **Depth on the floor needs no new maths:** a character at depth d stands at a y between the front and the back of the floor, and takes `scaleAtFeet(y)`.

### 1.3 The player

- The whole set sits in one `back` layer with a single parallax factor, 0.4 (`timeline.ts` `sceneryCamera` :2343). The camera is a scale about a point (`cameraAt` :1960).
- Characters are layers in `camera`, positioned by `place()` from the staging's `{x, y, w, h}`.
- Features are mounted twice: `pieces` behind people, and `piecesOver` clipped over whoever passes (`stage.ts` `mountPiece` :1011). That is already a depth trick for a single row.

### 1.4 Characters stand on one line

- The stager's spots are left to right only: five `SPOTS`, mapped to shares of the width (`STATION_SHARES`).
- Everyone's feet are at the same y, and nobody is nearer or further.

### 1.5 Crowds and stills

- **Crowds** are drawn by the figure kit in perspective rows in the set's frame (`scene-crowd.ts`), behind the cast.
- **Stills** (`scene.processor.ts` `thumb()` :1984) are rasterised per layer with resvg and composed, so a layered picture is natural there.

---

## 2. The layer stack

Every place is the same fixed stack. The **depth factor** f says how a layer follows the camera:

- A camera pan by Δx moves the layer by f·Δx.
- A camera zoom by s scales it by 1 + (s − 1)·f.
- f = 1 is the actors' own plane, below 1 is further away, and above 1 is nearer than the actors.

| Layer | f | What goes on it | Changes during a scene? |
|---|---|---|---|
| sky | 0.03 | sky colour, sun or moon, clouds, stars | clouds drift, stars twinkle |
| far | 0.2 | hills, mountains, sea, dunes, skyline, pyramids on the horizon | ripples only |
| back | 0.45 | buildings, big trees, poles and wires, walls, parked vehicles | plants sway |
| ground | 0.72 | grass, road, floor, with texture; rugs; shadows of back pieces | no |
| stage | 0.78 | fixed features: gate, door, stall, counter, bed, ark, altar, head table | leaves open, seats taken |
| floor | 0.8–1.05, by each item's depth | actors, floor props, the features' "over" copies | yes: depth-sorted every frame |
| foreground | 1.2–1.55 | crowd backs of heads, table edges, plants, fence posts, a lamppost | sway, crowd turns |

Hazing follows depth: `sky` and `far` are pulled toward the haze colour (atmospheric perspective), and `foreground` is slightly darkened and blurred (1.5 px) so it reads as near and never competes with faces.

---

## 3. Data changes

### 3.1 The layout the AI writes (`SetLayout`, `scene-set-layout.ts` :128)

It stays named things in rows. The model never writes coordinates.

- `rows` gain `far` and `foreground`. Old layouts (back, middle, front) map to back → back, middle → stage, front → floor props.
- `focal: {x: share, feature?: id, words}`: where the action happens ("in front of the head table", "at the ark's ramp").
- `clutter: ClutterKind[]` (up to 6): picked from a fixed list and scattered by code (§5.3).
- `style: StylePackId`: the era and region pack (§5.1).
- `width: 1 | 1.5 | 2`: how wide the set is. Code decides by default: 1.5 outdoors, 1 for small rooms, 2 when the scene has a long walk.
- `foreground` items are capped at 4. The prompt says to leave it empty for intimate scenes.

### 3.2 What the set stores (`SetSheet`, `scene-sheet.ts` :520)

- `layers: {id, depth, svg}[]` in the order above, each drawn at the full set width × 900.
- `width` in set units: 1600, 2400 or 3200.
- `floor: {front, back}`: the y of the floor's front and back edges, and the feature anchors (`x`, depth, seat y).
- The single flat `drawing` stays, for books, old scenes and a fallback.

### 3.3 What the player receives (`SceneDto`, `contracts/index.ts`; client mirror `src/lib/api/contracts.ts`)

- On the place's backdrop thing: `layers?: {id, depth, svg}[]` and `setWidth?`.
- `ScenePlaceDto` gains `d?: number`, the depth on the floor (0 back … 1 front), for each character in each staging.
- `SceneStepDto` walks already carry positions per step. Depth rides on the places, so a walk from `(x0, d0)` to `(x1, d1)` is diagonal for free.
- `effects` zoom shots gain `pan?: 'track' | 'pan' | 'push'` for the camera moves (§6).

### 3.4 Old films

- A scene without `layers` plays as today.
- Old scenes can still gain parallax: the client splits the old single SVG by its known group ids (`#sky`, `#backdrop`, `#ground`, `#props`, `#front`, `f-*`) into layers at load (§7.2). Existing films get depth when the camera moves, without a remake.

---

## 4. Depth on the floor

### 4.1 Spots gain a depth

- A station becomes `(x share, d)`:
  - `d` 0 is the back of the floor, just in front of the stage row;
  - `d` 1 is the front edge, near the camera.
- **The writer keeps using words.** Stager rules turn them into depth:
  - "at the stall" or "by the door" → the feature's own depth;
  - "near the camera" or "in front" → 0.85;
  - "at the back", "far off" or "across the yard" → 0.15;
  - otherwise → 0.5.
- The new sheet field `onStage[].depth?: 'back' | 'middle' | 'front'` is optional, and the writer is told to use it sparingly.
- **Spreading.** Two people in conversation stand at close depths (±0.1). A crowd of four spreads across depth, not just width. The stager varies depth deliberately, so the floor isn't one line.

### 4.2 Position, size and order

- **y** = `lerp(floor.back, floor.front, d)`. Scale = `scaleAtFeet(y)`: the existing pinhole, so size runs about 70% at the back to 100% at the front on outdoor sets. Characters, props and features all use it.
- **Draw order.** Every frame the floor layer is sorted by y (feet). A character walking in front of the bench is drawn over it; walking behind the stall, the stall's front covers their legs. This generalises the `pieces`/`piecesOver` trick from one row to any depth.
  - **Implementation:** keep DOM order and only move a node when two neighbours' depths cross, so it's cheap.
- **Shadows.** Every actor and floor item gets a flat contact shadow (one tone, 18% ink) on the ground at its depth.

### 4.3 Walks with depth

- A walk from one station to another moves in x and d together, so it runs diagonally.
- The walk time uses the true path length: `walkMs` from distance in kit units, not in x share.
- Planted-feet walking (physics plan §4.2) uses the same length, so feet don't slide on diagonals either.
- Walking toward the camera, the character grows smoothly; walking away, they shrink.

### 4.4 Faces stay visible (a composer check)

For every speaking moment, in every shot the camera takes, code checks the speaker's head box against:

- foreground pieces;
- nearer actors;
- the stage row's "over" copies.

If a face is more than 15% covered:

1. **First,** nudge the speaker: step 0.05 in x or 0.1 in depth, keeping their spot's meaning.
2. **Otherwise,** nudge the nearer actor.
3. **As a last resort,** fade that foreground piece to 40% for the length of the line.

The scenery is never moved mid-scene. Each fix is logged as `staging:`, like the other silent fixes.

---

## 5. Richer scenery

### 5.1 Style packs: any era, any place

These are carried over from the world plan, now for flat drawing. A pack decides materials, shapes and palette shifts for every piece.

- **First packs:**
  - ancient Near East (Moses, Egypt, Babylon);
  - biblical village (Galilee, Bethlehem);
  - Lagos and West African town;
  - Western city (New York, London);
  - village and farm.
  - Nature (forest, beach, desert, river, mountain) is shared by all.
- **Choosing:** code classifies `bible.world` (era, region, culture, landscape, homes) by keyword rules. When code isn't sure, the painter picks from `STYLE_PACKS`. The pack is stored on the set, so every scene in that place agrees.
- `worldText` passes `culture` too.

### 5.2 Buildings from parts

Houses, shops, churches, mosques, classrooms, compounds, tenements and temples are assembled by code from parts:

- **walls:** mud brick, plaster, painted block, brick, clapboard, glass;
- **roofs:** flat with parapet, thatch, zinc, tile, pitched shingle, dome;
- **windows:** slit, arched, louvred, sash, shopfront, burglar bars;
- **doors;** awnings; balconies; porches and stoops; chimneys; signboards with shapes only, never words; water tanks; satellite dishes; AC units.

A seeded choice per building means no two on a street are alike. Each pack lists which parts it uses and in what proportions.

### 5.3 Clutter

- A fixed list, scattered by code (seeded) into the back row and the edges of the floor, never the focal area:
  - poles and wires; bins; plastic chairs; laundry lines; generators; parked cars and okadas;
  - water drums; potted plants; bicycles; street signs (shapes only); hydrants; benches;
  - clay pots; baskets; woodpiles; carts.
- Density comes from the layout's `clutter` choice and the pack.

### 5.4 Ground texture and detail

- Grass tufts, road cracks and kerbs, floor planks, tiles, sand ripples, dirt paths. Drawn sparingly, thinning with distance.
- The ground is drawn across the full set width with a subtle near-to-far colour shift.

### 5.5 Crowds in the foreground

- Backs of heads and shoulders from the figure kit, in 1–2 rows on the foreground layer, for classrooms, churches, stadiums, markets and weddings.
- They turn toward the speaker now and then, and clap or cheer on crowd moves (the existing `crowd.moves`).
- They are drawn once per place. The existing `scene-crowd.ts` keeps the crowd behind the cast.

### 5.6 One look

- One outline weight across scenery and characters (`setLine`, already scaled to size).
- One flat shadow tone under everything.
- Colours snapped to the house palette, with a slight pack-specific shift (warmer for ancient Egypt, cooler for a winter city).
- Far layers hazed toward the sky colour by depth.

### 5.7 New pieces, and landmarks by parameters

- **New kinds for the packs:**
  - ancient: mud-brick house, obelisk, temple columns, pyramid, reeds, palm grove, clay pots, well with bucket;
  - city: brownstone, skyscraper, subway entrance, hydrant, streetlamp, taxi, hot-dog cart;
  - Lagos: kiosk, umbrella stall, zinc-roof house, okada, danfo parked, gutter bridge, generator.
- **Landmarks** are drawn by code from a few parameters: `ark {length, decks, ramp, unfinished}`, `pyramid`, `tower`, `bridge`, `temple`, `statue`, `ship`, `tent`, `throne`. The painter names the builder and code clamps its parameters.
- **Anything else** falls back to the artist's cutout (`drawOwn`), placed on its layer and logged as "wanted in the kit".

### 5.8 Real sizes

- Every scenery kind gets a real-world height, set at kit scale (an adult is 224 kit units, about 1.7 m).
- Layers scale pieces by their depth, so a house at the back is never bigger than a table in front.
- Code checks sizes when building (§8).

---

## 6. The camera

### 6.1 One wide set, a moving frame

- Sets are drawn 1.5× or 2× wider than the frame, so pans never reveal an edge.
- The camera is `{x, y, zoom}` on the set. Each layer gets `translate(−x·f, −y·f) scale(1 + (zoom − 1)·f)` about the frame centre. This generalises today's single `PARALLAX` 0.4 to a factor per layer.
- Floor items take f from their own depth (0.8 at the back → 1.05 at the front). A walk toward the camera therefore gets a little extra parallax, which reads as depth.

### 6.2 Shots and moves

| Shot or move | How | When |
|---|---|---|
| Wide | The set section around the focal area, no zoom | Default; scene openings |
| Close | Zoomed on the speaker; far layers barely grow | The writer's `close` |
| Two-shot | Framed between two characters at their depths | The writer's `two` |
| Pan | Slides across the set; near layers slide faster | Scene opening across a wide set; revealing someone arriving |
| Track | Follows a walker, the set sliding past behind | A walk longer than 0.3 of the frame width in a wide shot |
| Push in | A slow zoom; the foreground grows fastest | Emotional beats, as today (`PUSH` 2.5%), now with parallax |

- **Unchanged:** the cut rules (`CUT_SCALE`, `CUT_CENTRE`, `SHOT_LEAST_MS`), the establishing open, and the lean toward the speaker.
- `makePlan` (`timeline.ts` :2091) decides *what* to frame. A new `cameraMoves` step decides pans and tracks by these rules. It stays a pure function of time.
- **Server:** `scene-film.ts` (`withoutJumps`, `viewOf`) gets the same wider-set rules, so its checks agree with the player.

### 6.3 The focal area

- The wide shot centres on `focal.x`, and no stage-row or foreground piece may cover the focal area in the wide shot (§8).
- A scene's opening pan ends on the focal area.

---

## 7. The player

### 7.1 Layers in the stage (client `src/lib/scene/stage.ts`)

- `mountScenery` (:962) mounts each layer of the set in its own shadow root, instead of one set:
  - sky, far and back into `back`;
  - ground and stage just under `camera`'s `pieces`;
  - foreground into a new `fore` div over the camera, under `front`.
- Floor-layer items (actors, floor props, feature "over" copies) stay in `camera` and are depth-sorted (§4.2).
- `render()` sets one transform per layer per frame from the camera and the layer's f (§6.1).
- **Static layers** (sky, far, back, ground, stage, and a foreground with no crowd moves) are drawn once and only moved.
  - On slow devices they are flattened once per place to bitmaps (an SVG blob drawn to an `ImageBitmap`) and moved as images.
  - Foreground plants still sway on fast devices.

### 7.2 Old scenes

- A backdrop with no `layers` is split in the client by its group ids: `#sky`→sky, `#backdrop`→far, room walls→back, `#ground`→ground, `#props` and `f-*`→stage, `#front`→foreground.
- Every actor gets d = 0.5. The set width stays 1600, so there are no pans, but zooms and pushes gain parallax.
- If the split fails (an unknown painter's set), the scene plays as today.

### 7.3 Performance

- **The bar:**
  - p95 under 16.7 ms on high-end phones;
  - under 33 ms on a 2021 mid-range phone;
  - measured with the `?perf` overlay from the physics plan.
- **Budget:** at most 8 layers, at most 3,000 SVG elements across the static layers (flattened beyond that), and the foreground crowd at most 40 figures.
- The physics plan's phase 0 (player off React's per-frame render, `getAnimations` caching) lands first and gives the headroom.

---

## 8. Composer checks, and the picture check

Code assembles the layers and fixes problems itself. The model proposes; code disposes.

1. **Size by depth.** Every piece takes its layer's scale from its real height (§5.8). A back-row house is never bigger than a front table.
2. **No overlaps.** Pieces on the same layer are spread apart (`spreadOut` exists), then nudged.
3. **Floor and focal area clear.** Nothing on the stage row or foreground covers the floor band or the focal area in the wide shot. Offending pieces move to the edges or drop to the back row.
4. **Foreground stays low or to the sides.** At most the bottom 30% of the frame, or the outer 12% on each side. Never over the focal area.
5. **Faces stay visible** at every speaking moment (§4.4).
6. **Picture check.** Scenes are plain SVG, so the worker renders real stills with resvg (the existing `thumb()` path, extended to layers, depth and the camera at that moment).
   - Gemini looks at 2–4 stills per made scene: the fullest step, each asked change's beat, and the last frame.
   - It compares them with the sheet's claims (who is there, what each feature is, what was asked).
   - A mismatch (an ark drawn as a bus, a missing character, a covered face) goes through the existing one free retry. This costs about 0.4¢ per still.

---

## 9. How it fits the physics plan

- **Dangles, planted walks, weight, overlap and action moves** run on the same 2D rigs, unchanged. Depth adds diagonal walks, which the walk cycle handles by true path length.
- **World reactions** (plants, dust, water, birds, curtains) live on the layer where their piece is:
  - plants brushed on the floor and foreground layers;
  - birds on the back layer's roofs and poles, flying across layers as they rise;
  - dust at feet, at each actor's depth.
- **Action moves' targets:** a leap onto a wall reads the stage-row feature's anchor and perch height.
- **The physics plan's phase 0 comes first.** It gives the player the speed layered scenery needs.

---

## 10. Order of work

| Phase | Work | Done when |
|---|---|---|
| **L1: Layers and parallax in the player** | Layers in `SetSheet` and the DTO; `buildSet` emits layers; client mounting, per-layer transforms, haze by depth; old sets split into layers at load | Every film, old and new, gains parallax on zooms and pushes; 60 fps high-end |
| **L2: Depth on the floor** | Stations `(x, d)`, depth words, diagonal walks, depth sorting, contact shadows, the faces-visible check; the `foreground` and `far` rows, `focal`, the writer and painter prompts | Maya's market: people stand near and far, walk behind the stall and in front of the bench, and no speaker's face is ever covered |
| **L3: Richer scenery** | Style packs (5 + nature), building parts, clutter, ground texture, new pieces, landmarks by parameters, real sizes, foreground crowds, pack choosing from the world | A 12-place test sheet across all packs passes the set bench (Gemini-judged); the Lagos street and the Moses riverside look specific and busy |
| **L4: Camera and picture check** | Wide sets, pan, track, push with parallax, focal openings; server stills with layers and camera, Gemini picture check with retry | Walks are tracked, openings pan to the focal area; the ark-as-bus case is caught |

- **Timing:** L1 and L2 are mostly code (hours to a day each). L3 is the design-heavy part (a few days), and moves at the pace of looking at contact sheets together. L4 is under a day.
- **Order:** L1 can start as soon as the physics plan's phase 0 lands in the player.

---

## 11. Risks

- **Crowded foregrounds.** Capped at 4 pieces and empty in intimate scenes. The composer checks every speaking moment, not just the wide shot.
- **Covered faces.** Handled by the §4.4 check, which runs for each shot.
- **Scale mismatches.** Real heights per kind, with sizes checked by code when building.
- **Too many shapes.** Static layers are flattened to bitmaps on slow phones, and the element budget is enforced when building.
- **No side angles.** The camera stays front-on, as South Park's does. Depth comes from parallax, depth-sorting and haze, and that is the style.
- **The writer overusing depth or foreground.** The prompt keeps it sparing, and the stager decides most depth itself.

# Wide or vertical: films for phones (studio-vertical-plan)

A technical plan, 2026-09-30. Plan only: nothing here is built yet.

Richard asked for this:

> "Right now our videos work for landscape views. We want to create videos that also work for phone views. Eventually users will be able to share their videos on YouTube and TikTok ... being able to have the option to create the video either in this wide ratio or the ratio to fit phone screens."

**Goal.** The maker chooses a shape when a film is made:
- **wide** is 16:9, as today;
- **vertical** is 9:16, for phones, Shorts, TikTok and Reels.

This covers both story films and explainers. Each shape is composed natively for its frame, and neither is a crop of the other. Export and upload come later, but the design below leaves room for them.

**Ground rules** (Richard's, and this plan's):
- The shape is code, not a model call. Choosing it, and re-staging a film in the other shape, costs no DeepSeek call and no rewrite round.
- The UI stays minimal and familiar: one two-way choice, as YouTube's and TikTok's own upload screens have.
- Examples stay global and neutral.
- Studio code stays separable, because Studio will become its own app.

---

## 0. What exists today: where 16:9 is assumed

The engine is closer to shape-free than it looks. The stage is DOM and SVG, positioned in shares of `W × H`, and those numbers come from the server (`SceneDto.stagings[name].{w,h}`). The reader already plays one scene in two shapes: `box` (4:3, 1200×900) in the pane and `wide` (16:9, 1600×900) full screen. Studio films compose `wide` alone, and alias `box` to it (`scene-compose.ts:3723`, `:3963`, `:4308`).

The 16:9 assumptions sit in about six clusters.

### 0.1 Stage and set frame constants (server)

| Where | What | Note |
|---|---|---|
| `scene-layout.ts:31` `STAGINGS` | `box {1200, 900, margin 44}`, `wide {1600, 900, margin 56}` | The one table every layout reads. |
| `scene-film.ts:677` `FRAME_W/FRAME_H` | 1600 × 900, the set's frame | Used by `roomOf`, `settle`, stills. |
| `scene-set-layout.ts:1174` `SET_W/SET_H` | 1600 × 900 | Also `FEET` (820/900), `FLOOR_LINE` (outdoor 0.64·H, indoor 0.70, vessel 0.72), `EYE`, `rowFeet`, `scaleAtFeet`, `INK_W`, `drawW`. The whole set world is drawn in a 900-high frame. |
| `scene-story.ts:490` `SET_CANVAS` | `{1600, 900}` "the wide stage's own shape" | |
| `scene-ink.ts:147` `SET_UNIT_SHARE` | `2.357 / 900` | Kit units per set unit, measured against a 900 height. |
| `scene-crowd.ts:51` `USUAL` | `feet 820/900, unit 2.357/900` | |
| `scene-compose.ts:2887`, `:3925` | default set viewBox `[0, 0, 1600, 900]` | |
| `scene-space.ts:324` | `k = max(W/1600, H/900)` | A hardcoded copy of `setFrameOn`. |
| `scene-turns-check.ts:104` | `stagings.wide.w ?? 1600` | |
| `scene-set-layout.ts:197` `SET_WIDTHS` | `[1, 1.5, 2]` times the frame | For pans. |
| `scene-svg.ts:32` `CANVAS` | drawing canvases: square 800², wide 960×600, tall 600×800 | The artist's canvas shape is already a choice. |
| `scene-chart.ts:27`, `scene-plot.ts:27` | chart area 960 wide, plot W 960 | Landscape by construction. |
| `studio-clip.ts:661` | clip card `viewBox 0 0 1600 900`, `aspect 16/9` | |
| `studio.processor.ts:237` `STILL_PX` | stills 960 px wide | Width-based. |
| `scene-still.ts:578` `stillPlan(width = 960)` | reads `stagings.wide` | |

There are 15 uses of `STAGINGS.wide` and about 24 reads of `scene.stagings.wide` across 11 files: `studio-staged`, `scene-space`, `studio-audit`, `scene-film`, `scene-still`, `scene-reading`, `scene-views`, `scene-text-check`, `scene-spacing`, `scene-shots` and `scene-interact`.

### 0.2 Characters and blocking

- **Spots are across only.** `STATION_SHARES` (`scene-layout.ts:764`) sets five spots at 0.12…0.88 of W, and `stationShares(largest)` widens the middle pair.
- **Scale fits the largest group side by side.** `stationScale` (`:907`) fits that group in one row, capped at `TALLEST_ADULT` 0.7 of the height. On a 900-wide stage, four people side by side would come out tiny.
- **The floor's depth is shallow.** `FLOOR_BACK_K` 0.7 and `FLOOR_FRONT_K` 1.15. `spreadDepth` and `ARCS` spread groups across the width first, with depth second.
- **Spacing is in metres,** which is good. `scene-spacing.ts` has `KIT_PER_METRE` 113, `TALK_LEAST_M` 0.8, `TALK_FAR_M` 2 and `ACROSS_LEAST`.
- **Walk time is measured in shares of the stage width,** not metres. `walkMs = |dx|/W × WALK_STAGE_MS` (`scene-film.ts:50`), and `WALK_DEPTH = 1` is "the lens about as long as the stage is wide". On a 900-wide stage, the same walk in the world would take 1.8× as long.
- **Faces-seen (`scene-faces-seen.ts`):**
  - `SEEN_SMALLEST` 0.22 of the frame's height;
  - `NUDGE_X` 0.05 of the width;
  - `DEPTH_TIE` 0.015 of the height.

### 0.3 Camera and shots

- **The framing numbers are tuned for a wide frame.** `viewOf` (`scene-film.ts:755`) frames one person with `0.78·W / w` and `0.78·H / (0.6h)`, and a two-shot with `0.86·W`. These are fine as formulas, but they were tuned for a wide frame.
- **The camera never zooms out.** `settle` holds `s ≥ 1`, so every shot is a window inside the stage.
- **Shot constants in `scene-film.ts`, all shares of W or H:**
  - over-the-shoulder: `OTS_FILL`/`OTS_OFFSET`;
  - the near person in OTS and deep staging: `NEAR_TALL`/`NEAR_EDGE`;
  - `DEEP_*`, `CROWD_*`, `LOW_MOST`;
  - inserts: `INSERT_FILL` 0.45 and `INSERT_WIDE` 0.6;
  - `CUT_CENTRE` 0.2 of the width;
  - `WIDE_ROOM` 0.04.
- `PROFILE_NEAR` 0.5 of the stage width (`scene-shots.ts:56`) decides whether two stand near enough for a profile two-shot.
- **The follow camera for narrow screens lives in the client** (`timeline.ts:2912-3017`). The reader uses it under 520 px. Studio films never do: they play their planned shots (`planOf`).

### 0.4 Explainers

- **Layouts:** `slotsFor` (`scene-layout.ts:172`) already branches on `wide` vs `box`: a `row` of 4 in the box becomes two lines. That branch is the seed of vertical reflow.
- **Text sizes:**
  - `CAPTION_SIZE` 38/26;
  - `LABEL` 22–34, `share` 0.045 of the room's height;
  - `PILL.size` 26;
  - `SLOT_GAP` 72.
- **Board (E5):** `BOARD_COLS × BOARD_ROWS` is 4 × 3, with `FRAME_MOST` 0.6 and `FRAME_LEAST` 0.5 of the board's width (`scene-board.ts:44-53`). The module comment says a board "fills a 16:9 frame".
- **Reading:** `cardWords` 3/5/7 (`scene-reading.ts:51`), and the reading windows and `textPacing` (E4).

### 0.5 Player (client `easyread`)

- **Sizing:**
  - `episode-player.tsx:776-840` infers the aspect from `scenes[0].stagings.wide`, with `aspect-video` and `16 / 9` fallbacks.
  - Full screen is `maxWidth: calc(100dvh * aspect)`, which already pillarboxes a tall film.
  - `film-view.tsx:158-181` hardcodes `*16/9` in its height-fit maths.
- **Subtitles:** one line of `LINE_CHARS = 52` (`lib/studio/subtitles.ts:33`) and `SUBTITLE_MARGIN` 0.045 (`film-subtitles.tsx:25`). The font is `clamp(12px, 2.05cqw, 30px)`, which is 8 px on a 400 px-wide picture before the clamp.
- **Text in viewport units:** the title, "The end", the end card (`end-card.tsx`, recap `grid-cols-3`), checkpoint chips and the host's bubble all use `vw`. A tall film shown on a desktop would get oversized text.
- **Control bar:**
  - the bar and shade span the whole shell (`:1011`, `:1026`), not the picture;
  - the row has 7 buttons of `size-9`.
- **Host:** the host sits in the corner at `bottom-[3%] left-[2.5%] w-[26%]`, and the subtitles leave it 30% of the width.
- **Sets on the client:**
  - `timeline.ts:3037` `SET_FRAME_W/H` 1600×900;
  - `setRoomOf` covers the stage with the 16:9 set;
  - `stage.ts:1240/1355/1585` draw sets `xMidYMid slice`.

  On a 900×1600 stage that slice is a 1.78× zoom showing 506 of 1600 set units: a crop.
- **Clip card and freeze label:**
  - `clip.ts:58-77` hardcodes the 1600×900 clip card;
  - the freeze label (`stage.ts:922`) is one line at `H·0.062`.
- **Thumbnails and share page:**
  - thumbnails are `aspect-video` everywhere: the library card, step card, scene thumbs and chapter thumbs;
  - the share page `/s/[token]` is `max-w-[1100px]` by width alone, so a tall film would be about 1,950 px high.
- **Orientation:** there is no orientation handling anywhere.

### 0.6 Export

- **Nothing exists.** `studio-plan.md` step 15 ("Download as MP4") is left out by choice.
- **No render tools on the server.** There is no puppeteer, playwright or ffmpeg dependency. `voice-loudness.ts` says outright that ffmpeg is not on the worker. echogarden's copy only decodes, and loudness is done in code to −16 LUFS.
- **The sound is mixed live** in the browser (`src/lib/scene/sound/`: music, beds, foley, effects over the voice). An export has to render that mix too, not just the voice file.

### 0.7 Surprises

1. **Stage size is data, but the set's world is hardwired to a 900-high frame.** The horizon, feet line, eye line, kit unit and ink width are all shares of 900. A tall stage today would crop every set to its middle 506 units.
2. **Walk timing is in shares of the stage width,** so a narrower stage would make everyone walk 1.8× slower through the same room.
3. **People are sized to fit the largest group side by side** (`stationScale`). A tall frame shrinks everyone unless groups stand in depth.
4. **In a pinhole camera at head height, depth does not separate heads.** Everyone's head sits near the horizon, so stacking people in depth (the vertical way) overlaps faces unless the eye line is raised or x is offset. The faces-seen check would catch it, but the blocking has to avoid it.
5. **Several text sizes scale with the height of a room** (`LABEL.share` 0.045 of the room's height), so labels would grow in a tall room while the width they must fit shrinks.
6. **The film's aspect is never stated.** The client guesses it from the first scene's `stagings.wide`, after it loads.
7. **Viewport units (`vw`) in the player's overlays,** which only look right while the picture is as wide as the window.

---

## 1. The choice

### 1.1 Where the maker picks it

- **The brief card:** one row, "Shape", beside "Kind" (`production.tsx` `BriefView`, the `<Setting label="Kind">` Segmented at L249-261). It is a two-way Segmented control:
  - `Wide` shows a small 16:9 glyph;
  - `Vertical` shows a small 9:16 glyph.

  No third option, no menu.
- **The producer chat:**
  - **The maker says it:** "for TikTok", "vertical", "for my phone", "Shorts", "Reels" or "portrait" sets it to vertical; "for YouTube", "widescreen" or "landscape" sets it to wide. This is read by a code regex on the maker's own message (as `toneNamed` and `genreNamed` catch words), with the producer's schema field `shape: z.enum(['wide','tall']).nullable().catch(null)` as a second source. Code wins when they disagree.
  - **The producer never asks unprompted.** Shape is not in `briefMissing`. It may offer it once, as a chip row, only when the maker mentions sharing or a platform.
- **The collapsed brief summary** (`BriefSoFar`, `[showId]/page.tsx:381`) gains the word "vertical" when chosen. Wide is not said.

### 1.2 The default

- **Wide.** Every existing film is wide, the reader's Visualize is wide, and wide plays well on desktops and TVs.
- A show made from the phone layout (under 1024 px) could default to vertical later. That is not in the first cut: behaviour that changes by device surprises people.

### 1.3 Show or episode

- **The shape lives on the show's brief** (`StudioBriefDto.shape?: 'wide' | 'tall'`, absent meaning wide). The brief is a JSON text column, so this needs **no migration**.
- **Each episode copies it when made** (`studio_episodes.shape`, a small migration). An episode keeps the shape it was made in even if the brief changes later.
- So a show's episodes share one shape by default, but the model allows mixing, which §1.4 needs. A film is always one shape: `edit.ts`'s `boxTo` keeps its scale square and assumes every clip has one aspect, so this is enforced.

### 1.4 Re-making a film in the other shape

- **What the maker sees:** "Make a vertical version" (or "Make a wide version") in the film's `⋯` menu, the only new control.
- **What happens:** it creates a **sibling episode** with the same sheets, the same audio keys and the same title, marked `twinOf: <episodeId>` and the other shape.
- **Only compose runs again, for each scene:** sets, blocking, shots, layouts, stills and checks. The writer, the voice and DeepSeek are not called.
  - The words and their timings are unchanged, so the audio is reused byte for byte.
  - Sets built by code (`buildSet`, from the painter's `SetLayout`) are redrawn for the tall frame by code, for free.
  - A set painted whole by the artist (the fallback) is extended by code (§3.1), not repainted.
- **Cost:**
  - the optional picture check: Gemini Flash, about 0.4 cents a still, 2–4 stills a scene, so about $0.02–0.05 for a 5-scene episode;
  - worker CPU for compose, a few seconds a scene.
- **What the twin shares:** its own share link and thumbnail, and minutes are not charged again (it is the same film).
- **A limit:** a scene whose sheet only works wide is kept but flagged, and the picture check says what is wrong. An example is a sheet built around a very wide set piece, such as a long bus seen side-on. There is no rewrite round.

---

## 2. A shape-aware stage model

### 2.1 One setting, carried everywhere

```ts
// contracts (server, mirrored in the client's contracts.ts)
export type FilmShape = 'wide' | 'tall';
StudioBriefDto.shape?: FilmShape;     // the maker's choice; absent = wide
StudioShowDto.shape / StudioShowCardDto.shape?: FilmShape;
StudioPlayDto.shape?: FilmShape;      // the player sizes itself before any scene loads
SceneDto.shape?: FilmShape;           // absent = wide (every scene made so far)
```

- **Naming:** `aspect` is already a number on drawings (width over height), so the setting is called `shape`, in the same words as the drawing canvases (`square | wide | tall`).
- **Staging keys: keep `wide` on the wire, and give it the tall size.** For a tall film, `stagings.wide` is `{w: 900, h: 1600}`, with `box` aliased to it as today.
  - The client has about 40 `staging = "wide"` defaults and the server about 24 `stagings.wide` reads. All of them mean "the film's full stage", so they stay correct unchanged.
  - A new `'tall'` key would touch all of them for no gain in the player.
  - A doc comment on the contract says `wide` means "the full-screen staging, of the scene's shape".
  - A rename to `full` can come later, in one mechanical commit, if the Studio app is split out.
- **Why 900 × 1600:** it is exactly the wide stage turned. Every length, margin and font size in stage units maps to the same pixels per unit at export: 1080×1920 is 1.2 units per pixel either way. So a size that is readable in one shape is equally sharp in the other.

### 2.2 The constants, per shape

There is one module, `scene-shape.ts` (server, pure). The client mirrors the few it needs in `lib/scene/shape.ts`. Everything that is a stage or frame size reads from it.

```ts
export const STAGES = {
  wide: { w: 1600, h: 900, margin: 56 },
  tall: { w: 900, h: 1600, margin: 48 },
};
/** The set's frame: the window of the set's world a stage shows. */
export const SET_FRAMES = {
  wide: { w: 1600, h: 900,  feet: 820,  floorLine: {outdoor: 0.64, indoor: 0.70, vessel: 0.72}, eyeLift: 0 },
  tall: { w: 900,  h: 1600, feet: 1390, floorLine: {outdoor: 0.47, indoor: 0.52, vessel: 0.55}, eyeLift: 0.18 },
};
/** Where platform buttons and captions cover a tall frame, as shares of it (§5.1). */
export const SAFE = { wide: {top: 0, right: 0, bottom: 0, left: 0},
                      tall: {top: 0.11, right: 0.12, bottom: 0.20, left: 0.06} };
/** Where faces and titles are aimed, as shares of the height (§5.1): inside SAFE, above the subtitles. */
export const FOCUS = { tall: {from: 0.13, to: 0.62} };
```

The table below lists every constant, what it becomes, and how.

| Constant (file) | Becomes | How |
|---|---|---|
| `STAGINGS` (`scene-layout.ts:31`) | `STAGINGS.box` stays; `stageOf(shape)` returns `STAGES[shape]` | Every `STAGINGS.wide` (15 uses, 12 in `scene-compose.ts`) becomes `stage` from the compose input. |
| `FRAME_W/H` (`scene-film.ts:677`) | `SET_FRAMES[shape].w/h` | `roomOf`, `settle`, stills and `scene-space.ts:324` take the frame; the hardcoded 1600/900 goes. |
| `SET_W/SET_H/FEET/FLOOR_LINE/EYE/UNIT/INK_W` (`scene-set-layout.ts:1174-1230`) | fields of a `SetFrame` passed to `buildSet` | Module-level `let drawW` becomes part of that frame. `rowFeet` and `scaleAtFeet` take the frame. |
| `SET_CANVAS` (`scene-story.ts:490`) and viewBox defaults (`scene-compose.ts:2887`, `:3925`) | `[0, 0, frame.w, frame.h]` | |
| `SET_UNIT_SHARE`, `USUAL` (`scene-ink.ts`, `scene-crowd.ts`) | per frame height | These are shares of 900 now. The tall frame keeps the same world scale (§3.1), so the unit in set units is unchanged and only the share changes. |
| `SET_WIDTHS` [1, 1.5, 2] | tall: [1.5, 2, 2] of 900, i.e. 1350–1800 | A tall set is almost always wider than its frame, so the camera can pan. |
| `STATION_SHARES`, `stationShares` | tall: three spots across (0.22, 0.5, 0.78) and depth rows (§3.2) | |
| `stationScale`, `TALLEST_ADULT` | tall: fit `ceil(largest / 2)` across (two depth rows); cap an adult at 0.42 of H in the master | |
| `FLOOR_BACK_K/FRONT_K` (0.7/1.15) | tall: 0.55/1.4 | The tall floor is deeper. |
| `spreadDepth`, `ARCS` | tall: diagonals and zigzags (§3.2) | |
| `walkMs` (`scene-film.ts:50`), `WALK_STAGE_MS`, `WALK_DEPTH` | in metres: `WALK_M_PER_S` ≈ 1.2 (today's pace, 1600 units ≈ 14 m at `KIT_PER_METRE`·unit) | This fixes surprise 2 for both shapes, and wide timings stay the same. |
| `viewOf` fills (0.78, 0.86, 2, 1.8) | `FRAMING[shape]` (§3.3) | |
| `OTS_*`, `NEAR_*`, `DEEP_*`, `CROWD_*`, `LOW_MOST`, `INSERT_*` | `SHOT[shape]` | Tall values are in §3.3. |
| `CUT_CENTRE` 0.2 of the width | 0.2 of `max(W, H)` | This keeps a cut's "moved enough" test fair in tall. |
| `PROFILE_NEAR` 0.5 of W | 1.2 m (both shapes) | This is today's value, turned into metres. |
| `SEEN_SMALLEST` 0.22 of H | `SEEN[shape]`: wide 0.22 of H; tall 0.14 of H *and* face ≥ 0.07 of W | What matters on a phone is the face's size in pixels. |
| `NUDGE_X` 0.05 of W | 0.3 m | |
| `DEPTH_TIE` 0.015 of H | 0.015 of 900 units (both) | |
| `slotsFor` (`scene-layout.ts:172`) | adds a `tall` branch (§4.1) | |
| `CAPTION_SIZE`, `LABEL`, `PILL`, `SLOT_GAP` | `TEXT[shape]` (§4.2) | |
| `BOARD_COLS/ROWS`, `FRAME_MOST/LEAST` | `BOARD[shape]` (§4.4) | |
| `cardWords` | tall: one fewer for each band | |
| `CANVAS` shape for drawings | tall films prefer `square`/`tall` (§4.2) | |
| Chart and plot areas (960 wide) | `chartArea(shape)`: tall 800 × 900 | Bars stay vertical but there are fewer of them; §4.2. |
| Clip card (`studio-clip.ts:661`) | card viewBox = the clip scene's own stage | |
| `STILL_PX` 960 wide, `stillPlan(width)` | stills sized by the long side: wide 960×540, tall 540×960 | The same pixel count means the same Gemini cost. |

### 2.3 How it flows

1. **Brief → episode:** `shape` is copied at `make` time.
2. **Episode → compose:** `composeScene(..., { shape })`. Compose picks `stage = STAGES[shape]` and `frame = SET_FRAMES[shape]` once, and passes them down. No module reads a global size any more.
3. **Compose → `SceneDto`:** `shape` is set, and `stagings.wide` is of that size.
4. **The checks** (`scene-space`, `scene-spacing`, `faces-seen`, `text-check`, `turns-check`, the audit, the picture check) read `scene.stagings.wide` as now, and `scene.shape` for the per-shape thresholds.
5. **Play:** `StudioPlayDto.shape` sets the player's CSS variable `--film-aspect` before the first scene loads.
6. **The client stage** is unchanged in its core. `setRoomOf`, `SET_FRAME_W/H` and the `slice` sets read the set's own viewBox (`900×1600` for a tall set), so nothing is cropped.

### 2.4 Guarding wide

- Every existing spec and fixture must pass unchanged. The figure kit's sha256 lock and the Nativity fixtures lock today's output, so wide output is byte-identical.
- The refactor lands first as a no-behaviour-change commit (phase V0), proven by the existing suites. Tall values are added only after that.

---

## 3. Story films in vertical

The principle: **the world stays the same, and the frame, the blocking and the camera change.** A tall set is the same place, built from the same `SetLayout` and style pack at the same scale per metre. What changes is the window onto it (narrower, taller), where people stand, and how the camera frames them.

### 3.1 Sets composed tall

- **The frame:**
  - 900 wide by 1600 high, in the same world units as the wide set. A metre is as many units in both, so pieces, people and props are drawn by the same code at the same sizes.
  - The horizon (or a room's floor line) goes up to about 0.47 of the height outdoors and 0.52 indoors, so the lower half is floor. That is where vertical staging happens: depth.
  - The top third is sky, or a room's upper wall and ceiling, where the stage puts weather, the sun, lamps and signs.
- **Rows and depth:**
  - `rowFeet` for the tall frame spreads `back`, `middle` and `front` over a floor about 1.8× deeper on screen;
  - `foreground` (before the camera) sits under the frame's foot, as now.
  - Floor items (tables, beds, benches) keep their real sizes. There is more floor to show them *in depth*: a table can run away from the camera rather than across.
- **Fewer pieces across:**
  - The tall set is drawn `SET_WIDTHS_TALL` (1.5–2 × 900 = 1350–1800) wide, which is about the width of today's wide frame. So the painter's row items still fit, with the frame showing a third to a half of them at once and the camera panning.
  - Code keeps these pieces inside the frame's home window (`focal` ± 450): the features the script uses (a door someone goes through, a bed someone lies on). The other pieces can run into the pan span.
  - Where a row has more than `ACROSS_MOST_TALL` = 3 pieces inside the home window, the extras are pushed out to the span. They are never dropped: the reverse and pans still show them.
- **Layers and parallax:** the same stack (`studio-scenery-plan` §2): sky 0.03, far 0.2, back 0.45, ground 0.72, stage 0.78, floor 0.8–1.05, foreground 1.2–1.55. A tall frame shows more `sky` and `ground`, so parallax reads more clearly on a rise or tilt. Vertical camera moves (a tilt up to the sky, a rise over a crowd) become natural moves.
- **Backdrops:** the far layer (hills, skyline, sea) is drawn with its base at the horizon, as now, and extended upward by code (more sky, taller skyline silhouettes from the pack).
- **Sets painted whole** (the artist's fallback, one drawing, no layers):
  - they are laid on the tall frame at the *width* of the frame, not sliced;
  - sky above is extended by a flat band of the drawing's top-edge colour, with the pack's clouds;
  - floor below is extended with the drawing's bottom-edge colour plus the pack's ground texture;
  - done by code on the drawing's own edge colours, the same `groundFrom` and `coverFrom` ink sampling `scene-ground.ts` already does;
  - no repaint and no model call. The picture check sees the result.
- **Reverse sides:** built the same way for the tall frame. `reflectPlace` and `reflectRoom` already take `W`.
- **What changes in the client:** nothing but the frame numbers. `setRoomOf` reads the set's viewBox, and `slice` on a 900×1600 set onto a 900×1600 stage is exact.

### 3.2 Blocking: people stacked in depth

In a wide frame, people spread across it. In a tall frame, they stand **in depth and on diagonals**: one nearer and lower in the frame, one farther and higher.

- **Spots:**
  - three across: `left` 0.22, `centre` 0.5, `right` 0.78;
  - three depth rows: `near` d 0.8, `mid` d 0.5, `far` d 0.25.

  The five named spots the sheet writes (`left … right`) map onto them (table below). The sheet does not change.

  | Sheet spot | Tall spot |
  |---|---|
  | left | left, near |
  | centre-left | left, mid |
  | centre | centre, mid |
  | centre-right | right, mid |
  | right | right, far |

- **Groups** (`spreadDepth` tall):
  - **Two:** a diagonal. The speaker who opens the scene stands near-left, the other far-right, at least `TALK_LEAST_M` apart in the world (the metres rule holds). On screen, one is about 1.3× the other's height.
  - **Three:** a triangle: one near centre, two behind either side.
  - **Four to six:** two rows, zigzagged so no head is behind another.
- **Heads apart** (surprise 4): the tall frame's eye line is raised `eyeLift` 0.18 of the frame above the heads of the people at `mid`, so heads separate in height by depth: far heads are higher, near ones lower. A slightly high camera is the usual vertical cheat, and it also shows more floor.
- **Everyone's x on the diagonal** is at least `BODY_SHARE` (0.28) of a body apart from anyone they stand in front of. `faces-seen` stays the backstop.
- **Scale:**
  - `stationScale` tall fits `ceil(largest / 2)` people across, not `largest`, and caps a grown-up at 0.42 of the frame's height at `mid` (0.7 × 900 / 1600 ≈ 0.39 today, a touch larger).
  - People end up about the same size in *units* as wide, so faces are the same size in pixels at export, and bigger relative to a phone's width.
- **Spacing** (`scene-spacing.ts`): in metres, unchanged. Two people talking stand 0.8–2 m apart, now mostly in depth.
  - `ACROSS_LEAST` becomes a *diagonal* least: the distance on the floor plan (x in metres, depth in metres from `FLOOR_DEEP_M` 3.5).
  - `spacingFaults` checks floor distance, which it already half does through `SAME_ROW_D`.
- **Paths** (`scene-paths.ts`): `walkRound` already bends through `BEND_ROWS` in depth. In tall, a way round someone goes *behind* them (a depth detour) more often than beside them.
- **Grounding and features:** unchanged maths. `floorAt`, `depthAtFeet` and `pinholeK` take the tall frame's `eye`, `floor` and `bottom`.

### 3.3 A camera grammar for vertical

The shot kinds stay the same. How often each is used, and how each is framed, change.

| Shot | Wide today | Tall |
|---|---|---|
| Master | Opens every scene; returns between conversations | **The film's first shot is never the master.** It is the hook: a face or the key thing, big, within the first 0.5 s (§8.2). Later scenes may open with a master of ≤ 1.5 s, as an establishing tilt or rise from sky to people. The master returns only for big action moves and entrances. |
| Full or "two in depth" | (none) | The new default: both people of a diagonal pair in frame, head to knee for the near one. It replaces the side-by-side two-shot. |
| Medium (waist up) | Used for a line said strongly | The workhorse for lines: the speaker from the waist up, their eyes on the upper third (0.30–0.36 of H), with head room of 0.08–0.12 of H. |
| Close (chest up) | Emotional lines | More often: every telling line (`reveals`, `confesses`), reactions (K8), and at `CLOSE_APART_MS` × 0.7. |
| OTS | Near shoulder at the side, `OTS_OFFSET` 0.16 of W | The near shoulder and head are *low in a lower corner*, cropped, filling about 0.35 of the width. The speaker is framed above and beyond, eyes on the upper third. This works naturally with the diagonal blocking. |
| Profile two-shot | When the two are near (`PROFILE_NEAR`) | Only when the two are within 1.2 m *and* framed chest up (both fit in 0.86 of 900 units). Otherwise it becomes "two in depth". |
| Deep staging | Near person at the side edge | The near person low and big, cropped at the chest at the frame's bottom; the others above and behind. Tall frames suit this best. |
| Insert | `INSERT_FILL` 0.45 | 0.55 of the width. Things are framed by width, since the frame is narrow. |
| Over the crowd | Head at 0.28 of H | Head at 0.30, with the crowd's heads filling the bottom third. |

- **The numbers** live in `SHOT.tall`:
  - `OTS_FILL` 0.36 of H for the top three fifths;
  - `NEAR_TALL` 0.9;
  - `NEAR_EDGE` 0.2;
  - `DEEP_TALL` 0.75;
  - single `FILL_W` 0.8 of W, `FILL_H` 0.45 of H;
  - two `FILL_W` 0.9.
- **Rules** (`grammarCamera` gains `shape`):
  - a conversation still cuts OTS and reverse. Between them, "two in depth" replaces the profile two-shot;
  - `SHOT_LEAST_MS` is unchanged;
  - `energy.cut` × 0.85 in tall: phone viewers expect quicker cuts (§8 research). This is capped so no shot is under 1.2 s.
- **The 180° rule:** it holds for the diagonal too. The near-left and far-right pair keep their sides.
- **Camera moves:** tall adds *tilt* (y pans) and *rise* as named moves. `settle` already clamps y; `wideView` gains a `y` focal (where the heads are), so the master leans to the people and not the sky.
- **Reading and faces:** the framing keeps faces and text inside the safe zone (§6). `viewOf` shifts y by up to 0.08 of H to put eyes above the bottom safe line, rather than cutting the head.

### 3.4 Walks

- **Walk time is measured in metres** (§2.2), so a walk across the room takes the same time in either shape.
- **In tall, walks run toward or away from the camera more than across:**
  - When a sheet's walk goes from a spot on one side to the other, the tall stager maps spots to (x, depth) positions (§3.2), so most walks change depth. A walker comes toward the camera and grows, or walks away and shrinks.
  - An across walk longer than 0.5 of the frame gets a **track** (the camera follows, the set slides by with parallax), which the tall frame triggers more often. The tall threshold stays 0.3 of W, as today, which is 270 units.
- **Entrances and exits** come in from the side edges as now. A door on the back wall is used more: tall shows the back wall.
- **`WALK_DEPTH`** (the lens) is 1 in both shapes: the size change per unit of walk is a property of the world, not the frame.

### 3.5 Reverse shots

- The reverse is built tall, from the same layout (§3.1).
- The OTS reverse uses the same corner rule, mirrored.
- `pairSide` and `screenDirection` are unchanged.
- The crowd's reverse (`CROWD_REVERSE_*`) has its head line at 0.34 of H.

---

## 4. Explainers in vertical

The principle: **one idea per screen, read top to bottom, big.** A phone viewer sees fewer things at once, in larger type, in a column.

### 4.1 Layouts reflowed

`slotsFor(layout, n, 'tall')` works on the **text area** of §5.1: x 54–792, y 176–1088, about 740 × 910 units. It sits a little left of centre, as creators keep things clear of the right-hand buttons. A drawing may bleed below it to y 1250, but its caption and labels may not.

| Layout | Wide | Tall |
|---|---|---|
| `one` | The whole area | The whole area, the drawing centred at the optical middle (0.42 of H) |
| `row` (n) | A line across | **A column** for n ≤ 3; a 2×2 grid for n = 4; for n = 5, 2 + 2 + 1 (the last centred) |
| `grid` | Two lines | Two columns × ⌈n/2⌉ rows |
| `compare` | Left vs right | **Top vs bottom**, a divider line between, "vs" pill on it |
| `focus` | Big left (0.6), the rest in a column right | Big on top (0.58 of the area), the rest in a row under it (≤ 2), or a column (1) |
| `hub` | Centre, spokes left and right | Centre in the middle; spokes above and below (≤ 2 each). A fifth spoke pages (§4.3). |
| `cycle` | An ellipse wider than tall | An ellipse **taller than wide** (rx 0.36·W, ry 0.40·H); n ≤ 4, else two loops of a column with a return arrow |
| `stack` | A column | A column (already native); with a gap of `SLOT_GAP_TALL` |
| `board` | 4 × 3 | 3 × 4 (§4.4) |

- **Arrows** follow the reflow: `flowOrder` reads top to bottom in tall, where it reads left to right in wide.
- **The pills** (`PILL_LIFTS`) are lifted up and down, not sideways.

### 4.2 Bigger text, fewer words

Sizes are in stage units. At export, 1 unit = 1.2 px, so 40 units = 48 px on a 1080-wide frame. On a phone about 390 pt wide, 900 units fill the width, so 40 units ≈ 17 pt. That is the comfortable floor for text on a phone held at arm's length (§8).

| Text | Wide (today) | Tall |
|---|---|---|
| Title / big keyword card | card sized to its slot | 96–120 |
| Keyword card | slot | 72–96, at most 2 lines |
| Stat number | slot | 140–200 |
| Caption under a drawing | 38 → 26 | **56 → 42** |
| Label | 22–34 (0.045 of the room's height) | **40–52**, by the room's *width* (0.05·w), not its height |
| Arrow pill | 26 | 40 |
| Maths line | slot | ≥ 56 |
| Speech bubble (clips) | `SAY_CHARS` 80 | 50, two lines |

- **Caption lines:** `captionLines` and `brokenLines` take `least` from `TEXT[shape]`.
- **Shorter cards:** `cardWords` is one fewer in tall (kids 2, teens 4, adults 6). `keyPhrase` already trims to the key noun phrase.
- **Drawings for tall films:**
  - The drawing call's canvas shape is chosen by code. A drawing the writer marks `wide` becomes `square` in a tall film unless it is inherently wide: a timeline, a panorama, a number line.
  - This is one line in the drawing brief, not an extra call.
  - `drawing-checks.ts`'s `smallestLabel` (0.034 of the drawing's width) rises to 0.05 in tall, so labels drawn inside art stay readable.
- **Charts and plots:** `chartArea('tall')` is 800 × 900 with at most 6 bars (today 8+), the rest grouped as "Other". Plots are square. A timeline turns vertical (time running down) past 4 events.

### 4.3 Fewer things at once

- **The limit:** `MAX_ON_STAGE` is 5 wide and **3 tall** (4 for a 2×2 of small icons).
- **For new tall films,** the writer's prompt gets one line: "a phone screen: at most three things at once; one idea per screen".
- **For re-stages** (no writer), code pages it. A step showing more than the tall limit is split at its phrase boundaries into two steps on the same beat's words (`buildUp` already splits steps by `WORDS_A_STAGE`). The first half leaves as the second arrives, a `push` up (§4.6).
- **Hubs and grids** past the limit page the same way.

### 4.4 The board (E5) tall

- **The grid:** `BOARD[tall] = { cols: 3, rows: 4 }` (12 cells, the same `BOARD_MOST`). `2 × 4` is used when the section's things are wide diagrams (aspect > 1.4).
- **The camera:**
  - It frames at most `FRAME_MOST` 0.6 of the board's *height* (the long side), at least 0.5.
  - The pull-out to the whole board at a recap is allowed only when the board's text at that scale is still ≥ 32 units (the §6.4 check). Otherwise the recap pans down the column, top to bottom, instead of pulling out.
- **Paging:** it slides *up* (the oldest row out at the top), not left.
- **The start cell:** `BOARD_START` becomes `[1, 0]`: top middle.

### 4.5 Reading windows (E4)

- **The same windows and `READ_WPM` bands.** Text is bigger and shorter, so windows are shorter per item, but there is one item per screen.
- **One accent at a time** holds. Tall adds one rule: the camera never moves while text in the *bottom third* is being read, since that is where platform captions sit and the eye already has work there.
- **The follow camera is not used:** films play their planned shots in both shapes. Tall explainers are composed for the phone, so no follow zoom is needed on a narrow screen. That removes the "zooms again on every point" issue for tall.

### 4.6 E4 joins

| Join | Tall |
|---|---|
| `continue` | Unchanged |
| `match`, `morph` | Unchanged (they interpolate boxes; the boxes are tall) |
| `zoom-through` | Unchanged |
| `push` | **Vertical**: the old stage slides up, the new comes from below, as a phone feed scrolls. `edit.ts:446-453` gains `push-up`, chosen by `joinFor` when `shape === 'tall'`. |
| `dissolve`, `dip`, iris | Unchanged (iris `circle(%)` is aspect-safe) |

### 4.7 Clips (E8) and the clip card

- **A clip scene** in a tall explainer is a tall story scene (§3), with the same kit cast and pack sets.
- **The clip card:**
  - The card's frame is the clip's stage (900×1600), not the fixed 1600×900 (`studio-clip.ts:661`).
  - `clip.ts` `stillCardMarkup` reads the card's viewBox instead of hardcoded percentages.
  - The card lands in the next lesson scene as the `focus` layout's top slot, a tall card of about 0.45 of the width.
- **The freeze label** (`stage.ts:922`) wraps to two lines and is sized by `min(W, H) × 0.062`.

### 4.8 Themes

- Themes are colour tokens and do not change with shape.
- The dark rim and vignette are drawn as a share of `min(W, H)`, so a tall frame gets the same rim.
- The host (Ask 9) is placed per shape (§5.2).

---

## 5. Player and subtitles

### 5.1 Safe zones

- **Two numbers, per shape, in one table** (client and server alike):
  - `SAFE`: where platform UI covers the frame once uploaded;
  - `OUR_UI`: where our own controls cover it while playing.
- **The tall safe rectangle** is the intersection of the organic safe zones of TikTok, YouTube Shorts and Instagram Reels (numbers and sources in §8.1). As shares of 1080×1920:
  - top 0.11 (210 px);
  - bottom 0.20 (384 px, which leaves room for a caption that grows to about 300 px);
  - right 0.12 (130 px, the button column);
  - left 0.06 (65 px).

  That leaves a box of about 885 × 1325 px. The stage composes inside it (§3, §4). The set, sky and floor may run under the platform UI; faces and text may not.
- **The focus band** is the upper-middle of the frame, y 0.13–0.62 (250–1190 px). Faces and titles are aimed there, and the framing puts eyes at about 0.33 (§3.3). Subtitles take the band 0.69–0.79 (bottom edge at 1517 px). TikTok's, Shorts' and Reels' own caption areas start at about 1600–1620 px, so ours sit above them.
- **The text area** is where the stage may set words and faces: x 0.06–0.88 and y 0.11–0.68. On the 900 × 1600 stage that is x 54–792 and y 176–1088, about 740 × 910 units. Pictures, sets and bodies may run beyond it; words and faces may not.
- Meta's official figure for Reels *ads* keeps 35% free at the bottom. We don't compose for ads. A Reels preset that someone later uses for an ad would need its own check, not a different film.
- **Wide** has no platform overlay worth composing around. YouTube's landscape player hides its UI while playing. It keeps the bottom 0.12 free of text for our control bar and subtitles, as now.

### 5.2 Subtitles

- **Tall subtitles:**
  - placed in the band 0.69–0.79, with the **bottom edge at 0.79 of the height**. That is above the platforms' own caption band, and below the faces, which sit in the upper-middle by the framing rules;
  - `LINE_CHARS` 32, and up to **2 lines**. `cuesOf` takes `{chars, lines}` from the shape;
  - no cue shorter than 1 s, and at most about 7 words a second (§8.1);
  - font about 4.6 cqw (about 50 px at 1080 wide), semibold, on the pill the player uses now. Research says bold at 48 px reads better than regular at 60.
- **Wide subtitles:** unchanged (52 chars, one line, bottom margin 0.045).
- **The host:**
  - wide: bottom-left, as now;
  - tall: **left, just above the subtitle band** (its bottom at 0.68), at 22% of the width. It is clear of the right-hand button column and the bottom caption band. The explainer's text area leaves its corner free (x < 0.28 and y > 0.56 is kept clear while the host is on).
  - The subtitles' `hostRoom` inset shrinks to 0 in tall, because the host is above them, not beside.

### 5.3 The player in our app

- **Sizing:**
  - the film's aspect comes from `StudioPlayDto.shape` into a CSS variable `--film-aspect` (16/9 or 9/16);
  - `episode-player.tsx:776-840` and `film-view.tsx:158-181` use it in place of `*16/9` and `aspect-video`;
  - every `vw` in the overlays (title, the end, end card, chips, host bubble) becomes `cqw`, since the picture already has `containerType: inline-size`.
- **On a phone** (the main case for tall):
  - the film fills the width, with the chat and episode switch as now;
  - full screen is `requestFullscreen`, with the CSS `fixed inset-0` fallback on iPhone. On Android, `screen.orientation.lock('portrait')` is tried for a tall film, and `'landscape'` for a wide one, in full screen only, with errors ignored;
  - the control bar is our familiar one, and spans the *picture's* width, not the shell's (`:1011`, `:1026`);
  - under 360 px of picture width, back/next are hidden (the scrubber's idea marks still work) and the time collapses into the scrubber's tooltip.
- **On a desktop showing a tall film:**
  - a centred column, pillarboxed with the page's own background, not black, as YouTube shows a Short in a desktop browser;
  - the film's height fits `100dvh − chrome`. The 36rem text column in `film-view.tsx` is decoupled from the player's width;
  - theatre mode centres the column.
  - Full screen is the black pillarbox that `maxWidth: calc(100dvh * aspect)` already gives.
- **Thumbnails in our app:** the library card, step card, scene thumbs and chapter thumbs keep their **16:9 grid boxes** (one grid, no ragged rows). A tall still is shown `object-contain` on a blurred copy of itself, the familiar treatment for a vertical video in a wide slot. `StudioShowCardDto.shape` lets the card add a small "vertical" glyph. The scene cards in the episode panel show tall stills at 9:16 and 72 px wide.

### 5.4 The end card

- **The end card in tall:**
  - the `@container` layouts are kept;
  - the recap goes from `grid-cols-3` to one column under `@[26rem]`, so it always collapses in tall;
  - "What next?" is a stack of up to 3 full-width chips;
  - it sits inside the safe rectangle, which matters for the exported end frame (§7).
- **The story end** is centred as now, with `cqw` text.
- **The watermark on Free:** on the end card in both shapes, and (export only, §7) as a small corner mark at the top-left inside the safe zone.

### 5.5 The share page

- `/s/[token]` caps the player by height: `max-w-[calc((100dvh-10rem)*var(--film-aspect))] mx-auto`.
- For a tall film on a phone, the page is just the film and its title, as a Short's page is.
- Per-film Open Graph tags (the thumbnail, `og:video:width/height`) are a small server-rendered wrapper, part of phase V6.

---

## 6. Checks by code for vertical

These are all pure functions of the `SceneDto`, run in compose's audit as the space and faces checks are now. A fault is mended by code where it can be. What cannot be mended is written as a `staging:` note and passed to the picture check. There is no rewrite round.

### 6.1 Faces inside the safe zone (`scene-safe.ts`, new)

- **What is checked:** every 100 ms (as `scene-space`'s `EVERY_MS`), for everyone who matters then (speaks, acts, or is acted toward), their face box (`faceIn`) after the camera's view must lie inside `SAFE[shape]`.
- **The mend, in order:**
  1. shift the view's y (≤ 0.08 of H) or x (≤ 0.1 of W) within `settle`;
  2. the person steps (`NUDGE_D` in depth, which moves their face up or down in a tall frame);
  3. drop the shot for the one before (the clear-view rule's own fallback).
- **Wide:** checked against `OUR_UI` only when a platform preset is chosen (§7). It is not needed for playing in our app.

### 6.2 Text inside the safe zone

- **What is checked:** every text box `scene-text-check` already builds (words, captions, labels, pills, bubbles, the stat), after the camera's view, must lie inside `SAFE[shape]`. It must also stay clear of the subtitle band (§5.2). In tall that band is always reserved, subtitles on or off, so one film serves the app and every export.
- **The mend:** the layout's content area already excludes the insets (§4.1). What can still stray is a zoomed view, so the zoom's box is clamped to keep the text inside.

### 6.3 No one cropped

- **Masters and "two in depth":** everyone on stage is whole in frame, head to foot. The near person of an OTS or deep shot is exempt.
- **Mediums and closes:**
  - the speaker's head is whole, never cut at the top, except an extreme close that the sheet asked for;
  - a body is cut only at a clean line: mid-chest, waist or mid-thigh, never at a joint (knees, elbows at the frame's edge);
  - a neighbour is never cut in half at a side edge. The client already avoids it in play (`viewOf`'s note); this makes it a server fault too.
- **The mend:** pull back (smaller `s`) until the rule holds, down to the next shot size.

### 6.4 Minimum text size

- **The rule:** rendered size = size × the view's scale. In tall it must be ≥ 40 units (48 px at 1080). In wide, ≥ 26 units (a caption's least today).
- **Where it bites:** a board's pull-out and an explainer's wide view of many things. There the pull-out is refused (§4.4), or the step pages (§4.3).

### 6.5 The picture check

- **Stills:** rendered at 540 × 960 for tall, the same pixel count and cost as 960 × 540.
- **The prompt** gains one clause per shape: for tall, "a phone screen, full height; is anyone's face or any text in the bottom quarter or at the right edge; is anyone cut off". The code checks above have already run, so the vision model is the backstop.
- **One new moment** is added to `pictureMoments` for tall: the first second, the hook frame. A cold, empty or all-sky opening is the most common vertical failure (§8.2).

### 6.6 Benches

- `set:bench` renders its 12 places in both shapes.
- `/dev/stage` gains the Wide/Tall toggle, plus a **safe-zone overlay** that draws the three platforms' UI outlines over the stage, a dev-only switch.
- `story-bench` and the explainer benches run in both shapes.

---

## 7. Export and sharing (a later phase, designed now)

### 7.1 The render pipeline

- **One renderer drives the player and the file:** the same client player, run in headless Chrome, frame by frame. This is `studio-plan` step 15 and `lessonreel-visuals-plan` step 4. It is our own code, so there is no Remotion licence (§8.5).
- **A new Railway service, `renderer`:**
  - a Docker image with Chromium (`chrome-headless-shell`) and a full ffmpeg build;
  - its own `render` queue on the same Redis;
  - separate from the API and worker, so neither grows.
- **A render route** in the client, `/render/[episodeId]?shape&token`, with no chrome. It exposes:
  - `window.__render.seek(ms): Promise<void>`, which sets the film clock, runs the stage's `render(t)`, sets every CSS and SMIL animation's `currentTime` via `document.getAnimations()` and `svg.setCurrentTime`, and resolves after two `requestAnimationFrame`s;
  - `window.__render.audio(): Promise<ArrayBuffer>`, the whole film's mix rendered in an `OfflineAudioContext` by the same `SceneSound`, `conductor` and `score` code (faster than real time, and deterministic).
- **Determinism:**
  - The stage is already a pure function of t (`timeline.ts`). Springs step at a fixed rate (`studio-world-plan` §3.2), and anything with memory is seeded (§2.5).
  - Anything that reads `Date.now()`, `performance.now()` or `Math.random()` is routed through the film clock in render mode. A test renders the same second twice and compares hashes.
- **Capture:**
  - Puppeteer (Apache-2.0) drives the page. Each frame is taken with CDP `Page.captureScreenshot` (JPEG q90, or PNG for text-heavy explainers) after `seek`, and piped to `ffmpeg -f image2pipe`.
  - Where the headless shell supports `HeadlessExperimental.beginFrame`, that is used instead: it waits for no timers and is faster.
- **Encoding** (YouTube's published upload settings, which the others accept):
  - H.264 High, `yuv420p`, closed GOP, 2 B-frames, 30 fps;
  - about 8 Mbps at 1080p30 (a CRF of 18–20 with an 8–10 Mbps cap);
  - AAC-LC 48 kHz stereo at 192–384 kbps;
  - `-movflags +faststart`.

  Our player's motion is designed at 30–60 fps; 30 is every platform's safe choice.
- **The ffmpeg licence:** a build with libx264 is GPL. Running it as its own process on our own server distributes nothing, so this is fine. We never ship it in the app. An LGPL build with OpenH264 is the fallback if that ever changes.
- **Audio:**
  - The offline mix is normalised with ffmpeg `loudnorm` in two passes to **−14 LUFS integrated, −1 dBTP true peak, LRA ≤ 11** for every preset. That is YouTube's normalisation level, and TikTok's and Instagram's in practice (§8.3).
  - The voice's own −16 LUFS (`voice-loudness.ts`) stays as it is for the player. The mix is lifted as a whole at export.
- **Time and cost:** research figures are in §8.5. The planning numbers, to be measured in the spike:
  - a DOM/SVG stage at 1080×1920 captures at about **3–10 frames a second** on a 2–4 vCPU container, a little more with `beginFrame`. A minute of 30 fps film is 1,800 frames, so **3–10 minutes of rendering per minute of film**. Most of that is screenshots; x264 at `veryfast` keeps up alongside;
  - the offline audio takes a few seconds;
  - at Railway's usage prices ($0.00000772 per vCPU-second and $0.00000386 per GB-second), a 4 vCPU / 4 GB container costs about $0.000046 a second. That is **about 1–3 cents per minute of film**, plus egress of about $0.003 for a 60 MB file;
  - **no model calls.**
- **Scaling:**
  - One render at a time per container; more containers for more queue.
  - A 3-minute episode renders in about 10–30 minutes. The maker is told it will be ready soon and gets it in their films, as making a film works today.
  - Parallel chunks (below) bring that under 5 minutes when it matters.
- **Frame parallelism later:** split a film at scene joins into N chunks rendered by N pages, then `ffmpeg concat`. The joins are cuts, dissolves and dips that `edit.ts` already models with handles, so a chunk boundary is rendered with its overlap.

### 7.2 Thumbnails and the cover frame

- **Made by `renderStill` (resvg, already on the worker)**, not Chrome, so they exist the moment a film is made, before any export.
  - **Wide:** a YouTube thumbnail at 1280 × 720 (under 2 MB, JPEG). The moment is `fullestStep` of the episode's most important scene: the hero's first close, or an explainer's key picture. The episode title is set by code in the theme's display type, at most 5 words, on the left third.
  - **Tall:** a cover at 1080 × 1920, with the title inside the safe rectangle's upper half. TikTok and Shorts pick a cover frame from the video itself, so the render also **holds that cover as the first 0.5 s** only when the preset's `cover: 'first-frame'` is on (off by default: it slows the hook).
- **Our own cards** use the same stills.

### 7.3 Subtitles

- **Sidecar files, always:** SRT and WebVTT from the word timings the aligner already gives. The cues come from the same `cuesOf` as the player, by shape: 52 chars and one line wide; 32 chars and 2 lines tall.
- **Burnt in, as an option** (on by default for TikTok and Shorts, off for YouTube wide, where YouTube shows the SRT itself):
  - rendered **in the page** by the player's own `FilmSubtitles` in render mode, so they look exactly as in the app and sit in the safe zone (§5.2);
  - the alternative, ffmpeg's `subtitles`/`ass` filter through libass, would need its own styling and placement to be kept in step with the player's. It is the fallback if the page route cannot.

### 7.4 Platform presets

| Preset | Frame | Length | Subtitles | Loudness | Other |
|---|---|---|---|---|---|
| YouTube | 1920×1080, 30 fps | 15 min unless the channel is verified (then 12 h) | sidecar SRT | −14 LUFS, −1 dBTP | 1280×720 thumbnail, ≤ 2 MB |
| YouTube Shorts | 1080×1920, 30 fps | ≤ 3 min (§8.3); longer becomes an ordinary vertical video | burnt in | same | 9:16 cover (custom Shorts thumbnails exist since July 2026, on desktop) |
| TikTok | 1080×1920, 30 fps | the creator's own limit (up to 60 min for uploads; 10 min is the safe assumption) | burnt in | same (TikTok publishes no target) | Cover frame chosen in the app, or by timestamp through the API |
| Instagram Reels | 1080×1920, 30 fps | ≤ 3 min (uncertain; check at build time) | burnt in | same | |
| Download (MP4) | the film's shape | any | option | same | Watermark on Free |

- **A preset is a small table**, `{frame, fps, maxMs, subtitles, cover}`.
- **The export menu** is one "Download" button with the presets that fit the film's shape (familiar, as a video editor's export). A wide film offers YouTube and Download. A tall one offers Shorts, TikTok, Reels and Download.
- **Length:** the preset's `maxMs` is checked before rendering. A film over it can still be downloaded, and the maker is told once.

### 7.5 Later: direct upload

- **YouTube Data API v3, `videos.insert`:**
  - OAuth per maker (the `youtube.upload` scope), as a resumable upload.
  - The quota changed in 2026. Uploads now have their own bucket of **100 `videos.insert` calls a day** per project; the old 1,600-units-of-10,000 figure is out of date. More needs Google's quota form.
  - Projects that haven't been audited can only upload **private** videos until Google's compliance audit passes. The OAuth consent screen needs verification for the scope.
  - There is no Shorts flag: a vertical or square video of ≤ 3 min becomes a Short by itself. `#Shorts` is optional.
  - `thumbnails.set` sets the wide thumbnail and needs a phone-verified channel.
- **TikTok Content Posting API:**
  - **"Upload"** (`video.upload`) sends the video to the maker's TikTok inbox as a draft, and they finish the post in TikTok. **"Direct post"** (`video.publish`) publishes it.
  - Every post starts with `creator_info`, which gives the maker's privacy options and their longest allowed video.
  - Until the app passes TikTok's content-sharing audit:
    - every post is **private (SELF_ONLY)**;
    - at most 5 makers can post in 24 h;
    - their accounts must be private.
  - TikTok's UX rules apply: show the maker's account, let them choose privacy with no default, and ask for explicit consent. The API has an `is_aigc` flag; we set it, since the films are made with AI.
  - **"Upload to inbox" is the one to build first:** fewer approvals, and the maker keeps control of the caption and cover.
- **Both need:**
  - the maker's explicit consent in an OAuth screen;
  - tokens stored encrypted;
  - a Settings page to disconnect.

  This is its own plan when the time comes. Nothing in phases V0–V6 depends on it.

---

## 8. Research: the craft and the platforms

Summarised in our own words. Sources are listed at the end.

**How far to trust these numbers.** Most safe-zone, text-size and pacing numbers come from creator and ad-tool guides, not from the platforms, and they disagree by 50–150 px. The official ones are:
- Meta's percentages for Reels ads;
- Google's vertical ad diagram;
- YouTube's Help and API pages;
- TikTok's API documents.

The plan takes the **intersection** of the guides, so it is conservative. The numbers live in one table, so they are easy to change.

### 8.1 Composition for phones

- **Tighter shots:** mediums and closes. People are stacked in depth rather than set side by side, and faces sit on the upper third.
  - Head room is about 8–12% of the height. Over 15% is wasted, and under 5% pushes into the top UI.
  - The most important band is 15–40% from the top.
  - A 9:16 frame has far more height than width to use, so use it for stacked elements and full-height figures.
- **Safe zones on 1080×1920, organic posts** (margins in px, top / bottom / left / right):

  | Platform | Margins | Source |
  |---|---|---|
  | TikTok | about 108 / 320 / 60 / 120 | ad guides are stricter: up to 150 / 440 |
  | YouTube Shorts | about 120 / 300 / 48 / 96 | Google's ad diagram is far stricter: 288 / 672 / 48 / 192 |
  | Instagram Reels | about 210 / 310 / 42–84 | Meta's ad guidance: 14% top, 35% bottom, 6% sides |

  - The common cross-platform advice is a centred box of about 900 × 1400.
  - A practical rule: faces and titles between y ≈ 250 and 1400, nothing vital right of x ≈ 940.
  - TikTok notes that its safe area shrinks as the creator's caption grows.
- **Text on phones:**
  - the floor is 36–44 px at 1080 wide (about 2–2.3% of the height);
  - main text and captions are best at 48–80 px, secondary text at 32–40 px;
  - bold or semibold beats regular at the same size.
  - Captions are 1–2 lines, placed mid to lower-middle (about y 1100–1450), at no more than about 5–10 words a second.
- **For us:**
  - 40 units = 48 px is the floor (§6.4);
  - captions 42–56 units, labels 40–52, cards 72–120;
  - the safe box and focus band are as in §5.1.

### 8.2 Pacing

- **The hook is the first 1–3 seconds.** Third-party studies say most viewers decide by the third second, and the first half-second has to stop the scroll.
  - TikTok's own ad guidance: hook within the first 6 seconds, the main point within 3, then hook, body, close.
  - (The exact percentages are vendor data and uncertain.)
- **The picture changes about every 2–4 s** in strong short videos, with a "pattern interrupt" (a text card, a cutaway, a zoom) every 3–5 s.
- **For us:**
  - The first frame of a tall film shows a face or the key thing (§3.3). An explainer's first beat has its picture on screen at 0 ms, never an empty stage or a title card first.
  - `energy.cut` is × 0.85 in tall, and E4's rule of a stage change at least every `STILL_WORDS` already gives a change every few seconds.
  - A new `tall` hook moment in the picture check (§6.5).
  - The writer is not asked to write differently for tall. Minutes and length stay the maker's choice.

### 8.3 Platform specs (checked 2026-09)

- **YouTube Shorts:**
  - up to 3 minutes for videos uploaded since 15 October 2024;
  - a vertical or square video within that length becomes a Short automatically, with no toggle;
  - custom 9:16 thumbnails opened in July 2026, for Partner Programme channels on desktop.
- **YouTube (landscape):**
  - 15 minutes by default, and up to 12 hours for verified accounts;
  - thumbnails are 1280×720, at most 2 MB;
  - upload settings: H.264 High, closed GOP, 4:2:0, about 8 Mbps at 1080p30, AAC-LC 48 kHz.
- **TikTok:**
  - 10 minutes when recorded in the app, and up to 60 minutes uploaded, depending on account and region. The API gives each creator's own limit;
  - MP4 or MOV, H.264 recommended, 23–60 fps, sides 360–4096 px, ≤ 4 GB;
  - the cover is chosen by a timestamp.
- **Instagram Reels:** about 3 minutes (unconfirmed in this pass; check when building the preset).
- **Loudness:**
  - YouTube turns anything louder down to about −14 LUFS integrated (industry-measured; YouTube doesn't publish it);
  - TikTok publishes no target;
  - deliver −14 LUFS with a true peak of −1 dBTP everywhere.
- **Frame rate:** 24, 25 and 30 are fine everywhere, and 60 is accepted.

### 8.4 How animated and explainer channels do vertical

- **Reframing** a 16:9 film to 9:16 keeps only about a third of the width. This is what Premiere's Auto Reframe, CapCut and Google's open-source AutoFlip do, tracking the subject.
  - It works for a single talking head.
  - It fails for diagrams, two characters side by side, comparisons, and text near the edges. AutoFlip's own write-up names cropped text and logos as its failure.
- **Native vertical** is the common advice when you control the scene:
  - big text or a title on top;
  - the picture or character in the middle;
  - captions lower-middle, and the bottom band left clear;
  - two people as over-the-shoulder, stacked in depth or cut as singles;
  - explainers as one idea per screen, diagrams built top to bottom with arrows downward, and visual over text.
- **Industry write-ups on studio practice are thin.** These are the common patterns, not documented studio standards.
- **For us:** we own the scene graph, so we compose natively (§3, §4). This is also what `lessonreel-visuals-plan.md` asks for: "9:16 Shorts reframed by the camera (not cropped)".

### 8.5 Rendering our stage to MP4

- **(a) Headless Chrome plus ffmpeg: chosen.**
  - The page's clock is ours: a `seek(t)` on the stage, as HeyGen's HyperFrames does. The timecut/timesnap approach (BSD-3) of overriding `Date`, `performance.now`, `requestAnimationFrame` and timers is the fallback for anything that reads time directly.
  - Frames are taken with `Page.captureScreenshot` and piped to ffmpeg.
  - `HeadlessExperimental.beginFrame` gives atomic, reproducible frames. It needs `chrome-headless-shell` on Linux and is an experimental protocol domain, so it is an optimisation, not a dependency. `puppeteer-capture` (MIT) shows how.
  - Screencast recorders (`puppeteer-screen-recorder`) are real-time and drop frames, so they are not suitable.
- **(b) WebCodecs in the page:** it needs a canvas. Our stage is DOM and SVG, so each frame would first be rasterised, which loses some CSS and fonts. H.264 encoding in headless Linux Chromium depends on the build (OpenH264). Mediabunny, the muxer, is MPL-2.0. **Not chosen.**
- **(c) Frameworks:**
  - **Remotion** is free for companies of up to 3 people. Above that, the automation tier is $0.01 a render with a $100 monthly minimum.
  - **Revideo** (MIT) and **Motion Canvas** (MIT) would mean rewriting our stage in their scene model.
  - **Not chosen.** Our player already is the renderer, and `studio-plan` step 15 chose our own.
- **Speed:**
  - Remotion users report 9–16 fps at 1080×1920 on 16–224 vCPUs, far from linear in cores;
  - distributed Lambda renders do a minute in about 19 s for about $0.017;
  - for our DOM/SVG stage on 2–4 vCPUs, expect 3–10 fps, to be measured in the V6 spike.
- **Cost:** about 1–3 cents per minute of output at Railway's prices (§7.1).
- **Licences:**
  - puppeteer is Apache-2.0;
  - ffmpeg is LGPL, but a build with x264 is GPL. That is fine as a server process, since we distribute nothing. Note that the `ffmpeg-static` npm package bundles GPL-3 builds;
  - timecut/timesnap are BSD-3, puppeteer-capture MIT, Mediabunny MPL-2.0.
- **Loudness:**
  - `loudnorm` in two passes: measure with `I=-14:TP=-1:LRA=11:print_format=json`, then apply with the measured values and `linear=true`;
  - add `-ar 48000`, because dynamic mode resamples to 192 kHz.
- **Burnt-in subtitles by ffmpeg** need libass. The styling is written as `.ass` with `PlayResX=1080/PlayResY=1920`, so sizes are real pixels, and the fonts ship with a `fontsdir`: a missing font is silently swapped. This is our fallback. We burn them in the page (§7.3).

### 8.6 Sources

- **Composition, safe zones, text:** postplanify.com/blog/social-media-safe-zones-2026-complete-guide; upload-post.com/tools/safe-zone-checker; admanage.ai/blog/tiktok-ad-specs; ads.tiktok.com/help (creative best practices); recruitmentads.com/free-tools/ad-mockup/youtube (citing Google Ads Help); vidsniff.com/blog/youtube-ad-safe-zones; billo.app/blog/meta-ads-safe-zones; 1clickreport.com/blog/meta-ads-creative-safe-zones-2026-guide; clickyapps.com/creator/video/guides/vertical-framing-safe-zones; toneproduction.net/shooting-vertical-video-framing-9-16; rocketshiphq.com/text-overlays-video-ads-mobile; opus.pro/blog/video-caption-design-placement; legibility.info/rules-for-text-in-videos.
- **Pacing:** ads.tiktok.com/business/en-US/creative-codes; opus.pro/blog/ideal-youtube-shorts-length-format-retention; opus.pro/blog/tiktok-length-format-retention-data; insights.ttsvibes.com/tiktok-first-3-seconds-hook-retention-rate.
- **Platform specs:** support.google.com/youtube/answer/12779649 (Shorts length); support.google.com/youtube/answer/1722171 (encoding); support.google.com/youtube/answer/71673 (length); 9to5google.com/2024/10/03/youtube-shorts-3-minutes; technobaboy.com/2026/07/27/youtube-now-lets-creators-add-custom-thumbnails-to-shorts; sociality.io/blog/tiktok-video-length; developers.tiktok.com/doc/content-posting-api-media-transfer-guide; audioforgepro.com/blog/youtube-lufs-normalization-guide.
- **Vertical animation:** research.google/blog/autoflip-an-open-source-framework-for-intelligent-video-reframing; nextdayanimations.com/vertical-video-and-video-resizing; svgator.com/blog/kinetic-typography-a-guide-to-text-in-motion; tips.clip-studio.com/en-us/articles/11058.
- **Rendering and licences:** github.com/tungs/timecut; chromedevtools.github.io/devtools-protocol/tot/HeadlessExperimental; github.com/alexey-pelykh/puppeteer-capture; heygen.com/research/html-to-video; github.com/puppeteer/puppeteer/issues/11062; github.com/Vanilagy/mediabunny; webcodecsfundamentals.org/codecs/avc.html; remotion.pro/license; remotion.dev/docs/license/faq; remotion.dev/docs/lambda/cost-example; github.com/remotion-dev/remotion/issues/4949; github.com/midrender/revideo; railway.com/pricing; npmjs.com/package/ffmpeg-static; ffmpeg.org/legal.html; ffmpeg filter documents (`loudnorm`, `subtitles`).
- **Upload APIs:** developers.google.com/youtube/v3/docs/videos/insert; developers.google.com/youtube/v3/determine_quota_cost; developers.google.com/youtube/v3/revision_history; developers.tiktok.com/docs/en/content-posting-api-get-started; developers.tiktok.com/docs/en/content-posting-api-reference-direct-post; developers.tiktok.com/docs/en/content-sharing-guidelines.

---

## 9. Roadmap

### 9.1 Phases

| Phase | What you'll see | Effort (mine) | Depends on | Runs in parallel with |
|---|---|---|---|---|
| **V0 Plumbing** | Nothing yet, and nothing changes. `shape` in the contracts, brief, episode and play; `scene-shape.ts`; every 1600/900 and `STAGINGS.wide` read through it; walk time in metres. Wide output byte-identical (the specs and fixtures prove it). | 2–3 d | – | V1 |
| **V1 Player** | The Shape row on the brief card, and chat words that set it. The player, film view, share page, end card, subtitles (2 lines, 32 chars) and host all right for a tall film. The desktop pillarbox, `cqw` everywhere, thumbnails that contain a tall still. The dev safe-zone overlay. | 2–3 d | the V0 contract | V0, V2, V3 |
| **V2 Tall explainers** | Layouts reflowed; tall text sizes; at most 3 on screen, paged by code; the board 3×4 with its column recap; `push-up`; square drawings; tall charts; the clip card from its own frame. | 4–6 d | V0 | V3 |
| **V3 Tall stories** | Tall sets (`SetFrame`, `buildSet` tall, sky and floor extended, pieces to the pan span, painted sets extended); blocking in depth with a raised eye; the tall shot grammar; walks in depth; tall reverses. | 6–9 d | V0 | V2 |
| **V4 Checks** | Faces and text in the safe zone, no one cropped, the least text size; the tall picture check with its hook moment; both shapes on every bench. | 2–3 d (written alongside V2 and V3) | V2, V3 | – |
| **V5 The other shape** | "Make a vertical version" / "Make a wide version": a twin episode re-composed, with no writer and no voice. | 1–2 d | V2, V3 | V6 |
| **V6 Export** | A download in each preset: the renderer service, the render route, offline audio, loudnorm −14, sidecar and burnt-in subtitles, thumbnails and covers, the watermark. Starts with a 2-day spike measuring fps and cost on Railway. | 6–9 d | V1 (the player's render mode) | V5 |
| **V7 Upload** | Connect YouTube and TikTok; post from the film (TikTok to the inbox first). Its own plan. | 4–6 d, plus the platforms' audits (weeks, their timing) | V6 | – |

### 9.2 The first milestone

**One vertical story scene and one vertical explainer scene, made end to end.**

- **Scope:** V0, V1, and the thinnest slice of V2 and V3:
  - the `row`, `stack`, `focus` and `compare` reflows, and tall text sizes;
  - one outdoor and one indoor tall set by `buildSet`;
  - two people on a diagonal;
  - medium, close and OTS shots;
  - the safe-zone checks for faces and text.
- **About 8–10 days.**
- **Test pieces**, both with a global, neutral cast:
  - a story: two friends at a market stall, one telling the other some news: a conversation, a walk toward the camera, a close on the reveal;
  - an explainer: "how a vaccine trains the immune system", three ideas: a stack, a compare and a focus, with one labelled drawing.
- **Done when:**
  - both play right in the app on a phone and on a desktop (pillarboxed);
  - every face and every word is inside the safe box in all three platforms' overlays (the dev overlay);
  - the tall picture check passes;
  - the same two sheets still compose byte-identical wide output.

### 9.3 Cost

- **Model cost: zero extra.** Shape is code, and it adds no writer, no send-back and no voice.
  - The picture check looks at the same number of stills at the same pixel count, so it costs the same.
  - One prompt line is added to the writer for tall films ("a phone screen …"): a few tokens.
- **A re-stage in the other shape** costs about $0.02–0.05 an episode if the picture check runs, and nothing if it does not.
- **Export:** about 1–3 cents of compute per minute of film (§7.1), plus storage and egress.
- **The renderer service** runs only while rendering, if it is set to sleep when idle. Otherwise a small always-on container costs a few dollars a month.

### 9.4 Risks

- **Heads in a row.** Depth stacking under a pinhole camera lines heads up on the horizon. The raised eye (`eyeLift`), the x offsets and `faces-seen` handle it. The set bench and the picture check show it early.
- **Sets that look empty or crowded tall.** A set built for a wide frame may be thin in the sky or have too much floor. The set bench renders all 12 places in both shapes before V3 ships. Style packs may need a tall "sky dressing": birds, a lamp, rigging, bunting.
- **Wide drawings in tall explainers.** Things already drawn wide in an old film, when re-staged, stay small. The re-stage flags them; new tall films draw square.
- **Text density.** Some lessons carry more words than a phone shows well. Paging by code keeps it readable, at the cost of more screen changes. E4's reading windows guard the pace.
- **The pan span.** A tall set is mostly off-frame, so more pans are wanted. A pan that is too long or too frequent feels restless: the camera's `SHOT_LEAST_MS` and cut rules still hold.
- **The `wide` staging name** now also means "tall". It is kept for zero client churn, and documented, and a rename to `full` is one mechanical commit later. The risk is only confusion, never behaviour.
- **Render determinism.** CSS and SMIL animations inside AI drawings keep their own clocks. Render mode seeks them through `getAnimations()` and `setCurrentTime`. A drawing using JS timers would not seek, but the sanitiser already strips scripts. The V6 spike renders one second twice and compares.
- **Render speed.** If capture is under 3 fps, a long episode takes a while. Parallel chunks at scene joins, and `beginFrame` on Linux, are the levers.
- **Platform rules move** (Shorts length, TikTok limits, the YouTube quota changed twice in 2026). Every preset number lives in one table and is checked at build time.
- **Old films** stay wide. Nothing re-composes them unless the maker asks for the other shape.

## Decisions (Richard, 2026-09-30)

- **Export and rendering (V6, V7) are left out for now.** Build V0–V5 only.
- **Vertical never replaces wide.** When planning, the maker chooses Wide, Vertical or **both**. Both makes the film in each shape, as twin episodes that share the script and the voice.
- **After a film is made in one shape**, the maker can always make the other: "Make a vertical version" or "Make a wide version".
- **The default is Wide.**

### 9.5 Decisions for Richard (original questions)

1. **The default shape:** wide, as recommended, or vertical when the show is started on a phone?
2. **Re-stage as a twin episode** (its own link and thumbnail, no minutes charged), as recommended, or replace the film in place?
3. **Subtitles burnt in by default** for the TikTok and Shorts downloads (recommended, since phone viewers often watch muted), with a switch to turn them off.
4. **Export's place in the order:** after the first milestone and V2–V5 (recommended), or the spike right after the milestone, to know render speed early?

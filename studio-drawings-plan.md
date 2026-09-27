# Studio drawings: every character, thing and place drawn right

Richard, 2026-09-27, looking at Clover, Dot and Eggbert: *"how can we get the drawings to be perfect. From the pictures I can see a lot of flaws."* Then: *"go ahead and create a technical plan for everything that needs to be done."*

This plan covers every drawing the Studio makes that is not a person from the figure kit: animals, creatures, the show's own things, and the places (sets). People already look right because code draws them. The plan brings everything else up to that standard, mostly by drawing it with code too, and by making the model-drawn remainder see and fix its own work.

---

## 1. What is wrong today

### 1.1 What the pictures show

| Drawing | Flaws |
|---|---|
| Clover (horse) | Stands head-on like a person; four stick legs in a row; tail stuck out to one side. "A red saddle blanket" came out as a scarf round her neck. |
| Dot (duck) | Lopsided blob; angry brows on a "friendly" duck; the beak sits beside the face and the code mouth landed next to it. |
| Eggbert (egg) | The face shrank to a small oval low on the body; stick arms; a zigzag hand; the crack is a scribble. |
| Pip (dog) | Drawn as an upright teddy; a redraw that asked for a three-quarter view kept him front-on. |
| Redraws | Often come back almost unchanged (the likeness check had to send copies back). |
| Sets | Stray strokes; a bus painted as a street seen past a bench. |
| Things | A uniform "at rest" stands upright on the floor like an invisible person. |

### 1.2 Why (with where in the code)

1. **The artist draws blind, on a cheap text model.** Every model-made drawing (characters, sets, the show's own things, explainer drawings) goes through one task, `scene_draw`, routed to `deepseek:deepseek-flash` (`src/web/adapters/ai-sdk/models.ts:115`). DeepSeek has no vision (`models.ts:14`). No temperature or seed is set (`ai-sdk-llm.adapter.ts:1013-1056`). The model writes SVG and never sees the result.
2. **Two style guides that disagree.** Characters get the house style in the brief (`CAST_STYLE`, `src/business/domain/scene-story.ts:1692`: flat colours, no gradients, outline `#2d2a32`). But the system prompt, `PROMPTS.sceneDraw` (`src/web/adapters/prompts.ts:2397-2474`), was written for explainer diagrams. It asks for "two or three tones a shape", allows soft gradients, uses ink `#1F2A37` and a 10-colour palette, says "draw no people", and requires motion. `measureSheet` still asks for a mouth in each face (`scene-sheet.ts:253`, `:258`), while `FACE_BRIEF` (`scene-story.ts:1735`) says to draw none.
3. **Outlines 3–7 times too thin.** The artist draws a ~3-unit outline on an ~800-unit canvas. The stage scales that canvas to `SIZE_UNITS` 95/130/230 kit units (`scene-sheet.ts:88`), the same units people are drawn in with a 2.6 line (`scene-figure.ts:490`). A medium creature's outline ends up about 0.5 kit units wide, next to people at 2.6.
4. **The checks are about structure, not about how it looks.** `inspectSvg`/`judged`/`gateDrawing` (`scene-svg.ts:890`, `:985`, `:1036`) check required groups, states, text size, element count and blankness. `measureSheet` (`scene-sheet.ts:216`) checks faces overlap the head and limbs are joined. Nothing checks:
   - what the drawing is (does it read as a horse?), which way it faces, or whether it matches the kit's style;
   - palette, stroke widths, gradients or filters, or stray strokes;
   - whether a change the maker asked for is visible.
5. **Revisions are blind too.** `drawSheet` (`scene.processor.ts:2802`, loop `:2824-2882`) makes 2 tries (`DRAW_TRIES`, `:243`) and passes text notes forward. The previous SVG is never sent back, except as a maker's-redraw `reference`. The better try is picked by counting faults.
6. **No structure for anything but people.** People come from `FigureSpec` (`scene-figure.ts:255`), drawn by `drawFigure` (`:3153`) with known joints, faces, mouths and rig. Every animal and creature is invented from nothing, each time.
7. **Redraw semantics are thin.** `CastWork` holds one candidate (`studio/studio-drawings.ts:24`). The only redraw check is `drawnAlike ≥ 0.8` (a copy check, `scene-sheet.ts:325`). Nothing checks that a redraw is still the same character, or that the asked change shows.
8. **Sets retry for little.** `paintSet` (`scene.processor.ts:2723`) retries only when nothing came back, `front` is missing, or there are more than 1,200 elements. "No loose strokes" (`scene-story.ts:1636-1640`) is in the prompt only.
9. **Things have one drawing for every moment.** `ownThingBrief` (`scene-story.ts:1775`) asks for one still drawing with a grip. Clothes have no "folded" or "on a hanger" look for when they are at rest.

---

## 2. What "right" means: the scorecard

Every drawing is scored on the same list. Code checks what code can measure; a vision model judges the rest.

| # | Criterion | Checked by |
|---|---|---|
| 1 | **Recognisable**: a vision model names it as what the brief says (horse, duck, egg-man) | vision |
| 2 | **Anatomy and stance**: the right number of legs on the ground line; animals four-legged in side or three-quarter view; faces the way the brief says | vision + code (legs touching the ground line from the ink mask) |
| 3 | **House style**: outline ink `#2d2a32`; outline 2.6 kit units ±15% at stage size; flat fills from the house palette; no gradients, filters or patterns | code |
| 4 | **Face**: kit eyes and mouth at the right place on the head (mouth under the eyes, on the muzzle or beak), readable at stage size | code (measured face) + vision |
| 5 | **Joined**: every part touches the body, and stays joined when moved | code (already: `holdsTogether`, `scene-sheet-rig.ts:896`) |
| 6 | **Clean**: no strokes or specks outside the silhouette; no stray lines | code (ink masks) |
| 7 | **Composition**: fills its frame, stands on the ground line, nothing cut off | code |
| 8 | **Asked change visible** (redraws): "a red blanket on her back" is on her back | vision (old and new side by side) |
| 9 | **Still the same character** (redraws): colours, species and features kept unless asked | vision + code (palette overlap) |
| 10 | **Set sanity**: the place reads as asked (inside a bus, a bedroom); ground and horizon where the brief says; no loose strokes | vision + code (`measureGround`) |

A drawing **passes** when every code check passes and the vision judge scores it at least 8/10 on criteria 1, 2, 4 and 8–10.

---

## 3. Phase 0: the drawing bench (½ day)

So "better" is measured, never guessed.

- **Fixtures:** `src/business/domain/drawing-bench/` holds about 40 briefs as JSON (the same shape as `sketch-fixtures/`, `src/business/domain/sketch-eval.ts:46-87`):
  - animals: dog, cat, horse, donkey, cow, goat, sheep, pig, chicken, duck, owl, parrot, fish, rabbit, mouse, lion, elephant, giraffe, monkey, snake, frog, turtle;
  - creatures: an egg-man (Humpty), a dragon, a robot, a snowman, a ghost, a friendly monster, an angel;
  - things: a kite, a bicycle, a school uniform, an umbrella, a drum;
  - places: a bedroom, a market, the inside of a bus, a classroom, a beach, a forest;
  - redraws: Clover plus "a red saddle blanket on her back", and Eggbert plus "rounder, with a crack on top".
- **Script:** `scripts/drawing-bench.ts` (npm `drawing:bench`). It builds the LLM adapter standalone, as `scripts/sketch-eval.ts:67` does. Then:
  1. Each brief is drawn through the real path: `drawSheet`, `drawOwnOne`, `paintSet`, and the kits once they exist.
  2. Each drawing is rendered with one face showing (reuse `withOnly`/`preview`, `studio-cast.service.ts:40`/`:60`) at card size and at stage size.
  3. The code checks run, then the vision judge.
  4. It writes `report.json`, an `index.html` contact sheet (the layout of `scripts/figures-sheet.ts`) and `sheet.png`.
  5. `--against <old report>` compares two runs, as `scripts/scene-bench.ts` does, and `--write-baseline` stores the baseline.
- **Vision judge:** a new port method `drawingJudge({ png, brief, kind, old? })`, returning a structured verdict. It is built on the existing image-input template `judgeSketch` (`ai-sdk-llm.adapter.ts:686-720`: `generateObject` with a PNG `file` part). New task `drawing_judge` in `LlmTask` (`src/business/ports/llm.port.ts:14-59`), with `AI_MODEL_DRAWING_JUDGE` in `TASK_VAR` (`models.ts:24`), defaulting to `openai:gpt-4.1-mini`.
- **Human check:** the contact sheet is sent to Richard at each phase's end; his marks (a line per drawing, ok or not) are stored next to the report.
- **Gate for every later phase:** the median score goes up, no fixture falls below its baseline, and the code checks pass on 100%.

---

## 4. Phase A: quick wins on the model-drawn path (1½–2 days)

These help every drawing the model still makes, straight away.

### A1. One house style for characters and things
- New system prompt `PROMPTS.castDraw` for characters and show-owned things. `PROMPTS.sceneDraw` stays for explainer drawings, which may keep their tones and motion.
- It says, in the kit's own terms:
  - ink `#2d2a32`, round joins;
  - flat fills only, from the house palette (the kit's `SKIN`, `HAIR`, `CLOTH` plus an animal-coat palette);
  - no gradients, filters or patterns;
  - the outline width written for the canvas: `width = 2.6 × canvasHeight ÷ SIZE_UNITS[size]` (about 16 units for a medium animal on an 800 canvas), so it lands at 2.6 kit units on stage;
  - big white eyes with dot pupils, as in `CAST_STYLE`;
  - no mouth, but a `mouth-at` mark (`FACE_BRIEF`);
  - animals on four legs, side or three-quarter view, facing right.
- Two to three small example SVGs cut from the kit and the code set pieces (`scene-set-pieces.ts`) go in the prompt as style samples.
- The adapter chooses `castDraw` for characters and things, via a `purpose` field on `sceneDrawing` (`llm.port.ts:656-673`).
- `measureSheet`'s face notes stop asking for mouths (`scene-sheet.ts:253`, `:258`).

### A2. A code clean-up pass: `polishDrawing`
- New module `src/business/domain/scene-polish.ts`, run on every model-made character, thing and set after the gate and before measuring:
  - every outline stroke becomes `#2d2a32` (colours that are part of the art, like a red scarf edge, are kept when they are fills);
  - stroke widths are set to the target width for the drawing's canvas and size (`lineOf`, `scene-sheet-face.ts:186`, already reads the common width);
  - gradient fills become the gradient's middle stop colour; filters and patterns are removed;
  - fills snap to the nearest house palette colour when within ΔE 12, and two colours that were different stay different;
  - stray strokes are removed: an unfilled path whose ink lies mostly outside the silhouette mask (the union of filled shapes), or any shape under 0.2% of the ink area that touches nothing.
- Tests: fixtures with gradients, thin outlines, off-palette fills, stray strokes; Pip's and Bingo's real drawings (`__fixtures__/pip.svg`, `bingo.svg`) must come out unchanged in shape.

### A3. A stronger artist, chosen by a bake-off
- New tasks, so each can use its own model:
  - `cast_draw` for characters and things;
  - `set_paint` for places;
  - `scene_draw` stays for explainer drawings.
- Each gets an env override (`AI_MODEL_CAST_DRAW`, `AI_MODEL_SET_PAINT`) and a default in `TASK_DEFAULT` (`models.ts:103`).
- The bench runs each candidate model on all fixtures: `deepseek:deepseek-flash` (today), `openai:gpt-4.1-mini`, `openai:gpt-4.1`, and a Gemini model through the Google provider, which is already in `PROVIDERS` and has a key. The default becomes the model with the best score per cent spent.
- `PER_MILLION` (`src/business/domain/cost.ts:13-33`) gets the Gemini (and Anthropic, if a key is added) prices, so the ledger keeps counting.
- Memory note: gpt-4.1 is ruled out for the *writer*, not for drawing; the bench decides.

### A4. See and fix
In each drawing loop (`drawSheet` `:2824-2882`, `drawOwnOne` `:2620-2662`, `paintSet` `:2733-2757`):
1. After the gate, polish and measure, render the drawing with its neutral face to a PNG (`rasterise`, `scene-raster.ts:233`).
2. Ask `drawingJudge` for a verdict against the scorecard. For a redraw, also send the old drawing's PNG and the maker's words.
3. When the verdict fails, the artist is asked to revise **its own drawing**. A new `previous` field on `sceneDrawing`, next to `reference`, carries the SVG, and the judge's problems go in as notes ("the legs stand in a row: draw her side-on, front legs apart from the back legs").
4. At most 2 revisions; the best by (judge score, then code faults) is kept.
5. Each call is recorded with `record()` (`scene.processor.ts:3438`) under a new `drawing_judge` task.

### A5. Several drawings at once, the best kept
- The first drawing of a character is made **three times in parallel**, each with a different framing hint ("side view", "three-quarter view", "as a picture-book illustrator would") and a temperature of 0.8. Each goes through the gate, polish, measure and judge.
- The best is used, or all three are offered to choose from in Phase E. Sets and things: two in parallel, the best kept.

### A6. Redraws that really change, and stay the same character
- The judge answers two more questions on a redraw: "is the asked change visible?" and "is it still the same character?". A redraw that fails either is sent back once with the reason.
- The copy check (`drawnAlike ≥ 0.8`) stays.

### A7. Small fixes found on the way
- `scripts/studio-remake.ts` and `studio-recompose.ts` pass the gesture list, as the worker does (`studio.processor.ts:1569`), so artist characters wave in remakes too.
- `studio:redraw` writes a PNG with one face and the code face, not all seven faces at once (`scripts/studio-redraw.ts:91-95`).
- The log line "drawn for the whole book" stops appearing for a candidate.

**Done when:** the bench median is up; 100% of model-made drawings pass the style checks (ink, line width, flat fills); no gradients anywhere; the redraw fixtures show the asked change.

---

## 5. Phase B: the animal kit, drawn by code (3–4 days)

The biggest step. Animals are drawn the way people are: by code, from a small description the writer fills in.

### B1. The description: `AnimalSpec`
New module `src/business/domain/scene-animal.ts`:

```ts
interface AnimalSpec {
  species: AnimalSpecies;          // 'dog' | 'cat' | 'horse' | 'donkey' | 'cow' | 'goat' | 'sheep' | 'pig' | 'lion' | 'tiger'
                                   // | 'bear' | 'elephant' | 'giraffe' | 'zebra' | 'fox' | 'wolf' | 'deer' | 'rabbit' | 'mouse'
                                   // | 'chicken' | 'duck' | 'goose' | 'owl' | 'parrot' | 'eagle' | 'pigeon'
                                   // | 'fish' | 'snake' | 'lizard' | 'crocodile' | 'turtle' | 'frog' | 'monkey'
  build: 'slim' | 'average' | 'stout';
  size: 'small' | 'medium' | 'large';   // within the species (a puppy, a dog, a big dog)
  coat: AnimalColour;               // from an animal palette: brown, tan, cream, white, black, grey, ginger, golden, spotted…
  second: AnimalColour | null;      // belly, muzzle, socks, patches
  pattern: 'plain' | 'patches' | 'spots' | 'stripes' | 'socks' | 'blaze' | 'belly';
  ears: 'floppy' | 'pointed' | 'round' | 'long' | null;     // null: the species' own
  tail: 'short' | 'long' | 'bushy' | 'curly' | 'tufted' | 'none' | null;
  mane: 'none' | 'short' | 'long' | null;
  horns: 'none' | 'small' | 'curled' | 'antlers' | null;
  wear: { neck?: AnimalWear; back?: AnimalWear; head?: AnimalWear; feet?: AnimalWear };
                                    // neck: collar, bow, scarf, bell; back: saddle blanket, saddle, cape; head: hat, crown, flower
  wearColour: AnimalColour | null;
}
```

- Parsed and cleaned like `figureOf` (`scene-figure.ts:379`): every field has a plain fallback, and unknown words map through a synonym table like `SAME` (`:293`).
- `describeAnimal()` gives the words shown on the card and given to the writer.

### B2. Body plans
Each species is a preset over one of six **body plans**. Each plan is drawn from a few shapes with known joints: body, neck, head, ears, legs as upper and lower parts with a hoof, paw or claw, and a tail.

| Plan | Species | Legs |
|---|---|---|
| quadruped | dog, cat, horse, donkey, cow, goat, sheep, pig, lion, tiger, bear, elephant, giraffe, zebra, fox, wolf, deer, mouse | 4 (near pair in front, far pair behind, darker) |
| hopper | rabbit, frog | 2 big back, 2 small front |
| bird | chicken, duck, goose, owl, parrot, eagle, pigeon | 2, with wings folded or open |
| fish | fish | none (fins) |
| long | snake, lizard, crocodile | none, or 4 short |
| climber | monkey (and a standing bear) | 2 + 2 arms |

- **Proportions** per species, in kit units, so animals stand at the right size next to people drawn by the kit: a dog about 0.45 of an adult's height, a horse about 1.1 at the head, a chicken about 0.2. This replaces `SIZE_UNITS` guessing for kit animals.
- **View:** three-quarter side view facing right; the kit's `--flip` turns it the other way. The head turns a little toward the camera (`--turn`), so the kit's eyes read.
- **Line and ink:** the kit's `FIGURE_INK` and `LINE` (2.6), and the same `inked`/`flat`/`shade` helpers (`scene-figure.ts:593-600`). Those helpers become exported from a small shared module, `scene-ink.ts`. People's markup must stay byte-identical: the sha256 lock `scene-figure.spec.ts:606-716` must pass unchanged.

### B3. Face, mouth and feelings
- **Eyes and brows:** the kit's own `faceOf` (`scene-figure.ts:783`), parametric on a rig-like `{eyes, mouthY, cy}`, is given each species' eye points on the head. Expressions (`FACES`, `:668`) come from brows, lids and the resting mouth; blinking uses `blinkOf` (`:855`).
- **Mouths that talk:**
  - Muzzles use the kit's lip-sync shapes (`mouthShapes`, `:838`, six shapes) scaled with `k`, placed at the muzzle's mouth point.
  - **Beaks** get their own two-part beak with six openings, the lower beak turning about its hinge. This fixes the duck's mouth-beside-the-beak.
  - Fish get an "o" mouth.
- **Signs:** `signsOver` (`:1143`) at the head point, as artist animals already use.

### B4. Parts, joints and motion
- The drawing uses the **same group classes the artist rig already emits**:
  - `rig-head`, `rig-tail`, `rig-ear`, `rig-legs`;
  - `rig-leg-a` and `rig-leg-b` for alternate legs;
  - `rig-breathe`, and `rig-flap` for wings.
- Pivots are written exactly by code (`transform-box: view-box`), with no mask measuring.
- The drawing sets the same DTO fields an artist animal sets: `mouth`, `neck`, `dip`, `sinks`, `faces`, `lips`, `limbs`, `onePiece`, `units` (`contracts/index.ts:1004-1076`; `scene-compose.ts:336-350`). The client's artist path then plays it with no change:
  - `pose` (`stage.ts:1439`), and `actBody`'s animal moves: wag, lick, chew, sniff, dig, roll, shake off, bark (`timeline.ts:1198`);
  - mouth-carry and tongue (`motion.ts:1321`).
- It stays **`rig: false`** on purpose. On the client, `rig: true` switches to the people path, where `--low` and `--nod` mean different things (`stage.ts:1397` against `:1439`).
- **Gaits:** walking swings `rig-leg-a` and `rig-leg-b` in opposite phase under `.on-walking`; a run doubles the rate and adds a bound. Birds hop or waddle, fish swim, snakes wave.
- **Poses:** stand, sit, lie and curled up are drawn as state groups (`pose-stand`, `pose-sit`, `pose-lie`) switched like faces. The stage already sends `lie`/`sit` effects for animals (`studio-stage.ts:1178`, `:1204`).
- **Held things:** the bite point is the mouth point (`ScenePropDto.bite`, `contracts:1341-1356`).

### B5. Where it plugs in
- **Bible:** `StudioCharacter` (`studio/studio.ts:254`) gains `animal?: AnimalSpec`. The cast writer's schema (`ai-sdk/studio-schemas.ts:137-155`) gets a lenient `animal` object, like `lenientFigure` (`:121`).
  - The prompt (`studio-prompts.ts:206-229`) tells the writer: an animal whose species the kit has is described with `animal`, never drawn freehand; anything else keeps the `look` words.
- **Who draws it:** `drawnByArtist` (`studio/studio-drawings.ts:61`) becomes: a non-person with no `animal` or `creature` spec.
- **Drawing it:**
  - `drawCharacter` (`scene.processor.ts:2256`) and `sheetFor` (`:2108`) draw kit animals with `drawAnimal(spec, seed)`: no model, no cost, cached like people's previews.
  - `studio-looks.ts` gets `animalPreview` beside `figurePreview` (`:13`).
  - `StudioCastService.drawings()` (`studio-cast.service.ts:100`) draws them like people.
- **Book pages (Visualize):** the story reader's cast (`scene-story.ts`) may use the kit for known species too. It is kept off at first behind a flag, so books are unchanged until Richard wants it.

### B6. The look editor for animals
- `cast-view.tsx` `CharacterEditor` (`:457`) gets an animal section beside the person pickers (`:525-620`): species, coat and second colour as swatches, pattern, ears, tail, mane, horns, and what it wears (neck, back, head) with a colour.
- Every change saves the bible (`PATCH /studio/shows/:id/bible`) and the card shows the new drawing at once, as for people.
- `src/lib/studio/kit.ts` mirrors the animal lists. It also gets the missing `'bare feet'` extra.
- A **redraw request for a kit animal** ("give her a red saddle blanket") goes to the cast writer as a change to the spec (`wear.back = 'saddle blanket'`, `wearColour = 'red'`). The result is shown as the new candidate at once, still with Use / Try again / Keep, so the approve flow is the same for every kind of character.

### B7. Tests and proof
- **Every species:**
  - draws, passes the gate, and has joints and the mouth point;
  - flips;
  - every pose and every face draws;
  - it stays under a size budget (like people's 16 KB);
  - it stays joined at every swing (`holdsTogether` on the drawing).
- **People are unchanged:** the byte lock at `scene-figure.spec.ts:606-716` passes.
- **Contact sheet:** `figures:sheet -- --animals` adds every species × pose × face, plus a line-up next to people at kit scale.
- **Bench:** every animal fixture passes; the vision judge names each species.
- **Showcase:** Pip, Bingo, Zuri and Clover are redrawn through the approve flow, and the Maya and Kofi films are remade.

---

## 6. Phase C: the creature kit (1½–2 days)

For characters that are not animals the kit knows: Humpty and Eggbert, snowmen, robots, ghosts, dragons, monsters, talking objects.

### C1. `CreatureSpec`
New module `src/business/domain/scene-creature.ts`:

```ts
interface CreatureSpec {
  body: 'egg' | 'pear' | 'ball' | 'bean' | 'box' | 'cone' | 'cloud' | 'flame' | 'star' | 'column' | 'drop';
  bodyColour: CreatureColour;
  texture: 'none' | 'crack' | 'scales' | 'spots' | 'stripes' | 'rivets' | 'fur' | 'patches';
  textureColour: CreatureColour | null;
  eyes: 1 | 2 | 3;
  top: 'none' | 'tuft' | 'horns' | 'antennae' | 'ears' | 'crown' | 'halo' | 'hat' | 'flame';
  arms: 'none' | 'stick' | 'kit' | 'tentacles' | 'wings';
  legs: 'none' | 'stick' | 'kit' | 'feet' | 'tail';
  wings: 'none' | 'feathered' | 'bat' | 'insect';
  tail: 'none' | 'short' | 'long' | 'spiked';
  wear: { neck?: 'bow tie' | 'scarf' | 'collar'; body?: 'belt' | 'cape' | 'waistcoat'; face?: 'glasses' | 'monocle' };
  wearColour: CreatureColour | null;
}
```

- **Face placement is fixed by code:** the kit face sits in the upper third of the body at a size set by the body's width. Eggbert's face can no longer shrink into a small oval on his belly.
- **Arms and legs:** 'kit' uses the people kit's arm and leg shapes (two-bone arms with mitten hands; legs with feet) at the body's shoulder and hip points. 'stick' draws thin kit-line limbs with round hands. Both come with joints, so the gestures (`--ar/--al`, `gestureCss` in `scene-sheet-rig.ts:1738`) work.
- **One-piece bodies with no arms** squash, stretch, lean and hop (`asOnePiece`, `motion.ts:199`).
- **Textures** are drawn by code: a crack is a proper jagged line with a darker inner edge, clipped to the body, never a scribble.
- **Mouth:** the kit's lip-sync shapes at the face's mouth point.

### C2. Where it plugs in
- The bible gains `creature?: CreatureSpec`. The writer maps a creature to it when it fits; the prompt lists the bodies and features.
- A creature that does not fit (a mermaid, a centaur, something truly odd) keeps the `look` words and goes to the improved model path from Phase A.
- An angel is a person with wings, which the kit already draws (`backOf`, `scene-figure.ts:1780`). The writer is told so.
- Look editor: a creature section like the animal one.

### C3. Proof
Humpty is redrawn and his film remade; Eggbert is redrawn; the bench's creature fixtures pass; a contact sheet goes to Richard.

---

## 7. Phase D: places and things (2–3 days)

### D1. Places built from a layout
- New module `src/business/domain/scene-set-layout.ts`. The painter model writes a **layout** (JSON), not SVG:
  - sky (by time and weather);
  - ground (grass, sand, road, dirt, a wooden, tiled or carpet floor);
  - a backdrop band (hills, trees, sea, a city skyline, the walls of a room, the inside of a bus with its windows and an outside strip);
  - placed items: each has a kind from a growing list of code-drawn pieces, an x share, a depth row and a scale.
- The pieces extend `drawPiece` (`scene-set-pieces.ts:143`), which already draws gates, doors, windows, benches, chairs, sofas, beds, steps, goalposts, crates, fences, walls, trees, vehicles and swings in the kit's line. New pieces: tables, shelves, bookshelves, whiteboards, wardrobes, rugs, lamps, curtains, stalls and carts, houses and huts, a well, the rows of seats in a bus, hills and bushes.
- Code draws the whole set at 1600×900 (`SET_CANVAS`, `scene-story.ts:476`). The `ground`, `props`, `front`, `outside` and `f-<id>` groups are exact, so `measureGround` can read them directly. A vessel interior comes from a template: a bus is seats, windows showing the road, and a door.
- Anything the list lacks is drawn once by the model as a show-owned feature (`ownFeatureBrief`, `scene-story.ts:1811`, through Phase A's improved path) and placed like a piece.
- **Existing sets are kept.** `studio:repaint` offers the new version.

### D2. Things
- Built-in things (`drawProp`, `scene-props.ts`) stay code-drawn. Show-owned things (`ownThingBrief`) go through Phase A's style, polish and judge.
- **Clothes at rest:** a wearable thing gets a second, code-drawn look for when it is not worn and not held: folded on a surface, or on a hanger by a wall or wardrobe, in the thing's own colours. The stage uses it whenever the thing is at rest (`behind` things in `motion.ts`). This fixes the standing uniform.

---

## 8. Phase E: choosing, and learning from mistakes (1 day)

- **Three options:**
  - `CastWork.candidates` becomes a list per character (`studio/studio-drawings.ts:24`), up to 3 with ids.
  - The DTO gets `candidates: []` (`contracts.ts:2132-2134`).
  - The Cast card shows the three side by side, with Use this one under each, plus Try again and Keep the old one.
  - Try again makes three new options.
  - Kit characters show their one new version, since it is instant.
- **Choosing in chat:** the producer can choose ("use the second one"), through a new `choose` action beside `redraw`.
- **Thumbs down:**
  - Every drawing on a card gets a "Not right" option in its menu, with an optional note.
  - The drawing, its brief and the note are stored in a failures folder (`storage/drawing-bench/failures/`) and logged.
  - `drawing:bench --from-failures` turns them into new fixtures, so each one is fixed for good.

---

## 9. Rollout and old shows

- **New shows** use the kits automatically; the model draws only what the kits cannot.
- **Old shows keep their drawings.** Redrawing a character (asked in chat, or with the card's Redraw) now offers a kit version when the species or body fits, through the same approve flow.
- `studio:upgrade-cast -- <showId>` proposes kit versions for a whole show as candidates. Nothing switches on its own.
- **Versions:** `SHEET_VERSION` is not bumped; old sheets are never redrawn behind anyone's back. New fields are optional in both contract files.
- **Deploy:** no migration. New env vars are optional (`AI_MODEL_CAST_DRAW`, `AI_MODEL_SET_PAINT`, `AI_MODEL_DRAWING_JUDGE`), each with a default. The worker deploys with the API as before.

---

## 10. Costs

| Drawing | Before | After |
|---|---|---|
| Kit person | none (code) | none |
| Kit animal or creature | one model call (DeepSeek, fractions of a cent) | **none** (code) |
| Anything else model-drawn | 1–2 cheap calls | 3 drawings in parallel, up to 2 revisions each, plus a vision judge per drawing |

The bench measures the real cost per drawing for each candidate model before the default is chosen. It is paid once per character, thing or place per show, since drawings are kept.

---

## 11. Order, time and "done when"

| # | Phase | Time | Done when |
|---|---|---|---|
| 0 | Drawing bench | ½ day | The bench runs, the baseline is stored, and the contact sheet goes to Richard. |
| A | One style, polish, stronger artist, see-and-fix, best of three, redraw checks | 1½–2 days | Bench median up; 100% pass the style checks; the redraw fixtures show the asked change. |
| B | Animal kit and animal look editor | 3–4 days | Every species passes; the judge names each; Richard approves the contact sheet; Pip, Bingo, Zuri and Clover are redrawn. |
| C | Creature kit | 1½–2 days | Humpty and Eggbert are redrawn and approved; the creature fixtures pass. |
| D | Places from layouts; clothes at rest | 2–3 days | The place fixtures pass; the bus reads as a bus inside; no stray strokes; the uniform folds. |
| E | Three options, choosing in chat, thumbs down | 1 day | Three options on the card; "use the second one" works; failures become fixtures. |

**In all, about 10–13 days of building.** Every phase ends with:
- all tests and the builds passing in both repos;
- the bench against the last run;
- a contact sheet and stills sent to Richard;
- a push to the `studio` PRs.

---

## 12. Risks

| Risk | What we do |
|---|---|
| Kit animals look too alike | Species presets, builds, colours, patterns, ears, tails, and what they wear give plenty of variety; the bench's human check watches for sameness. |
| The vision judge is wrong sometimes | Its thresholds are set on the bench against Richard's marks; code checks carry what code can see; the maker still approves. |
| A stronger model costs more and is slower | Only the drawings the kits cannot do use it, drawn once per show; three drawings are made in parallel, not in turn. |
| Changing shared kit helpers changes people's drawings | The byte lock on people's markup must pass unchanged. |
| The client treats kit animals like people | They stay on the artist path (`rig: false`) with the same DTO fields, so `--low` and `--nod` keep their meanings. |
| Old shows change without warning | Nothing is redrawn without the maker choosing it. |

---

## 13. Decisions for Richard

1. **Kit first?** Recommended, since it matches the figure-kit look.
2. **The drawing model:** allow a stronger (costlier) model for what the kits cannot draw, chosen by the bench?
3. **Species first:** the list in B1 (pets, farm, common wild, common birds).
4. **Three options per new drawn character**, or one?
5. **Books too?** Should Visualize's story pages use the animal kit for known species, or stay as they are for now?

---

## 14. Status

- [ ] Phase 0: drawing bench
- [ ] Phase A: style, polish, model bake-off, see-and-fix, best of three, redraw checks
- [ ] Phase B: animal kit and look editor
- [ ] Phase C: creature kit
- [ ] Phase D: places from layouts; clothes at rest
- [ ] Phase E: three options, choosing in chat, thumbs down

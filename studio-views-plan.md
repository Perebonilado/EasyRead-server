# Views and camera angles: characters that turn, a camera that moves around the room

A technical plan, 2026-09-29. It follows `studio-world-plan.md` (physics) and `studio-scenery-plan.md` (layered scenery, L1–L4).

Goal, from Richard's South Park kitchen example:

- **Characters seen from more than the front.** Three-quarter, profile and back views, chosen by what they're doing and where the camera is.
- **Dynamic camera angles.** Over-the-shoulder shots, reverse shots, deep staging (one person near and big, others behind), and rooms seen from an angle, with the table running diagonally and the floor in two-point perspective.

The key: **South Park is flat 2D, but every shot is drawn for its angle.** Our characters and places are drawn by code from a description (a figure spec, a set layout). So code can draw them from another angle too. That is the core of this plan. Nothing here needs a 3D engine, and everything stays SVG, so stills, the picture check and the physics keep working.

---

## 0. What exists today

| Part | Views today |
|---|---|
| People (figure kit, `scene-figure.ts`) | Front only. `--flip` mirrors; `turn` shifts the face a few units (`.fm translateX(turn·7px)`) as a hint of turning. |
| Animals (animal kit) | Side view only (6 body plans), mirrored to face left or right. The head can dip; there's no front or back. |
| Creatures (creature kit) | Front only. |
| Artist-drawn characters | One drawing, one view, mirrored by `faces: ±1`. |
| Places (`buildSet`, L1–L3) | Front-on only. Pieces are front-view SVG; rooms have back and side walls drawn for a front camera. |
| Camera (L4, in progress) | Pans, tracks, pushes and rises across a front-on layered set. Every shot is from the front. |

---

## 1. Character views ("turnarounds")

### 1.1 The views

Each character gets up to five views; mirroring gives eight directions:

| View | Used when |
|---|---|
| `front` | Facing the camera: talking to the audience, reacting, the default |
| `three-quarter` | Turned toward someone beside them: most conversation |
| `profile` | Walking across, face to face close up, pointing, leaning in |
| `back-three-quarter` | Seen past the shoulder in an over-the-shoulder shot; turning away |
| `back` | Walking away into the set, looking at something far off, in a reverse shot |

### 1.2 How views are drawn (figure kit, rig 3)

The figure kit draws all views in one SVG as **view groups** (`<g id="view-front">`, `view-3q`, `view-profile`, `view-back3q`, `view-back`). Each group has the same rig structure: head, torso, arms, legs, dangles, faces and mouths. The player shows one at a time, as it does with faces today. This keeps one shadow root, one set of CSS variables and one spring bank per character.

How each part changes per view (all drawn by code from the same `FigureSpec`):

- **Head:**
  - The circle stays a circle.
  - **Face features slide toward the facing side and foreshorten.** In three-quarter, eyes move 35% toward the facing side and the far eye narrows to 70%. In profile there's one eye at the edge, a small nose bump and the mouth at the edge.
  - Ears appear and disappear by view.
- **Hair:** each of the 13 hair styles gets three new drawings (three-quarter, profile, back). This is the largest single piece of drawing work: about 39 hair drawings. Headwear follows the same rule.
- **Mouths:** the six talking shapes are redrawn for three-quarter (narrower) and profile (half-mouth at the edge). Back views have no mouth; lip-sync hides.
- **Torso and clothes:** the trapezoid narrows to 70% in profile. Front details (buttons, collar, prints) slide toward the facing side, and are hidden in back views. Back views show a back collar, hair over the neck and any backpack.
- **Arms and legs:** in profile, the far arm and far leg draw behind the body and the near ones in front. The walk cycle's planted-feet solver (`stride.ts`) already works in 2D and applies unchanged.
- **Dangles** (rig 2): each view carries its own dangle roots. A cape seen from behind is the full cape; in profile it's a side sliver.

**Byte lock:** rig 1 and rig 2 output stay identical. Views are drawn only for `rig: 3`, which new scenes use. The same hashing test protects old drawings.

### 1.3 Turning between views

- **A turn is a swap, as in 2D cartoons:** 2–3 in-between drawings aren't needed. A quick squash (0.04), a 60 ms swap, and the new view settles on the springs.
- Face-to-face turns go front → three-quarter → profile over about 180 ms, one view per 60 ms.
- Dangles and hair swing on the turn automatically, since the root rotates.
- Turns emit a small `turn` world event, so a cape swish or shoe scuff sound can follow.

### 1.4 Animals, creatures and artist-drawn characters

- **Animal kit:** add `front`, `three-quarter` (head turned toward the camera over a side body, the most useful one) and `back` for the six body plans. Priority: the head turn first (cheap and expressive), then back, then front.
- **Creature kit:** simple bodies, so profile and back are easy (a ball from the side is still a ball). Eyes and mouths move and foreshorten as for people.
- **Artist-drawn characters:**
  - The artist is asked for a **turnaround sheet**: front, three-quarter, profile and back in one drawing, each view in its own group. The house-style prompt and polish are reused.
  - The drawing judge checks that the views are the same character (a new "same across views" score).
  - If the turnaround fails the judge, they keep one view and mirroring, as today. The stager then avoids shots that need other views of them.

---

## 2. Which view, when: the stager's facing rules

The stager already knows who talks to whom, where everyone stands (x, depth d), who walks where, and what they look at (`acting.look`). A new pure function, `viewAt(character, t, camera)`, picks the view in two steps:

1. **World facing:** a direction on the floor, as an angle, from what they're doing:
   - talking or listening: toward that person;
   - walking: along the walk;
   - looking at a feature: toward it;
   - narration or reaction to the audience: toward the camera;
   - at rest: toward the scene's focal point.
2. **Relative to the camera:** subtract the camera's direction (its yaw, §3) and pick the nearest view:
   - within ±22°: front;
   - ±22–67°: three-quarter;
   - ±67–112°: profile;
   - ±112–157°: back-three-quarter;
   - beyond: back.
   - The sign picks the mirror.

**Rules on top:**
- **Speakers:** in a front-on shot, a speaker never shows their back while talking; they turn at least to three-quarter.
- **Hysteresis:** a character doesn't flip views for a glance under 400 ms.
- **The 180° rule** (§3.3) keeps who-faces-where consistent across cuts.

This one function makes characters turn to each other in conversation, walk in profile and walk away in back view, even with today's front-on camera.

---

## 3. Camera angles

### 3.1 The shot vocabulary

| Shot | What it is | How we draw it |
|---|---|---|
| Master | The room from the front, everyone | Today's set, L1–L4 |
| Over-the-shoulder (OTS) | Past A's shoulder (back-three-quarter, big, cropped, soft) onto B facing us | A at depth d > 1 (in front of the floor), B in three-quarter; the same set, framed tighter |
| Reverse | The same conversation from the other side | The reverse side of the set (§4.2); everyone's view flips |
| Profile two-shot | Two people face to face, both in profile | The set from the front or an angle; both in profile |
| Deep staging (your example) | One person near and big, others behind at a table | Near person at d 1.1–1.3, partly off frame; others at their places behind the table (the table's front covers their legs, as L2 already does) |
| Angled | The room seen from 30–45° off front, the floor and table diagonal | The angled set (§4.3) |
| Low / high | Hero moments, looking down on someone small | A modest horizon shift and camera height change on the angled set; a cheat on flat sets (§4.4) |

### 3.2 Who picks the shots

- **The writer** keeps `wide`, `close` and `two`, and gains `ots`, `reverse`, `profile`, `low` and `high` as optional hints.
- **Code picks most shots** by rules in the composer:
  - dialogue longer than 3 lines alternates OTS and reverse;
  - an emotional line gets a close;
  - a big action move gets a low angle or the wide;
  - a scene opens on the master;
  - entrances use the angle that shows the door.
- Cut rules (`CUT_SCALE`, `CUT_CENTRE`, `SHOT_LEAST_MS`) stay.

### 3.3 The 180° rule

- For a conversation, the line between the two speakers sets which side the camera stays on. All shots of that exchange come from one side, so A always looks right and B always looks left.
- Crossing the line is allowed only with a wide shot in between, or when someone walks across it on screen.
- The composer enforces this. A test catches a cut that flips a speaker's screen direction.

---

## 4. Places from more than one angle

### 4.1 Why code can do it

Our places are built by code from a layout (`SetLayout`: rows, items, walls or vessel, style pack). The same layout can be drawn from another direction. That needs two things:

1. **A floor plan.** Each item needs a position in depth (z) as well as x. We have it: rows map to depth bands (`rowFeet`), and features and actors already have `d`. `layoutOf` turns rows into z values with a little seeded jitter.
2. **Pieces that can be drawn from other angles.** See §4.3.

### 4.2 Step 1: the reverse side (shot/reverse-shot)

For the shot-and-reverse-shot that most dialogue needs, a place needs its **other side**: what's behind the camera in the master.

- **Rooms:** the painter adds a `reverse` row naming what's on the fourth wall: door, window, shelves, a painting. The reverse set is that wall plus the same floor and the same floor items, drawn from behind. Symmetric items (tables, chairs, beds seen end-on, stalls) are drawn from their back; artist cutouts are mirrored.
- **Outdoors:** the reverse is the other side of the street or clearing. The painter names it in a `reverse` row, and the style pack fills it with buildings made from parts. The backdrop is picked from the pack (for example, the far side of the market).
- Characters flip views automatically (§2), since the camera now looks the other way.

This is about a day's work and unlocks OTS and reverse shots in every room.

### 4.3 Step 2: angled sets (the diagonal table)

To see a room from 30–45° off front (your kitchen example), code draws the set in **two-point perspective**, still as flat SVG:

- **Box world:** rooms and the furniture people use are boxes: walls, floor, table, counter, bed, bench, shelves, cabinets, wardrobe, stall, crate. Each box is projected to polygons for the camera's angle (yaw −45…45°, eye height from the pack), with flat fills and the house ink line. Walls get their windows, doors, pictures and cabinets as quads on the wall plane.
- **Outdoors:**
  - buildings (made from parts, L3) become boxes with their facade parts on the faces;
  - the ground is a plane with its texture marks projected;
  - trees, plants, lamps and clutter stay upright cutouts facing the camera (billboards). That's what cartoons do for round things.
- **Ink and style:** every projected face gets the same ink width and palette as the front-on set. Shading stays flat, with one darker tone on side faces, as in your example (the cabinets' side panels).
- **Characters** stand at their floor positions projected through the same camera, with their view from §2. Their size comes from the projected depth, so the pinhole scale used today generalises.
- **What limits it:** only these few box shapes need a 3D description. We don't need true 3D for the round, irregular things, which stay cutouts. The camera stays at eye height ±15° pitch, so the cutouts never show their flatness.
- **Stills and picture check:** the output is SVG, so resvg renders it and Gemini can judge it, exactly as now.

### 4.4 Low and high angles

- **On angled sets:** a real camera height change (low: 0.6 m looking slightly up; high: 2.5 m looking down) through the box projector.
- **On flat sets:** a cheat. The horizon moves down or up 8% and people scale a little, which reads well enough for a hero moment.

---

## 5. Where the work lands

**Server:**
- `scene-figure.ts`: rig 3 views, byte-locked below rig 3.
- Animal and creature kits: views.
- `scene-artist.ts`: the turnaround prompt, polish per view group, a "same across views" judge score.
- `studio-stage.ts`: facing and the view per beat, depth for OTS.
- `scene-compose.ts`: shot choice, the 180° rule.
- `scene-set-layout.ts`: a floor plan with z, `reverse` rows.
- A new `scene-set-angle.ts`: the box projector.
- The painter prompt: `reverse`.

**Contracts:**
- `SceneThingDto.views?` lists the view group ids.
- `acting.view: [atMs, view, mirror][]` gives the view timeline, the same shape as `look`.
- `stagings` gain `angles: {id, yaw, pitch, set: layers}`.
- Shots name their `angle`.

**Client:**
- `stage.ts`: switch view groups like faces; mount the angle's set layers when a shot uses it; project characters with the shot's camera.
- `timeline.ts`: the view timeline and shots with angles.
- The camera (L4) treats an angle change as a cut, never a move.

**Benches:**
- `/dev/motion` gains a view wheel: a character turning through all eight directions, each view posed.
- `set:bench` renders each test place from front, angled left, angled right and reverse.

---

## 6. Order of work

| Phase | What you'll see | Rough time for me | Gate |
|---|---|---|---|
| **V1 Views for people** | People turn to each other in three-quarter, walk in profile, walk away in back view; turns with a squash and a swish | 1–2 days code, plus a round of your review on the hair and face views | A contact sheet of 12 people × 5 views |
| **V2 Shot grammar on today's sets** | Over-the-shoulder shots, deep staging like your example, profile two-shots, the 180° rule | about a day | Maya remade: her conversations cut between over-the-shoulder shots and the master |
| **V3 Reverse side** | Real shot/reverse-shot: the other wall of the room, the other side of the street | about a day | 12 bench places with a reverse |
| **V4 Angled sets** | Rooms and streets from 30–45° off front: diagonal tables, two-point floors, low and high angles | 3–5 days (the box projector and every box-shaped piece) | Your kitchen example reproduced as a test scene |
| **V5 Animals, creatures, artist turnarounds** | A dog's head turning to camera, creatures from the side and back, artist-drawn characters with turnarounds | 2–3 days | Pip turns his head to Maya |

- V1 and V2 give the biggest jump for the least work, and don't touch the places.
- V4 is the big one, and the one that makes shots look like your example.
- It all builds on L4's camera, which is being finished now.

---

## 7. Risks

- **Drawing quality of the new views.** Hair and faces in three-quarter and profile are the hard part of any turnaround. They'll need a review round with you. Reference cartoons help most here: how a head reads from the side is a style choice.
- **Artist-drawn characters** may not hold together across views. The judge decides, and a failure keeps them front-facing.
- **Box-world look.** Projected boxes must look drawn, not 3D-rendered: flat fills, one ink weight, no gradients, slightly irregular lines if needed. The set bench shows each angle before anything ships.
- **Too many cuts.** The composer caps shot changes (at least 1.2 s per shot today). Dialogue alternation only kicks in for real conversations.
- **Continuity across angles.** The same props must be in the same places from every angle. The floor plan is the single source, and the picture check can compare angles.
- **Old films** stay front-on until remade.

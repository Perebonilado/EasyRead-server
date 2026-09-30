# Interactions: characters using the world

A technical plan, 2026-09-29. It follows the physics plan (`studio-world-plan.md`), layered scenery (`studio-scenery-plan.md`) and views (`studio-views-plan.md`).

Goal, in Richard's words: *"a character walking through a door or a character driving a car or riding a bicycle. Being able to interact with the environment would create richer animations."*

---

## 0. What exists today

| Piece | What works | What's missing |
|---|---|---|
| **Features** (`scene-set-pieces.ts`) | gate, door, window, bench, chair, sofa, bed, table, steps, tree, wall, fence, stall, crate, well, swing, goalpost, and vehicle (the danfo). Doors, gates and windows have a swinging leaf; the danfo has a sliding door. Seats have a height, beds have a lying line, walls, steps and trees have a perch. | Only the leaf moves. No handles, no inside/outside, no seats inside vehicles, no wheels that turn. |
| **Doings** (`scene-doings.ts`, 56 + the 9 action moves) | open, close, sit, lie-down, stand-up, climb, hide, squeeze, enter/leave `via` a feature, take/give/throw/use… | No go-through, knock, drive, ride, get in/out, push/pull, lean on, climb stairs, operate (switch, tap, phone). |
| **Going via a feature** (`going {via}`) | Someone walks to a door or the danfo's way and vanishes (`VANISH_MS` 260). | They don't pass *through*: nothing shows the threshold, the other side, or someone inside a vehicle. The grounding fix noted there is no "inside a vehicle" station. |
| **Props** (`ScenePropDto`) | Hand-held things with grip points, throws, bounces, rolls. | Big things (a cart, a bicycle) can't be ridden, pushed or held with two hands. |
| **Bodies** | Planted walks, arm IK to a point (`solveArm`), springs, views (front, 3q, profile, back), action moves. | No leg IK to pedals, no "attached to" something that moves, no seated poses tied to a moving object. |

---

## 1. The core idea: affordances + attachment + choreography

Three pieces, all code, no model doing geometry:

### 1.1 Affordances: what an object offers

Every interactive thing declares **interaction points**, in its own drawing's units, per view:

```ts
interface Affordances {
  handles?: { id: string; at: P; side: 'in' | 'out' }[];   // door knob, car door handle, drawer pull
  threshold?: { line: [P, P]; inside: 'behind' | 'next-set' }; // a doorway: where "in" begins
  seats?: { id: 'driver' | 'passenger' | 'rider' | 'pillion' | string; hip: P; feet: P[]; hands?: P[]; pose: SeatPose }[];
  grips?: { id: string; at: P }[];            // handlebars, steering wheel, cart handles, reins
  pedals?: { crank: P; radius: number };      // bicycle: feet follow the crank
  wheels?: { at: P; r: number }[];            // turn with distance travelled
  masks?: { id: 'body-front' | 'window' | 'frame-near'; group: string }[]; // what draws over a rider
  steps?: P[]; rungs?: P[];                   // stairs, ladders
  mount?: { side: -1 | 1; at: P };            // where you get on
}
```

- Doors, vehicles, bicycles, chairs and tables get these from code (they're drawn by code). The animal kit adds a `saddle` seat plus `reins` grips to horse, donkey and camel.
- Artist-drawn "own" things get a small affordance guess from their kind (a cart has two handles at the back), checked by the drawing judge. If that fails, they aren't interactive.

### 1.2 Attachment: riding along

A new stage state, **attached**: a character's position and pose come from something else.

```ts
attach: [atMs, who, thingId, seatId | null][]   // null = let go
```

While attached:
- **Position** = the thing's seat point, moving with the thing.
- **Pose** = the seat's pose, with two-bone IK:
  - hands to grips (steering wheel, handlebars, reins);
  - feet to pedals or footrests.
- **Legs on pedals** follow the crank angle, which comes from distance travelled, exactly like the planted-feet stride. So pedalling speed always matches the bike's speed.
- **Riding an animal** adds the animal's gait bob to the rider, with a spring lag so they bounce naturally.
- **Masks:** the thing's `body-front` or `frame-near` draws over the rider's lower half (a car door, a bike's near leg), and `window` shows them through glass.

### 1.3 Choreography: one phrase, many steps

The writer says one thing ("gets in the car and drives off"). Code expands it into a timed sequence, each step with a minimum and ideal time, like the action moves' phases:

| Interaction | Expanded steps |
|---|---|
| **Go through a door** | walk to the door → reach the handle → door opens (leaf swings, creak) → step through (the doorframe's near post masks them for 3 frames) → the other side: either behind the wall, or a cut to the next set with them entering → door swings shut behind (optional, slam or click) |
| **Knock** | walk to the door → knock ×2–3 (hand IK to the door, knock sound) → wait → door opens from inside |
| **Get in a car** | walk to the driver's door → open it (hinge) → sit and swing legs in (seat pose; the body front masks the legs) → door shuts → seen through the window |
| **Drive** | engine start (rumble, a small body shake) → pull away (ease in, wheels turning by distance, dust) → cross or leave the frame; the camera tracks → stop (ease out, a nose dip) |
| **Ride a bicycle** | walk the bike or stand by it → swing a leg over (mount pose) → push off → pedal (crank from distance, legs on pedals, body lean) → coast → brake → step down |
| **Ride a horse or donkey** | stand at its side → mount (up and over) → walk, trot or gallop (rider bob from gait) → dismount |
| **Push a cart** | grip the handles (two-hand IK) → lean in → push (the cart's wheels turn, the body leans, slower steps) → let go |
| **Sit at a table** | pull the chair out → sit → chair tucked in (the table front masks the legs) → stand → push the chair back |
| **Climb stairs or a ladder** | feet to each step or rung in turn (leg IK), body rising along the stairs, hands on the rail or rungs |
| **Lean on something** | lean on a wall or counter (a hip and hand contact point), relaxed pose |
| **Operate** | a switch (light on, the room brightens), a tap (water drips), a phone (held to the ear; exists partly), a door bell |

Each step emits world events (§1.5 of the physics plan): creak, slam, engine, bell, pedal click, hooves, splash. The sound engine plays them, and birds startle at a horn.

---

## 2. What needs to be built

### 2.1 Doors and thresholds (the most common)

- **Doorways get a threshold and a near post.** The door piece gains a `frame-near` mask group (the post nearer the camera). Walking through passes behind it for a moment, so someone genuinely goes *through*, not just vanishes.
- **Inside/outside:**
  - A doorway **in the scene's own set** (a house front on a street) leads "behind": the person disappears into the doorway's dark interior (a dark group behind the leaf).
  - A doorway **between two sets** (a room and the street outside) becomes a **film cut**: the next scene or shot opens with them coming in through the matching door on the other set. The two sets' doors are linked in the bible, so continuity holds (same door, other side).
- **Door behaviour:** the leaf swings with the existing spring (it already overshoots and settles). Hand IK reaches the handle on the opening frame. The door can stay open, be closed by the person (a reach back), or swing shut.
- **Views:** walking in shows the back view and walking out shows the front (this uses V1).

### 2.2 Furniture

- Chairs get `seats` plus a back; tables get a top height plus a `body-front` mask. That makes "sits at the table" show the legs hidden, like the kitchen example.
- Beds already have covers, sofas already have seats.
- New: stairs (steps as points), ladders (rungs), counters (lean points), cupboards and drawers (handles and doors), light switches and taps (small operate points).

### 2.3 A vehicle kit (drawn by code, like the animal kit)

- **Kinds:** bicycle, okada (motorbike), car, taxi, danfo, bus, truck, cart (hand-pushed and donkey-drawn), wheelbarrow, rowing boat, canoe, and a chariot for Bible and ancient stories.
- **Rig:**
  - **Body:** doors (hinge or slide), windows as masks, wheels that turn, a steering wheel or handlebars, seats, and pedals and crank (bicycle).
  - **Motion:** a body bob on the suspension, and lights (headlights at night).
  - **Views:** side (main), front, back and 3q, so vehicles work with the views plan's camera angles.
- **Colours and style from the style pack:** a Lagos danfo (yellow with black stripes), a New York cab, a donkey cart for Bible times.
- **The existing `vehicle` feature** (always the danfo) becomes one kind in this kit. "The ark is never a danfo" still holds; boats and arks stay separate.
- **Sizes and ground:** real sizes, wheels on the ground (the grounding check covers vehicles), and dust from the wheels on dirt.

### 2.4 Movement of things through the scene

- Vehicles, carts and ridden animals get their own **tracks**: `move: [atMs, thingId, from, to, ms, ease]`, played as a pure function of t, like walks.
- Wheels turn by distance. Riders are attached.
- The camera tracks a moving vehicle like a walker (L4). Leaving frame at speed gets a whoosh.
- **Across scenes:** "drives to the market" is a leave in one scene and an arrive in the next, with the vehicle entering the new set. The existing cut rules apply.

### 2.5 The writer and the mender

- **New doings:** `go-through`, `knock`, `get-in`, `get-out`, `drive`, `ride`, `mount`, `dismount`, `push`, `pull`, `lean-on`, `climb-stairs`, `switch-on`, `switch-off`, `turn-on-tap`, `ring-bell`, `honk`.
- **Each doing carries:**
  - `words`, e.g. "walks through the door", "hops on his bike", "drives off", "pedals", "gallops away", "pushes the cart", "leans on the counter", "switches on the light";
  - `fallback`, for when the thing isn't there;
  - `ms`, `leastMs` and `idealMs`;
  - `phases` from the choreography table.
- **The mender:**
  - maps words to these doings;
  - creates the thing when the words name it and the show doesn't have it: "rides a bicycle" adds a bicycle from the kit;
  - puts attachments in order: can't drive before getting in, can't ride off before mounting.
- **The writer's prompt** lists them, with "use them when the story moves people through places".
- **The stager:**
  - plans approach points (the handle side of a door, the mount side of a bike);
  - keeps the path clear;
  - keeps riders in clear view (the clear-view rule applies to attached characters too);
  - chooses shots: the camera tracks a moving vehicle; an interior shot through the windshield is a later option.

### 2.6 Checks

- **Audit:**
  - every step of a choreography played at no less than its minimum;
  - the hands were on the handle when the door opened;
  - the rider was attached while the thing moved;
  - the feet were on the pedals while pedalling;
  - nobody walked through a closed door.
- **Grounding:** wheels and hooves on the ground, and riders on their seats (not floating).
- **Picture check claims:** "Tobi is riding a bicycle", "Mama is inside the car, seen through the window", "the door is open". Gemini confirms from stills.

---

## 3. Where the work lands

- **Server:**
  - New: `scene-affordances.ts`, `scene-vehicles.ts` (the kit), `scene-interact.ts` (choreography).
  - Changed: `scene-set-pieces.ts` (door frames, handles, masks, seats), `scene-doings.ts` (new doings), `studio-check.ts` (the mender), `studio-stage.ts` and `scene-compose.ts` (approach points, attach and move timelines), `studio-audit.ts`, `scene-grounding.ts`, `scene-picture-check.ts`, and the writer prompt.
- **Contracts:**
  - `SceneActingDto.attach?`;
  - `SceneSettingDto.moves?` (tracks of things);
  - `SceneThingDto.affordances?`;
  - new `ScenePropDto` kinds for big handled things;
  - vehicle things with rigs.
- **Client:**
  - `interact.ts`: attachment, seat poses, IK to grips and pedals, masks;
  - `vehicles.ts`: wheels, doors, bob;
  - `stage.ts`: attached characters positioned from their thing, masks drawn over them;
  - world events and cues: creak, slam, engine, pedals, hooves, horn.
- **Benches:**
  - `/dev/motion` gets "interactions": a door, a car, a bike, a horse, a cart and stairs, with a scrubber;
  - `set:bench` gets vehicle kit sheets.

---

## 4. Order of work

| Phase | What you'll see | Rough time (my working time) |
|---|---|---|
| **I1 Doors** | People open doors, walk through (the frame passes in front), close them behind; knocking; a cut to the other side of the door in the next room | about a day |
| **I2 Furniture** | Sitting at a table with the chair pulled out and legs hidden, leaning on counters, climbing stairs and ladders, switching on lights | about a day |
| **I3 Vehicle kit** | Code-drawn bicycle, okada, car, taxi, danfo, bus, cart, wheelbarrow, boat and chariot in each style pack, with turning wheels and working doors | 2–3 days (drawing-heavy, with your review) |
| **I4 Riding and driving** | Getting in and out of cars, driving off with the camera tracking, pedalling a bike with feet on the pedals, riding a horse or donkey, pushing a cart, passengers seen through windows | about 2 days |
| **I5 Travel between scenes** | "drives to the market": leaving one place and arriving at the next in the vehicle | about a day |

- **Order:** I1 and I2 give the most everyday richness first. I3 and I4 are the "wow" (driving, cycling).
- **Dependencies:** this builds on V2 (running now), because shots and views decide how interactions are framed.

---

## 5. Risks

- **Drawing quality of vehicles** from several views: a review round with you, as with the people views.
- **Too much choreography slows stories.** Each interaction has a least time. The writer is told interactions cost time, and the outline length check still applies.
- **IK and pedal limbs look stiff.** They're tuned on the motion bench with springs on top, as the walks were.
- **Continuity across door cuts:** the two sides of a door are linked in the bible, and the picture check compares them.
- **Artist-drawn "own" things** may not get good affordances. A failure means they're simply not interactive.

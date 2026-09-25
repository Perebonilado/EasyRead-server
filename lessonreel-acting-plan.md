# LessonReel: the figure kit, acting like real animation

Richard (2026-09-26), looking at Matthew p53 (the Last Supper): he prefers our own drawing style (the figure kit: round heads, big eyes, flat robes, round hands) to the TED-Ed look. His main issue is that "the interactions and movement and gestures are limited… I really want to get this right. How can we do this so it feels like an actual animation."

So the look stays. What changes is everything under it.

## Why it feels stiff today

Mapped from the code (server `scene-figure.ts`, `scene-acting.ts`; client `timeline.ts`, `stage.ts`):

- **One pose per page.** The figure is drawn once per page in a fixed pose (standing, pointing, holding…). Acting only adds a few CSS rotations on top.
- **Arms only rotate.** The whole arm turns about the shoulder and the forearm about a fixed elbow. There is no IK, so a hand can't be put somewhere: "reach" swings the arm up by 72°, wherever the other person is. Hands are circles with no shape.
- **The head doesn't turn or tilt with intent.** The face slides 7 px sideways, and there's a small nod and tilt. The body never turns (`--flip` is never set).
- **Moves are fixed angles added together.** For example, `gesture` is shoulder −28°, forearm −42°, faded in and out. There's no anticipation, no overshoot, no follow-through, and the head, arm and hand all arrive at the same instant.
- **Faces switch rather than move.** Expressions are whole face groups cross-faded over 320 ms. The mouth switches between six drawn shapes, and blinks run on a CSS timer.
- **Nothing lives between moves.** The only idle motion is a 1.4 px breath and blinks. There are no eye darts, weight shifts, head drift or hair that lags.
- **Nothing can be touched or passed.** Props are drawn into the hand's pose and never picked up, put down or handed over.
- **Walking is a bob.** The legs hop in place; there's no stride.

## What the test showed (Matthew p53, 7.9 s)

`~/Downloads/lessonreel-acting-test.html` plays three lines from the page's own voice and word timings: "Surely not I, Rabbi?", "You have said it yourself." and "Take, eat, this is my body." It's drawn in the kit's style, on a new rig:

- **Arms reach real points.** Each arm is two bones solved to a target, and the elbows bend naturally.
  - Judas puts his hand on his chest on "I".
  - Jesus opens a hand toward Judas on "yourself", picks up the loaf from the table, and breaks it: the hands press together, then snap apart, with crumbs.
  - On "Take", Jesus holds half out. Judas's hand comes halfway, stops, and then meets his. The half passes from one hand to the other.
- **Every part moves on a spring toward its target.** This is the step that turns poses into motion:
  - moves overshoot and settle;
  - the head, the arm and the hand arrive at different moments;
  - long hair lags behind the head.

  The acting script only says where things should be and when.
- **Faces move rather than switch.**
  - Brows rise and angle up when sad.
  - Lids droop, and blink on the beat.
  - Pupils dart: Judas's eyes slide away when he's caught out, and he swallows.
  - The mouth opens and rounds from the letters being said, closing on m, b and p.
- **Everyone is always a little alive:** breathing, a slow sway, the candle flickering.
- **Film grammar.** A two-shot, a close-up on Jesus for "You have said it yourself", a cut to Judas caught, then back to the two as the bread is broken. The camera keeps drifting, and the speaker's glow fades in and out.

It's hand-directed. The pipeline's job is to make that direction automatically.

## The plan

### 1. A real rig for the figure kit (same drawing, new skeleton)

The kit keeps drawing each person exactly as now, but as parts on bones, and it sends the joints to the client.

- **Bones:** hips, spine (bend and lean), neck, and head (tilt, nod, and a turn in which the face slides round the skull while the hair slides the other way). Each arm is shoulder, elbow, wrist, hand. Each leg is hip, knee, foot.
- **Hands with shapes:** open, fist, point, hold, a palm up to offer, a palm out to halt. Hands grip props by a grip point.
- **Two-bone IK for arms and legs.** A hand goes to a point (a person, a prop, the table) and a foot stays on the floor.
- **The face as numbers, not groups:**
  - brow height and angle, each side;
  - lid height;
  - gaze;
  - mouth open, width, round and smile;
  - jaw, with the beard riding on it.

  Every expression is a blend of these, so faces move between feelings instead of swapping.
- **Secondary parts on springs:** hair, beards, sleeves, belts and props swing and settle after the body moves.
- **Profile and 3/4 views.** For turning away and walking, the kit draws a side view as well, and turning crosses from one to the other mid-turn.

### 2. Motion that obeys the principles of animation, by construction

- **Springs on every channel,** each with its own stiffness. This gives overlapping action (head first, arm second, hand last), follow-through and settle, without anyone keying it.
- **Anticipation for free.** A move that goes one way starts with a small dip the other way.
- **Arcs.** Hands travel on curves, not straight lines.
- **Idle life, layered under everything:**
  - breathing, weight shifts, slow head drift;
  - blinks, which come more often on head turns and at the ends of sentences;
  - eye darts: small saccades while listening, bigger ones when thinking.
- **Timing from speech.**
  - Beat gestures land on stressed words.
  - A nod lands on the key word.
  - Brows rise into a question.
  - Silences are acted: a look away, a breath, a swallow.

### 3. A library of acting clips, written once and tuned by eye

Each clip is a small program of targets for the rig. None of them is a drawing.
- **Speaking:** talk-hands, offer (palm up), explain (both hands shape it), count on fingers, point at, point up, beckon, halt.
- **Listening:** nod, doubt (head back, brow), surprise (lean back, brows up), sad, laugh, a hand to the chin.
- **About oneself:** a hand on the heart, a shrug, a head shake, a hand over the mouth, hands on the head.
- **Between two people:** give/take, hug, a hand on the shoulder, handshake, lead by the hand, push away, kneel before, wash feet…
- **Moving:** a walk with stride and arm swing, run, sit down/stand up, turn round, enter and exit, kneel, fall.
- **Props:** pick up, put down, break, pour, drink, eat, write, read, hand over, throw.

Each clip has a test page (an acting sheet) where we watch it on every body and age and tune it until it looks right. This is the craft work, and where the feel comes from.

### 4. Direction: from the script to acting beats

- **The screenplay writer adds a few acting beats to each line:**
  - its **intention** (plead, accuse, comfort, offer, deny);
  - the one or two **words to land a gesture on**;
  - its **target** (whom or what);
  - any **business** with a prop (breaks the bread, hands it to Judas).
- **Code turns beats into clips** on the word times, and fills the rest:
  - listeners react to the line's intention;
  - eyes follow the speaker;
  - nobody freezes.
- **Continuity.** Props and poses carry over from the page before, via the teacher's-notes ending, so a cup put down stays down.
- **Checks, as now:** a hand only reaches what is within reach (otherwise the person steps closer first); a prop is only passed between people who are both on stage; no two big gestures happen on the same words.

### 5. Staging and the camera

Shot choice follows the acting:
- a close-up on a strong line;
- a reaction shot on the listener who is hit by it;
- a two-shot for anything passed between people;
- a push-in on the key sentence.

This is the director stage from `lessonreel-visuals-plan.md`, fed by the acting beats.

### 6. Lips

The aligner gives phonemes as well as words, so the mouth blends between visemes with a little co-articulation (the shape leans toward the next sound). The jaw, beard and head bob with stressed syllables. The test's letter-based mouth is the fallback.

## Order of work

| Step | What | Done when |
|---|---|---|
| 1 | The rig: the kit draws parts on bones; joints, grips and face channels go in the scene; the client solves IK and runs the springs. Today's poses become starting targets | Every existing story page plays as before, but moves smoothly |
| 2 | Idle life and speech timing | No one is ever frozen; gestures land on stressed words |
| 3 | The clip library and acting sheets, starting with the 25 most used moves | Richard signs off each clip by eye |
| 4 | Props: pick up, hold, pass, put down; carried between pages | The bread scene plays from the script alone |
| 5 | Acting beats from the writer, with listener reactions | Matthew and Hide-and-Seek remade and compared with today |
| 6 | Walks, sit/stand, turns, and profile views | People enter, cross and leave a scene as people do |

Steps 1 and 2 already make every story page feel different. The springs alone take away most of the stiffness.

## Notes

- The rig runs on the voice's clock and is deterministic: it's simulated from the start to any moment, as the test does. So the Easy Read player and a rendered MP4 (LessonReel) show the same thing, and seeking works.
- The test uses a letter-based mouth and a hand-written acting script. Neither is the final form.
- Cost: no new model calls for steps 1–4. Step 5 adds a few fields to the screenplay writer's answer.

## Status (2026-09-26): steps 1 and 2 in Easy Read, on branch `visualize-acting-rig` (both repos)

Richard: "implement this on easy read and test".

**Built:**
- **Server:**
  - The kit now records each arm's shoulder, elbow and hand as drawn: `Layers.joints` and `FigureDrawing.joints`, for one person standing (not for a group or someone lying).
  - `figureDrawing` carries them, and `thingDto` sends them to the player as shares of the box (`SceneThingDto.joints`).
  - No new model calls. Pages get joints when they're made or remade.
- **Client** (`src/lib/scene/motion.ts`, `ActingMotion`, used by the stage in place of `actingAt`):
  - **Springs.** Every rig channel follows the acting plan on its own spring: eyes snap; the head, lean and arms overshoot and settle; the forearm is whippier than the upper arm.
  - **Aimed arms.** A reach, a point and a hug's near arm are solved to where the other person really is, with a two-bone IK (`solveArm`). The IK allows for both people's step and lean.
    - reach: onto their shoulder;
    - point: at their face, arm straight;
    - hug: round past their shoulder.

    `actingAt` leaves those arms to it (its `aimed` argument) when joints are known. Older pages keep the old fixed angles.
  - **Idle life:** weight shift and head drift for everyone; eye darts while listening; the head and brows going with the syllables while speaking.
  - **Seeking:** playing on integrates from the last frame; a seek, or a jump of more than 400 ms, lands everyone where the plan has them.
- **Tests:** server 1508 pass (new: joints drawn where the arm pivots; the joints reach the scene as shares). Client 77 pass (new: the arm solver lands the hand on a reachable point and points at a far one, with the elbow outward and down; a reach lands on the other's shoulder; a nod overshoots and settles; seeks land the same as a fresh start; idle life; reduced motion adds nothing).

**Tried in the real player** (the stage lab on :3000, pages remade with the new server, voiced by our Kokoro server):
- **Matthew p53.** Judas's open-hand gesture on "Surely not I, Rabbi?" rises, overshoots (the forearm peaks at 49° and settles to 41°) and swings back past rest. Nods dip past rest. The eyes snap between targets.
- **Hide-and-Seek p14.** The father's hug lands his hand on Sally's shoulder (it went past her face until the IK allowed for his step and lean).
- **Matthew p54.** Judas's reach is aimed level at Jesus's shoulder, straight out, as they stand too far apart to touch.
- **Older pages without joints** (the goat story) play as before, with springs and idle life, and no errors.

**Not done yet** (steps 3–6):
- the clip library and acting sheets;
- hand shapes;
- a hugging arm drawn behind the other person's head (today it crosses a shorter person's face on its way to the shoulder);
- props picked up and passed;
- acting beats from the writer;
- walks with a stride, sitting and turning;
- faces as parameters (they still switch as groups).

## Status (2026-09-26): the business and the faces

Richard: "implement this. It is very important that the micro interactions mentioned by the narrator are acted out. If there is food on the table then we should see it. If a character eats it, we should see it. As a character interacts, their facial expressions should match what is being said and should be fluid."

**Found first:** story pages never read their narration for actions. `directionsIn` ran on lesson pages only, so "Jesus took bread and broke it" in a story was never acted.

**Server (branch `visualize-acting-rig`):**
- **The props.** `scene-props.ts` covers bread, cup (and wine), fish, bowl or dish, jar, plate, basket, fruit ("the fruit of the vine" excepted) and lamp.
  - Each is found in the page's words and drawn in the kit's style: flat colours, the figure's outline, a grip point and a mouth point.
  - Bread also has a broken half.
- **Finding the business.** `directionsIn` now also finds business: take, raise (bless, give thanks), break (and "brake"), give (to whom), eat, drink, dip, put.
  - Who does it is resolved the same way as moves; what is done it to is the prop named, or "it" for the one last named.
  - Eating and drinking with nothing named use what there is on the page.
  - A meal going on ("while they eat") is background, not a bite.
  - A give with nothing to give stays a reach, as before.
- **Where it's read.** It runs on story pages over the narration only; a character's line ("Take, eat") is said, not done.
- **The writer's part.** The writer may also stage business as actions (take, raise, break, give, eat, drink, dip, put).
  - Bread or a cup the writer draws as a thing in the row becomes the stage's prop instead.
  - An unnamed "breaks it" is the thing last handled.
- **The book check.** The book's own text is read the same way. Business it tells that the storyboard leaves out sends the draft back. If it's still missing, it is acted anyway, beside the rest of that thing's business.
- **Tidying.** Business is kept in the order of its words, each act once. One person's acts are spaced at least 650 ms apart. The narration's moves don't repeat the writer's.
- **Faces.**
  - A line with no face (or "neutral") gets the face its words tell (`scene-feeling.ts`): "betray", "woe", "blood" are sad; "surely not" afraid; "rejoice" or "thank" happy; a plain question thinking.
  - Feelings the writer names in other words map to the kit's faces ("serious" is sad, "worried" afraid).
  - The one a line is said to reacts as it ends: angry makes them afraid, sad sad, happy happy, surprised surprised.
- **The scene.** `SceneDto.props` gives each prop its drawing, whom it rests near, and its timed events.
- **The prompt.** The story prompt asks for a face on every line and for business in the book's words, and says props are never cast.

**Client:**
- **`business.ts`: the clips.**
  - Each event becomes a clip whose moment lands on its word: the hand closes on "took", the snap is on "broke", the hand-over on "gave".
  - A take is added when someone uses what is still on the table.
  - A quick run of business is squeezed around fixed moments, never late.
  - A ledger tracks every piece: on the table, in which hand, broken into halves, handed over, bitten (three bites and it's eaten), put down.
  - Each clip has a choreography: the eyes lead the hand; a blessing lifts it in both hands with the eyes up; a break is a press, then a snap, with crumbs; a hand-over has the giver hold it out and the receiver reach, lift their brows, take it and look up at the giver; eating brings it to the mouth, bites, chews and dips the head; drinking tips the cup with the head back.
- **`motion.ts`.** It solves those hands with the IK, points the eyes, chews, and nods.
  - A giver and receiver too far apart step in and lean to meet, then step back.
  - A thing taken from out of reach glides into the hand.
  - A thing given to someone not drawn to hold it is carried out and fades.
  - Things nobody handles sit in the middle of the table.
- **`stage.ts`.** It draws the props over the people, in hand or on the table (the height of a hand at rest when the set has a table front, else the ground), with crumbs.
  - Faces change behind a blink: the lids close while one face gives way to the next.
  - With reduced motion the props are still there, at rest or in hand.

**Tests:**
- Server: 1520 pass. New tests cover the prop finder, story business and the listener's face, drawn props, the book check, props in the scene, and the face reader.
- Client: 84 pass. New tests cover clips on their words, the squeeze, the ledger, the implied take, poses, the bread resting on the table and taken into the hand, and the break into halves with crumbs.

**Seen in the player** (Matthew p53, remade; frames captured from the stage lab in headless Chrome at quarter speed):
- The narration now reads "While they eat, Jesus takes bread, gives thanks, breaks it and gives it to his disciples".
- The loaf and the cup sit on the table.
- Jesus looks to the loaf, reaches, takes it, lifts it in both hands with his eyes up, presses and snaps it into halves (crumbs fall), and holds the right half out to the disciples; it goes with them.
- Then the cup is taken, blessed and held out.
- Judas is afraid on "Surely not I, Rabbi?", behind a blink. Jesus is sad on "this is my blood".
- A lab-only variant (the half given to Judas, who then eats) shows the two stepping in to meet, the half passing hand to hand, both stepping back, and Judas looking down at it, bringing it to his mouth, biting and chewing.

**Left:**
- The disciples are drawn as a group, which can't hold things, so a thing given to them fades. Drawing a few disciples as people would let them take and eat it.
- Drinking has no dedicated test yet.
- The face lexicon is English only.
- Blessing and eating poses may want tuning by eye.

# Visualize: dialogue, acting, and teaching to the learner's stage

A plan for three next items, written 2026-09-24:

1. Dialogue sometimes loses its second and third speakers.
2. Characters should move, talk and act with each other like an animated film, especially in stories.
3. Materials should be sorted by learning stage (primary, secondary, university), and the teaching and pictures should adapt to each stage while staying simple and easy to follow at every level.

Each section says what happens today, what to build, and how it will be checked. The decisions for Richard are at the end.

---

## 1. Dialogue that loses its speakers

### What happens (reproduced)

I made a test story page locally with the real writer and voice: three people by a fire (Ada, her brother Kofi and Nana Efua) talking in turns. The story reader gave each of them a voice (girl, boy, old woman). The writer then:

- quoted 7 lines from the three of them, one in each of 7 of the page's 9 sentences;
- set `speaker` on none of those sentences;
- added no `say` step for any of them.

**The result:**

- every line was read in the narrator's voice;
- no speech bubble appeared;
- no mouth moved.

On The Lantern Keeper the writer did mark its speakers, and the dialogue worked. So the outcome depends on whether the writer remembers the optional `speaker` field. It forgets most often after the first line, which is why the second and third speakers are the ones lost.

**Where the dependency sits:**

- **Voices.** `scene.processor.ts` (`voice()`) takes each sentence's voice from `beat.speaker`, else from the first `say` step in that sentence. With neither, the narrator speaks.
- **Bubbles and mouths.** `scene-compose.ts` makes a bubble, and marks someone talking, only from a `say` step or from `beat.speaker`.

### Also found in the same code

These would cause trouble even once speakers are marked:

- **One voice per sentence.** A sentence quoting two characters (`"Ready?" asks Mira. "Always," says Ember.`) gives both lines to the first.
- **One text per sentence.** A bubble shows every quote in its sentence, whoever says it.
- **Bubbles closed too early.** A bubble closes at the next change of stage, or when the next bubble opens, even if its own words are still being said. Its speaker's mouth stops at the same moment.
- **Bubbles dropped.** A bubble with no clear room is dropped, with nothing in its place. This is most likely for the second or third person in a row of three.

### The fix

1. **Code works out who says each quoted line** from the sentence's own words, trying in this order:
   - a speech verb and a name next to the quote (`"…," said Nana Efua` or `Kofi groaned. "…"`);
   - else the first character named outside the quotes in the sentence;
   - else the previous line's speaker, when the quote continues their speech.

   Names are the story bible's names and aliases; a name inside the quotes ("Tell us a story, Nana") is never taken for the speaker. The writer's `speaker` and `say`, when given, still win. A quote with no speaker found stays with the narrator.

   A first try of this rule attributed all 7 lines of the test page correctly.
2. **Each line in its own voice.** `voicedPieces` gives every quoted span its own speaker, so two characters in one sentence each speak as themselves.
3. **Each line its own bubble.**
   - It holds only that line's words.
   - It opens on the line's first word and closes after its last, using the voice's word times.
   - It stays up through a change of stage if its speaker is still on stage.
   - A new line closes the previous bubble only once that bubble's words have been said.
4. **No dropped bubbles.** Where there is no clear room, the bubble is tried smaller. Failing that, the line goes in a caption strip along the stage's foot with the speaker's name ("Nana Efua: Everything has a story…").
5. **The right mouth moves:** the talking mark follows each line's own times.

### Checks

- **Unit tests:**
  - attribution: the test page's lines, The Lantern Keeper's, verbs before and after the quote, two speakers in one sentence, a speech that runs across sentences, apostrophes inside quotes;
  - voiced pieces with two speakers;
  - bubbles one per line, never closed before their words end, with the caption strip when there is no room.
- **Remade locally:** the test page and The Lantern Keeper. The log should say "characters speak in" with three voices, and the pages are watched on `/dev/stage`.
- **Cost:** none per page. This is code only.

---

## 2. Acting like an animated film

### Where the stage is today

- **Staging.** Things are placed by layout templates. They pop, slide or fade in (0.52 s), rearrange (0.7 s) and leave (0.38 s). The camera can zoom and follow.
- **Figures.** Figures drawn by the kit:
  - breathe and blink;
  - open and shut their mouths at random while marked talking;
  - change faces;
  - move with their signs (shaking, walking on the spot).
- **What is missing.** It plays like slides with living cut-outs. No one walks anywhere, looks at whoever is speaking, turns to face the person they talk to, or reacts.

### What makes animation feel like a film

- Mouths that match the words.
- Eyes and heads that turn to whoever speaks.
- Characters who walk in, walk up to each other and walk off.
- Movement with weight: easing, a little anticipation, things settling after they stop.
- Listeners who react.
- A camera that cuts with the conversation.
- A world that moves on its own: a fire flickers, the stars twinkle.

### The approach

The architecture stays as it is: models decide what, code decides where and when.

- **The server plans a performance** at compose time from what it already knows:
  - who speaks when, and to whom;
  - who is on stage and where;
  - each word's time.
- **The plan is stored as compact tracks per character:**
  - where they look;
  - which way they face;
  - their mouth shapes;
  - their walks;
  - their gestures.

  These are optional fields in the scene, so older players ignore them.
- **The player applies the tracks each frame** as transforms on the figure's own groups, driven by the voice's clock as everything is now. Seeking, stills and reduced motion keep working. Under reduced motion there are no walks, gestures or lip movements.

### Phase A: acting with nothing new from the writer

1. **Lip-sync.**
   - The voice service already returns each word's times, and Kokoro also knows each word's sounds (its phonemes). The service returns those too, so each speaker gets mouth shapes at about 30 a second: closed (m, b, p), slightly open, open (a), wide (e), round (o, oo) and teeth on lip (f, v).
   - The kit draws the six shapes once, shared by every face.
   - Without the sounds (an older service, another engine), the mouth follows the loudness of the voice.
   - This needs a Voice Server redeploy, from the CLI.
2. **Looking.** Listeners' eyes turn to the speaker, and the speaker looks at whoever they are answering. A newcomer draws a glance. Heads tilt a few degrees.
3. **Facing.** Two people in conversation turn toward each other: the face's features shift toward the one they face and the eyes look sideways. It reads as a turn without a second drawing.
4. **Walking.** Someone who comes on from the side walks in, legs stepping, instead of sliding. Someone who leaves walks off. Someone who changes place walks there.
5. **Body language while talking.**
   - A small nod on stressed words (from word times and the sentence's delivery).
   - Brows raised on a question.
   - An open-hand gesture as a line starts. This needs the arm rig from Phase D; until then, a gentle lean.
6. **Reactions.** The listener's face answers a strong line (surprise, a smile), and they nod when it ends.
7. **Idle life.** Someone standing still shifts their weight and glances about now and then.

### Phase B: directed by the writer, for stories

- **Blocking,** from a closed list: walk to (beside someone, left, right), turn to, look at, point at someone, give something (a prop passes from hand to hand), hug, hold hands, sit, stand, lie down, jump for joy, run off.
- **Shots:** wide (to set the scene), two-shot, close on someone for an important line, follow someone walking.
- Code places, times and eases all of it on the words, as it does with effects now.

### Phase C: a world that moves

- **Living sets.** The set painter draws named groups that code animates: fire (flicker), stars (twinkle), trees (sway), water (ripple), clouds (drift). Sets already allow motion; this names it so code can drive it.
- **Parallax.** When the camera moves, the scenery behind moves less than the characters in front.
- **Time of day and weather** as light layers: night tint, rain, snow, fireflies.

### Phase D: the rig

This makes Phase B possible and Phase A richer.

- **Kit figures gain:**
  - arms in two parts that turn at the shoulder and the elbow;
  - a head that tilts and turns;
  - pupils as their own group, so gaze works under any face;
  - the six mouth shapes;
  - feet that step on an arc.
- **Animals the artist draws** are asked for named parts (head, body, legs, tail, and a mouth-open face) so the stage can bob them, turn them and open their mouths while they talk. A small animal kit (cat, dog, fox, bird) could follow if the artist's parts prove unreliable.

### Checks

- **The test films:** the test story page and The Lantern Keeper, recorded before and after.
- **Tests on the performance planner:** who looks at whom, facing, walk paths, mouth shapes from sounds.
- **Frame rate** on a mid-range Android phone.
- **Size:** the scene grows by its tracks. Mouth shapes are about 1–2 KB per speaking character per page.

### Costs

- **Phase A** adds no model calls.
- **Phase B** adds a few fields to the writer's answer.
- **Phase C** makes the set painter's instructions a little longer.

---

## 3. Teaching to the learner's stage

### What exists today (surveyed)

- **One reader for every document.** The page writer is told the same thing whatever the document: "The learner finds reading hard" (`prompts.ts:1200`). Its word limits are the same for every document too: 3–22-word sentences and 150–300 spoken words.
- **No audience in the document profile.** It has a subject, kind, tone, formats and whether it is a story, but nothing about who it is for.
- **Levels exist only for schools.** A school has its own free-text levels (for example "Year", "100 Level"), with materials filed under them. They are used only to filter the catalogue, and in one line of the lecture outline.
- **Learner settings stay out of Visualize.** A learner's settings (pace, depth, interactivity) reach chat, voice and recaps, but not Visualize.
- **One video per page serves every reader.**

### The proposal

1. **Each document has a stage:**
   - *early* (primary school);
   - *middle* (secondary school);
   - *higher* (college and university);
   - *professional* (practice notes, workplace training).

   **The stage is detected from the document itself** (Richard, 2026-09-24). Nothing is asked of the uploader or the school.
   - **Who reads it.** The profile reader, which already reads every document once. The stage is one more field in that call, so it costs nothing extra.
   - **What it reads.** The title, the chapter titles and the sampled pages it already takes.
   - **What it looks for:**
     - the level the document names: "Primary 4", "Basic 5", "JSS 2", "SS 3", "Year 9", "Grade 10", "100 Level", a course code like "BCH 201", "Practice Note";
     - the exams it prepares for: Common Entrance; BECE; WAEC, NECO or SSCE; JAMB or UTME; professional exams such as ICAN or the Bar;
     - how it is written:
       - pictures, exercises and very short sentences for children;
       - references, citations and technical density for university;
       - clauses, cases and procedures for practice;
     - how deep its subject goes.
   - **What it answers:** the stage, how sure it is, and the words that told it. These are kept in the document's `profile.json`, so a wrong call can be traced.
   - **A check in code.** Level words that code finds in the text itself ("JSS 2", "100 Level", "Primary 4") win over a model guess that contradicts them.
   - **When it is unsure,** the page is taught as today, with the current reader and limits. A doubtful document is never taught worse than it is now.

   The stage is shown on the document. It applies to pages made after it is read; pages already made keep their teaching until they are remade.
2. **A teaching recipe per stage, owned by code** (the table below), so each stage is taught the same way every time rather than as the model imagines it.
3. **The writer is given its stage's recipe** in place of the one fixed reader. The mend enforces the numbers it can check (sentence length, spoken words, new terms, labels per drawing) and sends a page back when it strays.
4. **The pictures follow the stage:**
   - which things the stage prefers;
   - how many labels;
   - text size, palette, how lively the motion is, and the music.
5. **The voice follows the stage:** pace and pauses.
6. **Simple at every level.** EasyRead's promise holds for university too. What changes between stages is depth and density, never clarity. At every stage:
   - plain words come first, then the exact term, then a precise definition;
   - one idea at a time;
   - an example, and a picture for every idea.

   At the higher and professional stages, nothing an exam or practice needs is dropped, and the precise terms stay.
7. **The reading pane can follow too.** The simplified text can be given the same stage, so the text and the video agree. This is optional.
8. **One video per page stays.** Costs stay flat, since the stage belongs to the document. A learner's own preferences can change playback (speed, captions) without remaking anything. A separate video per stage for the same material would multiply the cost of every page, so it is left until a school needs it.

### The recipe (draft)

| | Early (primary) | Middle (secondary) | Higher (university) | Professional |
|---|---|---|---|---|
| Sentence length | 4–12 words | 6–16 | 8–20 | 8–20 |
| Spoken words a page | 80–150 | 150–250 | 180–300 | 180–300 |
| New terms a page | 1–2, each with a picture | up to 3 | up to 5, each defined | up to 5, each applied |
| How it explains | a story or an everyday scene, with a guide character | an everyday example, then the idea | plain first, then the precise statement, the mechanism, and why it matters | the rule, then a worked case |
| Voice | 0.9× pace, longer pauses | 0.95× | 1.0× | 1.0× |
| On stage | characters, big simple drawings, at most 2 labels | characters and diagrams, at most 3 labels | diagrams, charts, working, timelines, at most 5 labels | flows, documents, people as roles |
| Checks along the way | a question with a pause ("Can you spot…?") | "Think:" prompts | a one-line recap of the key term | a practical tip |
| Tone and motion | playful, bright | lively | calm, focused | calm |

### Checks

- **Detection is measured against a labelled set** before anything is built on it, and the result is shown:
  - the local documents, where the epilepsy lecture should come out *higher*, the property law practice note *professional* and The Lantern Keeper *early*;
  - a few sample pages for each stage: a primary science reader, JSS Basic Science notes, a senior-secondary chemistry text, university lecture notes, a professional practice note.

  Every document the detector is unsure of is listed, with the words it gave.
- **Make one page at two stages** (a biology page as middle and as higher) and compare them side by side.
- **Tests:** level words found in the text, the check that they win over a contradicting guess, the fallback when unsure, the recipe reaching the writer's instructions, and the mend's limits for each stage.
- **Cost:** none per page, since the stage is one more field in the profile call. Documents profiled before are profiled once more (one small call each) the next time one of their pages is made.

---

## Order

1. **Dialogue** (small): code only; fixes a visible fault in every story.
2. **Stages** (medium):
   - a profile field;
   - the recipe, the writer's instructions and the mend;
   - on the client, the stage shown on a document.
3. **Acting, Phase A** (large):
   - the voice service returns sounds (a Voice Server redeploy);
   - the kit draws mouth shapes and separate pupils;
   - the performance planner and the player's tracks.

   Phases B, C and D follow once A is signed off.

## Decisions for Richard

1. **Dialogue.** Code finds the speakers, and a caption strip takes any line that has no room for a bubble. *Recommended.*
2. **Who sets the stage.** *Decided:* it is detected from the document itself, with no uploader or school input. One video per page still serves every reader.
3. **Stages and names.** Four stages (early, middle, higher, professional), or three, with professional folded into higher.
4. **Existing documents.** Classified the next time one of their pages is made (*recommended*), or all at once in a backfill.
5. **Acting.** Start with Phase A. It needs the Voice Server redeployed from the CLI, since the service must return each word's sounds.

---

## Technical plan (2026-09-24)

Richard said to build all of it, top to bottom, and test it, with the most care on film-like acting in stories. The open decisions take their recommendations: the dialogue fix first, four stages, and existing documents classified the next time one of their pages is made. The work is on `visualize-acting` in both repos, branched from `visualize-characters`, and is not pushed.

### M1. Dialogue (`scene-dialogue.ts`, the mend, the voice, compose, the player)

- **Finding the speaker: `dialogueOf(beats, speakers, hints)`.** It returns one line for each quoted span: `{ beat, span: [start, end], speaker, by }`.
  - Speakers are the story's characters on the page, with their bible names and aliases.
  - Only words outside the quotes count.
  - Order of evidence:
    1. a speech verb with a name right after the quote (`"…," said Ada`, `"…," Ada said`);
    2. the writer's `speaker` or a `say` on that sentence;
    3. the last character named before the quote in the same sentence (`Ada asks, "…"`, `Nana Efua smiles. "…"`);
    4. a character named after it;
    5. the previous line's speaker, when this quote continues a speech in the same sentence;
    6. otherwise the narrator.
- **The mend** writes each sentence's lines to `beat.lines` and keeps `beat.speaker` as the first line's speaker, so older code still reads it. `say` steps are only hints now and are dropped from the steps, since bubbles come from the lines.
- **The voice.** `voicedPieces` takes a speaker for each quoted span, so a sentence quoting two characters is said in two voices. The processor builds those speakers from `beat.lines`.
- **Bubbles (compose).** Each line gets its own `say`:
  - **Text:** only that line's words.
  - **Opens** 150 ms before its first word, **closes** 700 ms after its last. `saidUntilMs` is its last word, so the right mouth moves for exactly that long.
  - **Another speaker** starting closes it no sooner than its own last word.
  - **A change of stage** closes it only if its speaker leaves. If the speaker stays but moves, the rest of the line gets a continuation bubble placed for the new step (`continues: true`, shown without a second pop).
  - **No room:** a smaller type size is tried. Failing that, a strip across the top of the stage with the speaker's name (`who`, no tail).
- **Player.**
  - A strip is drawn as a wide rounded bar with the name in bold.
  - A continuation opens without its pop.
  - A bubble rides with its speaker while they walk: it moves by their offset from their place.
- **Writer instructions.** Attribute every line in its sentence (`says Ada`). One sentence may quote more than one character, each named. `speaker` becomes optional.
- **Tests:**
  - attribution: the fire test page, The Lantern Keeper, verbs before and after, two speakers in one sentence, names inside quotes, apostrophes, a continued speech;
  - `voicedPieces` with two voices;
  - compose: one bubble per line, bubbles held until their words end, continuation across a move, the strip when there is no room;
  - the player's strip and ride.
- **Remade:** the fire page and The Lantern Keeper pages.

### M2. Stages (`scene-stage.ts`, the profile, the writer, the mend, the voice, the reader)

- **`scene-stage.ts`:**
  - `LEARNING_STAGES = ['early', 'middle', 'higher', 'professional']`.
  - `STAGE_RECIPES`: one recipe per stage, with reader, sentence words, spoken words, new terms, labels per drawing, voice pace and pause, how to explain, checks along the way, pictures, and tone.
  - `levelIn(text)`: the explicit level words found in the text, as a stage and the words.
  - `settleStage(model, found)`: the text's own level words win over a contradicting guess; an unsure guess gives `null`.
  - `describeStage(stage)`: the paragraph the writer is given.
- **Profile.**
  - `DocumentProfile` gains `stage: LearningStage | null` and `stageWhy`.
  - Its schema and prompt ask for the stage, how sure (`sure | likely | unsure`), and the words that told it.
  - A kept profile without `stage` is made once more.
- **Writer.**
  - The system prompt keeps "the learner finds reading hard" for every stage. Its numbers become the defaults "unless the message says otherwise".
  - The message carries `describeStage`.
  - With no stage, nothing changes.
- **Mend.**
  - Labels beyond the stage's number are kept as parts without labels.
  - A page sent back for length or sentence size only when it runs well over (more than 30% past the stage's upper bound).
- **Voice.** Pace and pauses are scaled by the stage.
- **Reader.** The visuals set gains `stage`, and the Visualize pane says whom the page is taught for.
- **Tests:**
  - level words for Nigerian, British and US levels, exams, course codes and practice notes;
  - settling;
  - the recipe reaching the writer's message;
  - the mend's limits;
  - pace.
- **Measured:** detection on the local documents and on sample pages for each stage, with the evidence printed.

### M3. The rig (`scene-figure.ts`)

At rest, with every variable 0, a figure looks exactly as it does today. The stage moves it by setting CSS variables on the figure's `<svg>`, and the figure's own CSS does the rest:

| Variable | Moves | How |
|---|---|---|
| `--gx`, `--gy` | where the pupils look | `.pupils` translate, inside every face |
| `--turn` (−1…1) | a three-quarter turn | `.fm` (eye whites, faces, mouth shapes, glasses, face signs) shifts 7 units |
| `--tilt`, `--nod` | head tilt and nod | `.hd` (head, hair, hat) and `.fm` rotate about the neck |
| `--brow` | brows up | `.brows` translate |
| `--ar`, `--arf`, `--al`, `--alf` | right and left arm, forearm | `.arm.ar` rotates about the shoulder, `.fore` about the elbow |
| `--lean`, `--flip` | lean and mirror | `.flip` about the feet |

The stage also sets these classes on the figure:

- **`lipsync` with `v0`…`v5`.** It shows one of six mouth shapes, drawn once and shared by every face (closed, small, open, wide, round, teeth on lip). The face's own mouth hides meanwhile.
- **`on-walking`.** This is now in every figure's CSS: the legs step and the body bobs.

**How the drawing changes:**
- Arms are drawn as an upper arm and a forearm. The forearm's outline goes under the upper arm's colour, so no seam shows at the elbow.
- A group (count > 1) and someone in bed get the pupils and the mouth shapes, but no head or arm motion.

**Tests:**
- every group and variable exists once;
- at rest, the figure renders the same as before, pixel-compared;
- a heavy figure stays within budget;
- the rotations' origins sit on the shoulder, the elbow and the neck.

### M4. The performance (`scene-acting.ts`, compose)

`actingOf(...)` plans each actor's performance from:
- the lines;
- the steps (who is on stage, where and when);
- the word times;
- the page's effects.

Actors are the story's characters and people. A figure drawn by the kit has the full rig; an animal the artist drew gets body motion only. The plan goes into the scene as `acting: { [id]: { look, turn, mouth, moves, walks } }`. It is optional, so older players ignore it.

- **Looking:**
  - **During a line:** the speaker looks at whom they answer (the last speaker on stage, else the nearest actor, else the viewer). Everyone else looks at the speaker, 150 ms after they start.
  - **When the narration names someone** ("Kofi groans"), the others glance at them for 1.2 s.
  - **A newcomer** draws everyone's eyes for 1 s.
  - **Long quiet stretches** get a glance now and then, placed by a seeded hash so every make is the same.
  - **Otherwise** they look at the viewer.
- **Turning:**
  - Speaker and addressee turn toward each other (±0.5); listeners turn toward the speaker (±0.35).
  - Anyone walking turns toward where they are going.
  - Turns ease over 300 ms.
- **Mouth:**
  - Each word of a line is cut into letter groups by sound: m, b, p → closed; f, v → teeth; o, oo, u, w → round; a → open; e, i, ee → wide; everything else → small.
  - Its time is shared out, a vowel counting double.
  - Gaps longer than 60 ms are closed.
  - The result is 30 shapes a second, as a digit string per line.
- **Moves:**
  - **The speaker:** a gesture with alternating arms at the start of a line of four words or more; a nod on one stressed word (the one before `!` or `.`, else the longest); brows raised on a question.
  - **Listeners:** a nod after a line that ends with `.` or `!`, chosen by a seeded hash; a lean back after an exclamation.
- **Walking:** on story pages, actors walk on from the nearer side, walk between places and walk off. `walks: true`.
- **Directed by the writer (story pages only):**
  - `look` at someone, `reach` toward someone (a touch, a poke, a hand held out, giving), `hug` (both lean in and reach), and `point` at a thing;
  - `zoom` on two things for a two-shot;
  - the mend's `effectOf` reads "ada.kofi" as Ada toward Kofi;
  - these become moves, not stage effects.
- **Tests:** who looks at whom through a three-way conversation, turns, mouth strings from words, moves, walking flags, and the directed effects.

### M5. The player (`timeline.ts`, `stage.ts`)

- **`actingAt(scene, t, frames, reduced)`** gives each actor, at any moment:
  - gaze;
  - turn;
  - mouth shape;
  - arm, forearm, head, brow and lean values;
  - whether they walk.

  It is pure, like the rest of the timeline, so seeking and stills stay exact. The gaze direction comes from the head positions: the drawing's head anchor, carried in the thing's DTO as `head`.
- **Walking.**
  - Arriving from the side, a walker starts off stage and walks to their place at about 0.45 of the stage's width a second (1–2.2 s).
  - Moving between places takes as long as the distance needs.
  - Leaving, they walk off the nearer side.
  - Legs step and the body bobs throughout (`on-walking`).
- **Camera.**
  - During a line, the camera leans gently toward the speaker (6% and a 1.05 scale), unless a zoom is running.
  - A two-thing zoom frames both.
  - On story pages the camera drifts very slowly when at rest.
- **Reduced motion:** no acting, no walking, no camera lean or drift. Mouths stay shut, and bubbles still show.
- **Tests:** `actingAt` (gaze toward a target, mouth frame, move curves), walking frames (off stage to place, duration by distance), camera lean, and nothing under reduced motion.

### M6. A world that moves (sets)

- **Parallax:** the scenery behind moves with the camera at 40% of its scale change and its shift.
- **Light and weather from the place's sound:**
  - `fire`: a warm glow that flickers low in the frame;
  - `rain`: falling streaks;
  - `wind`: a few leaves drifting;
  - `water`: a soft shimmer near the ground.

  They are drawn by the player over the scenery and under the characters. There are none with motion reduced.
- **The set painter** may mark groups `flicker`, `twinkle`, `sway`, `ripple` or `drift`, and the player animates them. This only affects sets painted after the change; sets already painted keep their own motion.
- **Tests:** the parallax sum, which overlay each sound gets, and nothing under reduced motion.

### M7. End to end

- **Remade locally with the real writer, artist and voice:**
  - the fire story page;
  - a second story page with walking on and off;
  - The Lantern Keeper's four pages;
  - one lesson page per stage, compared for recipe adherence.
- **Watched on `/dev/stage`:**
  - voices: three speakers;
  - bubbles;
  - lip-sync;
  - looking;
  - turning;
  - walking on and off;
  - gestures;
  - camera;
  - parallax;
  - the fire glow.
- **Frame rate** checked with the browser's performance timing.
- **Commits** local on `visualize-acting`, with a status section at the end of this plan.

## Status (2026-09-24)

All seven milestones are built and tested, on `visualize-acting` in both repos. Nothing is pushed.

- **M1 dialogue.** Every quoted line is given to its speaker from the sentence's own words, said in their voice, and shown in its own bubble. The fire page has three voices and eight bubbles. A page that turns the story's quotes into reported speech goes back to the writer.
- **M2 stages.** Detected from the document itself: 11 of 13 local documents and 5 of 5 samples came out as expected. A recipe for each stage; the photosynthesis page came out at 112, 174 and 243 words for early, middle and higher.
- **M3 the rig.** Eyes, brows, head, arms at shoulder and elbow, lean, and six mouth shapes. A figure at rest is unchanged. Every person in a story is drawn afresh on each page, so books made before the rig get it too.
- **M4 the performance.** Listeners look at whoever speaks. A speaker turns and opens a hand to whoever the line names, else whom they answer, else whom they spoke to last. Mouths follow the words; nods, brows and gestures play.
- **M4b stage directions from the words** (added while testing). The narration's verbs are acted at the word that says them: hug, wave, nod, head shake, laugh, hop, clap, sob, shrug, point (at the sky too), give, look. "She" and "he" are known by each character's voice. The following are not acted:
  - anything wanted, denied or habitual ("every evening", "used to");
  - anything inside a quote.

  Who comes and goes is staged where the writer didn't:
  - a character walks on or off at "came walking", "ran up" or "walked off down the road";
  - someone who speaks while off the stage is cut in;
  - a lesson's ring or pulse on a character becomes the others looking at them.
- **M5 the player.** Gaze, turn, lip-sync, moves and walking are all pure of time. Walks run at about a quarter of the stage a second, easing in and out. The camera leans toward a speaker and frames two when asked. Traits show for a while after a character arrives, then fade. Moves were tuned on a pose sheet so waves and pointing clear the head.
- **Film grammar** (added while testing):
  - characters there as a page opens fade in; only those the words bring walk on;
  - swapping the whole stage or changing place is a cut, and people fade out and in;
  - after a cutaway, people cut back in rather than walking on again.
- **M6 a world that moves.**
  - Parallax: the scenery moves at 40% of the camera.
  - Light and weather from a place's sound: fire glow, rain, wind-blown leaves, glints on water. A place with no sound takes one from how it looks.
  - The set painter may mark groups to flicker, twinkle, sway, ripple or drift.
- **M7 end to end.** Remade with the real writer and voice:
  - the fire story;
  - a new walking test story (The Lost Goat: an arrival, two hugs, a wave and an exit);
  - The Lantern Keeper's four pages.

  Watched on `/dev/stage`: it plays at 120 fps (median frame 8.3 ms, 95th percentile 8.8 ms). The lesson pages for each stage were compared in M2.
- **Tests:** server 1278, client 53. Type checks and lint are clean.

Still open:
- Push and PRs, when Richard says.
- Pages already made keep their old scenes until they are made again. New acting needs a new page make.
- The set painter's moving classes only reach sets painted from now on.

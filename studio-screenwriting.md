# How real films are written: rules for the Studio's writers

A research note and rule set, 2026-09-29. Branch `studio`.

**Why.** Richard watched a generated two-minute New York dark comedy and said he could not watch a cartoon when he had no idea what it was about. On screen:
- the premise was never set up (a locked-out tenant, a pigeon holding the key, rent due at midnight);
- the lines were clipped reports of the action ("It's 11:52. Door's locked. That's fine.");
- a narrator added time stamps.

Every craft source below treats these as beginner mistakes, and each has a known fix. This note gathers those fixes and turns them into prompt rules and code checks for each step of the pipeline (`studio-story-plan.md` §1).

**What exists already** (so this note builds on it rather than repeating it):
- `FIRST_SCENE_RULE` is given to scene 1's writer.
- The cold read (`studioColdRead`) scores clarity, with `BAR.clarity` at 7.
- `lintTelling` catches lines that repeat an action next to them.
- The narrator is `none` by default (`DEFAULT_NARRATOR`).
- The premise and scene-plan prompts ask for "one absurd thing".
- The table-read rubric exists.

The other agent is finishing these now. Everything below is added on top of them.

---

## 1. What the craft says (summary)

### 1.1 Clarity and exposition
- **The first minutes answer four questions.** Whose story is it, what do they want, what is in the way, and what happens if they fail. In a short film the inciting incident comes on "page one", because there is no time to wait (Ruth Atkinson; StudioBinder on short films).
- **Establish first, then disrupt.**
  - The "ordinary world" (Vogler) or "opening image" and "setup" (Snyder) show the hero's normal day, so the viewer can feel it break.
  - An establishing shot does the same for space: where we are, and who stands where.
- **Exposition as ammunition** (McKee, *Dialogue*). Facts come out when a character uses them in a fight to get what they want: an accusation, a threat, a bargain. They never arrive as an explanation.
  - Snyder's "Pope in the Pool": when information has to be given, give it during something entertaining to watch.
- **"As you know, Bob."** One character tells another something both already know. The audience hears the writer talking to them, and trust breaks. The fixes:
  - give the information to someone who does not know it (a newcomer, the landlord, a child);
  - turn it into a conflict;
  - let a thing show it (a notice on the door, a clock).
- **Show, don't tell.**
  - Use the set, props and actions. Write "his fins drop and he drifts", not "he feels dejected" (Final Draft, on writing for animation).
  - Trust the viewer to put the clues together (StudioBinder).
- **One impossible thing.**
  - Snyder's "Double Mumbo Jumbo": an audience accepts one piece of magic per story, not two.
  - UCB improv puts it as the "first unusual thing" set against a grounded "base reality". The unusual thing then gets heightened by asking "if this is true, what else is true?"
  - Its rule must be shown before the story depends on it. Pixar rule 19: coincidences that get characters into trouble are fine, but coincidences that get them out are cheating.
- **Don't overload the setup.** Snyder's "Laying Pipe": the audience can take only so much setup. Give only what the next scene needs.

### 1.2 Structure
- **Three acts, even in a short film.** Setup and catalyst, then escalating attempts, then climax and resolution. In a short they are compressed into three or four key beats.
- **Save the Cat beats** (Snyder):
  - opening image;
  - (theme stated);
  - setup;
  - catalyst;
  - debate;
  - break into two;
  - fun and games;
  - midpoint;
  - bad guys close in;
  - all is lost;
  - (dark night);
  - break into three;
  - finale;
  - final image, which mirrors the opening image.
- **The story spine** (Kenn Adams, 1991; taught at Pixar and listed as Pixar rule 4):
  - Once upon a time…
  - Every day…
  - Until one day…
  - Because of that… (repeated)
  - Until finally…
  - Ever since then…
  - The "Every day" line is the normal world, and "Until one day" is the catalyst.
- **Therefore / but, never "and then"** (Parker and Stone, NYU 2011). Between any two beats you should be able to write "therefore" or "but". If only "and then" fits, the story is a list of events. They write the linking words between the scenes of their outlines.
- **Pixar's rules** most useful here:
  - #1 admire the trying, more than the winning;
  - #6 put them against their comfort zone;
  - #7 know the ending first;
  - #13 give characters opinions, since passive is boring;
  - #16 give the stakes;
  - #19 no lucky escapes;
  - #22 find the essence and build out from it.
- **Short films** (Atkinson; Script and Pad; StudioBinder):
  - one want, one main conflict, one or two places, few characters;
  - the catalyst comes almost at once;
  - the ending changes something small but meaningful;
  - a twist should feel "surprising and inevitable".

### 1.3 Scenes
- **Goal, conflict, outcome.** Each scene has a character who wants something now, something opposing them, and an outcome. Swain adds that the outcome is usually a "disaster" (it's worse than before).
- **Every scene turns a value** (McKee). A value such as safe/unsafe or trust/betrayal flips from positive to negative, or back. If nothing flips, the scene is a "non-event"; if it exists only to give information, cut it and put the information somewhere else.
- **Enter late, leave early.** Skip the hellos and the arrivals. Start at the heart of the conflict, and cut as soon as the turn lands.
- **Scene and sequel** (Swain):
  - a scene is goal, conflict, disaster;
  - a sequel is reaction, dilemma, decision.
  - The sequel is the short beat where the hero feels the setback and chooses the next move. It is the link that makes the "therefore" visible.

### 1.4 Dialogue
- **Subtext.**
  - "On the nose" dialogue says exactly what someone feels ("I'm angry because you betrayed me").
  - Real people talk around it, and show it in what they do (No Film School).
- **Dialogue is action.** Every line is a move to change the other person: to ask, refuse, tease, warn, bargain, accuse or lie (McKee). A line that only reports what we can see is the narrator in disguise.
- **Distinct voices.** Cover the names and you should still know who is speaking.
- **Comic craft:**
  - setup, a beat, the punchline, then the take (the listener's reaction, or a look to camera);
  - the rule of three (twice the same, the third time it breaks);
  - callbacks, which are best when they return in a new context and a bigger form.
  - Tex Avery made the "take" (the startled reaction) a core animation tool (Cartoon Brew).
  - The Simpsons room held that no animation can save a joke that doesn't work on the page. Scripts there go through many passes, including a joke pass and rewrites after the table read and the animatic (No Film School; Slashfilm).
- **Bluey** (Joe Brumm) keeps each seven-minute episode to one small, domestic situation children know. The structure bends to fit the story, but it is always clear from the first moment what the game or problem is.
- **South Park:**
  - the plot is causal, joined by therefore and but;
  - the characters take absurd events completely seriously.

### 1.5 Narration
- **Voice-over is not bad in itself.** Kozloff (*Invisible Storytellers*) shows it can add closeness and irony. It works as:
  - a frame (a character telling the story afterwards);
  - irony (the narrator says one thing while the picture shows another);
  - a character's own voice.
- **It becomes a crutch** when it says what the picture already shows, or covers for a setup the scenes never dramatise.
- **Default for an acted film:** no narrator. The narrator never states the time, the place or the feelings.

### 1.6 Writing for animation
- **Animation scripts describe more than live-action scripts,** because everything on screen has to be drawn. The writer is the first director (Final Draft; No Film School).
- **Staging** (Disney's 12 principles):
  - present one idea at a time, as clearly as possible;
  - a pose should read in silhouette, so actions are shown side-on rather than front-on.
- **Geography:**
  - the establishing shot sets where everyone is and which way they face;
  - the 180-degree rule keeps two characters on the same sides of the screen across cuts;
  - breaking it confuses the viewer (StudioBinder).
- **Acting beats.** The reaction before the reply, the take and the held pause are written into the script, not left to chance.

### 1.7 Development
- **Logline test:** [hero] must [goal] despite [obstacle], or else [stakes], ideally with an ironic gap between who the hero is and what they are forced to do (Snyder; StudioBinder).
- **Beat sheet, then treatment, then script, then table read, then rewrite.** At the table read you listen for the places where readers stumble, where the energy dips, and where confusion or laughter happens (StudioBinder; Industrial Scripts).
- **Standard notes:**
  - What's it about?
  - Whose story is it?
  - What do they want?
  - Why now? (What makes today different from every other day.)
  - Why should I care?

### 1.8 Comedy and dark comedy
- **Ground the absurd.** Keep one unusual thing, and play everything else as real.
- **Heighten.** Each move pushes the same pattern further ("if this is true, what else is true?").
- **Deadpan.**
  - The characters must take it dead seriously, chasing their goal as if their life depends on it.
  - The spell breaks when someone remarks on how absurd it all is (Writing Academy; Writer's Digest).
  - Keep the lines short and precise.
- **Tone.** In a dark comedy the darkness is there from the first moment. It is not added halfway through.
- **Callbacks.** A callback pays off something planted earlier, and it escalates.

---

## 2. Rules by pipeline stage

Each rule has:
- an id;
- the words to put in the prompt;
- the check, where code can make one.

"New field" means a schema addition in `studio-schemas.ts` and `studio-story.ts`.

### 2.1 Premise (`studioPremise`, `checkPremise`)

**P1. Logline shape.**
- Prompt: "logline: one sentence, [hero by name] must [a goal we can see achieved] before or despite [one obstacle], or [what they lose]."
- Check: the logline has the name of a `main` character from the bible. It matches `/\b(must|has to|needs to|wants to|tries to)\b/` and `/\b(before|but|despite|while|until|or)\b/`. It has 8 to 40 words.

**P2. Explicit parts.**
- Prompt: "hero (id), want, obstacle, stakes, clock (by when and why that time, or null)."
- New fields: `hero`, `want`, `obstacle`, `clock`.
- Check: all are non-empty (except `clock`), and `hero` is a `main` id.

**P3. The want is visible.**
- Prompt: "want is a thing we will see them get or lose in one picture (the keys in hand, the kite in the air), never a feeling (respect, happiness, to be accepted)."
- Check: the want is not only abstract nouns. Flag it when all its stems are in an ABSTRACT list: happiness, respect, love, acceptance, success, freedom, peace, belonging, confidence, friendship.

**P4. The normal world.**
- Prompt: "normal: what an ordinary day is for the hero before this one, in one line; today: why the story starts today and not yesterday."
- New fields: `normal`, `today`.
- Check: both are non-empty, and `today` shares no more than half its stems with `normal`.

**P5. One impossible thing, with its rule.**
- Prompt: "oddity: the one thing that could not happen in the real world (a pigeon that bargains; a fridge that remembers), or null. rule: what it does and does not do, in one line. Everything else in the world is ordinary and behaves as it really would."
- New field: `oddity: {what, rule} | null`.
- Check:
  - comedy and dark comedy may have at most one oddity (the schema holds one);
  - if `oddity` is set, `rule` must be non-empty;
  - the table read's cold reader must be able to state the rule after the scene that uses it (T4).

**P6. Story spine.**
- Prompt: "spine: the story in six sentences starting 'Once upon a time', 'Every day', 'Until one day', 'Because of that', 'Until finally', 'Ever since then'."
- New field: `spine: string[6]`.
- Check: six entries, each starting with its opener (case-insensitive). The "Every day" sentence overlaps `normal`, and "Until one day" overlaps `today`.

**P7. Irony.**
- Prompt: "The hero is the last person you would pick for this problem, or the problem turns something familiar upside down."
- Check: none by code; the table read's `hook` item judges it.

**P8. Why care.**
- Prompt: "care: in one line, why the viewer is on the hero's side from the first moment: something they do, a small kindness, a small unfairness done to them."
- Check: non-empty.

### 2.2 Characters (`studioCharacters`, `checkPersonas`)

**C1. The hero's want is the premise's want.**
- Check: `covered(stems(persona.want), stems(premise.want)) >= 0.3` for `premise.hero`.

**C2. The obstacle has a face.**
- Prompt: "When what stands in the way is a person or an animal, they want something too, and it clashes with the hero's want."
- Check: if `premise.obstacle` names a cast member, that member has a non-empty `want` and a `relationships` entry toward the hero.

**C3. Relationships are shown in how they talk to each other.**
- Prompt: "address: how each one speaks to the hero: the name or word they use ('Dara', 'kiddo', 'Ms Reyes'), and whether they look up at them or down at them."
- Check: none by code; the cold read's "who is who" (T3) tests it.

**C4. Few faces to learn.**
- Prompt: "A film under two minutes has two or three speaking characters; under five minutes, at most four."
- Check: the count of `main` plus `supporting` is at most 3 when minutes ≤ 2.

**C5. Voices differ.**
- `lintVoices` already covers this.
- Add: no two characters share a pet phrase or the same sentence-length note.

### 2.3 Beats (`studioBeats`, `checkBeats`)

**B1. Therefore or but.**
- Prompt: "link, for every beat after the first: 'therefore' (it happens because of the beat before) or 'but' (something goes against it). Never 'and then'. If only 'and then' fits, the beat is in the wrong place or not needed."
- New field: `link: 'therefore' | 'but'`.
- Check:
  - every beat with index ≥ 1 has a link;
  - at least one "but" comes before the climax;
  - there are no more than three "therefore" links in a row.

**B2. The catalyst comes early.**
- Check: the first beat with role `inciting` or `problem` has index ≤ 1 for the `short` and `medium` templates, and ≤ 2 for `long`.

**B3. Each attempt costs more.**
- Check: for consecutive `attempt` beats, `covered(stops[k], stops[k-1]) < 0.6`, so the obstacle changes or grows. Intensity must rise, which `checkCurve` already checks.

**B4. No lucky escapes (Pixar 19).**
- Check: from the `turn` or `low` beat onward, flag `/\b(luckily|by chance|suddenly|just then|happens to|out of nowhere|a passer-?by)\b/`.
- The climax's `what` must name the hero, and its `changes` must follow from something the hero does.

**B5. A sequel after a setback.**
- Prompt: "After a failed attempt, the next beat shows the hero taking it in and choosing the next move (a reaction, then a decision), even in a line or a look."
- Check: a beat with `link: 'therefore'` follows every `attempt` that ends in failure.

**B6. Final image.**
- Prompt: "The last beat echoes the first: the same place, action or thing, now changed."
- Check: `covered(stems(last.what), stems(first.what)) >= 0.15`, or the last beat pays off a plant from beat 0.

**B7. Heighten the one game** (comedy).
- Prompt: "Each attempt pushes the same funny pattern further: if this is true, what else is true? No new absurd ideas; the oddity's rule stays fixed."
- Check: a comedy's `gag` stems appear in at least two beats.

### 2.4 Scene plan (`studioScenePlan`, `checkPlan`)

**S1. Scene 1 carries the setup, each piece with a means.**
- Prompt: "setup, for scene 1: for each of want, obstacle, stakes, clock and oddity (when the premise has them), how the viewer learns it: 'line' (who says it to whom, and why they would say it now), 'action' (what someone does) or 'thing' (a thing on screen: a notice, a clock, an envelope). Never the narrator."
- New field: `setup: {part, how, by, to}[]` on scene 0.
- Check: each non-null premise part has an entry, and `how` is never `narration`.

**S2. The value flips.**
- Prompt: "value: what is at stake in this scene (safe, trusted, winning, home) and its charge at the start and the end, '+' or '-'."
- New field: `value: {name, from, to}`, replacing the free-text `shift`.
- Check: `from !== to` in every scene; otherwise the scene gets merged or cut (this sharpens `noTurn`).

**S3. The first scene is long enough to set up.**
- Check: scene 1's seconds ≥ 20 (≥ 25 when minutes ≥ 2), and scene 1's cast has at most three people.

**S4. Newcomers one at a time.**
- Check: no scene brings in more than two characters we haven't seen before.

**S5. A scene is a clash.**
- Check: `conflict` names two sides (two cast ids, or a cast id and a thing), and matches `/\b(but|against|won't|refuses|blocks|before|unless)\b/`.

**S6. Enter late.**
- Prompt: "start: the first moment of the scene, already inside the trouble. Never arriving, greeting or waking up unless that is the trouble."
- New field: `start`.
- Check: `start` does not match `/^(\w+ )?(arrives|comes in|walks in|wakes|says hello|greets)/`.

**S7. Scenes link.**
- Prompt: "link, for every scene after the first: 'therefore' or 'but', as the beats do."
- Check: as in B1.

### 2.5 Scene writing (`studioScene`, `checkSheet`, `checkScript`)

**W1. Scene 1's first twenty to thirty seconds state the want, the obstacle and the clock.**
- Prompt: "By about twenty seconds into scene 1 (thirty in a film of two minutes or more), someone has said or shown what the hero wants, what stops them and by when, as the plan's setup says: through lines that do something to someone, or through actions and things. Not through a narrator."
- Check (new, `checkOpening`):
  1. Walk scene 1's beats with a running clock: lines at 2.5 words a second, action and business about 3 s, pauses their own seconds.
  2. Collect the stems said or handled by that point.
  3. Require `covered(stems(premise.want), said) >= 0.3`, the same for `obstacle`, and the same for `clock` when there is one.
  4. Report each part that is missing as a scene-1 note.

**W2. Lines do things.**
- Prompt: "aim, for every line: what the speaker is doing to the one they speak to, one of: asks, begs, orders, refuses, warns, threatens, bargains, teases, jokes, accuses, comforts, confesses, dodges, lies, reveals, praises. A line that only says what the viewer can see has no aim; cut it or give it one."
- New beat field: `aim`.
- Check:
  - every line has an aim from the list;
  - the same aim three times in a row from the same speaker is flagged;
  - `to` is non-null whenever someone else is on stage.

**W3. No reports** (extends `lintTelling`).
- Prompt: "No line describes what the speaker is doing, what the viewer can see, or the time on a clock we can see."
- Check, adding to what exists:
  1. **Talking to no one.** A `from: 'here'` line with `to: null` while the speaker is alone on stage. At most one such line a film, and only a question or an exclamation.
  2. **Status fragments.** Sentences of three words or fewer with no second person or question: `/^(it'?s|that'?s|\w+'s) \w+[.!]$/i` ("Door's locked.", "That's fine."). Flag them when two or more come in a row.

**W4. The clock is stated once, with a reason, then felt.**
- Prompt: "Say the deadline once, as a threat, a promise or a bargain between people ('Envelope under my door by midnight, or the locksmith comes at five past'). After that, it is felt through things and pressure: a clock face, a bell, a phone buzzing, someone glancing at it. Never announce the time."
- Check:
  - a narration beat containing `/\b\d{1,2}[:.]\d{2}\b|\b(\d+|one|two|three|five|ten) minutes?\b|\b(o'clock|midnight|noon)\b/i` is an error;
  - lines with a clock time appear at most twice a film, and never twice in one scene.

**W5. No "as you know".**
- Check: flag `/\b(as you know|like i (told|said)|as i (said|told)|you know (that )?i|remember (that|when) we|you already know)\b/i`.

**W6. No stated feelings.**
- Check: flag `/\bi(?:'m| am| feel)(?: so| really| very| a bit)? (sad|angry|mad|scared|afraid|nervous|jealous|happy|upset|worried|lonely|embarrassed|hurt)\b/i`, except in `from: 'thought'` lines, or when the ending is `moral` and it is the last scene.

**W7. Enter late.**
- Check: a scene's first line does not match `/^(hi|hello|hey|good (morning|afternoon|evening))\b/i` unless the plan's `start` says so.

**W8. Comic timing, where the tone is funny.**
- Prompt: "A joke (aim 'jokes' or 'teases') is followed by a pause or a reaction beat (the take) before the next line. The rule of three: twice the same, the third breaks it."
- Check: in comedy and dark comedy, every `jokes` line is followed within one beat by a `pause` or a `reaction`.

**W9. Deadpan.**
- Prompt: "In a comedy, nobody says how strange or crazy this is. They chase their goal as if their life depended on it."
- Check: flag `/\b(this is (so )?(crazy|insane|ridiculous|absurd|weird)|what is happening|are you kidding)\b/i` (a note, not an error).

**W10. The button.**
- Prompt: "The last beat is a laugh, a warm look or a callback, never a summary or a lesson."
- Check: the last scene's last line does not match `/\b(learned|the lesson|from now on|and that'?s why|the moral)\b/i` unless the ending is `moral`.

**W11. Length and rhythm.**
- Lines are usually 20 words or fewer.
- Check: no more than one line over 20 words a scene, and no speaker has three lines in a row without another beat between them.

### 2.6 Table read (`studioColdRead`, `studioTableRead`, `tableRead`)

**T1. The clarity sentence.**
- Ask the cold reader to finish: "[Who] wants [what] because [why it matters], but [what's in the way], by [when]."
- New field: `sentence`.
- Check:
  - `covered(stems(viewer.wants), stems(premise.want)) >= 0.4`;
  - `covered(stems(viewer.obstacle), stems(premise.obstacle)) >= 0.3`;
  - the viewer's `who` resolves to `premise.hero` through `castIdOf`.
- If any of these fail, the film is unclear whatever the model's score, so it is treated as below `BAR.clarity`.

**T2. The whole-film retell.**
- A second cold read over the whole `filmAsSeen`: "Retell it as a story spine. Between each scene, write 'therefore', 'but' or 'and then'."
- Check:
  - each "and then" the viewer writes is a note on the later scene of that join ("the viewer could not see why this follows");
  - an "Until finally" that doesn't match the planned climax is a note on the climax scene.

**T3. Who is who.**
- Ask the cold reader, for each person they saw: "What are they to the hero?"
- Check: a "could not tell" for anyone who speaks in scene 1 is a note on scene 1.

**T4. The oddity's rule.**
- Ask: "Was there anything impossible? What were its rules?"
- Check: when `premise.oddity` is set, the viewer's answer overlaps `oddity.rule` (covered ≥ 0.3) after the scene the plan sets it in.

**T5. Confusion is a failure.**
- Check: `confused.length >= 2` puts clarity below the bar. Each item goes to the scene the viewer names, or to scene 1 when they name none.

**T6. The reader is fresh.**
- The cold reader never sees the premise, the plan or the scene titles, only `filmAsSeen`. This is already true; keep it that way.

**T7. The studio notes, as rubric items.**
- Add to `RUBRIC`:
  - `why-now`: the viewer can tell why today is different;
  - `care`: something makes us side with the hero within the first scene.
- Their tests are the P4 and P8 wording.

### 2.7 Staging and camera (`studio-stage`, the camera cues)

**K1. Establish every new place.**
- The first shot of a set is wide.
- Hold 1.5 to 2.5 s of picture and ambience before the first line (the §3F establishing shot).
- Check: when a scene's set differs from the one before, beat 0 is not a `line`, or the camera opens `wide` with a lead-in hold.

**K2. The hero first.**
- In scene 1, the first close shot is on the hero, on the line that states the want.
- Check: the first `close` camera cue in scene 1 is `on: premise.hero`. If none is written, the stager picks it.

**K3. The 180 rule.**
- While two people talk, their left-to-right order stays the same.
- Check: between two lines of the same pair, their spot order flips only when an `action` beat moves one of them past the other.
- Over-the-shoulder shots keep each speaker on their own side.

**K4. One idea per shot.**
- Only one person does a big thing at a time, and the others react.
- Check: no two `action` or `business` beats by different people run back to back without a line or a reaction between them, except for a chase or a throw and its catch.

**K5. Show the plant.**
- A planted thing is handled on screen the first time it appears, held for at least 1 s, and seen close or at the front.
- Check: the first scene that plants it has a `business` beat with it as `thing`.
- A later addition: a `close` cue on a thing (an insert shot).

**K6. Silhouettes.**
- Giving, taking and reaching are staged side-on (3/4 or profile), so the arm reads against the background.
- Check (stager): during `give`, `take` and `reach`, the two people face each other, not the camera.

**K7. Space shows relationships.**
- People warm to each other stand closer; hostile ones further apart.
- The one who wins the scene ends nearer the centre, and the one who loses steps back.
- This comes from the relationship hint for each beat in §3 of the story plan.

**K8. The reaction shot.**
- After a line that lands (a joke, bad news, a threat), the listener's face is on screen within about a second.
- The existing "when a line lands, the one it is said to reacts" rule gets a camera cue to match.

---

## 3. The first minute (template for films of 0.5 to 10 minutes)

The same six jobs in every film. Only the clock changes.

| Job | ≤ 1 min film | 1–3 min | 3–10 min | How (never the narrator) |
|---|---|---|---|---|
| **1. Where** (establishing) | 0–2 s | 0–3 s | 0–5 s | a wide of the place, its ambience, a telling detail (a notice, a clock, a crowd) |
| **2. Who and their normal** (opening image) | 2–6 s | 3–10 s | 5–20 s | the hero doing their everyday thing, in a way that shows who they are and makes us care (P8) |
| **3. Catalyst** (why today) | by 8 s | by 15 s | by 30 s | the problem arrives, as an action or a line said to them by someone with a reason |
| **4. Want and obstacle** | by 15 s | by 25 s | by 45 s | the hero reacts and says or shows what they must get; the obstacle is seen on screen |
| **5. Stakes and clock** | by 20 s | by 35 s | by 60 s | said once, as a threat, a bargain or a promise between two people; a thing on screen keeps it |
| **6. The oddity and its rule** (if any) | by 25 s | by 45 s | by 75 s | shown working once before anyone depends on it; a character names the rule in their own words |
| **7. Commit** (break into two) | by 30 s | by 60 s | by 2 min | the hero's first move, which starts the "therefore" chain |

- In a 30-second film, jobs 3 to 5 may be one exchange, and job 7 is the attempt itself.
- In a film of ten minutes, the first minute holds jobs 1 to 5, and scene 2 is the debate and commitment.

---

## 4. The clarity test (for the table read)

After scene 1, a first-time viewer who saw only the film (`filmAsSeen`, scene 0) can finish this sentence without guessing:

> **[Hero] wants [a thing we can see] because [what it means to them], but [what's in the way], and [by when] or else [what they lose].**

**Pass (clarity ≥ 8):**
- every slot is filled from what was seen or said;
- `who` is the premise's hero;
- `wants` and `obstacle` overlap the premise (T1);
- there are no more than one `confused` item.

**Weak (5):** the viewer got the situation but not why it matters, or not the clock.

**Fail (≤ 3):** they could not say what it is about, or named the wrong hero. Scene 1 is rewritten with these notes:
- the viewer's own sentence;
- `FIRST_SCENE_RULE`;
- the plan's `setup` entries that were missing (S1).

**Second test, after the last scene (T2):** the viewer retells the film as a story spine, with "therefore" or "but" at every join. Each "and then" is a note.

---

## 5. Good and bad, side by side

The settings and names are varied on purpose. None of them is a default.

**Telling versus doing** (a harbour café in Valparaíso)
- Bad: TOMÁS: "I'm putting the last cup on the tray. Done."
- Good: Tomás balances the last cup on a tower of cups. TOMÁS (to his sister, not looking): "Breathe on it and you're paying for all twelve."

**"As you know"** (a mountain school in Nepal)
- Bad: PRIYA: "As you know, Grandma, the recital is at six and I've never played in front of anyone."
- Good: GRANDMA: "Six o'clock, and the whole village. Where's your flute?" Priya's hand goes to the flute case she has been hiding behind her back.

**Stated feeling versus subtext** (a laundromat in Lagos, Leeds or Lima: the line works anywhere)
- Bad: NIA: "I feel so jealous that you got the prize."
- Good: NIA (folding his shirt far too neatly): "Congratulations. Your collar's crooked. It's been crooked all day."

**The narrator as a crutch** (a night train in Hokkaido)
- Bad: NARRATOR: "Kenji was worried. The last stop was in ten minutes."
- Good: Kenji checks the ticket and then the dark window. He checks the ticket again. CONDUCTOR (passing): "Last stop, ten minutes. After that it's the depot, and I lock the doors."

**"And then" versus "therefore/but"** (beats, a kite contest in Karachi)
- Bad: Zara builds a kite. And then she goes to the contest. And then it rains. And then she wins.
- Good: Zara builds a kite from her brother's old shirt. But he wants the shirt back for school tomorrow. Therefore she has to win before sunset and return it. But the rain soaks the paper tail. Therefore she swaps the tail for the shirt's sleeve, which flies better.

**A premise piled on versus one grounded oddity** (an apartment block in Warsaw)
- Bad: the fridge talks, the cat is a detective, and the lift goes to the moon.
- Good: the fridge remembers everything that was ever put in it, and it tells anyone who opens it. Everything else is ordinary. Rule shown by 20 s: Ola opens it and it says, "Tuesday, 2 a.m.: one whole cake. Returned: none."

**Entering early versus late** (a market in Oaxaca)
- Bad: "Good morning, Rosa!" "Good morning, Luis! How are you?" …
- Good: the scene opens with Luis already holding the last mango; ROSA: "Put it down. I saw it first, I've seen it since Tuesday."

**A joke with no take versus one with a take** (a ferry in Istanbul)
- Bad: DENIZ: "The captain said no pets." (a cat climbs out of his coat) EMRE: "Let's go."
- Good: DENIZ: "The captain said no pets." Beat. The cat's head pokes out of Deniz's coat. Pause. Emre looks at the cat; the cat looks at Emre (the take). EMRE: "That's not a pet. That's luggage with opinions."

**The clock by narrator versus by people** (a village bakery in Wales)
- Bad: NARRATOR: "11:40. Twenty minutes to go."
- Good: MRS. PRICE (sliding the order slip across the counter): "Forty loaves by noon or the wedding eats crisps." Behind her, the kitchen clock. Later, Owen only glances at it and speeds up.

**A summary ending versus a button** (a rooftop in Seoul)
- Bad: JI-HO: "And that's how I learned that friends matter more than winning."
- Good: Ji-ho hands the trophy to Min; Min uses it to prop open the rooftop door, the way they propped it with a brick in scene 1 (a callback).

---

## 6. The New York opening, done properly

**What went wrong** (reconstructed from Richard's notes):

```
NARRATOR: 11:52 p.m.
DARA: It's 11:52. Door's locked. That's fine.
(a pigeon on a railing, holding keys; nobody explains it)
NARRATOR: 11:55 p.m.
```

- We don't know why the door matters, who the pigeon is, what midnight means, or what Dara wants.
- Each line reports the picture (W3), and the narrator announces the time (W4).

**The premise, as the new fields would hold it:**
- **hero** dara;
- **want** get back into her flat and slide the rent envelope under Mrs. Petrov's door;
- **obstacle** a pigeon has her keys and won't let go;
- **clock** midnight, when the locksmith Mrs. Petrov booked changes the lock;
- **normal** Dara comes home late from her shift and feeds the fire-escape pigeons her crusts;
- **today** tonight the rent is due, and one pigeon has taken her keys;
- **oddity** this pigeon trades: it gives up what it holds for anything shinier, and only shinier;
- **care** she's the only one in the building who feeds them.

**Spine:**
1. Once upon a time there was a nurse named Dara who rented the top flat from strict Mrs. Petrov.
2. Every day she came home after midnight and fed the fire-escape pigeons her crusts.
3. Until one day, with the rent due by midnight, a pigeon snatched her keys.
4. Because of that she offered bread, but it only wanted things that shine.
5. Because of that she traded up (a spoon, foil, her bike bell), but it always wanted something shinier, and midnight got closer.
6. Until finally she gave it the glitter hair clip her niece made her, and the keys dropped into her hand.
7. Ever since then the pigeon has been sitting on Mrs. Petrov's sill, wearing the clip.

**Scene 1, about 45 seconds (the first minute of a 2-minute film):**

```
EXT. BROWNSTONE STOOP – NIGHT
Wide: a stoop, a fire escape climbing past one dark window, a lit
ground-floor window with a kitchen clock inside. Traffic hum. (2 s, no words)

Dara, in scrubs, comes up the steps with a paper bag. She tears a crust
off a roll and tosses it up to the fire escape without looking: habit.
She reaches into her pocket. Pats it. Pats the other.        [normal, care]

A jingle from above. Dara looks up. On the rail, a PIGEON, her key ring
in its beak, a little plastic lemon swinging from it. The crust lies
untouched beside it.                                         [catalyst]

The ground-floor window slides up. MRS. PETROV, reading glasses on,
crossword in hand, doesn't look up.

MRS. PETROV (to Dara)            aim: warns
  Envelope under my door by midnight. The locksmith's booked
  for five past. He's already paid.                   [clock, stakes]

DARA (to Mrs. Petrov)            aim: bargains
  It's upstairs. On my table. With your name on it in glitter pen.

MRS. PETROV                      aim: dodges
  Then go upstairs.
The window slams. The clock behind the glass reads nearly twelve.

Dara looks at the pigeon. The pigeon looks at Dara. (pause: the take)

DARA (to the pigeon, sweetly)    aim: bargains
  Crust for the keys?                                 [want, obstacle]
She holds up the roll. The pigeon doesn't even turn its head.

A car passes; its headlights flash off the chrome of Dara's bike bell.
The pigeon's head snaps toward it and follows the shine, keys lowering.
                                                      [oddity shown]
DARA (slowly, to the pigeon)     aim: accuses
  You're not hungry. You're shopping.                 [rule named]
She reaches for the bell. Close on Dara.              [commit]
```

**Cold read, as it should come back:**

> Dara wants her keys back from a pigeon so she can get the rent under her landlady's door by midnight, or she'll be locked out. The pigeon only lets go for something shinier.

Every slot of §4 is filled. There is no narrator, and no line describes its own action. The time is said once, by the person who owns the deadline, and after that the clock is only seen.

---

## 7. Changes to the pipeline, most important first

1. **Scene 1 setup plan and opening check (S1, W1).**
   - Add `setup` to the plan's scene 0, and `hero`, `want`, `obstacle` and `clock` to the premise (P2).
   - Add `checkOpening`, which times scene 1 and requires the want, the obstacle and the clock by 20–30 s.
   - This is the direct fix for "no idea what it's about". It gives the scene writer a checklist rather than a hope.
2. **The clarity sentence, checked against the premise (T1, T3, T5).**
   - The cold read already exists. Add the `sentence` field and the "who is who" answers.
   - Make the code comparison with the premise decide `unclear()`, alongside the model's score.
   - Two or more confusions fail the film.
3. **Line aims and the report lints (W2, W3, W4).**
   - Give every line an `aim` from a fixed list.
   - Add the talking-to-no-one and status-fragment lints to `lintTelling`.
   - Ban times in narration, and state the clock only once.
   - Together these stop the "It's 11:52. Door's locked. That's fine." kind of line.
4. **Therefore/but links on beats and scenes (B1, S7) and the whole-film retell (T2).**
   - A new `link` field is cheap, and code can check it.
   - The retell tests whether the causes can be seen on screen.
5. **The oddity with its rule (P5, T4).** One structured field plus one cold-read question. This grounds absurd premises such as the pigeon.
6. **Normal world, "today" and care (P4, P6, P8) in the premise,** and the story spine as the premise's backbone. Wire P4 and P8 into the first-minute rows 2–3 of the scene writer's brief for scene 1.
7. **Value flips instead of free-text shifts (S2),** and "enter late" (S6, W7). This sharpens `noTurn` and stops scenes that open on greetings.
8. **Camera and staging for clarity (K1, K2, K3, K5).** A wide establishing hold with ambience before a set's first line, the hero's first close shot on the want line, the 180-degree order kept, and plants handled on screen. Later, a close shot on a thing.
9. **Comedy craft checks (W8, W9, B7, W10).** Takes after jokes, no remarking on the absurdity, heightening the one game, a button ending.
10. **The small lints (W5, W6, W11, C4)**: "as you know", stated feelings, long lines and speeches, and too many faces for a short film.

**Not to change:**
- `DEFAULT_NARRATOR = 'none'` is right. Keep it.
- `studioTableRead`'s fallback narrator text in `studio-tableread.ts` still says "the narrator a third of the words at most" when the maker left the narrator to the Studio. That contradicts the default and should read "no narrator". Flag this to the agent editing that file.
- Prompt wording in this note is written in the house style: plain words, one rule a sentence. Each rule can be pasted into the prompt block for its stage.

**Measuring it:** run the story bench's ten briefs, plus the New York brief, before and after each change. Track three numbers:
- the clarity score;
- the share of films whose T1 sentence matches the premise;
- the number of W3 and W4 flags a film.

---

## 8. Sources

- Trey Parker and Matt Stone at NYU (MTVU *Stand In*, 2011), transcript: https://speakola.com/arts/matt-stone-trey-parker-nyu-writing-class-2014
- "Writing Advice from South Park's Trey Parker and Matt Stone", Aerogramme Writers' Studio: https://www.aerogrammestudio.com/2014/03/06/writing-advice-from-south-parks-trey-parker-and-matt-stone/
- "Pixar's 22 Rules of Storytelling" (Emma Coats), Open Culture: https://www.openculture.com/2013/03/pixars_22_rules_of_good_storytelling.html
- "The Story Spine: Pixar's 4th Rule of Storytelling", Aerogramme: https://www.aerogrammestudio.com/2013/03/22/the-story-spine-pixars-4th-rule-of-storytelling/
- "Meet the creator of the Story Spine" (Kenn Adams), NPR, 2026: https://www.npr.org/2026/06/23/nx-s1-5750619/meet-the-creator-of-the-story-spine-an-8-sentence-tool-to-create-and-analyze-stories
- "Save the Cat Beat Sheet: The Ultimate Guide", Reedsy: https://reedsy.com/blog/guide/story-structure/save-the-cat-beat-sheet/
- "Reviewed: Save the Cat!" (Pope in the Pool, Double Mumbo Jumbo, Laying Pipe), The Story Department: https://www.thestorydepartment.com/reviewed-save-the-cat/
- Robert McKee, "Do Your Scenes Turn?": https://mckeestory.com/do-your-scenes-turn/
- "Exposition as Ammunition" (on McKee's *Dialogue*), Medium: https://medium.com/@pirangy/exposition-as-ammunition-robert-mckee-dialogue-the-art-of-verbal-action-for-the-page-stage-and-e9b38a4d2361
- "The Meaning of 'Start Late, Leave Early' in Screenwriting", No Film School: https://nofilmschool.com/start-late-leave-early
- "Scene and sequel" (Dwight Swain), Wikipedia: https://en.wikipedia.org/wiki/Scene_and_sequel
- "Scene Structure According to Swain", September C. Fawkes: https://www.septembercfawkes.com/2021/09/scene-structure-according-to-dwight-v.html
- "How to Avoid the 'As You Know, Bob' Trope", Helping Writers Become Authors: https://www.helpingwritersbecomeauthors.com/as-you-know-bob/
- "How to Conquer Exposition", StudioBinder: https://www.studiobinder.com/blog/what-is-exposition-definition/
- "What is 'On the Nose' Dialogue?", No Film School: https://nofilmschool.com/on-the-nose-dialogue
- UCB Improv 201 class notes (game, base reality, heightening), Drew Tarvin: https://drewtarvin.com/comedy/ucb-improv-201-class-notes/
- "6 Tips for Writing a Dark Comedy", Writer's Digest: https://www.writersdigest.com/write-better-fiction/6-tips-for-writing-a-dark-comedy
- "The Deadpan Rule", Writing Academy: https://blog.writingacademy.com/the-deadpan-rule-why-trying-to-be-funny-makes-your-comedy-fall-flat/
- "How to Keep Your Dark Comedy From Flopping", Mythcreants: https://mythcreants.com/blog/how-to-keep-your-dark-comedy-from-flopping/
- "Five Writing Lessons from The Simpsons", No Film School: https://nofilmschool.com/The-Simpsons-Screenwriting-Lessons
- "The Simpsons Writers' Room Had An Important Rule About Repetition", Slashfilm: https://www.slashfilm.com/1872104/the-simpsons-writers-room-repetition-rule/
- "A Thrilling Tour Through the History of Wild Takes in Animation", Cartoon Brew: https://www.cartoonbrew.com/cartoon-study/a-thrilling-tour-through-the-history-of-wild-takes-in-animation-243744.html
- "Bluey & The Limits of Structure", Kevin Mahoney: https://bykevinmahoney.com/bluey/
- "Bluey creator Joe Brumm", Peabody Awards: https://peabodyawards.com/stories/bluey-creator-joe-brumm/
- "What is the 180 Degree Rule in Film", StudioBinder: https://www.studiobinder.com/blog/what-is-the-180-degree-rule-film/
- "The 12 Principles of Animation", Bloop Animation: https://www.bloopanimation.com/the-12-principles-of-animation/
- "Principles of animation: Staging in story design and layout", DeeDee Studio: https://www.deedeestudio.net/en/post/principles-animation-staging-animation
- "The Simple Guide to Writing Animated Screenplays", Final Draft: https://www.finaldraft.com/blog/the-simple-guide-to-writing-animated-screenplays
- "Writing Screenplays for Animation", No Film School: https://nofilmschool.com/how-to-write-screenplay-for-animation
- Sarah Kozloff, *Invisible Storytellers: Voice-Over Narration in American Fiction Film* (University of California Press): https://www.degruyterbrill.com/document/doi/10.1525/9780520909663/html
- "Short Screenplays: Structure", Ruth Atkinson: https://ruthatkinson.com/short-screenplays-structure/
- "Writing Short Films", StudioBinder: https://www.studiobinder.com/blog/writing-short-films/
- "How to Write a One-Page Short Film", Script and Pad: https://scriptandpad.com/how-to-write-a-one-page-short-film/
- "How to Write a Logline that Producers Love", StudioBinder: https://www.studiobinder.com/blog/write-compelling-logline-examples/
- "3 Reasons You Need to Show Your Protagonist's Ordinary World", Final Draft: https://www.finaldraft.com/blog/3-reasons-you-need-to-show-your-protagonists-ordinary-world
- "What is a Table Read?", StudioBinder: https://www.studiobinder.com/blog/table-read-through/
- "Why You? Why Now? Why Will They Care?", Script Magazine: https://scriptmag.com/why-you-why-now-why-will-they-care

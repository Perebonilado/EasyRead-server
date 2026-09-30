# Studio faces: a rest, a reason, a rhythm (studio-faces-plan)

Richard said Studio story faces "change very often and in an incoherent way". The film is "The Star and the Manger", episode 01a0f241-407b-7bde-b617-9b700e5c9aa7. It has 5 scenes, runs 2.6 min, and is for young children (stage "early").

## Evidence (face rhythm check on the scenes as made)

- **116 face changes in 2.6 min** (45 a minute). Per person that is 20 a minute at the median and 28 at most (Mary, "The Last Door").
  - Median hold is 1.9 s. The shortest is 1 ms: the shepherd goes surprise → joy → surprise → shock within 140 ms.
- **38 short holds** (under 1.5 s), **73 crowded changes** (under 3 s apart), and **21 swings** between opposites under 3 s.
  - Mary goes joy → worried → tender/worried in 250 ms as she says "Do not worry for me".
  - Joseph goes angry → joy → relieved inside 1 s.
- **15 reactions that do not fit the line.** Mary meets Joseph's comforting "Mary, my dear, keep close" with fear, three times in scene 1.
  - Mary is annoyed when Joseph says "I don't know what to do", and annoyed at the shepherd's shy "I have nothing for him".
  - The sleeping baby looks surprised.
- 6.3 different faces per person per scene, with 18% of the time at full strength.

## Causes

1. **Two face layers fight.** The kit's old swapped faces (effects `show`) are the base of the rigged face, and every acted key eases back to that base.
   - The sheet's "determined" is the kit's *angry* (`FACE_OF_RECIPE`). So Joseph rests angry between gentle lines.
   - The listener's kit reaction (`LANDS`: angry → afraid) makes Mary afraid of a comfort.
   - `feltEffects` swaps a kit face in and back out for each reaction.
2. **Every line and every hit word makes a face.** Each line gets two keys (70%, then 100% on its key word). Each hit word gives the listener a key at full strength, and bystanders get one too, the infant included.
3. **Reactions rotate on purpose.** `reactionFace` refuses to repeat the face used for the last line ("never the same twice running").
4. **Flashes on lines that are not lies.** `lineFace` counts any glad face said over a low one as a lie. So a brave "Do not worry for me" flashes worry first.
5. **Nothing holds.** There is no baseline mood, no minimum hold, no rate limit and no opposite-swing rule. There is also no gentler scale for young children.

## Fix principles → changes

- **A rest per character per scene** (`SceneActingDto.rest`, set by the server's `scene-face-direct.ts` `withFaces`, which runs in compose for films).
  - The rest comes from the character's opening face and what they feel beneath their lines. It is softened (fear → worried, delight → joy), and where they show nothing, the scene's mood (serious → worried at 0.2).
  - It turns only at a turn of the scene: a story moment, or two feelings in a row the other way. Mary is sad, then glad once the stable is found. The shepherd is neutral, then worried, then glad.
  - The player rests at it instead of the kit's faces and eases between rests over 700 ms (`restAt`). Blinks now come on rest changes, not kit swaps.
- **A change needs a reason.** A line's own feeling becomes one face per line. A story moment the sheet gives (a reaction beat) is shown. A reaction to a line said to them is shown only when there is room. Blinks, darts and mouth shapes are life, not changes.
- **Hold and hysteresis.**
  - Hold is 2 s for young children (1.6 s otherwise). A reaction needs 3.5 s (3 s) clear of the change before it and after it.
  - A face that would go back to rest just before the next one is held into it instead. A thinking or surprised face is held on for 1 s at most.
  - No opposite within 3 s unless the story says so. A story moment during their own line is felt beneath it ("We will find a place": determined over pain).
  - A reaction like the last one reuses its face. `reactionFace` now keeps the last face when it can.
- **Coherence.**
  - A listener's face must fit the line (`reactionFits`). It is never the opposite, never fear or anger at a calm or kind line, and never anger at someone hurting. A worried line may be met tenderly.
  - A misfit is swapped for the gentle fitting face, or dropped.
  - Nobody asleep reacts. Only a dodge flashes (`lineFace` fix), and never for young children.
- **Strength.** For young children: rest 0.3, line 0.55, reaction 0.45, story moment 0.7, big moment 0.85. Harsh faces become their gentler kin (furious → angry, terror → fear, shock → surprise).
- **Transitions.** Faces ease in over 240 ms and out over 320 ms. The S7 wind-up is kept for takes only (a big surprise, fear or delight).
- **Deterministic and seek-exact.** Direction is a pure function of the made scene. Reduced motion shows the acted face at once, with no eases, blinks or darts.
- **Kit layer.** A determined line no longer frightens its listener (studio-stage `LANDS`). The kit's faces still dress drawings without a rigged face.
- **Lessons.** Only people the acting gave faces are directed, so a lesson's onlooker stays a lesson (isLesson).

## The check (scene-face-rhythm.ts)

For each person, the check reports changes a minute, holds, the recipes used, and the share of time at full strength. Issues are short holds, crowded changes, swings and mismatched reactions. The scene processor logs it as "face rhythm".

## After (the same scenes, directed)

- **50 changes** (19 a minute): 8 a minute per person at the median, 13 at most. The median hold is 6.5 s and the shortest 2 s.
- **0 short holds, 0 swings, 0 mismatches.** 4 crowded changes remain, each a story moment next to that person's own line.
- 3.9 faces per person per scene, and no full-strength time.


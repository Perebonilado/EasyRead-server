# Visualize: stories told by their characters

Richard's asks (2026-09-24), after watching the acting work:

1. **Fewer labels in stories.** Labels don't belong in the narrative. Musa standing with "kind", "helpful" and "calm" pointing at him has no reason to be there.
2. **A story's script should be driven by the story, not the narrator.** The characters talk to each other and interact; the narrator comes in subtly, only in certain places. Stories need a script of their own.

This plan builds on `visualize-acting` (dialogue voices, the rig, acting, stage directions from the words). It would live on a new branch, `visualize-story-script`, taken from it.

## 1. Labels on a story page

### Where they come from today

| Label | Where it's made | When it shows |
|---|---|---|
| A character's name under them | `thingDto` in `scene-compose.ts`, caption when `first` | The page the book first meets them |
| Their traits beside them ("kind", "helpful", "calm") | `introCallouts` in `scene-sheet.ts`, from `castStory` in `scene-story.ts` (`intro: who.traits`) | Same page, for about six seconds after they arrive |
| A prop's caption ("Box of long matches", "match") | `thingDto` in `scene-compose.ts`: every drawing is captioned with its name | Whenever the prop is on the stage |
| A prop's part labels ("wick") | The writer's `parts[].label`, and labels the artist adds | Whenever the drawing is on the stage |

The writer is also told that "the stage writes their name under them" and "writes what they are like beside them". So it plans an introduction shot for each new character: alone in the middle, being described.

### The approach: show, don't label

- **Nothing on a story's stage is a label.**
  - no names under characters;
  - no traits;
  - no captions under props;
  - no part labels, and no arrows.

  The only words on the stage are words that exist in the story's world: speech bubbles, and a sign, a letter or a book cover that the story itself shows. Lesson pages keep their labels, since there the labels are the teaching.
- **Who someone is comes from the story itself:**
  - The caption band under the picture puts the speaker's name before each line ("Ada: Tell us a story, Nana.").
  - Characters name each other in dialogue, and the narration names them when it introduces them.
  - When a character first appears, the camera pushes in gently on them.
- **Traits become how a character acts.** A trait sets their acting style instead of floating beside them:
  - "playful" or "impatient": quicker, bigger gestures; a hop when they first come on;
  - "wise" or "gentle": slow, deep nods, fewer gestures;
  - "shy" or "timid": small gestures, looks down more.

  A small table maps trait words to three settings (energy, size of gestures, how often they react), and the acting planner uses them. Unknown traits get the neutral style.

## 2. A script for stories

### What happens today (measured on the pages made while testing)

The story writer uses the lesson writer's format: narrated sentences with the characters' words quoted inside them ("Tell us a story, Nana," says Ada). The narrator therefore says most of every page:

| Page | The book's words in quotes | What characters say on the page | The narrator says |
|---|---|---|---|
| Fireside p1 | 56% | 37% | 63% |
| The Lost Goat p1 | 33% | 33% | 67% |
| Lantern Keeper p1 | 12% | 12% | 88% |
| Lantern Keeper p2 | 1% | 1% | 99% |
| Lantern Keeper p3 | 29% | 31% | 69% |
| Lantern Keeper p4 | 11% | 10% | 90% |

- **Attributions.** 12 to 42 narrator words per page are just "says Ada, rubbing his knee" around the lines.
- **Retelling.** The writer retells what the stage already shows ("Kofi leans closer to the fire").
- **Dropped lines.** It drops some of the book's lines: the fireside page keeps 55 of the book's 76 quoted words.
- **Staging problems.** The writer stages by swapping who is on screen, like close-ups: Mira alone, then Tobi alone. Characters then vanish while they are still in the scene or still talking.

### The approach: a screenplay

A story page is written as a short screenplay. It is its own format with its own writer prompt, schema and checks. There are three kinds of beat:

- **line:** a character speaks, in their own voice. It has no attribution, because everyone can see who is speaking. Each line has:
  - `who`, and `to`: the person they're talking to;
  - the words, kept as the book has them;
  - optionally a face (happy, afraid…) and a pace (whisper, excited).
- **action:** something the stage shows without words. For example, Kofi groans and shakes his head, Nana laughs, Ada pokes her brother, Baba Sule walks off down the road, or the flame goes out. It has:
  - `who`, `do` and `toward`;
  - a `hold` of 0.6 to 3 seconds of quiet (music and the place's sound carry it).
- **narration:** the narrator, briefly. Narration is only for what the stage can't show:
  - where and when we are when it changes;
  - time passing;
  - a sound or event off stage;
  - what someone thinks or feels inside.

  It never repeats a line or retells what the picture shows. It should be short (one sentence, a dozen words or fewer), placed at the openings and between exchanges.

The fireside page as a screenplay (today the narrator says 93 words; here, 12):

```
narration   A warm night. Ada, Kofi and their grandmother sit by the fire.
line  ada→nana   Tell us a story, Nana.
action kofi      groans, shakes his head                       (hold 0.8)
line  kofi→nana  Not the one about the tortoise again!
action nana      laughs                                        (hold 0.8)
line  nana→kofi  No, Kofi. Tonight I will tell you about the moon.
line  ada→nana   The moon? Does the moon have a story too?      (surprised)
line  nana→ada   Everything has a story, if you are quiet enough to listen.
action kofi      leans in toward the fire                      (hold 0.6)
line  kofi→nana  Then tell it quickly, Nana, before the fire goes out!
action ada→kofi  pokes him                                     (hold 0.6)
line  ada→kofi   Shh, Kofi. Let Nana speak.
action nana      looks up at the sky                           (hold 1.2)
line  nana       Long ago, the moon was not in the sky at all. She lived in a village, just like ours.
```

A page with almost no dialogue is carried by action instead. Lantern Keeper p2 has one whispered word:

```
narration   The quay is longer in the dark.               (wind, the sea)
action mira      walks on along the quay                  (hold 2.0)
action mira      strikes a match; the flame blooms        (hold 1.5)
narration   Then the rain comes, sideways and cold.
action           the flame shivers and goes out           (hold 1.2)
action mira      strikes another; the wind takes it       (hold 1.2)
narration   Somewhere in the fog, a boat's horn calls.
action mira      shivers; the matches fall                (hold 1.2)
line  mira       Please.                                  (whisper, afraid)
```

### What code owns, so the writer can't break it

- **Who is on stage.** Code places people from three things: who is there as the page opens, the arrivals and exits in action beats, and anyone who speaks. Everyone present stays on stage in a row, in the order the book met them. The writer no longer swaps people out to make a close-up.
- **The camera** makes the shots:
  - wide to open a page, after a change of place, and during narration;
  - a two-shot when two characters trade lines;
  - a gentle close-up for a line or reaction with a strong face (afraid, sad, surprised) or a whisper;
  - a push-in on someone the first time they appear.
- **Fidelity to the book.**
  - Every quoted line on the source page must appear, in order, with at least 80% of its words. If lines are missing or reworded, the page goes back to the writer, listing them.
  - Who says each line is read from the book's own text by the dialogue finder we already have. When it disagrees with the writer, the book wins.
  - Long speeches may be split into several lines, one bubble each. They are not paraphrased.
- **The narrator's share.** On a page whose book text is mostly dialogue, a script where narration is more than about a third of the spoken words goes back to the writer. Pages with little dialogue get a word cap on narration instead: short sentences, and action beats for the rest.
- **Reactions.** When a line lands, the listener reacts: a nod, a surprised face at a question or a shout, a laugh at a joke. These come from the line's pace and face, and from the action beats.

### Voice and rhythm

- **Lines** are spoken whole, in the speaker's voice. No quote matching is needed any more, since the beat itself says who speaks.
- **Narration** uses the narrator's voice at a slightly calmer pace.
- **Action beats are silence.** The piece before them gets a longer pause. The Kokoro server already allows up to 3 seconds (`PAUSE_LIMIT` in `speech/kokoro/voice.py`), so there is no voice server change.
- **Turn-taking** is conversational: about 0.3 s between lines in a quick exchange, longer after narration or a big moment.
- **A line's pace** (whisper, excited) sets its speed and the speaker's face. Volume per piece would need a voice server change, which is only worth doing later and only with your go-ahead to redeploy.

## Technical plan

**S1. No labels on story pages** (small; can ship on its own)
- **`scene-compose.ts`:** on a page with a story bible, drop captions for characters and drawings, drop trait callouts, and drop drawing callouts (part labels).
  - Words cards are allowed only for in-world text.
- **`scene.processor.ts`:** stop building `introCallouts` for stories.
- **`prompts.ts`:**
  - remove "writes their name under them" and "writes what they are like beside them";
  - stop asking for labelled parts on story props;
  - tell the story writer and artist that nothing on a story's stage is labelled.
- **Caption band:** each of `SceneDto.beats` carries the speaker's name (`who`), and `visual-pane.tsx` shows "Name: line".
- **Traits as acting style:** a trait table in `scene-acting.ts`, with style settings on `SceneActingDto`. The client scales gesture size by them.
- **Tests:** a story page has no captions or callouts; a lesson page is unchanged; the caption band shows the speaker's name; trait words map to styles.

**S2. The screenplay writer**
- A new `sceneScreenplay` prompt and `sceneScreenplaySchema` in `prompts.ts` and `schemas.ts` (`sceneStory` is already the story reader's name), containing:
  - beats (kind, who, to, words, do, toward, face, pace, hold, music);
  - who is there as the page opens;
  - props;
  - place changes.
- Guidance and two short examples in the style above. The learner's stage still shapes the narration: a little more for young children, very little for older readers.
- The processor chooses it for pages with a story bible. Close-reading pages of a literature book keep the lesson writer.

**S3. The story mend** (`scene-screenplay.ts`, new)
- **Checks:**
  - every character and prop is known;
  - speakers are checked against the book;
  - line fidelity and completeness;
  - the narrator's share;
  - holds are between 0.6 and 3 s.
- **Mapping:** `do` becomes the moves the stage already plays: hug, wave, reach, point, nod, laugh, walk on and off, faces, signs, prop states.
- **Output:** the same `SceneScript` compose already takes, with each line beat as one whole line and `beat.acts` for action beats. Compose, acting and the player change little.

**S4. Staging and camera by code** (`scene-screenplay.ts`)
- Steps are built from presence, props and places, with rows kept in the book's meeting order.
- Camera shots become zoom effects (one, or two for a two-shot). The existing cut, arrival and exit rules stay.

**S5. Voice and timing** (`scene-voice.ts`, `scene.processor.ts`, `scene-timing.ts`)
- Line beats go whole to the speaker's voice.
- Action beats become the previous piece's pause.
- A timed beat can have no words: it starts after the one before, lasts its hold, and `sentenceStarts` can handle it.
- Turn-taking gaps and pace per line.

**S6. Compose and player**
- One bubble per line: long lines split at sentences, never mid-sentence.
- Actions are acted at their beat.
- Listener reactions.
- The client's caption band gets the name before each line. Nothing else changes on the client.

**S7. Remake and watch**
- Remake the fireside page, The Lost Goat and The Lantern Keeper's four pages, and watch them on `/dev/stage`.
- Measure the characters' share of spoken words against the book's, the narration's word count, missing lines (should be zero) and labels on stage (should be zero).

**Later, if wanted:**
- Sound effects cued by action beats: a boat horn, a knock, footsteps, thunder. They'd replace some narration, but sourcing the sounds needs your OK.
- Weather that changes mid-page: "then the rain comes".
- Props changing hands: the matches go from Tobi's hand to Mira's.
- Volume per voice piece: a voice server redeploy.

## Checks

- **Numbers:**
  - story pages show 0 labels;
  - the characters' share of spoken words is at least the book's (the fireside page goes from 37% to about 85%);
  - narration is 12 words or fewer a sentence and at most a third of the words on dialogue pages;
  - 0 of the book's lines are missing.
- **Watching:**
  - Does it feel like a scene, not a reading?
  - Is it always clear who is speaking without names on stage?
  - Do quiet action moments land, and not drag?
  - Does a child still follow what happens?
- **Tests:**
  - the mend (fidelity, attribution against the book, send-backs);
  - staging from presence;
  - camera shots;
  - voice pieces with silences;
  - timing for beats without words;
  - captions with names;
  - no labels on story pages.

## Decisions for Richard

1. **Names on stage.** Recommended: none, with the name shown in the caption band before each line. Alternative: a name that fades in beside a character for two seconds the first time they appear.
2. **Fidelity.** Recommended: the book's lines kept as written (long speeches split, not paraphrased), and no new lines invented. Alternative: let the writer turn a narrated feeling into a short thought bubble in the character's voice.
3. **How subtle the narrator is.** Recommended: at most a third of the words on dialogue-heavy pages, a dozen words a sentence, in the same narrator voice at a calmer pace. Alternative: a separate storyteller voice for stories.
4. **Pages already made.** Recommended: only new pages use the screenplay; existing books change when a page is remade. Alternative: remake every story page on its next view, at the cost of one page make each.

## Costs

- **Writer:** about the same tokens as today.
- **Voice:** a little cheaper. There are fewer narrator words and the same number of lines, and silences are free.
- **No model is added.** Nothing changes on the voice server unless we choose per-piece volume.
- **Remade pages:** each costs one page make, as now.

## Order

1. S1 (labels) first: small and visible.
2. Then S2 to S6 together as one change, since the screenplay needs its mend, staging and voice to play.
3. Then S7.

## Status (2026-09-24)

Built and tested on `visualize-story-script` in both repos, with Richard's recommended choices. Nothing is pushed.

- **S1. No labels on story pages.**
  - no names, traits, captions or part labels, and a drawing's own label groups stay hidden;
  - the caption band shows "Name: line";
  - traits shape how a character moves: a lively one gestures on short lines and hops when first met, a calm one gestures less and nods, a shy one moves smaller and looks down.
- **S2–S6. The screenplay.**
  - `sceneScreenplay` writer: its prompt, schema, and a fake writer for runs without keys;
  - `scene-screenplay.ts` mender:
    - the book's lines are held to the book, and the book says who speaks each;
    - the narrator's share is capped;
    - actions become moments in the quiet after a line, and a run that asks for too long is spread over the quiet or sent back;
    - staging comes from who is there, arrivals (with whoever they bring), exits and speakers;
  - voice: lines whole in the speaker's voice, conversational gaps, action quiet up to the 3 s the voice holds;
  - compose: moments timed, the new moves acted;
  - camera: two-shots for a conversation of two while others stand by (9 s at most), close shots for a whisper, a shout or a strong face;
  - speech bubbles drawn over the camera, so they stay in frame and point at the speaker's head in every shot.
- **S7. Remade with the real writer:**

  | Page | Characters' share before | After | Narrator words before | After |
  |---|---|---|---|---|
  | Fireside p1 | 37% | 84% | 93 | 14 |
  | The Lost Goat p1 | 33% | 82% | 81 | 9 |
  | Lantern Keeper p1 | 12% | 33% | 135 | 36 |
  | Lantern Keeper p2 | 1% | 3% | 138 | 37 |
  | Lantern Keeper p3 | 31% | 76% | 85 | 12 |

  - No labels on any of these pages, and no page was sent back to the writer.
  - The fireside page kept all 76 of the book's quoted words.
  - Watched on `/dev/stage`: fade-in openings, two-shots, close shots, bubbles in frame, captions with names.
- **Tests:** server 1300, client 58. Type checks and lint are clean.

Still open:
- **Remakes waiting on credit.** The OpenAI account ran out of credit mid-test, so these still need a remake with the real writer:
  - the goat page, where the goat arrives with Baba Sule;
  - Lantern Keeper p2 (a long run of actions) and p4.

  The fixes are covered by unit tests.
- **Longer quiet.** Longer runs of wordless action need the voice server's 3 s pause limit raised, which is a redeploy.
- **Push and PRs**, when Richard says.

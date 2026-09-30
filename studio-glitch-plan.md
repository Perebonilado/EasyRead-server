# Studio glitch plan: flicker, pictures that disagree with their labels, text on text

Richard watched "Adolescent Health Medicine: Five Foundations" (show `01a0f182-c469…`,
episode `01a0f182-c496…`, 4:22, six explainer scenes, made from his document) on
2026-09-30 and found three faults:

> "around 3:36, there's a rapid switching of scenes which looks like a glitch. There's a
> label of parental care and education that the icons don't make sense. Some texts
> overlap."

This plan names each class of fault, what caused it in this film, and the code checks
that stop it. Every check is code. No model is asked and no rewrite round is added.
The film's own scenes are the test fixtures: server `domain/studio/__fixtures__/adolescent-health`
and client `lib/scene/__fixtures__/adolescent-health`.

## 1. Flicker: a stage quicker than the eye

**What happened.** Scene 5, "Talking So They Tell You", local 32.8–41.3 s (film 3:29–3:38),
had 15 stage changes in 8.5 s, some only 450 ms apart. The stage flipped between the
HEADSSS checklist and a row of the adolescent, the clinician and the list's items as
cards.

**Cause.** This was code, not the writer. `showSpokenLists` (scene-script.ts) turns a list
the voice reads out into cards:

1. It did not see that the list was already on the stage. "Home, Education or Employment,
   …" were the checklist's own named parts, and the writer pointed at each one in turn.
2. `stageAt` looked for "the stage at this word" in array order, not word order. It found
   the previous sentence's card row, not the checklist, so the cards came in beside the
   adolescent and the clinician.
3. Its "put back what the list replaced" loop brought the checklist back at every point
   effect. The next card then swapped the row back in, and this repeated through the list.
4. Nothing afterwards held a stage for a minimum time. `textPacing` did not run on this
   scene at all, because `isLesson` counted the clinician's "look at the adolescent" as
   acting.

**Fixes and checks.**
- `showSpokenLists`: a list counts as shown when its items are on the stage as things,
  as named parts, or as the parts the sentence points at. `stageAt` now goes by word
  order. When the page returns to a stage the list replaced, the rest of that list is
  dropped (no A-B-A). A sentence whose effects act on more than two things on the stage
  keeps its stage. `listsIn` keeps "Education or Employment" as one item when the list
  continues past it. An item never starts with the small word it hangs from ("of STIs"
  becomes "STIs").
- `isLesson` (server and client): a person who only turns to look at someone is still
  part of a lesson.
- **Hold.** `HOLD_MS = 1200` for adults. At a child's motion it is longer
  (`holdMsOf` = atMotion). `steadyStages`, run last in `textPacing`, applies these rules:
  - If a stage flips straight back, B is not shown.
  - If a quick stage only adds things, it joins the next stage.
  - Otherwise the next change waits until the stage has been held, if there is room.
  - If there is no room, the quick stage is not shown.
  - A zoom straight after a change, or just before one, is dropped.
- **Flicker check** (`flickersOf`), logged on every scene
  (`flicker check: …` in the worker log).
- **Player.** `steady.ts` applies the same rules to any lesson as it loads
  (`EpisodePlayer`, strip lab). Films already made, including this one, play without the
  glitch and do not need to be made again. `ringsAt` draws no ring around a part of
  something that is no longer on the stage (a ring was left in the air at 3:31).
- **The film as cut.** `editOf` keeps a hold between each join and the scene's first and
  last change. A short scene's two joins never come within a hold of each other.
  `filmFlickers(edit, scenes)` checks every change on the film's clock, joins included.
  A continuous build's `continue` join is left as it is.

Tests: `studio-glitch.spec.ts` (server) and `glitch.test.ts` (client). As made, the film
has ≥ 12 quick changes at 3:29–3:38. Composed now, or played with `steadied`, it has none,
and `filmFlickers` finds none.

## 2. A picture that is not what its label says

**What happened.** Scene 3 had three green brake calipers captioned "Parental support",
"Education" and "Positive peer influence". Each brief was "A large brake caliper icon,
green, with the words '…' underneath".

**Cause.** The narration said "Protective factors act like brakes". The outline's point
asked for "three brake icons", so the writer drew the comparison, not the subject, and the
three drawings differ only in their names. The artist (DeepSeek) followed the brief
faithfully. Neither the board's reuse by name nor any icon lookup played a part: this film
has no build, and there is no icon lookup in either repo. The Gemini picture check only
looks at story scenes, and it judges against the brief, which would have passed.

**Fixes and checks** (`scene-picture-label.ts`, by code):
- `picturesAgainstLabels`: a drawing disagrees with its label when its brief never names
  what the label says (quoted text on the drawing does not count) and either:
  - the brief draws the image of a comparison the voice makes ("like brakes"), or
  - the brief is drawn the same way as another drawing with a different label.

  A symbol on its own (a padlock for "Confidentiality") is left alone.
- `repairExplainer` shows each such drawing as its label in type (a keyword card), so it is
  never a puzzle. This runs at every make, so any remake of this film is correct. The
  problem also goes to the writer as a `picture` warning. Like `plain`, it is added to an
  existing send-back and never causes one on its own.
- Writer prompts (scene writer and explainer outline): draw what the name says, not the
  comparison, and never draw two different names the same way.
- Reuse matches by subject, not by kind and name. `keepIds` on a build's board and
  `carryOver` for a book's next page reuse a drawing only when `sameSubject` holds (same
  name and a brief about the same subject).
- Gemini is not needed. The code check decides this film's case with certainty, so it
  costs $0.

## 3. Words on words

**What happened.** The frame-by-frame DOM scan found no text lying on text while the
stage was still: the compose audit was right. The overlaps came from four places:

1. *In passing (45 in this film).* A card arrived at its place while the card it
   replaced was still fading or still sliding aside ("Employment" over "Education" at
   3:32, "Mood swings" over "Self-awareness", "Late 18–19" over "Identity"). A mover also
   slid through a leaver, and a newcomer was crossed by a mover.
2. *Words drawn inside a drawing.* The policy page's title ran over its seal, and
   "Confidentiality limits" sat under the gavel at the top of the ladder.
3. *Words cut short* ("Contracepti…", "Empowerm…", "Consent and confidentiali…").
4. The e5fix work covers arrow labels and captions on a build's board.

**Fixes and checks.**
- *An arrival waits for its room* (`roomWait`, `moveWait`, the same rules in timeline.ts
  and scene-reading.ts):
  - a newcomer arriving on something that is leaving waits until it has gone;
  - a newcomer on a mover's path waits until the mover has mostly moved;
  - when any mover's path crosses a leaver, every mover at that step waits for the leaver
    to go, all together so none runs into one still waiting; the leaver does not linger
    to be read (`exitHold`);
  - a moving drawing's stage-set labels go while it moves and return once it arrives,
    so they never slide into place over something still leaving (`calloutsAt`).
- *Words drawn in a drawing* (`scene-drawn-words.ts`, run in the gate):
  - Each run of drawn text is measured on ink maps against what is drawn around it.
    Text is judged about 30% wider than resvg sets it, because the stage's font (and Georgia,
    system-ui) can be wider.
  - A shape the text sits wholly on is its background. A faint mark or a line through a
    number does not count.
  - Text that partly covers a shape or other text is moved the shortest way that clears
    it, within the drawing, and shrunk no further than 65%. If that is not possible it is
    left in place and logged.
- *Words set whole* (scene-layout.ts):
  - A card uses the whole slot and shrinks to 20.
  - A caption can take three lines.
  - A word too long for any line breaks with a hyphen. Neither is ever cut short.
- *The text check* (`scene-text-check.ts`), logged on every scene
  (`text check: …`). It checks words against words and words against things, at every
  step of both stagings, and while the stage changes (sampled every 40 ms). It covers
  captions, cards, stat captions, labels and arrow labels. The client test replays
  `framesAt` every 40 ms of every scene and checks the same pairs as they are drawn.

## Proof on this film

`scripts/studio-film-check.ts --made` compares the film as made with `--fixture`, the
film re-composed from its saved sheets, voice and drawings. No database rows were changed
and no remake was run.

| | As made | Now |
|---|---|---|
| Flickers | 16 (15 in scene 5) | 0 |
| Words on words or things, standing | 0 | 0 |
| Words in passing | 45 | 0 |
| Pictures that disagree with their labels | 3 | 0 (set in type) |
| Drawn words over their drawing | 7 runs | 0 (moved clear) |

A DOM scan of the film in headless Chrome, every 250 ms, measures every visible run of
text for overlaps. It found 17 frames with words on words as made, and 0 both after
re-composing and with the player's fixes alone on the film as made. Frames at 3:30–3:45,
the label before and after, and the scans are in the session scratchpad `glitchfix/`.

## Still open

- A label too narrow for one of its words on the small staging ("harsh enviro…" in the
  box) is still cut short. It belongs with e5fix's label placement.
- Two things crossing on the way to their new places are motion, not text left on text,
  and are allowed.
- Book pages in the reader's player do not yet run `steadied` (they are made with the
  server's hold from now on).

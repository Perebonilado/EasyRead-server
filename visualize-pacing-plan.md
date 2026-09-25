# Visualize: a picture that keeps up with the narrator

Richard's report (2026-09-25): on pages that aren't stories, the picture hardly changes. The narrator stays on one idea for a while, but that idea has smaller ideas inside it, and the screen should move with them. It should change often enough to carry the learner along, but not so often that they're lost in animation.

## What happens now

Measured on the 205 explainer pages made locally:
- **How often it changes.** A 64-second page has about 7 stage changes and 13 effects. Many effects are pulses, a 6% swell on something already there, which barely reads as a change.
- **How long it stays still.** The longest stretch with nothing new averages 18 s. On many pages it's 30 to 60 s: page 2 of one book shows the same picture for 62 s.

The causes:
1. **The writer is asked, but nothing enforces it.** The writer is asked for a change "about every fifteen spoken words". Its draft is checked for quiet stretches (30 words with nothing changing) only when it's already going back for some other problem. A draft that's merely static is kept.
2. **Filling a quiet stretch is weak.** In a stretch over 6 s, compose adds a pulse on whatever is in focus. It's the same thing every time, and it isn't tied to what's being said.
3. **The camera never moves by itself on an explainer.** It holds still apart from a 3% drift. Stories get film shots; explainers don't.

## The rhythm we want

- A visible change as each small idea is said: roughly every 6–10 seconds, about 15–25 spoken words. A visible change means:
  - a new thing on stage;
  - a part pointed at with its label;
  - a state shown;
  - a keyword;
  - the camera moving in on something.
- Never a still stretch longer than about 12 seconds.
- Never two changes on top of each other: at least about 2.5 seconds apart, except a new thing and the point at it.
- What the voice is still talking about stays on stage. Within one idea, change how it's seen (a part, a close-up) rather than swapping the picture.

## The fixes

1. **The writer storyboards by small idea.** The prompt asks for:
   - one visible change on the first words of each small idea (a sentence, or a clause that says something new);
   - that rhythm, and the kinds of change to use within one idea;
   - no piling up of changes.
2. **A static draft goes back on its own.** A stretch of more than 40 spoken words (about 16 s) with nothing new sends the draft back, even with no other problem. The message names the stretch and asks for a change per small idea. Of the two drafts, the one with fewer problems and fewer still stretches is kept. That's one more cheap call, only for static pages.
3. **Code fills what's left with changes tied to the words, not pulses.** In a stretch still over 6 s, one change about every 6–7 s, at least 2.5 s from any other. In order of preference:
   - a part or label of a drawing on stage that the narrator names right then: point at it (it glows and its label shows);
   - a thing on stage the narrator names, when two or more are shown: the camera moves in on it for a few seconds, then back to the whole stage;
   - with two or more on stage, the camera moves in on the one in focus, then the next;
   - otherwise a pulse, as now.
4. **The log shows the rhythm.** Each page logs its longest still stretch and its changes per minute, so pacing can be watched in production.

## How we'll know
- Unit tests:
  - a static draft goes back;
  - the kept draft is the better of the two;
  - fillers point at a named part, close in on a named thing, keep their distance from other changes, and never overlap a change.
- Remake a few explainer pages locally and compare the longest still stretch and changes per minute, before and after.

## Costs
- One extra writer call (gpt-4o-mini) only for a page whose draft is still for more than about 16 s.
- The fillers and the log cost nothing.

## Status (2026-09-25): built and tested, on branch `visualize-pacing`

All four fixes are in, and all 1,477 server tests pass. The client needed no change, since it already plays a timed close-up on any page.

**Four of the stillest explainer pages, remade locally:**

| Page | Originally | Writer on gpt-4o-mini | Writer on gpt-4.1 |
|---|---|---|---|
| Book 5d4649, p77 | still 20 s, 7.6 changes/min | still 53 s, 1.1 changes/min | still 12 s, 10.6 changes/min |
| Book 5d4649, p84 | still 22 s, 7.3 changes/min | still 56 s, 2.7 changes/min | still 10 s, 11.1 changes/min |
| Book b922c9, p10 | still 55 s, 5.3 changes/min | still 7 s, but a 16–57 s video | still 13 s, 10.3 changes/min |
| Book 65e51b, p6 | still 38 s, 6.7 changes/min | still 35 s, 7.7 changes/min | still 23 s, 10.7 changes/min |

- **With gpt-4.1 writing**, the pacing fixes bring pages close to the target: a change every 6 s or so, rarely still for more than 12 s.
- **With gpt-4o-mini writing**, which production has used since this morning, a page often keeps one drawing for its whole length. Sent back, it still does, and the code can only point at parts the narrator names, or pulse. It also sometimes writes a much shorter video.

The pacing depends on the writer model more than on anything here.

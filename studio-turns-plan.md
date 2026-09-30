# Studio turns: smooth, motivated, steady (studio-turns-plan)

Richard: characters turn "very swiftly and quite inconsistently … always a need to face the audience". Film: "The Star and the Manger" (episode 01a0f241-407b-7bde-b617-9b700e5c9aa7), 5 scenes, 2.6 min.

## Evidence (turn check on the scenes as made)

- 111 turns in 2.6 min: **43 turns a minute**, up to 27 a minute for one person. Mary's shortest gap is 650 ms.
- **27 flip-backs** (A→B→A within 2 s). Mary goes 3q-left → front → 3q-left at 5.58 s / 6.23 s just because she glances down.
- **44 unmotivated turns to camera.** Everyone in "Come In, Friend" snaps to front at 4.86 s, a pause between lines.
- **23 whips** (≥135° in one key). One is profile → profile-left in 0.12 s. The baby in the manger turns its back twice.
- The player drew **235 of 235 view changes as a swap in one frame** at 30 fps: a 60 ms step with no in-between.

## Causes

1. `scene-views.ts facingAt`: when `look` is null (a pause between lines, "look at the viewer" in `scene-acting sweep`), facing is 0, which is the front. A glance (turn < 0.3), `@down` and `@up` all give the front too, so any glance turned the body to the camera.
2. Hold is only 400 ms, and there is no rule against flipping back. Every look key, every speech start or end ±200 ms, and every step became a body turn.
3. Looks at someone behind turned the body to back or back3q. Nothing checked lying or sitting, so the baby lying in the manger turned to its back.
4. Client `views.ts viewNow`: a turn is a class swap, 60 ms a view. A squash widened the figure, the head did not lead, and a turn at a camera cut was animated as if the person spun.

## Fix principles → changes

- **Facing is motivated (server `viewsOf`, world pass).** Each moment gets a reason: use, walk, lie, hug, speak, listen, look, rest or off.
  - A glance, a look up or down, or nothing new to look at keeps the facing the person already has. Only the head moves.
  - With nothing to face, a person rests three-quarter toward the others. After a walk, they turn to the others, or open to three-quarter the way they went.
  - A look turns someone round to profile at most, never their back. Speakers already never showed their back.
  - Lying down faces up to us. Seated, a person turns no further than three-quarter.
  - A person coming on stage already faces the way they will, so there is no turn on entry.
  - The camera cheat is only for the current speaker in their own close shot. Everyone is front for an insert, which lands between two cuts, so the thing sits where the insert frames it.
- **Hysteresis (`steadyFacings`).**
  - Hold at least 1.5 s. A turn wanted sooner waits until the hold is up, and is dropped if it is no longer wanted.
  - These turn at once: a walk, a thing used, lying down, a hug, their own new line, someone new speaking to them, a cut, or the end of any of those.
  - No A→B→A, or A→B→next to A, within 2 s, except for walks or things used.
- **Turns are smooth (client `views.ts`).**
  - The head leads by 120 ms: the face slides (`turn`, ±0.6) toward the turn.
  - The body passes through every view in between, 130 ms a view. Each drawing cross-blends into the next over the second half of its step: the one on top fades while the one below stays full, so the figure is never see-through. The body narrows 5% as it goes edge on.
  - Front to three-quarter takes about 250 ms, and profile to the opposite profile about 640 ms.
  - A turn that interrupts another starts from where the body actually is.
  - At a camera cut (`cameraCuts`) the view changes at once.
  - All of this is pure in t, so it is deterministic and seek-exact. Under reduced motion, the acting and views are off, as before.
- **Check (`scene-turns-check.ts`).** It reports turns a minute, gaps, whips, flip-backs, short holds and unmotivated faces to camera. It is logged per scene ("turn check:") and tested on the Nativity fixtures (`studio/__fixtures__/nativity`, client `__fixtures__/nativity`).
- **Knock-on fix.** A lesson with a person who only looks (a host, a clinician) now gets `view` keys because of the rest facing. `isLesson` (server `scene-reading.ts`, client `reading.ts`) now ignores `view` as well as `look`, so its text is still paced.

## Results (same scenes, views re-made by code, no model calls)

| | before | after |
|---|---|---|
| turns / min | 42.9 | 10.4 |
| flip-backs | 27 | 0 |
| short holds (<1.5 s) | 5 | 0 |
| unmotivated to camera | 44 | 1 (Joseph looks at the shepherd standing straight in front of him) |
| whips ≥135° | 23 | 2 (both motivated: a new person addressed, and someone walking past) |
| drawing swaps in one frame (30 fps, not at cuts) | 235 / 235 | 0 / 58 (all blended) |
| speakers' faces seen | 95.4% | 95.4% |

Strips at 12–15 fps: `1-*` Mary glancing down, `2-*` Joseph turning to speak, `3-*` Joseph and the shepherd turning in "Come In, Friend".

## Not done / next

- Built films keep their stored views until they are re-made. Richard's episode needs a scene remake, with no model calls, to get the new views.
- The rig still has five discrete drawings. A true head-only rotation in profile or back views, where `.fm` ignores `--turn`, would need figure-kit work.
- The walking face turn (`a.turn = walking·0.8`) still switches on at the walk's start. It could ease in.

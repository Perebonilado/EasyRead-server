# Tutor pace & check-in control — plan

User feedback, verbatim in spirit: the tutor teaches too slowly, checks in
too often before the student has even settled into the material, and —
worst — goes quiet at the end of a thought and waits for the student to
speak. Students should set their own speed once, before their first
lesson, and the tutor should keep teaching until interrupted, not the
other way round.

## 1. What already exists (and gets reused, not duplicated)

The learner profile already models exactly these two dials:

| User-facing | Existing field | Values | Default |
|---|---|---|---|
| Learning speed | `pace` | slower / steady / faster | steady (= Medium) ✓ |
| Check-in rate | `interactivity` | less / standard / more | standard (= Medium) ✓ |

Each dial carries a source — `default | auto | manual` — and the
auto-adjust reflex is already forbidden from touching a `manual` dial.
`profileInstructions()` already injects both into every tutor prompt
(voice, chat, recap, groups). The settings screen's TeachingPanel already
edits them.

So this feature is NOT new state. It is: a first-run moment, a stronger
override, honest wording, and a fix to the silence behaviour.

## 2. The gaps, precisely

**Gap A — nothing asks the student.** The dials exist but start at
defaults and move only by auto-adjustment. Nobody is ever asked, so slow
felt like the app's opinion rather than a setting they missed.

**Gap B — "manual" does not actually override everything.**
`effectiveProfile()` applies per-document deltas on top of the profile
regardless of source. A student who picks Fast could still be slowed down
by a document delta. The requirement says explicit choice wins over
everything: deltas must be skipped for any field whose source is
`manual`.

**Gap C — the silence.** Two causes, needing two fixes:
- The prompt says "smaller pieces, one at a time" for slow pace but never
  says *keep going*. Every pace level needs an explicit continuous-delivery
  clause: "Do not stop and wait for the student. Keep teaching until they
  interrupt. Never ask 'shall I continue?'"
- Mechanically, a realtime model *stops at the end of its response* no
  matter what the prompt says. The client must auto-continue: when the
  tutor finishes speaking and the student stays silent for N seconds, the
  client sends a silent "continue the lesson" nudge. N scales with pace
  (Fast ≈ 1.5s, Medium ≈ 3s, Slow ≈ 5s). The same loop server-side in the
  group-lesson gateway. This is the fix for "pauses until I say go on" —
  the words "go on" become unnecessary rather than better-detected.

**Gap D — check-in timing, not just quantity.** The complaint says checks
came "before they'd gotten into the material". The `less/standard/more`
wording becomes concrete: at Low, check only at the end of a chapter; at
Medium, at most one check per topic *after* it has been taught; at High,
as today. Early-lesson checks are suppressed at every level: never check
inside the first few minutes of a topic.

## 3. The first-run moment

**When:** the student opens Teach Me (or starts hosting a group lesson)
and both `paceSource` and `interactivitySource` are `default` — meaning no
human has ever chosen. That is the whole first-time test; no new flag.

**What:** one step inserted into the existing intro screen (not a separate
modal): "How should Sam teach you?" — two rows of three pills, Slow /
Medium / Fast and check-ins Low / Medium / High, Medium pre-selected on
both, one Start button. Saving writes the profile with source `manual`.
Skipping it (X or just starting) keeps defaults and does not ask again —
asking twice is nagging.

**Later:** the intro already shows a one-line summary of how the lesson
will be taught ("going slower · checking in often"). That line becomes
tappable — "Change" — opening the same two-row control on request. The
TeachingPanel in Settings stays as the third place to change it. All three
write the same fields.

**Groups:** the host's profile drives the group session (one lesson, one
pace). Same first-run step when the host starts their first session.

## 4. Override semantics (the "overrides all other settings" rule)

Once a student has chosen (source `manual`):
1. Auto-adjust never touches it — already enforced, kept.
2. Per-document deltas are ignored for that field — the Gap B fix in
   `effectiveProfile()`.
3. Promotion (deltas becoming global patterns) skips manual fields too.
4. The tutor prompt keeps saying "this overrides your default style", and
   the continuous-delivery clause is appended at every pace.

Auto-adaptation continues to work fully for students who never choose —
choosing is what freezes it, releasing a dial back happens in Settings
(the existing source→auto affordance in TeachingPanel).

## 5. Change list, by file

Server:
- `learner-profile.ts` — PACE/INTERACTIVITY spoken wording rewritten:
  continuous-delivery clause per pace; concrete check-in quotas per level;
  "never ask permission to continue".
- `learning.ts` `effectiveProfile()` — skip deltas for manual-source
  fields; same guard in promotion.
- `voice.handlers.ts` / `group-lesson.ts` — pass the pace value to the
  client in session config (for the nudge timer); gateway auto-continue
  for groups.
- Existing PATCH profile endpoint — already writes manual sources; verify,
  no new API expected.

Client:
- `study-mode.tsx` — first-run step in the intro (condition: both sources
  `default`); "Change" affordance on the summary line; auto-continue
  nudge: on `response.done` + N seconds of silence → send "continue"
  (text event, not spoken); N from pace.
- `voice-panel.tsx` — same nudge loop for the 1:1 reading companion.
- Groups host start screen — same first-run step.
- `teaching-panel.tsx` — wording aligned (Slow/Medium/Fast), no structural
  change.

Tests: effectiveProfile manual-override cases; promotion skip; wording
snapshots for each pace/check-in combination; nudge-timer unit logic
(pure function: elapsed + pace → nudge?).

## 6. Order of work

1. Gap B (override) + wording — server-only, immediately testable.
2. First-run step + change affordance — visible win.
3. Auto-continue nudge, 1:1 — the silence fix users actually asked for.
4. Groups: host first-run + gateway nudge.

## 7. Open questions (small)

1. Group members other than the host: no control (host decides) — assumed.
2. "Skip" on first-run = accept Medium silently — assumed, no re-ask.
3. Nudge cap: after ~3 unanswered nudges, ask one soft "still with me?"
   rather than reading the whole chapter to an empty room — assumed yes,
   it also protects voice minutes.

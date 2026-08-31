# The board follows the voice — technical plan

Today's Teach Me reveals the simplified page point by point: the tutor
calls `reveal_point`, pre-written text appears, and the instructions then
have to beg the model not to read it aloud. That is a teleprompter, not a
classroom. A real teacher talks, and writes on the board only the few
words worth keeping — the board trails the voice, it never scripts it.

## 0. The decisive constraint: latency

Three ways to get writing on a board, and only one keeps the tutor
talking:

**A. Tool calls (how groups do it).** The tutor calls `write_note`
mid-lesson. In the realtime API a function call ends the audio response:
call → tool output → response.create → new response. Every note costs
1–3 seconds of dead air plus the model's attention. Fine at group
cadence (a note a minute); wrong for 1:1 where the board should catch
every key point.

**B. Pre-scripted board.** Generate the points per page ahead of time and
show them as the tutor goes. This is `reveal_point` with new paint — the
exact experience being replaced. The tutor improvises, answers questions,
reorders; a script desyncs immediately. Rejected.

**C. A scribe that follows the speech (chosen).** Both transports already
emit the tutor's own words as they are spoken
(`response.output_audio_transcript.delta` — the ElevenLabs adapter
normalises to the same events). Stream those into a tiny, fast model that
does one job: decide whether the sentence just spoken contains a point
worth chalking, and if so compress it to a board line. The tutor never
stops talking; the chalk lands about a second behind the voice, exactly
like a real classroom.

## 1. Architecture (C in detail)

```
tutor speech (audio)
  └─ transcript deltas ──► sentence segmenter ──► batcher (1 in flight)
                                                     │ POST /voice/board-scribe
                                                     ▼
                                        BoardScribeHandler ── llm.scribeBoard()
                                                     │   (haiku-class, strict schema)
                                                     ▼
                                        { notes: string[] }  0..2 short lines
                                                     │
                                          reader-store board (kind: "note")
                                                     ▼
                                       LessonBoard, write-on animation
```

**Segmenter (client, pure).** Accumulates deltas; flushes on sentence end
(`.` `?` `!`) or ~140 chars. Drops sub-5-word fragments and pure fillers.
Pure function, unit-testable.

**Batcher (client).** One scribe request in flight; sentences arriving
meanwhile queue and go as the next batch. Order preserved, QPS capped by
construction. A failed batch is dropped silently — a sparser board, never
a broken lesson.

**Scribe endpoint (server).** `POST /voice/board-scribe`
`{ documentId, pageNumber, sentences[], recentNotes[] }` →
`{ notes: string[] }`. Auth + document access as every reader route.
Rate-capped per user. Metered under the live voice session (the student
is already paying voice minutes; the scribe is part of the lesson).

**The scribe task (LLM port, new task `board_scribe`).** Haiku-tier via
the existing per-task model routing (`AI_MODEL_BOARD_SCRIBE`). Prompt in
one breath: you are the tutor's chalk hand; given the sentences just
spoken, write at most one or two board lines of ≤ 9 words each, only for
NEW key ideas; given greetings, logistics, questions to the student, or
anything already on the board (recentNotes), return none. Strict zod
schema; temperature low.

**Quality anchors.** The request carries the current topic title and the
last ~6 notes. Dedup is the scribe's job by prompt AND the client's by
normalised-text check — belt and braces, both cheap.

**Board (client).** New `BoardItem` kind `note { text, pageNumber }` next
to diagram/sketch/math/images. LessonBoard groups notes under the page
they were taught from, newest section on top; a short write-on animation
(CSS, no per-character timers). Diagrams keep their existing tool path —
a diagram is a deliberate artifact, worth its turn boundary; prose notes
are not.

**The stage.** The revealed-points panel stops being the lesson surface.
The student sees the page (original or simplified, as now) and the board
filling with the teacher's short words beside it. `reveal_point` is
removed from the teach toolset and its instructions; the "never read the
revealed point aloud" contortions go with it.

## 2. Latency budget (speech → chalk)

| Stage | Typical |
|---|---|
| transcript delta arrives | ~0 ms (already streaming) |
| sentence completes | 0–800 ms (speech finishing the sentence) |
| batcher queue wait | 0–600 ms (previous call in flight) |
| scribe model call | 300–700 ms (haiku-class, ~200 tokens round trip) |
| render + animation start | ~16 ms |

**Net: the chalk lands 0.8–1.6 s behind the spoken word, with zero added
silence.** The tool-call alternative costs 1–3 s of dead air per note.
The board being a beat behind the voice is not a defect — it is exactly
what a real board does.

## 3. Cost

One scribe call per ~8–12 s of speech → ~100–150 calls in a 20-minute
lesson at ~200 tokens each ≈ 25k tokens of haiku-class usage per lesson —
fractions of a cent, dwarfed by the realtime audio itself.

## 4. What changes where

Server:
- `llm.port.ts` + adapters — task `board_scribe`, `scribeBoard()` on the
  port, fake-adapter stub (first sentence's first 6 words, so local dev
  writes a board without a key).
- `prompts.ts` — the scribe prompt; `schemas.ts` — the note schema.
- `voice.handlers.ts` — `BoardScribeHandler` (access check, clamp, rate
  cap); teach-mode instruction rewrite: teach page by page, the board
  writes itself from your speech, never announce or read it; keep
  diagrams/checks/page-turn instructions as they are.
- `models.ts` — `AI_MODEL_BOARD_SCRIBE` routing knob.
- Controller route beside the other voice routes.

Client:
- `voice/board-scribe.ts` (new) — segmenter + batcher, pure and tested.
- `realtime.ts` — nothing: transcript events already flow through
  `onEvent`; study-mode subscribes instead of ignoring them.
- `reader-store.ts` — `note` board item + `addBoardNote` with dedup.
- `lesson-board.tsx` — render notes grouped by page, write-on animation.
- `study-mode.tsx` — feed `onEvent` transcripts into the scribe; retire
  the reveal stage surface; `teach-tools.ts` — drop `reveal_point`.

## 5. Testing

- Unit: segmenter (delta streams → sentences, fillers dropped), batcher
  (backpressure, order, drop-on-error), note dedup, scribe schema clamp
  (over-long lines truncated, >2 notes cut).
- Server: handler spec — access refused, rate cap, fake-LLM round trip.
- Integration: fake adapter end-to-end in dev — speak, watch the board.
- Live: timestamp sentence-done vs note-render; assert p50 lag under 2 s.
- Regression: teach instructions contain no "reveal"; toolset has no
  `reveal_point`.

## 6. Phasing

1. Server scribe (port task, prompt, handler, route, fake stub) + specs.
2. Client segmenter/batcher + board note kind + animation; instruction
   rewrite; reveal retired. **This is the experience change.**
3. Persistence: board notes saved to the notebook at session end, under
   the document (they are already the lesson's summary).
4. Groups: the gateway sees the same transcript server-side; route it
   through the same scribe so group boards stop paying the tool-call tax
   for prose notes (write_note stays for deliberate emphasis).

## 7. Open questions

1. Should the student be able to tap a board note to jump to its page?
   (Cheap: notes carry pageNumber already. Assumed yes.)
2. Wipe or scroll between topics? Assumed scroll — the notes double as
   revision material, and phase 3 saves them.
3. Keep `reveal_point` for the recall ritual (`recallPage`) which hides
   the page? Recall uses its own tool and is unaffected. Assumed no
   other consumer.

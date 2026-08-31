# Testing engine: what AI Examiner has, and what EasiRead should build

An audit of AI Examiner's question system and a plan to bring it into
EasiRead. The short version: AI Examiner has the **generation breadth**,
EasiRead already has the **measurement layer** AI Examiner never built. The
10x is not more question types. It is grounding, scheduling and measurement
wrapped around them.

## 1. What AI Examiner has today

**Five question types**, via a lookup table: Multiple Choice, Multiple
True-False, Flash Cards, Oral (Viva), Essay.

**Generation pipeline** (`QuestionsController.generateQuestionsV2`):

1. Resolve topics to source text: selected topic ids give page ranges,
   which hit Pinecone by chunk index; otherwise topic titles do a semantic
   search. Falls back to OpenAI file search when both come back empty.
2. Batch: max 5 questions per LLM call (20 for flashcards), chunks
   distributed evenly across batches, batches issued in parallel.
3. Each call is a `generateObject` against a per-type Zod schema, prompted
   by `generatePromptForQuestionsV2`.
4. The last 20 previously generated questions are passed in to discourage
   repeats.
5. Results are concatenated, given UUIDs, and saved.

**What is genuinely good and worth keeping:**

- Retrieval before generation. Questions are written against retrieved
  chunks, not the whole document. That is the right shape.
- Parallel batching. Latency stays flat as question count grows.
- Per-question topic tagging, with the prompt insisting on precision.
- Previous-question context as an anti-repetition measure.
- Type-specific option semantics (flashcards carry one option; viva and
  essay carry none) expressed in the schema itself.
- The `Multiple True-False` type. Underrated: it tests nuance in a way
  4-option MCQ cannot, and the statement-mutation guidance behind it
  (qualifier swaps, threshold shifts, cause/effect inversions) is the most
  sophisticated prompt engineering in the codebase.

## 2. Where it falls down

Ordered by how much it costs the learner.

**1. There is no spaced repetition. At all.** `QuestionProgress.status` is
`in_progress | submitted` — resume state for an in-flight test, nothing
more. Nothing schedules a second encounter with an item. This is the
single largest miss: the retention benefit of testing comes from
*distributed* retrieval practice, and a test you take once and never see
again captures almost none of it.

**2. A question set is one JSON blob.** `QuestionModel.data` holds the
entire set in a single JSON column. Consequences: no per-item history, no
review queue, no cross-set dedupe, no item statistics, no way to ask "which
questions has this student actually got wrong twice".

**3. A score is one integer.** `ScoreModel` stores a number per attempt.
Per-topic and per-item outcomes are not persisted in queryable form, so
"what am I weak at" cannot be answered from the database.

**4. Difficulty is asserted, never measured.** "hard" means the prompt said
`ENSURE THAT EVERY QUESTION IS VERY DIFFICULT... THE KIND OF DIFFICULTY
THAT A COLLEGE PROFESSOR WOULD FIND CHALLENGING`. No item is ever
calibrated against real response data, so difficulty labels drift from
reality and nobody finds out.

**5. Nothing verifies groundedness.** A generated question can be
hallucinated, or its "correct" answer can be wrong, and it will be shown to
a student as fact. For an exam product this is the most damaging possible
failure and there is no check for it.

**6. Distractor quality is left entirely to the prompt.** No post-hoc check
that the correct answer is not simply the longest option, that positions
are balanced, or that distractors are mutually exclusive. Test-wise
students can score well without knowing the material.

**7. The prompt file is 1696 lines of largely capitalised instruction**, and
there is no eval harness. Shouting is not specification, and without evals
nobody can tell whether an edit to that file made questions better or
worse. Changes to it are unfalsifiable.

**8. `QuestionsController` is 1537 lines with 25+ injected services**, with
generation, batching, persistence and billing checks inline in the HTTP
layer. It cannot be unit tested and every new question type makes it worse.

**9. The oral exam calls a hardcoded phone number.** In
`startOralExamination`: `userPhoneNumber: '+2347081271903'`. Every viva
dials that number regardless of who is studying. Worth fixing in AI
Examiner independently of this plan.

## 3. What EasiRead already has that AI Examiner does not

This asymmetry is the whole opportunity, and it means we are not starting
from zero:

- **`TopicMastery`** (`business/domain/learning.ts`): 0–100 per topic,
  computed from raw events at read time, with geometric recency decay,
  evidence weighting by event kind, and an explicit "silence is not
  knowledge" rule that returns null rather than a score under two events.
- **`Calibration`**: confidence-minus-competence bias, from confidence
  captured *before* the outcome is revealed. Genuinely rare in study apps.
- **Struggle signals** (`business/domain/struggle.ts`): eight kinds,
  weighted, with `quiz_right` deliberately negative so recovery registers.
- **An assessment event stream** already accepting `mcq | flashcard |
  verbal` with a 0..1 score and a payload.
- **`generateTopicQuiz`** on the LLM port: 2–3 grounded MCQs per topic,
  already retrieval-scoped, with an optional `focus` for ideas the reader
  keeps missing.
- **`recallGradeSchema`**: free-recall graded against the chapter's own
  text. Short-answer grading, already solved.
- **`diagramClozeSchema`**: a diagram with one node blanked.
- **`quiz-overlay.tsx`**: commit-once answer semantics, already wired to
  the voice tutor mid-lesson.
- **A vector store** (`MysqlVectorStoreAdapter`) for retrieval and dedupe.
- **Live voice tutor and group sessions** — a far better home for oral
  examination than a phone call.

AI Examiner measures nothing and schedules nothing. EasiRead measures well
and generates narrowly. Joining them is the work.

## 4. The plan

Five principles, each answering a specific failure above:

1. **Items are rows, not blobs.**
2. **Nothing is shown to a student unless it is verified against source.**
3. **Scheduling is the product, not a feature.**
4. **Difficulty is measured from responses, not asserted in a prompt.**
5. **Generation sits behind a port with an eval harness**, like payments.

### Phase 1 — The item bank

Two tables, one migration.

`items`: one row per question. `documentId`, `topicId`, `kind`, `stem`,
`options` (JSON), `answer`, `explanation`, `hint`, `sourceAnchor` (page +
character range), `groundingQuote` (verbatim from source), `bloomLevel`,
`generatorVersion`, and the measured statistics `pValue`,
`discrimination`, `timesAnswered`, `retiredAt`.

`item_reviews`: one row per encounter. `userId`, `itemId`, `rating`,
`latencyMs`, `confidence` (captured pre-answer), plus the scheduler's
state: `stability`, `difficulty`, `dueAt`, `reps`, `lapses`, `state`.

Items **emit** assessment events on every answer, so `TopicMastery`,
`Calibration` and the struggle stream keep working with no changes. That
is the integration seam, and it is already built.

### Phase 2 — Generation that can be trusted

An `AssessmentPort` in `business/ports`, mirroring the discipline that made
three payment-gateway swaps cheap:

```
generateItems({ topicId, kind, count, difficulty, avoidStems, sourceChunks })
verifyItem({ item, sourceChunk })
```

**Two-pass generation is the core change.** The draft pass writes items.
The verify pass is a *separate* call that sees only the source chunk and
the item — not the intended answer — and must (a) answer the question
itself, (b) produce a verbatim quote from the chunk supporting that answer.
An item is kept only when the verifier's answer matches the author's and a
quote was found. Everything else is discarded before a student ever sees
it. This directly kills failure 5, and the quote it produces becomes the
"show me where this came from" affordance.

**Mechanical quality gates in code**, not prompt pleading: no option longer
than ~1.6x the median (kills length-cue guessing), correct-answer positions
balanced across the set, no "all/none of the above", near-duplicate stems
rejected by embedding similarity against the existing bank. These are
cheap, deterministic, and fix failure 6 permanently.

### Phase 3 — Scheduling, which is the actual 10x

Adopt **FSRS** rather than SM-2: it is open, modern, and fits variable-load
study far better than fixed intervals.

- Every answered item gets a `dueAt`.
- A **Review** surface shows what is due today across *all* documents, not
  per document. This is the habit loop AI Examiner has no equivalent of.
- **Interleave** topics rather than blocking them — mixing topics within a
  session measurably beats grouping them.
- Weak topics (`mastery < WEAK_THRESHOLD`, already defined as 60) seed the
  queue automatically, closing the loop with the mastery model.

This pairs unusually well with the 20-minute free study window: a review
session *is* a 15-minute unit, so the free tier delivers a complete daily
ritual rather than a truncated one.

### Phase 4 — The question types, done better

Keep all five of AI Examiner's, port two of EasiRead's, add one:

| Type | Change from AI Examiner |
|---|---|
| Multiple choice | Verified, position-balanced, measured difficulty |
| Multiple true-false | Ported as-is; the statement-mutation guidance is good |
| Flashcard | Becomes FSRS-native rather than a one-off deck |
| Essay / short answer | Graded against source via existing `recallGrade`, not a bare score out of 10 |
| Oral viva | Through the existing WebRTC voice tutor, not a phone call |
| Diagram cloze | From EasiRead's `diagramClozeSchema` |
| **Text cloze** | New: blank a term in a sentence taken verbatim from the document. Near-zero hallucination risk, near-zero cost, and it is the highest-yield format for definitions and terminology |

### Phase 5 — Measured difficulty

Once an item has enough responses, compute its **p-value** (proportion
correct) and **discrimination** (point-biserial against total score).

- Serve difficulty by measured p-value, not by the adjective the generator
  was given.
- **Auto-retire items with negative discrimination** — when students who
  know the topic get an item wrong more often than students who do not, the
  item is broken, not hard. Nothing in AI Examiner can detect this today.

### Phase 6 — The eval harness

A golden set of passages with known topics, and metrics run on every
generator change: grounding pass-rate, duplicate rate, option-length
balance, answer-position entropy, and a small human spot-check. Without
this, prompt edits are guesses. This is what makes the 1696-line file's
successor maintainable.

## 5. What not to port

- The JSON-blob question storage.
- The 1696-line prompt monolith (port its *ideas*: statement mutation,
  topic tagging precision, previous-question context).
- The 1537-line controller. Generation belongs in handlers behind a port.
- Phone-call viva.
- Difficulty as a prompt adjective.

## 6. Sequencing

Phases 1 and 2 first: the bank and verified generation are what everything
else stands on, and together they already beat AI Examiner on correctness
alone. Phase 3 is where the learning outcome changes and should follow
immediately. Phases 4–6 are additive and can land in any order, though the
eval harness pays for itself the moment prompt iteration starts.

## 7. Open questions

1. **Scope of the first release** — one document's items, or a global
   review queue across the library from day one? The queue is the habit,
   but it is more surface area.
2. **Free-tier shape** — are generated items metered (they cost tokens), or
   is review free and only *generation* metered? Review being free is what
   builds the daily habit.
3. **Item sharing** — should verified items be reusable across users
   studying the same document, or stay private per user? Sharing cuts cost
   sharply and improves statistics, but only works for shared documents
   like the starter library.

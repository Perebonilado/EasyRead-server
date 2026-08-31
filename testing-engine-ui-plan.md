# Testing engine: the UI plan

Companion to `testing-engine-plan.md`, which covers the engine. This is
where it surfaces, and the guiding constraint is that EasiRead is a
*reading* app whose audience is ADHD and tired minds. AI Examiner is a
test-generation tool where making a test is the point. Here it must never
be: the reading is the point, and testing is what makes the reading stick.

Two rules follow, and they decide almost every question below.

**Nothing new gets its own top-level tab unless it earns one.** The app has
one nav item today (Library) plus Settings. Review earns one because it is
a daily destination. "Make a test" does not, because it is an action inside
a document, not a place.

**Progressive disclosure throughout.** No screen dumps every option. The
default path is one tap; the controls exist behind a "Customise" for the
people who want them.

## 1. What already exists, and what it means

EasiRead has more of this built than it looks:

| Surface | What it does now | Role in the testing engine |
|---|---|---|
| `quiz-overlay.tsx` | Quiz + flashcard cards, commit-once answers, tutor-driven | **The item renderer.** Already the right contract |
| `guided/check-stage.tsx` | 2–3 items per chapter, confidence before reveal | **The in-reading check.** Already the right ritual |
| `understanding-panel.tsx` | Per-topic mastery bars, revisit button per row | **The results surface.** Already built |
| `continue-card.tsx` | "Pick up where you left off" on the library | **The daily entry point** for review |
| `study-mode.tsx` | Voice lesson with overlays and mastery | Where items get pulled mid-lesson |
| `notes` page | A standalone cross-document study surface | **The layout model** for the Review page |

The confidence-before-reveal pattern in `check-stage` is the single most
valuable UI convention here, because it is what feeds `Calibration`. Every
new item type must keep it. It is three taps — Guessing / Think so / Sure —
and it must stay that cheap.

## 2. The four surfaces

### A. Review — a new top-level destination (`/review`)

The one genuinely new page, and the centre of the whole feature. It answers
"what should I do today" across the entire library, not per document.

**Empty-ish by design.** The page is a single card, not a dashboard:

```
        TODAY
        18 cards due
        across 3 documents

        [ Start review ]          ~6 minutes

        Nothing due tomorrow. Next: Thursday, 24 cards.
```

The estimate matters more than it looks. "18 cards due" is a chore; "about
6 minutes" is a decision someone can actually make while tired. Estimated
from measured median latency per item, not a guess.

Below the fold, and only when there is history: a seven-day strip of what
was reviewed, and the weak-topic list pulled straight from the existing
mastery model with the same revisit affordance the `UnderstandingPanel`
already uses. No streak counter. Streaks punish the exact audience this app
is for, and a broken streak is a reason to stop using a product.

**The session itself is full-screen and one card at a time.** It reuses
`quiz-overlay` for rendering. Chrome is minimal: a progress bar, the card,
the confidence row, nothing else. Between cards, no interstitial.

At the end, one screen: how many, how it went per topic, and what changed
in mastery. Then out. No confetti, no "share your score".

Nav: Review joins Library in the header. When something is due, the label
carries a small count dot. When nothing is due, the item stays but reads
"Review" with no dot, so the nav never shifts position.

### B. In the reader — checks stay where they are

**No new tab in the reader.** The reader's rail is already Search, Chat,
Voice, Visualize, Notes; a sixth would push it past what fits and past what
anyone scans.

Instead:

- **Guided reading's check stage stays exactly as it is.** It is already
  the per-chapter test. It gains verified items and its results now feed
  the review queue rather than evaporating.
- **A "Test me on this" action on the topics panel row.** One tap from a
  topic to a short check on that topic, rendered in the same overlay. This
  is the replacement for AI Examiner's three-step creation wizard, and it
  is one tap because the topic already says what to test and the reader's
  history already says how hard.
- **Highlight → "Make a card".** From the existing highlight popover,
  turning a highlighted sentence into a cloze item. Near-zero cost, no
  hallucination risk, and it converts the act of highlighting — which is
  passive and famously ineffective — into an item that will come back. This
  is the highest-leverage small feature in the whole plan.

### C. Document level — "Test yourself" on the document

On the reader's finish/recap screen and the library card's menu: **Test
yourself**, which opens a sheet, not a page.

Default path is one tap:

```
        Test yourself

        [ Quick check        ]   10 questions, mixed topics
        [ Full test          ]   25 questions, everything
        [ Weak topics only   ]   12 questions   ← only when weak topics exist

        Customise ▾
```

`Customise` expands to what AI Examiner's wizard made mandatory: type,
count, topics, difficulty. Same options, but demoted below a default that
is right most of the time. AI Examiner's three-step wizard becomes one tap
plus an optional disclosure.

"Weak topics only" appears only when the mastery model has enough evidence
to name weak topics, which is exactly the "silence is not knowledge" rule
already in `learning.ts` showing up in the UI.

### D. Results — reuse, do not rebuild

`UnderstandingPanel` already renders per-topic scores with revisit buttons.
Test results render through it. The only addition is a per-item review list
behind a toggle: what you got wrong, the explanation, and **the verbatim
source quote the verifier captured**, with a page link.

That quote is worth calling out as a UI feature and not just an engine
detail. "Here is the sentence this came from, on page 34" is the answer to
the question every student asks about a wrong answer, and no competitor
built on blob storage can show it.

## 3. Generation, as an experience

Generating a test takes real seconds. Two decisions:

**Never block the reader.** Generation is a background job with the toast
pattern the app already uses for imports. The student keeps reading; the
test tells them when it is ready.

**Show the verification, briefly.** While generating: "Writing questions…"
then "Checking them against the book…". The second line is not decoration —
it is the differentiator, stated plainly, at the one moment the user is
already waiting and paying attention. If items are discarded, the count
quietly reflects it ("22 questions" when 25 were asked for) rather than
padding with unverified ones.

## 4. Mobile

Review is a phone activity — it is the queue-and-commute use case. The
session view is designed phone-first: one card, thumb-reachable confidence
row along the bottom, options as full-width targets. The desktop version is
the same layout centred in a column, not a denser one.

## 5. What we are deliberately not building

- **A test-builder page.** AI Examiner's wizard is a page because making
  tests is its product. Here it is a sheet with a default.
- **A question bank browser.** Nobody wants to browse 400 questions. The
  queue decides; the review list after a test covers the rest.
- **Streaks and badges.** Wrong audience, wrong incentive.
- **A separate flashcard app-within-the-app.** Flashcards are items with a
  different renderer; they live in the same queue as everything else.

## 6. Build order

1. **Item renderer + review session** on top of the existing overlay. Even
   with a hand-seeded queue this is demoable and proves the loop.
2. **`/review` page and nav entry.** The habit needs a home before it needs
   more item types.
3. **"Test me on this" from the topics panel**, the one-tap path.
4. **Highlight → card.** Small, high leverage.
5. **"Test yourself" sheet** with the customise disclosure.
6. **Source-quote review list.**

Phases 1–2 are the product. Everything after is depth.

## 7. Open questions for the UI

1. **Does Review appear before there is anything to review?** My lean:
   yes, with a line explaining what will show up there, because a nav item
   that appears later is a nav item nobody finds.
2. **Do checks during guided reading count toward the due queue
   automatically, or does the student opt in?** My lean: automatic, since
   opting in to remembering things is a strange thing to ask.
3. **One queue or per-document queues?** My lean: one, with a document
   filter. The whole point is that review crosses documents.

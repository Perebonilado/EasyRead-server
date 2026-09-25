# Visualize: teacher's notes, so a book is taught as one course

Richard (2026-09-25): a book tells one overall story. Many pages carry on from the page before, but every video is made as if its page were a fresh start. He wants a whole view of the material first. Before any script, we should write down what the tutor will say and show, and whether this page carries on from the last one. Then the videos flow. He also asked for two more things:
- research on how the voice is best presented, so the learner understands;
- a script that really teaches: aware of what came before and of the learner, not only narrating the page.

## What happens now

- **Each page is written alone.** The writer gets:
  - its own page note;
  - the book's title and chapter title;
  - the book profile (subject, kind, the learner's stage);
  - the titles of up to six earlier videos in the chapter, but only ones already finished (`where()` in scene.processor.ts).
- **Pages are made out of order.** Up to three at a time, starting from wherever the learner opened the chapter. Page 40 is often made before page 39, so it can't know how 39 ends. The earlier pages of the chapter may never be made at all.
- **The writer never sees the book summary.** Every page already has one (`document_summaries`), and simplifying and the tutor chat use it. The scene writer does not.
- **Only story books have continuity.** They get a story bible, the last page's closing words (`before`) and a "previously" opening. An explainer page never learns what the last page said, what it drew, or where it stopped.
- **The audio lecture already solves this.** It writes a chapter plan once (`LecturePlan`: a hook, a thread, and per page a goal, what is new, a callback, a foreshadow and a handoff question). Then it writes the pages in order, each reminded of the tail of the page before and what was taught so far (lecture-chapter.processor.ts). The scene pipeline uses none of it.

So a continuation page opens as a new lesson. It introduces again what the page before just said, draws the same system again from nothing, and can't finish a list the last page started.

## The idea: plan the chapter, then write each page from the plan

Like a teacher preparing a lesson, we read the whole chapter once, before any video, and write **teacher's notes**. Every page video is then written from its part of the notes, not from its page alone.

The simplified note of every page is made when the book is uploaded, so the whole chapter can be read before the first video is asked for.

### 1. The book: a course map (once per book)

This is mostly already made. We gather it and give it to the writer:
- the summary (120–200 words);
- the profile and the learner's stage;
- the chapters, with their short descriptions.

Two things are new, both collected as the chapter notes are made:
- **Where each term is first taught.** For example, "latency: taught on page 12". A page never uses a term before its lesson, and can say "remember latency?" after it.
- **Running examples.** For example, the photo-sharing app used right through a chapter. The same example is drawn the same way every time it comes back.

### 2. The chapter: teacher's notes (once per chapter)

One read of all the chapter's page notes, made the first time any page in the chapter is wanted. It is kept in storage beside the profile. Pages wait for it, as they already wait for a story bible.

For the chapter:
- **The thread.** The one question the chapter answers, and how each page moves toward it.
- **The running diagram**, if there is one: the picture the chapter builds up. For example, an architecture that gains a cache on one page and a queue on the next.

For each page:

| Field | What it holds | Example |
|---|---|---|
| `relation` | `fresh`, `continues` (same idea, carried on), `example` (a worked case of the last idea), `recap`, `exercise`, or `skip` (index, references, blank) | `continues` |
| `evidence` | Why, in a line | "starts mid-list: items 4–6 of the 6 limits" |
| `goal` | What the learner can say after it, in one sentence | "why a CDN makes images load faster" |
| `newHere` | Ideas and terms first met on this page | CDN, edge server |
| `callback` | What it builds on, and from which page | "latency, p12" |
| `talkingPoints` | The small ideas, in order, each with what to **say** and what to **show** (below) | 4–8 per page |
| `lists` | The lists worth showing item by item | "the 3 kinds of cache" |
| `pitfall` | The mistake learners make here | "a CDN isn't a database" |
| `check` | One question the learner should now be able to answer | "Why is the second visit faster?" |
| `handoff` | What it leaves open for the next page | "but what happens when the image changes?" |
| `opensOn` / `endsOn` | The stage it opens with and ends on, as things on the stage | ends on: user, CDN, origin |

A **talking point** is one small idea:
- `say`: the gist, not a script;
- `show`: which thing, list, diagram part or formula comes on or changes. It is `kept` when the thing carries over from the page before.
- `kind`: `hook`, `explain`, `example`, `list`, `contrast`, `pitfall`, `check` or `recap`.

The talking points are the stage plan. A page with six talking points has at least six stage changes, planned before a word is written. They're chosen by someone who has read the whole chapter, so the picture changes on real ideas, not on filler.

**Continuation is judged by the reader and by code together.** Code sees the plain signs:
- the page starts mid-sentence or with no heading;
- a numbered list carries on;
- "continued" appears;
- the last heading of the page before still applies.

The reader weighs these with the meaning, and its `evidence` line is logged so a wrong call can be seen.

### 3. The page: written from its notes

The writer gets:
- its page's notes;
- the course map lines it needs (terms taught before, the running example);
- **the page before**: its notes' `endsOn` and `handoff`, plus its real last sentence and last stage if it's already made;
- **the page after**: its `goal`, so the page can lead toward it without teaching it.

What that changes:
- **A continuation doesn't start again.** No "In this video we'll look at…". It picks up in a sentence ("So that's the first three limits. The fourth…") and opens on the stage the last page ended on. The same drawings are reused rather than drawn again, which is also cheaper.
- **A fresh page** opens with a hook tied to the chapter's thread, and one line calling back to what it builds on.
- **Each talking point gets its stage change.** A code check, like the spoken-lists one, makes sure every talking point's `show` comes on, at the words that say it. A draft that misses them goes back, as a still draft does now. The "build-up" pass and the lists pass stay as a safety net.
- **`skip` pages aren't made.** Title pages, the index and references are shown as "not a lesson page". This already happens for story books.

**Out-of-order making is no problem for the text.** Page 40 knows from the notes how page 39 ends, even if 39 isn't made yet. Only the exact carried-over stage needs 39's video. When it's done, 40 opens on its real last stage. When it isn't, 40 opens on the stage the notes planned (`endsOn`). The two match because both pages were written from the same notes. No page waits for another.

## The voice: how it's best heard

What the research says, and what it means for us:

| Finding | Source | What we do |
|---|---|---|
| For listening comprehension, about **140–160 words a minute** is best. Slower suits hard or new material. | Speech-rate studies; audiobook non-fiction norms of 140–150 | Measure our real rate from the word times we already align. Aim for about 145 on new ideas, about 165 on recaps and asides, and slower for the youngest learners (which `STAGE_RECIPES` already does). Gemini ignores our `speed`, so pace goes in its style note ("unhurried"), and each page's rate is logged and checked. |
| Instructors who sound **enthusiastic and conversational** hold attention longer. The "fast talker" effect is really enthusiasm. | Guo, Kim & Rubin 2014 (6.9 million edX sessions) | Keep the warm persona. Give the voice a Gemini-style "director's note" per page: who is speaking, to whom, and the mood. Talk to "you", not "the reader" (Mayer's personalization principle). |
| A **good modern voice teaches as well as a human voice.** Only robotic voices hurt learning. | Craig & Schroeder 2017, 2019 | Gemini is fine. Keep **one voice for the whole book**, so it feels like one teacher. |
| **Signaling:** cues that point at the key idea help. Voice and picture should land together. | Mayer (signaling, temporal contiguity) | Stress a new term (`newHere`) the first time it's said. Its card or label comes on at that word. A short pause (about 0.7 s) lets it land, and the picture change sits in that pause. |
| **Segmenting:** learning is better in learner-paced chunks. | Mayer (segmenting) | Talking points become marks in the video. The player can go "back one idea" and pause at a `check` question. |
| **Pre-training:** knowing the parts' names first helps with the process. | Mayer (pre-training) | When a page teaches a process with new parts, the notes name and show the parts first, then run the process. |
| **Redundancy:** full sentences on screen while the same words are spoken hurts. | Mayer (redundancy) | Keep to keyword cards and labels, never the narration on screen (as now). |

Gemini's pause tags (`[long pause]`) are documented, but they're in preview, and our model read them aloud. Real silence inserted by code (as of this week) stays. We use tags only where a check shows they work.

## Teaching, not only narrating

A teacher does more than say the page. With the notes, each page can:
1. **Retrieve before it builds.** A continuation or callback opens with a quick recall, such as "Remember why the second visit was faster?". It gives a beat of silence, then answers. Recall is stronger than being told again.
2. **Use one running example.** The chapter's example comes back page after page, so new ideas hang on something familiar.
3. **Name the pitfall.** One line and one picture for the common mistake (`pitfall`), shown as a contrast: right beside wrong.
4. **Check understanding.** The page ends on its `check` question, a pause, and a one-line answer, then its `handoff` to the next page.
5. **Never teach a term before its time.** The term index lets code check the script. A term used before the page that teaches it is sent back or explained in a clause.
6. **Fit the learner's stage.** Stage recipes already set words, pace and pauses. The notes also set how many talking points a page gets: fewer, simpler ones for young learners.

**What "aware of the learner" can and can't mean here.** A page's video is made once and shared by everyone reading the book, so it can't know one learner's answers. Per-learner awareness belongs in the player and the tutor:
- the `check` question can be asked in the player, with the learner's answer going to the tutor chat;
- a learner who skipped ahead can be offered the page the notes say this one builds on.

That is a later phase, with the notes as its base.

## The steps

1. **Teacher's notes.**
   - A domain module (`lesson-notes.ts`): the shape, a mend (known ids, talking points 2–10, relations from a fixed list) and the code's continuation signs.
   - One model call per chapter, reading every page note in it (long chapters in parts of about 20 pages, each part given the one before's last page).
   - Kept in storage with a version; made once and waited on, like the story bible.
   - A script to make and print one chapter's notes for review.
2. **The writer reads the notes.**
   - The prompt gets its page's notes, the page before and after, and the course map lines.
   - `where()` goes. Continuations open where the last page ended, and drawings are reused.
   - `skip` pages aren't made.
3. **The stage follows the talking points.** A check that each talking point's `show` comes on at its words, with drafts sent back as now. The rhythm log gains "talking points shown: n of m".
4. **The voice.**
   - Log words a minute per page.
   - A pace and a director's note for Gemini.
   - A stressed first mention of each new term, with its card and a landing pause.
   - One voice per book.
5. **Teaching moves.** Retrieval openings, the running example, pitfall contrasts and a closing check, from the notes. A code check for terms used too early.
6. **Measure.** Remake System Design Interview pages 248–257 twice: in order, and in a shuffled order. We check that:
   - every continuation picks up rather than restarts;
   - the stage changes at least once per talking point, which should bring most pages near page 253's pace (21 changes);
   - the rate sits at 140–165 words a minute;
   - nothing is taught twice.

   Then Richard watches three pages back to back.
7. **Later: the player.** Idea marks for "back one idea", the check question asked in the player, and answers sent to the tutor.

## Cost

- **Notes:** one extra call per chapter. It reads about as many words as all the chapter's page writers already read, and it's made once and kept. On DeepSeek that adds roughly the writer's input cost once more per book.
- **Savings:** reused drawings on continued pages, and `skip` pages not made.
- **No migration.** The notes live in storage, as the profile does.

## Decisions for Richard

1. **Which model reads the notes?** Recommended: **DeepSeek (deepseek-flash) with thinking on.** It's one careful read per chapter, where thinking pays off, at DeepSeek's price. The alternative is gpt-4.1-mini, which is steadier at long reading and costs more.
2. **Books already made.** Recommended: **new videos use notes. Old ones stay until remade**, and a book can be remade chapter by chapter with `scene:recast` when you choose. Bumping the generator version would remake every book on the next visit, at full cost.
3. **The lecture.** Recommended: **keep it separate for now.** The scene notes borrow the lecture plan's proven fields (goal, what's new, callback, handoff), but the lecture is live and tuned. One set of notes for both can come later.

## Sources

- [Meta-analysis: acceleration and video learning (Frontiers, 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12412133/)
- [Chen 2024, lecture speed and memory (Applied Cognitive Psychology)](https://onlinelibrary.wiley.com/doi/10.1002/acp.4166)
- [Guo, Kim & Rubin 2014, how video production affects engagement (edX)](https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf)
- [Craig & Schroeder 2019, text-to-speech and the voice effect](https://journals.sagepub.com/doi/10.1177/0735633118802877)
- [Craig & Schroeder 2017, reconsidering the voice effect](https://www.sciencedirect.com/science/article/abs/pii/S0360131517301653)
- [Mayer's principles of multimedia learning (summary)](https://www.digitallearninginstitute.com/blog/mayers-principles-multimedia-learning)
- [Evidence-based principles for instructional videos (Mayer, Fiorella & Stull 2021)](https://www.sciencedirect.com/science/article/abs/pii/S2211368121000231)
- [Gemini-TTS: style prompts and markup tags (Google Cloud)](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)

## Status (2026-09-25): built, on branch `visualize-pacing`

Richard said "implement", taking the three recommendations: DeepSeek with thinking for the notes, old books kept until remade, and the lecture left separate. Steps 1–6 are built. Step 7 (the player) is not.

**What was built:**
- `src/business/domain/lesson-notes.ts` holds the notes' shape, the mend, the code's continuation signs (`pageSign`), the writer's brief (`describeNotes`), the checks (`notesProblems`), how a page ends (`endingOf`), carried drawings (`carryOver`), first mentions (`firstSaid`) and `wordsPerMinute`.
- `sceneNotes` (prompt, schema, port, adapter) is a new model task, `scene_notes`. It defaults to `deepseek:deepseek-flash`, with thinking on unless `SCENE_NOTES_THINKING=off`, and can be moved with `AI_MODEL_SCENE_NOTES`.
- In the scene processor:
  - Notes are made once per chapter the first time any page is wanted, in parts of up to 20 pages, three at a time. They're kept at `documents/<id>/visuals/v<n>/notes-<topic>.json`, and pages asked for together wait on the one read.
  - Story books keep their own bible and don't get notes.
  - The book summary now reaches the notes.
  - `skip` pages aren't made.
  - Each explainer page's ending is kept (`p<n>-<generator>-end.json`), so the page after it can open on the same stage with the same drawings, which are not drawn again.
- **The writer:** it gets its page's notes in place of the list of earlier titles, and a draft goes back when:
  - its stage changes fewer times than its planned ideas;
  - a third of the planned "show"s never come on;
  - it uses a term the chapter teaches later that the page itself doesn't use.
- **Every reason goes back to the writer.** Before, "too few stage changes" was logged but never sent.
- **The voice:**
  - Gemini's direction now carries a pace ("an unhurried teaching pace", "a little quicker" for asides).
  - A sentence that first says a new term gives it "a little weight" and is followed by at least 0.7 s of quiet.
  - The log reports words a minute.
- `npm run scene:notes -- <documentId> <page> [--again]` prints a chapter's notes.
- There's no migration. New notes are made as pages are asked for, and old videos stay until remade.

**Tried on System Design Interview, chapter 15 (pages 244–263):**
- **The notes.** The 20 pages took about 1.5 minutes in one read: 6 fresh, 10 carrying on, 2 examples or recaps, and 2 skipped (a blank page and the reference list).
- **The chapter's thread and the architecture it builds** were named on the notes.

| Page | Kind | Stage changes | Words a minute | Planned ideas shown |
|---|---|---|---|---|
| 252 | example | 7 in 79 s | 136 | 5 of 5 |
| 253 | fresh | 18 in 193 s | 144 | 8 of 8 |
| 254 | continues | 5 in 42 s | 163 | 2 of 4 |
| 255 | fresh | 20 in 126 s | 141 | 7 of 8 |

Pages 256 and 257 ran into Gemini's daily cap: 100 requests a day on Tier 1. Written without voice from the notes:
- page 258 went from 2 stage changes (sent back) to 18;
- page 259 had 15, and opened on a recall question ("remember the notification service from the last page. What did it do?").

**Fixed while testing:**
- **Things drawn as they really are.** Richard saw "Client 2" drawn as a person.
  - The notes now carry `pictures`: what each thing the chapter keeps showing really is in this subject, how to draw it, and whether it's a person. For example, "Client: software on a user device… draw a laptop and a phone with the Drive app"; only "User" is a person.
  - The writer's rules say only a human being is a person.
  - Code (`drawnAsTheyAre`) redraws any "person" the notes call a machine.
  - This has to be decided per book, because in law "the client" is a person. `NOTES_VERSION` is 2.
- **Copied opening.** The writer copied the brief's example opening word for word. The brief now describes the move ("one sentence of your own that links…") and gives no phrase to copy.
- **Gemini's quota.** Last session's pause fix split each page into up to 8 requests, which used up the daily 100 by page 256.
  - Each voice now gets one request per page (a story's character gets its own).
  - Code finds the quiet the voice leaves after each sentence and lengthens it to the pause asked for (`sentenceGaps`, `withPauses`).
- **Gemini prompting**, per Google's guide ("treats the `text` field strictly as a verbatim transcript"; style notes kept short, since more prompt text makes the voice drift):
  - nothing but the words goes in the text;
  - no inline pause tags;
  - the style note is a few words of mood, pace and stress (e.g. "calm and unhurried; clear, unhurried; stressing "latency"").
  - The persona that was repeated on every sentence is gone.
- **"Long pause" still heard.** Richard's local worker had been running since 12:01, from before the pause fix was written. It had to be restarted to stop sending the old marks.

# Visualize: stories told true. The right speaker, the right people, in the right place

Richard's report (2026-09-25), after the Matthew pages and a children's book (Hide-and-Seek):

1. **Bible.** Dialogue is often wrong, things overlap, and some scenes are wrong: "the voice describes one thing but we see something else".
2. **Children's book.**
   - Sally is trapped in a cave, but she is drawn standing with the two boys.
   - Sometimes the narrator says a character's line.

I went through every page that was made: Matthew pages 13–27 and Hide-and-Seek pages 1–27 (the local database and storage). For each page I set the page's own text, its note, and what the video says and shows side by side. Then I reproduced the causes in code. Everything below is from those pages.

## What goes wrong, and why

### 1. The video is made from the note, and the note has lost the story's dialogue
- **The material.** A video's material is the page's simplified note (`scene.processor.ts`, `material()`), not the book's text.
- **Speech is rewritten.** The simplifier rewrites direct speech as reported speech, or summarises the page:
  - **Hide-and-Seek:** 76 quoted lines in the book, 10 in the notes. Page 10's seven quotes ("Did you hear that, James?" Mark said excitedly…) became "Mark hears something and tells James."
  - **Matthew:** from page 14 on, the notes are summaries, with "Key Events" bullets and "Key terms explained". Of the page text's quoted passages, 50 of 1,629 survive, though some of those passages are the translator's quoted glosses.
- **The note sometimes changes who does what.** Page 14's note says James went down into the cave; the book says Mark's father did.
- **What follows:**
  - The writer invents lines from reported speech, and sometimes puts narration in a mouth. On page 12, Mark says "He yelled, asking what was going on", and Sally says "Something was with her".
  - With no quotes in the material, code cannot check who says what. The invented-line check only runs when the material has quotes.

### 2. Two-column pages are read across both columns
- **The fault.** Extraction joins text by line across the whole page width (`pdfjs-toolkit.adapter.ts`). Matthew's page is two columns of text over two columns of translator's notes.
- **The result.** Each line holds half a sentence from each column: "approached, and bowed low before him, say- man under authority, with soldiers under me".
- **Who reads it.** The simplifier, the story reading and the lectures all read this. The simplifier falls back to summarising.

### 3. The book's characters are merged into each other
- **The rule.** The story is read in stretches and merged by name (`scene-story.ts`, `findNamed`). A new name joins an existing character when all of one name's words are in the other.
- **The chains.** So "Mother of Jesus" joined Jesus. Then Mary's names were Jesus's, so "Joseph, husband to Mary" joined too.
- **What came of it:**
  - Jesus's other names: Mary, Mother of Jesus, Joseph.
  - John the Baptist's: the twelve apostles, Simon Peter, Andrew, James son of Zebedee.
  - Simon Peter's: Peter's mother-in-law.
  - Mark's: "Mark's father".
- **The effects:**
  - In Hide-and-Seek, Mark does and says everything his father does, on pages 12–20: he goes down into the cave, and he says "Hold on, boys. It's not that simple".
  - In Matthew, John the Baptist stands in for the apostles on pages 18 and 19.

### 4. People who speak are missing from the cast
- **Who is missing.** The story reading lists "every named person… and everyone else who speaks". Reading 40,000 characters at a time with the small model, it skipped unnamed speakers: the man with leprosy, the ruler whose daughter died, the two men possessed by demons, and Sally's mother. Mark's father was merged away (3).
- **What happens to their lines:**
  - A line with no one in the cast to say it goes to the narrator as a quotation. On Hide-and-Seek page 12, the narrator says Mark's father's "Stand back" and "I am lowering a rope".
  - Or it goes to whoever is nearest. Matthew page 16 gives the ruler's "My daughter has just died" to the ruler's daughter.

### 5. Code picks the wrong speaker, and overrides a writer who had it right
The mend lets the book's attribution win over the writer's (`mendScreenplay`, "the book wins"). The attribution finder (`dialogueOf`) gets it wrong in four ways. I reproduced this on Matthew page 13 with the real story: all five lines come out as Jesus.
- **The lead-in reaches back into the previous sentence.** "…came to Jesus. He bowed down and asked, '…'" gives Jesus, who is only named there as the object.
- **A name is matched case by case.** The character is "Centurion" and the text says "The centurion replied", so there is no match.
- **A whole paragraph is one sentence** to the rule "a quote goes on with the quote before it". After "Jesus responded, '…'", the centurion's "Lord, I am not worthy" goes on as Jesus.
- **The object is taken for the speaker.** "He pointed to his disciples and said, 'Here are my mother and my brothers!'" is given to the disciples (Matthew page 25).

In the end, the leper's plea and both of the centurion's lines are said by Jesus, in his voice and in his bubble.

### 6. Lines in the wrong mouth, from the writer
- **The stage's "Think:" question is given to Jesus.** Matthew page 14: "Think: what would happen if Jesus had not gone to help these men?" The same happens on page 26.
- **Scripture quoted by the narrator is given to Jesus:** "He took our weaknesses…" on page 14.
- **Jesus tells his own life in the first person** on page 23: "Wise men visited me as a child".
- **The children read out the publisher's blurb** on page 27. On pages 1–3 the narrator reads an invented guide's lines in quotes.

### 7. The stage has no scenes, so it shows the wrong people in the wrong place
- **One place and one cast per page.** The story reading gives each page one place and one list of people. The screenplay's stage only adds people: whoever speaks is cut in, and nobody leaves when the place changes.
- **The writer's opening list pre-loads the page.** The writer may put everyone in it, so they are on stage from the start. On Matthew page 13 the centurion stands there while the voice tells the leper's story.
- **The voice and the stage drift apart:**
  - **Matthew page 13** ends with the leper and the centurion in the Capernaum street, while the voice says "Jesus enters Peter's house".
  - **Page 14** stays at Peter's house with Jesus and Peter, while the voice tells the storm at sea and the Gadarenes: no boat, no sea.
  - **Page 15** shows Matthew, a paralysed man, his friends and the pig herders in Capernaum while the voice tells of the men possessed by demons and the pigs. Matthew is not in this passage.
  - **Pages 16–17** show people from the next story before it is told.
- **Someone who leaves cannot come back.** On pages 20 and 22 Jesus leaves, then speaks from an empty stage.
- **The overlap.** Pages put up to five people plus a crowd on stage (page 15). The crowd stands in among them, heads between heads. The close shots cut the second person in half at the frame's edge.

### 8. Everyone stands on one floor
- **The cave.** Sally is in a cave under a fallen tree while the boys shout from above. The stage has one floor and one set, and the story's places have no cave, so pages 9–15 all happen in "Neighborhood Woods".
- **What we see.** James asks "Sally, are you trapped under the tree?" standing next to her on open ground.
- **Nothing says where someone is within a scene:** above, below, inside, or apart.

### 9. Smaller faults
- **Pages outside the story are played as story.** Hide-and-Seek's title, credits and blurb pages (1–3 and 27; the story reading's pages are 4–25) have the children read the credits.
- **Time.** Page 17 opens "It is sunny." at night: the story reading had no time for that page, and the writer made one up.
- **Double bubbles.** A finished line's bubble flashes again when the stage changes in the 0.7 seconds it lingers (`scene-compose.ts`, carried bubbles; 11 times across these pages). A carried thought loses its thought bubble.
- **Anachronism.** The paralysed man lies in the kit's modern hospital bed.

## The fixes

### Part 1: read the book right
1. **Two-column pages read in reading order.**
   - Extraction finds the gutter: a vertical band near the middle that no line crosses.
   - It reads the left column, then the right, band by band. A line that crosses the gutter, such as a heading, stays where it is.
   - Footnote-sized text goes after the body, not into it.
   - Lectures and notes gain from this as well as videos.
2. **Direct speech stays direct speech in every note.** This goes in the simplify prompts:
   - Direct speech stays in quotes, with who says it named in the sentence.
   - A page that tells a story is retold in its order, event by event, never summarised.
   - The translator's notes, verse numbers and running heads are left out.
   - Nothing the page does not say is added: no book summary on a title page.
3. **Story pages are written from the book's words.**
   - The writer gets the page's own text, cleaned and in reading order, as the authority for what happens and who says what. The note is for plain wording.
   - Code checks every line against the book's own quotes.
   - Where the text is unreadable (a scan, a garbled page), the note is used, as now.

### Part 2: who's who, and who says it
4. **No chained merges.**
   - A name joins another only as a true variant ("Jack" and "Jack Merridew").
   - Never a phrase naming someone by relation ("Mother of Jesus", "Mark's father", "husband to Mary").
   - Never two names that each carry their own qualifier ("John the Baptist", "John, brother of James").
   - An alias that is another character's name in the same stretch is dropped.
   - `STORY_VERSION` 3 reads books again. Hide-and-Seek, one stretch, is read again on its own. Matthew, at about ten stretches, is over the limit of six and waits for `scene:recast`, asked for first.
5. **Everyone who speaks on a page is in its cast.**
   - The writer's own people on a page (the man with leprosy) are speakers too, with their names ("the man", "the leper").
   - A speaker the book names but the story lacks is brought in as a person drawn by the kit, never replaced by the narrator.
6. **The attribution finder fixed:**
   - The lead-in is the quote's own sentence only.
   - A name after "the", "a" or "an" matches in any case.
   - The object of "to", "at" or "with" is never the speaker.
   - "Goes on with the quote before" only when nothing but an attribution stands between them.
   - "He" or "she" is the subject of the sentence before, not the last name mentioned.
7. **The book overrides the writer only on strong evidence:** a name in the quote's own sentence (lead-in or speech verb), or a voice. Never a pronoun, turn-taking, or a name in a neighbouring sentence.
8. **Lines in the wrong mouth, mended by code:**
   - A check question ("Think: …") is always the narrator's.
   - A line about its own speaker in the third person is narration.
   - The narrator never says a quoted line on a story page.

### Part 3: scenes, and where people are
9. **Scenes within a page.**
   - The writer marks each scene with its place, time, and who is there. Code also starts one where a narration names another of the story's places, or jumps in time ("That evening", "The next day").
   - At each scene the stage clears and shows only that scene's people, in its place. The opening shows only the first scene's.
   - When the one the story follows leaves, the scene goes with them instead of emptying.
10. **Where people are within a scene: above, below, inside, apart.**
   - For Sally in the cave, the stage cuts between the two places, as a film does. We see Sally alone in the dark cave when she speaks, and the boys at the fallen tree when they speak. Each hears the other as a voice from above or below.
   - The story reading lists the cave as a place, and says who is where on each page.
11. **At most three people on stage in a story.**
   - The rest are the crowd.
   - The crowd stands back, smaller and never between the characters.
   - A close shot never cuts someone in half.
12. **The rest:**
   - A page outside the story (title, credits, blurb) is a title card or not made.
   - The page's time holds, and a page with none takes the one before's.
   - A bubble is carried only while words remain, keeping its thought style.
   - A stretcher, not a hospital bed, in an ancient world.

## Status (2026-09-25): built and tested; both books remade locally, partly (the OpenAI credit ran out)

On branch `visualize-true-stories` in both repos, committed locally, not pushed. Richard took all five recommendations.

**Built, by part:**
- **Part 1, reading the book right.**
  - The column-aware reading order (`reading-order.ts`), now also reading a page's running head first when it is split across the gutter.
  - Every note keeps direct speech.
  - The story's own words (`story-text.ts`) drop verse numbers, footnote marks, running heads and notes, including a mark or verse number set on a line of its own, and join words broken around a mark.
  - `npm run doc:reread -- <id> [--go]` reads a document again in place: its pages, its notes, and its story.
- **Part 2, who's who and who says it.**
  - The merge, the attribution rules and the checks, as planned.
  - Testing Matthew found more, now fixed:
    - a lead-in with "shouting" or "crying";
    - "When Jesus entered…, he said";
    - "As Jesus went on…, he saw Matthew";
    - someone the story does not name ("a ruler came and said"), left to the writer;
    - a speech running on to the next page;
    - scripture the book quotes, read by the narrator.
- **Part 3, scenes, and where people are.**
  - Scenes as planned.
  - The story reading now says where each person is when some are apart (Sally in the cave, the boys beside it). The stage keeps them there and cuts between the places. Only their own words move them: a line said in the other place, or their coming there. A scene the writer lists them in does not, and a question to the viewer is never a scene.
  - A stage is never left empty. A scene that names no one keeps who was there, and the one a narration is about comes into view. Someone who went is back for a conversation with someone there. "Soon after" starts a scene.
  - A place the writer or the narration names is found among the story's places.
  - The first page is a title card; the other front and back pages are not made.

**Decided while testing:**
- **The story reader is gpt-4.1 now, not 4.1-mini** (`AI_MODEL_SCENE_STORY`). Mini put James in the cave with Sally in two of three readings; 4.1 got it right in three of three. It costs about five times as much, once a book: about $0.04 for Hide-and-Seek and $0.30 for Matthew.
- **The writer gets how the page before ends.** Without it, a line at the top of a page went to the wrong one ("Mark, James, there's something down here", Mark's father's).
- **A book keeps its 32 most used places, not its first 16.** The reading also lists the other places a page moves through.

**Results, on the two books remade locally:**
- **The notes keep the speech.** Hide-and-Seek's notes kept 15 of its 76 quotes before and 48 after; most of the rest are merged with the next quote, not lost. Matthew's notes hold 415 quoted passages, up from 129.
- **Who says it.** Every Hide-and-Seek line the text reader settles is right. Matthew 13–27 were checked line by line against the book:
  - "Follow me" is Jesus's, not Matthew's.
  - "Have mercy on us" is the blind men's, not Jesus's.
  - "Go away, the girl is not dead" is Jesus's, not the crowd's.
  - "An evil and adulterous generation" is Jesus's, not the Pharisees'.
  - "My daughter has just died" is the ruler's.
  - A line whose speaker the words cannot settle is left to the writer, as planned.
- **The cave.** Pages 9–13 cut between Sally in the cave and the boys (and later Mark's father) at the tree. On page 12 Mark's father stays above while Sally talks from below, and he climbs down on page 13.
- **Front and back pages.** Page 1 is the title card ("Hide-and-Seek, by T. Albert."). Pages 2, 3, 26 and 27 are not made. Page 7, turned down before as too thin when videos were made from the note, is made.

**Not finished: the OpenAI credit ran out** during the last remake.
- **Made with the final code:** Hide-and-Seek 1 and 4–13, and Matthew 13–18.
- **Kept their earlier videos:** Hide-and-Seek 14–25 were made with part four's first commit, and checked. Matthew 19–27 were made before the Matthew attribution fixes.
- Matthew 17's remake after the last fix (a name anyone could be called by) failed too, so it still calls the bleeding woman "Canaanite woman".
- Once the credit is topped up:
  - `npm run scene:recast -- 01a0d669-e03c-70b3-b309-01d55bc724d0 --here --pages 14-25`
  - `npm run scene:recast -- 01a0d65e-e6cf-7bdf-8eaa-52bb16b6b67d --here --pages 17,19-27`

**Still imperfect:**
- **The story reading of a long book varies from one reading to the next.** One reading of Matthew made the disciples John the Baptist (fixed in the merge). The current one still makes the Marys one person, and gives Peter "Simon the leper". Places are general ("inside a small house"), and a page that tells of several places does not always list them. A book is read once, so a bad reading stays until it is read again.
- **The writer sometimes squashes nested quotes** ("‘Go’ and he goes, and to another ‘Come’" became "Go Come Do this"). It also marks no scene where the book moves on without saying so (Matthew 17: the girl stays on stage through the next healings), and on a page with no quotes it may give someone a short line of its own. The checks send most of these back once; what is left after the second try is kept.
- **Someone the story does not name** ("a ruler") is the writer's to cast. Now it usually is.

**To deploy** (no migration):
- Story books are read again on their next page made (`STORY_VERSION` 3), with gpt-4.1. If Railway sets `AI_MODEL_SCENE_STORY` to gpt-4.1-mini, change it to `openai:gpt-4.1`.
- Books already made need `npm run doc:reread -- <id> --go` (pages, notes and story), then `npm run scene:recast -- <id> --here` (or `--go` for the worker). Ask before running either on a production book.
- The API and the worker need restarting to run the new code.

## Decisions for Richard
1. **Existing books.** The two-column fix needs a document's pages extracted again, and its notes simplified again.
   - Recommended: a script that re-extracts one document in place and remakes its notes, run on Matthew and Hide-and-Seek.
   - Alternative: upload them again.
2. **Who marks scenes.** Recommended: the writer, in the screenplay it already writes (it reads the page closely, at no extra call), with code inferring them where it did not. Alternative: the story reading, once a book, which reads too coarsely to place a cave.
3. **The cave.** Recommended: cutting between the two places. Alternative: a cut-away set with two levels, people above ground and below. It shows both at once, but it is a new kind of set for the painter and the stage.
4. **Front and back pages.** Recommended: the first page a title card (the title and author, read by the narrator), the rest not made.
5. **The notes.** Recommended: direct speech kept in every document's note, not only stories. It changes the reader's notes too, for the better.

## How we'll know
- **A story truth set.** Hide-and-Seek pages 4–25 and Matthew pages 13–27, with every quote's speaker labelled by hand from the book, and each page's scenes (place, people). Tests check that:
  - every line goes to its speaker;
  - no quoted line is the narrator's;
  - the stage at each line shows the speaker and only that scene's people;
  - the place matches the narration.
- **Unit tests for each rule.** The merge, the attribution cases above, the gutter on Matthew's page, and scenes.
- **The pages remade and watched on `/dev/stage`.** Sally in the cave; Matthew 13, 14 and 15.

## Costs
- **Code:** the extraction, the merge, the attribution rules, scenes and staging cost nothing to run.
- **The writer:** scenes add a few fields to the screenplay it already writes.
- **Reading again:** each story is read once more (`STORY_VERSION` 3). Re-extracting a book simplifies its pages again, on the maths model only for maths pages.

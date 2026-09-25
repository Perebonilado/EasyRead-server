# Visualize: who's who, where it happens, voices beyond the stage, and maths you can follow

Richard's asks (2026-09-24), after watching Bible pages:

1. **Characters.** Tell them apart, and let famous ones such as Jesus stand out, above all when several share a scene.
2. **Settings.** They need more detail: a scene on a boat didn't show a boat, and crowds the text mentions were never drawn.
3. **Voices.** Not everyone who speaks is there. God spoke at Jesus's baptism, but Jesus said God's line.
4. **Unstated places.** Where a story doesn't describe the scene, infer it from the dialogue and the context.
5. **Maths.** Some documents are pure maths and others carry calculations in their prose. Break every calculation down so the learner can follow it.

This builds on `visualize-story-script`: screenplays, no labels on story pages, a camera that makes shots, and the acting rig.

## 1. Telling characters apart

### Today
- **Looks are guessed.** The story reader writes each character's look from the text. Where the text says nothing, it makes "a plain choice that fits the time and place".
- **The kit has a fixed wardrobe:**
  - body: 4 ages, 3 builds, skin 1–10;
  - hair: 13 styles, 8 colours, 4 kinds of facial hair;
  - clothes: 10 headwear, 13 tops, 3 bottoms, 13 cloth colours, 8 extras.
- **Nothing keeps two characters apart.** In a Bible story, Jesus, John and the disciples can all come out as bearded adults in brown or white robes.
- **Labels no longer help.** Story stages now carry no names, so the look alone must say who someone is.
- **Famous figures get no special treatment.** The reader isn't asked to draw them the way they are traditionally shown.
- **Missing costume pieces** for a Bible story, or a traditional West African one: an ankle-length robe, a sash, a cloak or mantle, sandals, a shepherd's staff, wings, a camel-hair garment. There are no West African garments either: agbada, kaftan, gele, wrapper.

### The approach
- **Iconic figures, drawn as tradition shows them.**
  - The reader marks well-known figures `iconic` and gives the look they are known by: Jesus with long brown hair and a beard, a white robe to the ankles and a red sash; Mary in a blue mantle; Moses with a staff and a white beard; kings with crowns.
  - A small code registry fixes the kit spec of the figures that come up most, so they look the same in every book:
    - Jesus, Mary, Joseph, John the Baptist, Moses, Noah, David, the disciples;
    - angels, Pharaoh, Roman soldiers;
    - and so on.
  - The reader covers anyone else.
- **New costume pieces in the kit.** All are drawn by code, at no model cost:
  - ankle-length robe, sash, cloak or mantle, sandals, staff, wings;
  - rough animal-skin garment, agbada, kaftan, wrapper and gele;
  - a soft light behind a revered figure, where the tradition allows it (see the decisions).
- **Distinct looks, enforced by code.**
  - After the reader has spoken, code compares every pair of main and supporting characters in the book:
    - silhouette: age, build, hair style, headwear, top and bottom;
    - palette: clothes, accent and hair colours;
    - skin.
  - Where two are too alike, code changes the second one's free choices until they differ enough: a colour the text never gave, a hair colour, an accessory.
  - What the text says is kept: the reader marks which attributes came from the text.
  - Main characters get the clearest, most saturated colours.
- **Who matters, on the stage.**
  - Main characters stand at full colour and size.
  - Minor characters and groups stand a little smaller, in muted colours, a step back.
  - The speaker keeps the camera and gets a faint rim of light while speaking.
- **First meetings.** The first time the book meets a named character, the camera moves in on them for a moment as the story names them. The caption band already gives the speaker's name before each line.

## 2. Richer places: the boat, and the crowd

### Today
- **Painted once, from a line.** Each place is painted once per book from a one-line look ("small house near a river").
- **Kept deliberately plain.** The painter is told to keep it calm and soft, leave the lower third flat and empty for people to stand on, and never draw people. The stage then shows the set at half strength behind everyone (`BACKDROP_OPACITY` 0.5).
- **No way to be in something.** "On a boat" becomes people standing on a floor with water behind them: nothing puts them *in* the boat.
- **No crowds.** The painter draws no one, the reader lists only named characters, a stage holds at most 5 things, and a "group" is at most 4 figures.

### The approach
- **Places described for painting.** The reader gives each place:
  - its defining features ("a wooden fishing boat on the Sea of Galilee, nets over the side, low brown hills across the water");
  - whether it is outside, inside, or a vessel;
  - how people are in it: standing on the ground, or in it (a boat, a cart, a room behind a table).
- **Front pieces.**
  - The painter paints a place in two layers: the scene behind, as now, and a front piece that goes in front of people's legs, such as the boat's side, a table, a fence, or a well's wall.
  - The stage draws the front piece over the people, so they are in the boat or at the table.
- **Crowds, drawn by code.**
  - A page can be busy ("crowds followed him", "the market was full"): none, a few, or many.
  - Code draws the crowd with a simplified kit figure (light, about 1–2 KB each), with no model cost:
    - 6–20 people in rows behind the characters, smaller and muted;
    - dressed for the story's world, varied by seed;
    - they breathe, look at whoever speaks, and react (cheer, gasp, turn) when the words say so.
  - A crowd can speak as one ("the crowd shouted"), with its bubble over the crowd.
  - The crowd doesn't count toward the five things on the stage.
- **Time and weather.**
  - A page's time of day and weather change the painted place without repainting it: a dusk or night grade over the set, and the rain and wind already there.
  - The storm on the lake is the lake at night, with wind and rain.
- **Stronger sets on story pages.**
  - The set shows at full strength behind a story; lessons keep the faded paper look that makes labels readable.
  - The painter is asked for a recognisable, fuller scene: more elements, still flat colour with no texture.

## 3. Voices beyond the stage

### Today
- **Everyone who speaks has a body.** The story reader lists named people and creatures, and every speaker stands on the stage.
- **Other voices go to the wrong place.** A voice from heaven, a phone call, a letter read aloud, a thought, or a crowd shouting goes to someone on the stage, or to the narrator.
  - In production, where lines still follow the writer's marks, God's line at the baptism went to Jesus.
  - On the new branch, the dialogue finder leaves "a voice from heaven said, …" to the narrator (checked against Matthew 3 while planning). That is better, but still not God, and the screenplay writer could still give the line to Jesus.

### The approach
- **Every speaker in the cast, seen or not.**
  - The reader lists everyone who speaks, and whether they are seen or only heard: God, a voice from heaven, an unseen angel, a voice on the radio, a storyteller heard over the story.
  - Groups (the crowd, the disciples) are speakers too.
  - A heard speaker never gets a body on the stage, and can never be drawn by mistake.
- **Where each line comes from.** Every line in the screenplay says one of:
  - here;
  - off (just off the stage);
  - above (from heaven or the sky);
  - phone;
  - letter;
  - thought;
  - dream or memory.
- **The book's word wins, for these voices too.** The dialogue finder learns the phrases that bring in a voice that isn't there: "a voice from heaven", "the Lord said", "God said", "the crowd shouted", "a voice called", "she thought". So such a line can't be handed to someone on the stage.
- **How each is shown:**
  - **Above:** light falls from the top of the stage, and the words appear at the top with no tail. Everyone on the stage looks up.
  - **Off:** the bubble sits at the edge with its tail pointing out, and the listeners turn toward it.
  - **Phone:** the speaker's bubble has a phone-line tail, and the listener holds a phone (the kit has one).
  - **Thought:** a cloud bubble; the thinker's mouth stays still, and their voice is quieter and slower.
  - **Letter:** the letter is on the stage, read in its writer's voice.
  - **Group:** the bubble is over the crowd, which reacts.
- **Voices of their own.** A heard speaker gets a voice no character has.
  - God: deep, calm and unhurried.
  - An echo on that voice would need the voice server to add reverb to marked pieces. That is optional and needs a redeploy.

## 4. Places inferred when the story doesn't say

### Today
- A page's place is whatever the reader names, or none, in which case the stage shows plain paper. The reader's instruction is "place: the name of where it happens, or null".

### The approach
- **The story's world, read once per book.** The reader records:
  - era, region and culture;
  - climate and landscape;
  - what homes and streets look like.

  For example, "first-century Galilee: dry hills, stone houses, fishing boats" or "a Yoruba town today". The kit's clothing, the set painter and the crowds all dress for it.
- **Every page has a place.**
  - Where the text says, the page uses it.
  - Where it doesn't, the reader infers it from what is said and done and from the story's world ("pass the salt": a table at home; "they let down their nets": a boat on the lake), and marks it inferred.
  - Inferred places are general ("a village street", "inside a small house") and reused, so they don't multiply sets.
- **Continuity.** A page that gives no clue keeps the place of the page before, unless the story says they went somewhere.
- **Time of day and weather are inferred the same way.** "They lay down to sleep" means night; "the wind rose" brings the storm.

## 5. Maths you can follow

### Today (surveyed across both repos)
- **Extraction loses maths before anything else sees it.**
  - A PDF's text layer puts superscripts on the line ("x²" becomes "x2") and splits a fraction onto two lines without its bar (`pdfjs-toolkit.adapter.ts`).
  - Symbol-font characters are deleted: π, Σ, √, ∫, =, ≠ (`text.ts`).
  - A lost character between two digits becomes a minus, so a lost ×, ÷ or = turns into "−".
  - PowerPoint equations are dropped (`slides.ts` reads only `<a:t>`).
  - The OCR that can read maths from the page image (Mistral, which returns LaTeX) runs only on pages with almost no text (`ocr.processor.ts`), so a digital page with garbled maths is never re-read.
- **Simplification can quietly change the maths.**
  - It is one text-only call per page, on gpt-4o-mini by default. It is told to keep numbers exact, but not to keep a worked solution's steps, their order, or why each follows.
  - Nothing checks afterwards that the numbers or the steps survived.
- **The reader** shows display equations with KaTeX. Two gaps:
  - Inline `$…$` inside a paragraph shows as raw LaTeX.
  - Follow-along never highlights an equation, because maths blocks lack the `data-block` hook.
- **Videos** show typeset working (MathJax), with the equals signs lined up and one line after another. Gaps:
  - Working is allowed only in books the profile calls maths. A biology or law page with one calculation gets a card that says "Working".
  - Only the writer's optional plain-arithmetic check is verified. Algebra steps are never checked, and a wrong sum can survive the one retry.
  - Lines appear on a timer, not when the voice reaches them.
  - For young learners, the stage's word cap fights the maths word allowance.
- **Speech.** Nothing reads maths. The voice doesn't say =, +, ×, ÷, powers, roots, π, "4x" or ½ properly. `speech-rule-engine`, which does exactly this, is already installed with MathJax and unused.
- **Lectures and the tutor.**
  - The lecture sees an equation only as "(an equation: …)".
  - The board is handwritten ASCII.
  - `compute` gives one result with no steps, and the tutor you talk to during a lecture has no `compute` at all.

### The approach: one worked solution, checked by code, used everywhere
- **Get the maths in right.**
  - **Detect maths on each page** from the text layer: symbols, the density of operators and digits, and the traces of lost glyphs.
  - **Re-read maths pages from the image** with the OCR that returns LaTeX, even when the page has a text layer.
  - **Fix the text cleaning:** map symbol-font glyphs to their characters instead of deleting them, and never turn a lost character between digits into a minus.
  - **Read PowerPoint equations** (`<m:t>`, Office's maths markup) into LaTeX.
- **A worked solution as data**, one shape for the reader, the videos, the voice and the tutor:
  - the problem: what is given and what is wanted;
  - steps, each with:
    - the line (LaTeX);
    - what is done ("subtract 3 from both sides");
    - why;
    - which terms change;
    - the words the voice says;
  - the answer with its units, and a check (put it back in).
- **Code checks every step before a learner sees it.**
  - Arithmetic is checked exactly (mathjs, already in use).
  - An algebra step must be equivalent to the line before. Code tests this by evaluating both at sample values: an equation's solution must satisfy every line; a simplification must agree everywhere.
  - The givens must be the page's own numbers (the check charts and timelines already use).
  - A step that fails goes back to the writer. If it still fails, the working stops at the last true line and code gives the answer. No wrong line reaches the screen.
- **Broken down for the learner's stage.**
  - **Primary:**
    - one operation a step;
    - pictures of the numbers: bar models, number lines, place-value blocks, arrays for times tables, fractions as parts of a bar;
    - "your turn" before the last step, with a pause.
  - **Secondary:** standard steps with the rule named ("do the same to both sides"), and one "think first" pause.
  - **University:** the key steps, the method named, and the reasoning. Nothing is skipped that the exam expects.
  - **Professional:** the formula, what goes in, the result, and what it means.
  - **Word problems, every stage:** first "what we know, what we want", then the equation, the working, and the answer in words with its units.
  - **Every step, every stage:**
    - the voice says what we do, the line does it, and the part that changes is coloured;
    - the lines before stay in view;
    - a short pause follows.
- **Maths on any page.**
  - The book-level gate goes. Any page with a calculation gets its working, whether from the page's maths flag or the writer asking.
  - A law page that works out interest shows 5% × ₦200,000 = 0.05 × 200,000 = ₦10,000, checked, as working.
- **Maths said properly.**
  - LaTeX is turned into words with `speech-rule-engine`, in its plain "ClearSpeak" style for learners: "x squared plus three x equals ten", "a half", "the square root of two".
  - The same spoken forms time each step's reveal to the moment the voice says it.
- **The reader:**
  - inline maths rendered in paragraphs;
  - a worked-solution block that reveals one step at a time, with a "next step" control and each step's reason;
  - follow-along that highlights the equation and the step being spoken.
- **Lectures and the tutor:**
  - the lecture sees the whole worked solution;
  - the tutor gets a "work it through" tool that returns checked steps (`compute` with steps), also during a lecture;
  - the board shows typeset maths beside its handwriting.

### How we'll know
- **A test set:**
  - a primary arithmetic worksheet;
  - a secondary algebra page;
  - a university calculus page;
  - a physics problem with a formula;
  - a law or finance page that calculates interest;
  - a statistics page;
  - a scanned maths page.
- **Measured on it:**
  - every number and expression in the source appears after extraction and simplification;
  - every step on screen is checked;
  - no wrong line reaches the screen;
  - each step is said properly, and appears as it is said.
- **Unit tests:**
  - glyph mapping, superscripts and fractions in extraction;
  - numbers and steps kept through simplification;
  - step checks, true and false;
  - spoken maths;
  - the worked-solution renderer on the client.

## Decisions for Richard

1. **Sacred figures.**
   - Recommended:
     - never draw God: light from above, and a voice;
     - draw Jesus and other Bible figures the way children's Bibles do;
     - follow the text's own tradition, so for Islamic texts, prophets are never drawn: light, or the narrator, instead.
   - Alternative: no religious figure is ever drawn: voice and light only.
2. **A glow behind revered figures (Jesus, angels).** Recommended: none. Their traditional look sets them apart, and light from above is kept for voices from heaven. Alternative: a soft glow behind them.
3. **Books already read.**
   - What the new reading adds: the story's world, inferred places, crowds, iconic flags and heard speakers.
   - What it costs: re-reading the story (one model call per stretch of about 40 pages) and repainting its places.
   - Recommended: new books get it; an existing book on its next page make, once. Ask before a very long book such as a whole Bible.
4. **Checking algebra.** Recommended: in the server, with mathjs and sample values, adding no new service. Alternative: a Python SymPy service for full symbolic checking (a new deploy).
5. **Maths pages through OCR.** Recommended: yes, for pages flagged as maths. It is a small cost per maths page, and it is the only way to recover fractions, powers and symbols from a PDF.
6. **The model that simplifies maths pages.** Recommended: the stronger model (gpt-4.1) for maths pages only. They need exact steps, and gpt-4o-mini drops and reorders them. It costs more per maths page.

## Order

1. **Voices beyond the stage.** It fixes wrong speakers today and is the smallest change.
2. **Maths, part one:** get it in right, the worked solution as data, code checks, and simplification that keeps steps. This matters most for anyone uploading maths.
3. **Characters apart and places:** the kit's costumes and iconic figures, distinct looks, the story's world, inferred places, front pieces, crowds, time and weather.
4. **Maths, part two:** the reader's step-by-step block, spoken maths, working on any page timed to the voice, pictures of numbers for young learners, and the tutor's tool.

Each part is tested as the last ones were: unit tests, then real pages remade and watched on `/dev/stage` and in the reader. Two groups of test pages:
- **Stories:** the Bible chapters of the baptism, the storm on the lake, and the feeding of the crowd.
- **Maths:** the test set above.

## Costs
- **Characters:** the costume pieces, distinct looks, crowds and hierarchy are code, with no model cost. The story read grows a little, once per book.
- **Places:** the set painter paints a little more (a front piece, more detail), once per place per book. Time of day and weather are code.
- **Voices:** code and the writer's instructions. Echo on a voice from heaven needs a voice server change, which is optional.
- **Maths:**
  - OCR of maths pages: small, per maths page.
  - The stronger model for simplifying maths pages: more per maths page.
  - Step checks, spoken maths and rendering: code.

## Status (2026-09-25): built and tested, all four parts

Built on `visualize-world` in both repos. It sits on `visualize-story-script`, which is already in main (PR #15), so its PR holds only this work. Nothing is pushed yet.

**Decisions taken:** the six recommendations above.
1. God is never drawn: light from above, and a voice. Bible figures are drawn as children's Bibles draw them. A text's own tradition is followed: prophets are never drawn in Islamic texts.
2. No glow behind revered figures.
3. An existing story is read again once, on its next page make, when it is short (six stretches or fewer). A longer book waits for `scene:recast`, asked for first.
4. Algebra is checked in the server with mathjs and sample values.
5. Maths pages always go through OCR.
6. gpt-4.1 simplifies maths pages only.

**What was built:**
1. **Voices beyond the stage** (server 01d2782, client 1f8c3fd).
   - Each line has a presence and a `from`. God is always above.
   - A voice from heaven or a crowd is added from the page's own text.
   - Off-stage, phone, letter and thought lines get their own bubbles.
   - People who hear a voice look toward it.
2. **Maths, part one** (397fb42, fc20c2f).
   - Maths is detected on each page and read in right: Symbol-font glyphs, PowerPoint equations, and OCR of maths pages with a vision fallback.
   - Migration 0054.
   - The worked solution is data, and code checks every line (`maths-work.ts`).
   - gpt-4.1 writes maths pages. A page with a wrong line is sent back once, then cut at the last true line.
   - The reader has a step-by-step block and shows inline `$…$`.
3. **Characters apart and places** (4ae962a, 1952267).
   - New costume pieces and a registry of iconic figures.
   - Code keeps looks distinct.
   - The story's world, inferred places, and a front piece (a boat's side).
   - Crowds drawn by code, plus time of day, weather and grades.
   - `STORY_VERSION` 2, `SET_VERSION` 3.
4. **Maths, part two** (edb62e4, 9d540e1).
   - Maths is said the way a teacher says it: MathJax with Speech Rule Engine ClearSpeak.
   - Working appears on any page, checked line by line. A line is revealed when the voice says what it comes to.
   - Young learners get number pictures: blocks, bars, rows of dots, sharing, and fraction bars.
   - The tutor's "work it through" tool, in a lesson and in a lecture: checked steps on both boards, with the words the tutor is to say.
   - Typeset maths beside the board's handwriting.
   - The checker reads a percentage either way (0.05, or 5 in PRT/100).
   - Step-level follow-along (b1af6d2, 59ca17a).

**How it was tested:**
- **Unit tests:** server 1408, client 64, all passing. Lint is clean on the changed files.
- **Bible chapters** (baptism, storm on the lake, feeding the crowd), remade and watched on `/dev/stage`:
  - God's voice comes from above, and both look up.
  - Jesus and John are drawn as iconic figures.
  - Jesus stands in the boat behind its side.
  - The storm has dusk and rain; the hillside has its crowd.
- **The maths test set:** every line checks true on all seven documents, including the scanned page.
- **The tutor's tool on seven problems** (primary through university and law): in the last run, every one checked in one try, in 1.3 to 3.7 seconds. An earlier run had one reply that took 9.6 seconds. They were watched on `/dev/board?work=tutor` (a new board lab) on both boards.
- **A primary page remade:** three workings, each with its number picture.

**Deploy:**
- New optional settings: `AI_MODEL_SIMPLIFY_MATHS` and `AI_MODEL_WORK_THROUGH`, both defaulting to `openai:gpt-4.1`.
- Migration 0054 (`document_pages.has_maths`).
- `SET_VERSION` 3 repaints places on their next page make. `STORY_VERSION` 2 reads short stories again.
- The contracts changed, so merge the server and the client together.
- Locally, Mistral OCR returned 429 on every try; the vision fallback read those pages.

**Not done:**
- Echo on the voice from heaven needs a Voice Server change, which was optional.
- Number lines and place-value (tens and ones) blocks for young learners. Small amounts are unit blocks and bigger ones bars.
- In a lecture, the tutor's free `board_write` figures get no typeset line. Board figures the lecture writes, and every line the tutor works through, do.

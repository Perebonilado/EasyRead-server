# Infographic videos: make them the way an editor does

Written 2026-10-01. It starts from *From Archive to Animation*, an editor's playbook that walks one real video (Nigeria's independence) through eight stages. This plan compares that process with how the Studio makes an explainer today, and sets out how to rebuild the explainer path around it.

Nigeria is only the playbook's worked example. Nothing here defaults to a region (see global-not-regional).

The goal is infographic videos people want to share on their social channels. Everything below serves that.

---

## 1. What the playbook says an editor does

The playbook has eight stages. The share of time is the editor's own estimate.

| # | Stage | What the editor has at the end | Time |
|---|---|---|---|
| 1 | Brief and angle | A one-page brief and **one driving question** | 5% |
| 2 | Research in layers | A master timeline, a research log, sources, the numbers checked twice, myths found | 25% |
| 3 | Decide what goes in | A six-sentence story spine, a keep / compress / cut table, five characters at most | 10% |
| 4 | Structure | A beat sheet: acts with timestamps and word budgets, a re-hook at the end of each act, plants and payoffs | 5% |
| 5 | Hook and script | Five or more hooks drafted and judged, then **a two-column script** (narration beside visuals), read aloud and timed | 20% |
| 6 | Visuals | A visual system (colour per thing, a legend, one base map as the "main character"), the key scenes storyboarded frame by frame | 20% |
| 7 | Voice, music, pacing | A pronunciation sheet, a music map per act, pacing checks | 5% |
| 8 | Review and package | A fact-check sheet (nothing recorded until every row is green), a sensitivity read, titles, thumbnails, a description | 10% |

### The ideas that make it work

1. **A question, not a topic.**
   - "Nigerian independence" is a topic.
   - "How did three regions that didn't trust each other agree to leave an empire on the same day?" is a question.
   - The editor drafts 8–12 angles and scores each from 1 to 5 on four tests: curiosity gap, tension, visualisable, payoff. Only then do they choose.
   - The test is to say the video in two sentences and listen for a follow-up question.
2. **Research gives more true, specific, visual material than could ever fit.**
   - Every fact goes in a log with its source, a confidence, and a note on how it could be shown.
   - Every number is checked against two sources.
   - A good video corrects at least one myth.
3. **Selection is the stage beginners skip.**
   - The editor keeps about 5% of the research.
   - Each item faces four questions: does it move the question forward, does it set up a payoff, can it be shown, will it surprise? An item needs two yeses.
   - Story beats are joined by "but" and "therefore", never "and then".
4. **The script is written in two columns at once.**
   - The left column is what the narrator says; the right is what the viewer sees.
   - "If you can't write the right-hand cell, the left-hand line probably shouldn't be there."
   - Don't narrate the graphic. If the chart shows 174 of 312, the voice says what that *means*.
5. **A small, consistent visual system.**
   - Each line of narration is sorted into one of eight kinds, and each kind has a default visual:

     | The line is about | Default visual |
     |---|---|
     | a place | the map |
     | when | a timeline or a calendar |
     | how many | a chart, a counter or an icon grid |
     | who | a portrait name card |
     | why (cause and effect) | a flow or moving objects |
     | a comparison | a split screen |
     | a feeling | an illustrated scene |
     | exact words | a quote card |

   - Each thing gets one colour for the whole film, with a legend. One colour is held back for the payoff.
   - One base map is used throughout, at the same projection, with boundaries correct for the period.
   - At most eight words are on screen at once. Numbers go on screen; explanations go in the voice.
6. **Pacing is measured.**
   - A visual change every 3–5 seconds in explanatory sections.
   - No frame held still for more than about 6 seconds unless it is a deliberate hold.
   - Each act ends on a hold or a question.
   - Re-hook the viewer every 60–120 seconds.
7. **Nothing ships unchecked.**
   - A fact-check sheet covers every claim.
   - Opinions are attributed to someone.
   - Loaded words are searched for and replaced.
   - Screen time per side or region is counted.
8. **Packaging is part of the job.**
   - Five titles are drafted and judged.
   - Three thumbnail ideas: the thumbnail and the title say different things that add up.
   - The description has chapters, sources and a "what we left out" paragraph.

---

## 2. What we do today, stage by stage

How the pipeline works in detail is in `studio-explainer-plan.md` §0 and in the chat of 2026-10-01. In short: the producer chat fills a brief, a bible lists recurring pictures, the outline writes the scenes, and each scene is written by the `sceneWrite` prompt. All of these run on DeepSeek Flash. Code checks the results and sends a draft back once. Code-drawn kinds and the DeepSeek artist draw the pictures. The voice comes from the admin setting. The browser plays the film live.

| Playbook stage | Today | Gap |
|---|---|---|
| **1. Brief and angle** | The producer (`studioTurn`, `studio-prompts.ts:200`) asks for format, idea, audience, minutes and tone. | No takeaway sentence, no "what it is NOT", **no angle and no driving question.** The idea goes in as a topic. |
| **2. Research** | **None.** From a document, facts come from the pages (`NO_INVENTION`). From a prompt, they come from DeepSeek's memory. | No sources, no confidence, no second source for numbers, no myths found. A wrong date in the first 30 seconds "poisons the comments", and on social media that is the whole video. |
| **3. Selection** | None as a step. The outline writer picks while it plans. | No spine, no but/therefore test, no cut list, no limit on the cast. |
| **4. Structure** | The outline (`studio-prompts.ts:514`) gives each scene a length and a `teach` page. Its shape is **"hook, then one idea a scene, then recap"**: a lesson. | **The shape is a lesson, not a story with tension.** There are no re-hooks, and plants and payoffs don't exist as things the pipeline knows about. `studio-cold-open` and `studio-chain` catch some of this after the fact. |
| **5. Hook and script** | One hook. **Each scene is written alone**, three at a time, by `sceneWrite`, which returns the voice lines and the storyboard together. | Writing both columns together is the playbook's most important habit, and we already do it. But no one sees the whole film when writing, there is one draft of the hook, no editor's read, and the writer is DeepSeek Flash. |
| **6. Visuals** | Code draws the exact kinds (map, flag, equation, flow, molecule, chart, plot, timeline, quote). The figure kit draws people. DeepSeek draws everything else freehand. Every film uses the theme's house palette. | **No visual system per film**: no colour per thing, no legend, no held-back colour. **Each map is drawn new in every scene**, from today's countries only: no regions inside a country and no historical borders. Missing visual kinds: counter, icon grid, name card, calendar, seat chart, strike-and-replace text, objects flowing between two things, a source line on data. The drawing judge (Gemini) **never looks at explainer drawings.** **No illustrated scenes**: the story path's sets, crowds and acting reach an explainer only through story clips (6–20 s, at most 2 an episode, with dialogue). |
| **7. Voice, music, pacing** | Pace is set per sentence. Pronunciations are kept per institution. Music is chosen by mood per sentence. A draft is sent back for 30 spoken words with nothing new on screen. | **30 words is about 12 seconds**, against the playbook's 3–5. There is no pronunciation sheet per film (names in history and news). |
| **8. Review and package** | `studio_check` judges whether a re-made scene now does what the maker asked. Packaging is a title, a logline and "next" questions. | **No fact-check, no sensitivity read.** No thumbnail, no description, no chapters, no captions. **No MP4 export at all: the film plays only in our player, so it cannot be posted to TikTok, Reels, Shorts or X.** |

### What we already have that the new process keeps

- **The narration and the storyboard are written together.** This is the playbook's "two columns", and we keep it.
- **Exact pictures are drawn by code from real data**, never freehand. This is the playbook's "draw your own maps from verified boundaries".
- **Step timing lands on the spoken word** (`composeScene`), and **wide and tall films come from one script.**
- **The teaching rules carry over:** teach, never describe the picture; no left or right (explainer-voice-teaches). Our voice rules already include "don't narrate what's on screen".
- **One world per scene, the camera travels, the picture builds** (explainer-continuity). This is the playbook's "map as main character", but only inside a scene. The rebuild stretches it across the whole film.

### Why the films feel low quality

The writing model is one cause, but not the only one:

1. **There is no editorial thinking before writing.** No angle, no research, no selection. The writer is handed a topic and asked to fill 30–60 seconds a scene. The result is a narrated textbook page, which the playbook calls "a narrated Wikipedia page".
2. **The writer is a weak writer** (Richard, 2026-10-01: "DeepSeek is trash at writing"). It also writes each scene without seeing the others.
3. **The pictures have no system.** Each scene invents its own look. The map forgets what it showed. Colour means nothing.
4. **There are no illustrated scenes.** An infographic video is an *illustrated* video: about a third of the playbook's script shows people and places, not diagrams. Examples: the crowd at night as the lights dim, members walking out of the chamber, a student's pencil sketch. Our explainers have no sets, no crowds and no acting outside the rare story clip.
5. **Too many pictures are freehand**, and most infographic kinds don't exist yet, so the artist or a word card fills in for them.
6. **Pacing is two to three times slower** than the craft standard.
7. **No one checks the film as a whole.** Nothing checks the facts, the balance, or the frames as a viewer sees them.
8. **It can't be shared** without an MP4 export.

---

## 3. The new pipeline: an editor's desk

The new pipeline follows the playbook's stages. Each stage is a job that writes one structured document, which the next stage reads. These documents become the film's working file. They are kept so the maker can see them, a stage can be re-run without the others, and we can see where a bad film went wrong.

### A show of episodes, not a film squeezed short

Quality comes from giving the story room, as the playbook does with 10–14 minutes. **Nothing is packed into a minute.** The Studio already has shows and episodes (`addEpisode`, `studio.service.ts:2206`; an episode can run up to 5 minutes, `EPISODE_MINUTES`), so a topic becomes a **show**:

- **The show** is planned once, for the whole topic. It holds the brief, the driving question, the research, the story spine, the **episode map** and the visual system. This is where the editor's 40% of up-front work happens.
- **An episode** is **3 to 5 minutes**. Its length comes from its material, never from a target: each episode answers its own question fully and doesn't pad or cram.
- **Episode 1 is made first.** When it is done, the maker is asked whether to add more. Each further episode picks up the material the plan held back, with the same colours, map, cast and voice. It calls back to what the earlier episodes planted.
- **Together the episodes make the long film.** Exported one after another with chapters, a show of three or four episodes is the 12–15 minute video the playbook makes.

```
SHOW (once per topic)
maker's ask ─► 1 Brief + angle ─► 2 Research log ─► 3 Spine + episode map ─► 6a Visual system + world bible
                  (maker picks                         (what goes in which
                   the angle)                           episode, what's left out)
                                                                 │
EPISODE (3–5 min, one at a time)                                 ▼
   4 Beat sheet ─► 5 Hooks + two-column script ─► 6b Storyboard + 6c shot lists ─► 7 Voice + pacing ─► 8 Review + package ─► 9 Export
                     (whole episode, one pass,                                           (fact sheet,             (MP4,
                      then an editor's read)                                              frames, titles)          captions)
                                                                 │
                                         10 "Add more?" ◄────────┘  ─► the next episode from the map (back to 4)
```

### Who does what

| Work | Who | Why |
|---|---|---|
| Editorial: brief, angles, selection, beat sheet, hooks, script, editor's notes, packaging | **GPT-5.4 mini** (`openai:gpt-5.4-mini`, $0.75 / $4.50 per million tokens, cached input $0.075), reasoning effort `medium`, set by a new task `explainer_edit` (`AI_MODEL_EXPLAINER_EDIT`) | Richard's choice (2026-10-01): a GPT mini, on the OpenAI key we already have. It is the newest model OpenAI names "mini". Each stage asks for one small job, which suits a small model better than one call doing everything. |
| Research and fact-check | **GPT-5.4 mini with OpenAI's web search tool** (`openai.tools.webSearch` in `@ai-sdk/openai`; the Responses API, which `createOpenAI` already uses). $10 per 1,000 searches, plus the search content at the model's token rate. From a document, the pages are the first source. | Every claim comes back with the URLs it came from. |
| Arithmetic: word budgets, seconds, colour contrast, pacing, screen-time counts | **Code** | Code owns the numbers, as it already does for maths and maps. |
| Infographic visuals: maps, charts, counters, icon grids, name cards, calendars, seat charts, flows, quotes, timelines | **Code**, from the script's data | The playbook's visual system is a small set of templates. Templates are code. |
| Illustrated scenes: sets, people, crowds, props, light, camera | **Code kits** (the story path's set layouts, figure kit, crowds, vehicles and props, extended in stage 6c). The writer model only names things from closed lists | "Models name things, code decides geometry" (studio-world-plan). This is how Studio's sets went from a median of 4.67 to 9. |
| Things no kit covers (a period landmark, an object of the topic) | **The artist, inside the existing judged loop** (takes, Gemini judge, revisions), drawn once per show and reused. **Proposed artist: Gemini 3.8 Flash** for show art. The bake-off scored it 6.67 against DeepSeek's 4.33, at about 1.2 cents a drawing against 0.26 | Illustration is paramount here, and these are drawn once per show, not per scene. |
| Looking at frames | **Gemini 3.8 Flash** (already the drawing judge) | Judges rendered key frames, diagrams and illustrated shots alike: legibility, clutter, words on screen, whether the frame matches its row, and whether the figures look right. It is pointed at explainers for the first time. |
| Voice | **No change** (admin setting), plus the film's pronunciation sheet | |

**Cost.** This is an estimate, to be measured in phase 1.

| Step | Writer work | Searches | Roughly |
|---|---|---|---|
| **The show, once** (angles, research, spine, episode map, visual system) | about 300–500k tokens in, 60–100k out | 40–80 | **$0.80–1.50** |
| **Each episode** (beat sheet, hooks, script, editor's read, fact check, package) | about 400–600k tokens in, 80–120k out | 20–40 | **$0.90–1.40** |
| **The show's art, once** (world bible: custom places, things and people, drawn in takes and judged) | 20–40 items, 2–3 takes each, up to 3 looks per take | — | **$0.50–1.50** |
| **Each episode's frame checks** (diagrams and illustrated shots) | 40–80 key frames at about 0.4 cents a look | — | **$0.15–0.35** |

So the first 3–5 minute episode costs about **$3–4.50** including the show's research and art, and each episode after it about **$1.10–1.80**. The voice is extra, as today.

**The other mini-class models, as the bench's comparisons** (prices from OpenAI's pricing page, 2026-10-01, per million tokens in / out):

| Model | In / out | Note |
|---|---|---|
| `gpt-5.4-mini` | $0.75 / $4.50 | Proposed writer: the newest "mini". |
| `gpt-5-mini` | $0.25 / $2.00 | Older reasoning mini; a third of the price. |
| `gpt-4.1-mini` | $0.40 / $1.60 | No reasoning; already the story reader. |
| `gpt-6-luna` | $0.10 / $0.50 | OpenAI's newest small tier, not called "mini"; the cheapest. It is worth one run on the bench. |
| `gpt-4o-mini` | $0.15 / $0.60 | Already failed as the video writer (`models.ts`: one drawing held for 90 seconds). Not a candidate. |

Never `gpt-4.1` (Richard). If the bench shows a mini can't write a hook or a script well enough, the step up is a larger model for **just the script and the editor's read**, with every other stage staying on the mini. That would be Richard's call.

### Stage 1: Brief and angle

- **Producer chat:** it gathers what it gathers today, except the length, plus two things:
  - the **takeaway**: the one thing the viewer leaves knowing;
  - **what it is NOT**: scope.

  It no longer asks "how many minutes". An episode is 3–5 minutes, set by its material. The film is wide by default, with a vertical twin (twins exist already).
- **Angles job (writer model):**
  - From the brief and a quick orientation search, it writes 8–12 candidate questions.
  - It scores each 1–5 on gap, tension, visual and payoff, gives a verdict, and writes the two-sentence pitch for the best ones.
  - Code sums the scores and ranks them.
- **The maker picks the angle.** The producer shows the top three as buttons, each with its pitch (ui-less-is-more: one choice, familiar buttons). "Leave it to us" takes the top one.
- **Output:** `brief.json` on the show, holding the brief, the show's driving question, the chosen angle, and the angles kept as sub-themes. Sub-themes are often later episodes.

### Stage 2: Research log

- **Research job (writer model + web search, or the maker's document).** It runs **once for the show**, for the whole topic: the playbook's "more true, specific, visual material than could ever fit". Each later episode only tops it up for anything new the maker asks for. The four layers are folded into one agentic run with a budget:
  1. Orientation builds the **master timeline** and lists the questions.
  2. Depth answers those questions from serious sources.
  3. **Look notes** for the illustrated scenes: what the places, people, clothes and objects looked like at the time, written as text with sources. For example: "the Race Course: an open ground, floodlights on poles, a pavilion"; "Balewa: tall, slim, white robe and cap". There are no photos (explainer-continuity: no real images), but the words come from sources, not the model's guess.
  4. **Numbers**: every quantity that could become a chart.
- **Output: `research.json`**, which holds:
  - **claims**: `{ id, text, kind: date|number|quote|name|event|claim, sources[], confidence, visual idea, contested }`;
  - the **timeline**;
  - **numbers**, each with its two sources or flagged;
  - **myths**: the belief, what the research shows, how to handle it;
  - **perspectives**: which sides a fair video must hear;
  - **look notes**: places, people, dress and objects as they looked, each with its source;
  - the **pronunciation sheet**;
  - **open questions**.
- **Code rules:**
  - A number with one source is `unverified`, and the script may not show it as an exact figure.
  - A quote without its exact source and year may only be paraphrased.
  - A contested claim must be attributed when it is used.
- **For a film made from a document:** the document is the first source and outranks the web. A claim the web contradicts is flagged, never silently changed. NO_INVENTION still holds for exam material.

### Stage 3: Spine and episode map (the show)

- **Selection job (writer model)**, from the brief and the research log, for the **whole topic**. It writes:
  - the **six-sentence spine** ("Once upon a time… Every day… Until one day… Because of that… Because of that… Until finally…"). For an explainer about how something works, the same shape fits ("Normally… Until… Because of that… So…");
  - the **but/therefore chain** of beats;
  - the **keep / compress / cut table**: every log item, the four filter questions, the decision and the reason. Kept items are given an episode;
  - the **episode map**: the spine split where the story naturally pauses, usually at the playbook's act breaks. Each episode has:
    - its own question, answered within it;
    - the kept items it covers;
    - its plants and the episodes that pay them off;
    - the open loop it ends on;
    - a natural length worked out from its material, within 3–5 minutes.
    
    A small topic may need only one episode, and that is fine;
  - the **cast**: at most 5 recurring people across the show, each standing for a force in the story, plus one-scene people on name cards;
  - **fairness notes**: equal weight, explain fears without judging them, restraint with violence. In a show, equal weight is counted across episodes as well as within each.
- **Code checks:**
  - every kept item has at least two yeses and an episode;
  - the chain has no "and then" links;
  - every plant is paid off in its own episode or a later one;
  - the cast is within its limit;
  - each episode's material fits 3–5 minutes at the audience's pace.
- **Nothing kept is lost.** Items for later episodes wait in the map. Only items cut from the whole show go to the description's **"what we left out"** paragraph.

### Stage 4: Beat sheet

- **Structure job (writer model), one episode at a time**, from that episode's part of the map. It lays out the episode's acts (usually two or three in 3–5 minutes): what each must do, its seconds, the **re-hook** line that ends it, and the **plants and payoffs** paired by id.
  - **Episode 1** opens with the cold open and the show's driving question.
  - **Each later episode** opens with a 5–10 second "last time" line, then its own hook.
  - **Every episode** ends on its own payoff, then the open loop into the next episode in the map. The last episode ends on the show's final payoff instead.
- **Code** turns the material into **seconds and word budgets**, from the audience's wpm (`studio-audience.ts`) and slower in grave sections. **The length comes from the material**; code never stretches or squeezes it to hit a number. It checks that:
  - the episode is 3–5 minutes; outside that, the map moves an item to or from the next episode;
  - every plant has a payoff, in this episode or a later one;
  - no act runs past 120 seconds without a re-hook.

### Stage 5: Hooks and the two-column script

- **Hooks job (writer model).** It drafts at least five hooks of different kinds and gives each a verdict, then combines the best into one: a picture, then a twist, then the question.
  - Code checks: no greeting, no "in this video", every claim in it carries a claim id with confidence `high`, and the promise appears again in the last line.
- **Script job (writer model): the whole episode in one pass, never scene by scene.** It is given the scripts of the earlier episodes so its callbacks are exact. Each row is one sentence:
  `{ narration, visual: { type, instruction }, claims: [ids], act, plant/payoff id, delivery, music }`.
  - `type` comes from the playbook's decision rule: place, when, how many, who, why, comparison, feeling, or exact words.
  - The prompt carries the playbook's writing rules, which overlap with ours:
    - one idea per sentence;
    - write for the ear;
    - don't narrate the graphic;
    - concrete before abstract;
    - plant and pay off;
    - attribute opinions;
    - no left or right.
- **Editor's read (writer model, a separate call with the playbook's checklists).** It reads the whole script with the brief, the spine and the log, then writes notes. The writer revises once.
  - This replaces the code send-back as the main quality gate. Code checks stay for what code can measure:
    - every factual sentence cites a claim;
    - each act stays within its word budget;
    - sentence length;
    - screen talk;
    - loaded words (a list kept in code: "tribe", "primitive", "backward" and the like).
- **The script is then cut into scenes** at act and beat boundaries. Each scene becomes the existing `beats + storyboard` shape, so `composeScene`, voice and playback run as before. This is the seam that lets phase 1 ship before the visuals are rebuilt.

### Stage 6: Visual system and storyboard

- **Visual system job (writer model, enforced by code), once for the show** (stage 6a), and kept by every episode. For the whole show it decides:
  - **colours**: each recurring thing (a region, a party, a side, a substance) gets a colour from the theme. Code checks contrast and colour-blind separation (a CVD simulation, like the playbook's simulator check). One colour is **held back for the payoff**. Colours avoid reading as judgments, e.g. red is never one side;
  - **the legend**: when it appears and where it stays;
  - **the base map**: region, projection and borders for the period. It is drawn once and kept for the whole show, and each episode starts from where the last one left it;
  - **motifs**: plants made visible (the playbook's seam that stays as a dotted line);
  - **the name-card template**.
- **Storyboard, per episode** (stage 6b): each script row's visual becomes stage steps, beat by beat, with a change every 3–5 seconds. The six or so key scenes that carry the argument get frame-by-frame boards first (the playbook's §6.3), as the scenes the film is built around.
- **New code-drawn kinds** (`scene-code.ts`), each a template in the theme's tokens, pointable and timed to words:

  | Kind | What it draws | Playbook example |
  |---|---|---|
  | `counter` | a number that rolls up to its value, unit and source line | "approx. 45 million" |
  | `icons` | a unit chart: icons multiply in a grid | soldiers multiplying |
  | `namecard` | portrait slot (a figure-kit bust or an initial disc, never a photo), name, role, colour border, one-line descriptor | Awolowo, teal border |
  | `calendar` | flip-calendars that flip and merge | 1957 / 1959 → 1 OCT 1960 |
  | `seats` | a parliament hemicycle filling seat by seat in colours | 174 of 312 |
  | `strike` | a word crossed out and replaced | IF → HOW |
  | `transfer` | tokens flowing along an arc between two things | coins South → North |
  | `document` | a document card with a stamp | "NEW STATES? — NOT RECOMMENDED" |
  | `split` | the screen split along a line, one side changing | two systems |

  Every data visual carries a small **source line** from its claim.
- **Maps** (`scene-map.ts`) get three upgrades:
  1. **Areas inside a country.** Natural Earth admin-1 provinces and states, which can be merged into named groups ("the Northern Region" = these states). This covers many historical regions approximately.
  2. **One map that persists across scenes.** Its colours, pins, seams and labels carry from scene to scene, and it changes by steps (split, drift, rejoin, light up).
  3. **Period honesty.** Natural Earth is today's borders. Until there are curated historical sets for the topics people make, a map for a past year carries a small "today's borders" note, and the research log flags it.
- **The freehand artist** draws only objects the templates and kits don't cover, inside the judged loop (6c). The drawing judge now looks at explainer drawings too.

### Stage 6c: Illustrated scenes

**This is the part of the film that makes it an illustrated video and not a slideshow of charts, so it is treated as paramount.** In the playbook, roughly a third of the visual column is people and places:
- a crowd gathering at night as the lights dim;
- members standing and walking out of a chamber;
- a leader at a lectern;
- a student's pencil sketch with the red sun rubbed out;
- newspapers flying out of a press across the map like birds.

The diagrams carry the argument; the scenes carry the feeling. These moments are what people remember and share.

**What an illustrated scene is.** It is a new visual type in the two-column script, `scene`: a narrated shot of a place with people and things in it, under the narrator's voice.
- It is chosen by the decision rule for lines about *a feeling, an atmosphere, or an event with people in it*, and for the cold open.
- It is not a story clip. Clips are short acted moments with dialogue, and their limits (at most 2 an episode, 6–20 s, at most one narrator line) stay as they are. **Illustrated scenes have no dialogue, run under the narration, and are not rationed.** They mix freely with the diagrams at the playbook's pace: shots of 3–6 seconds, often in sequences of three to five.
- It uses the story path's machinery: the set built from a layout, the figure kit, crowds, vehicles, props, shots, joins and sound. It also keeps the show's visual system: the playbook's "ochre figures leave the chamber" means the North's colour is on their clothes.

#### The world bible (once per show, stage 6a)

From the research log's look notes and the episode map, the art job (writer model naming from closed lists, then code and the judged artist) makes the show's **world**. This is drawn once and reused by every episode, so the show is on model from start to finish.

- **The era and the place:**
  - a style pack and an **era** (below);
  - the wardrobe of the time and the cultures in the story, from research. It is never one region by default (global-not-regional).
- **The recurring places:** each built as a set once. For example the Race Course at night, the House of Representatives, a London conference room, a 1950s street.
- **The recurring people:** the show's cast (at most 5) and the one-scene people, each a figure-kit person dressed for the era. Each has a **described likeness** built from the research's look notes: build, face shape, glasses, beard or moustache, hairline, signature headwear and clothes. They are drawn the same in every scene **and** in their name-card bust, so viewers recognise them.
- **The recurring things:** a flagpole, a printing press, the region's colours on bunting. Kit things first; the judged artist only for what no kit has.
- **What the maker sees:** the show page shows these places and people, as Studio already shows a story's cast and sets, and the maker can ask for changes before episode 1 is made. This is optional.

#### What has to be built

Each row is a gap found in today's story path. The build follows the story path's rule: models name things from closed lists, code draws.

| Need | Today | Build |
|---|---|---|
| **Eras** | Only ancient/medieval and modern; a 1950s story comes out modern | An **era** axis on style packs and the wardrobe: ancient, medieval, 1500–1800, 1800–1900, 1900–1945, 1945–1975, 1975–2000, today. Each era has its architecture pieces, street furniture, vehicles and clothes, and each combines with any region's pack. Built in order of the topics people make. |
| **Wardrobe** | 18 tops, 15 headwear | Era and culture garments as kit data: suits by decade, uniforms (colonial official, military, police, school), robes and caps from the research's cultures, ceremonial dress. **Colour accents come from the show's visual system.** |
| **Public interiors** | Rooms built from 35 pieces, all front-on; no chamber or lectern | New set kinds as layouts: **assembly hall / parliament** (tiered benches, speaker's chair, galleries), **ceremony ground** (flagpoles, stands, floodlights, a pavilion), **lectern / podium**, **newsroom and print works**, **courtroom**, **conference room**, and **lab, factory floor, harbour, railway station and palace court** of an era. Ordered by the bench topics. |
| **Top-down views** | The camera stays front-on by design | A **plan view** set kind, drawn flat from above: a conference table with name plates, papers and hands; a desk; a map table. It doesn't need a 3D camera. Joins to front-on shots by cut. |
| **Light inside a shot** | A night or dusk grade, set once per scene; room lights on/off | **Light cues on a word**: blackout, a **spotlight** that fades up on a target, lights that dim or snap on, floodlights, lantern and torch glow (firelight glow exists), a slow fade to dawn. Grade changes animate within a shot. |
| **Silhouettes** | Absent | A **silhouette render mode** for kit people and crowds: one flat dark fill with a rim light against a bright ground. The playbook uses it for crowds, soldiers and figures in shadow, and to stay respectful with grave subjects. |
| **Crowds** | 3–23 people; they cheer or gasp | Far rows instanced into the **hundreds**; new crowd doings: **sing / sway, dance, wave flags, march, stand and leave, murmur and turn**; lanterns and flags carried in the crowd; silhouette crowds. Crowd singing needs a recorded bed from the approved CC0 sources (sound-sources-licensing; downloads need Richard's OK). |
| **People acting under narration** | 70 doings: sit, stand up, leave, gesture | **At a lectern speaking** (lectern piece + speaking gestures); **groups acting together** (a bloc stands up and walks out on one cue); **signing a paper**, **shaking hands across a table**, **raising a flag by hand**. |
| **Hands** | No hand can write or draw | A **hand insert**: one hand in the kit's line, holding a pencil, pen, chalk, stamp or eraser. Code moves it along the stroke paths it draws, writes or erases. It is the playbook's "a student's hand (no face needed)". |
| **Drawing effects** | A same-time draw-on for build boards | **Stroke-order draw-on** following the hand; **fills that flood** as the voice names them; **erase** (a mask wiped behind the eraser); **handwriting** on a board or paper (a single-line hand font drawn on); **cross-out and replace**; **stamp slam** (a shake, then the ink). |
| **Prop actions** | Thrown props fly; features open on a hinge; set flags flap | A **prop action library** (lessonreel-visuals-plan already lists it): **flag up and down a pole**; **a real flag as cloth** (flag-icons' true flag on a waving mesh, so the right flag waves in the wind); **a flock of papers** flying along paths over a set or the map; **tokens along an arc** (coins); **lids that snap shut** (chest, piggy bank); **pages that flip**; **a train outside** on a track that moves and stops (today the train exists only as an interior). |
| **Machines** | Only via a freehand drawing's looping CSS | A **machine kit**: rollers, gears, belts, pistons, presses, chutes, wheels, composed by layout like sets. A printing press, a loom, a pump or an engine runs on cue. It serves science and history explainers alike. |
| **Real people's likeness** | A caption on a kit figure; no portraits | **Described likeness** (above), kept by the show and used both in scenes and in the name-card bust. It is not a portrait from photos; it is a consistent, recognisable figure from sourced descriptions. Richard prefers the figure-kit style (lessonreel), so the kit is the base. |
| **Moving between diagram and scene** | Joins: cut, dissolve, dip, match, zoom-through, push, iris | Three uses the playbook relies on: **map pin → zoom through into the scene → back out to the map** (the map stays the world; scenes are windows into it, which keeps explainer-continuity); **match cut on shape** (the paper flag lines up with the fabric flag, the seam with a border); **a hold on black with silence**. |

#### The shot list (per episode, stage 6b)

- For every `scene` row, the storyboard writes a short **shot list**, as the playbook's §6.3 does for its six key scenes ("Frame 1… Frame 5"). Each shot has:
  - the set and time;
  - who is in it, doing what (from the doings list);
  - the crowd and what it does;
  - the props and their actions;
  - light cues;
  - the camera (shot type and move);
  - the join to the next shot;
  - sound.

  Each cue is tied to the word that triggers it.
- The six or so key moments of an episode (the cold open, the climax, the payoff) are boarded first and get the most shots. Code then builds, times and checks each shot as it does story scenes.
- **When a shot can't be built**, because a set kind or a thing doesn't exist yet:
  1. The judged artist draws the missing thing for the show.
  2. If that fails, the shot is re-planned as a simpler one, such as a close-up of a prop or a silhouette.
  3. **It never becomes a word card.**

#### Care rules (from the playbook, enforced by code)

- **Violence is never drawn.** In an explainer about real events, doings like punch and throw are refused. A death or a massacre is a map pin, a number and silence, as the playbook does with Kano and Aba.
- **No caricature.** Faces and bodies come from the kit's ranges, never exaggerated for a group. Religious buildings or symbols never stand for a whole people.
- **Dress and places come from the look notes**, not from the model's idea of a culture.
- **Screen time** in scenes counts toward each side's share (stage 8).

#### The quality gate for scenes

- Every illustrated shot's key frames are rendered and judged by Gemini against the shot list:
  - Is what was asked for there?
  - Is the era right?
  - Are the people on model?
  - Is anything drawn wrong (a face on a belly, a hand through a table)?
  - Is it readable at phone size?
- A shot that fails is rebuilt once with the judge's notes. If it fails again, it falls back to the simpler shot above.
- The show's custom art goes through the existing takes-and-judge loop (`scene-artist.ts`) before any episode uses it.

#### The playbook's illustrated moments, each covered

| Playbook moment | How it is drawn |
|---|---|
| Cold open: black, crowd murmur, a spotlight finds the Union Jack; lights snap on, green-white-green rises | Ceremony-ground set at night; silhouette crowd; spotlight and light-snap cues; flagpole actions with both real flags as cloth; murmur → silence → swell |
| "NIGER" slides in, "-IA" clicks on, in a newspaper column | A `document` (newspaper) template with animated type; no real article text |
| Pre-colonial states: a minaret-style dome, a crown, a village assembly, a canoe | Small icons drawn once per show by the judged artist, lit on the map |
| Treasure boxes; coins arc South → North; a London piggy bank snaps shut | Chest props with hinged lids, tokens along an arc, a piggy bank with a snapping lid |
| Emir's palace; a gate closes before a mission school; school icons multiply | Icons, a gate prop that closes, the `icons` grid |
| A chamber of 46 seats, four light up; a voter with a "£100+" badge | The `seats` template (chamber layout), a kit person holding a sign |
| Macaulay's period portrait on a name card | A described-likeness bust in 1920s dress |
| Aba: women in silhouette singing; cut to a still map and a number | Silhouette crowd singing and swaying, a singing bed, a cut to a map pin and counter; nothing shown of the shooting |
| A printing press runs; newspapers fly across the map like birds | The machine kit's press; a paper flock from the press, out over the map (zoom-out join) |
| Soldiers multiply; a dotted line to Burma and back | Silhouette figures in the `icons` grid; a map route |
| A train stops mid-track; a calendar flips through 44 days | An outside train on a track that moves and stops; the `calendar` template |
| The chamber: "1956" on a board, crossed out for "AS SOON AS PRACTICABLE"; ochre figures stand and walk out; crowd noise | Assembly-hall set; a hand writes on the board, then cross-out and replace; a bloc of kit figures in the North's colour stands and leaves together; crowd sound |
| A conference table from above with name plates | The plan-view table with plates in the regions' colours and papers moving |
| A document stamped "NOT RECOMMENDED" | `document` template, then the stamp slam |
| A pencil sketch on lined paper; stripes fill; a red sun drawn, then rubbed out | Hand insert with a pencil; stroke-order draw-on; fills flood as named; erase |
| Match cut: the paper flag becomes a fabric flag at night | Match cut on shape, from the sketch to the cloth flag on the ceremony-ground pole |
| Tens of thousands at night: lanterns, uniforms, dancers | Crowd in the hundreds, night grade, lantern glow, era uniforms, dancing |
| Balewa at a lectern | Lectern piece, speaking gestures, described likeness |
| Three portrait cards in a triangle that tilts like a scale | Name-card busts in a triangle layout with a balance motion |
| Final: the flag in gentle wind, a slow fade | The cloth flag, then a dip to black |

**Coverage:** once 6c is built, every illustrated moment in the playbook's script has a way to be drawn, and none is left to a word card. How close each comes to hand animation is then a matter of the bench and of polish, not of missing capabilities.

### Stage 7: Voice, music, pacing

- **Pronunciation:** the sheet from research goes into the voice's pronunciations for this film (the institution's own list already exists).
- **Pace:** set per act, slower for grave or climactic sections (about 120 wpm against 140–150).
- **Music:** set per act from the beat sheet. Silence is allowed as respect, as `music: "none"` already allows.
- **Pacing checks get tighter** (the old 30-word rule goes):
  - a visual change every 3–5 seconds in explanatory rows;
  - nothing still for more than 6 seconds unless the row is marked `hold`;
  - each act ends on a hold or a question.

### Stage 8: Review and package

- **Fact-check job (writer model + web search, a separate call from the writer).** It checks every claim the final script uses: `verified`, `soften` (with a rewrite), or `cut`.
  - Nothing is voiced until every claim is green.
  - The maker sees the sheet (the film's "Sources").
- **Sensitivity read (writer model):**
  - loaded words;
  - attribution;
  - "where would this feel unfair, and to whom";
  - **screen time per side, counted by code** from the composed film.
- **Frame check (Gemini Flash):** key frames of diagrams and illustrated shots are rendered to PNG with resvg, then judged for:
  - legibility at phone size;
  - at most eight words on screen;
  - clutter;
  - whether the frame matches its row's instruction;
  - for scenes: the era, the people on model, and anything drawn wrong (6c).
- **Packaging (writer model):**
  - five titles with verdicts;
  - three thumbnail ideas. The thumbnail is **a frame of our own stage plus a few words**, chosen so it differs from the first frame;
  - a description with chapters, sources and "what we left out";
  - a pinned comment;
  - hashtags for the platform.

### Stage 9: Export

- **MP4 export, per episode or for the whole show**:
  - 16:9 for YouTube; 9:16 (the vertical twin) for Reels, TikTok and Shorts, which now take videos of several minutes; 1:1.
  - **The whole show as one film**: the episodes joined end to end, with the "last time" lines dropped and **chapters** from the episode titles. This is the 12–15 minute video.
  - **Captions burned in** from the word timings we already have. Most social viewing is muted.
  - Our end card.
- **How:** render the stage frame by frame on the worker. The player is a pure function of audio time (`timeline.ts`), so it can be stepped exactly. A headless browser captures frames, and ffmpeg muxes them with the MP3 and the score. A WebCodecs export in the browser is the fallback.
- **Without this, nothing else in this plan reaches social media.**

### Stage 10: "Add more?"

- **When episode 1 is ready**, the producer asks whether to carry on. It offers the next episodes from the map as buttons, each its own question with a one-line pitch, plus "something else". For example:
  - *"Episode 2: Why did it nearly fall apart in 1953?"*
  - *"Episode 3: How did one deal fix it?"*
- **"Something else"**: the maker says what they want added. The research is topped up for it, and the rest of the map is re-planned around it. Episodes already made are never changed.
- **The next episode starts at stage 4.** It uses the show's research, visual system and cast, and is given the scripts of the earlier episodes so its "last time" line and callbacks are exact.
- **When the map is used up**, the producer says the story is complete and offers the whole-show export.

---

## 4. What changes for the maker

The UI stays minimal: a few choices, made at the moments a real editor would stop to decide.

1. **Chat:** what it's about and who it's for. It no longer asks how long.
2. **The angle:** pick one of three questions, each with its two-sentence pitch. This is new, and the most important click.
3. **The script:** read episode 1 in two columns, with sources one tap away. Approve, or ask for changes in chat. This step is optional ("just make it" skips it).
4. **The film:** watch episode 1 (3–5 minutes), ask for changes per scene as today, then **Download** or **Share**, with captions, title and description ready to paste.
5. **Add more?** Pick the next episode from the plan, or say what to add. Repeat from step 3 until the story is told, then export the whole show as one long film with chapters.

---

## 5. Phases

Each phase ships on its own and is measured against the last on the same topics.

| Phase | What | Why first |
|---|---|---|
| **0. Bench** | 8 topics across kinds: a history story, a how-it-works, a numbers/economics piece, a geography piece, a science process, a news explainer, a biography, a "myth vs fact". Each is made by today's pipeline as the baseline. There is a rubric from the playbook (hook rules, but/therefore, sourced claims, seconds between visual changes, words on screen) and Richard's side-by-side viewing. **Plus an illustration bench**: the playbook's illustrated moments (table in 6c) and their equivalents for the other topics, written as shot lists, each scored by Gemini and by Richard. | So "better" is seen, not felt. |
| **1. Editorial chain on GPT-5.4 mini** | Stages 1, 3, 4, 5 and 10 on the new `explainer_edit` task: brief and angle, the spine and **episode map** on the show, the beat sheet per episode, hooks, the whole-episode script, the editor's read, and the "add more?" step on `addEpisode`. The script is cut into today's scene shape, so pictures, voice and playback are unchanged. The angle pick goes in the producer chat. It runs on the OpenAI key already set; the bench also runs `gpt-5-mini` and `gpt-6-luna`. DeepSeek leaves the explainer writing path. | It fixes the biggest cause (no editorial thinking, a weak writer) with the least new machinery. |
| **1b. MP4 export + captions** (alongside phase 1) | Stage 9, per episode and for the whole show with chapters. | Nothing can be shared without it. It doesn't depend on phase 1. |
| **2. Research and facts** | Stage 2 and the fact-check half of stage 8: the research log, sources, pronunciations, a script that cites claims, the "Sources" sheet. | Trust. One wrong fact in a shared video costs more than a weak line. |
| **3. Illustrated scenes I** | 6c's frame: the `scene` visual type and shot lists; the world bible; eras and the wardrobe; the public interiors (assembly hall, ceremony ground, lectern, conference room) and the plan view; light cues and silhouettes; bigger crowds and their new doings; groups acting together; described likenesses and name-card busts; the scene quality gate; Gemini as the show's artist. | Illustration is paramount. This makes every film an illustrated one, and covers most of the playbook's moments. |
| **3b. Illustrated scenes II** | 6c's detail: hand inserts and the drawing effects (stroke draw-on, erase, handwriting, cross-out, stamp); the prop action library (flagpole, cloth flags, paper flocks, tokens, lids, pages, the outside train); the machine kit; map ↔ scene zoom-through and shape match cuts. | It closes the remaining moments: the pencil sketch, the press, the flag rising. |
| **3c. Infographic system** | Stage 6a/6b's diagram side: colours, the legend and the held-back colour; the persistent map with admin-1 groups; the new kinds (counter, icons, namecard, calendar, seats, strike, transfer, document, split); source lines; tighter pacing; the frame judge on explainers. | The argument's visuals, in one system with the scenes. |
| **4. Package** | The rest of stage 8: titles, a thumbnail from a stage frame, description, chapters, "what we left out", the sensitivity read and screen-time counts. | What makes people click and share. |

**Order.** Phases 3–3c are code work on the pictures, independent of the writer, so they start in parallel with phase 1, right after the bench. The story path gains from them too: eras, interiors, light cues, crowds and prop actions all serve story films. Nothing in the story path is taken away. Visualize's per-page explainers can move to the same editorial chain after phase 1 proves it. They would still read from the teacher's notes, with the document as the research log.

---

## 6. Decisions for Richard

1. **Length:** decided (2026-10-01). A topic is a show of episodes. Each episode is 3–5 minutes, set by its material and never squeezed. Episode 1 is made first, then the maker is asked whether to add more. The whole show can be exported as one long film.
2. **The writer:** decided: a GPT mini (2026-10-01). GPT-5.4 mini is proposed. The bench compares it with `gpt-5-mini` and `gpt-6-luna` before the default is set.
3. **Research from the web:** are prompt-made films allowed to research on the web (with sources shown)? Or do they stay limited to what the maker supplies plus the model's knowledge, with a fact-check pass?
4. **Real people:** proposed, a **described likeness** in the figure kit, from sourced look notes, used in both scenes and name cards (6c). The other route is portraits from reference photos with an image model: closer likenesses, but against the no-photos rule and the kit style.
5. **Export rendering:** on the worker (a headless browser + ffmpeg; heavier, but works for everyone) or in the maker's browser (lighter, slower on phones)?
6. **The show's artist:** proposed, **Gemini 3.8 Flash** for the show's custom things and places (bake-off 6.67 against DeepSeek's 4.33; about 1 cent more a drawing, drawn once per show), since illustration is paramount. DeepSeek stays the default elsewhere unless you say otherwise.
7. **Crowd singing and other new sounds:** these need recorded beds from the approved CC0 sources. Each download needs your OK.

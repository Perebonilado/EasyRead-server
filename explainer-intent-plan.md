# Plan: understanding what a video is for and who it's for

Written 2026-10-02 at Richard's request. Not built yet.

> "Some videos need to be in reported speech and don't need the explainer of what a word necessarily means. Some videos need to be like the news. Some videos need to be in-depth explainers for students. … The way the narrator speaks matters. We really need to understand the intent. Also, some videos are for viewers with little or no prior knowledge … not just jump from idea to idea but really explain it to them from the start."

## 1. The problem in one paragraph

Today every explainer is made one way. The editor's path is built for a documentary-style infographic: "tell it as a story of people, never a lecture". It is the same recipe whether the maker wants a news report, a history documentary, a lesson for students or a how-to. So:
- a history film explains everyday words it doesn't need to;
- a lesson can't name a mechanism (the code bans "mechanism" as too abstract);
- a news piece has no news shape at all;
- the narrator sounds the same in all of them.

The app already asks how much the viewer knows ("New to it", "Knows a bit", "Revising"). But the writers barely act on it, and nothing checks that a newcomer was given the basics before the film moves on.

## 2. What we have today (the short version)

| What | Today | Gap |
|---|---|---|
| Kind of video | Only `story` or `explainer` | No documentary, news, lesson or how-to |
| Who it's for | Age or level band (8 bands) and prior knowledge (`new`, `some`, `revising`), from the maker's words or the chips | No "expert". "Revising" is a goal, not a level of knowledge |
| How the writers use it | A "Teaching them:" text block. The narrator's words-a-minute and sentence length | The ideas-a-minute and terms-a-minute limits are not enforced on the editor's path. Nothing checks definitions or jumps |
| Script rules | One documentary-shaped rule set: a person in a place at a time in every hook, a moment and a number in every act, abstract words banned | These fight lessons and how-tos. News has no rules |
| Fact check | Gets no brief at all | Can't tell that a news piece needs dates and attribution |
| Narrator | One global voice. The mood defaults to "curious". The show's tone never reaches the voice | No newsreader, documentary or teacher delivery |
| Pictures and critic | See only the 4-word audience | Can't vary the picture language or the bar by kind |

## 3. The idea: an intent brief

A show carries a small brief, decided once and changeable with a tap:
- **Kind:** what sort of film it is.
- **Who and how much they know:** the age or level band we already have, plus prior knowledge.
- **Goal:** what the viewer should be able to say or do afterwards, in one sentence ("explain why Nigeria became independent in 1960").

Everything downstream reads it: research, structure, script, fact check, narrator, pictures and critic.

### 3.1 The kinds

| Kind | It's for | How it's told | Words and definitions | Narrator |
|---|---|---|---|---|
| **Documentary** (history, real events, biography) | Understanding what happened and why, through people | In order, through people's decisions. Reported speech ("Azikiwe argued that…"); quotes only when exact | Explains a word only when it blocks the story, in a few words in passing ("the Sardauna, the North's ruler,") | Measured storyteller with some gravity, pauses at turns |
| **News report** | Knowing what happened and why it matters now | The news first (what, who, when, where), then why it matters, the background, and what happens next | Never explains everyday words. Every claim attributed ("officials said", "according to") | Crisp, neutral, steady newsreader |
| **Explainer** (how or why something works) | Understanding a mechanism or an idea | A question, then a chain of cause and effect, one link a sentence, ending on the reframing insight | Everyday words, analogies, the term after the idea | Curious, bright host, steady pace |
| **Lesson** (in depth, for students) | Learning it properly, maybe for an exam | Goals, then the basics, then each idea defined, shown and given a worked example; a common mistake; a recap; check questions | Defines every term on first use; one new term at a time | Patient, warm teacher; slower, with a pause after each definition |
| **How-to** (step by step) | Doing something | The result first, then what you need, then the steps in order, what you should see after each, and the common slips | Only the words the steps need | Calm, direct guide |

Stories keep their own path. Possible later kinds, for Richard to decide: opinion or essay, review, biography as its own kind.

### 3.2 Prior knowledge

| Level | Meaning | What it changes |
|---|---|---|
| **New to it** | No background | The basics come first (§5). Every term is defined. One new idea at a time, each linked to the last. A recap every couple of scenes. Fewer ideas a minute. |
| **Knows a bit** | Knows the basics | Skips the basics. Defines only specialist terms. A normal idea rate. |
| **Expert** (new) | Knows the field | No definitions, denser, more numbers and nuance, a quicker idea rate. |

Revising for an exam stops being a level of knowledge and becomes a goal (`exam`). That fits the lesson kind: exam-style questions, more recaps, fewer analogies.

## 4. Understanding the intent

1. **Hear it first, by code**, as the app already hears the audience band:
   - News: "news", "latest", "this week", "what happened in", "breaking".
   - Documentary: "the history of", "the story of", "how X happened", "documentary", "biography".
   - Lesson: "lesson", "for my class", "students", "exam", "revision", "syllabus", "teach".
   - Explainer: "how does", "why do", "explain", "what is".
   - How-to: "how to", "step by step", "tutorial", "set up".
   - Prior knowledge: today's words for newcomers, plus new ones for experts ("advanced", "deep dive", "for doctors", "I already know").
2. **Then the model**, when the maker's words don't settle it. The producer chat already fills the brief, so it gains `kind`, `prior`, `goal` and a confidence for each, on closed lists only.
3. **Confirm with one line of chips**, as the audience chips work today. For example: "A documentary for newcomers", with chips for each kind and level. The maker taps to change, or does nothing.
4. **Ask one question only when it's really unclear.** "Should this sound like the news, a documentary or a lesson?" is asked once, never more.
5. **When nothing is said,** the default comes from the subject:
   - history, war or biography: documentary;
   - "how does": explainer;
   - "how to": how-to;
   - a class or exam: lesson;
   - current events: news.
6. **Stored on the show's brief.** The brief is JSON, so no migration is needed. Existing shows read as documentary, which is what they are today.

## 5. The foundations ladder: never jumping ahead of a newcomer

This is the heart of Richard's second point.

1. **List what the film relies on.** At the plan stage, the editor lists the film's ideas and, for each, what a viewer must already know to follow it. That gives a small chain of prerequisites. For example: "independence" needs "colony", and "the North's timetable" needs "the three regions" and "self-government".
2. **Check each against the viewer.** For a newcomer, anything that isn't common knowledge for their band becomes a **foundation beat**, taught before the idea that needs it, in plain words with an everyday example.
3. **Make room.** If the basics don't fit in the episode's 3–5 minutes, the plan adds a first episode on the basics rather than rushing. (Richard's rule: never pack a topic too tight.)
4. **Write to the ladder.** One new idea a sentence. Each sentence linked to the last ("so", "because", "which means", "but"). A term is used only after it is defined. A recap every couple of scenes.
5. **Check it by code, with no person in the loop.** The script goes back to the writer when:
   - a research glossary term is used before the sentence that defines it;
   - the ideas-a-minute or terms-a-minute limit for the band and level is exceeded (the numbers exist today and are just not enforced on the editor's path);
   - two neighbouring sentences carry new ideas with no link between them;
   - a newcomer's scene runs past two scenes without a recap.
6. **The newcomer test.** A model reads the script as a newcomer with no background and answers three questions on the goal. If it can't, the plan's weakest step is sent back.

Someone who knows a bit skips the foundations they already have. An expert gets none.

## 6. How the kind changes each stage

| Stage | Change |
|---|---|
| Angles | The role line and the kinds of angle follow the kind: a news editor finds the news line, a teacher writes the goal, a documentary editor finds the turning point. |
| Research | Layers by kind. News needs recent dated facts and who said what, with each source's date. A documentary needs the timeline, people, exact quotes and places. A lesson needs definitions, prerequisites, misconceptions and worked examples. A how-to needs steps, what you need, and the pitfalls. The code's research floors follow the kind: today it demands five dated events whatever the film. |
| Structure (plan and beats) | One template per kind, as in §3.1, each with word budgets. |
| Hooks | News opens on the news itself. A documentary opens on a moment, with a person in a place at a time, as today. A lesson opens on a question or a puzzle. A how-to opens on the result. |
| Script | Register rules by kind (§3.1). The anti-lecture rules (abstract words banned, a moment and a number in every act) apply only to documentary and news. A lesson may name a mechanism once it has been built up. |
| Fact check | Gets the brief. News must have dates and attributions. A documentary's quotes must be exact. A lesson's definitions must be checked. |
| Narrator | A delivery by kind (§3.1). It is given as instructions to the voice engines that take them (Gemini, OpenAI) and as speed and pauses to Kokoro. The scene mood defaults by kind instead of "curious". The show's tone is finally wired through (the mapping exists in code, unused). The pace is set by kind and level within the band's words-a-minute, and stays steady, as Richard asked earlier. |
| Pictures (board) | News uses datelines, the map for where, and photos of the people involved. A documentary uses archive photos, portraits and drawn moments. A lesson uses diagrams that build, labelled parts, list recaps, worked-example steps and a question with a pause. An explainer uses models and flows. A how-to uses the UI kit. |
| Critic | The bar follows the kind. A news piece is judged against good news explainers, a lesson against the best teaching channels. A new axis asks whether it is told as its kind and right for this viewer. |

## 7. What the maker sees

Less is more. There's one line of chips under the plan: "Documentary · New to it", tap to change. The brief panel gains a single "Kind" setting next to "For". Nothing else is new.

## 8. How we'll know it works

- **A test set of 15 requests,** across the 5 kinds and 3 levels of knowledge. For example: "the history of Nigerian independence for people who know nothing about it"; "this week's news on X"; "photosynthesis for 14-year-olds new to biology"; "how a jet engine works, for engineers"; "how to set up two-factor sign-in".
- **Measured before and after,** with no person in the loop:
  - the kind read right;
  - the template's parts present;
  - terms defined before use;
  - ideas a minute within budget;
  - for documentary, the share of reported speech;
  - for news, the share of attributed claims;
  - the newcomer test passed;
  - the critic's fit score.
- **Richard watches four of them:** a documentary, a news piece, a lesson for newcomers and a how-to.

## 9. Phases

1. **The intent brief** (about 1 day): kind, the expert level, and the goal; code hearing and model fallback; the chips; storage; the views.
2. **The kind-aware editor** (about 2 days): prompts that depend on the kind for angles, research, plan, beats, hooks, script and read; code checks that follow the kind.
3. **The foundations ladder** (about 2 days): the prerequisite chain, the foundation beats, the basics episode, the definition, idea and link checks, the newcomer test.
4. **The narrator by kind** (about 1 day): instructions, the mood default, pace, and tone wired through.
5. **Pictures, fact check and critic by kind** (about 1 day).
6. **The test set, before and after** (about 1 day).

Phases 1 and 4 can run beside 2 and 3. With agents in parallel, this is about 3–4 days of build.

## 10. Decisions for Richard

1. **The kinds:** documentary, news, explainer, lesson and how-to. Is that the right list? Should opinion or essay, or review, be added?
2. **When unclear:** ask one quick question, or pick from the subject without asking? (Recommended: pick from the subject and show the chip, so it can be changed in one tap.)
3. **News:** limit the research to recent sources (for example the last few weeks), and keep it strictly without opinion?
4. **Lessons:** show check questions on screen with a pause to think? Use exam-style questions when revising?
5. **The narrator:** a different voice per kind (a newsreader's voice for news), or the same voice delivering differently?
6. **Newcomers:** when the basics don't fit, add a basics episode first (recommended) or make episodes longer?

## Appendix: where it goes in the code

- **The brief:**
  - server `studio.ts` (StudioBrief), `studio-audience.ts` (the prior lists, recipes and chips) and `studio-heard.ts` (code hearing);
  - the producer's prompt and schema: `studio-prompts.ts`, `ai-sdk/studio-schemas.ts`;
  - views and contracts in both repos;
  - client `production.tsx` (a Kind setting) and `lib/studio/audience.ts`.
  - The prior list is copied in five places (`studio-audience.ts`, `scene-pace.ts`, both contracts, client `audience.ts`), so all five change together.
  - The scene fingerprint includes the audience, so changing the kind marks made scenes as changed. That is intended.
- **The editor:**
  - `editor-prompts.ts` becomes functions of the kind, as `boardLessonPrompt()` already is, called at the adapter's `editorWrite` and `editorSearch`;
  - `describeEditorBrief` gains the kind and the goal, and the fact check gets it too;
  - code checks in `studio-editor-checks.ts` follow the kind: `researchProblems`, `hookPictureProblem`, `concreteProblems`, `ABSTRACT_WORDS`;
  - new checks for definitions, links between sentences, ideas and terms a minute, and recaps.
- **The narrator:**
  - `scene-voice.ts` `voiceStyle` gains a short delivery prefix by kind;
  - page-level `instructions` at the Studio's synthesize call;
  - the mood default by kind (in place of 'curious');
  - `TONE_MOOD` wired through;
  - pace by kind and level (`recipeFor`, `studioPaceBrief`).
  - The lecture styles (`lecture.ts`) are the precedent: a writer direction, a voice delivery and a speed per style.
- **Board and critic:**
  - the kind and level added to `shot-board.ts`'s input and `shot-critic.ts`'s parts;
  - the director and critic prompts are already functions, so they can branch by kind.

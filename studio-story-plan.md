# Stories with real plots: a writers' room for the Studio

A technical plan, 2026-09-29.

Richard's ask:
- More attention to storylines. Not everything should be narration; stories need actual plots.
- Characters with personality, build-up, and rich interactions, as a real film would have.
- More planning and thought in how stories are made.
- The maker can say whether they want a narrator, and what style the animation should have.

---

## 0. How a story is made today

1. **Brief.** Format, idea, audience, minutes and tone, plus an optional setting, characters and anything to include.
2. **Cast and places** (`studioBible`, DeepSeek). Each character gets a look, a voice and **2–3 one-word traits**. There's no want, fear, flaw, arc, relationship or way of speaking.
3. **Outline** (`studioOutline`, DeepSeek with thinking). One call writes 2–10 scenes, each a one-or-two-sentence summary. The only structure is "beginning / middle (it gets harder, something turns) / end (warm or funny last moment)".
4. **Scenes** (`studioScene`, one call each, in order). Each call writes a screenplay of beats. The rules say characters carry the scene and the narrator has at most a third of the words. Checks are about staging, not story.
5. **No story review at any point.** Nothing asks whether the plot works, whether anyone changes, or whether the jokes land.

The result reads like a summary acted out: pleasant and clear, but thin. There's no build-up, no real conflict, and not much personality between the lines.

---

## 1. The new pipeline: a writers' room

The one-shot outline is replaced by **story development in steps**, each a focused call (DeepSeek, with thinking) followed by a code check. A **critic pass** (a "table read") reviews and revises before anything is drawn. The maker sees one new card, **The story**, and can change anything or just approve.

```
Brief ─► Premise ─► Characters ─► Beat sheet ─► Scene plan ─► Scenes (dialogue pass) ─► Table read ─► (existing) staging, drawing, voice
            │            │              │              │                 │                   │
         logline,     want, need,    structure by    purpose,         character voice,    rubric scores,
         theme,       flaw, arc,     length:         conflict,        subtext, humour,    targeted rewrites,
         hook,        voice,         setup, turn,    turn,            setups & payoffs,   max 2 rounds
         genre        relationships  climax, payoff  who wants what   no-narrator mode
```

### 1.1 Premise

- **Logline:** who, what they want, what stands in the way, and the stakes.
- **Theme:** what it's really about, one line, never spoken as a moral unless the maker asks.
- **Hook:** the first 10 seconds.
- **Genre:** comedy, adventure, mystery, drama, fable, slice of life, musical-ish.
- **Ending:** happy, bittersweet, twist or open.
- A mystery gets a clue plan, and a comedy gets a running gag.

### 1.2 Characters with personality

Each main and supporting character gets a full sheet, kept in the bible so every episode keeps it:

| Field | Example |
|---|---|
| **want** (outer goal) | win the race; find the lost dog |
| **need** (inner lesson, usually unseen by them) | to ask for help |
| **flaw** | too proud to admit being scared |
| **fear** | the dark; being laughed at |
| **personality** | 3–5 specific traits, not generic ("counts everything", "hums when nervous") |
| **voice** | how they talk: sentence length, pet phrases, words they'd never say, humour style |
| **physical habits** | fidgets with a cap, stands with hands on hips, bounces when excited (these drive the acting, §3) |
| **relationships** | to each other: rivals, best friends, bossy big sister and patient little brother, with the tension between them |
| **arc** | where they start, and where they end this episode or series |

Minor characters get a one-line personality and a voice note.

### 1.3 Beat sheet, scaled to length

Code chooses a structure template by length; the writer fills it.

| Length | Structure |
|---|---|
| **≤ 1 min** | setup → problem → attempt → twist → payoff (5 beats; one scene or two) |
| **1–2 min** | setup / inciting incident → first try fails → it gets worse → turn (a choice) → climax → resolution + button (a final laugh or warm beat) |
| **2–5 min** | a three-act shape: setup, inciting incident, rising action with 2–3 escalating attempts, midpoint turn, low point, climax driven by the hero's own choice, resolution, button |

- Every beat names **who wants what**, **what stops them** and **what changes**.
- **Setups and payoffs are tracked:** anything planted (a slippery banana, a secret, a skill) must pay off later, and every payoff must be planted earlier.

### 1.4 Scene plan

Each scene gets:
- **purpose:** which beat it serves;
- **conflict:** who wants what against whom or what;
- **turn:** how the situation is different at the end;
- **emotional shift:** hope to fear, calm to panic;
- **the moment:** the one image or line people will remember.

Scenes without a turn are merged or cut. This is how we get build-up instead of a list of events.

### 1.5 Dialogue pass (the scene writer, upgraded)

- **Every line in its character's voice.** The sheet goes into the prompt; a check flags lines any character could have said.
- **Subtext.** People don't say exactly what they feel. The flaw shows in what they do.
- **Real exchanges:**
  - interruptions;
  - answers that dodge;
  - reactions before replies;
  - running gags with a callback;
  - silence as a beat;
  - shows of feeling through action (a slammed door, a hug that lasts a beat too long).
- **Comedy timing:** setup, beat, punchline; the rule of three; a "take" (the look to camera or to another character) after a joke. These tie into the stager's pause and reaction beats.
- **Show, don't tell:** where the stage can show it (actions, faces, props, the new interactions), it's shown, not narrated.

### 1.6 Table read (the critic)

A separate call (DeepSeek, thinking on, the `studio_check` model) reads the whole script against a rubric and returns scores and specific notes:

| Rubric item | Test |
|---|---|
| Clear want and stakes | by the end of the first scene we know what the hero wants and what's at risk |
| Escalation | each attempt is harder or costs more |
| A real turn | something changes the direction; not just more of the same |
| Hero's choice | the climax is decided by what the hero does, not by luck or a grown-up |
| Setups and payoffs | every plant pays off; nothing comes from nowhere |
| Character | each character acts and speaks like their sheet; the flaw shows; someone changes |
| Dialogue | lines are specific to the speaker; no speeches; no one explains feelings outright |
| Humour or heart | at least N moments landing for the tone; a button at the end |
| Narration | within the maker's narrator setting (§2) |
| Show, don't tell | the share of story told by the narrator versus shown |
| Fit | age-appropriate, and within the length |

- **Below the bar:** targeted rewrites of the failing scenes only, with the notes as problems. At most 2 rounds, then keep the best.
- **Silent by default** (Richard's "fix it quietly" rule). The maker sees the improved story, not the notes, unless they ask "why did you change…".

### 1.7 Series memory

- The bible keeps each character's arc position, running gags, relationships as they've changed, and the events of earlier episodes.
- Episode 2+ plans build on them: callbacks, a character growing, a new rival.

---

## 2. Maker controls

These are new brief fields, all optional. The producer asks only if the maker seems to care. "Leave it to us" picks sensible defaults for the idea and audience.

| Control | Options | What it changes |
|---|---|---|
| **Narrator** | `none` (a pure film: dialogue and action only), `light` (a line to open or close, and scene-bridging only), `storyteller` (a warm narrator throughout, picture-book style), `character` (one of the cast tells it, first person, in their own voice) | The writer's rules, the scene checks (narration share = 0 / ≤10% / ≤35% / narrator is that character), and voice casting (the narrator's voice is that character's voice in `character` mode) |
| **Genre** | comedy, adventure, mystery, drama, fable, slice of life | Structure template emphasis, humour density, music moods |
| **Ending** | happy, bittersweet, twist, open, moral | The beat sheet's last beats |
| **Pace** | gentle, lively, snappy | Scene lengths, cut rate, joke rhythm, action allowance |
| **Animation style** | presets (§2.1) | The look and the camera energy |
| **Dialogue** | how much talk vs action; simple words (young children) vs witty (older) | Writer rules |

### 2.1 Animation style presets

What we can honestly vary now, within our code-drawn kits:

| Preset | Look | Camera and motion |
|---|---|---|
| **Picture book** | soft palette, thicker ink, gentle haze | slow pushes, few cuts, gentle moves, storyteller narrator suits it |
| **Bold cartoon** | saturated palette, crisp ink, bigger heads | snappy cuts, squash and stretch up, more action moves |
| **Sitcom** (your South Park kitchen) | flat colours, simple sets, deep staging | over-the-shoulder and reverse shots, dialogue-led, little camera movement |
| **Adventure** | richer scenery, wider sets | tracking, crane, low angles, action moves allowed more often |
| **Calm and cosy** | warm light, dusk/dawn grades | long holds, slow pans, soft music |

These are data: palette, ink weight, proportions (from the style packs), camera rules, action allowance and music. So they're quick to add and tune. **Genuinely different art styles** (anime, clay, watercolour) would need design work on the kits and would come with your reference cartoons; they aren't in this plan.

---

## 3. Personality into performance

The personality sheet reaches the stage, not just the words:

- **Acting choices.** Physical habits become idle acting: the cap-fidgeter fidgets while listening, and the bouncy one bounces when excited. The stager uses them as fill in quiet moments (the physics plan's weight shifts become per-character).
- **Voice direction.** Voice notes become each line's direction: pace, pitch for the engine, whisper or shout, and the emotion tag (Cartesia and ElevenLabs).
- **Reactions.** Listeners react *in character*: the proud one rolls their eyes, the shy one looks down. This uses the listening reactions from the physics work, driven by the sheet.
- **Interaction rhythm:**
  - overlapping moments, where someone starts before the other finishes (a short cut-in);
  - double-takes;
  - comic pauses held by the stager, not squeezed (the action-timing work already allows this).
- **Blocking with intent.** Who moves toward or away from whom follows the relationship: the bossy sister steps in, the shy brother steps back. The stager takes a relationship hint per beat.

---

## 4. Where it lands

**Server:**
- New `studio-story.ts`: types for premise, character sheets, beat sheet, scene plan, and the rubric.
- `studio-prompts.ts`:
  - new `studioPremise`, `studioCharacters`, `studioBeats`, `studioScenePlan` and `studioTableRead`;
  - upgraded `studioScene` (voice sheets, subtext, timing, narrator modes) and `studioTurn` (asks about narrator and style only when useful).
- `studio.processor.ts`: the development steps as jobs (`premise`, `characters`, `beats`, `plan`, then scenes), then `tableRead` with at most 2 revision rounds.
- `studio-check.ts`:
  - narrator share by mode;
  - setups and payoffs tracked (plants named in the beat sheet must appear and pay off);
  - character-voice lint (lines any character could say);
  - a scene without a turn.
- `studio-stage.ts`: per-character idle habits, in-character reactions, relationship blocking hints.
- `scene-voice.ts`: per-character voice direction from the sheet; the narrator voice in `character` mode.

**Contracts:** `StudioBrief` gains `narrator`, `genre`, `ending`, `pace` and `style`. `StudioCharacter` gains the personality fields. `StudioEpisode` gains `story` (premise, beats, scene plan).

**Client:**
- The brief shows the new choices as simple chips.
- A new **Story** step in the timeline rail, between Brief and Outline. It shows the logline, the characters with personality, and the beat sheet in plain words, with "Ask for a change" and edit.
- The outline card shows each scene's purpose and turn.

**Models:** DeepSeek (thinking) writes. `studio_check` critiques. Never gpt-4.1. Cost goes up a few cents a film for the extra steps and the table read; that's worth it.

---

## 5. Order of work

| Phase | What you'll see | Rough time |
|---|---|---|
| **S1 Controls** | Narrator on/off/light/storyteller/character, genre, ending, pace, style presets in the brief; "no narrator" films carried by dialogue and action only | ~1 day |
| **S2 Story development** | The new Story step: premise, characters with personality and arcs, a beat sheet scaled to length; the outline built from it | ~1–2 days |
| **S3 Dialogue pass** | Scenes in each character's voice, with subtext, interruptions, running gags, setups that pay off, comic timing | ~1 day |
| **S4 Table read** | Automatic critique and targeted rewrites before anything is drawn; a quality score per film in the logs | ~1 day |
| **S5 Performance from personality** | Characters' habits, in-character reactions, relationship-driven blocking, voice direction from the sheet | ~1–2 days |
| **S6 Style presets tuned** | Picture book, bold cartoon, sitcom, adventure and cosy looks tuned on the benches with you | ~1 day + review |

- S1–S4 change what stories *are*. S5–S6 change how they *play*.
- A **story bench** (like the drawing bench) runs 10 fixed briefs through the pipeline and scores them with the table-read rubric, so every change can be measured.
- The work touches the prompts, which the global-product fix also rewrites. The global fix goes first so the new prompts start neutral.

---

## 6. Risks

- **Longer planning time.** More calls before the outline. They're parallelised where possible, and the maker sees progress on the Story card.
- **The critic being too harsh or too kind.** It's calibrated on the story bench, with a fixed rubric and example scores.
- **Films get longer.** Build-up needs room. The length check still applies, and the beat templates scale to minutes.
- **Personality clichés.** The prompt asks for specific traits, not stock ones; the lint flags generic ones ("kind", "brave").
- **Age fit.** Younger audiences get simpler structures (the ≤ 1 min template), clearer wants and gentler conflict. The SAFE rule applies throughout.

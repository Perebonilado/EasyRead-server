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
- **A tension curve is planned, not hoped for.** Every beat gets a planned intensity from 0 to 10. Code checks the shape against the template for the length and genre:
  - it starts lower, rises with each attempt, and has a dip for relief or comedy;
  - it has a low point before the climax, peaks at the climax, and falls into the resolution.
  - A flat curve, or one that peaks too early, goes back to the writer.
- **Tension tools the writer is asked to use:**
  - a ticking clock ("before the bus leaves");
  - rising stakes (it's no longer just the dog, now it's the dog *and* Mum's cake);
  - dramatic irony (we know what the hero doesn't);
  - a false victory before the low point;
  - a cliffhanger at the end of act one;
  - the "it can't get worse… it gets worse" beat.
- **Relief beats** (a joke, a warm moment) are placed on purpose between rising beats, so tension has something to push against.
- **The whole film supports the curve,** not just the words (§3F):
  - the camera tightens and cuts faster as the curve rises;
  - the music builds, drops to silence right before the peak, then releases;
  - the sound thins to one heartbeat, a clock or wind in the quiet before the climax;
  - faces hold longer on the low point.
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

## 3A. Subtle interactions: the small stuff between people

Most of a real film's life is in small moments between characters. The stager gets a vocabulary of **micro-interactions**. The writer can name them, and the stager also adds them by itself from the relationships and the moment.

| Kind | Examples |
|---|---|
| **Gaze** | meet eyes then look away (shy, guilty), hold a look too long (romance, challenge), glance at someone mid-line (a secret between two), side-eye, eye-roll, looking to a third person for help |
| **Touch** | hand on a shoulder, a pat on the back, holding hands, a nudge with an elbow, a high five, fixing someone's collar, wiping a tear, a hug with its own shape (quick, clinging, awkward one-armed, bear hug) |
| **Distance** | step closer (warmth, threat), lean in to whisper, step back (fear, hurt), turn away (sulking), stand shoulder to shoulder (together against something), mirror each other's pose (rapport) |
| **Sharing** | hand someone a thing and hold on a moment too long, share food, put something down between them |
| **Timing** | a beat of silence before a reply, an interrupted line, both speaking at once, a reaction before the other finishes, a "take" (a look to the other or to camera after a joke) |
| **Small tells** | fidgeting, swallowing, a nervous laugh, rubbing the back of the neck, crossing arms, tapping a foot, hiding behind something |

- **How they're built:** most use existing pieces (arm IK for touch, planted walks for distance, views for turning away, springs for weight). New pieces: two-person holds (holding hands, a hug with both bodies posed together), and gaze aimed at another character's eyes rather than their centre.
- **Checks:** the audit confirms they're seen. Clear view protects both faces in a two-person moment.

---

## 3B. Much better faces and reactions

Today a face is one of about nine fixed drawings (neutral, happy, sad, angry, afraid, surprised, thinking, pain, eyes closed), swapped behind a blink. That's why reactions feel blunt. The fix is to **build faces from parts that move**, like real cartoon rigs:

- **Face channels,** each sprung like the body:
  - brows: each brow's height and angle, plus a middle pinch;
  - eyelids: upper and lower, for squints and half-closed eyes;
  - pupils: size and where they look, for wide-eyed or tiny pupils;
  - mouth: width, curve, open, skew (a smirk), a pout, teeth, tongue;
  - cheeks: a blush;
  - head: tilt;
  - cartoon marks: a sweat drop, tears, an anger vein, a sparkle, hearts, stars, spiral eyes, a gloom cloud. Some of these already exist as signs.
- **Expressions become recipes** over those channels, so they can **mix and vary in strength**:
  - smirk, skeptical raised brow, eye-roll, suppressed laugh, embarrassed, love-struck, disgusted, bored, sly;
  - guilty, proud, worried smile, fake smile, deadpan, horrified, stunned, tearful pride, jealousy.
  - "70% happy + 30% embarrassed" is a real face.
- **Transitions are motion, not swaps.** Brows rise before the eyes widen, and a smile spreads over 200 ms.
- **Faces come from the words and the subtext.** The writer gives each line its said emotion *and* its felt emotion (says "fine", face hurt). Listeners get a reaction track: what they feel hearing it, when it lands, and how big.
- **Beats in a face:**
  - a double-take (a neutral glance, a beat, a shocked return look);
  - a slow burn (anger building over a line);
  - a held reaction for comedy;
  - a blink on a thought change;
  - eye darts while lying.
- **Style:** the house look stays (big round eyes, simple mouth). The parts are drawn by code in the figure kit, per view (V1's front, 3q and profile), and for animals and creatures too.
- **Byte lock:** a new rig version, so old drawings are untouched.

---

## 3C. More kinds of stories

New **genres** join the brief, each with its own structure emphasis, humour density, faces, music and sound palette:

| Genre | What it brings | Guardrails |
|---|---|---|
| **Comedy** | setups and punchlines, the rule of three, running gags, slapstick through the physics and action moves, comic timing held by the stager | — |
| **Romance** | the meet-cute, the misunderstanding, the almost-moment, gazes held, blushes, hand-holding, a first dance | Age-appropriate by audience: crushes and friendship for children, sweet romance for teens, grown-up romance for adults. **Never sexual** (the SAFE rule). |
| **Dark comedy and satire** (the South Park register) | irony, absurd escalation, deadpan reactions to terrible events, morbid jokes, social satire, cheerful music against grim moments | **Adults only** (and teens with the "mild" setting). Targets are situations, institutions and types, not real private people. The existing rule on real public figures stays. No hate, no sexual content, no encouraging self-harm. Slapstick consequences stay cartoonish. Optional **strong language**, adults only, off by default, bleeped unless turned on. |
| **Mystery** | clue plan, red herring, reveal, the "aha" face | — |
| **Adventure / action** | escalating set pieces, the action moves, chase tracking | cartoon peril only for young audiences |
| **Drama** | quiet scenes, long looks, silence, a turn of heart | gentle for children |
| **Spooky** | creaks, shadows, jump-scare-lite with a laugh after | mild for children |
| **Musical moments** | a character sings a short song | see §3D |

- The **SAFE rule** is updated per audience and genre. The producer won't unlock dark comedy or strong language for child audiences, whatever the maker asks.
- Genre choices are logged, so we can see what makers ask for.

---

## 3D. Music scoring

**Today:** each episode has one continuous score from our own composer (`score.ts` / `conductor.ts`). It has 7 moods (calm, curious, bright, playful, motion, solemn, tense), recorded instruments (VSCO / Pixabay samples), and handovers at scene joins. It follows scene mood, not story moments.

**Upgrade: scored to the story like a film:**
- **A theme per main character** (a short motif), varied by mood: heroic when they win, minor key when they're sad, played on a toy piano when they're small and scared.
- **Love theme and tension theme** for romance and conflict.
- **Hits synced to action** ("mickey-mousing" for cartoon comedy): a pluck on a tiptoe, a timpani on a fall, a slide whistle on a leap, a sting on a reveal. These come from the world-event list, which already has lands, footfalls and turns.
- **Build and release:**
  - rising layers into the climax;
  - a drop-out to silence for the dramatic beat;
  - a swell on the resolution;
  - a button sting on the last joke.
- **Genre palettes:**
  - sitcom stings and bass for the sitcom style;
  - strings and piano for romance;
  - ironic cheerful music under grim moments for dark comedy;
  - an orchestral swell for adventure;
  - pizzicato for sneaking.
- **Ducking:** music dips under every line and rises in wordless action. The mix is already per clip.
- **Songs (later):** short sung lines for musical moments. Some voice engines can sing a little (ElevenLabs v3). Otherwise a melody under spoken rhyme.
- **New instruments:** licensed like the current ones (CC0 or approved sources only; downloads need your OK, as agreed).

---

## 3E. Much better sound

**Today:** most sound effects are synthesised in the browser (pops, swishes, bounces, footsteps, creaks, the recent rustles and splashes). They're light, but thin and "beepy".

**Upgrade:**
- **A recorded sound library.** CC0 or approved sources (Freesound CC0, Sonniss GDC bundles, BBC excluded as agreed), each sound in 3–5 variations so nothing repeats identically:
  - footsteps per surface and shoe;
  - cloth rustle on movement;
  - doors per type (wood, metal gate, sliding);
  - vehicles, animals, props, impacts, whooshes;
  - cartoon classics: boing, slide whistle, zip, honk, splat.
- **Ambience beds per place:** market chatter, city traffic, birdsong, classroom murmur, a kitchen hum, wind, waves and rain. Picked from the place's kind and style pack, and layered under the scene.
- **Foley from the body:**
  - every step, sit, stand, hand touch and cloth move gets a small sound, from the world-event list;
  - sounds follow the character's weight (a giant thuds, a child pats) and the surface.
- **Space:** sounds are panned by where they are on screen and softened with distance (depth `d`). Indoors gets a small room reverb, outdoors is dry.
- **The mix:** dialogue first, music ducks, effects balanced. Loudness is normalised per film.
- **AI sound for rare things:** when the library has nothing, an AI sound-effect generator (e.g. ElevenLabs sound effects) makes one, which is kept in the library for reuse. That costs cents per new sound.
- **The picture check listens too** (later): a missing or wrong sound is harder to check, so the audit confirms every event had its sound.

---

## 3F. It looks like a real production

Every film is packaged like a show, and paced to the tension curve.

### Opening
- **Cold open (optional, on by default for comedy and adventure):** a 5–15 second teaser scene that hooks before the titles. A joke, a mystery or a problem in the first seconds.
- **Title sequence:**
  - the **show's title** animated in the style preset (a picture-book page turn, a bold cartoon pop, a sitcom's simple card over the main set);
  - the **show theme** (a short tune built from the main character's motif, §3D), the same every episode, so it's recognisable;
  - main characters introduced in a quick montage: each in a signature pose with their name, taken from their personality (the fidgeter fidgets).
  - Length scales with the film: 3–4 s for a 1-minute film, 8–12 s for 5 minutes. It can be skipped when rewatching.
- **Episode title card** (series): "Episode 3: The Big Race", with a sting.
- **"Previously on…"** (series, optional): a 6–10 second recap cut from real frames of earlier episodes, voiced by the narrator or a character.

### Inside the film
- **Act breaks with purpose:**
  - a sting and a hold on the cliffhanger face;
  - a stylised transition into the next act (an iris-out, a wipe, a page turn, matching the style preset).
- **Transitions with character:** beyond cut, dissolve and dip, the style preset brings its own (a sitcom's quick bumper shot of the house, an adventure's whip-pan, a picture book's page turn). Used sparingly, at real shifts of place or time.
- **Montage:** "they practise all week" becomes 4–6 quick shots with music, a real film device, built from the beat sheet's time jumps.
- **Establishing shots:** a new place opens with a wide of the place (the L4 pan) plus its ambience before the first line, so viewers are oriented.

### Ending
- **Button:** the last laugh or warm beat before the end.
- **End credits:**
  - the show title, then **"Starring"** with each character in a pose and their name, and the voice engine and voice where relevant;
  - "Written and made with EasiRead Studio" on free plans;
  - over the theme, as a warm or upbeat reprise depending on the ending.
- **Post-credits sting (optional, comedy):** one last tiny gag.
- **"Next time…" teaser (series, optional):** a line and one frame from the next episode's premise.

### Pacing to the curve
- **Cutting rate follows tension:** calm scenes hold shots longer, and rising action cuts faster. The climax uses the tightest shots and the quickest cuts that the minimum shot time allows.
- **Silence before the peak:** music drops out, the ambience thins, and one sound carries the moment: a heartbeat, a clock, or wind.
- **Release:** after the climax, a wide shot, the theme swells, and the characters breathe (the physics weight settle).

### Checks
- The table-read rubric gains "does it open with a hook", "is there a clear build to the climax", "is there a low point", and "does it end with a button".
- **Code checks the structure:**
  - the opening sequence and credits exist;
  - the curve is shaped right;
  - the cut rate rises into the climax;
  - there's silence before the peak.
- The picture check confirms the title card and credits render.

### Maker controls
- Show intro: full, short or none.
- Credits: on or off.
- "Previously on" and "Next time": on or off.
- All default to on for series, and to short for one-off films.

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
| **S7 Faces rebuilt** | Faces from moving parts: smirks, eye-rolls, blushes, double-takes, slow burns, said vs felt emotion, listener reactions | 2–3 days + your review |
| **S8 Subtle interactions** | Gazes, touches, distance, holding hands, hugs of different kinds, silences, interruptions, small tells | ~2 days |
| **S9 Genres** | Comedy, romance, dark comedy and satire (adults), mystery, adventure, drama, spooky; SAFE rules per audience and genre | ~1–2 days |
| **S10 Music scoring** | Character themes, love and tension themes, hits on action, build and drop-outs, genre palettes, ducking | 2–3 days |
| **S11 Sound** | Recorded library with variations, ambience per place, body foley, panning and room sound, a proper mix, AI sound for rare effects | 2–3 days (the library download needs your OK) |
| **S12 Production polish** | Cold opens, animated title sequences with a show theme and character intros, episode cards, "Previously on", act-break stings and styled transitions, montages, end credits with the cast, post-credits gags, "Next time"; cutting, music and sound paced to the tension curve | 2–3 days |

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

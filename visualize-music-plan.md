# Visualize music: a score that follows the page

Richard's request (2026-09-24):
- The background music should change smoothly.
- Some pages should convey movement.
- Some pages don't need music at all.
- Some pages need a solemn sound.
- The sound effects are good. Improve them only if it clearly helps.

Built on `visualize-music` in both repos, and tested; see Status near the end. Nothing is pushed.

## What plays today, and why it jars

Measured on 69 pages made locally on `visualize-next`, and read from `src/lib/scene/sound/` in the client.

- **One loop per page.**
  - The writer picks one mood per page: calm, bright, curious, serious or playful.
  - Each mood is a single 8-bar loop, 18–32 s long.
  - Pages run 19–112 s (median about 50 s), so a learner hears the same loop two to five times.
- **Every page starts over.**
  - The key is picked from the page's title (±2 semitones), and the tempo from the mood (60–108 BPM).
  - When a page ends, the music is cut in 0.12 s. The "Up next" card then waits 5 s in silence.
  - The next page fades in over 1.2 s, in another key and at another tempo. This is the jolt.
- **It pumps.** The music rises about 5 dB in every gap between sentences and drops again at the next sentence.
  - Gaps are short (median 0.38 s) and come every few seconds, so the music swells over and over.
- **The chords restart.**
  - Every chord change restarts all four notes from silence, and the whole block moves at once.
  - So the pad swells again every 2–8 s instead of flowing from chord to chord.
- **No movement, no silence, no solemn.**
  - There is no music for travel or flow, and no way to say "no music here".
  - "Serious" is prompted as "illness, war, loss, anything grave", so it lands on ordinary medical teaching. 27 of the 29 Hemoglobinopathies pages are "serious": the same dark loop plays on nearly every page.
  - It isn't truly solemn either. It is the calm pad, darker and slower, with the same mechanics.
- **Dry.** There is no reverb, so every sound stops dead, and so does the music when it is cut.
- **The level is fine; keep it.**
  - The voice measures about −16 LUFS (three local pages).
  - The music sits about 24 dB under the voice while it speaks, and about 18 dB under in the gaps.
  - The accessibility guideline for background sound under speech is 20 dB.

The problem is not loudness. It is how the music is made (loops, blocks, no room), when it changes (never inside a page, abruptly between pages), and what it can say (five moods with nothing for movement, silence or grief).

## What the research says

Two research passes, one on learning and accessibility and one on music craft. Sources are listed at the end.

- **Music under narration can cost learning.**
  - A bland, synthesized 20-second loop under a narrated animation lowered recall from 11.4 to 7.7 idea units, and problem solving from 2.8 to 1.5 (Moreno & Mayer 2000). The narration stayed clearly audible. Today's music is close to that loop.
  - The "coherence" effect held in 23 of 23 tests. It is strongest for learners with low working memory and for videos that set their own pace.
- **What harms and what doesn't.**
  - Fast, loud music harmed reading comprehension; slow or soft music did not (Thompson 2012). Instrumental music without lyrics was not found to disrupt (Vasilev 2018).
  - Changing notes pull at verbal memory more than steady ones (Kattner & Meinhardt 2020). So busy figures should sit further under the words than the chords do.
  - Sudden changes in background sound capture attention. So changes should be gradual and expected.
- **Levels.**
  - WCAG 1.4.7 asks for background at least 20 dB under speech, or a way to turn it off.
  - Listeners in tests wanted about 10–15 LU; older and non-expert listeners wanted more.
  - The German broadcasters' Dialog+ trial lowered background during speech, not between lines, because lowering between lines "does not help intelligibility and can spoil the mood". That is the case against today's pumping.
- **Control.**
  - In an ADHD video study, 75% removed the music but wanted meaningful sounds kept.
  - The BBC's accessible-mix trial, Dialog+ and SVT's enhanced speech were all well liked.
  - Hence separate Music and Effects switches.
- **Craft.**
  - **One key and one tempo.** Scores that change smoothly keep every cue in one key and tempo; Red Dead Redemption's whole score is in A minor at 130 BPM, with a half-time option.
  - **Changes on the bar.** Transitions land on the next bar and are usually a bar long.
  - **Crossfades.** Crossfades between different music should keep their loudness, and reverb tails should ring over the change.
  - **Ducking.** Radio mixers duck in two moves: most of the way under the first word, then the last few dB over a breath (NPR).
- **Feelings.**
  - **Mode, strongest cue.** Mode is the strongest emotional cue, then tempo, register and dynamics (Eerola). Lydian reads as wonder.
  - **Solemnity.** Slow, low, smooth music with slow attacks reads as solemn and dignified. So do steady rhythm and stepwise movement over simple triads (Gabrielsson; Barber's Adagio).
  - **Movement.** A short, simple, repeated figure set apart from the melody (an ostinato) gives drive and momentum. Busy notes over slow chords give motion without a faster tempo.
- **Sound.**
  - Detuned pairs and slow modulation make good pads, and generated noise reverb is standard (Tone.js does it).
  - Timing that drifts together from note to note sounds human; fresh random jitter sounds mechanical.
  - **Piano, harp, bells and plucked strings are where synthesis sounds cheapest.** The CC0 Versilian Community Sample Library (VCSL) is the candidate if recorded instruments are wanted.

## The design in one paragraph

Each document gets one score instead of a loop per page. The whole document shares one key and one tempo.
- **States on the sentences.** Each page's music is a short list of states placed on its sentences: calm, curious, bright, playful, motion, solemn, tense or none.
- **Smooth changes.** The music moves between states on bar lines, through the same key. Layers fade in and out; loops are never swapped.
- **It ends with the video.** The music comes home as the voice ends and fades in a second and a half. The next page starts its own, in the same key, where the progression left off. (It first carried on through the "Up next" wait; Richard heard that as sound after the video had ended, so it now stops.)
- **It gives way to the voice.** It steps back steadily under speech instead of pumping.
- **It has a room.** One reverb lets endings ring out.

The writer says what each stretch feels like; code decides where the changes land and how they sound.

## 1. The states

| State | For | How it sounds |
|---|---|---|
| **none** | Maths being worked, a passage read closely, a moment that needs quiet | No music. Effects and place sounds carry on. |
| **calm** | Most explaining | A felt piano's slow broken chords over a low bass (a story's harp), a chord every two bars, no beat. On a "serious" page, a minor colour: thoughtful, not mournful. |
| **curious** | A question, a discovery, "look at this" | Pizzicato off the beat on open chords that don't settle (added 2nds, a raised 4th), and a celesta asking a rising three-note question. |
| **bright** | Good news, a success, an answer found | An electric piano's arpeggios, major and higher. |
| **playful** | Jokes, light fun | Marimba off the beat over a bouncing bass, a pizzicato hook, a soft shaker. |
| **motion** | A journey, a flow (blood, a river, a process), growth, time passing. With energy high: a chase, a rush. | A marimba's (a story's pizzicato's) short figure repeating steadily over a pulsing bass, a shaker ticking, the harmony climbing every four bars. Energy high doubles the figure's speed. |
| **solemn** | Death, grief, loss, war, disaster, remembrance | Strings in a slow chorale, a chord every two bars, low and smooth, in minor, no beat. A soft low bell at the start of each long phrase. The only state that holds chords. |
| **tense** | Danger, suspense, conflict (mostly in stories) | The home note held low by trembling strings, two bells a semitone apart far off, a heartbeat when it runs high. It doesn't resolve until the state ends. |

- **One tempo.** Every state shares the document's key centre and tempo.
  - "Moving" feels faster through denser notes, and "solemn" slower through slower chords. The tempo itself never jumps, so any state can follow any other.
- **Solemn is for loss.** An illness being explained is not solemn, and the writer's guidance says so.

## 2. One score per document

- **Key.** One home note per document, from its id (for example D, E♭, F, G or A).
  - A state changes the mode on that same home note: major for calm and bright, a raised 4th for curious, Dorian or minor for solemn.
  - So a change is a change of colour, never a change of key.
- **Tempo.** One tempo per document, around 72 BPM. The document profile's tone nudges it a little: lighter a touch faster, serious a touch slower.
- **Instruments.** The profile's kind picks the family:
  - stories get strings, harp and piano;
  - textbooks get soft keys, mallets and pad;
  - poetry and drama get piano and strings, sparingly.
- **Stories have a theme.** A short motif (four notes) belongs to the story. It plays under the "previously" opening, so the music links page to page the way the characters do.

## 3. Changes that don't jar

| Moment | What the music does |
|---|---|
| **State A to state B within a page** | It waits for the next bar line. The old state's layers fade out over one bar (about 3 s at 72 BPM) while the new state's layers fade in, and the harmony moves through a chord the two share. |
| **Into "none"** | It stops starting new notes at the end of the phrase, and the last chord rings out into the reverb over 2–4 s. |
| **Out of "none"** | It comes back at the start of a sentence or in a long pause: the pad first, faded in over a bar, then the rest at the next bar. |
| **Page end, "Up next", next page** | Its last bar comes home as the voice ends, and it fades in 1.5 s; nothing plays through the countdown. The next page starts its own music, in the same key, where the progression left off. |
| **End of the last page** | It closes on a cadence, then the tail. |
| **Pause and play** | Pause fades it out in 0.4 s. Play fades it back in over 0.8 s, and the score carries on; it doesn't restart. |
| **Seeking** | It carries on. If the state at the new time is different, it changes at the next half-bar. |
| **Speed above 1.25×** | No music, as now. |

## 4. Who decides what

The rule stays the same: models decide what, code decides where and when.

- **The writer, per step, says two things.**
  - `music`: one of the eight states, or left unset for "same as before".
  - `energy`: low or high, only for motion, bright and tense.
- **The writer's guidance:**
  - Set the page's music on its first step.
  - Change it only where the feeling truly changes. Most pages have one state; a few have two or three.
  - Explaining is calm or curious.
  - Solemn is only for death, grief, loss, war or disaster. An illness explained is calm.
  - Moving is for when the page shows something travelling, flowing or changing over time.
- **Code on the server (compose) places the changes.**
  - A change starts with a sentence.
  - A state lasts at least two sentences and about 10 s (the median step is 6.6 s).
  - A page has at most three changes, and neighbours with the same state merge.
  - Maths being worked (things with `source` math or plot) and a passage read closely (`quote`) take `none`, from the step they arrive until they leave. Charts and timelines keep the music.
  - The profile sets bounds: a "light" book never gets tense, and a "serious" book never gets playful.
  - The page's last sentence gets a cadence, so the music comes to rest as the page ends.
  - A story page's "previously" opening gets the story's motif.
- **Code in the player shapes the mix.** It ducks and thins the music under the voice (section 5), using the sentences' times and which sentences are key points.

## 5. Under the voice

- **It ducks ahead of the voice, and it stops pumping.** The sentences' times are known in advance, so:
  - the music starts stepping back about 250 ms before the voice starts;
  - it stays down through short gaps (under 1.2 s);
  - it rises only in the long pauses where the idea changes, with about 1 s ramps.
- **Levels.**
  - At least 20 dB under the voice while it speaks, measured as loudness (keep today's roughly 24 dB).
  - Up to about 12–14 dB under in long pauses.
  - Up to about 8–10 dB under before the first sentence.
- **The voice keeps its band.** While the voice speaks, a gentle dip of about 4 dB on the music around 1–4 kHz, where speech is understood. The music's moving figures sit below or above the voice's range, never in it.
- **Key points land.** On a sentence the writer marked as a key point, the music thins to its pad (the moving figures rest), so the point lands in space.
- **Place sounds come first, briefly.** A thing's own sound (wind, water, rain, a fire, a clock) is heard only as it arrives: 3.5 s, then a 1.5 s fade, and the same sound not again within 20 s. While it plays, the music drops its brightest layer. (It first looped the whole time the thing was on stage; Richard found that distracting.)

## 6. Better sound

- **Chords that flow.** Notes two chords share are held, and only the voices that must move do so, by the smallest step. The pad no longer swells on every chord.
- **A room.** One reverb for the whole stage, made in code (no file). The music gets about 30%, effects about 10%, and place sounds a touch. Endings ring out instead of stopping.
- **No loops.** The music is written bar by bar from each state's rules, seeded by document and page, so a page sounds the same every time but nothing repeats every 20 s. Phrases are four bars, with variation at the phrase level.
- **Instruments: two routes, decided by listening.**
  - **A. Better synthesis, no files.** Warmer pads (three slightly detuned voices, a slowly drifting filter), plucked strings (Karplus–Strong), bells (FM), an organ built from pure tones, and a soft sub-bass.
  - **B. A small set of free recorded instruments.** Piano, harp, strings (held and plucked), and celesta or mallets, all public domain (CC0). About 1–2 MB, fetched once when music first plays and cached. Synthesis stays for pads and bass.
  - **Recommendation: B, if the audition confirms it.** Piano, strings and harp are exactly where synthesis sounds cheapest, and solemn needs real strings.
- **Steady on slow devices.** The music is booked one or two bars ahead on the audio clock. It isn't tied to picture frames, so it holds up on a busy phone or in a hidden tab.

## 7. Controls

- **Two switches instead of one.** "Sounds" becomes **Music** and **Effects**, both remembered.
  - A learner who finds music distracting keeps the effects.
  - One who wants silence turns off both.
- **Defaults stay on.** At more than 1.25× speed the music drops out, as now.

## 8. Effects: small improvements

The effects stay as they are. Each item below is small, and can be heard and judged on its own.

- **Tuned to the music.** The pitched effects (chime, shimmer, pluck, tick, tap) play on a note of the current chord, so they sound like part of the score. Games do this.
- **A little variation.** Each play varies by about ±2% in pitch and ±1 dB in level, so a repeated pop doesn't sound machine-made.
- **The same room.** A touch of the stage's reverb.
- **Softer in solemn.** Effects are about 3 dB quieter, and the sparkle of a shimmer is dropped.

## Data and contract

All changes are additive. There is no generator bump, so no page has to be remade.

- **`SceneDto.sound`** gains:
  - `music?: { atMs, state, energy? }[]`;
  - `palette?: 'story' | 'lesson' | 'verse'`;
  - `motif?: true` on a story page.
- **Beats** gain `delivery?`, so the player knows the key points.
- **Old pages** (no `music`) play as one state from their mood:
  - calm, bright, curious and playful map to themselves;
  - serious maps to calm in its minor colour, not to solemn, because most "serious" pages are plain medical or historical teaching.
- **What old pages get without a remake:** the score in one key across pages, no pumping, flowing chords, the room, no repeating loops, the better instruments, brief place sounds, music that ends with the video, and the new switches.
- **What only new pages get:** changes within a page (motion, solemn, none, tense) and the story motif.

## Technical plan (2026-09-24)

This builds on branch `visualize-music` in both repos, cut from `visualize-next`. Richard asked for it to be built and tested, so the decisions below are made with the recommended answers:
- **Instruments: synthesis only, for now.** The recorded (CC0) route needs sample files downloaded, which needs Richard's go-ahead first. The instrument layer is built so recorded notes can replace any synthesized voice later.
- **Maths being worked and close reading:** no music.
- **Switches:** separate Music and Effects switches.
- **Tense:** included.
- **Old "serious" pages:** calm, in its minor colour.

### Server (EasyRead-server)

- **S1 `scene-script.ts`.**
  - `SCENE_MUSIC` (the eight states) and `SceneMusic`.
  - `SceneBeat.music?` means "the music from this sentence on"; `SceneBeat.energy?: 'high'`.
  - Draft beats carry `music` and `energy`, nullable.
  - The mend keeps known states and drops anything else. It keeps `high` only on motion, bright and tense.
- **S2 `schemas.ts`.** Two nullable enums on each beat.
- **S3 `prompts.ts`.** A music paragraph in the writer's rules: what each state is for, and "change it only where the feeling truly changes".
- **S4 `scene-music.ts` (new, pure).**
  - `placeMusic({ beats, mood, steps, things, durationMs, tone })` returns cues `{ atMs, state, energy? }[]`.
  - The state on each sentence is the writer's choice, carried forward, starting from the page's mood (serious maps to calm).
  - Tone bounds:
    - a light book: tense becomes curious;
    - a serious book: playful becomes calm.
  - Steps showing `math`, `plot` or `quote` force `none`, sentence to sentence.
  - A forced `none` shorter than 6 s is dropped.
  - A state shorter than 10 s or two sentences merges into its neighbour.
  - A page has at most three changes.
  - `paletteOf(profile)`: fiction and drama give `story`, poetry gives `verse`, anything else `lesson`.
- **S5 compose.**
  - `ComposeInput.profile?` is added.
  - `sound` becomes `{ mood, music, palette, motif? }`; `motif` is set on a story page with an opening, or on any page of a story book.
  - Beats carry `delivery` when it isn't `explain`.
- **S6 contract.**
  - `SceneMusicName` and `SceneMusicCueDto`.
  - `SceneDto.sound` gains `music?`, `palette?` and `motif?`.
  - Beats gain `delivery?`.
- **S7 wiring.** The processor passes the profile. The bench adds a music line and a `music` block to `report.json`.
- **S8 specs.** `scene-music.spec.ts`, plus additions to the mend and compose specs.

### Client (EasyRead)

- **C1 contracts.** Mirror the server's contract changes.
- **C2 `sound/theory.ts` (pure).**
  - Modes, and chords by scale degree (triads, added 9ths, sus).
  - Voice leading with the smallest total movement inside a range: held common tones, no crossing, no gaps wider than an octave in the upper voices.
  - `nearestChordTone`.
- **C3 `sound/score.ts` (pure).** The composer.
  - `scoreKey(documentId, palette)` picks the home note (D, E♭, F, G or A, from the id) and the tempo (72 BPM; 66 for story and verse).
  - The `STATES` table gives each state its mode, its progressions (by degree), bars per chord, and the pad's range and instrument. It also sets the bass pattern, the figure pattern, the level and the reverb send.
  - `planBar()` gives each bar its pad voicing, bass notes, figure notes and the motif. It is deterministic from the seed, the bar and the state.
    - A cadence is steered in a page's last two bars.
    - A change of state pivots on a chord the two share.
  - `musicCues(scene)` returns the server's cues, or one cue from the mood on older pages.
  - `duckPlan(scene)` gives the mix's timeline:
    - down 250 ms before each sentence;
    - held through gaps under 1.2 s, lifted in longer ones;
    - figures thinned under key sentences and under place sounds.
- **C4 `sound/instruments.ts`.**
  - Live oscillator voices for the pad, strings, organ, bass, keys (FM), bell (additive), mallet and a soft low pulse.
  - The Karplus–Strong pluck (harp or pizzicato) is computed in JS into a buffer per note, and cached.
  - The DSP parts are pure functions over `Float32Array`, so they can be tested outside a browser.
- **C5 `sound/room.ts`.**
  - A generated stereo impulse response: 2.6 s, getting darker as it decays.
  - One `ConvolverNode`: the music sends 0.3, the effects 0.1.
- **C6 `sound/conductor.ts`.** The pane-level player of the score.
  - One per Visualize pane (per document). Each page's player attaches it and detaches it.
  - It reads the voice through a small `VoiceClock` interface (the audio element, or a fake one on the dev page).
  - It books one bar ahead on the AudioContext clock, with a 50 ms timer.
  - A bar's state is the cue at the bar's middle, so a change lands on the bar line nearest its sentence.
  - Each state plays into its own gain, and a change crossfades over a bar:
    - into `none`: a 2.5 s fade, with the pad released into the room;
    - out of `none`: the pad first, the rest at the next bar.
  - Pause fades out in 0.4 s and keeps its place in the progression. Play fades back in over 0.8 s.
  - A seek adapts at the next bar. Above 1.25× the music stops.
  - At the voice's end it fades in 1.5 s (as built at first, it held the home chord for two bars through the "Up next" wait; that was changed at Richard's request).
  - Mix settings:
    - duck: open 0 dB, long pause −3 dB, speech −12 dB;
    - figures: −9 dB under key sentences, −6 dB under place sounds;
    - a −4 dB dip at 2.5 kHz while the voice speaks;
    - a high-pass at 60 Hz.
  - `harmonyAt(time)` exposes the current chord for the effects.
- **C7 `engine.ts`.**
  - The music bed leaves `SceneSound`; effects and place sounds stay.
  - Effects gain the room send, a seeded ±2% pitch and ±1 dB level variation, and a −3 dB cut under solemn.
  - Pitched effects are tuned to the conductor's chord.
- **C8 `visual-pane.tsx`.**
  - The conductor is made in the pane, attached by each page's player, and destroyed with the pane.
  - The one Sounds switch becomes Music and Effects, remembered. The old setting carries over.
- **C9 dev page `src/app/dev/music/page.tsx`** (development only).
  - Play every state (both energies) and the five transitions.
  - Render any of them offline, with numbers: loudness per 50 ms, the largest jump, the peak, and loudness against the target.
- **C10 tests.**
  - `node:test` specs for theory, score, instruments and room, compiled by the repo's own TypeScript: `npm test`, with no new packages.
  - The dev page's offline numbers, run in the browser.

### Checks

- **Server:** `npm test`, lint and a type check.
- **Client:** `npm test`, lint, `tsc --noEmit`, and `next build` in a scratch copy.
- **Offline renders on the dev page.** Each state for 40 s, and each transition. They pass when:
  - no jump between 50 ms windows exceeds 3 dB outside a planned fade;
  - the peak stays under −1 dBFS;
  - loudness lands within 2 dB of its target;
  - tails reach silence within 4 s.
- **End to end, locally.**
  - The API and worker restarted on the branch.
  - A story page, a maths page and a medical page remade, and their cues checked.
  - All three played in the pane: across the page change, the switches, pause, seek and speed. No console errors.

## How we'll know it worked

- **The bench** gains a music line per page:
  - the states and when they start;
  - the shortest state, and changes per minute;
  - "none" wherever maths is worked or a passage is read closely;
  - every change on a bar line and at least a bar long;
  - music at least 20 dB under the voice while it speaks.
- **A listening checklist:**
  - the page change doesn't jolt;
  - no pumping between sentences;
  - solemn sounds solemn, and motion moves;
  - silence where the maths is worked;
  - the ending rests.
- **Demo users.** On old and new versions of the same pages, ask per page: did the music help, get in the way, or go unnoticed?

## Costs

- **No new model calls.** The writer's reply grows by a few words per step, about 30–60 tokens a page (well under a tenth of a cent).
- **Generation time is unchanged.** Nothing new is made on the server.
- **Route B** adds about 1–2 MB of instrument files, fetched once per browser.

## Decisions for Richard

1. **Instruments:** better synthesis only, or free recorded instruments (1–2 MB)? Recommended: audition both; likely the recorded ones.
2. **Maths being worked and close reading:** no music (recommended), or very quiet calm?
3. **Switches:** separate Music and Effects switches? (Recommended.)
4. **Tense for stories?** (Recommended.)
5. **Old "serious" pages:** calm in a minor colour (recommended), or solemn?

## Risks

- **Generated music can still sound amateur.** Hence the audition before anything is built, and states kept sparse.
- **The writer over-uses a state** (motion everywhere, solemn on medical pages). Mitigated by a tight definition, the placement rules (at least 10 s, at most three changes), the profile's bounds, and bench counts to watch it.
- **Phones.** Real-time synthesis costs CPU. Route B's recorded notes are cheap to play, and there is one reverb for everything.
- **Browsers' autoplay rules.** The next page's music starts without a press, so the audio context must stay running. The existing unlock on the play press covers the first page, and the context is shared.

## Status (2026-09-24, built on `visualize-music`, not pushed)

What changed after testing, against the plan above:
- **"moving" became "motion".** The writer read "moving" as "emotionally moving" and never chose it for journeys. The worked example now changes to motion where the air flows.
- **Merging short stretches.** Short stretches merge by strength: a flurry of one-sentence changes becomes its strongest feeling. A strong feeling (solemn, tense, motion) too short on its own grows into the sentences after it. This came from the writer's South Pole page, where a sentence of each feeling at the end, grief among them, was otherwise lost.
- **Quiet the writer asks for is the weakest feeling.** One sentence of silence ("the flame goes out") cannot be faded out for and back, and when it could grow it swallowed a tense passage.
- **Openings and bridges around workings.**
  - An opening before a working keeps its music if it lasts 6 s.
  - Music between two workings comes back only if it lasts 20 s.
- **Fades.** A leaving state fades first, then its notes are let go. Releasing them together compounded into a drop about three times quicker than asked. The fade into quiet is 3.5 s.
- **States evened by measurement.** Every state is within about 3 dB when no one speaks (about −31 dBFS). Under the voice every state is 22–27 dB below it, and there are no clicks.

What was measured and tested:
- **Server:** placement specs (15), compose and mend specs; the whole suite passes; lint is clean.
- **Client:** 17 `node:test` specs:
  - chords, voice leading, no diminished chords;
  - determinism, no eight bars repeated, pivots, cadences;
  - each state's density, the mix plan;
  - plucks in tune within 8 cents, the room's decay.
- **Client builds:** type check, lint, and `next build`. The dev page is a 404 in production.
- **Offline renders on the dev page (`/dev/music`), every state and change:**
  - no clicks;
  - peaks at or under −13.6 dBFS;
  - steady states move at most 2–7 dB between 400 ms windows (notes starting);
  - changes of state and page are no rougher than that.
- **Real pages remade with the new writer:**
  - South Pole: curious → calm → solemn.
  - Magnification: curious, then quiet for the working.
  - Daffodils: quiet under the poem, then the music comes in with the flowers.
  - The Lantern Keeper p2: tense → solemn.

- **Every state its own sound** (after Richard listened: "why does every sound have pads in them?").
  - Every state had stood on the same held pad (strings, in a story). It was the loudest and steadiest layer, and the moving parts stepped further back under the voice, so the states sounded alike.
  - Now only solemn holds chords, and tense holds a trembling drone. The others carry their harmony in their own instruments: a felt piano, pizzicato and celesta, an electric piano, marimba, a shaker. The tests check that no two states play the same instruments.
  - Between pages, the home chord is rolled once on the state's own instrument over a low home note, instead of a held pad.
  - Levels were re-measured: every state is within about 1.5 dB of the others, with playful and tense a little softer, 23–25 dB under the voice, and no clicks. No change is rougher than the notes around it.

- **Nothing plays after the video, and place sounds are a moment** (Richard: sound kept playing after the end; wind and water on and on were distracting).
  - The music now ends with the voice: about 2 s of fade and ring, measured, where it was 9–14 s.
  - A thing's own sound is heard for 3.5 s as it arrives, then fades over 1.5 s, and the same sound doesn't come again within 20 s.

Still open:
- **Recorded instruments (route B)** need Richard's go-ahead to download a CC0 sample set.
- **"motion" is still rarely chosen** by the writer; to watch on more pages.
- **Short dramatic silences**, a one-sentence rest, would need a quick-cut "rest" in the conductor. Not built.

## Recorded sounds: where they could come from (researched 2026-09-24)

Richard pointed at Motion Array, Pixabay and Uppbeat. The question that decides it is whether a site's licence lets us build its files into a paid web app, served to browsers as part of the product. Nothing was downloaded.

| Source | Verdict for us | Why |
|---|---|---|
| **Motion Array** | No | Apps and software need a separate business licence (Terms §4). The terms also forbid uses that let end users extract the files, and use in automated systems or websites (§3a, §3g, §3i). After a paid plan ends, only finished projects stay covered. https://motionarray.com/terms-of-service/ |
| **Pixabay** | Yes, with conditions | Perpetual, commercial, no attribution. Its FAQ counts building content into an app as enough change. We must not offer the files on their own, must avoid tracks marked Content ID or registered with ASCAP, and must not scrape or bulk-copy. Audio is MP3; the API doesn't cover audio; quality varies. https://pixabay.com/service/terms/ |
| **Uppbeat** | Poor fit | Apps need Pro or Business, $15–35 a month, and downloaded content may not be used after the subscription ends. Tracks must stay recognisable. The free plan requires credit and allows three downloads a month. https://uppbeat.io/user-agreement |
| **Freesound (CC0 filter)** | Yes | Public domain, any use. Downloading needs a login. Quality and provenance vary. https://freesound.org/help/faq/#licenses |
| **Sonniss GDC bundles** | Yes | Royalty-free, commercial, no attribution. Allowed in apps when synchronised to our own project, not as a sound service. Large zip archives. https://sonniss.com/gdc-bundle-license/ |
| **BBC Sound Effects** | No | Non-commercial use only. https://sound-effects.bbcrewind.co.uk/licensing |
| **VCSL and VSCO 2 CE** | Yes, the best fit for the score | CC0 instrument samples: pianos, harp, marimba, glockenspiel, tubular bells, organ, and in VSCO 2 CE, strings held and plucked. https://github.com/sgossner/VCSL and https://github.com/sgossner/VSCO-2-CE |

The recommendation:
- **Keep the generative score**, because only it can change mood on a sentence, and give it CC0 recorded instruments from VCSL and VSCO 2 CE. That is a few notes per instrument, about 1–2 MB shipped.
- **Record the brief place sounds** (wind, water, rain, fire, clock, heartbeat, bubbles) from Freesound CC0 or Sonniss, with Pixabay as a backup. Each is trimmed to about 5 s, with its source, author and licence written down.
- **Keep the synthesized effects** as Richard likes them. Recorded ones are an option later.
- **No pre-made music.** It can't follow a page sentence by sentence, and its licences tie it to subscriptions or to tracks staying unchanged.

## Sources

Learning and accessibility:
- Moreno & Mayer 2000, the background-music experiments: https://tecfa.unige.ch/tecfa/teaching/methodo/Moreno_Mayer00.pdf
- Mayer, the coherence principle (23 of 23 tests, d = 0.86): https://edtechuvic.ca/wp-content/uploads/sites/11/2022/09/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles.pdf
- Kämpfe et al. 2011, a meta-analysis: https://gwern.net/doc/psychology/music/distraction/2010-kampfe.pdf
- Vasilev et al. 2018, music and reading: https://pmc.ncbi.nlm.nih.gov/articles/PMC6139986/
- Thompson et al. 2012, fast and loud music: https://sites.utm.utoronto.ca/sites/sites.utm.utoronto.ca.glenn_website/files/download/ThompsonEtAl2012.pdf
- Lehmann & Seufert 2017, working memory: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01902/full
- WCAG 1.4.7: https://www.w3.org/WAI/WCAG22/Understanding/low-or-no-background-audio.html
- Dialog+, Casualty accessible audio and SVT (review): https://arxiv.org/pdf/2112.09494
- The ADHD video study: https://arxiv.org/html/2507.13309
- AES TD1009 on dialogue intelligibility: https://aes.org/wp-content/uploads/2025/12/5297fea6-25ba-4865-92f6-dc1d0ba52ce4.pdf

Craft:
- Horizontal re-sequencing (Phillips): https://www.gamedeveloper.com/audio/horizontal-resequencing-and-dynamic-transitions-for-game-music-composers-from-spyder-to-sackboy-gdc-2021-
- Whitmore on adaptive audio: https://www.gamedeveloper.com/audio/design-with-music-in-mind-a-guide-to-adaptive-audio-for-game-designers
- Red Dead Redemption's one key and tempo: https://www.gamedeveloper.com/audio/myths-mavericks-and-music-of-i-red-dead-redemption-i-
- Eerola et al., emotional cues: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00487/full
- Temperley & Tan, modes: https://davidtemperley.com/wp-content/uploads/2015/11/temperley-tan.pdf
- Juslin & Laukka 2003: https://www.brainmusic.org/EducationalActivities/Juslin_emotion2003.pdf
- Transom, scoring stories: https://transom.org/2019/scoring-stories-part-2/
- NPR on music under speech: https://text.npr.org/g-s1-67187 and https://text.npr.org/g-s1-67902
- Kattner & Meinhardt 2020, changing tones and memory: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.00346/full
- A Tale of Two Clocks (scheduling): https://web.dev/articles/audio-scheduling
- Tone.js Reverb (generated impulse): https://tonejs.github.io/docs/15.0.4/classes/Reverb.html
- Hennig et al., human timing drift: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0026457
- VCSL, CC0 samples: https://github.com/sgossner/VCSL

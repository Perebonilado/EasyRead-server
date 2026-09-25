# LessonReel: from slides that move to animated films

Richard (2026-09-26): people who saw Easy Read's Visualize want to make YouTube videos with it, so it becomes a new app, **LessonReel**. The name may change, so it lives in one place (see "The name" below). He asked what limits Visualize today and how to make it 100x better, taking TED-Ed's *History vs. Napoleon Bonaparte* (Alex Gendler; animation by Brett Underhill) as the bar: "how the animations look better and are more alive, and even better".

## What the Napoleon film does

I studied the 5 m 21 s film frame by frame: a frame every 6 s, dense bursts at 1:00 and 3:00, and every cut counted.

- **It cuts often.** There are 51 shots in 4 m 52 s of story, about 10.5 a minute; the median shot is 4 s and the longest 25 s. Our best page (System Design p253) changes its stage 11.7 times a minute. So the difference is not how often the picture changes: it's what each picture is.
- **Every frame is a composed shot, not a slide.**
  - It's full-bleed: a set behind everything (a courtroom, a sea, a map of Europe, a snowfield), with things in front of it at different depths.
  - It uses real film grammar: close-ups, medium shots and wides; a low angle on the prosecutor; over-the-shoulder with Napoleon's portrait in the frame; a split screen.
  - Nothing ever sits in a row on an empty background.
- **One art direction, held for five minutes.**
  - The style is flat, angular cut-paper shapes with paper grain.
  - Each scene has its own colour grade: red for the Terror, purple night on Elba, warm sun on St Helena.
  - It adds soft vignettes, light rays behind a triumphant figure, and a depth-of-field blur on backgrounds.
- **A cast on model.** Napoleon, the judge, the prosecutor and the defence look the same in every shot and at every size. The courtroom is a set we come back to, so it works as a framing device.
- **The camera never stops.** Even held shots drift, and they push in, pan or tilt. The map sequence (3:00–3:15) is a 3D map, with France raised like a plinth and soldiers as cut-outs casting long shadows; the camera moves over it as France fills with troops.
- **Things act, rather than just appear.**
  - A flag unfurls between Napoleon and the kings.
  - A quill writes the Constitution.
  - Scattered paper pieces become the map of Europe.
  - Chains snap.
  - One silhouette soldier becomes a crowd, then an army.
  - A giant boot stamps on a tiny Napoleon: a newspaper cartoon brought to life.
- **Ideas are shown as metaphors, not labelled.** Execution is a head that shatters. Liberty is broken chains. Propaganda is a headline ("British smash tiny Napoleon!").
- **Text belongs to the world.** Words appear on a newspaper, a treaty ("Treaty of Amiens 1802") or a constitution. The only captions are small place-and-date cards ("Isola d'Elba, 1814"). There are no labels with leader lines and no keyword cards.
- **Characters act with very little.** They blink, turn their head, move their mouth and raise an arm. Strong silhouettes and held poses, with the camera moving, make simple rigs look alive.
- **It's a story.** A trial frames the facts: a question, both sides, and a verdict left to the viewer.

It took a professional animator weeks. What we can take from it is its grammar, which is mostly cut-out animation plus a camera plus light. Nearly all of that can be made by code.

## Where Visualize is today, and what limits it

| | Visualize now | The Napoleon film |
|---|---|---|
| **Unit** | A stage of things in slots (row, grid, hub, compare) on a cream background, like a slide | A composed shot: a set, layers, framing |
| **Art** | Each thing is its own SVG, drawn by DeepSeek from a brief, one call per thing, with no shared style: icons in slightly different hands | One art direction: palette, shapes, texture, light |
| **People** | The figure kit: one generic cartoon style, the same for every book | Characters designed for the film, on model, with expressions |
| **Camera** | Still, with a zoom now and then | Always moving: drift, push, pan, angles, shot sizes |
| **Motion** | Things pop or fade on; small loops (sway, glow); points and pulses | Acting, props with actions, transformations, crowds |
| **Ideas** | Shown literally, then labelled with lines and keyword cards | Shown as metaphors; text only where the world would have it |
| **Look** | Flat, no lighting, no texture, no depth | Colour grade, light, grain, vignette, depth blur |
| **Sets** | Explainers have none; story books do, painted once per book | Every shot has one, and some come back again and again |
| **Shape** | Narrates the page | Tells a story with a device (a trial) |
| **Output** | A scene file played live by the Easy Read player | A film file |

The story pipeline is already closer: sets painted once per book, characters kept across pages, film cuts between places, acting from the words. Explainers get none of it.

The deepest limit is structural. **The writer plans narration and pictures in one call, and a layout engine places things in slots.** Nobody ever decides what a shot is: its set, its framing, its camera move, its metaphor, its light. Everything else follows from that.

What we already do better than a hand-made film, and must keep:
- **Accuracy:** the source is the only source of facts, maths is checked by code, and things are drawn as they really are.
- **Word-level sync:** every change lands on its word.
- **Understanding of the whole source:** the teacher's notes.
- **Precise diagrams:** labels and arrows for technical material.
- **Minutes, not weeks,** at any level from a child to a professional.

## The plan: a film pipeline

The shift is from "a storyboard of things on a stage" to **pre-production, direction, animation and rendering**, the way a studio works. Each stage is a model call or code with its own checks.

### 1. Pre-production, once per film (or series)

- **Treatment.** Built from the teacher's notes: the question the film answers, its shape (a mystery, a trial, a journey, a build-up, a comparison) and its recurring device. Technical material gets one too, for example "we follow one photo from your phone to a server in Oregon and back".
- **Art bible.** A style chosen once and held:
  - a palette, and a palette per mood;
  - the shape language (angular cut-paper, soft rounded, ink line);
  - texture, and a lighting recipe.
  - It starts with a handful of house styles we tune until they look right (TED-Ed-like cut paper, clean tech, storybook, chalkboard). A creator on LessonReel picks one, or uploads their own brand colours.
- **Cast, sets and props, designed once and kept.**
  - Each character gets a model sheet: front and three-quarter views, expressions, mouths and hands, split into rig parts.
  - Recurring sets are painted in layers: background, midground and foreground, for parallax.
  - Props come with their states and actions: the flag furled and unfurled, the quill writing, the chains whole and broken.
  - The teacher's notes' "pictures" (what each thing really is) feed this, so a "client" is designed once as a device and reused everywhere.
  - Story books already keep sheets and sets; this makes that the rule for every film.

### 2. Direction: a shot list

A new model stage, the **director**, sits between the script and the pictures. For each beat of narration it writes a shot:
- **the set**, and what stands in it;
- **framing:** close-up, medium, wide, over the shoulder, split, insert;
- **camera move:** push, pull, pan, tilt, drift, whip;
- **what acts:** character acting and prop actions;
- **the metaphor**, if the idea is abstract;
- **on-screen text,** with its home (a document, a headline, a map, a place card, or a diagram label for technical material);
- **the transition:** cut, match cut, whip, a push through an object;
- **the light and grade.**

**Code checks it,** as the storyboard is checked now:
- a shot every 3–8 s, like the film;
- no shot without a set;
- no two shots in a row with the same framing;
- metaphors only where the idea is abstract, and never replacing a fact;
- text only where the world would carry it;
- every planned idea covered (the teacher's-notes check).

**Accuracy still wins.** A technical diagram is its own kind of shot, drawn by code: arrows, parts and labels, dressed in the art bible's style. A metaphor never stands in for a fact the learner is tested on.

### 3. Art: better pictures than an LLM can write as SVG

DeepSeek writing SVG by hand makes icons. It will not make a courtroom with depth and light. The options:

| Route | Quality | Consistency | Can it animate? | Accuracy | Cost |
|---|---|---|---|---|---|
| **A.** LLM-written SVG (today), with the art bible in the prompt | Low ceiling: icons | Fair | Yes, in parts | Good | Lowest |
| **B.** An image model that makes vectors: Recraft V4 Styles Vector returns real SVG paths and holds a style defined from 1–10 reference images | High, flat and illustrative | Good: the style is held by the model, and the model sheet gives references | Yes, once split into parts | Good for things, not for diagrams | About $0.055 an image (checked 2026-09) |
| **C.** A raster image model (gpt-image, Imagen, Flux) with style references, then cut into layers | Highest | Good with references | 2.5D: parallax and puppet warp | As B | Cents per asset |
| **D.** Video models (Veo, Kling, Runway) generating whole shots | Very alive | Poor across shots | No control, no word sync | Poor with text and diagrams | Highest |

**Recommendation: B for characters and props, C for backdrops and sets, and code for diagrams, maths, maps, charts and text.** D only as an experiment, for an establishing shot now and then. The Napoleon film's style is flat cut-out shapes, which is exactly what B makes and what a cut-out rig animates.

Every asset goes through a gate, as drawings do now: a vision check against its brief and the art bible, redrawn once if it falls short.

### 4. Animation: a cut-out engine with a camera and light

This replaces the slot layouts and the small set of effects with a real **scene graph**:
- **Layers at depths,** so the camera gets parallax for free.
- **A camera** that drifts, pushes, pans and tilts. It is kept always moving slightly, as the film does, so even a held shot is alive.
- **Rigs:**
  - characters with head, eyes, blink, mouth shapes, brows, arms and hands (the figure kit's rig, grown up);
  - lip movement timed to the voice's own words, which we already have word by word;
  - posture and gestures from the direction.
- **A library of prop actions:** unfurl, write, stamp, shatter, assemble, multiply (one soldier becoming an army), grow, fill, fly in, snap.
- **Transitions:** cut, match cut, whip pan, a push through an object, iris, and a page turn for documents.
- **Motion with principles:** anticipation, overshoot and settle, follow-through, and secondary motion (a coat that swings, water that ripples, snow that falls).
- **The look, as post effects:** colour grade per scene, grain, vignette, light rays, depth blur and soft shadows. This single step would change how every page looks today.

**One renderer drives both the player and the film file.** The same timeline is played live in Easy Read and rendered frame by frame to MP4 for LessonReel. That is either Remotion (React to video) or our own WebGL/PixiJS scene rendered in headless Chromium; the choice is made in step 4 below, after a spike. Remotion is free up to three employees. Above that, automated rendering is about $0.01 a render with a $100 monthly minimum (checked 2026-09).

### 5. A critic that watches

- A vision model looks at key frames of every shot and scores them against the shot's intent:
  - composition;
  - legibility;
  - nothing overlapping or cut off;
  - the right thing shown (a client as a device);
  - on model with the cast.
- Shots that fail go back once.
- On LessonReel, the creator is the final critic: they can redo a shot, swap a metaphor, change a line or the voice, and see only that shot re-rendered.

### 6. Sound

The score already exists. We add sound effects timed to the actions: the scratch of a quill, a crowd, waves, a stamp, chains. They should come from the CC0 libraries already cleared for use ([[sound-sources-licensing]]), since YouTube's Content ID matters for LessonReel.

## Better than the Napoleon film

What a studio can't do and this can:
1. **Accurate by construction.** The source is the only source of facts, maths and diagrams are checked by code, and there is a critic for things drawn wrong.
2. **In sync to the word.** Every change lands on the word that names it; hand animation only gets close.
3. **Any level, any length, in minutes.** The same chapter can be made for a child, a student or a professional.
4. **Every format from one film.** From the scene graph: 16:9 for YouTube, 9:16 Shorts reframed by the camera (not cropped), and a still thumbnail.
5. **Other languages.** Re-voice the film, and the animation re-times itself to the new words.
6. **Interactive in Easy Read.** Pause on a question, jump back one idea, and ask the tutor about the shot on screen.

## Order of work, and how we'll know

| Step | What | We'll know it worked when |
|---|---|---|
| **0. A benchmark** | Three test pieces: the Napoleon story (from a public-domain history text), System Design ch. 15, and a biology page. Measure shots a minute, the share of time the camera moves, shots with a set, on-model consistency, and a side-by-side human rating against the Napoleon film | We have today's scores |
| **1. Look and camera** (the current engine) | A backdrop for every explainer stage; colour grade, grain, vignette and depth blur; a camera that always drifts, pushes on key points and uses shot sizes | Richard sees the difference on the same pages, at almost no extra cost |
| **2. Art bible and designed assets** | House styles; route B and C assets, gated and kept per film; model sheets; sets in layers | The same thing looks the same everywhere, and nothing looks like clip art |
| **3. The director** | Shot lists with sets, framing, metaphors, transitions and text in the world, with code checks | Every shot has a set and a framing; abstract ideas get pictures, not labels |
| **4. The engine and renderer** | Scene graph, rigs, prop actions, transitions, post effects; one timeline to the player and to MP4; 16:9 and 9:16 | A LessonReel film renders to MP4 that looks the same as the player |
| **5. Critic and editor** | Frame critique; in LessonReel, redo a shot, swap a metaphor, re-voice | Fewer fixes per film, measured |
| **6. Sound and languages** | Sound effects on actions; re-voice and re-time | — |

Steps 1–3 improve Easy Read right away. Step 4 is also LessonReel's MP4 export. The costs of B and C assets, per minute of film, are measured in step 0 and step 2, before we commit.

## The name

The product is **LessonReel** for now. In the new app it lives in one module, and nothing else spells it out:
- the display name, the short name and the slug;
- the domain;
- the email sender;
- the logo path;
- the colours.

Everything reads from that module: the page titles, emails, the export's end card, the metadata of rendered files and the app manifest. The server gets the same name from one environment value, so a rename is one change in each app.

## Decisions for Richard

1. **Route for art.** Recommended: B (vector image model) for cast and props, C (raster) for sets, and code for diagrams. It needs a key for the chosen image service. I'd test Recraft, gpt-image and Imagen in step 0 and report cost and quality before choosing.
2. **Renderer.** Recommended: decide after a two-day spike in step 4 between Remotion (faster to build, paid licence) and our own WebGL scene (no licence, more work).
3. **Where to start.** Recommended: steps 0 and 1 first. They're cheap, they improve Easy Read now, and they set the benchmark LessonReel is judged by.

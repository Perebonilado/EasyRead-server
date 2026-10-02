# Studio editorial explainers: research and visual system

*Written for Richard on 2 October 2026. This is the second revision. It is research only: nothing in either repo was changed or committed, and no server was started. I ran one frame-capture benchmark and a few public API queries in the scratchpad.*

**How to read this.** §1 is the short version. §10 lists the decisions I need from you. §7.9 says where every number comes from: *sourced* (with a link), *measured* (by me or our audit, with the method) or *house value* (a starting point to tune on the bench). Everything else is the evidence and the detailed rules behind it.

**What changed in this revision.** A review found that the first version would still produce stiff, programmer-drawn films, with compliance text all over the frame and one formula shared by every episode. The main changes:
- **The art.** Human illustrators draw the object library and code composes it. DeepSeek only sets parameters and layout (§3.0).
- **The render.** Final films render on a GPU worker on Modal, where we already rent GPUs for voice. That allows 3D terrain maps, 3D machine cutaways, real light and motion blur (§3.1, §6).
- **The motion.** Motion is split into an information channel (one cue at a time) and a life channel (smoke, water, lights, traffic) (§3.6).
- **The truth labels.** Two truth registers replace five. One source chip shows for about 3 s, and the full credits go in the description (§3.4).
- **The story.** Story comes first. Research finds the people who felt each idea, and episodes draw on 8 structure archetypes instead of one formula (§3.2, §4).
- **Voice and sound.** The voice is directed, and there is a real sound-design layer (§3.7).
- **Taste and testing.** Look development happens before the build, the maker's taste is in the loop, and the bench can actually show "beats" (§7, §8).
- **Consistency.** The worked examples, timings and phase totals now agree with the rules.

**How it was built.** Four judges scored three designs: a creative director, a standards editor, a principal engineer and a learning scientist. Stage-first won narrowly and is the base, and the must-add ideas from the other two designs are included. This revision then answered 31 critiques, 8 fact checks and 33 gap notes. Where advice conflicted, the stricter truth rule won, and so did the less stiff motion rule.

---

## 1. Summary: the 10 changes that make the biggest difference, in order

| # | Change | What it fixes | Evidence |
|---|---|---|---|
| 1 | **Switch off the code paths that made the bad frames, and audit every frame in CI.** Off: the failed-drawing word card, keyword pills, kit people added to drawings, cloned groups, audience characters and the host. A fallback ladder replaces them. A code frame audit measures subject size, card time, gaps, caption collisions and stand-ins on every scene. | In the Nigeria episode a failed-drawing card is on screen **34.2%** of the time. The jet engine fills **0.7%** of the frame next to "Teen student" and "Mechanic". Both come from fixed code rules. | Our audit ([scene-compose.ts:432](file:///Users/richard/Desktop/easyread-server/src/business/domain/scene-compose.ts), [scene-script.ts:1640, 2643, 3799](file:///Users/richard/Desktop/easyread-server/src/business/domain/scene-script.ts), [scene-figure.ts:3110](file:///Users/richard/Desktop/easyread-server/src/business/domain/scene-figure.ts)) |
| 2 | **Artists draw the library; code composes it.** Commission human-drawn packs of 150–300 parts that carry the rig's named part ids. DeepSeek sets parameters and layout only, and supplies at most about 10% of a frame's linework. | Programmer art is today's quality floor. Lighting it does not make it good. | In Willison's pelican test, DeepSeek V4 Flash drew bicycle wheels with no rims or spokes and frame tubes floating apart ([simonwillison.net](https://simonwillison.net/tags/pelican-riding-a-bicycle/)). Kurzgesagt illustrate about 200 panels per video, with 2–3 illustrators over 8–12 weeks ([making-of](https://www.lingq.com/en/learn-english-online/courses/689474/how-to-make-a-kurzgesagt-video-in-120-4887128/)). |
| 3 | **Render final films on a GPU worker.** That gives tilted 3D terrain maps, glTF machine cutaways with a sweeping section plane, real light, depth of field and motion blur. The CPU path is for previews only. | The flat 2D look came from a missing GPU, not from a creative choice. A 2D code cutaway cannot match the 3D standard for "how it works". | With a GPU, CSS 3D cost about the same as 2D on my benchmark. Without one it cost about 2.5× more, and WebGL failed (§6.1). A Modal T4 costs $0.000164/s ([Modal](https://modal.com/pricing)). Kurzgesagt animate in Cinema 4D as well as After Effects ([making-of](https://www.lingq.com/en/learn-english-online/courses/689474/how-to-make-a-kurzgesagt-video-in-120-4887128/)). Animagraffs publishes a 3D "Inside a Jet Engine" ([animagraffs.com](https://animagraffs.com/)). |
| 4 | **One stage per episode, with many compositions.** The camera lives on a stage: a map, a machine, a chart or a timeline. There are 2–3 sets joined by match cuts. Each zoom level is its own visual world. A floor on new compositions per minute applies. | Ends floating slides and tiny subjects, without sitting on one map for two minutes. | Cleo Abram picks the key visual before writing ([Video Consortium](https://videoconsortium.org/member-resources/episode-8-cleo-abram)). Labels placed on their parts help learning, g = 0.63 ([Schroeder & Cenkci 2018](https://eric.ed.gov/?id=EJ1186641)). |
| 5 | **Story before slides.** For each idea, research lists who won, who lost and who objected, with their own words. Every abstract idea hangs on one of those people or objects. Episodes draw on 8 structure archetypes, and no archetype repeats within 3 episodes. | Fixes the abstract lecture and the shared skeleton that YouTube calls templated. | Story beats essay, g = 0.55 ([Mar et al. 2021](https://doi.org/10.3758/s13423-020-01853-1)). YouTube's policy, clarified on 15 Jul 2025, names "Image slideshows, templated storylines, or scrolling text with minimal or no narrative" ([YouTube](https://support.google.com/youtube/answer/1311392)). |
| 6 | **Real images for every region.** A picture desk runs before the script. Tier C whole prints arrive in Phase B. Open-government sources are added, plus an opt-in paid archive lane and a declared collage register. Face and footage coverage by region becomes a bench metric. | Shows real people and places truthfully, without leaving Africa and Asia with only maps and silhouettes. | Creative Commons' guidance: a ShareAlike photo used as a separate element does not make the larger work ShareAlike ([CC](https://wiki.creativecommons.org/wiki/ShareAlike_interpretation)). |
| 7 | **Two motion channels and real animation craft.** The information channel shows one cue at a time. The life channel (smoke, water, lights, traffic, paper) runs under a saliency cap. Staggers, follow-through, arcs and anticipation are added, and each show has its own motion personality. | Removes "stiff" without becoming noise. | Kurzgesagt say every moving thing on screen is moved by hand ([making-of](https://www.lingq.com/en/learn-english-online/courses/689474/how-to-make-a-kurzgesagt-video-in-120-4887128/)). |
| 8 | **Truth viewers can read, with little text.** Two registers: real and drawn. An "Illustration" tag appears only on drawn real events and places. Power is shown by who holds the pen. One source chip shows for 2.5–3 s, and full credits go in the description. | Stops overclaiming without making the frame look like a terms-of-service page. | CC BY 4.0 §3(a)(2) allows attribution in any reasonable manner for the medium ([legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)). |
| 9 | **A directed voice and a sound-design pass.** The script becomes SAY \| DELIVERY \| SHOW \| SOURCE. Gemini TTS gets styles and pause tags, hero lines get two takes, and makers can record their own voice. Whooshes, risers, impacts, foley and room tone are driven by the event map. | The flat TTS read is the biggest AI tell, and a thin sound layer makes everything feel cheap. | Gemini TTS takes a per-turn style and inline vocal tags ([Google](https://ai.google.dev/gemini-api/docs/speech-generation)). Kurzgesagt add a sound-design layer over original music ([making-of](https://www.lingq.com/en/learn-english-online/courses/689474/how-to-make-a-kurzgesagt-video-in-120-4887128/)). |
| 10 | **Human taste and an honest bench.** Style frames and a 30 s animatic come before the build. The maker picks between alternative keyframes. A table read happens before any picture is built, and a contact sheet before export. The blind bench uses n = 200 per pair and passes only when the lower 95% bound is above 50%. | Turns "beats humans" into a measured claim. Also the best defence against "mass-produced". | TED-Ed do 10–20 script iterations ([TED-Ed](https://blog.ed.ted.com/2022/06/28/how-ted-ed-partnerships-work/)). Power calculation in §7.8. |

---

## 2. What the best channels do

### 2.1 Process and craft (primary sources)

| Channel | What they do | Numbers | What we take |
|---|---|---|---|
| **Kurzgesagt** | Visual metaphors and transitions are decided in a sketch phase. Panels are illustrated in Illustrator and animated in After Effects and Cinema 4D, and they say every moving thing is moved by hand. Original music is composed to the finished video, with a sound-design layer on top. The style is flat, in some cases with 3D. A source sheet ships with each video. | At least 1,200 hours per video. About 200 panels. 2–3 illustrators for 8–12 weeks, then 2–3 animators for 8–10 weeks. 200 panels over a ~10-minute film is a new composition about every 3 s (my calculation). Two videos withdrawn in 2019. ([making-of](https://www.lingq.com/en/learn-english-online/courses/689474/how-to-make-a-kurzgesagt-video-in-120-4887128/); [Wikipedia](https://en.wikipedia.org/wiki/Kurzgesagt)) | Human illustration. Secondary motion everywhere. 3D where it helps. A sound layer. Metaphors sketched before drawing. |
| **Vox** (Caswell, Fong) | Caswell writes each sentence to make viewers look closely at the picture. She calls decorative transitions information-free and prefers jump cuts. Fong held back the black-hole photo until viewers understood why it was hard to take. In the same interview she says she swaps the music track about every 20 s while editing. | One measured *Borders* episode averaged 2.1 s per shot (a single live-action episode). ([School of Motion](https://schoolofmotion.com/blog/estelle-caswell-vox-podcast); [Open Notebook](https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/); [Sobchuk](https://kuchbos.medium.com/jogging-tv-sprinting-youtube-8c00c11f3c36)) | Pointer lines only where something new appears. Cut by default. Payoff after context. Fong's "20 s" describes her editing habit, not a measured cut rate. |
| **Johnny Harris / NewPress** | Valentin Macke built the map styles in Mapbox and GeoLayers. He also built rigs that animate camera moves, sketch borders and tag places, plus Notion boards for type, maps, colour and rigs. Period maps are cut against today's maps. | About 4 months per video. News Emmy for graphic design, May 2026. ([Macke](https://vmacke.com/johnny-harris); [Wikipedia](https://en.wikipedia.org/wiki/Johnny_Harris_(journalist))) | A written style system and map rigs per show. Period maps shown as evidence. We use MapLibre GL JS (BSD-3), the open fork. |
| **Animagraffs** | 3D technical animation. "Inside a Jet Engine" is one of its titles. | ([animagraffs.com](https://animagraffs.com/)) | The bar for "how it works" is 3D. |
| **Cleo Abram** | Finds the key visual first. Scripts in three columns: ears, eyes, sources. Picks the palette for the thesis. | A team of 7 and several hundred hours per episode. ([Video Consortium](https://videoconsortium.org/member-resources/episode-8-cleo-abram); [WaPo](https://wpcreator.washingtonpost.com/p/creator-q-a-cleo-abram)) | A key visual per episode. SAY \| DELIVERY \| SHOW \| SOURCE. |
| **TED-Ed** | Voice first, picture timed to it. A style guide, expression sheet and turnaround for each film. | 10–20 script iterations. ([TED-Ed blog](https://blog.ed.ted.com/2022/06/28/how-ted-ed-partnerships-work/)) | A table read, a per-show bible, and maker iterations. |
| **NYT, WSJ, The Economist** | Evidence shown openly: highlighted documents, satellite before and after. | Economist video team of 16, about 24 h turnaround. ([Reuters Institute](https://reutersinstitute.politics.ox.ac.uk/news/new-york-timess-malachy-browne-future-visual-investigations-age-ai); [WAN-IFRA](https://wan-ifra.org/2024/10/the-economist-launches-ai-translated-videos-to-connect-with-young-audiences-in-multiple-languages/)) | Evidence on screen. Speed is our edge. |
| **3Blue1Brown** | Every frame built in code. A motivating example before the abstraction. | A month or more per video. ([Stanford Daily](https://stanforddaily.com/2020/01/24/3blue1brown-creator-grant-sanderson-15-talks-engaging-with-math-using-stories-and-visuals/)) | Code-drawn work can be top tier when the visual *is* the maths. It is not the bar for objects, machines and places. |
| **Ken Burns** | Treats a photo as a master shot, and every move must reveal something new. | ([Poynter](https://www.poynter.org/reporting-editing/2007/meaning-in-motion-ken-burns-and-his-effect/)) | One word-led move per still, then a hold. |

**What viewers reward.** In 390 science videos from 39 channels, user-made videos were more popular than professional ones. Videos with a consistent communicator were more popular than those without ([Welbourne & Grant 2016](https://doi.org/10.1177/0963662515572068)). That supports a consistent narrator persona (decision 15) and the option for makers to record their own voice.

**Proportions have never been measured publicly.** Nobody has published the share of maps, photos and graphics per channel. Phase 0 measures 10 reference videos with PySceneDetect (BSD-3; [GitHub](https://github.com/Breakthrough/PySceneDetect)), once you approve downloading them for internal analysis (decision 18). Those numbers replace the house values in §3.1 and §7.

### 2.2 Cadence and attention (measured)

- Popular films averaged **4.3 s per shot** in 1990–2015, against 10.5 s in 1930–55 ([Cutting 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5256470/)). That is live action, not builds on one stage.
- In 862 edX videos, most drop-out happened at the very start: 36.6 of the 55.2 points of drop-out fell in the first 3% of length. edX auto-plays, which inflates this ([Kim et al. 2014](https://pg.ucsd.edu/publications/edX-MOOC-in-video-dropouts-peaks_LAS-2014.pdf)). YouTube's own intro measure is the share of viewers still watching at 0:30 ([YouTube Help](https://support.google.com/youtube/answer/9314415)).
- In the same study, 61% of rewatch peaks fell on visual transitions, and 23% were viewers going back to something that left too fast. A finished diagram must stay up long enough to read.
- Khan-style live drawing held viewers 1.5–2× longer than slides, and engagement fell after about 6 minutes ([Guo et al. 2014](https://pg.ucsd.edu/publications/edX-MOOC-video-production-and-engagement_LAS-2014.pdf)).
- YouTube ranks on watch time and satisfaction, not clicks. Its thumbnail test also picks the winner by watch time ([recommendations](https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/); [Test & compare](https://support.google.com/youtube/answer/13861714)).

### 2.3 Learning evidence we design on

| Principle | Effect | Source | Design rule |
|---|---|---|---|
| Words next to the picture part | g = 0.63 (58 comparisons) | [Schroeder & Cenkci 2018](https://eric.ed.gov/?id=EJ1186641) | Labels sit on their parts, never on a separate word card |
| Contiguity, signalling, second-language captions | Largest benefits across 29 reviews; design matters more in system-paced video | [Noetel et al. 2022](https://eric.ed.gov/?id=EJ1338120) | Picture on the word; caption tracks shipped |
| Seductive (irrelevant) details | g = −0.16 (177 effects) | [Cheng et al. 2026](https://eric.ed.gov/?id=EJ1510171) | Nothing in the **information** channel that the line doesn't need. Life-channel motion is capped so it never competes (§3.6). |
| Animation vs static | d = 0.37; representational 0.40; realistic 0.76 | [Höffler & Leutner 2007](https://eric.ed.gov/?id=EJ780451) | Animate real change. Real footage and realistic 3D are worth the effort. |
| Watching a diagram being drawn | Exp 1, full body visible: d = 0.58 for low prior knowledge only (−0.24 for high). Exp 2, hand only: d = 0.35. Exp 3, drawing appears with no hand: d = −0.16, n.s. Exp 4, hand beat full body: d = 0.36. Exp 5, computer-animated draw-on: d = 0.33, n.s. | [Fiorella & Mayer 2016](https://doi.org/10.1037/edu0000065) | **Plain draw-on has not been shown to help.** Use it for style, not as a learning device. A hand insert only as a bench A/B. |
| Faces and text pull the eye | In free viewing, faces drew 16.6× and **text 11.1×** more looking than matched regions | [Cerf et al. 2009](https://doi.org/10.1167/9.12.10) | Show only faces the line is about. Keep stage words ≤8, because text competes almost as hard as faces. |
| Cue along the causal chain | Beats cues on single parts | [Boucheix et al. 2013](https://doi.org/10.1016/j.learninstruc.2012.11.005) | Colour wave on "why" rows; spotlight only for naming |
| Picture before narration | Visuals 7 s ahead of narration did as well as sync. Narration first lost about 30% at one week. | [Baggett 1984](https://doi.org/10.1037/0022-0663.76.3.408) | The picture may lead. Our −1,000 ms limit is a house value, stricter than the evidence. |
| Myth then refutation | d = 0.79 | [Muller et al. 2008](https://doi.org/10.1111/j.1365-2729.2007.00248.x) | Only for misconceptions that a source names. Order from the [Debunking Handbook 2020](https://doi.org/10.17910/b7.1182): fact, warning, myth, fallacy, fact. |
| Story vs essay | g = 0.55 | [Mar et al. 2021](https://doi.org/10.3758/s13423-020-01853-1) | A real protagonist and real stakes |
| Asking for a prediction | Animation alone added nothing; prediction did | [Hegarty et al. 2003](https://doi.org/10.1207/s1532690xci2104_1) | Prediction asked as an open loop paid off within 20 s, not a long silence (§3.2) |
| Uncertainty as draws | Animated hypothetical outcomes beat error bars and violins for comparing two or three quantities | [Hullman et al. 2015](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0142444) | Uncertainty shown as draws beside a static range |
| Enemy and war framing | Enemy framing of cancer lowered intentions for self-limiting prevention without raising monitoring or treatment intentions | [Hauser & Schwarz 2015](https://doi.org/10.1177/0146167214557006) | No war framing on prevention and health-behaviour lines (§3.3) |
| Modern TTS vs human voice | A modern voice engine was rated like a human voice for credibility and for helping learning, and beat an older engine on transfer. This comes from Semantic Scholar's summary; the abstract is closed. | [Craig & Schroeder 2017](https://doi.org/10.1016/j.compedu.2017.07.003) | The voice problem is persona and delivery, not learning (§3.7) |
| Children: pace vs fantasy | Pace: d = −0.12, n.s. (19 studies, ages 1.5–10). Fantasy: d = −0.24 (16 studies, ages **1.5–6**). Both measured as attention and executive function right after viewing, not comprehension. | [Hinten, Scarf & Imuta 2025](https://doi.org/10.1111/desc.70069) | No impossible events shown as fact. The character register is A/B tested for under-7s (§3.5). |
| Photos and belief | Photos make claims feel true even when they prove nothing | [Newman et al. 2012](https://doi.org/10.3758/s13423-012-0292-0) | A photo must show the exact thing claimed |

None of these effect sizes proves we beat human channels. Only the bench (§7.8) can show that.

---

## 3. The visual system

### 3.0 Art direction and the drawn library (new)

**Principle: artists draw the library, and code composes it.** Today every hero object is a code template or a DeepSeek SVG part. Glow, rim light and haze make that look lit, not good. Our size and coverage checks cannot tell a good drawing from a bad one.

**Commissioned packs.**

*Pack 1* is about 150–300 parts for the launch topics:
- **Machines and objects:** a turbofan (2D views that match the 3D model), a container ship and tanker, port cranes, vehicles.
- **Concept objects:** a ledger pair, tank, valve, balance.
- **Civic objects:** a ballot box and ballot paper, a hemicycle, assembly-hall exteriors, a desk with pen, stamp and in-tray.
- **Places and documents:** buildings by era and climate (never region-coded caricature), documents and stamps.
- **Measures:** scale references (a 40-ft container, a bus, a person shown only for scale).
- **Units:** weather and terrain props, and Isotype units.

*Drawing hands.* Start with **two drawing hands**, for example flat-geometric and ink-line. Each further hand is a new pack.

**The file contract.** Code depends on these, so they are non-negotiable:
- SVG with a layered construction per part: `line`, `fill`, `shade` and `accent` groups. Shade is drawn by the artist; it is not a filter.
- Named ids that match the rig contract: `part:<rig>.<name>`, `anchor:<name>`, `pivot:<name>`. The anchor registry and SceneDto stay the same.
- Colours as CSS variables, so each art-direction bible restyles palette, stroke weight and texture without redrawing.
- A node cap per part, and a fixed origin and viewBox per rig.

**Rights.**
- A signed copyright assignment, plus a work-made-for-hire clause where it applies. In the US, a commissioned work is "for hire" only in nine categories, one of which is a part of an audiovisual work, and only with a signed written agreement ([Copyright Office Circular 30](https://www.copyright.gov/circs/circ30.pdf)). A reusable kit may not count as part of one film, so the assignment is the main instrument.
- Outside the US: assignment, plus a moral-rights waiver where the law allows one.
- The artist warrants the work is original and not AI-generated.

**What DeepSeek does now.**
- It sets parameters and layout in slots: which parts appear, counts, positions, and colours from tokens.
- It may draw only small fill-ins. Its share of the frame's ink area is measured with resvg on the composed frame and must stay **≤10%** (house value).
- It never draws hero objects, places, people or evidence.

**The long tail** (an object the kit lacks), in this order:
1. a real photo or clip of it through the picture desk;
2. a commission request to the illustrator (days, not minutes);
3. a small DeepSeek part under the 10% cap;
4. optionally, an image-model bake-off for non-photoreal props (decision 14).

**Art-direction bibles.** There are 12 strongly distinct bibles. Each defines palette, line, texture, a type pair, a motion personality, transitions and a sound palette. All the fonts below are OFL: each family sits in the `ofl/` folder of the [google/fonts repo](https://github.com/google/fonts), checked 2 Oct 2026.

| Bible | Line and texture | Type (display + text) | Motion personality | Transitions | Sound palette |
|---|---|---|---|---|---|
| Lit editorial | 6 px ink, warm paper | Fraunces + Inter | springy, soft | cut, match | piano, strings |
| Blueprint | white and cyan line on deep blue | IBM Plex Sans + IBM Plex Mono | mechanical | push, zoom-through | pulses, machine foley |
| Ligne claire | even black line, flat colour | Literata + Work Sans | springy | cut | woodwinds |
| Swiss | grid, flat, strong type | Archivo + Inter | mechanical | push | dry percussion |
| Risograph | 2–3 spot inks, ±2 px misregistration | Bricolage Grotesque + DM Sans | stepped | cut | lo-fi keys |
| Gouache | painted texture, soft edges | Crimson Pro + Libre Franklin | springy, slow | dissolve | harp, strings |
| Newsprint | halftone, cream plus one spot colour | Playfair Display + Libre Franklin | stepped | cut, push | paper and typewriter foley |
| Isotype | flat pictograms, few colours | Work Sans | mechanical, stepped | count builds | marimba |
| Night neon | dark ground; glow belongs here only | Space Grotesk + IBM Plex Mono | springy | zoom-through | synth |
| Collage | cut paper, tape, halftone photos | Instrument Serif + Inter | stepped | cut | found sound |
| Relief atlas | shaded relief, muted | Source Serif 4 + Atkinson Hyperlegible | mechanical, smooth camera | flights | ambient |
| Picture book (child bands) | rounded, bright | Atkinson Hyperlegible + Bricolage Grotesque | springy, bouncy | push | mallets |

**Fonts and seeds.**
- **Noto** is the fallback only, for scripts the chosen family lacks: Noto Sans Arabic, Devanagari and SC are all in `ofl/`.
- Each show draws a bible plus **seeded variations**: hue rotation within the bible's allowed range, a texture variant, the light direction and a motif.
- The perceptual-hash guard runs across **all Studio channels**, not only the channel's own last 10 films (§4).

**Look development comes first** (Phase 0, §8):
- 6–10 final-quality style frames for the Nigeria, jet and Curie episodes, plus a 30 s animatic.
- Your sign-off.
- A preference test against human frames before anything is built.

### 3.1 Stages: the world the camera lives on

Every episode has **one primary stage** and up to **two more sets**, joined by match cuts, with the stage as the anchor. Everything else is a **window** that opens from an exact anchor on the stage and returns to it.

| Stage kind | Used for | Built from | Render path |
|---|---|---|---|
| **ATLAS** | history, politics, geography, trade, migration, news | Natural Earth admin-0/1, groups, seams and pins (exist). **Period-map lane** for history (below). Each zoom level is a different visual world: globe → relief → satellite → street photo. | CPU: flat. GPU: tilted 3D terrain from [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (`elevation-tiles-prod`). Its sources (SRTM, 3DEP, GMTED2010 and ETOPO1) are public domain with set attribution lines ([joerd attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)). Rendered with MapLibre GL JS (BSD-3, [GitHub](https://github.com/maplibre/maplibre-gl-js)) under our own drape. |
| **CUTAWAY** | how things work, engineering, biology | A rig `{parts[id,name,anchor3d,anchor2d], flows, states, run}`. **3D glTF model** with the same part ids, plus an illustrator-drawn 2D twin. | GPU: three.js. A **section plane sweeps through the model** (material clipping planes), labels are pinned to 3D anchors projected each frame, and orbit plus cuts replace the 2D push. The 2D twin is used for CPU previews, simplified 9:16 panels and the thumbnail poster. |
| **PLOT WORLD** | economics, health, climate data | Persistent axes from scene-chart/plot (exist); linear axes; a doubling ruler | Either |
| **TIMELINE** | biography, history of an idea | scene-timeline (exists), in the narration language's reading direction | Either |
| **FLOWS** | debt, CO2, supply chains, networks | Tank, valve, node graph and loop from Pack 1; levels integrated by code | Either |
| **SCALE PLATE** | size, space, the microscopic | Scale bar, powers-of-ten zoom, public-domain NASA mosaics | GPU for planets |
| **ARCHIVE WALL** | biography, law, investigations | Pinned prints. The collage register is allowed when declared (§3.4). A link line appears only when the voice states that relation. | Either |
| **STUDY / TEXT** (new fallback) | psychology, philosophy, language | The real artefact is the stage. For psychology: the experiment's set-up redrawn from the paper's method, with the paper's own figure as evidence. For philosophy: the original text, and a thought experiment drawn in the drawn register with the voice saying "imagine". For language: real writing systems and words on a map of where they are spoken. | Either |

"Literal first" on the STUDY/TEXT stage means the real experiment, the real text and the real speakers' words, before any metaphor.

**The period-map lane** (history on today's borders is wrong). Natural Earth's Nigeria leaves out the Southern Cameroons. Wikipedia says it was represented in the Eastern House from 1951 and became autonomous in 1954 ([Wikipedia](https://en.wikipedia.org/wiki/Southern_Cameroons)), so a 1946 Eastern Region drawn on today's map has the wrong shape. The lane works like this:
1. Georeference **public-domain period maps**: US federal maps, and Commons maps whose US public-domain reason passes the desk.
2. Trace each one once into a curated historical layer that carries its source, and credit it in the description.
3. Or show the period map itself as evidence, then cut to today's map, as NewPress does.

*Datasets ruled out as geometry:*
- **CShapes 2.0** (1886–2019) is CC BY-NC-SA 4.0, so commercial use is barred ([ETH](https://icr.ethz.ch/data/cshapes/)).
- **historical-basemaps** is GPL-3.0. Its `BORDERPRECISION` runs from 1 (approximate) to 3 (set by international law), and its authors ask users to verify it against other sources ([GitHub](https://github.com/aourednik/historical-basemaps)). Use it as a pointer only.

*Terrain detail:* Terrain Tiles replace Natural Earth rasters below country level.

**How a stage is picked.** Code scores affinities from the research log:
- geocodable places → atlas;
- mechanism words plus "how experts draw this" → cutaway;
- number series → plot;
- 5 or more dated events → timeline;
- none of these → STUDY/TEXT.

GPT-5.4 mini then picks the primary stage, up to 2 sets and the key visual from closed lists. Code checks that each can be built; if one can't, it takes the next stage by score.

**StageCarry and continuity.**
- Placed things move only when the narration says they change.
- Old states recede to 35–50% opacity after 2 changes.
- **Every episode cold-opens self-contained within 5 s.** Recommended viewers often arrive cold. Opening on the last episode's framing is a reward for returning viewers, never a dependency.
- A "last time" line is optional and never needed to follow the episode.

**Composition novelty** (against monotony).
- Code measures keyframe perceptual-hash distance and counts new compositions per minute.
- Kurzgesagt's ~200 panels per ~10 min works out to about 20 a minute (my calculation).
- Until Phase 0 measures the references, the floor is **≥8 new compositions per minute** (house value). No single framing holds for more than 20 s, except a declared atmosphere hold.

**Camera.**
- The camera is a box in stage coordinates. Code computes it from anchor boxes plus 12% padding; the model never gives coordinates.
- **Subject floor:**
  - 16:9: the named subject fills ≥35% of the frame alone, or ≥18% each in a comparison (house values).
  - 9:16: the hero is **≥50% of full-frame height**, measured on the full 1080×1920 frame.
- In 2D, a single push is at most 2×. Deeper than that, the camera zooms through and the map is redrawn at the next level.
- **Cuts between framings of one stage are the default.** Long flights are kept for 2–3 journeys per episode.
- On the GPU path, a CUTAWAY may orbit (rotation about the model). 2D camera roll stays banned.
- While a document is read, the camera may drift up to 2% in scale. It pans only to follow the highlighted line.

**Windows** open from a pin, part or date and return within 3 rows or 20 s. Starting targets (house values, to be replaced by Phase 0 measurement):
- the stage carries the focal subject for ≥40% of runtime;
- windows take ≤50%;
- about a third of the picture is people and places (portraits, footage, place photos, human-scale scenes), as plan §6c asks.

**Key visual.** Chosen from the idea map before the script. It gets 2–3× the event budget and 5 compiled candidates, which the maker picks from (§4). It is the source of the thumbnail concept and the Shorts cut-down.

**Light and depth.**
- **GPU path:** real lights in 3D scenes. Depth of field only on establishing and orbit shots, never on text or evidence. Motion blur by averaging 4–8 sub-frames on fast moves.
- **2D path:** light comes from the artist's shade layer. Generic glow, rim and haze filters are **not** laid over programmer art. Atmospheric depth is used only where a bible calls for it (gouache, relief atlas).
- Contrast checks read the rendered pixels under each label.

### 3.2 Shot grammar

**The script row** is `SAY | DELIVERY | SHOW | SOURCE`.
- DELIVERY is set out in §3.7.
- SHOW is a list of verb clauses: `VERB target on "exact words"`. Targets must exist in the anchor registry or the evidence inventory, and code rejects anything else.

**The closed verb list.** Kept small, because a mini model misuses big lists.

| Group | Verbs (default duration) |
|---|---|
| Camera | ESTABLISH; TRAVEL (300 ms + 600 ms × distance / frame width, clamped 0.4–1.2 s; flights 2–4 s); PUSH; PULL; FOLLOW; CUT-TO; ZOOM-THROUGH (push 1,200 ms, overlap 350 ms); ORBIT (3D only, ≤30° per 2 s); RETURN |
| Build | DRAW (300–800 ms per stroke group); LABEL (250 ms); PIN (350 ms); FILL (500–700 ms); SEAM (0.7–1.2 s); SECTION (3D section sweep, 2–4 s) |
| Change | COUNT (1–2 s); GROW (0.7–1.0 s); TRANSFER (0.6–0.9 s per token); MORPH (same entity id only, 0.8–1.2 s); RUN (last, after the parts are named); STRIKE |
| Attention | FLOW (a colour wave along the causal path, 1.5–4 s; the default on "why" rows); SPOTLIGHT (others dim to 40% over 400–600 ms; for naming only); MARK (300–500 ms) |
| Windows | OPEN-PHOTO, OPEN-PORTRAIT, OPEN-DOCUMENT, OPEN-FOOTAGE, OPEN-METAPHOR, OPEN-SCENE, BURST |
| Rests | HOLD (2–10 s, with the life channel running), ASK (below) |

**Three kinds of motion.** These definitions make the timing bars testable:
- **Information event:** a change that puts a new fact on screen (a new object, label, number, state, or framing of a new subject). Each has one anchor phrase. Only these count toward gaps and cadence.
- **Sub-step:** part of the same event, starting within 600 ms of it and naming nothing new. Examples: the camera settling, the label of the thing just drawn, a staggered child, the counter riding on a growing line.
- **Life motion:** the life channel (§3.6). It never counts, but it is capped.

**Defaults by row kind.**

| Line is about | Default |
|---|---|
| a place | CUT-TO or TRAVEL to the area, then PIN or FILL |
| when | TRAVEL along the timeline plus PIN, or a calendar chip on the current stage |
| how many | COUNT, GROW or an icon array with the full denominator |
| who | OPEN-PORTRAIT, else the traces ladder (§3.5), then RETURN |
| why | FLOW along the causal chain; TRANSFER or RUN only when a causal claim exists |
| comparison | an aligned twin on a shared axis |
| exact words | OPEN-DOCUMENT with a highlight on a real scan, or a quote card with speaker and date |
| a feeling | the feeling ladder (§3.5): real photo or clip first, then artefacts at human scale, then far, counted silhouettes |

**Timing.** All of these are house values to tune on the bench.
- **Sync.** The settled pose may lead its anchor word by up to about 1 s within the same clause, and lag by no more than +100 ms. The default target is −150 to −50 ms. Today an entrance settles about 320 ms late (LEAD_MS 200 + ENTER_MS 520), and that is duplicated across [timeline.ts](file:///Users/richard/Desktop/easyread/src/lib/scene/timeline.ts), [scene-reading.ts](file:///Users/richard/Desktop/easyread-server/src/business/domain/scene-reading.ts), [scene-film.ts](file:///Users/richard/Desktop/easyread-server/src/business/domain/scene-film.ts) and [scene-timing.ts](file:///Users/richard/Desktop/easyread-server/src/business/domain/scene-timing.ts). These become one shared token table.
- **Readable dwell.** A new label, number or print stays up for at least max(1.5 s, 0.35 s × words + 0.5 s).
- **Minimum gap.** Information events are ≥1.2 s apart (1.5 s in child bands).
- **Cadence by passage type**, declared per act in a tempo map:
  - **open** (the first 15–30 s): median gap 1.5–2.5 s;
  - **explain:** median gap 2.5–4 s over the act. A single row may run faster as long as the act median holds;
  - **atmosphere:** holds of 2–10 s with the life channel running;
  - **burst:** 3–7 real items at 0.6–1.2 s each under one combined credit, at most 1 per 90 s.
- **No gap over 6 s** outside a declared HOLD.
- **One cue at a time.** At most 1 attention cue, and at most 2 moving things in the information channel. The life channel has no count limit, under its cap.
- **ASK.**
  - The question is voiced over an unresolved state. Then a silent beat of **≤1.5 s**, with the life channel running and a soft sound cue.
  - For a real prediction, the ASK becomes an **open loop**: the voice keeps building the set-up, and the answer lands **within 20 s**.
  - A prediction ASK must sit at least 20 s before the end of the episode.
  - An episode-final question is allowed only as a declared **cliffhanger**. The episode must already have answered its own main question, and the next episode answers the cliffhanger in its first 20 s while still cold-opening self-contained.
- **Causal launch.** It starts on the contact frame (0 ms). Launching already feels weaker at 33 ms ([White 2025](https://europepmc.org/article/PMC/PMC12434928)). Events that are not causal are separated by a cut or a visible gap.

**Joins** (closed list, existing HANDLES):

| Join | Use |
|---|---|
| continue | the same stage, inside an episode |
| cut | the default between unrelated shots and between framings |
| match | silhouette overlap (IoU) ≥0.6, or declared metaphor counterparts; also between sets and from an evidence print into a 3D model |
| morph | the same entity id |
| zoom-through | stage anchor to or from a window, and between zoom-level worlds |
| dissolve | time passing, or concreteness fading, ≤1 s |
| dip to black | act end, or after a grave fact |
| push | items of a list |

Iris wipes and decorative wipes are not used.

**Opening rule** (one rule, replacing the two that conflicted).
- Frame 0 is content from the episode's archetype, already moving: the stage, an evidence window, or a literal drawn moment from the kit (tagged "Illustration" if it depicts a real event or place).
- No logo, title card or show ident in the first 5 s.
- A show ident of ≤2 s may sit at the first act break, after 20 s.
- The end card (plan Stage 9) lives in the last ≤20 s, in the end-screen zones.
- The first change comes by 1.5 s, and the thumbnail's subject is on screen by 10 s.

**Structure archetypes** (replacing one mandatory formula). YouTube refuses to monetise channels whose videos look made from a template or feel interchangeable ([policy](https://support.google.com/youtube/answer/1311392)).

| Archetype | Opens on | Spine |
|---|---|---|
| Cold-open scene | a real moment: a person, place or object in motion | what led here, and what came next |
| Mystery | an anomaly | clues in order, then the reveal |
| Countdown | a deadline or count | stakes rising toward it |
| Journey | a route on the stage | stops along it |
| Investigation | a document or image | how we know, step by step |
| Myth-first | a cited misconception | correction, then the real mechanism |
| Number-first | one sourced number | why it is that size |
| Quote-first | a person's own words | the world that produced them |

- **Channel guard:** no archetype twice in 3 episodes of a channel.
- **Beat targets, not mandates** (house values): the question by about 15 s, a wow change by about 30 s, a re-hook about every 120 s.
- Acts end on a hold, a question or a cut on action, chosen to vary.
- One awe beat per episode is **optional**.
- A refutation beat is **optional**, and only for a misconception that a cited source names as a misconception.
- **Child bands** add YouTube's quality principles as lints ([YouTube](https://support.google.com/youtube/answer/10774223)):
  - a complete, unjumbled narrative;
  - one "how do we know?" beat for critical thinking;
  - more than one kind of person or place where the topic allows;
  - no clickbait or keyword-stuffed titles;
  - an expert sign-off against fake education.

### 3.3 Metaphors

**Rules.**

1. **Literal first.**
   - If the subject has a visible form (a place, person, machine, document or event), draw it literally.
   - If it is a quantity, use a data form.
   - Only an invisible relation gets a metaphor.
   - Never a word card.

2. **Idea map before the script.** Each episode lists 2–4 load-bearing ideas *from the research*, each tagged with one relation:
   - transfer, accumulate, balance, gate, compress, recognise, create, compound;
   - feedback, scale, rank, probability, cause-chain, bottleneck, select, convert.

   Each idea also gets its **protagonist** (§4): the person or object it hangs on.

3. **Relation match.** A catalog entry is allowed only if it maps the relation the row asserts.

4. **Two classes.**
   - **Light** (tokens, units, paths, containers, particles, scale references) needs only a one-word legend chip.
   - **Strong** (tank, balance, valve, lock and key, ledger, loop, doubling grid, scissors) follows the lifecycle in rule 5.
   - Limits: ≤3 strong per episode, ≤1 new per scene, and one anchor motif reused 2–4 times.

5. **Lifecycle, varied.**
   - The first use of a strong metaphor is shown with the real thing, staged as one of: side by side, docked on the stage, a to-scale overlay, a split, or a callback. The staging rotates; don't repeat it twice in a row.
   - When the mapping is not obvious, the pair shares ≥2 cues (colour, scale, axis, motion direction, framing), and the voice says "like" after the comparison is shown ([Alfieri et al. 2013](https://doi.org/10.1080/00461520.2013.775712)).
   - Keep "like" for at least 2 uses ([Bowdle & Gentner 2005](https://groups.psych.northwestern.edu/gentner/papers/BowdleGentner05.pdf)).
   - A **"where it breaks" line only when research holds a matching misconception.** Example: the household analogy for government debt carries one, because the misconception is documented.
   - Then return to the literal stage.

6. **Data-true physics.**
   - Token counts are conserved unless the contract says "create".
   - Tank level = ∫(in − out).
   - A balance tilts by computed torque.
   - Pressure is shown as particle **density**, never particle size.
   - Unit count = round(value / unit).
   - Each number needs a claim id and a unit check. **An object with no sourced numbers shows no axis, count or scale cue**, so it cannot be read as measured. It needs no caption. When something *is* to scale, the voice says so.

7. **Motion encodes the claim.**
   - "After" never draws a launch.
   - Created money appears from nothing.
   - A cited myth is shown once, small and grey, then struck.

8. **Agency.** Self-starting motion and faces are for real agents (people, and institutions acting through their document, seal or building), plus the **character register** for children (§3.5). Narration lint: intention verbs on non-agents ("the virus wants") are flagged for adult science, and allowed for children only inside a "like" frame.

9. **Global sources.**
   - Whitelist of sources people everywhere know: the body, water, containers, paths, weight, light, food, doors and locks, seeds and growth.
   - Lint for culture-bound sources: specific sports, household appliances, national institutions, and US-only units.

10. **Bans.**
    - **War and enemy framing on prevention and health-behaviour lines.** Enemy framing lowered self-limiting prevention intentions without raising others ([Hauser & Schwarz 2015](https://doi.org/10.1177/0146167214557006)). This is narrower than a blanket ban: plain mechanism verbs such as "neutralise" or "destroy infected cells" are fine where accurate. Kurzgesagt use defence imagery for immune mechanisms; our line is drawn at framing prevention and people as war.
    - Flood, swarm or beast for people.
    - Ladders for evolution; never morph one species into another.
    - Money printers (unless the line is literally about banknotes), gavels, owls, hand gestures, and religious symbols standing for peoples.
    - Judgement colours for sides; Mercator for size comparisons.
    - On contested history: light objects only, and no clocks, races or ladders.

11. **Children's bands.**
    - Relational metaphors appear in a framed inset whose source also looks like the target, with the mapping said aloud ([Gentner 1988](https://doi.org/10.2307/1130388)).
    - No impossible events shown as fact ([Hinten 2025](https://doi.org/10.1111/desc.70069)).

12. **9:16:** a vertically structured pair is re-laid side by side ([Matlen et al. 2020](https://doi.org/10.1037/xhp0000726)).

13. Every metaphor goes on the sensitivity sheet.

**Catalog (launch set; literal option first).** All hero objects are drawn by the illustrator (Pack 1). Code supplies the physics.

| Abstract concept | Literal first | Metaphor (class) | Animation | Invariant / risk |
|---|---|---|---|---|
| Who decides (advisory vs binding power) | **The mechanics of power:** a recommendation travels from the assembly to the official's desk and stops at the in-tray (the gate). The pen or stamp in the official's hand makes the decision. | — | Later rows move the pen to the assembly only as far as sourced powers allow | Strength is shown by where things stop, not by stroke style. Use the real document scan if the desk clears one. |
| Power moving between levels | The pen or stamp changes hands on the stage; regions fill as the voice names powers | Tokens (light) | Tokens arc from the real actor's document on the contact frame | Only with a causal claim of transfer. Never zero-sum by default. |
| Negotiation | Plan-view table | Overlapping range bars (light) | The overlap lights up as the deal zone | Tug-of-war only if research says zero-sum |
| Inflation | A basket of globally common items with an index | — | COUNT 100 → 102 | No money printer |
| Debt | Ratio bar with the denominator | Tank (strong) | Inflow, outflow and interest; level integrated | The household analogy carries a break line (documented misconception) |
| Compounding | Plot world plus doubling ruler | Coins earning coins (strong) | Interest-on-interest in a second shade | Linear axis; the value is computed in code |
| Banks creating money | Bank ledger, both sides | Ledger pair (strong) | Both entries change on the same frame | Never coins from a vault (relation = create) |
| Supply and demand | Two curves | Marshall's scissors (strong) | Blades cut, then fade into the curves | A curve shift is animated differently from a move along the curve |
| Risk | Icon array of 100 or 1,000 | — | Affected units fill | Full denominator always drawn ([Galesic 2009](https://pure.mpg.de/view/item_2099767)) |
| Uncertainty | Static range plus draws | Hypothetical outcomes (light) | One outcome per 400 ms beside the range ([Hullman 2015](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0142444)) | Never a lone widening cone ([Ruginski 2016](http://space.ucmerced.edu/Downloads/publications/Ruginskietal_2016.pdf)) |
| Exponential growth | Linear plot plus doubling ruler | Doubling grid (strong) | One doubling per beat; S-curve when limits apply | No log axes for general audiences ([Romano 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7461444/)) |
| Feedback | — | Loop (strong) | A token grows or shrinks each lap | A +/− label is required |
| Network effects | Node graph | — | Links = n(n−1)/2 | Never claim value = n² |
| Huge or tiny scale | A concrete scale from a global list | Transpose overlay | Repeated identical units; voice says "to scale" | Multiplier within 10% of ½, 1, 2, 5 or 10 ([Riederer 2018](https://www.dangoldstein.com/papers/Riederer_Hofman_Goldstein_Perspective_Analogies_CHI_2018.pdf)) |
| Deep time | Timeline with axis breaks | Calendar compression (light) | One year = the whole span | Year labels always shown |
| Causation | Linked stages | Chain (light) | FLOW along the chain | Branches whenever research lists more than one cause |
| Trade-off | — | Balance (strong) | Tilt from computed torque | Use only where research frames it as two-sided |
| Rights and law | The real document, clause highlighted | Container (light) | Highlight on the spoken words | No gavels |
| Energy | Coloured units by form | — | Total counter constant on every frame | Asserted in code |
| Pressure and heat | Particles in a container | — | Density from data; speed ∝ √T | Particles never grow when heated |
| Flows | Pipes, Sankey; width ∝ rate | — | Particle flow | Total in = total out unless a stock is drawn |
| Evolution / selection | Branching bush | Generations filter (strong) | Varied units pass a filter | Never a ladder |
| Immune recognition | **Named parts:** antigen, B cell, B-cell receptor, Y-shaped antibody, memory cell. Antibodies are protein chains whose tips recognise antigens ([NHGRI](https://www.genome.gov/genetics-glossary/Antibody)). | Lock and key (children, inset) | A fit eased over 400 ms, never a snap; the time course in days on a rail | The host-cell receptors a virus uses to get in (for example ACE2) are never drawn as immune memory |
| Outbreak spread | Map plus counts | Fire spread (light) | Spread along links | No "plague" or "swarm" for people |
| Inequality | A ranked line-up of 100 units | — | By count, never area | Source measure and year shown |
| Groups | Isotype units | — | Counts from data | Never coloured by skin |
| Borders | The literal map, disputed lines dashed | — | SEAM | Worldview policy (§3.4) |
| Elections | Hemicycle plus a separate vote bar | — | 20–40 seats/s | Never an area map alone for votes |

### 3.4 Real images and moving footage

**Role.** A real image is **evidence**: it shows the exact entity, place and date the line names. A real photo is never a metaphor or a look-alike stand-in. When nothing passes the desk, the stage or the drawn kit carries the row.

**Two registers viewers can learn** (replacing five):

| Register | What it covers | How it looks |
|---|---|---|
| **Real** | Photo, footage, document, satellite scene | A print frame (3–5% border, baked shadow), **or** full-bleed for footage and satellite, with the source chip on entry. Evidence moments (document highlights, satellite proof) stay untreated. |
| **Drawn** | Everything else | The show's bible style. An **"Illustration" tag** (28–32 px) appears only when a drawing depicts a specific real event or place. **Dashes** are used only for projections and hypotheticals, and the voice says so ("if", "by 2050", "imagine"). |

The hatch and the separate data and model registers are dropped. Claim strength is shown by mechanics (§3.3), and "approximate" by drawing soft edges plus one spoken clause, not by a caption.

**One source-chip slot.**
- It shows for **2.5–3 s** when a real image first appears, and again if the image returns after more than 60 s.
- Format: `Place, capture year · Creator / archive · Licence`, at 28–32 px on a scrim with ≥4.5:1 contrast, away from faces and captions.
- If a second chip arrives, the first is cut to no less than 1.5 s.
- Chips are only for the real register. Drawn maps traced from a period map are credited in the description.
- **Full TASL credits** go in the description, on the end card and in the cue sheet. TASL is Title, Author, Source, Licence, the format CC recommends; for audio and video, CC shows credits in the recording and in the description text as good practice ([CC](https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution)).
- Computed values (for example 1.02^35 = 2.00) go in the description only.
- The **Copernicus notice** goes in the chip and the description, after a legal check that this satisfies the notice. EU law allows reproduction, adaptation, modification and combination. The notice reads `Contains modified Copernicus Sentinel data [Year]` when the data was adapted, and `Copernicus Sentinel data [Year]` when it was not ([legal notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice)).

**What Philpot v. IJR actually decided** (4th Cir., 6 Feb 2024).
- The photographer had put his photo on Wikimedia Commons under a CC licence that asked for a specific credit line.
- A news site used it without the required attribution. The court held that this was **not fair use**, and reversed and remanded ([opinion](https://www.ca4.uscourts.gov/opinions/212021.P.pdf)).
- So the credit must be there, and when a file page names a credit string, code uses that string. The case does not say where on screen the credit must sit.

**The picture desk** runs after research and before the script, so the writer gets a **closed evidence inventory**.
1. Research stores a Wikidata QID for every person, place, event and object. People are resolved only by QID.
2. Retrieval is serial and polite, in this order:
   - Wikidata P18/P41/P242;
   - Commons `haswbstatement:P180=QID`, plus categories (depicts covers only part of the files; see §7.9);
   - institutional APIs.
3. Licence tier and provenance screen.
4. Verification.
5. Scoring.
6. Cache by sha1 with a licence snapshot.
7. Each entry carries its id, allowed treatments, focal boxes for **both** 16:9 and 9:16, credit and source URL.

**Source whitelist.**

| Source | Good for | Notes |
|---|---|---|
| Wikimedia Commons + Wikidata | People, places, events, documents | No key; concurrency 1, under 5 req/s ([robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)). Licence from P275/P6216 plus LicenseShortName; reject when they disagree. |
| NASA Image and Video Library | Space, aero, Earth; **video** | Reject third-party credits. Never imply endorsement ([NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/)). |
| NARA Catalog v2 | US federal photos and **film** | Free key, 10,000 queries/month; only `useRestriction.status = Unrestricted` ([NARA](https://www.archives.gov/research/catalog/help/api)) |
| **VOA** (new) | World news photos and video, including Africa and Asia | VOA's own material is public domain, credited to VOA. Items licensed from AFP, AP and Reuters are excluded ([VOA terms](https://www.voanews.com/p/5338.html)). |
| **DVIDS** (new) | US military stills and video, worldwide | Works by US government staff carry no US copyright. Third-party items are excluded. A no-endorsement disclaimer goes in the description ([DVIDS](https://www.dvidshub.net/about/copyright)). |
| **US government Flickr accounts via Commons** (new) | Embassy and agency photos worldwide | Same Commons checks |
| **Kremlin.ru, Agência Brasil** (new) | Official events | Reported as CC BY 4.0 and CC BY 3.0 BR. **Their licence pages didn't load for me; verify before enabling.** |
| Library of Congress, Chronicling America | Historic photos and maps; US newspapers 1690–1963 with OCR | Through Commons copies; OCR used for exact quotes |
| Smithsonian Open Access | Objects, for example the RB211-22 cutaway (CC0) | Check per-media `usage == CC0` |
| The Met (v1.1), Rijksmuseum, Europeana, Wellcome | Art, objects, medical history | Europeana: filter by exact rights URIs |
| **Copernicus Sentinel-2** | Recent images of any place, 10 m pixels | [Earth Search STAC](https://earth-search.aws.element84.com/v1), no key. Not ShareAlike. |
| Landsat, NASA Blue/Black Marble, Terrain Tiles | Terrain, night lights, relief, 3D DEM | Public domain, with set attribution lines |
| Prelinger (Internet Archive) | Mid-century films | Only items with an explicit public-domain or CC0 licence field (§7.9) |
| Openverse | Discovery only | Re-check every licence at the source ([terms](https://docs.openverse.org/terms_of_service.html)) |

**Stock and paid sources: the reason for each.**

| Source | Decision | Reason |
|---|---|---|
| Unsplash, Pexels, Pixabay (images) | **Not as evidence** | They show generic look-alikes, not the exact entity. Their metadata lacks capture place, date and QID. Unsplash bars compiling its images to replicate a similar service ([licence](https://unsplash.com/license)), a risk for a platform caching them for many makers. Pexels bars showing identifiable people in a bad light ([licence](https://www.pexels.com/license/)), a risk on hard topics. Textures come from CC0 libraries instead. Pixabay *sounds* stay allowed under your earlier conditions. |
| Getty, AP Archive, Reuters, British Pathé | **Opt-in paid lane for hero moments** | Quoted per clip. The licence record is stored with the cue sheet. Off by default; the maker opts in and pays (decision 17). |
| Google Custom Search | Excluded | Closed to new customers; ends 1 Jan 2027 ([Google](https://developers.google.com/custom-search/v1/overview)) |
| Direct Flickr API | Excluded | Its terms require removal on request, which an exported MP4 can't honour |
| UK National Archives credits, EOxCloudless, Google Earth Studio | Excluded | Non-commercial, or need a commercial agreement |
| Any AI-generated photoreal image | Excluded | Truth rule |

**Licence tiers.** The SceneDto validator enforces what each tier allows.

| Tier | Licences | Allowed |
|---|---|---|
| A | Public domain with a US-valid reason, CC0, PDM, US federal works, museum CC0 | Crop, levels, grayscale, camera moves, collage cut-out |
| B | **CC BY 4.0** preferred; CC BY 2.0/3.0, OGL-UK v3, GODL-India, Copernicus | The same, with "modified: cropped" in the credit. **CC BY 2.0/3.0 get stricter checks:** only from institutional uploaders or with a verified author, and the named credit string used verbatim. Unlike 4.0 §6(b), which restores rights if a breach is fixed within 30 days of discovery ([legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)), they have no cure period. |
| **C (Phase B, after a short legal read)** | CC BY-SA, FAL | The print is shown **whole and unmodified as an object on the stage**. The camera moves over the stage, and the print is never cropped, graded or cut out. Annotations sit outside its rectangle. Never used in thumbnails. |
| Rejected | NC, ND, GFDL-only, InC, unknown | — |

Why tier C moves forward: without it, modern Global South places are nearly empty. Kano market had 4 open files against 87 ShareAlike ones (§7.9 on how that was measured). Meanwhile NARA, LoC, NASA and Prelinger give US topics plenty of real faces and footage. That bias comes from licensing and contradicts "global, not regional". **Face and footage coverage by region is reported on the bench** (§7.8).

**Provenance screen.** Reject or flag a file when:
- its credit or description mentions a screenshot, YouTube, AP, Reuters, Getty, AFP, Drum or Magnum. Example: Azikiwe's Wikidata image is tagged "own work" but described as an AP Archive screenshot;
- it is tagged "own work" but shows a subject from before 1970;
- it has a PD-country tag with no US reason;
- it is a NASA or DVIDS item credited to a third party;
- its Restrictions field shows personality, trademark or insignia;
- it carries a deletion, copyvio or "license review" template, or a watermark;
- **(new) it fails a reverse-image check.** Any file not from an institutional API goes through TinEye's API (bundle pricing; price not confirmed, [TinEye](https://services.tineye.com/TinEyeAPI)), and is flagged when an earlier copy exists on a news or agency domain;
- **(new) its C2PA Content Credentials** declare generative AI.

**Automated verification** (no vision model).

| Check | Rule |
|---|---|
| Entity | ≥2 independent metadata fields agree with the row's QID, place and date |
| Date | Capture, publication and upload dates stored separately; only capture date passes. Event: same day or year. Era: ±5 years. Portrait: any date, with the true year shown. |
| Consistency | Text-only GPT-5.4 mini check of the metadata against the row; "unsure" means reject |
| Generic vs specific | A specific image standing for a generic noun is named on screen (for example "Example: SARS-CoV-2"). False or enhanced colour is stated. |
| Depicts the anchor | The image shows what its anchor word names |
| Quotes | A spoken quote string-matches the OCR or transcription 100% after normalisation |
| Resolution | Full-bleed only at ≥1920 px on the filling axis; never above 1.25× native (1.0× for anything to be read); otherwise a framed print |
| Living public figures | A human approval click before export |
| Export gate | Re-fetch licence and deletion status; watch weekly for 90 days after publishing |

**Image scoring** (house weights).

`score = 0.25·res + 0.20·crop + 0.15·quality + 0.15·face + 0.10·era + 0.10·tier + 0.05·sourceRank`

- `res` = min(1, pixels on the filling axis ÷ 1920).
- `crop` = 1 if the focal box fits **both** the 16:9 and the 9:16 crop; 0.5 if only one fits.
- `quality`: Commons Featured 1.0, Quality 0.8, Valued 0.6, none 0.3.
- `face`: YuNet face height ÷ image height, scaled so that 0.3 or more = 1 (portraits only).
- `era`: 1 for same year, falling to 0 at ±5 years.
- `tier`: A 1.0, B 0.8, C 0.5.
- `sourceRank`: institutional 1.0, crowd 0.6.
- A detected watermark means reject.
- Keep the top 1–3.
- Tier C prints must reach **≥1,000 px on their long side on screen** in both shapes.

**Treatments.**
- **Evidence:** crop (tiers A/B), levels, grayscale for mono originals. Nothing else.
- **Never:** colourise, AI-upscale, face-restore, flip, add, remove or rearrange content, or generative fill, in line with World Press Photo's manipulation rules ([WPP](https://www.worldpressphoto.org/contest/2025/verification-process/what-counts-as-manipulation)).
- **Declared collage register** (new), for non-evidence moments, tiers A and B only:
  - a person or object cut out from its background with its pixels unaltered;
  - scanned paper and tape textures from CC0 libraries ([Poly Haven](https://polyhaven.com/license), [ambientCG](https://docs.ambientcg.com/license/), both CC0 and allowed for commercial work);
  - halftone and duotone.

  The register is visible on screen (torn paper edges, tape), so nobody reads it as untouched evidence.

**Animation of stills.**
- One word-led move per still. Focal boxes come from YuNet (MIT) for faces and OCR/ALTO boxes for text.
- A photo window lasts 2.5–6 s, with 3–12% scale change, pan ≤3% of frame width per second, and settles before the named word. Faces are held ≥1.5 s.
- **Document reveal:**
  - push to the quoted line;
  - dim the rest to 35–50%;
  - highlighter at 0.4–0.8 s per line, in step with the words;
  - an illegible scan becomes a clean quote card that names its source, never styled as a facsimile.
- **Concreteness fading:** from a real print into a drawing **of the same configuration** only.

**Moving footage windows.**
- Clips of 2–5 s from NASA video, NARA, VOA, DVIDS, explicitly public-domain Prelinger items and Commons video.
- The same QID, date, licence and provenance checks as stills.
- True speed, muted original audio, and the chip on entry.
- ffmpeg trims clips to frame sequences for the export.
- Keep a dispute packet, because resellers register public-domain footage in Content ID.

**The satellite lane.**
- Sentinel-2 is used only for features of **2 km or more**: deltas, cities, floods, field patterns, an anchorage full of waiting ships.
- At 10 m per pixel, a 1080p frame spans 19.2 km at native size and 15.4 km at 1.25×. A 400 m ship is 40–50 px, and a ~200–300 m canal is 20–30 px.
- Raw L2A true colour looks hazy and dark. Apply a **documented stretch**, for example Sentinel Hub's default true-colour gain of 2.5 on reflectance ([Sentinel Hub](https://custom-scripts.sentinel-hub.com/sentinel-2/true_color/)). Store it in the cue sheet, label the image "enhanced", and use the "modified" Copernicus notice.
- **Object-scale proof:** ring the object and inset a to-scale drawing traced from the scene, tagged `Illustration, traced from Sentinel-2`.
- The famous close-up pictures of events like the Suez blockage were commercial high-resolution images, which belong to the paid lane.

**The data desk** (new; it matches the picture desk for the plot world and "how many" rows).
- **Sources:** World Bank datasets are mostly CC BY 4.0, with credit and a note of changes ([World Bank](https://datacatalog.worldbank.org/public-licenses)). Our World in Data's own charts are CC BY, but most of its data comes from third parties with their own licences, and you must credit both OWID and the provider ([OWID](https://ourworldindata.org/faqs)). Also national statistics offices and UN agencies, licence checked per series.
- **Retrieval:** by API, with the series id, vintage (release date), unit and geography stored.
- **Checks:**
  - unit and denominator present;
  - the vintage is no more than one release old;
  - every on-screen number is recomputed from the stored series.
- **Credit:** description line `Provider (vintage) – processed by Studio`, plus OWID where it applies.

**Ethics and platform.**
- **Images of harm:**
  - no graphic injury, bodies or victims in harm, even blurred;
  - no identifiable private people or children in contemporary photos;
  - people pictured with dignity and agency, following Bond's guidance ([Bond](https://www.bond.org.uk/resources/putting-the-people-in-the-pictures-first/)).
- **Colonial archives:**
  - colonial-era captions appear only in the credit;
  - ethnographic "type" photos of unnamed people are barred as illustrations of a group;
  - sources from colonial institutions are flagged for the sensitivity read.
- **Worldview:** Natural Earth's de facto borders with disputed lines dashed, its point-of-view editions where the maker's story sits in one jurisdiction ([Natural Earth](https://www.naturalearthdata.com/about/disputed-boundaries-policy/)), and neutral or dual names for contested places.
- **YouTube disclosure** ([YouTube](https://support.google.com/youtube/answer/14328491)):
  - Must disclose: realistic synthetic depictions, and AI-generated music.
  - Need not disclose: cloning one's own voice, and production help with scripts, thumbnails and infographics.
  - Not listed either way: a generic TTS narrator over clearly drawn graphics. We set the API flag only when anything realistic and synthetic ships, and we state the AI voice in a standing "How this was made" line.
  - Our score is sample-based synthesis from recorded VSCO 2 CE samples, not generative AI, and the cue sheet records that.
- **EU AI Act Art. 50**, applying since 2 Aug 2026 ([text](https://artificialintelligenceact.eu/article/50/)):
  - 50(2): as the provider of a system that generates synthetic audio and video, we mark the output in a machine-readable way. That means C2PA Content Credentials on the MP4.
  - 50(4): AI-written text on matters of public interest must be disclosed unless a person holds editorial responsibility.
  - The site shows an amendment to 50(7) only. Whether the Digital Omnibus changed the start dates is not verified, so it goes to the legal read.
- **Corrections workflow:** a dated correction in the description and a pinned comment, a re-render where possible, and a versioned cue sheet and claims log.

### 3.5 People

**The audience is never on screen.** The audience band changes only wording, density, label count, cue strength, speech rate and type size.

**A named real person: portrait first, then their traces.**
1. **A portrait**, through the desk:
   - Wikidata P18 or Commons depicts = QID;
   - portrait at 40–45% of frame height, face at 40–50% of the portrait;
   - name 76 px, role ≤3 words at 60 px;
   - the photo's true year in the chip.

   People from before photography: a public-domain painting or engraving, as evidence.
2. **Their own words:** a quote card with speaker, date and occasion, string-matched to the source.
3. **A document they signed, or a newspaper column naming them** (Chronicling America OCR, string-matched).
4. **Their building, or their pin on the stage.**

The initials disc appears only as a small node in a timeline or network, never full-frame. Never use a kit face, a guessed skin tone, dress or headwear, or a photo face on a drawn body.

**A real group.**
- For counts: identical Isotype units, 1 unit = a stated round value, filled at 40–80 ms per unit.
- A verified photo or clip of that exact group replaces them.
- One group per frame; never cloned.

**Feeling and place rows**, in this order:
1. a real photo or clip of that event;
2. **artefacts and places at human scale** from the drawn pack: the ballot paper, the ballot box, the polling notice, the empty chamber, the queue as an Isotype count;
3. silhouettes only **far away and backlit, where dress is not legible**, and only as counted crowds.

Never use a costume outline (head wraps, robes) as the identity of a group; that is how caricature works. Any drawn depiction of a specific real event or place carries the "Illustration" tag.

**The character register** (new, for non-human agents in mechanism stories):
- simple eyes and the bible's illustration style on cells, particles or animals;
- on by default for the 7–12 bands;
- an A/B on the bench for under-7s (Hinten's fantasy effect was measured in ages 1.5–6) and for adults;
- never on people, institutions or evidence;
- intention claims ("the cell wants") only inside a "like" frame.

**Hands.** A hand insert (no arm or face) is a bench A/B on 1–3 key diagrams. Fiorella & Mayer found the hand helped (d = 0.35) while drawing without a hand did not.

**The host is a separate decision.** You ruled the audience off screen; the host is a different question. The evidence favours a **consistent communicator** ([Welbourne & Grant 2016](https://doi.org/10.1177/0963662515572068)). My recommendation (decision 15) is a consistent narrator persona: the same voice and name per show, no face. An on-screen human appears only when the maker records themselves.

For editor shows:
- `hostOn()` returns false unless the maker opts into their own recorded presence;
- bible characters are limited to research-backed people with a QID and a claim id;
- the role lint rejects student, learner, viewer, you, kid, teen, mechanic, teacher, guide, host, mascot and worker(s).

**Quotes.** Real people's words are read by the narrator with attribution. A real person never gets a synthetic voice.

The figure kit stays for story clips only. Kit faces never appear on an editorial stage. This also keeps general-audience explainers from looking "made for kids", a setting that turns off comments, end screens, the bell and save-to-playlist ([YouTube](https://support.google.com/youtube/answer/9528076)).

### 3.6 Motion language

**Two channels.**

| Channel | What it carries | Limit |
|---|---|---|
| **Information** | New facts: entrances, labels, counts, state changes, camera framings | One attention cue at a time; ≤2 moving things; gaps as in §3.2 |
| **Life** | Smoke, water shimmer, cloud shadows over terrain, blinking aircraft lights, traffic dots, paper flutter, flags stirring, particles of an already-named flow | No count limit. **Saliency cap** (house values): ≤15% local luminance change, no hue change, nothing faster than 1 Hz, never crossing a label, caption or chip box. Baked sprite loops on the CPU path; live on the GPU path. |

**Animation craft** (house values):
- **Stagger:** children enter 30–60 ms apart.
- **Follow-through:** attached parts (labels, leaders, shadows, loose ends) settle 60–120 ms after their parent.
- **Arcs:** moving objects travel on curves, unless they run on a mechanical track.
- **Anticipation:** a 2–4% counter-move over 80–150 ms before a move larger than 20% of frame width.
- **Squash:** ≤5%, only in the springy and picture-book bibles.

**A motion personality per show** (replacing the single Material 3 table, which was designed for UI):

| Personality | Entrances | Moves | Overshoot | Use |
|---|---|---|---|---|
| Springy | Spring, damping ratio about 0.6–0.7, 350–700 ms by size | ease-out `cubic-bezier(0.22,1,0.36,1)` | 6–10% (10% for children) | editorial, neon, gouache, picture book |
| Mechanical | Linear with 80–120 ms easing at the ends | constant speed; machines run at true relative speeds | none | blueprint, Swiss, Isotype, atlas |
| Stepped | On twos (15 updates/s at 30 fps), easing built into the spacing | the same | ~4% | risograph, newsprint, collage |

**Other values.**

| Item | Value |
|---|---|
| Chart changes | 0.7–1.0 s per stage; ≤3 stages; dissolve when the states share no dimension ([Heer & Robertson 2007](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf)) |
| Photo window | 2.5–6 s; 3–12% scale |
| Flights | 2–4 s; ≤3 zoom levels; 2–3 per episode |
| Section sweep (3D) | 2–4 s, front to back, while the voice names the parts |
| Sync | settled pose −1,000 to +100 ms of the anchor; default −150 to −50 ms |
| Causal launch | 0 ms after contact |
| Grain | Paper texture moves with the world. Grain is a loop of 4 plates at 8–12 fps at ≤2% luminance, or none. Grain reseeded every frame pushed test encodes to 49–117 Mbps (§7.9). Judge it only after a real unlisted YouTube transcode. Test a 1440p export as well: YouTube recommends 16 Mbps at 1440p against 8 Mbps at 1080p for standard frame rates ([YouTube](https://support.google.com/youtube/answer/1722171)). Check the delivered codec in Stats for nerds. |
| Motion blur | GPU path: 4–8 sub-frame average on frames where the camera moves faster than 25% of frame width per second |
| Depth of field | GPU path only; establishing and orbit shots; never on text or evidence |
| Safety | ≤3 flashes per second; luminance flicker <10% ([WCAG 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)) |
| Captures | Wait for `img.decode()` and `document.fonts.ready`; for maps, wait for MapLibre's idle event before each capture |

### 3.7 Voice and sound (new)

**Voice.** The voice is the biggest AI tell. The problem is persona and delivery, not learning (Craig & Schroeder 2017).

- **DELIVERY column**, per row:
  - a **style** for Gemini TTS's per-turn `speech_metadata.style` (for example "curious, leaning in", "quiet, grave");
  - **one stress word** per sentence, placed on the visual event's anchor;
  - **pause tags** such as `<short pause>`, `<long pause>` and `<breath>` ([Google](https://ai.google.dev/gemini-api/docs/speech-generation); models `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts`).
  - Kokoro has no style control, so on Kokoro DELIVERY maps only to rate changes and silence splices. Voice tests stay on Kokoro, per our testing rule.
- **Rate by passage**, around the band's base rate from [studio-audience.ts](file:///Users/richard/Desktop/easyread-server/src/business/domain/studio/studio-audience.ts) (110–160 wpm): open +10%, explain ±0, atmosphere −12%, burst +15% (house values).
- **Two takes for hero lines** (cold open, key-visual rows, act ends). Code picks on:
  - duration fit within ±5% of the board slot;
  - pitch range;
  - pause placement, checked with our existing echogarden forced alignment.
- **Prosody checks:**
  - ≥400 ms of silence after a question;
  - wpm per act within ±15% of target;
  - no sentence over 30 words;
  - the stress word lands within ±300 ms of its visual event.
- **Explainer voice rules** (existing): teach, never describe the picture, never say left or right.
- **Record your own voice.** The maker records in the browser, echogarden aligns the words, and the rest of the pipeline runs unchanged. A real human narrator is the strongest signal against slop.
- **Narrator A/B** on the bench: Gemini directed vs Kokoro vs the maker's own voice.

**Sound design pass** (new, driven by the event map; house values):
- a **whoosh** sized to each camera move: picked from the bank by nearest duration, time-stretched ≤10%, peaking 50 ms before the settle;
- **risers** of 1–2 s that end on reveal frames;
- **soft impacts** when counters land (≤1 per 2 s);
- **page, stamp, pen and paper foley** on document events;
- a **room tone per stage** (engine hum, wind, city) about 30 dB under the voice;
- **music hits** on act cuts.

Effects sit at least 18 dB under the voice.

**Sound sources.**
- Sonniss GDC bundles: royalty-free and commercially usable with no attribution required. AI/ML training is banned, so we never train on them ([Sonniss](https://sonniss.com/gameaudiogdc)).
- VSCO 2 CE samples, already in use (CC0).
- CC0 Freesound.
- Pixabay sounds under your earlier conditions.

**Music.** The per-document score (exists) follows the event map:
- sections change at act boundaries and passage types;
- the tempo is chosen so bar lines fall near major events, which shift ±80 ms where the sync window allows;
- music ducks to about −20 dB under the voice (80 ms attack, 400 ms release) and rises to about −10 dB in gaps of 1.5 s or more;
- at an ASK, it thins to a single pad, with a soft cue tone;
- on an awe beat, it rises about 6 dB for 2–4 s with no voice.

Output is at −14 LUFS integrated. That is common practice for YouTube playback normalisation, not a figure YouTube publishes. All mix levels are house values.

### 3.8 Editorial style guide (all audiences)

**Register.** Information first, every mark true and with a job. The same register serves every age; the band changes density and the character register only.

**Palettes** come from the bible (§3.0). The validator checks every bible against the rendered pixels:
- text ≥4.5:1 and marks ≥3:1 against what sits behind them ([WCAG](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html));
- Machado colour-vision simulation with pairwise CIEDE2000 ≥15 (protan/deutan) and ≥6 (tritan) (house value);
- no red/green pairs, and categories separated by lightness as well as hue ([Datawrapper](https://www.datawrapper.de/blog/colorblindness-part2));
- category hues start from the Okabe–Ito set ([Okabe & Ito](https://jfly.uni-koeln.de/color/));
- emphasis by greying the rest to 35–50% ([The Economist](http://web.archive.org/web/20200429114549/https://medium.economist.com/mistakes-weve-drawn-a-few-8cdd8a42d368));
- sides get colours by neutral rotation.

**Type** comes from the bible's OFL pair, with Noto as the script fallback. Sizes at 1920×1080:

| Role | Size |
|---|---|
| Hero number | 140–180 px |
| Primary label / title | 76 px |
| Must-read label | 60 px floor (68 px in child bands); provisional, to be checked on 2–3 real phones ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/typography), [NN/g](https://www.nngroup.com/articles/childrens-websites-usability-issues/)) |
| Source chip, "Illustration" tag | 28–32 px |
| Captions (when burned) | 64–68 px; ≤42 characters per line; ≤17 characters per second ([Netflix](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide)) |

**Text budget on the frame.** At most one chip, one "Illustration" tag, ≤8 stage words, and the captions in 9:16. Nothing else: computed values, licence detail and "approximate" notes go to the description or the voice.

**Labels.**
- ≤3 words, on their part, with a leader ≤15% of frame width and a 4–6 px halo.
- No legend for 4 or fewer series.
- Map lettering: regions in tracked uppercase, water in italic ([Axis Maps](https://www.axismaps.com/guide/labeling)).

**Localisation.** YouTube's auto-dubbing changes only the audio ([YouTube](https://support.google.com/youtube/answer/15569972)), so labels come from a **string table** keyed by label id and are re-rendered per language. Multi-language audio tracks are produced from translated scripts. Timelines and arrows mirror for right-to-left languages, and Noto Arabic, Devanagari and CJK are the fallbacks. Check resvg's shaping of Arabic and Devanagari on samples before relying on it.

**Composition.**
- **16:9:** graphics-safe x 96–1824, y 54–1026 ([EBU R95](https://tech.ebu.ch/docs/r/r095.pdf)). One focal subject per beat. Last 20 s quiet in the end-screen zones.
- **9:16 is composed full-bleed.**
  - The picture runs under YouTube's overlays.
  - Only text, labels, captions and the chip obey the safe zone: x 48–887, y 288–1247, with the caption band at about y 1040–1247. Verify these on a real vertical upload.
  - The hero fills ≥50% of full-frame height.
  - The old 840×700 content window used only 28.4% of the screen and is dropped.
- **1:1** (plan Stage 9): recomposed from the same stage, hero ≥50% of frame height, 5% text margins, captions burned.

**Per-show identity:** the bible, plus seeded variations (§3.0).

---

## 4. How the pipeline changes

**Docs and memory to update before any prompt is touched**, or builders will rebuild the old failures:
- [infographic-editor-plan.md](file:///Users/richard/Desktop/easyread-server/infographic-editor-plan.md):
  - line 199 ("There are no photos");
  - line 290 (namecard "never a photo");
  - lines 329 and 351 (described likeness, kit busts);
  - lines 153–154, 382–389, 438, 494 and 508–510 (Gemini as artist and judge);
  - line 456 (captions burned into every export).
- Memory notes: explainer-continuity ("no real photos (cost)"), studio-world ("3D dropped") if you approve the GPU worker, and the figure-kit preference if you approve commissioned art.

**Stage by stage.**

| Stage | Change | Model decides | Code decides |
|---|---|---|---|
| 1 Angle | Each angle carries a draft key visual, stage affinities and an **archetype** from the pool, respecting the channel guard | Angle, question, archetype | Scores, guard |
| 2 Research | For each claim: QIDs, a verbatim supporting sentence + URL + date (string-matched), claim kind and strength, numbers with units, **cited misconceptions only**, "how experts draw this". **History needs scholarly or primary sources; Wikipedia is a pointer only.** **New: a "who felt it" list per idea** (who won, lost and objected, with primary quotes). Remove "use no photos" ([editor-prompts.ts:113](file:///Users/richard/Desktop/easyread-server/src/web/adapters/editor-prompts.ts)). | Claims, QIDs, people | QID resolution, quote matching, source tier |
| 2b Picture desk + data desk | Evidence inventory (stills, documents, footage, satellite) and data series | Text-only consistency check | Retrieval, licence tier, provenance, reverse-image check, scoring, cache, credits |
| 3 Episode map | Idea map with relation tags and a **protagonist column**; stage and sets; key visual; anchor motif | Choices from closed lists | Feasibility, caps |
| 4 **Table read** (new) | The SAY \| DELIVERY column is voiced (Kokoro) before any picture is built. The maker listens and edits. | — | TTS, timing |
| 5 Script | SAY \| DELIVERY \| SHOW \| SOURCE. **Every abstract idea hangs on a protagonist. Lint: the first row of each act names a real person, place or object.** Refutation only on cited misconceptions. Beat targets per §3.2. Remove the "a third of the rows are scenes" quota ([editor-prompts.ts:366, 415](file:///Users/richard/Desktop/easyread-server/src/web/adapters/editor-prompts.ts)), the comparison ban ([prompts.ts:1594](file:///Users/richard/Desktop/easyread-server/src/web/adapters/prompts.ts), studio-prompts.ts:551), "a change about every six to ten seconds" ([prompts.ts:1795](file:///Users/richard/Desktop/easyread-server/src/web/adapters/prompts.ts)) and "a market on a feast day" (editor-prompts.ts:262). | SAY, DELIVERY, SHOW verbs, anchors | Verb/target validity, word budgets, claim-strength, causal, protagonist and close-but-wrong term lints |
| 6a Visual system | Bible plus seeds; cast (research-backed real people only); places (cited only) | Naming | Validator |
| 6b Board | Code compiles SHOW into a SceneDto. **Three boards per episode** are permutations of layout, framing and evidence pick. GPT-5.4 mini alternatives for about 6 hero rows; 5 candidates for key-visual rows. **The maker sees each scene's alternative keyframes in the timeline rail, with one-click pick, swap or hold.** That is a single row of 3 thumbnails per scene, nothing more. The default is the best score. | Hero-row alternatives | Timing, camera, layout, labels, joins, scoring |
| 6c Build | New kinds: photo, footage and satellite layers (trusted `<img>`/frames outside the sanitised SVG; [sanitize.ts:141](file:///Users/richard/Desktop/easyread/src/lib/scene/sanitize.ts) unchanged); portrait card; document reveal; 3D cutaway layer; 3D atlas layer; Pack 1 parts; collage layer. **Fallback ladder:** verified evidence → a drawn-kit object or code kind → map pin or icon → hold with a 5–8% push. | Parameters and layout (DeepSeek) | All drawing. DeepSeek ink ≤10%. |
| 7 Voice, music, sound | Gemini with DELIVERY, or the maker's voice; two takes on hero lines; score; sound-design pass | — | Take selection, ducking, effects from events |
| 8 Review, package | Fact-check covers the cue sheet, metaphor log and mute test. **Expert sign-off for science, engineering and health.** **Contact sheet** for the maker: one frame every 2 s, about 120 thumbnails for 4 minutes. Optional GPT-5.4 mini keyframe look (decision 13). Thumbnails per §7.6. Chapters. | Title wording, thumbnail hooks | Layout, contrast at 168×94 px |
| 9 Export | **GPU worker renders the finals**; the CPU renders previews. 16:9 ships an SRT/VTT track; 9:16 and 1:1 burned. C2PA manifest. Credits, cue sheet, the `status.selfDeclaredMadeForKids` and `status.containsSyntheticMedia` flags. Shorts cut-down per §7.6. | — | Everything |
| After publishing | Licence watch for 90 days. Retention from the YouTube Analytics API: 100 points per video (`elapsedVideoTimeRatio` 0.01–1.0), about 2.4 s each on a 4-minute episode, one video per call, with the maker's OAuth ([docs](https://developers.google.com/youtube/analytics/dimensions)). The event map is **resampled into the same 1% buckets** before dips are traced. | — | Alignment, flags |

**Publishing through the API** ([videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)):
- Uploads from unverified API projects created after 28 Jul 2020 stay **private** until an audit passes.
- The upload quota is **100 calls a day**.
- The project audit belongs in the standalone-Studio plan.

**Board score** (gap 28; house weights). Every hard bar in §7 must pass first. Then:

`score = 0.25·subject + 0.20·novelty + 0.15·sync + 0.15·evidence + 0.10·readability + 0.10·variety + 0.05·craft`

- `subject` = the time-weighted subject share ÷ the floor, capped at 1.
- `novelty` = new compositions per minute ÷ the floor, capped at 1.
- `sync` = the share of events in their window.
- `evidence` = the share of rows with passing real evidence, among rows where the desk found any.
- `readability` = the minimum contrast margin and label headroom.
- `variety` = 1 − (repeats of the same verb and layout ÷ rows).
- `craft` = 1 − DeepSeek ink share ÷ 10%.

Tie-breaks, in order: less DeepSeek ink, then less total camera travel, then the earlier key visual.

**The code checks** (no vision model required).

| Check | Catches | How |
|---|---|---|
| Frame audit | Cards, word-only frames, tiny subjects, empty frames, long holds | Pure function over SceneDto with camera transforms; ink boxes from resvg |
| Novelty | Monotony | Keyframe hash distance per minute |
| Cadence | Holds, quotas, two counters at once | Information events only; sub-steps and life motion excluded |
| Life cap | Distracting secondary motion | Luminance, hue and frequency per life element; box overlap with labels |
| Sync | Late settles | Settled time vs anchor word |
| Caption collision | Captions over labels | Box intersections over time |
| Stand-ins | Audience characters, cloned groups | Role lint; companion check |
| DeepSeek share | Programmer-art creep | Ink area by source per frame |
| Truth: numbers and names | Invented numbers, misspellings | String match to claims and gazetteer, or recompute |
| Truth: causal and strength | "After" drawn as "because"; overclaimed power | Launch verbs need a causal claim; the pen moves only with a sourced power |
| Close-but-wrong terms | Receptor vs antibody; instant immunity | A term-pair list per domain |
| Registers | Drawing passed off as evidence | Print frames and chips only on the real register; "Illustration" on drawn real events |
| Anachronism | Modern layers on a 1946 map | Valid-from dates on every layer |
| Licence vs treatment | Cropping BY-SA, grading evidence | Tier table |
| Physics invariants | Objects drifting from data | Asserted every frame |
| Variety | Template sameness | Same verb and layout ≤2 in a row; archetype guard; hash vs **all Studio channels** |
| Prosody | Flat or rushed reads | Pause lengths, wpm per act, stress placement |
| Render parity | GPU and CPU disagree | SSIM on sample frames (§6.1) |
| Mute test (advisory) | Frames that imply extra claims | GPT-5.4 mini reads the SHOW description plus on-screen text; code diffs it against the claims |

**Plan §6c illustrated moments: keep, convert or ban** (gap 24).

| Plan moment | Verdict | How it is done now |
|---|---|---|
| Cold open: black, a spotlight finds the Union Jack, lights snap, green-white-green rises (line 395) | **Convert** | Real footage of the 1 Oct 1960 ceremony through the desk or the paid lane. Otherwise both real flag designs as objects at the real place on the stage, tagged "Illustration", with no invented crowd. Self-contained within 5 s. |
| "NIGER" slides in, "-IA" clicks on, in a newspaper column (396) | **Convert** | A real scan of the article that proposed the name, if one clears. Otherwise animated type on the stage, never a fake facsimile. |
| Coins arc South → North; a London piggy bank snaps shut (398) | **Convert / ban** | Tokens or a Sankey only with a sourced causal claim about revenue, in amounts from the source. The piggy bank is banned (it implies a motive). |
| 46 seats, four light; a kit voter with a "£100+" sign (400) | **Convert** | Hemicycle from the source. The income qualification as a quote card from the constitution text, or eligible voters as Isotype units. No kit voter. |
| Macaulay's portrait as a described-likeness bust (401) | **Ban** | Real portrait through the desk, else the traces ladder (§3.5) |
| A printing press runs; newspapers fly over the map like birds (403) | **Convert** | The press as a drawn object when the line is about printing. Real mastheads pinned at their cities with founding dates. Paper flutter only in the life channel. |
| "1956" crossed out for "AS SOON AS PRACTICABLE"; ochre figures walk out (406) | **Convert** | Strike-and-replace on the real motion text (Hansard scan if cleared). The walkout as counted seat units leaving the hemicycle, from sourced numbers. No kit figures. |
| Balewa at a lectern (412) | **Convert** | Real photo or footage of the speech, or a quote card of his words |
| Three portrait cards in a triangle that tilts like a scale (413) | **Convert or drop** | The balance object only with a sourced "balance" claim, using real portraits |

---

## 5. Worked examples (frame-by-frame boards)

Times are from the start of the line, at about 150 wpm. **Real** = real register, **Drawn** = drawn register. "Gap" means the time since the previous information event. Each example is also a unit test for the frame audit.

### A. The Kano line (history, ATLAS) — with a protagonist

**Today.**
- The world job invented "Kano market square".
- The drawing failed and became a white card, and the kit added three cloned "Workers" in grey suits.
- It held for 8.5 s while the voice talked about constitutional power.

**What the research desk now finds ("who felt it").**
- **Objected:** NCNC leaders including Herbert Macaulay and Nnamdi Azikiwe.
- Wikipedia says Macaulay fell ill in Kano in 1946 and died in Lagos on 7 May 1946. It also gives his last message to the touring National Council delegates, citing Sklar, *Nigerian Political Parties* (Princeton UP), p. 61 ([Wikipedia](https://en.wikipedia.org/wiki/Herbert_Macaulay)).
- Standard histories tie that tour to the campaign against the Richards Constitution.
- **The desk must confirm the tour's purpose, the Kano illness and the quote in Sklar p. 61 or Coleman, *Nigeria: Background to Nationalism* (1958), before the rows ship.**
- "Gained" and "lost" are still to be researched.
- The protagonist is Macaulay, and Kano is now on screen for a true reason.

**Row A1** (cold-open archetype, "open" passage).
- **SAY:** "In 1946, an eighty-one-year-old engineer set out across Nigeria to fight a new constitution. In Kano, he fell ill." (20 words, about 8.0 s)
- **DELIVERY:** quiet, intrigued; stress on "fight"; `<short pause>` before "In Kano".
- **Facts to confirm:** born 1864; trained as a civil engineer; the tour; Kano.

| t (s) | Anchor | On screen | Verb | Reg. | Gap |
|---|---|---|---|---|---|
| 0.0 | "In 1946" | Tilted relief atlas (GPU) at country framing, on the 1946 layer traced from a period map. Lagos pin. Life channel: cloud shadows drift over the terrain. | ESTABLISH, PIN | Drawn | — |
| 1.9 | "engineer" | OPEN-PORTRAIT from the Lagos pin, if a portrait clears: chip with the photo's true year, 5% push over 2.5 s. Otherwise his signature on a document he signed, or a newspaper column naming him. | OPEN-PORTRAIT | Real | 1.9 |
| 4.4 | "fight a new constitution" | RETURN. The tour route draws north from Lagos through stops named in sources only. | RETURN, DRAW | Drawn | 2.5 |
| 6.6 | "In Kano" | CUT-TO a closer framing. The route reaches Kano. On "fell ill" (sub-step, +600 ms) the route's head stops and greys. | CUT-TO, PIN | Drawn | 2.2 |
| 8.0–9.5 | — | Hold 1.5 s; music thins to one note | HOLD | — | — |

Gaps 1.9, 2.5 and 2.2: all ≥1.2 s, median 2.2 s, inside the open band. The face is held 2.5 s (≥1.5 ✓), and the portrait window is 2.5 s (inside 2.5–6 ✓).

**Row A2** (explain passage).
- **SAY:** "The constitution gave each region an assembly. But an assembly could only advise. The decision stayed on an official's desk." (21 words, about 8.4 s)
- **DELIVERY:** plain; stress on "advise"; `<short pause>` after it.
- **Facts to confirm:**
  - Wikipedia's claim that the regional houses could only advise has no source on the page ([Wikipedia](https://en.wikipedia.org/wiki/Richards_Constitution)). Confirm it in Coleman or in the 1946 Order in Council text.
  - The 1946 title of the regional official (chief commissioner or lieutenant governor) is also unconfirmed.

| t (s) | Anchor | On screen | Verb | Reg. | Gap |
|---|---|---|---|---|---|
| 0.0 | "The constitution" | CUT-TO the regions framing. Three seams draw on the 1946 layer, with the East including the Southern Cameroons. If the desk clears a scan of the Order in Council, OPEN-DOCUMENT comes first and the seams move to the next row. | SEAM | Drawn | — |
| 2.6 | "an assembly" | Three assembly buildings from Pack 1 pin at the regional seats named in sources. Life: flags on them stir. | PIN | Drawn | 2.6 |
| 5.0 | "only advise" | Cut to a desk at human scale. The Eastern assembly's paper travels to the official's in-tray and stops at its edge: the gate. | TRANSFER | Drawn | 2.4 |
| 7.8 | "an official's desk" | The official's hand lifts the pen. The paper waits. Hold 1.2 s. | MARK | Drawn | 2.8 |

Gaps 2.6, 2.4 and 2.8: median 2.6 s ✓.

**Payoff.** Later rows (1951, 1954) move the pen toward the assemblies only as far as the cited sources say. The Mid-West seam appears only in the 1963 row.

**Checks:** 0 cards, 0 stock people, 0 invented places, no causal launch from the 1945 strike, strength shown by mechanics, ≤8 stage words, and no on-frame "approximate" caption.

### B. The jet-engine line (mechanism, 3D CUTAWAY)

**Today.** The engine was a 165×65 strip on a 1600×900 stage (0.7% of the frame), with "Teen student" and "Mechanic" below it.

**Act opening, earlier.**
1. A real NASA engine-test clip, if one clears with no third-party credit.
2. The Smithsonian NASM RB211-22 cutaway (CC0, 2000×1467) as a print, with chip `RB211-22 cutaway · Rolls-Royce / Smithsonian NASM · CC0` and a 6% push.
3. A **match cut** (silhouette IoU ≥0.6) into a **3D model of the same three-shaft configuration**, commissioned to match. If our model is a generic two-spool engine, the desk must open with a two-spool print instead. No "Simplified" downgrade.
4. The **section plane sweeps** through the model over 3 s while the voice names fan, compressor, combustor, turbine and nozzle across the next rows.

**Line:** "The air is packed tight and hot. What lights it?"

| t (s) | Anchor | On screen | Verb | Gap |
|---|---|---|---|---|
| 0.0 | "The air" | A slow orbit continues around the sectioned engine, at about 70% of frame width. Core-flow particles keep moving (already named). | (moving hold) | — |
| 0.6 | "packed tight and hot" | CUT-TO a medium framing on the compressor. Particle spacing narrows stage by stage, and the flow colour warms from blue to amber along the stages: one event, two sub-steps 300 ms apart. | CUT-TO, FLOW | — |
| 2.2 | "What lights it?" | PUSH to the dark combustor (0.9 s). Everything else dims to 40%. Fuel nozzle and igniter are unlit outlines. The "combustor" label is pinned to its 3D anchor. | PUSH, SPOTLIGHT, LABEL | 1.6 |
| 3.1–4.6 | — | **ASK**, 1.5 s: hot particles keep swirling (life channel), a soft rising tone plays, and the music drops to a pad | ASK | — |

**Placement fix.** In the film this line fell at 3:59 of 4:03, so its answer would have landed in the next episode. Under the new rule, the planner moves the prediction at least 20 s before the end, so the next row pays it off: fuel mist flows, then spark and flame start on the same frame, the flame holds itself, and the igniter goes dark. If the line must end the episode, it becomes a declared cliffhanger (§3.2).

**Refutation.** Dropped, unless a cited source names "the spark keeps firing" as a misconception. If one does, the correction keeps its scope. Wikipedia describes igniters as used at start until the flame sustains itself, with continuous ignition available where flameout is a risk ([Wikipedia: Flameout](https://en.wikipedia.org/wiki/Flameout)). So the voice line would be: "In cruise the flame keeps itself going; the igniter starts it and stands by as a backup." An expert signs off.

**Relatability recipe for mechanism topics:**
- inventor portraits through the desk (Frank Whittle, Hans von Ohain);
- a real clip of the engine in use;
- one everyday-scale comparison, with a sourced number only.

**Checks:** no people; the subject is ≥50% of frame height in 9:16 (full-bleed, labels in the safe zone); one cue at a time.

### C. A metaphor beat (VACCINE) — corrected biology

**Line:** "A vaccine shows your immune system the shape of a virus before the real one arrives." (16 words, about 6.4 s)

**Rig parts, all named:** antigen (a harmless spike piece), B cell, B-cell receptor, antibody (Y-shaped), memory B cell. Helper T cells are left out as a simplification only if the expert agrees.

| t (s) | Anchor | Adult band | Gap |
|---|---|---|---|
| 0.0 | "A vaccine" | A rail in **days** along the bottom, with "dose" at day 0. Antigen pieces appear in a lymph-node cutaway from the drawn pack. | — |
| 2.4 | "the shape of a virus" | A B cell whose receptor fits the spike shape binds it: a 400 ms eased fit, not a snap. Cells whose receptors don't fit drift past. | 2.4 |
| 4.6 | "before the real one arrives" | The rail travels from day 0 to about two weeks, since immunity can take weeks to develop ([CDC](https://www.cdc.gov/vaccines/basics/explaining-how-vaccines-work.html)). The bound B cell divides into antibody-making cells and memory cells; numbers appear only if sourced. | 2.2 |
| 6.4–8.0 | — | Hold: Y-shaped antibodies wait. The real virus arrives in the next row, and the antibodies bind its spikes. | — |

**Child band.**
- The lock-and-key inset, with the voice saying "like a key that fits one lock".
- The character register: the B cell has simple eyes.
- No war words; the time course is still in days.

**Lints:**
- A bare "receptor" is flagged; write "B-cell receptor" or "antibody". Host receptors such as ACE2 are what the virus uses to get in, never immune memory.
- "Instantly", "immediately" and "snap" are flagged in immunity claims.

**Health episodes need expert review.** The NIAID micrograph appears only in a row that names the virus, labelled as an example and as colour-enhanced.

### D. Inflation (PLOT WORLD)

**Line:** "At 2% inflation, prices double in about 35 years." (9 words, about 3.6 s)

| t (s) | Anchor | On screen | Verb | Gap |
|---|---|---|---|---|
| −0.4 | "At 2% inflation" | Chip "2% a year" on the axis. A basket of 5 globally common items sits as the line's start marker at index 100. | LABEL, PIN | — |
| 1.2 | "double" | A dashed ×2 ruler draws at 200, before the line arrives | DRAW | 1.6 |
| 2.6 | "35 years" | The line grows to meet the ruler at x = 35. The camera follows its head, and the index counter rides on the line as its label (sub-steps). | GROW | 1.4 |
| 3.6–5.6 | — | Payoff hold; the accent fills under the line; music swells | HOLD | — |

Gaps 1.6 and 1.4 (≥1.2 ✓). Two movers at most (the line and the camera follow). The computed value 1.02^35 = 2.00 goes in the description, not on screen.

### E. Marie Curie (TIMELINE + portrait)

**Line:** "In 1903, Marie Curie became the first woman to win a Nobel Prize, shared with Pierre Curie and Henri Becquerel." (20 words, about 8 s)

| t (s) | Anchor | On screen | Verb | Gap |
|---|---|---|---|---|
| −0.4 | "In 1903" | TRAVEL along the life timeline (1867–1934) to 1903 | TRAVEL, PIN | — |
| 0.9 | "Marie Curie" | OPEN-PORTRAIT by zoom-through: Commons "Marie_Curie_1903.jpg" (PD), YuNet face box, 5% push over 3.5 s. Chip `Photo 1903 · Nobel Foundation · Public domain` for 2.5 s. | OPEN-PORTRAIT | 1.3 |
| 4.4 | "Nobel Prize" | RETURN. A strip of 1901–1903 laureate dots from Nobel Prize data; only her dot lights | RETURN, MARK | 3.5 |
| 6.2 | "Pierre Curie and Henri Becquerel" | Two small portrait nodes (≤12% of frame height, no move) light on the strip with names; bracket "Physics 1903" | MARK | 1.8 |
| 8.0–9.0 | — | Hold | HOLD | — |

Face held 3.5 s ✓; portrait window 3.5 s ✓; gaps all ≥1.2 s ✓. If no portrait passes: her own words with a date, then a document naming her, then her laboratory building. Never a cartoon.

### F. Suez (ATLAS + satellite)

**Line:** "In March 2021, one ship blocked the Suez Canal for six days." (12 words, about 4.8 s)

| t (s) | Anchor | On screen | Verb | Gap |
|---|---|---|---|---|
| 0.0 | "In March 2021" | Equal-area world map; FLOW along the Asia–Europe route; calendar chip "23 Mar 2021" | FLOW, PIN | — |
| 1.4 | "one ship" | One of the episode's flights: globe → relief → satellite, 3 levels in 2.4 s. At place level, the Sentinel-2 L2A scene of 24 Mar 2021 (about 3% cloud; S2A_36RVU_20210324, confirmed via Earth Search today), with the documented stretch. Chip: `Sentinel-2, 24 Mar 2021 · enhanced · Contains modified Copernicus Sentinel data 2021` (after the legal check). | TRAVEL | 1.4 |
| 3.8 | "blocked the Suez Canal" | The ship (about 40 px) is ringed. An inset to-scale drawing traced from the scene shows the hull across the channel, tagged `Illustration, traced from Sentinel-2`. | MARK | 2.4 |

**Next row ("for six days").**
- The calendar flips from 23 to 29.
- The queues show as Isotype ship units from a sourced count.
- The 29 Mar scene (also in Earth Search) shows the waiting anchorage, a feature several kilometres across that Sentinel-2 resolves well.

**Transpose row.** The ship's outline beside the Burj Khalifa (828 m); the voice says "about half its height, to scale". The famous close-ups were commercial images, available only through the paid lane.

### G. A feeling row: the 1959 election

**Line:** "In December 1959, Nigerians queued to choose the parliament that would lead them to independence." (15 words, about 6 s)

| t (s) | Anchor | On screen | Verb | Gap |
|---|---|---|---|---|
| 0.0 | "In December 1959" | Atlas; calendar chip; a polling pin at a cited place | PIN | — |
| 1.8 | "queued" | Zoom-through. If the desk found a photo of that election, it opens with its chip. Otherwise a human-scale drawn scene: a ballot box on a table, ballot papers and a polling notice, with the queue as counted units in the distance (no dress, no faces), tagged "Illustration". Life: papers flutter and the light shifts. | OPEN-PHOTO or OPEN-SCENE | 1.8 |
| 4.2 | "choose the parliament" | Cut to a hemicycle filling with sourced seat counts (for example NPC 134 of 312, to confirm), plus a separate vote bar if votes and seats differ | CUT, COUNT | 2.4 |

### H. Banks creating money (a refutation that qualifies)

**Line:** "When a bank lends, it doesn't hand over someone else's savings. It types a new deposit into your account."

- **The misconception is cited.** The Bank of England's 2014 bulletin says banks do not simply act as intermediaries lending out savers' deposits ([BoE](https://www.bankofengland.co.uk/quarterly-bulletin/2014/q1/money-creation-in-the-modern-economy)).
- **Debunking order:**
  1. The ledger pair appears.
  2. The myth is shown once, small and grey: a dashed path from a vault, then struck.
  3. The fallacy is explained in one clause.
  4. On "types", `+ loan 100` and `+ deposit 100` land on the same frame, at the bank's own desk. The invariant is asserted in code.
- The banknotes in this row are not a money printer, because the line is not about printing. The BoE is the source, not the setting: no UK share figures unless the maker's story is set in the UK.

---

## 6. Technology choices with costs

### 6.1 The render benchmark (one table, with conditions)

**Conditions.** Measured today on an Apple M3 (8 cores) with Chrome 148:
- 1920×1080 frames; each layer has 300 filled paths and 20 text labels;
- the camera moves every frame;
- 5 warm-up frames, then 60 timed frames, captured as CDP JPEG at q90;
- 2 runs each.

Values are milliseconds per frame.

| Chrome build and mode | 2D, 1 layer | 2D, 4 layers | CSS 3D, 4 layers | WebGL (one shader quad) |
|---|---|---|---|---|
| Headless shell (GPU off by default) | 25–27 | 26–27 | 66–67 | fails (no context) |
| Full Chrome, GPU on (Metal) | 28–30 | 29–38 | 30–42 | 42 |
| Full Chrome, `--disable-gpu` | 33 | 35–36 | 63–64 | fails |

**What it means.**
- With a GPU, CSS 3D costs about the same as 2D.
- Without one, CSS 3D costs about 2.5× more, and WebGL does not work at all. The automatic software fallback did not appear.
- This table replaces the earlier figures (29 vs 74 ms; 32 vs 67 ms; "SwiftShader 3.4×"), whose conditions were not recorded.
- Linux on a T4 is untested. Chrome's own team ran headless Chrome with WebGL and WebGPU on an NVIDIA T4 using `--headless=new --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu`, plus NVIDIA Vulkan drivers. Headless Chrome disables the GPU by default ([Chrome blog](https://developer.chrome.com/blog/supercharge-web-ai-testing)).
- **First task of the GPU worker:** re-run this table on the Modal container and set the ms-per-frame budget from it.

### 6.2 Choices

| Need | Choice | Why | Cost / limit |
|---|---|---|---|
| Stage runtime | **Keep** the DOM/SVG stage driven by audio time | It already works like Remotion (seek, screenshot, ffmpeg). Switching engines gains nothing. | — |
| **Final render (new)** | Headless Chrome on a **Modal GPU** container (T4 or L4), using the flags above. We already rent Modal GPUs for TTS ([modal/](file:///Users/richard/Desktop/easyread-server/modal)). | Unlocks WebGL, CSS 3D, real light, depth of field and motion blur | T4 $0.000164/s, L4 $0.000222/s, CPU $0.0000131 per core per second, memory $0.00000222 per GiB per second ([Modal](https://modal.com/pricing)) |
| Preview render | Railway CPU (as now) | Fast feedback | 3D layers replaced by the 2D twin or a cached still |
| **Parity** | Pin the GPU type and driver. SSIM ≥0.99 between two GPU runs, and ≥0.97 between the GPU frame and the CPU preview frame of 2D-only scenes, on 20 sample frames (house values). | Deterministic export | CI job |
| 3D machines | three.js (MIT): glTF loader, material clipping planes for the section sweep, labels projected from 3D anchors | Fits a stage layer | Models commissioned (decision 12). [NASA 3D Resources](https://science.nasa.gov/3d-resources/) says its assets are free to download and use and offers GLB, but I found no turbofan there. |
| 3D terrain maps | MapLibre GL JS (BSD-3) with Terrain Tiles (terrarium encoding) and our drape. Wait for the map's idle event before each capture. | The NewPress look without Mapbox's licence | Public-domain DEM with attribution lines |
| Offline plates (optional) | Blender on the same worker, for hero plates only | Higher light quality | Measure before adopting; check Blender's licence FAQ on outputs |
| Bake and compose (2D) | `@resvg/resvg-js` (in repo) | Pixel-identical output everywhere | Re-measure bake time on the worker (§7.9) |
| Camera flights | `d3.interpolateZoom` (in client) | — | — |
| Morphs | Existing morph.ts; `rough.js` (seeded); add `flubber` (MIT) | — | — |
| Faces | YuNet (MIT, ONNX) through onnxruntime-node (already a dependency via echogarden) | Focal boxes | Small download; **needs your OK** |
| Text lines | Source OCR/ALTO first; Tesseract later | Document highlights | — |
| Footage | ffmpeg trims to frame sequences | Deterministic | — |
| Satellite | Earth Search STAC + Sentinel-2 COGs (`geotiff.js`, MIT) | Free, near-global | Copernicus notice |
| Shot measurement | PySceneDetect (BSD-3) | Phase 0 reference numbers | Needs your OK to download references |
| Reverse image | TinEye API | Provenance | Bundle pricing; not confirmed |
| Provenance marks | C2PA manifest on the MP4; read C2PA on inputs | AI Act 50(2); rejecting AI sources | — |
| Writing and checks | GPT-5.4 mini | Your model rule | $0.75 input, $0.075 cached input, $4.50 output per million tokens; 400k context; Batch supported ([OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4-mini)) |
| Keyframe look (optional) | GPT-5.4 mini image input | A cheap look at frames, separate from the Gemini check you declined | A 1280×720 frame is 1,104 tokens at high detail (32 px patches × 1.2) ([OpenAI](https://developers.openai.com/api/docs/guides/images-vision)) |
| Layout and parameters | DeepSeek | Your model rule | — |
| Voice | Gemini TTS (directed), Kokoro (tests and cheap), or the maker's own voice | Your model rule; Google for voice | Kokoro on Modal: $0.07 per audio-hour (repo ledger). Gemini TTS: priced separately, not checked today. |
| Sound | Sonniss GDC, VSCO 2 CE, CC0 Freesound | Licences above | Free |

**Rejected, with the real grounds.**
- **Remotion.** It is free for individuals and companies of up to 3 people, but the licence bars reselling your own derivative of Remotion ([licence](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)). Switching gains nothing, because our stage already seeks, screenshots and encodes.
- **GSAP:** adds nothing to our CSS/SMIL/WAAPI stage.
- **Veo:** Google, and video generation is outside the voice-only Google rule; watermarked; $0.10–0.60 per second ([pricing](https://ai.google.dev/gemini-api/docs/pricing)).
- **Sora 2 API:** shut down 24 Sep 2026.
- **The gpt-image-1 family.** gpt-image-1 shuts down 23 Oct 2026; 1-mini and 1.5 on 1 Dec 2026. OpenAI names gpt-image-2.5 replacements ([deprecations](https://developers.openai.com/api/docs/deprecations)). Image models are rejected for **evidence and real people and places** on truth grounds. For non-photoreal long-tail props they remain a decision (14).
- **Recraft:** its developer terms limit caching to 30 days.
- **FLUX.1 [dev]** weights, **RMBG-2.0** (non-commercial) and **LaMa** weights (unclear training terms).

### 6.3 Cost per episode

My estimates from list prices, for a 5-minute episode in three shapes (16:9, 9:16, 1:1). The ledger replaces them once running.

| Item | Assumption | Cost |
|---|---|---|
| GPT-5.4 mini: research, script, board alternatives, desk checks, mute test | About 600k input tokens (half cached) and 120k output including reasoning | about $0.79 |
| Optional keyframe look | 60 keyframes × 1,104 tokens + 18k output | about $0.13 |
| Voice | Kokoro on Modal; Gemini not priced here | about $0.01 |
| Render on Modal T4 (4 vCPU, 16 GiB) | 27,000 frames at $0.000252/s: **10 fps → $0.68**; 3 fps → $2.27; 30 fps → $0.23 | $0.23–2.27 |
| Image and footage cache | 0.2–0.5 GB per episode | cents |
| Expert sign-off (science, engineering and health only) | 1–2 h | $100–300 |
| **Total without expert** | | **about $1.2–3.2** |

**One-off costs** (my estimates, no quotes yet):
- illustrator Pack 1: $8k–25k per drawing hand;
- 3D turbofan model: $2k–6k;
- style frames: 6–10 at $150–500 each;
- legal read: by quote;
- bench: §7.8.

---

## 7. Quality bars a video must pass

All bars are code-checked unless marked *bench*. "Today" is the measured Nigeria episode (264 s) or the jet film.

**7.1 Picture**
- Failed-drawing cards: 0 ms (today 34.2% of runtime).
- Word-only frames ≤5% of runtime (today 19.4%).
- Subject floors per §3.1; time-weighted median ≥35% in 16:9 (today 17.4%; engine 0.7%); hero ≥50% of frame height in 9:16.
- New compositions ≥8 per minute until Phase 0 sets the floor. No framing over 20 s outside a declared atmosphere hold.
- DeepSeek ink ≤10% of any frame.
- Every window returns within 3 rows or 20 s.

**7.2 Timing and motion**
- Information events ≥1.2 s apart (1.5 s for children).
- Passage medians per §3.2; no gap over 6 s outside a HOLD.
- Sub-steps and life motion count zero (today 72 of 101 effects were pulses).
- ≥90% of events settle between −1,000 and +100 ms of their anchor.
- Readable dwell met for every label, number and print.
- At most 1 cue and 2 information movers at once. Life channel within its cap.
- ASK ≤1.5 s, or an open loop paid off within 20 s.
- Every worked example in §5 passes.

**7.3 Truth**
- 0 unmatched numbers or proper nouns.
- 0 causal visuals without a causal claim.
- Power moves only with a sourced power.
- History claims rest on a scholarly or primary source.
- 0 anachronistic layers; period shapes from the period-map lane.
- Close-but-wrong term lints pass. Expert sign-off on science, engineering and health.

**7.4 Images and data**
- Licence allowed; tier treatments obeyed; ≥2 independent fields agree; capture date passes.
- Provenance and reverse-image checks passed; chip shown 2.5–3 s on entry.
- TASL credits in the description; re-checked at export.
- 0 colourised, upscaled, flipped or filled evidence images.
- Data series with unit, vintage and credit.

**7.5 People, metaphor and text**
- 0 kit faces, stand-ins, cloned groups or costume outlines.
- Initials disc only as a small node.
- ≤3 strong metaphors per episode; relation match; a break line only with a cited misconception.
- Must-read text ≥60 px (68 px for children); contrast on rendered pixels; ≤8 stage words.
- 0 caption–label intersections.
- Captions ≤42 characters per line and ≤17 characters per second.

**7.6 Structure, packaging and platform**
- Frame 0 is content; the cold open is self-contained within 5 s; no ident before 5 s.
- Archetype guard holds; first row of every act names a real person, place or object.
- **Thumbnails** (house rules, unsourced):
  - 3 concepts with different hooks (face, object, contrast), each a poster-quality frame from the human-drawn kit;
  - tested in Test & compare, which takes up to 3 variants, picks by watch time, and excludes Shorts, made-for-kids, mature and private videos ([YouTube](https://support.google.com/youtube/answer/13861714));
  - no tier C images in thumbnails;
  - a living person's face needs the human click;
  - the credit for any face goes in the description.
- **Length and money.** Mid-rolls need videos of 8 minutes or more ([YouTube](https://support.google.com/youtube/answer/6175006)). So 3–5 min episodes carry no mid-rolls, while the compiled 12–15 min show film can. I found no public CTR or view-duration benchmarks for 3–5 min educational videos, so we set our own from the channel's first 10 uploads.
- **Shorts.**
  - Since 15 Oct 2024, square or vertical uploads up to 3 minutes count as Shorts, so a 3–5 min vertical twin is long-form vertical.
  - Any Short over 1 minute with an active Content ID claim is **blocked globally** ([YouTube](https://support.google.com/youtube/answer/15424877)).
  - So the Shorts cut-down is built from the key visual and one idea. It is **≤60 s if it contains any footage or archive item**, and ≤180 s only when it has none.
- **Compiled show film:**
  - chapters at episode boundaries;
  - "last time" lines dropped;
  - one cold open, plus a re-hook at each chapter start;
  - credits merged.
- C2PA manifest present. Made-for-kids and synthetic-media flags set by rule.

**7.7 Render and sound**
- ms per frame within the budget set on the Modal container; GPU parity passes.
- ≤3 flashes per second.
- CAMBI banding below threshold on the MP4 (`libvmaf`).
- Grain judged after a real YouTube transcode.
- Voice prosody bars (§3.7) met.
- Every camera move longer than 0.8 s has a matching sound event. Music ducking within ±2 dB of target.

**7.8 Bench** (*the only proof of "beats humans"*)

**Matching.**
- 6 topics. Each compares a same-subtopic segment of a matched human video, cut to the same length as our episode, or our compiled film against a whole human video of similar length.
- Logos, intros and channel marks are stripped. Less famous matched channels are preferred, because Kurzgesagt's style is recognisable.
- Downloads need your OK and stay internal (decision 18).

**Raters.**
- Blind raters on Prolific. Prolific recommends paying at least $12/h and usually charges corporate users a 42.8% fee ([Prolific](https://www.prolific.com/pricing)).
- Pre-registered: **n = 200 per pair** (194 gives 80% power to detect a true 60% preference against 50%).
- Pass only when the **lower bound of the 95% Wilson interval is above 50%**: 114 or more of 200 prefer ours. At n = 100 it would take 60 of 100, but that sample is underpowered.

**Measures.**
- **Comprehension:** an independent person writes the quiz from **both** scripts (retention and transfer). Ours must score ≥ the human video's.
- **"Does this look AI-made?":** our rate must be ≤ the human video's rate + 10 points.
- **Regional coverage:** real faces and footage seconds per episode, by region of the subject. No region below half of the best region's rate (house value).

**Cost.** 15 min per rater = $3 + 42.8% = $4.28, so **$857 per pair and about $5.1k for 6 pairs**. The Phase 0 style-frame test (n = 100, 4 min each) is about $115.

**Children.** No child participants without parental consent and an ethics plan (COPPA). Until then, child-band timings come from adult proxies, a teacher panel and published norms.

**Real uploads.** 30 s intro retention ≥ the channel's 10-video median, with dips traced through the 1% event map.

### 7.9 Where each number comes from

| Number | Status | Notes |
|---|---|---|
| 34.2% card time, 19.4% word-only, 17.4% median subject, 0.7% engine, 72 of 101 pulses | **Measured** by our audit scripts (scratchpad/audit) | Nigeria 264 s episode; jet film |
| Commons depicts covers about 20% of files | Measured earlier; **query and date not recorded** | Re-run in Phase B with an exact, dated query |
| Kano market 87 ShareAlike vs 4 open; "Nairobi street" 45 of 50 BY-SA | Measured earlier by Commons search; **queries not recorded** | Re-run and store the query string and date |
| Prelinger: 1,876 of 10,468 items with an explicit PD/CC0 field | **Measured** 2 Oct 2026, archive.org advancedsearch `collection:prelinger` | — |
| NASA video: "turbofan" 1, "rocket launch" 1,441 | Measured earlier via images-api.nasa.gov | Date the re-run |
| ms per frame, 2D vs CSS 3D vs WebGL | **Measured** today (§6.1) | Replaces the earlier figures |
| "SwiftShader 3.4×" | Measured earlier, conditions not recorded | **Dropped** |
| resvg bake about 1.4 s per 1080p frame | Measured earlier on the Mac; conditions not recorded | Re-measure on the worker |
| Grain test encodes 49–117 Mbps | Measured earlier on test encodes | Re-test after a YouTube transcode |
| Sentinel-2 24 Mar 2021, about 3% cloud | **Measured** today (Earth Search) | — |
| Machado CIEDE2000 ≥15 / ≥6 | House value | — |
| Subject floors 35% / 18% / 50%; novelty ≥8 per minute | House values | Phase 0 measurement replaces them |
| Sync −1,000 / +100 ms | House value | Baggett found picture-first held up to 7 s |
| Gaps, passage medians, ASK 1.5 s, 20 s open loop, life cap | House values | — |
| Question by about 15 s, wow by about 30 s, re-hook about 120 s | House values (targets) | — |
| Fong "about every 20 s" | Sourced ([Open Notebook](https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/)) | Her editing habit, not a cut rate |
| Kurzgesagt, one composition every ~3 s | My calculation (200 panels over ~10 min) | — |
| Type floors 60 / 68 px | Provisional house value | Phone check |
| Costs per episode and commissions | My estimates from list prices; no quotes | — |
| Bench n and pass mark | Computed (normal approximation; Wilson bound) | — |

---

## 8. What to build, in phases

Effort is in engineer-days, with bench days counted. These are estimates. External spend is listed separately in §6.3.

**Phase 0: look development and measurement (about 2 weeks; 5 engineer-days plus external work).**
- Commission 6–10 style frames and a 30 s animatic for Nigeria, jet and Curie, then get your sign-off. External cost; about 2 days of brief and review.
- PySceneDetect on 10 reference videos: shot length, compositions per minute, and the share of map, photo, graphic and footage. That share is hand-tagged from keyframes at about 1 h per video. 2 days.
- Preference test of the style frames against human frames on Prolific, including "looks AI-made?". 1 day.
- Brief illustrator Pack 1 and the 3D turbofan model.

**Phase A: stop the failures (about 3 weeks; 17 days).** No new assets or models.

| Item | Days |
|---|---|
| Update the plan doc and memory, then the prompt lines in §4 | 2 |
| Editorial mode: card → fallback ladder; kit insertion, pills, companionOf and bible audience characters off; `hostOn()` false | 4 |
| Frame audit as a pure function, in CI, with today's baselines and the §5 examples as unit tests | 4 |
| One shared timing token table; settle-at-anchor; dwell; information events vs sub-steps | 3 |
| Verb board v1 on existing kinds with the anchor registry; SRT for 16:9 | 4 |
| **Total** | **17** |

**Phase B: the vertical slice (about 72 days), then Bench 1.**

| Item | Days |
|---|---|
| StageCarry, camera solver with cuts, zoom-level worlds, novelty metric, period-map lane v1 (Nigeria 1946), anachronism lint | 9 |
| Two registers, causal and strength lints (pen mechanics), source-span verification, scholarly-source rule | 4 |
| Picture desk core (QID; Commons/Wikidata, NASA, Smithsonian, Met, VOA, DVIDS; provenance; sha1 cache; TASL; cue sheet; export re-check) | 10 |
| Photo kind, portrait card with YuNet, document reveal, **tier C whole-print object**, source chip | 6 |
| **GPU render worker on Modal** (flags, drivers, parity checks, re-run benchmark, cost ledger) | 5 |
| **3D cutaway layer** (glTF, section sweep, 3D-anchored labels, orbit) with the commissioned turbofan | 8 |
| **Illustrator Pack 1 integration** (part ids into the registry, 2 bibles, fonts) | 4 |
| Two motion channels, life loops, motion personalities v1 | 4 |
| Voice: DELIVERY column, Gemini styles and tags, two-take picker, prosody checks, record-your-own-voice | 3 |
| Sound-design pass v1 and music ducking | 3 |
| Label engine | 4 |
| Key visual and 3 thumbnail concepts | 2 |
| Maker review: alternatives in the rail, table read, contact sheet | 4 |
| **Bench 1** (Nigeria, jet, Curie vs matched human segments) | 6 |
| **Total** | **72** |

*If 72 days is too much,* the minimum slice is about 45 days: the GPU worker, the 3D cutaway, Pack 1 integration, the desk core, the photo kinds, motion channels, voice, sound, maker review and the bench. The period-map lane, label engine and thumbnail concepts move to Phase C.

*Go / no-go:* if Bench 1 loses badly, fix the look before adding breadth.

**Phase C: depth and life (about 54 days), then Bench 2.**

| Item | Days |
|---|---|
| Moving footage lane | 5 |
| Satellite lane (≥2 km features, stretch, traced inset) | 3 |
| 3D terrain atlas on the GPU (MapLibre, Terrain Tiles, drape) | 6 |
| Concept objects wave 1 (8 objects from Pack 1, invariants) | 8 |
| Metaphor checks, misconception gate, mute test | 3 |
| Collage register | 3 |
| Character register for non-human agents | 3 |
| Archetypes, channel guard, protagonist and "who felt it" lints | 4 |
| Bibles 3–12, seeds, cross-channel hash guard | 4 |
| Corrections, "How this was made", C2PA, YouTube API flags | 4 |
| Paid archive lane plumbing (opt-in, licence records) | 2 |
| Localised labels (string table, RTL, Noto) | 3 |
| **Bench 2** | 6 |
| **Total** | **54** |

**Phase D: breadth, in bench-topic order.** More cutaway models and Pack 2, flows, scale plate, archive wall, hand insert A/B, the retention loop, OSM place detail, the 1:1 export and the compiled film.

**Total to the end of Phase C: 5 + 17 + 72 + 54 = 148 engineer-days**, including 12 bench days. That is about 30 weeks for one engineer, less with two in parallel. The earlier "about 100" left out the GPU, 3D, art, voice and sound work.

---

## 9. Risks and how each is handled

| Risk | Handling |
|---|---|
| Commissioned art is slow or off-style | Style frames first; Pack 1 limited to the bench topics; a written file contract; 2 drawing hands at launch |
| The long tail of objects the kit lacks | Evidence first, then a commission queue, then a DeepSeek part under 10%; the image-model option kept as a decision |
| GPU headless rendering misbehaves on Linux | Use Chrome's documented T4 flags; re-run the benchmark first; keep the CPU path as a fallback for 2D-only scenes |
| GPU and CPU frames differ | Pinned GPU and driver; SSIM parity checks |
| 3D model doesn't match the evidence print | The desk matches the print to the model's configuration, or the model is built to match |
| Archive coverage is thin outside the US and Europe | Tier C in Phase B, VOA and DVIDS, Sentinel-2, the paid lane, regional coverage on the bench |
| Licence laundering | Provenance screen, reverse-image check, C2PA read, institutional sources first |
| A wrong photo misleads more than a drawing | Probative-only rule; "unsure" means reject; generic images named as examples |
| History on the wrong borders | Period-map lane; scholarly sources; Wikipedia as a pointer only |
| Life motion becomes noise | Saliency cap checked by code; information channel kept at one cue |
| Template sameness across makers | 12 bibles with seeds, archetype pool, cross-channel hash guard |
| A made-up or over-corrected refutation | Cited misconceptions only; scoped corrections; expert sign-off |
| Wrong biology or engineering | Named rig parts; "how experts draw this"; term lints; expert review |
| The voice sounds like AI | DELIVERY direction; two takes; persona; the maker's own voice |
| Footage Content ID claims | Explicit-PD items only, muted audio, dispute packet, Shorts ≤60 s with footage |
| API uploads stuck private | Project audit before launch |
| AI Act and disclosure | C2PA marking; "How this was made" line; legal read |
| Children's comprehension | Slower bands, the character register as an A/B, adult proxies until there is an ethics plan |
| Thresholds are house values | Phase 0 measurement, the bench, the retention loop |
| The bench says we don't beat humans | That is the point of the bench: fix the weakest bar and re-test before claiming |

---

## 10. Decisions for Richard (each with a recommendation)

**Rights and sources**
1. **Image licences.** Recommendation: PD, CC0, US government, museum CC0, CC BY (4.0 preferred), OGL and Copernicus now. Add **tier C (BY-SA) whole, unmodified prints in Phase B** after a short legal read. Why: without it, African and Asian episodes get maps while US episodes get people.
2. **Real people.** Recommendation: the verified photo with its true year; otherwise their words, then documents naming them, then their building. No described-likeness busts.
3. **Rhetorical "you" in narration.** Recommendation: yes in the voice, never on screen. Conversational style helped retention (d = 0.30) and transfer (d = 0.54) ([Ginns et al. 2013](https://eric.ed.gov/?id=EJ1036785)).
4. **Moving footage lane.** Recommendation: yes, in Phase C, explicit public-domain items only.
5. **YuNet download.** Recommendation: approve now.
6. **Living public figures.** Recommendation: a human approval click before export, and before any thumbnail use.
7. **Licensee: Studio or the maker.** Recommendation: a legal read covering this, tier C, the Copernicus chip and AI Act Art. 50.

**Look and render**

8. **Commission human illustration** (new). Recommendation: yes. Pack 1 in 2 drawing hands under assignment terms, plus Phase 0 style frames. Estimate: $8k–25k per hand, plus $1k–5k for style frames. Get 3 quotes. This retires the figure kit from editorial (it stays for stories), which changes your earlier preference for the kit style.
9. **A GPU render worker on Modal** (new; reverses "3D dropped"). Recommendation: yes for final renders, with the CPU path for previews. Estimate: about $0.23–2.27 of compute per three-shape episode.
10. **3D models for cutaways** (new). Recommendation: commission a turbofan matched to an evidence print, about $2k–6k (estimate). NASA 3D has none.
11. **Art-direction bibles** (new). Recommendation: launch with 2, grow to 12; seeded per show.
12. **Captions.** Recommendation: 16:9 ships a track; 9:16 and 1:1 burned; early-years band never burned.
13. **Vision check.** Recommendation: Gemini stays off. The maker's **contact sheet** is always on (free). A **GPT-5.4 mini keyframe look** at about $0.13 per episode is a separate option from the check you declined; I recommend it as advisory only.
14. **Image models for long-tail props.** Recommendation: a small bake-off of gpt-image-2.5 in a bible's style for non-photoreal props only, tagged as drawn, never for real people, places, events or evidence. Your model rule doesn't currently include OpenAI images, so this is your call. Default: no.

**Voice and people**

15. **Host and persona.** Recommendation: a consistent narrator persona per show (voice and name, no face). An on-screen human only when the maker records themselves.
16. **Record your own voice.** Recommendation: yes, in Phase B.
17. **Character register for children.** Recommendation: on by default for the 7–12 bands; A/B for under-7s and adults.
18. **Children's shows.** Recommendation: made-for-kids set by rule from the band.

**Platform and bench**

19. **Downloads for measurement and bench.** Recommendation: approve 10 reference videos plus the bench segments, internal use only.
20. **Paid archive lane.** Recommendation: opt-in per maker, quoted per clip, for hero moments only.
21. **Expert sign-off.** Recommendation: yes for science, engineering and health; paid at about $100–300 per episode (estimate).
22. **Bench budget.** Recommendation: about $5.1k for 6 pairs at n = 200, plus about $115 for the Phase 0 style-frame test.
23. **Shorts and the compiled film.** Recommendation: the Shorts cut-down rules in §7.6; the compiled film is where mid-rolls live.
24. **C2PA marking.** Recommendation: yes, on every export.
25. **Chapters on 3–5 min episodes.** Recommendation: A/B test (the first chapter must not give away the hook). Always use chapters on the compiled film.
26. **OSM place geography.** Recommendation: yes when needed, credited "© OpenStreetMap contributors" (ODbL).
27. **Stepped animation and the hand insert.** Recommendation: stepped becomes the motion personality of the risograph, newsprint and collage bibles. The hand insert stays a bench A/B.

---

## 11. Sources

**Channels and craft**
- Kurzgesagt making-of: https://www.lingq.com/en/learn-english-online/courses/689474/how-to-make-a-kurzgesagt-video-in-120-4887128/ · https://kurzgesagt.org/what-we-do · https://en.wikipedia.org/wiki/Kurzgesagt
- Vox: https://schoolofmotion.com/blog/estelle-caswell-vox-podcast · https://www.theopennotebook.com/2020/01/07/videogram-how-a-vox-video-explains-the-science-behind-the-first-photo-of-a-black-hole/ · https://kuchbos.medium.com/jogging-tv-sprinting-youtube-8c00c11f3c36
- Johnny Harris: https://vmacke.com/johnny-harris · https://en.wikipedia.org/wiki/Johnny_Harris_(journalist)
- Animagraffs: https://animagraffs.com/
- Cleo Abram: https://videoconsortium.org/member-resources/episode-8-cleo-abram · https://wpcreator.washingtonpost.com/p/creator-q-a-cleo-abram
- TED-Ed: https://blog.ed.ted.com/2022/06/28/how-ted-ed-partnerships-work/
- Newsrooms: https://reutersinstitute.politics.ox.ac.uk/news/new-york-timess-malachy-browne-future-visual-investigations-age-ai · https://wan-ifra.org/2024/10/the-economist-launches-ai-translated-videos-to-connect-with-young-audiences-in-multiple-languages/
- 3Blue1Brown: https://stanforddaily.com/2020/01/24/3blue1brown-creator-grant-sanderson-15-talks-engaging-with-math-using-stories-and-visuals/
- Ken Burns: https://www.poynter.org/reporting-editing/2007/meaning-in-motion-ken-burns-and-his-effect/
- Welbourne & Grant 2016: https://doi.org/10.1177/0963662515572068
- Willison pelican test: https://simonwillison.net/tags/pelican-riding-a-bicycle/
- Cutting 2016: https://pmc.ncbi.nlm.nih.gov/articles/PMC5256470/

**Learning science**
- Schroeder & Cenkci 2018: https://eric.ed.gov/?id=EJ1186641 · Noetel et al. 2022: https://eric.ed.gov/?id=EJ1338120 · Cheng et al. 2026: https://eric.ed.gov/?id=EJ1510171 · Höffler & Leutner 2007: https://eric.ed.gov/?id=EJ780451
- Fiorella & Mayer 2016: https://doi.org/10.1037/edu0000065 · Boucheix et al. 2013: https://doi.org/10.1016/j.learninstruc.2012.11.005 · Baggett 1984: https://doi.org/10.1037/0022-0663.76.3.408
- Muller et al. 2008: https://doi.org/10.1111/j.1365-2729.2007.00248.x · Debunking Handbook 2020: https://doi.org/10.17910/b7.1182 · Hegarty et al. 2003: https://doi.org/10.1207/s1532690xci2104_1 · Carpenter & Toftness 2017: https://doi.org/10.1016/j.jarmac.2016.07.014
- Mar et al. 2021: https://doi.org/10.3758/s13423-020-01853-1 · Ginns et al. 2013: https://eric.ed.gov/?id=EJ1036785 · Hinten, Scarf & Imuta 2025: https://doi.org/10.1111/desc.70069 · Wright et al. 1984: https://eric.ed.gov/?id=EJ308840
- Alfieri et al. 2013: https://doi.org/10.1080/00461520.2013.775712 · Bowdle & Gentner 2005: https://groups.psych.northwestern.edu/gentner/papers/BowdleGentner05.pdf · Gentner 1988: https://doi.org/10.2307/1130388 · Matlen et al. 2020: https://doi.org/10.1037/xhp0000726 · McNeil & Fyfe 2012: https://doi.org/10.1016/j.learninstruc.2012.05.001
- Cerf et al. 2009: https://doi.org/10.1167/9.12.10 · Newman et al. 2012: https://doi.org/10.3758/s13423-012-0292-0 · Craig & Schroeder 2017: https://doi.org/10.1016/j.compedu.2017.07.003 · Hauser & Schwarz 2015: https://doi.org/10.1177/0146167214557006
- Kim et al. 2014: https://pg.ucsd.edu/publications/edX-MOOC-in-video-dropouts-peaks_LAS-2014.pdf · Guo et al. 2014: https://pg.ucsd.edu/publications/edX-MOOC-video-production-and-engagement_LAS-2014.pdf · Heer & Robertson 2007: https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf · White 2025: https://europepmc.org/article/PMC/PMC12434928

**Metaphor, data and science content**
- FrameWorks: https://www.frameworksinstitute.org/app/uploads/2020/03/occ_metaphor_report.pdf · Galesic 2009: https://pure.mpg.de/view/item_2099767 · Hullman et al. 2015: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0142444 · Ruginski 2016: http://space.ucmerced.edu/Downloads/publications/Ruginskietal_2016.pdf · Romano 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7461444/ · Riederer 2018: https://www.dangoldstein.com/papers/Riederer_Hofman_Goldstein_Perspective_Analogies_CHI_2018.pdf
- Bank of England 2014: https://www.bankofengland.co.uk/quarterly-bulletin/2014/q1/money-creation-in-the-modern-economy
- NHGRI antibody: https://www.genome.gov/genetics-glossary/Antibody · CDC vaccines: https://www.cdc.gov/vaccines/basics/explaining-how-vaccines-work.html · Flameout: https://en.wikipedia.org/wiki/Flameout
- OWID licence: https://ourworldindata.org/faqs · World Bank data licence: https://datacatalog.worldbank.org/public-licenses

**History pointers (to be confirmed in scholarly sources)**
- https://en.wikipedia.org/wiki/Herbert_Macaulay (cites Sklar, *Nigerian Political Parties*, Princeton UP, p. 61) · Coleman, *Nigeria: Background to Nationalism* (1958) · https://en.wikipedia.org/wiki/Richards_Constitution · https://en.wikipedia.org/wiki/1945_Nigerian_general_strike · https://en.wikipedia.org/wiki/Southern_Cameroons · https://en.wikipedia.org/wiki/Mid-Western_Region,_Nigeria

**Images, footage, maps, licences, ethics**
- Commons identifiable people: https://commons.wikimedia.org/wiki/Commons:Photographs_of_identifiable_people · Wikimedia robot policy: https://wikitech.wikimedia.org/wiki/Robot_policy
- NASA: https://www.nasa.gov/nasa-brand-center/images-and-media/ · https://science.nasa.gov/3d-resources/ · NARA: https://www.archives.gov/research/catalog/help/api
- VOA terms: https://www.voanews.com/p/5338.html · DVIDS: https://www.dvidshub.net/about/copyright
- Copernicus legal notice: https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice · Earth Search: https://earth-search.aws.element84.com/v1 · Sentinel Hub true colour: https://custom-scripts.sentinel-hub.com/sentinel-2/true_color/
- Terrain Tiles: https://registry.opendata.aws/terrain-tiles/ · attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md · MapLibre: https://github.com/maplibre/maplibre-gl-js
- CShapes: https://icr.ethz.ch/data/cshapes/ · historical-basemaps: https://github.com/aourednik/historical-basemaps · Natural Earth: https://www.naturalearthdata.com/about/disputed-boundaries-policy/
- CC attribution practice: https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution · ShareAlike: https://wiki.creativecommons.org/wiki/ShareAlike_interpretation · CC BY 4.0: https://creativecommons.org/licenses/by/4.0/legalcode.en
- Philpot v. IJR (4th Cir. 2024): https://www.ca4.uscourts.gov/opinions/212021.P.pdf · Works made for hire: https://www.copyright.gov/circs/circ30.pdf
- Unsplash licence: https://unsplash.com/license · Pexels licence: https://www.pexels.com/license/ · Poly Haven: https://polyhaven.com/license · ambientCG: https://docs.ambientcg.com/license/ · TinEye API: https://services.tineye.com/TinEyeAPI
- Archival Producers Alliance: https://www.archivalproducersalliance.com/genai-guidelines · World Press Photo: https://www.worldpressphoto.org/contest/2025/verification-process/what-counts-as-manipulation · Bond: https://www.bond.org.uk/resources/putting-the-people-in-the-pictures-first/
- EU AI Act Art. 50: https://artificialintelligenceact.eu/article/50/

**YouTube**
- Monetisation and inauthentic content (15 Jul 2025): https://support.google.com/youtube/answer/1311392 · Altered content: https://support.google.com/youtube/answer/14328491 · Made for kids: https://support.google.com/youtube/answer/9528076 · Kids quality principles: https://support.google.com/youtube/answer/10774223
- Shorts length and Content ID: https://support.google.com/youtube/answer/15424877 · Mid-rolls: https://support.google.com/youtube/answer/6175006 · Test & compare: https://support.google.com/youtube/answer/13861714 · Upload settings: https://support.google.com/youtube/answer/1722171 · Auto-dubbing: https://support.google.com/youtube/answer/15569972 · Key moments: https://support.google.com/youtube/answer/9314415 · Recommendations: https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/
- Data API videos.insert: https://developers.google.com/youtube/v3/docs/videos/insert · Analytics dimensions: https://developers.google.com/youtube/analytics/dimensions

**Style, sound and accessibility**
- WCAG contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html · WCAG flashes: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html · EBU R95: https://tech.ebu.ch/docs/r/r095.pdf · Netflix timed text: https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/typography · NN/g children: https://www.nngroup.com/articles/childrens-websites-usability-issues/ · Okabe & Ito: https://jfly.uni-koeln.de/color/ · Datawrapper: https://www.datawrapper.de/blog/colorblindness-part2 · Axis Maps: https://www.axismaps.com/guide/labeling
- Google Fonts licences (`ofl/` folders): https://github.com/google/fonts · Sonniss GDC: https://sonniss.com/gameaudiogdc

**Technology and pricing**
- Modal pricing: https://modal.com/pricing · Chrome headless GPU: https://developer.chrome.com/blog/supercharge-web-ai-testing
- GPT-5.4 mini: https://developers.openai.com/api/docs/models/gpt-5.4-mini · Image tokens: https://developers.openai.com/api/docs/guides/images-vision · OpenAI deprecations: https://developers.openai.com/api/docs/deprecations
- Gemini TTS: https://ai.google.dev/gemini-api/docs/speech-generation · Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing · Prolific pricing: https://www.prolific.com/pricing
- Remotion licence: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md · PySceneDetect: https://github.com/Breakthrough/PySceneDetect · resvg: https://github.com/linebender/resvg · Depth Anything V2: https://github.com/DepthAnything/Depth-Anything-V2 · BiRefNet: https://github.com/ZhengPeng7/BiRefNet

**Our code and data (local)**
- Plan: /Users/richard/Desktop/easyread-server/infographic-editor-plan.md
- Modal services: /Users/richard/Desktop/easyread-server/modal/ (kokoro_service.py, tts_service.py)
- Screenshots: /private/tmp/claude-501/-Users-richard-Desktop-easyread-server/5809e1fa-481f-4a96-9dee-02b83b7a05dc/images/2.webp · /private/tmp/claude-501/-Users-richard-Desktop-easyread-server/3bff7de8-ac60-4b19-8a52-93b2ef3ef346/images/3.webp
- Audit scripts: /private/tmp/claude-501/-Users-richard-Desktop-easyread-server/3bff7de8-ac60-4b19-8a52-93b2ef3ef346/scratchpad/audit/
- Benchmark (re-run 2 Oct 2026): /private/tmp/claude-501/-Users-richard-Desktop-easyread-server/3bff7de8-ac60-4b19-8a52-93b2ef3ef346/scratchpad/bench/run.js and bench.html
- Code paths cited: src/business/domain/scene-compose.ts:432, scene-script.ts:1640/2643/3799, scene-figure.ts:3110, studio-host.ts:25, scene-timing.ts:31–33, scene-reading.ts:86, scene-film.ts:30, studio/studio-audience.ts; src/web/adapters/editor-prompts.ts:113/262/366/415, prompts.ts:1594/1795; /Users/richard/Desktop/easyread/src/lib/scene/sanitize.ts:141, timeline.ts:71
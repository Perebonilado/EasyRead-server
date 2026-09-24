# Visualize characters: one look for every person

Richard's request (2026-09-24):
- Standardise how human characters look, so none look off.
- They can wear different clothes and must fit the scenery.
- The look should be somewhat like South Park. His reference image is a flat scene with round-headed children: big white eyes, dot pupils, simple bodies, and different hats and hair.

Status: built and tested on `visualize-characters` in both repos, following the recommendation on every decision; not pushed. See Status at the end. The first sketch is `visualize-characters-sketch.svg`; the kit as built is drawn by `npm run figures:sheet`.

## How characters are drawn today, and why they look off

This section draws on two sources. The first is the two local makes of The Lantern Keeper (three characters each: Mira, Ember and Tobi), in `storage/…/cast.json`. The second is the code: `scene-story.ts`, `scene-sheet.ts`, `scene.processor.ts` and `scene-layout.ts`.

- **The artist model draws each character freehand.**
  - `sheetThing` asks for "a friendly flat picture-book style", working from a free-text `look`.
  - Nothing fixes the proportions, the eyes, the line or the colours, so each drawing invents its own.
- **The same book gives different people each time.** Compare the two makes of The Lantern Keeper:
  - Mira wears a purple beanie in one and an orange pointed hat in the other.
  - Tobi's look says "white beard". He has a full beard in one make, and a cap and no beard in the other.
- **Proportions aren't shared.**
  - Mira's head, hat included, is a quarter of her height in one make and more than a third in the other.
  - Across the six sheets, the head takes 25% to 45% of the figure's height, depending on what the artist grouped with it (a hat, a beard).
  - The face takes 29% to 39% of a person's head.
  - Line weights run from 2 to 34 units, and a sheet uses 8 to 17 colours.
- **Faces vary the most.** One has dot eyes, another has big eyes with brows, and they are drawn at different sizes. The gate only checks that each face sits on the head.
- **A figure's size on stage comes from the drawing's shape, not the person's.**
  - The layout fits each drawing to its slot by its own shape (`fitInSlot`).
  - So a wide drawing, such as a fox with its tail out or arms spread, comes out smaller, and a child can stand as tall as an adult.
  - Feet line up only because slots do. Nothing ties them to the ground painted in the set.
- **Sets have no shared style.** They are painted from their own brief. People on lesson pages, such as a doctor or a scientist, are ordinary drawings and are drawn again on every page.
- **It is also the most expensive part.** Each character costs up to two long artist calls. When those fail, a name card stands where the person should be.

## What "somewhat like South Park" means here

South Park began as paper cut-outs. It is now animated on computers to keep that look. What makes it recognisable:
- big wide heads with no necks, about half the height of a child;
- big white eyes set close together, with dot pupils; feelings shown through the lids, the pupils and the mouth;
- simple bodies: a trapezoid, short arms, mitten hands, short legs, oval feet;
- flat colours, one dark outline, no shading, and figures facing the front;
- everyone built from the same parts, so hair, hats and clothes are what tell people apart.

- **What we take:** the construction (one rig, big heads, big eyes, flat, outlined, facing front), and the idea that hair, hats and clothes carry identity.
- **What we leave:**
  - any South Park character or costume: no orange parka hiding the face, no blue hat with a red pompom, no green ushanka;
  - the show's name in anything we publish;
  - its tone.
- **How ours differs:** our eyes are rounder and slightly apart, our shapes are softer, and the palette is our own.
- **Why this is safe (not legal advice):** an art style isn't protected; particular characters and designs are.

## The design in one paragraph

Code draws people; the artist no longer does. A reader describes each person as a short structured spec: age, build, skin, hair, headwear, clothes and their colours, and a few extras. A figure kit draws them from one rig, so everyone gets the same head, eyes, outline and proportions. Age changes the body; hair, hats and clothes make each person themselves. Code also draws the seven faces, in the same place on every head. On stage, everyone shares one scale and stands on one ground line, which is the set's ground when there is a set. A child is therefore always shorter than an adult, and nobody floats. Sets are painted to a matching style guide. Animals and creatures stay with the artist for now, working to the same style guide.

## 1. The rig

See `visualize-characters-sketch.svg`. Units are the kit's own; the stage scales them.

- **Head.** One size at every age: a wide oval, 92 × 80, with no neck; it overlaps the top of the body.
- **Eyes.** Two white ovals, 30 × 33, almost touching and level with the middle of the head, with black dot pupils. Together they take about two-thirds of the head's width.
- **The face zone is kept clear.** Hair and hat brims never cover the eyes, the brows or the mouth; glasses and beards are the only things drawn over the face. Brows move within a band above the eyes, and hair stops above that band. This rule keeps every feeling readable, whatever someone wears.
- **Mouth and nose.** The mouth sits low on the face. There is no nose.
- **Body.**
  - A trapezoid rounded at the shoulders.
  - Short capsule arms and round mitten hands.
  - Short legs and oval shoes.
  - A soft shadow under the feet.
- **Ages.** Child, teen, adult and elder. The head stays the same size while the body and legs grow.
  - Heights are about 148, 166, 192 and 186 units.
  - So the head is about 54% of a child's height and 42% of an adult's.
- **Build.** Slim, average or broad widens or narrows the body by up to 10%. Nothing more extreme than that.
- **Line and colour.**
  - One near-black outline at one weight.
  - Flat fills from fixed palettes: 10 skin tones spaced from light to deep (checked against the Monk Skin Tone scale's spread), 8 hair colours and 13 clothing colours.
  - No gradients and no texture.
- **Facing.** Front, as in the reference. The pupils can turn toward whoever is speaking; that comes later.

## 2. What a person is: the spec

Every field is a closed list, so every answer can be drawn.

- `age`: child, teen, adult, elder
- `build`: slim, average, broad
- `skin`: 1–10
- `hair`: bald, balding, short, spiky, curly, afro, bob, long, ponytail, pigtails, bun, braids, locs
- `hairColour`: black, dark brown, brown, auburn, red, blonde, grey, white
- `facialHair`: none, stubble, moustache, beard
- `headwear`: none, cap, beanie, sun hat, headscarf, turban, hard hat, helmet, crown, graduation cap
- `top`: t-shirt, jumper, hoodie, shirt and tie, jacket, coat, lab coat, dress, cardigan, uniform, robe, apron, tunic
- `topColour` and `accentColour`
- `bottom`: trousers, shorts, skirt (none under a dress or a long coat)
- `bottomColour`
- `extras`, at most two: glasses, freckles, scarf, backpack, walking stick, stethoscope, bow tie, earrings. A wheelchair comes later, with its own pose.

**Code checks every value:**
- A colour outside the palette maps to the nearest one in it.
- Headwear is drawn so the face zone stays clear.
- An unknown value falls back to a plain choice.
- One spec holds for a person for the whole book.

**Where specs come from:**
- **Stories.**
  - The story reader (`sceneStorySchema`) gives each human character a `figure` beside the `look` it already writes.
  - What the book says wins. What it doesn't say is chosen to fit the setting and period, keeping the cast varied and each person distinct from the others.
  - `mergeStory` keeps the first figure it met a character with, so a later stretch of the book can't restyle them.
- **Books read before this change.** One small call per character turns the kept `look` into a spec. It runs once, and the result is kept with the cast.
- **Lesson pages.**
  - A new cast kind, `person` (a name and a spec), covers any human the writer puts on the stage: a doctor, a patient, a scientist. The same kit draws them, so the doctor on one page is the same doctor on the next.
  - A real person gets their known look drawn in the kit's style: white hair and a moustache, say. They are never caricatured.
- **Not people.** Animals, creatures and objects stay with the artist (section 5).

## 3. Faces and movement

- **The seven faces.**
  - The stage already uses neutral, happy, sad, angry, afraid, surprised and thinking.
  - Code draws each from lids, pupils, brows and mouth, as in the sketch.
  - They stay state groups, so the player switches them as it does today.
- **At rest.** A slow breath, as now, and a blink every few seconds. The blink is offset per person so a group doesn't blink together. Both run as CSS inside the figure, with no player change.
- **Talking.** The mouth opens and closes while the person's line is voiced. The player sets a class on a person while their bubble is open, and the figure's own CSS moves the mouth. This is a small player change.
- **Poses (later).**
  - Arms at the sides by default.
  - Then wave, point, hands up (for surprised and afraid) and hand on chin (for thinking).
  - The player has to swap the arms for these, so they come after the faces.

## 4. Fitting the scenery

- **One scale per step.** Everyone on stage at once is drawn at the same scale, set so the tallest fits. A child is always about three-quarters of an adult's height.
- **One ground line.** Everyone's feet share one line. When there is a set, that line is fixed near the bottom of the stage, and the set's ground is painted to meet it.
- **A soft shadow** under each person, so they sit on any ground.
- **A style guide for the set's brief.**
  - Flat colours, with no gradients or texture.
  - The same dark outline as the people, a little thinner.
  - Softer colours than the people's, so the people stand out.
  - A flat, open ground across the lower third, with nothing tall where people stand.
- **Names.** A person's name shows under them on the page where they are met, not on every page. With a set behind them, a name at their feet sits on the grass.
- **Later, if wanted: a set kit drawn by code** for the commonest places (sky and hills, a room, a street, a classroom). That would give whole scenes like the reference image, at no artist cost.

## 5. Animals and creatures

- **Ember the fox and the like stay with the artist.** `sheetThing`'s brief gains the same style guide:
  - the same eyes (white ovals with dot pupils);
  - the same outline weight and colour;
  - flat fills from the palette;
  - feet on the bottom of the frame.
- **Same scale and ground rules.** They apply to animals too. The story reader gives each animal a size (small, medium or large), which sets its height against the people.
- **An animal kit (four legs, bird) can follow** if the artist's animals still look off beside the people.

## 6. Moving over

- **New sheet version.** `SHEET_VERSION` becomes 2, and a sheet drawn by the kit keeps its spec with it. Older sheets are dropped and drawn again from the spec.
- **Pages already made keep the characters they were made with.** A book mixing old and new characters would look worse than either. So when a book's cast moves to the kit, the story pages made before it are remade in the background, at one page make each (see Decisions).
- **From now on, keep each page's parts** (its script, beats and timing) beside its scene. A later change to how people are drawn can then recompose pages with no writer or voice calls. `scripts/scene-recompose.ts` already does this for parts kept locally.

## 7. Checks and sign-off

- **Design sign-off before anything uses the kit:**
  - a contact sheet (`npm run figures:sheet` on the server) of every age with every skin tone, every hair style and headwear, every top and every face;
  - a dev page in the client (`/dev/figures`, dev only) to build a person from the lists and see them on the stage in front of a set.
- **Unit tests (`scene-figure.spec.ts`):**
  - every spec draws;
  - `head`, `body`, `arms`, `legs` and all seven faces are present;
  - every face falls inside the head (`measureSheet` has no notes);
  - nothing covers the face zone;
  - the same spec gives the same drawing, byte for byte;
  - the SVG passes the player's sanitiser;
  - a figure stays under 10 KB.
- **Layout tests:**
  - people in a row share a scale;
  - a child is shorter than an adult beside them;
  - everyone's feet share one line, and with a set, that line is its ground.
- **Books remade locally:** The Lantern Keeper and two others. We compare contact sheets before and after, and watch them through in the reader.

## Costs

- **People are no longer drawn by the artist.** Today a character costs up to two long artist calls per book; with the kit it costs none. The story reader's answer grows by a few fields per character.
- **Books read before the change:** one small call per character, once.
- **Remaking a book's made story pages:** one page make each, if we choose to remake them.

## Decisions for Richard

1. **How close to South Park?**
   - Recommended: as sketched. We take its construction and proportions, with rounder eyes set slightly apart, softer shapes and our own palette.
   - Closer is possible (touching oval eyes, a paper-cut edge), but that moves toward the show's own look.
2. **Existing books.**
   - Recommended: remake the story pages already made, so each book is consistent.
   - The alternative is to leave them and use the kit only for books started after the change.
3. **People on lesson pages.** Recommended: the kit draws them too.
4. **Animals.**
   - Recommended: the artist, with the style guide, for now.
   - The alternative is to build an animal kit now.
5. **Talking and blinking.** Recommended: add both; they are small.
6. **When a book doesn't say how someone looks.**
   - Recommended: the reader chooses what fits the setting and keeps the cast varied.
   - The alternative is a neutral default.

## Risks

- **Sameness.** One rig can make everyone look alike. Hair, hats, clothes and colours carry identity, the reader is told to keep the cast distinct, and the contact sheets check it.
- **Representation.** Skin tones, hair textures (afro, braids, locs), headscarves and turbans have to be drawn with care, and checked by people who wear them.
- **Tone.** The style is a cartoon. On serious lesson pages, such as medicine or history, people still need to look respectful: by default they get the neutral face and plain clothes.
- **The reader's choices.** A model can pick odd combinations. Code checks every value and falls back to plain choices.

## Technical plan (once approved)

### Server (EasyRead-server)

- **`src/business/domain/scene-figure.ts` (new).**
  - `FigureSpec` and its lists, the palettes and the rig.
  - `renderFigure(spec)` returns `{ svg, viewBox, parts, states, anchors }`. It is pure, like `scene-chart.ts`.
  - It includes the breath and blink CSS, and ids made unique per page the way drawings' ids are.
- **`scene-story.ts`.**
  - `StoryCharacter` gains `figure: FigureSpec | null`, plus `kind` (person, animal, creature, thing) and `size`.
  - `sheetThing` gets the style guide for everything that isn't a person, and `setThing` gets the set's style guide.
  - `mergeStory` keeps a character's first figure.
- **`web/adapters/ai-sdk/schemas.ts`.**
  - `sceneStorySchema` characters gain `figure` (flat and nullable, like the writer's schema), `kind` and `size`.
  - `sceneScriptSchema` gains `person` in `kind`, and a `figure`.
- **`web/adapters/prompts.ts`.** The reader's and the writer's instructions for the spec.
- **`scene-sheet.ts`.**
  - `SHEET_VERSION` becomes 2, and `CharacterSheet` gains `figure?`.
  - `figureSheet(spec)`: the rig's anchors are known, so only the ink map is measured.
- **`scene.processor.ts`.**
  - `sheetFor` draws people with the kit and animals with the artist.
  - `figureFromLook` for books read before the change.
  - `person` things are drawn by code (in `drawByCode`).
  - Older story pages are queued to remake when a book's cast changes (if decided).
  - Each page's parts are kept beside its scene.
- **`scene-layout.ts` and `scene-compose.ts`.**
  - `LaidThing` gains a `person` flag with the figure's height.
  - This is not `source`: the layout reads `source` as words drawn by code and would give a person the main slot.
  - Layout rules: one scale per step for people, one ground line (the set's, when there is one), and names on the first meeting only.
- **`scripts/figures-sheet.ts` (new).** The contact sheet.

### Client (EasyRead)

- **`/dev/figures`:** the lab (dev only).
- **Talking:** in `stage.ts`, a `talking` class on a person while their bubble is open.
- **Contract:** `SceneThingDto` gains an optional `person` flag. It is optional, so older scenes play as before.

### Order

1. The kit and the contact sheet, for Richard's sign-off.
2. Stories: the reader's spec, sheets v2, the stage rules, and moving existing books over.
3. People on lesson pages, the set style guide, and talking.
4. As wanted: poses, an animal kit, crowds, a set kit.

## Status (2026-09-24, built on `visualize-characters` in both repos, not pushed)

Richard said "implement and test", so each decision took its recommendation: as sketched; existing books remade on request; lesson people drawn by the kit; animals by the artist with the style guide; talking and blinking; the reader choosing looks that fit the setting.

### What was built

- **The kit (`scene-figure.ts`).**
  - The options: 4 ages × 3 builds, 10 skin tones, 13 hair styles in 8 colours, 4 kinds of facial hair, 10 headwear, 13 tops, 3 bottoms, 13 clothing colours, 8 extras.
  - The 7 faces, each with a second mouth for talking. A blink on each person's own beat, and a breath.
  - A figure is 8 KB, the heaviest 9.9 KB.
- **Groups (added).** On the South Pole pages the writer showed "Amundsen's Team" as one drawing, which the artist drew in its own style. So a person can now have a `count` of up to 4: the one described plus others dressed the same, each with their own build, hair and skin tone near the described one. Same group, same people every make.
- **Stories.**
  - The reader says each character's `kind` (person, animal, creature), an animal's `size`, and a person's `figure`.
  - Books read before this are asked once per character (`sceneFigure`, gpt-4.1-mini).
  - Sheets v2: people are drawn by the kit, and redrawn from their figure whenever a page needs them, so kit changes reach the book's next pages.
  - Sets v2: painted to go with the people. The set painter's own prompt was changed too, since it asked for gradients.
- **The stage.**
  - One scale per line of the template. A grown-up is at most 70% of the stage.
  - A single line in front of a set is set down on the stage's floor.
  - Animals stand at their size: small 95, medium 130, large 230 units. They are bigger than life, because a 70-unit fox read as a speck.
  - A character's name shows only where the book meets them.
- **Talking.**
  - Compose writes when the voice has said a speaker's words (`say.saidUntilMs`).
  - The player marks the speaker `talking` until then, never under reduced motion, and runs their animation at full pace while they speak.
- **Remaking a book (`npm run scene:recast -- <id> [--go | --here]`).**
  - A remake job flag keeps the page playable until its new version is ready.
  - The old files are deleted after the swap, because a purge only knows the row's own files.
  - The audio now has an ETag and is checked each time. It used to be cached for a day, marked immutable, which would have played a remade page with its old voice.
- **Review tools.**
  - `npm run figures:sheet -- <dir>` writes `figures.png`, and `figures.html` where the figures blink and talk.
  - The client's `/dev/stage` plays any locally made page on the real stage, in either staging. It replaces the planned `/dev/figures`: the kit lives on the server, and a builder in the client would have meant a second copy of it.

### Tested

- **Automated checks.**
  - Server: 1,193 tests, up from 1,159.
  - Client: 28 tests, up from 24.
  - Lint and types are clean in both repos, and `next build` passes.
- **Kit tests.**
  - Every top with every headwear passes the gate's allowlist unchanged.
  - Across every headwear and every hair style, the eyes' whites and the mouth render clear.
  - Every face sits on the head, including for groups of 4.
  - The same spec gives the same drawing, and a heavy figure stays under 10 KB.
- **The Lantern Keeper, remade locally (`scene:recast --here`).**
  - All 4 pages took 43–54 s each, with 0 overlaps in the frame audit.
  - Mira came from her old look as "slim child, brown long hair, yellow coat". Tobi came out as "elder, white balding hair, beard, green jumper, walking stick", which covers his limp.
  - Ember was redrawn by the artist in the kit's style, and the three sets were repainted.
- **South Pole.**
  - Scott and Amundsen are people.
  - Both teams are groups of 4.
  - Ships, ponies, the flag and the timeline stay drawings.
- **Hemoglobinopathies.** No people, and no people inside its drawings.
- **On the stage (`/dev/stage`).**
  - The mouth opens and shuts while the voice says the words, stops at `saidUntilMs`, and anyone not speaking stays still.
  - Each figure blinks at its own moment: about 150 ms at full pace, 300 ms when calm.
  - One scale and one floor in both stagings. Names show on the first meeting only.

### After the first review (2026-09-24)

Richard found a patient in bed drawn by the artist, not the kit.

- **Why that page looked like that.** It was made by the local worker, which had been started before any of this was written and still ran the old code.
- **A real gap underneath.** The new writer, told to keep people out of drawings, still wrote briefs whose subject was a person:
  - "A patient in a hospital bed, unresponsive…";
  - "A simple outline of a person looking tired…";
  - "A silhouette of a person being bitten…".

  The artist drew them whatever its prompt said. On Blood Protozoa p8, even with its new rule, it drew a patient in a bed, grey figures and pictograms.
- **The fix, in code, before the artist is asked:**
  - A drawing named for someone ("Doctor", "Sick child", "Amundsen's team") becomes a person. Words that mean something else in science are left out: an adult mosquito, a blood group, a worker ant.
  - A drawing whose brief is about someone becomes one, with a face from the brief (tired, sick or unresponsive are sad; bitten or in pain are afraid), and in bed when the brief says so.
  - A brief that still asks for people sends the page back to the writer once, naming the drawing. A brief that only mentions people tells the artist to leave them out. The artist's own prompt forbids figures, silhouettes, pictograms and stick figures, and allows a body part or the outline of a body for its organs.
- **A new pose, `in bed`.** The kit draws a patient sitting up in a bed, with the same head, faces, blink and talking. The writer can ask for it on a person or a character.
- **Result, remade locally.** Pages 6 and 8 came back with their patients drawn by the kit, in bed, and no people from the artist. Page 9's "Person" is drawn by the kit.

### Not done

- **Poses.** Planned for later.
- **An animal kit.** Ember in the artist's new style sits reasonably beside the people.
- **A set kit.**
- **Keeping each page's parts** so a later recast needs no writer or voice.

### For Richard

- **Sign off the look:**
  - `npm run figures:sheet -- <dir>`;
  - `/dev/stage` with pages from `scene-out/`, or from `public/dev-scenes/`, which git ignores.
- **Deploying.** Both branches build on `visualize-music`, so merge those first. Nothing to set, no migration, and either repo can go first.
- **On deploy:**
  - A story book's animals and places are drawn once more the next time one of its pages is made.
  - Its people cost nothing to draw, plus one small call per character for a book read before this.
  - Pages made before keep their old people until the book is recast: `npm run scene:recast -- <documentId>` shows the count, and `--go` queues them. Each page costs the writer and the voice once more.

# Visualize characters: one look for every person

Richard's request (2026-09-24):
- Standardise how human characters look, so none look off.
- They can wear different clothes and must fit the scenery.
- The look should be somewhat like South Park. His reference image is a flat scene with round-headed children: big white eyes, dot pupils, simple bodies, and different hats and hair.

Status: this is a plan only; nothing is built. A first sketch of the figure, drawn by code, is in `visualize-characters-sketch.svg` and was shown in the chat. The plan is on the server branch `visualize-characters` and is not pushed.

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

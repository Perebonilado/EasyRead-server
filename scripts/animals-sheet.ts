/**
 * The animal kit (scene-animal), every choice on one sheet, for signing its
 * look off: every species beside people at the kit's own scale, every pose
 * and every face of each, the mouths they talk with, their coats, markings,
 * ears, tails and what they wear, and the show's own animals as the kit
 * would draw them.
 *
 *   npm run figures:sheet -- --animals [out dir]
 *
 * Writes animals.png, a still, and animals.html, where each breathes,
 * blinks and wags, talks while "talking" is ticked, walks while "walking"
 * is, and sits, lies down and curls up as its body is sunk.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import {
  ANIMAL_EARS,
  ANIMAL_PATTERNS,
  ANIMAL_SPECIES,
  ANIMAL_TAILS,
  BACK_WEAR,
  HEAD_WEAR,
  NECK_WEAR,
  animalOf,
  describeAnimal,
  plainAnimal,
  type AnimalSpec,
} from '../src/business/domain/scene-animal';
import {
  ANIMAL_POSES,
  drawAnimal,
  type AnimalDrawing,
  type AnimalPose,
} from '../src/business/domain/scene-animal-draw';
import {
  byId,
  elements,
  removeNode,
  walk,
} from '../src/business/domain/scene-dom';
import {
  FIGURE_FACES,
  PLAIN_FIGURE,
  drawFigure,
  type FigureSpec,
} from '../src/business/domain/scene-figure';
import { rasterise } from '../src/business/domain/scene-raster';

const INK = '#2d2a32';
const WIDTH = 2600;
const TITLE = 26;
const LABEL = 14;

/** Pixels a kit unit is drawn at beside people. */
const TRUE_SCALE = 0.95;

interface Cell {
  svg: string;
  viewBox: number[];
  label: string;
  /** The classes a page sets on it to show it doing something: talking, a pose. */
  on?: string;
}

/** A drawing with only the states named left on, and, for a mouth's shape, only it. */
function showing(
  drawn: { svg: string; states: Record<string, string> },
  on: readonly string[],
  shape?: number,
): string {
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const [name, id] of Object.entries(drawn.states))
    if (!on.includes(name)) {
      const group = byId(root, id);
      if (group) removeNode(group);
    }
  if (shape !== undefined) {
    // The face's own mouths gone, and the one shape shown.
    for (const node of [...walk(root)]) {
      const cls = node.attribs.class ?? '';
      if (/\b(?:mouth|talk)\b/.test(cls) && node.name === 'g') removeNode(node);
      else if (/\bvm\b/.test(cls))
        if (cls.includes(`v${shape}`)) node.attribs.class = 'shown';
        else removeNode(node);
    }
  }
  return render(doc, { xmlMode: true });
}

/** A close view of a face: its eyes and its mouth, with room round them. */
function faceBox(drawn: AnimalDrawing): number[] {
  const [mx, my] = drawn.anchors.mouth;
  const x0 = Math.min(...drawn.eyes.map((e) => e.x), mx);
  const x1 = Math.max(...drawn.eyes.map((e) => e.x + e.width), mx);
  const y0 = Math.min(...drawn.eyes.map((e) => e.y));
  const pad = Math.max(...drawn.eyes.map((e) => e.height)) * 0.9;
  const w = x1 - x0 + pad * 2;
  const h = Math.max(my - y0 + pad * 2, w * 0.8);
  return [x0 - pad, y0 - pad, w, h];
}

/** The same svg, looking at another box of it. */
const lookingAt = (svg: string, box: number[]) =>
  svg.replace(
    /viewBox="[^"]*"/,
    `viewBox="${box.map((n) => Math.round(n * 10) / 10).join(' ')}"`,
  );

const still: string[] = [];
const page: string[] = [];
let y = 24;

function title(text: string, note = ''): void {
  still.push(
    `<text x="24" y="${y + TITLE}" font-size="${TITLE}" font-weight="700" fill="${INK}">${text}</text>`,
  );
  if (note)
    still.push(
      `<text x="24" y="${y + TITLE + 22}" font-size="15" fill="#666">${note}</text>`,
    );
  page.push(`<h2>${text}</h2>${note ? `<p>${note}</p>` : ''}<div class="row">`);
  y += TITLE + (note ? 40 : 16);
}

/**
 * Cells side by side, wrapping into rows: `height` pixels tall each (all
 * the same) or, with none, at the kit's own scale on one ground.
 */
function flow(cells: Cell[], height?: number): void {
  const gap = 18;
  const sized = cells.map((cell) => {
    const [, , vw, vh] = cell.viewBox;
    const k = height ? height / vh : TRUE_SCALE;
    return { cell, k, w: vw * k, h: vh * k };
  });
  let left = 24;
  let row: typeof sized = [];
  const rows: (typeof sized)[] = [];
  for (const one of sized) {
    const w = Math.max(one.w, 70);
    if (left + w > WIDTH - 24 && row.length) {
      rows.push(row);
      row = [];
      left = 24;
    }
    row.push(one);
    left += w + gap;
  }
  if (row.length) rows.push(row);
  for (const line of rows) {
    // One ground: each cell's bottom on it.
    const tallest = Math.max(...line.map((one) => one.h));
    const ground = y + tallest;
    let x = 24;
    for (const one of line) {
      const w = Math.max(one.w, 70);
      const [vx, vy, vw, vh] = one.cell.viewBox;
      const svg = one.cell.svg;
      still.push(
        `<svg x="${(x + (w - one.w) / 2).toFixed(1)}" y="${(ground - one.h).toFixed(1)}" width="${one.w.toFixed(1)}" height="${one.h.toFixed(1)}" ${svg.slice(svg.indexOf('viewBox'))}`,
        `<text x="${(x + w / 2).toFixed(1)}" y="${(ground + LABEL + 6).toFixed(1)}" font-size="${LABEL}" text-anchor="middle" fill="#666">${one.cell.label}</text>`,
      );
      page.push(
        `<figure style="width:${Math.round(w)}px;height:${Math.round(one.h + 24)}px" data-on="${one.cell.on ?? ''}"><template>${svg}</template><figcaption>${one.cell.label}</figcaption></figure>`,
      );
      x += w + gap;
      void vx;
      void vy;
      void vw;
      void vh;
    }
    y = ground + LABEL + 28;
  }
  page.push('</div>');
  y += 10;
}

/** A person, still, one face on. */
function person(spec: FigureSpec, label: string): Cell {
  const drawn = drawFigure(spec, label);
  return {
    svg: showing(drawn, ['neutral']),
    viewBox: drawn.viewBox,
    label,
  };
}

/** An animal, still, in a pose with one face on. */
function animal(
  spec: AnimalSpec,
  label: string,
  pose: AnimalPose = 'stand',
  face = 'happy',
): Cell {
  const drawn = drawAnimal(spec, `${spec.species}-${label}`, { pose });
  return { svg: showing(drawn, [face]), viewBox: drawn.viewBox, label };
}

/** An animal as the stage has it, every pose in it: on the page it sits, lies and walks as it is told. */
function live(spec: AnimalSpec, label: string, face = 'happy'): Cell {
  const drawn = drawAnimal(spec, `${spec.species}-${label}`, {
    signs: ['sleeping'],
  });
  return {
    svg: showing(drawn, [face]),
    viewBox: drawn.viewBox,
    label,
    on: 'live',
  };
}

const child: FigureSpec = {
  ...PLAIN_FIGURE,
  age: 'child',
  hair: 'curly',
  hairColour: 'black',
  skin: 7,
  top: 't-shirt',
  topColour: 'yellow',
  bottom: 'shorts',
};

export async function writeAnimalsSheet(out: string): Promise<void> {
  // ── Beside people, at the kit's own scale, tallest last.
  title(
    'Beside people',
    'Every species at its true size in the kit’s units, on one ground with a grown-up and a child.',
  );
  const bySize = [...ANIMAL_SPECIES].sort(
    (a, b) =>
      drawAnimal(plainAnimal(a), a).viewBox[3] -
      drawAnimal(plainAnimal(b), b).viewBox[3],
  );
  const people = [person(PLAIN_FIGURE, 'a grown-up'), person(child, 'a child')];
  flow([
    ...people,
    ...bySize.slice(0, 17).map((one) => animal(plainAnimal(one), one)),
  ]);
  flow([
    ...people,
    ...bySize.slice(17).map((one) => animal(plainAnimal(one), one)),
  ]);

  // ── Every pose of every species.
  title(
    'Every pose',
    'Standing, sitting, lying down and curled up asleep: each drawn as its own group, the stage showing it as the body sinks. A hoofed animal lies down when told to sit.',
  );
  flow(
    ANIMAL_SPECIES.flatMap((one) =>
      ANIMAL_POSES.map((pose) =>
        animal(
          plainAnimal(one),
          pose === 'stand' ? one : pose,
          pose,
          pose === 'curl' ? 'neutral' : 'neutral',
        ),
      ),
    ),
    104,
  );

  // ── Every face of every species, close.
  title(
    'Every face',
    'The kit’s own eyes, lids, brows and resting mouths, on each head: neutral, happy, sad, angry, afraid, surprised, thinking and pain.',
  );
  for (const one of ANIMAL_SPECIES) {
    const drawn = drawAnimal(plainAnimal(one), one);
    const box = faceBox(drawn);
    flow(
      FIGURE_FACES.map((face) => ({
        svg: lookingAt(showing(drawn, [face]), box),
        viewBox: box,
        label: face === 'neutral' ? `${one}` : face,
      })),
      84,
    );
  }

  // ── Talking.
  title(
    'Talking',
    'The six shapes a line is spoken in (shut, a little open, open, wide, round, lip on teeth): the kit’s on a muzzle, a two-part beak opening at its hinge, a fish’s lips.',
  );
  for (const one of [
    'dog',
    'horse',
    'cow',
    'duck',
    'parrot',
    'owl',
    'fish',
    'frog',
    'snake',
  ] as const) {
    const drawn = drawAnimal(plainAnimal(one), one);
    const box = faceBox(drawn);
    flow(
      [0, 1, 2, 3, 4, 5].map((shape) => ({
        svg: lookingAt(showing(drawn, ['neutral'], shape), box),
        viewBox: box,
        label: `${shape === 0 ? `${one} ` : ''}v${shape}`,
      })),
      84,
    );
  }

  // ── Coats, markings, ears, tails, and what they wear.
  title('Markings', 'Where the second colour goes.');
  flow(
    ANIMAL_PATTERNS.map((pattern) =>
      animal(
        animalOf({ species: 'dog', coat: 'brown', second: 'white', pattern })!,
        pattern,
      ),
    ),
    130,
  );
  flow(
    [
      ['horse', 'chestnut', 'white', 'socks'],
      ['cow', 'white', 'black', 'patches'],
      ['cat', 'grey', 'black', 'stripes'],
      ['pig', 'pink', 'black', 'spots'],
      ['fox', 'ginger', 'white', 'belly'],
      ['zebra', 'white', 'black', 'stripes'],
      ['giraffe', 'golden', 'chestnut', 'patches'],
      ['horse', 'grey', 'white', 'spots'],
    ].map(([species, coat, second, pattern]) =>
      animal(
        animalOf({ species, coat, second, pattern })!,
        `${coat} ${species}, ${second} ${pattern}`,
      ),
    ),
    130,
  );
  title('Ears, tails, manes and horns');
  flow(
    [
      ...ANIMAL_EARS.map((ears) =>
        animal(animalOf({ species: 'dog', ears })!, `${ears} ears`),
      ),
      ...ANIMAL_TAILS.map((tail) =>
        animal(animalOf({ species: 'dog', tail })!, `${tail} tail`),
      ),
      animal(animalOf({ species: 'horse', mane: 'short' })!, 'short mane'),
      animal(animalOf({ species: 'lion', mane: 'short' })!, 'a young lion'),
      animal(animalOf({ species: 'goat', horns: 'small' })!, 'small horns'),
      animal(animalOf({ species: 'sheep', horns: 'curled' })!, 'a ram'),
      animal(animalOf({ species: 'deer', horns: 'none' })!, 'a doe'),
    ],
    120,
  );
  title(
    'What they wear',
    'Round the neck, on the back, on the head and on the feet, in any of the kit’s cloth colours.',
  );
  flow(
    [
      ...NECK_WEAR.map((neck, k) =>
        animal(
          animalOf({
            species: 'dog',
            wear: { neck },
            wearColour: ['red', 'blue', 'green', 'purple'][k],
          })!,
          neck,
        ),
      ),
      ...BACK_WEAR.map((back, k) =>
        animal(
          animalOf({
            species: 'horse',
            wear: { back },
            wearColour: ['red', 'navy', 'purple'][k],
          })!,
          back,
        ),
      ),
      ...HEAD_WEAR.map((head, k) =>
        animal(
          animalOf({
            species: 'cat',
            wear: { head },
            wearColour: ['teal', 'yellow', 'pink'][k],
          })!,
          head,
        ),
      ),
      animal(
        animalOf({
          species: 'dog',
          wear: { feet: 'boots' },
          wearColour: 'yellow',
        })!,
        'boots',
      ),
      animal(
        animalOf({
          species: 'duck',
          wear: { head: 'hat', neck: 'bow' },
          wearColour: 'red',
        })!,
        'a hat and a bow',
      ),
    ],
    130,
  );
  title(
    'Sizes and builds',
    'Within a species: a puppy, a dog, a big dog; slim, average and stout.',
  );
  flow([
    ...(['small', 'medium', 'large'] as const).map((size) =>
      animal(animalOf({ species: 'dog', size })!, `${size} dog`),
    ),
    ...(['slim', 'average', 'stout'] as const).map((build) =>
      animal(animalOf({ species: 'pig', build })!, `${build} pig`),
    ),
    ...(['small', 'medium', 'large'] as const).map((size) =>
      animal(
        animalOf({ species: 'horse', size })!,
        size === 'small' ? 'a pony' : `${size} horse`,
      ),
    ),
  ]);

  // ── The shows' own animals, as the kit would draw them: nothing in the
  // shows is changed; this is what a kit drawing chosen would look like.
  title(
    'Pip, Bingo, Zuri, Clover and Dot, as the kit would draw them',
    'From each one’s look in their show, as the cast’s writer would give it. Their shows are unchanged: this is what choosing a kit drawing for them would give.',
  );
  const theirs: [string, Record<string, unknown>][] = [
    [
      'Pip (Maya and the Missing Pup)',
      {
        species: 'dog',
        size: 'small',
        coat: 'brown',
        second: 'white',
        pattern: 'patches',
        ears: 'floppy',
        wear: { neck: 'collar' },
        wearColour: 'red',
      },
    ],
    [
      'Bingo (Bingo in the Oranges)',
      {
        species: 'dog',
        size: 'small',
        build: 'stout',
        coat: 'tan',
        second: 'white',
        pattern: 'belly',
        ears: 'floppy',
        wear: { neck: 'collar' },
        wearColour: 'red',
      },
    ],
    [
      'Zuri (Kofi’s Red Kite Rescue)',
      {
        species: 'dog',
        size: 'small',
        coat: 'tan',
        second: 'white',
        pattern: 'socks',
        ears: 'floppy',
      },
    ],
    [
      'Clover (Eggbert’s Wobble)',
      {
        species: 'horse',
        coat: 'brown',
        second: 'white',
        pattern: 'socks',
        mane: 'long',
      },
    ],
    [
      'Clover, with a red saddle blanket',
      {
        species: 'horse',
        coat: 'brown',
        second: 'white',
        pattern: 'socks',
        mane: 'long',
        wear: { back: 'saddle blanket' },
        wearColour: 'red',
      },
    ],
    [
      'Dot (Eggbert’s Wobble)',
      {
        species: 'duck',
        size: 'small',
        coat: 'yellow',
        wear: { neck: 'bow' },
        wearColour: 'white',
      },
    ],
    [
      'Pip (Pip’s Little Lantern)',
      {
        species: 'owl',
        size: 'small',
        coat: 'brown',
        second: 'cream',
        pattern: 'belly',
      },
    ],
  ];
  flow([
    person(child, 'a child'),
    ...theirs.map(([label, said]) => {
      const spec = animalOf(said)!;
      return animal(spec, label);
    }),
  ]);
  still.push(
    ...theirs.map(
      ([label, said], k) =>
        `<text x="24" y="${y + k * 20}" font-size="14" fill="#555">${label}: ${describeAnimal(animalOf(said)!)}</text>`,
    ),
  );
  y += theirs.length * 20 + 10;

  // ── Alive: the stage's own drawings, every pose in them.
  title(
    'On the stage',
    'The stage’s own drawings, with every pose: on the page, tick walking or talking, and sink them to see them sit, lie down and curl up asleep.',
  );
  flow(
    [
      'dog',
      'cat',
      'horse',
      'cow',
      'pig',
      'duck',
      'chicken',
      'rabbit',
      'monkey',
      'elephant',
      'fish',
      'snake',
    ].map((one) => live(plainAnimal(one as AnimalSpec['species']), one)),
    150,
  );

  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${Math.ceil(y)}" viewBox="0 0 ${WIDTH} ${Math.ceil(y)}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fbf8f2"/>${still.join('')}</svg>`;
  writeFileSync(join(out, 'animals.png'), await rasterise(sheet, WIDTH));
  writeFileSync(
    join(out, 'animals.html'),
    `<!doctype html><meta charset="utf-8"><title>Animal kit</title>
<style>body{font:15px Helvetica,Arial,sans-serif;background:#fbf8f2;color:#2d2a32;margin:24px}h2{font-size:22px;margin:32px 0 4px}p{color:#666;margin:0 0 10px}.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}figure{margin:0;text-align:center;display:flex;flex-direction:column;justify-content:flex-end}figure div{flex:1}figcaption{color:#666;font-size:12px}.bar{position:sticky;top:0;background:#fbf8f2;padding:8px 0;z-index:1}</style>
<div class="bar"><label><input type="checkbox" id="talk"> talking</label> <label><input type="checkbox" id="walk"> walking</label> <label><input type="checkbox" id="asleep"> asleep</label> <label>sunk <input type="range" id="low" min="0" max="1" step="0.01" value="0"></label></div>
${page.join('\n')}
<script>
for (const figure of document.querySelectorAll('figure')) {
  const holder = document.createElement('div');
  figure.prepend(holder);
  const shadow = holder.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<style>svg{height:100%;width:100%;overflow:visible}</style>' + figure.querySelector('template').innerHTML;
}
const svgs = () => [...document.querySelectorAll('figure div')].map((h) => h.shadowRoot.querySelector('svg'));
document.getElementById('talk').addEventListener('change', (e) => { for (const s of svgs()) s.classList.toggle('talking', e.target.checked); });
document.getElementById('walk').addEventListener('change', (e) => { for (const s of svgs()) s.classList.toggle('on-walking', e.target.checked); });
document.getElementById('asleep').addEventListener('change', (e) => { for (const s of svgs()) s.classList.toggle('on-a-sleeping', e.target.checked); });
document.getElementById('low').addEventListener('input', (e) => { for (const s of svgs()) s.style.setProperty('--low', e.target.value); });
</script>`,
  );
  console.log(`animals.png and animals.html in ${out}`);
}

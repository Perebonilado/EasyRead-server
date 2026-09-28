/**
 * The creature kit (scene-creature), every choice on one sheet, for signing
 * its look off: the shows' creatures beside people at the kit's own scale,
 * every body, every face (one eye, two and three), the mouths they talk
 * with, standing and sitting, their textures, noses, heads, tops, arms,
 * legs, wings, tails and what they wear.
 *
 *   npm run figures:sheet -- --creatures [out dir]
 *
 * Writes creatures.png, a still, and creatures.html, where each breathes,
 * blinks and moves its parts, talks while "talking" is ticked, walks (or
 * floats) while "walking" is, and sits as its body is sunk.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import {
  CREATURE_ARMS,
  CREATURE_BODIES,
  CREATURE_HEADS,
  CREATURE_LEGS,
  CREATURE_NOSES,
  CREATURE_TAILS,
  CREATURE_TEXTURES,
  CREATURE_TOPS,
  CREATURE_WINGS,
  creatureOf,
  describeCreature,
  plainCreature,
  type CreatureSpec,
} from '../src/business/domain/scene-creature';
import { drawCreature } from '../src/business/domain/scene-creature-draw';
import type {
  AnimalDrawing,
  AnimalPose,
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

/** A creature, still, in a pose with one face on. */
function creature(
  spec: CreatureSpec,
  label: string,
  pose: AnimalPose = 'stand',
  face = 'happy',
): Cell {
  const drawn = drawCreature(spec, `c-${label}`, { pose });
  return { svg: showing(drawn, [face]), viewBox: drawn.viewBox, label };
}

/** A creature as the stage has it, every pose in it: on the page it sits and walks as it is told. */
function live(spec: CreatureSpec, label: string, face = 'happy'): Cell {
  const drawn = drawCreature(spec, `c-${label}`);
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

/** The shows' creatures and the bench's, as their writer would give them. */
export const CREATURE_CAST: [string, Record<string, unknown>][] = [
  [
    'Humpty',
    {
      body: 'egg',
      bodyColour: 'white',
      arms: 'stick',
      legs: 'stick',
      wear: { neck: 'bow tie', body: 'belt' },
      wearColour: 'red',
    },
  ],
  [
    'Eggbert',
    {
      body: 'egg',
      size: 'small',
      bodyColour: 'white',
      arms: 'stick',
      legs: 'stick',
      wear: { neck: 'bow tie' },
      wearColour: 'red',
    },
  ],
  [
    'Eggbert, rounder, cracked',
    {
      body: 'egg',
      size: 'small',
      build: 'stout',
      bodyColour: 'white',
      texture: 'crack',
      arms: 'stick',
      legs: 'stick',
      wear: { neck: 'bow tie' },
      wearColour: 'red',
    },
  ],
  [
    'Ember the dragon',
    {
      body: 'pear',
      size: 'small',
      bodyColour: 'green',
      texture: 'belly',
      textureColour: 'yellow',
      head: 'round',
      nose: 'snout',
      top: 'spikes',
      arms: 'kit',
      legs: 'feet',
      wings: 'bat',
      tail: 'spiked',
    },
  ],
  [
    'Grub the monster',
    {
      body: 'ball',
      bodyColour: 'purple',
      texture: 'fur',
      eyes: 1,
      top: 'horns',
      arms: 'none',
      legs: 'feet',
    },
  ],
  [
    'Bolt the robot',
    {
      body: 'box',
      bodyColour: 'silver',
      texture: 'rivets',
      head: 'round',
      top: 'antennae',
      arms: 'kit',
      legs: 'kit',
    },
  ],
  [
    'Frosty',
    {
      body: 'stack',
      bodyColour: 'white',
      texture: 'buttons',
      head: 'round',
      nose: 'carrot',
      top: 'hat',
      arms: 'stick',
      limbColour: 'brown',
      legs: 'none',
      wear: { neck: 'scarf' },
      wearColour: 'red',
    },
  ],
  ['Boo the ghost', { body: 'ghost', size: 'small', bodyColour: 'white' }],
  [
    'a three-eyed star',
    {
      body: 'star',
      bodyColour: 'yellow',
      eyes: 3,
      top: 'halo',
      wings: 'insect',
      arms: 'stick',
      legs: 'tail',
    },
  ],
  [
    'a big flame',
    {
      body: 'flame',
      size: 'large',
      bodyColour: 'orange',
      top: 'flame',
      arms: 'wings',
      legs: 'none',
    },
  ],
];

export async function writeCreaturesSheet(out: string): Promise<void> {
  const cast = CREATURE_CAST.map(
    ([label, said]) => [label, creatureOf(said)!] as [string, CreatureSpec],
  );
  const people = [person(PLAIN_FIGURE, 'a grown-up'), person(child, 'a child')];

  // ── The cast beside people, at the kit's own scale.
  title(
    'Beside people',
    'The shows’ and the bench’s creatures at their true size in the kit’s units, on one ground with a grown-up and a child.',
  );
  flow([...people, ...cast.slice(0, 6).map(([l, s]) => creature(s, l))]);
  flow([...people, ...cast.slice(6).map(([l, s]) => creature(s, l))]);

  // ── Every body, plain.
  title(
    'Every body',
    'Each body the kit has, as it is when nothing else is said, and with a head of its own (round and box).',
  );
  flow(CREATURE_BODIES.map((body) => creature(plainCreature(body), body)));
  flow(
    CREATURE_HEADS.filter((one) => one !== 'none').flatMap((head) =>
      (['box', 'bean', 'pear'] as const).map((body) =>
        creature(
          { ...plainCreature(body), head, arms: 'kit', legs: 'kit' },
          `${body}, ${head} head`,
        ),
      ),
    ),
  );

  // ── Every face, close: one eye, two and three.
  title(
    'Every face',
    'The kit’s own eyes, lids, brows and resting mouths: neutral, happy, sad, angry, afraid, surprised, thinking and pain. One eye has one pair of brows over it; a third eye sits over the pair.',
  );
  for (const [label, spec] of [cast[0], cast[4], cast[8], cast[5], cast[3]]) {
    const drawn = drawCreature(spec, `c-${label}`);
    const box = faceBox(drawn);
    flow(
      FIGURE_FACES.map((face) => ({
        svg: lookingAt(showing(drawn, [face]), box),
        viewBox: box,
        label: face === 'neutral' ? label : face,
      })),
      96,
    );
  }

  // ── Talking.
  title(
    'Talking',
    'The six shapes a line is spoken in (shut, a little open, open, wide, round, lip on teeth), the kit’s own, at the face’s mouth.',
  );
  for (const [label, spec] of [cast[0], cast[3], cast[6], cast[7]]) {
    const drawn = drawCreature(spec, `c-${label}`);
    const box = faceBox(drawn);
    flow(
      [0, 1, 2, 3, 4, 5].map((shape) => ({
        svg: lookingAt(showing(drawn, ['neutral'], shape), box),
        viewBox: box,
        label: `${shape === 0 ? `${label} ` : ''}v${shape}`,
      })),
      96,
    );
  }

  // ── Poses.
  title(
    'Standing and sitting',
    'One with legs sits as its body is sunk (the stage shows it as it sinks); one without stands, floats or hops in one piece.',
  );
  flow(
    cast.flatMap(([label, spec]) =>
      (['stand', 'sit'] as const).map((pose) =>
        creature(spec, pose === 'stand' ? label : 'sitting', pose, 'neutral'),
      ),
    ),
    130,
  );

  // ── Each choice.
  const base: CreatureSpec = {
    ...plainCreature('bean'),
    bodyColour: 'teal',
    arms: 'kit',
    legs: 'kit',
  };
  title(
    'Textures',
    'What is on its body, clipped to it and kept off its face.',
  );
  flow(
    CREATURE_TEXTURES.map((texture) =>
      creature({ ...base, body: 'ball', texture }, texture),
    ),
  );
  title('Noses and tops', 'Between its eyes and its mouth, and on top.');
  flow([
    ...CREATURE_NOSES.map((nose) =>
      creature({ ...base, nose }, `${nose} nose`),
    ),
    ...CREATURE_TOPS.map((top) => creature({ ...base, top }, top)),
  ]);
  title(
    'Arms, legs, wings and tails',
    'Arms turn about their shoulders as the kit’s people’s do; legs step in turn; wings beat about their roots; tails wag.',
  );
  flow([
    ...CREATURE_ARMS.map((arms) => creature({ ...base, arms }, `${arms} arms`)),
    ...CREATURE_LEGS.map((legs) => creature({ ...base, legs }, `${legs} legs`)),
  ]);
  flow([
    ...CREATURE_WINGS.map((wings) =>
      creature({ ...base, wings }, `${wings} wings`),
    ),
    ...CREATURE_TAILS.map((tail) =>
      creature({ ...base, tail }, `${tail} tail`),
    ),
  ]);
  title(
    'What it wears',
    'Round its neck, on its body, on its face: in one colour.',
  );
  flow(
    (
      [
        { neck: 'bow tie' },
        { neck: 'scarf' },
        { neck: 'collar' },
        { body: 'belt' },
        { body: 'cape' },
        { body: 'waistcoat' },
        { face: 'glasses' },
        { face: 'monocle' },
      ] as CreatureSpec['wear'][]
    ).map((wear) =>
      creature(
        { ...base, body: 'egg', bodyColour: 'cream', wear, wearColour: 'blue' },
        Object.values(wear)[0],
      ),
    ),
  );
  still.push(
    ...cast.map(
      ([label, spec], k) =>
        `<text x="24" y="${y + k * 20}" font-size="14" fill="#555">${label}: ${describeCreature(spec)}</text>`,
    ),
  );
  y += cast.length * 20 + 10;

  // ── Alive.
  title(
    'On the stage',
    'The stage’s own drawings: on the page, tick walking or talking, and sink them to see them sit.',
  );
  flow(
    cast.map(([label, spec]) => live(spec, label)),
    150,
  );

  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${Math.ceil(y)}" viewBox="0 0 ${WIDTH} ${Math.ceil(y)}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fbf8f2"/>${still.join('')}</svg>`;
  writeFileSync(join(out, 'creatures.png'), await rasterise(sheet, WIDTH));
  writeFileSync(
    join(out, 'creatures.html'),
    `<!doctype html><meta charset="utf-8"><title>Creature kit</title>
<style>body{font:15px Helvetica,Arial,sans-serif;background:#fbf8f2;color:#2d2a32;margin:24px}h2{font-size:22px;margin:32px 0 4px}p{color:#666;margin:0 0 10px}.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}figure{margin:0;text-align:center;display:flex;flex-direction:column;justify-content:flex-end}figure div{flex:1}figcaption{color:#666;font-size:12px}.bar{position:sticky;top:0;background:#fbf8f2;padding:8px 0;z-index:1}</style>
<div class="bar"><label><input type="checkbox" id="talk"> talking</label> <label><input type="checkbox" id="walk"> walking</label> <label>sunk <input type="range" id="low" min="0" max="1" step="0.01" value="0"></label> <label>arms <input type="range" id="arms" min="-110" max="0" step="1" value="0"></label></div>
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
document.getElementById('low').addEventListener('input', (e) => { for (const s of svgs()) s.style.setProperty('--low', e.target.value); });
document.getElementById('arms').addEventListener('input', (e) => { for (const s of svgs()) { s.style.setProperty('--ar', e.target.value); s.style.setProperty('--al', -e.target.value); } });
</script>`,
  );
  console.log(`creatures.png and creatures.html in ${out}`);
}

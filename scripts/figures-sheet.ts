/**
 * The figure kit, every choice on one sheet, for signing its look off:
 * ages and builds, skin tones, hair and its colours, facial hair,
 * headwear, clothes, extras, the seven faces, and a few people standing
 * together on a set as the stage stands them.
 *
 *   npm run figures:sheet -- [out dir]
 *
 * Writes figures.png, a still, and figures.html, where everyone breathes
 * and blinks, and talks while "talking" is ticked.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { byId, elements, removeNode } from '../src/business/domain/scene-dom';
import {
  BOTTOMS,
  CLOTH_COLOURS,
  FACIAL_HAIR,
  FIGURE_AGES,
  FIGURE_BUILDS,
  FIGURE_EXTRAS,
  HAIR_COLOURS,
  HAIR_STYLES,
  FIGURE_POSES,
  FIGURE_PROPS,
  FIGURE_SIGNS,
  HEADWEAR,
  TOPS,
  drawFigure,
  type FigureDrawing,
  type FigureFace,
  type FigureHow,
  type FigurePose,
  type FigureSign,
  type FigureSpec,
} from '../src/business/domain/scene-figure';
import { rasterise } from '../src/business/domain/scene-raster';
import { EXPRESSIONS } from '../src/business/domain/scene-story';

const out = process.argv[2] ?? '.';
/** Stage units a kit unit is drawn at on the sheet. */
const SCALE = 0.72;
const CELL = 128;
const LABEL = 15;
const TITLE = 22;
const INK = '#2d2a32';

const base: FigureSpec = {
  age: 'adult',
  build: 'average',
  skin: 4,
  hair: 'short',
  hairColour: 'brown',
  facialHair: 'none',
  headwear: 'none',
  top: 'jumper',
  topColour: 'blue',
  bottom: 'trousers',
  bottomColour: 'navy',
  accentColour: 'red',
  extras: [],
};
const as = (patch: Partial<FigureSpec>): FigureSpec => ({ ...base, ...patch });

/** Hair for a cell that is not about hair: varied, so the sheet is not a row of one person. */
const hairs = ['short', 'long', 'curly', 'bun', 'afro', 'spiky'] as const;
const skins = [2, 5, 8, 3, 9, 6];
const colours = CLOTH_COLOURS.filter((c) => c !== 'white' && c !== 'black');

const sections: {
  title: string;
  cells: { label: string; spec: FigureSpec; face?: FigureFace }[];
}[] = [
  {
    title: 'Ages and builds',
    cells: FIGURE_AGES.flatMap((age, i) =>
      FIGURE_BUILDS.map((build, j) => ({
        label: `${age}, ${build}`,
        spec: as({
          age,
          build,
          skin: skins[(i + j) % skins.length],
          hair: hairs[(i * 3 + j) % hairs.length],
          hairColour: age === 'elder' ? 'grey' : HAIR_COLOURS[(i + j) % 5],
          topColour: colours[(i * 3 + j) % colours.length],
        }),
      })),
    ),
  },
  {
    title: 'Skin tones',
    cells: Array.from({ length: 10 }, (_, k) => ({
      label: `skin ${k + 1}`,
      spec: as({
        skin: k + 1,
        hair: hairs[k % hairs.length],
        hairColour: k < 3 ? 'blonde' : 'black',
        topColour: colours[k % colours.length],
      }),
    })),
  },
  {
    title: 'Hair',
    cells: HAIR_STYLES.map((hair, k) => ({
      label: hair,
      spec: as({
        hair,
        age: k % 4 === 3 ? 'child' : 'adult',
        skin: skins[k % skins.length],
        hairColour: HAIR_COLOURS[k % 6],
        accentColour: 'yellow',
      }),
    })),
  },
  {
    title: 'Hair colours',
    cells: HAIR_COLOURS.map((hairColour, k) => ({
      label: hairColour,
      spec: as({
        hairColour,
        hair: hairs[k % hairs.length],
        age:
          hairColour === 'grey' || hairColour === 'white' ? 'elder' : 'adult',
      }),
    })),
  },
  {
    title: 'Facial hair',
    cells: FACIAL_HAIR.map((facialHair, k) => ({
      label: facialHair,
      spec: as({
        facialHair,
        skin: skins[k],
        hairColour: (['black', 'auburn', 'dark brown', 'grey'] as const)[k],
      }),
    })),
  },
  {
    title: 'Headwear',
    cells: HEADWEAR.map((headwear, k) => ({
      label: headwear,
      spec: as({
        headwear,
        skin: skins[k % skins.length],
        accentColour: (
          [
            'red',
            'green',
            'orange',
            'yellow',
            'navy',
            'purple',
            'yellow',
            'teal',
            'red',
            'black',
          ] as const
        )[k],
        age: k === 2 || k === 7 ? 'child' : 'adult',
      }),
    })),
  },
  {
    title: 'Tops',
    cells: TOPS.map((top, k) => ({
      label: top,
      spec: as({
        top,
        topColour: colours[k % colours.length],
        accentColour: top === 'lab coat' ? 'blue' : 'red',
        skin: skins[k % skins.length],
        hair: hairs[k % hairs.length],
      }),
    })),
  },
  {
    title: 'Bottoms',
    cells: BOTTOMS.map((bottom, k) => ({
      label: bottom,
      spec: as({
        bottom,
        top: 't-shirt',
        topColour: colours[k + 2],
        bottomColour: (['navy', 'green', 'purple'] as const)[k],
        age: 'teen',
        hair: hairs[k],
      }),
    })),
  },
  {
    title: 'Extras',
    cells: FIGURE_EXTRAS.map((extra, k) => ({
      label: extra,
      spec: as({
        extras: [extra],
        age:
          extra === 'walking stick'
            ? 'elder'
            : extra === 'backpack'
              ? 'child'
              : 'adult',
        hairColour: extra === 'walking stick' ? 'white' : 'dark brown',
        accentColour: 'teal',
        top: extra === 'stethoscope' ? 'lab coat' : 'jumper',
        skin: skins[k % skins.length],
      }),
    })),
  },
  {
    title: 'Faces',
    cells: [...EXPRESSIONS, 'pain' as const].map((face, k) => ({
      label: face,
      face,
      spec: as({
        age: 'child',
        skin: 4 + (k % 2),
        hair: 'short',
        topColour: 'yellow',
        bottom: 'shorts',
      }),
    })),
  },
];

/** A figure with only the given states on (a face, its signs), as the stage would show it. */
function showing(drawn: FigureDrawing, on: readonly string[]): string {
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const [name, id] of Object.entries(drawn.states))
    if (!on.includes(name)) {
      const group = byId(root, id);
      if (group) removeNode(group);
    }
  return render(doc, { xmlMode: true });
}

/** The classes the stage sets on a figure while its signs are on: what moves it. */
const classesFor = (drawn: FigureDrawing, on: readonly string[]) =>
  on
    .filter((name) => (FIGURE_SIGNS as readonly string[]).includes(name))
    .map((name) => `on-${drawn.states[name]}`)
    .join(' ');

/** A figure with its feet on `ground` at `x`: where its frame goes on the sheet, and its markup. */
function placed(
  spec: FigureSpec,
  x: number,
  ground: number,
  face: FigureFace = 'neutral',
  seed = '',
) {
  const drawn = drawFigure(spec, seed || JSON.stringify(spec));
  const [vx, vy, vw, vh] = drawn.viewBox;
  // The kit's ground, y = 0, on the sheet's.
  return {
    svg: showing(drawn, [face]),
    left: x + vx * SCALE,
    y: ground + vy * SCALE,
    w: vw * SCALE,
    h: vh * SCALE,
  };
}

const width = Math.max(...sections.map((s) => s.cells.length)) * CELL + 40;
let y = 20;
const still: string[] = [];
const page: string[] = [];
for (const section of sections) {
  still.push(
    `<text x="20" y="${y + TITLE}" font-size="${TITLE}" font-weight="700" fill="${INK}">${section.title}</text>`,
  );
  page.push(`<h2>${section.title}</h2><div class="row">`);
  y += TITLE + 14;
  const tallest =
    Math.max(...section.cells.map((c) => drawFigure(c.spec).viewBox[3])) *
    SCALE;
  const ground = y + tallest - 10 * SCALE;
  section.cells.forEach((cell, k) => {
    const cx = 20 + CELL / 2 + k * CELL;
    const at = placed(
      cell.spec,
      cx,
      ground,
      cell.face,
      `${section.title}-${k}`,
    );
    still.push(
      `<svg x="${at.left}" y="${at.y}" width="${at.w}" height="${at.h}" ${at.svg.slice(at.svg.indexOf('viewBox'))}`,
    );
    still.push(
      `<text x="${cx}" y="${ground + 10 * SCALE + LABEL + 4}" font-size="${LABEL}" text-anchor="middle" fill="#666">${cell.label}</text>`,
    );
    page.push(
      `<figure><template>${at.svg}</template><figcaption>${cell.label}</figcaption></figure>`,
    );
  });
  page.push('</div>');
  y = ground + 10 * SCALE + LABEL + 30;
}

interface Posed {
  label: string;
  spec: FigureSpec;
  /** The face and the signs on. */
  on: string[];
  how?: FigureHow;
}

/**
 * Figures side by side, as wide as each is drawn, wrapping into rows on
 * one ground: poses, signs, props, people in bed, groups. In the page,
 * their signs move while "moving" is ticked, as the stage moves them.
 */
function flow(title: string, cells: Posed[]): void {
  still.push(
    `<text x="20" y="${y + TITLE}" font-size="${TITLE}" font-weight="700" fill="${INK}">${title}</text>`,
  );
  page.push(`<h2>${title}</h2><div class="row">`);
  y += TITLE + 14;
  const made = cells.map((cell, k) => ({
    cell,
    drawn: drawFigure(cell.spec, `${title}-${k}`, {
      ...cell.how,
      signs: cell.on.filter((name): name is FigureSign =>
        (FIGURE_SIGNS as readonly string[]).includes(name),
      ),
    }),
  }));
  const rows: (typeof made)[] = [[]];
  let used = 20;
  for (const one of made) {
    const w = Math.max(one.drawn.viewBox[2] * SCALE, CELL - 14);
    if (used + w > width - 20 && rows[rows.length - 1].length) {
      rows.push([]);
      used = 20;
    }
    rows[rows.length - 1].push(one);
    used += w + 14;
  }
  for (const row of rows) {
    const above = Math.max(...row.map(({ drawn }) => -drawn.viewBox[1]));
    const ground = y + above * SCALE;
    let left = 20;
    for (const { cell, drawn } of row) {
      const [vx, vy, vw, vh] = drawn.viewBox;
      const w = Math.max(vw * SCALE, CELL - 14);
      const x = left + (w - vw * SCALE) / 2;
      const svg = showing(drawn, cell.on);
      still.push(
        `<svg x="${x}" y="${ground + vy * SCALE}" width="${vw * SCALE}" height="${vh * SCALE}" ${svg.slice(svg.indexOf('viewBox'))}`,
        `<text x="${left + w / 2}" y="${ground + 10 * SCALE + LABEL + 4}" font-size="${LABEL}" text-anchor="middle" fill="#666">${cell.label}</text>`,
      );
      page.push(
        `<figure style="width:${Math.round(w)}px" data-on="${classesFor(drawn, cell.on)}"><template>${svg}</template><figcaption>${cell.label}</figcaption></figure>`,
      );
      left += w + 14;
      void x;
      void vx;
    }
    y = ground + 10 * SCALE + LABEL + 26;
  }
  page.push('</div>');
  y += 4;
}

const tones = [2, 5, 8, 3, 9, 6, 1, 7, 4, 10];
const dressed = (k: number, patch: Partial<FigureSpec> = {}) =>
  as({
    skin: tones[k % tones.length],
    hair: (['short', 'long', 'curly', 'bun', 'afro', 'ponytail'] as const)[
      k % 6
    ],
    hairColour: (['dark brown', 'black', 'blonde', 'auburn'] as const)[k % 4],
    topColour: (['teal', 'orange', 'purple', 'green', 'red', 'navy'] as const)[
      k % 6
    ],
    accentColour: (['red', 'blue', 'yellow', 'pink'] as const)[k % 4],
    ...patch,
  });

flow(
  'Poses',
  FIGURE_POSES.filter((pose) => pose !== 'holding').map((pose, k) => ({
    label: pose,
    spec: dressed(k),
    on: [pose === 'waving' || pose === 'arms up' ? 'happy' : 'neutral'],
    how: { pose },
  })),
);

/** Each sign on someone, with the face and the pose it goes with. */
const SIGNED: Record<FigureSign, { face: FigureFace; pose?: FigurePose }> = {
  shaking: { face: 'afraid' },
  shivering: { face: 'afraid' },
  dizzy: { face: 'neutral' },
  coughing: { face: 'sad', pose: 'hand on mouth' },
  sleeping: { face: 'neutral' },
  breathless: { face: 'surprised' },
  walking: { face: 'happy' },
  jumping: { face: 'happy', pose: 'arms up' },
  'tingling hands': { face: 'thinking' },
  'tingling feet': { face: 'thinking' },
  headache: { face: 'pain', pose: 'hand on head' },
  'chest pain': { face: 'pain' },
  'stomach ache': { face: 'pain', pose: 'hands on belly' },
  fever: { face: 'sad' },
  sweating: { face: 'sad' },
  tears: { face: 'sad' },
  rash: { face: 'sad' },
  nausea: { face: 'sad' },
  confused: { face: 'thinking' },
  idea: { face: 'happy', pose: 'arms up' },
};
flow('Signs', [
  ...FIGURE_SIGNS.map((sign, k) => ({
    label: sign,
    spec: dressed(k + 3),
    on: [SIGNED[sign].face, sign],
    how: { pose: SIGNED[sign].pose },
  })),
  {
    label: 'lying, shaking',
    spec: dressed(1),
    on: ['afraid', 'shaking'],
    how: { pose: 'lying' as const },
  },
  {
    label: 'lying, asleep',
    spec: dressed(4),
    on: ['neutral', 'sleeping'],
    how: { pose: 'lying' as const },
  },
]);

flow('Props', [
  ...FIGURE_PROPS.map((holding, k) => ({
    label: holding,
    spec: dressed(k + 5, holding === 'syringe' ? { top: 'lab coat' } : {}),
    on: ['neutral'],
    how: { holding },
  })),
  {
    label: 'pointing, a book in the other hand',
    spec: dressed(2, { top: 'shirt and tie', topColour: 'white' }),
    on: ['neutral'],
    how: { pose: 'pointing' as const, holding: 'book' as const },
  },
]);

flow('In bed', [
  {
    label: 'in bed, a fever',
    spec: as({
      age: 'child',
      hair: 'curly',
      hairColour: 'black',
      skin: 7,
      topColour: 'yellow',
      accentColour: 'blue',
    }),
    on: ['sad', 'fever', 'sweating'],
    how: { pose: 'in bed' },
  },
  {
    label: 'in bed, headscarf',
    spec: as({
      headwear: 'headscarf',
      accentColour: 'teal',
      skin: 5,
      topColour: 'pink',
    }),
    on: ['neutral'],
    how: { pose: 'in bed' },
  },
  {
    label: 'in bed, asleep',
    spec: as({
      age: 'elder',
      hair: 'balding',
      hairColour: 'white',
      facialHair: 'beard',
      skin: 2,
      topColour: 'green',
      accentColour: 'purple',
    }),
    on: ['neutral', 'sleeping'],
    how: { pose: 'in bed' },
  },
]);

// Groups: a few people like the one described, each their own.
flow('Groups', [
  {
    label: 'a team (3)',
    spec: as({
      headwear: 'beanie',
      accentColour: 'red',
      top: 'coat',
      topColour: 'navy',
      bottomColour: 'grey',
      skin: 2,
    }),
    on: ['neutral'],
    how: { count: 3 },
  },
  {
    label: 'a class (4), waving',
    spec: as({
      age: 'child',
      top: 'jumper',
      topColour: 'navy',
      bottom: 'shorts',
      bottomColour: 'grey',
      skin: 5,
    }),
    on: ['happy'],
    how: { count: 4, pose: 'waving' },
  },
  {
    label: 'two elders, shivering',
    spec: as({
      age: 'elder',
      hair: 'balding',
      hairColour: 'white',
      top: 'cardigan',
      topColour: 'green',
      skin: 7,
    }),
    on: ['afraid', 'shivering'],
    how: { count: 2 },
  },
]);

// A few people together on a set, one scale and one ground line.
const cast: FigureSpec[] = [
  as({
    age: 'child',
    skin: 2,
    hair: 'pigtails',
    hairColour: 'dark brown',
    accentColour: 'yellow',
    top: 'dress',
    topColour: 'teal',
    extras: ['freckles'],
  }),
  as({
    age: 'child',
    skin: 7,
    hair: 'short',
    hairColour: 'black',
    headwear: 'cap',
    accentColour: 'red',
    top: 't-shirt',
    topColour: 'yellow',
    bottom: 'shorts',
    bottomColour: 'blue',
  }),
  as({
    age: 'teen',
    skin: 9,
    hair: 'afro',
    hairColour: 'black',
    top: 'hoodie',
    topColour: 'purple',
    bottomColour: 'navy',
  }),
  as({
    age: 'adult',
    skin: 5,
    headwear: 'headscarf',
    accentColour: 'navy',
    top: 'lab coat',
    bottomColour: 'grey',
    extras: ['glasses'],
  }),
  as({
    age: 'elder',
    skin: 1,
    hair: 'balding',
    hairColour: 'white',
    facialHair: 'beard',
    top: 'cardigan',
    topColour: 'brown',
    bottomColour: 'grey',
    extras: ['walking stick'],
  }),
];
still.push(
  `<text x="20" y="${y + TITLE}" font-size="${TITLE}" font-weight="700" fill="${INK}">Together, on a set</text>`,
);
y += TITLE + 14;
const setH = 300;
const setW = cast.length * 150 + 40;
const setting = [
  `<rect x="20" y="${y}" width="${setW}" height="${setH}" rx="12" fill="#d7ecf6" stroke="${INK}" stroke-width="1.5"/>`,
  `<ellipse cx="${20 + setW * 0.3}" cy="${y + setH - 10}" rx="${setW * 0.4}" ry="110" fill="#b9dea0" stroke="${INK}" stroke-width="2"/>`,
  `<ellipse cx="${20 + setW * 0.8}" cy="${y + setH}" rx="${setW * 0.45}" ry="120" fill="#a7d58c" stroke="${INK}" stroke-width="2"/>`,
  `<path d="M20,${y + setH - 60} Q${20 + setW / 2},${y + setH - 74} ${20 + setW},${y + setH - 60} L${20 + setW},${y + setH} L20,${y + setH} Z" fill="#98cb78" stroke="${INK}" stroke-width="2"/>`,
];
still.push(
  `<svg x="0" y="0" width="${width}" height="${y + setH + 20}" overflow="hidden"><clipPath id="set"><rect x="20" y="${y}" width="${setW}" height="${setH}" rx="12"/></clipPath><g clip-path="url(#set)">${setting.join('')}`,
);
const ground = y + setH - 22;
cast.forEach((spec, k) => {
  const at = placed(
    spec,
    20 + 95 + k * 150,
    ground,
    k === 0 || k === 2 ? 'happy' : 'neutral',
    `cast-${k}`,
  );
  still.push(
    `<svg x="${at.left}" y="${at.y}" width="${at.w}" height="${at.h}" ${at.svg.slice(at.svg.indexOf('viewBox'))}`,
  );
});
still.push('</g></svg>');
y += setH + 30;

mkdirSync(out, { recursive: true });
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}" font-family="Helvetica, Arial, sans-serif"><rect width="100%" height="100%" fill="#fbf8f2"/>${still.join('')}</svg>`;
void (async () => {
  writeFileSync(join(out, 'figures.png'), await rasterise(sheet, width));
  writeFileSync(
    join(out, 'figures.html'),
    `<!doctype html><meta charset="utf-8"><title>Figure kit</title>
<style>body{font:15px Helvetica,Arial,sans-serif;background:#fbf8f2;color:#2d2a32;margin:24px}h2{font-size:20px;margin:28px 0 8px}.row{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end}figure{margin:0;width:${CELL}px;text-align:center}figure div{height:190px}figcaption{color:#666;font-size:13px}</style>
<label><input type="checkbox" id="talk"> talking</label> <label><input type="checkbox" id="moving" checked> signs moving</label>
${page.join('\n')}
<script>
for (const figure of document.querySelectorAll('figure')) {
  const holder = document.createElement('div');
  figure.prepend(holder);
  const shadow = holder.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<style>svg{height:100%;width:auto;overflow:visible}</style>' + figure.querySelector('template').innerHTML;
}
document.getElementById('talk').addEventListener('change', (e) => {
  for (const holder of document.querySelectorAll('figure div'))
    holder.shadowRoot.querySelector('svg').classList.toggle('talking', e.target.checked);
});
// While a sign is on, the stage sets its class on the figure: what moves it.
const moving = document.getElementById('moving');
const move = () => {
  for (const figure of document.querySelectorAll('figure[data-on]')) {
    const svg = figure.querySelector('div').shadowRoot.querySelector('svg');
    for (const name of figure.dataset.on.split(' ').filter(Boolean)) svg.classList.toggle(name, moving.checked);
  }
};
moving.addEventListener('change', move);
move();
</script>`,
  );
  console.log(`figures.png and figures.html in ${out}`);
})();

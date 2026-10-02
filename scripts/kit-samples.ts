/**
 * Sample scenes of the kit's pieces for the client's /dev/shots lab, made
 * with the real kit and the real placement rule (kit/registry, kit/place),
 * in both shapes, and small asset fixtures for the client's tests:
 *
 *  - people-walk: a group walking across a town square by day;
 *  - people-crowd: a crowd of 300 in a square at dusk, shifting, then cheering;
 *  - people-train: a train arriving at a platform and braking;
 *  - people-ship: a steamship leaving port, its wake growing;
 *  - people-handshake: a pair shaking hands, the camera moving in.
 *
 * The backdrops are hand-drawn here for the samples only (the code-drawn
 * sets are work package 10's).
 *
 *   npx ts-node --transpile-only scripts/kit-samples.ts <client dir>
 *
 * writes <client>/public/dev-scenes/shots/people-*.json (the lab's) and
 * <client>/src/lib/shots/__fixtures__/kit-*.json (the tests').
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FilmShape,
  ShotActorDto,
  ShotBox,
  ShotDto,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../src/contracts';
import { placeActor } from '../src/business/domain/kit/place';
import { KIT, makeKit } from '../src/business/domain/kit/registry';
import { toAsset, UNITS_PER_METRE } from '../src/business/domain/kit/rig';
import { kitStyle } from '../src/business/domain/kit/style';

const client = process.argv[2] ?? '../client';
const LAB = join(client, 'public/dev-scenes/shots');
const FIXTURES = join(client, 'src/lib/shots/__fixtures__');

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    held: '#1864AB',
    sides: { Workers: '#A22700', Delegates: '#0050BE', Line: '#1D232B' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.4,
  motion: 'springy',
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A sample backdrop: sky, a far townscape or hills, the ground; a rail line, a quay and the sea. */
function backdrop(kind: 'day' | 'dusk' | 'rail' | 'port' | 'paper', shape: FilmShape): { asset: ShotSvgAssetDto; ground: number } {
  const [W, H] = shape === 'tall' ? [900, 1600] : [1600, 900];
  const ground = Math.round(H * (shape === 'tall' ? 0.7 : 0.8));
  const sky =
    kind === 'dusk'
      ? ['#F2B880', '#B07A88', '#5E5277']
      : kind === 'paper'
        ? [LOOK.palette.paper, LOOK.palette.paper, LOOK.palette.paper]
        : ['#E4ECF1', '#EEF0EC', LOOK.palette.paper];
  let body = `<defs><linearGradient id="sky" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${sky[0]}"/><stop offset="0.5" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient></defs>`;
  body += `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  const far = kind === 'dusk' ? '#3E3550' : '#C9CDD0';
  if (kind === 'dusk') body += `<circle cx="${W * 0.72}" cy="${ground - H * 0.1}" r="${H * 0.06}" fill="#FBD38D"/>`;
  if (kind === 'day' || kind === 'dusk') {
    // A far townscape: blocks of different heights, a few windows lit at dusk.
    let x = -20;
    let k = 0;
    while (x < W + 20) {
      const w = 60 + ((k * 37) % 70);
      const h = H * (0.08 + (((k * 53) % 100) / 100) * 0.16);
      body += `<rect x="${x}" y="${r1(ground - h)}" width="${w}" height="${r1(h)}" fill="${far}"/>`;
      if (kind === 'dusk' && k % 3 === 0) body += `<rect x="${x + w * 0.3}" y="${r1(ground - h * 0.7)}" width="10" height="14" fill="#F6C66B"/>`;
      x += w + 4;
      k += 1;
    }
  }
  if (kind === 'rail' || kind === 'port')
    body += `<path d="M0 ${ground} C${W * 0.2} ${ground - H * 0.12} ${W * 0.45} ${ground - H * 0.05} ${W * 0.7} ${ground - H * 0.1} S${W} ${ground - H * 0.04} ${W} ${ground} Z" fill="#CBD2C6"/>`;
  const land = kind === 'dusk' ? '#4B4258' : kind === 'paper' ? '#E9E1D3' : '#D9D1C2';
  if (kind === 'port') {
    body += `<rect y="${ground}" width="${W}" height="${H - ground}" fill="#5D88A8"/>`;
    for (let i = 0; i < 6; i += 1) body += `<rect x="${(i * 173) % W}" y="${ground + 30 + i * 22}" width="${90 + i * 10}" height="4" rx="2" fill="#7FA3BF"/>`;
    body += `<rect x="0" y="${ground - 40}" width="${W * 0.28}" height="${H - ground + 40}" fill="#8C8F92"/>`;
    body += `<path d="M${W * 0.08} ${ground - 40} V${ground - H * 0.32} H${W * 0.2} M${W * 0.12} ${ground - H * 0.32} L${W * 0.18} ${ground - H * 0.2}" stroke="#6E7276" stroke-width="10" fill="none"/>`;
  } else body += `<rect y="${ground}" width="${W}" height="${H - ground}" fill="${land}"/>`;
  if (kind === 'rail') {
    body += `<rect x="0" y="${ground - 10}" width="${W}" height="10" fill="#7C7468"/>`;
    for (let x = 0; x < W; x += 36) body += `<rect x="${x}" y="${ground - 4}" width="14" height="12" fill="#6A6258"/>`;
    body += `<rect x="${W * 0.45}" y="${ground - 34}" width="${W * 0.55}" height="24" fill="#A29A8E"/>`;
  }
  return {
    asset: {
      kind: 'svg',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`,
      box: [0, 0, W, H],
      parts: { ground: { box: [0, ground, W, H - ground] } },
      focal: [0, 0, W, H],
    },
    ground,
  };
}

/** A piece made and placed, for a sample. */
function piece(id: string, params: Record<string, unknown>, colour: string, seed: number, shape: FilmShape, light?: string) {
  const made = makeKit(id, params, kitStyle(LOOK, { shape, ...(light ? { light } : {}) }), seed, colour);
  if (!made) throw new Error(`${id} could not be made`);
  return made.piece;
}

/** A scene as the lab plays it: its beats (silent), its one shot list, its assets. */
function sceneOf(title: string, shape: FilmShape, durationMs: number, lines: [string, number, number][], assets: Record<string, unknown>, shots: ShotDto[]) {
  const [w, h] = shape === 'tall' ? [900, 1600] : [1600, 900];
  const beats = lines.map(([text, startMs, endMs]) => {
    const found = [...text.matchAll(/\S+/g)];
    const each = (endMs - startMs) / found.length;
    return {
      text,
      startMs,
      endMs,
      words: found.map((m, i) => [m.index, m.index! + m[0].length, Math.round(startMs + i * each), Math.round(startMs + (i + 1) * each - 40)]),
    };
  });
  return {
    version: 4,
    generator: 'kit-samples',
    title,
    ...(shape === 'tall' ? { shape: 'tall' } : {}),
    durationMs,
    settledMs: durationMs,
    timing: 'estimated',
    beats,
    things: [],
    steps: [],
    effects: [],
    sound: { mood: 'curious' },
    stagings: { box: { w, h, places: [] }, wide: { w, h, places: [] } },
    engine: 'shots',
    shots: { version: 1, look: LOOK, assets, shots, sounds: [] },
  };
}

const shot = (id: string, endMs: number, set: string, more: Partial<ShotDto> = {}): ShotDto => ({
  id,
  startMs: 0,
  endMs,
  set: { kind: 'set', asset: set },
  actors: [],
  info: [],
  life: [],
  camera: [{ move: 'establish', atMs: 0, durMs: 900 }],
  join: 'cut',
  joinMs: 0,
  ...more,
});

/** Where a piece stands and how big, by the kit's rule, on a backdrop. */
function placed(p: ReturnType<typeof piece>, family: string, id: string, set: ShotBox, ground: number, word: string, extra: Partial<Parameters<typeof placeActor>[0]> = {}) {
  return placeActor({ set, map: false, ground, piece: { box: p.box, family, id }, word, isSubject: true, index: 0, count: 1, ...extra });
}

function walk(shape: FilmShape) {
  const { asset: set, ground } = backdrop('day', shape);
  const group = piece('people.group', { pose: 'walking', count: shape === 'tall' ? 4 : 6, era: 'today' }, 'Workers', 11, shape);
  const at = placed(group, 'people', 'people.group', set.box, ground, 'left');
  const [W] = [set.box[2]];
  const actor: ShotActorDto = {
    id: 'walkers',
    asset: 'group',
    at: at.at,
    size: at.size,
    z: at.z,
    side: 'Workers',
    moves: [{ move: 'walk', atMs: 900, durMs: 5200, to: { kind: 'box', box: [W * 0.66, at.at.y - 1, 1, 1] } }],
  };
  return sceneOf('A group walking', shape, 8000, [['They walked across the square to the hall.', 600, 4200]], { set, group: toAsset(group) }, [
    shot('w1', 8000, 'set', { actors: [actor], focal: { kind: 'actor', actor: 'walkers' }, camera: [{ move: 'establish', atMs: 0, durMs: 900 }] }),
  ]);
}

function crowd(shape: FilmShape) {
  const { asset: set, ground } = backdrop('dusk', shape);
  const people = piece('people.crowd', { count: 300, pose: 'standing' }, 'Delegates', 21, shape, '#FFC58A');
  const at = placed(people, 'people', 'people.crowd', set.box, ground, 'centre');
  const actor: ShotActorDto = {
    id: 'crowd',
    asset: 'crowd',
    at: at.at,
    size: at.size,
    z: at.z,
    side: 'Delegates',
    moves: [{ move: 'cheer', atMs: 4200, durMs: 2200 }],
  };
  return sceneOf('A crowd of 300 at dusk', shape, 8000, [['Three hundred people waited in the square.', 400, 3600], ['Then the result came.', 4000, 5600]], { set, crowd: toAsset(people) }, [
    shot('c1', 8000, 'set', {
      actors: [actor],
      focal: { kind: 'actor', actor: 'crowd' },
      camera: [
        { move: 'establish', atMs: 0, durMs: 900 },
        { move: 'push', atMs: 4300, durMs: 2500, amount: 0.06 },
      ],
    }),
  ]);
}

function train(shape: FilmShape) {
  const { asset: set, ground } = backdrop('rail', shape);
  const engine = piece('vehicle.train', { kind: 'steam', wagons: 2, era: '1900-1945' }, 'Line', 31, shape);
  const [, , W, H] = set.box;
  // The train is long: it is sized by its height, the engine stopping at two thirds across, its coaches out of sight behind it.
  const scale = ((shape === 'tall' ? 0.16 : 0.3) * H) / (engine.box[3] / UNITS_PER_METRE);
  const size = (engine.box[3] / UNITS_PER_METRE) * scale;
  const k = size / engine.box[3];
  const body = engine.parts.body.box;
  const engineMiddle = body[0] + body[2] / 2;
  const pieceMiddle = engine.box[0] + engine.box[2] / 2;
  const x = W * (shape === 'tall' ? 0.6 : 0.68) - (engineMiddle - pieceMiddle) * k;
  const actor: ShotActorDto = {
    id: 'train',
    asset: 'train',
    at: { x: r1(x), y: ground - 10 },
    size: r1(size),
    z: 1,
    side: 'Line',
    moves: [
      { move: 'enter', atMs: 300, durMs: 4600 },
      { move: 'stop', atMs: 4900, durMs: 600 },
    ],
  };
  return sceneOf('A train arriving', shape, 8000, [['The first train pulled in on time.', 500, 4000]], { set, train: toAsset(engine) }, [
    shot('t1', 8000, 'set', { actors: [actor], camera: [{ move: 'establish', atMs: 0, durMs: 900 }] }),
  ]);
}

function ship(shape: FilmShape) {
  const { asset: set, ground } = backdrop('port', shape);
  const vessel = piece('vehicle.ship', { kind: 'steam', era: '1900-1945' }, 'Line', 41, shape);
  const [, , W, H] = set.box;
  const scale = ((shape === 'tall' ? 0.2 : 0.36) * H) / (vessel.box[3] / UNITS_PER_METRE);
  const size = (vessel.box[3] / UNITS_PER_METRE) * scale;
  const width = (size * vessel.box[2]) / vessel.box[3];
  const actor: ShotActorDto = {
    id: 'ship',
    asset: 'ship',
    at: { x: r1(W * 0.28 + width / 2 + 10), y: ground + 6 },
    size: r1(size),
    z: 1,
    side: 'Line',
    moves: [{ move: 'leave', atMs: 2600, durMs: 5200 }],
  };
  return sceneOf('A ship leaving port', shape, 8500, [['In 1912 the liner left port for the last time.', 400, 4200]], { set, ship: toAsset(vessel) }, [
    shot('s1', 8500, 'set', { actors: [actor], camera: [{ move: 'establish', atMs: 0, durMs: 900 }] }),
  ]);
}

function handshake(shape: FilmShape) {
  const { asset: set, ground } = backdrop('paper', shape);
  const pair = piece('people.pair', { pose: 'handshake', era: '1945-1975' }, 'ink', 51, shape);
  const at = placed(pair, 'people', 'people.pair', set.box, ground, 'centre');
  const actor: ShotActorDto = { id: 'pair', asset: 'pair', at: at.at, size: at.size, z: at.z, moves: [{ move: 'enter', atMs: 200, durMs: 700 }] };
  return sceneOf('A pair shaking hands', shape, 7000, [['The two sides agreed.', 400, 2600]], { set, pair: toAsset(pair) }, [
    shot('h1', 7000, 'set', {
      actors: [actor],
      focal: { kind: 'actor', actor: 'pair' },
      camera: [
        { move: 'establish', atMs: 0, durMs: 900 },
        { move: 'push', atMs: 2400, durMs: 3000, amount: 0.12, target: { kind: 'actor', actor: 'pair', part: 'f1.hand-l' } },
      ],
    }),
  ]);
}

mkdirSync(LAB, { recursive: true });
mkdirSync(FIXTURES, { recursive: true });
const scenes = { walk, crowd, train, ship, handshake };
for (const [name, make] of Object.entries(scenes))
  for (const shape of ['wide', 'tall'] as const) {
    const file = join(LAB, `people-${name}${shape === 'tall' ? '-tall' : ''}.json`);
    writeFileSync(file, JSON.stringify(make(shape)));
    console.log('wrote', file);
  }
// The client's test fixtures: a few small pieces, their assets only.
const fixtures: Record<string, [string, Record<string, unknown>]> = {
  'kit-walker': ['people.person', { pose: 'walking' }],
  'kit-group': ['people.group', { pose: 'walking', count: 3 }],
  'kit-crowd': ['people.crowd', { count: 20 }],
  'kit-car': ['vehicle.car', {}],
  'kit-ship': ['vehicle.ship', { kind: 'steam' }],
  'kit-rocket': ['vehicle.rocket', {}],
};
for (const [name, [id, params]] of Object.entries(fixtures)) {
  if (!KIT[id]) continue;
  const file = join(FIXTURES, `${name}.json`);
  writeFileSync(file, JSON.stringify(toAsset(piece(id, params, 'ink', 7, 'wide'))));
  console.log('wrote', file);
}

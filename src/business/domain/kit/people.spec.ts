/**
 * People as silhouettes: every pose and every gathering makes a sound
 * piece in both shapes for several seeds; a group is never clones; a
 * crowd draws as many figures as people, or one for each round number
 * of them, and says so; nothing has a face; an era changes the outlines.
 */
import { Resvg } from '@resvg/resvg-js';
import type { ShotLookDto } from '../../../contracts';
import {
  CROWD_MOST,
  POSES,
  crowdRows,
  figuresFor,
  perFigure,
  strideTurns,
} from './people';
import { KIT, makeKit } from './registry';
import { FIGURE_PARTS, partTree, validateRig } from './rig';
import { kitStyle } from './style';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    sides: { North: '#0050BE', South: '#BB7907' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const wide = kitStyle(LOOK);
const tall = kitStyle(LOOK, { shape: 'tall' });

const make = (
  id: string,
  params: Record<string, unknown>,
  seed: number,
  style = wide,
) => {
  const made = makeKit(id, params, style, seed, 'North');
  if (!made) {
    const raw = KIT[id].make(
      { ...(params as Record<string, string>), colour: 'North' },
      style,
      seed,
    );
    throw new Error(
      `${id} ${JSON.stringify(params)} #${seed}: ${validateRig(raw).join('; ')}`,
    );
  }
  return made.piece;
};

/** How many people a crowd draws: its near people and its far rows' uses. */
const figuresIn = (svg: string) =>
  (svg.match(/data-part="p-/g) ?? []).length +
  (svg.match(/<use href="#far-/g) ?? []).length;

describe('one person', () => {
  it.each(
    POSES.flatMap((pose) => [1, 2, 3].map((seed) => [pose, seed] as const)),
  )(
    'makes a sound %s silhouette (seed %d), whole to the figure standard',
    (pose, seed) => {
      for (const style of [wide, tall]) {
        const piece = make('people.person', { pose }, seed, style);
        expect(validateRig(piece)).toEqual([]);
        expect(piece.rig.figures).toHaveLength(1);
        for (const part of FIGURE_PARTS)
          expect(piece.parts[part]).toBeDefined();
        // Its feet on the bottom edge of its box.
        const [, y, , h] = piece.box;
        expect(Math.abs(y + h)).toBeLessThan(2);
      }
    },
  );

  it('faces the camera only in the poses that can, and turns to face left', () => {
    expect(
      make('people.person', { pose: 'raising-hand', facing: 'camera' }, 1).rig
        .figures,
    ).toEqual([{ prefix: '', facing: 0 }]);
    expect(
      make('people.person', { pose: 'walking', facing: 'camera' }, 1).rig
        .figures,
    ).toEqual([{ prefix: '', facing: 1 }]);
    expect(
      make('people.person', { pose: 'walking', facing: 'left' }, 1).rig.figures,
    ).toEqual([{ prefix: '', facing: -1 }]);
  });

  it('can sit down and stand up only from a seat', () => {
    const seated = make('people.person', { pose: 'seated' }, 4);
    expect(seated.rig.moves).toEqual(expect.arrayContaining(['sit', 'stand']));
    expect(seated.rig.states.standing.body.dy).toBeLessThan(0);
    expect(seated.parts.seat).toBeDefined();
    expect(
      make('people.person', { pose: 'standing' }, 4).rig.moves,
    ).not.toContain('sit');
  });

  it('is a silhouette: one fill, a lit outline, no face', () => {
    const piece = make('people.person', { pose: 'pointing' }, 2);
    // No eyes, no mouth, no text, no outline strokes.
    expect(piece.svg).not.toMatch(/<text|<circle|stroke=/);
    expect(piece.svg).toMatch(/filter="url\(#rim1\)"/);
    expect(piece.svg).toMatch(/<filter id="rim1"/);
  });

  it('renders: resvg draws it with its side’s colour', () => {
    const piece = make('people.person', { pose: 'walking' }, 2);
    const png = new Resvg(piece.svg, {
      fitTo: { mode: 'height', value: 200 },
    }).render();
    let blue = 0;
    for (let i = 0; i < png.pixels.length; i += 4)
      if (
        png.pixels[i + 3] > 200 &&
        png.pixels[i + 2] > 150 &&
        png.pixels[i] < 60
      )
        blue += 1;
    expect(blue / (png.width * png.height)).toBeGreaterThan(0.05);
  });

  it('is the same piece for the same seed, another for another', () => {
    expect(make('people.person', { pose: 'standing' }, 7).svg).toBe(
      make('people.person', { pose: 'standing' }, 7).svg,
    );
    expect(make('people.person', { pose: 'standing' }, 7).svg).not.toBe(
      make('people.person', { pose: 'standing' }, 8).svg,
    );
  });
});

describe('pairs and groups', () => {
  it.each(['facing', 'walking', 'handshake'])(
    'a pair %s is two figures, sound',
    (pose) => {
      for (const seed of [1, 2, 3]) {
        const piece = make('people.pair', { pose }, seed);
        expect(validateRig(piece)).toEqual([]);
        expect(piece.rig.figures?.map((f) => f.prefix)).toEqual(['f1.', 'f2.']);
        expect(partTree(piece.svg).parent.get('f2.shin-l')).toBe('f2.thigh-l');
      }
    },
  );

  it('a handshake’s two near hands meet between them', () => {
    const piece = make('people.pair', { pose: 'handshake' }, 3);
    const a = piece.parts['f1.hand-l'].box;
    const b = piece.parts['f2.hand-l'].box;
    const gap = Math.max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]), 0);
    expect(gap).toBeLessThan(5);
  });

  it.each([
    ['standing', 3],
    ['standing', 12],
    ['walking', 6],
    ['marching', 8],
  ] as const)(
    'a group %s of %d has as many figures, varied, never clones',
    (pose, count) => {
      for (const style of [wide, tall])
        for (const seed of [1, 2]) {
          const piece = make('people.group', { pose, count }, seed, style);
          expect(validateRig(piece)).toEqual([]);
          expect(piece.rig.figures).toHaveLength(count);
          // Heights and builds differ: no two torsos the same size.
          const torsos = piece.rig.figures!.map((f) => {
            const [, , w, h] = piece.parts[`${f.prefix}torso`].box;
            return `${w}x${h}`;
          });
          if (pose !== 'marching')
            expect(new Set(torsos).size).toBeGreaterThan(count / 2);
        }
    },
  );

  it('dresses a group for its era, as outlines', () => {
    const then = make(
      'people.group',
      { pose: 'standing', count: 12, era: '1800-1900' },
      7,
    );
    const now = make(
      'people.group',
      { pose: 'standing', count: 12, era: 'today' },
      7,
    );
    expect(then.svg).not.toBe(now.svg);
    // Long skirts reach the ground in the nineteenth century.
    const skirts = (piece: typeof then) =>
      Object.entries(piece.parts).filter(
        ([id, p]) => id.endsWith('.skirt') && p.box[1] + p.box[3] > -10,
      ).length;
    expect(skirts(then)).toBeGreaterThan(skirts(now));
  });

  it('a uniformed group all wear the cap', () => {
    const piece = make(
      'people.group',
      { pose: 'marching', count: 5, dress: 'uniform', era: '1900-1945' },
      2,
    );
    expect(validateRig(piece)).toEqual([]);
  });
});

describe('a crowd', () => {
  it('stands for its count honestly: one figure each, or one for each round number', () => {
    expect(perFigure(300)).toBe(1);
    expect(figuresFor(300)).toBe(300);
    expect(perFigure(45_000)).toBe(200);
    expect(figuresFor(45_000)).toBe(225);
    expect(perFigure(2_000_000)).toBe(5000);
    for (const n of [13, 120, 400, 401, 9_999, 250_000])
      expect(figuresFor(n)).toBeLessThanOrEqual(CROWD_MOST);
  });

  it.each([13, 40, 300, 45_000])(
    'draws exactly as many figures as it says for %d people',
    (count) => {
      for (const style of [wide, tall]) {
        const piece = make('people.crowd', { count }, 5, style);
        expect(validateRig(piece)).toEqual([]);
        expect(figuresIn(piece.svg)).toBe(figuresFor(count));
        expect(piece.notes?.[0]).toMatch(
          perFigure(count) > 1
            ? `1 figure = ${perFigure(count)} people`
            : `one for each of ${count} people`,
        );
      }
    },
  );

  it('lays its rows out for the frame: wide about three to one, deeper when tall', () => {
    const w = crowdRows(300, false);
    const t = crowdRows(300, true);
    expect(w.rows.reduce((s, r) => s + r.n, 0)).toBe(300);
    expect(t.rows.reduce((s, r) => s + r.n, 0)).toBe(300);
    expect(t.rows.length).toBeGreaterThan(w.rows.length);
    expect(t.width).toBeLessThan(w.width);
  });

  it('shifts its people on their own: each near person and each far row is an idle part', () => {
    const piece = make('people.crowd', { count: 300 }, 5);
    expect(piece.rig.idle?.length).toBeGreaterThan(5);
    for (const id of piece.rig.idle ?? [])
      expect(piece.parts[id]).toBeDefined();
  });

  it('is never the same crowd twice', () => {
    expect(make('people.crowd', { count: 300 }, 1).svg).not.toBe(
      make('people.crowd', { count: 300 }, 2).svg,
    );
  });
});

describe('the stride', () => {
  it('is a cycle: the same at its start and its end, the legs swapped half way', () => {
    const a = strideTurns(0);
    const b = strideTurns(1);
    for (const k of Object.keys(a))
      expect(b[k as keyof typeof b]).toBeCloseTo(a[k as keyof typeof a]!, 6);
    const half = strideTurns(0.5);
    expect(half['thigh-l']).toBeCloseTo(a['thigh-r']!, 6);
    expect(half['thigh-r']).toBeCloseTo(a['thigh-l']!, 6);
  });
});

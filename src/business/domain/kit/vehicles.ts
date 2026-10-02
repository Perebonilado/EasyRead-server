/**
 * Vehicles in the editorial style (explainer-animation-plan §7.2): what
 * carries trade, migration, war and industry, drawn flat in side view,
 * no outlines, a lit edge on the side the light comes from, at their real
 * sizes in the kit's units (a hundred to the metre), so a person stands
 * beside a bus as they would.
 *
 *  - Road: a cart (pushed by hand, or drawn by a horse), a car, a bus and
 *    a lorry, each as its era built them (a tall car of the 1920s, the
 *    rounded one of the 1950s, today's).
 *  - Rail: a train, its engine (steam, diesel or electric, by era) and
 *    its coaches.
 *  - Water: a ship under sail, a steamship, a container ship; drawn above
 *    its waterline, which is the bottom of its box.
 *  - Air: a propeller plane and a jet; and a rocket standing on its fins.
 *
 * Each is rigged for the stage (rig.ts): its `body` (the part that bobs
 * on its springs, rides the swell or tilts into a climb), its wheels
 * (`wheel-1`…, each turning about its hub, its radius the part's value,
 * so the stage turns it by the ground covered), its `lights`, and the
 * points the life layer starts from: `smoke` (a chimney, a funnel, an
 * exhaust), `wake` (a ship's foam, longer as it goes faster) and `flame`
 * (a rocket's, while it rises). A horse's legs (`leg-1`…) step as it
 * goes. Its moves: enter, travel-to, stop, leave.
 */
import type { ShotBox } from '../../../contracts';
import { ERA_IDS, type EraId } from './eras';
import type { KitEntry, KitParams } from './registry';
import { type KitPiece, type RigPart, assemble, svgOf } from './rig';
import { rand, type Rand } from './seed';
import {
  type Pt,
  type Shape,
  awayFrom,
  blob,
  capsule,
  circle,
  ellipse,
  groundShadow,
  mapShape,
  rect,
  rimFilter,
  rounded,
  unionBox,
} from './shape';
import { type KitStyle, colourOf, fillsOf, mixOk, shadeOk } from './style';

/** The colours a vehicle is painted in, from its side's colour (or the ink). */
interface Paint {
  body: string;
  trim: string;
  glass: string;
  dark: string;
  metal: string;
  light: string;
  pale: string;
}

function paintOf(style: KitStyle, colour: string): Paint {
  const fills = fillsOf(style, colour);
  return {
    body: fills.body,
    trim: fills.shade,
    glass: fills.glass,
    dark: fills.dark,
    metal: fills.metal,
    light: fills.light,
    pale: mixOk(style.paper, fills.body, 0.12),
  };
}

/** A vehicle being drawn: its parts in paint order, each a few filled shapes. */
class Sketch {
  readonly parts: RigPart[] = [];
  readonly values = new Map<string, number>();
  constructor(readonly paint: Paint) {}

  /** A part of filled shapes, under `parent`, turning about `pivot`. */
  part(
    id: string,
    parent: string | null,
    shapes: readonly (readonly [Shape, string])[],
    pivot: Pt,
    attrs?: string,
  ): void {
    const drawn = shapes.filter(([s]) => s.d);
    this.parts.push({
      id,
      parent,
      markup: drawn
        .map(([s, fill]) => `<path d="${s.d}" fill="${fill}"/>`)
        .join(''),
      box: unionBox(drawn.map(([s]) => s.box)),
      pivot,
      ...(attrs ? { attrs } : {}),
    });
  }

  /** An empty part a recipe or the life layer can point at: where smoke rises, where a wake starts. */
  anchor(id: string, parent: string, at: Pt): void {
    this.parts.push({
      id,
      parent,
      markup: `<circle cx="${Math.round(at[0])}" cy="${Math.round(at[1])}" r="1" fill="none"/>`,
      box: [at[0] - 1, at[1] - 1, 2, 2],
      pivot: at,
    });
  }

  /**
   * A wheel turning about its hub: its tyre, its rim and hub, and spokes
   * (or holes) so its turning shows. `kind` sets the look: a car's, a
   * cart's or an engine's spoked wheel, a rail wheel.
   */
  wheel(
    id: string,
    parent: string | null,
    c: Pt,
    r: number,
    kind: 'car' | 'spoked' | 'rail',
  ): void {
    const p = this.paint;
    const shapes: [Shape, string][] = [[circle(c, r), p.dark]];
    if (kind === 'car') {
      shapes.push([circle(c, r * 0.6), p.metal], [circle(c, r * 0.2), p.dark]);
      for (let k = 0; k < 5; k += 1) {
        const a = (k * 2 * Math.PI) / 5;
        shapes.push([
          circle(
            [c[0] + Math.cos(a) * r * 0.4, c[1] + Math.sin(a) * r * 0.4],
            r * 0.07,
          ),
          p.dark,
        ]);
      }
    } else {
      const inner = kind === 'rail' ? r * 0.86 : r * 0.84;
      shapes.push(
        [circle(c, inner), p.metal],
        [circle(c, inner * 0.82), p.dark],
      );
      const spokes = kind === 'rail' ? 10 : 12;
      for (let k = 0; k < spokes; k += 1) {
        const a = (k * 2 * Math.PI) / spokes;
        shapes.push([
          capsule(
            c,
            r * 0.05,
            [
              c[0] + Math.cos(a) * inner * 0.8,
              c[1] + Math.sin(a) * inner * 0.8,
            ],
            r * 0.035,
          ),
          p.metal,
        ]);
      }
      shapes.push([circle(c, r * 0.16), p.metal]);
    }
    this.part(id, parent, shapes, c);
    this.values.set(id, Math.round(r * 10) / 10);
  }
}

/** A wheel's arch: the top half of a circle round its hub, flat across the hub. */
function arch(c: Pt, r: number): Shape {
  const pts: Pt[] = [];
  for (let k = 0; k <= 12; k += 1) {
    const a = Math.PI + (k * Math.PI) / 12;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return rounded(pts, 0);
}

/** A vehicle's era: the one asked for, else today. */
const eraParam = (params: KitParams): EraId =>
  (ERA_IDS as readonly string[]).includes(String(params.era))
    ? (params.era as EraId)
    : 'today';
const at = (era: EraId) => ERA_IDS.indexOf(era);
/** Whether an era is before another (the 1950s before today). */
const before = (era: EraId, than: EraId) => at(era) < at(than);

// ── Road ──────────────────────────────────────────────────────────────────

/** A car as its era built it: tall with mudguards and running boards before the war, round in the fifties, low and smooth since. */
function car(s: Sketch, era: EraId): void {
  const p = s.paint;
  if (before(era, '1945-1975')) {
    // The 1920s: a tall cabin, a long bonnet, mudguards over spoked wheels.
    const r = 38;
    s.part(
      'body',
      null,
      [
        [
          rounded(
            [
              [20, -60],
              [395, -60],
              [395, -112],
              [300, -125],
              [262, -125],
              [255, -205],
              [70, -210],
              [40, -190],
              [20, -120],
            ],
            10,
          ),
          p.body,
        ],
        [
          rounded(
            [
              [255, -127],
              [395, -114],
              [395, -132],
              [258, -138],
            ],
            4,
          ),
          p.trim,
        ],
        [rect(90, -195, 70, 60, 6), p.glass],
        [rect(172, -195, 70, 60, 6), p.glass],
        [rect(258, -205, 8, 80, 2), p.glass],
        [
          blob(
            [
              [20, -48],
              [80, -110],
              [140, -110],
              [175, -60],
              [300, -60],
              [330, -110],
              [390, -110],
              [420, -48],
            ],
            0.5,
          ),
          p.trim,
        ],
      ],
      [210, -60],
      'filter="url(#rim)"',
    );
    s.part(
      'lights',
      'body',
      [[ellipse([408, -105], 10, 12), p.light]],
      [408, -105],
    );
    s.anchor('smoke', 'body', [18, -50]);
    s.wheel('wheel-1', null, [105, -r], r, 'spoked');
    s.wheel('wheel-2', null, [355, -r], r, 'spoked');
    return;
  }
  const r = 33;
  const old = before(era, '1975-2000');
  s.part(
    'body',
    null,
    [
      [
        blob(
          old
            ? [
                [10, -30],
                [470, -30],
                [478, -62],
                [440, -80],
                [330, -88],
                [290, -132],
                [150, -134],
                [105, -92],
                [20, -86],
                [6, -60],
              ]
            : [
                [12, -26],
                [410, -26],
                [418, -58],
                [395, -74],
                [300, -90],
                [238, -140],
                [128, -142],
                [52, -98],
                [14, -88],
                [8, -50],
              ],
          0.55,
        ),
        p.body,
      ],
      [
        blob(
          old
            ? [
                [290, -96],
                [286, -126],
                [228, -128],
                [228, -96],
              ]
            : [
                [293, -94],
                [238, -133],
                [186, -134],
                [186, -94],
              ],
          0.3,
        ),
        p.glass,
      ],
      [
        blob(
          old
            ? [
                [220, -96],
                [220, -128],
                [158, -128],
                [118, -96],
              ]
            : [
                [178, -94],
                [178, -134],
                [134, -135],
                [66, -97],
              ],
          0.3,
        ),
        p.glass,
      ],
      [arch(old ? [100, -31] : [80, -28], r * 1.25), p.trim],
      [arch(old ? [390, -31] : [345, -28], r * 1.25), p.trim],
    ],
    [old ? 240 : 210, -26],
    'filter="url(#rim)"',
  );
  s.part(
    'lights',
    'body',
    [[ellipse(old ? [470, -58] : [410, -60], 7, 9), p.light]],
    old ? [470, -58] : [410, -60],
  );
  s.anchor('smoke', 'body', [10, -32]);
  s.wheel('wheel-1', null, [old ? 100 : 80, -r], r, 'car');
  s.wheel('wheel-2', null, [old ? 390 : 345, -r], r, 'car');
}

/** A bus: a bonneted one before the war, a round-ended coach after it, today's tall box. */
function bus(s: Sketch, era: EraId): void {
  const p = s.paint;
  const r = 50;
  const windows = (
    x0: number,
    x1: number,
    top: number,
    h: number,
  ): [Shape, string][] => {
    const n = Math.max(3, Math.round((x1 - x0) / 115));
    const w = (x1 - x0) / n;
    return Array.from(
      { length: n },
      (_, k) =>
        [rect(x0 + k * w + 8, top, w - 16, h, 10), p.glass] as [Shape, string],
    );
  };
  if (before(era, '1945-1975')) {
    s.part(
      'body',
      null,
      [
        [
          rounded(
            [
              [20, -45],
              [700, -45],
              [700, -290],
              [40, -300],
              [20, -270],
            ],
            18,
          ),
          p.body,
        ],
        [
          rounded(
            [
              [700, -45],
              [850, -45],
              [850, -140],
              [700, -160],
            ],
            14,
          ),
          p.body,
        ],
        ...windows(40, 690, -270, 85),
        [rect(30, -165, 670, 14, 6), p.trim],
      ],
      [430, -45],
      'filter="url(#rim)"',
    );
    s.part(
      'lights',
      'body',
      [[ellipse([848, -115], 10, 13), p.light]],
      [848, -115],
    );
    s.anchor('smoke', 'body', [18, -40]);
    s.wheel('wheel-1', null, [190, -r], r, 'spoked');
    s.wheel('wheel-2', null, [720, -r], r, 'spoked');
    return;
  }
  const round = before(era, '1975-2000');
  const L = round ? 1000 : 1150;
  s.part(
    'body',
    null,
    [
      [
        round
          ? blob(
              [
                [20, -40],
                [L - 10, -40],
                [L, -150],
                [L - 40, -280],
                [L - 160, -300],
                [120, -300],
                [30, -270],
                [12, -150],
              ],
              0.45,
            )
          : rect(15, -320, L - 25, 280, 30),
        p.body,
      ],
      ...windows(
        round ? 70 : 50,
        L - (round ? 110 : 200),
        round ? -270 : -295,
        round ? 90 : 120,
      ),
      [
        rounded(
          [
            [L - (round ? 95 : 170), -280],
            [L - 20, -270],
            [L - 15, round ? -160 : -150],
            [L - (round ? 95 : 170), -150],
          ],
          14,
        ),
        p.glass,
      ],
      [rect(L - (round ? 190 : 260), -260, 60, 200, 10), p.trim],
      [rect(25, -125, L - 50, 12, 6), p.trim],
    ],
    [L / 2, -40],
    'filter="url(#rim)"',
  );
  s.part(
    'lights',
    'body',
    [[ellipse([L - 18, -85], 9, 12), p.light]],
    [L - 18, -85],
  );
  s.anchor('smoke', 'body', [16, -45]);
  s.wheel('wheel-1', null, [round ? 210 : 230, -r], r, 'car');
  s.wheel('wheel-2', null, [L - (round ? 220 : 280), -r], r, 'car');
}

/** A lorry: an open bed behind a bonnet before the war, a box behind a bonnet after, a box behind a flat cab today. */
function lorry(s: Sketch, era: EraId): void {
  const p = s.paint;
  const r = 52;
  const flat = !before(era, '1975-2000');
  const old = before(era, '1945-1975');
  const cab: [Shape, string][] = flat
    ? [
        [
          rounded(
            [
              [880, -55],
              [1075, -55],
              [1080, -300],
              [1050, -345],
              [880, -345],
            ],
            22,
          ),
          p.body,
        ],
        [
          rounded(
            [
              [1000, -310],
              [1060, -305],
              [1066, -200],
              [1000, -200],
            ],
            10,
          ),
          p.glass,
        ],
      ]
    : [
        [
          rounded(
            [
              [760, -55],
              [1040, -55],
              [1040, -170],
              [920, -185],
              [900, -300],
              [760, -300],
            ],
            16,
          ),
          p.body,
        ],
        [
          rounded(
            [
              [790, -285],
              [885, -285],
              [900, -195],
              [790, -195],
            ],
            10,
          ),
          p.glass,
        ],
      ];
  const bed: [Shape, string][] = old
    ? [
        [rect(30, -165, 720, 110, 8), p.trim],
        ...Array.from(
          { length: 6 },
          (_, k) =>
            [rect(60 + k * 115, -160, 14, 95, 4), p.body] as [Shape, string],
        ),
      ]
    : [
        [
          rect(25, -380, flat ? 840 : 720, 325, 12),
          mixOk(p.body, p.pale, 0.18),
        ],
      ];
  s.part(
    'body',
    null,
    [...bed, ...cab, [rect(25, -70, flat ? 1050 : 1010, 18, 6), p.dark]],
    [540, -55],
    'filter="url(#rim)"',
  );
  s.part(
    'lights',
    'body',
    [[ellipse([flat ? 1075 : 1036, -95], 9, 12), p.light]],
    [flat ? 1075 : 1036, -95],
  );
  s.anchor('smoke', 'body', flat ? [880, -350] : [20, -60]);
  const kind = old ? 'spoked' : 'car';
  s.wheel('wheel-1', null, [160, -r], r, kind);
  if (!old) s.wheel('wheel-2', null, [300, -r], r, kind);
  s.wheel(old ? 'wheel-2' : 'wheel-3', null, [flat ? 960 : 900, -r], r, kind);
}

/**
 * A cart: pushed by hand on two big wheels, or drawn by a horse between
 * its shafts. The horse is a silhouette like the people, its four legs
 * parts that step as the cart goes.
 */
function cart(s: Sketch, kind: string): void {
  const p = s.paint;
  const r = 62;
  const wood = mixOk(p.body, p.pale, 0.35);
  s.part(
    'body',
    null,
    [
      [
        rounded(
          [
            [10, -150],
            [250, -150],
            [250, -85],
            [10, -85],
          ],
          8,
        ),
        wood,
      ],
      [rect(10, -205, 240, 14, 4), wood],
      [rect(18, -205, 12, 120, 3), wood],
      [rect(230, -205, 12, 120, 3), wood],
      [
        capsule(
          [240, -110],
          7,
          [kind === 'animal' ? 650 : 380, kind === 'animal' ? -150 : -95],
          6,
        ),
        wood,
      ],
    ],
    [130, -85],
    'filter="url(#rim)"',
  );
  if (kind === 'animal') {
    // A draught horse, facing the way the cart goes.
    const horse = (dx: number, dy: number): Pt => [440 + dx, dy];
    s.part(
      'horse',
      null,
      [
        [
          blob(
            [
              horse(0, -168),
              horse(28, -200),
              horse(190, -206),
              horse(236, -190),
              horse(252, -150),
              horse(226, -114),
              horse(34, -112),
              horse(4, -136),
            ],
            0.8,
          ),
          p.body,
        ],
        // The neck rising forward from the withers, the head down to the muzzle.
        [
          blob(
            [
              horse(190, -200),
              horse(232, -252),
              horse(272, -292),
              horse(300, -300),
              horse(326, -270),
              horse(352, -226),
              horse(340, -208),
              horse(312, -220),
              horse(284, -238),
              horse(250, -158),
            ],
            0.75,
          ),
          p.body,
        ],
        [capsule(horse(292, -294), 7, horse(286, -318), 4), p.body],
        [capsule(horse(6, -170), 10, horse(-24, -98), 7), p.trim],
      ],
      horse(120, -112),
      'filter="url(#rim)"',
    );
    const legs: [number, number, string][] = [
      [35, -125, p.trim],
      [190, -125, p.trim],
      [55, -125, p.body],
      [210, -125, p.body],
    ];
    legs.forEach(([x, y, fill], k) =>
      s.part(
        `leg-${k + 1}`,
        'horse',
        [
          [capsule(horse(x, y), 17, horse(x + 4, -50), 9), fill],
          [capsule(horse(x + 4, -50), 9, horse(x + 6, -6), 8), fill],
        ],
        horse(x, y),
      ),
    );
  }
  s.wheel('wheel-1', null, [130, -r], r, 'spoked');
}

// ── Rail ──────────────────────────────────────────────────────────────────

/** A coach, its window band and its two bogies, its back end at x. */
function coach(
  s: Sketch,
  k: number,
  x: number,
  era: EraId,
  wheel: number,
): number {
  const p = s.paint;
  const L = 1500;
  const id = `wagon-${k}`;
  const old = before(era, '1945-1975');
  const windows: [Shape, string][] = Array.from({ length: 8 }, (_, i) => [
    rect(x + 90 + i * 168, -330, 120, old ? 120 : 95, old ? 8 : 16),
    p.glass,
  ]);
  s.part(
    id,
    null,
    [
      [
        rounded(
          [
            [x, -95],
            [x + L, -95],
            [x + L, -380],
            [x + L - 40, -410],
            [x + 40, -410],
            [x, -380],
          ],
          24,
        ),
        p.body,
      ],
      ...windows,
      [rect(x, -150, L, 14, 4), p.trim],
      [rect(x - 60, -150, 60, 22, 4), p.dark],
    ],
    [x + L / 2, -95],
    'filter="url(#rim)"',
  );
  for (const [i, wx] of [x + 200, x + 330, x + L - 330, x + L - 200].entries())
    s.wheel(`wheel-${wheel + i}`, id, [wx, -55], 55, 'rail');
  return x + L + 60;
}

/** A train: its engine (steam before the 1950s, diesel to the 1970s, electric since) and its coaches behind it. */
function train(s: Sketch, era: EraId, kind: string, wagons: number): void {
  const p = s.paint;
  const engine =
    kind === 'steam' || kind === 'diesel' || kind === 'electric'
      ? kind
      : before(era, '1945-1975')
        ? 'steam'
        : before(era, '1975-2000')
          ? 'diesel'
          : 'electric';
  // The coaches first, from the back, the engine at the front (on the right).
  let x = 0;
  let wheel = 1;
  for (let k = wagons; k >= 1; k -= 1) {
    x = coach(s, k, x, era, wheel);
    wheel += 4;
  }
  const e = x;
  if (engine === 'steam') {
    s.part(
      'body',
      null,
      [
        [
          rounded(
            [
              [e, -110],
              [e + 520, -110],
              [e + 520, -330],
              [e, -330],
            ],
            14,
          ),
          p.trim,
        ],
        [
          rounded(
            [
              [e + 520, -110],
              [e + 820, -110],
              [e + 820, -430],
              [e + 520, -440],
            ],
            16,
          ),
          p.body,
        ],
        [rect(e + 570, -400, 90, 110, 10), p.glass],
        [
          rounded(
            [
              [e + 800, -150],
              [e + 1540, -150],
              [e + 1540, -330],
              [e + 800, -330],
            ],
            90,
          ),
          p.body,
        ],
        [rect(e + 1420, -430, 70, 120, 10), p.dark],
        [rect(e + 1400, -445, 110, 26, 8), p.dark],
        [ellipse([e + 1180, -340], 55, 38), p.body],
        [
          rounded(
            [
              [e + 1540, -110],
              [e + 1640, -60],
              [e + 1540, -60],
            ],
            6,
          ),
          p.dark,
        ],
      ],
      [e + 900, -110],
      'filter="url(#rim)"',
    );
    s.part(
      'lights',
      'body',
      [[ellipse([e + 1540, -300], 16, 20), p.light]],
      [e + 1540, -300],
    );
    s.anchor('smoke', 'body', [e + 1455, -450]);
    for (const [i, wx] of [e + 880, e + 1080, e + 1280].entries())
      s.wheel(`wheel-${wheel + i}`, null, [wx, -88], 88, 'spoked');
    s.wheel(`wheel-${wheel + 3}`, null, [e + 1470, -50], 50, 'rail');
    s.wheel(`wheel-${wheel + 4}`, null, [e + 120, -50], 50, 'rail');
    s.wheel(`wheel-${wheel + 5}`, null, [e + 400, -50], 50, 'rail');
    return;
  }
  const L = engine === 'diesel' ? 1700 : 2000;
  s.part(
    'body',
    null,
    [
      [
        engine === 'diesel'
          ? rounded(
              [
                [e, -95],
                [e + L, -95],
                [e + L, -330],
                [e + L - 120, -420],
                [e, -420],
              ],
              30,
            )
          : blob(
              [
                [e, -95],
                [e + L - 40, -95],
                [e + L, -130],
                [e + L - 120, -300],
                [e + L - 560, -410],
                [e, -410],
              ],
              0.35,
            ),
        p.body,
      ],
      [
        engine === 'diesel'
          ? rounded(
              [
                [e + L - 260, -390],
                [e + L - 115, -390],
                [e + L - 40, -320],
                [e + L - 260, -320],
              ],
              12,
            )
          : blob(
              [
                [e + L - 460, -380],
                [e + L - 240, -330],
                [e + L - 200, -300],
                [e + L - 460, -300],
              ],
              0.3,
            ),
        p.glass,
      ],
      ...Array.from(
        { length: engine === 'diesel' ? 4 : 6 },
        (_, i) =>
          [rect(e + 120 + i * 190, -330, 120, 70, 14), p.glass] as [
            Shape,
            string,
          ],
      ),
      [rect(e, -160, L - 60, 16, 6), p.trim],
      ...(engine === 'electric'
        ? [
            [capsule([e + 500, -415], 6, [e + 640, -480], 5), p.dark] as [
              Shape,
              string,
            ],
          ]
        : []),
    ],
    [e + L / 2, -95],
    'filter="url(#rim)"',
  );
  s.part(
    'lights',
    'body',
    [[ellipse([e + L - 30, -160], 14, 12), p.light]],
    [e + L - 30, -160],
  );
  s.anchor('smoke', 'body', [e + 300, -425]);
  for (const [i, wx] of [e + 220, e + 360, e + L - 380, e + L - 240].entries())
    s.wheel(`wheel-${wheel + i}`, null, [wx, -55], 55, 'rail');
}

// ── Water ─────────────────────────────────────────────────────────────────

/** A ship, its waterline on y = 0: under sail, under steam, or carrying containers; its wake behind its stern. */
function ship(s: Sketch, era: EraId, kind: string, r: Rand): void {
  const p = s.paint;
  const which =
    kind === 'sail' || kind === 'steam' || kind === 'container'
      ? kind
      : before(era, '1800-1900')
        ? 'sail'
        : before(era, '1945-1975')
          ? 'steam'
          : 'container';
  const sail = mixOk(s.paint.pale, '#ffffff', 0.35);
  if (which === 'sail') {
    const L = 3800;
    s.part(
      'wake',
      null,
      [
        [
          blob(
            [
              [0, 0],
              [-900, 0],
              [-700, -30],
              [0, -60],
            ],
            0.5,
          ),
          mixOk(p.pale, '#ffffff', 0.5),
        ],
      ],
      [0, -20],
    );
    const masts: [Shape, string][] = [];
    for (const [i, mx] of [1000, 1900, 2800].entries()) {
      const h = [2600, 3100, 2500][i];
      masts.push([rect(mx - 22, -h, 44, h - 300, 10), p.trim]);
      for (const [j, top] of [0.2, 0.45, 0.68].entries()) {
        const y = -h + top * (h - 300);
        const w = [520, 640, 700][j] * (i === 1 ? 1.1 : 0.95);
        masts.push([
          blob(
            [
              [mx - w / 2, y],
              [mx + w / 2, y],
              [mx + w / 2 + 40, y + 520],
              [mx, y + 600],
              [mx - w / 2 - 40, y + 520],
            ],
            0.4,
          ),
          sail,
        ]);
      }
    }
    s.part(
      'body',
      null,
      [
        ...masts,
        [
          blob(
            [
              [0, 0],
              [L - 200, 0],
              [L + 150, -420],
              [L - 60, -480],
              [L - 400, -380],
              [400, -380],
              [60, -560],
              [-40, -540],
            ],
            0.35,
          ),
          p.body,
        ],
        [rect(150, -300, L - 500, 30, 10), p.trim],
        [capsule([L - 60, -470], 18, [L + 700, -820], 10), p.trim],
      ],
      [L / 2, 0],
      'filter="url(#rim)"',
    );
    return;
  }
  if (which === 'steam') {
    const L = 8000;
    s.part(
      'wake',
      null,
      [
        [
          blob(
            [
              [0, 0],
              [-1800, 0],
              [-1400, -45],
              [0, -90],
            ],
            0.5,
          ),
          mixOk(p.pale, '#ffffff', 0.5),
        ],
      ],
      [0, -30],
    );
    s.part(
      'body',
      null,
      [
        [
          blob(
            [
              [0, 0],
              [L - 300, 0],
              [L + 150, -760],
              [L - 200, -780],
              [300, -720],
              [-40, -700],
            ],
            0.3,
          ),
          p.body,
        ],
        [rect(1500, -1150, 4600, 400, 30), sail],
        [rect(2200, -1450, 3200, 320, 30), sail],
        ...Array.from(
          { length: 14 },
          (_, i) =>
            [circle([1700 + i * 300, -950], 45), p.glass] as [Shape, string],
        ),
        [
          rounded(
            [
              [3300, -1450],
              [3700, -1450],
              [3760, -2300],
              [3240, -2300],
            ],
            30,
          ),
          p.trim,
        ],
        [rect(3230, -2150, 540, 120, 10), mixOk(p.body, '#ffffff', 0.15)],
        [
          rounded(
            [
              [4350, -1450],
              [4750, -1450],
              [4810, -2300],
              [4290, -2300],
            ],
            30,
          ),
          p.trim,
        ],
        [rect(4280, -2150, 540, 120, 10), mixOk(p.body, '#ffffff', 0.15)],
        [rect(1100, -2700, 50, 1600, 20), p.trim],
        [rect(6400, -2600, 50, 1500, 20), p.trim],
        [rect(0, -140, L - 200, 60, 20), p.dark],
      ],
      [L / 2, 0],
      'filter="url(#rim)"',
    );
    s.anchor('smoke', 'body', [3500, -2320]);
    return;
  }
  const L = 22000;
  s.part(
    'wake',
    null,
    [
      [
        blob(
          [
            [0, 0],
            [-4000, 0],
            [-3000, -80],
            [0, -160],
          ],
          0.5,
        ),
        mixOk(p.pale, '#ffffff', 0.5),
      ],
    ],
    [0, -50],
  );
  const boxes: [Shape, string][] = [];
  const tints = [
    p.body,
    mixOk(p.body, p.pale, 0.35),
    shadeOk(p.body, 0.18),
    mixOk(p.metal, p.body, 0.3),
  ];
  for (let col = 0; col < 26; col += 1) {
    const stack = 3 + Math.floor(r() * 3);
    for (let h = 0; h < stack; h += 1)
      boxes.push([
        rect(2700 + col * 640, -1500 - (h + 1) * 260, 610, 245, 12),
        tints[Math.floor(r() * tints.length)],
      ]);
  }
  s.part(
    'body',
    null,
    [
      [
        blob(
          [
            [0, 0],
            [L - 900, 0],
            [L + 300, -1350],
            [L - 300, -1500],
            [300, -1500],
            [-80, -1400],
          ],
          0.25,
        ),
        shadeOk(p.body, 0.25),
      ],
      ...boxes,
      [rect(400, -3900, 1700, 2400, 40), sail],
      [rect(300, -3700, 1900, 160, 20), mixOk(sail, p.body, 0.2)],
      ...Array.from(
        { length: 6 },
        (_, i) =>
          [rect(520 + i * 260, -3480, 180, 120, 14), p.glass] as [
            Shape,
            string,
          ],
      ),
      [rect(900, -4400, 300, 520, 20), p.trim],
      [rect(0, -220, L - 700, 90, 30), p.dark],
    ],
    [L / 2, 0],
    'filter="url(#rim)"',
  );
  s.anchor('smoke', 'body', [1050, -4420]);
}

// ── Air ───────────────────────────────────────────────────────────────────

/** A plane in side view, its belly on y = 0: a propeller plane before the jet age, a jet since. */
function plane(s: Sketch, era: EraId, kind: string): void {
  const p = s.paint;
  const jet =
    kind === 'jet'
      ? true
      : kind === 'propeller'
        ? false
        : !before(era, '1945-1975');
  if (!jet) {
    const L = 1200;
    s.part(
      'body',
      null,
      [
        [
          blob(
            [
              [0, -150],
              [180, -190],
              [900, -200],
              [1150, -170],
              [1180, -110],
              [1100, -40],
              [700, 0],
              [300, -40],
              [60, -120],
            ],
            0.6,
          ),
          p.body,
        ],
        [
          blob(
            [
              [40, -150],
              [-10, -360],
              [80, -360],
              [220, -180],
            ],
            0.3,
          ),
          p.body,
        ],
        [
          rounded(
            [
              [60, -170],
              [300, -175],
              [300, -150],
              [60, -145],
            ],
            10,
          ),
          p.trim,
        ],
        [
          rounded(
            [
              [420, -105],
              [820, -100],
              [840, -70],
              [420, -75],
            ],
            18,
          ),
          p.trim,
        ],
        [
          blob(
            [
              [820, -205],
              [900, -270],
              [980, -265],
              [1000, -205],
            ],
            0.5,
          ),
          p.glass,
        ],
      ],
      [L / 2, 0],
      'filter="url(#rim)"',
    );
    s.part(
      'propeller',
      'body',
      [[ellipse([1195, -105], 18, 98), mixOk(p.pale, p.dark, 0.25)]],
      [1195, -105],
    );
    s.anchor('smoke', 'body', [1150, -60]);
    return;
  }
  const L = 4000;
  s.part(
    'body',
    null,
    [
      [
        blob(
          [
            [0, -260],
            [250, -330],
            [3400, -340],
            [3850, -300],
            [4000, -200],
            [3900, -110],
            [3300, -60],
            [600, -50],
            [120, -150],
          ],
          0.55,
        ),
        p.body,
      ],
      [
        blob(
          [
            [60, -280],
            [-60, -1100],
            [200, -1100],
            [520, -330],
          ],
          0.25,
        ),
        p.body,
      ],
      [
        blob(
          [
            [1500, -150],
            [2600, -180],
            [2750, -120],
            [1700, -60],
          ],
          0.3,
        ),
        p.trim,
      ],
      [
        rounded(
          [
            [1950, -120],
            [2450, -120],
            [2470, -20],
            [1950, -20],
          ],
          40,
        ),
        shadeOk(p.body, 0.2),
      ],
      [rect(600, -260, 2800, 40, 20), p.glass],
      [
        blob(
          [
            [3640, -300],
            [3800, -290],
            [3860, -240],
            [3640, -245],
          ],
          0.4,
        ),
        p.glass,
      ],
    ],
    [L / 2, 0],
    'filter="url(#rim)"',
  );
  s.anchor('smoke', 'body', [1950, -70]);
}

/** A rocket on its fins: the body, the nose, a band, and the flame under it while it rises. */
function rocket(s: Sketch): void {
  const p = s.paint;
  s.part(
    'flame',
    null,
    [
      [
        blob(
          [
            [-220, 0],
            [220, 0],
            [140, 900],
            [0, 1500],
            [-140, 900],
          ],
          0.6,
        ),
        mixOk(p.light, '#ff9b3d', 0.45),
      ],
      [
        blob(
          [
            [-120, 0],
            [120, 0],
            [60, 600],
            [0, 900],
            [-60, 600],
          ],
          0.6,
        ),
        p.light,
      ],
    ],
    [0, 0],
  );
  s.part(
    'body',
    null,
    [
      [
        rounded(
          [
            [-450, -500],
            [450, -500],
            [450, -5200],
            [-450, -5200],
          ],
          30,
        ),
        p.pale,
      ],
      [
        blob(
          [
            [-450, -5150],
            [450, -5150],
            [300, -6200],
            [0, -7000],
            [-300, -6200],
          ],
          0.5,
        ),
        p.body,
      ],
      [rect(-450, -3300, 900, 260, 10), p.body],
      [rect(-450, -1500, 900, 160, 10), p.trim],
      [
        blob(
          [
            [-450, -1600],
            [-450, -500],
            [-900, 0],
            [-900, -300],
          ],
          0.2,
        ),
        p.body,
      ],
      [
        blob(
          [
            [450, -1600],
            [450, -500],
            [900, 0],
            [900, -300],
          ],
          0.2,
        ),
        p.body,
      ],
      [
        rounded(
          [
            [-300, -500],
            [300, -500],
            [380, 0],
            [-380, 0],
          ],
          20,
        ),
        p.dark,
      ],
    ],
    [0, -500],
    'filter="url(#rim)"',
  );
  s.anchor('smoke', 'body', [0, 0]);
}

// ── Putting a vehicle together ────────────────────────────────────────────

type Draw = (s: Sketch, params: KitParams, era: EraId, r: Rand) => void;

/** How each vehicle goes, for the stage's moves. */
const GOES: Record<string, 'road' | 'rail' | 'water' | 'air' | 'up'> = {
  cart: 'road',
  car: 'road',
  bus: 'road',
  lorry: 'road',
  train: 'rail',
  ship: 'water',
  plane: 'air',
  rocket: 'up',
};

/** A vehicle piece: drawn facing right, mirrored to face left, its box from its drawing with its wheels or keel on the bottom edge. */
function vehiclePiece(
  name: string,
  draw: Draw,
  params: KitParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const r = rand(seed);
  const era = eraParam(params);
  const colour = colourOf(
    style,
    typeof params.colour === 'string' ? params.colour : undefined,
  );
  const s = new Sketch(paintOf(style, colour));
  draw(s, params, era, r);
  const facing: 1 | -1 = params.facing === 'left' ? -1 : 1;
  // Mirrored, every point of every part, to face left.
  const parts = facing > 0 ? s.parts : s.parts.map((part) => mirrorPart(part));
  // What it is, without what trails it (a wake, a flame): its box and what the camera frames.
  const drawn = unionBox(
    parts
      .filter((part) => part.id !== 'wake' && part.id !== 'flame')
      .map((part) => part.box!)
      .filter((b) => b && (b[2] > 2 || b[3] > 2)),
  );
  const [x, y, w, h] = drawn;
  const margin = Math.max(w, h) * 0.02;
  const bottom = Math.max(0, Math.min(y + h, 0));
  const box: ShotBox = [
    x - margin,
    y - margin,
    w + 2 * margin,
    bottom - (y - margin),
  ].map((v) => Math.round(v * 10) / 10) as ShotBox;
  const built = assemble(parts);
  for (const [id, value] of s.values)
    if (built.parts[id]) built.parts[id].value = value;
  // The rim, from the light's side, scaled to the vehicle: about a person's.
  const away = awayFrom(style.rim.angle, Math.max(2.5, Math.min(w, h) * 0.012));
  const defs = `<defs>${rimFilter('rim', away, style.rim.colour, style.rim.strength)}</defs>`;
  const goes = GOES[name];
  const ground = goes === 'road' || goes === 'rail' || goes === 'up';
  const shadow = ground
    ? groundShadow(
        'shadow',
        [x + w / 2, 0],
        w * 0.48,
        w * 0.48 * style.shadow.squash * (goes === 'up' ? 1 : 0.35),
        style.shadow.colour,
        style.shadow.opacity,
      )
    : '';
  const body = built.parts.body?.box ?? drawn;
  return {
    id: `vehicle.${name}`,
    svg: svgOf(box, `${defs}${shadow}${built.markup}`),
    parts: built.parts,
    rig: {
      states: { rest: {} },
      moves: ['enter', 'travel-to', 'stop', 'leave', 'exit'],
      vehicle: { goes, facing },
    },
    focal: clip(name === 'train' ? body : drawn, box),
    box,
    colours: ['side'],
  };
}

/** A box cut to another. */
function clip([x, y, w, h]: ShotBox, [cx, cy, cw, ch]: ShotBox): ShotBox {
  const x0 = Math.max(x, cx);
  const y0 = Math.max(y, cy);
  const x1 = Math.min(x + w, cx + cw);
  const y1 = Math.min(y + h, cy + ch);
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)].map(
    (v) => Math.round(v * 10) / 10,
  ) as ShotBox;
}

/** A part turned to face left: its shapes mirrored about x = 0, its pivot with them. */
function mirrorPart(part: RigPart): RigPart {
  const flip = ([px, py]: Pt): Pt => [-px, py];
  const markup = part.markup
    .replace(
      / d="([^"]+)"/g,
      (_, d: string) => ` d="${mapShape({ d, box: [0, 0, 0, 0] }, flip).d}"`,
    )
    .replace(/ cx="(-?[\d.]+)"/g, (_, cx: string) => ` cx="${-Number(cx)}"`);
  const [bx, by, bw, bh] = part.box ?? [0, 0, 0, 0];
  return {
    ...part,
    markup,
    box: [-(bx + bw), by, bw, bh],
    pivot: flip(part.pivot),
  };
}

const ERA_PARAM = {
  values: ERA_IDS,
  default: 'today',
  about: 'when, from the list’s dates',
} as const;
const FACING_PARAM = {
  values: ['right', 'left'],
  default: 'right',
  about: 'the way it goes',
} as const;
const MOVES = ['enter', 'travel-to', 'stop', 'leave', 'exit'];

const entry = (
  name: string,
  about: string,
  draw: Draw,
  params: KitEntry['params'] = {},
): KitEntry => ({
  family: 'vehicles',
  looks: ['editorial'],
  about,
  params: { era: ERA_PARAM, facing: FACING_PARAM, ...params },
  moves: MOVES,
  make: (p, style, seed) => vehiclePiece(name, draw, p, style, seed),
});

export const VEHICLE_KIT: Readonly<Record<string, KitEntry>> = {
  'vehicle.cart': entry(
    'cart',
    'a cart pushed by hand, or drawn by a horse.',
    (s, p) => cart(s, String(p.kind)),
    {
      kind: {
        values: ['hand', 'animal'],
        default: 'hand',
        about: 'how it is drawn',
      },
    },
  ),
  'vehicle.car': entry('car', 'a car, as its era built them.', (s, _p, era) =>
    car(s, era),
  ),
  'vehicle.bus': entry('bus', 'a bus, as its era built them.', (s, _p, era) =>
    bus(s, era),
  ),
  'vehicle.lorry': entry(
    'lorry',
    'a lorry (a truck) carrying goods.',
    (s, _p, era) => lorry(s, era),
  ),
  'vehicle.train': entry(
    'train',
    'a train: its engine and its coaches.',
    (s, p, era) => train(s, era, String(p.kind), Number(p.wagons) || 2),
    {
      kind: {
        values: ['steam', 'diesel', 'electric', 'any'],
        default: 'any',
        about: 'its engine; any is its era’s',
      },
      wagons: { range: [1, 6], default: 2, about: 'coaches behind the engine' },
    },
  ),
  'vehicle.ship': entry(
    'ship',
    'a ship at sea: under sail, a steamship, or a container ship.',
    (s, p, era, r) => ship(s, era, String(p.kind), r),
    {
      kind: {
        values: ['sail', 'steam', 'container', 'any'],
        default: 'any',
        about: 'any is its era’s',
      },
    },
  ),
  'vehicle.plane': entry(
    'plane',
    'a plane in the air: a propeller plane or a jet.',
    (s, p, era) => plane(s, era, String(p.kind)),
    {
      kind: {
        values: ['propeller', 'jet', 'any'],
        default: 'any',
        about: 'any is its era’s',
      },
    },
  ),
  'vehicle.rocket': entry(
    'rocket',
    'a rocket standing to launch, or rising.',
    (s) => rocket(s),
  ),
};

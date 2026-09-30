/**
 * Crowds in the foreground (studio-scenery-plan §5.5): the backs of the
 * heads and shoulders of the people watching, in a row or two nearer the
 * camera than the story's own people, cut by the frame's foot: a class
 * before its teacher, a congregation, a stadium's stand, the people at a
 * wedding. Drawn by the figure kit (its
 * people turned away) once for a place, on its foreground layer, each
 * one a group of their own, so the faces-visible check (scene-faces-
 * seen) can fade one who would hide a face as it speaks.
 *
 * They stand low, their heads in the bottom fifth of the frame,
 * so a speaker's face is never behind them in the wide shot. They
 * breathe; on each scene they turn their heads toward whoever speaks now
 * and then, and cheer on the crowd's moves: the scene's own keyframes,
 * drawn into the layer when the scene is composed (audienceAlive).
 */
import { drawExtra, extraFor, type FigureSpec } from './scene-figure';
import { reactionFrames } from './scene-crowd';
import { FIGURE_INK, SET_UNIT_SHARE, setLine } from './scene-ink';
import type { PlaceKind, StoryWorld } from './scene-story';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Where a crowd before the camera watches from, and how it stands: rows of it across, or at the sides only. */
const AUDIENCE_PLACES: [RegExp, 1 | 2, 'full' | 'sides'][] = [
  [
    /\b(?:class ?rooms?|school ?rooms?|lessons?|lecture|assembly hall|assembly)\b/iu,
    2,
    'full',
  ],
  [
    /\b(?:church|chapel|cathedral|congregation|mosque|synagogue|service)\b/iu,
    2,
    'full',
  ],
  [/\b(?:stadium|arena|stands|terraces|match|pitch|sports day)\b/iu, 2, 'full'],
  [/\b(?:wedding|reception|party|feast|ceremony|celebration)\b/iu, 1, 'full'],
  [
    /\b(?:theatre|theater|concert|stage show|audience|hall|courtroom|court room)\b/iu,
    2,
    'full',
  ],
];

/**
 * How a place has a crowd before the camera, by its words; null for none.
 * A market has none: its shoppers are about the story's people, not before
 * the camera watching them. A place drawn with them shows them only in a
 * scene about them (crowdAddressed).
 */
export function audienceFor(
  words: string,
): { rows: 1 | 2; spread: 'full' | 'sides' } | null {
  const hit = AUDIENCE_PLACES.find(([pattern]) => pattern.test(words));
  return hit ? { rows: hit[1], spread: hit[2] } : null;
}

/** The most people before the camera (studio-scenery-plan §7.3). */
export const AUDIENCE_MOST = 40;
/** How low their heads stand: the tops of the farther row's, and the nearer's, as shares of the height. */
const HEAD_TOP = [0.8, 0.87] as const;
/** The set's units to one of the kit's in each row, the farther and the nearer, against where the story's people stand. */
const ROW_SCALE = [1.04, 1.18] as const;
/** A body's width across the shoulders, in the kit's units, and how close they stand. */
const SHOULDERS = 92;
const SPACING = 0.92;

export interface AudienceInput {
  rows: 1 | 2;
  spread: 'full' | 'sides';
  /** The place's own, so the same people watch every time. */
  seed: string;
  world: StoryWorld | null;
  kind: PlaceKind;
  /** Where the action is across, a share of the width: kept clearest. */
  focal: number;
  /** Children, where it is a class. */
  children?: boolean;
  /** The set's frame. */
  W: number;
  H: number;
}

/** A crowd before the camera, drawn: its markup for the foreground layer, and each one's box, for the faces check. */
export interface Audience {
  markup: string;
  fore: { id: string; box: [number, number, number, number] }[];
}

/** A small, stable number from a seed. */
function beatOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Everyone's own motion before the camera: a breath, and the frames their turns and cheers move in. */
const AUDIENCE_STYLE = [
  '.au .cb{animation:au-br 4.6s ease-in-out infinite}',
  '@keyframes au-br{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.4px)}}',
  '.au .cx,.au .hd,.au .arm,.au .fore{transform-box:view-box}',
  '.au .cx{transform-origin:0 0}',
].join('');

/**
 * The crowd before the camera: one or two rows of people turned away,
 * the nearer row larger and lower, spaced across (or at the sides only,
 * clear of where the action is), each their own group `fg-au-<n>`.
 */
export function drawAudience(input: AudienceInput): Audience {
  const { W, H } = input;
  const unit = SET_UNIT_SHARE * H;
  const people: {
    spec: FigureSpec;
    x: number;
    top: number;
    s: number;
    row: number;
    n: number;
  }[] = [];
  let n = 0;
  for (let row = 0; row < input.rows; row += 1) {
    const s = unit * ROW_SCALE[row];
    const step = SHOULDERS * s * SPACING;
    const offset = row % 2 ? step / 2 : 0;
    for (let x = -step * 0.3 + offset; x < W + step * 0.3; x += step) {
      const share = x / W;
      if (input.spread === 'sides' && share > 0.3 && share < 0.7) continue;
      // The focal area stays clearest: a gap in the nearer row before it.
      if (
        row === input.rows - 1 &&
        input.rows === 2 &&
        Math.abs(share - input.focal) < 0.06
      )
        continue;
      if (people.length >= AUDIENCE_MOST) break;
      const i = n;
      n += 1;
      let spec = extraFor(input.world, `${input.seed}:audience`, i);
      if (input.children && spec.age !== 'child')
        spec = {
          ...spec,
          age: beatOf(`${input.seed}:${i}:teen`) < 0.2 ? 'teen' : 'child',
        };
      const jitter = (beatOf(`${input.seed}:${i}:x`) - 0.5) * step * 0.2;
      const lift = (beatOf(`${input.seed}:${i}:y`) - 0.5) * H * 0.02;
      people.push({
        spec,
        x: x + jitter,
        top: H * HEAD_TOP[row] + lift,
        s,
        row,
        n: i,
      });
    }
  }
  // From the back row forward: the nearer over the farther.
  const markup: string[] = [];
  const fore: Audience['fore'] = [];
  for (const p of people.sort((a, b) => a.row - b.row || a.x - b.x)) {
    const id = `fg-au-${p.n + 1}`;
    const drawn = drawExtra(p.spec, { detail: 0, view: 'back', id });
    const feet = p.top - drawn.top * p.s;
    const [bx, by, bw, bh] = drawn.viewBox;
    const quarter = Math.max(0, Math.min(3, Math.floor((p.x / W) * 4)));
    const turns = beatOf(`${input.seed}:${p.n}:turns`) < 0.45;
    const width = r1(setLine(H) / p.s);
    // Each arm ready to go up in a cheer, as the crowd's own do.
    let upper = drawn.upper;
    for (const side of ['r', 'l'] as const) {
      const [S, , Hd] = drawn.joints[side];
      const k = side === 'r' ? 1 : -1;
      const T: [number, number] = [k * (Math.abs(S[0]) + 30), S[1] - 52];
      const angle = (a: [number, number], b: [number, number]) =>
        Math.atan2(b[1] - a[1], b[0] - a[0]);
      let deg = ((angle(S, T) - angle(S, Hd)) * 180) / Math.PI;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      upper = upper.replace(
        `class="arm a${side}" style="`,
        `class="arm a${side}" style="--cu:${r1(deg)};`,
      );
    }
    markup.push(
      `<g id="${id}" class="au aq${quarter}${turns ? ' tn' : ''}" data-audience="${p.row}">` +
        `<svg x="${r1(p.x + bx * p.s)}" y="${r1(feet + by * p.s)}" width="${r1(bw * p.s)}" height="${r1(bh * p.s)}" viewBox="${bx} ${by} ${bw} ${bh}" overflow="visible">` +
        `<g class="cx" style="--hop:${r1(8 + 8 * beatOf(`${input.seed}:${p.n}:hop`))};--late:${Math.round(300 * beatOf(`${input.seed}:${p.n}:late`))}ms">` +
        `<g stroke="${FIGURE_INK}" stroke-width="${width}" stroke-linejoin="round">` +
        `<g class="cb" style="animation-delay:-${r1(4 * beatOf(`${input.seed}:${p.n}:breath`))}s">${upper}</g>` +
        '</g></g></svg></g>',
    );
    const half = (SHOULDERS / 2) * p.s;
    fore.push({
      id,
      box: [
        r1(p.x - half),
        r1(p.top),
        r1(half * 2),
        r1(Math.max(0, H - p.top)),
      ],
    });
  }
  return {
    markup: markup.length
      ? `<g data-audience="rows"><style>${AUDIENCE_STYLE}</style>${markup.join('')}</g>`
      : '',
    fore: fore.sort((a, b) => a.box[0] - b.box[0]),
  };
}

/**
 * The people watching seen from the stage, on the place's other side
 * (studio-views-plan §4.2): the same crowd, turned to face the camera,
 * standing in a row or two across the back of the floor (the nearer row
 * larger and lower), each drawn whole at the size the floor makes them
 * there (`feet` and `unit`, farther row first), spaced across as before
 * (or at the sides only), the middle kept clearest. Grouped as the rows
 * before the camera are (`data-audience="rows"`), so a scene not about
 * them leaves them out alike. Empty with none.
 */
export function drawFacingAudience(
  input: AudienceInput & {
    feet: readonly [number, number];
    unit: readonly [number, number];
    /** Spans across (in the set's units) where things stand on the floor before them: none stands there. */
    clear?: readonly (readonly [number, number])[];
  },
): string {
  const { W } = input;
  const markup: string[] = [];
  let n = 0;
  for (let row = 0; row < input.rows; row += 1) {
    // The farther row when there are two; else the one row where the nearer would be.
    const inRow = input.rows === 2 ? row : 1;
    const s = input.unit[inRow];
    // Standing whole, spaced wider than heads and shoulders before the camera.
    const step = SHOULDERS * s * SPACING * 1.7;
    const offset = row % 2 ? step / 2 : 0;
    for (let x = step * 0.3 + offset; x < W - step * 0.3; x += step) {
      const share = x / W;
      if (input.spread === 'sides' && share > 0.3 && share < 0.7) continue;
      if (Math.abs(share - (1 - input.focal)) < 0.08) continue;
      // Not behind or on a desk or a bench: on the open floor.
      const half = (SHOULDERS / 2) * s * 1.15;
      const at = x + (beatOf(`${input.seed}:${n}:x`) - 0.5) * step * 0.2;
      if ((input.clear ?? []).some(([a, b]) => at + half > a && at - half < b))
        continue;
      if (n >= AUDIENCE_MOST) break;
      const i = n;
      n += 1;
      let spec = extraFor(input.world, `${input.seed}:audience`, i);
      if (input.children && spec.age !== 'child')
        spec = {
          ...spec,
          age: beatOf(`${input.seed}:${i}:teen`) < 0.2 ? 'teen' : 'child',
        };
      const id = `rv-au-${i + 1}`;
      const drawn = drawExtra(spec, { detail: 1, id });
      const [bx, by, bw, bh] = drawn.viewBox;
      const feet = input.feet[inRow];
      const width = r1(setLine(input.H) / s);
      markup.push(
        `<g id="${id}" data-audience="${row}">` +
          `<svg x="${r1(at + bx * s)}" y="${r1(feet + by * s)}" width="${r1(bw * s)}" height="${r1(bh * s)}" viewBox="${bx} ${by} ${bw} ${bh}" overflow="visible">` +
          `<g stroke="${FIGURE_INK}" stroke-width="${width}" stroke-linejoin="round">${drawn.legs}${drawn.upper}</g></svg></g>`,
      );
    }
  }
  return markup.length ? `<g data-audience="rows">${markup.join('')}</g>` : '';
}

/** A turn of the heads toward whoever speaks: from, to, and where they stand across, in the set's units. */
export type AudienceTurn = [number, number, number];

/**
 * A place's foreground layer with its crowd alive for one scene: their
 * cheers on the crowd's moves, and those who turn turning their heads
 * toward whoever speaks, every other line or so, the quarter of them on
 * each side turning its own way. Each on the voice's clock over the
 * scene's length (`--d`), as the crowd behind the people is. A layer
 * with no crowd before the camera is as it was.
 */
export function audienceAlive(
  svg: string,
  scene: {
    moves: readonly [number, 'cheer' | 'gasp', number][];
    turns: readonly AudienceTurn[];
    durationMs: number;
    W: number;
  },
): string {
  if (!svg.includes('data-audience="rows"')) return svg;
  const total = Math.max(1, scene.durationMs);
  const styles: string[] = [];
  const cheers = scene.moves.filter((one) => one[1] === 'cheer');
  if (cheers.length) {
    styles.push(reactionFrames(cheers, total));
    styles.push(
      '.au .cx{animation:cr-x var(--d) linear both;animation-delay:var(--late)}',
      '.au .cx .arm{animation:cr-u var(--d) linear both;animation-delay:var(--late)}',
      '.au .cx .fore{animation:cr-f var(--d) linear both;animation-delay:var(--late)}',
    );
  }
  const pc = (t: number) => `${Math.round((t / total) * 100000) / 1000}%`;
  // Every other line, and never one shorter than a second.
  const turning = scene.turns.filter(
    (one, k) => k % 2 === 0 && one[1] - one[0] >= 1000,
  );
  if (turning.length) {
    for (let q = 0; q < 4; q += 1) {
      const middle = ((q + 0.5) / 4) * scene.W;
      const frames: string[] = ['0%{transform:none}'];
      let free = 0;
      for (const [from, to, x] of turning) {
        const a = Math.max(from + 250, free);
        const b = Math.min(to, from + 3200);
        if (b - a < 600) continue;
        const way =
          Math.abs(x - middle) < scene.W * 0.06 ? 0 : x > middle ? 1 : -1;
        if (!way) continue;
        const turned = `transform:translateX(${way * 7}px)`;
        frames.push(
          `${pc(a)}{transform:none}`,
          `${pc(a + 300)}{${turned}}`,
          `${pc(b - 300)}{${turned}}`,
          `${pc(b)}{transform:none}`,
        );
        free = b + 1;
      }
      frames.push('100%{transform:none}');
      if (frames.length > 2)
        styles.push(
          `@keyframes au-q${q}{${frames.join('')}}`,
          `.au.tn.aq${q} .hd{animation:au-q${q} var(--d) linear both}`,
        );
    }
  }
  if (!styles.length) return svg;
  return svg
    .replace(/^<svg\b([^>]*)>/, (_m, attrs: string) =>
      /\sstyle="/.test(attrs)
        ? `<svg${attrs.replace(/\sstyle="/, ` style="--d:${Math.round(total)}ms;`)}>`
        : `<svg${attrs} style="--d:${Math.round(total)}ms">`,
    )
    .replace(
      '<g data-audience="rows"><style>',
      `<g data-audience="rows"><style>${styles.join('')}`,
    );
}

/** A line or a narration of a scene, as crowdAddressed reads it. */
export interface AddressedBeat {
  kind?: 'line' | 'narration';
  say: string;
  /** A line said to a crowd or a group (by the cast's word), not to one person. */
  toCrowd?: boolean;
}

/** Words that name the people watching: the class, the congregation, everyone. */
const WATCHERS =
  '(?:the (?:whole )?(?:class|pupils|students|children|congregation|church|audience|crowd|people|guests|fans|spectators|villagers|townspeople|onlookers)|everyone|everybody|all of them|the room)';
/** Narration of someone speaking to the people watching, or of them watching the main action. */
const ADDRESS_SAID = new RegExp(
  [
    `\\b(?:address(?:es|ed|ing)?|speaks? to|spoke to|talks? to|calls? out to|announc(?:es|ed|ing) to|teach(?:es|ing)?|preach(?:es|ed|ing)? to|sings? to|performs? for|turns? to)\\s+${WATCHERS}`,
    `\\b(?:preach(?:es|ed|ing)?|gives? (?:a|his|her|the) (?:sermon|speech|lesson|talk)|makes? (?:a|his|her|the) speech|delivers? (?:a|his|her|the) (?:sermon|speech)|begins? (?:the|a|his|her) (?:lesson|sermon|speech))\\b`,
    `\\b${WATCHERS}\\s+(?:watch(?:es|ed)?|cheer(?:s|ed)?|clap(?:s|ped)?|applaud(?:s|ed)?|listen(?:s|ed)?|gasp(?:s|ed)?|roar(?:s|ed)?|sing(?:s)? along|laugh(?:s|ed)?)\\b`,
  ].join('|'),
  'iu',
);
/** A line that opens by calling the people watching: "Good morning, class!", "Everyone, listen." */
const ADDRESS_CALLED =
  /^\W*(?:(?:good (?:morning|afternoon|evening)|hello|welcome|listen(?: up)?|attention|quiet(?: please)?|now|right|okay|ok|dear)[\s,!]+)?(?:class|everyone|everybody|children|boys and girls|church|brothers and sisters|ladies and gentlemen|friends|people|all of you)\b[\s,!.?]/iu;

/**
 * Whether a scene is about the crowd before the camera, so its rows show:
 * someone speaks to them (a line to the crowd, one that calls the class or
 * everyone, narration that someone addresses them, teaches or preaches
 * to them, a sermon or a speech), or they watch the main action (the
 * crowd cheers, the class listens). Otherwise they are not there: people
 * talking among themselves in a market or a classroom have no one before
 * the camera watching them.
 */
export function crowdAddressed(beats: readonly AddressedBeat[]): boolean {
  return beats.some(
    (beat) =>
      beat.toCrowd === true ||
      ADDRESS_SAID.test(beat.say) ||
      (beat.kind === 'line' && ADDRESS_CALLED.test(beat.say)),
  );
}

/** A layer's drawing without its crowd before the camera: for a scene not about them. */
export function withoutAudience(svg: string): string {
  const start = svg.indexOf('<g data-audience="rows">');
  if (start < 0) return svg;
  const tags = /<g\b[^>]*?(\/?)>|<\/g>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(svg); m; m = tags.exec(svg)) {
    if (m[0] === '</g>') depth -= 1;
    else if (!m[1]) depth += 1;
    if (depth === 0) return svg.slice(0, start) + svg.slice(tags.lastIndex);
  }
  return svg;
}

/**
 * The people watching, in a scene about them, seen only as the crowd sees
 * the one they watch, in the wide shot: out of every close, two and pushed
 * shot on someone for the shot's length (0: gone), eased out and back by
 * the player, never popped. Their groups by id.
 */
export function audienceOutOfShots(
  rows: readonly string[],
  shots: readonly {
    atMs: number;
    untilMs?: number;
    do: string;
    shot?: { kind?: string };
  }[],
  steps: readonly { atMs: number }[],
  durationMs: number,
): [number, number, string, number][] {
  // Over the crowd onto the one they watch, they are the shot's own.
  return shots
    .filter((shot) => shot.do === 'zoom' && shot.shot?.kind !== 'crowd')
    .flatMap((shot) => {
      const end =
        shot.untilMs ??
        steps.find((one) => one.atMs > shot.atMs)?.atMs ??
        durationMs;
      return rows.map((id): [number, number, string, number] => [
        Math.round(shot.atMs),
        Math.round(end),
        id,
        0,
      ]);
    });
}

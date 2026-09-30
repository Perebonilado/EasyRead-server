/**
 * People seen from more than the front (studio-views-plan §1.2): rig 3.
 *
 * A person drawn on rig 3 is drawn five times in one drawing, once from
 * each side a camera sees them from: from the front, three-quarter (their
 * face turned to the right of the frame), in profile (facing right),
 * three-quarter from behind (turned away, to the right) and from behind.
 * Mirrored, the player has all eight directions. Each view is its own
 * group (`view-front`, `view-3q`, `view-profile`, `view-back3q`,
 * `view-back`), and each has the rig's whole tree: the legs, what hangs
 * behind, the body, the arms, the head, every face and the mouth's shapes,
 * the signs, the blink and what is over the face. Its classes are the
 * rig's own, so the player's variables and springs move whichever view
 * shows; its ids are the front's with the view after them (`happy--3q`),
 * and the stage shows a face or a sign in every view at once. The player
 * shows one view at a time by a class on the drawing (`vw-3q`); with
 * none, the front, as a still shows it.
 *
 * The front view is rig 2's drawing exactly: rig 1 and rig 2 are drawn
 * byte for byte as before, and rig 3's front is rig 2's but for the group
 * round it. The other views are drawn by the same hand from the same
 * spec: the head stays a circle and the face slides to the side it faces
 * and foreshortens (three-quarter: the eyes a third of the way over, the
 * far one narrower; profile: one eye at the edge, a nose, half a mouth),
 * ears come and go, every hair style and hat has its own drawing from
 * each side, the body narrows and what is on its front slides round or is
 * hidden, and in profile the far arm and leg are behind the body. What
 * swings is cut into chains as on rig 2, with the same ids, so the same
 * springs swing it in every view; each view says where its roots are.
 */
import type { Expression } from './scene-story';
import {
  NEUTRAL_FACE,
  faceMarkup,
  geoAttr,
  type FaceGeo,
} from './scene-face-rig';
import {
  CLOTH,
  FIGURE_INK,
  HAIR,
  SKIN,
  flat,
  inked,
  line,
  shade,
} from './scene-ink';
import {
  DANGLE_RIG,
  cutChain,
  dangleCss,
  dangleOf,
  DANGLE_FEEL,
  type Dangle,
  type DangleKind,
} from './scene-dangles';
import {
  FACES,
  FACE_NAMES,
  FEET,
  GOLD,
  GRIPS,
  HEAD,
  LINE,
  MOUTH_SHAPES,
  SHOE,
  WING_SPAN,
  WOOD,
  airOf,
  alongOf,
  beatOf,
  chord,
  dressClass,
  dressOf,
  drawFigure,
  faceId,
  facesFor,
  fm,
  holderOf,
  mouthShape,
  mouthShapes,
  propOf,
  rigOf,
  signId,
  signsFor,
  signsOf,
  wrapped,
  type AskedFace,
  type Dressed,
  type Face,
  type FigureDrawing,
  type FigureHow,
  type FigurePose,
  type FigureProp,
  type FigureSign,
  type FigureSpec,
  type KitFace,
  type Point2,
  type Rig,
} from './scene-figure';

/** The views rig 3 draws, front first: mirrored, the other four face left. */
export const FIGURE_VIEWS = [
  'front',
  '3q',
  'profile',
  'back3q',
  'back',
] as const;
export type FigureView = (typeof FIGURE_VIEWS)[number];

/** The rig that draws people from every side. */
export const VIEW_RIG = 3 as const;

/** A view's group in the drawing. */
export const viewGroupId = (view: FigureView) => `view-${view}`;
/** What a view's groups' ids end in: nothing for the front, `--3q` for three-quarter. */
export const viewSuffix = (view: FigureView) =>
  view === 'front' ? '' : `--${view}`;
/** The class on the drawing that shows a view (none shows the front). */
export const viewClass = (view: FigureView) => `vw-${view}`;

/** Where a part that swings has its root in a view, and which way it hangs there. */
export interface DangleInView {
  root: Point2;
  dir: Point2;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (x: number, y: number) => `${r1(x)},${r1(y)}`;

// ── The views' geometry ────────────────────────────────────────────────────

/** One eye as a view draws it: where, how wide (a share of the front's), and which of the front's eyes its shapes are (-1 the left). */
interface Eye {
  x: number;
  y: number;
  rx: number;
  ry: number;
  side: -1 | 1;
  /** Its width as a share of a front eye's. */
  w: number;
  /** How far forward its pupil sits, in profile: it looks where the face points. */
  fwd: number;
}

/** How a view draws a person. */
interface Geo {
  view: FigureView;
  /** The body's width, a share of the front's. */
  k: number;
  eyes: Eye[];
  /** Where the mouth is across, how wide (a share of the front's), and whether half of it shows (profile). */
  mouth: { x: number; w: number; half: boolean } | null;
  /** What is on the body's front, slid toward the side it faces and narrowed; null where it is not seen. */
  slide: { dx: number; k: number } | null;
  /** The ears seen, each where it is. */
  ears: Point2[];
  /** The middle of the face across: where the signs on it sit. */
  faceX: number;
}

function geoOf(view: FigureView, R: Rig): Geo {
  const { cy } = R;
  const { y, rx, ry } = R.eyes;
  const eye = (x: number, side: -1 | 1, w: number, fwd = 0): Eye => ({
    x,
    y,
    rx: r1(rx * w),
    ry,
    side,
    w,
    fwd,
  });
  const s2 = R.halfShoulder;
  switch (view) {
    case '3q':
      return {
        view,
        k: 0.9,
        eyes: [eye(-0.5, -1, 1), eye(29.5, 1, 0.7)],
        mouth: { x: 14, w: 0.8, half: false },
        slide: { dx: r1(s2 * 0.28), k: 0.72 },
        ears: [[-35, cy + 6]],
        faceX: 14,
      };
    case 'profile':
      return {
        view,
        k: 0.7,
        eyes: [eye(28, -1, 0.62, 3)],
        mouth: { x: 36, w: 0.8, half: true },
        slide: { dx: r1(s2 * 0.42), k: 0.36 },
        ears: [[-5, cy + 6]],
        faceX: 30,
      };
    case 'back3q':
      return {
        view,
        k: 0.9,
        eyes: [],
        mouth: null,
        slide: null,
        ears: [[33, cy + 6]],
        faceX: 0,
      };
    case 'back':
      return {
        view,
        k: 1,
        eyes: [],
        mouth: null,
        slide: null,
        ears: [
          [-44, cy + 6],
          [44, cy + 6],
        ],
        faceX: 0,
      };
    default:
      return {
        view,
        k: 1,
        eyes: [eye(-R.eyes.dx, -1, 1), eye(R.eyes.dx, 1, 1)],
        mouth: { x: 0, w: 1, half: false },
        slide: { dx: 0, k: 1 },
        ears: [],
        faceX: 0,
      };
  }
}

/** Seen from behind, or turned away: no face shows. */
const fromBehind = (view: FigureView) => view === 'back' || view === 'back3q';

/** The group a view's rigged face is drawn in (scene-face-rig): `rigface`, `rigface--3q`. */
export const RIG_FACE = 'rigface';

/** A view's face as the rig of moving parts draws it: its eyes and its mouth where the view has them; none from behind. */
export function faceGeoOf(view: FigureView, R: Rig): FaceGeo | null {
  if (fromBehind(view)) return null;
  const geo = geoOf(view, R);
  return {
    eyes: geo.eyes.map((e) => ({
      x: e.x,
      y: e.y,
      rx: e.rx,
      ry: e.ry,
      side: e.side,
      w: e.w,
      fwd: e.fwd,
    })),
    my: R.mouthY,
    mouth: geo.mouth,
  };
}

/**
 * A view's rigged face, at rest, in its own group: hidden until the
 * player moves it (`.rigged` on the drawing), when the kit's swapped
 * faces, their blink and the mouth's shapes give way to it. `clip` is the
 * view's prefix for its clip paths, as its eyes' and half mouth's are.
 */
export function rigFaceOf(
  view: FigureView,
  R: Rig,
  skin: string,
  clip: string,
  eyesClip: string,
): string {
  const geo = faceGeoOf(view, R);
  if (!geo) return '';
  return `<g id="${RIG_FACE}${viewSuffix(view)}" class="rf" data-rf="${geoAttr(geo)}">${fm(
    faceMarkup(NEUTRAL_FACE, geo, {
      eyesClip,
      halfClip: `${clip}-mh`,
      prefix: `${clip}-rf`,
      skin,
    }),
  )}</g>`;
}

/** What a drawing with a rigged face shows: the rig's face only while the player moves it, and then none of the kit's blinks or mouths. */
export const RIG_FACE_CSS =
  '.rf{display:none}.rigged .rf{display:inline}.rigged .blink,.rigged .mouths{display:none}';

// ── Faces ──────────────────────────────────────────────────────────────────

/** A face's eyes in a view: the pupils (inside the whites), the lids and the brows, each eye its own width. */
function viewEyes(
  name: Expression,
  eyes: readonly Eye[],
  skin: string,
  clip: string,
): string {
  const f: Face = FACES[name];
  const out: string[] = [];
  out.push(
    `<g clip-path="url(#${clip})"><g class="pupils">${eyes
      .map(
        (e) =>
          `<circle cx="${r1(e.x + f.look[0] * e.w + e.fwd)}" cy="${r1(e.y + f.look[1])}" r="${e.w < 0.8 ? r1(f.pupil * 0.9) : f.pupil}" ${flat(FIGURE_INK)}/>`,
      )
      .join('')}</g></g>`,
  );
  const brows: string[] = [];
  for (const e of eyes) {
    const { x: ex, y, rx, ry, side, w } = e;
    if (f.lower !== undefined)
      out.push(
        `<path d="${chord(ex, y, rx, ry, f.lower, 0, 'bottom')}" ${inked(skin)}/>`,
      );
    const lid = name === 'thinking' && side === 1 ? undefined : f.lid;
    if (lid)
      out.push(
        `<path d="${chord(ex, y, rx, ry, lid[0], side === -1 ? lid[1] : -lid[1])}" ${inked(skin)}/>`,
      );
    const brow = side === 1 && f.browRight ? f.browRight : f.brows;
    if (brow) {
      const by = y - ry - 5;
      brows.push(
        line(
          `M${pt(ex + side * 11 * w, by + brow[0])} L${pt(ex - side * 8 * w, by + brow[1])}`,
          FIGURE_INK,
          3.4,
        ),
      );
    }
  }
  if (brows.length) out.push(`<g class="brows">${brows.join('')}</g>`);
  return out.join('');
}

/** The pain face's eyes in a view: squeezed shut toward the nose, brows pinched. */
function viewPainEyes(eyes: readonly Eye[], skin: string): string {
  const shut = eyes
    .map(({ x: ex, y, rx, ry, side, w }) => {
      const d = side < 0 ? 1 : -1;
      return (
        `<ellipse cx="${r1(ex)}" cy="${y}" rx="${r1(rx + 0.8)}" ry="${r1(ry + 0.8)}" ${flat(skin)}/>` +
        line(
          `M${pt(ex - d * 8 * w, y - 7)} L${pt(ex + d * 6 * w, y)} L${pt(ex - d * 8 * w, y + 7)}`,
          FIGURE_INK,
          3.4,
        )
      );
    })
    .join('');
  const brows = eyes
    .map(({ x: ex, y, ry, side, w }) =>
      line(
        `M${pt(ex + side * 11 * w, y - ry - 2)} L${pt(ex - side * 8 * w, y - ry - 9)}`,
        FIGURE_INK,
        3.4,
      ),
    )
    .join('');
  return shut + `<g class="brows">${brows}</g>`;
}

/** Eyes shut and calm in a view, the lids a soft curve down, the brows at rest. */
function viewClosedEyes(eyes: readonly Eye[], skin: string): string {
  const pad = LINE / 2 + 0.7;
  const shut = eyes
    .map(
      ({ x: ex, y, rx, ry, w }) =>
        `<ellipse cx="${r1(ex)}" cy="${y}" rx="${r1(rx + pad)}" ry="${r1(ry + pad)}" ${flat(skin)}/>` +
        line(
          `M${pt(ex - 11 * w, y + 1)} Q${pt(ex, y + 7)} ${pt(ex + 11 * w, y + 1)}`,
          FIGURE_INK,
          3,
        ),
    )
    .join('');
  const brows = eyes
    .map(({ x: ex, y, ry, side, w }) =>
      line(
        `M${pt(ex + side * 11 * w, y - ry - 2)} L${pt(ex - side * 8 * w, y - ry - 3)}`,
        FIGURE_INK,
        3.4,
      ),
    )
    .join('');
  return shut + `<g class="brows">${brows}</g>`;
}

/** A blink in a view: each eye's lid shut over it for a moment. */
function viewBlink(eyes: readonly Eye[], skin: string): string {
  return eyes
    .map(
      ({ x: ex, y, rx, ry, w }) =>
        `<ellipse cx="${r1(ex)}" cy="${y}" rx="${r1(rx + 0.8)}" ry="${r1(ry + 0.8)}" ${inked(skin)}/>` +
        line(
          `M${pt(ex - 11 * w, y + 1)} Q${pt(ex, y + 7)} ${pt(ex + 11 * w, y + 1)}`,
          FIGURE_INK,
          3,
        ),
    )
    .join('');
}

/** The mouth's shapes seen from the side: one drawn off the middle is its plain one there, which half a mouth can show. */
const SIDE_SHAPES: Record<string, string> = { side: 'flat', aside: 'small' };

/** A mouth where a view has it: narrower, slid toward the side it faces; in profile, the half of it at the face's edge. */
function mouthIn(geo: Geo, markup: string, half: string): string {
  const m = geo.mouth;
  if (!m) return '';
  const moved = `<g transform="translate(${m.x} 0) scale(${m.w} 1)">`;
  return m.half
    ? `${moved}<g clip-path="url(#${half})">${markup}</g></g>`
    : `${moved}${markup}</g>`;
}

// ── Hair and hats ──────────────────────────────────────────────────────────

/** The hair's ellipse, a little past the head's. */
const HX = 48.5;
const HY = 42.5;

/** Across the hair's ellipse at a height, from the head's middle. */
const across = (cy: number, y: number) =>
  HX * Math.sqrt(Math.max(0, 1 - ((y - cy) / HY) ** 2));

/** A fringe from (xa, ·) to (xb, fy), in the style a hair style takes: as path commands. */
function fringePath(kind: string, xa: number, xb: number, fy: number): string {
  const n = 8;
  const d = (xb - xa) / n;
  switch (kind) {
    case 'swept':
      return `Q${pt(xa + (xb - xa) * 0.45, fy + 5)} ${pt(xb, fy - 5)}`;
    case 'parted':
      return `Q${pt(xa + (xb - xa) * 0.3, fy - 2)} ${pt(xa + (xb - xa) * 0.42, fy - 10)} Q${pt(xa + (xb - xa) * 0.55, fy - 1)} ${pt(xb, fy)}`;
    case 'spiky': {
      const out: string[] = [];
      for (let k = 1; k <= n; k += 1)
        out.push(`L${pt(xa + d * (k - 0.5), fy + 6)} L${pt(xa + d * k, fy)}`);
      return out.join(' ');
    }
    case 'curly': {
      const out: string[] = [];
      for (let k = 1; k <= n / 2; k += 1)
        out.push(
          `Q${pt(xa + d * 2 * (k - 0.5), fy + 9)} ${pt(xa + d * 2 * k, fy + 1)}`,
        );
      return out.join(' ');
    }
    default:
      return `L${pt(xb, fy)}`;
  }
}

/** Each hair style's fringe, as the front has it. */
const FRINGE: Partial<Record<FigureSpec['hair'], string>> = {
  short: 'swept',
  spiky: 'spiky',
  curly: 'curly',
  afro: 'curly',
  long: 'parted',
  bob: 'straight',
  pigtails: 'parted',
  ponytail: 'swept',
  bun: 'parted',
  braids: 'parted',
  locs: 'straight',
};

/** Hair long enough to hide the ears. */
const HIDES_EARS: ReadonlySet<string> = new Set([
  'afro',
  'bob',
  'long',
  'locs',
]);

/** Where a view collects what swings, as rig 2 does: its clip paths' prefix, and each chain. */
interface Chains {
  clip: string;
  dangles: Dangle[];
}

/** A part that swings, cut into a chain as rig 2 cuts it, with the same id in every view. */
function swing(
  chains: Chains,
  id: string,
  kind: DangleKind,
  markup: string,
  root: Point2,
  tip: Point2 | undefined,
  segments: number,
  pinned = true,
): string {
  if (!markup) return markup;
  const made = cutChain({
    id,
    markup,
    root,
    tip,
    segments,
    clip: `${chains.clip}-${id}`,
    pinned,
    limit: DANGLE_FEEL[kind].limit,
  });
  chains.dangles.push(dangleOf(id, made, kind));
  return made.markup;
}

/** What a view draws of the hair: behind the head, over it (the cap and fringe, and what sits on it), and over the back and shoulders. */
interface HairInView {
  behind: string;
  cap: string;
  over: string;
}

/** The cap of hair over the head from three-quarter, its fringe slid toward the face and down the back of the head to below the ear. */
function cap3q(cy: number, kind: string, low = 14): string {
  const yb = cy + low;
  const xb = -across(cy, yb);
  const yf = cy - 6;
  const xf = across(cy, yf);
  const fy = cy - 26;
  return `M${pt(xb, yb)} A${HX},${HY} 0 1 1 ${pt(xf, yf)} Q${pt(46, cy - 20)} ${pt(40, fy + 2)} ${fringePath(kind, 40, -14, fy)} Q${pt(-19, cy - 16)} ${pt(-20, cy - 2)} Q${pt(-22, cy + 10)} ${pt(-28, yb)} Z`;
}

/** The cap in profile: over the top and down the back, a tuft over the brow, the sideburn before the ear. */
function capProfile(cy: number, kind: string, low = 16): string {
  const yb = cy + low;
  const xb = -across(cy, yb);
  const yf = cy - 22;
  const xf = across(cy, yf);
  const fy = cy - 26;
  const tuft =
    kind === 'spiky'
      ? `L${pt(xf + 4, fy + 2)} L${pt(34, fy + 1)} L${pt(36, fy + 8)} L${pt(26, fy + 2)}`
      : kind === 'curly'
        ? `Q${pt(xf + 6, fy + 8)} ${pt(36, fy + 6)} Q${pt(30, fy + 12)} ${pt(24, fy + 3)}`
        : kind === 'straight'
          ? `L${pt(xf + 1, fy + 8)} L${pt(26, fy + 8)}`
          : `Q${pt(xf + 5, fy + 8)} ${pt(34, fy + 5)} Q${pt(28, fy + 2)} ${pt(24, fy + 3)}`;
  return `M${pt(xb, yb)} A${HX},${HY} 0 0 1 ${pt(xf, yf)} ${tuft} Q${pt(12, fy - 2)} ${pt(8, cy - 16)} Q${pt(5, cy - 4)} ${pt(6, cy + 6)} Q${pt(-2, cy + low - 2)} ${pt(-14, yb)} Z`;
}

/** The hair seen from behind: over all of the head but the nape. */
const capBack = (cy: number, dx = 0, down = 0.52) =>
  chord(dx, cy, HX, HY, down);

/** A band of hair round the back of a bald crown, from ear to ear, seen from a view. */
function baldingBand(cy: number, view: FigureView): string {
  const top = cy - 14;
  const low = cy + 22;
  switch (view) {
    case '3q':
      return `M${pt(-across(cy, top), top)} A${HX},${HY} 0 0 0 ${pt(-across(cy, low), low)} L${pt(-24, low - 2)} Q${pt(-18, cy + 2)} ${pt(-26, top)} Z`;
    case 'profile':
      return `M${pt(-across(cy, top), top)} A${HX},${HY} 0 0 0 ${pt(-across(cy, low), low)} L${pt(-10, low - 2)} Q${pt(2, cy + 2)} ${pt(-8, top + 2)} Z`;
    case 'back3q':
      return `M${pt(-across(cy, top), top)} A${HX},${HY} 0 0 0 ${pt(-across(cy, low), low)} Q${pt(-4, cy + 30)} ${pt(across(cy, low) - 8, low)} L${pt(26, top + 4)} Q${pt(-4, cy + 20)} ${pt(-34, top)} Z`;
    default:
      // A horseshoe round the back of the head, from ear to ear by the nape.
      return `M${pt(-across(cy, top), top)} A${HX},${HY} 0 0 0 ${pt(-across(cy, low), low)} Q${pt(0, cy + 30)} ${pt(across(cy, low), low)} A${HX},${HY} 0 0 0 ${pt(across(cy, top), top)} L${pt(36, top)} Q${pt(0, cy + 20)} ${pt(-36, top)} Z`;
  }
}

/** Spikes round the crown, from angle a0 to a1 (degrees, 0 to the right, -90 up), leaning `lean` degrees back. */
function spikes(
  cy: number,
  a0: number,
  a1: number,
  c: string,
  lean = 0,
): string {
  const out: string[] = [];
  for (let t = a0; t <= a1; t += 24) {
    const a = (t * Math.PI) / 180;
    const w = (13 * Math.PI) / 180;
    const tipA = ((t - lean) * Math.PI) / 180;
    const at = (angle: number, k: number) =>
      pt(Math.cos(angle) * 47 * k, cy + Math.sin(angle) * 41 * k);
    out.push(
      `<path d="M${at(a - w, 1)} L${at(tipA, 1.32)} L${at(a + w, 1)} Z" ${inked(c)}/>`,
    );
  }
  return out.join('');
}

/** Curls round the crown, from angle a0 to a1. */
function curls(cy: number, a0: number, a1: number, c: string, dx = 0): string {
  const out: string[] = [];
  for (let t = a0; t <= a1; t += 20) {
    const a = (t * Math.PI) / 180;
    out.push(
      `<circle cx="${r1(dx + Math.cos(a) * 46)}" cy="${r1(cy + Math.sin(a) * 40)}" r="10" ${inked(c)}/>`,
    );
  }
  return out.join('');
}

/** A tie in the hair. */
const tie = (x: number, y: number, c: string, r = 5) =>
  `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" ${inked(c)}/>`;

/** Hair falling to `bottom` over the back of the head, seen from three-quarter or in profile: from the hairline at `front` back. */
function fall(cy: number, front: number, bottom: number, back = -51): string {
  return `M${pt(front, cy - 6)} Q${pt(front - 6, cy + 14)} ${pt(front - 1, bottom)} Q${pt((front + back) / 2, bottom + 7)} ${pt(back + 5, bottom - 3)} Q${pt(back - 2, cy + 16)} ${pt(back, cy - 10)} Z`;
}

/** The hair in a view: the cap, what shows behind the head, and what hangs over the back. */
function hairInView(
  spec: FigureSpec,
  R: Rig,
  view: FigureView,
  chains: Chains,
): HairInView {
  const none: HairInView = { behind: '', cap: '', over: '' };
  if (wrapped(spec)) return none;
  const c = HAIR[spec.hairColour];
  const accent = CLOTH[spec.accentColour];
  const { cy } = R;
  const kind = FRINGE[spec.hair] ?? 'straight';
  const hair = spec.hair;
  const path = (d: string, fill = c) => `<path d="${d}" ${inked(fill)}/>`;
  if (hair === 'bald') return none;
  if (hair === 'balding') return { ...none, cap: path(baldingBand(cy, view)) };
  const side = view === '3q' || view === 'profile';
  const back = fromBehind(view);
  // The cap, as each view has it; long hair falls lower down the back of
  // the head.
  const low =
    hair === 'bob' || hair === 'long' ? 20 : hair === 'locs' ? 18 : 14;
  const cap =
    view === '3q'
      ? path(cap3q(cy, kind, low))
      : view === 'profile'
        ? path(capProfile(cy, kind, low + 2))
        : view === 'back3q'
          ? path(
              capBack(
                cy,
                -11,
                hair === 'short' || hair === 'spiky' ? 0.5 : 0.56,
              ),
            )
          : path(
              capBack(cy, 0, hair === 'short' || hair === 'spiky' ? 0.5 : 0.56),
            );
  // Toward the back of the head, and which way that is.
  const backX =
    view === '3q' ? -14 : view === 'profile' ? -22 : view === 'back3q' ? -9 : 0;
  switch (hair) {
    case 'short':
      return { ...none, cap };
    case 'spiky':
      return {
        ...none,
        behind:
          view === 'profile'
            ? spikes(cy, -170, -50, c, 18)
            : back
              ? spikes(cy, -174, -6, c)
              : spikes(cy, -158, -34, c, view === '3q' ? 8 : 0),
        cap,
      };
    case 'curly':
      return {
        ...none,
        behind: back
          ? curls(cy, -192, 12, c, view === 'back3q' ? -4 : 0)
          : view === 'profile'
            ? curls(cy, -196, -40, c, -3)
            : curls(cy, -186, -20, c, -2),
        cap,
      };
    case 'afro': {
      // The afro's mass, round the head: seen from behind, all of it.
      const mass = `<ellipse cx="${view === 'profile' ? -12 : view === '3q' ? -8 : backX}" cy="${cy - 10}" rx="${view === 'profile' ? 60 : 64}" ry="56" ${inked(c)}/>`;
      return back ? { ...none, cap: mass } : { ...none, behind: mass, cap };
    }
    case 'bob': {
      if (back)
        return {
          ...none,
          cap: path(
            `M${pt(-50 + backX, cy + 22)} L${pt(-50 + backX, cy - 4)} A50,44 0 0 1 ${pt(50 + backX, cy - 4)} L${pt(50 + backX, cy + 22)} Q${pt(50 + backX, cy + 32)} ${pt(40 + backX, cy + 32)} L${pt(-40 + backX, cy + 32)} Q${pt(-50 + backX, cy + 32)} ${pt(-50 + backX, cy + 22)} Z`,
          ),
        };
      return {
        ...none,
        behind:
          view === '3q'
            ? path(
                `M-52,${cy - 18} L-52,${cy + 22} Q-52,${cy + 32} -42,${cy + 32} L40,${cy + 32} Q48,${cy + 32} 48,${cy + 22} L48,${cy - 18} Z`,
              )
            : '',
        cap: path(fall(cy, view === '3q' ? -20 : 4, cy + 32)) + cap,
      };
    }
    case 'long': {
      // It hangs past the shoulders: behind them from the front and the
      // side, down the back from behind.
      const panel = (x0: number, x1: number, top: number) =>
        `<path d="M${pt(x0, top)} L${pt(x0, cy + 44)} Q${pt(x0, cy + 60)} ${pt(x0 + 16, cy + 60)} L${pt(x1 - 16, cy + 60)} Q${pt(x1, cy + 60)} ${pt(x1, cy + 44)} L${pt(x1, top)} Z" ${inked(c)}/>`;
      if (back) {
        const x0 = -52 + backX;
        const x1 = 52 + backX;
        return {
          ...none,
          cap: path(capBack(cy, backX, 0.4)),
          over: `<g class="hd">${swing(
            chains,
            'hair',
            'hair',
            // Over the back of the head and down past the shoulders, its top the head's.
            `<path d="M${pt(x0 + 2, cy - 4)} A50,44 0 0 1 ${pt(x1 - 2, cy - 4)} L${pt(x1, cy + 44)} Q${pt(x1, cy + 60)} ${pt(x1 - 16, cy + 60)} L${pt(x0 + 16, cy + 60)} Q${pt(x0, cy + 60)} ${pt(x0, cy + 44)} Z" ${inked(c)}/>`,
            [backX, cy + 26],
            [backX, cy + 60],
            2,
          )}</g>`,
        };
      }
      const [x0, x1] = view === '3q' ? [-52, 36] : [-52, -2];
      return {
        ...none,
        behind: swing(
          chains,
          'hair',
          'hair',
          panel(x0, x1, cy - 18),
          [r1((x0 + x1) / 2), cy + 26],
          [r1((x0 + x1) / 2), cy + 60],
          2,
        ),
        cap: path(fall(cy, view === '3q' ? -20 : 4, cy + 42)) + cap,
      };
    }
    case 'ponytail': {
      // Tied at the back of the head, hanging down behind it.
      const at: Point2 =
        view === '3q'
          ? [-44, cy - 12]
          : view === 'profile'
            ? [-46, cy - 14]
            : [backX, cy - 6];
      const tail = back
        ? `<ellipse cx="${at[0]}" cy="${cy + 20}" rx="13" ry="27" ${inked(c)}/>`
        : `<ellipse cx="${at[0] - 6}" cy="${cy + 8}" rx="13" ry="26" transform="rotate(18 ${at[0] - 6} ${cy + 8})" ${inked(c)}/>`;
      const tip: Point2 = back ? [at[0], cy + 47] : [at[0] - 14, cy + 32.7];
      const hung = swing(chains, 'pony', 'ponytail', tail, at, tip, 3);
      return back
        ? {
            ...none,
            cap,
            over: `<g class="hd">${hung}${tie(at[0], at[1], accent)}</g>`,
          }
        : { ...none, behind: hung + tie(at[0], at[1], accent), cap };
    }
    case 'pigtails': {
      const one = (
        id: string,
        x: number,
        s: number,
        into: 'behind' | 'over',
      ) => ({
        into,
        markup:
          swing(
            chains,
            id,
            'pigtail',
            `<ellipse cx="${x + s * 8}" cy="${cy + 6}" rx="13" ry="21" transform="rotate(${s * -18} ${x + s * 8} ${cy + 6})" ${inked(c)}/>`,
            [x, cy - 10],
            [x + s * 14.5, cy + 26],
            2,
          ) + tie(x, cy - 10, accent),
      });
      const parts =
        view === '3q'
          ? [one('pig-l', -45, -1, 'behind'), one('pig-r', 36, 1, 'behind')]
          : view === 'profile'
            ? [one('pig-l', -38, -1, 'behind')]
            : view === 'back3q'
              ? [one('pig-l', -48, -1, 'over'), one('pig-r', 38, 1, 'over')]
              : [one('pig-l', -45, -1, 'over'), one('pig-r', 45, 1, 'over')];
      return {
        behind: parts
          .filter((p) => p.into === 'behind')
          .map((p) => p.markup)
          .join(''),
        cap,
        over: parts.some((p) => p.into === 'over')
          ? `<g class="hd">${parts
              .filter((p) => p.into === 'over')
              .map((p) => p.markup)
              .join('')}</g>`
          : '',
      };
    }
    case 'bun': {
      const bun =
        view === '3q'
          ? `<circle cx="-18" cy="${cy - 40}" r="15" ${inked(c)}/>`
          : view === 'profile'
            ? `<circle cx="-36" cy="${cy - 30}" r="15" ${inked(c)}/>`
            : `<circle cx="${backX}" cy="${cy - 30}" r="16" ${inked(c)}/>`;
      return back ? { ...none, cap: cap + bun } : { ...none, behind: bun, cap };
    }
    case 'braids':
    case 'locs': {
      const braid = (id: string, s: number, x: number, x1: number) => {
        if (hair === 'braids') {
          const bead = (k: number) =>
            `<ellipse cx="${r1(x + (x1 - x) * (k / 4))}" cy="${cy + 6 + k * 12}" rx="8" ry="7.5" ${inked(c)}/>`;
          return swing(
            chains,
            id,
            'braid',
            [0, 1, 2, 3, 4].map(bead).join('') +
              `<circle cx="${r1(x1)}" cy="${cy + 64}" r="4" ${inked(accent)}/>`,
            [x, cy - 1.5],
            [x1, cy + 68],
            2,
          );
        }
        const y0 = back ? cy + 4 : cy - 20;
        const strand = (sx: number, long: number) =>
          `<rect x="${r1(sx - 5)}" y="${y0}" width="10" height="${back ? long - 20 : long}" rx="5" ${inked(c)}/>`;
        return swing(
          chains,
          id,
          'locs',
          strand(x - s * 5, s < 0 ? 70 : 66) +
            strand(x + s * 5, s < 0 ? 66 : 70),
          [x, cy],
          [x, cy + 48],
          2,
        );
      };
      const left = hair === 'braids' ? 'braid-l' : 'locs-l';
      const right = hair === 'braids' ? 'braid-r' : 'locs-r';
      if (back)
        return {
          ...none,
          cap,
          over: `<g class="hd">${braid(left, -1, backX - 26, backX - 20)}${braid(right, 1, backX + 26, backX + 20)}</g>`,
        };
      return {
        ...none,
        behind:
          view === '3q'
            ? braid(left, -1, -42, -40) + braid(right, 1, 34, 32)
            : braid(left, -1, -30, -34),
        cap,
      };
    }
    default:
      return { ...none, cap: side ? cap : '' };
  }
}

/** What is worn on the head, seen from a view. */
function headwearInView(spec: FigureSpec, R: Rig, view: FigureView): string {
  const { cy } = R;
  const c = CLOTH[spec.accentColour];
  const back = fromBehind(view);
  // How far a hat's front detail slides round with the face.
  const slide = view === '3q' ? 12 : view === 'profile' ? 24 : 0;
  switch (spec.headwear) {
    case 'cap': {
      const crown = `<path d="${chord(0, cy, 49.5, 44, -0.62)}" ${inked(c)}/>`;
      const button = `<circle cx="0" cy="${cy - 44}" r="3.5" ${inked(shade(c, 0.78))}/>`;
      if (back)
        return (
          crown +
          line(
            `M-14,${cy - 30} Q0,${cy - 38} 14,${cy - 30}`,
            shade(c, 0.7),
            2.4,
          ) +
          button
        );
      const reach = view === 'profile' ? 80 : 74;
      return (
        crown +
        `<path d="M6,${cy - 30} Q40,${cy - 43} ${reach},${cy - 35} Q${reach + 3},${cy - 30} ${reach - 4},${cy - 28} Q38,${cy - 27} 6,${cy - 30} Z" ${inked(shade(c, 0.78))}/>` +
        button
      );
    }
    case 'beanie':
      return (
        `<path d="${chord(0, cy, 49.5, 44, -0.6)}" ${inked(shade(c, 0.8))}/>` +
        `<path d="${chord(0, cy, 49.5, 44, -0.8)}" ${inked(c)}/>`
      );
    case 'sun hat':
      return (
        `<path d="M-33,${cy - 36} Q-33,${cy - 70} 0,${cy - 70} Q33,${cy - 70} 33,${cy - 36} Z" ${inked(c)}/>` +
        `<ellipse cx="0" cy="${cy - 35}" rx="70" ry="9" ${inked(c)}/>` +
        `<path d="M-32,${cy - 44} L32,${cy - 44} L32,${cy - 38} L-32,${cy - 38} Z" ${inked(shade(c, 0.7))}/>`
      );
    case 'turban':
      return (
        `<path d="M-50,${cy - 26} Q-58,${cy - 70} 0,${cy - 70} Q58,${cy - 70} 50,${cy - 26} Q0,${cy - 36} -50,${cy - 26} Z" ${inked(c)}/>` +
        line(
          `M-44,${cy - 30} Q-4,${cy - 62} 40,${cy - 58}`,
          shade(c, 0.72),
          2.4,
        ) +
        line(`M-48,${cy - 44} Q0,${cy - 70} 44,${cy - 40}`, shade(c, 0.72), 2.4)
      );
    case 'hard hat':
      return (
        `<path d="${chord(0, cy - 2, 50, 46, -0.61)}" ${inked(c)}/>` +
        line(
          `M${slide},${cy - 48} L${slide * 0.9},${cy - 32}`,
          shade(c, 0.72),
          3,
        ) +
        `<rect x="${view === 'profile' ? -54 : -58}" y="${cy - 34}" width="${view === 'profile' ? 122 : 116}" height="7" rx="3.5" ${inked(shade(c, 0.85))}/>`
      );
    case 'helmet':
      return (
        `<path d="${chord(0, cy - 2, 52, 48, -0.52)}" ${inked(c)}/>` +
        [-22, -6, 10]
          .map(
            (x) =>
              `<rect x="${x + (back ? 0 : slide * 0.8)}" y="${cy - 44}" width="12" height="7" rx="3.5" ${inked(shade(c, 0.7), 2)}/>`,
          )
          .join('')
      );
    case 'crown': {
      const [dx, k] =
        view === '3q'
          ? [4, 0.9]
          : view === 'profile'
            ? [6, 0.72]
            : view === 'back3q'
              ? [-4, 0.9]
              : [0, 1];
      const crown = `<path d="M-34,${cy - 28} L-38,${cy - 62} L-19,${cy - 44} L0,${cy - 70} L19,${cy - 44} L38,${cy - 62} L34,${cy - 28} Q0,${cy - 36} -34,${cy - 28} Z" ${inked(GOLD)}/>${[
        -38, 0, 38,
      ]
        .map(
          (x) =>
            `<circle cx="${x}" cy="${x ? cy - 62 : cy - 70}" r="4" ${inked(CLOTH.red, 2)}/>`,
        )
        .join('')}`;
      return k === 1
        ? crown
        : `<g transform="translate(${dx} 0) scale(${k} 1)">${crown}</g>`;
    }
    case 'graduation cap':
      return (
        `<path d="${chord(0, cy, 49.5, 44, -0.62)}" ${inked(c)}/>` +
        `<path d="M-56,${cy - 48} L0,${cy - 60} L56,${cy - 48} L0,${cy - 36} Z" ${inked(c)}/>` +
        line(`M0,${cy - 48} L40,${cy - 44} L44,${cy - 28}`, GOLD, 2.6) +
        `<circle cx="44" cy="${cy - 26}" r="3.5" ${flat(GOLD)}/>`
      );
    case 'gele':
      return (
        `<path d="M-52,${cy - 24} Q-74,${cy - 60} -40,${cy - 82} Q-14,${cy - 100} 8,${cy - 86} Q38,${cy - 104} 58,${cy - 76} Q76,${cy - 50} 52,${cy - 24} Q0,${cy - 40} -52,${cy - 24} Z" ${inked(c)}/>` +
        line(
          `M-40,${cy - 34} Q-44,${cy - 66} -18,${cy - 80}`,
          shade(c, 0.72),
          2.4,
        ) +
        line(
          `M-10,${cy - 38} Q-6,${cy - 74} 22,${cy - 90}`,
          shade(c, 0.72),
          2.4,
        ) +
        line(`M20,${cy - 38} Q34,${cy - 66} 56,${cy - 70}`, shade(c, 0.72), 2.4)
      );
    case 'kufi':
      return (
        `<path d="${chord(0, cy, 48, 43, -0.66)}" ${inked(c)}/>` +
        [-26, -9, 9, 26]
          .map(
            (x) =>
              `<circle cx="${Math.min(24, x + (back ? 0 : slide * 0.4))}" cy="${cy - 34 - (Math.abs(x) < 10 ? 3 : 0)}" r="2.6" ${flat(shade(c, 0.7))}/>`,
          )
          .join('')
      );
    case 'crested helmet': {
      const steel = '#b9bec6';
      // The crest runs front to back over the top: from the side, all of its length.
      const crest =
        view === 'profile'
          ? `<path d="M-44,${cy - 36} Q0,${cy - 96} 42,${cy - 40} Q0,${cy - 64} -44,${cy - 36} Z" ${inked(CLOTH.red)}/>`
          : view === '3q' || view === 'back3q'
            ? `<path d="M-38,${cy - 40} Q0,${cy - 90} 36,${cy - 42} Q0,${cy - 63} -38,${cy - 40} Z" ${inked(CLOTH.red)}/>`
            : `<path d="M-30,${cy - 42} Q0,${cy - 86} 30,${cy - 42} Q0,${cy - 62} -30,${cy - 42} Z" ${inked(CLOTH.red)}/>`;
      const guard = (x: number, s: number) =>
        `<path d="M${x + s * 8},${cy - 26} L${x + s * 12},${cy + 6} Q${x + s * 6},${cy + 14} ${x},${cy + 6} L${x},${cy - 26} Z" ${inked(steel)}/>`;
      const guards =
        view === '3q'
          ? guard(-38, -1)
          : view === 'profile'
            ? guard(-8, 1)
            : view === 'back3q'
              ? guard(34, 1)
              : guard(-38, -1) + guard(38, 1);
      return (
        `<path d="${chord(0, cy - 2, 51, 47, -0.5)}" ${inked(steel)}/>` +
        crest +
        `<rect x="-56" y="${cy - 30}" width="112" height="6" rx="3" ${inked(shade(steel, 0.8))}/>` +
        guards
      );
    }
    default:
      return '';
  }
}

/** An ear: a round of skin with a curl in it. */
const ear = ([x, y]: Point2, skin: string, s: number) =>
  `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="7" ry="10" ${inked(skin)}/>` +
  line(
    `M${pt(x + s * 2, y - 5)} Q${pt(x - s * 3, y)} ${pt(x + s * 1, y + 5)}`,
    shade(skin, 0.72),
    2,
  );

/** The head in a view: its skin (or the cloth wrapped round it), ears, beard, hair and hat, and what hangs behind it. */
function headInView(
  spec: FigureSpec,
  R: Rig,
  geo: Geo,
  skin: string,
  chains: Chains,
): { head: string; behind: string; over: string } {
  const { view } = geo;
  const { cy, sY } = R;
  const head: string[] = [];
  const back = fromBehind(view);
  const hairColour = HAIR[spec.hairColour];
  const faceAt =
    view === '3q'
      ? { x: 10, rx: 34 }
      : view === 'profile'
        ? { x: 22, rx: 24 }
        : null;
  let behind = '';
  if (spec.headwear === 'headscarf' || spec.headwear === 'mantle') {
    const c = CLOTH[spec.accentColour];
    const fall = spec.headwear === 'mantle' ? sY + 44 : sY + 30;
    const dx =
      view === '3q' ? -4 : view === 'profile' ? -8 : view === 'back3q' ? -3 : 0;
    head.push(
      `<path d="M${-54 + dx},${cy} Q${-54 + dx},${cy - 52} ${dx},${cy - 52} Q${54 + dx},${cy - 52} ${54 + dx},${cy} Q${58 + dx},${sY + 22} ${46 + dx},${fall} L${-46 + dx},${fall} Q${-58 + dx},${sY + 22} ${-54 + dx},${cy} Z" ${inked(c)}/>`,
    );
    if (faceAt)
      head.push(
        `<ellipse cx="${faceAt.x}" cy="${cy + 5}" rx="${faceAt.rx}" ry="36" ${inked(skin)}/>`,
      );
    else if (!back)
      head.push(
        `<ellipse cx="0" cy="${cy + 5}" rx="41" ry="36" ${inked(skin)}/>`,
      );
  } else if (spec.headwear === 'nemes') {
    const dx = view === '3q' ? -4 : view === 'profile' ? -10 : 0;
    const stripes = [-1, 1]
      .flatMap((s) =>
        [0, 1, 2].map((k) =>
          line(
            `M${s * (46 + k * 3) + dx},${cy + k * 14} L${s * (40 + k * 3) + dx},${sY + 30}`,
            CLOTH.navy,
            3,
          ),
        ),
      )
      .join('');
    head.push(
      `<path d="M${-50 + dx},${cy - 22} Q${-48 + dx},${cy - 50} ${dx},${cy - 52} Q${48 + dx},${cy - 50} ${50 + dx},${cy - 22} L${62 + dx},${sY + 36} L${-62 + dx},${sY + 36} Z" ${inked(GOLD)}/>`,
      stripes,
    );
    if (faceAt)
      head.push(
        `<ellipse cx="${faceAt.x}" cy="${cy + 5}" rx="${faceAt.rx}" ry="35" ${inked(skin)}/>`,
        `<path d="M${faceAt.x - faceAt.rx},${cy - 20} Q${faceAt.x},${cy - 34} ${faceAt.x + faceAt.rx + 2},${cy - 20} L${faceAt.x + faceAt.rx},${cy - 10} Q${faceAt.x},${cy - 22} ${faceAt.x - faceAt.rx},${cy - 10} Z" ${inked(CLOTH.navy)}/>`,
      );
    else if (back)
      // Its tail, gathered at the back.
      head.push(
        `<path d="M-10,${cy + 10} L10,${cy + 10} L8,${sY + 44} L-8,${sY + 44} Z" ${inked(GOLD)}/>`,
        line(`M0,${cy + 12} L0,${sY + 42}`, CLOTH.navy, 3),
      );
    else
      head.push(
        `<ellipse cx="0" cy="${cy + 5}" rx="40" ry="35" ${inked(skin)}/>`,
        `<path d="M-42,${cy - 20} Q0,${cy - 34} 42,${cy - 20} L40,${cy - 10} Q0,${cy - 22} -40,${cy - 10} Z" ${inked(CLOTH.navy)}/>`,
      );
  } else {
    head.push(
      `<ellipse cx="0" cy="${cy}" rx="${HEAD.rx}" ry="${HEAD.ry}" ${inked(skin)}/>`,
    );
    if (view === 'back3q')
      // Turned away to the right: the cheek's curve past the back of the head.
      head.push(
        `<path d="M42,${cy + 2} Q52,${cy + 16} 36,${cy + 34} L30,${cy + 26} L36,${cy + 4} Z" ${flat(skin)}/>`,
        `<path d="M43,${cy + 2} Q52,${cy + 16} 36,${cy + 34}" fill="none"/>`,
      );
    if (view === 'profile')
      // The nose: a small bump at the face's edge, its outline the head's.
      head.push(
        `<path d="M44.6,${cy - 2} Q54,${cy + 6} 43.4,${cy + 13} L36,${cy + 11} L37,${cy} Z" ${flat(skin)}/>`,
        `<path d="M45.4,${cy - 2} Q54,${cy + 6} 43.4,${cy + 13}" fill="none"/>`,
      );
  }
  const covered = wrapped(spec) || spec.headwear === 'mantle';
  const hair = hairInView(spec, R, view, chains);
  // Ears show on a head no cloth wraps; long hair covers them.
  const ears =
    covered || spec.headwear === 'crested helmet'
      ? ''
      : geo.ears
          .map((p) =>
            ear(
              p,
              skin,
              view === 'back' ? Math.sign(p[0]) : view === 'back3q' ? 1 : -1,
            ),
          )
          .join('');
  const earsUnder = HIDES_EARS.has(spec.hair);
  if (earsUnder) head.push(ears);
  if (!back && spec.extras.includes('freckles'))
    for (const e of geo.eyes)
      for (const [dx, dy] of [
        [0, 0],
        [5, 3],
        [-4, 4],
      ])
        head.push(
          `<circle cx="${r1(e.x + (e.side * 14.5 + dx) * e.w)}" cy="${cy + 20 + dy}" r="1.7" ${flat(shade(skin, 0.62))}/>`,
        );
  // Facial hair, on the face's side of the head.
  if (!back && (spec.facialHair === 'stubble' || spec.facialHair === 'beard')) {
    const stubble = spec.facialHair === 'stubble';
    const d = stubble
      ? chord(0, cy, HEAD.rx, HEAD.ry, 0.35, 0, 'bottom')
      : chord(0, cy + 3, 47, 44, 0.3, 0, 'bottom');
    const fill = stubble
      ? `${flat(hairColour)} fill-opacity="0.28"`
      : inked(hairColour);
    head.push(
      view === 'profile'
        ? stubble
          ? `<g clip-path="url(#${chains.clip}-jaw)"><path d="${d}" ${fill}/></g>`
          : // A beard from the ear down round the jaw to the chin.
            `<path d="M-4,${cy + 8} Q-8,${cy + 34} 12,${cy + 44} Q36,${cy + 48} 45,${cy + 26} Q40,${cy + 18} 34,${cy + 20} Q16,${cy + 28} 2,${cy + 12} Z" ${fill}/>`
        : view === '3q'
          ? stubble
            ? `<g clip-path="url(#${chains.clip}-jaw)"><path d="${d}" ${fill} transform="translate(5 0)"/></g>`
            : `<path d="${d}" ${fill} transform="translate(5 0)"/>`
          : `<path d="${d}" ${fill}/>`,
    );
  }
  if (view === 'back' && spec.facialHair === 'beard')
    // A beard shows past the jaw from behind.
    head.push(
      [-1, 1]
        .map(
          (s) =>
            `<path d="M${s * 40},${cy + 18} Q${s * 46},${cy + 36} ${s * 30},${cy + 44} L${s * 36},${cy + 24} Z" ${inked(hairColour)}/>`,
        )
        .join(''),
    );
  head.push(hair.cap);
  if (!earsUnder) head.push(ears);
  head.push(headwearInView(spec, R, view));
  if (
    spec.extras.includes('earrings') &&
    spec.headwear !== 'headscarf' &&
    !covered &&
    !earsUnder
  )
    for (const [x, y] of geo.ears)
      head.push(
        `<circle cx="${r1(x)}" cy="${r1(y + 10)}" r="3.4" ${inked(GOLD, 1.8)}/>`,
      );
  // A ribbon's bow on the side of the head it is tied: from the front its
  // right, which turns away as the face turns right.
  const accent = CLOTH[spec.accentColour];
  let ribbonOver = '';
  if (spec.extras.includes('ribbon')) {
    const [bx, by] =
      view === '3q'
        ? [22, cy - 38]
        : view === 'profile'
          ? [-24, cy - 34]
          : view === 'back3q'
            ? [-36, cy - 24]
            : [-44, cy - 22];
    const bow =
      `<path d="M${bx},${by} L${bx - 13},${by - 11} L${bx - 11},${by + 11} Z" ${inked(accent)}/>` +
      `<path d="M${bx},${by} L${bx + 13},${by - 11} L${bx + 11},${by + 11} Z" ${inked(accent)}/>` +
      `<circle cx="${bx}" cy="${by}" r="4.5" ${inked(shade(accent, 0.85))}/>`;
    const ends = swing(
      chains,
      'ribbon',
      'ribbon',
      `<path d="M${bx + 2},${by + 4} L${bx + 10},${by + 4} L${bx + 24},${by + 50} L${bx + 19},${by + 47} L${bx + 16},${by + 53} Z" ${inked(shade(accent, 0.85))}/>` +
        `<path d="M${bx - 2},${by + 4} L${bx + 6},${by + 4} L${bx + 12},${by + 58} L${bx + 7},${by + 54} L${bx + 3},${by + 59} Z" ${inked(accent)}/>`,
      [bx + 4, by + 4],
      [bx + 16, by + 56],
      2,
    );
    if (back) ribbonOver = ends + bow;
    else {
      behind += ends;
      head.push(bow);
    }
  }
  // A headscarf's end, knotted below the ear on the side it is tied.
  let tailOver = '';
  if (spec.extras.includes('headscarf tail')) {
    const [kx, ky] =
      view === '3q'
        ? [30, cy + 34]
        : view === 'profile'
          ? [-4, cy + 30]
          : view === 'back3q'
            ? [-26, cy + 32]
            : [-40, cy + 33];
    const tail = swing(
      chains,
      'headscarf',
      'headscarf',
      `<path d="M${kx - 6},${ky + 1} L${kx + 7},${ky - 1} L${kx + 18},${sY + 50} L${kx + 12},${sY + 45} L${kx + 7},${sY + 52} Z" ${inked(accent)}/>` +
        line(
          `M${kx + 1},${ky + 5} L${kx + 10},${sY + 44}`,
          shade(accent, 0.78),
          2.2,
        ),
      [kx, ky + 1],
      [kx + 13, sY + 51],
      2,
    );
    const knot = `<ellipse cx="${kx}" cy="${ky}" rx="8" ry="6.5" ${inked(shade(accent, 0.9))}/>`;
    if (view === 'profile') tailOver = tail + knot;
    else head.push(tail + knot);
  }
  return {
    head: `<g class="hd">${head.join('')}</g>`,
    behind: hair.behind + behind,
    over:
      hair.over +
      (ribbonOver || tailOver
        ? `<g class="hd">${ribbonOver}${tailOver}</g>`
        : ''),
  };
}

// ── The body, the arms and the legs ───────────────────────────────────────

/** What is across the body all the way round (a belt, a band, a hem): drawn at the view's width, never slid. */
function bandsOf(
  spec: FigureSpec,
  R: Rig,
  k: number,
  bottom: number,
  mid: number,
): string {
  const top = CLOTH[spec.topColour];
  const accent = CLOTH[spec.accentColour];
  const h2 = R.halfHem * k;
  const s2 = R.halfShoulder * k;
  const { hemY, sY } = R;
  switch (spec.top) {
    case 'jumper':
      return `<path d="M${r1(-h2)},${hemY} L${r1(-h2 + 1.3)},${hemY - 7} L${r1(h2 - 1.3)},${hemY - 7} L${r1(h2)},${hemY} Z" ${inked(shade(top))}/>`;
    case 'uniform':
      return `<rect x="${r1(-h2 + 3)}" y="${r1(mid + 8)}" width="${r1(h2 * 2 - 6)}" height="7" ${inked(CLOTH.black)}/>`;
    case 'robe':
      return `<rect x="${r1(-h2 + 3)}" y="${mid}" width="${r1(h2 * 2 - 6)}" height="7" rx="3" ${inked(accent)}/>`;
    case 'tunic':
      return `<rect x="${r1(-h2 + 2)}" y="${mid + 6}" width="${r1(h2 * 2 - 4)}" height="6" ${inked(CLOTH.brown)}/>`;
    case 'dress':
      return line(
        `M${r1(-s2 - 1)},${mid} L${r1(s2 + 1)},${mid}`,
        FIGURE_INK,
        LINE,
      );
    case 'animal skin': {
      const hide = '#b8905a';
      const half = h2 + 4;
      const teeth: string[] = [];
      for (let x = -half; x < half - 2; x += 12)
        teeth.push(
          `<path d="M${r1(x)},${r1(bottom - 1)} L${r1(x + 6)},${r1(bottom + 7)} L${r1(x + 12)},${r1(bottom - 1)}" ${inked(hide)}/>`,
        );
      return (
        teeth.join('') +
        `<rect x="${r1(-h2 + 2)}" y="${mid + 4}" width="${r1(h2 * 2 - 4)}" height="7" ${inked('#6b4a2f')}/>`
      );
    }
    case 'armour': {
      const steel = '#b9bec6';
      const skirt = R.legs * 0.35;
      const strips: string[] = [];
      for (let x = -h2 + 4; x < h2 - 6; x += 11)
        strips.push(
          `<rect x="${r1(x)}" y="${r1(hemY - 2)}" width="8" height="${r1(skirt)}" rx="2" ${inked('#7a5334', 2)}/>`,
        );
      return (
        `<rect x="${r1(-h2 - 1)}" y="${r1(hemY - 2)}" width="${r1(h2 * 2 + 2)}" height="${r1(skirt)}" ${inked(accent)}/>` +
        strips.join('') +
        [0.28, 0.5, 0.72]
          .map((f) =>
            line(
              `M${r1(-s2 + 4)},${r1(sY + (hemY - sY) * f)} L${r1(s2 - 4)},${r1(sY + (hemY - sY) * f)}`,
              shade(steel, 0.72),
              2.4,
            ),
          )
          .join('')
      );
    }
    default:
      return '';
  }
}

/** What shows on the back of what is worn: a collar, a hood, an apron's bow. */
function backDetails(spec: FigureSpec, R: Rig): string {
  const top = CLOTH[spec.topColour];
  const accent = CLOTH[spec.accentColour];
  const { sY, hemY } = R;
  switch (spec.top) {
    case 'hoodie':
      return `<path d="M-30,${sY + 2} Q-32,${sY + 30} 0,${sY + 34} Q32,${sY + 30} 30,${sY + 2} Z" ${inked(shade(top))}/>`;
    case 'shirt and tie':
    case 'jacket':
    case 'coat':
    case 'lab coat':
    case 'uniform':
    case 'cardigan':
    case 'pyjamas':
      return (
        `<path d="M-18,${sY + 1} Q0,${sY + 11} 18,${sY + 1} L16,${sY - 1} Q0,${sY + 6} -16,${sY - 1} Z" ${inked(shade(spec.top === 'lab coat' ? CLOTH.white : top, 0.86))}/>` +
        (spec.top === 'coat' || spec.top === 'lab coat'
          ? line(`M0,${hemY - 30} L0,${r1(hemY + 6)}`, FIGURE_INK, LINE)
          : '')
      );
    case 'apron':
      return (
        line(`M-14,${sY + 2} L14,${sY + 2}`, shade(accent), 3) +
        `<path d="M0,${hemY - 14} L-12,${hemY - 20} L-12,${hemY - 8} Z" ${inked(accent)}/><path d="M0,${hemY - 14} L12,${hemY - 20} L12,${hemY - 8} Z" ${inked(accent)}/>` +
        line(
          `M${-R.halfHem + 3},${hemY - 14} L${R.halfHem - 3},${hemY - 14}`,
          shade(accent),
          3,
        )
      );
    default:
      return '';
  }
}

/** One arm as a view has it: where the shoulder, elbow and hand are, and which layer it is drawn in. */
interface ArmPlan {
  s: -1 | 1;
  S: Point2;
  E?: Point2;
  H: Point2;
  layer: 'behind' | 'arms' | 'reach';
  /** It holds what is held, points or waves. */
  busy: boolean;
}

/**
 * Each arm's plan in a view, from the pose as the front draws it: the
 * shoulders where the view's body has them, the hand as far out and up
 * from its shoulder as the front's (reaching forward from the side), a
 * hand to the face where the view's face is. In profile and
 * three-quarter the far arm is behind the body, unless it is doing
 * something; from behind, a hand at the face is behind the head.
 */
function armPlans(
  R: Rig,
  geo: Geo,
  pose: FigurePose,
  holding: FigureProp | null,
  dressed: Dressed,
): ArmPlan[] {
  const { sY, hemY, cy, halfShoulder: s2front } = R;
  const h2 = R.halfHem;
  const long = hemY - sY;
  const belly = r1(sY + (hemY - sY) * 0.66);
  const holds = holderOf(pose, holding);
  const { view, k } = geo;
  const rest = (s: number): Point2 => [s * (h2 + 3), hemY - 8];
  // The front's plan, as layersOf makes it.
  const frontPlan = (
    s: number,
  ): { at: Point2; elbow?: Point2; front?: boolean } => {
    if (holding && s === holds)
      switch (GRIPS[holding].grip) {
        case 'down':
          return { at: [s * (h2 + 3), Math.min(hemY - 8, -46)] };
        case 'high':
          return {
            at: [s * (s2front + 18), r1(sY + 4)],
            elbow: [s * (s2front + 16), r1(sY + long * 0.5)],
          };
        default:
          return {
            at: [s * (s2front + 20), r1(sY + long * 0.3)],
            elbow: [s * (s2front + 5), r1(sY + long * 0.62)],
          };
      }
    const right = s === 1;
    switch (pose) {
      case 'hand on head':
        return right ? { at: [36, cy - 16], front: true } : { at: rest(s) };
      case 'hand on mouth':
        return right ? { at: [6, R.mouthY + 3], front: true } : { at: rest(s) };
      case 'hands on belly':
        return { at: [s * 12, belly] };
      case 'arms up':
        return { at: [s * (s2front + 24), sY - 40] };
      case 'pointing':
        return right ? { at: [s2front + 44, sY + 14] } : { at: rest(s) };
      case 'waving':
        return right ? { at: [s2front + 30, sY - 38] } : { at: rest(s) };
      default:
        return { at: rest(s) };
    }
  };
  const busyOf = (s: number) =>
    s === holds ||
    (s === 1 &&
      (pose === 'pointing' ||
        pose === 'waving' ||
        pose === 'hand on head' ||
        pose === 'hand on mouth')) ||
    pose === 'arms up' ||
    pose === 'hands on belly';
  const out: ArmPlan[] = [];
  const s2 = s2front * k;
  for (const s of [-1, 1] as const) {
    const plan = frontPlan(s);
    const Sf: Point2 = [s * (s2front - 7), sY + 12];
    const v: Point2 = [plan.at[0] - Sf[0], plan.at[1] - Sf[1]];
    const ve: Point2 | undefined = plan.elbow
      ? [plan.elbow[0] - Sf[0], plan.elbow[1] - Sf[1]]
      : undefined;
    const busy = busyOf(s);
    const resting =
      !plan.elbow && plan.at[0] === rest(s)[0] && plan.at[1] === rest(s)[1];
    let S: Point2;
    let H: Point2;
    let E: Point2 | undefined;
    let layer: ArmPlan['layer'] = plan.front ? 'reach' : 'arms';
    if (view === 'profile') {
      // Both shoulders near the body's middle, the far one a little back;
      // what reaches out from the side reaches forward.
      S = s < 0 ? [-2, sY + 12] : [4, sY + 12];
      const forward = (d: Point2): Point2 => [Math.abs(d[0]) * 0.95, d[1]];
      if (resting) H = [S[0] + 4, hemY - 8];
      else if (pose === 'hands on belly') H = [r1(s2 + 4), belly];
      else if (plan.front && pose === 'hand on mouth')
        H = [r1((geo.mouth?.x ?? 30) - 4), R.mouthY + 3];
      else if (plan.front && pose === 'hand on head') H = [8, cy - 34];
      else {
        const d = forward(v);
        H = [r1(S[0] + d[0]), r1(S[1] + d[1])];
      }
      if (ve) {
        const d = forward(ve);
        E = [r1(S[0] + d[0]), r1(S[1] + d[1])];
      }
      if (s === 1 && !busy) layer = 'behind';
    } else if (view === 'back') {
      S = Sf;
      H = plan.at;
      E = plan.elbow;
      // What is held up in front is behind them.
      if (plan.elbow) layer = 'behind';
      // A hand at the face or on the belly is hidden in front of them.
      if (plan.front) layer = pose === 'hand on head' ? 'reach' : 'behind';
      else if (pose === 'hands on belly') layer = 'behind';
    } else {
      // Three-quarter, from the front or behind: the near shoulder out at
      // the body's edge, the far one tucked in behind it.
      const near: -1 | 1 = view === '3q' ? -1 : 1;
      S = s === near ? [s * (s2 - 7), sY + 12] : [s * (s2 - 12), sY + 12];
      const along = (d: Point2): Point2 => [
        d[0] * (s === near ? 0.9 : 0.8),
        d[1],
      ];
      const d = along(v);
      H = [r1(S[0] + d[0]), r1(S[1] + d[1])];
      if (resting) H = [r1(s * (h2 * k + (s === near ? 3 : -2))), hemY - 8];
      if (plan.front && pose === 'hand on mouth')
        H = view === '3q' ? [r1((geo.mouth?.x ?? 14) - 6), R.mouthY + 3] : H;
      if (ve) {
        const de = along(ve);
        E = [r1(S[0] + de[0]), r1(S[1] + de[1])];
      }
      if (s !== near && !busy) layer = 'behind';
      if (view === 'back3q' && plan.front)
        layer = pose === 'hand on head' ? 'reach' : 'behind';
      if (view === 'back3q' && plan.elbow) layer = 'behind';
    }
    out.push({ s, S, E, H, layer, busy });
  }
  void dressed;
  return out;
}

/** An arm drawn as the front draws one: its sleeve, a cuff, what the hand holds, the hand, a pointing finger, the stick at its side. */
function armMarkup(
  spec: FigureSpec,
  R: Rig,
  dressed: Dressed,
  skin: string,
  plan: ArmPlan,
  o: {
    holding: FigureProp | null;
    holds: boolean;
    pointing: boolean;
    waving: boolean;
    stick: boolean;
    /** Props face forward in profile, whichever hand holds them. */
    forward: boolean;
  },
): { arm: string; stick: string } {
  const { s, S, H } = plan;
  const E: Point2 = plan.E ?? [r1((S[0] + H[0]) / 2), r1((S[1] + H[1]) / 2)];
  const { stretch } = alongOf([S, E, H]);
  const upperLength = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const u =
    upperLength / (upperLength + Math.hypot(H[0] - E[0], H[1] - E[1]) || 1);
  const width = spec.build === 'slim' ? 14 : spec.build === 'broad' ? 16 : 15;
  const w =
    dressed.sleeves === 'flowing'
      ? width + 14
      : dressed.sleeves === 'wide'
        ? width + 5
        : width;
  const colour = dressed.sleeves === 'short' ? skin : dressed.sleeve;
  let stick = '';
  if (o.stick) {
    const out = o.forward ? 1 : s;
    const d = `M${pt(H[0] + out * 2, H[1] - 6)} L${pt(H[0] + out * 7, -3)}`;
    stick = line(d, FIGURE_INK, 7) + line(d, WOOD, 4);
  }
  const fore: string[] = [
    line(stretch(u, 1), FIGURE_INK, w + LINE * 2),
    line(stretch(u, 1), colour, w),
  ];
  if (spec.top === 'jumper')
    fore.push(line(stretch(Math.max(0.8, u), 0.9), shade(dressed.sleeve), w));
  if (o.holding && o.holds) {
    const prop = propOf(
      o.holding,
      CLOTH[spec.accentColour],
      R.top - H[1],
      -H[1],
    );
    const mirror = !o.forward && s < 0;
    fore.push(
      `<g transform="translate(${r1(H[0])} ${r1(H[1])})${mirror ? ' scale(-1 1)' : ''}">${prop.markup}</g>`,
    );
  }
  fore.push(
    `<circle cx="${r1(H[0])}" cy="${r1(H[1])}" r="8.5" ${inked(skin)}/>`,
  );
  if (o.pointing)
    fore.push(
      `<rect x="${r1(H[0] + 4)}" y="${r1(H[1] - 3.5)}" width="13" height="7" rx="3.5" ${inked(skin)}/>`,
    );
  const upper = [line(stretch(0, u), colour, w)];
  if (dressed.sleeves === 'short')
    upper.push(line(stretch(0, Math.min(0.42, u)), dressed.sleeve, w));
  let arm = `${line(stretch(0, u), FIGURE_INK, w + LINE * 2)}<g class="fore" style="transform-origin:${r1(E[0])}px ${r1(E[1])}px">${fore.join('')}</g>${upper.join('')}`;
  if (o.waving) arm = `<g class="wave">${arm}</g>`;
  return {
    arm: `<g class="arm ${s > 0 ? 'ar' : 'al'}" style="transform-origin:${r1(S[0])}px ${r1(S[1])}px">${arm}</g>`,
    stick,
  };
}

/** A view's legs: each its own group turning about its hip, bending at its knee, its foot flat and pointing where the view faces. */
function legsInView(
  spec: FigureSpec,
  R: Rig,
  geo: Geo,
  skin: string,
): { legs: string; joints: Record<'r' | 'l', [Point2, Point2, Point2]> } {
  const { hemY } = R;
  const { view } = geo;
  const bare =
    spec.top === 'dress' ||
    spec.top === 'robe' ||
    spec.top === 'animal skin' ||
    spec.top === 'armour' ||
    spec.bottom === 'skirt' ||
    spec.bottom === 'wrapper';
  const trousers = CLOTH[spec.bottomColour];
  const legTop = hemY - 4;
  const kneeY = r1((legTop - FEET) / 2);
  // Each leg's middle across, and its toe's way: the far leg first.
  const places: { s: -1 | 1; x: number; toe: number; far: boolean }[] =
    view === '3q'
      ? [
          { s: 1, x: 13, toe: 5, far: true },
          { s: -1, x: -11, toe: 5, far: false },
        ]
      : view === 'profile'
        ? [
            { s: 1, x: -4, toe: 8, far: true },
            { s: -1, x: 2, toe: 8, far: false },
          ]
        : view === 'back3q'
          ? [
              { s: -1, x: -13, toe: 4, far: true },
              { s: 1, x: 11, toe: 4, far: false },
            ]
          : [
              { s: -1, x: -15, toe: -2, far: false },
              { s: 1, x: 15, toe: 2, far: false },
            ];
  const legs: string[] = [];
  const joints = {} as Record<'r' | 'l', [Point2, Point2, Point2]>;
  for (const { s, x: cx, toe, far } of places) {
    const x = cx - 8;
    const own = bare || spec.bottom === 'shorts' ? skin : trousers;
    const colour = far && view === 'profile' ? shade(own, 0.88) : own;
    const piece = (open: number, shut: number) =>
      `<path d="M${x},${r1(open)} V${r1(shut)} H${x + 16} V${r1(open)}" fill="${colour}"/>`;
    const thigh = [piece(kneeY + 1, legTop)];
    if (!bare && spec.bottom === 'shorts') {
      const cut = hemY + Math.max(8, (-FEET - hemY) * 0.45);
      thigh.push(
        `<rect x="${x - 1}" y="${legTop}" width="18" height="${r1(cut - legTop)}" ${inked(far && view === 'profile' ? shade(trousers, 0.88) : trousers)}/>`,
      );
    }
    const fx = cx + toe;
    const foot = spec.extras.includes('sandals')
      ? [
          `<ellipse cx="${fx}" cy="-6" rx="15" ry="7" ${inked(skin)}/>`,
          line(`M${fx - 11},-5 L${fx + 11},-5`, '#6b4a2f', 3),
          line(`M${fx - 4},-11 L${fx - 4},-1`, '#6b4a2f', 3),
        ]
      : spec.extras.includes('bare feet')
        ? [
            `<ellipse cx="${fx - Math.sign(toe)}" cy="-5" rx="13" ry="6" ${inked(skin)}/>`,
          ]
        : [
            `<ellipse cx="${fx}" cy="-6" rx="15" ry="7" ${inked(far && view === 'profile' ? shade(SHOE, 0.8) : SHOE)}/>`,
          ];
    const shin = [
      piece(kneeY, -FEET),
      `<g class="foot" style="transform-origin:${cx}px ${-FEET}px">${foot.join('')}</g>`,
    ];
    legs.push(
      `<g class="leg l${s < 0 ? 0 : 1}" style="transform-origin:${cx}px ${r1(legTop)}px"><circle cx="${cx}" cy="${kneeY}" r="8" fill="${colour}"/><g class="shin" style="transform-origin:${cx}px ${kneeY}px">${shin.join('')}</g>${thigh.join('')}</g>`,
    );
    joints[s > 0 ? 'r' : 'l'] = [
      [cx, r1(legTop)],
      [cx, kneeY],
      [cx, -FEET],
    ];
  }
  const h2 = R.halfHem * geo.k;
  if (
    (spec.bottom === 'skirt' || spec.bottom === 'wrapper') &&
    spec.top !== 'dress' &&
    spec.top !== 'robe'
  ) {
    const wrapper = spec.bottom === 'wrapper';
    const down = wrapper ? -FEET - 3 : hemY + Math.max(12, R.legs * 0.5);
    const skirt = [
      `<path d="M${r1(-h2 + 2)},${hemY - 6} L${r1(h2 - 2)},${hemY - 6} L${r1(h2 + 6)},${r1(down)} L${r1(-h2 - 6)},${r1(down)} Z" ${inked(trousers)}/>`,
    ];
    if (wrapper) {
      if (!fromBehind(view))
        skirt.push(
          line(
            `M${r1(h2 - 4)},${hemY - 4} L${r1(-h2 * 0.2 + (view === 'profile' ? h2 * 0.8 : 0))},${r1(down)}`,
            shade(trousers, 0.72),
            2.4,
          ),
        );
      skirt.push(
        `<rect x="${r1(-h2 + 2)}" y="${hemY - 6}" width="${r1(h2 * 2 - 4)}" height="6" ${inked(shade(trousers, 0.85), 2)}/>`,
      );
    }
    legs.push(
      wrapper
        ? `<g class="skirt wrap" style="transform-origin:0 ${hemY - 6}px;--reach:${r1(down - (hemY - 6))}">${skirt.join('')}</g>`
        : `<g class="skirt">${skirt.join('')}</g>`,
    );
  }
  return { legs: legs.join(''), joints };
}

// ── One view of one person ────────────────────────────────────────────────

/** What one view of one person is drawn from, layer by layer, as the front's Layers. */
interface ViewLayers {
  legs: string;
  behind: string;
  body: string;
  arms: string;
  reach: string;
  head: string;
  eyes: string;
  faces: Record<Expression, string>;
  more: Record<KitFace, string>;
  asked: Record<AskedFace, string>;
  mouths: string;
  signs: Record<FigureSign, string>;
  blink: string;
  over: string;
  /** Clip paths this view draws with: the eyes', half a mouth's, the jaw's. */
  defs: string;
  dangles: Dangle[];
  /** Each arm's shoulder, elbow and hand as this view draws them: its joints. */
  joints: Record<'r' | 'l', [Point2, Point2, Point2]>;
}

/** One person in one view (not the front's, which is rig 2's): every layer the rig's tree has. */
function viewLayers(
  spec: FigureSpec,
  pose: FigurePose,
  holding: FigureProp | null,
  clip: string,
  view: FigureView,
): ViewLayers {
  const chains: Chains = { clip, dangles: [] };
  const R = rigOf(spec.age, spec.build);
  const geo = geoOf(view, R);
  const skin = SKIN[Math.min(SKIN.length, Math.max(1, spec.skin)) - 1];
  const dressed = dressOf(spec, R);
  const { hemY, sY, cy, halfShoulder } = R;
  const { k } = geo;
  const s2 = halfShoulder * k;
  const back = fromBehind(view);
  const accent = CLOTH[spec.accentColour];
  const bottom = hemY + dressed.longer;
  const slope = (R.halfHem - halfShoulder) / (hemY - (sY + 12));
  const halfAt = (y: number) =>
    (halfShoulder +
      slope * (y - (sY + 12)) +
      (y > hemY
        ? (dressed.flare * (y - hemY)) / Math.max(1, dressed.longer)
        : 0)) *
    k;
  const hb = halfAt(bottom);
  const mid = r1(sY + (hemY - sY) * 0.5);
  const eyesClip = `${clip}-eyes`;
  const halfClip = `${clip}-mh`;
  const bodyClip = `${clip}-bd`;
  const defs: string[] = [];

  // The body: the trapezoid at the view's width, what goes round it, and
  // what is on its front slid toward the side it faces.
  const shapeD = `M${r1(-hb)},${r1(bottom)} L${r1(-s2)},${sY + 12} Q${r1(-s2)},${sY} ${r1(-s2 + 12)},${sY} L${r1(s2 - 12)},${sY} Q${r1(s2)},${sY} ${r1(s2)},${sY + 12} L${r1(hb)},${r1(bottom)} Z`;
  const shape = `<path d="${shapeD}" ${inked(dressed.fill)}/>`;
  defs.push(`<clipPath id="${bodyClip}"><path d="${shapeD}"/></clipPath>`);
  const slid = (markup: string) =>
    geo.slide && markup
      ? `<g clip-path="url(#${bodyClip})"><g transform="translate(${geo.slide.dx} 0) scale(${geo.slide.k} 1)">${markup}</g></g>`
      : '';
  const body: string[] = [shape];
  const behindBody: string[] = [];
  const overBack: string[] = [];
  if (back) body.push(bandsOf(spec, R, k, bottom, mid), backDetails(spec, R));
  else {
    body.push(slid(dressed.details), bandsOf(spec, R, k, bottom, mid));
    // The uniform's buckle sits on its belt.
    if (spec.top === 'uniform')
      body.push(
        slid(
          `<rect x="-5" y="${r1(mid + 8.5)}" width="10" height="6" rx="1" ${inked(GOLD, 1.6)}/>`,
        ),
      );
    body.push(slid(dressed.collar));
  }

  // What is carried or worn besides, as the view sees it.
  const extras = spec.extras;
  if (extras.includes('backpack')) {
    const c = shade(accent, 0.85);
    const h = r1((hemY - sY) * 0.72);
    if (view === 'back' || view === 'back3q') {
      const dx = view === 'back3q' ? -6 : 0;
      overBack.push(
        `<rect x="${r1(-halfShoulder - 7 + dx)}" y="${sY + 2}" width="${r1(halfShoulder * 2 + 14)}" height="${h}" rx="10" ${inked(c)}/>` +
          `<rect x="${r1(-halfShoulder * 0.55 + dx)}" y="${r1(sY + h * 0.45)}" width="${r1(halfShoulder * 1.1)}" height="${r1(h * 0.4)}" rx="6" ${inked(shade(c, 0.9))}/>`,
      );
    } else if (view === 'profile') {
      behindBody.push(
        `<rect x="${r1(-s2 - 20)}" y="${sY + 4}" width="30" height="${h}" rx="9" ${inked(c)}/>`,
      );
      body.push(
        line(
          `M${r1(-s2 + 8)},${sY + 1} Q${r1(s2 * 0.3)},${sY + 24} ${r1(-s2 + 4)},${sY + 42}`,
          FIGURE_INK,
          10,
        ),
        line(
          `M${r1(-s2 + 8)},${sY + 1} Q${r1(s2 * 0.3)},${sY + 24} ${r1(-s2 + 4)},${sY + 42}`,
          c,
          6,
        ),
      );
    } else {
      behindBody.push(
        `<rect x="${r1(-s2 - 16)}" y="${sY + 2}" width="${r1(s2 + 10)}" height="${h}" rx="10" ${inked(c)}/>`,
      );
      body.push(
        `<rect x="${r1(-(s2 - 12) - 4)}" y="${sY + 1}" width="8" height="34" rx="3" ${inked(c)}/>`,
      );
    }
  }
  if (!back && extras.includes('stethoscope'))
    body.push(
      slid(
        line(
          `M-16,${sY + 8} Q-16,${sY + 34} 0,${sY + 36} Q16,${sY + 34} 16,${sY + 8}`,
          '#55525a',
          3.2,
        ) +
          line(`M0,${sY + 36} L0,${sY + 44}`, '#55525a', 3.2) +
          `<circle cx="0" cy="${sY + 47}" r="4.5" ${inked('#c9cdd3', 2)}/>`,
      ),
    );
  if (extras.includes('scarf')) {
    const w = 30 * k;
    const band = back
      ? `<path d="M${r1(-w)},${sY + 6} Q0,${sY + 12} ${r1(w)},${sY + 6} L${r1(w)},${sY + 16} Q0,${sY + 22} ${r1(-w)},${sY + 16} Z" ${inked(accent)}/>`
      : `<path d="M${r1(-w)},${sY + 8} Q${r1(geo.slide!.dx)},${sY + 18} ${r1(w)},${sY + 8} L${r1(w)},${sY + 18} Q${r1(geo.slide!.dx)},${sY + 28} ${r1(-w)},${sY + 18} Z" ${inked(accent)}/>`;
    body.push(band);
    if (!back) {
      // Its end hangs at the front, where the face turns.
      const ex = view === 'profile' ? r1(s2 - 8) : r1(geo.slide!.dx + 16);
      body.push(
        swing(
          chains,
          'scarf',
          'scarf',
          `<path d="M${ex - 6},${sY + 20} L${ex + 6},${sY + 20} L${ex + 4},${sY + 48} L${ex - 8},${sY + 48} Z" ${inked(accent)}/>`,
          [ex, sY + 20],
          [ex - 2, sY + 48],
          2,
          false,
        ),
      );
    }
  }
  const fastener = (short: boolean) => {
    // A cloak's or a cape's fronts over the near shoulder, fastened at the neck.
    const reach = short ? 22 : 44;
    if (back) return '';
    if (view === 'profile')
      return (
        `<path d="M${r1(s2 - 6)},${sY + 10} Q${r1(-4)},${sY - 2} ${r1(-s2 + 2)},${sY + 8} L${r1(-s2 + 4)},${sY + reach} Q${r1(0)},${sY + reach - 12} ${r1(s2 - 6)},${sY + 16} Z" ${inked(accent)}/>` +
        `<circle cx="${r1(s2 - 7)}" cy="${sY + (short ? 13 : 16)}" r="${short ? 4 : 5}" ${inked(GOLD, 2)}/>`
      );
    const x0 = geo.slide!.dx;
    return (
      [-1, 1]
        .map((s) => {
          const edge = s * (s2 + 1);
          return `<path d="M${r1(x0 + s * 5)},${sY + 10} Q${r1(s * (s2 - 3))},${sY - 2} ${r1(edge)},${sY + 9} L${r1(s * (s2 - 1))},${sY + reach} Q${r1(s * (s2 - 9))},${sY + reach - 14} ${r1(x0 + s * 5)},${sY + 17} Z" ${inked(accent)}/>`;
        })
        .join('') +
      `<circle cx="${r1(x0)}" cy="${sY + (short ? 13 : 16)}" r="${short ? 4 : 5}" ${inked(GOLD, 2)}/>`
    );
  };
  if (extras.includes('cloak')) body.push(fastener(false));
  if (extras.includes('cape')) body.push(fastener(true));
  if (!back && extras.includes('bow tie'))
    body.push(
      slid(
        `<path d="M0,${sY + 15} L-13,${sY + 9} L-13,${sY + 21} Z" ${inked(accent)}/>` +
          `<path d="M0,${sY + 15} L13,${sY + 9} L13,${sY + 21} Z" ${inked(accent)}/>` +
          `<circle cx="0" cy="${sY + 15}" r="3" ${inked(shade(accent), 2)}/>`,
      ),
    );

  // What hangs or spreads behind: wings, a cloak, a cape, a mantle's fall.
  // Seen from behind, over the body.
  const hangs: string[] = [];
  const hb2 = hb;
  if (extras.includes('wings')) {
    const wing = (s: number, id: string, x0: number, scale: number) => {
      const tip = s * WING_SPAN;
      const markup = [
        `<path d="M${s * 14},${sY + 14} Q${s * 60},${sY - 70} ${tip},${sY - 44} Q${s * 104},${sY + 4} ${s * 96},${sY + 22} Q${s * 84},${sY + 52} ${s * 70},${sY + 58} Q${s * 50},${sY + 70} ${s * 22},${sY + 50} Z" ${inked('#fbfbf6')}/>`,
        ...[0, 1, 2].map((j) =>
          line(
            `M${s * (30 + j * 8)},${sY + 36 - j * 4} Q${s * (60 + j * 10)},${sY + 20 - j * 16} ${s * (86 + j * 8)},${sY - 6 - j * 14}`,
            '#d7d5cc',
            2.4,
          ),
        ),
      ].join('');
      const placed =
        x0 || scale !== 1
          ? `<g transform="translate(${x0} 0) scale(${scale} 1)">${markup}</g>`
          : markup;
      const root: Point2 = [r1(x0 + s * 14 * scale), sY + 14];
      return swing(
        chains,
        id,
        'wing',
        placed,
        root,
        [r1(x0 + tip * scale), sY - 44],
        1,
        false,
      );
    };
    if (view === 'profile')
      hangs.push(wing(-1, 'wing-r', -4, 0.8), wing(-1, 'wing-l', -12, 0.9));
    else if (view === '3q')
      hangs.push(wing(1, 'wing-r', -10, 0.6), wing(-1, 'wing-l', -10, 1));
    else if (view === 'back3q')
      hangs.push(wing(-1, 'wing-l', 4, 0.7), wing(1, 'wing-r', 4, 1));
    else hangs.push(wing(-1, 'wing-l', 0, 1), wing(1, 'wing-r', 0, 1));
  }
  const drape = (id: 'cloak' | 'cape', down: number, half: number) => {
    if (view === 'profile') {
      // From the side, a sliver hanging behind the back.
      const b = -s2;
      return swing(
        chains,
        id,
        id,
        `<path d="M${r1(s2 * 0.4)},${sY - 2} Q${r1(b - 6)},${sY} ${r1(b - 3)},${sY + 8} L${r1(b - (id === 'cloak' ? 22 : 14))},${r1(down)} Q${r1(b + 6)},${r1(down + 6)} ${r1(s2 * 0.2)},${r1(down - 4)} Z" ${inked(shade(accent, 0.9))}/>`,
        [0, sY],
        [r1(b - 6), r1(down)],
        3,
      );
    }
    const dx = view === '3q' ? -6 : view === 'back3q' ? -4 : 0;
    const hk = view === '3q' || view === 'back3q' ? 0.92 : 1;
    const hs = halfShoulder * hk;
    const hh = half * hk;
    return swing(
      chains,
      id,
      id,
      `<path d="M${r1(-hs - 2 + dx)},${sY + 6} Q${r1(-hs - 6 + dx)},${sY} ${r1(-hs + 10 + dx)},${sY - 2} L${r1(hs - 10 + dx)},${sY - 2} Q${r1(hs + 6 + dx)},${sY} ${r1(hs + 2 + dx)},${sY + 6} L${r1(hh + dx)},${r1(down)} Q${dx},${r1(down + (id === 'cloak' ? 8 : 6))} ${r1(-hh + dx)},${r1(down)} Z" ${inked(shade(accent, 0.9))}/>`,
      [dx, sY],
      [dx, r1(down)],
      3,
    );
  };
  if (extras.includes('cloak'))
    hangs.push(
      drape('cloak', r1(Math.max(bottom + 6, -FEET - 16)), r1(hb2 / k + 30)),
    );
  if (extras.includes('cape'))
    hangs.push(drape('cape', r1(hemY + 12), r1(hb2 / k + 16)));
  if (spec.headwear === 'mantle') {
    const dx = view === '3q' ? -6 : view === 'profile' ? -12 : 0;
    const half = view === 'profile' ? 30 : hb2 / k + 10;
    hangs.push(
      `<path d="M${-54 + dx},${cy} Q${-54 + dx},${cy - 52} ${dx},${cy - 52} Q${54 + dx},${cy - 52} ${54 + dx},${cy} L${r1(half + dx)},${r1(bottom - 14)} L${r1(-half + dx)},${r1(bottom - 14)} Z" ${inked(shade(accent, 0.88))}/>`,
    );
  }

  // The head, its hair and hat, and what hangs from it.
  const headed = headInView(spec, R, geo, skin, chains);
  if (view === 'profile')
    defs.push(
      `<clipPath id="${chains.clip}-jaw"><rect x="-4" y="${cy - 60}" width="80" height="140"/></clipPath>`,
    );
  if (view === '3q')
    defs.push(
      `<clipPath id="${chains.clip}-jaw"><ellipse cx="0" cy="${cy}" rx="${HEAD.rx}" ry="${HEAD.ry}"/></clipPath>`,
    );

  // Arms.
  const plans = armPlans(R, geo, pose, holding, dressed);
  const holds = holderOf(pose, holding);
  const free = (s: number) => {
    const p = plans.find((one) => one.s === s)!;
    return s !== holds && !p.busy;
  };
  const stickSide = extras.includes('walking stick')
    ? [1, -1].find(free)
    : undefined;
  const layered: Record<ArmPlan['layer'], string[]> = {
    behind: [],
    arms: [],
    reach: [],
  };
  for (const plan of plans) {
    const drawn = armMarkup(spec, R, dressed, skin, plan, {
      holding,
      holds: Boolean(holding) && plan.s === holds,
      pointing: pose === 'pointing' && plan.s === 1,
      waving: pose === 'waving' && plan.s === 1,
      stick: plan.s === stickSide,
      forward: view === 'profile',
    });
    layered[plan.layer].push(drawn.stick + drawn.arm);
  }

  // Legs.
  const legged = legsInView(spec, R, geo, skin);

  // The face: its whites, every face, the mouth's shapes and the blink.
  const eyes = geo.eyes;
  if (eyes.length)
    defs.push(
      `<clipPath id="${eyesClip}">${eyes
        .map(
          (e) =>
            `<ellipse cx="${r1(e.x)}" cy="${e.y}" rx="${r1(e.rx - 1)}" ry="${r1(e.ry - 1)}"/>`,
        )
        .join('')}</clipPath>`,
    );
  if (geo.mouth?.half)
    defs.push(
      `<clipPath id="${halfClip}"><rect x="-40" y="${cy - 60}" width="40" height="160"/></clipPath>`,
    );
  const shapeOf = (name: string) =>
    mouthShape(geo.mouth?.half ? (SIDE_SHAPES[name] ?? name) : name, R.mouthY);
  const faceMarkup = (name: Expression) => {
    const f = FACES[name];
    return (
      viewEyes(name, eyes, skin, eyesClip) +
      `<g class="mouth">${mouthIn(geo, shapeOf(f.mouth), halfClip)}</g>` +
      `<g class="talk" opacity="0">${mouthIn(geo, shapeOf(f.talk), halfClip)}</g>`
    );
  };
  const my = R.mouthY;
  const painMouth = `<rect x="-14" y="${my - 4}" width="28" height="10" rx="3" ${inked('#ffffff')}/>${line(`M-14,${my + 1} L14,${my + 1}`, FIGURE_INK, 1.8)}`;
  const painTalk = `<rect x="-12" y="${my - 5}" width="24" height="14" rx="4" ${inked(MOUTH_RED)}/><rect x="-9" y="${my - 3.6}" width="18" height="4" rx="1" ${flat('#ffffff')}/>`;
  const faces = Object.fromEntries(
    FACE_NAMES.map((name) => [name, back ? '' : fm(faceMarkup(name))]),
  ) as Record<Expression, string>;
  const more: Record<KitFace, string> = {
    pain: back
      ? ''
      : fm(
          viewPainEyes(eyes, skin) +
            `<g class="mouth">${mouthIn(geo, painMouth, halfClip)}</g>` +
            `<g class="talk" opacity="0">${mouthIn(geo, painTalk, halfClip)}</g>`,
        ),
  };
  const asked: Record<AskedFace, string> = {
    'eyes closed': back
      ? ''
      : fm(
          viewClosedEyes(eyes, skin) +
            `<g class="mouth">${mouthIn(geo, shapeOf(FACES.neutral.mouth), halfClip)}</g>` +
            `<g class="talk" opacity="0">${mouthIn(geo, shapeOf(FACES.neutral.talk), halfClip)}</g>`,
        ),
  };
  const mouths = back
    ? ''
    : fm(
        mouthShapes(my)
          .map(
            (shape, n) =>
              `<g class="vm v${n}">${mouthIn(geo, shape, halfClip)}</g>`,
          )
          .join(''),
      );
  const whites = eyes
    .map(
      (e) =>
        `<ellipse cx="${r1(e.x)}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" ${inked('#ffffff')}/>`,
    )
    .join('');

  // Over the face: a moustache over the mouth, glasses over the eyes.
  const over: string[] = [];
  if (
    !back &&
    (spec.facialHair === 'moustache' || spec.facialHair === 'beard')
  ) {
    const y = my - 5;
    over.push(
      mouthIn(
        geo,
        `<path d="M0,${y} Q-10,${y - 5} -17,${y + 2} Q-8,${y + 4} 0,${y + 1} Q8,${y + 4} 17,${y + 2} Q10,${y - 5} 0,${y} Z" ${inked(HAIR[spec.hairColour])}/>`,
        halfClip,
      ),
    );
  }
  if (!back && extras.includes('glasses')) {
    const { y } = R.eyes;
    for (const e of eyes)
      over.push(
        `<ellipse cx="${r1(e.x)}" cy="${y}" rx="${r1(18.5 * e.w)}" ry="18.5" fill="none" stroke-width="2.4"/>`,
      );
    if (view === '3q')
      over.push(
        line(
          `M${r1(eyes[0].x + 18.5)},${y - 2} L${r1(eyes[1].x - 18.5 * eyes[1].w)},${y - 2}`,
          FIGURE_INK,
          2.4,
        ),
        line(
          `M${r1(eyes[0].x - 18.5)},${y - 3} L${geo.ears[0][0] + 4},${y + 2}`,
          FIGURE_INK,
          2.4,
        ),
      );
    else
      over.push(
        line(
          `M${r1(eyes[0].x - 18.5 * eyes[0].w)},${y - 2} L${geo.ears[0][0] + 4},${y + 2}`,
          FIGURE_INK,
          2.4,
        ),
      );
  }

  // Signs: on the face where the view has it, what floats over the head
  // about its middle; from behind, none on the face.
  const hands = plans.map((p) => p.H);
  const Rv = {
    ...R,
    eyes: {
      ...R.eyes,
      dx: eyes.length === 2 ? r1((eyes[1].x - eyes[0].x) / 2) : 0,
    },
  };
  const hx =
    eyes.length === 2
      ? r1((eyes[0].x + eyes[1].x) / 2)
      : eyes.length
        ? eyes[0].x
        : 0;
  const signed = signsOf(
    {
      head: [hx, cy],
      mouth: [geo.mouth?.x ?? 0, my],
      chest: [geo.slide?.dx ?? 0, r1(sY + (hemY - sY) * 0.3)],
      belly: [geo.slide?.dx ?? 0, r1(sY + (hemY - sY) * 0.66)],
      hands,
      feet: [
        [legged.joints.l[2][0] - 2, -6],
        [legged.joints.r[2][0] + 2, -6],
      ],
      sides: [
        { x: r1(-R.halfHem * k - 20), out: -1 },
        { x: r1(R.halfHem * k + 20), out: 1 },
      ],
    },
    Rv,
    skin,
  );
  const air = airOf(0, cy);
  const signs = Object.fromEntries(
    Object.entries(signed.body).map(([name, markup]) => [
      name,
      (back ? markup.replace(/<g class="fm">[\s\S]*?<\/g>/g, '') : markup) +
        (air[name as FigureSign] ?? ''),
    ]),
  ) as Record<FigureSign, string>;

  // Seen from behind, what hangs at the back is over the body.
  const hangsBehind = back ? '' : hangs.join('');
  const hangsOver = back ? hangs.join('') : '';
  return {
    legs: legged.legs,
    behind:
      hangsBehind +
      behindBody.join('') +
      `<g class="hd">${headed.behind}</g>` +
      layered.behind.join(''),
    body: body.join(''),
    arms: layered.arms.join(''),
    reach: layered.reach.join('') + hangsOver + overBack.join(''),
    head: headed.head,
    eyes: whites ? fm(whites) : '',
    faces,
    more,
    asked,
    mouths,
    signs,
    blink: eyes.length ? fm(viewBlink(eyes, skin)) : '',
    over: (over.length ? fm(over.join('')) : '') + headed.over,
    defs: defs.join(''),
    dangles: chains.dangles,
    joints: Object.fromEntries(
      plans.map((plan): ['r' | 'l', [Point2, Point2, Point2]] => [
        plan.s > 0 ? 'r' : 'l',
        [
          plan.S,
          plan.E ?? [
            r1((plan.S[0] + plan.H[0]) / 2),
            r1((plan.S[1] + plan.H[1]) / 2),
          ],
          plan.H,
        ],
      ]),
    ) as Record<'r' | 'l', [Point2, Point2, Point2]>,
  };
}

/** The talking mouth's colour (the kit's MOUTH). */
const MOUTH_RED = '#6b2a2e';

// ── The drawing ────────────────────────────────────────────────────────────

/** A short code for each view, in clip paths' ids. */
const VIEW_CODE: Record<FigureView, string> = {
  front: 'f',
  '3q': 'q',
  profile: 'p',
  back3q: 'bq',
  back: 'b',
};

/**
 * How the stage shows one view: the front, unless the drawing has a view
 * class on it; and how the face turns in each, as the rig's `.fm` does,
 * less in three-quarter and not at all from the side or behind (the face
 * is already where the view has it).
 */
function viewCss(neck: number): string {
  const others = FIGURE_VIEWS.filter((v) => v !== 'front');
  const nodTilt =
    'translateY(calc(var(--nod,0)*1px)) rotate(calc(var(--tilt,0)*1deg))';
  return (
    [
      `${others.map((v) => `.${viewClass(v)} #${viewGroupId('front')}`).join(',')}{display:none}`,
      `${others.map((v) => `.${viewClass(v)} #${viewGroupId(v)}`).join(',')}{display:inline}`,
      `.vq-3q .fm{transform:${nodTilt} translateX(calc(var(--turn,0)*3px))}`,
      `.vq-profile .fm,.vq-back3q .fm,.vq-back .fm{transform:${nodTilt}}`,
    ].join('') + (neck ? '' : '')
  );
}

/**
 * One person drawn on rig 3, from every side: rig 2's drawing as the
 * front, and a group for each other view beside it. Null for what views
 * are not drawn for (a group, someone lying down or in bed): those are
 * drawn on rig 2.
 */
export function drawnInViews(
  spec: FigureSpec,
  seed: string,
  how: FigureHow,
): FigureDrawing | null {
  const pose = how.pose ?? 'standing';
  const n = Math.min(4, Math.max(1, Math.round(how.count ?? 1) || 1));
  if (pose === 'in bed' || pose === 'lying' || n > 1) return null;
  const front = drawFigure(spec, seed, { ...how, rig: DANGLE_RIG });
  const key = seed || JSON.stringify(spec);
  const clip = `f${Math.floor(beatOf(`${key}:id`) * 1e6).toString(36)}`;
  const holding = how.holding ?? null;
  const posed = holding && pose === 'standing' ? 'holding' : pose;
  const drawn = signsFor(pose, how.signs);
  const faces = facesFor(how.faces);
  const changes = how.dress ?? [];
  const outfits = [spec, ...changes.map((one) => one.spec)];
  const R = rigOf(spec.age, spec.build);
  const others = FIGURE_VIEWS.filter((v) => v !== 'front');
  const defs: string[] = [];
  const perView = new Map<FigureView, Dangle[]>();
  /** Each view's arms, as the front's joints are: so a hand is aimed from where it is in the view that shows. */
  const viewJoints: Partial<
    Record<FigureView, Record<'r' | 'l', [Point2, Point2, Point2]>>
  > = front.joints ? { front: front.joints } : {};
  const groups = others.map((view) => {
    const sfx = viewSuffix(view);
    const code = VIEW_CODE[view];
    const layers = outfits.map((one, k) =>
      viewLayers(
        one,
        posed,
        holding,
        `${clip}-${k ? `o${k}` : '0'}-${code}`,
        view,
      ),
    );
    for (const l of layers) defs.push(l.defs);
    viewJoints[view] = layers[0].joints;
    perView.set(
      view,
      layers.flatMap((l) => l.dangles),
    );
    const first = layers[0];
    const worn = (layer: (l: ViewLayers) => string): string =>
      changes.length
        ? layers
            .map((l, k) => `<g class="${dressClass(k)}">${layer(l)}</g>`)
            .join('')
        : layer(first);
    return [
      `<g id="${viewGroupId(view)}" class="view vq-${view}" display="none">`,
      `<g id="legs${sfx}">${worn((l) => l.legs)}</g>`,
      `<g class="breathe">`,
      `<g id="behind${sfx}">${worn((l) => l.behind)}</g>`,
      `<g id="body${sfx}">${worn((l) => l.body)}</g>`,
      `<g id="arms${sfx}">${worn((l) => l.arms)}</g>`,
      `<g id="head${sfx}">${changes.length ? worn((l) => l.head) + first.eyes : first.head + first.eyes}</g>`,
      FACE_NAMES.map(
        (name) => `<g id="${name}${sfx}">${first.faces[name]}</g>`,
      ).join(''),
      `<g id="pain${sfx}">${first.more.pain}</g>`,
      faces
        .map((name) => `<g id="${faceId(name)}${sfx}">${first.asked[name]}</g>`)
        .join(''),
      how.faceRig
        ? rigFaceOf(
            view,
            R,
            SKIN[Math.min(SKIN.length, Math.max(1, spec.skin)) - 1],
            `${clip}-0-${code}`,
            `${clip}-0-${code}-eyes`,
          )
        : '',
      `<g class="mouths">${first.mouths}</g>`,
      `<g id="reach${sfx}">${worn((l) => l.reach)}</g>`,
      drawn
        .map((name) => `<g id="${signId(name)}${sfx}">${first.signs[name]}</g>`)
        .join(''),
      `<g class="blink b0" opacity="0">${first.blink}</g>`,
      `<g id="over${sfx}">${worn((l) => l.over)}</g>`,
      `</g>`,
      `</g>`,
    ].join('');
  });
  // Every part that swings, once, with its root in each view it is seen in.
  const all = new Map<string, Dangle>();
  for (const one of front.dangles ?? []) all.set(one.id, { ...one });
  const extra: Dangle[] = [];
  for (const view of others)
    for (const one of perView.get(view) ?? []) {
      let known = all.get(one.id);
      if (!known) {
        known = { ...one };
        all.set(one.id, known);
        extra.push(known);
      }
      known.views = {
        ...(known.views ?? {}),
        [view]: { root: one.root, dir: one.dir },
      };
    }
  for (const one of all.values())
    if (front.dangles?.some((d) => d.id === one.id))
      one.views = {
        front: { root: one.root, dir: one.dir },
        ...(one.views ?? {}),
      };
  const style =
    viewCss(R.sY + 6) +
    (extra.length ? dangleCss(extra) : '') +
    (how.faceRig ? RIG_FACE_CSS : '');
  const opening = '<g class="flip"><g class="whole">';
  const at = front.svg.indexOf(opening);
  const closing = '</g></g></g></svg>';
  if (at < 0 || !front.svg.endsWith(closing)) return null;
  const drawnPerson = front.svg.slice(
    at + opening.length,
    front.svg.length - closing.length,
  );
  // The front's rigged face, over its faces, under the mouth's shapes.
  const mouths = '<g class="mouths">';
  const person =
    how.faceRig && drawnPerson.includes(mouths)
      ? drawnPerson.replace(
          mouths,
          rigFaceOf(
            'front',
            R,
            SKIN[Math.min(SKIN.length, Math.max(1, spec.skin)) - 1],
            `${clip}-f`,
            'eyes',
          ) + mouths,
        )
      : drawnPerson;
  const head = front.svg
    .slice(0, at)
    .replace('</style>', `${style}</style>`)
    .replace('</defs>', `</defs><defs>${defs.join('')}</defs>`);
  const svg = `${head}${opening}<g id="${viewGroupId('front')}" class="view vq-front">${person}</g>${groups.join('')}${closing}`;
  return {
    ...front,
    svg,
    rig: VIEW_RIG,
    views: FIGURE_VIEWS.map(viewGroupId),
    ...(how.faceRig ? { faceRig: true as const } : {}),
    ...(front.joints ? { viewJoints } : {}),
    ...(all.size ? { dangles: [...all.values()] } : {}),
  };
}

/** Whether a drawing's markup is a view of rig 3's: for a test, or a still of one view. */
export function viewOnly(svg: string, view: FigureView): string {
  if (view === 'front') return svg;
  return svg
    .replace(
      `id="${viewGroupId('front')}" class="view vq-front"`,
      `id="${viewGroupId('front')}" class="view vq-front" display="none"`,
    )
    .replace(
      `id="${viewGroupId(view)}" class="view vq-${view}" display="none"`,
      `id="${viewGroupId(view)}" class="view vq-${view}"`,
    );
}

/** The count of the mouth's shapes each talking view draws: for a test. */
export const VIEW_MOUTHS = MOUTH_SHAPES;

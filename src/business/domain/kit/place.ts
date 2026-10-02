/**
 * Where a kit piece stands on its set and how big it is (explainer-
 * animation-tech §4.2): a pure rule, so the same plan stands the same way
 * every time. The board names a place (a place on the map, a part of the
 * set) or a word (left, centre, right, foreground, background); code
 * decides the numbers.
 *
 *  - On a map a piece is a marker of its place: a group or a ship a small
 *    share of the map, standing on the place's point.
 *  - On a drawn set, paper or a chart, pieces stand on the ground line at
 *    one scale for the whole shot (a metre is the same on every piece, so
 *    a person stands beside a bus as they would): the set's own scale when
 *    it has one, else the one that makes the shot's subject big.
 *  - Several pieces stand apart, on thirds; a piece that is not the shot's
 *    subject never stands over the subject or over what a label or a pin
 *    sits on, and keeps inside its set.
 */
import type { ShotBox } from '../../../contracts';
import { UNITS_PER_METRE } from './rig';

/** The ground line of a set with none of its own, as a share of its height from the top. */
export const GROUND = 0.84;

/** How big a piece stands on a map, as a share of the map's shorter side: its height, or a long piece's length. */
const MAP_SIZE: Record<string, { height?: number; length?: number }> = {
  people: { height: 0.075 },
  crowd: { height: 0.07 },
  vehicles: { length: 0.11 },
  // The illustrated look's characters read at a glance, faces and all, as the reference's do on its maps.
  characters: { height: 0.3 },
};

/** How big the shot's subject stands on a set with no scale: a person's height, a crowd's width, a vehicle's length, as shares of the set. */
const SUBJECT_SIZE = {
  person: 0.52,
  crowd: 0.92,
  vehicle: 0.62,
};

export interface PlaceInput {
  /** The set's box, in its units. */
  set: ShotBox;
  /** The set is the show's map: pieces stand on their places, as markers. */
  map: boolean;
  /** The set's ground line (y) and scale (units a metre), when the set has its own (a drawn set). */
  ground?: number;
  unitsPerMetre?: number;
  /** The piece: its box in its own units (a hundred to the metre), and its family. */
  piece: { box: ShotBox; family: string; id: string };
  /** What it stands on: a box of the set (a place's, a part's); or a word. */
  on?: ShotBox | null;
  word?: string;
  /** The shot's subject, when this piece is not it; and what labels and pins sit on. */
  subject?: ShotBox | null;
  avoid?: readonly ShotBox[];
  /** This piece is the shot's subject: it is sized to be big. */
  isSubject: boolean;
  /** Its place among the shot's pieces, so several stand apart. */
  index: number;
  count: number;
  /** The shot's scale, once its first piece has set it: every piece of a shot shares it. */
  scale?: number;
}

export interface Placed {
  /** Where its feet (or wheels, or keel) stand, in the set's units. */
  at: { x: number; y: number };
  /** Its height in the set's units. */
  size: number;
  /** Set units a metre, for the shot's other pieces. */
  scale: number;
  /** Nearer pieces over farther: by how low it stands. */
  z: number;
}

const overlap = (a: ShotBox, b: ShotBox): number => {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? (w * h) / Math.max(1e-6, a[2] * a[3]) : 0;
};

/** The kind of piece, for its size: a person (or a few), a crowd, a vehicle. */
function kindOf(piece: PlaceInput['piece']): 'person' | 'crowd' | 'vehicle' {
  if (piece.family === 'vehicles') return 'vehicle';
  if (/crowd/.test(piece.id)) return 'crowd';
  return 'person';
}

/**
 * The scale a set with none of its own takes from the shot's subject (or
 * its first piece): set units a metre that make it big.
 */
function scaleFor(input: PlaceInput): number {
  const [, , W, H] = input.set;
  const [, , pw, ph] = input.piece.box;
  const kind = kindOf(input.piece);
  const metres = { w: pw / UNITS_PER_METRE, h: ph / UNITS_PER_METRE };
  const share = input.isSubject ? 1 : 0.7;
  const byKind =
    kind === 'person'
      ? (SUBJECT_SIZE.person * H * share) /
        Math.max(1.2, Math.min(metres.h, 2.6))
      : kind === 'crowd'
        ? (SUBJECT_SIZE.crowd * W * share) / metres.w
        : (SUBJECT_SIZE.vehicle * W * share) / metres.w;
  // Never so big it leaves the set: its height within the ground's room.
  const room = (H * GROUND * 0.95) / metres.h;
  const across = (W * 0.96) / metres.w;
  return Math.min(byKind, room, across);
}

/** Where a piece stands, how tall, and the scale its shot shares. */
export function placeActor(input: PlaceInput): Placed {
  const [sx, sy, W, H] = input.set;
  const [, , pw, ph] = input.piece.box;
  const aspect = pw / Math.max(1e-6, ph);
  const kind = kindOf(input.piece);
  let size: number;
  let scale: number;
  if (input.map) {
    const side = Math.min(W, H);
    const rule =
      MAP_SIZE[kind === 'crowd' ? 'crowd' : input.piece.family] ??
      MAP_SIZE.people;
    size = rule.length
      ? (rule.length * side) / aspect
      : (rule.height ?? 0.07) * side;
    scale = (size / ph) * UNITS_PER_METRE;
  } else {
    scale = input.scale ?? input.unitsPerMetre ?? scaleFor(input);
    size = (ph / UNITS_PER_METRE) * scale;
  }
  const width = size * aspect;
  const ground = input.ground ?? sy + H * GROUND;
  // Where it stands: on what it names, at its word, or apart from the others.
  let x: number;
  let y = ground;
  const word = (input.word ?? '').toLowerCase();
  if (input.on) {
    x = input.on[0] + input.on[2] / 2;
    y = input.map
      ? input.on[1] + input.on[3] / 2
      : Math.min(ground, input.on[1] + input.on[3]);
  } else if (/left/.test(word)) x = sx + W / 3;
  else if (/right/.test(word)) x = sx + (2 * W) / 3;
  else if (/cent|middle/.test(word)) x = sx + W / 2;
  else x = sx + (W * (input.index + 1)) / (input.count + 1);
  if (/fore|front|near/.test(word)) {
    size *= 1.18;
    y = Math.min(sy + H * 0.97, ground + H * 0.08);
  } else if (/back|far|distance/.test(word)) {
    size *= 0.62;
    y = ground - H * 0.12;
  }
  const boxAt = (cx: number): ShotBox => [
    cx - (size * aspect) / 2,
    y - size,
    size * aspect,
    size,
  ];
  // Not over the subject nor what a label sits on: to the side with room.
  if (!input.on && !input.isSubject) {
    const blocked = [
      ...(input.subject ? [input.subject] : []),
      ...(input.avoid ?? []),
    ];
    const worst = (cx: number) =>
      Math.max(0, ...blocked.map((b) => overlap(boxAt(cx), b)));
    if (worst(x) > 0.1) {
      const candidates = [
        sx + W / 6,
        sx + W / 3,
        sx + W / 2,
        sx + (2 * W) / 3,
        sx + (5 * W) / 6,
      ].sort(
        (a, b) => worst(a) - worst(b) || Math.abs(a - x) - Math.abs(b - x),
      );
      x = candidates[0];
    }
  }
  // Inside its set, unless it is wider than the set (a long train: centred on its spot).
  if (width < W) x = Math.max(sx + width / 2, Math.min(sx + W - width / 2, x));
  const r = (n: number) => Math.round(n * 10) / 10;
  return { at: { x: r(x), y: r(y) }, size: r(size), scale, z: Math.round(y) };
}

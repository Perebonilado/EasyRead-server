/**
 * The scorecard's points code can measure (studio-drawings-plan §2): the
 * house style (3), joined (5), clean (6) and composition (7), and the ink
 * of three the vision judge also looks at: feet on the ground (2), the
 * face's eyes and mouth where they belong and readable (4), and a set's
 * ground read, low and open (10). Each says whether it holds and, when
 * not, why, in words the artist can be told.
 */
import type { Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { byId, elements } from './scene-dom';
import { animalFace, drawAnimal } from './scene-animal-draw';
import { creatureFace, drawCreature } from './scene-creature-draw';
import { SET_UNIT_SHARE, SIZE_UNITS } from './scene-ink';
import {
  findStrays,
  styleFaults,
  styleReport,
  type StyleReport,
} from './scene-polish';
import { renderSvg, type InkBox, type InkMap } from './scene-raster';
import type { CharacterSheet, SetSheet } from './scene-sheet';
import type { SheetFace } from './scene-sheet-face';
import { variant } from './scene-sheet-rig';
import type { PlaceKind } from './scene-story';
import { worldHeightOf } from './scene-shape';

/** One point, checked: whether it holds, and why not. */
export interface Check {
  ok: boolean;
  notes: string[];
}

/** Every point code checks of one drawing; a point that does not apply is absent. */
export interface CodeChecks {
  /** 3: the kit's ink and line at stage size, flat fills. */
  style: Check & { report: StyleReport };
  /** 6: no strays: strokes off every shape, specks touching nothing, a line on a set's ground. */
  clean: Check & { strays: number };
  /** 7: it fills its frame and stands on its ground. */
  composition: Check;
  /** 5: every part joined to the body (a character). */
  joined?: Check;
  /** 2: its feet on the ground (a character with legs). */
  feet?: Check & { count: number };
  /** 4: its eyes and mouth where they belong, readable on the stage (a character). */
  face?: Check;
  /** 10: its ground read, where the brief says (a set). */
  ground?: Check;
}

const CHECKS = [
  'style',
  'clean',
  'composition',
  'joined',
  'feet',
  'face',
  'ground',
] as const;

/** Whether every point that applies holds. */
export const codePasses = (checks: CodeChecks): boolean =>
  CHECKS.every((name) => checks[name]?.ok ?? true);

/** How many points fall short. */
export const codeFaults = (checks: CodeChecks): number =>
  CHECKS.filter((name) => checks[name]?.ok === false).length;

/** What falls short, in words, each point's own. */
export const codeNotes = (checks: CodeChecks): string[] =>
  CHECKS.flatMap((name) => {
    const check: Check | undefined = checks[name];
    return check && !check.ok ? check.notes : [];
  });

const EMPTY = '<svg xmlns="http://www.w3.org/2000/svg"/>';

function parse(svg: string): Element | null {
  const doc = parseDocument(svg, { xmlMode: true, recognizeCDATA: true });
  return (
    elements(doc.children).find((node) => node.name.toLowerCase() === 'svg') ??
    null
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The share of a map's cells with ink. */
function filled(map: InkMap): number {
  let n = 0;
  for (let i = 0; i < map.bits.length; i += 1) if (map.bits[i] === '1') n += 1;
  return map.bits.length ? n / map.bits.length : 0;
}

/** Separate runs of ink along a map's lowest few rows: the feet on the ground. */
export function feetOn(map: InkMap, band = 0.04): number {
  let bottom = -1;
  for (let r = map.rows - 1; r >= 0 && bottom < 0; r -= 1)
    for (let c = 0; c < map.cols; c += 1)
      if (map.bits[r * map.cols + c] === '1') {
        bottom = r;
        break;
      }
  if (bottom < 0) return 0;
  const top = Math.max(0, bottom - Math.max(1, Math.round(map.rows * band)));
  let runs = 0;
  let inRun = false;
  for (let c = 0; c < map.cols; c += 1) {
    let ink = false;
    for (let r = top; r <= bottom && !ink; r += 1)
      if (map.bits[r * map.cols + c] === '1') ink = true;
    if (ink && !inRun) runs += 1;
    inRun = ink;
  }
  return runs;
}

/** The style point: the report and what falls short. */
function styleCheck(svg: string, kitPerUnit: number): CodeChecks['style'] {
  const report = styleReport(svg, kitPerUnit);
  const notes = styleFaults(report);
  return { ok: !notes.length, notes, report };
}

/** The clean point: strays found, none allowed. */
async function cleanCheck(
  svg: string,
  viewBox: [number, number, number, number],
  named: string[],
  options: { backdrop?: boolean; protect?: string[] },
): Promise<CodeChecks['clean']> {
  const root = parse(svg);
  if (!root) return { ok: false, notes: ['it cannot be read'], strays: 0 };
  const strays = await findStrays(root, viewBox, named, options).catch(
    () => [],
  );
  return {
    ok: !strays.length,
    notes: strays.length
      ? [
          `${strays.length} stray ${strays.length === 1 ? 'mark' : 'marks'}: lines or specks that are not part of any shape`,
        ]
      : [],
    strays: strays.length,
  };
}

/**
 * A character as drawn and rigged, checked at its size on the stage.
 * `unjoined`: what the rig could not join; `legs`: how many feet should
 * be on the ground, when known (a fixture says; a show's brief does not).
 */
export async function checkSheet(
  sheet: CharacterSheet,
  options: { unjoined?: string[]; legs?: number | null } = {},
): Promise<CodeChecks> {
  // One the animal or the creature kit drew is checked as a still shows
  // it, standing: its other poses are there only for the stage to show.
  const drawing = sheet.animal
    ? {
        ...sheet.drawing,
        svg: drawAnimal(sheet.animal, 'check', { pose: 'stand' }).svg,
      }
    : sheet.creature
      ? {
          ...sheet.drawing,
          svg: drawCreature(sheet.creature, 'check', { pose: 'stand' }).svg,
        }
      : sheet.drawing;
  const viewBox = drawing.viewBox;
  // One the animal kit drew stands at its own size; the artist's at its size's.
  const units = drawing.stands?.units ?? SIZE_UNITS[sheet.size ?? 'medium'];
  const kitPerUnit = units / viewBox[3];
  const states = Object.values(drawing.states);
  const named = [...Object.values(drawing.parts), ...states];
  const root = parse(drawing.svg);
  const group = (name: string) => {
    const id = drawing.parts[name];
    return id && root ? byId(root, id) : null;
  };
  const legs = group('legs');
  const head = group('head');
  // Its parts alone, measured in one render: the legs' ink, and the head's.
  const measured = root
    ? await renderSvg(drawing.svg, undefined, {
        variants: [
          legs ? variant(root, [legs], []) : EMPTY,
          head ? variant(root, [head], []) : EMPTY,
        ],
        masks: {
          svgs: [drawing.svg, ...(legs ? [variant(root, [legs], [])] : [])],
          cols: 240,
        },
      }).catch(() => null)
    : null;
  const ink = measured?.ink ?? null;
  const [legsBox, headBox] = (measured?.inks ?? []).map((box) =>
    box && box.width > 0 && box.height > 0 ? box : null,
  );
  const [whole, legsMap] = measured?.masks ?? [];

  const composition: string[] = [];
  const aspect = viewBox[2] / viewBox[3];
  if (aspect < 0.3 || aspect > 3)
    composition.push(
      `its frame is ${aspect < 1 ? 'too tall and thin' : 'too long and low'} to stand beside people`,
    );
  if (whole && filled(whole) < 0.15)
    composition.push(
      `it fills only ${pct(filled(whole))} of its frame: draw it bigger and bolder, with fewer thin parts`,
    );
  if (ink && legsBox) {
    const gap = ink.y + ink.height - (legsBox.y + legsBox.height);
    if (gap > ink.height * 0.04)
      composition.push(
        'its feet are not at the bottom of the drawing: it should stand on its feet, nothing drawn below them',
      );
  }

  const checks: CodeChecks = {
    style: styleCheck(drawing.svg, kitPerUnit),
    clean: await cleanCheck(drawing.svg, viewBox, named, {
      protect: states,
    }),
    composition: { ok: !composition.length, notes: composition },
    joined: {
      ok: !(options.unjoined ?? []).length,
      notes: options.unjoined ?? [],
    },
  };

  const wanted = options.legs ?? null;
  if (wanted !== null && wanted >= 2) {
    const count = legsMap ? feetOn(legsMap) : 0;
    // Four legs: the front pair apart from the back, two feet at least on
    // the ground. Two (a bird side-on): one, the near foot before the far.
    const least = wanted >= 4 ? 2 : 1;
    checks.feet = {
      ok: count >= least,
      count,
      notes:
        count >= least
          ? []
          : [
              legs
                ? `only ${count} ${count === 1 ? 'foot touches' : 'feet touch'} the ground: it should stand on its legs, ${wanted} of them`
                : 'its legs are not drawn in their own group',
            ],
    };
  }

  // One a kit drew: its face as code drew it.
  const measuredFace =
    sheet.face ??
    (sheet.animal
      ? animalFace(sheet.animal)
      : sheet.creature
        ? creatureFace(sheet.creature)
        : null);
  const face = faceFaults(measuredFace, kitPerUnit);
  if (measuredFace && headBox && !inside(measuredFace.mouth, headBox, 0.08))
    face.push("the mouth's mark is not on the head");
  checks.face = { ok: !face.length, notes: face };
  return checks;
}

/** The least an eye may be tall on the stage, in the kit's units, and still read. */
const LEAST_EYE = 6;

/**
 * What is wrong with a face as measured, in words for the artist: big
 * white eyes with dot pupils, the mouth's mark below them, and eyes that
 * read at the size it stands on the stage (`kitPerUnit`).
 */
export function faceFaults(
  face: SheetFace | null,
  kitPerUnit: number,
): string[] {
  if (!face) return ['No face could be measured: draw the neutral face.'];
  const out: string[] = [];
  // One eye is a brief's own (a one-eyed monster) or a side view's.
  if (!face.eyes.length)
    out.push(
      'Draw big round white eyes, each with a small dark dot pupil, as the people have.',
    );
  const eyeLine = face.eyes.length
    ? Math.max(...face.eyes.map((e) => e.box.y + e.box.height / 2))
    : null;
  if (eyeLine !== null && face.mouth[1] <= eyeLine)
    out.push(
      "Mark the mouth's place below the eyes, on the muzzle or at the beak.",
    );
  const tallest = face.eyes.length
    ? Math.max(...face.eyes.map((e) => e.box.height)) * kitPerUnit
    : 0;
  if (face.eyes.length && tallest < LEAST_EYE)
    out.push(
      `The eyes are too small to read beside the people: draw them about ${Math.ceil(LEAST_EYE / kitPerUnit / 0.7)} units across or more.`,
    );
  return out;
}

/** Whether a point is inside a box, with a share of its size to spare. */
function inside([x, y]: [number, number], box: InkBox, slack = 0): boolean {
  const sx = box.width * slack;
  const sy = box.height * slack;
  return (
    x >= box.x - sx &&
    x <= box.x + box.width + sx &&
    y >= box.y - sy &&
    y <= box.y + box.height + sy
  );
}

/**
 * One of a show's own, measured into the kit's units (a thing or a
 * feature), checked: its style at the size it stands at, no strays, and
 * a size a person could hold or stand by.
 */
export async function checkOwn(
  piece: { svg: string; viewBox: [number, number, number, number] },
  kind: 'thing' | 'feature',
): Promise<CodeChecks> {
  const [, , w, h] = piece.viewBox;
  const grips = [...piece.svg.matchAll(/\bid="([^"]*-grip)"/g)].map(
    (m) => m[1],
  );
  const composition: string[] = [];
  const long = Math.max(w, h);
  if (long < 8)
    composition.push('it is too small to see beside the people who hold it');
  if (kind === 'thing' && long > 260)
    composition.push('it is too big for a person to hold');
  return {
    style: styleCheck(piece.svg, 1),
    clean: await cleanCheck(piece.svg, piece.viewBox, grips, {
      protect: grips,
    }),
    composition: { ok: !composition.length, notes: composition },
  };
}

/** Where a place's ground should meet what stands behind it, as a share of the height, by what the place is. */
const HORIZON: Record<PlaceKind, [number, number]> = {
  outdoor: [0.5, 0.76],
  indoor: [0.55, 0.82],
  vessel: [0.5, 0.82],
};

/** A set as painted, checked: its style, no line lying on its ground, its ground read where it should be, and its frame covered. */
export async function checkSet(
  set: SetSheet,
  placeKind: PlaceKind | null = null,
): Promise<CodeChecks> {
  const { drawing } = set;
  const viewBox = drawing.viewBox;
  const kitPerUnit =
    1 / (SET_UNIT_SHARE * worldHeightOf(viewBox[2], viewBox[3]));
  const composition: string[] = [];
  const covered = await renderSvg(drawing.svg, undefined, {
    grid: { svg: drawing.svg, cols: 64 },
  }).catch(() => null);
  if (covered?.grid && filled(covered.grid) < 0.97)
    composition.push(
      `it covers ${pct(filled(covered.grid))} of the frame: paint it from edge to edge`,
    );
  const ground: string[] = [];
  const read = set.ground;
  if (!read || read.source === 'convention')
    ground.push('its ground could not be read from the painting');
  else {
    const [low, high] = HORIZON[placeKind ?? 'outdoor'];
    if (read.horizon < low || read.horizon > high)
      ground.push(
        `its ground meets what stands behind it ${pct(read.horizon)} of the way down, not ${pct(low)} to ${pct(high)}`,
      );
  }
  return {
    style: styleCheck(drawing.svg, kitPerUnit),
    clean: await cleanCheck(drawing.svg, viewBox, [], { backdrop: true }),
    composition: { ok: !composition.length, notes: composition },
    ground: { ok: !ground.length, notes: ground },
  };
}

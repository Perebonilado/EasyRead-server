/**
 * The drawing bench (studio-drawings-plan §3): every brief in
 * src/business/domain/drawing-bench drawn through the real path (the
 * artist, exactly as a show draws: SceneArtist), rendered alone and on
 * the stage beside a person, checked by code (drawing-checks) and judged
 * by a vision model (drawing-score); a report, a contact sheet and one
 * picture of it all, for Richard.
 *
 *   npm run drawing:bench -- --out <dir> [--label "<words>"] [--only dog,horse]
 *        [--against <report.json> | --against baseline] [--write-baseline]
 *        [--model provider:id] [--judge provider:id] [--see-with provider:id]
 *        [--takes n] [--revisions n] [--no-see] [--concurrency 6]
 *        [--drawer artist|kit]
 *   npm run drawing:bench -- --mark <dir> <id> ok|not ["note"]
 *   npm run drawing:bench -- --sheet <dir> [--report <report-x.json>] [--against <report.json> | baseline]
 *   npm run drawing:bench -- --rejudge <dir> --judge provider:id
 *
 * Writes <dir>/report.json, <dir>/index.html (the contact sheet), and
 * <dir>/sheet.png (every drawing in one picture), with each brief's
 * pictures and drawing in <dir>/<id>/. --model draws with that model in
 * place of each drawing task's own; --judge judges the run with that one
 * (else the drawing_judge task's), and --see-with is the judge the artist
 * looks through while drawing (else the same default). --takes, --revisions
 * and --no-see set how hard the artist works: by default as a show's does
 * (three takes of a new character, two revisions, judged as it goes); a
 * bake-off of models draws each brief once (--takes 1 --revisions 0).
 * Every model call the drawing makes is
 * priced as the ledger prices it (cost.ts); the bench's own judging is
 * not counted in a drawing's cost. --mark keeps Richard's word on one
 * drawing beside the report (marks.json) and writes the page again.
 * A brief whose `drawer` is `kit` is drawn by the animal kit or the
 * creature kit from its spec (a redraw from its spec changed as a writer
 * would change it), with no model at all; --drawer artist draws every
 * brief by the artist again, to measure the one against the other.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import {
  SceneArtist,
  referenceOf,
  type ArtistLog,
  type ArtistOptions,
} from '../src/pipeline/processors/scene-artist';
import type { LlmUsage } from '../src/business/ports/llm.port';
import { costOf } from '../src/business/domain/cost';
import {
  DRAWING_OLD_DIR,
  baselineReport,
  drawerOf,
  contactSheetHtml,
  loadDrawingFixtures,
  readDrawingBaseline,
  readMarks,
  summarise,
  withMark,
  writeDrawingBaseline,
  writeMarks,
  type BenchEntry,
  type BenchReport,
  type CheckKept,
  type DrawingFixture,
} from '../src/business/domain/drawing-bench';
import {
  checkOwn,
  checkSet,
  checkSheet,
  codePasses,
  type CodeChecks,
} from '../src/business/domain/drawing-checks';
import {
  verdictPasses,
  verdictScore,
  type DrawingKind,
  type DrawingVerdict,
} from '../src/business/domain/drawing-score';
import { animalOf, type AnimalSpec } from '../src/business/domain/scene-animal';
import {
  creatureOf,
  type CreatureSpec,
} from '../src/business/domain/scene-creature';
import { byId, elements, removeNode } from '../src/business/domain/scene-dom';
import { PLAIN_FIGURE, drawFigure } from '../src/business/domain/scene-figure';
import {
  KIT_LINE,
  SET_UNIT_SHARE,
  SIZE_UNITS,
} from '../src/business/domain/scene-ink';
import { rasterise } from '../src/business/domain/scene-raster';
import {
  animalSheet,
  creatureSheet,
  measureOwnFeature,
  measureOwnThing,
  ownFeatureScale,
  ownThingScale,
  type CharacterSheet,
  type SetSheet,
} from '../src/business/domain/scene-sheet';
import { faceShown } from '../src/business/domain/scene-sheet-face';
import type { SetPiece } from '../src/business/domain/scene-set-pieces';
import type { OwnPropDrawing } from '../src/business/domain/scene-props';
import {
  OWN_FEATURE_CANVAS,
  OWN_THING_CANVAS,
  ownFeatureBrief,
  ownThingBrief,
  type StoryCharacter,
  type StoryPlace,
} from '../src/business/domain/scene-story';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

/** The drawing tasks a --model stands in for: every one the artist may call. */
const DRAW_TASKS = [
  'AI_MODEL_SCENE_DRAW',
  'AI_MODEL_CAST_DRAW',
  'AI_MODEL_SET_PAINT',
];

/** A picture of each drawing: its card, and the judge's larger one. */
const CARD_PX = 320;
const JUDGE_PX = 512;
/** Pixels a kit unit is drawn at on the stage pictures. */
const STAGE_PX = 1.1;

/** What one brief came to: whichever the path drew, as the checks and the pictures need it. */
type Drawn =
  | { kind: 'sheet'; sheet: CharacterSheet; unjoined: string[] }
  | { kind: 'own'; piece: OwnPropDrawing | SetPiece }
  | { kind: 'set'; set: SetSheet };

/** A person of the kit, still, neutral: the stage's measure. */
function personStill(): { svg: string; viewBox: number[] } {
  const drawn = drawFigure(PLAIN_FIGURE, 'bench');
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const [name, id] of Object.entries(drawn.states))
    if (name !== 'neutral') {
      const group = byId(root, id);
      if (group) removeNode(group);
    }
  return { svg: render(doc, { xmlMode: true }), viewBox: drawn.viewBox };
}

/** PNGs laid on one canvas, each where it is put: a picture made of pictures. */
async function compose(
  width: number,
  height: number,
  items: {
    png: Buffer;
    x: number;
    y: number;
    w: number;
    h: number;
  }[],
  extra = '',
): Promise<Buffer> {
  const images = items
    .map(
      (one) =>
        `<image x="${one.x.toFixed(1)}" y="${one.y.toFixed(1)}" width="${one.w.toFixed(1)}" height="${one.h.toFixed(1)}" href="data:image/png;base64,${one.png.toString('base64')}"/>`,
    )
    .join('');
  return rasterise(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f4f1ea"/>${images}${extra}</svg>`,
    width,
  );
}

/** The kit's person beside a drawing, both at the stage's scale, standing on one ground. */
async function lineUp(
  drawing: { svg: string; viewBox: number[] },
  /** How many of the kit's units tall its frame stands. */
  units: number,
  /** Where its ground is: the share of its frame down from the top (its feet), or its own y = 0 (a thing, set in the kit's units). */
  ground: { share: number } | { zero: true },
): Promise<Buffer> {
  const person = personStill();
  const [, py, pw, ph] = person.viewBox;
  const [, dy, dw, dh] = drawing.viewBox;
  const scale = (units * STAGE_PX) / dh;
  const dW = dw * scale;
  const dH = dh * scale;
  const pW = pw * STAGE_PX;
  const pH = ph * STAGE_PX;
  // How far each reaches above the ground, and below it.
  const drawAbove = 'zero' in ground ? -dy * scale : dH * ground.share;
  const above = Math.max(-py * STAGE_PX, drawAbove);
  const below = Math.max(pH + py * STAGE_PX, dH - drawAbove, 0);
  const floor = above + 20;
  // The kit's feet are at its y = 0.
  const personTop = floor + py * STAGE_PX;
  const drawTop = floor - drawAbove;
  const width = Math.round(pW + dW + 60);
  const height = Math.round(floor + below + 20);
  const [personPng, drawnPng] = await Promise.all([
    rasterise(person.svg, Math.max(8, Math.round(pW))),
    rasterise(drawing.svg, Math.max(8, Math.round(dW))),
  ]);
  return compose(
    width,
    height,
    [
      { png: personPng, x: 20, y: personTop, w: pW, h: pH },
      { png: drawnPng, x: pW + 40, y: drawTop, w: dW, h: dH },
    ],
    `<line x1="0" y1="${floor}" x2="${width}" y2="${floor}" stroke="#d8cbb3" stroke-width="2"/>`,
  );
}

/** A set on the stage: a person standing in it where a story's people stand. */
async function inSet(set: SetSheet): Promise<Buffer> {
  const W = 640;
  const H = 360;
  const person = personStill();
  const [, py, pw, ph] = person.viewBox;
  const unit = SET_UNIT_SHARE * H;
  const feet = (820 / 900) * H;
  const [setPng, personPng] = await Promise.all([
    rasterise(set.drawing.svg, W),
    rasterise(person.svg, Math.round(pw * unit)),
  ]);
  return compose(W, H, [
    { png: setPng, x: 0, y: 0, w: W, h: H },
    {
      png: personPng,
      x: W * 0.35,
      y: feet + py * unit,
      w: pw * unit,
      h: ph * unit,
    },
  ]);
}

function characterOf(
  fixture: Extract<DrawingFixture, { kind: 'character' | 'redraw' }>,
): StoryCharacter {
  return {
    id: fixture.id,
    name: fixture.name,
    aliases: [],
    role: 'main',
    look: fixture.look,
    traits: [],
    firstPage: 1,
    met: 0,
    voice: null,
    kind: fixture.is,
    size: fixture.size,
  };
}

function placeOf(
  fixture: Extract<DrawingFixture, { kind: 'place' }>,
): StoryPlace {
  return {
    id: fixture.id,
    name: fixture.name,
    aliases: [],
    look: fixture.look,
    firstPage: 1,
    sound: null,
    kind: fixture.place,
    stand: fixture.stand ?? 'on',
    front: fixture.front ?? null,
    features: [],
  };
}

/** The run's own drawer, over each brief's: `--drawer artist`. */
const DRAWER = flag('--drawer');

/** A brief's spec for a kit, as its writer would give it; for a redraw, before or after the change. */
function specOf(
  fixture: Extract<DrawingFixture, { kind: 'character' | 'redraw' }>,
  changed = false,
): { animal: AnimalSpec } | { creature: CreatureSpec } {
  const before = fixture.animal ?? fixture.creature ?? {};
  const change =
    changed && fixture.kind === 'redraw' ? (fixture.change ?? {}) : {};
  const said = {
    ...before,
    ...change,
    wear: {
      ...((before.wear as object | undefined) ?? {}),
      ...((change.wear as object | undefined) ?? {}),
    },
  };
  if (fixture.creature) {
    const creature = creatureOf(said);
    if (!creature)
      throw new Error(`${fixture.id} has no creature the kit draws`);
    return { creature };
  }
  const animal = animalOf(said);
  if (!animal) throw new Error(`${fixture.id} has no animal the kit draws`);
  return { animal };
}

/** A kit's drawing of a brief's spec. */
const kitSheet = (
  fixture: Extract<DrawingFixture, { kind: 'character' | 'redraw' }>,
  changed = false,
): Promise<CharacterSheet> => {
  const spec = specOf(fixture, changed);
  return 'creature' in spec
    ? creatureSheet(spec.creature, fixture.id)
    : animalSheet(spec.animal, fixture.id);
};

/** The drawing a redraw starts from: the artist's kept sheet, or the kit's drawing of its spec. */
async function oldSheet(
  fixture: Extract<DrawingFixture, { kind: 'redraw' }>,
): Promise<CharacterSheet> {
  if (drawerOf(fixture, DRAWER) === 'kit') return kitSheet(fixture);
  return JSON.parse(
    readFileSync(join(DRAWING_OLD_DIR, fixture.from), 'utf8'),
  ) as CharacterSheet;
}

/** What the judge is told a brief is. */
function judged(fixture: DrawingFixture): {
  kind: DrawingKind;
  brief: string;
} {
  switch (fixture.kind) {
    case 'character':
    case 'redraw':
      return {
        kind: fixture.is,
        brief: `${fixture.name}, ${fixture.look} (${fixture.size} beside people)`,
      };
    case 'thing':
      return {
        kind: 'thing',
        brief: `a ${fixture.look ? `${fixture.look} ` : ''}${fixture.name}`,
      };
    case 'feature':
      return { kind: 'feature', brief: `a ${fixture.name}` };
    case 'place':
      return { kind: 'place', brief: `${fixture.name}: ${fixture.look}` };
  }
}

/** One brief drawn by the path a show draws it by. */
async function drawFixture(
  fixture: DrawingFixture,
  artist: SceneArtist,
  options: ArtistOptions,
): Promise<Drawn | null> {
  const who = `bench ${fixture.id}`;
  // A kit (the animal kit, the creature kit): code, from the spec, no
  // model asked.
  if (
    (fixture.kind === 'character' || fixture.kind === 'redraw') &&
    drawerOf(fixture, DRAWER) === 'kit'
  )
    return {
      kind: 'sheet',
      sheet: await kitSheet(fixture, fixture.kind === 'redraw'),
      unjoined: [],
    };
  switch (fixture.kind) {
    case 'character': {
      const drawn = await artist.drawSheet(
        characterOf(fixture),
        fixture.book,
        null,
        who,
        undefined,
        options,
      );
      return drawn
        ? {
            kind: 'sheet',
            sheet: { ...drawn.sheet, size: fixture.size },
            unjoined: drawn.unjoined,
          }
        : null;
    }
    case 'redraw': {
      const before = await oldSheet(fixture);
      const drawn = await artist.drawSheet(
        characterOf(fixture),
        fixture.book,
        null,
        who,
        { words: fixture.words, reference: referenceOf(before), before },
        options,
      );
      return drawn
        ? {
            kind: 'sheet',
            sheet: { ...drawn.sheet, size: fixture.size },
            unjoined: drawn.unjoined,
          }
        : null;
    }
    case 'thing': {
      const piece = await artist.drawOwn(
        ownThingBrief(
          { id: fixture.id, name: fixture.name, look: fixture.look },
          fixture.book,
        ),
        OWN_THING_CANVAS,
        (drawing) => measureOwnThing(drawing, fixture.id, fixture.real),
        fixture.book,
        null,
        who,
        undefined,
        {
          ...options,
          line: (ink) => KIT_LINE / ownThingScale(ink, fixture.real),
          about: {
            kind: 'thing',
            brief: `a ${fixture.look ? `${fixture.look} ` : ''}${fixture.name}`,
          },
        },
      );
      return piece ? { kind: 'own', piece } : null;
    }
    case 'feature': {
      const piece = await artist.drawOwn(
        ownFeatureBrief(
          { id: fixture.id, name: fixture.name, opens: fixture.opens },
          fixture.book,
        ),
        OWN_FEATURE_CANVAS,
        (drawing) => measureOwnFeature(drawing, fixture.id, fixture.real),
        fixture.book,
        null,
        who,
        undefined,
        {
          ...options,
          line: (ink) => KIT_LINE / ownFeatureScale(ink, fixture.real),
          about: { kind: 'feature', brief: `a ${fixture.name}` },
        },
      );
      return piece ? { kind: 'own', piece } : null;
    }
    case 'place': {
      const set = await artist.paintSet(
        placeOf(fixture),
        fixture.book,
        null,
        who,
        fixture.world ?? null,
        options,
      );
      return set ? { kind: 'set', set } : null;
    }
  }
}

/** A drawing's pictures: its card, the judge's, and on the stage. */
async function picturesOf(
  fixture: DrawingFixture,
  drawn: Drawn,
): Promise<{ svg: string; card: Buffer; judge: Buffer; stage: Buffer }> {
  if (drawn.kind === 'sheet') {
    const svg = faceShown(drawn.sheet, fixture.id);
    // One the kit drew stands at its own size, its feet on its frame's foot.
    const units =
      drawn.sheet.drawing.stands?.units ??
      SIZE_UNITS[drawn.sheet.size ?? 'medium'];
    const [, , , h] = drawn.sheet.drawing.viewBox;
    const feet =
      drawn.sheet.animal || drawn.sheet.creature
        ? 1 - KIT_LINE / 2 / h
        : 1 - Math.min(0.1, 14 / h);
    const [card, judge, stage] = await Promise.all([
      rasterise(svg, CARD_PX),
      rasterise(svg, JUDGE_PX),
      lineUp(
        { svg, viewBox: drawn.sheet.drawing.viewBox },
        units,
        // Its feet at the bottom of its ink: the gate's frame leaves a little room below.
        { share: feet },
      ),
    ]);
    return { svg: drawn.sheet.drawing.svg, card, judge, stage };
  }
  if (drawn.kind === 'own') {
    const { svg, viewBox } = drawn.piece;
    const [card, judge, stage] = await Promise.all([
      rasterise(svg, CARD_PX),
      rasterise(svg, JUDGE_PX),
      lineUp({ svg, viewBox }, viewBox[3], { zero: true }),
    ]);
    return { svg, card, judge, stage };
  }
  const svg = drawn.set.drawing.svg;
  const [card, judge, stage] = await Promise.all([
    rasterise(svg, 480),
    rasterise(svg, 768),
    inSet(drawn.set),
  ]);
  return { svg, card, judge, stage };
}

/** A check as the report keeps it. */
const kept = (checks: CodeChecks): Record<string, CheckKept> =>
  Object.fromEntries(
    Object.entries(checks)
      .filter(([, check]) => check)
      .map(([name, check]) => [
        name,
        { ok: (check as CheckKept).ok, notes: (check as CheckKept).notes },
      ]),
  );

async function runOne(
  fixture: DrawingFixture,
  llm: AiSdkLlmAdapter,
  judge: AiSdkLlmAdapter,
  out: string,
  options: ArtistOptions,
): Promise<BenchEntry> {
  const dir = join(out, fixture.id);
  mkdirSync(dir, { recursive: true });
  const log: string[] = [];
  const say = (line: string) => {
    log.push(line);
    console.log(line);
  };
  const logger: ArtistLog = { log: say, warn: (line) => say(`! ${line}`) };
  const calls: LlmUsage[] = [];
  const tasks: string[] = [];
  const artist = new SceneArtist(
    llm,
    (_documentId, task, usage) => {
      calls.push(usage);
      tasks.push(task);
      return Promise.resolve();
    },
    logger,
  );
  const started = Date.now();
  const entry: BenchEntry = {
    id: fixture.id,
    kind: fixture.kind,
    name: fixture.name,
    drawn: false,
    models: [],
    calls: 0,
    costUsd: 0,
    ms: 0,
    checks: {},
    style: null,
    verdict: null,
    score: 0,
    passes: false,
    styleOk: false,
    files: {},
    log,
  };
  let drawn: Drawn | null = null;
  try {
    drawn = await drawFixture(fixture, artist, options);
  } catch (error) {
    entry.error = (error as Error).message;
    say(`! ${fixture.id}: ${(error as Error).message}`);
  }
  entry.ms = Date.now() - started;
  entry.calls = calls.length;
  entry.tokens = {
    in: calls.reduce((sum, one) => sum + one.tokensIn, 0),
    out: calls.reduce((sum, one) => sum + one.tokensOut, 0),
  };
  entry.models = calls.map((one) => one.model);
  entry.costUsd =
    Math.round(
      calls.reduce(
        (sum, one, k) =>
          sum +
          (costOf({
            task: tasks[k],
            model: one.model,
            tokensIn: one.tokensIn,
            tokensOut: one.tokensOut,
            tokensCached: one.tokensCached ?? null,
          }) ?? 0),
        0,
      ) * 1e6,
    ) / 1e6;
  if (fixture.kind === 'redraw') {
    const before = await oldSheet(fixture);
    writeFileSync(
      join(dir, 'before.png'),
      await rasterise(faceShown(before, fixture.id), CARD_PX),
    );
    entry.files.before = `${fixture.id}/before.png`;
  }
  if (!drawn) return entry;
  entry.drawn = true;
  const pictures = await picturesOf(fixture, drawn);
  writeFileSync(join(dir, 'drawing.svg'), pictures.svg);
  writeFileSync(join(dir, 'card.png'), pictures.card);
  writeFileSync(join(dir, 'stage.png'), pictures.stage);
  entry.files = {
    ...entry.files,
    svg: `${fixture.id}/drawing.svg`,
    card: `${fixture.id}/card.png`,
    stage: `${fixture.id}/stage.png`,
  };
  const checks =
    drawn.kind === 'sheet'
      ? await checkSheet(drawn.sheet, {
          unjoined: drawn.unjoined,
          legs:
            fixture.kind === 'character' || fixture.kind === 'redraw'
              ? fixture.legs
              : null,
        })
      : drawn.kind === 'own'
        ? await checkOwn(
            drawn.piece,
            fixture.kind === 'feature' ? 'feature' : 'thing',
          )
        : await checkSet(
            drawn.set,
            fixture.kind === 'place' ? fixture.place : null,
          );
  entry.checks = kept(checks);
  entry.style = checks.style.report;
  entry.styleOk = checks.style.ok;
  const asked = judged(fixture);
  let verdict: DrawingVerdict | null = null;
  try {
    const old =
      fixture.kind === 'redraw'
        ? {
            png: await rasterise(
              faceShown(await oldSheet(fixture), fixture.id),
              JUDGE_PX,
            ),
            words: fixture.words,
          }
        : undefined;
    verdict = (
      await judge.drawingJudge({
        png: pictures.judge,
        kind: asked.kind,
        brief: asked.brief,
        ...(old ? { old } : {}),
      })
    ).value;
  } catch (error) {
    say(
      `! ${fixture.id}: the judge could not be asked: ${(error as Error).message}`,
    );
  }
  entry.verdict = verdict;
  entry.score = verdictScore(verdict);
  entry.passes = codePasses(checks) && verdictPasses(verdict);
  writeFileSync(join(dir, 'entry.json'), JSON.stringify(entry, null, 2));
  return entry;
}

/** Each brief through `work`, at most `limit` at a time. */
async function inBatches<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await work(items[at]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  return out;
}

/** Every drawing in one picture: its card, on the stage, and its score. */
async function sheetPng(report: BenchReport, out: string): Promise<Buffer> {
  const COLS = 3;
  const CELL_W = 620;
  const CELL_H = 300;
  const rows = Math.ceil(report.entries.length / COLS);
  const width = COLS * CELL_W + 40;
  const height = rows * CELL_H + 90;
  const items: Parameters<typeof compose>[2] = [];
  const texts: string[] = [
    `<text x="20" y="40" font-size="26" font-weight="700" fill="#2d2a32">${esc(report.label)}</text>`,
    `<text x="20" y="68" font-size="16" fill="#666">median ${report.summary.median} · pass ${Math.round(report.summary.passes * 100)}% · house style ${Math.round(report.summary.stylePasses * 100)}% · ${report.summary.drawn}/${report.summary.count} drawn</text>`,
  ];
  const size = (png: Buffer) => ({
    w: png.readUInt32BE(16),
    h: png.readUInt32BE(20),
  });
  report.entries.forEach((one, k) => {
    const x = 20 + (k % COLS) * CELL_W;
    const y = 90 + Math.floor(k / COLS) * CELL_H;
    texts.push(
      `<text x="${x}" y="${y + 18}" font-size="15" font-weight="700" fill="${one.passes ? '#3b8a3f' : '#c0392b'}">${esc(one.name)} (${esc(one.id)}) ${one.drawn ? `${one.score}/10${one.passes ? ', passes' : ''}${one.styleOk ? '' : ' · style fails'}` : 'nothing came through'}</text>`,
    );
    const pics = [one.files.before, one.files.card, one.files.stage].filter(
      (file): file is string => Boolean(file) && existsSync(join(out, file!)),
    );
    let left = x;
    const room = CELL_W - 20;
    const each = room / Math.max(1, pics.length);
    for (const file of pics) {
      const png = readFileSync(join(out, file));
      const { w, h } = size(png);
      const k2 = Math.min(each / w, (CELL_H - 40) / h);
      items.push({ png, x: left, y: y + 28, w: w * k2, h: h * k2 });
      left += w * k2 + 10;
    }
  });
  return compose(width, height, items, texts.join(''));
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The run to compare against: a report file, or the baseline kept in the repo. */
function againstOf(
  said: string | undefined,
): (Pick<BenchReport, 'entries' | 'summary'> & { label?: string }) | undefined {
  if (!said) return undefined;
  if (said === 'baseline') {
    const baseline = readDrawingBaseline();
    if (!baseline) throw new Error('No baseline is kept yet');
    return { ...baselineReport(baseline), label: baseline.label };
  }
  const report = JSON.parse(readFileSync(said, 'utf8')) as BenchReport;
  return report;
}

async function writePages(
  report: BenchReport,
  out: string,
  against?: ReturnType<typeof againstOf>,
): Promise<void> {
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(out, 'index.html'),
    contactSheetHtml(report, { against, marks: readMarks(out) }),
  );
  writeFileSync(join(out, 'sheet.png'), await sheetPng(report, out));
}

/**
 * A run judged again from its kept pictures by another judge (--judge):
 * so a run the loop judged is also measured by a judge it never saw, and
 * a run cut short can be scored. Code's checks stand as they were. Writes
 * report-<judge>.json and index-<judge>.html beside the run's own.
 */
async function rejudge(dir: string, model: string | undefined): Promise<void> {
  const kept = JSON.parse(
    readFileSync(join(dir, 'report.json'), 'utf8'),
  ) as BenchReport;
  const env: Record<string, string | undefined> = { ...process.env };
  if (model) env.AI_MODEL_DRAWING_JUDGE = model;
  const judge = new AiSdkLlmAdapter(new ConfigService(env));
  const fixtures = new Map(loadDrawingFixtures().map((one) => [one.id, one]));
  const entries = await inBatches(kept.entries, 6, async (entry) => {
    const fixture = fixtures.get(entry.id);
    if (!fixture || !entry.files.card)
      return { ...entry, verdict: null, score: 0, passes: false };
    const asked = judged(fixture);
    const png = readFileSync(join(dir, entry.files.card));
    const old =
      fixture.kind === 'redraw' && entry.files.before
        ? {
            png: readFileSync(join(dir, entry.files.before)),
            words: fixture.words,
          }
        : undefined;
    try {
      const verdict = (
        await judge.drawingJudge({
          png,
          kind: asked.kind,
          brief: asked.brief,
          ...(old ? { old } : {}),
        })
      ).value;
      const score = verdictScore(verdict);
      const codeOk = Object.values(entry.checks).every((c) => c.ok);
      console.log(
        `${entry.id.padEnd(16)} ${String(entry.score).padStart(5)} → ${score}  ${verdict.sees}`,
      );
      return {
        ...entry,
        verdict,
        score,
        passes: codeOk && verdictPasses(verdict),
      };
    } catch (error) {
      console.warn(`! ${entry.id}: ${(error as Error).message}`);
      return { ...entry, verdict: null, score: 0, passes: false };
    }
  });
  const slug = (model ?? 'default').replace(/[^a-z0-9.-]+/gi, '_');
  const report: BenchReport = {
    ...kept,
    label: `${kept.label} (judged again by ${model ?? 'the default judge'})`,
    setup: { ...kept.setup, judge: model ?? 'drawing_judge default' },
    entries,
    summary: summarise(entries),
  };
  writeFileSync(
    join(dir, `report-${slug}.json`),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(
    join(dir, `index-${slug}.html`),
    contactSheetHtml(report, { marks: readMarks(dir) }),
  );
  const s = report.summary;
  console.log(
    `\nmedian ${s.median} · mean ${s.mean} · pass ${Math.round(s.passes * 100)}% → ${join(dir, `report-${slug}.json`)}`,
  );
}

async function main(): Promise<void> {
  const markAt = flag('--mark');
  if (markAt) {
    const at = args.indexOf('--mark');
    const [dir, id, said, note] = args.slice(at + 1);
    const report = JSON.parse(
      readFileSync(join(dir, 'report.json'), 'utf8'),
    ) as BenchReport;
    if (!report.entries.some((one) => one.id === id))
      throw new Error(`${id} is not in that run`);
    writeMarks(dir, withMark(readMarks(dir), id, said, note));
    writeFileSync(
      join(dir, 'index.html'),
      contactSheetHtml(report, { marks: readMarks(dir) }),
    );
    console.log(`${id}: ${said}${note ? ` (${note})` : ''}`);
    return;
  }
  const rejudgeAt = flag('--rejudge');
  if (rejudgeAt) {
    await rejudge(rejudgeAt, flag('--judge'));
    return;
  }
  const sheetAt = flag('--sheet');
  if (sheetAt) {
    // Another report of the run (one judged again) draws its own pages.
    const named = flag('--report');
    const kept = JSON.parse(
      readFileSync(join(sheetAt, named ?? 'report.json'), 'utf8'),
    ) as BenchReport;
    // Summed up again, as runs are summed up now.
    const report = { ...kept, summary: summarise(kept.entries) };
    const against = againstOf(flag('--against'));
    if (named) {
      const stem = named.replace(/\.json$/, '').replace(/^report-?/, '');
      writeFileSync(
        join(sheetAt, `index-${stem}.html`),
        contactSheetHtml(report, { against, marks: readMarks(sheetAt) }),
      );
      writeFileSync(
        join(sheetAt, `sheet-${stem}.png`),
        await sheetPng(report, sheetAt),
      );
      console.log(`→ ${join(sheetAt, `sheet-${stem}.png`)}`);
      return;
    }
    await writePages(report, sheetAt, against);
    console.log(`→ ${join(sheetAt, 'index.html')}`);
    return;
  }
  const out = resolve(
    flag('--out') ??
      join('scene-out', 'drawing-bench', new Date().toISOString().slice(0, 16)),
  );
  mkdirSync(out, { recursive: true });
  const model = flag('--model');
  const judgeModel = flag('--judge');
  const seeWith = flag('--see-with');
  const options: ArtistOptions = {
    ...(flag('--takes') ? { takes: Number(flag('--takes')) } : {}),
    ...(flag('--revisions') ? { revisions: Number(flag('--revisions')) } : {}),
    ...(args.includes('--no-see') ? { see: false } : {}),
  };
  const only = (flag('--only') ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);
  const env: Record<string, string | undefined> = { ...process.env };
  if (model) for (const name of DRAW_TASKS) env[name] = model;
  if (seeWith) env.AI_MODEL_DRAWING_JUDGE = seeWith;
  const llm = new AiSdkLlmAdapter(new ConfigService(env));
  const judge = new AiSdkLlmAdapter(
    new ConfigService({
      ...env,
      ...(judgeModel ? { AI_MODEL_DRAWING_JUDGE: judgeModel } : {}),
    }),
  );
  const fixtures = loadDrawingFixtures().filter(
    (one) => !only.length || only.includes(one.id),
  );
  if (!fixtures.length) throw new Error('No briefs match');
  const concurrency = Number(flag('--concurrency') ?? 6);
  console.log(`${fixtures.length} briefs → ${out} (${concurrency} at a time)`);
  const entries = await inBatches(fixtures, concurrency, (fixture) =>
    runOne(fixture, llm, judge, out, options),
  );
  const report: BenchReport = {
    at: new Date().toISOString(),
    label: flag('--label') ?? 'drawing bench',
    setup: {
      draw: model ?? 'each task’s own',
      judge:
        judgeModel ??
        process.env.AI_MODEL_DRAWING_JUDGE ??
        'drawing_judge default',
      seeing:
        options.see === false
          ? 'blind'
          : (seeWith ?? env.AI_MODEL_DRAWING_JUDGE ?? 'drawing_judge default'),
      drawer: DRAWER ?? 'each brief’s own',
      takes: options.takes ?? 'a show’s',
      revisions: options.revisions ?? 'a show’s',
      briefs: fixtures.length,
    },
    entries,
    summary: summarise(entries),
  };
  const against = againstOf(flag('--against'));
  await writePages(report, out, against);
  const s = report.summary;
  console.log(
    `\nmedian ${s.median} · mean ${s.mean} · pass ${Math.round(s.passes * 100)}% · style ${Math.round(s.stylePasses * 100)}% · code ${Math.round(s.codePasses * 100)}% · gradients ${s.gradients} · ${s.drawn}/${s.count} drawn · ${(s.costPerDrawing * 100).toFixed(2)}¢ and ${Math.round(s.msPerDrawing / 1000)} s a drawing`,
  );
  for (const one of entries)
    console.log(
      `${one.passes ? 'ok' : 'XX'} ${one.id.padEnd(16)} ${String(one.score).padStart(5)}  ${one.styleOk ? 'style' : 'STYLE'}  ${(one.costUsd * 100).toFixed(2)}¢ ${Math.round(one.ms / 1000)}s  ${one.verdict?.sees ?? one.error ?? ''}`,
    );
  if (args.includes('--write-baseline')) {
    if (only.length) console.warn('baseline not written: only some briefs ran');
    else {
      writeDrawingBaseline(report);
      console.log('baseline written');
    }
  }
  console.log(`→ ${join(out, 'index.html')}\n→ ${join(out, 'sheet.png')}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

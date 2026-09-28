/**
 * The drawing bench (studio-drawings-plan §3), so "better" is measured,
 * never guessed. About forty briefs (animals, creatures, the show's own
 * things, places, and two characters drawn again as a maker asked), each
 * drawn through the real path (scripts/drawing-bench.ts), rendered,
 * checked by code (drawing-checks) and judged by a vision model
 * (drawing-score). Here: the briefs, a run's report and its summary, one
 * run against another, Richard's marks beside a report, and the contact
 * sheet he looks at. Nothing here runs in the live path.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DrawingVerdict } from './drawing-score';
import type { StyleReport } from './scene-polish';
import type { RealSize } from './scene-sheet';
import type {
  PlaceKind,
  PlaceStand,
  StorySize,
  StoryWorld,
} from './scene-story';

/** What a brief asks to be drawn, and so which path draws it. */
export type FixtureKind =
  'character' | 'thing' | 'feature' | 'place' | 'redraw';

interface FixtureBase {
  id: string;
  kind: FixtureKind;
  /** Its name, as the show calls it. */
  name: string;
  /** The show it is drawn for: the artist is told its title. */
  book: string;
  /**
   * What draws it: the artist by default; a kit's name (`kit`, an animal
   * drawn by code) once one can, so the same brief measures the kit
   * against the artist.
   */
  drawer?: string;
}

/** What draws a brief: the artist, or the animal kit from the spec a writer would give it. */
export const drawerOf = (
  fixture: DrawingFixture,
  /** A run's own choice, over the brief's: `--drawer artist`. */
  said?: string,
): 'artist' | 'kit' =>
  (said ?? fixture.drawer) === 'kit' &&
  (fixture.kind === 'character' || fixture.kind === 'redraw') &&
  fixture.animal
    ? 'kit'
    : 'artist';

/** An animal or a creature, drawn for the first time. */
export interface CharacterFixture extends FixtureBase {
  kind: 'character';
  is: 'animal' | 'creature';
  size: StorySize;
  look: string;
  /** How many feet stand on the ground; null when it may stand either way. */
  legs: number | null;
  /** Its spec for the animal kit, as the cast's writer would give it for its look. */
  animal?: Record<string, unknown>;
}

/** A thing of the show's own that people hold, carry or wear. */
export interface ThingFixture extends FixtureBase {
  kind: 'thing';
  look?: string;
  /** How big it really is: what the show would ask. */
  real: RealSize | null;
}

/** A fixed thing of the show's own that people stand by or use. */
export interface FeatureFixture extends FixtureBase {
  kind: 'feature';
  opens: boolean;
  real: RealSize | null;
}

/** A place, painted as the scene behind the stage. */
export interface PlaceFixture extends FixtureBase {
  kind: 'place';
  look: string;
  place: PlaceKind;
  stand?: PlaceStand | null;
  front?: string | null;
  world?: StoryWorld | null;
}

/** A character the maker asks to be drawn again, changed, from how they are drawn now. */
export interface RedrawFixture extends FixtureBase {
  kind: 'redraw';
  is: 'animal' | 'creature';
  size: StorySize;
  look: string;
  legs: number | null;
  /** What the maker asked for. */
  words: string;
  /** The sheet they have now, in the bench's `old` folder. */
  from: string;
  /** Its spec for the animal kit before the change, and the change to it a writer would make for the words. */
  animal?: Record<string, unknown>;
  change?: Record<string, unknown>;
}

export type DrawingFixture =
  | CharacterFixture
  | ThingFixture
  | FeatureFixture
  | PlaceFixture
  | RedrawFixture;

export const DRAWING_BENCH_DIR = join(__dirname, 'drawing-bench');
export const DRAWING_BASELINE_FILE = join(DRAWING_BENCH_DIR, 'baseline.json');
/** The drawings a redraw starts from. */
export const DRAWING_OLD_DIR = join(DRAWING_BENCH_DIR, 'old');

/** The briefs, by file name order; `baseline.json` is not one. */
export function loadDrawingFixtures(
  dir: string = DRAWING_BENCH_DIR,
): DrawingFixture[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'baseline.json')
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(join(dir, file), 'utf8')) as DrawingFixture,
    );
}

/** A code check as a report keeps it: plain data. */
export interface CheckKept {
  ok: boolean;
  notes: string[];
}

/** One brief, drawn and scored. */
export interface BenchEntry {
  id: string;
  kind: FixtureKind;
  name: string;
  /** Whether anything came through to score. */
  drawn: boolean;
  error?: string;
  /** Every model the drawing called, as each call recorded it. */
  models: string[];
  /** Model calls made drawing it: the artist's and the loop's judge's. */
  calls: number;
  /** What drawing it cost, in US dollars: the bench's own judging aside. */
  costUsd: number;
  /** The tokens it took, in and out (thinking is out). */
  tokens?: { in: number; out: number };
  /** How long drawing it took. */
  ms: number;
  checks: Record<string, CheckKept>;
  style: StyleReport | null;
  verdict: DrawingVerdict | null;
  /** The judge's mean, 0 to 10; 0 when nothing came through. */
  score: number;
  /** Every code check holds and every judged point reaches the pass mark. */
  passes: boolean;
  /** The house style check alone: ink, line and flat fills. */
  styleOk: boolean;
  /** The pictures and the drawing, beside the report. */
  files: { card?: string; stage?: string; before?: string; svg?: string };
  /** What the path said while drawing it. */
  log: string[];
}

/** One run's numbers. */
export interface BenchSummary {
  count: number;
  drawn: number;
  /** The judge's median and mean, over every brief (nothing drawn is 0). */
  median: number;
  mean: number;
  /** The share of every brief that passes (nothing drawn does not). */
  passes: number;
  /** Shares of the drawings made: every code check holds; the house style holds. */
  codePasses: number;
  stylePasses: number;
  /** Drawings with any gradient left in them. */
  gradients: number;
  /** Per brief drawn. */
  costPerDrawing: number;
  msPerDrawing: number;
  byKind: Partial<Record<FixtureKind, { count: number; median: number }>>;
}

export interface BenchReport {
  at: string;
  /** What this run was, in words: "baseline: today's pipeline". */
  label: string;
  /** How it was drawn and judged. */
  setup: Record<string, string | number | boolean>;
  entries: BenchEntry[];
  summary: BenchSummary;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : r2((sorted[mid - 1] + sorted[mid]) / 2);
}

export function summarise(entries: readonly BenchEntry[]): BenchSummary {
  const count = entries.length || 1;
  const drawn = entries.filter((one) => one.drawn);
  const share = (n: number) => r2(n / count);
  const ofDrawn = (n: number) => (drawn.length ? r2(n / drawn.length) : 0);
  const byKind: BenchSummary['byKind'] = {};
  for (const kind of [...new Set(entries.map((one) => one.kind))]) {
    const of = entries.filter((one) => one.kind === kind);
    byKind[kind] = {
      count: of.length,
      median: median(of.map((one) => one.score)),
    };
  }
  return {
    count: entries.length,
    drawn: drawn.length,
    median: median(entries.map((one) => one.score)),
    mean: r2(entries.reduce((sum, one) => sum + one.score, 0) / count),
    passes: share(entries.filter((one) => one.passes).length),
    codePasses: ofDrawn(
      drawn.filter((one) => Object.values(one.checks).every((c) => c.ok))
        .length,
    ),
    stylePasses: ofDrawn(drawn.filter((one) => one.styleOk).length),
    gradients: entries.filter((one) => (one.style?.gradients ?? 0) > 0).length,
    costPerDrawing: drawn.length
      ? Math.round(
          (drawn.reduce((sum, one) => sum + one.costUsd, 0) / drawn.length) *
            1e5,
        ) / 1e5
      : 0,
    msPerDrawing: drawn.length
      ? Math.round(drawn.reduce((sum, one) => sum + one.ms, 0) / drawn.length)
      : 0,
    byKind,
  };
}

/** One run beside another, brief by brief. */
export interface Comparison {
  rows: {
    id: string;
    before: number | null;
    after: number | null;
    delta: number | null;
  }[];
  /** Briefs scored lower than before. */
  fellBelow: string[];
  median: { before: number; after: number };
}

/** A run against an earlier one: every brief both have, and which fell below. */
export function compareReports(
  before: Pick<BenchReport, 'entries' | 'summary'>,
  after: Pick<BenchReport, 'entries' | 'summary'>,
): Comparison {
  const was = new Map(before.entries.map((one) => [one.id, one.score]));
  const rows = after.entries.map((one) => {
    const then = was.get(one.id);
    return {
      id: one.id,
      before: then ?? null,
      after: one.score,
      delta: then === undefined ? null : r2(one.score - then),
    };
  });
  const ids = new Set(after.entries.map((one) => one.id));
  const same = (entries: readonly BenchEntry[]) =>
    median(entries.filter((one) => ids.has(one.id)).map((one) => one.score));
  return {
    rows,
    fellBelow: rows
      .filter((row) => row.delta !== null && row.delta < 0)
      .map((row) => row.id),
    median: {
      before: same(before.entries.filter((one) => was.has(one.id))),
      after: same(after.entries.filter((one) => was.has(one.id))),
    },
  };
}

/** What is kept of a run as the baseline, in the repo: small, the numbers only. */
export interface DrawingBaseline {
  at: string;
  label: string;
  setup: BenchReport['setup'];
  summary: BenchSummary;
  scores: Record<string, { score: number; passes: boolean; styleOk: boolean }>;
}

export function baselineOf(report: BenchReport): DrawingBaseline {
  return {
    at: report.at,
    label: report.label,
    setup: report.setup,
    summary: report.summary,
    scores: Object.fromEntries(
      report.entries.map((one) => [
        one.id,
        { score: one.score, passes: one.passes, styleOk: one.styleOk },
      ]),
    ),
  };
}

/** A kept baseline read as a report to compare against: its scores, nothing else. */
export function baselineReport(
  baseline: DrawingBaseline,
): Pick<BenchReport, 'entries' | 'summary'> {
  return {
    summary: baseline.summary,
    entries: Object.entries(baseline.scores).map(([id, one]) => ({
      id,
      kind: 'character',
      name: id,
      drawn: true,
      models: [],
      calls: 0,
      costUsd: 0,
      ms: 0,
      checks: {},
      style: null,
      verdict: null,
      score: one.score,
      passes: one.passes,
      styleOk: one.styleOk,
      files: {},
      log: [],
    })),
  };
}

export function readDrawingBaseline(
  file = DRAWING_BASELINE_FILE,
): DrawingBaseline | null {
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as DrawingBaseline)
    : null;
}

export function writeDrawingBaseline(
  report: BenchReport,
  file = DRAWING_BASELINE_FILE,
): void {
  writeFileSync(file, `${JSON.stringify(baselineOf(report), null, 2)}\n`);
}

// ── Richard's marks ───────────────────────────────────────────────────────

/** Richard's word on each drawing of a run: ok or not, and why. */
export type BenchMarks = Record<
  string,
  { ok: boolean; note?: string; at: string }
>;

export const MARKS_FILE = 'marks.json';

export function readMarks(dir: string): BenchMarks {
  const file = join(dir, MARKS_FILE);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as BenchMarks)
    : {};
}

/** Marks with one more (or one changed), as said on the command line: "ok" or "not", and a note. */
export function withMark(
  marks: BenchMarks,
  id: string,
  said: string,
  note: string | undefined,
  at = new Date().toISOString(),
): BenchMarks {
  const word = said.trim().toLowerCase();
  if (word !== 'ok' && word !== 'not')
    throw new Error(`A mark is "ok" or "not", not "${said}"`);
  return {
    ...marks,
    [id]: {
      ok: word === 'ok',
      ...(note?.trim() ? { note: note.trim() } : {}),
      at,
    },
  };
}

export function writeMarks(dir: string, marks: BenchMarks): void {
  writeFileSync(join(dir, MARKS_FILE), `${JSON.stringify(marks, null, 2)}\n`);
}

/** How the judge and Richard agree, where he has marked: the share that agree. */
export function agreement(
  report: Pick<BenchReport, 'entries'>,
  marks: BenchMarks,
): { marked: number; agree: number } {
  const marked = report.entries.filter((one) => marks[one.id]);
  const agree = marked.filter((one) => marks[one.id].ok === one.passes);
  return {
    marked: marked.length,
    agree: marked.length ? r2(agree.length / marked.length) : 0,
  };
}

// ── The contact sheet ─────────────────────────────────────────────────────

const esc = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (usd: number) =>
  usd >= 0.1 ? `$${usd.toFixed(2)}` : `${(usd * 100).toFixed(2)}¢`;

/**
 * A run as a page: its numbers, against a run before when given, and a
 * card for every brief (the drawing alone, and on the stage beside a
 * person), with its score, what code found and what the judge said, and
 * Richard's mark where he has given one.
 */
export function contactSheetHtml(
  report: BenchReport,
  options: {
    against?: Pick<BenchReport, 'entries' | 'summary'> & { label?: string };
    marks?: BenchMarks;
  } = {},
): string {
  const { summary } = report;
  const compared = options.against
    ? compareReports(options.against, report)
    : null;
  const before = new Map(compared?.rows.map((row) => [row.id, row]) ?? []);
  const marks = options.marks ?? {};
  const head = [
    `<h1>${esc(report.label)}</h1>`,
    `<p class="sub">${esc(report.at)} · ${Object.entries(report.setup)
      .map(([k, v]) => `${esc(k)}: ${esc(String(v))}`)
      .join(' · ')}</p>`,
    '<table class="sum"><tr>',
    `<td><b>${summary.median}</b><span>median score</span></td>`,
    `<td><b>${Math.round(summary.passes * 100)}%</b><span>pass</span></td>`,
    `<td><b>${Math.round(summary.stylePasses * 100)}%</b><span>house style</span></td>`,
    `<td><b>${Math.round(summary.codePasses * 100)}%</b><span>every code check</span></td>`,
    `<td><b>${summary.gradients}</b><span>with gradients</span></td>`,
    `<td><b>${money(summary.costPerDrawing)}</b><span>a drawing</span></td>`,
    `<td><b>${Math.round(summary.msPerDrawing / 1000)} s</b><span>a drawing</span></td>`,
    `<td><b>${summary.drawn}/${summary.count}</b><span>drawn</span></td>`,
    '</tr></table>',
    compared
      ? `<p class="vs">Against ${esc(options.against?.label ?? 'the run before')}: median ${compared.median.before} → ${compared.median.after}; ${compared.fellBelow.length ? `lower: ${compared.fellBelow.map(esc).join(', ')}` : 'none lower'}.</p>`
      : '',
  ].join('');
  const cards = report.entries.map((one) => {
    const row = before.get(one.id);
    const mark = marks[one.id];
    const failing = Object.entries(one.checks).filter(([, c]) => !c.ok);
    const badges = Object.entries(one.checks)
      .map(
        ([name, c]) =>
          `<span class="b ${c.ok ? 'ok' : 'no'}" title="${esc(c.notes.join(' '))}">${esc(name)}</span>`,
      )
      .join('');
    const pictures = [
      one.files.before
        ? `<figure><img src="${esc(one.files.before)}"/><figcaption>before</figcaption></figure>`
        : '',
      one.files.card
        ? `<figure><img src="${esc(one.files.card)}"/><figcaption>${one.files.before ? 'after' : 'drawn'}</figcaption></figure>`
        : '<figure class="none">nothing came through</figure>',
      one.files.stage
        ? `<figure><img src="${esc(one.files.stage)}"/><figcaption>on the stage</figcaption></figure>`
        : '',
    ].join('');
    return [
      `<section class="card ${one.passes ? 'pass' : 'fail'}" id="${esc(one.id)}">`,
      `<h2>${esc(one.name)} <small>${esc(one.id)} · ${esc(one.kind)}</small></h2>`,
      `<div class="pics">${pictures}</div>`,
      `<p class="score"><b>${one.score}</b>/10 ${one.passes ? '✓ passes' : '✗ does not pass'}${row?.delta !== null && row?.delta !== undefined ? ` <span class="${row.delta >= 0 ? 'up' : 'down'}">${row.delta >= 0 ? '+' : ''}${row.delta} (was ${row.before})</span>` : ''}</p>`,
      `<p class="badges">${badges}</p>`,
      one.verdict
        ? `<p class="sees">Judge: “${esc(one.verdict.sees)}” — ${[
            ['recognisable', one.verdict.recognisable],
            ['anatomy', one.verdict.anatomy],
            ['face', one.verdict.face],
            ['change', one.verdict.change],
            ['same', one.verdict.same],
            ['place', one.verdict.place],
          ]
            .filter(([, v]) => v !== null)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ')}</p>`
        : '',
      one.verdict?.problems.length
        ? `<ul>${one.verdict.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        : '',
      failing.length
        ? `<p class="code">Code: ${esc(failing.flatMap(([, c]) => c.notes).join('; '))}</p>`
        : '',
      `<p class="cost">${money(one.costUsd)} · ${Math.round(one.ms / 1000)} s · ${one.calls} calls · ${esc([...new Set(one.models)].join(', '))}</p>`,
      one.error ? `<p class="code">${esc(one.error)}</p>` : '',
      mark
        ? `<p class="mark ${mark.ok ? 'ok' : 'no'}">Richard: ${mark.ok ? 'ok' : 'not right'}${mark.note ? ` — ${esc(mark.note)}` : ''}</p>`
        : '',
      '</section>',
    ].join('');
  });
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<title>Drawing bench: ${esc(report.label)}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>',
    'body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#2d2a32;background:#faf8f3}',
    'h1{margin:0 0 4px}.sub{color:#777;margin:0 0 12px}.vs{font-weight:600}',
    '.sum td{padding:6px 14px 6px 0}.sum b{display:block;font-size:22px}.sum span{color:#777;font-size:12px}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;margin-top:16px}',
    '.card{background:#fff;border-radius:10px;padding:12px 14px;border-left:6px solid #d9534f}',
    '.card.pass{border-left-color:#6dbf73}.card h2{font-size:16px;margin:0 0 8px}.card h2 small{color:#999;font-weight:400}',
    '.pics{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}figure{margin:0;text-align:center}figure img{max-height:220px;max-width:100%;background:#f4f1ea;border-radius:6px}',
    'figcaption{font-size:11px;color:#999}.none{padding:40px;color:#d9534f}',
    '.score b{font-size:20px}.up{color:#3b8a3f}.down{color:#c0392b}',
    '.b{display:inline-block;font-size:11px;padding:1px 6px;border-radius:8px;margin:0 4px 4px 0}.b.ok{background:#e3f4e4}.b.no{background:#fbe0de}',
    '.sees{color:#555}.code{color:#c0392b}.cost{color:#999;font-size:12px}.mark{font-weight:600}.mark.ok{color:#3b8a3f}.mark.no{color:#c0392b}',
    'ul{margin:4px 0 4px 18px;padding:0}',
    '</style></head><body>',
    head,
    `<div class="grid">${cards.join('')}</div>`,
    '</body></html>',
  ].join('\n');
}

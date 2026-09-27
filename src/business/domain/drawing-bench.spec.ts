import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DRAWING_OLD_DIR,
  agreement,
  baselineOf,
  baselineReport,
  compareReports,
  contactSheetHtml,
  loadDrawingFixtures,
  median,
  readMarks,
  summarise,
  withMark,
  writeMarks,
  type BenchEntry,
  type BenchReport,
} from './drawing-bench';

const entry = (
  id: string,
  score: number,
  patch: Partial<BenchEntry> = {},
): BenchEntry => ({
  id,
  kind: 'character',
  name: id,
  drawn: true,
  models: ['deepseek:deepseek-flash'],
  calls: 1,
  costUsd: 0.01,
  ms: 30_000,
  checks: { style: { ok: true, notes: [] } },
  style: null,
  verdict: null,
  score,
  passes: score >= 8,
  styleOk: true,
  files: {},
  log: [],
  ...patch,
});

const report = (entries: BenchEntry[], label = 'run'): BenchReport => ({
  at: '2026-09-27T20:00:00.000Z',
  label,
  setup: { draw: 'x' },
  entries,
  summary: summarise(entries),
});

describe('the briefs', () => {
  const fixtures = loadDrawingFixtures();

  it('has about forty, of every kind the plan names', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
    const kinds = new Set(fixtures.map((one) => one.kind));
    expect([...kinds].sort()).toEqual([
      'character',
      'feature',
      'place',
      'redraw',
      'thing',
    ]);
    const ids = fixtures.map((one) => one.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'horse',
      'duck',
      'egg-man',
      'kite',
      'bus',
      'clover-blanket',
    ])
      expect(ids).toContain(id);
  });

  it('gives every redraw a drawing to start from', () => {
    for (const one of fixtures)
      if (one.kind === 'redraw') {
        const sheet = JSON.parse(
          readFileSync(join(DRAWING_OLD_DIR, one.from), 'utf8'),
        ) as { drawing: { svg: string } };
        expect(sheet.drawing.svg).toContain('<svg');
      }
  });
});

describe('a run, summed up', () => {
  it('takes the median and the pass share over every brief, nothing drawn as 0, and the style share over the drawings made', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const summary = summarise([
      entry('a', 9),
      entry('b', 6, { styleOk: false }),
      entry('c', 0, { drawn: false, checks: {} }),
    ]);
    expect(summary.median).toBe(6);
    expect(summary.passes).toBe(0.33);
    // Of the drawings made: the one never drawn is no drawing out of style.
    expect(summary.stylePasses).toBe(0.5);
    expect(summary.drawn).toBe(2);
    expect(summary.costPerDrawing).toBe(0.01);
  });

  it('compares a run with one before, brief by brief, and names those that fell', () => {
    const before = report([entry('a', 5), entry('b', 7)]);
    const after = report([entry('a', 8), entry('b', 6), entry('c', 9)]);
    const compared = compareReports(before, after);
    expect(compared.fellBelow).toEqual(['b']);
    expect(compared.rows.find((row) => row.id === 'c')?.before).toBeNull();
    expect(compared.median).toEqual({ before: 6, after: 7 });
  });

  it('keeps a small baseline, and reads it back as a run to compare with', () => {
    const run = report([entry('a', 5), entry('b', 7)], 'baseline');
    const kept = baselineOf(run);
    expect(kept.scores.a).toEqual({ score: 5, passes: false, styleOk: true });
    const back = baselineReport(kept);
    expect(compareReports(back, run).fellBelow).toEqual([]);
  });
});

describe("Richard's marks", () => {
  it('keeps ok or not, with a note, beside the report, and says how the judge agrees', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marks-'));
    let marks = withMark(readMarks(dir), 'a', 'ok', undefined, 't');
    marks = withMark(marks, 'b', 'not', ' legs in a row ', 't');
    writeMarks(dir, marks);
    expect(readMarks(dir)).toEqual({
      a: { ok: true, at: 't' },
      b: { ok: false, note: 'legs in a row', at: 't' },
    });
    expect(() => withMark(marks, 'c', 'maybe', undefined)).toThrow();
    const run = report([entry('a', 9), entry('b', 9)]);
    expect(agreement(run, readMarks(dir))).toEqual({ marked: 2, agree: 0.5 });
  });
});

describe('the contact sheet', () => {
  it('shows every brief with its score, its checks, the judge and the mark', () => {
    const run = report([
      entry('horse', 6.5, {
        files: { card: 'horse/card.png', stage: 'horse/stage.png' },
        checks: {
          style: { ok: false, notes: ['the outline is 0.5'] },
          clean: { ok: true, notes: [] },
        },
        verdict: {
          sees: 'a horse head-on',
          recognisable: 8,
          anatomy: 4,
          face: 7,
          change: null,
          same: null,
          place: null,
          problems: ['Draw her side-on'],
        },
      }),
    ]);
    const html = contactSheetHtml(run, {
      against: report([entry('horse', 5)], 'before'),
      marks: { horse: { ok: false, note: 'legs <in> a row', at: 't' } },
    });
    expect(html).toContain('horse/card.png');
    expect(html).toContain('Draw her side-on');
    expect(html).toContain('the outline is 0.5');
    expect(html).toContain('+1.5 (was 5)');
    expect(html).toContain('legs &lt;in&gt; a row');
  });
});

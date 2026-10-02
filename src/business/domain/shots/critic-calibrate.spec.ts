import {
  aucOf,
  calibrationMarkdown,
  calibrationOf,
  sheetScore,
  spreadOf,
  type CalibrationSheet,
} from './critic-calibrate';

const sheet = (
  group: string,
  source: string,
  score: number,
  more: Partial<CalibrationSheet['scores']> = {},
): CalibrationSheet => ({
  group,
  source,
  sheet: `${source}-${score}.jpg`,
  scores: {
    clarity: score,
    readability: score,
    composition: score,
    motion: score,
    depth: score,
    truth: score,
    polish: score,
    ...more,
  },
  costUsd: 0.01,
});

describe('the calibration sums', () => {
  it('spreads a list: mean, median, least and most', () => {
    expect(spreadOf([8, 9, 7, 10])).toEqual({
      n: 4,
      mean: 8.5,
      median: 8.5,
      min: 7,
      max: 10,
    });
    expect(spreadOf([3])).toEqual({ n: 1, mean: 3, median: 3, min: 3, max: 3 });
    expect(spreadOf([])).toBeNull();
  });

  it('scores a sheet by the mean of its axes, the hook left out', () => {
    expect(sheetScore(sheet('refs', 'vox', 8, { hook: 2 }))).toBe(8);
    expect(sheetScore({ scores: { clarity: 9, motion: 6 } })).toBe(7.5);
    expect(sheetScore({ scores: {} })).toBeNull();
  });

  it('says how often one group outscores another, a tie counting half', () => {
    expect(aucOf([9, 8.5], [5, 6])).toBe(1);
    expect(aucOf([5, 6], [9, 8.5])).toBe(0);
    expect(aucOf([7, 7], [7, 7])).toBe(0.5);
    expect(aucOf([9, 6], [7])).toBe(0.5);
    expect(aucOf([], [7])).toBeNull();
  });

  it('calibrates a run: each group by axis, the others against the references, and whether they land in the band', () => {
    const c = calibrationOf(
      [
        sheet('refs', 'vox', 8.5),
        sheet('refs', 'vox', 9),
        sheet('refs', 'economist', 8),
        sheet('before', 'regional-turn', 3),
        sheet('before', 'jet', 5, { motion: 2 }),
        sheet('after', 'regional-turn', 7),
      ],
      ['refs', 'before', 'after'],
    );
    expect(c.groups.map((g) => [g.group, g.sheets])).toEqual([
      ['refs', 3],
      ['before', 2],
      ['after', 1],
    ]);
    const refs = c.groups[0];
    expect(refs.overall).toEqual({
      n: 3,
      mean: 8.5,
      median: 8.5,
      min: 8,
      max: 9,
    });
    expect(refs.passing).toBe(1);
    expect(refs.sources).toEqual({ vox: 8.75, economist: 8 });
    expect(refs.costUsd).toBe(0.03);
    const before = c.against.find((a) => a.group === 'before')!;
    expect(before.auc).toBe(1);
    expect(before.gap.clarity).toBe(4.5);
    expect(before.gap.motion).toBe(6);
    expect(c.against.find((a) => a.group === 'after')!.overallGap).toBe(1.5);
    expect(c.refsInBand).toBe(true);
    const md = calibrationMarkdown(c);
    expect(md).toContain('| refs | 3 |');
    expect(md).toContain('| before |');
    expect(md).toContain(
      'References in the band (median own score 8 to 9.5): yes.',
    );
  });

  it('says when the references land outside the band', () => {
    const c = calibrationOf([sheet('refs', 'vox', 6), sheet('refs', 'vox', 7)]);
    expect(c.refsInBand).toBe(false);
    expect(c.against).toEqual([]);
  });
});

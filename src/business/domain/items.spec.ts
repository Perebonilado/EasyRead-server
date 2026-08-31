import {
  balanceAnswerPositions,
  inspectItem,
  isBroken,
  itemStats,
  siftItems,
  type DraftItem,
} from './items';

const mcq = (over: Partial<DraftItem> = {}): DraftItem => ({
  kind: 'mcq',
  stem: 'What drives thermohaline circulation?',
  options: ['Density gradients', 'Solar wind', 'Tidal drag', 'Plate motion'],
  correctIndex: 0,
  explanation: 'Differences in temperature and salinity change water density.',
  hint: null,
  topicTitle: 'Ocean circulation',
  ...over,
});

describe('inspectItem', () => {
  it('passes a well-formed question', () => {
    expect(inspectItem(mcq())).toBeNull();
  });

  it('rejects a correct answer that is conspicuously the longest', () => {
    const reason = inspectItem(
      mcq({
        options: [
          'Differences in water density caused by temperature and salinity, which drive deep currents worldwide',
          'Solar wind',
          'Tidal drag',
          'Plate motion',
        ],
      }),
    );
    // The single most exploited cue in multiple choice.
    expect(reason).toMatch(/longer/);
  });

  it('tolerates a slightly longer answer, which gives nothing away', () => {
    // 1.7x the median, but only seven characters: no student reads that as
    // a cue, and rejecting it would throw away good questions.
    expect(
      inspectItem(
        mcq({
          options: [
            'Density gradients',
            'Solar wind',
            'Tidal drag',
            'Plate motion',
          ],
        }),
      ),
    ).toBeNull();
  });

  it('allows a long correct answer when the distractors are long too', () => {
    expect(
      inspectItem(
        mcq({
          options: [
            'Differences in water density caused by temperature and salinity',
            'Pressure from solar wind acting on the upper ocean layers',
            'Drag exerted by tidal forces along continental shelves',
            'Slow motion of tectonic plates beneath the ocean basins',
          ],
        }),
      ),
    ).toBeNull();
  });

  it('rejects the give-away options', () => {
    expect(
      inspectItem(mcq({ options: ['A', 'B', 'C', 'All of the above'] })),
    ).toMatch(/all of the above/i);
  });

  it('rejects duplicate options, however they are cased or spaced', () => {
    expect(
      inspectItem(
        mcq({
          options: ['Density gradients', 'density  gradients.', 'C', 'D'],
        }),
      ),
    ).toMatch(/duplicate/);
  });

  it('rejects an answer key pointing outside the options', () => {
    expect(inspectItem(mcq({ correctIndex: 9 }))).toMatch(/not one of/);
  });

  it('rejects blank stems, blank options and missing explanations', () => {
    expect(inspectItem(mcq({ stem: '   ' }))).toMatch(/empty stem/);
    expect(inspectItem(mcq({ options: ['A', '  ', 'C', 'D'] }))).toMatch(
      /blank option/,
    );
    expect(inspectItem(mcq({ explanation: '' }))).toMatch(/explanation/);
  });

  it('holds flashcards to their own shape: exactly one answer', () => {
    const card = mcq({ kind: 'flashcard', options: ['Density gradients'] });
    expect(inspectItem(card)).toBeNull();
    expect(inspectItem({ ...card, options: [] })).toMatch(/one answer/);
    expect(inspectItem({ ...card, options: ['a', 'b'] })).toMatch(/one answer/);
  });

  it('exempts true/false from the length rule, which cannot apply', () => {
    expect(
      inspectItem(
        mcq({
          kind: 'true_false',
          options: ['True, because density drives it', 'False'],
          correctIndex: 0,
        }),
      ),
    ).toBeNull();
  });
});

describe('siftItems', () => {
  it('keeps the sound ones and says why the rest went', () => {
    const { kept, rejected } = siftItems([
      mcq(),
      mcq({ stem: 'Second question?', correctIndex: 7 }),
      mcq({ stem: 'Third question?' }),
    ]);

    expect(kept).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/not one of/);
  });

  it('drops a repeat of a question already in the batch', () => {
    const { kept, rejected } = siftItems([
      mcq(),
      mcq({ stem: 'What drives thermohaline circulation?  ' }),
    ]);
    expect(kept).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicate question/);
  });

  it('spreads correct answers across positions instead of clustering', () => {
    const batch = Array.from({ length: 8 }, (_, i) =>
      mcq({ stem: `Question ${i}?`, correctIndex: 0 }),
    );
    const { kept } = siftItems(batch);

    const positions = new Set(kept.map((item) => item.correctIndex));
    // All eight arrived at position 0; they must not all still be there.
    expect(positions.size).toBeGreaterThan(1);
  });

  it('keeps the right answer right while moving it', () => {
    const batch = Array.from({ length: 4 }, (_, i) =>
      mcq({ stem: `Question ${i}?`, correctIndex: 0 }),
    );
    for (const item of balanceAnswerPositions(batch)) {
      expect(item.options[item.correctIndex]).toBe('Density gradients');
      expect(item.options).toHaveLength(4);
    }
  });
});

describe('itemStats', () => {
  const responses = (spec: [boolean, number][]) =>
    spec.map(([correct, overallScore]) => ({ correct, overallScore }));

  it('reports difficulty as the proportion who got it right', () => {
    const stats = itemStats(
      responses([
        [true, 1],
        [true, 1],
        [false, 0],
      ]),
    );
    expect(stats.pValue).toBeCloseTo(2 / 3);
  });

  it('withholds discrimination until there is enough evidence', () => {
    expect(
      itemStats(
        responses([
          [true, 1],
          [false, 0],
        ]),
      ).discrimination,
    ).toBeNull();
    expect(itemStats([]).discrimination).toBeNull();
  });

  it('scores an item positively when strong students get it right', () => {
    const stats = itemStats(
      responses([
        [true, 0.9],
        [true, 0.85],
        [true, 0.8],
        [true, 0.75],
        [false, 0.3],
        [false, 0.25],
        [false, 0.2],
        [false, 0.1],
      ]),
    );
    expect(stats.discrimination).not.toBeNull();
    expect(stats.discrimination!).toBeGreaterThan(0);
    expect(isBroken(stats)).toBe(false);
  });

  it('flags a broken item: the students who know the material fail it', () => {
    const stats = itemStats(
      responses([
        [false, 0.9],
        [false, 0.85],
        [false, 0.8],
        [false, 0.75],
        [true, 0.3],
        [true, 0.25],
        [true, 0.2],
        [true, 0.1],
      ]),
    );
    // Almost always a wrong answer key or a misleading stem.
    expect(stats.discrimination!).toBeLessThan(0);
    expect(isBroken(stats)).toBe(true);
  });

  it('never calls an item broken on thin evidence', () => {
    const stats = itemStats(
      responses([
        [false, 0.9],
        [true, 0.1],
      ]),
    );
    expect(isBroken(stats)).toBe(false);
  });

  it('stays quiet when everyone scored the same overall', () => {
    const stats = itemStats(
      responses([
        [true, 0.5],
        [false, 0.5],
        [true, 0.5],
        [false, 0.5],
        [true, 0.5],
        [false, 0.5],
        [true, 0.5],
        [false, 0.5],
      ]),
    );
    expect(stats.discrimination).toBeNull();
  });
});

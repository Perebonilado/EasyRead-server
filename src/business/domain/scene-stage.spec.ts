import {
  STAGE_RECIPES,
  describeStage,
  levelIn,
  settleStage,
} from './scene-stage';

describe('the level a document names', () => {
  it('reads classes, years and levels as schools name them', () => {
    const cases: [string, string][] = [
      ['Basic Science for Primary 4, Term 2', 'early'],
      ['Mathematics: Basic 5 revision', 'early'],
      ['Common Entrance practice questions', 'early'],
      ['JSS 2 Basic Science, first term', 'middle'],
      ['Chemistry for SS 3 students', 'middle'],
      ['Senior secondary Physics', 'middle'],
      ['BCH 201 lecture notes: enzymes. 200 Level, first semester', 'higher'],
      ['Anatomy for 100 Level students', 'higher'],
      ['Course code: GST 101. Credit units: 2', 'higher'],
      ['Practice Note on the registration of mortgages', 'professional'],
      ['Nigerian Law School: Bar Part II property law', 'professional'],
    ];
    for (const [text, stage] of cases)
      expect([text, levelIn(text)?.stage]).toEqual([text, stage]);
  });

  it('needs two signs where one could mean something else', () => {
    // A tumour has grades, a study has years.
    expect(levelIn('A grade 4 glioma in year 10 of the study')).toBeNull();
    expect(levelIn('Grade 4 reading, for primary school')).toMatchObject({
      stage: 'early',
    });
    // An exam and the kind of school together.
    expect(
      levelIn('Revision for WAEC: secondary school chemistry'),
    ).toMatchObject({ stage: 'middle' });
    expect(levelIn('WAEC')).toBeNull();
    // Two of a course's words.
    expect(levelIn('Lecture notes, Department of Biochemistry')).toMatchObject({
      stage: 'higher',
    });
  });

  it('names nothing when it says nothing, or says two stages as strongly', () => {
    expect(levelIn('The cell is the unit of life.')).toBeNull();
    expect(levelIn('Primary 4 and JSS 2 together')).toBeNull();
    expect(levelIn('SS 316 stainless steel')).toBeNull();
  });

  it('keeps the words that told it', () => {
    expect(levelIn('JSS 2 Basic Science')!.words).toEqual(['JSS 2']);
  });
});

describe("settling a document's stage", () => {
  const named = { stage: 'middle' as const, words: ['JSS 2'] };

  it('lets the level the document names win over a reading that says otherwise', () => {
    expect(
      settleStage({ stage: 'higher', sure: 'likely', why: 'dense' }, named),
    ).toEqual({ stage: 'middle', why: 'it says "JSS 2"' });
  });

  it("takes the reader's stage when it is at least likely, and none when unsure", () => {
    expect(
      settleStage(
        { stage: 'higher', sure: 'likely', why: 'course notes' },
        null,
      ),
    ).toEqual({ stage: 'higher', why: 'course notes' });
    expect(
      settleStage({ stage: 'higher', sure: 'unsure', why: 'could be' }, null),
    ).toEqual({ stage: null, why: 'could be' });
    // Unsure, but the document names it.
    expect(
      settleStage({ stage: null, sure: 'unsure', why: '' }, named).stage,
    ).toBe('middle');
  });
});

describe("each stage's recipe", () => {
  it('asks less of a child and more of a student, never less clarity', () => {
    const { early, middle, higher } = STAGE_RECIPES;
    expect(early.sentence[1]).toBeLessThan(middle.sentence[1]);
    expect(middle.sentence[1]).toBeLessThan(higher.sentence[1]);
    expect(early.spoken[1]).toBeLessThan(higher.spoken[1]);
    expect(early.labels).toBeLessThan(higher.labels);
    expect(early.pace).toBeLessThan(higher.pace);
    expect(higher.explain).toContain('Plain words first');
  });

  it('tells the writer whom it teaches and how, and nothing when the stage is not known', () => {
    const told = describeStage('early');
    expect(told).toContain('a child at primary school');
    expect(told).toContain('Sentences of 4 to 12 words');
    expect(told).toContain('80 to 150 spoken words');
    expect(describeStage(null)).toBe('');
  });
});

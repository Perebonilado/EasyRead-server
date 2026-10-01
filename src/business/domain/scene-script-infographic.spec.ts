import {
  INFOGRAPHIC_KINDS,
  STILL_WORDS,
  WORDS_A_STAGE,
  fewStageChanges,
  isInfographicThing,
  mendScript,
  pageGives,
  partNames,
  quietStretches,
  stageWordsFor,
  stateNames,
  stillWordsFor,
  type SceneScript,
  type SceneScriptDraft,
} from './scene-script';

type Cast = SceneScriptDraft['cast'][number];

const NONE = {
  brief: null,
  motion: null,
  parts: null,
  states: null,
  shape: null,
  value: null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  timeline: null,
  chart: null,
} as const;

const thing = (
  id: string,
  kind: Cast['kind'],
  fields: Partial<Cast>,
): Cast => ({
  ...NONE,
  id,
  kind,
  name: id,
  ...fields,
});

const beat = (say: string) => ({
  say,
  pause: 'short' as const,
  delivery: 'explain' as const,
  speaker: null,
  music: null,
  energy: null,
});

/** A draft that shows each thing on its own sentence: three at least, as a page has. */
function draftOf(cast: Cast[], says?: string[]): SceneScriptDraft {
  const own = cast.map((c) => `Here is the ${c.id} we talk about now.`);
  const lines =
    says ??
    [...own, 'It matters for what comes next.', 'Keep it in mind.'].slice(
      0,
      Math.max(3, own.length),
    );
  return {
    fit: 'good',
    fitReason: null,
    title: 'Kinds',
    mood: 'curious',
    beats: lines.map(beat),
    cast,
    steps: cast.map((c, i) => ({
      beat: Math.min(i, lines.length - 1),
      phrase: lines[Math.min(i, lines.length - 1)]
        .split(' ')
        .slice(0, 2)
        .join(' '),
      layout: 'one',
      show: [c.id],
      arrows: [],
      effects: null,
    })),
  };
}

describe('the infographic kinds in a script', () => {
  const cast: Cast[] = [
    thing('population', 'counter', {
      counter: {
        value: 45,
        unit: 'million',
        prefix: 'about',
        label: 'people',
        then: null,
      },
      source: 'UN',
      colour: 'chart2',
    }),
    thing('troops', 'icons', {
      icons: {
        icon: null,
        count: 45000,
        per: null,
        unit: 'soldiers',
        label: null,
        highlight: null,
        highlightLabel: null,
      },
      source: 'War Office',
    }),
    thing('premier', 'namecard', {
      namecard: { name: 'Obafemi Awolowo', role: 'Premier', line: null },
    }),
    thing('dates', 'calendar', {
      calendar: {
        calendars: [{ label: null, dates: ['1957', '1959'] }],
        merge: null,
      },
    }),
    thing('house', 'seats', {
      seats: {
        layout: 'hemicycle',
        groups: [
          { name: 'NPC', seats: 134 },
          { name: 'AG', seats: 73 },
        ],
        majority: true,
        label: null,
      },
      source: 'Post, 1963',
    }),
    thing('question', 'strike', {
      strike: { from: 'IF', to: 'HOW', label: null },
    }),
    thing('money', 'transfer', {
      transfer: {
        from: 'South',
        to: 'North',
        token: 'coin',
        label: null,
        shut: true,
      },
    }),
    thing('report', 'document', {
      document: {
        style: 'paper',
        title: 'The Report',
        headline: null,
        stamp: 'Not recommended',
      },
    }),
    thing('rule', 'split', {
      split: {
        sides: [
          { label: 'Direct', items: ['Officers'], icon: null },
          { label: 'Indirect', items: ['Emirs'], icon: 'crown' },
        ],
        change: null,
      },
    }),
  ];

  it('makes each kind sound, as a thing code draws, with its parts and later looks', () => {
    const { script, problems } = mendScript(draftOf(cast));
    expect(problems).toEqual([]);
    expect(script.cast.map((c) => c.kind)).toEqual([...INFOGRAPHIC_KINDS]);
    expect(script.cast.every(isInfographicThing)).toBe(true);
    const byId = new Map(script.cast.map((c) => [c.id, c]));
    expect(partNames(byId.get('population')!)).toEqual([
      'number',
      'label',
      'source',
    ]);
    // A chamber's caption is its name, drawn under its key.
    expect(partNames(byId.get('house')!)).toEqual([
      'NPC',
      'AG',
      'majority',
      'label',
      'source',
    ]);
    expect(stateNames(byId.get('dates')!)).toEqual(['1959', 'page 2']);
    expect(stateNames(byId.get('question')!)).toEqual([
      'replaced',
      'HOW',
      'new',
    ]);
    expect(stateNames(byId.get('money')!)).toEqual([
      'shut',
      'closed',
      'stopped',
    ]);
    expect(stateNames(byId.get('report')!)).toEqual([
      'stamp',
      'Not recommended',
    ]);
    const counter = byId.get('population')!;
    expect(counter.kind === 'counter' && counter.counter).toMatchObject({
      colour: 'chart2',
      source: 'UN',
    });
  });

  it('sets in type what it cannot read, silently', () => {
    const { script, problems, mended } = mendScript(
      draftOf([
        thing('nothing', 'counter', {
          counter: {
            value: 'many',
            unit: null,
            prefix: null,
            label: null,
            then: null,
          },
        }),
        thing('lonely', 'split', {
          split: {
            sides: [{ label: 'One', items: null, icon: null }],
            change: null,
          },
        }),
      ]),
    );
    expect(script.cast.map((c) => c.kind)).toEqual(['words', 'words']);
    expect(problems).toEqual([]);
    expect(mended.some((m) => m.includes('a counter with no number'))).toBe(
      true,
    );
  });

  it('holds an unsourced number to the page, and a sourced one to its source', () => {
    const page = 'In 1952 about 30 million people lived there.';
    const unsourced = mendScript(
      draftOf([
        thing('n', 'counter', {
          counter: {
            value: 45,
            unit: 'million',
            prefix: null,
            label: null,
            then: null,
          },
        }),
      ]),
      { material: page },
    );
    expect(unsourced.problems).toEqual([
      'The counter "n" shows numbers the page does not give: 45. Show only the page\'s own numbers, or give the source they come from.',
    ]);
    const given = mendScript(
      draftOf([
        thing('n', 'counter', {
          counter: {
            value: 30,
            unit: 'million',
            prefix: null,
            label: null,
            then: null,
          },
        }),
      ]),
      { material: page },
    );
    expect(given.problems).toEqual([]);
    const sourced = mendScript(
      draftOf([
        thing('n', 'counter', {
          counter: {
            value: 45,
            unit: 'million',
            prefix: null,
            label: null,
            then: null,
          },
          source: 'Census',
        }),
      ]),
      { material: page },
    );
    expect(sourced.problems).toEqual([]);
    expect(pageGives('45,000,000 people', 45, 'million')).toBe(true);
    expect(pageGives('45 people', 46)).toBe(false);
  });

  it("puts a show's colours on what it names", () => {
    const { script } = mendScript(draftOf(cast), {
      palette: [
        { thing: 'NPC', token: 'chart4' },
        { thing: 'Obafemi Awolowo', token: 'chart5' },
      ],
    });
    const byId = new Map(script.cast.map((c) => [c.id, c]));
    const house = byId.get('house')!;
    expect(
      house.kind === 'seats' && house.seats.groups.map((g) => g.colour),
    ).toEqual(['chart4', 'chart0']);
    const card = byId.get('premier')!;
    expect(card.kind === 'namecard' && card.namecard.colour).toBe('chart5');
  });

  it('keeps a chart that names its source from being held to the page, and its source', () => {
    const { script, problems } = mendScript(
      draftOf([
        thing('c', 'chart', {
          chart: {
            kind: 'bar',
            unit: null,
            bars: [
              { label: 'A', value: 9 },
              { label: 'B', value: 7 },
            ],
          },
          source: 'Census 2011',
          colour: 'chart1',
        }),
      ]),
      { material: 'Nothing here gives numbers.' },
    );
    expect(problems).toEqual([]);
    const chart = script.cast[0];
    expect(chart.kind === 'chart' && chart.chart).toMatchObject({
      source: 'Census 2011',
      colour: 'chart1',
    });
  });
});

describe("an editor's episode's pace", () => {
  const words = (n: number) =>
    Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

  /** One thing on the stage, then the stage left alone for the rest. */
  const still = (
    says: string[],
    hold?: { beat?: number; step?: boolean },
  ): SceneScript => {
    const draft = draftOf(
      [
        thing('t', 'strike', {
          strike: { from: 'IF', to: 'HOW', label: null },
        }),
      ],
      says,
    );
    draft.pace = 'infographic';
    if (hold?.beat !== undefined) draft.beats[hold.beat].hold = true;
    if (hold?.step) draft.steps[0].hold = true;
    return mendScript(draft).script;
  };

  it('is carried from the draft, and only when code says', () => {
    expect(still([words(10)]).pace).toBe('infographic');
    const plain = mendScript(
      draftOf([
        thing('t', 'strike', {
          strike: { from: 'IF', to: 'HOW', label: null },
        }),
      ]),
    );
    expect(plain.script.pace).toBeUndefined();
  });

  it("asks for something new about every five seconds, at its audience's pace", () => {
    const paced = still([words(20)]);
    expect(stillWordsFor(paced)).toBe(13);
    expect(stillWordsFor(paced, 'early')).toBeLessThan(13);
    expect(stillWordsFor({})).toBe(STILL_WORDS);
    expect(stageWordsFor({})).toBe(WORDS_A_STAGE);
    expect(quietStretches(paced, stillWordsFor(paced))).toHaveLength(1);
    // A lesson's thirty words are as they were.
    expect(quietStretches(paced, STILL_WORDS)).toEqual([]);
  });

  it('lets a hold stand still: a held sentence, or a held step', () => {
    const heldBeat = still([words(4), words(20)], { beat: 1 });
    expect(heldBeat.beats[1].hold).toBe(true);
    expect(quietStretches(heldBeat, stillWordsFor(heldBeat))).toEqual([]);
    const heldStep = still([words(24)], { step: true });
    expect(heldStep.steps[0].hold).toBe(true);
    expect(quietStretches(heldStep, stillWordsFor(heldStep))).toEqual([]);
  });

  it('wants the stage itself to change about every six seconds', () => {
    const paced = still([words(20), words(20)]);
    expect(fewStageChanges(paced, stageWordsFor(paced))).toHaveLength(1);
    expect(fewStageChanges(paced)).toEqual([]);
  });
});

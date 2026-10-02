import { KIT_IDS } from '../kit/registry';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import {
  calendarShot,
  checkPlan,
  mendPlan,
  mostShots,
  planOf,
  safeShot,
  stageWords,
  WHOLE_SET,
} from './shot-check';
import { sceneNarration } from './shot-phrases';
import { buildRegistry, registryOf } from './shot-registry';
import type { PlanShot, RegistryEntry, ShotPlan } from './types';

const registry = buildRegistry({
  rows: WALL_ROWS,
  research: WALL_RESEARCH,
  world: WALL_WORLD,
});
const narration = sceneNarration(WALL_ROWS);
const codes = (plan: ShotPlan) =>
  checkPlan(plan, narration, registry).map((p) => `${p.shot}:${p.code}`);

/** A shot, every field present. */
const shot = (
  s: Partial<PlanShot> & Pick<PlanShot, 'on' | 'set'>,
): PlanShot => ({
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  ...s,
});

/**
 * A good plan of the Wall's lines: the map, the border's length, Reagan's
 * words, the map on East Germany while the voice is there, and the year
 * the Wall opened (the map is only for where: never on over a line that
 * names no place).
 */
const good = (): ShotPlan => ({
  shots: [
    shot({
      on: 'In 1961',
      set: { kind: 'map', tilt: 'flat' },
      info: [
        { recipe: 'pin', target: 'place:Berlin', on: 'Berlin' },
        { recipe: 'seam', target: 'seam:inner border', on: 'cut in two' },
      ],
      camera: [
        { move: 'establish', on: 'In 1961' },
        { move: 'push', target: 'place:Berlin', on: 'Berlin', amount: 'small' },
      ],
      life: ['cloud-shadows'],
      focal: 'place:Berlin',
    }),
    shot({
      on: 'The inner border',
      set: {
        kind: 'chart',
        chart: {
          kind: 'counter',
          spec: {
            value: 1393,
            unit: 'km',
            prefix: null,
            label: 'inner border',
            then: null,
          },
        },
      },
      info: [
        {
          recipe: 'count',
          target: 'number:Length of the inner border',
          on: '1,393 kilometres',
          value: 1393,
          unit: 'km',
        },
      ],
      focal: WHOLE_SET,
    }),
    shot({
      on: 'In 1987',
      set: {
        kind: 'chart',
        chart: {
          kind: 'quote',
          spec: {
            text: 'Mr. Gorbachev, tear down this wall!',
            speaker: 'Ronald Reagan',
            when: '12 June 1987',
          },
        },
      },
      info: [{ recipe: 'mark', target: 'part:speaker', on: 'Reagan' }],
      camera: [
        {
          move: 'push',
          target: 'part:speaker',
          on: 'Tear down this wall',
          amount: 'small',
        },
      ],
      life: ['grain'],
      focal: WHOLE_SET,
    }),
    shot({
      on: 'East Germany’s leader',
      set: { kind: 'map', tilt: 'flat' },
      info: [
        {
          recipe: 'fill',
          target: 'region:East Germany',
          on: 'East Germany’s leader',
        },
        {
          recipe: 'label',
          target: 'region:East Germany',
          text: 'East Germany',
          on: 'held on',
        },
      ],
      focal: 'region:East Germany',
    }),
    shot({
      on: 'Two years later',
      set: {
        kind: 'chart',
        chart: {
          kind: 'calendar',
          spec: {
            calendars: [{ label: 'Wall opens', dates: ['1989'] }],
            merge: null,
          },
        },
      },
      camera: [{ move: 'establish', on: 'Two years later' }],
      focal: WHOLE_SET,
    }),
  ],
});

describe("the board's answer made sound (planOf)", () => {
  const messy = {
    shots: [
      {
        on: '“In 1961,”',
        set: { kind: 'Atlas', tilt: 'tilted', terrain: true },
        info: [
          {
            recipe: 'Highlight',
            target: 'Berlin',
            on: 'Berlin',
            text: 'ignored',
          },
          {
            recipe: 'label',
            target: 'place:Berlin',
            on: 'Berlin',
            text: 'The divided city of Berlin',
          },
          { recipe: 'glow', target: 'place:Berlin', on: 'Berlin' },
          { recipe: 'drop', target: 'place:Berlin', on: 'Berlin' },
          { recipe: 'pin', target: 'place:Berlin', on: 'Berlin' },
          { recipe: 'mark', target: 'place:Berlin', on: 'overnight' },
        ],
        camera: [
          {
            move: 'zoom in',
            target: 'place:Berlin',
            on: 'Berlin',
            amount: 'slight',
          },
          { move: 'pan', on: 'cut in two' },
          { move: 'pull', on: 'overnight' },
        ],
        life: ['Cloud shadows', 'cloud-shadows', 'sparkles', 'drift', 'flags'],
        actors: [{ id: 'teen', kit: 'people.student', place: 'place:Berlin' }],
        join: 'fade',
      },
      {
        on: 'The inner border',
        set: {
          kind: 'timeline',
          timeline: [
            { when: '1961', name: 'Wall' },
            { when: '1989', name: 'Opens' },
          ],
        },
        info: [],
      },
      { on: 'nowhere', set: { kind: 'hologram' } },
      { on: '', set: { kind: 'map' } },
      { on: 'he said', set: { kind: 'map' } },
      { on: 'held on', set: { kind: 'map' } },
      { on: 'the Wall opened', set: { kind: 'map' } },
    ],
  };

  it('reads each closed-list word as the nearest on its list, and drops what means nothing allowed', () => {
    const plan = planOf(messy, narration);
    const first = plan.shots[0];
    expect(first.set).toEqual({ kind: 'map', tilt: 'tilted', terrain: true });
    expect(first.on).toBe('In 1961,');
    expect(first.info.map((i) => i.recipe)).toEqual([
      'mark',
      'label',
      'pin',
      'pin',
    ]);
    expect(first.camera).toEqual([
      { move: 'push', target: 'place:Berlin', on: 'Berlin', amount: 'small' },
      { move: 'travel', on: 'cut in two' },
    ]);
    expect(first.life).toEqual(['cloud-shadows', 'drift']);
    expect(first.join).toBe('dissolve');
  });

  it('keeps words on the stage short and only where a label puts them', () => {
    const first = planOf(messy, narration).shots[0];
    // A label is three words at most, ending well; another recipe's words are dropped.
    expect(first.info[0].text).toBeUndefined();
    expect(first.info[1].text).toBe('The divided city');
  });

  it('plans no actors while the kit has none, and reads a chart kind named as a set', () => {
    const plan = planOf(messy, narration);
    expect(plan.shots[0].actors).toEqual([]);
    expect(plan.shots[1].set).toEqual({
      kind: 'chart',
      chart: {
        kind: 'timeline',
        spec: {
          events: [
            { when: '1961', name: 'Wall' },
            { when: '1989', name: 'Opens' },
          ],
        },
      },
    });
  });

  it("caps the shots at twice the scene's share, dropping a set it does not know", () => {
    // Twelve a minute is the mend's cap, which keeps what the pace needs;
    // the answer is read up to twice that.
    expect(mostShots(narration)).toBe(4);
    const plan = planOf(messy, narration);
    expect(plan.shots.map((s) => s.on)).toEqual([
      'In 1961,',
      'The inner border',
      'he said',
      'held on',
      'the Wall opened',
    ]);
    const more = { shots: [...messy.shots, ...messy.shots] };
    expect(planOf(more, narration).shots).toHaveLength(8);
  });

  it('is the same every time it reads the same answer', () => {
    expect(planOf(messy, narration)).toEqual(planOf(messy, narration));
  });
});

describe("the board's plan checked (checkPlan)", () => {
  it('finds nothing wrong with a good plan', () => {
    expect(codes(good())).toEqual([]);
  });

  it('names a target not in the registry', () => {
    const plan = good();
    plan.shots[0].info.push({
      recipe: 'pin',
      target: 'place:Checkpoint Charlie cafe',
      on: 'Berlin',
    });
    expect(codes(plan)).toContain('0:unknown-target');
  });

  it('names a phrase the voice never says, and shots out of the order of their words', () => {
    const plan = good();
    plan.shots[1].on = 'the border was long';
    expect(codes(plan)).toContain('1:phrase-missing');
    const swapped = good();
    swapped.shots = [swapped.shots[0], swapped.shots[2], swapped.shots[1]];
    expect(codes(swapped)).toContain('2:out-of-order');
  });

  it('names words on their own, standing in for a place, as a word card', () => {
    const floating = good();
    floating.shots[0].info.push({
      recipe: 'label',
      text: 'Berlin',
      on: 'Berlin',
    });
    expect(codes(floating)).toContain('0:word-card');
    const card = good();
    card.shots[1].set = {
      kind: 'chart',
      chart: {
        kind: 'document',
        spec: { style: 'paper', title: 'Berlin', headline: null, stamp: null },
      },
    };
    card.shots[1].info = [];
    expect(codes(card)).toContain('1:word-card');
  });

  it('names a person shown with no portrait, a drawn set named after a real place, and a number nobody gave', () => {
    const plan = good();
    plan.shots[2].set = { kind: 'portrait', person: 'person:Ronald Reagan' };
    plan.shots[2].info = [];
    plan.shots[1].set = {
      kind: 'chart',
      chart: {
        kind: 'counter',
        spec: {
          value: 2000,
          unit: 'km',
          prefix: null,
          label: null,
          then: null,
        },
      },
    };
    plan.shots[1].info = [];
    plan.shots[0].set = {
      kind: 'set',
      set: { land: 'city', time: 'night', era: 'Berlin, 1961' },
    };
    plan.shots[0].info = [];
    plan.shots[0].camera = [];
    plan.shots[0].focal = WHOLE_SET;
    const found = codes(plan);
    expect(found).toContain('2:person-unseen');
    expect(found).toContain('1:untrue-number');
    expect(found).toContain('0:named-set');
  });

  it("names a quote whose words are no one's own, the narrator's included", () => {
    const plan = good();
    plan.shots[2].set = {
      kind: 'chart',
      chart: {
        kind: 'quote',
        spec: { text: 'Tear down this wall', speaker: null, when: null },
      },
    };
    expect(codes(plan)).not.toContain('2:untrue-quote');
    plan.shots[2].set.chart.spec.text =
      'The inner border ran for 1,393 kilometres';
    expect(codes(plan)).toContain('2:untrue-quote');
  });

  it('names a pin on a place that is not on the map', () => {
    const plan = good();
    plan.shots[0].info.push({
      recipe: 'pin',
      target: 'place:Bernauer Strasse',
      on: 'overnight',
    });
    expect(codes(plan)).toContain('0:wrong-target');
  });

  it('counts the words on the stage and the words of each label', () => {
    const plan = good();
    plan.shots[0].info.push(
      {
        recipe: 'label',
        target: 'place:Berlin',
        text: 'A city cut in two',
        on: 'Berlin',
      },
      {
        recipe: 'label',
        target: 'region:East Germany',
        text: 'The East',
        on: 'cut in two',
      },
      {
        recipe: 'label',
        target: 'region:West Germany',
        text: 'The West too',
        on: 'overnight',
      },
    );
    expect(stageWords(plan.shots[0])).toBe(10);
    const found = codes(plan);
    expect(found).toContain('0:too-many-words');
    expect(found).toContain('0:long-label');
  });

  it('asks for one subject the set shows', () => {
    const plan = good();
    delete plan.shots[0].focal;
    plan.shots[1].focal = 'place:Berlin';
    const found = codes(plan);
    expect(found).toContain('0:no-focal');
    expect(found).toContain('1:no-focal');
  });

  it('asks for no map in a show that has none', () => {
    const bare = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: null,
    });
    const plan: ShotPlan = {
      shots: [
        shot({
          on: 'In 1961',
          set: { kind: 'map' },
          camera: [{ move: 'establish', on: 'In 1961' }],
          focal: WHOLE_SET,
        }),
      ],
    };
    expect(checkPlan(plan, narration, bare).map((p) => p.code)).toContain(
      'no-map',
    );
    // A place it can pin makes the map: it is framed on what it shows.
    plan.shots[0].info = [
      { recipe: 'pin', target: 'place:Berlin', on: 'Berlin' },
    ];
    expect(checkPlan(plan, narration, bare).map((p) => p.code)).not.toContain(
      'no-map',
    );
  });
});

describe("the board's plan mended (mendPlan)", () => {
  const mend = (plan: ShotPlan) => mendPlan(plan, narration, registry);

  it('leaves a good plan as it was', () => {
    expect(mend(good())).toEqual(good());
  });

  it('drops a target not in the registry, with what it carried', () => {
    const plan = good();
    plan.shots[0].info.push({
      recipe: 'label',
      target: 'place:Checkpoint Charlie cafe',
      text: 'Cafe',
      on: 'Berlin',
    });
    plan.shots[0].camera[1].target = 'place:Nowhere';
    const mended = mend(plan);
    expect(mended.shots[0].info.map((i) => i.target)).toEqual([
      'place:Berlin',
      'seam:inner border',
    ]);
    expect(mended.shots[0].camera[1]).toEqual({
      move: 'push',
      on: 'Berlin',
      amount: 'small',
    });
  });

  it('writes names as the registry has them', () => {
    const plan = good();
    plan.shots[0].info[0].target = 'berlin';
    plan.shots[0].focal = 'Berlin';
    const mended = mend(plan);
    expect(mended.shots[0].info[0].target).toBe('place:Berlin');
    expect(mended.shots[0].focal).toBe('place:Berlin');
  });

  it('snaps a phrase to the words nearest it, and drops a shot whose words are nowhere', () => {
    const plan = good();
    plan.shots[1].on = 'The inner borders';
    plan.shots[1].info[0].on = '1393 km';
    plan.shots.push(
      shot({
        on: 'a sentence nobody says at all',
        set: { kind: 'map' },
        focal: WHOLE_SET,
      }),
    );
    const mended = mend(plan);
    expect(mended.shots).toHaveLength(5);
    expect(mended.shots[1].on).toBe('The inner border');
    // Not in its shot's words at all: on the shot's own words.
    expect(mended.shots[1].info[0].on).toBe('The inner border');
  });

  it('puts the shots in the order of their words, and the first on the first words', () => {
    const plan = good();
    plan.shots = [
      plan.shots[0],
      plan.shots[2],
      plan.shots[1],
      plan.shots[3],
      plan.shots[4],
    ];
    plan.shots[0].on = 'Berlin was cut';
    const mended = mend(plan);
    expect(mended.shots.map((s) => s.on)).toEqual([
      'In 1961, Berlin',
      'The inner border',
      'In 1987',
      'East Germany’s leader',
      'Two years later',
    ]);
    expect(codes(mended)).toEqual([]);
  });

  it('makes a phrase said twice long enough to be said once', () => {
    const plan = good();
    // "In" starts two lines: the second is meant, after the first shot.
    plan.shots[2].on = 'In';
    const mended = mend(plan);
    expect(mended.shots[2].on).toBe('In 1987');
  });

  it('shows a person with no portrait by their own words, and drops one with no trace', () => {
    const plan = good();
    plan.shots[2] = shot({
      on: 'In 1987',
      set: { kind: 'portrait', person: 'Reagan' },
      camera: [{ move: 'push', on: 'Reagan', amount: 'small' }],
      focal: 'person:Ronald Reagan',
    });
    const traced = mend(plan).shots[2];
    expect(traced.set).toEqual({
      kind: 'chart',
      chart: {
        kind: 'quote',
        spec: {
          text: 'Mr. Gorbachev, tear down this wall!',
          speaker: 'Ronald Reagan',
          when: null,
        },
      },
    });
    expect(traced.focal).toBe(WHOLE_SET);
    plan.shots[2].set = { kind: 'portrait', person: 'person:Erich Honecker' };
    expect(mend(plan).shots.map((s) => s.on)).toEqual([
      'In 1961',
      'The inner border',
      'East Germany’s leader',
      'Two years later',
    ]);
  });

  it("takes a quote's words from the claim it names, and drops a quote of no one's words", () => {
    const plan = good();
    plan.shots[2].set = {
      kind: 'chart',
      chart: {
        kind: 'quote',
        spec: {
          text: 'Gorbachev, open this gate',
          speaker: 'Ronald Reagan',
          when: null,
          claim: 'c3',
        },
      },
    };
    expect(mend(plan).shots[2].set).toMatchObject({
      chart: { spec: { text: 'Mr. Gorbachev, tear down this wall!' } },
    });
    delete plan.shots[2].set.chart.spec.claim;
    expect(mend(plan).shots.map((s) => s.on)).toEqual([
      'In 1961',
      'The inner border',
      'East Germany’s leader',
      'Two years later',
    ]);
  });

  it('takes a counter’s number from the research, and drops a chart of numbers nobody gave', () => {
    const plan = good();
    plan.shots[1].set = {
      kind: 'chart',
      chart: {
        kind: 'counter',
        spec: {
          value: 1400,
          unit: 'km',
          prefix: null,
          label: null,
          then: null,
        },
      },
    };
    plan.shots[1].info[0].value = 1400;
    const mended = mend(plan).shots[1];
    expect(mended.set).toMatchObject({
      chart: { spec: { value: 1393, unit: 'km' } },
    });
    expect(mended.info[0]).toMatchObject({ value: 1393, unit: 'km' });
    const bars = good();
    bars.shots[1].set = {
      kind: 'chart',
      chart: {
        kind: 'chart',
        spec: {
          kind: 'bar',
          unit: 'km',
          bars: [
            { label: 'East', value: 700 },
            { label: 'West', value: 693 },
          ],
        },
      },
    };
    bars.shots[1].info = [];
    expect(mend(bars).shots.map((s) => s.on)).toEqual([
      'In 1961',
      'In 1987',
      'East Germany’s leader',
      'Two years later',
    ]);
  });

  it('cuts the words on the stage to the budget: labels first, then the chart’s own', () => {
    const plan = good();
    plan.shots[0].info = [
      {
        recipe: 'label',
        target: 'place:Berlin',
        text: 'Berlin divided city',
        on: 'Berlin',
      },
      {
        recipe: 'label',
        target: 'region:East Germany',
        text: 'East Germany zone',
        on: 'cut in two',
      },
      {
        recipe: 'label',
        target: 'region:West Germany',
        text: 'West Germany zone',
        on: 'overnight',
      },
    ];
    const mended = mend(plan).shots[0];
    expect(stageWords(mended)).toBeLessThanOrEqual(8);
    expect(mended.info.map((i) => i.text)).toEqual([
      'Berlin divided city',
      'East Germany zone',
    ]);
  });

  it('makes a label name what it is on, never repeat the voice', () => {
    const plan = good();
    plan.shots[0].info.push(
      {
        recipe: 'label',
        target: 'region:East Germany',
        text: 'cut overnight',
        on: 'cut in two',
      },
      {
        recipe: 'label',
        target: 'place:Berlin',
        text: '1961',
        on: 'overnight',
      },
    );
    expect(codes(plan)).toContain('0:label-names');
    const mended = mend(plan).shots[0];
    // A year by itself names no place: the label names Berlin.
    expect(mended.info.slice(2).map((i) => i.text)).toEqual([
      'East Germany',
      'Berlin',
    ]);
    expect(codes(mend(plan))).toEqual([]);
  });

  it('sets a missing subject from what the set shows', () => {
    const plan = good();
    delete plan.shots[0].focal;
    delete plan.shots[2].focal;
    const mended = mend(plan);
    expect(mended.shots[0].focal).toBe('place:Berlin');
    expect(mended.shots[2].focal).toBe(WHOLE_SET);
  });

  it('turns blank paper and a drawn set named after a real place into no word card', () => {
    const plan = good();
    plan.shots[1].set = { kind: 'plain' };
    plan.shots[2].set = {
      kind: 'set',
      set: { land: 'city', time: 'night', era: 'Berlin, 1987' },
    };
    // Where code can draw a set: a kind of place, its real place's name gone.
    const mended = mendPlan(plan, narration, registry, { drawnSets: true });
    expect(mended.shots.map((s) => s.set.kind)).toEqual([
      'map',
      'set',
      'map',
      'chart',
    ]);
    expect(mended.shots[1].set).toEqual({
      kind: 'set',
      set: { land: 'city', time: 'night' },
    });
    // Two shots gone leave stretches for the board's pace (withPace) to fill.
    expect(codes(mended).filter((c) => !c.endsWith('gap-long'))).toEqual([]);
    // With drawn sets turned off, a drawn set goes, for a picture that can
    // be drawn: its year's calendar, never the map carried on over words
    // that name no place.
    expect(
      mendPlan(plan, narration, registry, { drawnSets: false }).shots.map(
        (s) => (s.set.kind === 'chart' ? s.set.chart.kind : s.set.kind),
      ),
    ).toEqual(['map', 'calendar', 'map', 'calendar']);
  });

  it('leaves nothing for the check to find, whatever the board wrote', () => {
    const answers: unknown[] = [
      { shots: [] },
      {
        shots: [
          {
            on: 'overnight',
            set: { kind: 'portrait', person: 'Honecker' },
            info: [{ recipe: 'label', text: 'Leader', on: 'held on' }],
          },
          {
            on: 'Brandenburg Gate',
            set: {
              kind: 'chart',
              chart: {
                kind: 'quote',
                quote: { text: 'Tear down this wall', speaker: 'Reagan' },
              },
            },
          },
          {
            on: 'kilometres',
            set: { kind: 'map' },
            info: [
              {
                recipe: 'count',
                target: 'number:Length of the inner border',
                on: '1,393',
              },
            ],
          },
          {
            on: 'Two years later',
            set: {
              kind: 'chart',
              chart: {
                kind: 'calendar',
                calendar: {
                  calendars: [{ label: 'Opened', dates: ['9 November 1989'] }],
                },
              },
            },
          },
        ],
      },
      {
        shots: [
          {
            on: 'the Wall opened',
            set: { kind: 'map' },
            info: [{ recipe: 'fill', target: 'the East', on: 'opened' }],
            camera: [{ move: 'push', target: 'the East', on: 'Wall' }],
          },
          {
            on: 'In 1961',
            set: { kind: 'map' },
            info: [
              { recipe: 'pin', target: 'Bernauer Strasse', on: 'Berlin' },
              { recipe: 'transfer', target: 'Berlin', on: 'cut' },
            ],
          },
          {
            on: 'In 1987, Reagan spoke',
            set: { kind: 'plain' },
            info: [{ recipe: 'label', text: 'Reagan', on: 'Reagan' }],
          },
        ],
      },
    ];
    for (const answer of answers) {
      const mended = mend(planOf(answer, narration));
      // The pace is the board's to give (withPace): the mend leaves the rest clean.
      const left = codes(mended).filter(
        (c) => !c.endsWith('no-shots') && !c.endsWith('gap-long'),
      );
      expect(left).toEqual([]);
      // Mending is done once: mended again, the same.
      expect(mend(mended)).toEqual(mended);
    }
  });
});

describe('a safe shot for a line with none', () => {
  const at = (k: number, around = {}) =>
    safeShot(WALL_ROWS[k], registry, WALL_WORLD, around);

  it("holds the show's map with a slow push on the line's place, only where nothing above it fits", () => {
    // Berlin and its year: the year's calendar comes before the map.
    expect(at(0).set).toMatchObject({
      kind: 'chart',
      chart: { kind: 'calendar', spec: { calendars: [{ dates: ['1961'] }] } },
    });
    const berlin = { ...WALL_ROWS[0], say: 'Berlin was cut in two overnight.' };
    expect(safeShot(berlin, registry, WALL_WORLD)).toEqual({
      on: 'Berlin was cut',
      set: { kind: 'map', tilt: 'flat' },
      actors: [],
      info: [{ recipe: 'pin', target: 'place:Berlin', on: 'Berlin was cut' }],
      life: ['cloud-shadows'],
      camera: [
        {
          move: 'push',
          target: 'place:Berlin',
          on: 'Berlin was cut',
          amount: 'small',
        },
      ],
      join: 'cut',
      focal: 'place:Berlin',
    });
    // A region the line names fills.
    expect(at(4).info).toEqual([
      {
        recipe: 'fill',
        target: 'region:East Germany',
        on: 'East Germany’s leader',
      },
    ]);
  });

  it("counts a line's number", () => {
    const counted = at(1);
    expect(counted.set).toEqual({
      kind: 'chart',
      chart: {
        kind: 'counter',
        spec: {
          value: 1393,
          unit: 'km',
          prefix: null,
          label: 'inner border',
          then: null,
          source: 'The Wall, part 2',
        },
      },
    });
    expect(counted.info).toEqual([
      {
        recipe: 'count',
        target: 'number:Length of the inner border',
        on: 'The inner border',
      },
    ]);
  });

  it('quotes exact words', () => {
    const world = { ...WALL_WORLD, base: null };
    const quoted = safeShot(WALL_ROWS[3], registry, world);
    expect(quoted.set).toEqual({
      kind: 'chart',
      chart: {
        kind: 'quote',
        spec: {
          text: 'Mr. Gorbachev, tear down this wall!',
          speaker: 'Ronald Reagan',
          when: null,
        },
      },
    });
  });

  it('shows a line about when its date, named by what happened', () => {
    expect(safeShot(WALL_ROWS[5], registry, WALL_WORLD)).toMatchObject({
      on: 'Two years later',
      set: {
        kind: 'chart',
        chart: {
          kind: 'calendar',
          spec: { calendars: [{ label: 'Wall opens', dates: ['1989'] }] },
        },
      },
      camera: [{ move: 'establish', on: 'Two years later' }],
    });
  });

  it('names a calendar by a short name of what happened, never a sentence cut short', () => {
    const talks: RegistryEntry = {
      name: 'date:1953',
      kind: 'date',
      about:
        'Constitutional talks expose a split over the timing of self-government',
    };
    expect(calendarShot(talks, 'In 1953').set).toEqual({
      kind: 'chart',
      chart: {
        kind: 'calendar',
        spec: { calendars: [{ label: null, dates: ['1953'] }], merge: null },
      },
    });
    expect(
      calendarShot({ ...talks, about: 'The Wall opens' }, 'In 1953').set,
    ).toMatchObject({
      chart: {
        spec: { calendars: [{ label: 'Wall opens', dates: ['1953'] }] },
      },
    });
  });

  /** The Wall's last line resting on nothing: no picture of its own. */
  const bare = { ...WALL_ROWS[5], claims: [] };

  it('carries the shot before on with the camera moving, pushing, then pulling', () => {
    const world = { ...WALL_WORLD, base: null };
    const before = good().shots[1];
    const carried = safeShot(bare, registry, world, {
      previous: before,
    });
    expect(carried).toMatchObject({
      on: 'Two years later',
      set: before.set,
      info: [],
      camera: [{ move: 'push', on: 'Two years later', amount: 'small' }],
      join: 'continue',
      focal: WHOLE_SET,
    });
    const again = safeShot(bare, registry, world, {
      previous: carried,
    });
    expect(again.camera[0].move).toBe('pull');
  });

  it('begins the next shot early, else the dates, else a quiet set: never the map on a line that names no place', () => {
    const next = good().shots[2];
    expect(
      safeShot(bare, registry, { ...WALL_WORLD, base: null }, { next }).set,
    ).toEqual(next.set);
    // The show has its map, and the shots around are maps: none of them
    // stands in for a line that names no place.
    const map = good().shots[0];
    for (const world of [WALL_WORLD, null])
      expect(
        safeShot(bare, registry, world, { previous: map, next: map }).set,
      ).toMatchObject({
        kind: 'chart',
        chart: { kind: 'timeline' },
      });
    const empty = buildRegistry({
      rows: WALL_ROWS,
      research: null,
      world: null,
    });
    expect(safeShot(bare, empty, null).set.kind).toBe('set');
  });

  it('is never a word card: every safe shot passes the check', () => {
    WALL_ROWS.forEach((row, k) => {
      const one = safeShot(row, registry, WALL_WORLD);
      const words = sceneNarration([row]);
      const plan: ShotPlan = { shots: [one] };
      expect(
        checkPlan(plan, words, registry).map((p) => `${k}:${p.code}`),
      ).toEqual([]);
    });
  });
});

describe('the plan across its lines', () => {
  const lines = WALL_ROWS;
  const check = (plan: ShotPlan, opening = false) =>
    checkPlan(plan, narration, registry, { lines, opening }).map(
      (p) => `${p.shot}:${p.code}`,
    );
  const mend = (plan: ShotPlan, opening = false) =>
    mendPlan(plan, narration, registry, { lines, opening });

  it('finds nothing wrong with the good plan, line by line', () => {
    expect(check(good())).toEqual([]);
    expect(mend(good())).toEqual(good());
  });

  it('counts only a number its own line says, resting on its claims', () => {
    // The border's length said on a line resting on another claim is no count of it.
    const elsewhere = WALL_ROWS.map((row, k) =>
      k === 1 ? { ...row, claims: ['c4'] } : row,
    );
    const plan = good();
    const found = checkPlan(plan, narration, registry, {
      lines: elsewhere,
    }).map((p) => `${p.shot}:${p.code}`);
    expect(found).toEqual(['1:count-unsaid', '1:count-unsaid']);
    const mended = mendPlan(plan, narration, registry, { lines: elsewhere });
    expect(mended.shots.map((s) => s.on)).toEqual([
      'In 1961',
      'In 1987',
      'East Germany’s leader',
      'Two years later',
    ]);
  });

  it('shows a counter once, never again for a line that never says it', () => {
    const plan = good();
    plan.shots.push(
      shot({
        on: 'the Wall opened',
        set: plan.shots[1].set,
        info: [
          {
            recipe: 'count',
            target: 'number:Length of the inner border',
            on: 'the Wall opened',
          },
        ],
        focal: WHOLE_SET,
      }),
    );
    expect(check(plan)).toEqual(['5:count-unsaid', '5:count-repeat']);
    expect(mend(plan).shots).toHaveLength(5);
  });

  it('lets nothing meant for the board reach the stage', () => {
    const plan = good();
    plan.shots[1].info[0].until = 'kilometres';
    plan.shots[3].info[1].text = 'label';
    const counter = plan.shots[1].set as Extract<
      PlanShot['set'],
      { kind: 'chart' }
    >;
    counter.chart.spec.source = 'c2';
    plan.shots[2] = shot({
      on: 'In 1987',
      set: {
        kind: 'chart',
        chart: {
          kind: 'timeline',
          spec: {
            events: [
              { when: '1961', name: '1961' },
              { when: '1987', name: 'Reagan speaks' },
            ],
          },
        },
      },
      info: [{ recipe: 'mark', target: 'part:1987', on: 'Reagan' }],
      camera: [
        { move: 'push', target: 'part:1987', on: 'Tear down this wall' },
      ],
      focal: WHOLE_SET,
    });
    expect(check(plan)).toEqual([
      '1:leak-until',
      '1:leak-source',
      '2:leak-date',
      '3:leak-label',
    ]);
    const mended = mend(plan);
    expect(mended.shots[1].info[0].until).toBeUndefined();
    expect(mended.shots[1].set).toMatchObject({
      chart: { spec: { source: 'The Wall, part 2' } },
    });
    expect(mended.shots[2].set).toMatchObject({
      chart: {
        spec: {
          events: [
            { when: '1961', name: 'Wall goes up' },
            { when: '1987', name: 'Reagan speaks' },
          ],
        },
      },
    });
    expect(mended.shots[3].info[1].text).toBe('East Germany');
    expect(check(mended)).toEqual([]);
  });

  it('fills a region as the voice first names it', () => {
    const plan = good();
    plan.shots[3].info = [
      {
        recipe: 'label',
        target: 'region:East Germany',
        text: 'East',
        on: 'Erich Honecker',
      },
      { recipe: 'fill', target: 'region:East Germany', on: 'held on' },
      { recipe: 'mark', target: 'place:Berlin', on: 'the Wall opened' },
    ];
    expect(check(plan)).toContain('3:fill-late');
    const fill = mend(plan).shots[3].info.find((i) => i.recipe === 'fill');
    expect(fill).toEqual({
      recipe: 'fill',
      target: 'region:East Germany',
      on: 'East Germany’s leader',
    });
  });

  it('fills the regions a side of the map names, as it is named', () => {
    const regions = registryOf([
      {
        name: 'region:North Region',
        kind: 'region',
        about: 'a region of the show’s map',
        geo: { lng: 8.67, lat: 10.39 },
        aliases: ['north'],
      },
      {
        name: 'region:West Region',
        kind: 'region',
        about: 'a region of the show’s map',
        geo: { lng: 4.7, lat: 7.08 },
        aliases: ['west'],
      },
      {
        name: 'region:East Region',
        kind: 'region',
        about: 'a region of the show’s map',
        geo: { lng: 7.55, lat: 5.6 },
        aliases: ['east'],
      },
    ]);
    const said =
      'Southern leaders wanted self-government sooner. The North would not fix a date too soon.';
    const plan: ShotPlan = {
      shots: [
        shot({
          on: 'Southern leaders',
          set: { kind: 'map', tilt: 'flat' },
          info: [
            {
              recipe: 'fill',
              target: 'region:North Region',
              on: 'The North would',
            },
          ],
          focal: WHOLE_SET,
        }),
      ],
    };
    const late = checkPlan(plan, said, regions, { map: true }).map(
      (p) => p.code,
    );
    expect(late.filter((c) => c === 'fill-late')).toHaveLength(2);
    const fills = mendPlan(plan, said, regions, { map: true })
      .shots[0].info.filter((i) => i.recipe === 'fill')
      .map((i) => `${i.target} on ${i.on}`);
    expect(fills).toEqual([
      'region:North Region on The North would',
      'region:West Region on Southern leaders wanted',
      'region:East Region on Southern leaders wanted',
    ]);
  });

  it('never labels a thing with a date by itself', () => {
    const plan = good();
    plan.shots[3].info[1] = {
      recipe: 'label',
      target: 'region:East Germany',
      text: '1961',
      on: 'held on',
    };
    expect(check(plan)).toContain('3:label-names');
    // Renamed by what it labels.
    expect(mend(plan).shots[3].info[1]).toMatchObject({
      recipe: 'label',
      target: 'region:East Germany',
      text: 'East Germany',
    });
    // On a calendar's own date, a label of the date is dropped.
    const calendar = good();
    calendar.shots[2] = {
      ...calendar.shots[2],
      set: {
        kind: 'chart',
        chart: {
          kind: 'calendar',
          spec: {
            calendars: [{ label: 'Reagan speaks', dates: ['1987'] }],
            merge: null,
          },
        },
      },
      info: [
        { recipe: 'label', target: 'part:1987', text: '1987', on: 'In 1987' },
      ],
      camera: [{ move: 'establish', on: 'In 1987' }],
      focal: WHOLE_SET,
    };
    expect(check(calendar)).toContain('2:label-names');
    expect(mend(calendar).shots[2].info).toEqual([]);
  });

  it('fills a region where the shot already shows it, when it has no room', () => {
    // The map on East Germany to the end, full (the mend gives the last
    // line, which names no place, its year's calendar).
    const plan: ShotPlan = { shots: good().shots.slice(0, 4) };
    plan.shots[3].info = [
      {
        recipe: 'spotlight',
        target: 'region:East Germany',
        on: 'Erich Honecker',
      },
      { recipe: 'mark', target: 'place:Berlin', on: 'held on' },
      { recipe: 'mark', target: 'place:Berlin', on: 'Two years later' },
      { recipe: 'mark', target: 'place:Berlin', on: 'the Wall opened' },
    ];
    expect(check(plan)).toContain('-1:fill-late');
    const mended = mend(plan);
    expect(mended.shots[3].info[0]).toEqual({
      recipe: 'fill',
      target: 'region:East Germany',
      on: 'East Germany’s leader',
    });
    expect(check(mended)).not.toContain('-1:fill-late');
  });

  it('else goes on from the region’s name as the shot’s continuation, filled', () => {
    // The map from the end of Reagan's words, full, over East Germany's line.
    const plan = good();
    plan.shots[3] = {
      ...plan.shots[3],
      on: 'he said',
      info: [
        { recipe: 'mark', target: 'place:Berlin', on: 'he said' },
        { recipe: 'mark', target: 'place:Berlin', on: 'Erich Honecker' },
        { recipe: 'mark', target: 'place:Berlin', on: 'Honecker held' },
        { recipe: 'mark', target: 'place:Berlin', on: 'held on' },
      ],
    };
    expect(check(plan)).toContain('-1:fill-late');
    const mended = mend(plan);
    expect(mended.shots[3].join).toBe('continue');
    expect(mended.shots[4]).toMatchObject({
      on: 'East Germany’s leader',
      set: { kind: 'map' },
      focal: 'region:East Germany',
    });
    expect(mended.shots[4].info[0]).toEqual({
      recipe: 'fill',
      target: 'region:East Germany',
      on: 'East Germany’s leader',
    });
    expect(check(mended)).not.toContain('-1:fill-late');
  });

  it("changes the episode's opening by its third or fourth word", () => {
    const plan = good();
    plan.shots[0].info = [
      { recipe: 'pin', target: 'place:Berlin', on: 'In 1961' },
      { recipe: 'seam', target: 'seam:inner border', on: 'overnight' },
    ];
    expect(check(plan, true)).toContain('0:first-late');
    expect(check(plan, false)).not.toContain('0:first-late');
    const mended = mend(plan, true);
    // The pin lands where Berlin is named, the third word.
    expect(mended.shots[0].info[0]).toEqual({
      recipe: 'pin',
      target: 'place:Berlin',
      on: 'Berlin was cut',
    });
    expect(check(mended, true)).not.toContain('0:first-late');
  });
});

describe('people and vehicles on the stage (the kit)', () => {
  const kit = KIT_IDS;
  const withActors = (actors: PlanShot['actors'], on = 'In 1961'): ShotPlan => {
    const plan = good();
    const at = plan.shots.findIndex((s) => s.on === on);
    plan.shots[at] = { ...plan.shots[at], actors };
    return plan;
  };
  const faults = (plan: ShotPlan) =>
    checkPlan(plan, narration, registry, { kit }).map(
      (p) => `${p.shot}:${p.code}`,
    );

  it('reads an actor’s settings from its own fields, an era in words as the kit names it', () => {
    const plan = planOf(
      {
        shots: [
          {
            on: 'In 1961',
            set: { kind: 'map' },
            actors: [
              {
                id: 'crowd',
                kit: 'people.crowd',
                place: 'place:Berlin',
                pose: 'protest',
                count: '1,393',
                era: 'the 1960s',
                facing: null,
                moves: [{ move: 'enter', on: 'Berlin' }],
              },
            ],
            info: [],
            camera: [],
            life: [],
            join: 'cut',
          },
        ],
      },
      narration,
      { kit },
    );
    expect(plan.shots[0].actors[0]).toMatchObject({
      id: 'crowd',
      kit: 'people.crowd',
      place: 'place:Berlin',
      params: { pose: 'protest', count: 1393, era: '1945-1975' },
      moves: [{ move: 'enter', on: 'Berlin' }],
    });
  });

  it('lets a crowd count only people the line or the list counts: never a year, a length or a number of its own', () => {
    const rows = [
      { ...WALL_ROWS[0], say: 'In 1961, 300 people gathered in Berlin.' },
      ...WALL_ROWS.slice(1),
    ];
    const said = sceneNarration(rows);
    const reg = buildRegistry({
      rows,
      research: WALL_RESEARCH,
      world: WALL_WORLD,
    });
    const crowd = (count: number): ShotPlan => ({
      shots: [
        shot({
          on: 'In 1961',
          set: { kind: 'map', tilt: 'flat' },
          actors: [
            {
              id: 'crowd',
              kit: 'people.crowd',
              place: 'place:Berlin',
              params: { count },
            },
          ],
        }),
      ],
    });
    const codesOf = (plan: ShotPlan) =>
      checkPlan(plan, said, reg, { kit }).map((p) => p.code);
    expect(codesOf(crowd(300))).not.toContain('untrue-count');
    for (const wrong of [1961, 1393, 5000])
      expect(codesOf(crowd(wrong))).toContain('untrue-count');
    const mended = mendPlan(crowd(5000), said, reg, { kit });
    expect(mended.shots[0].actors[0].params?.count).toBeUndefined();
    expect(mended.shots[0].actors[0].kit).toBe('people.crowd');
  });

  it('never draws a named person as a silhouette: the figure goes, the board is asked again', () => {
    const plan = withActors(
      [{ id: 'speaker', kit: 'people.person', params: { pose: 'lectern' } }],
      'In 1987',
    );
    expect(faults(plan)).toContain('2:silhouette-person');
    expect(
      mendPlan(plan, narration, registry, { kit }).shots[2].actors,
    ).toEqual([]);
    // On a person's own name too, whatever the piece.
    const named = withActors([
      { id: 'crowd', kit: 'people.crowd', place: 'person:Ronald Reagan' },
    ]);
    expect(faults(named)).toContain('0:silhouette-person');
  });

  it('never puts the audience on screen', () => {
    const plan = withActors([
      { id: 'viewers', kit: 'people.group', params: { count: 3 } },
    ]);
    expect(faults(plan)).toContain('0:audience');
    expect(
      mendPlan(plan, narration, registry, { kit }).shots[0].actors,
    ).toEqual([]);
  });

  it('keeps only the moves a piece can make, each on words inside its shot', () => {
    const plan = withActors([
      {
        id: 'crowd',
        kit: 'people.crowd',
        place: 'place:Berlin',
        moves: [
          { move: 'fly', on: 'Berlin' },
          { move: 'enter', on: 'cut in two' },
        ],
      },
    ]);
    expect(faults(plan)).toContain('0:unknown-move');
    const mended = mendPlan(plan, narration, registry, { kit });
    expect(mended.shots[0].actors[0].moves).toEqual([
      { move: 'enter', on: 'cut in two' },
    ]);
  });
});

describe("a calendar's words", () => {
  it('never names a calendar, or what its sheets merge into, by dates alone', () => {
    const read = planOf(
      {
        shots: [
          {
            on: 'In 1987',
            set: {
              kind: 'chart',
              chart: {
                kind: 'calendar',
                spec: {
                  calendars: [
                    { label: '1961', dates: ['1987'] },
                    { label: 'Wall opens', dates: ['1989'] },
                  ],
                  merge: '1987 and 1989',
                },
              },
            },
            focal: 'set',
          },
        ],
      },
      narration,
    );
    expect(read.shots[0].set).toEqual({
      kind: 'chart',
      chart: {
        kind: 'calendar',
        spec: {
          calendars: [
            { label: null, dates: ['1987'] },
            { label: 'Wall opens', dates: ['1989'] },
          ],
          merge: null,
        },
      },
    });
  });
});

describe('a plan as stored, read again', () => {
  it('reads its charts as they are kept ({kind, spec}), and mends to the same plan', () => {
    const plan = good();
    const again = planOf(JSON.parse(JSON.stringify(plan)), narration);
    expect(again.shots.map((s) => s.set)).toEqual(plan.shots.map((s) => s.set));
    expect(mendPlan(again, narration, registry)).toEqual(
      mendPlan(plan, narration, registry),
    );
  });
});

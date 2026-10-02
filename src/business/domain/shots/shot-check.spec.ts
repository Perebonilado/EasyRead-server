import { KIT_IDS } from '../kit/registry';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import {
  checkPlan,
  mendPlan,
  mostShots,
  planOf,
  safeShot,
  stageWords,
  WHOLE_SET,
} from './shot-check';
import { sceneNarration } from './shot-phrases';
import { buildRegistry } from './shot-registry';
import type { PlanShot, ShotPlan } from './types';

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

/** A good plan of the Wall's lines: the map, the border's length, Reagan's words. */
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
      camera: [{ move: 'push', on: 'Tear down this wall', amount: 'small' }],
      life: ['grain'],
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

  it('caps the shots at eight a minute of narration, dropping a set it does not know', () => {
    expect(mostShots(narration)).toBe(3);
    const plan = planOf(messy, narration);
    expect(plan.shots).toHaveLength(3);
    expect(plan.shots.map((s) => s.on)).toEqual([
      'In 1961,',
      'The inner border',
      'he said',
    ]);
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
    expect(mended.shots).toHaveLength(3);
    expect(mended.shots[1].on).toBe('The inner border');
    // Not in its shot's words at all: on the shot's own words.
    expect(mended.shots[1].info[0].on).toBe('The inner border');
  });

  it('puts the shots in the order of their words, and the first on the first words', () => {
    const plan = good();
    plan.shots = [plan.shots[0], plan.shots[2], plan.shots[1]];
    plan.shots[0].on = 'Berlin was cut';
    const mended = mend(plan);
    expect(mended.shots.map((s) => s.on)).toEqual([
      'In 1961, Berlin',
      'The inner border',
      'In 1987',
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
    expect(mend(bars).shots.map((s) => s.on)).toEqual(['In 1961', 'In 1987']);
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
    expect(mended.info.slice(2).map((i) => i.text)).toEqual([
      'East Germany',
      '1961',
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
    const mended = mend(plan);
    expect(mended.shots.map((s) => s.set.kind)).toEqual(['map', 'set']);
    expect(mended.shots[1].set).toEqual({
      kind: 'set',
      set: { land: 'city', time: 'night' },
    });
    expect(codes(mended)).toEqual([]);
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
      const left = codes(mended).filter((c) => !c.endsWith('no-shots'));
      expect(left).toEqual([]);
      // Mending is done once: mended again, the same.
      expect(mend(mended)).toEqual(mended);
    }
  });
});

describe('a safe shot for a line with none', () => {
  const at = (k: number, around = {}) =>
    safeShot(WALL_ROWS[k], registry, WALL_WORLD, around);

  it("holds the show's map with a slow push on the line's place", () => {
    expect(at(0)).toEqual({
      on: 'In 1961, Berlin',
      set: { kind: 'map', tilt: 'flat' },
      actors: [],
      info: [{ recipe: 'pin', target: 'place:Berlin', on: 'In 1961, Berlin' }],
      life: ['cloud-shadows'],
      camera: [
        {
          move: 'push',
          target: 'place:Berlin',
          on: 'In 1961, Berlin',
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
          speaker: null,
          when: null,
        },
      },
    });
  });

  it('carries the shot before on with the camera moving, pushing, then pulling', () => {
    const world = { ...WALL_WORLD, base: null };
    const before = good().shots[1];
    const carried = safeShot(WALL_ROWS[5], registry, world, {
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
    const again = safeShot(WALL_ROWS[5], registry, world, {
      previous: carried,
    });
    expect(again.camera[0].move).toBe('pull');
  });

  it('begins the next shot early, else the whole map, else the dates, else a quiet set', () => {
    const next = good().shots[2];
    expect(
      safeShot(WALL_ROWS[5], registry, { ...WALL_WORLD, base: null }, { next })
        .set,
    ).toEqual(next.set);
    expect(safeShot(WALL_ROWS[5], registry, WALL_WORLD).set).toEqual({
      kind: 'map',
      tilt: 'flat',
    });
    expect(safeShot(WALL_ROWS[5], registry, null).set).toMatchObject({
      kind: 'chart',
      chart: { kind: 'timeline' },
    });
    const empty = buildRegistry({
      rows: WALL_ROWS,
      research: null,
      world: null,
    });
    expect(safeShot(WALL_ROWS[5], empty, null).set.kind).toBe('set');
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

import {
  LEAVE_PEOPLE_OUT,
  doingIn,
  fitLayout,
  mendScript,
  signsShown,
  mentionsPeople,
  peopleAskedFor,
  phraseAt,
  quietStretches,
  sendBack,
  listsIn,
  flowOrder,
  betterDraft,
  type MendedScript,
  tellsOfLoss,
  type SceneScriptDraft,
} from './scene-script';

const thing = (
  id: string,
  kind: SceneScriptDraft['cast'][number]['kind'],
  extra: Partial<SceneScriptDraft['cast'][number]> = {},
): SceneScriptDraft['cast'][number] => ({
  id,
  kind,
  name: id,
  brief: kind === 'drawing' ? `a ${id}` : null,
  motion: kind === 'drawing' ? 'it sways' : null,
  parts: null,
  states: null,
  shape: null,
  value: kind === 'stat' ? '70%' : null,
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
  ...extra,
});

const step = (
  beat: number,
  phrase: string,
  extra: Partial<SceneScriptDraft['steps'][number]> = {},
): SceneScriptDraft['steps'][number] => ({
  beat,
  phrase,
  layout: null,
  show: null,
  arrows: null,
  effects: null,
  ...extra,
});

const draft = (): SceneScriptDraft => ({
  fit: 'good',
  fitReason: null,
  title: 'How plants make food',
  mood: 'curious',
  beats: [
    { say: 'Plants make their own food.', pause: 'short', delivery: 'hook' },
    {
      say: 'To do it, they need sunlight, water and carbon dioxide.',
      pause: 'short',
      delivery: 'explain',
    },
    {
      say: 'All three meet inside the leaf, in tiny parts called chloroplasts.',
      pause: 'long',
      delivery: 'key',
    },
  ],
  cast: [
    thing('Leaf', 'drawing', {
      parts: [
        { name: 'chloroplasts', label: true },
        { name: 'Chloroplasts', label: true },
      ],
      states: [{ name: 'glowing', look: 'bright green' }],
    }),
    thing('sun', 'drawing'),
    thing('co2', 'stat', { value: null }),
  ],
  steps: [
    step(0, 'Plants make', { layout: 'row', show: ['Leaf'] }),
    step(1, 'sunlight', {
      layout: 'hub',
      show: ['leaf', 'sun', 'nobody'],
      arrows: [
        { from: 'sun', to: 'leaf', label: 'light', flow: true },
        { from: 'sun', to: 'ghost', label: null, flow: false },
      ],
    }),
    step(1, 'CHLOROPLASTS,', {
      effects: [{ target: 'leaf.chloro-plasts', do: 'point' }],
    }),
  ],
});

describe('the writer’s storyboard, mended', () => {
  it('finds a phrase whatever its case and punctuation, and a near miss', () => {
    expect(
      phraseAt(
        'All three meet inside the leaf, in tiny parts called chloroplasts.',
        'called chloroplasts',
      ),
    ).toBe(9);
    expect(phraseAt('Plants make their own food.', 'OWN FOOD')).toBe(3);
    expect(phraseAt('the chloroplasts trap light', 'chloroplast traps')).toBe(
      1,
    );
    expect(phraseAt('Plants make their own food.', 'the moon')).toBe(-1);
  });

  it('holds a layout only as many things as it takes', () => {
    expect(fitLayout('one', 3)).toBe('row');
    expect(fitLayout('hub', 2)).toBe('row');
    expect(fitLayout('compare', 2)).toBe('compare');
    expect(fitLayout('row', 1)).toBe('one');
  });

  it('makes ids safe, drops what is not in the cast, and moves a phrase to the sentence it is in', () => {
    const { script, problems, mended } = mendScript(draft());
    expect(problems).toEqual([]);
    // The writer's own steps: the list said aloud comes on between them.
    const [first, second, third] = script.steps.filter(
      (step) => !step.stage?.show.some((id) => id.startsWith('item-')),
    );
    expect(first.stage).toEqual({ layout: 'one', show: ['leaf'], arrows: [] });
    // Two things left once "nobody" is dropped: a hub cannot hold two.
    expect(second.stage?.layout).toBe('row');
    // The sun's light runs to the leaf: the sun first, so the arrow reads forward.
    expect(second.stage?.show).toEqual(['sun', 'leaf']);
    expect(second.stage?.arrows).toEqual([
      { from: 'sun', to: 'leaf', label: 'light', flow: true },
    ]);
    // The phrase is in the third sentence, not the second.
    expect(third.at.beat).toBe(2);
    expect(third.word).toBe(10);
    expect(third.effects).toEqual([
      { target: 'leaf', part: 'chloroplasts', do: 'point' },
    ]);
    expect(mended.join(' ')).toMatch(/nobody/);
    // One part of a name, however it was capitalised.
    const leaf = script.cast.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.parts).toHaveLength(1);
    // A number with no value is set as words, and a thing never on stage is dropped.
    expect(
      script.cast.map((t) => t.id).filter((id) => !id.startsWith('item-')),
    ).toEqual(['leaf', 'sun']);
  });

  it('asks for a redo when the phrases are not in the narration or nothing is ever shown', () => {
    const bad = draft();
    bad.steps = bad.steps.map((s) => ({
      ...s,
      phrase: 'words that are nowhere',
    }));
    expect(mendScript(bad).problems.join(' ')).toMatch(
      /not in their sentences/,
    );
    const empty = draft();
    empty.steps = [
      step(0, 'Plants', { effects: [{ target: 'leaf', do: 'pulse' }] }),
    ];
    expect(mendScript(empty).problems.join(' ')).toMatch(
      /never puts anything on the stage/,
    );
  });

  it('keeps an unfit page as the writer judged it', () => {
    const poor = {
      ...draft(),
      fit: 'poor' as const,
      fitReason: 'An index.',
      steps: [],
    };
    const { script, problems } = mendScript(poor);
    expect(script.fit).toBe('poor');
    expect(problems).toEqual([]);
  });

  it('counts the words that pass with nothing changing', () => {
    const { script } = mendScript(draft());
    expect(quietStretches(script, 5).length).toBeGreaterThan(0);
    expect(quietStretches(script, 50)).toEqual([]);
  });

  it('hears the lists a sentence reads out, and never a run of clauses', () => {
    const items = (sentence: string) =>
      listsIn(sentence).map((list) =>
        list.map((item) => `${item.word}:${item.text}`),
      );
    expect(
      items('The main parts are storage, compute, and the network.'),
    ).toEqual([['4:storage', '5:compute', '7:the network']]);
    expect(items('There are three kinds: disk, memory and cache.')).toEqual([
      ['4:disk', '5:memory', '7:cache'],
    ]);
    expect(
      items('To do it, they need sunlight, water and carbon dioxide.'),
    ).toEqual([['5:sunlight', '6:water', '8:carbon dioxide']]);
    expect(items('He came, he saw, and he won.')).toEqual([]);
    expect(
      items(
        'Data is copied, checked, and stored in three regions across the world.',
      ),
    ).toEqual([]);
  });

  it('sets a row so its arrows run forward, to the next thing, keeping what stood before', () => {
    // Page 254: the queue listed first, the client sending to it.
    expect(
      flowOrder(
        ['backup-queue', 'client'],
        [{ from: 'client', to: 'backup-queue' }],
      ),
    ).toEqual(['client', 'backup-queue']);
    // A chain listed out of order reads as a chain.
    expect(
      flowOrder(
        ['db', 'server', 'client'],
        [
          { from: 'client', to: 'server' },
          { from: 'server', to: 'db' },
        ],
      ),
    ).toEqual(['client', 'server', 'db']);
    // What stood before keeps its place; the one pointed at comes next to
    // the one pointing, not across the thing between them.
    expect(
      flowOrder(
        ['backup-queue', 'client', 'server'],
        [{ from: 'client', to: 'server' }],
        ['client', 'backup-queue'],
      ),
    ).toEqual(['client', 'server', 'backup-queue']);
    // A ring of arrows, or none, as it was.
    expect(flowOrder(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(
      flowOrder(
        ['a', 'b'],
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
      ),
    ).toHaveLength(2);
  });

  it('brings a list said aloud on stage item by item, beside what it is about', () => {
    const { script, mended } = mendScript(draft());
    const cards = script.cast.filter((t) => t.id.startsWith('item-'));
    expect(cards.map((t) => t.kind === 'words' && t.text)).toEqual([
      'Sunlight',
      'Water',
      'Carbon dioxide',
    ]);
    // Each on its own words, joining the ones before it, the leaf kept.
    const listing = script.steps.filter((s) =>
      s.stage?.show.some((id) => id.startsWith('item-')),
    );
    expect(listing.map((s) => [s.word, s.stage!.show.length])).toEqual([
      [5, 3],
      [6, 4],
      [8, 5],
    ]);
    // What the writer had up, the sun and the leaf, stays beside them, as
    // it stood.
    expect(listing[2].stage!.show.slice(0, 2)).toEqual(['sun', 'leaf']);
    expect(mended.join(' ')).toContain('a list of 3 said aloud');
  });

  it('sends a lesson whose picture sits still too long back on its own, and keeps the better draft', () => {
    const mended = mendScript(draft());
    const words = (n: number) =>
      Array.from({ length: n }, () => 'word').join(' ');
    // Forty-five words said over a stage set once, on the first words.
    const still: MendedScript = {
      ...mended,
      problems: [],
      script: {
        ...mended.script,
        beats: mended.script.beats.map((beat, k) => ({
          ...beat,
          say: k === 0 ? `${words(44)}.` : 'Done.',
        })),
        steps: mended.script.steps.slice(0, 1),
      },
    };
    const reasons = sendBack(still, true);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('nothing new to see');
    // A page of 132 words on one stage: two changes of stage wanted.
    const long: MendedScript = {
      ...still,
      script: {
        ...still.script,
        beats: still.script.beats.map((beat) => ({
          ...beat,
          say: `${words(44)}.`,
        })),
      },
    };
    expect(sendBack(long, true).join(' ')).toContain(
      'The stage changes 1 times in 132 spoken words',
    );
    // A story's quiet holds its actions; a page not taught this way stays.
    expect(sendBack(still, false)).toEqual([]);
    expect(
      sendBack({ ...still, script: { ...still.script, fit: 'poor' } }, true),
    ).toEqual([]);
    // The draft written again is kept unless it is worse.
    const moving: MendedScript = { ...mended, problems: [] };
    expect(sendBack(moving, true)).toEqual([]);
    expect(betterDraft(still, moving, true)).toBe(moving);
    expect(betterDraft(moving, still, true)).toBe(moving);
    expect(betterDraft(moving, { ...moving }, true)).not.toBe(moving);
  });

  it('keeps how each sentence is said and what a drawing sounds like, and mends what is off the list', () => {
    const odd = draft();
    odd.mood = 'grim' as never;
    odd.beats[1].delivery = 'shout' as never;
    odd.cast[0].sound = 'heartbeat';
    odd.cast[1].sound = 'trumpet' as never;
    const { script } = mendScript(odd);
    expect(script.mood).toBe('curious');
    expect(script.beats.map((b) => b.delivery)).toEqual([
      'hook',
      'explain',
      'key',
    ]);
    const [leaf, sun] = script.cast;
    expect(leaf.kind === 'drawing' && leaf.sound).toBe('heartbeat');
    expect(sun.kind === 'drawing' && sun.sound).toBeNull();
  });

  it("checks a working's sums, a graph's function and a quotation's words, and points at their parts", () => {
    const d = draft();
    d.cast.push(
      thing('work', 'math', {
        lines: [
          { latex: 'M = \\term{image}{h_i} / h_o', check: null },
          { latex: '= 50/0.1', check: '50/0.1 = 5000' },
        ],
      }),
      thing('graph', 'plot', {
        plot: {
          fn: 'x^2',
          xFrom: -2,
          xTo: 2,
          yFrom: null,
          yTo: null,
          xLabel: null,
          yLabel: null,
          points: [{ x: 1, name: 'one' }],
        },
      }),
      thing('poem', 'quote', {
        quote: 'Plants make their own food.',
        phrases: [
          { name: 'own', phrase: 'their own food', note: 'made at home' },
        ],
      }),
    );
    d.steps.push(
      step(2, 'called chloroplasts', {
        layout: 'stack',
        show: ['work', 'graph', 'poem'],
        effects: [
          { target: 'work.image', do: 'point' },
          { target: 'work.line 2', do: 'show' },
          { target: 'graph.one', do: 'point' },
          { target: 'poem.own', do: 'point' },
        ],
      }),
    );
    const material = d.beats.map((b) => b.say).join(' ');
    const { script, problems } = mendScript(d, { material });
    expect(problems.join(' ')).toMatch(/does not add up: 50\/0\.1 = 5000/);
    const last = script.steps[script.steps.length - 1];
    expect(last.stage?.layout).toBe('stack');
    expect(last.effects).toEqual([
      { target: 'work', part: 'image', do: 'point' },
      { target: 'work', part: 'line 2', do: 'show' },
      { target: 'graph', part: 'one', do: 'point' },
      { target: 'poem', part: 'own', do: 'point' },
    ]);
    // A book that may only explain: its graph and its quotation are set
    // in type; working is on any page that works a calculation.
    const plain = mendScript(d, { material, formats: ['explainer'] });
    const typed = plain.script.cast
      .filter((t) => t.kind === 'words')
      .map((t) => t.id);
    expect(typed).toEqual(expect.arrayContaining(['graph', 'poem']));
    expect(typed).not.toContain('work');
    // A quotation that is not the page's own words goes back.
    const off = draft();
    off.cast.push(thing('poem', 'quote', { quote: 'Trees are tall.' }));
    off.steps.push(
      step(0, 'Plants make', { layout: 'row', show: ['leaf', 'poem'] }),
    );
    expect(mendScript(off, { material }).problems.join(' ')).toMatch(
      /not the page's own words/,
    );
  });

  it('reads a stage restated as it stands as its effects only', () => {
    const restated = draft();
    restated.steps = [
      step(0, 'Plants make', { layout: 'one', show: ['leaf'] }),
      step(1, 'sunlight', {
        layout: 'one',
        show: ['leaf'],
        effects: [{ target: 'leaf', do: 'pulse' }],
      }),
    ];
    const { script, mended } = mendScript(restated);
    expect(script.steps[1].stage).toBeNull();
    expect(script.steps[1].effects).toHaveLength(1);
    expect(mended.join(' ')).toMatch(/restated/);
  });
});

describe("the writer's music, mended", () => {
  it('keeps a state the score plays, and running high only where it can', () => {
    const d = draft();
    d.beats[0] = { ...d.beats[0], music: 'motion', energy: 'high' };
    d.beats[1] = {
      ...d.beats[1],
      say: 'Without sunlight, the plant dies.',
      music: 'solemn',
      energy: 'high',
    };
    d.beats[2] = {
      ...d.beats[2],
      music: 'loud' as unknown as 'calm',
      energy: 'low',
    };
    const { script } = mendScript(d);
    expect(script.beats.map((b) => [b.music, b.energy])).toEqual([
      ['motion', 'high'],
      ['solemn', undefined],
      [undefined, undefined],
    ]);
  });
});

describe('solemn music, held to the page', () => {
  it('is solemn only where the page tells of a death, a grief, a war or a disaster', () => {
    expect(
      tellsOfLoss("All five men in Scott's team died on the march back."),
    ).toBe(true);
    expect(tellsOfLoss('The war ended in 1918.')).toBe(true);
    expect(tellsOfLoss('Her grief was hard to bear.')).toBe(true);
    // Said a sentence early: the next one tells it.
    expect(
      tellsOfLoss('Then the news came.', 'The ship sank with all hands.'),
    ).toBe(true);
    // Symptoms and illness explained are not grave enough.
    expect(
      tellsOfLoss(
        'People with thalassemia may feel tired, weak, or look pale.',
      ),
    ).toBe(false);
    expect(
      tellsOfLoss('Blood transfusions raise the number of red blood cells.'),
    ).toBe(false);
  });

  it('makes solemn over symptoms calm, and leaves a story its sadness', () => {
    const d = draft();
    d.beats[1] = {
      ...d.beats[1],
      say: 'People with the condition may feel tired and look pale.',
      music: 'solemn',
    };
    expect(mendScript(d).script.beats[1].music).toBe('calm');
    // In a story, a light gone out may be solemn: no one need have died.
    const story = draft();
    story.beats[1] = {
      ...story.beats[1],
      say: "The boats are coming home, but the lantern's light is gone.",
      music: 'solemn',
    };
    expect(
      mendScript(story, {
        characters: [{ id: 'mira', name: 'Mira', aliases: [] }],
      }).script.beats[1].music,
    ).toBe('solemn');
  });
});

describe('a story told with its own characters', () => {
  const characters = [
    { id: 'mira', name: 'Mira', aliases: ['Mira Arden'] },
    { id: 'ember', name: 'Ember', aliases: ['the fox'] },
  ];
  const story = (): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'The lantern goes out',
    mood: 'serious',
    beats: [
      {
        say: 'Mira stands at the end of the quay.',
        pause: 'short',
        delivery: 'hook',
      },
      {
        say: 'A fox slips out of the dark and grins at her.',
        pause: 'short',
        delivery: 'explain',
      },
      { say: 'Mira gasps, then laughs.', pause: 'long', delivery: 'key' },
    ],
    cast: [
      thing('girl', 'character', { ref: 'mira', state: 'sad' }),
      // The writer's own words for the fox, and the same girl again.
      thing('fox', 'character', {
        ref: null,
        name: 'The Fox',
        state: 'grinning' as never,
      }),
      thing('mira-again', 'character', { ref: 'Mira Arden' }),
      thing('ghost', 'character', { ref: 'nobody' }),
      thing('quay', 'drawing'),
    ],
    steps: [
      step(0, 'Mira stands', { layout: 'one', show: ['girl'] }),
      step(1, 'A fox', {
        layout: 'row',
        show: ['fox', 'mira-again', 'ghost'],
        effects: [{ target: 'fox.head', do: 'point' }],
      }),
      step(2, 'Mira gasps', {
        effects: [{ target: 'mira-again.surprised', do: 'show' }],
      }),
      step(2, 'then laughs', {
        effects: [{ target: 'girl.happy', do: 'show' }],
      }),
    ],
  });

  it("shows each character as the story's own, once, by id, name or alias", () => {
    const { script, mended } = mendScript(story(), { characters });
    const people = script.cast.filter((t) => t.kind === 'character');
    expect(people).toEqual([
      {
        id: 'girl',
        kind: 'character',
        ref: 'mira',
        name: 'Mira',
        state: 'sad',
        met: 0,
        intro: [],
      },
      {
        id: 'fox',
        kind: 'character',
        ref: 'ember',
        name: 'Ember',
        state: null,
        met: 0,
        intro: [],
      },
    ]);
    // Someone the story does not have is set in type.
    expect(script.cast.find((t) => t.id === 'ghost')).toMatchObject({
      kind: 'words',
    });
    expect(mended.join(' ')).toContain(
      '"nobody" is not one of the story\'s characters',
    );
    // The same girl twice is the one figure, wherever the storyboard names her.
    expect(script.steps[1].stage!.show).toEqual(['fox', 'girl', 'ghost']);
    expect(script.steps[2].effects).toEqual([
      { target: 'girl', part: 'surprised', do: 'show' },
    ]);
    expect(script.steps[1].effects).toEqual([
      { target: 'fox', part: 'head', do: 'point' },
    ]);
  });

  it("knows whom a sentence quotes, by id, name or alias, and only the story's characters", () => {
    const quoted = story();
    quoted.beats[1] = { ...quoted.beats[1], speaker: 'The Fox' };
    quoted.beats[2] = { ...quoted.beats[2], speaker: 'quay' };
    const { script, mended } = mendScript(quoted, { characters });
    expect(script.beats.map((b) => b.speaker)).toEqual([
      undefined,
      'fox',
      undefined,
    ]);
    expect(mended.join(' ')).toContain(
      '"quay" is not one of the story\'s characters',
    );
  });

  it("finds who says each line in the words, with the writer's marks only a hint", () => {
    const talk = story();
    talk.beats = [
      {
        say: 'Mira stands at the end of the quay.',
        pause: 'short',
        delivery: 'hook',
      },
      {
        say: '"Who goes there?" asks Mira.',
        pause: 'short',
        delivery: 'explain',
      },
      {
        say: 'The fox grins. "A friend," he says.',
        pause: 'short',
        delivery: 'explain',
      },
      {
        say: '"Foxes don\'t talk," Mira whispers.',
        pause: 'long',
        delivery: 'key',
      },
    ];
    talk.steps = [
      step(0, 'Mira stands', { layout: 'row', show: ['girl', 'fox'] }),
      step(2, 'The fox grins', { effects: [{ target: 'fox', do: 'say' }] }),
      step(3, 'Mira whispers', {
        effects: [{ target: 'girl.surprised', do: 'show' }],
      }),
    ];
    const { script } = mendScript(talk, { characters });
    expect(script.beats.map((beat) => beat.lines ?? [])).toEqual([
      [],
      [{ span: [1, 16], speaker: 'girl' }],
      [{ span: [16, 25], speaker: 'fox' }],
      [{ span: [1, 18], speaker: 'girl' }],
    ]);
    expect(script.beats.map((beat) => beat.speaker)).toEqual([
      undefined,
      'girl',
      'fox',
      'girl',
    ]);
    // A "say" was only a hint: bubbles come from the lines, so the step with
    // nothing else on it is gone, and no "say" is left on the stage.
    expect(script.steps).toHaveLength(2);
    expect(
      script.steps.flatMap((step) => step.effects).map((e) => e.do),
    ).toEqual(['show']);
  });

  it('reads one character toward another as acting: a look, a reach, a hug, a point, the camera on two', () => {
    const acted = story();
    acted.steps = [
      step(0, 'Mira stands', { layout: 'row', show: ['girl', 'fox', 'quay'] }),
      step(1, 'A fox', {
        effects: [
          { target: 'girl.fox', do: 'look' },
          { target: 'fox.Mira', do: 'reach' },
          { target: 'girl.quay', do: 'point' },
          { target: 'fox.girl', do: 'zoom' },
          // A drawing does not act, and no one hugs who is not there.
          { target: 'quay.girl', do: 'look' },
          { target: 'girl.ghost', do: 'hug' },
        ],
      }),
    ];
    const { script, mended } = mendScript(acted, { characters });
    expect(script.steps[1].effects).toEqual([
      { target: 'girl', part: 'fox', do: 'look' },
      { target: 'fox', part: 'girl', do: 'reach' },
      { target: 'girl', part: 'quay', do: 'point' },
      { target: 'fox', part: 'girl', do: 'zoom' },
    ]);
    expect(mended.join(' ')).toContain('look on quay, who is no one to act');
    expect(mended.join(' ')).toContain(
      'hug from girl toward "ghost", which is not on the stage',
    );
  });

  it('sets characters in type in a book that is no story', () => {
    const { script } = mendScript(story());
    expect(script.cast.some((t) => t.kind === 'character')).toBe(false);
  });
});

describe("teaching to the learners' stage", () => {
  it('keeps a child to two labels on a drawing, the rest parts the voice can still point at', () => {
    const d = draft();
    d.cast[0] = {
      ...d.cast[0],
      parts: ['stem', 'leaf', 'root', 'flower'].map((name) => ({
        name,
        label: true,
      })),
    };
    const { script, mended } = mendScript(d, { stage: 'early' });
    const leaf = script.cast[0];
    expect(leaf.kind === 'drawing' && leaf.parts).toEqual([
      { name: 'stem', label: true },
      { name: 'leaf', label: true },
      { name: 'root', label: false },
      { name: 'flower', label: false },
    ]);
    expect(mended.join(' ')).toContain('"root" unlabelled, for these learners');
    // For a university page all four keep their labels.
    const higher = mendScript(d, { stage: 'higher' }).script.cast[0];
    expect(
      higher.kind === 'drawing' && higher.parts.every((p) => p.label),
    ).toBe(true);
  });

  it('sends back a page far too long for a child, and lets a little over be', () => {
    const long = draft();
    long.beats = Array.from({ length: 16 }, (_, i) => ({
      say: `Sentence ${i} tells the child one more small thing about the plant and its leaves today.`,
      pause: 'short' as const,
      delivery: 'explain' as const,
    }));
    const { problems } = mendScript(long, { stage: 'early' });
    expect(problems.join(' ')).toContain('these learners take 80 to 150');
    expect(problems.join(' ')).toContain('Split them');
    // Taught as always when the stage is not known.
    expect(mendScript(long).problems.join(' ')).not.toContain('these learners');
  });
});

describe('people the page shows', () => {
  const page = (cast: SceneScriptDraft['cast']): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'At the clinic',
    mood: 'calm',
    beats: [
      {
        say: 'A doctor listens to your chest.',
        pause: 'short',
        delivery: 'hook',
      },
      {
        say: 'She hears the valves close.',
        pause: 'short',
        delivery: 'explain',
      },
      { say: 'Then she smiles: all is well.', pause: 'long', delivery: 'key' },
    ],
    cast,
    steps: [
      step(0, 'A doctor', { layout: 'row', show: cast.map((t) => t.id) }),
      step(2, 'she smiles', {
        effects: [{ target: 'doctor.happy', do: 'show' }],
      }),
      step(1, 'She hears', {
        effects: [{ target: 'doctor.body', do: 'point' }],
      }),
    ],
  });

  it('draws a person from their figure, made sound, with faces and parts like a character', () => {
    const { script } = mendScript(
      page([
        thing('doctor', 'person', {
          name: 'Doctor',
          state: 'neutral',
          figure: {
            age: 'adult',
            skin: 6,
            hair: 'bun',
            top: 'lab coat',
            extras: ['stethoscope', 'glasses', 'scarf'],
          },
        }),
      ]),
    );
    const doctor = script.cast[0];
    expect(doctor).toMatchObject({
      id: 'doctor',
      kind: 'person',
      name: 'Doctor',
      state: 'neutral',
      figure: {
        age: 'adult',
        skin: 6,
        hair: 'bun',
        top: 'lab coat',
        extras: ['stethoscope', 'glasses'],
      },
    });
    expect(script.steps.flatMap((s) => s.effects)).toEqual([
      { target: 'doctor', part: 'body', do: 'point' },
      { target: 'doctor', part: 'happy', do: 'show' },
    ]);
  });

  it('stands a group as a few people like the one described, at most four', () => {
    const { script } = mendScript(
      page([
        thing('doctor', 'person', { count: 7 }),
        thing('nurse', 'person', { count: 1 }),
      ]),
    );
    expect(script.cast[0]).toMatchObject({ kind: 'person', count: 4 });
    expect(script.cast[1]).not.toHaveProperty('count');
  });

  it('draws a person the writer said nothing of as themselves, the same every time, and says so', () => {
    const made = () => mendScript(page([thing('nurse', 'person')]));
    const { script, mended } = made();
    const nurse = script.cast[0];
    expect(nurse).toMatchObject({ kind: 'person', figure: { age: 'adult' } });
    expect(nurse).toEqual(made().script.cast[0]);
    expect(mended.join(' ')).toContain('a person with no figure');
  });

  it('draws a drawing that is someone as a person, dressed for what they are', () => {
    const { script, mended } = mendScript(
      page([
        thing('doctor', 'drawing', { name: 'Doctor' }),
        thing('sick', 'drawing', { name: 'Sick child' }),
        thing('team', 'drawing', { name: "Amundsen's team" }),
      ]),
    );
    expect(script.cast.map((t) => t.kind)).toEqual([
      'person',
      'person',
      'person',
    ]);
    expect(script.cast[0]).toMatchObject({
      figure: { top: 'lab coat', extras: ['stethoscope'] },
    });
    expect(script.cast[1]).toMatchObject({ figure: { age: 'child' } });
    expect(script.cast[2]).toMatchObject({ count: 3 });
    expect(mended.join(' ')).toContain('"Doctor" is someone');
  });

  it('leaves as drawings what only sounds like someone', () => {
    const { script } = mendScript(
      page([
        // Something of someone's, a diagram inside a body, a life stage, a kind.
        thing('lungs', 'drawing', { name: "Person's lungs" }),
        thing('body', 'drawing', {
          name: 'Human',
          parts: [{ name: 'spleen', label: true }],
        }),
        thing('stage', 'drawing', { name: 'Adult' }),
        thing('blood', 'drawing', { name: 'Blood group' }),
      ]),
    );
    expect(script.cast.map((t) => t.kind)).toEqual([
      'drawing',
      'drawing',
      'drawing',
      'drawing',
    ]);
  });

  it('draws a drawing about someone as them: in bed, feeling as the brief says', () => {
    const { script, mended } = mendScript(
      page([
        thing('coma', 'drawing', {
          name: 'Coma and Death',
          brief:
            'A patient in a hospital bed, unresponsive, monitored by a machine with a flat line.',
        }),
        thing('early', 'drawing', {
          name: 'Early Symptoms',
          brief:
            'A simple outline of a person looking tired and weak, with a thermometer by the head.',
        }),
        thing('again', 'drawing', {
          name: 'Reinfection',
          brief:
            'A silhouette of a person is shown being bitten by two separate tsetse flies.',
        }),
        thing('pair', 'drawing', {
          name: 'Handshake',
          brief: 'Two people shaking hands in a clinic.',
        }),
      ]),
    );
    expect(script.cast).toMatchObject([
      {
        id: 'coma',
        kind: 'person',
        pose: 'in bed',
        signs: ['sleeping'],
        state: 'sad',
      },
      {
        id: 'early',
        kind: 'person',
        pose: 'holding',
        holding: 'thermometer',
        state: 'sad',
      },
      { id: 'again', kind: 'person', state: 'afraid' },
      { id: 'pair', kind: 'person', count: 2 },
    ]);
    // Shaking hands is not a shake.
    expect(script.cast[3]).not.toHaveProperty('signs');
    expect(mended.join(' ')).toContain('coma: its brief is about someone');
  });

  it("leaves as drawings the briefs about something of someone's", () => {
    const { script } = mendScript(
      page([
        thing('lungs', 'drawing', {
          name: 'Lungs',
          brief: "A person's lungs filling with air, in a cutaway.",
        }),
        thing('jab', 'drawing', {
          name: 'Injection',
          brief: "A doctor's hand holding a syringe against an arm.",
        }),
      ]),
    );
    expect(script.cast.map((t) => t.kind)).toEqual(['drawing', 'drawing']);
  });

  it('puts a person in bed when the writer says so, and a group never', () => {
    const { script } = mendScript(
      page([
        thing('mum', 'person', { pose: 'in bed' }),
        thing('team', 'person', { pose: 'in bed', count: 3 }),
      ]),
    );
    expect(script.cast[0]).toMatchObject({ pose: 'in bed' });
    expect(script.cast[1]).not.toHaveProperty('pose');
  });

  it('sends back to the writer a drawing that asks for people, and not one that asks for a part of someone', () => {
    const { problems } = mendScript(
      page([
        thing('progress', 'drawing', {
          name: 'Progression',
          brief:
            'Three panels: first a person falling asleep, then lying in bed, then a flat line.',
        }),
        thing('jab', 'drawing', {
          name: 'Injection',
          brief: "A doctor's hand holding a syringe against an arm.",
        }),
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"progress" asks the artist for people');
    expect(problems[0]).toContain('a person falling asleep');
    expect(peopleAskedFor("A person's lungs in a cutaway.")).toBeNull();
    // A brief that says there is no one asks for no one.
    expect(
      peopleAskedFor(
        'A brain glowing with electrical activity. No face or person attached.',
      ),
    ).toBeNull();
    expect(
      mentionsPeople('An empty clinic room, without people, a clock.'),
    ).toBe(false);
    expect(peopleAskedFor('No hands, but a patient in bed.')).toContain(
      'patient',
    );
  });

  it('tells the artist to leave out the people a brief mentions', () => {
    const { script, mended } = mendScript(
      page([
        thing('bed', 'drawing', {
          name: 'Hospital bed',
          brief: 'A hospital bed with a drip beside it, ready for a patient.',
        }),
        thing('heart', 'drawing', {
          name: 'Heart',
          brief: 'A cross-section of the human heart.',
        }),
      ]),
    );
    const [bed, heart] = script.cast;
    expect(bed.kind === 'drawing' && bed.brief).toContain(LEAVE_PEOPLE_OUT);
    expect(heart.kind === 'drawing' && heart.brief).toBe(
      'A cross-section of the human heart.',
    );
    expect(mended.join(' ')).toContain('bed: its brief mentions people');
    expect(mentionsPeople('two stick figures side by side')).toBe(true);
    expect(mentionsPeople('the human heart')).toBe(false);
  });

  it('mends what a person does: poses, signs and props on the lists', () => {
    const { script, mended } = mendScript(
      page([
        // As a model might write them.
        thing('doctor', 'person', {
          pose: 'Pointing' as never,
          signs: ['shaking', 'glowing', 'tingling_hands', 'shaking'] as never,
          holding: 'book',
        }),
        thing('nurse', 'person', { holding: 'syringe' }),
        thing('team', 'person', {
          count: 3,
          pose: 'lying',
          signs: ['walking'],
        }),
        thing('patient', 'person', {
          pose: 'in bed',
          signs: ['walking', 'fever', 'sweating', 'tears', 'rash', 'nausea'],
        }),
        thing('child', 'person', { pose: 'arms up', holding: 'ball' }),
      ]),
    );
    expect(script.cast).toMatchObject([
      {
        pose: 'pointing',
        signs: ['shaking', 'tingling hands'],
        holding: 'book',
      },
      // Something held, with no pose for it: held up.
      { pose: 'holding', holding: 'syringe' },
      // A group stands, and walks.
      { count: 3, signs: ['walking'] },
      // No one walks in bed; four signs at most.
      { pose: 'in bed', signs: ['fever', 'sweating', 'tears', 'rash'] },
      { pose: 'arms up' },
    ]);
    expect(script.cast[2]).not.toHaveProperty('pose');
    expect(script.cast[4]).not.toHaveProperty('holding');
    const said = mended.join(' ');
    expect(said).toContain('doctor: no sign "glowing"');
    expect(said).toContain('team: a group stands; not lying');
    expect(said).toContain('patient: in bed, so not walking');
    expect(said).toContain('child: no hand free for the ball');
  });

  it('reads what someone goes through from their caption and brief', () => {
    const { script } = mendScript(
      page([
        thing('shaking', 'person', { name: 'Seizure: shaking' }),
        thing('feeling', 'drawing', {
          name: 'Seizure: altered sensation',
          brief:
            'A person feeling a strange tingling in their hands and feet, looking puzzled.',
        }),
        thing('floor', 'drawing', {
          name: 'Tonic-clonic seizure',
          brief:
            'A person lying on the floor, their arms and legs jerking, unconscious.',
        }),
        thing('told', 'person', { name: 'Fever', signs: ['coughing'] }),
        thing('cartoon', 'drawing', {
          name: 'Seizure',
          brief:
            'A cartoon of a person experiencing a seizure: their body convulsing on the ground.',
        }),
      ]),
    );
    expect(script.cast).toMatchObject([
      { kind: 'person', signs: ['shaking'] },
      {
        kind: 'person',
        signs: ['tingling hands', 'tingling feet'],
        state: 'thinking',
      },
      { kind: 'person', pose: 'lying', signs: ['shaking', 'sleeping'] },
      // What the writer said is kept; the caption fills only what it left out.
      { kind: 'person', signs: ['coughing'] },
      { kind: 'person', pose: 'lying', signs: ['shaking'] },
    ]);
  });

  it('brings a sign on at the words that first show it, not before', () => {
    const cast = [
      thing('shaker', 'person', { name: 'Person shaking' }),
      thing('still', 'person', { name: 'Person shaking' }),
      // Listed and shown later: on at the words. Listed and hidden: on from the start.
      thing('listed', 'person', { signs: ['fever', 'sweating'] }),
    ];
    const draft = page(cast);
    draft.steps[1].effects = [
      { target: 'shaker.convulsing', do: 'show' },
      { target: 'shaker.pins and needles', do: 'show' },
      { target: 'listed.fever', do: 'show' },
      { target: 'listed.sweating', do: 'hide' },
    ];
    const { script, mended } = mendScript(draft);
    // Shown as the voice says it starts, not before; the other shakes from the start.
    expect(script.cast[0]).not.toHaveProperty('signs');
    expect(script.cast[1]).toMatchObject({ signs: ['shaking'] });
    expect(script.cast[2]).toMatchObject({ signs: ['sweating'] });
    expect(mended.join(' ')).toContain(
      'listed: fever on at the words that show it, not before',
    );
    // Another word for a sign is the sign.
    expect(script.steps.flatMap((step) => step.effects)).toEqual(
      expect.arrayContaining([
        { target: 'shaker', part: 'shaking', do: 'show' },
        { target: 'shaker', part: 'tingling hands', do: 'show' },
      ]),
    );
  });

  it('reads signs, a pose and a prop from words', () => {
    expect(doingIn('A child with a headache')).toEqual({
      signs: ['headache'],
      pose: 'hand on head',
      holding: null,
    });
    expect(doingIn('A man coughing into his hand').pose).toBe('hand on mouth');
    expect(doingIn('Pins and needles in the feet').signs).toEqual([
      'tingling feet',
    ]);
    expect(doingIn('An old man with a walking stick').signs).toEqual([]);
    expect(doingIn('Two people shaking hands').signs).toEqual([]);
    expect(doingIn('A feverish girl in bed')).toMatchObject({
      signs: ['fever', 'sweating'],
      pose: 'in bed',
    });
    expect(doingIn('A keeper carrying a lantern').holding).toBe('lantern');
    expect(doingIn('A girl reading').holding).toBe('book');
    expect(doingIn('A child getting an injection').holding).toBeNull();
    expect(doingIn('Person feeling strange').signs).toEqual([
      'tingling hands',
      'tingling feet',
    ]);
  });

  it('switches a sign on and off at the words, as a face, and draws only those shown', () => {
    const cast = [
      thing('patient', 'person', { signs: ['fever'] }),
      thing('nurse', 'person'),
    ];
    const draft = page(cast);
    draft.steps[1].effects = [
      { target: 'patient.shaking', do: 'show' },
      { target: 'patient.Tingling Hands', do: 'show' },
    ];
    draft.steps[2].effects = [
      { target: 'patient.shaking', do: 'hide' },
      { target: 'nurse.pain', do: 'show' },
    ];
    const { script } = mendScript(draft);
    const effects = script.steps.flatMap((step) => step.effects);
    expect(effects).toEqual(
      expect.arrayContaining([
        { target: 'patient', part: 'shaking', do: 'show' },
        { target: 'patient', part: 'tingling hands', do: 'show' },
        { target: 'patient', part: 'shaking', do: 'hide' },
        { target: 'nurse', part: 'pain', do: 'show' },
      ]),
    );
    // In the kit's order: what moves the body, then what sits on it.
    expect(signsShown(script, 'patient')).toEqual([
      'shaking',
      'tingling hands',
      'fever',
    ]);
    expect(signsShown(script, 'nurse')).toEqual([]);
  });

  it('takes a person a story knows for its character, drawn once for the book', () => {
    const { script, mended } = mendScript(
      page([thing('doctor', 'person', { name: 'Mira' })]),
      { characters: [{ id: 'mira', name: 'Mira', aliases: [] }] },
    );
    expect(script.cast[0]).toMatchObject({ kind: 'character', ref: 'mira' });
    expect(mended.join(' ')).toContain("the story's character mira");
  });
});

describe('timelines and charts, held to the page', () => {
  const page =
    'Scott set sail in 1910. Amundsen reached the pole in 1911, and Scott in 1912. Of the water a home uses, 34% goes on showers and 22% on the toilet.';
  const draft = (cast: SceneScriptDraft['cast']): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'The race to the pole',
    mood: 'curious',
    beats: [
      {
        say: 'Two teams raced to the South Pole.',
        pause: 'short',
        delivery: 'hook',
      },
      { say: 'Amundsen got there first.', pause: 'short', delivery: 'key' },
      { say: 'Scott arrived a month later.', pause: 'long', delivery: 'recap' },
    ],
    cast,
    steps: [
      step(0, 'Two teams', { layout: 'one', show: cast.map((c) => c.id) }),
    ],
  });

  it("keeps a timeline of the page's own dates, and sends back one it made up", () => {
    const good = mendScript(
      draft([
        thing('race', 'timeline', {
          timeline: [
            { when: '1910', name: 'Scott sets sail' },
            { when: '1911', name: 'Amundsen reaches the pole' },
          ],
        }),
      ]),
      { material: page },
    );
    expect(good.problems).toEqual([]);
    expect(good.script.cast[0]).toMatchObject({
      kind: 'timeline',
      timeline: { events: [{ when: '1910' }, { when: '1911' }] },
    });
    const made = mendScript(
      draft([
        thing('race', 'timeline', {
          timeline: [
            { when: '1910', name: 'Scott sets sail' },
            { when: '1913', name: 'The news reaches London' },
          ],
        }),
      ]),
      { material: page },
    );
    expect(made.problems.join(' ')).toContain(
      'dates the page does not give: 1913',
    );
  });

  it("keeps a chart of the page's own numbers, and sends back one it made up", () => {
    const good = mendScript(
      draft([
        thing('water', 'chart', {
          chart: {
            kind: 'bar',
            unit: '%',
            bars: [
              { label: 'Shower', value: 34 },
              { label: 'Toilet', value: 22 },
            ],
          },
        }),
      ]),
      { material: page },
    );
    expect(good.problems).toEqual([]);
    expect(good.script.cast[0]).toMatchObject({
      kind: 'chart',
      chart: { kind: 'bar', unit: '%' },
    });
    const made = mendScript(
      draft([
        thing('water', 'chart', {
          chart: {
            kind: 'bar',
            unit: '%',
            bars: [
              { label: 'Shower', value: 34 },
              { label: 'Garden', value: 9 },
            ],
          },
        }),
      ]),
      { material: page },
    );
    expect(made.problems.join(' ')).toContain(
      'numbers the page does not give: Garden 9',
    );
  });
});

describe("a story's places, as the scene behind the stage", () => {
  const places = [
    {
      id: 'quay',
      name: 'the quay',
      aliases: ['the harbour'],
      sound: 'water' as const,
    },
    { id: 'house', name: 'the blue house', aliases: [], sound: null },
  ];
  const characters = [{ id: 'mira', name: 'Mira', aliases: [] }];
  const draft = (): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'Home',
    mood: 'calm',
    beats: [
      { say: 'The quay is empty at dusk.', pause: 'short', delivery: 'hook' },
      { say: 'Mira walks along it.', pause: 'short', delivery: 'explain' },
      { say: 'Then she runs home.', pause: 'long', delivery: 'recap' },
    ],
    cast: [
      thing('harbour', 'place', { ref: 'The Harbour' }),
      thing('home', 'place', { ref: 'house' }),
      thing('atlantis', 'place', { ref: 'atlantis' }),
      thing('mira', 'character', { ref: 'mira' }),
    ],
    steps: [
      step(0, 'The quay', { layout: 'one', show: ['harbour'] }),
      step(1, 'Mira walks', { layout: 'row', show: ['harbour', 'mira'] }),
      step(2, 'runs home', { layout: 'one', show: ['home', 'mira'] }),
      step(2, 'she runs', { layout: 'one', show: ['atlantis', 'mira'] }),
    ],
  });

  it("reads a picture of one of the story's places as the place itself", () => {
    const { script } = mendScript(
      {
        ...draft(),
        cast: [
          thing('the-quay', 'drawing', { name: 'The Quay' }),
          thing('mira', 'character', { ref: 'mira' }),
        ],
        steps: [
          step(0, 'The quay', { layout: 'row', show: ['the-quay', 'mira'] }),
        ],
      },
      { characters, places },
    );
    expect(script.cast[0]).toMatchObject({ kind: 'place', ref: 'quay' });
    expect(script.steps[0].stage).toMatchObject({
      show: ['mira'],
      backdrop: 'the-quay',
    });
  });

  it('turns a place shown into the backdrop, and a place alone into the empty scene', () => {
    const { script, mended } = mendScript(draft(), { characters, places });
    expect(script.cast.filter((t) => t.kind === 'place')).toEqual([
      {
        id: 'harbour',
        kind: 'place',
        ref: 'quay',
        name: 'the quay',
        sound: 'water',
      },
      {
        id: 'home',
        kind: 'place',
        ref: 'house',
        name: 'the blue house',
        sound: null,
      },
    ]);
    expect(mended.join(' ')).toContain(
      '"atlantis" is not one of the story\'s places',
    );
    const [empty, walks, home] = script.steps.map((s) => s.stage);
    expect(empty).toEqual({
      layout: 'one',
      show: [],
      arrows: [],
      backdrop: 'harbour',
    });
    // A place never takes a slot: the row holds Mira alone.
    expect(walks).toMatchObject({ show: ['mira'], backdrop: 'harbour' });
    expect(home).toMatchObject({ show: ['mira'], backdrop: 'home' });
  });

  it('keeps who is on the stage when a place is shown alone after them', () => {
    const later = draft();
    later.steps = [
      step(0, 'The quay', { layout: 'row', show: ['mira'] }),
      // The writer shows the place in a step of its own, after Mira.
      step(1, 'Mira walks', { layout: 'one', show: ['harbour'] }),
      step(2, 'she runs', { effects: [{ target: 'mira.happy', do: 'show' }] }),
    ];
    const { script, mended } = mendScript(later, { characters, places });
    expect(script.steps[1].stage).toMatchObject({
      show: ['mira'],
      backdrop: 'harbour',
    });
    // So what happens to her later is still on the stage.
    expect(script.steps[2].effects).toEqual([
      { target: 'mira', part: 'happy', do: 'show' },
    ]);
    expect(mended.join(' ')).toContain(
      'the place goes behind who is on the stage',
    );
  });
});

describe('who comes and goes, and what they do, as the narration says', () => {
  const characters = [
    { id: 'musa', name: 'Musa', aliases: [], voice: 'boy' as const },
    { id: 'zainab', name: 'Zainab', aliases: [], voice: 'girl' as const },
    { id: 'baba', name: 'Baba Sule', aliases: [], voice: 'old man' as const },
  ];
  const say = (text: string) => ({
    say: text,
    pause: 'short' as const,
    delivery: 'explain' as const,
  });
  const page = (): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'The lost goat',
    mood: 'calm',
    beats: [
      say('Musa sat outside the shop.'),
      say('Zainab ran up the path.'),
      say('Musa put his arm around her.'),
      say('Just then, Baba Sule came along the road.'),
      say('Zainab hugged Baba Sule.'),
      say('Baba Sule laughed and walked off down the road.'),
      say('Musa and Zainab smiled at each other.'),
    ],
    cast: [
      thing('musa', 'character', { ref: 'musa' }),
      thing('zainab', 'character', { ref: 'zainab' }),
      thing('baba', 'character', { ref: 'baba' }),
    ],
    steps: [
      step(0, 'Musa sat', { layout: 'one', show: ['musa'] }),
      step(1, 'Zainab ran up', { layout: 'row', show: ['musa', 'zainab'] }),
      // The writer never brings Baba Sule on.
      step(6, 'Musa and Zainab', { layout: 'row', show: ['musa', 'zainab'] }),
    ],
  });

  it('walks someone on at the words that bring them, and off at the words that take them', () => {
    const { script, mended } = mendScript(page(), { characters });
    expect(
      script.steps.map((s) => [s.at.beat, s.word, s.stage?.show ?? null]),
    ).toEqual([
      [0, 0, ['musa']],
      // Zainab runs up where the writer brought her: left as it is.
      [1, 0, ['musa', 'zainab']],
      [3, 4, ['musa', 'zainab', 'baba']],
      [5, 4, ['musa', 'zainab']],
    ]);
    expect(mended).toEqual(
      expect.arrayContaining([
        'baba comes at "came along the road.", as the words say',
        'baba leaves at "walked off down the", as the words say',
      ]),
    );
    // Marked, so they walk on and off rather than cut.
    expect(script.steps[2].stage?.arrive).toEqual(['baba']);
    expect(script.steps[3].stage?.leave).toEqual(['baba']);
  });

  it('keeps someone on who came, among the people the writer shows, until they go', () => {
    const later = page();
    later.beats[5] = say('Baba Sule laughed.');
    later.steps[2] = step(6, 'Musa and Zainab', {
      layout: 'row',
      show: ['zainab', 'musa'],
    });
    const { script } = mendScript(later, { characters });
    expect(script.steps[script.steps.length - 1].stage?.show).toEqual([
      'zainab',
      'musa',
      'baba',
    ]);
  });

  it('writes down what each sentence says they do', () => {
    const { script } = mendScript(page(), { characters });
    expect(script.beats.map((beat) => beat.acts ?? [])).toEqual([
      [],
      [],
      // "her" is Zainab: the last girl mentioned.
      [{ at: 5, who: 'musa', do: 'hug', toward: 'zainab' }],
      [],
      [{ at: 7, who: 'zainab', do: 'hug', toward: 'baba' }],
      [{ at: 10, who: 'baba', do: 'laugh', toward: null }],
      [],
    ]);
  });

  it('shows whoever speaks, cut in where they were all along, unless they speak from elsewhere or have gone', () => {
    const talk = page();
    talk.beats = [
      say('Musa sat outside the shop.'),
      say('"Is that you, Zainab?" asks Musa.'),
      say('"It is me," says Zainab.'),
      say('"Come and eat," Baba Sule calls from the house.'),
      say('Zainab waves and runs off down the road.'),
      say('"See you tomorrow!" Zainab shouts.'),
    ];
    talk.steps = [step(0, 'Musa sat', { layout: 'one', show: ['musa'] })];
    const { script, mended } = mendScript(talk, { characters });
    expect(
      script.steps.map((s) => [
        s.at.beat,
        s.word,
        s.stage?.show,
        s.stage?.cutIn,
      ]),
    ).toEqual([
      [0, 0, ['musa'], undefined],
      // Zainab answers: shown as she speaks.
      [2, 0, ['musa', 'zainab'], ['zainab']],
      // Baba Sule calls from the house: not shown. Zainab runs off, and
      // shouts from off the stage.
      [4, 3, ['musa'], undefined],
    ]);
    expect(mended).toEqual(
      expect.arrayContaining([
        'zainab is shown as they speak, at ""It is me," says"',
      ]),
    );
  });

  it('marks where the words bring someone on, when the writer brings them there', () => {
    const { script } = mendScript(page(), { characters });
    // "Zainab ran up the path": the writer's own step brings her; she arrives.
    expect(script.steps[1].stage?.arrive).toEqual(['zainab']);
    expect(script.steps[0].stage?.arrive).toBeUndefined();
  });

  it('gives a place the sound of how it looks, when the story gave it none', () => {
    const { script } = mendScript(
      {
        ...page(),
        cast: [...page().cast, thing('yard', 'place', { ref: 'yard' })],
        steps: [step(0, 'Musa sat', { layout: 'one', show: ['yard', 'musa'] })],
      },
      {
        characters,
        places: [
          {
            id: 'yard',
            name: 'the yard',
            aliases: [],
            sound: null,
            look: 'a yard at night, a warm fire burning',
          },
        ],
      },
    );
    expect(script.cast.find((t) => t.id === 'yard')).toMatchObject({
      sound: 'fire',
    });
  });
});

describe("a story's characters kept in their own words", () => {
  const characters = [
    { id: 'ada', name: 'Ada', aliases: [], voice: 'girl' as const },
    {
      id: 'nana',
      name: 'Nana Efua',
      aliases: ['Nana'],
      voice: 'old woman' as const,
    },
  ];
  const material = [
    '"Tell us a story, Nana," said Ada.',
    'Nana Efua laughed. "Tonight I will tell you about the moon."',
    '"The moon?" asked Ada.',
  ].join('\n\n');
  const page = (says: string[]): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'By the fire',
    mood: 'calm',
    beats: says.map((say) => ({
      say,
      pause: 'short' as const,
      delivery: 'explain' as const,
    })),
    cast: [
      thing('ada', 'character', { ref: 'ada' }),
      thing('nana', 'character', { ref: 'nana' }),
    ],
    steps: [step(0, 'Ada', { layout: 'row', show: ['ada', 'nana'] })],
  });

  it('sends back a page that tells what they say as reported speech', () => {
    const { problems } = mendScript(
      page([
        'Ada asks Nana Efua for a story.',
        'Nana Efua laughs and says, tonight I will tell you about the moon.',
        'Ada asks in surprise, does the moon have a story too?',
      ]),
      { characters, material },
    );
    expect(problems.join(' ')).toContain(
      'The story\'s characters speak on this page ("Tell us a story, Nana,"), but your sentences quote no one',
    );
  });

  it('lets a page quote only the lines that matter', () => {
    const { problems } = mendScript(
      page([
        'Ada wants a story.',
        'Nana Efua laughs. "Tonight I will tell you about the moon."',
        'Ada is surprised.',
      ]),
      { characters, material },
    );
    expect(problems).toEqual([]);
  });
});

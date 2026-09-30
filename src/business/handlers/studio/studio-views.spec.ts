import {
  bibleOf,
  briefOf,
  explainerSheetOf,
  mendExplainerLines,
  storySheetOf,
} from '../../domain/studio/studio';
import { describeBrief, describeScene } from '../../domain/studio/studio-words';
import { recipeFor } from '../../domain/studio/studio-audience';
import { carriedWears } from '../../domain/studio/studio-check';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioSceneRecord,
} from '../../repositories/studio.repository';
import {
  blockersOf,
  briefDto,
  explainerCard,
  messageDto,
  needsMaking,
  sceneFingerprint,
} from './studio-views';

const brief = briefOf({
  format: 'story',
  idea: 'A lost dog',
  audience: 'children',
  minutes: 1,
  tone: 'funny',
});
const bible = bibleOf({
  characters: [
    { name: 'Tobi', voice: 'boy', figure: { age: 'child' } },
    { name: 'Bingo', kind: 'animal', voice: 'creature', look: 'a brown dog' },
  ],
  sets: [{ name: 'Market' }],
});
const sheet = storySheetOf({
  title: 'Lost',
  set: 'market',
  onStage: [{ who: 'tobi', spot: 'left' }],
  beats: [
    { kind: 'narration', say: 'The market is busy.' },
    { kind: 'line', who: 'tobi', say: 'Where is Bingo?', feeling: 'afraid' },
  ],
});

const episode = (
  patch: Partial<StudioEpisodeRecord> = {},
): StudioEpisodeRecord => ({
  id: 'e1',
  showId: 's1',
  userId: 'u1',
  number: 1,
  title: 'Lost',
  logline: null,
  phase: 'script',
  busy: null,
  error: null,
  outline: null,
  shareToken: null,
  durationMs: null,
  thumbKey: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...patch,
});
const scene = (patch: Partial<StudioSceneRecord> = {}): StudioSceneRecord => ({
  id: 'c1',
  episodeId: 'e1',
  position: 0,
  sheet,
  sheetHash: null,
  problems: [],
  previousSheet: null,
  status: 'ready',
  step: null,
  error: null,
  sceneKey: null,
  audioKey: null,
  thumbKey: null,
  madeHash: null,
  durationMs: null,
  updatedAt: new Date(),
  ...patch,
});

describe('the Studio, as the app sees it', () => {
  it('makes a scene again only when it, or anyone in it, changed since it was made', () => {
    const made = scene({
      status: 'made',
      sceneKey: 'k',
      madeHash: sceneFingerprint(sheet, bible, brief),
    });
    expect(needsMaking(made, bible, brief)).toBe(false);
    expect(needsMaking(scene(), bible, brief)).toBe(true);
    // Tobi's look changed: his scene is made again; Bingo's would not be.
    const older = bibleOf({
      ...bible,
      characters: bible.characters.map((c) =>
        c.id === 'tobi' ? { ...c, figure: { ...c.figure!, hair: 'afro' } } : c,
      ),
    });
    expect(needsMaking(made, older, brief)).toBe(true);
    const animal = bibleOf({
      ...bible,
      characters: bible.characters.map((c) =>
        c.id === 'bingo' ? { ...c, look: 'a black dog' } : c,
      ),
    });
    expect(needsMaking(made, animal, brief)).toBe(false);
  });

  it('says in plain words why an episode cannot be made, never for a slip of the writer', () => {
    expect(
      blockersOf(episode({ phase: 'cast' }), [scene()], bible, brief)[0],
    ).toMatch(/Approve the outline and the cast/);
    expect(
      blockersOf(episode({ busy: 'make' }), [scene()], bible, brief),
    ).toEqual(['The film is being made now.']);
    const broken = scene({
      problems: [
        {
          rule: 'speaker',
          message: 'No one says beat 2.',
          beat: 1,
          level: 'error',
        },
        { rule: 'length', message: 'Long.', beat: null, level: 'warning' },
      ],
    });
    // What the writer got wrong is the Studio's to put right, not the maker's.
    expect(blockersOf(episode(), [broken], bible, brief)).toEqual([]);
    expect(blockersOf(episode(), [scene()], bible, brief)).toEqual([]);
  });

  it("changes an explainer's sentences by hand, what they bring on kept with the next one kept", () => {
    const lesson = explainerSheetOf({
      kind: 'explainer',
      title: 'Forces',
      draft: {
        fit: 'good',
        fitReason: null,
        title: 'Forces',
        mood: 'curious',
        beats: [
          {
            say: 'A force is a push or a pull.',
            pause: 'short',
            delivery: 'explain',
          },
          {
            say: 'It is measured in newtons.',
            pause: 'short',
            delivery: 'explain',
          },
          {
            say: 'Bigger forces speed things up faster.',
            pause: 'long',
            delivery: 'key',
          },
        ],
        cast: [],
        steps: [
          {
            beat: 0,
            phrase: 'A force',
            layout: 'one',
            show: ['push'],
            arrows: null,
            effects: null,
          },
          {
            beat: 1,
            phrase: 'newtons',
            layout: 'one',
            show: ['unit'],
            arrows: null,
            effects: null,
          },
        ],
      },
    });
    const next = mendExplainerLines(lesson, {
      lines: [
        { index: 0, say: 'A force is a push or a pull on something.' },
        { index: 2, say: 'Bigger forces speed things up faster.' },
        { index: null, say: 'Try it with a trolley.' },
      ],
    });
    expect(next.draft.beats.map((b) => b.say)).toEqual([
      'A force is a push or a pull on something.',
      'Bigger forces speed things up faster.',
      'Try it with a trolley.',
    ]);
    // The unit came on with the sentence taken out: it comes on with the next one kept.
    expect(next.draft.steps.map((s) => [s.beat, s.show])).toEqual([
      [0, ['push']],
      [1, ['unit']],
    ]);
    expect(explainerCard(next, null).lines.map((l) => l.say)).toHaveLength(3);
  });

  it('sends each message with its episode and kind; one kept from before events is something said', () => {
    const at = new Date('2026-09-26T10:00:00Z');
    const message = (
      patch: Partial<StudioMessageRecord>,
    ): StudioMessageRecord => ({
      id: 'm1',
      showId: 's1',
      episodeId: 'e1',
      role: 'assistant',
      content: 'Scene 2 written again: “Home”',
      meta: null,
      createdAt: at,
      ...patch,
    });
    const event = {
      what: 'scene' as const,
      step: 'script' as const,
      sceneId: 'c2',
      line: 'Scene 2 written again: “Home”',
    };
    expect(
      messageDto(message({ meta: { kind: 'event', event } })),
    ).toMatchObject({
      episodeId: 'e1',
      kind: 'event',
      event,
      choices: [],
      refused: false,
    });
    const old = messageDto(
      message({ episodeId: null, meta: { choices: ['Funny'] } }),
    );
    expect(old).toMatchObject({
      episodeId: null,
      kind: 'say',
      event: null,
      choices: ['Funny'],
      createdAt: at.toISOString(),
    });
  });

  it("holds an explainer's scene to its seconds, not a page's length", () => {
    const said = describeScene('middle', 20);
    expect(said).toMatch(/about 20 seconds: about 48 spoken words/);
    expect(said).not.toMatch(/150 to 250/);
  });

  it("tells an explainer's writer its audience's recipe, and whether the scene asks a question", () => {
    const recipe = recipeFor({ band: 'primary-upper', prior: 'new' });
    const said = describeScene('early', 30, {
      recipe,
      check: true,
      said: 'Grade 5',
    });
    expect(said).toMatch(/eight to eleven[^\n]*The maker said "Grade 5"\./);
    expect(said).toMatch(/Sentences of 5 to 13 words/);
    expect(said).toMatch(/delivery "question"/);
    expect(said).toMatch(/one worked example for each idea/);
    expect(said).toMatch(/about 30 seconds: about 72 spoken words/);
  });

  it("gives the brief's audience as the maker said it, and how to teach them", () => {
    const words = describeBrief(
      briefOf({
        format: 'explainer',
        idea: 'Blood pressure',
        who: { band: 'university', said: 'First-year nursing', prior: 'new' },
      }),
    );
    expect(words).toContain(
      'Audience: adults (college and university): First-year nursing · new to it',
    );
    expect(words).toMatch(/Teaching them:\n.*college or university/);
    // Four words alone, as before.
    expect(describeBrief(briefOf({ audience: 'teens' }))).toContain(
      'Audience: teens (secondary school)',
    );
  });

  it("marks an explainer's scene to be made again when whom it teaches changes, and not before", () => {
    const sheet = explainerSheetOf({
      kind: 'explainer',
      title: 'A',
      draft: null,
    });
    const plain = briefOf({ format: 'explainer', audience: 'children' });
    const said = briefOf(
      { who: { band: 'primary-upper', said: 'Grade 5' } },
      plain,
    );
    expect(sceneFingerprint(sheet, null, plain)).toBe(
      sceneFingerprint(sheet, null, briefOf({}, plain)),
    );
    expect(sceneFingerprint(sheet, null, said)).not.toBe(
      sceneFingerprint(sheet, null, plain),
    );
    expect(briefDto(said).who).toEqual({
      band: 'primary-upper',
      said: 'Grade 5',
    });
    expect(briefDto(plain).who).toBeUndefined();
  });
});

describe('clothes carried from one scene into the next', () => {
  const coatBible = bibleOf({
    characters: [
      { name: 'Mama', voice: 'woman', figure: { age: 'adult', top: 'dress' } },
    ],
    things: [{ id: 'coat', name: 'coat', kind: 'thing', look: 'red' }],
    sets: [{ id: 'hall', name: 'Hall' }],
  });
  const next = storySheetOf({
    title: 'Out',
    set: 'hall',
    onStage: [{ who: 'mama', spot: 'centre' }],
    beats: [
      { kind: 'line', who: 'mama', say: 'Brr.' },
      { kind: 'line', who: 'mama', say: 'So cold.' },
    ],
  });
  const withCoat = storySheetOf({
    title: 'Coat on',
    set: 'hall',
    onStage: [{ who: 'mama', spot: 'centre', holding: 'coat' }],
    beats: [
      { kind: 'line', who: 'mama', say: 'It is cold out.' },
      {
        kind: 'business',
        who: 'mama',
        do: 'dress',
        thing: 'coat',
        say: 'Mama puts on her red coat.',
      },
    ],
  });

  it('marks the next scene changed once the one before leaves someone dressed otherwise', () => {
    const plain = storySheetOf({
      ...withCoat,
      beats: withCoat.beats.slice(0, 1),
    });
    const rows = (first: typeof withCoat) => [
      { position: 0, sheet: first },
      { position: 1, sheet: next },
    ];
    // No scene changes clothes: nothing carried, the fingerprint as before.
    expect(carriedWears(rows(plain), coatBible).size).toBe(0);
    const carried = carriedWears(rows(withCoat), coatBible).get(1)!;
    expect(carried).toMatchObject([{ who: 'mama', figure: { top: 'coat' } }]);
    expect(carried).toHaveLength(1);
    const made = sceneFingerprint(next, coatBible, brief);
    const row = {
      sheet: next,
      status: 'made',
      sceneKey: 'k',
      madeHash: made,
    } as StudioSceneRecord;
    expect(needsMaking(row, coatBible, brief)).toBe(false);
    expect(needsMaking(row, coatBible, brief, carried)).toBe(true);
  });

  it('leaves a film made before clothes were put on as it was: words that someone wears something change nothing', () => {
    // An old episode: no one puts anything on; the words only say it.
    const said = storySheetOf({
      ...withCoat,
      onStage: [{ who: 'mama', spot: 'centre' }],
      beats: [
        { kind: 'narration', say: 'Mama is wearing her red coat.' },
        { kind: 'line', who: 'mama', say: 'It is cold out.' },
      ],
    });
    const rows = [
      { position: 0, sheet: said },
      { position: 1, sheet: next },
    ];
    expect(carriedWears(rows, coatBible).size).toBe(0);
    const row = {
      sheet: next,
      status: 'made',
      sceneKey: 'k',
      madeHash: sceneFingerprint(next, coatBible, brief),
    } as StudioSceneRecord;
    expect(
      needsMaking(row, coatBible, brief, carriedWears(rows, coatBible).get(1)),
    ).toBe(false);
  });
});

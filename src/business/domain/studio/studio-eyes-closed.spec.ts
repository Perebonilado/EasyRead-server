import { oneFaceAtATime } from '../scene-compose';
import { facesShown, type SceneThing } from '../scene-script';
import { STUDIO_FACES, bibleOf, storySheetOf, type StorySheet } from './studio';
import { mendSheet, repairSheet, withFound } from './studio-check';
import { stageStory } from './studio-stage';
import { describeStaged } from './studio-staged';
import { voiced } from './__fixtures__/voiced';

/**
 * "When David strikes Goliath, make him lie down with his eyes closed":
 * the face "eyes closed" on the writer's menu, put on by the mend where
 * the words shut someone's eyes, drawn on the stage, and seen by the
 * check that the film shows what the maker asked for.
 */

const CLOSED = 'eyes closed';
const bible = bibleOf({
  characters: [
    { name: 'David', voice: 'boy', figure: { age: 'child' } },
    { name: 'Goliath', voice: 'man', figure: { age: 'adult', build: 'broad' } },
  ],
  sets: [
    {
      id: 'valley',
      name: 'the valley',
      kind: 'outdoor',
      look: 'a wide green valley between two hills',
    },
  ],
});

const sheetOf = (beats: Record<string, unknown>[]): StorySheet =>
  storySheetOf({
    title: 'The giant falls',
    set: 'valley',
    onStage: [
      { who: 'david', spot: 'left' },
      { who: 'goliath', spot: 'right' },
    ],
    beats,
  });

/** The writer's sheet as the mend puts it right. */
const mended = (beats: Record<string, unknown>[]) =>
  mendSheet(sheetOf(beats), bible);
/** And as the stage is given it: repaired, then mended. */
const staged = (beats: Record<string, unknown>[]) =>
  mendSheet(repairSheet(sheetOf(beats), bible), bible);

describe('the face "eyes closed" for the Studio', () => {
  it("is on the writer's menu, and a sheet keeps it", () => {
    expect(STUDIO_FACES).toContain(CLOSED);
    const sheet = storySheetOf({
      title: 'Asleep on his feet',
      set: 'valley',
      onStage: [{ who: 'goliath', spot: 'right', face: CLOSED }],
      beats: [{ kind: 'reaction', who: 'goliath', feeling: CLOSED }],
    });
    expect(sheet.onStage[0].face).toBe(CLOSED);
    expect(sheet.beats[0].feeling).toBe(CLOSED);
  });

  it('closes the eyes of one who falls, knocked out, as the words say', () => {
    const { sheet, mended: notes } = mended([
      {
        kind: 'line',
        who: 'david',
        say: 'This is for my people!',
        feeling: 'angry',
      },
      {
        kind: 'action',
        who: 'goliath',
        do: 'fall',
        say: 'Goliath falls to the ground, knocked out.',
      },
      { kind: 'narration', say: 'The valley goes quiet.' },
    ]);
    const k = sheet.beats.findIndex(
      // "Falls to the ground": a hard fall, down until they get up.
      (b) => b.who === 'goliath' && b.do === 'fall-hard',
    );
    expect(k).toBeGreaterThan(-1);
    expect(sheet.beats[k + 1]).toMatchObject({
      kind: 'reaction',
      who: 'goliath',
      feeling: CLOSED,
    });
    expect(notes.join('\n')).toMatch(/Goliath's eyes close, as the words say/);
  });

  it('never closes them twice when the writer did', () => {
    const { sheet } = mended([
      {
        kind: 'action',
        who: 'goliath',
        do: 'lie-down',
        say: 'Goliath lies down, his eyes closed.',
      },
      { kind: 'reaction', who: 'goliath', feeling: CLOSED },
    ]);
    expect(
      sheet.beats.filter((b) => b.kind === 'reaction' && b.who === 'goliath'),
    ).toHaveLength(1);
  });

  it('reads "lies still, eyes closed" as their eyes shut, never a nod', () => {
    const { sheet } = mended([
      {
        kind: 'action',
        who: 'goliath',
        do: 'still',
        say: 'Goliath lies still, eyes closed.',
      },
    ]);
    expect(sheet.beats.some((b) => b.who === 'goliath' && b.do === 'nod')).toBe(
      false,
    );
    expect(
      sheet.beats.some(
        (b) =>
          b.kind === 'reaction' && b.who === 'goliath' && b.feeling === CLOSED,
      ),
    ).toBe(true);
  });

  it('never takes eyes closed for a door or a gate closed', () => {
    const { sheet } = mended([
      {
        kind: 'action',
        who: 'goliath',
        do: 'lie-down',
        say: 'Goliath lies down and closes his eyes.',
      },
    ]);
    expect(sheet.beats.map((b) => b.do ?? b.feeling)).toEqual([
      'lie-down',
      CLOSED,
    ]);
  });

  it('gives a reaction with no face the eyes closed its words say', () => {
    const { sheet } = mended([
      { kind: 'reaction', who: 'goliath', say: 'Goliath is out cold.' },
    ]);
    expect(sheet.beats[0].feeling).toBe(CLOSED);
  });
});

describe('the eyes closed on the stage, and in what the film shows', () => {
  const made = staged([
    { kind: 'line', who: 'david', say: 'For my people!', feeling: 'angry' },
    {
      kind: 'action',
      who: 'goliath',
      do: 'fall',
      say: 'Goliath falls to the ground, knocked out.',
    },
    { kind: 'narration', say: 'The whole valley goes quiet.' },
    { kind: 'line', who: 'david', say: 'It is over.', feeling: 'sad' },
  ]);
  const { sheet } = made;
  const shown = withFound(bible, sheet.set, made);
  const script = stageStory(sheet, shown);
  const film = voiced(script).scene;

  it('draws the face for the one who wears it, and for no one else', () => {
    expect(facesShown(script, 'goliath')).toEqual([CLOSED]);
    expect(facesShown(script, 'david')).toEqual([]);
    const goliath = film.things.find((t) => t.id === 'goliath');
    expect(goliath?.kind === 'drawing' && goliath.states[CLOSED]).toBe(
      'eyes-closed',
    );
  });

  it('shows it after the fall, and keeps it on while David speaks', () => {
    const fall = film.acting?.goliath?.moves?.find(
      ([, move]) => move === 'fall-hard',
    );
    const closed = film.effects.find(
      (e) => e.target === 'goliath' && e.part === CLOSED && e.do === 'show',
    );
    expect(closed).toBeDefined();
    expect(fall).toBeDefined();
    expect(closed!.atMs).toBeGreaterThanOrEqual(fall![0]);
    expect(
      film.effects.some(
        (e) => e.target === 'goliath' && e.part === CLOSED && e.do === 'hide',
      ),
    ).toBe(false);
  });

  it('is seen by the check: the eyes shut, calm, no Zs', () => {
    const said = describeStaged(sheet, film, shown).lines.join('\n');
    expect(said).toMatch(/Goliath has their eyes closed: shut and calm, no Zs/);
  });

  it('falls back to the calm face on one drawn without it', () => {
    const cast = [
      { id: 'pip', kind: 'character', state: 'neutral', signs: [] },
    ] as unknown as SceneThing[];
    const steps = [{ atMs: 0, show: ['pip'] }] as unknown as Parameters<
      typeof oneFaceAtATime
    >[2];
    const effects = oneFaceAtATime(
      [{ atMs: 1000, target: 'pip', part: CLOSED, do: 'show' }],
      cast,
      steps,
      () => true,
      new Map(),
      (_, state) => state !== CLOSED,
    );
    expect(effects.some((e) => e.part === CLOSED)).toBe(false);
    const kept = oneFaceAtATime(
      [{ atMs: 1000, target: 'pip', part: CLOSED, do: 'show' }],
      cast,
      steps,
    );
    expect(kept.filter((e) => !e.filler).map((e) => [e.part, e.do])).toEqual([
      ['neutral', 'hide'],
      [CLOSED, 'show'],
    ]);
  });
});

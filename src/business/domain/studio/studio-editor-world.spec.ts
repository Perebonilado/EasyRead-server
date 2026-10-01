import { bibleOf, type StorySheet } from './studio';
import { worldOf } from './studio-editor';
import {
  storyWorldOf,
  withWorldPlaces,
  worldBible,
  worldSetLayout,
} from './studio-editor-world';
import { storyBibleFor } from './studio-stage';
import { illustratedJoin, joinFor } from './studio-edit';

const world = worldOf({
  era: '1950s',
  places: [
    {
      name: 'The assembly chamber',
      kind: 'hall',
      time: 'day',
      look: 'tiered benches',
    },
    { name: 'The race course', kind: 'field', time: 'night' },
    { name: 'A village school', kind: 'classroom' },
  ],
  people: [
    {
      name: 'A delegate',
      role: 'speaks for the north',
      likeness: 'tall, in a white robe and cap',
      voice: 'man',
      figure: {
        age: 'adult',
        top: 'kaftan',
        headwear: 'kufi',
        topColour: 'white',
      },
    },
    { name: 'A student', role: 'sketches the flag', figure: { age: 'teen' } },
  ],
  things: [{ name: 'The flag', look: 'green and white stripes' }],
});

describe("the editor's world, as the stage draws it", () => {
  it('builds each kind of place from the kit, indoors or out, in its era', () => {
    expect(worldSetLayout(world.places[0], world)).toMatchObject({
      ground: 'wood',
      sky: 'day',
      weather: 'clear',
    });
    expect(worldSetLayout(world.places[1], world)).toMatchObject({
      ground: 'grass',
      backdrop: 'fields',
      sky: 'night',
    });
    // A school before whiteboards has a blackboard.
    const school = worldSetLayout(world.places[2], world);
    expect(JSON.stringify(school)).toMatch(/blackboard/);
    expect(
      JSON.stringify(
        worldSetLayout(world.places[2], { ...world, era: 'today' }),
      ),
    ).toMatch(/whiteboard/);
  });

  it('never gives a place a region its world did not say', () => {
    expect(storyWorldOf(world)).toEqual({
      era: '1945–1975',
      region: '',
      culture: '',
      landscape: '',
      homes: '',
    });
  });

  it("makes the show's bible: its people the kit's, its places sets, its host kept", () => {
    const before = bibleOf({
      characters: [
        {
          name: 'Ada',
          id: 'ada',
          voice: 'woman',
          host: true,
          figure: { age: 'adult' },
        },
        { name: 'Old clip person', voice: 'man' },
      ],
      subject: 'old',
    });
    const bible = bibleOf(
      worldBible(world, before, {
        subject: 'history: independence',
        maths: false,
      }),
    );
    expect(bible.characters.map((c) => [c.id, c.role, c.voice])).toEqual([
      ['ada', 'supporting', 'woman'],
      ['a-delegate', 'main', 'man'],
      ['a-student', 'main', 'girl'],
    ]);
    expect(bible.characters[0].host).toBe(true);
    expect(bible.characters[1].figure).toMatchObject({
      top: 'kaftan',
      headwear: 'kufi',
    });
    expect(bible.sets.map((s) => [s.id, s.kind])).toEqual([
      ['the-assembly-chamber', 'indoor'],
      ['the-race-course', 'outdoor'],
      ['a-village-school', 'indoor'],
    ]);
    expect(bible.subject).toBe('history: independence');
    expect(bible.pictures[0].name).toBe('The flag');
  });

  it('gives its places their layouts for the illustrated scenes, no painter asked', () => {
    const bible = bibleOf(
      worldBible(world, null, { subject: 'x', maths: false }),
    );
    const story = withWorldPlaces(storyBibleFor(bible, [], 'Show'), world);
    for (const place of story.places) {
      expect(place.layout).toBeDefined();
      expect(place.once).toBeUndefined();
    }
  });
});

describe('the joins of illustrated scenes', () => {
  const shot = (set: string, transition: 'cut' | 'fade' = 'cut') =>
    ({ kind: 'story', set, transition }) as unknown as StorySheet;
  const lesson = {
    kind: 'explainer',
    transition: 'cut',
    title: 'x',
    draft: { beats: [], cast: [], steps: [] },
  } as never;
  const illustrated = {
    kind: 'illustrated' as const,
    title: '',
    summary: '',
    teach: null,
    points: [],
  };
  const plain = { title: '', summary: '', teach: null, points: [] };

  it('cut between two shots of one place, dissolve elsewhere, dip where time passes', () => {
    expect(
      illustratedJoin(
        { sheet: shot('hall'), scene: illustrated },
        { sheet: shot('hall'), scene: illustrated },
      ),
    ).toEqual({ join: 'cut' });
    expect(
      illustratedJoin(
        { sheet: shot('hall'), scene: illustrated },
        { sheet: shot('field'), scene: illustrated },
      ),
    ).toEqual({ join: 'dissolve' });
    expect(
      illustratedJoin(
        { sheet: shot('hall'), scene: illustrated },
        { sheet: shot('hall', 'fade'), scene: illustrated },
      ),
    ).toEqual({ join: 'dip' });
  });

  it('dissolve into and out of a lesson, and leave every other join alone', () => {
    expect(
      joinFor(
        { sheet: lesson, scene: plain },
        { sheet: shot('hall'), scene: illustrated },
      ),
    ).toEqual({ join: 'dissolve' });
    expect(
      joinFor(
        { sheet: shot('hall'), scene: illustrated },
        { sheet: lesson, scene: plain },
      ),
    ).toEqual({ join: 'dissolve' });
    expect(
      illustratedJoin(
        { sheet: lesson, scene: plain },
        { sheet: lesson, scene: plain },
      ),
    ).toBeNull();
  });
});

import { bibleOf, type StorySheet } from './studio';
import { worldOf } from './studio-editor';
import {
  onShowMap,
  pinOnShowMap,
  storyWorldOf,
  withWorldPlaces,
  worldBible,
  worldColours,
  worldSetLayout,
} from './studio-editor-world';
import { explainerSheetOf } from './studio';
import { storyBibleFor } from './studio-stage';
import { illustratedJoin, joinFor } from './studio-edit';
import { readMap } from '../scene-map';

// Each place and person with a claim of the research, as every world's
// are (worldOf leaves out one with none).
const world = worldOf({
  era: '1950s',
  places: [
    {
      name: 'The assembly chamber',
      kind: 'hall',
      time: 'day',
      look: 'tiered benches',
      claims: ['c1'],
    },
    {
      name: 'The race course',
      kind: 'field',
      time: 'night',
      claims: ['c2'],
    },
    { name: 'A village school', kind: 'classroom', claims: ['c3'] },
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
      claims: ['c4'],
    },
    {
      name: 'A student',
      role: 'sketches the flag',
      figure: { age: 'teen' },
      claims: ['c5'],
    },
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

describe("a lesson in the show's colours, on its one map", () => {
  const mapped = worldOf({
    palette: [
      { thing: 'East Germany', token: 'chart1' },
      { thing: 'West Germany', token: 'chart0' },
    ],
    held: { token: 'accent', for: 'the wall falls' },
    map: {
      region: 'Germany',
      groups: [
        { name: 'East Germany', members: ['Saxony', 'Brandenburg'] },
        { name: 'West Germany', members: ['Bavaria', 'Hesse'] },
      ],
      year: 1961,
    },
  });
  const sheet = explainerSheetOf({
    kind: 'explainer',
    title: 'Divided',
    draft: {
      fit: 'good',
      fitReason: null,
      title: 'Divided',
      mood: 'curious',
      beats: [
        { say: 'One country became two.', pause: 'short', delivery: 'explain' },
      ],
      cast: [
        {
          id: 'map',
          kind: 'map',
          name: 'Germany',
          map: {
            region: 'Germany',
            highlight: null,
            places: null,
            routes: null,
            groups: [{ name: 'East Germany', members: null }],
          },
        },
        { id: 'card', kind: 'words', name: 'Two countries' },
      ],
      steps: [{ beat: 0, phrase: '', show: ['map', 'card'] }],
    },
  });

  it('mends with its palette and the colour it holds back', () => {
    expect(worldColours(mapped)).toEqual({
      palette: [
        { thing: 'East Germany', token: 'chart1' },
        { thing: 'West Germany', token: 'chart0' },
      ],
      held: 'accent',
    });
    expect(worldColours(worldOf({}))).toEqual({});
    expect(worldColours(null)).toEqual({});
  });

  it("gives every map the show's map and colours, once however often", () => {
    const once = onShowMap(sheet, mapped);
    const map = once.draft.cast.find((t) => t.id === 'map')?.map;
    expect(map?.base).toMatchObject({ region: 'Germany', year: 1961 });
    expect(map?.palette).toEqual([
      { thing: 'East Germany', colour: 'chart1' },
      { thing: 'West Germany', colour: 'chart0' },
    ]);
    expect(once.draft.cast.find((t) => t.id === 'card')).toEqual(
      sheet.draft.cast.find((t) => t.id === 'card'),
    );
    expect(onShowMap(once, mapped)).toEqual(once);
    // No world, no map: the sheet as it was.
    expect(onShowMap(sheet, null)).toBe(sheet);
    expect(onShowMap(sheet, worldOf({}))).toBe(sheet);
  });
});

describe("a moment at a real place, on the show's map (pinOnShowMap)", () => {
  const nigeria = worldOf({ map: { region: 'Nigeria' } });

  it('pins the first place the words name that is on the map', () => {
    const pinned = pinOnShowMap(
      'In Kano, he fell ill on the way north from Lagos.',
      nigeria,
    );
    expect(pinned).toEqual({
      place: 'Kano',
      map: {
        region: 'Nigeria',
        highlight: null,
        places: null,
        routes: null,
        pins: [{ place: 'Kano', label: null }],
      },
    });
    // The map draws it: the pin is the place's.
    expect(readMap(pinned!.map).spec?.pins?.map((p) => p.name)).toEqual([
      'Kano',
    ]);
  });

  it('never pins a place off the map, the region itself, or nowhere', () => {
    // London is no place on a map of Nigeria.
    expect(pinOnShowMap('The talks moved to London.', nigeria)).toBeNull();
    expect(pinOnShowMap('All of Nigeria waited.', nigeria)).toBeNull();
    expect(pinOnShowMap('A crowd gathers round a notice.', nigeria)).toBeNull();
    // A show with no map has no place to pin.
    expect(pinOnShowMap('In Kano, he fell ill.', worldOf({}))).toBeNull();
    expect(pinOnShowMap('In Kano, he fell ill.', null)).toBeNull();
  });

  it('pins anywhere on a map of the world', () => {
    const world = worldOf({ map: { region: 'world' } });
    expect(pinOnShowMap('Talks opened in Geneva.', world)?.place).toBe(
      'Geneva',
    );
  });
});

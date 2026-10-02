import { KIT_IDS, kitIdsFor } from '../kit/registry';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import {
  BERLIN_1961,
  BERLIN_UNSAID,
  REAGAN_AT_THE_GATE,
  WALL_OPENS,
  WALL_PICTURES,
} from './__fixtures__/wall-pictures';
import { lineSpans, narrationOf, sceneNarration } from './shot-phrases';
import { buildRegistry, registryOf } from './shot-registry';
import {
  contentKeys,
  mapMentions,
  momentShot,
  namedSubjects,
  nextPicture,
  photoShows,
  pictureOfSet,
  pictureSet,
  picturesOf,
} from './shot-subjects';

const registry = buildRegistry({
  rows: WALL_ROWS,
  research: WALL_RESEARCH,
  world: WALL_WORLD,
  pictures: [...WALL_PICTURES, BERLIN_UNSAID],
});
const person = registry.resolve('person:Ronald Reagan')!;
const berlin = registry.resolve('place:Berlin')!;

describe('what a photo shows', () => {
  it('reads what the desk says it shows, a person or a place by their names in the list', () => {
    expect(photoShows(REAGAN_AT_THE_GATE, registry)).toMatchObject({
      kind: 'person',
      entry: { name: 'person:Ronald Reagan' },
    });
    expect(photoShows(BERLIN_1961, registry)).toMatchObject({
      kind: 'place',
      entry: { name: 'place:Berlin' },
    });
    // An event by its own words, as matched.
    expect(photoShows(WALL_OPENS, registry)).toEqual({
      kind: 'event',
      entry: null,
      keys: ['wall', 'opened'],
    });
  });

  it('reads a photo that says nothing by its own words: a whole name, never a part of one', () => {
    expect(photoShows(BERLIN_UNSAID, registry)).toMatchObject({
      kind: 'place',
      entry: { name: 'place:Berlin' },
    });
    const mausoleum = {
      name: 'photo:Reagan Library 1991',
      kind: 'photo' as const,
      about: 'a library building',
      picture: BERLIN_1961.picture,
    };
    // "Reagan" alone is not Ronald Reagan: a thing, by its words.
    expect(photoShows(mausoleum, registry)).toEqual({
      kind: 'thing',
      entry: null,
      keys: ['reagan', 'library', '1991'],
    });
    // No picture, nothing shown.
    expect(photoShows(person, registry)).toBeNull();
  });

  it('gives each person and place their pictures, a portrait first', () => {
    expect(picturesOf(person, registry).map((p) => p.name)).toEqual([
      'person:Ronald Reagan',
      'photo:Reagan at the Brandenburg Gate 1987',
    ]);
    expect(picturesOf(berlin, registry).map((p) => p.name)).toEqual([
      'photo:Berlin 1961',
      'photo:Street in Berlin 1963',
    ]);
    expect(pictureSet(person)).toEqual({
      kind: 'portrait',
      person: 'person:Ronald Reagan',
    });
    expect(pictureSet(BERLIN_1961)).toEqual({
      kind: 'photo',
      photo: 'photo:Berlin 1961',
    });
    expect(pictureOfSet(pictureSet(BERLIN_1961))).toBe('photo:Berlin 1961');
    expect(pictureOfSet({ kind: 'map' })).toBeNull();
  });

  it('shows a person’s next picture: one not shown yet, else the one shown longest ago', () => {
    const pictures = picturesOf(person, registry);
    expect(nextPicture(pictures)?.name).toBe('person:Ronald Reagan');
    expect(nextPicture(pictures, ['person:Ronald Reagan'])?.name).toBe(
      'photo:Reagan at the Brandenburg Gate 1987',
    );
    expect(
      nextPicture(pictures, [
        'person:Ronald Reagan',
        'photo:Reagan at the Brandenburg Gate 1987',
      ])?.name,
    ).toBe('person:Ronald Reagan');
    expect(nextPicture([], ['x'])).toBeNull();
  });

  it('keeps the words that tell a name apart', () => {
    expect(contentKeys('the 1945 general strikes in Lagos')).toEqual([
      '1945',
      'general',
      'strike',
      'lago',
    ]);
  });
});

describe('what a line names that pictures show', () => {
  const narration = sceneNarration(WALL_ROWS);
  const n = narrationOf(narration);
  const spans = lineSpans(WALL_ROWS);

  it('finds people and places with pictures as they are named, and an event by its words in a line', () => {
    const named = namedSubjects(n, registry, spans);
    expect(named.map((s) => [s.kind, s.name, s.at])).toEqual([
      ['place', 'place:Berlin', 2],
      ['person', 'person:Ronald Reagan', 18],
      ['event', 'the Wall opened', 41],
    ]);
    expect(named[2].pictures.map((p) => p.name)).toEqual([
      'photo:Crowds on the Wall 1989',
    ]);
  });

  it('never names an event from words scattered over two lines', () => {
    const lines = [
      { say: 'The wall stood for decades.', claims: [] },
      { say: 'Then it opened.', claims: [] },
    ];
    const two = narrationOf(sceneNarration(lines));
    expect(
      namedSubjects(two, registry, lineSpans(lines)).filter(
        (s) => s.kind === 'event',
      ),
    ).toEqual([]);
  });

  it('reads where the words name what the map shows: never "regional" alone', () => {
    const regions = buildRegistry({
      rows: WALL_ROWS,
      research: WALL_RESEARCH,
      world: WALL_WORLD,
    });
    const said = (text: string) =>
      mapMentions(narrationOf(text), regions).map((m) => m.entry.name);
    expect(said('Berlin was cut in two')).toEqual(['place:Berlin']);
    expect(said('The inner border ran on')).toEqual(['seam:inner border']);
    expect(said('East Germany held on')).toEqual(['region:East Germany']);
    // Not on the map: a street with no point.
    expect(said('Bernauer Strasse was wired')).toEqual([]);
    // The regions together by their noun, never by the adjective alone.
    const nigeria = registryOf([
      { name: 'region:North Region', kind: 'region', about: '' },
      { name: 'region:West Region', kind: 'region', about: '' },
    ]);
    const on = (text: string) =>
      mapMentions(narrationOf(text), nigeria).map((m) => m.entry.name);
    expect(on('which region would set the pace')).toHaveLength(2);
    expect(on('regional leaders could bargain')).toEqual([]);
  });
});

describe('the drawn set of the moment a line tells', () => {
  const kit = kitIdsFor('editorial');

  it('draws the kind of place a moment happens in, with its people, tagged as an illustration of a real event', () => {
    const strike = momentShot(
      'Those strikes made the old order harder to manage, and workers marched.',
      'Those strikes made',
      { era: '1945-1975', kit },
    );
    expect(strike).toMatchObject({
      on: 'Those strikes made',
      set: {
        kind: 'set',
        set: {
          place: 'industry',
          era: '1945-1975',
          illustration: true,
        },
      },
      actors: [
        {
          kit: 'people.crowd',
          params: { pose: 'protest', era: '1945-1975' },
        },
      ],
      life: [],
      focal: 'set',
    });
    // An illustrated show's people are its characters.
    expect(
      momentShot('The workers went on strike.', 'The workers went', {
        kit: kitIdsFor('illustrated'),
        look: 'illustrated',
      })?.actors,
    ).toMatchObject([{ kit: 'character.group', params: { pose: 'marching' } }]);
    // An assembly's own rows are its people; its light from the words.
    expect(
      momentShot('At night the delegates argued over seats.', 'At night the', {
        kit,
      }),
    ).toMatchObject({
      set: { set: { place: 'assembly-hall', time: 'night' } },
      actors: [],
    });
  });

  it('shows the thing a line is about on a display, from the kit', () => {
    expect(
      momentShot('The 1951 constitution gave the regions weight.', 'The 1951', {
        kit,
      }),
    ).toMatchObject({
      set: { set: { place: 'display', illustration: true } },
      actors: [{ id: 'thing', kit: 'document', params: { kind: 'charter' } }],
      focal: 'actor:thing',
    });
    // A thing of a kind is no claim: no illustration tag.
    const coins = momentShot(
      'Regions kept the money they raised.',
      'Regions kept',
      { kit },
    );
    expect(coins?.actors).toMatchObject([
      { kit: 'object', params: { kind: 'coins' } },
    ]);
    expect(coins?.set).toEqual({
      kind: 'set',
      set: { land: 'plain', time: 'day', place: 'display' },
    });
    // Without the kit's pieces, no thing: the kind of place, or nothing.
    expect(
      momentShot('The 1951 constitution gave the regions weight.', 'The 1951'),
    ).toBeNull();
  });

  it('is nothing for a line that tells no moment, and never names a place', () => {
    expect(
      momentShot('Then the fight changed.', 'Then the fight', { kit }),
    ).toBeNull();
    const city = momentShot('The city streets filled.', 'The city', {
      era: 'Berlin, 1961',
      kit: KIT_IDS,
    });
    // An era that is no period is left out, never a place's name.
    expect(JSON.stringify(city)).not.toContain('Berlin');
  });
});

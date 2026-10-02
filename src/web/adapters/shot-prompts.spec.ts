import { CHARACTER_GUIDE, KIT_GUIDE, shotBoardPrompt } from './shot-prompts';

describe("the shot board's instructions: real pictures first, the map only for where (Richard, 2026-10-02)", () => {
  const editorial = shotBoardPrompt('editorial');
  const illustrated = shotBoardPrompt('illustrated');

  it('decides each line by what it is about, a picture of it first', () => {
    for (const prompt of [editorial, illustrated]) {
      expect(prompt).toContain(
        'Real pictures first: the list’s photos are the film’s best pictures, and the list says what each one shows.',
      );
      // A person: their photo every time, another of theirs the next time, never their place.
      expect(prompt).toContain(
        '- a person (who): their photo every time they are the subject: their portrait (marked [portrait]) or a photo the list says shows them; the next time, another of theirs when the list has more than one.',
      );
      expect(prompt).toContain('Never their place on the map in their stead.');
      // A place: its photo, the map only when the line is about where it is.
      expect(prompt).toContain(
        '- a place: its photo when the list has one, for what happens there. The map only when the line is about where it is: locating it, a border, a route, a region, a distance, a journey between places',
      );
      // An event, a thing, a date and a mood.
      expect(prompt).toMatch(
        /- an event \(a meeting, a ceremony, a strike, a march, a launch, a vote\): its photo; else a drawn scene of the moment: .*; else its document or its headline/u,
      );
      expect(prompt).toContain(
        '- a thing (a flag, a ballot, coins, a treaty, a machine): its photo; else the kit’s object or document, big, on a display.',
      );
      expect(prompt).toContain(
        'Never a year’s label on the map, unless the line is about where.',
      );
      expect(prompt).toContain(
        '- a mood, a feeling, an atmosphere, a scene of people: a photo of what the line is about; else a drawn set of a kind of place with life (a coast at dusk, a city at night), never a named one. Never the map.',
      );
      // The pace of pictures, and the map never a stand-in.
      expect(prompt).toContain(
        'a new picture whenever the voice moves on to a new person, place, thing or event, about every five seconds; a picture holds only while the voice stays on what it shows.',
      );
      expect(prompt).toContain(
        'The map is never a stand-in: a line that names no place, region, border or route of the list is never on the map',
      );
      expect(prompt).toContain('at most twelve shots a minute');
      expect(prompt).toContain(
        'cut to a new picture of it: its photo (a person’s, a place’s, a thing’s, an event’s), a count of its number, a quote of someone’s own words, a timeline or a calendar for its dates, the moment drawn; the map only when the voice is on where something is.',
      );
      expect(prompt).toContain(
        'Never the map standing in for what a line is about.',
      );
    }
  });

  it('no longer sends a line to the map by default', () => {
    for (const prompt of [editorial, illustrated]) {
      expect(prompt).not.toContain('- a place: the map;');
      expect(prompt).not.toContain('on the map, a label of the year');
      expect(prompt).not.toContain('their place pinned on the map');
      expect(prompt).not.toContain(
        'the place on the map when the line names one',
      );
      expect(prompt).not.toContain(
        'cut to a new shot of it: the map on the place',
      );
      expect(prompt).not.toContain('at most eight shots a minute');
    }
  });

  it('offers the sets pictures first and the map last, the map only for where', () => {
    const sets = editorial.slice(
      editorial.indexOf('The sets (one a shot):'),
      editorial.indexOf('A drawn set’s settings'),
    );
    const order = ['portrait', 'photo', 'chart', 'set', 'map'].map((k) =>
      sets.indexOf(`- ${k}:`),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(sets).toContain(
      '- map: the show’s own map, its regions, seams and places: only where a line is about where something is',
    );
    expect(sets).toContain('never a stand-in for what a line is about');
  });

  it('draws a named person in the illustrated look only when they have no photo', () => {
    expect(CHARACTER_GUIDE).toContain(
      'A named person of the list is their photo when the list has one (their portrait, or a photo it says shows them), every time they are the subject; only one with no photo is drawn',
    );
    expect(illustrated).toContain(
      'a named person by their photo, or as their labelled character only when they have none',
    );
    expect(illustrated).toContain(
      'the kit’s characters dressed for their era on a drawn set of its kind of place',
    );
    expect(KIT_GUIDE).toContain(
      'a named person is their photo (their portrait or another of theirs) or a trace of them',
    );
    // Each look keeps its own people.
    expect(editorial).toContain('the kit’s silhouettes on a drawn set');
    expect(illustrated).not.toContain(
      'the kit’s silhouettes on a drawn set of its kind of place',
    );
  });

  it('works an example of a person by their portrait and a journey on the map', () => {
    expect(editorial).toContain(
      '{"shots":[{"on":"In 1946, an","set":{"kind":"portrait","target":"person:Herbert Macaulay"}',
    );
    expect(editorial).toContain(
      'The journey between two places is what the map is for.',
    );
    expect(editorial).toContain(
      'its shot would be photo:Lagos harbour 1946, not the map: that line is about the port, not about where Lagos is.',
    );
  });
});

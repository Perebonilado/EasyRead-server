import { PLAIN_FIGURE, figureOf, type FigureSpec } from './scene-figure';
import { iconicOf } from './scene-iconic';
import { TOO_ALIKE, likeness, setApart, type Looked } from './scene-looks';
import { mergeStory, type StoryDraft } from './scene-story';

const man = (patch: Partial<FigureSpec> = {}): FigureSpec =>
  figureOf({
    ...PLAIN_FIGURE,
    facialHair: 'beard',
    top: 'robe',
    topColour: 'brown',
    accentColour: 'brown',
    ...patch,
  });

describe("telling a book's people apart", () => {
  it('sets apart two who would look the same, changing what the text left free', () => {
    const people: Looked[] = [
      { id: 'a', role: 'main', figure: man() },
      { id: 'b', role: 'supporting', figure: man() },
      { id: 'c', role: 'supporting', figure: man(), fromText: ['topColour'] },
    ];
    expect(likeness(man(), man())).toBeGreaterThanOrEqual(TOO_ALIKE);
    const apart = setApart(people);
    for (let i = 0; i < apart.length; i += 1)
      for (let j = i + 1; j < apart.length; j += 1)
        expect(likeness(apart[i].figure!, apart[j].figure!)).toBeLessThan(
          TOO_ALIKE,
        );
    // What the text says stays as the text says.
    expect(apart[2].figure!.topColour).toBe('brown');
  });

  it("never changes a well-known figure's look", () => {
    const jesus = iconicOf(['Jesus'], false)!;
    const apart = setApart([
      { id: 'j', role: 'main', figure: jesus.figure, iconic: 'jesus' },
      { id: 'x', role: 'supporting', figure: jesus.figure },
    ]);
    expect(apart[0].figure).toEqual(jesus.figure);
    expect(likeness(apart[0].figure!, apart[1].figure!)).toBeLessThan(
      TOO_ALIKE,
    );
  });

  it('knows a well-known figure by a name that could be no one else, and a common one only when marked', () => {
    expect(iconicOf(['Jesus of Nazareth'], false)?.key).toBe('jesus');
    expect(iconicOf(['John the Baptist'], false)?.key).toBe('john-the-baptist');
    expect(iconicOf(['Mary'], false)).toBeNull();
    expect(iconicOf(['Mary'], true)?.key).toBe('mary');
    expect(iconicOf(['Moses'], false)?.carries).toBe('staff');
  });

  it("draws a book's well-known figures as tradition does, whatever look the reader gave", () => {
    const person = (
      name: string,
      over: Partial<StoryDraft['characters'][number]> = {},
    ): StoryDraft['characters'][number] => ({
      name,
      aliases: [],
      role: 'main',
      look: '',
      traits: [],
      voice: 'man',
      kind: 'person',
      figure: man(),
      presence: 'seen',
      ...over,
    });
    const bible = mergeStory([
      {
        from: 1,
        to: 1,
        draft: {
          characters: [
            person('Jesus'),
            person('Mary', { iconic: true, voice: 'woman' }),
            person('Peter', { role: 'supporting' }),
            person('Andrew', { role: 'supporting' }),
          ],
          places: [],
          pages: [],
        },
      },
    ]);
    const at = (name: string) => bible.characters.find((c) => c.name === name)!;
    expect(at('Jesus').iconic).toBe('jesus');
    expect(at('Jesus').figure?.topColour).toBe('white');
    expect(at('Mary').figure?.headwear).toBe('mantle');
    // Unmarked, Peter and Andrew keep their own looks, set apart.
    expect(at('Peter').iconic).toBeNull();
    expect(
      likeness(at('Peter').figure!, at('Andrew').figure!),
    ).toBeLessThan(TOO_ALIKE);
  });
});

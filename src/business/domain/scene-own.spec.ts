import { newFeaturesIn, newThingIn, featuresNamedIn } from './scene-doings';
import { doingsIn, type Actor } from './scene-directions';
import { looksOf, nounAt, nounOf, ownIdOf, ownWords } from './scene-own';

const kofi: Actor[] = [
  { id: 'kofi', names: ['Kofi'], gender: 'm' },
  { id: 'ama', names: ['Ama'], gender: 'f' },
];

/** Each doing as "who do target thing via fresh". */
const read = (
  who: string,
  words: string,
  own: { things?: string[]; features?: string[] } = {},
) =>
  doingsIn(words, {
    actors: kofi,
    who,
    things: (own.things ?? []).map((id) => ({ id, name: id })),
    features: (own.features ?? []).map((id) => ({ id, name: id })),
  }).map((d) =>
    [
      d.who ?? who,
      d.do,
      d.target && `>${d.target}`,
      d.thing && `+${d.thing}`,
      d.via && `via ${d.via}`,
      d.fresh?.thing && `new thing ${d.fresh.thing}`,
      d.fresh?.feature && `new feature ${d.fresh.feature}`,
    ]
      .filter(Boolean)
      .join(' '),
  );

describe("a show's own things and features, found in its words", () => {
  it('knows a name singular or plural, and names it one way', () => {
    expect(ownIdOf('Kites')).toBe('kite');
    expect(ownIdOf('water pumps')).toBe('water-pump');
    expect(ownIdOf('bus')).toBe('bus');
    expect(ownWords('kite').test('two red kites')).toBe(true);
    expect(ownWords('water-pump').test('by the water pump')).toBe(true);
    expect(ownWords('drum').test('a drummer')).toBe(false);
  });

  it('reads the name after its determiner, and nothing of the body or of time', () => {
    expect(nounAt(' his red kite high into the sky')?.word).toBe('kite');
    expect(nounAt(" Ama's drum.")?.word).toBe('drum');
    expect(nounAt(' her hand')).toBeNull();
    expect(nounAt(' the time')).toBeNull();
    expect(nounAt(' a crack')).toBeNull();
  });

  it('takes a thing no list has from a verb of handling, and knows it after', () => {
    expect(read('kofi', 'Kofi flies his kite.')).toEqual([
      'kofi raise +kite new thing kite',
    ]);
    expect(read('ama', 'Ama picks up the drum.')).toEqual([
      'ama take +drum new thing drum',
    ]);
    expect(read('kofi', 'Kofi throws the frisbee to Ama.')).toEqual([
      'kofi throw >ama +frisbee new thing frisbee',
    ]);
    // Once the show's own, it is known by its name, as a ball is.
    expect(
      read('kofi', 'Kofi throws the kite and Ama catches it.', {
        things: ['kite'],
      }),
    ).toEqual(['kofi throw >ama +kite', 'ama catch +kite']);
    // A thing of the lists' is the lists', and a feature is no thing.
    expect(read('kofi', 'Kofi throws the ball.')).toEqual(['kofi throw +ball']);
    expect(read('kofi', 'Kofi kicks the gate.')).toEqual(['kofi kick >gate']);
  });

  it('takes a feature no list has from going to it, sitting on it or opening it', () => {
    expect(read('kofi', 'Kofi runs to the signpost.')).toEqual([
      'kofi run >signpost new feature signpost',
    ]);
    expect(read('ama', 'Ama sits on the log.')).toEqual([
      'ama sit >log new feature log',
    ]);
    expect(read('ama', 'Ama opens the cupboard.')).toEqual([
      'ama open >cupboard new feature cupboard',
    ]);
    expect(
      read('kofi', 'Kofi hides behind the signpost.', {
        features: ['signpost'],
      }),
    ).toEqual(['kofi hide >signpost']);
  });

  it('sets a feature where the words set one: by it, against it, lodged in it', () => {
    const words = (text: string) =>
      newFeaturesIn(text, ['Kofi', 'Ama']).map((f) => f.word);
    expect(words('She leans her bicycle against the wall.')).toEqual([
      'bicycle',
    ]);
    expect(words('The kite is stuck up in the baobab!')).toEqual(['baobab']);
    expect(words('Kofi waits by the signpost.')).toEqual(['signpost']);
    // The lists' own are theirs: "the mango tree" is a tree.
    expect(
      featuresNamedIn('The kite gets stuck in the mango tree.').map(
        (f) => f.kind,
      ),
    ).toEqual(['tree']);
  });

  it('makes nothing of words for the body, people, places, time or the weather', () => {
    const junk = [
      'Maya looks up at the sky.',
      'The sun shines on the market.',
      'Kofi runs to the market.',
      'Ama goes into the kitchen.',
      'The gate is open a crack.',
      'Kofi takes a deep breath.',
      'Ama holds her hand.',
      'Kofi stands by the time the bell rings.',
      'They sit on the grass under the sun.',
      'Ama hides behind her hands.',
      'Kofi walks down the road with his friend.',
      'Maya picks up the pace.',
      'Kofi drops the subject.',
      'Ama runs to the driver.',
      'Maya runs to the doctor.',
      'Kofi hides behind the conductor.',
      'Ama walks to the donkey.',
      'Kofi leans back against the others.',
      'Kofi goes to the toilet.',
    ];
    for (const text of junk) {
      expect([text, newFeaturesIn(text, ['Kofi', 'Ama'])]).toEqual([text, []]);
      expect([
        text,
        doingsIn(text, { actors: kofi }).flatMap((d) =>
          d.fresh ? [d.fresh] : [],
        ),
      ]).toEqual([text, []]);
    }
    expect(newThingIn(' her hand gently')).toBeNull();
    expect(newThingIn(' a look at the map', ['map'])).toBeNull();
  });

  it('knows a name by its noun, and how the words say it looks', () => {
    expect(nounOf('a long stick')).toBe('stick');
    expect(nounOf('His red kite')).toBe('kite');
    expect(nounOf("Maya's old water pump")).toBe('water pump');
    expect(nounOf('signpost')).toBe('signpost');
    expect(nounOf('the big one')).toBe('');
    expect(nounOf('the others')).toBe('');
    expect(
      looksOf('kite', 'Kofi raises his red kite. The red kite flies. A kite!'),
    ).toBe('red');
    expect(looksOf('kite', 'Kofi flies his kite.')).toBe('');
  });
});

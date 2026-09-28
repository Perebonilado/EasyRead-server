import { animalOf, describeAnimal, type AnimalSpec } from '../scene-animal';
import { creatureOf, type CreatureSpec } from '../scene-creature';
import { PLAIN_FIGURE, type FigureSpec } from '../scene-figure';
import {
  ANIMAL_WAYS,
  CREATURE_WAYS,
  FIGURE_WAYS,
  MAX_OPTIONS,
  lookOf,
  namedIn,
  readingsOf,
} from './studio-options';

const horse = animalOf({ species: 'horse', coat: 'chestnut' })!;

describe('other readings of the words a kit character was drawn again for', () => {
  it('reads a colour as its nearest shades, never one far from it', () => {
    const browner: AnimalSpec = { ...horse, coat: 'brown' };
    const read = readingsOf(horse, browner, ANIMAL_WAYS, 'make her browner');
    expect(read.length).toBeLessThanOrEqual(MAX_OPTIONS);
    expect(read[0]).toBe(browner);
    // Chestnut is what she was: never offered back; tan is near, but not
    // brown's hue.
    expect(read.map((one) => one.coat)).toEqual(['brown', 'dark brown']);
    // Red has no near shade: "a red collar" is red.
    const collared: AnimalSpec = {
      ...horse,
      wear: { neck: 'collar' },
      wearColour: 'red',
    };
    expect(
      readingsOf(horse, collared, ANIMAL_WAYS, 'give her a red collar'),
    ).toEqual([collared]);
  });

  it('reads a size or a build a step further the way it went, never back', () => {
    const bigger: AnimalSpec = { ...horse, size: 'medium' };
    const small: AnimalSpec = { ...horse, size: 'small' };
    expect(
      readingsOf(small, bigger, ANIMAL_WAYS, 'bigger').map((one) => one.size),
    ).toEqual(['medium', 'large']);
    // Stout from average: nothing further, nothing back.
    const egg = creatureOf({ body: 'egg' })!;
    const rounder: CreatureSpec = { ...egg, build: 'stout' };
    expect(readingsOf(egg, rounder, CREATURE_WAYS, 'rounder')).toEqual([
      rounder,
    ]);
  });

  it('reads a part the words leave open another way, nearest first; one they name, or take away, never', () => {
    const alert: AnimalSpec = { ...horse, ears: 'round' };
    const floppy: AnimalSpec = { ...horse, ears: 'floppy' };
    expect(
      readingsOf(floppy, alert, ANIMAL_WAYS, 'more alert ears').map(
        (one) => one.ears,
      ),
    ).toEqual(['round', 'long', 'pointed']);
    // Named: "round ears" are round.
    expect(
      readingsOf(floppy, alert, ANIMAL_WAYS, 'give her round ears'),
    ).toHaveLength(1);
    // A hat taken off is off.
    const hatted: FigureSpec = { ...PLAIN_FIGURE, headwear: 'cap' };
    expect(readingsOf(hatted, PLAIN_FIGURE, FIGURE_WAYS, 'no hat')).toEqual([
      PLAIN_FIGURE,
    ]);
  });

  it('reads each field the change touched in turn, and never what they are', () => {
    const was: FigureSpec = PLAIN_FIGURE;
    const now: FigureSpec = {
      ...PLAIN_FIGURE,
      hairColour: 'dark brown',
      hair: 'curly',
    };
    const read = readingsOf(was, now, FIGURE_WAYS, 'darker, wavier hair');
    expect(read.map((one) => [one.hairColour, one.hair])).toEqual([
      ['dark brown', 'curly'],
      ['black', 'curly'],
      ['dark brown', 'afro'],
    ]);
    // A species is never read another way.
    const dog = { ...horse, species: 'dog' as const };
    expect(readingsOf(horse, dog, ANIMAL_WAYS, 'make her a dog')).toEqual([
      dog,
    ]);
  });

  it('reads only the colours of a spec new to them', () => {
    const white = animalOf({ species: 'horse', coat: 'white' })!;
    expect(
      readingsOf(null, white, ANIMAL_WAYS, 'make him white').map(
        (one) => one.coat,
      ),
    ).toEqual(['white', 'cream']);
  });
});

describe('how another reading reads in words', () => {
  it('says the other value where the writer’s words said theirs, "a" and "an" kept right', () => {
    const brown: AnimalSpec = { ...horse, coat: 'brown' };
    const tan: AnimalSpec = { ...horse, coat: 'tan' };
    expect(
      lookOf(
        'A brown horse with a blaze',
        brown,
        tan,
        ANIMAL_WAYS,
        describeAnimal,
      ),
    ).toBe('A tan horse with a blaze');
    const orange: AnimalSpec = { ...horse, coat: 'orange' };
    expect(
      lookOf('a brown horse', brown, orange, ANIMAL_WAYS, describeAnimal),
    ).toBe('an orange horse');
    // Words that never said it: the kit's own words for it.
    expect(
      lookOf('a gentle horse', brown, tan, ANIMAL_WAYS, describeAnimal),
    ).toBe(describeAnimal(tan));
  });

  it('knows a value named whole, and a long one by its last word', () => {
    expect(namedIn('a red collar, please', 'collar')).toBe(true);
    expect(namedIn('a red blanket on her back', 'saddle blanket')).toBe(true);
    expect(namedIn('make her browner', 'brown')).toBe(false);
    expect(namedIn('two bells', 'bell')).toBe(true);
  });
});

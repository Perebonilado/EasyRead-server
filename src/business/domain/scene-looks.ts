/**
 * A book's people, told apart at a glance. With no names on a story's
 * stage, a look is all that says who someone is, and a reader choosing
 * each look alone can give a book three bearded men in brown robes. Code
 * compares every two of the characters who matter, by their silhouette
 * (age, build, hair, headwear, what they wear), their colours and their
 * skin, and where two are too alike it changes the second one's free
 * choices (a colour, a hair colour, an accent) until they differ enough.
 * What the text says of someone is never changed, nor a well-known
 * figure's look. The main characters get the clearest colours.
 */
import {
  CLOTH_COLOURS,
  type ClothColour,
  type FigureSpec,
  type HairColour,
} from './scene-figure';

/** A character as far as their look goes. */
export interface Looked {
  id: string;
  role: 'main' | 'supporting' | 'minor';
  figure?: FigureSpec | null;
  /** The figure's fields the text itself says: never changed. */
  fromText?: readonly string[] | null;
  /** A well-known figure: their look is tradition's, never changed. */
  iconic?: string | null;
}

/** The clearest colours, for whom the story follows; the quieter ones, for the rest. */
const BRIGHT: readonly ClothColour[] = [
  'red',
  'blue',
  'green',
  'orange',
  'purple',
  'teal',
  'yellow',
  'pink',
];
const QUIET: readonly ClothColour[] = ['navy', 'brown', 'grey', 'white', 'black'];

/** How alike two looks are: how many of what a glance takes in they share. */
export function likeness(a: FigureSpec, b: FigureSpec): number {
  const same = (x: unknown, y: unknown) => (x === y ? 1 : 0);
  return (
    same(a.age, b.age) +
    same(a.build, b.build) +
    same(a.hair, b.hair) +
    same(a.hairColour, b.hairColour) +
    same(a.facialHair, b.facialHair) +
    same(a.headwear, b.headwear) +
    same(a.top, b.top) +
    // Colours count double: they are what a glance takes in first.
    2 * same(a.topColour, b.topColour) +
    same(a.accentColour, b.accentColour) +
    (Math.abs(a.skin - b.skin) <= 1 ? 1 : 0) +
    same([...a.extras].sort().join(), [...b.extras].sort().join())
  );
}

/**
 * Two looks this alike, or more, are too alike to tell apart on a stage
 * with no names: the same in all but one small thing. Clothes of another
 * colour are enough on their own.
 */
export const TOO_ALIKE = 11;

/** Hair someone of an age may be given, when nothing says. */
const HAIR_STYLE_FOR: Record<FigureSpec['age'], readonly FigureSpec['hair'][]> = {
  child: ['short', 'curly', 'spiky', 'afro', 'pigtails', 'bob'],
  teen: ['short', 'curly', 'spiky', 'afro', 'ponytail', 'bob'],
  adult: ['short', 'curly', 'long', 'afro', 'locs', 'bun'],
  elder: ['balding', 'short', 'curly', 'bald', 'bun'],
};

/** Hair colours someone of an age may be given, when nothing says. */
const HAIR_FOR: Record<FigureSpec['age'], readonly HairColour[]> = {
  child: ['black', 'dark brown', 'brown', 'auburn', 'blonde', 'red'],
  teen: ['black', 'dark brown', 'brown', 'auburn', 'blonde', 'red'],
  adult: ['black', 'dark brown', 'brown', 'auburn', 'blonde', 'red', 'grey'],
  elder: ['grey', 'white'],
};

/**
 * The characters with their looks set apart: each one who matters (main
 * and supporting), in the order given, compared with every one before
 * them; one too alike changes, in turn, its clothes' colour, its accent,
 * its hair colour, until it is apart from all of them or nothing free is
 * left to change. Minor characters are compared with the main ones only.
 * Returns the characters, the changed ones copied.
 */
export function setApart<T extends Looked>(characters: readonly T[]): T[] {
  const out = characters.map((c) => ({ ...c }));
  const settled: T[] = [];
  for (const one of out) {
    const figure = one.figure;
    if (!figure) continue;
    const others = settled.filter(
      (other) => one.role !== 'minor' || other.role === 'main',
    );
    const free = (field: keyof FigureSpec) =>
      !one.iconic && !(one.fromText ?? []).includes(field);
    const clash = () =>
      others.some(
        (other) => other.figure && likeness(other.figure, one.figure!) >= TOO_ALIKE,
      );
    if (clash()) {
      const palette = one.role === 'main' ? BRIGHT : [...BRIGHT, ...QUIET];
      const taken = new Set(others.map((o) => o.figure!.topColour));
      const choices: ((f: FigureSpec) => FigureSpec | null)[] = [
        // A colour no one else here wears.
        (f) => {
          if (!free('topColour')) return null;
          const colour = palette.find((c) => !taken.has(c) && c !== f.topColour);
          return colour ? { ...f, topColour: colour } : null;
        },
        (f) => {
          if (!free('accentColour')) return null;
          const used = new Set(others.map((o) => o.figure!.accentColour));
          const colour = CLOTH_COLOURS.find(
            (c) => !used.has(c) && c !== f.accentColour && c !== f.topColour,
          );
          return colour ? { ...f, accentColour: colour } : null;
        },
        (f) => {
          if (!free('hairColour')) return null;
          const used = new Set(others.map((o) => o.figure!.hairColour));
          const colour = HAIR_FOR[f.age].find(
            (c) => !used.has(c) && c !== f.hairColour,
          );
          return colour ? { ...f, hairColour: colour } : null;
        },
        (f) => {
          if (!free('hair') || f.headwear !== 'none') return null;
          const used = new Set(others.map((o) => o.figure!.hair));
          const style = HAIR_STYLE_FOR[f.age].find(
            (h) => !used.has(h) && h !== f.hair,
          );
          return style ? { ...f, hair: style } : null;
        },
        (f) => {
          if (!free('facialHair') || f.age === 'child' || f.age === 'teen')
            return null;
          const beard = f.facialHair === 'beard' ? 'moustache' : 'beard';
          return { ...f, facialHair: beard };
        },
        // Last, a scarf in their accent colour.
        (f) =>
          free('extras') && !f.extras.includes('scarf') && f.extras.length < 2
            ? { ...f, extras: [...f.extras, 'scarf'] }
            : null,
      ];
      for (const change of choices) {
        if (!clash()) break;
        const changed = change(one.figure!);
        if (changed) one.figure = changed;
      }
    }
    // The ones the story follows are seen in a clear colour, where the
    // text leaves it free.
    if (
      one.role === 'main' &&
      free('topColour') &&
      QUIET.includes(one.figure!.topColour) &&
      one.figure!.top !== 'robe'
    ) {
      const colour = BRIGHT.find(
        (c) => !settled.some((o) => o.figure?.topColour === c),
      );
      if (colour) one.figure = { ...one.figure!, topColour: colour };
    }
    settled.push(one);
  }
  return out;
}

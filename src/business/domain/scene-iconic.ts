/**
 * Figures a story shares with a tradition, drawn the way that tradition
 * shows them, the same in every book: Jesus in a white robe with a red
 * sash, his hair long and his beard brown; Mary in her blue mantle; Moses
 * old, white-bearded, with his staff. A reader seeing them knows them at
 * a glance, whoever else stands beside them, and nothing on the stage has
 * to say who they are.
 *
 * The registry holds the ones that come up most, in Bible stories above
 * all. A name that could be no one else (Jesus, Moses, John the Baptist)
 * is theirs in any book; a common one (Mary, Peter, David) only where the
 * story's reader marked the character as the well-known figure. God is
 * never drawn, and is not here: a voice from above (scene-story).
 */
import { figureOf, type FigureProp, type FigureSpec } from './scene-figure';
import { nameKey } from './scene-story';

export interface IconicFigure {
  /** What it is kept as. */
  key: string;
  /** Their names, as nameKey reads them. */
  names: readonly string[];
  /** Whether a name alone says it is them, in any book. */
  unmistakable: boolean;
  figure: FigureSpec;
  /** What they carry, where the page gives them nothing else to hold. */
  carries?: FigureProp;
}

const figure = (spec: Partial<FigureSpec>): FigureSpec =>
  figureOf({
    age: 'adult',
    build: 'average',
    skin: 5,
    hair: 'short',
    hairColour: 'dark brown',
    facialHair: 'none',
    headwear: 'none',
    top: 'robe',
    topColour: 'white',
    bottom: 'trousers',
    bottomColour: 'brown',
    accentColour: 'brown',
    extras: ['sandals'],
    ...spec,
  });

export const ICONIC: readonly IconicFigure[] = [
  {
    key: 'jesus',
    names: ['jesus', 'jesus christ', 'christ', 'jesus of nazareth', 'lord jesus'],
    unmistakable: true,
    figure: figure({
      hair: 'long',
      hairColour: 'brown',
      facialHair: 'beard',
      topColour: 'white',
      accentColour: 'red',
    }),
  },
  {
    key: 'mary',
    names: ['mary', 'mary mother of jesus', 'virgin mary', 'mary his mother', 'mother mary'],
    unmistakable: false,
    figure: figure({
      skin: 4,
      hair: 'long',
      headwear: 'mantle',
      topColour: 'white',
      accentColour: 'blue',
    }),
  },
  {
    key: 'joseph',
    names: ['joseph', 'joseph of nazareth', 'joseph the carpenter'],
    unmistakable: false,
    figure: figure({
      facialHair: 'beard',
      hairColour: 'dark brown',
      topColour: 'brown',
      accentColour: 'green',
    }),
    carries: 'staff',
  },
  {
    key: 'john-the-baptist',
    names: ['john the baptist', 'john the baptizer', 'john the baptiser', 'baptist'],
    unmistakable: true,
    figure: figure({
      skin: 6,
      build: 'slim',
      hair: 'locs',
      hairColour: 'black',
      facialHair: 'beard',
      top: 'animal skin',
      accentColour: 'brown',
    }),
  },
  {
    key: 'moses',
    names: ['moses'],
    unmistakable: true,
    figure: figure({
      age: 'elder',
      hair: 'long',
      hairColour: 'white',
      facialHair: 'beard',
      topColour: 'red',
      accentColour: 'yellow',
    }),
    carries: 'staff',
  },
  {
    key: 'noah',
    names: ['noah'],
    unmistakable: true,
    figure: figure({
      age: 'elder',
      build: 'broad',
      hair: 'balding',
      hairColour: 'white',
      facialHair: 'beard',
      topColour: 'brown',
      accentColour: 'orange',
    }),
    carries: 'staff',
  },
  {
    key: 'abraham',
    names: ['abraham', 'abram'],
    unmistakable: true,
    figure: figure({
      age: 'elder',
      hairColour: 'white',
      facialHair: 'beard',
      headwear: 'headscarf',
      topColour: 'navy',
      accentColour: 'white',
    }),
    carries: 'staff',
  },
  {
    key: 'david',
    names: ['david', 'young david'],
    unmistakable: false,
    figure: figure({
      age: 'teen',
      build: 'slim',
      skin: 4,
      hair: 'curly',
      hairColour: 'auburn',
      top: 'tunic',
      topColour: 'yellow',
      accentColour: 'brown',
    }),
  },
  {
    key: 'peter',
    names: ['peter', 'simon peter', 'saint peter', 'simon'],
    unmistakable: false,
    figure: figure({
      build: 'broad',
      hair: 'curly',
      hairColour: 'grey',
      facialHair: 'beard',
      topColour: 'blue',
      accentColour: 'yellow',
    }),
  },
  {
    key: 'andrew',
    names: ['andrew'],
    unmistakable: false,
    figure: figure({
      hair: 'long',
      hairColour: 'brown',
      facialHair: 'beard',
      topColour: 'green',
      accentColour: 'brown',
    }),
  },
  {
    key: 'james',
    names: ['james', 'james son of zebedee'],
    unmistakable: false,
    figure: figure({
      skin: 6,
      hairColour: 'black',
      facialHair: 'beard',
      topColour: 'orange',
      accentColour: 'navy',
    }),
  },
  {
    key: 'john',
    names: ['john', 'john the apostle', 'john son of zebedee'],
    unmistakable: false,
    figure: figure({
      age: 'teen',
      skin: 4,
      hair: 'short',
      hairColour: 'brown',
      topColour: 'red',
      accentColour: 'green',
    }),
  },
  {
    key: 'matthew',
    names: ['matthew', 'levi'],
    unmistakable: false,
    figure: figure({
      skin: 6,
      hair: 'short',
      hairColour: 'black',
      facialHair: 'stubble',
      topColour: 'purple',
      accentColour: 'yellow',
    }),
  },
  {
    key: 'thomas',
    names: ['thomas', 'doubting thomas'],
    unmistakable: false,
    figure: figure({
      skin: 7,
      hair: 'curly',
      hairColour: 'black',
      facialHair: 'beard',
      topColour: 'teal',
      accentColour: 'brown',
    }),
  },
  {
    key: 'judas',
    names: ['judas', 'judas iscariot'],
    unmistakable: false,
    figure: figure({
      hair: 'short',
      hairColour: 'red',
      facialHair: 'beard',
      topColour: 'yellow',
      accentColour: 'grey',
    }),
  },
  {
    key: 'angel',
    names: ['angel', 'gabriel', 'the angel gabriel', 'angel gabriel', 'michael the archangel', 'an angel', 'angel of the lord'],
    unmistakable: false,
    figure: figure({
      skin: 3,
      hair: 'long',
      hairColour: 'blonde',
      topColour: 'white',
      accentColour: 'yellow',
      extras: ['wings', 'sandals'],
    }),
  },
  {
    key: 'pharaoh',
    names: ['pharaoh', 'the pharaoh'],
    unmistakable: true,
    figure: figure({
      skin: 7,
      headwear: 'nemes',
      top: 'robe',
      topColour: 'white',
      accentColour: 'yellow',
    }),
  },
  {
    key: 'herod',
    names: ['herod', 'king herod'],
    unmistakable: true,
    figure: figure({
      build: 'broad',
      facialHair: 'beard',
      headwear: 'crown',
      topColour: 'purple',
      accentColour: 'yellow',
    }),
  },
  {
    key: 'pilate',
    names: ['pilate', 'pontius pilate'],
    unmistakable: true,
    figure: figure({
      skin: 3,
      hairColour: 'grey',
      topColour: 'white',
      accentColour: 'red',
    }),
  },
  {
    key: 'roman-soldier',
    names: ['roman soldier', 'soldier', 'centurion', 'the centurion', 'roman centurion'],
    unmistakable: false,
    figure: figure({
      skin: 4,
      headwear: 'crested helmet',
      top: 'armour',
      accentColour: 'red',
    }),
  },
];

/**
 * The well-known figure a character is, by any of their names: one whose
 * name could be no one else, or, where the reader marked them as a
 * well-known figure, one whose name is theirs. Null for anyone else.
 */
export function iconicOf(
  names: readonly string[],
  marked: boolean,
): IconicFigure | null {
  const keys = new Set(names.map(nameKey).filter(Boolean));
  for (const one of ICONIC) {
    if (!one.unmistakable && !marked) continue;
    if (one.names.some((name) => keys.has(nameKey(name)))) return one;
  }
  return null;
}

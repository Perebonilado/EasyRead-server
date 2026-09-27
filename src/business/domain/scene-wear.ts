/**
 * What people wear and can put on or take off: a uniform, a coat, a hat,
 * a scarf, pyjamas. Each word for a thing worn says where on someone the
 * figure kit draws it (their top, their head, an extra such as a scarf),
 * so a Studio story's "Tobi puts on his uniform" changes what Tobi is
 * drawn in at that moment, and the uniform is gone from the stage into
 * his clothes: worn, never carried about.
 *
 * What someone wears through a scene is worked out here too: what they
 * open in (what the scene before left them in, else their usual look;
 * pyjamas when the scene has them get dressed out of bed), and each
 * change as they put something on or take it off.
 */
import {
  CLOTH_COLOURS,
  MAX_EXTRAS,
  type ClothColour,
  type FigureExtra,
  type FigureSpec,
  type Headwear,
  type Top,
} from './scene-figure';

/** Where on someone the kit draws a thing worn: their top, their head, an extra; their whole usual outfit; their feet (shoes on, or bare); or nowhere it shows (a watch, gloves). */
export type WearSlot =
  'top' | 'headwear' | 'extras' | 'outfit' | 'feet' | 'none';

export interface Wearable {
  slot: WearSlot;
  /** What the kit draws for it in that slot. */
  kit: Top | Headwear | FigureExtra | null;
}

/** Each thing worn by the words for it, the kit's drawing of it and where. */
const WEARABLES: { words: string; wear: Wearable }[] = [
  { words: 'lab coats?', wear: { slot: 'top', kit: 'lab coat' } },
  {
    words: 'dressing gowns?|bath ?robes?|robes?',
    wear: { slot: 'top', kit: 'robe' },
  },
  {
    words: 'pyjamas|pajamas|pj ?s|nighties?|night ?dress(?:es)?|night ?gowns?',
    wear: { slot: 'top', kit: 'pyjamas' },
  },
  { words: 'uniforms?', wear: { slot: 'top', kit: 'uniform' } },
  {
    words: 'rain ?coats?|over ?coats?|coats?|macs?|anoraks?',
    wear: { slot: 'top', kit: 'coat' },
  },
  { words: 'jackets?|blazers?', wear: { slot: 'top', kit: 'jacket' } },
  {
    words: 'jumpers?|sweaters?|pullovers?|jerseys?|sweatshirts?',
    wear: { slot: 'top', kit: 'jumper' },
  },
  { words: 'hood(?:ie|y)s?', wear: { slot: 'top', kit: 'hoodie' } },
  { words: 'cardigans?', wear: { slot: 'top', kit: 'cardigan' } },
  { words: 'aprons?|pinafores?', wear: { slot: 'top', kit: 'apron' } },
  { words: 'dress(?:es)?|gowns?|frocks?', wear: { slot: 'top', kit: 'dress' } },
  {
    words: 't-?shirts?|tee ?shirts?|tees',
    wear: { slot: 'top', kit: 't-shirt' },
  },
  {
    words: 'shirts?|blouses?',
    wear: { slot: 'top', kit: 'shirt and tie' },
  },
  { words: 'hard ?hats?', wear: { slot: 'headwear', kit: 'hard hat' } },
  {
    words: 'woolly hats?|bobble hats?|beanies?',
    wear: { slot: 'headwear', kit: 'beanie' },
  },
  { words: 'sun ?hats?|hats?', wear: { slot: 'headwear', kit: 'sun hat' } },
  { words: '(?:baseball )?caps?', wear: { slot: 'headwear', kit: 'cap' } },
  { words: 'helmets?', wear: { slot: 'headwear', kit: 'helmet' } },
  { words: 'crowns?|tiaras?', wear: { slot: 'headwear', kit: 'crown' } },
  {
    words: 'head ?scarf|head ?scarves|hijabs?',
    wear: { slot: 'headwear', kit: 'headscarf' },
  },
  { words: 'scarf|scarves', wear: { slot: 'extras', kit: 'scarf' } },
  {
    words: '(?:sun)?glasses|spectacles|specs',
    wear: { slot: 'extras', kit: 'glasses' },
  },
  { words: 'sandals?', wear: { slot: 'extras', kit: 'sandals' } },
  {
    words: 'cloaks?|capes?|blankets?|shawls?',
    wear: { slot: 'extras', kit: 'cloak' },
  },
  {
    words: 'back ?packs?|rucksacks?|school ?bags?',
    wear: { slot: 'extras', kit: 'backpack' },
  },
  { words: 'bow ?ties?', wear: { slot: 'extras', kit: 'bow tie' } },
  { words: 'earrings?', wear: { slot: 'extras', kit: 'earrings' } },
  {
    words:
      '(?:school |best |party |new |old |clean |day )?(?:clothes|outfits?|costumes?|kit)',
    wear: { slot: 'outfit', kit: null },
  },
  {
    words:
      '(?:school )?shoes?|boots?|trainers?|sneakers?|slippers?|wellies|wellingtons?|socks?',
    wear: { slot: 'feet', kit: null },
  },
  {
    words:
      'gloves?|mittens?|ties?|belts?|watch(?:es)?|necklaces?|bracelets?|masks?',
    wear: { slot: 'none', kit: null },
  },
];

/** The words for anything worn, as one pattern's source: for the doings that put things on and take them off. */
export const WEAR_WORDS = WEARABLES.map((w) => w.words).join('|');

const WHOLE = WEARABLES.map((w) => ({
  pattern: new RegExp(`^(?:${w.words})$`, 'iu'),
  wear: w.wear,
}));

/**
 * What a thing is as something worn, by the word or words for it (its
 * last word says: "his new school uniform" is a uniform); null for
 * anything not worn.
 */
export function wearableOf(word: string | null | undefined): Wearable | null {
  const said = (word ?? '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!said) return null;
  const words = said.split(' ');
  // The longest ending first: "lab coat" before "coat".
  for (let n = Math.min(3, words.length); n >= 1; n -= 1) {
    const tail = words.slice(-n).join(' ');
    const found = WHOLE.find((w) => w.pattern.test(tail));
    if (found) return found.wear;
  }
  return null;
}

/** Whether a thing is something worn: its id or its name says so. */
export const isWearable = (
  thing: string | null | undefined,
  name?: string | null,
): boolean => Boolean(wearableOf(name ?? thing) ?? wearableOf(thing));

/** A colour said in some words: "his red coat" is red. */
export function colourIn(text: string | null | undefined): ClothColour | null {
  const said = (text ?? '').toLowerCase();
  const same: Record<string, ClothColour> = { gray: 'grey', golden: 'yellow' };
  for (const word of said.split(/[^a-z]+/u)) {
    if ((CLOTH_COLOURS as readonly string[]).includes(word))
      return word as ClothColour;
    if (same[word]) return same[word];
  }
  return null;
}

/**
 * The colour some words give a thing worn, said just before the word for
 * it: "puts on her red coat" is red, whatever else is said in them.
 */
export function colourBefore(
  text: string | null | undefined,
  word: string | null | undefined,
): ClothColour | null {
  const noun = (word ?? '')
    .toLowerCase()
    .split(/[^a-z]+/u)
    .filter(Boolean)
    .pop();
  if (!text || !noun) return null;
  const said = new RegExp(`((?:[a-z-]+\\s+){0,3})${noun}\\b`, 'iu').exec(text);
  return said ? colourIn(said[1]) : null;
}

/**
 * What someone wears after putting a thing on: its drawing in its slot,
 * in the colour its look says, else the colour they usually wear there,
 * else their accent colour. Putting on what their usual outfit has (their
 * uniform, their clothes) puts them back in their usual outfit whole.
 */
export function putOn(
  now: FigureSpec,
  usual: FigureSpec,
  wear: Wearable,
  look: string | null = null,
): FigureSpec {
  const colour = colourIn(look);
  if (wear.slot === 'outfit') return { ...usual };
  // Shoes on: their feet as they usually are.
  if (wear.slot === 'feet')
    return { ...now, extras: now.extras.filter((e) => e !== 'bare feet') };
  if (wear.slot === 'none' || !wear.kit) return now;
  if (wear.slot === 'top') {
    const top = wear.kit as Top;
    if (top === usual.top && (!colour || colour === usual.topColour))
      return { ...usual };
    // Pyjamas are top and trousers alike, worn with bare feet.
    if (top === 'pyjamas') {
      const worn = undressedFor(usual, true);
      return {
        ...worn,
        headwear: now.headwear,
        ...(colour ? { topColour: colour, bottomColour: colour } : {}),
      };
    }
    return {
      ...now,
      top,
      topColour:
        colour ?? (top === usual.top ? usual.topColour : usual.accentColour),
      // Out of pyjamas, the legs are dressed as they usually are.
      ...(now.top === 'pyjamas'
        ? { bottom: usual.bottom, bottomColour: usual.bottomColour }
        : {}),
    };
  }
  if (wear.slot === 'headwear')
    return {
      ...now,
      headwear: wear.kit as Headwear,
      ...(colour ? { accentColour: colour } : {}),
    };
  const extra = wear.kit as FigureExtra;
  if (now.extras.includes(extra)) return now;
  return {
    ...now,
    extras: [...now.extras, extra].slice(-MAX_EXTRAS),
    ...(colour && extra === 'cloak' ? { accentColour: colour } : {}),
  };
}

/**
 * What someone wears after taking a thing off: a top off leaves a plain
 * t-shirt, pyjamas off the t-shirt and what they usually wear on their
 * legs, a hat off their hair, shoes off their bare feet.
 */
export function takeOff(
  now: FigureSpec,
  wear: Wearable,
  usual: FigureSpec | null = null,
): FigureSpec {
  if (wear.kit === 'pyjamas' && now.top === 'pyjamas' && usual)
    return {
      ...now,
      top: 't-shirt',
      topColour: 'white',
      bottom: usual.bottom,
      bottomColour: usual.bottomColour,
    };
  if (wear.slot === 'feet')
    return now.extras.includes('bare feet')
      ? now
      : {
          ...now,
          extras: [
            ...now.extras
              .filter((e) => e !== 'sandals')
              .slice(-(MAX_EXTRAS - 1)),
            'bare feet',
          ],
        };
  if (wear.slot === 'top' && now.top === wear.kit)
    return { ...now, top: 't-shirt' };
  if (wear.slot === 'headwear' && now.headwear === wear.kit)
    return { ...now, headwear: 'none' };
  if (wear.slot === 'extras')
    return { ...now, extras: now.extras.filter((e) => e !== wear.kit) };
  return now;
}

/**
 * What someone wears before they get dressed into their usual clothes:
 * pyjamas and bare feet in bed, at night or at dawn, or in a bedroom;
 * else a plain t-shirt. Nothing carried or worn besides.
 */
export function undressedFor(usual: FigureSpec, bedtime: boolean): FigureSpec {
  const colour: ClothColour =
    usual.accentColour !== usual.topColour ? usual.accentColour : 'teal';
  return bedtime
    ? {
        ...usual,
        headwear: 'none',
        top: 'pyjamas',
        topColour: colour,
        bottom: 'trousers',
        bottomColour: colour,
        extras: [...usual.extras.filter((e) => e === 'glasses'), 'bare feet'],
      }
    : {
        ...usual,
        headwear: 'none',
        top: 't-shirt',
        topColour: 'white',
        extras: usual.extras.filter((e) => e === 'glasses'),
      };
}

/** Whether two figures are dressed the same. */
export const sameOutfit = (a: FigureSpec, b: FigureSpec): boolean =>
  a.top === b.top &&
  a.topColour === b.topColour &&
  a.bottom === b.bottom &&
  a.bottomColour === b.bottomColour &&
  a.headwear === b.headwear &&
  a.accentColour === b.accentColour &&
  a.extras.length === b.extras.length &&
  a.extras.every((e) => b.extras.includes(e));

/** What someone is wearing, in a few words: "a blue uniform and grey trousers". */
export function outfitWords(spec: FigureSpec): string {
  const top =
    spec.top === 'pyjamas'
      ? `${spec.topColour} pyjamas`
      : `a ${spec.topColour} ${spec.top}`;
  const legs =
    spec.top === 'pyjamas' ||
    spec.top === 'dress' ||
    spec.top === 'robe' ||
    spec.top === 'kaftan'
      ? ''
      : ` and ${spec.bottomColour} ${spec.bottom}`;
  const hat = spec.headwear === 'none' ? '' : `, a ${spec.headwear}`;
  const extras = spec.extras.length
    ? `, with ${spec.extras.map((e) => (/(?:s|feet)$/u.test(e) ? e : `a ${e}`)).join(' and ')}`
    : '';
  return `${top}${legs}${hat}${extras}`;
}

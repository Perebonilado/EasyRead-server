/**
 * A show's own things and features: what a story names that no list has
 * (a kite, an umbrella, a drum; a bicycle leant on a wall, a signpost, a
 * canoe). Each is found in the words only where they say plainly what it
 * is: a thing is what a verb of handling is done with ("Kofi flies his
 * kite"), a feature where someone goes or something is set ("runs to the
 * signpost", "leans her bicycle against the wall"). The artist draws it
 * once for the show, and from then on it is known by its word like any
 * thing or feature of the lists.
 *
 * Words for the body, for people, for places and for passing time are
 * never one: "by the hand", "under the sun", "into the kitchen".
 */

/** A thing or a feature of a show's own, by its id and the name the words give it. */
export interface OwnWord {
  id: string;
  name: string;
}

/** The kind of a feature no list has: the artist draws it, once for the show. */
export const DRAWN = 'drawn' as const;
export type Drawn = typeof DRAWN;

/** A word as one thing, singular: "kites" is a kite, "benches" a bench. */
export function singularOf(word: string): string {
  const w = word.toLowerCase().trim();
  if (/(?:ss|us|is|as|os)$/u.test(w)) return w;
  if (/[^aeiou]ies$/u.test(w)) return `${w.slice(0, -3)}y`;
  if (/(?:ch|sh|x|zz)es$/u.test(w)) return w.slice(0, -2);
  if (/[^s]s$/u.test(w)) return w.slice(0, -1);
  return w;
}

/** The id a show's own thing or feature is known by: its name, singular, words joined by hyphens. */
export function ownIdOf(name: string): string {
  const words = name
    .toLowerCase()
    .trim()
    .split(/[\s-]+/u)
    .filter(Boolean);
  if (!words.length) return '';
  words[words.length - 1] = singularOf(words[words.length - 1]);
  return words
    .join('-')
    .replace(/[^\p{L}0-9-]/gu, '')
    .slice(0, 32);
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A word and its plural: "kite" and "kites", "bus" and "buses", "canoe" and "canoes". */
function withPlural(word: string): string {
  const w = escaped(word);
  if (/(?:s|sh|ch|x|z)$/u.test(word)) return `${w}(?:es)?`;
  if (/[^aeiou]y$/u.test(word)) return `${escaped(word.slice(0, -1))}(?:y|ies)`;
  return `${w}s?`;
}

/** The words for a show's own thing or feature, singular or plural: "kites?", "water pumps?". */
export function ownWords(name: string): RegExp {
  const words = ownIdOf(name).split('-').filter(Boolean);
  const last = words.pop() ?? '';
  const head = words.map(escaped);
  return new RegExp(
    `\\b(?:${[...head, withPlural(last)].join('[\\s-]+')})\\b`,
    'iu',
  );
}

/** The first of a show's own the text names, and where. */
export function ownNamedIn(
  text: string,
  own: readonly OwnWord[],
): { id: string; at: number; word: string } | null {
  let best: { id: string; at: number; word: string } | null = null;
  for (const one of own) {
    const m = ownWords(one.name).exec(text);
    if (m && (!best || m.index < best.at))
      best = { id: one.id, at: m.index, word: m[0] };
  }
  return best;
}

/** Words that come before a thing: "the", "his", "Maya's". */
export const OWN_DETERMINER =
  "(?:the|a|an|his|her|their|its|my|your|our|this|that|some|\\p{Lu}\\p{L}*['’]s)";

/** Words after a thing's name that end it: a preposition, a joining word, an adverb, a stop. */
const ENDS =
  '(?=\\s*(?:[.,;:!?"”’)—–]|$)|\\s+(?:to|at|in|into|on|onto|over|under|up|down|out|off|away|back|for|from|with|by|beside|behind|near|through|across|along|around|round|toward|towards|against|past|after|before|above|below|between|inside|outside|high|low|far|hard|fast|straight|forwards?|backwards?|sideways|instead|first|last|left|right|open|shut|tight|again|too|and|but|then|so|as|while|when|until|here|there|now|home|together|aside|once|twice|\\p{L}+ly)\\b)';

/** Words for the body, people, time and what is done: never a thing or a feature. */
const NEVER = new Set(
  (
    'one ones thing things something anything everything nothing it them ' +
    'hand hands arm arms head heads face faces eye eyes mouth nose ear ears ' +
    'tail tails paw paws leg legs foot feet toe toes finger fingers hair ' +
    'back side front neck shoulder shoulders knee knees body lap chin cheek ' +
    'breath turn turns look looks step seat chance time times moment way ' +
    'care part place rest notice idea lead aim shape heart voice name word ' +
    'words song story joke question answer sound noise smile grin hug kiss ' +
    'nap bath walk run jump bite sip meal lunch dinner breakfast attention ' +
    'hold grip glance peek wave nod bow cry shout laugh sigh ' +
    'friend friends mum mom mummy mother dad daddy father brother sister ' +
    'baby boy boys girl girls man men woman women people person children ' +
    'child kids kid teacher gran granny grandma grandpa grandad uncle aunt ' +
    'auntie family crowd everyone everybody someone somebody ' +
    'dog dogs puppy cat cats kitten bird birds hen chicken goat cow sheep ' +
    'horse mouse pig duck duckling animal animals ' +
    'rest end start top bottom middle centre center edge corner ' +
    'way crack bit inch lot kind sort piece pair ' +
    'eyebrow eyebrows brow brows lip lips tongue tooth teeth fist fists ' +
    'thumb thumbs wing wings beak horn horns ' +
    'photo photograph picture selfie shower swim ride trip drive dive ' +
    'tantrum fit party fuss game match wink punch yawn tear tears promise ' +
    'number five ten'
  ).split(' '),
);

/** Words that say what a thing is like: before its name ("his red kite"), never its name. */
const LIKE = new Set(
  (
    'red blue green yellow orange pink purple black white brown grey gray ' +
    'little big small tiny huge old new other same last first next best ' +
    'own whole left right far fast hard high low open shut closed stuck ' +
    'loose tight free straight long short round tall bright shiny broken'
  ).split(' '),
);

/** Words that are never part of a thing's name: pronouns, verbs that help, and the like ("the time we get there"). */
const NOT_A_NAME = new Set(
  (
    'i you he she it we they me him her us them is are was were be been am ' +
    'do does did has have had will would can could shall should may might ' +
    'must not no so very also just then there here this that these those ' +
    'what which who whom whose where when why how all any each every some ' +
    'many much more most few two three of'
  ).split(' '),
);

/** Places, ground, sky and weather: where people are, never a feature among them. */
const NOT_A_FEATURE = new Set(
  (
    'ground floor grass sand mud dirt dust sky air sun moon star stars cloud ' +
    'clouds rain snow wind storm fog water sea ocean river lake stream room ' +
    'kitchen bedroom bathroom hall hallway classroom house home school shop ' +
    'store market church mosque temple station hospital office town village ' +
    'city forest woods wood jungle beach park garden field yard compound ' +
    'playground street road lane path track distance dark darkness light ' +
    'shade shadow shadows sunshine world stage scene rules corner inside ' +
    'outside country land hill hills mountain valley'
  ).split(' '),
);

/**
 * The name at the start of a text, after its determiner: "his red kite"
 * is a kite, "the old signpost." a signpost. At most two words before it;
 * null when what follows names no thing ("his hand", "the time").
 */
export function nounAt(text: string): { word: string; at: number } | null {
  const m = new RegExp(
    `^\\s*(?:(?:up|down|out|back|over|off)\\s+)?${OWN_DETERMINER}\\s+((?:[\\p{L}-]+\\s+){0,2}?)([\\p{L}][\\p{L}-]{1,23})${ENDS}`,
    'u',
  ).exec(text);
  if (!m) return null;
  const word = m[2].toLowerCase();
  if (NEVER.has(word) || NEVER.has(singularOf(word)) || LIKE.has(word))
    return null;
  // What comes before it names it too ("his red kite"), never a clause
  // of its own ("the time we get there") nor "the one" or "the other".
  const before = m[1].toLowerCase().split(/\s+/).filter(Boolean);
  if (
    before.some((w) => NEVER.has(w) || NOT_A_NAME.has(w)) ||
    NOT_A_NAME.has(word)
  )
    return null;
  return { word, at: m.index + m[0].length - m[2].length };
}

/** Whether a word may name a feature: nothing of the body, of people, of places or of the weather. */
export const mayBeFeature = (word: string) => {
  const w = singularOf(word);
  return (
    !NEVER.has(w) &&
    !LIKE.has(word) &&
    !NOT_A_FEATURE.has(w) &&
    !NOT_A_FEATURE.has(word)
  );
};

/** Whether a word may name a thing: nothing of the body, of people, of places or of the weather. */
export const mayBeThing = mayBeFeature;

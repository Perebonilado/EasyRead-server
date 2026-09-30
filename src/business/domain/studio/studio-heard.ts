/**
 * What the maker's own words say of the brief, whatever the producer made
 * of them: the tone they tapped or typed ("Dry and ironic" is funny, never
 * serious), the genre they named ("a dark comedy"), and an idea left to
 * the Studio ("you pick") or said loosely ("a comedy in New York"), taken
 * as the idea so it is never asked for twice. The producer (a model)
 * reads the maker first; this is what code holds it to.
 */
import type { StudioBrief, StudioGenre, StudioTone } from './studio';

/** Words that take back the word after them: "funny, not serious", "nothing too dark". */
const NEGATED =
  /\b(?:not|no|never|less|nothing|without|isn'?t|don'?t\s+(?:make\s+it|want(?:\s+it)?))\s+(?:(?:too|so|very|that|a|at\s+all|remotely)\s+)*[\w-]+/g;

/** The maker's words, lower case, with anything they said it is not taken out. */
const heardOf = (words: string): string =>
  words.toLowerCase().replace(/[’']/g, "'").replace(NEGATED, ' ');

/** A tap or a quick answer: a chip is at most five words. */
const isShort = (words: string): boolean =>
  words.trim().split(/\s+/).filter(Boolean).length <= 6;

/**
 * Each tone and the words for it, in the order they are heard: a comic
 * word wins over a warm or calm one beside it ("Warm but silly", "Calm and
 * deadpan" are funny). The first words are heard anywhere; the loose ones
 * ("warm", "quiet", "chaotic") only as an answer, a tap or a few words,
 * since "a quiet village" says where, not how it feels.
 */
const TONE_WORDS: [StudioTone, RegExp, RegExp][] = [
  [
    'funny',
    /\b(?:funny|funnier|comic(?:al)?|comed(?:y|ies)|humou?r(?:ous)?|hilarious|ironic|deadpan|satirical|slapstick|dry(?=[\s,]+(?:and\s+)?(?:ironic|witty|wit|humou?r|funny|deadpan|comic)))\b/,
    /\b(?:silly|sillier|irony|absurd(?:ist)?|witty|wit|wacky|goofy|zany|satire|sarcastic|playful|quirky|madcap|farc(?:e|ical)|cheeky|chaotic|jokes?|jokey|laughs?|dry)\b/,
  ],
  [
    'serious',
    /\b(?:serious|sombre|somber|solemn)\b/,
    /\b(?:earnest|grave|grim)\b/,
  ],
  [
    'exciting',
    /\b(?:exciting|thrilling|action[\s-]packed|suspenseful)\b/,
    /\b(?:thriller|suspense|tense|adventurous|epic)\b/,
  ],
  [
    'gentle',
    /\b(?:gentle|heart[\s-]?warming|wholesome)\b/,
    /\b(?:warm|sweet|tender|heartfelt|cosy|cozy)\b/,
  ],
  [
    'calm',
    /\b(?:calm|peaceful|soothing)\b/,
    /\b(?:quiet|relaxed|relaxing|mellow)\b/,
  ],
];

/**
 * The tone the maker's words name, or null: "Dry and ironic", "deadpan",
 * "chaotic" and "warm but silly" are funny; serious only when they say
 * serious (and not "not serious").
 */
export function toneNamed(words: string): StudioTone | null {
  const heard = heardOf(words);
  const loose = isShort(words);
  return (
    TONE_WORDS.find(
      ([, strict, looser]) =>
        strict.test(heard) || (loose && looser.test(heard)),
    )?.[0] ?? null
  );
}

/** Whether the maker asked for it to be serious ("funny, not serious" does not). */
export const saysSerious = (words: string): boolean =>
  TONE_WORDS[1][1].test(heardOf(words));

/** Each genre and the words for it, the more particular first ("dark comedy" before "comedy"). */
const GENRE_WORDS: [StudioGenre, RegExp][] = [
  [
    'dark-comedy',
    /\b(?:dark(?:ly)?[\s-]+(?:comedy|comic|humou?r|funny)|black\s+comedy|gallows\s+humou?r)\b/,
  ],
  ['slice-of-life', /\bslice[\s-]+of[\s-]+life\b/],
  ['comedy', /\b(?:comed(?:y|ies)|sitcom|romcom|rom-com)\b/],
  ['mystery', /\b(?:mystery|whodunn?it|detective)\b/],
  ['spooky', /\b(?:spooky|ghost\s+story|haunted|halloween)\b/],
  ['romance', /\b(?:romance|romantic|love\s+story)\b/],
  ['adventure', /\badventure\b/],
  ['fable', /\b(?:fable|parable)\b/],
  ['drama', /\bdrama\b/],
];

/** The genre the maker's words name, or null: "a dark comedy" is dark comedy. */
export function genreNamed(words: string): StudioGenre | null {
  const heard = heardOf(words);
  return GENRE_WORDS.find(([, pattern]) => pattern.test(heard))?.[0] ?? null;
}

/** Whether the maker left it to the Studio: "you pick", "surprise me", "up to you". */
export const leavesItToUs = (words: string): boolean =>
  /\b(?:you\s+(?:pick|choose|decide)|up\s+to\s+you|surprise\s+me|your\s+(?:call|choice|pick)|dealer'?s\s+choice|you\s+come\s+up\s+with|(?:anything|whatever)\s+(?:you\s+(?:like|want|think)|works|is\s+fine)|(?:i\s+)?(?:don'?t|do\s+not)\s+(?:know|mind)|no\s+idea|not\s+sure)\b/.test(
    words.toLowerCase().replace(/[’']/g, "'"),
  );

const COMIC: StudioGenre[] = ['comedy', 'dark-comedy'];

/** A genre as words in an idea: "dark comedy", "slice of life". */
const genreWords = (genre: StudioGenre): string =>
  genre === 'dark-comedy'
    ? 'dark comedy'
    : genre === 'slice-of-life'
      ? 'slice-of-life story'
      : genre === 'fable'
        ? 'fable'
        : genre === 'comedy' || genre === 'drama' || genre === 'romance'
          ? genre
          : `${genre} story`;

/**
 * An idea from what is known, when the maker gave only that or left the
 * idea to the Studio: "A dark comedy set in New York". The story step
 * develops it, as it does any idea.
 */
export function ideaFrom(brief: StudioBrief): string {
  const what = brief.genre
    ? genreWords(brief.genre)
    : brief.format === 'explainer'
      ? 'lesson'
      : brief.tone
        ? `${brief.tone} story`
        : 'story';
  const a = /^[aeiou]/.test(what) ? 'An' : 'A';
  const where = brief.setting
    ? ` set in ${brief.setting.replace(/^(?:in|at|set in)\s+/i, '')}`
    : '';
  return `${a} ${what}${where}`;
}

/**
 * What the maker's words hold the brief to, as a patch over what the
 * producer made of them (`said`, over `before`). In the brief, as the
 * brief is gathered: the tone a tap or a short answer names, the genre
 * named (a dark comedy never lost to a loose "comedy"), and the idea when
 * they left it to us or gave one loosely. Always: a comedy's tone is never
 * serious unless the maker says so, and a comedy with no tone is funny.
 */
export function heardBrief(input: {
  said: StudioBrief;
  before: StudioBrief;
  /** The maker's message. */
  words: string;
  /** Whether the brief is being gathered: what they name is taken in only then. */
  gathering: boolean;
}): Partial<StudioBrief> {
  const { said, before, words, gathering } = input;
  const patch: Partial<StudioBrief> = {};

  // The genre they named, where the producer left it or took it looser.
  let genre = said.genre ?? null;
  const named = gathering ? genreNamed(words) : null;
  if (named) {
    const producerLeftIt = (said.genre ?? null) === (before.genre ?? null);
    if (
      (named === 'dark-comedy' && genre === 'comedy') ||
      (producerLeftIt && !genre)
    )
      genre = named;
    // "A comedy in New York" said again of a dark comedy keeps it dark;
    // only words about how dark it is make it a plain comedy.
    if (
      named === 'comedy' &&
      before.genre === 'dark-comedy' &&
      genre === 'comedy' &&
      !/\b(?:dark|light(?:er|en)?|regular|normal|plain|family|clean|kids?|child)/.test(
        words.toLowerCase(),
      )
    )
      genre = 'dark-comedy';
  }
  if (genre && genre !== said.genre) patch.genre = genre;
  // A genre is a kind of story: "a dark comedy" is never asked "story or explainer?".
  if (named && !said.format) patch.format = 'story';

  // The tone their words name: a tap or a short answer is theirs; in
  // longer words, it is the tone while there is none yet.
  let tone = said.tone;
  const toneSaid = gathering ? toneNamed(words) : null;
  if (toneSaid && (isShort(words) || !tone)) tone = toneSaid;
  // Serious only when asked for: never for a tone they named otherwise,
  // nor for a comedy.
  const comic = genre !== null && COMIC.includes(genre);
  const changed = tone !== before.tone || genre !== (before.genre ?? null);
  if (
    tone === 'serious' &&
    changed &&
    !saysSerious(words) &&
    ((toneSaid && toneSaid !== 'serious') || comic)
  )
    tone = toneSaid && toneSaid !== 'serious' ? toneSaid : 'funny';
  if (!tone && comic) tone = 'funny';
  if (tone !== said.tone) patch.tone = tone;

  // The idea: never asked for twice. Left to us, or said loosely (a genre
  // or a place with no story yet), it is what is known.
  if (
    gathering &&
    !said.idea &&
    (leavesItToUs(words) || named || (said.setting && !before.setting))
  )
    patch.idea = ideaFrom({ ...said, ...patch });
  return patch;
}

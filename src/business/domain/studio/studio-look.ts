/**
 * An explainer's look, chosen by code (studio-explainer-plan, Ask 2 §4):
 * from whom it is for and what it is about, never by a model. The maker
 * can choose another on the brief's Look row, or say so in the chat
 * ("make it dark", "a chalkboard look"): what they say is heard here.
 *
 * A look changes nothing made: every scene is recoloured as it is shown,
 * so a new look plays at once.
 */
import { THEMES, THEME_IDS, themeOf, type ThemeId } from '../scene-themes';
import type { StudioBrief, StudioTone } from './studio';
import { bandOf, type AudienceBand } from './studio-audience';

const CHILDREN: readonly AudienceBand[] = [
  'early-years',
  'primary-lower',
  'primary-upper',
];
const SECONDARY: readonly AudienceBand[] = [
  'secondary-lower',
  'secondary-upper',
];

/** Subjects and the look each suits, the more particular first. */
const SUBJECT_LOOKS: [ThemeId, RegExp][] = [
  [
    'nightsky',
    /\b(?:space|astronom\w*|planets?|stars?|galax\w*|universe|cosmo\w*|solar system|black holes?|orbits?|moons?|cells?|cellular|microb\w*|bacteri\w*|virus\w*|atoms?|molecul\w*|quantum|dna|genes?|genetic\w*)\b/,
  ],
  [
    'blueprint',
    /\b(?:engineer\w*|comput\w*|programming|coding|code|software|hardware|algorithm\w*|data ?bases?|networks?|internet|servers?|system design|electronic\w*|circuits?|electric\w*|robot\w*|machines?|mechanic\w*|physics|forces?|energy|motion|architecture)\b/,
  ],
  [
    'cleanlab',
    /\b(?:medic\w*|health\w*|nursing|disease\w*|blood|heart|body|anatomy|biology|chemi\w*|science|scientific|experiments?|vaccin\w*|nutrition|business|econom\w*|financ\w*|money|markets?|marketing|management|statistic\w*)\b/,
  ],
];

/** Maths, or working set out step by step. */
const MATHS =
  /\b(?:maths?|mathematic\w*|algebra|geometry|trigonometr\w*|calculus|equations?|fractions?|arithmetic|times tables?|percentages?|probability)\b/;

/**
 * The look an explainer is given when the maker has not chosen one:
 * children's films are Sunny; maths and working at secondary school are a
 * Chalkboard; engineering, computing and physics a Blueprint; space, cells
 * and the very small a Night Sky; medicine, health, science and business
 * a Clean Lab; anything else Paper.
 */
export function themeFor(input: {
  /** What it is about: the bible's subject, or the idea until there is one. */
  subject: string;
  band: AudienceBand;
  /** Whether it works on a board: maths and graphs set by code. */
  maths?: boolean;
  tone?: StudioTone | null;
}): ThemeId {
  if (CHILDREN.includes(input.band)) return 'sunny';
  const about = input.subject.toLowerCase();
  if (SECONDARY.includes(input.band) && (input.maths || MATHS.test(about)))
    return 'chalkboard';
  return SUBJECT_LOOKS.find(([, words]) => words.test(about))?.[0] ?? 'paper';
}

/** The look an explainer plays in: the maker's, else the one code chooses. Null for a story. */
export function showTheme(
  brief: StudioBrief,
  bible: { subject: string; maths: boolean } | null,
): ThemeId | null {
  if (brief.format !== 'explainer') return null;
  if (brief.look) return brief.look;
  return themeFor({
    subject: bible?.subject || brief.idea,
    // Whom it is for (the audience profile); a grown-up until that is said.
    band: bandOf(brief) ?? 'general-adult',
    maths: bible?.maths ?? false,
    tone: brief.tone,
  });
}

/** Each look by the words for it. */
const LOOK_WORDS: [ThemeId, RegExp][] = [
  ['chalkboard', /\b(?:chalk ?boards?|chalky|blackboards?|green ?boards?)\b/],
  ['blueprint', /\b(?:blue ?prints?|technical drawings?)\b/],
  ['nightsky', /\b(?:night[\s-]?sky|starry|space look|cosmic)\b/],
  ['cleanlab', /\b(?:clean[\s-]?lab|lab look|clinical|crisp)\b/],
  ['sunny', /\b(?:sunny|bright and fun|brighter and (?:more )?fun|cheerful)\b/],
  ['paper', /\b(?:paper look|warm paper|the paper one|like paper)\b/],
];

/** Words about how it looks. */
const LOOKISH =
  /\b(?:look|looks|looking|style|theme|background|colou?rs?|make it|switch|change it|use (?:a|the))\b/;

/** The words that ask for a dark picture, or a light one. */
const DARK =
  /\b(?:make it dark|dark (?:mode|look|theme|background|picture|version)|darker (?:look|background|theme)|on (?:a )?dark|go dark)\b/;
const LIGHT =
  /\b(?:make it light|light (?:mode|look|theme|background|picture|version)|lighter (?:look|background|theme)|on (?:a )?light|go light|not so dark|less dark)\b/;

/**
 * The look the maker's words ask for, or null: a look named ("a
 * chalkboard look"), or the look they have in the other kind ("make it
 * dark" on Paper is Night Sky, its twin). Words that are not about how it
 * looks ("a dark comedy", "the dark side of the moon") ask for nothing.
 */
export function lookHeard(words: string, current: ThemeId): ThemeId | null {
  const heard = words.toLowerCase().replace(/[’']/g, "'");
  // A look is named in words about how it looks, or tapped as a chip:
  // "how chalk forms" and "draw a blueprint of a house" ask for none.
  const aboutTheLook =
    words.trim().split(/\s+/).length <= 4 || LOOKISH.test(heard);
  if (/\bnot\b[^.]*\b(?:dark|chalk|blueprint)/.test(heard)) {
    // "Not so dark": light, below.
  } else if (aboutTheLook) {
    const named = LOOK_WORDS.find(([, re]) => re.test(heard))?.[0];
    if (named) return named;
  }
  const theme = themeOf(current);
  if (DARK.test(heard)) return theme.dark ? theme.id : theme.twin;
  if (LIGHT.test(heard)) return theme.dark ? theme.twin : theme.id;
  return null;
}

/** The six looks, by name, for the producer's words. */
export const LOOK_NAMES = THEME_IDS.map((id) => `"${id}" (${THEMES[id].name})`)
  .join(', ')
  .replace(/, ([^,]*)$/, ' or $1');

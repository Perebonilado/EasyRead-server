/**
 * Who an explainer is for (studio-explainer-plan, Ask 8): an age band,
 * what they already know, why they watch, and whether English is new to
 * them. Stored on the brief as `who`; the brief's old `audience` (four
 * words) is derived from it, so everything that read it still does.
 *
 * The profile is read from the maker's own words first, by code
 * (audienceIn): a grade, a year, a key stage, a form, an exam, a course,
 * an age, a job. Global, never regional: no school system is the default,
 * and nothing is ever guessed from a name or a place. Asked only when it
 * is missing, as one row of chips.
 *
 * Each band has a recipe: how long a sentence is, how hard its words may
 * be, how fast the voice goes (E1), how long text stays still to be read
 * (E4), how big it is, how often the viewer is asked to think, and what
 * the analogies are made of. The recipe's words reach the writers; its
 * numbers reach the voice, the motion, the theme and the checks by code.
 */
import { levelIn, type LearningStage } from '../scene-stage';
import type { StudioAudience, StudioBrief } from './studio';

// ── The profile ───────────────────────────────────────────────────────────

/**
 * The age bands, youngest first, then the grown-ups. The same union as
 * scene-pace's (E1): keep them identical.
 */
export type AudienceBand =
  | 'early-years'
  | 'primary-lower'
  | 'primary-upper'
  | 'secondary-lower'
  | 'secondary-upper'
  | 'university'
  | 'professional'
  | 'general-adult';

export const AUDIENCE_BANDS: readonly AudienceBand[] = [
  'early-years',
  'primary-lower',
  'primary-upper',
  'secondary-lower',
  'secondary-upper',
  'university',
  'professional',
  'general-adult',
];

/** The bands in order of level, youngest to most expert (the general adult stands apart). */
export const BAND_LADDER: readonly AudienceBand[] = AUDIENCE_BANDS.filter(
  (band) => band !== 'general-adult',
);

export const AUDIENCE_PRIORS = ['new', 'some', 'revising'] as const;
export type AudiencePrior = (typeof AUDIENCE_PRIORS)[number];
export const AUDIENCE_GOALS = [
  'understand',
  'exam',
  'apply',
  'curious',
] as const;
export type AudienceGoal = (typeof AUDIENCE_GOALS)[number];
export const AUDIENCE_LANGUAGES = ['fluent', 'learning'] as const;
export type AudienceLanguage = (typeof AUDIENCE_LANGUAGES)[number];
export const AUDIENCE_SUPPORTS = ['normal', 'extra'] as const;
export type AudienceSupport = (typeof AUDIENCE_SUPPORTS)[number];

/**
 * Whom an explainer teaches, as the maker said it. Only the band is sure
 * to be there; each of the rest is absent until said, and taken then as
 * its usual (settled).
 */
export interface AudienceProfile {
  band: AudienceBand;
  /** Their words: "Grade 5", "Year 9", "first-year nursing", "my book club". */
  said?: string;
  /** Absent: some. */
  prior?: AudiencePrior;
  /** Absent: understand. */
  goal?: AudienceGoal;
  /** Learning English (or the film's language). Absent: fluent. */
  language?: AudienceLanguage;
  /** "Needs hand-holding". Absent: normal. */
  support?: AudienceSupport;
}

/** A profile with every field it leaves to its usual filled in. */
export type SettledProfile = Required<Omit<AudienceProfile, 'said'>> &
  Pick<AudienceProfile, 'said'>;

export const settled = (who: AudienceProfile): SettledProfile => ({
  ...who,
  prior: who.prior ?? 'some',
  goal: who.goal ?? 'understand',
  language: who.language ?? 'fluent',
  support: who.support ?? 'normal',
});

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): T | undefined =>
    typeof value === 'string' && list.includes(value as T)
      ? (value as T)
      : undefined;

/**
 * A profile made sound, `raw` over `base` field by field: a band that is
 * not one leaves the base's, a null takes a field back to its usual. No
 * band at all, none.
 */
export function whoOf(
  raw: unknown,
  base: AudienceProfile | undefined = undefined,
): AudienceProfile | undefined {
  if (raw === null) return undefined;
  const said =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const band = oneOf(AUDIENCE_BANDS)(said.band) ?? base?.band;
  if (!band) return undefined;
  const pick = <T extends string>(
    key: keyof AudienceProfile,
    list: readonly T[],
  ): T | undefined =>
    key in said ? oneOf(list)(said[key]) : (base?.[key] as T | undefined);
  // Their words go with the band they named: a band chosen without words
  // is said as the band.
  const words =
    'said' in said
      ? typeof said.said === 'string'
        ? said.said.replace(/\s+/g, ' ').trim().slice(0, 60)
        : ''
      : band === base?.band
        ? (base?.said ?? '')
        : '';
  const out: AudienceProfile = { band };
  if (words) out.said = words;
  const prior = pick('prior', AUDIENCE_PRIORS);
  const goal = pick('goal', AUDIENCE_GOALS);
  const language = pick('language', AUDIENCE_LANGUAGES);
  const support = pick('support', AUDIENCE_SUPPORTS);
  if (prior) out.prior = prior;
  if (goal) out.goal = goal;
  if (language) out.language = language;
  if (support) out.support = support;
  return out;
}

// ── The band and the brief ────────────────────────────────────────────────

/** The brief's old audience a band belongs to, for everything that reads it. */
export const BAND_AUDIENCE: Record<AudienceBand, StudioAudience> = {
  'early-years': 'young children',
  'primary-lower': 'young children',
  'primary-upper': 'children',
  'secondary-lower': 'teens',
  'secondary-upper': 'teens',
  university: 'adults',
  professional: 'adults',
  'general-adult': 'adults',
};

/** The band an old audience is taken as, when no one said more. */
export const AUDIENCE_BAND: Record<StudioAudience, AudienceBand> = {
  'young children': 'early-years',
  children: 'primary-upper',
  teens: 'secondary-lower',
  adults: 'general-adult',
};

/** The lesson writer's stage for a band: a professional is reachable now. */
export const BAND_STAGE: Record<AudienceBand, LearningStage> = {
  'early-years': 'early',
  'primary-lower': 'early',
  'primary-upper': 'early',
  'secondary-lower': 'middle',
  'secondary-upper': 'middle',
  university: 'higher',
  professional: 'professional',
  'general-adult': 'higher',
};

/** The band a lesson stage is taken as, from a document that names only its stage. */
export const STAGE_BAND: Record<LearningStage, AudienceBand> = {
  early: 'primary-upper',
  middle: 'secondary-lower',
  higher: 'university',
  professional: 'professional',
};

/** Whom a brief is for, as a band (E1, E3, E4 read it here): the maker's, else the old audience's; null when not said. */
export function bandOf(
  brief: Pick<StudioBrief, 'audience' | 'who'> | null | undefined,
): AudienceBand | null {
  if (!brief) return null;
  if (brief.who) return brief.who.band;
  return brief.audience ? AUDIENCE_BAND[brief.audience] : null;
}

/** The whole profile of a brief, each field settled; null when no audience is said. */
export function profileOf(
  brief: Pick<StudioBrief, 'audience' | 'who'> | null | undefined,
): SettledProfile | null {
  if (!brief) return null;
  if (brief.who) return settled(brief.who);
  const band = bandOf(brief);
  return band ? settled({ band }) : null;
}

/** The lesson writer's stage for a brief. */
export function stageOf(
  brief: Pick<StudioBrief, 'audience' | 'who'> | null | undefined,
): LearningStage | null {
  const band = bandOf(brief);
  return band ? BAND_STAGE[band] : null;
}

// ── Asking ────────────────────────────────────────────────────────────────

/** The one row of chips the producer asks the audience with (an explainer's). */
export const AUDIENCE_CHIPS: readonly { band: AudienceBand; label: string }[] =
  [
    { band: 'early-years', label: 'Young kids (4–7)' },
    { band: 'primary-upper', label: 'Kids (8–11)' },
    { band: 'secondary-lower', label: 'Teens' },
    { band: 'university', label: 'University' },
    { band: 'professional', label: 'Work' },
    { band: 'general-adult', label: 'Anyone curious' },
  ];

/** The second, optional row: what they know already. */
export const PRIOR_CHIPS: readonly { prior: AudiencePrior; label: string }[] = [
  { prior: 'new', label: 'New to it' },
  { prior: 'some', label: 'Knows a bit' },
  { prior: 'revising', label: 'Revising' },
];

/** A band said in a few words, where the maker said none of their own. */
export const BAND_WORDS: Record<AudienceBand, string> = {
  'early-years': 'Young kids (4–7)',
  'primary-lower': 'Kids (6–8)',
  'primary-upper': 'Kids (8–11)',
  'secondary-lower': 'Teens (11–14)',
  'secondary-upper': 'Teens (14–18)',
  university: 'University',
  professional: 'Work',
  'general-adult': 'Anyone curious',
};

const PRIOR_WORDS: Record<AudiencePrior, string> = {
  new: 'new to it',
  some: 'knows a bit',
  revising: 'revising',
};

/** The profile in one line, as the brief card shows it: "Grade 5 · new to it". */
export function whoLine(who: AudienceProfile): string {
  return [
    who.said || BAND_WORDS[who.band],
    who.prior ? PRIOR_WORDS[who.prior] : null,
    who.language === 'learning' ? 'learning English' : null,
    who.support === 'extra' && who.prior !== 'new' ? 'extra help' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── Hearing it ────────────────────────────────────────────────────────────

/** What a maker's words say of whom it is for; each field only where they say it. */
export interface AudienceHeard extends Partial<AudienceProfile> {
  /** The words that told it, for the record. */
  words: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};
/** A class or a year as a number: "5", "five", "fifth", "5th", "XII". */
const N =
  '(\\d{1,2}(?:st|nd|rd|th)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)';
const numberOf = (word: string | undefined): number | null => {
  if (!word) return null;
  const w = word.toLowerCase().replace(/(?:st|nd|rd|th)$/, '');
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? NUMBER_WORDS[word.toLowerCase()] ?? null;
};

/** A band for an age: the youngest of a range, so no one is taught over their head. */
export function bandOfAge(age: number): AudienceBand | null {
  if (!Number.isFinite(age) || age < 2 || age > 99) return null;
  if (age < 6) return 'early-years';
  if (age < 8) return 'primary-lower';
  if (age < 11) return 'primary-upper';
  if (age < 14) return 'secondary-lower';
  if (age < 18) return 'secondary-upper';
  return 'general-adult';
}

/** A US or Indian grade, a class, a Basic: grade 0 is kindergarten. */
const bandOfGrade = (n: number | null): AudienceBand | null =>
  n === null || n > 12
    ? null
    : n === 0
      ? 'early-years'
      : n <= 2
        ? 'primary-lower'
        : n <= 5
          ? 'primary-upper'
          : n <= 8
            ? 'secondary-lower'
            : 'secondary-upper';

/** A UK, Irish, Australian or New Zealand year: Year 1 is five going on six. */
const bandOfYear = (n: number | null): AudienceBand | null =>
  n === null || n > 13
    ? null
    : n === 0
      ? 'early-years'
      : n <= 2
        ? 'primary-lower'
        : n <= 6
          ? 'primary-upper'
          : n <= 9
            ? 'secondary-lower'
            : 'secondary-upper';

/** A primary class (Primary 4, P5, Standard 3): the last years of primary are the upper band. */
const bandOfPrimary = (n: number | null): AudienceBand | null =>
  n === null || n > 8
    ? null
    : n <= 2
      ? 'primary-lower'
      : n <= 6
        ? 'primary-upper'
        : 'secondary-lower';

type Rule = {
  pattern: RegExp;
  /** How sure: 3 a level named, 2 a kind of school or group, 1 a loose word. */
  weight: number;
  band: (m: RegExpExecArray) => AudienceBand | null;
};

const fixed = (band: AudienceBand) => (): AudienceBand => band;

/** Words for grades that are not a school's: a tumour, a burn, a steel. */
const NOT_SCHOOL =
  '(?!\\s*(?:tumou?rs?|gliomas?|burns?|cancers?|sprains?|lesions?|steel|oil|fuel|paper|diesel|bolts?)\\b)';
/** A year that is a course's, not a school's: "year 2 of my degree". */
const NOT_COURSE =
  '(?!\\s*(?:of|at|in)\\s+(?:(?:my|the|their|her|his|a)\\s+)?(?:degree|course|university|uni|college|programme|program|residency|training|study|studies|war|project)\\b)';

const BAND_RULES: Rule[] = [
  // Ages.
  {
    pattern:
      /\b(?:ages?d?|aged)\s*(\d{1,2})(?:\s*(?:-|–|—|to|and)\s*(\d{1,2}))?(?!\s*(?:percent|%|years? ago))\b/i,
    weight: 3,
    band: (m) => bandOfAge(Number(m[1])),
  },
  {
    pattern: new RegExp(
      `\\b(\\d{1,2}|${N.slice(1, -1)})(?:\\s*(?:-|–|—|to)\\s*\\d{1,2})?[\\s-]*(?:year|yr)s?[\\s-]*olds?\\b`,
      'i',
    ),
    weight: 3,
    band: (m) => bandOfAge(numberOf(m[1]) ?? NaN),
  },
  {
    // "Kids (8–11)", "children 6-8", "learners aged 9".
    pattern:
      /\b(?:kids|children|pupils|learners|students|teens|young (?:kids|children))\s*\(?\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\)?/i,
    weight: 3,
    band: (m) => bandOfAge(Number(m[1])),
  },
  // Grades, classes, years and forms, as schools around the world name them.
  {
    pattern: new RegExp(`\\b(?:grades?|gr\\.)\\s*${N}\\b${NOT_SCHOOL}`, 'i'),
    weight: 3,
    band: (m) => bandOfGrade(numberOf(m[1])),
  },
  {
    pattern: new RegExp(`\\b${N}[\\s-]+grade(?:rs?)?\\b${NOT_SCHOOL}`, 'i'),
    weight: 3,
    band: (m) => bandOfGrade(numberOf(m[1])),
  },
  {
    pattern: new RegExp(
      `\\b(?:year|yr)\\s*${N}\\b${NOT_COURSE}(?!\\s*(?:students?|undergrads?)\\s+(?:at|of)\\s+(?:uni|university|college))`,
      'i',
    ),
    weight: 3,
    band: (m) => bandOfYear(numberOf(m[1])),
  },
  {
    pattern: /\b(?:key\s*stage|KS)\s*([1-5])\b/i,
    weight: 3,
    band: (m) =>
      (
        [
          null,
          'primary-lower',
          'primary-upper',
          'secondary-lower',
          'secondary-upper',
          'secondary-upper',
        ] as const
      )[Number(m[1])],
  },
  {
    pattern: new RegExp(`\\bprimary\\s*${N}\\b`, 'i'),
    weight: 3,
    band: (m) => bandOfPrimary(numberOf(m[1])),
  },
  {
    pattern:
      /\bP([1-7])\b(?=\s*(?:pupils|class|students|kids|children|learners|maths|science|english|level))/,
    weight: 3,
    band: (m) => bandOfPrimary(Number(m[1])),
  },
  {
    pattern: new RegExp(`\\b(?:standard|std\\.?)\\s*${N}\\b`, 'i'),
    weight: 3,
    band: (m) => bandOfPrimary(numberOf(m[1])),
  },
  {
    pattern: new RegExp(
      `\\bclass\\s*${N}\\b(?!\\s*(?:lasers?|drivers?|licen[cs]es?|action|a\\b|b\\b))`,
      'i',
    ),
    weight: 3,
    band: (m) => bandOfGrade(numberOf(m[1])),
  },
  {
    // India's "Class X", "Class XII".
    pattern: /\bClass\s+(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II)\b/,
    weight: 3,
    band: (m) => bandOfGrade(numberOf(m[1])),
  },
  {
    pattern: new RegExp(`\\bbasic\\s*${N}\\b`, 'i'),
    weight: 3,
    band: (m) => bandOfGrade(numberOf(m[1])),
  },
  {
    pattern: new RegExp(`\\bform\\s*${N}\\b(?!\\s*\\d)`, 'i'),
    weight: 3,
    band: (m) => {
      const n = numberOf(m[1]);
      return n === null || n > 6
        ? null
        : n <= 2
          ? 'secondary-lower'
          : 'secondary-upper';
    },
  },
  {
    pattern: /\b(?:(?:lower|upper)\s+sixth|sixth[\s-]form(?:ers?)?)\b/i,
    weight: 3,
    band: fixed('secondary-upper'),
  },
  {
    pattern:
      /\b(?:J\.?S\.?S\.?\s*[1-3]|JHS\s*[1-3]?|junior (?:high|secondary)(?: school)?)\b/i,
    weight: 3,
    band: fixed('secondary-lower'),
  },
  {
    pattern:
      /\b(?:S\.?S\.?S?\.?\s*[1-3](?!\d)|SHS\s*[1-3]?|senior (?:high|secondary)(?: school)?)\b/i,
    weight: 3,
    band: fixed('secondary-upper'),
  },
  {
    pattern: /\b(?:CE1|CM1|CM2|CE2)\b/,
    weight: 3,
    band: fixed('primary-upper'),
  },
  {
    pattern: /\b(?:[65]e|[65]ème|sixième|cinquième|quatrième|troisième)\b/i,
    weight: 3,
    band: fixed('secondary-lower'),
  },
  {
    pattern: /\b(?:terminale|lyc[ée]e|lyc[ée]ens?)\b/i,
    weight: 3,
    band: fixed('secondary-upper'),
  },
  {
    pattern: /\bcollège\b/i,
    weight: 2,
    band: fixed('secondary-lower'),
  },
  {
    pattern: /\bKlasse\s*(\d{1,2})\b/,
    weight: 3,
    band: (m) => bandOfGrade(Number(m[1])),
  },
  // Programmes and exams.
  { pattern: /\bPYP\b/, weight: 3, band: fixed('primary-upper') },
  { pattern: /\bMYP\b/, weight: 3, band: fixed('secondary-lower') },
  {
    pattern: /\b(?:IB\b(?:\s*(?:DP|Diploma|HL|SL))?|IBDP)\b/,
    weight: 3,
    band: fixed('secondary-upper'),
  },
  {
    pattern:
      /\bAP\s+(?:[A-Z][a-z]+|class(?:es)?|exams?|courses?|students?|level)\b/,
    weight: 3,
    band: fixed('secondary-upper'),
  },
  {
    pattern:
      /\b(?:A[\s-]?levels?|AS[\s-]levels?|I?GCSEs?|SATs? prep|SAT|Leaving Cert(?:ificate)?|Abitur|Matric(?:ulation)?|HSC|WAEC|WASSCE|NECO|SSCE|KCSE|CBSE|ICSE|Gaokao|NCEA|VCE|HKDSE|STPM|SPM|UTME|JAMB|baccalaur[ée]at)\b/,
    weight: 3,
    band: fixed('secondary-upper'),
  },
  {
    pattern: /\b(?:BECE|KCPE|Junior Cert(?:ificate)?)\b/,
    weight: 3,
    band: fixed('secondary-lower'),
  },
  {
    pattern:
      /\b(?:PSLE|11[\s-]?plus|eleven[\s-]plus|common entrance|KS2 SATs)\b/i,
    weight: 3,
    band: fixed('primary-upper'),
  },
  // Before school.
  {
    pattern:
      /\b(?:pre-?k|pre-?school(?:ers)?|nursery(?: school| class)?|kindergarten|kinder|reception(?: class| year)|EYFS|early years|toddlers|infant school)\b/i,
    weight: 3,
    band: fixed('early-years'),
  },
  // University and college.
  {
    pattern:
      /\b(?:(?:first|second|third|fourth|final|1st|2nd|3rd|4th)[\s-]years?\s+(?:[a-z]+\s+){0,2}?(?:students?|undergrads?|undergraduates?|nursing|nurses|medics?|medicine|law|engineering|uni|university|college|course|degree|module|class|chemistry|physics|biology|economics|psychology)|undergrad(?:uate)?s?|freshm[ae]n|sophomores?|bachelor'?s|master'?s|MSc|BSc|MBA|Ph\.?D|doctoral|postgrad(?:uate)?s?|grad(?:uate)? (?:school|students?)|[1-7]00[\s-]?level|pre-?med|tertiary|college (?:students?|freshm[ae]n|level|courses?|class)|university (?:students?|level|course)|uni students?)\b/i,
    weight: 3,
    band: fixed('university'),
  },
  {
    pattern:
      /\b(?:med(?:ical)?|nursing|law|engineering|pharmacy|dental|vet(?:erinary)?|business|economics|physics|chemistry|biology|history|psychology|maths?|mathematics|computer science|CS|architecture|accounting|midwifery)\s+(?:students?|school|majors?|undergrads?|degree)\b/i,
    weight: 3,
    band: fixed('university'),
  },
  {
    pattern: /\b(?:university|uni|polytechnic|college)\b/i,
    weight: 2,
    band: fixed('university'),
  },
  // Work.
  {
    pattern:
      /\b(?:(?:for|to|with|train)\s+(?:my|our|the)\s+(?:team|staff|colleagues|employees|workers|engineers|developers|devs|nurses|doctors|clinicians|sales (?:team|reps)|managers|co-?workers|interns|new (?:hires|starters|joiners))|onboarding|new (?:hires|starters|joiners|employees)|CPD|CME|continuing (?:professional )?(?:development|education)|in-?service training|(?:staff|employee|workplace|corporate|compliance|on-the-job) training)\b/i,
    weight: 3,
    band: fixed('professional'),
  },
  {
    pattern:
      /\b(?:for|to|training)\s+(?:new |junior |practising |practicing |qualified |registered |trainee )?(?:nurses|doctors|engineers|developers|lawyers|accountants|pharmacists|paramedics|midwives|social workers|teachers|managers|technicians|electricians|plumbers|caregivers|carers|clinicians|professionals|practitioners|trainees|residents)\b/i,
    weight: 3,
    band: fixed('professional'),
  },
  {
    pattern:
      /\b(?:professionals?|practitioners?|at work|workplace|trainees?)\b/i,
    weight: 2,
    band: fixed('professional'),
  },
  // Schools and groups, by the kind.
  {
    pattern:
      /\b(?:young (?:kids|children|learners|ones)|little (?:ones|kids)|small children|preschoolers|infants)\b/i,
    weight: 2,
    band: fixed('early-years'),
  },
  {
    pattern:
      /\b(?:elementary(?: school)?|primary(?: school| pupils| kids| children| students)|junior school|grade school|older kids|tweens|pre-?teens)\b/i,
    weight: 2,
    band: fixed('primary-upper'),
  },
  {
    pattern:
      /\b(?:middle school(?:ers)?|intermediate school|secondary school|lower secondary|young teens)\b/i,
    weight: 2,
    band: fixed('secondary-lower'),
  },
  {
    pattern:
      /\b(?:high school(?:ers)?|upper secondary|older teens|young adults)\b/i,
    weight: 2,
    band: fixed('secondary-upper'),
  },
  {
    pattern:
      /\b(?:adults?|grown[\s-]?ups|general (?:audience|public)|lay (?:audience|people|person)|laypeople|non-?experts?|non-?specialists?|older adults|retirees|pensioners|the elderly|my (?:book club|parents|mum|mom|dad|grandparents?)|adult learners|adult education|curious (?:people|minds|adults))\b/i,
    weight: 2,
    band: fixed('general-adult'),
  },
  {
    pattern: /\b(?:anyone|everyone|parents)\b/i,
    weight: 1,
    band: fixed('general-adult'),
  },
  {
    pattern:
      /\b(?:kids|children|child|pupils|schoolchildren|school children|youngsters)\b/i,
    weight: 1,
    band: fixed('primary-upper'),
  },
  {
    pattern: /\b(?:teens|teenagers?|adolescents|young people|youth)\b/i,
    weight: 1,
    band: fixed('secondary-lower'),
  },
];

const PRIOR_RULES: [AudiencePrior, RegExp][] = [
  [
    'revising',
    /\b(?:revis(?:e|es|ing|ion)|review(?:ing)? for|refresher|brush(?:ing)? up|recap|cram(?:ming)?|(?:exam|test|finals?) (?:is |are )?(?:next|tomorrow|soon|on|in)|before (?:the|their|my|an|our) (?:exams?|tests?|finals)|quick review|a reminder)\b/i,
  ],
  [
    'some',
    /\b(?:knows? a bit|know(?:s)? (?:some|a little|the basics)|some (?:background|knowledge|experience)|already (?:know|knows|learned|learnt|studied|familiar|covered)|familiar with|intermediate|(?:has|have) (?:done|covered) the basics|a bit of (?:background|knowledge))\b/i,
  ],
  [
    'new',
    /\b(?:new to|brand new|(?:complete|total|absolute)(?:ly)? (?:beginners?|novices?|new)|beginners?|novices?|from scratch|(?:no|zero|without any?) (?:background|prior knowledge|experience|idea)|never (?:seen|heard|studied|learned|learnt|done|met|taken)|first (?:time|introduction|look at)|intro(?:duction)? (?:to|for)|the basics|for dummies|hand[\s-]?holding|step[\s-]by[\s-]step|ELI5|like I'?m (?:five|5))\b/i,
  ],
];

const EXTRA_SUPPORT =
  /\b(?:hand[\s-]?holding|(?:complete|total|absolute) (?:beginners?|novices?)|struggl\w+|finds? (?:it|this|reading|maths?) (?:hard|difficult|tough)|extra (?:help|support)|slow(?:er)? learners?|learning (?:difficult|disabilit)\w*|special (?:educational )?needs|dyslexi\w+|ELI5|like I'?m (?:five|5)|spoon[\s-]?fe\w+)|\bSEND?\b(?= (?:pupils|students|learners|kids|children|class))/i;

const GOAL_RULES: [AudienceGoal, RegExp][] = [
  [
    'exam',
    /\b(?:exams?|finals|exam[\s-]style|past papers?|(?:for|before) (?:a|the|their|my|an) (?:test|quiz)|tests? (?:next|tomorrow|on))\b|\b(?:NCLEX|USMLE|MCAT|LSAT|I?GCSEs?|A[\s-]?levels?|SAT|WAEC|WASSCE|KCSE|IB|AP\s+[A-Z]\w+)\b/,
  ],
  [
    'apply',
    /\b(?:on the job|in practice|at work|apply (?:it|this|them)|use (?:it|this) (?:at|in|on)|hands-on|practical|real[\s-]world|day[\s-]to[\s-]day)\b/i,
  ],
  [
    'curious',
    /\b(?:curious|for fun|just interested|out of interest|anyone curious)\b/i,
  ],
];

const LEARNING_ENGLISH =
  /\b(?:English (?:language )?learners?|learners? of English|learning English|ESL|EAL|ELLs?|EFL|ESOL|non-?native(?: English)?(?: speakers?)?|(?:as a )?second language|English (?:is )?(?:not their first|their second|a second)|limited English|beginner English|new to English|simple English)\b/i;

/** A match made the maker's line: "for my team" is "My team", "grade 5" is "Grade 5". */
const saidOf = (words: string): string => {
  const clean = words
    .replace(/^(?:for|to|with|train|training)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

/** The chips, by their words: a tap is heard exactly, before any pattern. */
const chipKey = (words: string) =>
  words.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const CHIP_BAND = new Map(
  AUDIENCE_CHIPS.map((chip) => [chipKey(chip.label), chip.band]),
);
const CHIP_PRIOR = new Map(
  PRIOR_CHIPS.map((chip) => [chipKey(chip.label), chip.prior]),
);

/**
 * Whom the maker's words say it is for, by code: a grade, a year, a key
 * stage, a primary class or a form, an exam, a course, an age, a job, or
 * the kind of people; what they know already, why they watch, whether
 * English is new to them and whether they need extra help. Each field
 * only where the words say it; null when they say none of it. The level
 * named most surely wins ("Year 9 kids" is Year 9); two as sure, the
 * first said. Never guessed from a name or a place.
 */
export function audienceIn(text: string): AudienceHeard | null {
  const said = (text ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!said) return null;
  const heard: AudienceHeard = { words: [] };

  // A chip tapped, perhaps with its second row: "Kids (8–11) · new to it".
  const parts = said.split(/\s*[·,;]\s*/).map(chipKey);
  const chip = parts.map((p) => CHIP_BAND.get(p)).find(Boolean);
  const chipPrior = parts.map((p) => CHIP_PRIOR.get(p)).find(Boolean);

  if (chip) {
    heard.band = chip;
    heard.said = AUDIENCE_CHIPS.find((c) => c.band === chip)!.label;
    heard.words.push(heard.said);
  } else {
    let best: {
      band: AudienceBand;
      weight: number;
      at: number;
      words: string;
    } | null = null;
    for (const rule of BAND_RULES) {
      const m = rule.pattern.exec(said);
      if (!m) continue;
      const band = rule.band(m);
      if (!band) continue;
      // Said as who it is for, it is surer: "for adults", "for my team".
      const before = said.slice(Math.max(0, m.index - 16), m.index);
      const weight =
        rule.weight +
        (/\b(?:for|to|aimed at|teaching|teach)\s+(?:(?:my|our|the|a|an|some)\s+)?$/i.test(
          before,
        )
          ? 1
          : 0);
      if (
        !best ||
        weight > best.weight ||
        (weight === best.weight && m.index < best.at)
      )
        best = { band, weight, at: m.index, words: m[0] };
    }
    if (best) {
      heard.band = best.band;
      heard.said = saidOf(best.words);
      heard.words.push(best.words.trim());
    }
  }
  if (chip === 'general-adult') heard.goal = 'curious';

  let prior = chipPrior;
  for (const [p, pattern] of PRIOR_RULES) {
    if (prior) break;
    const m = pattern.exec(said);
    if (!m) continue;
    prior = p;
    heard.words.push(m[0].trim());
  }
  if (prior) heard.prior = prior;
  const extra = EXTRA_SUPPORT.exec(said);
  if (extra) {
    heard.support = 'extra';
    heard.prior ??= 'new';
    heard.words.push(extra[0].trim());
  }
  if (!heard.goal) {
    const goal = GOAL_RULES.find(([, pattern]) => pattern.test(said));
    if (goal) heard.goal = goal[0];
  }
  const english = LEARNING_ENGLISH.exec(said);
  if (english) {
    heard.language = 'learning';
    heard.words.push(english[0].trim());
  }
  const found =
    heard.band || heard.prior || heard.support || heard.goal || heard.language;
  return found ? heard : null;
}

/**
 * The profile the maker's words make of the one they had: a band they
 * name replaces the band and its words; what they say they know, their
 * goal, their English and their need for help, each over the one before.
 * Nothing heard, the one they had. No band yet and none named, none.
 */
export function heardWho(
  heard: AudienceHeard | null,
  before: AudienceProfile | undefined,
): AudienceProfile | undefined {
  if (!heard) return before;
  const band = heard.band ?? before?.band;
  if (!band) return undefined;
  const out: AudienceProfile = {
    ...(before && !heard.band ? before : {}),
    ...(before && heard.band
      ? {
          ...(before.prior ? { prior: before.prior } : {}),
          ...(before.goal ? { goal: before.goal } : {}),
          ...(before.language ? { language: before.language } : {}),
          ...(before.support ? { support: before.support } : {}),
        }
      : {}),
    band,
  };
  if (heard.band && heard.said) out.said = heard.said;
  if (heard.prior) out.prior = heard.prior;
  if (heard.goal) out.goal = heard.goal;
  if (heard.language) out.language = heard.language;
  if (heard.support) out.support = heard.support;
  return out;
}

/** What heard words say beyond the band: what they know, their goal, their English, their need for help. */
const extrasOf = (
  heard: AudienceHeard | null,
): Omit<AudienceProfile, 'band' | 'said'> => ({
  ...(heard?.prior ? { prior: heard.prior } : {}),
  ...(heard?.goal ? { goal: heard.goal } : {}),
  ...(heard?.language ? { language: heard.language } : {}),
  ...(heard?.support ? { support: heard.support } : {}),
});

/**
 * The profile a producer's turn leaves, from the maker's words now
 * (`words`) and all they said of this episode so far (`soFar`, now's
 * included): a band they name now is theirs, with what they said earlier
 * of what they know; else the profile they had, with what they add now.
 * With none yet: the band their earlier words named, or the level their
 * own text names, or the four words the producer took, but only when
 * there is more to it than the four words. Undefined: none to keep.
 */
export function whoHeard(
  brief: Pick<StudioBrief, 'audience' | 'who' | 'source'>,
  words: string,
  soFar: string,
): AudienceProfile | undefined {
  const now = audienceIn(words);
  const all = audienceIn(soFar);
  if (now?.band)
    return heardWho(now, brief.who ?? { band: now.band, ...extrasOf(all) });
  if (brief.who) return heardWho(now, brief.who);
  const level = brief.source ? levelIn(brief.source) : null;
  const band =
    all?.band ??
    (level ? STAGE_BAND[level.stage] : undefined) ??
    (brief.audience ? AUDIENCE_BAND[brief.audience] : undefined);
  if (!band) return undefined;
  const extras = extrasOf(all);
  if (!all?.band && !level && !Object.keys(extras).length) return undefined;
  const said = all?.band
    ? all.said
    : level
      ? saidOf(level.words[0])
      : undefined;
  return { band, ...(said ? { said } : {}), ...extras };
}

/**
 * The chips an explainer's audience is asked with, when it is what the
 * producer asks next (the kind and the idea known, the audience not): one
 * row of bands, and what they know as a second only when nothing they
 * said tells it. Null for any other question.
 */
export function audienceChips(
  brief: Pick<StudioBrief, 'format' | 'idea' | 'audience'>,
  soFar: string,
): { choices: string[]; also?: string[] } | null {
  if (brief.format !== 'explainer' || !brief.idea || brief.audience)
    return null;
  const known = audienceIn(soFar)?.prior;
  return {
    choices: AUDIENCE_CHIPS.map((chip) => chip.label),
    ...(known ? {} : { also: PRIOR_CHIPS.map((chip) => chip.label) }),
  };
}

// ── Recipes ───────────────────────────────────────────────────────────────

export interface AudienceRecipe {
  band: AudienceBand;
  /** The lesson writer's stage it stands on (its labels, its drawings). */
  stage: LearningStage;
  /** Who the learner is, as the writer is told. */
  reader: string;
  /** Words a spoken sentence: fewest and most. */
  sentence: [number, number];
  /** The Flesch–Kincaid grade the narration keeps to, at most. */
  grade: number;
  /** Hard words a narration may carry, as a share of its words. */
  hardShare: number;
  /** Words outside the everyday 3,000, as a share: for the youngest only, else null. */
  rareShare: number | null;
  /** New terms a minute, at most. */
  termsAMinute: number;
  /** Small ideas (points) a minute, at most. */
  ideasAMinute: number;
  /** The narration's words a minute (E1's BASE). */
  wpm: number;
  /** How fast they read text on the stage, in words a minute (E4's readMs). */
  readWpm: number;
  /** The smallest text on the stage, in stage units (E4). */
  textSize: number;
  /** Words on a keyword card, at most. */
  cardWords: number;
  /** Labels on one drawing, at most. */
  labels: number;
  /** How fast things move, against an adult's (E4). */
  motion: number;
  /** A check for understanding every so many seconds of film. */
  checkEvery: number;
  /** How a check is asked. */
  checks: string;
  /** How to explain. */
  explain: string;
  /** What analogies are made of. */
  analogies: string[];
  /** What goes on the stage. */
  pictures: string;
  humour: 'welcome' | 'light' | 'rare';
  /** Whether the show's host (a mascot) is on by default. */
  mascot: boolean;
  /** The feeling and how lively it moves. */
  tone: string;
  /** Captions on by default. */
  captions: boolean;
  /** Key terms shown as cards when first said. */
  keyCards: boolean;
  /** What the modifiers add, for the writer: pre-training, worked examples, recaps. */
  notes: string[];
}

type BandRecipe = Omit<
  AudienceRecipe,
  'band' | 'notes' | 'captions' | 'keyCards'
>;

const CHILD_PICTURES =
  'Big, simple drawings of things a child can recognise, and friendly characters where people are part of the idea. A sum goes on the stage as working ("math"), one operation a line: code draws its numbers as blocks, bars or rows of dots, so draw no counters of your own for it.';

export const AUDIENCE_RECIPES: Record<AudienceBand, BandRecipe> = {
  'early-years': {
    stage: 'early',
    reader:
      'The learner is a young child of four to six, who is only starting to read: everything is heard and seen, never read.',
    sentence: [3, 9],
    grade: 1,
    hardShare: 0.01,
    rareShare: 0.06,
    termsAMinute: 1,
    ideasAMinute: 1,
    wpm: 110,
    readWpm: 60,
    textSize: 52,
    cardWords: 2,
    labels: 1,
    motion: 0.75,
    checkEvery: 60,
    checks:
      'Ask the child a very simple question ("Can you see the moon?") and leave a long pause for them to answer, then say the answer.',
    explain:
      'Tell it as a tiny story in a world the child knows (home, play, food, animals), with a friendly guide. One idea at a time, said simply, then said again another way. Name a new word only with a picture of it.',
    analogies: ['toys and play', 'food', 'animals', 'bath time', 'the weather'],
    pictures: CHILD_PICTURES,
    humour: 'welcome',
    mascot: true,
    tone: 'playful and warm, gentle motion',
  },
  'primary-lower': {
    stage: 'early',
    reader:
      'The learner is a child of six to eight, who reads short words and learns best from pictures and stories.',
    sentence: [4, 11],
    grade: 3,
    hardShare: 0.02,
    rareShare: 0.08,
    termsAMinute: 1.5,
    ideasAMinute: 1.5,
    wpm: 120,
    readWpm: 90,
    textSize: 48,
    cardWords: 3,
    labels: 2,
    motion: 0.8,
    checkEvery: 75,
    checks:
      'Ask the child a simple question and leave a long pause for them to think before the answer comes.',
    explain:
      'Tell it as a little story or an everyday scene a child knows, with a friendly guide when it helps. One idea at a time, said simply, then again another way. Name a new word only with a picture of it.',
    analogies: ['play', 'food', 'animals', 'school', 'the weather'],
    pictures: CHILD_PICTURES,
    humour: 'welcome',
    mascot: true,
    tone: 'playful and bright, lively but never hurried',
  },
  'primary-upper': {
    stage: 'early',
    reader:
      'The learner is a child of eight to eleven: curious, reading well enough, and still learning best from pictures, stories and examples.',
    sentence: [5, 13],
    grade: 5,
    hardShare: 0.04,
    rareShare: 0.1,
    termsAMinute: 2,
    ideasAMinute: 2,
    wpm: 132,
    readWpm: 130,
    textSize: 44,
    cardWords: 3,
    labels: 2,
    motion: 0.8,
    checkEvery: 90,
    checks:
      'Ask the viewer a question to think about ("What do you think happens next?"), leave a pause, then give the answer.',
    explain:
      'Start from something a child has seen or done, then the idea in plain words, then the proper word for it with a picture. One idea at a time, each built on the last, with an example for each.',
    analogies: ['play', 'food', 'animals', 'sports', 'the weather', 'school'],
    pictures: CHILD_PICTURES,
    humour: 'welcome',
    mascot: true,
    tone: 'bright and lively',
  },
  'secondary-lower': {
    stage: 'middle',
    reader:
      'The learner is a young teen of eleven to fourteen, at secondary school: able to follow a reason step by step, put off by being talked down to.',
    sentence: [6, 15],
    grade: 7,
    hardShare: 0.06,
    rareShare: null,
    termsAMinute: 3,
    ideasAMinute: 2.5,
    wpm: 142,
    readWpm: 160,
    textSize: 40,
    cardWords: 5,
    labels: 3,
    motion: 0.9,
    checkEvery: 105,
    checks:
      'Invite the viewer to think before the answer comes ("Think: what would happen if…?"), with a pause.',
    explain:
      'Start from an everyday example they know, then the idea, then the proper term and what it means. Show why it happens, step by step. Keep the words their tests use.',
    analogies: [
      'sports',
      'games',
      'phones and apps',
      'food',
      'music',
      'school life',
    ],
    pictures:
      'Clear diagrams and drawings, charts and working; people where people are part of the idea.',
    humour: 'welcome',
    mascot: false,
    tone: 'lively and clear',
  },
  'secondary-upper': {
    stage: 'middle',
    reader:
      'The learner is an older teen of fourteen to eighteen, working towards their exams: they need the full idea, with the exact terms, made easy to follow.',
    sentence: [7, 17],
    grade: 9,
    hardShare: 0.08,
    rareShare: null,
    termsAMinute: 3,
    ideasAMinute: 3,
    wpm: 150,
    readWpm: 180,
    textSize: 36,
    cardWords: 5,
    labels: 4,
    motion: 0.95,
    checkEvery: 120,
    checks:
      'Now and then ask a question that makes them use the idea, with a pause before the answer.',
    explain:
      'The idea in plain words, then the exact term and its meaning, then the mechanism or the reasoning, step by step, with a worked example where it helps. Keep every term and distinction the exams use.',
    analogies: [
      'sports',
      'phones and the internet',
      'money',
      'transport',
      'music',
      'games',
    ],
    pictures:
      'Diagrams, charts, graphs, timelines and working; people only where people are part of the idea.',
    humour: 'light',
    mascot: false,
    tone: 'clear and focused',
  },
  university: {
    stage: 'higher',
    reader:
      'The learner is at college or university: they need the full idea, every term exact, made easy to follow.',
    sentence: [8, 20],
    grade: 12,
    hardShare: 0.1,
    rareShare: null,
    termsAMinute: 4,
    ideasAMinute: 3,
    wpm: 155,
    readWpm: 200,
    textSize: 32,
    cardWords: 7,
    labels: 5,
    motion: 1,
    checkEvery: 120,
    checks:
      'About every two minutes ask one question that makes them apply the idea, and end with a one-line recap of the key term or result.',
    explain:
      'Plain words first, then the precise term and its exact meaning, then the mechanism or the reasoning, then why it matters. Keep every term, number and distinction the course uses; never water down the content, only the way it is said.',
    analogies: ['everyday technology', 'money', 'transport', 'work', 'cooking'],
    pictures:
      'Diagrams, charts, working, graphs and timelines; people only where people are part of the idea.',
    humour: 'light',
    mascot: false,
    tone: 'calm and focused',
  },
  professional: {
    stage: 'professional',
    reader:
      'The learner is a professional or a trainee at work: they need the rule and how it is applied, in the exact words of their practice.',
    sentence: [8, 22],
    grade: 13,
    hardShare: 0.12,
    rareShare: null,
    termsAMinute: 4,
    ideasAMinute: 3,
    wpm: 160,
    readWpm: 200,
    textSize: 32,
    cardWords: 7,
    labels: 5,
    motion: 1,
    checkEvery: 150,
    checks:
      'Once or twice ask how they would apply it in a real case, and end with the point to remember.',
    explain:
      'State the rule or principle plainly, then its exact terms, then walk through a worked case or a step in practice. Keep the precise words of the law, standard or procedure.',
    analogies: ['the workplace', 'everyday technology', 'money', 'transport'],
    pictures:
      'Process flows, documents and forms, charts, and the people involved shown as their roles.',
    humour: 'rare',
    mascot: false,
    tone: 'calm and plain',
  },
  'general-adult': {
    stage: 'higher',
    reader:
      'The learner is a curious adult with no special background: they want the real idea, clearly told, with nothing assumed.',
    sentence: [8, 20],
    grade: 10,
    hardShare: 0.08,
    rareShare: null,
    termsAMinute: 3,
    ideasAMinute: 3,
    wpm: 155,
    readWpm: 200,
    textSize: 32,
    cardWords: 7,
    labels: 5,
    motion: 1,
    checkEvery: 150,
    checks:
      'Once in a while pose a question for them to wonder about before the answer, and end with a short recap.',
    explain:
      'Start from something everyone has seen, then the idea in plain words, then the proper term, then why it matters in everyday life. Explain every term the first time it is said.',
    analogies: [
      'everyday technology',
      'money',
      'transport',
      'cooking',
      'home life',
    ],
    pictures:
      'Clear diagrams, charts, maps and timelines; people where people are part of the idea.',
    humour: 'light',
    mascot: false,
    tone: 'warm and clear',
  },
};

/** How much the modifiers move a number. */
export const MODIFIERS = {
  /** New to it, or needing extra help: a little slower, a check more often. */
  newPace: 0.95,
  newChecks: 0.75,
  /** Revising: quicker. */
  revisingPace: 1.08,
  /** Learning English: shorter sentences, slower. */
  learningSentence: 0.75,
  learningPace: 0.9,
} as const;

/**
 * A profile's recipe: its band's, moved by what they know, why they
 * watch and their English. New to it (or needing extra help): the parts
 * named before the process, a worked example an idea, a recap every two
 * scenes, a check more, a little slower. Revising: quicker, fewer
 * analogies, recaps and an exam-style question to end. An exam: the
 * exam's exact terms. Learning English: sentences a quarter shorter, no
 * idioms, slower, captions and key-term cards.
 */
export function recipeFor(who: AudienceProfile): AudienceRecipe {
  const p = settled(who);
  const base = AUDIENCE_RECIPES[p.band];
  const recipe: AudienceRecipe = {
    ...base,
    band: p.band,
    sentence: [base.sentence[0], base.sentence[1]],
    analogies: [...base.analogies],
    captions: false,
    keyCards: false,
    notes: [],
  };
  if (p.prior === 'new' || p.support === 'extra') {
    recipe.wpm *= MODIFIERS.newPace;
    recipe.checkEvery = Math.round(recipe.checkEvery * MODIFIERS.newChecks);
    recipe.notes.push(
      'They are new to it: name the parts before the process, give one worked example for each idea, and recap every couple of scenes.',
    );
  }
  if (p.support === 'extra')
    recipe.notes.push(
      'They need a guiding hand: never skip a step, and say each step as its own sentence.',
    );
  if (p.prior === 'revising') {
    recipe.wpm *= MODIFIERS.revisingPace;
    recipe.analogies = recipe.analogies.slice(0, 2);
    recipe.notes.push(
      'They are revising: fewer analogies, more recaps, and end with an exam-style question.',
    );
  }
  if (p.goal === 'exam')
    recipe.notes.push(
      "It is for an exam: keep the exam's exact terms, and end with an exam-style question.",
    );
  if (p.goal === 'apply')
    recipe.notes.push('They will use it: show it applied in one real case.');
  if (p.language === 'learning') {
    recipe.sentence = [
      Math.max(3, Math.round(recipe.sentence[0] * MODIFIERS.learningSentence)),
      Math.max(6, Math.round(recipe.sentence[1] * MODIFIERS.learningSentence)),
    ];
    recipe.wpm *= MODIFIERS.learningPace;
    recipe.captions = true;
    recipe.keyCards = true;
    recipe.notes.push(
      'They are learning English: short, simple sentences, no idioms or phrasal verbs where a plain verb will do, and each key term shown as a card when it is first said.',
    );
  }
  recipe.wpm = Math.round(recipe.wpm);
  return recipe;
}

/** The recipe of a brief's audience; null when none is said. */
export function recipeOf(
  brief: Pick<StudioBrief, 'audience' | 'who'> | null | undefined,
): AudienceRecipe | null {
  const who = profileOf(brief);
  return who ? recipeFor(who) : null;
}

/**
 * Which scenes of an episode carry a check for understanding, as its
 * recipe spaces them: one each time the film passes another `checkEvery`
 * seconds (a few seconds early is near enough), never the opening hook.
 * Revising, or for an exam, the last scene ends on one too.
 */
export function checksAt(
  scenes: readonly { seconds: number }[],
  recipe: Pick<AudienceRecipe, 'checkEvery'>,
  profile: Pick<AudienceProfile, 'prior' | 'goal'> | null = null,
): boolean[] {
  const marks = scenes.map(() => false);
  const slack = 10;
  let t = 0;
  let next = recipe.checkEvery;
  scenes.forEach((scene, k) => {
    t += Math.max(0, scene.seconds);
    if (k > 0 && t >= next - slack) {
      marks[k] = true;
      next = t + recipe.checkEvery;
    }
  });
  if (
    scenes.length > 1 &&
    (profile?.prior === 'revising' || profile?.goal === 'exam')
  )
    marks[scenes.length - 1] = true;
  return marks;
}

/** A list in words: "a, b and c". */
const joinList = (items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * Whom an explainer is for and how to teach them, for the outline and the
 * bible's writers: the reader, the pace of ideas, the checks, the
 * analogies and the modifiers. Their words first, where they said any.
 */
export function describeAudience(who: AudienceProfile): string {
  const r = recipeFor(who);
  return [
    `${r.reader}${who.said ? ` The maker said: "${who.said}".` : ''}`,
    `At most ${r.ideasAMinute} small ideas and ${r.termsAMinute} new terms a minute; sentences of ${r.sentence[0]} to ${r.sentence[1]} words.`,
    `How to explain: ${r.explain}`,
    `Checks: ${r.checks} About one every ${Math.round((r.checkEvery / 60) * 10) / 10} minutes of film.`,
    `Analogies from ${joinList(r.analogies)}. Humour: ${r.humour}.`,
    ...r.notes,
  ].join('\n');
}

/**
 * The recipe as one scene's writer is told it: the reader, the sentences
 * and the words, the terms the scene's seconds hold, how to explain,
 * whether this scene asks the viewer a question, what goes on the stage,
 * and the modifiers.
 */
export function describeRecipe(
  recipe: AudienceRecipe,
  input: { seconds: number; check: boolean; said?: string },
): string {
  const terms = Math.max(
    1,
    Math.round((recipe.termsAMinute * input.seconds) / 60),
  );
  return [
    `Who the learner is: ${recipe.reader}${input.said ? ` The maker said "${input.said}".` : ''}`,
    `Sentences of ${recipe.sentence[0]} to ${recipe.sentence[1]} words, in plain everyday words (a reading level of about grade ${recipe.grade} or easier).`,
    `At most ${terms} new term${terms === 1 ? '' : 's'} in the scene.`,
    `How to explain: ${recipe.explain}`,
    `Analogies from ${joinList(recipe.analogies)}. Humour: ${recipe.humour}.`,
    input.check
      ? `Check: this scene asks the viewer one question (delivery "question"). ${recipe.checks}`
      : 'Check: no question for the viewer in this scene; keep teaching.',
    `What goes on the stage: ${recipe.pictures} At most ${recipe.labels} label${recipe.labels === 1 ? '' : 's'} on a drawing, and at most ${recipe.cardWords} words on a card.`,
    ...recipe.notes,
    `Tone: ${recipe.tone}.`,
  ].join('\n');
}

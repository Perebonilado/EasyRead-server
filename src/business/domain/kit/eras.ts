/**
 * Eras (ported from ig-illustrated's scene-eras.ts): when something is, as
 * an axis of its own beside where it is. The kit reads a piece's era from
 * the plan's words ("the 1950s", "1960", "Victorian", "AD 1200",
 * "1945-1975", "today") and draws what most places shared then: a steam
 * engine before the diesel, a frock coat's length, a hat a crowd wore.
 * An era never implies a region: the 1950s are as much Lagos's as
 * Tokyo's, and nothing here says where a piece is.
 *
 * Only the reading of eras is here; what each kit family draws in an era
 * is its own (people.ts, vehicles.ts), and the illustrated look's
 * wardrobes are the characters' (WP17).
 */
export const ERA_IDS = [
  'ancient',
  'medieval',
  '1500-1800',
  '1800-1900',
  '1900-1945',
  '1945-1975',
  '1975-2000',
  'today',
] as const;
export type EraId = (typeof ERA_IDS)[number];

/** Each era's years, first and last: what a year is read as. */
export const ERA_YEARS: Readonly<Record<EraId, readonly [number, number]>> = {
  ancient: [-100_000, 499],
  medieval: [500, 1499],
  '1500-1800': [1500, 1799],
  '1800-1900': [1800, 1899],
  '1900-1945': [1900, 1945],
  '1945-1975': [1946, 1974],
  '1975-2000': [1975, 2000],
  today: [2001, 100_000],
};

/** The era a year falls in. */
export function eraOfYear(year: number): EraId {
  return (
    ERA_IDS.find(
      (id) => year >= ERA_YEARS[id][0] && year <= ERA_YEARS[id][1],
    ) ?? (year < 0 ? 'ancient' : 'today')
  );
}

/**
 * Named periods, as people say them, and the era each is: from many
 * places' histories alike, each read only as a time, never a place. The
 * first that matches is taken, so the more particular come first.
 */
const PERIODS: readonly (readonly [RegExp, EraId])[] = [
  // Today.
  [
    /\b(?:today|present[- ]day|the present|modern[- ]day|contemporary|nowadays|these days|current(?:ly)?|right now|21st[- ]century|twenty[- ]first century)\b/u,
    'today',
  ],
  // The late twentieth century.
  [
    /\b(?:seventies|eighties|nineties|disco|dot[- ]com|fall of the berlin wall|end of the cold war|post[- ]soviet)\b/u,
    '1975-2000',
  ],
  // The mid twentieth century.
  [
    /\b(?:post[- ]?war|cold war|decoloni[sz]ation|decoloni[sz]ed|space race|moon landing|civil rights movement|swinging sixties|sixties|fifties|mid[- ]century|korean war|vietnam war|sputnik|baby boom)\b/u,
    '1945-1975',
  ],
  // The early twentieth century, the world wars and between.
  [
    /\b(?:edwardian|world war (?:i|one|1|ii|two|2)\b|first world war|second world war|great war|ww ?(?:1|2|i|ii)\b|interwar|inter-war|roaring twenties|twenties|thirties|forties|jazz age|great depression|dust bowl|art deco|prohibition era|suffragettes?|the blitz)\b/u,
    '1900-1945',
  ],
  // The nineteenth century.
  [
    /\b(?:victorian|regency|napoleonic|industrial revolution|gold rush|meiji|scramble for africa|berlin conference|belle [eé]poque|wild west|steam age)\b/u,
    '1800-1900',
  ],
  // From 1500 to 1800.
  [
    /\b(?:renaissance|reformation|tudors?|elizabethan|jacobean|baroque|enlightenment|georgian|age of (?:exploration|discovery|sail)|conquistadors?|mughals?|edo period|ming dynasty|songhai|french revolution|american revolution|shakespeare(?:'s)?|golden age of piracy)\b/u,
    '1500-1800',
  ],
  // The middle ages.
  [
    /\b(?:medieval|mediaeval|middle ages|dark ages|feudal|vikings?|crusades?|crusaders?|byzantine|tang dynasty|song dynasty|yuan dynasty|heian|kamakura|abbasid|umayyad|mali empire|mansa musa|great zimbabwe|aztecs?|incas?|black death|magna carta|norman conquest)\b/u,
    'medieval',
  ],
  // Antiquity.
  [
    /\b(?:ancient|antiquity|prehistoric|pre-historic|stone age|bronze age|iron age|neolithic|pal(?:a)?eolithic|pharaohs?|biblical|old testament|new testament|first century|roman empire|roman republic|romans|han dynasty|qin dynasty|zhou dynasty|maurya|achaemenid|sumer(?:ian)?|babylon(?:ian)?|assyrian?|carthage|kingdom of kush|aksum|axum|olmecs?|nok culture)\b/u,
    'ancient',
  ],
  // A colonial time, said alone: most often the late empires, 1880–1960.
  [/\b(?:colonial|colonialism|colony|protectorate)\b/u, '1900-1945'],
];

/** The words for numbers people write decades and centuries in. */
const DECADE_WORDS: Readonly<Record<string, number>> = {
  twenties: 1925,
  thirties: 1935,
  forties: 1945,
  fifties: 1955,
  sixties: 1965,
  seventies: 1975,
  eighties: 1985,
  nineties: 1995,
};
const ORDINALS: Readonly<Record<string, number>> = {
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
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  'twenty-first': 21,
  'twenty first': 21,
};

/** Where in a century or a decade the words put a time: early, mid or late. */
const partOf = (before: string | undefined): number =>
  !before
    ? 0.5
    : /early|beginning|start/u.test(before)
      ? 0.2
      : /late|end/u.test(before)
        ? 0.8
        : 0.5;

/**
 * The years some words name: a year ("1953", "AD 476", "300 BC"), a
 * decade ("the 1950s", "the '60s", "the fifties"), a century ("the 19th
 * century", "the late eighteenth century", "the 1800s"). Each as a year,
 * a decade or a century at its middle (or nearer its start or end, as the
 * words say).
 */
export function yearsIn(text: string): number[] {
  const words = text
    .toLowerCase()
    .replace(/[‐-―−]/gu, '-')
    .replace(/\s+/g, ' ');
  const out: number[] = [];
  // BC and AD with the year: never read again as a plain year.
  let rest = words.replace(
    /\b(\d{1,5})\s*(b\.?c\.?e?|bce)\b/gu,
    (_m, n: string) => {
      out.push(-Number(n));
      return ' ';
    },
  );
  rest = rest.replace(
    /\b(?:a\.?d\.?|ce)\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:a\.?d\.?|c\.?e\.?)(?=[\s,.;:)]|$)/gu,
    (_m, a: string | undefined, b: string | undefined) => {
      out.push(Number(a ?? b));
      return ' ';
    },
  );
  // Centuries: "19th century", "nineteenth century", "the 1800s".
  rest = rest.replace(
    /\b(?:(early|mid|middle|late|beginning of the|end of the|start of the)[- ])?(?:the )?(\d{1,2})(?:st|nd|rd|th) century\b/gu,
    (_m, when: string | undefined, n: string) => {
      out.push((Number(n) - 1) * 100 + partOf(when) * 100);
      return ' ';
    },
  );
  rest = rest.replace(
    new RegExp(
      `\\b(?:(early|mid|middle|late)[- ])?(?:the )?(${Object.keys(ORDINALS).join('|')})[- ]century\\b`,
      'gu',
    ),
    (_m, when: string | undefined, n: string) => {
      out.push((ORDINALS[n] - 1) * 100 + partOf(when) * 100);
      return ' ';
    },
  );
  rest = rest.replace(
    /\b(?:(early|mid|middle|late)[- ])?(1[0-9]|20)00s\b/gu,
    (_m, when: string | undefined, n: string) => {
      out.push(Number(n) * 100 + partOf(when) * 100);
      return ' ';
    },
  );
  // Decades: "the 1950s", "the '60s", "the 60s", "the fifties".
  rest = rest.replace(
    /\b(?:(early|mid|middle|late)[- ])?(1[0-9]|20)([0-9])0'?s\b/gu,
    (_m, when: string | undefined, c: string, d: string) => {
      out.push(Number(c) * 100 + Number(d) * 10 + partOf(when) * 10);
      return ' ';
    },
  );
  rest = rest.replace(
    /(?:\b(early|mid|middle|late)[- ])?(?:\bthe |')([2-9])0'?s\b/gu,
    (_m, when: string | undefined, d: string) => {
      out.push(1900 + Number(d) * 10 + partOf(when) * 10);
      return ' ';
    },
  );
  rest = rest.replace(
    new RegExp(
      `\\b(?:(early|mid|middle|late)[- ])?(${Object.keys(DECADE_WORDS).join('|')})\\b`,
      'gu',
    ),
    (_m, when: string | undefined, word: string) => {
      out.push(DECADE_WORDS[word] - 5 + partOf(when) * 10);
      return ' ';
    },
  );
  // Plain years, 1000 to 2099.
  for (const m of rest.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/gu))
    out.push(Number(m[1]));
  return out.map((y) => Math.round(y));
}

/**
 * An era from words, as a story's world or a research note says it ("the
 * 1950s", "1960", "colonial Lagos", "Victorian London", "AD 1200",
 * "1945–1975", "today"): the years they name first, at the middle of
 * them; else a named period; else none. Never a region: "Victorian" is a
 * time, read as one.
 */
export function eraOf(said: unknown): EraId | null {
  if (typeof said !== 'string') return null;
  const words = said
    .toLowerCase()
    .replace(/[‐-―−]/gu, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return null;
  const id = ERA_IDS.find(
    (one) => words === one || words.replace(/\s*-\s*/g, '-') === one,
  );
  if (id) return id;
  const years = yearsIn(words);
  if (years.length) {
    const sorted = [...years].sort((a, b) => a - b);
    // A span ("1914–1918", "1880 to 1960") at its middle; many years at their median.
    const middle =
      sorted.length === 2
        ? (sorted[0] + sorted[1]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    return eraOfYear(middle);
  }
  for (const [pattern, era] of PERIODS) if (pattern.test(words)) return era;
  return null;
}

/** Whether an era is before today's: a place in it is drawn as it was. */
export const isPast = (era: EraId | null | undefined): era is EraId =>
  Boolean(era) && era !== 'today';

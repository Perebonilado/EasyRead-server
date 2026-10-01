/**
 * A country named as people name it, found by code: "the USA", "Ivory
 * Coast", "DRC", "Holland", "Türkiye" and "Turkey" are each one country,
 * and its flag is the one flag-icons draws for it. A name code does not
 * know is never guessed: it is left off, and said so.
 *
 * Pure: the names come from flag-icons' own list (country.json), with
 * the other names people use beside them.
 */
import { readFileSync } from 'node:fs';

/** A country (or a nation of one, or a union of them) a flag is drawn for. */
export interface FlagCountry {
  /** flag-icons' code: "ng", "gb-sct", "eu". */
  code: string;
  /** Its name as the stage writes it: "Nigeria", "United Kingdom". */
  name: string;
}

interface CountryRow {
  code: string;
  name: string;
  iso: boolean;
}

/** The names the stage writes, where flag-icons' own is long or formal. */
const SHORT_NAMES: Record<string, string> = {
  us: 'United States',
  gb: 'United Kingdom',
  cd: 'DR Congo',
  cg: 'Republic of the Congo',
  ci: "Côte d'Ivoire",
  bn: 'Brunei',
  fm: 'Micronesia',
  va: 'Vatican City',
  ps: 'Palestine',
  cz: 'Czechia',
  sh: 'Saint Helena',
  eu: 'European Union',
  un: 'United Nations',
};

/** Other names people give each, by code. */
const ALIASES: Record<string, string[]> = {
  us: [
    'usa',
    'us',
    'u s',
    'u s a',
    'america',
    'united states',
    'united states of america',
    'the states',
  ],
  gb: ['uk', 'u k', 'britain', 'great britain', 'united kingdom'],
  'gb-eng': ['england'],
  'gb-sct': ['scotland'],
  'gb-wls': ['wales'],
  'gb-nir': ['northern ireland'],
  nl: ['holland', 'netherlands'],
  ci: ['ivory coast', 'cote d ivoire', 'cote divoire'],
  cd: [
    'drc',
    'dr congo',
    'd r congo',
    'congo kinshasa',
    'democratic republic of congo',
    'democratic republic of the congo',
    'zaire',
  ],
  cg: ['congo', 'congo brazzaville', 'republic of congo'],
  kr: ['south korea', 'korea', 'republic of korea'],
  kp: ['north korea', 'dprk'],
  ru: ['russia', 'russian federation'],
  tr: ['turkey', 'turkiye'],
  cz: ['czechia', 'czech republic'],
  mm: ['burma', 'myanmar'],
  sz: ['swaziland', 'eswatini'],
  cv: ['cape verde', 'cabo verde'],
  tl: ['east timor', 'timor leste'],
  mk: ['macedonia', 'north macedonia'],
  va: ['vatican', 'vatican city', 'holy see'],
  ps: ['palestine', 'state of palestine'],
  bn: ['brunei'],
  la: ['laos', 'lao'],
  vn: ['vietnam', 'viet nam'],
  fm: ['micronesia'],
  ae: ['uae', 'u a e', 'emirates', 'united arab emirates'],
  sa: ['saudi arabia', 'saudi'],
  ba: ['bosnia', 'bosnia and herzegovina'],
  gm: ['gambia'],
  bs: ['bahamas'],
  kn: ['saint kitts', 'saint kitts and nevis'],
  lc: ['saint lucia'],
  vc: ['saint vincent', 'saint vincent and the grenadines'],
  st: ['sao tome', 'sao tome and principe'],
  tt: ['trinidad', 'trinidad and tobago'],
  pg: ['papua new guinea', 'png'],
  cf: ['central african republic'],
  do: ['dominican republic'],
  mo: ['macau', 'macao'],
  ir: ['iran', 'persia'],
  sy: ['syria'],
  eu: ['eu', 'european union', 'europe'],
  un: ['un', 'united nations'],
  xk: ['kosovo'],
  nz: ['new zealand', 'aotearoa'],
  in: ['india', 'bharat'],
  ch: ['switzerland', 'swiss'],
};

/** Names that are words before they are countries: only ever read whole, never found inside a sentence. */
const WHOLE_ONLY = new Set([
  'us',
  'un',
  'eu',
  'png',
  'uk',
  'u k',
  'lao',
  'korea',
  'congo',
  'europe',
  'saudi',
  'swiss',
  'trinidad',
]);

/** A name reduced for matching: lower case, no accents, "the", "St." or punctuation. */
export function countryKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\b\.?/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|flags?|national|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let table: {
  byKey: Map<string, FlagCountry>;
  /** Every key found inside a sentence, longest first. */
  inText: { key: string; country: FlagCountry }[];
} | null = null;

/** The names, read once from flag-icons. */
function names() {
  if (table) return table;
  const rows = JSON.parse(
    readFileSync(require.resolve('flag-icons/country.json'), 'utf8'),
  ) as CountryRow[];
  const byKey = new Map<string, FlagCountry>();
  const byCode = new Map<string, FlagCountry>();
  for (const row of rows) {
    if (row.code === 'xx') continue;
    const country = { code: row.code, name: SHORT_NAMES[row.code] ?? row.name };
    byCode.set(row.code, country);
    byKey.set(countryKey(row.name), country);
    byKey.set(countryKey(country.name), country);
  }
  for (const [code, aliases] of Object.entries(ALIASES)) {
    const country = byCode.get(code);
    if (!country) continue;
    for (const alias of aliases) byKey.set(countryKey(alias) || alias, country);
  }
  const inText = [...byKey.entries()]
    .filter(([key]) => key.length > 2 && !WHOLE_ONLY.has(key))
    .map(([key, country]) => ({ key, country }))
    .sort((a, b) => b.key.length - a.key.length);
  table = { byKey, inText };
  return table;
}

/** The country a name means, or null: "Kenya", "the USA", "Ivory Coast", "flag of Japan". */
export function countryOf(name: string): FlagCountry | null {
  const raw = name.trim();
  // "US", "UK", "UN": a short name in capitals is its code.
  const key = countryKey(raw.replace(/\./g, ''));
  if (!key) return null;
  return names().byKey.get(key) ?? null;
}

/** The countries a sentence names, in the order it names them, each once: "the flags of Ghana and Kenya". */
export function countriesIn(text: string): FlagCountry[] {
  const key = ` ${countryKey(text)} `;
  const found: { at: number; country: FlagCountry }[] = [];
  const taken: [number, number][] = [];
  for (const one of names().inText) {
    let from = 0;
    for (;;) {
      const at = key.indexOf(` ${one.key} `, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + one.key.length + 1;
      // A shorter name inside a longer one already found ("Guinea" in "Papua New Guinea") is not another.
      if (taken.some(([a, b]) => at < b && end > a)) continue;
      taken.push([at, end]);
      found.push({ at, country: one.country });
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((one) => one.country)
    .filter((country) => !seen.has(country.code) && seen.add(country.code));
}

/** The most flags one picture holds. */
export const MAX_FLAGS = 6;

/** A flag picture as the writer gives it, read by code: each name it knows, and each it does not. */
export function readFlags(names: readonly string[]): {
  flags: (FlagCountry & { said: string })[];
  unknown: string[];
} {
  const flags: (FlagCountry & { said: string })[] = [];
  const unknown: string[] = [];
  for (const said of names.map((n) => n.replace(/\s+/g, ' ').trim())) {
    if (!said) continue;
    const country = countryOf(said);
    if (!country) unknown.push(said);
    else if (!flags.some((f) => f.code === country.code))
      flags.push({ ...country, said });
  }
  return { flags: flags.slice(0, MAX_FLAGS), unknown };
}

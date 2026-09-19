/**
 * The library of drawn things, as the server knows it: each preset's
 * name, its proportions, and the words a chapter uses for it. The paths
 * live with the renderer (`src/lib/visual/presets.ts` on the client); the
 * planner picks by name from the words, and the layout sizes the box by
 * the aspect.
 */
import type { Near } from './visual-vectors';
import {
  FIELD_OF,
  PRESETS as PACK_PRESETS,
  type Field,
  type PresetPart,
} from './living.generated/presets';

/**
 * A field's own vocabulary is answered from that field's pack or by
 * words, and never by a drawing from the general library that merely
 * does the same job. The glomerulus filters, so the search offered a
 * funnel; a funnel is not a glomerulus, and a learner shown one has
 * been told something false. This is the wall.
 */
export function fieldOf(name: string): Field | undefined {
  return FIELD_OF[name];
}

/**
 * Everyday words that happen to be the name of a part. A field claims
 * its technical terms, not the language around them: the body of the
 * stomach must not make "body" a word only medicine may draw.
 */
const EVERYDAY = new Set([
  'body',
  'wall',
  'valve',
  'level',
  'core',
  'mouth',
  'head',
  'neck',
  'back',
  'side',
  'top',
  'bottom',
  'centre',
  'edge',
  'lobe',
  'fat',
  'hair',
  'seed',
  'root',
  'stem',
  'leaf',
  'flower',
  'fruit',
  'tail',
  'wing',
  'legs',
  'skin',
  'bone',
  'blood',
]);

/**
 * The words each field claims as its own: the names of its drawings and
 * of their parts, which are its technical vocabulary. A word a field
 * claims is answered from that field's pack or by words. Short and
 * everyday words are left out, since a field owns its terms and not the
 * language they are written in.
 */
const FIELD_TERMS: Map<Field, Set<string>> = (() => {
  const out = new Map<Field, Set<string>>();
  for (const [name, preset] of Object.entries(PACK_PRESETS)) {
    const field = preset.field;
    if (!field) continue;
    const set = out.get(field) ?? new Set<string>();
    const claim = (word: string) => {
      const term = word.trim().toLowerCase();
      if (term.length >= 6 && !EVERYDAY.has(term)) set.add(term);
    };
    claim(name);
    for (const part of Object.keys(preset.parts ?? {})) {
      claim(part);
      // "loop of henle" is claimed whole and by its own word.
      for (const word of part.split(/\s+/)) claim(word);
    }
    out.set(field, set);
  }
  return out;
})();

/**
 * Which field a page is in, read from its own words: the field whose
 * vocabulary it uses most. A page has to be placed before its terms can
 * be walled, and nothing else in the app knows, so the words say.
 * Below the floor the page belongs to no field and everything is
 * answered from the general library as before.
 */
export function fieldFor(text: string): Field | undefined {
  const words = new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((w) => w.length >= 6),
  );
  let best: { field: Field; hits: number } | null = null;
  for (const [field, terms] of FIELD_TERMS) {
    let hits = 0;
    for (const term of terms) if (words.has(term)) hits += 1;
    if (!best || hits > best.hits) best = { field, hits };
  }
  return best && best.hits >= FIELD_FLOOR ? best.field : undefined;
}

/** How many of a field's own terms a page must use before it counts as that field's. */
const FIELD_FLOOR = 3;

/**
 * The field's drawing that has this term as one of its named parts. A
 * glomerulus is drawn, inside the nephron, so a page that names it gets
 * the nephron with a line pointing at the glomerulus rather than the
 * word. This is what the named parts are for.
 */
export function fieldPartOwner(
  word: string,
  field: string,
): { name: string; part: string } | undefined {
  const want = word.trim().toLowerCase();
  for (const [name, preset] of Object.entries(PACK_PRESETS)) {
    if (preset.field !== field) continue;
    for (const part of Object.keys(preset.parts ?? {}))
      if (part === want) return { name, part };
  }
  return undefined;
}

/** Whether a word belongs to a field's own vocabulary. */
export function fieldClaims(word: string, field: string): boolean {
  const terms = FIELD_TERMS.get(field as Field);
  if (!terms) return false;
  const want = word.trim().toLowerCase();
  if (terms.has(want)) return true;
  return want.split(/\s+/).some((part) => terms.has(part));
}

/** The parts of a drawing a callout may point at, with where on its box each sits. */
export function presetParts(
  name: string | undefined,
): Record<string, PresetPart> | undefined {
  return name ? PACK_PRESETS[name]?.parts : undefined;
}

/** Where a named part of a drawing sits inside its box, or nothing when it has none. */
export function presetAnchor(
  name: string | undefined,
  part: string,
): [number, number] | null {
  const parts = presetParts(name);
  if (!parts) return null;
  const want = part.trim().toLowerCase();
  const found =
    parts[want] ??
    Object.entries(parts).find(
      ([key]) => key.includes(want) || want.includes(key),
    )?.[1];
  return found ? found.at : null;
}

export interface PresetInfo {
  aspect: number;
  /** The words a chapter would use for this thing, for the planner's pick. */
  tags: string;
}

export const PRESET_INFO: Record<string, PresetInfo> = {
  leaf: { aspect: 1.12, tags: 'leaf plant tree green photosynthesis' },
  sun: { aspect: 1, tags: 'sun light sunlight energy day' },
  cloud: { aspect: 1.5, tags: 'cloud sky rain weather internet' },
  drop: { aspect: 0.72, tags: 'drop water rain liquid blood fluid' },
  globe: { aspect: 1, tags: 'globe world earth global country international' },
  star: { aspect: 1, tags: 'star rating best favourite quality' },
  shield: {
    aspect: 0.85,
    tags: 'shield protection defence safety immunity security',
  },
  bulb: { aspect: 0.7, tags: 'bulb idea light insight solution' },
  warning: { aspect: 1.1, tags: 'warning danger risk hazard alert' },
  check: { aspect: 1, tags: 'check tick done correct yes success' },
  question: { aspect: 1, tags: 'question unknown doubt ask problem' },
  gear: { aspect: 1, tags: 'gear machine process mechanism engine system' },
  clock: { aspect: 1, tags: 'clock time hour schedule wait' },
  book: { aspect: 1.2, tags: 'book study learning knowledge education text' },
  arrows: { aspect: 1.2, tags: 'arrows exchange transfer swap flow both ways' },
  document: { aspect: 0.75, tags: 'document file record report form page' },
  person: {
    aspect: 0.7,
    tags: 'person individual patient user client citizen worker',
  },
  people: {
    aspect: 1.1,
    tags: 'people group community population public crowd',
  },
  family: { aspect: 1.3, tags: 'family household parents children home' },
  child: { aspect: 0.75, tags: 'child infant baby kid young' },
  clinic: {
    aspect: 1.05,
    tags: 'clinic health centre dispensary post facility',
  },
  hospital: { aspect: 1.1, tags: 'hospital referral ward medical centre' },
  bed: { aspect: 1.6, tags: 'bed ward admission inpatient rest' },
  pill: {
    aspect: 1.3,
    tags: 'pill drug medicine tablet capsule dose treatment',
  },
  syringe: {
    aspect: 2,
    tags: 'syringe injection vaccine immunisation immunization shot',
  },
  stethoscope: {
    aspect: 1,
    tags: 'stethoscope doctor examination nurse checkup',
  },
  heart: { aspect: 1, tags: 'heart cardiac love care life' },
  lungs: { aspect: 1, tags: 'lungs breathing respiratory air' },
  tooth: { aspect: 0.9, tags: 'tooth dental teeth mouth' },
  thermometer: { aspect: 0.5, tags: 'thermometer fever temperature illness' },
  tap: { aspect: 1.4, tags: 'tap water supply sanitation hygiene' },
  plate: { aspect: 1.6, tags: 'plate food nutrition meal diet' },
  village: { aspect: 1.5, tags: 'village rural community houses town' },
  ambulance: { aspect: 1.7, tags: 'ambulance emergency transport referral' },
  net: { aspect: 1.3, tags: 'net mosquito malaria bed net prevention' },
  well: { aspect: 1, tags: 'well water borehole source' },
  server: { aspect: 0.9, tags: 'server machine host backend service node' },
  database: { aspect: 0.9, tags: 'database store storage table records' },
  queue: { aspect: 2.4, tags: 'queue buffer line waiting messages' },
  phone: { aspect: 0.55, tags: 'phone mobile device client app' },
  laptop: { aspect: 1.5, tags: 'laptop computer client browser user' },
  envelope: { aspect: 1.5, tags: 'envelope message email notification mail' },
  gauge: { aspect: 1.15, tags: 'gauge meter limit rate speed load' },
  key: { aspect: 2, tags: 'key access token id identifier password' },
  lock: { aspect: 0.85, tags: 'lock secure private encryption locked' },
  timer: { aspect: 0.9, tags: 'timer countdown timeout expiry window' },
  browser: { aspect: 1.4, tags: 'browser web page site frontend' },
  bucket: { aspect: 1, tags: 'bucket token bucket container capacity' },
  user: { aspect: 0.8, tags: 'user account member login profile' },
  coins: { aspect: 1.2, tags: 'coins money cost price payment savings' },
  cart: { aspect: 1.4, tags: 'cart shopping purchase buy order' },
  factory: {
    aspect: 1.3,
    tags: 'factory production industry manufacturing supply',
  },
  chart: { aspect: 1.1, tags: 'chart graph growth statistics data bars' },
  scale: { aspect: 1, tags: 'scale balance weigh compare justice trade' },
  money: { aspect: 1.6, tags: 'money cash note currency income' },
  building: {
    aspect: 0.9,
    tags: 'building office school institution organisation',
  },
};

import { ICON_TAGS } from './visual-icons.generated';

// Every drawing in a field's pack is a preset too: the pack carries its
// own proportions and the words it is filed under, so it needs saying
// only once, in the one place it is drawn.
for (const [name, preset] of Object.entries(PACK_PRESETS)) {
  if (PRESET_INFO[name]) continue;
  PRESET_INFO[name] = { aspect: preset.aspect, tags: preset.tags ?? name };
}

export const PRESET_SHAPES = Object.keys(PRESET_INFO) as readonly string[];
export type PresetShape = keyof typeof PRESET_INFO;

/** The catalogue as the prompts print it: name and words, one per line. */
export function presetCatalogue(): string {
  return Object.entries(PRESET_INFO)
    .map(([name, info]) => `${name}: ${info.tags}`)
    .join('\n');
}

/** Whether the stage can draw this name: a hand-made preset or an icon. */
export function knownPicture(name: string | undefined): boolean {
  return Boolean(name && (PRESET_INFO[name] || ICON_TAGS[name]));
}

/** Width over height of a drawn thing's box; icons sit on a square. */
export function pictureAspect(name: string): number {
  return PRESET_INFO[name]?.aspect ?? 1;
}

/** Words that name a group in the catalogue, not a thing: no picture is found on them alone. */
const GROUP_WORDS = new Set(
  'objects nature maps travel system media communications communication finances finance games health wellness commerce office people security time weather new'.split(
    ' ',
  ),
);
const STOP_WORDS = new Set(
  'a an the of and or for to in on at with by from some any this that it its their his her'.split(
    ' ',
  ),
);

/** A word's plain forms, so "buildings" finds "building" and "kitties" "kitty". */
function forms(word: string): string[] {
  const out = new Set([word]);
  if (word.endsWith('ies') && word.length > 4) out.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 4) out.add(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 3) out.add(word.slice(0, -1));
  out.add(`${word}s`);
  return [...out];
}

/**
 * The library's sense of a word the catalogue gets wrong by spelling: a
 * lexical match makes "sign" a signpost and "party" a celebration, where
 * a page of law means a signature and the people to an agreement. Each
 * line names a drawing the library has. Grown from the judge's redo
 * notes, one line at a time.
 */
export const SENSES: Record<string, string> = {
  sign: 'signature',
  signs: 'signature',
  signing: 'signature',
  signed: 'signature',
  execute: 'signature',
  executed: 'signature',
  execution: 'signature',
  party: 'users',
  parties: 'users',
  consideration: 'coins',
  fee: 'coins',
  fees: 'coins',
  payment: 'coins',
  payments: 'coins',
  title: 'certificate',
  deed: 'file-text',
  deeds: 'file-text',
  contract: 'file-text',
  contracts: 'file-text',
  agreement: 'handshake',
  agreements: 'handshake',
  court: 'gavel',
  judge: 'gavel',
  judgment: 'gavel',
  judgement: 'gavel',
  justice: 'scales',
  fairness: 'scales',
  lien: 'lock',
  mortgage: 'bank',
  mortgages: 'bank',
  solicitor: 'briefcase',
  solicitors: 'briefcase',
  lawyer: 'briefcase',
  lawyers: 'briefcase',
  client: 'user',
  clients: 'user',
  tenant: 'user',
  tenants: 'user',
  lessee: 'user',
  landlord: 'house',
  landlords: 'house',
  lessor: 'house',
  land: 'map-trifold',
  record: 'file-text',
  records: 'file-text',
  doctor: 'stethoscope',
  doctors: 'stethoscope',
  physician: 'stethoscope',
};

/** A drawing that may be the thing a phrase names, with the words that made it a candidate. */
export interface PictureCandidate {
  name: string;
  score: number;
  tags: string[];
}

/** A drawing's own words, a few, for the director to tell candidates apart. */
export function tagsOf(name: string): string[] {
  const raw = PRESET_INFO[name]?.tags ?? ICON_TAGS[name] ?? '';
  const parts = name.split('-');
  return [
    ...new Set(
      raw
        .toLowerCase()
        .split(/[\s&]+/)
        .filter(
          (tag) =>
            tag.length > 1 &&
            !tag.startsWith('*') &&
            !GROUP_WORDS.has(tag) &&
            !parts.includes(tag),
        ),
    ),
  ].slice(0, 3);
}

/**
 * How many drawings carry a word in their tags. A word on a dozen
 * drawings is a category, not a thing: "field" is on a farm and a form,
 * so it names neither. Counted once, from the catalogue itself.
 */
const TAG_SPREAD = (() => {
  const count = new Map<string, number>();
  const add = (tags: string) => {
    for (const tag of new Set(tags.toLowerCase().split(/[\s&]+/))) {
      if (tag.length > 1) count.set(tag, (count.get(tag) ?? 0) + 1);
    }
  };
  for (const info of Object.values(PRESET_INFO)) add(info.tags);
  for (const tags of Object.values(ICON_TAGS)) add(tags);
  return count;
})();
/** A tag on more drawings than this says nothing about which one is meant. */
const TAG_TOO_COMMON = 14;
/**
 * The least a drawing must score to be used. A weak match is worse than
 * none: half of "cell tower" is the word "cell", and drawing a phone mast
 * for a page about cells teaches the wrong thing.
 */
const MATCH_FLOOR = 1;

/** The content words of a phrase, in order. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * The drawings that may be the thing a phrase names, best first: the
 * sense of a word where the library has one, then a drawing of that very
 * name, then the drawings whose names or tags say it, scored. The menu
 * shows these to the director, which reads the sentence and picks; the
 * app never picks among them itself.
 */
export function pictureCandidates(
  text: string | undefined,
  limit = 4,
  /**
   * What a search by meaning found for this phrase, when one was run.
   * Spelling is tried first and keeps its order, because a drawing whose
   * name is the word is better evidence than any distance; meaning is
   * added under it, which is how a phrase no drawing is filed under
   * finds anything at all.
   */
  near: readonly Near[] = [],
  /** The field the page is in; its own terms are answered from its own pack or by words. */
  field?: string,
): PictureCandidate[] {
  if (!text) return [];
  const words = wordsOf(text);
  if (!words.length) return [];
  const out: PictureCandidate[] = [];
  if (field) {
    const want = text.trim().toLowerCase();
    // The field's own drawing of its own term, and nothing else offered.
    if (fieldOf(want) === field && knownPicture(want))
      return [{ name: want, score: 300, tags: tagsOf(want) }];
    // A term the field has drawn as a part of something: the whole
    // thing, so a line can point at the part.
    const owner = fieldPartOwner(want, field);
    if (owner && knownPicture(owner.name))
      return [{ name: owner.name, score: 280, tags: tagsOf(owner.name) }];
    // A term the field claims but has not drawn is words, never a
    // stand-in from the general library that does the same job.
    if (fieldClaims(want, field)) return [];
  }
  const seen = new Set<string>();
  const push = (name: string, score: number) => {
    if (seen.has(name) || !knownPicture(name)) return;
    seen.add(name);
    out.push({ name, score, tags: tagsOf(name) });
  };
  for (const word of words) {
    const sense = SENSES[word];
    if (sense) push(sense, 200);
  }
  const joined = words.join('-');
  const exact = [joined, ...words.flatMap(forms)];
  for (const name of exact) if (PRESET_INFO[name]) push(name, 100);
  for (const name of exact) if (ICON_TAGS[name]) push(name, 100);
  for (const found of scoredPictures(words)) push(found.name, found.score);
  // A drawing the words alone would not have found. Its score is kept
  // under the spelling matches so the order the director reads is still
  // sureness first.
  for (const found of near) push(found.name, MATCH_FLOOR + found.score - 1);
  return out.slice(0, limit);
}

/** The one drawing a phrase most likely means, by spelling: the menu's guess, never the drawn one. */
export function resolvePicture(text: string | undefined): string | undefined {
  return pictureCandidates(text, 1)[0]?.name;
}

/**
 * The drawing a name is, strictly: a library name, the sense of a word,
 * or the one drawing the words could mean. A name several drawings could
 * be is nothing, and the thing is set as words: the director was shown
 * the candidates and had to pick one by name.
 */
export function pickPicture(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const words = wordsOf(text);
  if (!words.length) return undefined;
  for (const word of words) {
    const sense = SENSES[word];
    if (sense && knownPicture(sense)) return sense;
  }
  const joined = words.join('-');
  for (const name of [joined, ...words.flatMap(forms)]) {
    if (PRESET_INFO[name] || ICON_TAGS[name]) return name;
  }
  const scored = scoredPictures(words);
  return scored.length === 1 ? scored[0].name : undefined;
}

/** Every drawing whose name or tags answer the words, scored, best first; none below the floor. */
function scoredPictures(words: string[]): { name: string; score: number }[] {
  const wanted = new Set(words.flatMap(forms));
  const found: { name: string; score: number }[] = [];
  const consider = (name: string, tags: string, weight: number) => {
    // A drawing's name ends in the thing it is: a chalkboard teacher is a
    // teacher, a cell tower is a tower. Only the last word carries it.
    const parts = name.split('-');
    const head = wanted.has(parts[parts.length - 1]);
    const rest = parts.slice(0, -1).filter((part) => wanted.has(part)).length;
    let score = (head ? 3 : 0) + rest * 0.8;
    let told = 0;
    for (const tag of new Set(tags.toLowerCase().split(/[\s&]+/))) {
      if (GROUP_WORDS.has(tag)) continue;
      if ((TAG_SPREAD.get(tag) ?? 0) > TAG_TOO_COMMON) continue;
      if (wanted.has(tag)) told += 1;
    }
    score += Math.min(told, 3);
    if (!score) return;
    // How much of what was asked for this drawing answers: half of
    // "magnetic field" is "field", which is a farm and a form and neither.
    const answered = words.filter(
      (word) =>
        forms(word).some((form) => parts.includes(form)) ||
        forms(word).some((form) =>
          tags
            .toLowerCase()
            .split(/[\s&]+/)
            .includes(form),
        ),
    ).length;
    score *= (answered / words.length) * weight;
    if (score >= MATCH_FLOOR) found.push({ name, score });
  };
  for (const [name, info] of Object.entries(PRESET_INFO))
    consider(name, info.tags, 1.2);
  for (const [name, tags] of Object.entries(ICON_TAGS)) consider(name, tags, 1);
  return found.sort(
    (a, b) => b.score - a.score || a.name.length - b.name.length,
  );
}

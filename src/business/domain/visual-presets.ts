/**
 * The library of drawn things, as the server knows it: each preset's
 * name, its proportions, and the words a chapter uses for it. The paths
 * live with the renderer (`src/lib/visual/presets.ts` on the client); the
 * planner picks by name from the words, and the layout sizes the box by
 * the aspect.
 */
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
 * The drawing for the word a model uses for a thing: the hand-made
 * preset of that name first, then an icon of that name, then the icon
 * whose name or tags say it best. Nothing when no word of it is known.
 */
export function resolvePicture(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  if (!words.length) return undefined;
  const joined = words.join('-');
  const exact = [joined, ...words.flatMap(forms)];
  for (const name of exact) {
    if (PRESET_INFO[name]) return name;
  }
  for (const name of exact) {
    if (ICON_TAGS[name]) return name;
  }
  const wanted = new Set(words.flatMap(forms));
  let best: { name: string; score: number } | null = null;
  const consider = (name: string, tags: string, weight: number) => {
    let score = 0;
    for (const part of name.split('-')) if (wanted.has(part)) score += 3;
    for (const tag of tags.toLowerCase().split(/[\s&]+/)) {
      if (GROUP_WORDS.has(tag)) continue;
      if (wanted.has(tag)) score += 1;
    }
    if (!score) return;
    score *= weight;
    if (
      !best ||
      score > best.score ||
      (score === best.score && name.length < best.name.length)
    )
      best = { name, score };
  };
  for (const [name, info] of Object.entries(PRESET_INFO))
    consider(name, info.tags, 1.2);
  for (const [name, tags] of Object.entries(ICON_TAGS)) consider(name, tags, 1);
  return best ? (best as { name: string }).name : undefined;
}

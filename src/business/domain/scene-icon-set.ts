/**
 * The infographic's own icons, drawn in code: flat silhouettes in one
 * colour, each in a box of 100, plain enough to read at a phone's size
 * when a hundred of them fill a grid. A unit chart counts in them, a
 * split screen lists with them, and things moving between two boxes are
 * them. Each is defined once in a drawing (<symbol>) and used as often as
 * it is counted (<use>), its colour set where it is used, so a grid of a
 * hundred stays a few kilobytes.
 *
 * The list is closed: the writer names one, and a word it does not know
 * ("troops", "votes", "money") is read as the icon it means, or a dot.
 * Nothing in it is a weapon or a faith's symbol (care rules: violence is
 * never drawn; no religious building stands for a people).
 */
import { r1 } from './scene-exact-style';

/** One shape of an icon: its path, and whether its inner shapes are holes. */
interface IconShape {
  d: string;
  holes?: true;
}

/** The grains of an ear of wheat, either side of its stalk, at a height. */
const grains = (y: number): IconShape[] => [
  { d: `M48 ${y}c-9-6-18-4-22 2 6 6 15 7 22-2Z` },
  { d: `M52 ${y}c9-6 18-4 22 2-6 6-15 7-22-2Z` },
];

/** A star's points, round its middle. */
const starPath = (() => {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 19 : 45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${r1(50 + r * Math.cos(a))} ${r1(54 + r * Math.sin(a))}`);
  }
  return `M${points.join('L')}Z`;
})();

/** Every icon, by name: its shapes in a box of 100. */
const ICONS = {
  person: [
    { d: 'M36 23a14 14 0 1 0 28 0a14 14 0 1 0-28 0Z' },
    { d: 'M26 94V66c0-15 10.7-25 24-25s24 10 24 25v28Z' },
  ],
  soldier: [
    { d: 'M33 25c0-11 7.6-18 17-18s17 7 17 18h5v5H28v-5Z' },
    { d: 'M38 31h24c0 8-5.4 13-12 13s-12-5-12-13Z' },
    {
      d: 'M26 94V67c0-14 10.7-22 24-22s24 8 24 22v27ZM26 74h48v5H26Z',
      holes: true,
    },
  ],
  child: [
    { d: 'M39 37a11 11 0 1 0 22 0a11 11 0 1 0-22 0Z' },
    { d: 'M33 94V71c0-11 7.6-18 17-18s17 7 17 18v23Z' },
  ],
  house: [{ d: 'M50 9 92 46H81V91H59V65H41V91H19V46H8Z' }],
  school: [
    { d: 'M8 40 50 18 92 40Z' },
    {
      d: 'M14 44H86V92H58V70H42V92H14ZM22 52h12v10H22ZM66 52h12v10H66Z',
      holes: true,
    },
    { d: 'M49 2h2.5v17H49Z' },
    { d: 'M51.5 3H67l-4 5 4 5H51.5Z' },
  ],
  hospital: [
    {
      d: 'M12 22H88V92H12ZM44 34h12v14h14v12H56v14H44V60H30V48h14Z',
      holes: true,
    },
  ],
  factory: [
    {
      d: 'M8 92V52l22-13v13l22-13v13l22-13V18h14v74ZM16 64h10v10H16ZM38 64h10v10H38ZM60 64h10v10H60Z',
      holes: true,
    },
  ],
  government: [
    { d: 'M50 6 94 30H6Z' },
    { d: 'M10 33H90V40H10Z' },
    { d: 'M16 43h10v36H16ZM36 43h10v36H36ZM54 43h10v36H54ZM74 43h10v36H74Z' },
    { d: 'M6 82H94V92H6Z' },
  ],
  coin: [
    {
      d: 'M8 50a42 42 0 1 0 84 0a42 42 0 1 0-84 0ZM15 50a35 35 0 1 0 70 0a35 35 0 1 0-70 0ZM19 50a31 31 0 1 0 62 0a31 31 0 1 0-62 0Z',
      holes: true,
    },
  ],
  job: [
    { d: 'M12 34H88V88H12ZM12 54H88V59H12Z', holes: true },
    { d: 'M36 34V22c0-2 2-4 4-4h20c2 0 4 2 4 4v12h-7V25H43v9Z' },
  ],
  tree: [
    {
      d: 'M50 6c18 0 31 13 31 29 0 17-14 29-31 29S19 52 19 35C19 19 32 6 50 6Z',
    },
    { d: 'M45 60h10v33H45Z' },
  ],
  wheat: [
    { d: 'M48.5 28h3v66h-3Z' },
    { d: 'M50 4c6 6 6 15 0 21-6-6-6-15 0-21Z' },
    ...grains(32),
    ...grains(48),
    ...grains(64),
  ],
  drop: [
    {
      d: 'M50 6C50 6 20 44 20 63c0 17 13 29 30 29s30-12 30-29C80 44 50 6 50 6Z',
    },
  ],
  bolt: [{ d: 'M60 4 20 56h26l-8 40 42-54H54Z' }],
  barrel: [
    {
      d: 'M22 14c0-5 56-5 56 0v72c0 5-56 5-56 0ZM22 32h56v5H22ZM22 63h56v5H22Z',
      holes: true,
    },
  ],
  car: [
    {
      d: 'M6 68V55c0-4 3-7 7-8l13-3 10-13c2-2 5-3 8-3h20c4 0 7 2 9 5l9 11 9 2c4 1 6 4 6 8v14ZM41 32h11v12H31ZM56 32h9c2 0 3 1 4 2l8 10H56Z',
      holes: true,
    },
    {
      d: 'M16 74a11 11 0 1 0 22 0a11 11 0 1 0-22 0ZM22 74a5 5 0 1 0 10 0a5 5 0 1 0-10 0ZM62 74a11 11 0 1 0 22 0a11 11 0 1 0-22 0ZM68 74a5 5 0 1 0 10 0a5 5 0 1 0-10 0Z',
      holes: true,
    },
  ],
  ship: [
    { d: 'M6 60H94L80 86H20Z' },
    { d: 'M28 42H68V60H28ZM34 47h8v6h-8ZM48 47h8v6h-8Z', holes: true },
    { d: 'M44 24h12v18H44Z' },
  ],
  plane: [
    {
      d: 'M47 6c0-4 6-4 6 0v32l39 22v8L53 56v24l11 8v6l-14-4-14 4v-6l11-8V56L8 68v-8l39-22Z',
    },
  ],
  train: [
    {
      d: 'M24 8h52c7 0 12 5 12 12v52c0 7-5 12-12 12H24c-7 0-12-5-12-12V20c0-7 5-12 12-12ZM22 20h56v28H22ZM24 66a6 6 0 1 0 12 0a6 6 0 1 0-12 0ZM64 66a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z',
      holes: true,
    },
    { d: 'M26 84h10l-8 12H18ZM64 84h10l8 12H72Z' },
  ],
  ballot: [
    { d: 'M12 50H88V92H12ZM32 56h36v5H32Z', holes: true },
    { d: 'M34 10h32v36H34ZM40 28l5-5 6 6 10-12 5 5-15 17Z', holes: true },
  ],
  book: [
    {
      d: 'M50 22C40 13 25 11 8 14v68c17-3 32-1 42 8 10-9 25-11 42-8V14C75 11 60 13 50 22ZM48.5 24h3v63h-3Z',
      holes: true,
    },
  ],
  paper: [
    {
      d: 'M22 6h38l18 18v70H22ZM30 40h40v5H30ZM30 53h40v5H30ZM30 66h28v5H30Z',
      holes: true,
    },
  ],
  phone: [
    {
      d: 'M32 4h36c5 0 8 3 8 8v76c0 5-3 8-8 8H32c-5 0-8-3-8-8V12c0-5 3-8 8-8ZM31 14h38v64H31ZM45 84h10v5H45Z',
      holes: true,
    },
  ],
  computer: [
    { d: 'M8 12h84v56H8ZM15 19h70v42H15Z', holes: true },
    { d: 'M43 68h14v12h12v8H31v-8h12Z' },
  ],
  globe: [
    {
      d: 'M8 50a42 42 0 1 0 84 0a42 42 0 1 0-84 0ZM14 50a36 36 0 1 0 72 0a36 36 0 1 0-72 0Z',
      holes: true,
    },
    {
      d: 'M30 50a20 40 0 1 0 40 0a20 40 0 1 0-40 0ZM36 50a14 34 0 1 0 28 0a14 34 0 1 0-28 0Z',
      holes: true,
    },
    { d: 'M10 47h80v6H10Z' },
    { d: 'M47 9h6v82h-6Z' },
  ],
  crown: [
    { d: 'M10 80 16 28l18 24 16-30 16 30 18-24 6 52Z' },
    { d: 'M10 84h80v9H10Z' },
  ],
  heart: [
    {
      d: 'M50 88C20 66 8 50 8 34 8 20 19 10 32 10c8 0 14 4 18 10 4-6 10-10 18-10 13 0 24 10 24 24 0 16-12 32-42 54Z',
    },
  ],
  star: [{ d: starPath }],
  dot: [{ d: 'M18 50a32 32 0 1 0 64 0a32 32 0 1 0-64 0Z' }],
  arrow: [{ d: 'M10 40h46V22l34 28-34 28V60H10Z' }],
} satisfies Record<string, IconShape[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export const isIconName = (value: unknown): value is IconName =>
  typeof value === 'string' && value in ICONS;

/**
 * The words that mean an icon, beyond its own name: what the writer says
 * a unit chart counts ("troops", "votes", "pupils") read as its icon.
 */
const ICON_WORDS: Record<IconName, string[]> = {
  person: [
    'people',
    'persons',
    'citizen',
    'citizens',
    'voter',
    'voters',
    'member',
    'members',
    'resident',
    'residents',
    'population',
    'human',
    'humans',
    'adult',
    'adults',
    'man',
    'men',
    'woman',
    'women',
    'patient',
    'patients',
    'worker',
    'workers',
    'delegate',
    'delegates',
    'migrant',
    'migrants',
    'user',
    'users',
    'refugee',
    'refugees',
    'staff',
    'employee',
    'employees',
  ],
  soldier: [
    'soldiers',
    'troop',
    'troops',
    'army',
    'armies',
    'military',
    'veteran',
    'veterans',
    'recruit',
    'recruits',
    'servicemen',
    'police',
    'officer',
    'officers',
  ],
  child: [
    'children',
    'kid',
    'kids',
    'pupil',
    'pupils',
    'student',
    'students',
    'baby',
    'babies',
    'girl',
    'girls',
    'boy',
    'boys',
    'youth',
    'infant',
    'infants',
  ],
  house: [
    'houses',
    'home',
    'homes',
    'household',
    'households',
    'family',
    'families',
    'dwelling',
    'dwellings',
    'housing',
  ],
  school: [
    'schools',
    'classroom',
    'classrooms',
    'college',
    'colleges',
    'university',
    'universities',
    'education',
  ],
  hospital: [
    'hospitals',
    'clinic',
    'clinics',
    'health',
    'doctor',
    'doctors',
    'nurse',
    'nurses',
    'bed',
    'beds',
  ],
  factory: [
    'factories',
    'industry',
    'industries',
    'plant',
    'plants',
    'mill',
    'mills',
    'manufacturing',
  ],
  government: [
    'governments',
    'parliament',
    'parliaments',
    'court',
    'courts',
    'bank',
    'banks',
    'ministry',
    'ministries',
    'institution',
    'institutions',
    'council',
    'councils',
    'state',
    'states',
    'office',
    'offices',
  ],
  coin: [
    'coins',
    'money',
    'cash',
    'pound',
    'pounds',
    'dollar',
    'dollars',
    'euro',
    'euros',
    'naira',
    'rupee',
    'rupees',
    'yen',
    'tax',
    'taxes',
    'revenue',
    'budget',
    'income',
    'wage',
    'wages',
    'cost',
    'costs',
    'price',
    'debt',
    'aid',
    'fund',
    'funds',
    'gold',
  ],
  job: [
    'jobs',
    'work',
    'business',
    'businesses',
    'company',
    'companies',
    'employment',
    'career',
    'careers',
  ],
  tree: ['trees', 'forest', 'forests', 'wood', 'woods', 'plant life'],
  wheat: [
    'crop',
    'crops',
    'grain',
    'grains',
    'farm',
    'farms',
    'harvest',
    'harvests',
    'food',
    'cereal',
    'maize',
    'rice',
    'tonne',
    'tonnes',
  ],
  drop: [
    'drops',
    'water',
    'litre',
    'litres',
    'liter',
    'liters',
    'rain',
    'rainfall',
    'gallon',
    'gallons',
  ],
  bolt: [
    'bolts',
    'power',
    'energy',
    'electricity',
    'watt',
    'watts',
    'megawatt',
    'megawatts',
  ],
  barrel: ['barrels', 'oil', 'petrol', 'fuel', 'gas'],
  car: [
    'cars',
    'vehicle',
    'vehicles',
    'truck',
    'trucks',
    'bus',
    'buses',
    'lorry',
    'lorries',
  ],
  ship: [
    'ships',
    'boat',
    'boats',
    'vessel',
    'vessels',
    'canoe',
    'canoes',
    'ferry',
    'cargo',
  ],
  plane: [
    'planes',
    'aircraft',
    'aeroplane',
    'airplane',
    'flight',
    'flights',
    'jet',
    'jets',
  ],
  train: ['trains', 'rail', 'railway', 'railways', 'locomotive'],
  ballot: [
    'ballots',
    'vote',
    'votes',
    'election',
    'elections',
    'ballot box',
    'poll',
    'polls',
    'seat',
    'seats',
  ],
  book: ['books', 'library', 'libraries', 'textbook', 'textbooks', 'reading'],
  paper: [
    'papers',
    'document',
    'documents',
    'letter',
    'letters',
    'newspaper',
    'newspapers',
    'report',
    'reports',
    'petition',
    'petitions',
    'form',
    'forms',
    'page',
    'pages',
  ],
  phone: [
    'phones',
    'mobile',
    'mobiles',
    'smartphone',
    'smartphones',
    'cellphone',
  ],
  computer: [
    'computers',
    'laptop',
    'laptops',
    'internet',
    'website',
    'websites',
    'screen',
    'screens',
  ],
  globe: [
    'globes',
    'world',
    'country',
    'countries',
    'nation',
    'nations',
    'planet',
    'earth',
  ],
  crown: [
    'crowns',
    'king',
    'kings',
    'queen',
    'queens',
    'kingdom',
    'kingdoms',
    'monarch',
    'monarchy',
    'ruler',
    'rulers',
    'emperor',
    'empire',
    'empires',
  ],
  heart: ['hearts', 'life', 'love', 'care', 'charity', 'donor', 'donors'],
  star: ['stars', 'award', 'awards', 'prize', 'prizes', 'medal', 'medals'],
  dot: ['dots', 'point', 'points', 'unit', 'units'],
  arrow: ['arrows', 'step', 'steps'],
};

const BY_WORD = new Map<string, IconName>();
for (const name of ICON_NAMES) {
  BY_WORD.set(name, name);
  for (const word of ICON_WORDS[name]) BY_WORD.set(word, name);
}

/**
 * The icon a word or a few mean, or null: its own name, or a word for
 * what it counts ("troops" a soldier, "votes" a ballot), looked for in
 * the whole phrase first, then in its words from the last ("school
 * pupils" is a child, "oil barrels" a barrel).
 */
export function iconOf(text: string | null | undefined): IconName | null {
  const said = (text ?? '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .trim();
  if (!said) return null;
  const whole = BY_WORD.get(said.replace(/\s+/g, ' '));
  if (whole) return whole;
  const words = said
    .split(/[\s-]+/)
    .filter(Boolean)
    .reverse();
  for (const word of words) {
    const found = BY_WORD.get(word);
    if (found) return found;
  }
  return null;
}

/** An icon's shapes as paths, for a <symbol> or inline. */
export function iconPaths(name: IconName): string {
  const shapes: readonly IconShape[] = ICONS[name];
  return shapes
    .map(
      (shape) =>
        `<path d="${shape.d}"${shape.holes ? ' fill-rule="evenodd"' : ''}/>`,
    )
    .join('');
}

/** An icon defined once in a drawing: <symbol id="<prefix><name>">. */
export function iconSymbol(name: IconName, prefix = 'i-'): string {
  return `<symbol id="${prefix}${name}" viewBox="0 0 100 100">${iconPaths(name)}</symbol>`;
}

/**
 * An icon used where it stands: `size` across, its top left at x, y, in
 * the colour given (the paths take the colour of their <use>).
 */
export function iconUse(
  name: IconName,
  x: number,
  y: number,
  size: number,
  fill: string,
  extra = '',
  prefix = 'i-',
): string {
  return `<use href="#${prefix}${name}" x="${r1(x)}" y="${r1(y)}" width="${r1(size)}" height="${r1(size)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

/** An icon drawn in place, with no symbol to refer to: in a group scaled to its size. */
export function iconInline(
  name: IconName,
  x: number,
  y: number,
  size: number,
  fill: string,
): string {
  const k = Math.round((size / 100) * 10000) / 10000;
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${k})" fill="${fill}">${iconPaths(name)}</g>`;
}

/**
 * Where things are, for a map drawn by code (scene-map): every name the
 * writer may give a country, a continent or a part of one, and a small
 * table of the places most named (capitals, great cities, mountains,
 * rivers, seas), each with its coordinates. The writer names; code looks
 * up. A name not here is left off the map and logged, never guessed, and
 * the model never gives a coordinate.
 *
 * Countries are world-atlas's own (Natural Earth's admin-0, as the
 * countries-50m and countries-110m TopoJSON name them). The places are a
 * curated table, not a gazetteer: each is checked in the specs to lie in
 * (or on the coast of) the country it is listed under, so a slip in a
 * latitude cannot put a capital in the sea.
 */

import {
  naturalAreas,
  naturalLakes,
  naturalPlaces,
  naturalRivers,
  type NaturalPlace,
  type Position,
} from './scene-map-data';

/** A name as matched: no accents, no case, no punctuation, no leading "the". */
export function placeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

// ── Countries, by the parts of the world they are in (UN M49) ─────────────

/**
 * Each part of the world and world-atlas's names for its countries and
 * territories. The continents are made of these.
 */
const SUBREGIONS: Record<string, { continent: string; members: string[] }> = {
  'Northern Africa': {
    continent: 'Africa',
    members: [
      'Algeria',
      'Egypt',
      'Libya',
      'Morocco',
      'Sudan',
      'Tunisia',
      'W. Sahara',
    ],
  },
  'Eastern Africa': {
    continent: 'Africa',
    members: [
      'Burundi',
      'Comoros',
      'Djibouti',
      'Eritrea',
      'Ethiopia',
      'Kenya',
      'Madagascar',
      'Malawi',
      'Mauritius',
      'Mozambique',
      'Rwanda',
      'Seychelles',
      'Somalia',
      'Somaliland',
      'S. Sudan',
      'Uganda',
      'Tanzania',
      'Zambia',
      'Zimbabwe',
    ],
  },
  'Middle Africa': {
    continent: 'Africa',
    members: [
      'Angola',
      'Cameroon',
      'Central African Rep.',
      'Chad',
      'Congo',
      'Dem. Rep. Congo',
      'Eq. Guinea',
      'Gabon',
      'São Tomé and Principe',
    ],
  },
  'Southern Africa': {
    continent: 'Africa',
    members: ['Botswana', 'eSwatini', 'Lesotho', 'Namibia', 'South Africa'],
  },
  'Western Africa': {
    continent: 'Africa',
    members: [
      'Benin',
      'Burkina Faso',
      'Cabo Verde',
      "Côte d'Ivoire",
      'Gambia',
      'Ghana',
      'Guinea',
      'Guinea-Bissau',
      'Liberia',
      'Mali',
      'Mauritania',
      'Niger',
      'Nigeria',
      'Saint Helena',
      'Senegal',
      'Sierra Leone',
      'Togo',
    ],
  },
  Caribbean: {
    continent: 'North America',
    members: [
      'Anguilla',
      'Antigua and Barb.',
      'Aruba',
      'Bahamas',
      'Barbados',
      'British Virgin Is.',
      'Cayman Is.',
      'Cuba',
      'Curaçao',
      'Dominica',
      'Dominican Rep.',
      'Grenada',
      'Haiti',
      'Jamaica',
      'Montserrat',
      'Puerto Rico',
      'St-Barthélemy',
      'St. Kitts and Nevis',
      'Saint Lucia',
      'St-Martin',
      'St. Vin. and Gren.',
      'Sint Maarten',
      'Trinidad and Tobago',
      'Turks and Caicos Is.',
      'U.S. Virgin Is.',
    ],
  },
  'Central America': {
    continent: 'North America',
    members: [
      'Belize',
      'Costa Rica',
      'El Salvador',
      'Guatemala',
      'Honduras',
      'Mexico',
      'Nicaragua',
      'Panama',
    ],
  },
  'Northern America': {
    continent: 'North America',
    members: [
      'Bermuda',
      'Canada',
      'Greenland',
      'St. Pierre and Miquelon',
      'United States of America',
    ],
  },
  'South America': {
    continent: 'South America',
    members: [
      'Argentina',
      'Bolivia',
      'Brazil',
      'Chile',
      'Colombia',
      'Ecuador',
      'Falkland Is.',
      'Guyana',
      'Paraguay',
      'Peru',
      'Suriname',
      'Uruguay',
      'Venezuela',
      'S. Geo. and the Is.',
    ],
  },
  'Central Asia': {
    continent: 'Asia',
    members: [
      'Kazakhstan',
      'Kyrgyzstan',
      'Tajikistan',
      'Turkmenistan',
      'Uzbekistan',
    ],
  },
  'Eastern Asia': {
    continent: 'Asia',
    members: [
      'China',
      'Hong Kong',
      'Macao',
      'North Korea',
      'Japan',
      'Mongolia',
      'South Korea',
      'Taiwan',
    ],
  },
  'South-eastern Asia': {
    continent: 'Asia',
    members: [
      'Brunei',
      'Cambodia',
      'Indonesia',
      'Laos',
      'Malaysia',
      'Myanmar',
      'Philippines',
      'Singapore',
      'Thailand',
      'Timor-Leste',
      'Vietnam',
    ],
  },
  'Southern Asia': {
    continent: 'Asia',
    members: [
      'Afghanistan',
      'Bangladesh',
      'Bhutan',
      'India',
      'Iran',
      'Maldives',
      'Nepal',
      'Pakistan',
      'Sri Lanka',
      'Siachen Glacier',
    ],
  },
  'Western Asia': {
    continent: 'Asia',
    members: [
      'Armenia',
      'Azerbaijan',
      'Bahrain',
      'Cyprus',
      'N. Cyprus',
      'Georgia',
      'Iraq',
      'Israel',
      'Jordan',
      'Kuwait',
      'Lebanon',
      'Oman',
      'Qatar',
      'Saudi Arabia',
      'Palestine',
      'Syria',
      'Turkey',
      'United Arab Emirates',
      'Yemen',
    ],
  },
  'Eastern Europe': {
    continent: 'Europe',
    members: [
      'Belarus',
      'Bulgaria',
      'Czechia',
      'Hungary',
      'Poland',
      'Moldova',
      'Romania',
      'Russia',
      'Slovakia',
      'Ukraine',
    ],
  },
  'Northern Europe': {
    continent: 'Europe',
    members: [
      'Åland',
      'Denmark',
      'Estonia',
      'Faeroe Is.',
      'Finland',
      'Guernsey',
      'Iceland',
      'Ireland',
      'Isle of Man',
      'Jersey',
      'Latvia',
      'Lithuania',
      'Norway',
      'Sweden',
      'United Kingdom',
    ],
  },
  'Southern Europe': {
    continent: 'Europe',
    members: [
      'Albania',
      'Andorra',
      'Bosnia and Herz.',
      'Croatia',
      'Greece',
      'Vatican',
      'Italy',
      'Malta',
      'Montenegro',
      'Macedonia',
      'Portugal',
      'San Marino',
      'Serbia',
      'Slovenia',
      'Spain',
      'Kosovo',
    ],
  },
  'Western Europe': {
    continent: 'Europe',
    members: [
      'Austria',
      'Belgium',
      'France',
      'Germany',
      'Liechtenstein',
      'Luxembourg',
      'Monaco',
      'Netherlands',
      'Switzerland',
    ],
  },
  'Australia and New Zealand': {
    continent: 'Oceania',
    members: [
      'Australia',
      'New Zealand',
      'Norfolk Island',
      'Heard I. and McDonald Is.',
      'Ashmore and Cartier Is.',
      'Indian Ocean Ter.',
    ],
  },
  Melanesia: {
    continent: 'Oceania',
    members: [
      'Fiji',
      'New Caledonia',
      'Papua New Guinea',
      'Solomon Is.',
      'Vanuatu',
    ],
  },
  Micronesia: {
    continent: 'Oceania',
    members: [
      'Guam',
      'Kiribati',
      'Marshall Is.',
      'Micronesia',
      'Nauru',
      'N. Mariana Is.',
      'Palau',
    ],
  },
  Polynesia: {
    continent: 'Oceania',
    members: [
      'American Samoa',
      'Cook Is.',
      'Fr. Polynesia',
      'Niue',
      'Pitcairn Is.',
      'Samoa',
      'Tonga',
      'Wallis and Futuna Is.',
    ],
  },
  'Antarctic lands': {
    continent: 'Antarctica',
    members: ['Antarctica', 'Fr. S. Antarctic Lands'],
  },
};

/** world-atlas's countries the tables above do not place in a part of the world. */
const UNPLACED = ['Br. Indian Ocean Ter.'] as const;

/** Every country and territory world-atlas names, as it names them. */
export const ATLAS_COUNTRIES: readonly string[] = [
  ...new Set([
    ...Object.values(SUBREGIONS).flatMap((s) => s.members),
    ...UNPLACED,
  ]),
];

/** The continent each of world-atlas's countries is in. */
export const CONTINENT_OF: ReadonlyMap<string, string> = new Map(
  Object.values(SUBREGIONS).flatMap((s) =>
    s.members.map((m) => [m, s.continent] as const),
  ),
);

/**
 * A continent's or a large region's frame, in degrees: west, south, east,
 * north. A continent is framed by its land, not by its members' farthest
 * islands (or by Russia, which is in Europe and reaches the Pacific).
 */
export type GeoBox = [number, number, number, number];

/** The parts of the world a map may show, beyond one country: their members, and the frame of a continent. */
export interface RegionEntry {
  name: string;
  kind: 'world' | 'continent' | 'region';
  members: readonly string[];
  box: GeoBox | null;
}

const continentMembers = (continent: string) =>
  Object.values(SUBREGIONS)
    .filter((s) => s.continent === continent)
    .flatMap((s) => s.members);

const members = (...subregions: string[]) =>
  subregions.flatMap((s) => SUBREGIONS[s].members);

const without = (list: readonly string[], ...out: string[]) =>
  list.filter((one) => !out.includes(one));

const REGION_LIST: RegionEntry[] = [
  { name: 'World', kind: 'world', members: ATLAS_COUNTRIES, box: null },
  {
    name: 'Africa',
    kind: 'continent',
    members: continentMembers('Africa'),
    box: [-19, -35.5, 52, 38],
  },
  {
    name: 'Europe',
    kind: 'continent',
    members: continentMembers('Europe'),
    box: [-25, 34, 45, 71.5],
  },
  {
    name: 'Asia',
    kind: 'continent',
    members: continentMembers('Asia'),
    box: [26, -11, 146, 56],
  },
  {
    name: 'North America',
    kind: 'continent',
    members: continentMembers('North America'),
    box: [-168, 7, -52, 72],
  },
  {
    name: 'South America',
    kind: 'continent',
    members: continentMembers('South America'),
    box: [-82, -56, -34, 13],
  },
  {
    name: 'Oceania',
    kind: 'continent',
    members: continentMembers('Oceania'),
    box: [112, -47.5, 179, -1],
  },
  {
    name: 'Antarctica',
    kind: 'continent',
    members: ['Antarctica'],
    box: null,
  },
  {
    name: 'Americas',
    kind: 'continent',
    members: [
      ...continentMembers('North America'),
      ...continentMembers('South America'),
    ],
    box: [-168, -56, -34, 72],
  },
  {
    name: 'Middle East',
    kind: 'region',
    members: [
      'Bahrain',
      'Cyprus',
      'N. Cyprus',
      'Egypt',
      'Iran',
      'Iraq',
      'Israel',
      'Jordan',
      'Kuwait',
      'Lebanon',
      'Oman',
      'Palestine',
      'Qatar',
      'Saudi Arabia',
      'Syria',
      'Turkey',
      'United Arab Emirates',
      'Yemen',
    ],
    box: null,
  },
  {
    name: 'North Africa',
    kind: 'region',
    members: members('Northern Africa'),
    box: null,
  },
  {
    name: 'East Africa',
    kind: 'region',
    members: members('Eastern Africa'),
    box: null,
  },
  {
    name: 'Central Africa',
    kind: 'region',
    members: members('Middle Africa'),
    box: null,
  },
  {
    name: 'Southern Africa',
    kind: 'region',
    members: members('Southern Africa'),
    box: null,
  },
  {
    name: 'West Africa',
    kind: 'region',
    members: members('Western Africa'),
    box: null,
  },
  {
    name: 'Sub-Saharan Africa',
    kind: 'region',
    members: without(continentMembers('Africa'), ...members('Northern Africa')),
    box: [-19, -35.5, 52, 25],
  },
  {
    name: 'Horn of Africa',
    kind: 'region',
    members: ['Djibouti', 'Eritrea', 'Ethiopia', 'Somalia', 'Somaliland'],
    box: null,
  },
  {
    name: 'Caribbean',
    kind: 'region',
    members: members('Caribbean'),
    box: null,
  },
  {
    name: 'Central America',
    kind: 'region',
    members: members('Central America'),
    box: null,
  },
  {
    name: 'Latin America',
    kind: 'region',
    members: [
      ...members('Central America', 'Caribbean'),
      ...continentMembers('South America'),
    ],
    box: [-118, -56, -34, 33],
  },
  {
    name: 'Central Asia',
    kind: 'region',
    members: members('Central Asia'),
    box: null,
  },
  {
    name: 'East Asia',
    kind: 'region',
    members: members('Eastern Asia'),
    box: null,
  },
  {
    name: 'Southeast Asia',
    kind: 'region',
    members: members('South-eastern Asia'),
    box: null,
  },
  {
    name: 'South Asia',
    kind: 'region',
    members: members('Southern Asia'),
    box: null,
  },
  {
    name: 'Western Asia',
    kind: 'region',
    members: members('Western Asia'),
    box: null,
  },
  {
    name: 'Eastern Europe',
    kind: 'region',
    members: members('Eastern Europe'),
    // Russia west of the Urals, as Eastern Europe is drawn.
    box: [12, 41, 60, 66],
  },
  {
    name: 'Northern Europe',
    kind: 'region',
    members: members('Northern Europe'),
    box: null,
  },
  {
    name: 'Southern Europe',
    kind: 'region',
    members: members('Southern Europe'),
    box: null,
  },
  {
    name: 'Western Europe',
    kind: 'region',
    members: members('Western Europe'),
    box: null,
  },
  {
    name: 'Scandinavia',
    kind: 'region',
    members: ['Denmark', 'Norway', 'Sweden'],
    box: null,
  },
  {
    name: 'Nordic countries',
    kind: 'region',
    members: ['Denmark', 'Norway', 'Sweden', 'Finland', 'Iceland'],
    box: null,
  },
  {
    name: 'Balkans',
    kind: 'region',
    members: [
      'Albania',
      'Bosnia and Herz.',
      'Bulgaria',
      'Croatia',
      'Greece',
      'Kosovo',
      'Montenegro',
      'Macedonia',
      'Serbia',
      'Slovenia',
      'Romania',
    ],
    box: null,
  },
  {
    name: 'British Isles',
    kind: 'region',
    members: ['United Kingdom', 'Ireland', 'Isle of Man'],
    box: null,
  },
  {
    name: 'Iberian Peninsula',
    kind: 'region',
    members: ['Spain', 'Portugal'],
    box: null,
  },
  {
    name: 'Benelux',
    kind: 'region',
    members: ['Belgium', 'Netherlands', 'Luxembourg'],
    box: null,
  },
  {
    name: 'Arabian Peninsula',
    kind: 'region',
    members: [
      'Saudi Arabia',
      'Yemen',
      'Oman',
      'United Arab Emirates',
      'Qatar',
      'Bahrain',
      'Kuwait',
    ],
    box: null,
  },
  {
    name: 'European Union',
    kind: 'region',
    members: [
      'Austria',
      'Belgium',
      'Bulgaria',
      'Croatia',
      'Cyprus',
      'Czechia',
      'Denmark',
      'Estonia',
      'Finland',
      'France',
      'Germany',
      'Greece',
      'Hungary',
      'Ireland',
      'Italy',
      'Latvia',
      'Lithuania',
      'Luxembourg',
      'Malta',
      'Netherlands',
      'Poland',
      'Portugal',
      'Romania',
      'Slovakia',
      'Slovenia',
      'Spain',
      'Sweden',
    ],
    box: [-25, 34, 35, 71],
  },
  {
    name: 'Australasia',
    kind: 'region',
    members: ['Australia', 'New Zealand', 'Papua New Guinea'],
    box: null,
  },
  {
    name: 'Pacific Islands',
    kind: 'region',
    members: [...members('Melanesia', 'Micronesia', 'Polynesia')],
    box: null,
  },
  {
    name: 'Melanesia',
    kind: 'region',
    members: members('Melanesia'),
    box: null,
  },
  {
    name: 'Polynesia',
    kind: 'region',
    members: members('Polynesia'),
    box: null,
  },
];

/** Other words for the parts of the world. */
const REGION_ALIASES: Record<string, string> = {
  world: 'World',
  'whole world': 'World',
  'the world': 'World',
  globe: 'World',
  earth: 'World',
  'world map': 'World',
  'african continent': 'Africa',
  'european continent': 'Europe',
  'asian continent': 'Asia',
  'north and south america': 'Americas',
  'the americas': 'Americas',
  'south east asia': 'Southeast Asia',
  'south-east asia': 'Southeast Asia',
  'southeastern asia': 'Southeast Asia',
  'south eastern asia': 'Southeast Asia',
  'eastern asia': 'East Asia',
  'southern asia': 'South Asia',
  'indian subcontinent': 'South Asia',
  'northern africa': 'North Africa',
  'eastern africa': 'East Africa',
  'western africa': 'West Africa',
  'middle africa': 'Central Africa',
  'subsaharan africa': 'Sub-Saharan Africa',
  'sub saharan africa': 'Sub-Saharan Africa',
  'africa south of the sahara': 'Sub-Saharan Africa',
  'near east': 'Middle East',
  mideast: 'Middle East',
  'australia and oceania': 'Oceania',
  'australia and new zealand': 'Australasia',
  nordic: 'Nordic countries',
  nordics: 'Nordic countries',
  'scandinavian countries': 'Scandinavia',
  'the balkans': 'Balkans',
  'balkan peninsula': 'Balkans',
  iberia: 'Iberian Peninsula',
  eu: 'European Union',
  arabia: 'Arabian Peninsula',
  'gulf states': 'Arabian Peninsula',
  'pacific islands': 'Pacific Islands',
  'the pacific islands': 'Pacific Islands',
  'north american continent': 'North America',
  'south american continent': 'South America',
};

/**
 * Other names for world-atlas's countries: the names a writer uses, in
 * full and short ("United Kingdom", "UK", "Britain"; "Ivory Coast"). A
 * name for more than one (Korea) names each. "Congo" alone is the larger
 * Congo, the Democratic Republic; the other is "Republic of the Congo".
 * Parts of a country (England, Scotland) are not countries here: as a
 * map's region each shows its country; as a highlight each is left off,
 * since colouring the whole country would be untrue.
 */
const COUNTRY_ALIASES: Record<string, readonly string[]> = {
  uk: ['United Kingdom'],
  'u k': ['United Kingdom'],
  britain: ['United Kingdom'],
  'great britain': ['United Kingdom'],
  'united kingdom of great britain and northern ireland': ['United Kingdom'],
  usa: ['United States of America'],
  us: ['United States of America'],
  'u s': ['United States of America'],
  'u s a': ['United States of America'],
  'united states': ['United States of America'],
  america: ['United States of America'],
  drc: ['Dem. Rep. Congo'],
  'dr congo': ['Dem. Rep. Congo'],
  'd r congo': ['Dem. Rep. Congo'],
  'democratic republic of the congo': ['Dem. Rep. Congo'],
  'democratic republic of congo': ['Dem. Rep. Congo'],
  'congo kinshasa': ['Dem. Rep. Congo'],
  zaire: ['Dem. Rep. Congo'],
  congo: ['Dem. Rep. Congo'],
  'republic of the congo': ['Congo'],
  'republic of congo': ['Congo'],
  'congo republic': ['Congo'],
  'congo brazzaville': ['Congo'],
  'ivory coast': ["Côte d'Ivoire"],
  'czech republic': ['Czechia'],
  swaziland: ['eSwatini'],
  eswatini: ['eSwatini'],
  burma: ['Myanmar'],
  'north macedonia': ['Macedonia'],
  'east timor': ['Timor-Leste'],
  'south sudan': ['S. Sudan'],
  'central african republic': ['Central African Rep.'],
  car: ['Central African Rep.'],
  'equatorial guinea': ['Eq. Guinea'],
  'dominican republic': ['Dominican Rep.'],
  bosnia: ['Bosnia and Herz.'],
  'bosnia and herzegovina': ['Bosnia and Herz.'],
  'bosnia herzegovina': ['Bosnia and Herz.'],
  'western sahara': ['W. Sahara'],
  netherlands: ['Netherlands'],
  holland: ['Netherlands'],
  'russian federation': ['Russia'],
  'south korea': ['South Korea'],
  'republic of korea': ['South Korea'],
  'north korea': ['North Korea'],
  dprk: ['North Korea'],
  korea: ['South Korea', 'North Korea'],
  'korean peninsula': ['South Korea', 'North Korea'],
  uae: ['United Arab Emirates'],
  emirates: ['United Arab Emirates'],
  saudi: ['Saudi Arabia'],
  'kingdom of saudi arabia': ['Saudi Arabia'],
  ksa: ['Saudi Arabia'],
  png: ['Papua New Guinea'],
  'cape verde': ['Cabo Verde'],
  'sao tome': ['São Tomé and Principe'],
  'sao tome and principe': ['São Tomé and Principe'],
  falklands: ['Falkland Is.'],
  'falkland islands': ['Falkland Is.'],
  'solomon islands': ['Solomon Is.'],
  'marshall islands': ['Marshall Is.'],
  'cook islands': ['Cook Is.'],
  'faroe islands': ['Faeroe Is.'],
  faroes: ['Faeroe Is.'],
  'cayman islands': ['Cayman Is.'],
  'vatican city': ['Vatican'],
  'holy see': ['Vatican'],
  turkiye: ['Turkey'],
  'lao pdr': ['Laos'],
  'viet nam': ['Vietnam'],
  'kyrgyz republic': ['Kyrgyzstan'],
  'slovak republic': ['Slovakia'],
  'brunei darussalam': ['Brunei'],
  'syrian arab republic': ['Syria'],
  persia: ['Iran'],
  'islamic republic of iran': ['Iran'],
  'united republic of tanzania': ['Tanzania'],
  'the gambia': ['Gambia'],
  gambia: ['Gambia'],
  'guinea bissau': ['Guinea-Bissau'],
  'timor leste': ['Timor-Leste'],
  'antigua and barbuda': ['Antigua and Barb.'],
  'saint kitts and nevis': ['St. Kitts and Nevis'],
  'st kitts and nevis': ['St. Kitts and Nevis'],
  'saint vincent and the grenadines': ['St. Vin. and Gren.'],
  'st vincent and the grenadines': ['St. Vin. and Gren.'],
  'st lucia': ['Saint Lucia'],
  trinidad: ['Trinidad and Tobago'],
  'micronesia federated states of': ['Micronesia'],
  'federated states of micronesia': ['Micronesia'],
  'northern cyprus': ['N. Cyprus'],
  'palestinian territories': ['Palestine'],
  'state of palestine': ['Palestine'],
  'french polynesia': ['Fr. Polynesia'],
  'new caledonia': ['New Caledonia'],
  'puerto rico': ['Puerto Rico'],
  'hong kong': ['Hong Kong'],
  macau: ['Macao'],
  'mainland china': ['China'],
  'peoples republic of china': ['China'],
  prc: ['China'],
  'republic of ireland': ['Ireland'],
  eire: ['Ireland'],
  'ireland republic': ['Ireland'],
  'south georgia': ['S. Geo. and the Is.'],
  'british indian ocean territory': ['Br. Indian Ocean Ter.'],
  'us virgin islands': ['U.S. Virgin Is.'],
  'british virgin islands': ['British Virgin Is.'],
  'turks and caicos': ['Turks and Caicos Is.'],
  'turks and caicos islands': ['Turks and Caicos Is.'],
  'northern mariana islands': ['N. Mariana Is.'],
  'wallis and futuna': ['Wallis and Futuna Is.'],
  'pitcairn islands': ['Pitcairn Is.'],
  'french southern and antarctic lands': ['Fr. S. Antarctic Lands'],
  'saint helena': ['Saint Helena'],
  'st helena': ['Saint Helena'],
  'saint pierre and miquelon': ['St. Pierre and Miquelon'],
  'saint martin': ['St-Martin'],
  'saint barthelemy': ['St-Barthélemy'],
  'heard island and mcdonald islands': ['Heard I. and McDonald Is.'],
  'aland islands': ['Åland'],
  aland: ['Åland'],
};

/** A country's part, which as a map's region shows the country itself, and never as a highlight. */
const PART_OF_COUNTRY: Record<string, string> = {
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  'northern ireland': 'United Kingdom',
  tibet: 'China',
  siberia: 'Russia',
  alaska: 'United States of America',
  hawaii: 'United States of America',
  california: 'United States of America',
  texas: 'United States of America',
  florida: 'United States of America',
  quebec: 'Canada',
  bavaria: 'Germany',
  sicily: 'Italy',
  sardinia: 'Italy',
  corsica: 'France',
  zanzibar: 'Tanzania',
  'canary islands': 'Spain',
  tasmania: 'Australia',
  borneo: 'Indonesia',
  sumatra: 'Indonesia',
  java: 'Indonesia',
  'new guinea': 'Papua New Guinea',
  patagonia: 'Argentina',
  greenland: 'Greenland',
};

const countryByKey = new Map<string, readonly string[]>();
for (const name of ATLAS_COUNTRIES) countryByKey.set(placeKey(name), [name]);
for (const [alias, names] of Object.entries(COUNTRY_ALIASES))
  countryByKey.set(placeKey(alias), names);

const regionByKey = new Map<string, RegionEntry>();
for (const region of REGION_LIST)
  regionByKey.set(placeKey(region.name), region);
for (const [alias, name] of Object.entries(REGION_ALIASES)) {
  const region = REGION_LIST.find((r) => r.name === name);
  if (region) regionByKey.set(placeKey(alias), region);
}

/** world-atlas's countries a name means: one, or more for a name of several (Korea); empty if none. */
export function countriesNamed(name: string): readonly string[] {
  return countryByKey.get(placeKey(name)) ?? [];
}

/** The part of the world a name means: the world, a continent or a region; null if none. */
export function regionNamed(name: string): RegionEntry | null {
  return regionByKey.get(placeKey(name)) ?? null;
}

/** The country a part of one belongs to ("Scotland": the United Kingdom); null if it is none. */
export function countryOfPart(name: string): string | null {
  return PART_OF_COUNTRY[placeKey(name)] ?? null;
}

// ── Places ────────────────────────────────────────────────────────────────

export type PlaceKind =
  | 'city'
  | 'capital'
  | 'mountain'
  | 'landmark'
  | 'river'
  | 'lake'
  | 'sea'
  | 'area';

export interface Place {
  /** As the map writes it. */
  name: string;
  /** Where its mark or its name goes: a river's on it, a lake's in it. */
  lat: number;
  lon: number;
  kind: PlaceKind;
  /** world-atlas's country it is in, for the specs to hold it to; null for a sea. */
  country: string | null;
  aliases?: readonly string[];
  /** A river: Natural Earth's names for its stretches, drawn as lines. */
  river?: readonly string[];
  /** A lake: Natural Earth's name for it, drawn as itself. */
  lake?: string;
  /** A sea: other points in it, latitude and longitude, to name it at when the first is out of view. */
  alts?: readonly [number, number][];
}

const P = (
  name: string,
  lat: number,
  lon: number,
  country: string | null,
  kind: PlaceKind = 'city',
  aliases: readonly string[] = [],
): Place => ({ name, lat, lon, kind, country, aliases });

/**
 * The places lessons name most, with their other names: capitals and
 * great cities (their coordinates Natural Earth's where it has them; these
 * where it has not, as Gitega, Burundi's capital since 2019), and the
 * mountains, seas, deserts and landmarks Natural Earth's places do not
 * hold. Rivers and lakes are Natural Earth's own, drawn as themselves.
 * Coordinates in degrees, north and east positive.
 */
export const PLACES: readonly Place[] = [
  // Africa
  P('Abuja', 9.0765, 7.3986, 'Nigeria', 'capital'),
  P('Lagos', 6.5244, 3.3792, 'Nigeria'),
  P('Kano', 12.0022, 8.592, 'Nigeria'),
  P('Ibadan', 7.3775, 3.947, 'Nigeria'),
  P('Accra', 5.6037, -0.187, 'Ghana', 'capital'),
  P('Kumasi', 6.6885, -1.6244, 'Ghana'),
  P('Lomé', 6.1725, 1.2314, 'Togo', 'capital'),
  P('Porto-Novo', 6.4969, 2.6289, 'Benin', 'capital'),
  P('Cotonou', 6.3703, 2.3912, 'Benin'),
  P('Ouagadougou', 12.3714, -1.5197, 'Burkina Faso', 'capital'),
  P('Niamey', 13.5116, 2.1254, 'Niger', 'capital'),
  P('Bamako', 12.6392, -8.0029, 'Mali', 'capital'),
  P('Timbuktu', 16.7666, -3.0026, 'Mali'),
  P('Dakar', 14.7167, -17.4677, 'Senegal', 'capital'),
  P('Banjul', 13.4549, -16.579, 'Gambia', 'capital'),
  P('Bissau', 11.8817, -15.617, 'Guinea-Bissau', 'capital'),
  P('Conakry', 9.6412, -13.5784, 'Guinea', 'capital'),
  P('Freetown', 8.4657, -13.2317, 'Sierra Leone', 'capital'),
  P('Monrovia', 6.3156, -10.8074, 'Liberia', 'capital'),
  P('Yamoussoukro', 6.8276, -5.2893, "Côte d'Ivoire", 'capital'),
  P('Abidjan', 5.36, -4.0083, "Côte d'Ivoire"),
  P('Nouakchott', 18.0735, -15.9582, 'Mauritania', 'capital'),
  P('Praia', 14.933, -23.5133, 'Cabo Verde', 'capital'),
  P('Rabat', 34.0209, -6.8416, 'Morocco', 'capital'),
  P('Casablanca', 33.5731, -7.5898, 'Morocco'),
  P('Marrakesh', 31.6295, -7.9811, 'Morocco', 'city', ['Marrakech']),
  P('Algiers', 36.7538, 3.0588, 'Algeria', 'capital'),
  P('Tunis', 36.8065, 10.1815, 'Tunisia', 'capital'),
  P('Tripoli', 32.8872, 13.1913, 'Libya', 'capital'),
  P('Cairo', 30.0444, 31.2357, 'Egypt', 'capital'),
  P('Alexandria', 31.2001, 29.9187, 'Egypt'),
  P('Khartoum', 15.5007, 32.5599, 'Sudan', 'capital'),
  P('Juba', 4.8594, 31.5713, 'S. Sudan', 'capital'),
  P('Addis Ababa', 9.03, 38.74, 'Ethiopia', 'capital'),
  P('Asmara', 15.3229, 38.9251, 'Eritrea', 'capital'),
  P('Djibouti City', 11.5721, 43.1456, 'Djibouti', 'capital'),
  P('Mogadishu', 2.0469, 45.3182, 'Somalia', 'capital'),
  P('Nairobi', -1.2921, 36.8219, 'Kenya', 'capital'),
  P('Mombasa', -4.0435, 39.6682, 'Kenya'),
  P('Kampala', 0.3476, 32.5825, 'Uganda', 'capital'),
  P('Kigali', -1.9441, 30.0619, 'Rwanda', 'capital'),
  P('Gitega', -3.4271, 29.9246, 'Burundi', 'capital'),
  P('Bujumbura', -3.3614, 29.3599, 'Burundi'),
  P('Dodoma', -6.163, 35.7516, 'Tanzania', 'capital'),
  P('Dar es Salaam', -6.7924, 39.2083, 'Tanzania'),
  P('Kinshasa', -4.4419, 15.2663, 'Dem. Rep. Congo', 'capital'),
  P('Lubumbashi', -11.6876, 27.5026, 'Dem. Rep. Congo'),
  P('Kisangani', 0.5153, 25.191, 'Dem. Rep. Congo'),
  P('Brazzaville', -4.2634, 15.2429, 'Congo', 'capital'),
  P('Libreville', 0.4162, 9.4673, 'Gabon', 'capital'),
  P('Malabo', 3.7504, 8.7371, 'Eq. Guinea', 'capital'),
  P('Yaoundé', 3.848, 11.5021, 'Cameroon', 'capital'),
  P('Douala', 4.0511, 9.7679, 'Cameroon'),
  P('Bangui', 4.3947, 18.5582, 'Central African Rep.', 'capital'),
  P("N'Djamena", 12.1348, 15.0557, 'Chad', 'capital', ['Ndjamena']),
  P('São Tomé', 0.3365, 6.7273, 'São Tomé and Principe', 'capital'),
  P('Luanda', -8.839, 13.2894, 'Angola', 'capital'),
  P('Lusaka', -15.3875, 28.3228, 'Zambia', 'capital'),
  P('Harare', -17.8252, 31.0335, 'Zimbabwe', 'capital'),
  P('Lilongwe', -13.9626, 33.7741, 'Malawi', 'capital'),
  P('Maputo', -25.9692, 32.5732, 'Mozambique', 'capital'),
  P('Antananarivo', -18.8792, 47.5079, 'Madagascar', 'capital'),
  P('Gaborone', -24.6282, 25.9231, 'Botswana', 'capital'),
  P('Windhoek', -22.5609, 17.0658, 'Namibia', 'capital'),
  P('Pretoria', -25.7479, 28.2293, 'South Africa', 'capital'),
  P('Johannesburg', -26.2041, 28.0473, 'South Africa'),
  P('Cape Town', -33.9249, 18.4241, 'South Africa'),
  P('Durban', -29.8587, 31.0218, 'South Africa'),
  P('Maseru', -29.3151, 27.4869, 'Lesotho', 'capital'),
  P('Mbabane', -26.3054, 31.1367, 'eSwatini', 'capital'),
  P('Port Louis', -20.1609, 57.5012, 'Mauritius', 'capital'),
  P('Moroni', -11.7172, 43.2473, 'Comoros', 'capital'),
  // Europe
  P('London', 51.5074, -0.1278, 'United Kingdom', 'capital'),
  P('Manchester', 53.4808, -2.2426, 'United Kingdom'),
  P('Birmingham', 52.4862, -1.8904, 'United Kingdom'),
  P('Liverpool', 53.4084, -2.9916, 'United Kingdom'),
  P('Edinburgh', 55.9533, -3.1883, 'United Kingdom'),
  P('Glasgow', 55.8642, -4.2518, 'United Kingdom'),
  P('Cardiff', 51.4816, -3.1791, 'United Kingdom'),
  P('Belfast', 54.5973, -5.9301, 'United Kingdom'),
  P('Dublin', 53.3498, -6.2603, 'Ireland', 'capital'),
  P('Paris', 48.8566, 2.3522, 'France', 'capital'),
  P('Marseille', 43.2965, 5.3698, 'France', 'city', ['Marseilles']),
  P('Lyon', 45.764, 4.8357, 'France'),
  P('Berlin', 52.52, 13.405, 'Germany', 'capital'),
  P('Munich', 48.1351, 11.582, 'Germany'),
  P('Hamburg', 53.5511, 9.9937, 'Germany'),
  P('Frankfurt', 50.1109, 8.6821, 'Germany'),
  P('Cologne', 50.9375, 6.9603, 'Germany'),
  P('Madrid', 40.4168, -3.7038, 'Spain', 'capital'),
  P('Barcelona', 41.3874, 2.1686, 'Spain'),
  P('Seville', 37.3891, -5.9845, 'Spain'),
  P('Lisbon', 38.7223, -9.1393, 'Portugal', 'capital'),
  P('Rome', 41.9028, 12.4964, 'Italy', 'capital'),
  P('Milan', 45.4642, 9.19, 'Italy'),
  P('Naples', 40.8518, 14.2681, 'Italy'),
  P('Venice', 45.4408, 12.3155, 'Italy'),
  P('Florence', 43.7696, 11.2558, 'Italy'),
  P('Athens', 37.9838, 23.7275, 'Greece', 'capital'),
  P('Amsterdam', 52.3676, 4.9041, 'Netherlands', 'capital'),
  P('Rotterdam', 51.9244, 4.4777, 'Netherlands'),
  P('The Hague', 52.0705, 4.3007, 'Netherlands'),
  P('Brussels', 50.8503, 4.3517, 'Belgium', 'capital'),
  P('Luxembourg City', 49.6116, 6.1319, 'Luxembourg', 'capital'),
  P('Bern', 46.948, 7.4474, 'Switzerland', 'capital'),
  P('Zurich', 47.3769, 8.5417, 'Switzerland'),
  P('Geneva', 46.2044, 6.1432, 'Switzerland'),
  P('Vienna', 48.2082, 16.3738, 'Austria', 'capital'),
  P('Prague', 50.0755, 14.4378, 'Czechia', 'capital'),
  P('Bratislava', 48.1486, 17.1077, 'Slovakia', 'capital'),
  P('Budapest', 47.4979, 19.0402, 'Hungary', 'capital'),
  P('Warsaw', 52.2297, 21.0122, 'Poland', 'capital'),
  P('Kraków', 50.0647, 19.945, 'Poland', 'city', ['Krakow', 'Cracow']),
  P('Copenhagen', 55.6761, 12.5683, 'Denmark', 'capital'),
  P('Oslo', 59.9139, 10.7522, 'Norway', 'capital'),
  P('Stockholm', 59.3293, 18.0686, 'Sweden', 'capital'),
  P('Helsinki', 60.1699, 24.9384, 'Finland', 'capital'),
  P('Reykjavík', 64.1466, -21.9426, 'Iceland', 'capital', ['Reykjavik']),
  P('Tallinn', 59.437, 24.7536, 'Estonia', 'capital'),
  P('Riga', 56.9496, 24.1052, 'Latvia', 'capital'),
  P('Vilnius', 54.6872, 25.2797, 'Lithuania', 'capital'),
  P('Minsk', 53.9006, 27.559, 'Belarus', 'capital'),
  P('Kyiv', 50.4501, 30.5234, 'Ukraine', 'capital', ['Kiev']),
  P('Odesa', 46.4825, 30.7233, 'Ukraine', 'city', ['Odessa']),
  P('Chișinău', 47.0105, 28.8638, 'Moldova', 'capital', ['Chisinau']),
  P('Bucharest', 44.4268, 26.1025, 'Romania', 'capital'),
  P('Sofia', 42.6977, 23.3219, 'Bulgaria', 'capital'),
  P('Belgrade', 44.7866, 20.4489, 'Serbia', 'capital'),
  P('Zagreb', 45.815, 15.9819, 'Croatia', 'capital'),
  P('Ljubljana', 46.0569, 14.5058, 'Slovenia', 'capital'),
  P('Sarajevo', 43.8563, 18.4131, 'Bosnia and Herz.', 'capital'),
  P('Podgorica', 42.4304, 19.2594, 'Montenegro', 'capital'),
  P('Skopje', 41.9973, 21.428, 'Macedonia', 'capital'),
  P('Tirana', 41.3275, 19.8187, 'Albania', 'capital'),
  P('Pristina', 42.6629, 21.1655, 'Kosovo', 'capital'),
  P('Valletta', 35.8989, 14.5146, 'Malta', 'capital'),
  P('Nicosia', 35.1856, 33.3823, 'Cyprus', 'capital'),
  P('Moscow', 55.7558, 37.6173, 'Russia', 'capital'),
  P('Saint Petersburg', 59.9311, 30.3609, 'Russia', 'city', [
    'St Petersburg',
    'Leningrad',
  ]),
  P('Volgograd', 48.708, 44.5133, 'Russia', 'city', ['Stalingrad']),
  P('Novosibirsk', 55.0084, 82.9357, 'Russia'),
  P('Vladivostok', 43.1155, 131.8855, 'Russia'),
  P('Istanbul', 41.0082, 28.9784, 'Turkey', 'city', ['Constantinople']),
  P('Ankara', 39.9334, 32.8597, 'Turkey', 'capital'),
  P('Chernobyl', 51.2763, 30.2219, 'Ukraine', 'landmark'),
  P('Stonehenge', 51.1789, -1.8262, 'United Kingdom', 'landmark'),
  // Asia
  P('Beijing', 39.9042, 116.4074, 'China', 'capital', ['Peking']),
  P('Shanghai', 31.2304, 121.4737, 'China'),
  P('Guangzhou', 23.1291, 113.2644, 'China', 'city', ['Canton']),
  P('Shenzhen', 22.5431, 114.0579, 'China'),
  P('Wuhan', 30.5928, 114.3055, 'China'),
  P('Chengdu', 30.5728, 104.0668, 'China'),
  P("Xi'an", 34.3416, 108.9398, 'China', 'city', ['Xian']),
  P('Lhasa', 29.652, 91.1721, 'China'),
  P('Hong Kong', 22.3193, 114.1694, 'Hong Kong'),
  P('Tokyo', 35.6762, 139.6503, 'Japan', 'capital'),
  P('Osaka', 34.6937, 135.5023, 'Japan'),
  P('Kyoto', 35.0116, 135.7681, 'Japan'),
  P('Hiroshima', 34.3853, 132.4553, 'Japan'),
  P('Nagasaki', 32.7503, 129.8779, 'Japan'),
  P('Sapporo', 43.0618, 141.3545, 'Japan'),
  P('Seoul', 37.5665, 126.978, 'South Korea', 'capital'),
  P('Busan', 35.1796, 129.0756, 'South Korea'),
  P('Pyongyang', 39.0392, 125.7625, 'North Korea', 'capital'),
  P('Ulaanbaatar', 47.8864, 106.9057, 'Mongolia', 'capital', ['Ulan Bator']),
  P('Taipei', 25.033, 121.5654, 'Taiwan', 'capital'),
  P('New Delhi', 28.6139, 77.209, 'India', 'capital', ['Delhi']),
  P('Mumbai', 19.076, 72.8777, 'India', 'city', ['Bombay']),
  P('Kolkata', 22.5726, 88.3639, 'India', 'city', ['Calcutta']),
  P('Chennai', 13.0827, 80.2707, 'India', 'city', ['Madras']),
  P('Bengaluru', 12.9716, 77.5946, 'India', 'city', ['Bangalore']),
  P('Hyderabad', 17.385, 78.4867, 'India'),
  P('Varanasi', 25.3176, 82.9739, 'India'),
  P('Agra', 27.1767, 78.0081, 'India'),
  P('Taj Mahal', 27.1751, 78.0421, 'India', 'landmark'),
  P('Islamabad', 33.6844, 73.0479, 'Pakistan', 'capital'),
  P('Karachi', 24.8607, 67.0011, 'Pakistan'),
  P('Lahore', 31.5204, 74.3587, 'Pakistan'),
  P('Dhaka', 23.8103, 90.4125, 'Bangladesh', 'capital'),
  P('Kathmandu', 27.7172, 85.324, 'Nepal', 'capital'),
  P('Thimphu', 27.4728, 89.639, 'Bhutan', 'capital'),
  P('Colombo', 6.9271, 79.8612, 'Sri Lanka', 'capital'),
  P('Kabul', 34.5553, 69.2075, 'Afghanistan', 'capital'),
  P('Tehran', 35.6892, 51.389, 'Iran', 'capital'),
  P('Baghdad', 33.3152, 44.3661, 'Iraq', 'capital'),
  P('Damascus', 33.5138, 36.2765, 'Syria', 'capital'),
  P('Beirut', 33.8938, 35.5018, 'Lebanon', 'capital'),
  P('Amman', 31.9454, 35.9284, 'Jordan', 'capital'),
  P('Jerusalem', 31.7683, 35.2137, 'Israel'),
  P('Tel Aviv', 32.0853, 34.7818, 'Israel'),
  P('Petra', 30.3285, 35.4444, 'Jordan', 'landmark'),
  P('Riyadh', 24.7136, 46.6753, 'Saudi Arabia', 'capital'),
  P('Mecca', 21.3891, 39.8579, 'Saudi Arabia', 'city', ['Makkah']),
  P('Medina', 24.5247, 39.5692, 'Saudi Arabia'),
  P('Jeddah', 21.4858, 39.1925, 'Saudi Arabia'),
  P("Sana'a", 15.3694, 44.191, 'Yemen', 'capital', ['Sanaa']),
  P('Muscat', 23.588, 58.3829, 'Oman', 'capital'),
  P('Abu Dhabi', 24.4539, 54.3773, 'United Arab Emirates', 'capital'),
  P('Dubai', 25.2048, 55.2708, 'United Arab Emirates'),
  P('Doha', 25.2854, 51.531, 'Qatar', 'capital'),
  P('Manama', 26.2285, 50.586, 'Bahrain', 'capital'),
  P('Kuwait City', 29.3759, 47.9774, 'Kuwait', 'capital'),
  P('Tbilisi', 41.7151, 44.8271, 'Georgia', 'capital'),
  P('Yerevan', 40.1792, 44.4991, 'Armenia', 'capital'),
  P('Baku', 40.4093, 49.8671, 'Azerbaijan', 'capital'),
  P('Astana', 51.1694, 71.4491, 'Kazakhstan', 'capital'),
  P('Almaty', 43.222, 76.8512, 'Kazakhstan'),
  P('Tashkent', 41.2995, 69.2401, 'Uzbekistan', 'capital'),
  P('Samarkand', 39.627, 66.975, 'Uzbekistan'),
  P('Bishkek', 42.8746, 74.5698, 'Kyrgyzstan', 'capital'),
  P('Dushanbe', 38.5598, 68.787, 'Tajikistan', 'capital'),
  P('Ashgabat', 37.9601, 58.3261, 'Turkmenistan', 'capital'),
  P('Bangkok', 13.7563, 100.5018, 'Thailand', 'capital'),
  P('Hanoi', 21.0278, 105.8342, 'Vietnam', 'capital'),
  P('Ho Chi Minh City', 10.8231, 106.6297, 'Vietnam', 'city', ['Saigon']),
  P('Vientiane', 17.9757, 102.6331, 'Laos', 'capital'),
  P('Phnom Penh', 11.5564, 104.9282, 'Cambodia', 'capital'),
  P('Angkor Wat', 13.4125, 103.867, 'Cambodia', 'landmark'),
  P('Naypyidaw', 19.7633, 96.0785, 'Myanmar', 'capital', ['Nay Pyi Taw']),
  P('Yangon', 16.8409, 96.1735, 'Myanmar', 'city', ['Rangoon']),
  P('Kuala Lumpur', 3.139, 101.6869, 'Malaysia', 'capital'),
  P('Singapore', 1.3521, 103.8198, 'Singapore', 'capital'),
  P('Jakarta', -6.2088, 106.8456, 'Indonesia', 'capital'),
  P('Manila', 14.5995, 120.9842, 'Philippines', 'capital'),
  P('Bandar Seri Begawan', 4.9031, 114.9398, 'Brunei', 'capital'),
  P('Dili', -8.5569, 125.5603, 'Timor-Leste', 'capital'),
  P('Great Wall of China', 40.3588, 116.0201, 'China', 'landmark', [
    'Great Wall',
  ]),
  // The Americas
  P(
    'Washington, D.C.',
    38.9072,
    -77.0369,
    'United States of America',
    'capital',
    ['Washington DC', 'Washington'],
  ),
  P('New York', 40.7128, -74.006, 'United States of America', 'city', [
    'New York City',
    'NYC',
  ]),
  P('Los Angeles', 34.0522, -118.2437, 'United States of America'),
  P('Chicago', 41.8781, -87.6298, 'United States of America'),
  P('Houston', 29.7604, -95.3698, 'United States of America'),
  P('San Francisco', 37.7749, -122.4194, 'United States of America'),
  P('Seattle', 47.6062, -122.3321, 'United States of America'),
  P('Miami', 25.7617, -80.1918, 'United States of America'),
  P('Boston', 42.3601, -71.0589, 'United States of America'),
  P('Philadelphia', 39.9526, -75.1652, 'United States of America'),
  P('Atlanta', 33.749, -84.388, 'United States of America'),
  P('New Orleans', 29.9511, -90.0715, 'United States of America'),
  P('Memphis', 35.1495, -90.049, 'United States of America'),
  P('Anchorage', 61.2181, -149.9003, 'United States of America'),
  P('Honolulu', 21.3069, -157.8583, 'United States of America'),
  P('Ottawa', 45.4215, -75.6972, 'Canada', 'capital'),
  P('Toronto', 43.6532, -79.3832, 'Canada'),
  P('Montreal', 45.5017, -73.5673, 'Canada'),
  P('Vancouver', 49.2827, -123.1207, 'Canada'),
  P('Quebec City', 46.8139, -71.208, 'Canada'),
  P('Mexico City', 19.4326, -99.1332, 'Mexico', 'capital'),
  P('Guadalajara', 20.6597, -103.3496, 'Mexico'),
  P('Guatemala City', 14.6349, -90.5069, 'Guatemala', 'capital'),
  P('Belmopan', 17.251, -88.759, 'Belize', 'capital'),
  P('San Salvador', 13.6929, -89.2182, 'El Salvador', 'capital'),
  P('Tegucigalpa', 14.0723, -87.1921, 'Honduras', 'capital'),
  P('Managua', 12.115, -86.2362, 'Nicaragua', 'capital'),
  P('San José', 9.9281, -84.0907, 'Costa Rica', 'capital', ['San Jose']),
  P('Panama City', 8.9824, -79.5199, 'Panama', 'capital'),
  P('Panama Canal', 9.08, -79.68, 'Panama', 'landmark'),
  P('Havana', 23.1136, -82.3666, 'Cuba', 'capital'),
  P('Kingston', 17.9714, -76.7936, 'Jamaica', 'capital'),
  P('Port-au-Prince', 18.5944, -72.3074, 'Haiti', 'capital'),
  P('Santo Domingo', 18.4861, -69.9312, 'Dominican Rep.', 'capital'),
  P('San Juan', 18.4655, -66.1057, 'Puerto Rico'),
  P('Nassau', 25.0443, -77.3504, 'Bahamas', 'capital'),
  P('Port of Spain', 10.6603, -61.5086, 'Trinidad and Tobago', 'capital'),
  P('Bogotá', 4.711, -74.0721, 'Colombia', 'capital', ['Bogota']),
  P('Caracas', 10.4806, -66.9036, 'Venezuela', 'capital'),
  P('Quito', -0.1807, -78.4678, 'Ecuador', 'capital'),
  P('Lima', -12.0464, -77.0428, 'Peru', 'capital'),
  P('Cusco', -13.532, -71.9675, 'Peru', 'city', ['Cuzco']),
  P('Machu Picchu', -13.1631, -72.545, 'Peru', 'landmark'),
  P('La Paz', -16.4897, -68.1193, 'Bolivia', 'capital'),
  P('Sucre', -19.0196, -65.2619, 'Bolivia', 'capital'),
  P('Santiago', -33.4489, -70.6693, 'Chile', 'capital'),
  P('Buenos Aires', -34.6037, -58.3816, 'Argentina', 'capital'),
  P('Montevideo', -34.9011, -56.1645, 'Uruguay', 'capital'),
  P('Asunción', -25.2637, -57.5759, 'Paraguay', 'capital', ['Asuncion']),
  P('Brasília', -15.7975, -47.8919, 'Brazil', 'capital', ['Brasilia']),
  P('São Paulo', -23.5505, -46.6333, 'Brazil', 'city', ['Sao Paulo']),
  P('Rio de Janeiro', -22.9068, -43.1729, 'Brazil', 'city', ['Rio']),
  P('Manaus', -3.119, -60.0217, 'Brazil'),
  P('Georgetown', 6.8013, -58.1551, 'Guyana', 'capital'),
  P('Paramaribo', 5.852, -55.2038, 'Suriname', 'capital'),
  // Oceania
  P('Canberra', -35.2809, 149.13, 'Australia', 'capital'),
  P('Sydney', -33.8688, 151.2093, 'Australia'),
  P('Melbourne', -37.8136, 144.9631, 'Australia'),
  P('Brisbane', -27.4698, 153.0251, 'Australia'),
  P('Perth', -31.9505, 115.8605, 'Australia'),
  P('Adelaide', -34.9285, 138.6007, 'Australia'),
  P('Darwin', -12.4634, 130.8456, 'Australia'),
  P('Alice Springs', -23.698, 133.8807, 'Australia'),
  P('Uluru', -25.3444, 131.0369, 'Australia', 'landmark', ['Ayers Rock']),
  P('Wellington', -41.2865, 174.7762, 'New Zealand', 'capital'),
  P('Auckland', -36.8485, 174.7633, 'New Zealand'),
  P('Christchurch', -43.5321, 172.6362, 'New Zealand'),
  P('Port Moresby', -9.4438, 147.1803, 'Papua New Guinea', 'capital'),
  P('Suva', -18.1416, 178.4419, 'Fiji', 'capital'),
  P('Honiara', -9.4456, 159.9729, 'Solomon Is.', 'capital'),
  P('Port Vila', -17.7333, 168.3273, 'Vanuatu', 'capital'),
  P('Nouméa', -22.2758, 166.458, 'New Caledonia', 'city', ['Noumea']),
  P('Apia', -13.8507, -171.7514, 'Samoa', 'capital'),
  // Mountains
  P('Mount Everest', 27.9881, 86.925, 'Nepal', 'mountain', ['Everest']),
  P('K2', 35.8825, 76.5133, 'Pakistan', 'mountain'),
  P('Mount Kilimanjaro', -3.0674, 37.3556, 'Tanzania', 'mountain', [
    'Kilimanjaro',
  ]),
  P('Mount Kenya', -0.1521, 37.3084, 'Kenya', 'mountain'),
  P('Mount Fuji', 35.3606, 138.7274, 'Japan', 'mountain', ['Fuji', 'Fujiyama']),
  P('Mont Blanc', 45.8326, 6.8652, 'France', 'mountain'),
  P('Matterhorn', 45.9763, 7.6586, 'Switzerland', 'mountain'),
  P('Mount Etna', 37.751, 14.9934, 'Italy', 'mountain', ['Etna']),
  P('Mount Vesuvius', 40.8214, 14.4262, 'Italy', 'mountain', ['Vesuvius']),
  P('Aconcagua', -32.6532, -70.0109, 'Argentina', 'mountain'),
  P('Denali', 63.0692, -151.007, 'United States of America', 'mountain', [
    'Mount McKinley',
  ]),
  P('Mount Kosciuszko', -36.456, 148.2633, 'Australia', 'mountain'),
  P('Mount Elbrus', 43.3499, 42.4453, 'Russia', 'mountain', ['Elbrus']),
  P('Mount Sinai', 28.5392, 33.9752, 'Egypt', 'mountain'),
  P('Victoria Falls', -17.9243, 25.8572, 'Zambia', 'landmark'),
  // Seas and oceans
  P('Atlantic Ocean', 20, -40, null, 'sea', ['Atlantic']),
  P('Pacific Ocean', 0, -150, null, 'sea', ['Pacific']),
  P('Indian Ocean', -20, 80, null, 'sea'),
  P('Arctic Ocean', 85, 0, null, 'sea', ['Arctic']),
  P('Southern Ocean', -60, 90, null, 'sea'),
  P('Mediterranean Sea', 35, 18, null, 'sea', ['Mediterranean']),
  P('Red Sea', 20, 38.5, null, 'sea'),
  P('Black Sea', 43.3, 34, null, 'sea'),
  P('Caspian Sea', 41.9, 50.7, null, 'sea'),
  P('North Sea', 56, 3, null, 'sea'),
  P('Baltic Sea', 58, 20, null, 'sea'),
  P('Caribbean Sea', 15, -75, null, 'sea'),
  P('Gulf of Mexico', 25, -90, null, 'sea'),
  P('Persian Gulf', 26.5, 52, null, 'sea', ['Arabian Gulf', 'The Gulf']),
  P('Arabian Sea', 15, 65, null, 'sea'),
  P('Bay of Bengal', 15, 88, null, 'sea'),
  P('South China Sea', 12, 113, null, 'sea'),
  P('Gulf of Guinea', 2, 3, null, 'sea'),
  P('Strait of Gibraltar', 35.97, -5.5, null, 'sea'),
  P('Suez Canal', 30.5852, 32.2654, 'Egypt', 'landmark'),
  P('Cape of Good Hope', -34.3568, 18.474, 'South Africa', 'landmark'),
  // Deserts, ranges, forests and plains
  P('Sahara', 23, 12, 'Niger', 'area', ['Sahara Desert']),
  P('Kalahari', -23, 22, 'Botswana', 'area', ['Kalahari Desert']),
  P('Gobi', 42.8, 105, 'Mongolia', 'area', ['Gobi Desert']),
  P('Atacama', -24.5, -69.25, 'Chile', 'area', ['Atacama Desert']),
  P('Amazon rainforest', -3.5, -62, 'Brazil', 'area', [
    'Amazon Rainforest',
    'Amazonia',
  ]),
  P('Congo rainforest', 0, 22, 'Dem. Rep. Congo', 'area', ['Congo Basin']),
  P('Himalayas', 28.6, 83.9, 'Nepal', 'area', ['Himalaya']),
  P('Alps', 46.6, 9.5, 'Switzerland', 'area', ['The Alps']),
  P('Andes', -20, -67.5, 'Bolivia', 'area', ['Andes Mountains']),
  P('Rocky Mountains', 40.3428, -105.6836, 'United States of America', 'area', [
    'Rockies',
  ]),
  P('Great Rift Valley', -1.0, 36.0, 'Kenya', 'area', ['Rift Valley']),
  P('Serengeti', -2.3333, 34.8333, 'Tanzania', 'area'),
  P('Okavango Delta', -19.3, 22.9, 'Botswana', 'area'),
  P('Great Barrier Reef', -18.2871, 147.6992, null, 'area'),
  P('Pyramids of Giza', 29.9792, 31.1342, 'Egypt', 'landmark', [
    'Pyramids',
    'Giza Pyramids',
    'Great Pyramid',
  ]),
  P('Great Zimbabwe', -20.2674, 30.9338, 'Zimbabwe', 'landmark'),
];

/** Other points in each sea, for a map that shows only part of it. */
const SEA_POINTS: Record<string, [number, number][]> = {
  'Atlantic Ocean': [
    [38, -40],
    [-15, -20],
    [52, -25],
    [5, -25],
    [-35, -10],
  ],
  'Pacific Ocean': [
    [20, -130],
    [-20, -120],
    [30, 160],
    [0, 170],
    [-30, -90],
  ],
  'Indian Ocean': [
    [-10, 65],
    [-25, 100],
    [-5, 75],
    [-30, 60],
  ],
  'Arctic Ocean': [
    [80, -170],
    [82, 60],
  ],
  'Southern Ocean': [
    [-60, -60],
    [-60, 160],
  ],
  'Mediterranean Sea': [
    [34, 25],
    [38.5, 6],
    [33.5, 30],
    [40, 5],
  ],
  'Red Sea': [
    [26.5, 35],
    [16, 41],
  ],
  'Baltic Sea': [[55.5, 17]],
  'Caribbean Sea': [
    [14, -68],
    [17, -80],
  ],
  'Persian Gulf': [[28, 50]],
  'Arabian Sea': [[18, 62]],
  'South China Sea': [
    [15, 115],
    [8, 110],
  ],
  'Gulf of Guinea': [[3, -2]],
};

const placeByKey = new Map<string, Place>();
for (const place of PLACES)
  for (const name of [place.name, ...(place.aliases ?? [])]) {
    const key = placeKey(name);
    if (!placeByKey.has(key)) placeByKey.set(key, place);
  }

/**
 * Natural Earth's names for the stretches of the rivers lessons name
 * most, under their usual English name: a river is called by another name
 * in each country it runs through (the Rhine is the Rhein and the Rhin).
 * Any other river Natural Earth names is found by its own name.
 */
const RIVERS: Record<string, readonly string[]> = {
  Nile: [
    'Nile',
    'El Bahr el Abyad',
    'Bahr el Jebel',
    'Albert Nile',
    'Victoria Nile',
    'Rosetta Branch',
    'Damietta Branch',
  ],
  'White Nile': ['El Bahr el Abyad', 'Bahr el Jebel'],
  'Blue Nile': ['El Bahr el Azraq', 'Abay'],
  Amazon: ['Amazonas'],
  Congo: ['Congo', 'Lualaba'],
  Yangtze: ['Yangtze', 'Chang Jiang', 'Jinsha', 'Tongtian', 'Tuotuo'],
  'Yellow River': ['Huang'],
  Mekong: ['Mekong', 'Lancang'],
  Danube: ['Danube', 'Donau'],
  Rhine: ['Rhine', 'Rhein', 'Rhin'],
  Euphrates: ['Euphrates', 'Firat', 'Al Furat'],
  Tigris: ['Tigris', 'Dicle'],
  Dnieper: ['Dnipro', 'Dnepre'],
  Irtysh: ['Irtysh', 'Ertis', 'Ertix'],
  Amur: ['Amur', 'Heilong Jiang'],
  Tagus: ['Tajo', 'Tejo'],
  Irrawaddy: ['Ayeyarwady', 'Irrawaddy Delta'],
  Brahmaputra: ['Brahmaputra', 'Yarlung', 'Dihang'],
  Senegal: ['Sénégal'],
  Tisza: ['Tisza', 'Tisa'],
  Benue: ['Benue', 'Bénoué'],
  'St. Lawrence': ['St. Lawrence'],
  Salween: ['Salween', 'Nu'],
  Jordan: ['Jordan'],
};

/** Rivers Natural Earth names as lessons do, found in a brief by their name alone. */
const FAMOUS_RIVERS = [
  'Zambezi',
  'Volga',
  'Mississippi',
  'Missouri',
  'Ganges',
  'Indus',
  'Orinoco',
  'Limpopo',
  'Thames',
  'Murray',
  'Seine',
  'Loire',
  'Elbe',
  'Vistula',
  'Yukon',
  'Mackenzie',
  'Paraná',
  'Okavango',
] as const;

/** Other names for Natural Earth's lakes. */
const LAKE_ALIASES: Record<string, string> = {
  'lake titicaca': 'Lago Titicaca',
  titicaca: 'Lago Titicaca',
  'lake nyasa': 'Lake Malawi',
  'lake nicaragua': 'Lago de Nicaragua',
  'lake constance': 'Bodensee',
  'lake vanern': 'Vänern',
  'lake toba': 'Danau Toba',
  'lake biwa': 'Biwa Ko',
  'lake mweru': 'Lac Moeru',
  'lake issyk kul': 'Issyk-Kul',
  'aral sea': 'North Aral Sea',
  'tonle sap lake': 'Tonlé Sap',
  'qinghai lake': 'Qinghai Hu',
  'poyang lake': 'Poyang Hu',
};

/** The point a long thing is named at: the middle of its longest line. */
function middleOf(lines: readonly Position[][]): Position {
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  return longest[Math.floor(longest.length / 2)];
}

/** A river by its name: its usual English name, Natural Earth's, "River X" or "X River". */
function riverNamed(said: string): Place | null {
  const plain = said.replace(/^\s*the\s+/i, '');
  const bare = plain
    .replace(/^\s*river\s+/i, '')
    .replace(/\s+river\s*$/i, '')
    .trim();
  // "Niger", "Congo", "Jordan" alone are countries: a river says it is one.
  const saysRiver = bare !== plain.trim();
  if (!saysRiver && countriesNamed(bare).length) return null;
  const all = naturalRivers();
  const key = placeKey(bare);
  const named = Object.keys(RIVERS).find((one) => placeKey(one) === key);
  // Any other river Natural Earth names, when it is said to be one ("the
  // Ottawa River"), or is one lessons name alone: San Juan is a city.
  const famous =
    saysRiver || FAMOUS_RIVERS.some((one) => placeKey(one) === key);
  const stretches = named
    ? RIVERS[named].filter((one) => all[one])
    : famous
      ? Object.keys(all).filter((one) => placeKey(one) === key)
      : [];
  if (!stretches.length) return null;
  const [lon, lat] = middleOf(stretches.flatMap((one) => all[one]));
  return {
    name: named ?? stretches[0],
    lat,
    lon,
    kind: 'river',
    country: null,
    river: stretches,
  };
}

/** A lake by its name, or one of its other names. */
function lakeNamed(said: string): Place | null {
  const key = placeKey(said);
  const asked = LAKE_ALIASES[key] ?? null;
  const found = naturalLakes().find(
    (lake) =>
      lake.name && (asked ? lake.name === asked : placeKey(lake.name) === key),
  );
  if (!found) return null;
  // Named in the middle of its largest piece.
  const ring = found.polygons
    .map((p) => p[0])
    .reduce((a, b) => (b.length > a.length ? b : a));
  const lon = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const lat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  return {
    name: found.name,
    lat,
    lon,
    kind: 'lake',
    country: null,
    lake: found.name,
  };
}

/** world-atlas's country for Natural Earth's places' name for it ("Congo (Kinshasa)"). */
const NATURAL_COUNTRIES: Record<string, string> = {
  'congo (kinshasa)': 'Dem. Rep. Congo',
  'congo (brazzaville)': 'Congo',
  'hong kong s.a.r.': 'Hong Kong',
  'macau s.a.r': 'Macao',
  'the bahamas': 'Bahamas',
  'republic of serbia': 'Serbia',
  'east timor': 'Timor-Leste',
  'west bank': 'Palestine',
};
export function atlasCountryOf(natural: string): string | null {
  return (
    NATURAL_COUNTRIES[natural.toLowerCase()] ??
    countriesNamed(natural)[0] ??
    null
  );
}

/** Natural Earth's place by a name, in a country if one is given: a capital first, else the most people. */
let naturalIndex: Map<string, NaturalPlace[]> | null = null;
/** Natural Earth's places by every name each goes by. */
function naturalByKey(): Map<string, NaturalPlace[]> {
  if (naturalIndex) return naturalIndex;
  naturalIndex = new Map();
  for (const place of naturalPlaces())
    for (const key of new Set([place.name, ...place.others].map(placeKey))) {
      const list = naturalIndex.get(key) ?? [];
      list.push(place);
      naturalIndex.set(key, list);
    }
  return naturalIndex;
}

function naturalNamed(
  names: readonly string[],
  country: string | null,
): NaturalPlace | null {
  const found = [...new Set(names.map(placeKey))]
    .flatMap((key) => naturalByKey().get(key) ?? [])
    .filter((p) => !country || atlasCountryOf(p.country) === country);
  const rank = (p: NaturalPlace) => (p.kind === 1 ? 2 : p.kind === 2 ? 1 : 0);
  return (
    found.sort((a, b) => rank(b) - rank(a) || b.population - a.population)[0] ??
    null
  );
}

/**
 * A place by its name, or one of its other names; null if no data holds
 * it. A river and a lake are Natural Earth's, drawn as themselves; a city
 * at Natural Earth's coordinates, by the name this table gives it where it
 * has one; a mountain, a sea, a desert or a landmark from this table.
 * "Lagos, Nigeria" is Lagos in Nigeria.
 */
export function placeNamed(said: string): Place | null {
  const comma = said.lastIndexOf(',');
  const tail = comma > 0 ? said.slice(comma + 1).trim() : '';
  const country = tail ? (countriesNamed(tail)[0] ?? null) : null;
  const head = country ? said.slice(0, comma).trim() : said.trim();
  if (!head) return null;
  const water = riverNamed(head) ?? lakeNamed(head);
  if (water) return water;
  const listed = placeByKey.get(placeKey(head)) ?? null;
  // "Hyderabad, Pakistan": not the Hyderabad the table lists, in India.
  const ours = listed && country && listed.country !== country ? null : listed;
  if (ours && ours.kind !== 'city' && ours.kind !== 'capital')
    return SEA_POINTS[ours.name]
      ? { ...ours, alts: SEA_POINTS[ours.name] }
      : ours;
  const natural = naturalNamed(
    ours ? [ours.name, ...(ours.aliases ?? [])] : [head],
    country ?? ours?.country ?? null,
  );
  if (natural)
    return {
      name: ours?.name ?? natural.name,
      lat: natural.lat,
      lon: natural.lon,
      kind: ours?.kind ?? (natural.kind === 1 ? 'capital' : 'city'),
      country: ours?.country ?? atlasCountryOf(natural.country),
    };
  return ours;
}

// ── Reading a region ──────────────────────────────────────────────────────

/** A map's region as code reads the writer's words. */
export type ReadRegion =
  | { kind: 'world'; name: string }
  | { kind: 'continent' | 'region'; name: string; entry: RegionEntry }
  | { kind: 'countries'; name: string; countries: string[] };

/**
 * The part of the world a map shows, from the writer's words: "world",
 * a continent ("Africa"), a region ("West Africa"), a country, or a list
 * of them ("Kenya, Uganda and Tanzania"). Null when nothing in it is
 * known; the names not known are given back to be logged.
 */
export function readRegion(said: string): {
  region: ReadRegion | null;
  unknown: string[];
} {
  const whole = said.trim();
  if (!whole) return { region: null, unknown: [] };
  const named = regionNamed(whole);
  if (named?.kind === 'world')
    return { region: { kind: 'world', name: 'World' }, unknown: [] };
  if (named)
    return {
      region: { kind: named.kind, name: named.name, entry: named },
      unknown: [],
    };
  const parts = whole
    .split(/\s*(?:,|;|\/|&|\band\b|\bplus\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const countries: string[] = [];
  const unknown: string[] = [];
  for (const part of parts.length ? parts : [whole]) {
    // "Kenya" or "Africa" in a list: each one's countries.
    const asCountry = countriesNamed(part);
    const asRegion = asCountry.length ? null : regionNamed(part);
    const asPart = asCountry.length || asRegion ? null : countryOfPart(part);
    const found = asCountry.length
      ? asCountry
      : asRegion && asRegion.kind !== 'world'
        ? asRegion.members
        : asPart
          ? [asPart]
          : [];
    if (!found.length) unknown.push(part);
    for (const one of found) if (!countries.includes(one)) countries.push(one);
  }
  // The whole of it as one name, when a list reading found nothing ("Bosnia and Herzegovina").
  if (!countries.length) {
    const asOne = countriesNamed(whole);
    const asPart = countryOfPart(whole);
    if (asOne.length)
      return {
        region: { kind: 'countries', name: whole, countries: [...asOne] },
        unknown: [],
      };
    if (asPart)
      return {
        region: { kind: 'countries', name: whole, countries: [asPart] },
        unknown: [],
      };
    return { region: null, unknown };
  }
  // A list read as parts that is really one name ("Trinidad and Tobago").
  const asOne = countriesNamed(whole);
  if (asOne.length)
    return {
      region: { kind: 'countries', name: whole, countries: [...asOne] },
      unknown: [],
    };
  return { region: { kind: 'countries', name: whole, countries }, unknown };
}

/**
 * The countries a highlight colours: a country, a name for several, or a
 * region ("Sub-Saharan Africa"), never the world. A part of a country
 * (Scotland) colours nothing, since the whole would be untrue.
 */
export function highlightCountries(name: string): readonly string[] {
  const asCountry = countriesNamed(name);
  if (asCountry.length) return asCountry;
  const asRegion = regionNamed(name);
  if (asRegion && asRegion.kind !== 'world') return asRegion.members;
  return [];
}

// ── Areas inside countries ────────────────────────────────────────────────

/**
 * The areas inside countries a name means (Natural Earth's admin-1, read
 * by scene-map-data): one state or province ("Kano", "Bavaria"), or a
 * part of a country made of several ("Scotland", "the Midwest",
 * "Lombardy"). Each by its key, and the countries they are in.
 */
export interface AreasFound {
  countries: string[];
  keys: string[];
}

/** Words that say what kind of area a name is, said with it: "Kano State", "the Province of Quebec". */
const AREA_KIND =
  /\b(?:state|province|region|county|prefecture|oblast|krai|governorate|district|department|territory|emirate|canton|municipality|division|federal|capital|union|autonomous|community|of)\b/g;

/**
 * English names for the larger regions and the parts of countries
 * Natural Earth gives in their own language: an Italian regione, a
 * Spanish comunidad, a French région, a Belgian region, a Japanese one.
 */
const AREA_ALIASES: Record<string, string> = {
  lombardy: 'Lombardia',
  tuscany: 'Toscana',
  piedmont: 'Piemonte',
  sardinia: 'Sardegna',
  'aosta valley': "Valle d'Aosta",
  'south tyrol': 'Trentino-Alto Adige',
  'trentino south tyrol': 'Trentino-Alto Adige',
  friuli: 'Friuli-Venezia Giulia',
  latium: 'Lazio',
  'the marches': 'Marche',
  marches: 'Marche',
  catalonia: 'Cataluña',
  andalusia: 'Andalucía',
  'basque country': 'País Vasco',
  'castile and leon': 'Castilla y León',
  'castile la mancha': 'Castilla-La Mancha',
  'valencian community': 'Valenciana',
  'balearic islands': 'Islas Baleares',
  'canary islands': 'Canary Is.',
  navarre: 'Foral de Navarra',
  aragon: 'Aragón',
  brittany: 'Bretagne',
  normandy: 'Normandie',
  corsica: 'Corse',
  burgundy: 'Bourgogne-Franche-Comté',
  provence: "Provence-Alpes-Côte-d'Azur",
  occitania: 'Occitanie',
  'new aquitaine': 'Nouvelle-Aquitaine',
  'paris region': 'Île-de-France',
  flanders: 'Flemish Region',
  wallonia: 'Walloon Region',
  brussels: 'Brussels Capital Region',
  kansai: 'Kinki',
  siberia: 'Siberian',
  'russian far east': 'Far Eastern',
};

interface AreaIndex {
  byName: Map<string, number[]>;
  byOther: Map<string, number[]>;
  byPart: Map<string, number[]>;
  byRegion: Map<string, number[]>;
}

let areaIndex: AreaIndex | null = null;
/** Every area by each name it goes by, its part's and its larger region's. */
function areasByKey(): AreaIndex {
  if (areaIndex) return areaIndex;
  const index: AreaIndex = {
    byName: new Map(),
    byOther: new Map(),
    byPart: new Map(),
    byRegion: new Map(),
  };
  // Each name as it is, and without the word for its kind: "Nasarawa
  // State" is found as Nasarawa too.
  const add = (map: Map<string, number[]>, name: string | null, i: number) => {
    const key = name ? placeKey(name) : '';
    if (!key) return;
    const bare = key.replace(AREA_KIND, ' ').replace(/\s+/g, ' ').trim();
    for (const one of bare && bare !== key ? [key, bare] : [key]) {
      const list = map.get(one) ?? [];
      if (!list.includes(i)) list.push(i);
      map.set(one, list);
    }
  };
  naturalAreas().areas.forEach((area, i) => {
    add(index.byName, area.name, i);
    for (const other of area.others) add(index.byOther, other, i);
    add(index.byPart, area.part, i);
    add(index.byRegion, area.region, i);
  });
  areaIndex = index;
  return index;
}

/**
 * The areas a name means, inside the countries given (all of them when
 * none are): an area by its name, then by another of its names, then
 * with the word for its kind left off ("Kano State"), then a part of a
 * country ("Scotland") or a larger region ("the Midwest", "Lombardy").
 * With no countries given, a name only one country's areas have: "the
 * South" is many countries' own. Null when it is none of them, never
 * guessed.
 */
export function areasNamed(
  said: string,
  within: readonly string[] = [],
): AreasFound | null {
  const { areas } = naturalAreas();
  const index = areasByKey();
  const inside = new Set(within);
  const keep = (list: number[] | undefined) =>
    (list ?? []).filter((i) => !inside.size || inside.has(areas[i].country));
  // With no countries in view, a name in more than one country's areas
  // ("South" is Lebanon's, Cameroon's and New Caledonia's) is no one's.
  const found = (list: number[]): AreasFound | null => {
    const countries = [...new Set(list.map((i) => areas[i].country))];
    return list.length && (inside.size || countries.length === 1)
      ? { countries, keys: list.map((i) => areas[i].key) }
      : null;
  };
  const key = placeKey(said);
  if (!key) return null;
  const bare = key.replace(AREA_KIND, ' ').replace(/\s+/g, ' ').trim();
  for (const one of bare && bare !== key ? [key, bare] : [key]) {
    const named = keep(index.byName.get(one));
    if (named.length) return found(named);
    const other = keep(index.byOther.get(one));
    if (other.length) return found(other);
  }
  const alias = AREA_ALIASES[key] ? placeKey(AREA_ALIASES[key]) : key;
  const part = keep(index.byPart.get(alias));
  if (part.length) return found(part);
  return found(keep(index.byRegion.get(alias)));
}

/** The areas a country is made of, by their keys. */
export function areasOf(country: string): string[] {
  const { areas, byCountry } = naturalAreas();
  return (byCountry.get(country) ?? []).map((i) => areas[i].key);
}

/** The countries areas are in, from their keys. */
export function countriesOfAreas(keys: readonly string[]): string[] {
  if (!keys.length) return [];
  const { areas, byKey } = naturalAreas();
  return [
    ...new Set(
      keys.flatMap((key) => {
        const i = byKey.get(key);
        return i === undefined ? [] : [areas[i].country];
      }),
    ),
  ];
}

// ── A real place's map, asked of the artist ───────────────────────────────

/** Every name a real place goes by, longest first, for finding them in words. */
let everyName:
  { key: string; kind: 'region' | 'country' | 'place' | 'part' }[] | null =
  null;
function namesToFind() {
  if (everyName) return everyName;
  const out = new Map<string, 'region' | 'country' | 'place' | 'part'>();
  for (const key of regionByKey.keys()) out.set(key, 'region');
  for (const key of countryByKey.keys())
    if (!out.has(key)) out.set(key, 'country');
  for (const key of Object.keys(PART_OF_COUNTRY))
    if (!out.has(key)) out.set(key, 'part');
  for (const key of placeByKey.keys()) if (!out.has(key)) out.set(key, 'place');
  // Rivers and lakes: by their usual names, and a river as "X river" or "river X".
  for (const lake of naturalLakes())
    if (lake.name && !out.has(placeKey(lake.name)))
      out.set(placeKey(lake.name), 'place');
  for (const river of [...Object.keys(RIVERS), ...FAMOUS_RIVERS]) {
    const key = placeKey(river);
    for (const said of [`${key} river`, `river ${key}`])
      if (!out.has(said)) out.set(said, 'place');
    if (!out.has(key) && !countriesNamed(river).length) out.set(key, 'place');
  }
  // Words too common in briefs to mean a place by themselves; the world is read on its own.
  for (const common of [
    'us',
    'car',
    'rio',
    'globe',
    'earth',
    'world',
    'whole world',
    'world map',
  ])
    out.delete(common);
  everyName = [...out]
    .map(([key, kind]) => ({ key, kind }))
    .sort((a, b) => b.key.length - a.key.length);
  return everyName;
}

/** The real places words name, in the order they come: regions, countries, parts of countries and places. */
export function placesIn(text: string): {
  name: string;
  kind: 'region' | 'country' | 'place' | 'part';
}[] {
  let said = ` ${placeKey(text)} `;
  const found: {
    at: number;
    name: string;
    kind: 'region' | 'country' | 'place' | 'part';
  }[] = [];
  for (const { key, kind } of namesToFind()) {
    const at = said.indexOf(` ${key} `);
    if (at < 0) continue;
    found.push({ at, name: key, kind });
    // Taken out, so "south africa" is not read again as "africa".
    said = `${said.slice(0, at)} ${'#'.repeat(key.length)} ${said.slice(at + key.length + 2)}`;
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map(({ name, kind }) => ({ name, kind }));
}

/** Words that say a map is of no real place, or is no map of land at all. */
const NOT_A_REAL_MAP =
  /\b(?:treasure|pirate|fantasy|fictional|imaginary|imagined|made[- ]up|invented|story ?book|mind[- ]?maps?|concept[- ]?maps?|heat[- ]?maps?|road[- ]?maps?|site[- ]?maps?|karnaugh|k[- ]map|star (?:map|chart)|floor ?plan|maps? of (?:the |a |an )?(?:brain|body|cell|genome|skin|heart|eye|tongue|sky|stars|moon|mars|ideas?))\b/i;

/** A map by name: a map, an atlas, a world map. */
const MAP_WORD = /\b(?:maps?|atlas|world map)\b/i;
/**
 * A map by what it shows, without the word: where something is found,
 * countries coloured, a place's outline ("Where malaria is found",
 * "Africa with the affected countries shaded", "the outline of Italy").
 */
const MAP_BY_WHAT = [
  /^\s*where\b/i,
  /\b(?:showing|shows|show|marking|marks|marked|highlighting|shading|shaded|colouring|coloring) where\b/i,
  /\bcountries\b[^.;]*\b(?:shaded|coloured|colored|highlighted|filled in)\b/i,
  /\b(?:shaded|coloured|colored|highlighted)\b[^.;]*\bcountries\b/i,
  /\b(?:outline|borders?|coastline) of\b/i,
];

/**
 * Whether a drawing the writer asked for is a map of a real place: its
 * caption or brief says it is a map and names a real place, or shows
 * where something is (the countries coloured, a country's outline) and
 * names a country or a part of the world. A made-up place's map (a
 * treasure map, a story's land) is not: the artist draws that.
 */
export function realMapIn(name: string, brief: string): boolean {
  const text = `${name}. ${brief}`;
  if (NOT_A_REAL_MAP.test(text)) return false;
  if (/\b(?:world map|map of the world)\b/i.test(text)) return true;
  const named = placesIn(text);
  if (MAP_WORD.test(text)) return named.length > 0;
  return (
    MAP_BY_WHAT.some((words) => words.test(name) || words.test(brief)) &&
    named.some((one) => one.kind !== 'place')
  );
}

/**
 * A real place's map the writer asked the artist for, read by code into
 * what the map kind takes: its region (the first continent or region it
 * names, else its countries), the countries it names to colour, and its
 * places. Null when it names no region to show.
 */
export function mapFromWords(
  name: string,
  brief: string,
): { region: string; highlight: string[]; places: string[] } | null {
  const text = `${name}. ${brief}`;
  const named = placesIn(text);
  const world =
    /\b(?:world map|map of the world|globe|the world|whole world)\b/i.test(
      text,
    );
  const region = named.find((one) => one.kind === 'region');
  // Each as the map writes it: "West Africa", "Côte d'Ivoire", "Lagos".
  const countries = named
    .filter((one) => one.kind === 'country')
    .map((one) => countriesNamed(one.name)[0]);
  const parts = named
    .filter((one) => one.kind === 'part')
    .map((one) => one.name);
  const places = named
    .filter((one) => one.kind === 'place')
    .flatMap((one) => placeNamed(one.name)?.name ?? []);
  const shown = world
    ? 'world'
    : region
      ? (regionNamed(region.name)?.name ?? region.name)
      : countries.length
        ? countries.join(', ')
        : parts[0];
  if (!shown && !places.length) return null;
  return {
    region: shown ?? '',
    // The countries named on a map of more than them are what it colours.
    highlight: world || region ? countries : [],
    places,
  };
}

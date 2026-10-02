/**
 * A picture's words (research §3.4's one source-chip slot and its TASL
 * credits): the chip on screen, "<subject>, <year> · <source> · <licence>",
 * short enough to read in the 2.5–3 s it shows; and the full credit for
 * the description (title, author, source, licence), the file page's own
 * credit line word for word where it names one, since that credit is owed
 * (Philpot v. IJR). Also the year a file was made, which the chip shows and
 * the era check reads. Pure.
 */
import { plainText } from './licence';
import type { LicenceVerdict, SourceFile } from './types';

type Allowed = Extract<LicenceVerdict, { ok: true }>;

/** The institutions a credit may name, by what they are called in a chip. */
const INSTITUTIONS: readonly [RegExp, string][] = [
  [
    /john f\.? kennedy (?:presidential )?library|jfklibrary\.org|\bJFK Library\b/iu,
    'JFK Library',
  ],
  [/library of congress|\bloc\.gov\b/iu, 'Library of Congress'],
  [
    /(?:US|U\.S\.|United States) National Archives|national archives and records administration|\bNARA\b|archives\.gov/iu,
    'US National Archives',
  ],
  [/(?:US|U\.S\.|United States) Information Agency|\bUSIA\b/u, 'USIA'],
  [/department of energy|\bDOE\b|^PD US DOE$/iu, 'US Department of Energy'],
  [/national museum of african art/iu, 'Smithsonian NMAfA'],
  [/smithsonian/iu, 'Smithsonian'],
  [/metropolitan museum of art|metmuseum\.org/iu, 'The Met'],
  [/\bNASA\b|PD-USGov-NASA/u, 'NASA'],
  [/nationaal archief|\banefo\b/iu, 'Nationaal Archief'],
  [/rijksmuseum/iu, 'Rijksmuseum'],
  [/wellcome (?:collection|library|images)/iu, 'Wellcome Collection'],
  [/voice of america|\bVOA\b/u, 'VOA'],
  [/\bDVIDS\b/u, 'DVIDS'],
  [/new york public library|\bNYPL\b|digitalcollections\.nypl/iu, 'NYPL'],
  [
    /northwestern university|library\.northwestern\.edu/iu,
    'Northwestern University',
  ],
  [/\bU\.?\s?S\.? army\b|^PD US Army$/iu, 'US Army'],
  [/\bU\.?\s?S\.? navy\b|^PD US Navy$/iu, 'US Navy'],
  [/\bU\.?\s?S\.? air force\b|^PD US Air ?Force$/iu, 'US Air Force'],
  [/white house photograph/iu, 'White House'],
  [/europeana/iu, 'Europeana'],
  [/internet archive|archive\.org/iu, 'Internet Archive'],
];

/** The words a chip's subject and source are cut to. */
const SUBJECT_MOST = 40;
const SOURCE_MOST = 40;

/** Words cut to a length at a word's end, with nothing dangling. */
export function clipWords(text: string, most: number): string {
  const said = text.replace(/\s+/gu, ' ').trim();
  if (said.length <= most) return said;
  const cut = said.slice(0, most + 1);
  const at = cut.lastIndexOf(' ');
  return (at > most * 0.5 ? cut.slice(0, at) : said.slice(0, most))
    .replace(/[\s,;:·.-]+$/u, '')
    .trim();
}

/** The small words of a name ("Maarten van Dis", "Ibn Battuta"). */
const PARTICLES =
  /^(?:van|von|de|da|das|do|dos|der|den|del|della|di|du|la|le|bin|ibn|al|el|y)$/u;

/** Words that name a body, not a person. */
const BODY =
  /\b(?:agency|department|library|museum|archives?|office|ministry|government|service|corporation|company|ltd|inc|institute|university|collection|foundation|society|council|bureau|commission|news|press|studio)\b/iu;

/** Whether words read as a person's name: two to five words, capitalised but for a name's small words, no address, body or "unknown". */
function nameLike(words: string): boolean {
  const said = words.trim();
  if (
    !said ||
    /https?:|www\.|\.(?:com|org|gov)|unknown|anonymous|\(talk\)|@/iu.test(
      said,
    ) ||
    BODY.test(said)
  )
    return false;
  const parts = said.split(/\s+/u);
  return (
    parts.length >= 2 &&
    parts.length <= 5 &&
    /^[\p{Lu}]/u.test(parts[0]) &&
    /^[\p{Lu}]/u.test(parts[parts.length - 1]) &&
    parts.every((p) => /^[\p{Lu}][\p{L}.'’-]*$/u.test(p) || PARTICLES.test(p))
  );
}

/** The archive or agency a file's credit, description or categories name, shortly; null for a crowd upload. */
export function institutionOf(
  file: Pick<SourceFile, 'artist' | 'credit' | 'description' | 'categories'>,
): string | null {
  const said = `${plainText(file.artist)} ${plainText(file.credit)} ${plainText(file.description)}`;
  return (
    INSTITUTIONS.find(([test]) => test.test(said))?.[1] ??
    INSTITUTIONS.find(([test]) =>
      file.categories.some((c) => test.test(c)),
    )?.[1] ??
    null
  );
}

/**
 * The chip's middle: who holds or made the picture, shortly. The archive
 * when the credit names one (with the photographer before it when the
 * artist reads as a name and both fit); else the photographer; else what
 * the source is.
 */
export function sourceOf(
  file: Pick<
    SourceFile,
    'source' | 'artist' | 'credit' | 'description' | 'categories'
  >,
): string {
  const artist = plainText(file.artist);
  const credit = plainText(file.credit);
  const said = `${artist} ${credit} ${plainText(file.description)}`;
  const archive =
    INSTITUTIONS.find(([test]) => test.test(said))?.[1] ??
    INSTITUTIONS.find(([test]) =>
      file.categories.some((c) => test.test(c)),
    )?.[1];
  // The photographer: the artist's first sentence or clause ("Abbie Rowe.
  // White House…"), or a catalogue's "Surname, Initials" turned round.
  const turned =
    /^([\p{Lu}][\p{L}'’-]+),\s*((?:[\p{Lu}]\.?\s?){1,3}|[\p{Lu}][\p{L}'’-]+)\s*$/u.exec(
      artist,
    );
  // A full stop after an initial ("Philo T. Farnsworth") does not end it.
  const first = turned
    ? `${turned[2].trim()} ${turned[1]}`
    : (artist.split(/(?<!\b\p{Lu})\.|[,;(]/u)[0]?.trim() ?? '');
  const person = nameLike(first) ? first : '';
  if (archive && person && `${person}, ${archive}`.length <= SOURCE_MOST)
    return `${person}, ${archive}`;
  if (archive) return archive;
  if (person) return clipWords(person, SOURCE_MOST);
  if (file.source === 'nasa') return 'NASA';
  if (file.source === 'met') return 'The Met';
  return 'Wikimedia Commons';
}

/** The words on screen: "<subject>, <year> · <source> · <licence>". */
export function chipOf(input: {
  subject: string;
  year?: number;
  source: string;
  licence: Allowed;
}): string {
  const subject = clipWords(input.subject, SUBJECT_MOST);
  const head = input.year ? `${subject}, ${input.year}` : subject;
  return [head, clipWords(input.source, SOURCE_MOST), input.licence.short]
    .filter(Boolean)
    .join(' · ');
}

/** The source's name in the credit line. */
const SOURCE_NAMES: Readonly<Record<SourceFile['source'], string>> = {
  commons: 'Wikimedia Commons',
  nasa: 'NASA Image and Video Library',
  met: 'The Metropolitan Museum of Art',
};

/**
 * The full credit for the description (TASL: title, author, source,
 * licence), the file's own credit line used word for word when its page
 * names one; a CC BY picture also says it was cropped (research §3.4's
 * tier B: "modified: cropped").
 */
export function creditOf(
  file: SourceFile,
  licence: Allowed,
  source: string,
): string {
  const title = clipWords(plainText(file.title), 140);
  const artist = plainText(file.artist);
  // An account's handle ("doe-oakridge") is no author: the archive it is of is named instead.
  const handle = /^[\p{Ll}\d][\p{Ll}\d._-]*$/u.test(artist);
  const author =
    artist && !/^unknown/iu.test(artist) && !handle
      ? clipWords(artist, 120)
      : source;
  const own = file.attribution ? plainText(file.attribution) : '';
  const licenceWords = licence.url
    ? `${licence.short || 'Licence'} (${licence.url})`
    : licence.short;
  const by = own || `${author}`;
  const parts = [
    `“${title}” by ${by}`,
    `via ${SOURCE_NAMES[file.source]} (${file.pageUrl})`,
    // A file whose source names no licence is credited without one.
    ...(licenceWords ? [licenceWords] : []),
  ];
  if (licence.attribution) parts.push('cropped');
  return `${parts.join(', ')}.`;
}

/**
 * The year a file was made, as well as the desk can tell: a single year
 * its title gives (curators put it there), else its date unless that is
 * only when it went online (a scan's date, not the photograph's), else the
 * first year its description gives. Undefined when none can be trusted.
 */
export function yearOf(
  file: Pick<SourceFile, 'title' | 'date' | 'description' | 'uploaded'> &
    Partial<Pick<SourceFile, 'artist' | 'credit' | 'categories'>>,
): number | undefined {
  const years = (text: string) =>
    [
      ...plainText(text).matchAll(/(?<![\d-])(1[5-9]\d\d|20[0-4]\d)(?![\d])/gu),
    ].map((m) => Number(m[1]));
  const inTitle = [...new Set(years(file.title))];
  if (inTitle.length === 1) return inTitle[0];
  const uploaded = file.uploaded
    ? Number(file.uploaded.slice(0, 4))
    : undefined;
  const dated = years(file.date)[0];
  const described = years(file.description)[0];
  if (dated !== undefined) {
    // A date in the year it went online is the scan's, when the description says an earlier one.
    const scan =
      uploaded !== undefined &&
      dated >= uploaded - 1 &&
      described !== undefined &&
      described < dated - 1;
    // An archive's photograph dated the year it went online is dated by
    // its scan (a Navy print put on Flickr in 2015 is no photo of 2015).
    const archived =
      dated >= 2004 &&
      uploaded !== undefined &&
      Math.abs(dated - uploaded) <= 1 &&
      file.categories !== undefined &&
      institutionOf({
        artist: file.artist ?? '',
        credit: file.credit ?? '',
        description: file.description,
        categories: file.categories,
      }) !== null;
    if (!scan && !archived) return dated;
  }
  if (described !== undefined) return described;
  return inTitle.length ? Math.min(...inTitle) : undefined;
}

/** A person's years, "1910–1966", or what is known of them. */
export function lifeOf(born?: number, died?: number): string | undefined {
  if (born && died) return `${born}–${died}`;
  if (born) return `born ${born}`;
  if (died) return `died ${died}`;
  return undefined;
}

/** Who a person was, in three words at most (research §3.5: "role ≤3 words"), cut where the role turns ("and", "who", a comma). */
export function roleWords(
  role: string | undefined,
  most = 3,
): string | undefined {
  const said = plainText(role ?? '')
    .split(
      /[,;:(—–]|\s(?:and|who|whose|which|that|from|during|in the|for the)\s/iu,
    )[0]
    ?.trim();
  if (!said) return undefined;
  const words = said.split(/\s+/u).filter(Boolean);
  // Never end on a small word: "leader of" is cut back to "leader".
  let cut = words.slice(0, most);
  while (
    cut.length > 1 &&
    /^(?:of|the|a|an|to|for|and|in|on|at|by)$/iu.test(cut[cut.length - 1])
  )
    cut = cut.slice(0, -1);
  const out = cut.join(' ');
  return out ? out[0].toUpperCase() + out.slice(1) : undefined;
}

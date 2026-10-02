/**
 * Whether the desk may use a picture (research §3.4's licence tiers and
 * provenance screen; plan decision 8): public domain with a reason it is
 * so in the US, CC0, or CC BY, and nothing else. Anything unclear is
 * refused; so is any file whose credit or description shows it came from a
 * news agency, a magazine's archive, a screen or a broadcast, whatever
 * licence its uploader gave it, because a licence is only as good as the
 * right of whoever gave it. An agency photo passed off as free is worse
 * than no picture (Philpot v. IJR: the credit a file asks for is owed).
 *
 * The screen is behind a switch (PICTURE_LICENCE; Richard, 2026-10-02:
 * "for now ignore license checks, let's just use the images", agency and
 * magazine photos too). Off, the default, any file its sources hold may
 * be used, under the licence its source names, with the credit and chip
 * as ever; what the screen would have said is kept as a note, so the
 * pictures in use can be read again when the licences are. Two refusals
 * are no licence's and stand either way: a picture a machine made is no
 * picture of the thing (the truth rule), and a watermark is on screen.
 *
 * Pure: it reads what the source said of the file (plain text, as the
 * adapters hand it over) and answers yes with the licence's words, or no
 * with the reason in plain words for the cache and the logs.
 */
import type { LicenceCode, LicenceVerdict, SourceFile } from './types';

/** What the screen reads of a file. */
export type LicenceInput = Pick<
  SourceFile,
  | 'source'
  | 'licenceName'
  | 'licenceCode'
  | 'licenceUrl'
  | 'artist'
  | 'credit'
  | 'description'
  | 'title'
  | 'categories'
  | 'restrictions'
  | 'structured'
> & {
  /** When the picture was made, when the desk can tell: an "own work" older than 1970 is no one's own. */
  year?: number;
};

// ── The provenance screen ──────────────────────────────────────────────────

/**
 * Credits and descriptions that show a file is an agency's, a magazine
 * archive's, or a frame of a screen or a broadcast (research §3.4). Each
 * names what it found. Words that are also common nouns (a drum, a magnum)
 * count only where a credit names them, or in the archive's full name.
 */
const RED_FLAGS: readonly {
  what: string;
  credit?: RegExp;
  anywhere?: RegExp;
}[] = [
  {
    what: 'the Associated Press',
    // "AP" in capitals as a credit; in a description only with its trade.
    credit: /\bAP\b/u,
    anywhere:
      /\bAP (?:Archive|Photo|Images|photographer|Newsfeatures)\b|associated press/iu,
  },
  { what: 'Reuters', anywhere: /\breuters\b/iu },
  {
    what: 'Getty Images',
    // The agency, not the J. Paul Getty Museum's open content.
    anywhere:
      /\bgetty\b(?!\s+(?:museum|center|centre|research|villa|trust|foundation|open content))/iu,
  },
  { what: 'AFP', credit: /\bAFP\b/u, anywhere: /agence france[- ]presse/iu },
  {
    what: 'Drum magazine',
    credit: /\bdrum\b/iu,
    anywhere:
      /\bdrum (?:magazine|publications)\b|\bBAHA\b|bailey'?s african history archive/iu,
  },
  {
    what: 'Magnum Photos',
    credit: /\bmagnum\b/iu,
    anywhere: /magnum photos/iu,
  },
  {
    what: 'a screenshot',
    anywhere:
      /screen ?shot|screen[- ]?grab|screen ?capture|frame ?grab|video still|still (?:image )?from (?:a |the )?(?:video|film|broadcast|footage|television)/iu,
  },
  { what: 'YouTube', anywhere: /youtube|youtu\.be/iu },
];

/** "Own work", as Commons writes an uploader's claim to have made it. */
const OWN_WORK = /\bown work\b|\bself-published work\b|\bself[- ]made\b/iu;

/** A frame of a broadcast or a film, whatever its uploader calls it. */
const BROADCAST =
  /\b(?:broadcast|television|telecast|newsreel|news footage|archive footage|tv (?:news|footage|interview))\b/iu;

/** An author nobody knows: no one who could have given it a licence. */
const UNKNOWN_AUTHOR = /^\s*$|unknown|anonymous|not known|unidentified|n\/a/iu;

/** Commons' templates that say a file's licence is in doubt or it is about to go. */
const IN_DOUBT =
  /deletion request|copyright violation|candidates for (?:speedy )?deletion|license review needed|licen[cs]e review|no machine-readable licen[cs]e|unknown copyright|missing permission|without (?:a )?licen[cs]e|without (?:a )?source|possibly unfree|disputed copyright|problematic|unfree|fair use|non-free|copyvio/iu;

/** A watermark on it, which nothing may crop away. */
const WATERMARK = /watermark/iu;

/** A picture a machine made: never a real image (the truth rule). */
const MADE_BY_AI =
  /\bAI[- ]generated\b|generated (?:by|with|using) (?:AI|artificial intelligence)|\bmidjourney\b|\bdall[- ·]?e\b|stable diffusion|\bai[- ]generated images\b/iu;

/** Public domain in the United States, for a reason Commons states. */
const US_REASON =
  /^PD[ -]US\b|^PD[ -]US[ -]|^PD[ -]USGov|^PD US |^PD[ -](?:1923|1929|1996)\b|^PD[ -](?:old[ -](?:auto|70|80|90|100)[ -])?expired\b|^PD[ -]old[ -]auto[ -]1996|^PD[ -]old[ -]auto[ -]expired|^Public domain in the United States|^PD[ -]US[ -]no notice|^PD[ -]US[ -]not renewed/iu;

/**
 * Commons' bare "PD-US" tag: public domain in the US because it was
 * published before 1930. On a later work it gives no reason at all, so
 * it counts only for a work made by then.
 */
const BARE_US = /^PD[ -]US$/iu;

/** Commons' upkeep categories that name a tag without being one ("PD-US missing SDC copyright status"). */
const UPKEEP = /missing|\bSDC\b|needing|needs|review|check|unclear|unknown/iu;

/** A work of the US government (no copyright at all). */
const US_GOVERNMENT =
  /^PD[ -]USGov|^PD[ -]US[ -](?:Gov|Government)\b|^PD US (?:Government|DOE|Army|Navy|Air ?Force|Military|Marines?|Marine Corps|NASA|NOAA|NPS|Coast ?Guard|Congress|State Department|FWS|USGS|USDA|FBI|CIA|EPA|DOD|DoD|White House|President|Census|Federal)\b|^PD[ -]US[ -](?:DOE|Army|Navy|Air ?Force|Military|Marines?|NASA|NOAA|NPS|Congress|FWS|USGS|USDA|White House|President)\b/iu;

/** Public domain because its author died long ago. */
const PD_OLD = /^PD[ -]old\b/iu;

/** A faithful reproduction of a public-domain artwork. */
const PD_ART = /^PD[ -]art\b/iu;

/** Too simple to be anyone's (a plain shape, a logo of words): public domain everywhere. */
const INELIGIBLE =
  /^PD[ -](?:ineligible|textlogo|shape|simple|signature|chem|math)\b/iu;

/** Given to the public domain by its own author. */
const SELF_RELEASED = /^PD[ -](?:self|author|user)\b/iu;

/**
 * A public-domain tag that names a country: public domain there, which is
 * not the same as here (research §3.4: a PD-country tag with no US reason
 * is refused). Every PD tag not named above is read as one.
 */
const PD_COUNTRY =
  /^PD[ -](?!US\b|USGov|US[ -]|old\b|art\b|self\b|author\b|user\b|ineligible|textlogo|shape|simple|signature|chem|math|scan\b|because\b|text\b|1923|1929|1996|expired|mark\b|release)[A-Za-z]/u;

/** Explicitly under copyright in the US: whatever its country says. */
const US_COPYRIGHTED = /works copyrighted in the u\.?s\.?/iu;

/** Restrictions that are noted, not refused (a public figure's likeness, a badge on a uniform). */
const NOTED_RESTRICTIONS = /personality|trademark|insignia/iu;

/** The year US copyright has run out for anything published by (95 years, as of 2026). */
const US_EXPIRED_BY = 1930;

/** The year before which an uploader's "own work" is no one's own (research §3.4). */
const OWN_WORK_BEFORE = 1970;

// ── Structured data (Commons' P6216 copyright status and P275 licence) ────

const STATUS_PD = 'Q19652';
const STATUS_COPYRIGHTED = 'Q50423863';
const STATUS_DEDICATED = 'Q88088423';
const LICENCE_QIDS: Readonly<Record<string, string>> = {
  Q6938433: 'CC0',
  Q20007257: 'CC BY 4.0',
  Q14947546: 'CC BY 3.0',
  Q18810333: 'CC BY 2.5',
  Q19125117: 'CC BY 2.0',
  Q30942811: 'CC BY 1.0',
  Q7257361: 'PDM',
  Q18199165: 'CC BY-SA 4.0',
  Q14946043: 'CC BY-SA 3.0',
  Q19113751: 'CC BY-SA 2.5',
  Q19068220: 'CC BY-SA 2.0',
  Q50829104: 'GFDL',
};

// ── The licence ───────────────────────────────────────────────────────────

const CC_URLS: Readonly<Record<string, string>> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC BY 2.5': 'https://creativecommons.org/licenses/by/2.5/',
  'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC BY 1.0': 'https://creativecommons.org/licenses/by/1.0/',
};

const refuse = (reason: string): LicenceVerdict => ({ ok: false, reason });

/** Text with its HTML taken out and its spaces made single: what a source's metadata says, as words. */
export function plainText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** The red flag a file's words raise, or null. */
export function redFlagOf(file: LicenceInput): string | null {
  const credit = `${file.artist} ${file.credit}`;
  const all = `${credit} ${file.description} ${file.title}`;
  for (const flag of RED_FLAGS) {
    if (flag.credit?.test(credit) || flag.anywhere?.test(all))
      return `its credit or description names ${flag.what}`;
  }
  if (OWN_WORK.test(credit) && BROADCAST.test(all))
    return 'an "own work" that is a frame of a broadcast';
  return null;
}

/** The licences a file carries, by its name and by the tags in its categories (a file may be offered under two). */
function offeredOf(file: LicenceInput): {
  named: string;
  alternatives: string[];
} {
  const named = `${file.licenceName} ${file.licenceCode}`.toLowerCase();
  const alternatives = file.categories
    .map((c) => /^CC[- ]BY[- ](\d(?:\.\d)?)$/iu.exec(c.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `CC BY ${m[1].length === 1 ? `${m[1]}.0` : m[1]}`);
  return { named, alternatives };
}

/** A CC BY licence's version, as written: "CC BY 4.0", "cc-by-3.0". */
function ccByOf(named: string): LicenceCode | null {
  if (/cc[- ]by[- ](?:sa|nc|nd)/iu.test(named)) return null;
  const m = /\bcc[- ]by[- ](\d(?:\.\d)?)\b/iu.exec(named);
  if (!m) return null;
  const version = m[1].length === 1 ? `${m[1]}.0` : m[1];
  const code = `CC BY ${version}` as LicenceCode;
  return code in CC_URLS ? code : null;
}

/** Whether a file's structured data agrees with the licence read from its page (research §3.4: refuse when they disagree). */
export function structuredAgrees(
  code: LicenceCode,
  structured: LicenceInput['structured'],
): boolean | null {
  if (!structured) return null;
  const status = new Set(structured.status);
  const licences = new Set(
    structured.licences.map((q) => LICENCE_QIDS[q] ?? q),
  );
  if (!status.size && !licences.size) return null;
  if (code.startsWith('PD')) {
    if (status.has(STATUS_PD) || licences.has('PDM')) return true;
    return false;
  }
  if (code === 'CC0')
    return (
      licences.has('CC0') ||
      status.has(STATUS_DEDICATED) ||
      (status.has(STATUS_PD) && !status.has(STATUS_COPYRIGHTED))
    );
  // CC BY: the same licence among those it says.
  return licences.has(code);
}

/**
 * The licence verdict on a file: yes with its code, chip words and tier,
 * or no with why. The order is the screen's: what the file's words show
 * of where it came from first (a licence cannot clean an agency photo),
 * then its templates, then its licence, then whether its structured data
 * says the same.
 */
export function licenceOf(file: LicenceInput): LicenceVerdict {
  const categories = file.categories.map((c) => c.trim());
  const flag = redFlagOf(file);
  if (flag) return refuse(flag);
  if (categories.some((c) => IN_DOUBT.test(c)))
    return refuse(
      'its licence is in doubt on Commons (a review, a deletion request or a missing permission)',
    );
  if (categories.some((c) => WATERMARK.test(c)))
    return refuse('it carries a watermark');
  if (
    categories.some((c) => MADE_BY_AI.test(c)) ||
    MADE_BY_AI.test(`${file.description} ${file.title}`)
  )
    return refuse('it was made by a machine, not taken of the thing');
  if (categories.some((c) => US_COPYRIGHTED.test(c)))
    return refuse('it is under copyright in the US');

  const flags: string[] = [];
  for (const restriction of file.restrictions)
    if (NOTED_RESTRICTIONS.test(restriction))
      flags.push(`restriction: ${restriction}`);

  const credit = `${file.artist} ${file.credit}`;
  const ownWork =
    OWN_WORK.test(credit) ||
    categories.some((c) => /^self-published work$/iu.test(c));
  const unknownAuthor = UNKNOWN_AUTHOR.test(file.artist);
  const old = file.year !== undefined && file.year < OWN_WORK_BEFORE;
  /**
   * A licence its author gave: only an author can give one, and nobody
   * took a 1950s photograph last year. A museum's or an agency's own
   * release (the Met's CC0, NASA's) is the holder's to give.
   */
  const authorGave = (what: string): LicenceVerdict | null => {
    if (file.source !== 'commons') return null;
    if (unknownAuthor)
      return refuse(`${what} needs its author, and its author is unknown`);
    if (ownWork && old)
      return refuse(
        `an "own work" of ${file.year}, before ${OWN_WORK_BEFORE}: not the uploader's to give`,
      );
    return null;
  };

  const { named, alternatives } = offeredOf(file);
  // The licence tags themselves, not Commons' upkeep lists that name them.
  const tags = categories.filter((c) => !UPKEEP.test(c));
  if (/\bnc\b|non[- ]?commercial|\bnd\b|no ?deriv/iu.test(named))
    return refuse('its licence forbids commercial use or changes');

  let code: LicenceCode | null = null;
  if (/\bcc0\b|cc[- ]zero|public domain dedication/iu.test(named)) {
    const no = authorGave('CC0');
    if (no) return no;
    code = 'CC0';
  } else if (
    /public domain|^pd\b|\bpd\b|\bpdm\b|public domain mark/iu.test(named)
  ) {
    const usGov = tags.some((c) => US_GOVERNMENT.test(c));
    const longAgo = file.year !== undefined && file.year <= US_EXPIRED_BY;
    const usReason = tags.some(
      (c) => US_REASON.test(c) && (!BARE_US.test(c) || longAgo),
    );
    const pdOld = tags.some((c) => PD_OLD.test(c));
    const pdArt = tags.some((c) => PD_ART.test(c));
    const ineligible = tags.some((c) => INELIGIBLE.test(c));
    const selfReleased = tags.some((c) => SELF_RELEASED.test(c));
    const country = tags.find((c) => PD_COUNTRY.test(c));
    if (file.source !== 'commons') code = usGov || usReason ? 'PD-USGov' : 'PD';
    else if (usGov) code = 'PD-USGov';
    else if (pdArt && (usReason || longAgo)) code = 'PD-art';
    else if (pdOld && (usReason || longAgo)) code = 'PD-old';
    else if (usReason || ineligible) code = 'PD';
    else if (selfReleased) {
      const no = authorGave('A gift to the public domain');
      if (no) return no;
      code = 'PD';
    } else if (country)
      return refuse(
        `public domain in its own country (${country}), with no reason it is in the US`,
      );
    else if (pdOld || pdArt)
      return refuse(
        'public domain by its author’s death, with no reason it is in the US',
      );
    else return refuse('public domain is claimed with no reason given');
  } else {
    code =
      ccByOf(named) ?? (alternatives[0] as LicenceCode | undefined) ?? null;
    if (!code || !(code in CC_URLS)) {
      if (/cc[- ]by[- ]sa|share ?alike/iu.test(named))
        return refuse('ShareAlike (CC BY-SA) is not used until its legal read');
      if (/gfdl|gnu free documentation/iu.test(named))
        return refuse('GFDL only');
      return refuse(
        `its licence is unclear (${file.licenceName || file.licenceCode || 'none given'})`,
      );
    }
    const no = authorGave(code);
    if (no) return no;
    // CC BY before 4.0 has no cure period: only with a named author whose credit is used as written.
    if (code !== 'CC BY 4.0' && (!file.artist.trim() || unknownAuthor))
      return refuse(`${code} without a named author`);
  }

  const agrees = structuredAgrees(code, file.structured);
  if (agrees === false)
    return refuse('its structured data on Commons gives another licence');
  if (agrees === null && file.source === 'commons')
    flags.push('no structured licence on Commons');

  const ccBy = code.startsWith('CC BY');
  return {
    ok: true,
    code,
    short: code.startsWith('PD') ? 'Public domain' : code,
    tier: ccBy ? 'B' : 'A',
    ...(CC_URLS[code] ? { url: CC_URLS[code] } : {}),
    attribution: ccBy,
    flags,
  };
}

// ── The switch ────────────────────────────────────────────────────────────

/** Whether the licence and provenance screen runs: 'on', today's rules; 'off', none. */
export type LicenceMode = 'on' | 'off';

/** The switch as the settings say it (PICTURE_LICENCE): on only when said; off by default. */
export function licenceModeOf(setting: string | null | undefined): LicenceMode {
  return /^(?:on|true|1|yes|strict)$/iu.test((setting ?? '').trim())
    ? 'on'
    : 'off';
}

/** A licence's name as its source writes it, short enough for the chip: "CC BY-SA 3.0", "Public domain". */
export function licenceWordsOf(
  file: Pick<LicenceInput, 'licenceName' | 'licenceCode'>,
): string {
  const named = plainText(file.licenceName) || plainText(file.licenceCode);
  if (!named) return '';
  if (/^(?:pd|public domain|pdm)\b/iu.test(named)) return 'Public domain';
  if (/^cc0\b|^cc[- ]zero/iu.test(named)) return 'CC0';
  // Commons writes Flickr's "no known copyright restrictions" as two words.
  if (/^no (?:known )?(?:copyright )?restrictions$/iu.test(named))
    return 'No known restrictions';
  return named.length <= 28 ? named : `${named.slice(0, 27).trimEnd()}…`;
}

/**
 * Why a file is no picture whatever its licence: a machine made it (the
 * truth rule: never a real image of the person or the place), or a
 * watermark is on it that nothing may crop away. Null when neither.
 */
export function unusableOf(
  file: Pick<LicenceInput, 'categories' | 'description' | 'title'>,
): string | null {
  const categories = file.categories.map((c) => c.trim());
  if (
    categories.some((c) => MADE_BY_AI.test(c)) ||
    MADE_BY_AI.test(`${file.description} ${file.title}`)
  )
    return 'it was made by a machine, not taken of the thing';
  if (categories.some((c) => WATERMARK.test(c)))
    return 'it carries a watermark';
  return null;
}

/**
 * The desk's verdict on a file under the switch. On, the screen as it
 * stands (licenceOf, exactly). Off, the screen's own yes where it gives
 * one; else yes under the licence the source names ("unchecked"), with a
 * note of what the screen said, attribution owed but for public domain
 * and CC0, and the credit and chip made as ever. A machine's picture and
 * a watermark are refused either way.
 */
export function licenceUnder(
  file: LicenceInput,
  mode: LicenceMode,
): LicenceVerdict {
  const strict = licenceOf(file);
  if (mode === 'on' || strict.ok) return strict;
  const unusable = unusableOf(file);
  if (unusable) return refuse(unusable);
  const short = licenceWordsOf(file);
  const free = /^(?:Public domain|CC0|No known restrictions)$/u.test(short);
  const url = plainText(file.licenceUrl ?? '');
  return {
    ok: true,
    code: 'unchecked',
    short,
    tier: free ? 'A' : 'B',
    ...(/^https?:\/\//u.test(url) ? { url } : {}),
    attribution: !free,
    flags: [`licence not checked: ${strict.reason}`],
  };
}

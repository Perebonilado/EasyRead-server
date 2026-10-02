/**
 * The picture desk's types (explainer-animation-plan §6.3; research §3.4
 * and §3.5): what is asked of it, what its sources say of a file, and what
 * it hands back. A picture is evidence: it shows the exact person, place,
 * thing or event a line names, under a licence we may use, with its
 * credit. When nothing clears, nothing is shown; the board then uses a
 * trace of the person, or the map.
 */

/** What a picture shows. */
export type PictureKind = 'person' | 'place' | 'object' | 'event' | 'document';

/** Where a file comes from. */
export type PictureSource = 'commons' | 'nasa' | 'met';

/** A box in pixels: x, y, w, h. */
export type PixelBox = [number, number, number, number];

/** What the desk is asked to find, with the research's facts to match it by. */
export interface PictureQuery {
  /** Wikidata's id, when the research gives one. */
  qid?: string;
  name: string;
  kind: PictureKind;
  /** The years the research ties to it (a person's acts, an event's year). */
  years?: readonly number[];
  /** The places the research ties to it: a city, a region, a country. */
  place?: string | readonly string[];
  /** Who they were, in a few words (a person), as the research says. */
  role?: string;
  /** Where it is, when code knows (a place on the show's map). */
  geo?: { lng: number; lat: number };
}

/** A file as its source describes it, every field plain text, before the desk's checks. */
export interface SourceFile {
  source: PictureSource;
  /** Its name at its source: a Commons title ("File:…"), a NASA id, a Met object id. */
  sourceId: string;
  /** Its title in words, without the file's extension. */
  title: string;
  /** The original file. */
  url: string;
  /** A copy at a width the desk asked for, when the source makes one. */
  thumb?: { url: string; width: number; height: number };
  width: number;
  height: number;
  mime: string;
  /** The file's page at its source: where the credit points. */
  pageUrl: string;
  /** Commons' page id, for its structured data (M<pageid>). */
  pageId?: number;
  /** The licence as the source names it ("Public domain", "CC BY 4.0", "cc-by-4.0"). */
  licenceName: string;
  licenceCode: string;
  licenceUrl?: string;
  artist: string;
  credit: string;
  /** A credit line the file's page asks for word for word, when it names one. */
  attribution?: string;
  description: string;
  /** When it was made, as the source writes it. */
  date: string;
  /** When it was put online, as an ISO date, when the source says. */
  uploaded?: string;
  categories: readonly string[];
  /** Commons' restrictions (personality, trademark, insignia). */
  restrictions: readonly string[];
  /** Commons' structured data: its copyright status (P6216) and licences (P275), as QIDs; null when it has none. */
  structured?: {
    status: readonly string[];
    licences: readonly string[];
  } | null;
  /** Who it depicts (P180), with where in the picture when the file says (P2677, as shares of its size). */
  depicts?: readonly {
    qid: string;
    box?: [number, number, number, number];
  }[];
  /** A museum's or an agency's own file, not a crowd upload. */
  institutional?: boolean;
  /** Whether it is the person's or the place's own picture on Wikidata (P18). */
  chosen?: boolean;
  /** Commons' nominations: featured, quality, valued. */
  quality?: 'featured' | 'quality' | 'valued' | null;
}

/** A licence the desk may use, with what it allows. */
export type LicenceCode =
  | 'PD'
  | 'PD-old'
  | 'PD-USGov'
  | 'PD-art'
  | 'CC0'
  | 'CC BY 4.0'
  | 'CC BY 3.0'
  | 'CC BY 2.5'
  | 'CC BY 2.0'
  | 'CC BY 1.0';

export type LicenceVerdict =
  | {
      ok: true;
      code: LicenceCode;
      /** The licence in the chip's words: "Public domain", "CC0", "CC BY 4.0". */
      short: string;
      /** Research §3.4's tiers: A public domain and CC0, B attribution. */
      tier: 'A' | 'B';
      url?: string;
      /** Whether the credit must name the author (CC BY). */
      attribution: boolean;
      /** What was noticed but not refused (a personality right, no structured licence). */
      flags: string[];
    }
  | { ok: false; reason: string };

/** A picture the desk would use: the file, its licence, its words, where its subject is, and how well it serves. */
export interface PictureCandidate {
  file: SourceFile;
  licence: Extract<LicenceVerdict, { ok: true }>;
  kind: PictureKind;
  /** Who or what it shows, as the chip names it. */
  subject: string;
  qid?: string;
  /** When it was made, when the desk can tell. */
  year?: number;
  /** The words on screen. */
  chip: string;
  /** The full credit for the description (title, author, source, licence). */
  credit: string;
  /** The chip's middle: who made it or holds it. */
  source: string;
  /** The subject's box as shares of the picture (0–1), and how it was found. */
  focal: { box: [number, number, number, number]; from: 'depicts' | 'centre' };
  score: number;
  /** Why it scored as it did, and what was noticed: for the logs and the report. */
  notes: string[];
}

/** A person's facts as Wikidata has them, for the match. */
export interface WikiPerson {
  qid: string;
  label: string;
  aliases: readonly string[];
  description: string;
  human: boolean;
  born?: number;
  died?: number;
  /** Labels of their occupations (P106) and positions held (P39). */
  roles: readonly string[];
  /** Labels of their citizenships (P27) and places of birth, death, work and residence. */
  places: readonly string[];
  /** Their own picture (P18), Commons file names. */
  images: readonly string[];
  /** Their Commons category (P373). */
  category?: string;
}

/** A place or a thing as Wikidata has it. */
export interface WikiItem {
  qid: string;
  label: string;
  aliases: readonly string[];
  description: string;
  /** What it is an instance of (P31), as QIDs. */
  types: readonly string[];
  geo?: { lng: number; lat: number };
  images: readonly string[];
  category?: string;
}

/** A picture the desk took: its record in the cache, with where our copy is. */
export interface PictureRecord {
  id: string;
  qid: string | null;
  source: PictureSource;
  sourceId: string;
  kind: PictureKind;
  subject: string;
  url: string;
  sourceUrl: string;
  licence: string;
  credit: string;
  chip: string;
  width: number;
  height: number;
  /** In our copy's pixels. */
  focal: PixelBox;
  sha1: string;
  mime: string;
  storageKey: string;
  depthKey: string | null;
  year?: number;
  /** Whether it has no colour of its own (a black-and-white photograph). */
  mono?: boolean;
  /** For a portrait: the person's years ("1910–1966") and who they were (three words at most). */
  dates?: string;
  role?: string;
}

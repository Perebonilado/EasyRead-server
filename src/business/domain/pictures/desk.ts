/**
 * The picture desk (explainer-animation-plan §6.3; research §3.4–3.5): it
 * finds a real picture of what a line names, clears its licence and its
 * provenance, makes sure it is of the right person or place, and keeps a
 * copy in our storage with its credit, its chip and where its subject is.
 *
 *   find(query)   ranked candidates, every one cleared: for a person, only
 *                 once Wikidata's person is surely the research's (match.ts)
 *                 and only pictures of them alone; for a place or an event,
 *                 only pictures that name it, taken in the research's years
 *   pick(found)   the one to use, or none
 *   take(one)     our copy (by sha1, so stored once), its size, its focal
 *                 box in pixels, whether it has colour, and its depth map
 *   lookup(query) all three, the answer kept (a 'lookup' row) so the same
 *                 question is answered from the cache for 30 days
 *
 * Every file it refuses is kept with why, so it is never judged again in
 * vain. It never throws on a source's failure: a picture that cannot be
 * had is no picture, and the board shows the person's trace or the map.
 * I/O goes through ports (sources, cache, storage, pixels, depth), so the
 * specs run it on fakes.
 */
import { createHash } from 'node:crypto';
import type {
  DepthPort,
  PicturePixelsPort,
  PictureSourcesPort,
} from '../../ports/pictures.port';
import type { StoragePort } from '../../ports/storage.port';
import type {
  PictureCacheRepository,
  PictureCacheRow,
} from '../../repositories/picture-cache.repository';
import {
  chipOf,
  creditOf,
  institutionOf,
  lifeOf,
  roleWords,
  sourceOf,
  yearOf,
} from './credit';
import { isMono } from './depth';
import { licenceOf } from './licence';
import { matchPerson, matchPlace, nameWords } from './match';
import {
  LEAST_PX,
  photoOf,
  portraitOf,
  qualityOf,
  scoreOf,
  useOf,
  type PictureUse,
} from './rank';
import type {
  PictureCandidate,
  PictureQuery,
  PictureRecord,
  PixelBox,
  SourceFile,
  WikiPerson,
} from './types';

export interface DeskDeps {
  sources: PictureSourcesPort;
  cache: PictureCacheRepository;
  storage: Pick<StoragePort, 'put' | 'size'> &
    Partial<Pick<StoragePort, 'get'>>;
  pixels: PicturePixelsPort;
  /** Depth Anything V2 Small; absent or null, a picture is one plane. */
  depth?: DepthPort | null;
  now?: () => Date;
  log?: (message: string) => void;
}

/** How long the desk trusts its answer to a question before asking again. */
const LOOKUP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The width the desk asks a source for: a full frame's with room for a 12% push; a portrait's print; a page. */
const FETCH_WIDTH: Readonly<Record<PictureUse, number>> = {
  photo: 2560,
  portrait: 1280,
  document: 2048,
};

/** How many files each way of looking may bring (the sources are asked politely, so few). */
const FROM_DEPICTS = 12;
const FROM_CATEGORY = 30;
const FROM_SEARCH = 15;

/** The least score a picture is used at (house): under it, no picture is better. */
export const PICK_LEAST = 0.4;

/** A file's subject as shares of it: where its structured data says the person is, else its centre third. */
function focalOf(
  file: SourceFile,
  qid: string | undefined,
): PictureCandidate['focal'] {
  const said = qid
    ? file.depicts?.find((d) => d.qid === qid && d.box)
    : undefined;
  if (said?.box) return { box: said.box, from: 'depicts' };
  const third = 1 / 3;
  return { box: [third, third, third, third], from: 'centre' };
}

/** What a question is kept under: its kind, its name's words, its id, its years and places. */
export function lookupKey(query: PictureQuery): string {
  const years = [...new Set(query.years ?? [])].sort((a, b) => a - b).join(',');
  const places = [query.place ?? []]
    .flat()
    .map((p) => nameWords(p).join(' '))
    .sort()
    .join(',');
  return [
    query.kind,
    nameWords(query.name).join(' '),
    query.qid ?? '',
    years,
    places,
    query.geo ? `${query.geo.lng.toFixed(2)},${query.geo.lat.toFixed(2)}` : '',
  ]
    .join('|')
    .slice(0, 500);
}

const extOf = (mime: string) => (mime === 'image/png' ? 'png' : 'jpg');

/** How many of a question's years the desk looks through, a request or two each. */
const YEARS_LOOKED = 6;

/** The years to look through: all of them when few, else spread from first to last. */
export function yearsToLook(years: readonly number[]): number[] {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (sorted.length <= YEARS_LOOKED) return sorted;
  return Array.from(
    { length: YEARS_LOOKED },
    (_, i) =>
      sorted[Math.round((i * (sorted.length - 1)) / (YEARS_LOOKED - 1))],
  );
}

export class PictureDesk {
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(private readonly deps: DeskDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? (() => undefined);
  }

  // ── Finding ──────────────────────────────────────────────────────────────

  /** Every cleared picture of what is asked, the best first; none when nothing is surely of it. */
  async find(query: PictureQuery): Promise<{
    found: PictureCandidate[];
    reason?: string;
    qid?: string;
    person?: WikiPerson;
  }> {
    const use = useOf(query.kind);
    const width = FETCH_WIDTH[use];
    if (query.kind === 'person') {
      const ids = await this.ids(query);
      const people = ids.length ? await this.deps.sources.people(ids) : [];
      const match = matchPerson(query, people);
      if (match.qid === null) return { found: [], reason: match.reason };
      const person = match.person;
      const files = await this.filesOf(
        person.images,
        match.qid,
        person.category,
        width,
      );
      const found = await this.judge(files, query, use, match.qid, person);
      return {
        found,
        qid: match.qid,
        person,
        ...(found.length
          ? {}
          : { reason: `no picture of ${person.label} clears` }),
      };
    }
    let qid: string | undefined;
    let images: readonly string[] = [];
    let category: string | undefined;
    if (query.kind === 'place' || query.kind === 'object' || query.qid) {
      const ids = await this.ids(query);
      const items = ids.length ? await this.deps.sources.items(ids) : [];
      const match = matchPlace(query, items);
      if (match.qid) {
        qid = match.qid;
        // A place's own picture is today's: only for a question with no years.
        images = query.years?.length ? [] : match.item.images;
        category = match.item.category;
      }
    }
    const files: SourceFile[] = qid
      ? await this.filesOf(
          images,
          qid,
          query.years?.length ? undefined : category,
          width,
        )
      : [];
    // A place in its years: Commons files each year's pictures of a
    // country under "<year> in <country>"; those that name the place are
    // of it, then. Then a search by its words, its country with it.
    const country = [query.place ?? []].flat()[0];
    if (country && query.years?.length && query.kind !== 'document')
      for (const year of yearsToLook(query.years))
        files.push(
          ...(await this.safely(
            () =>
              this.deps.sources.commonsCategory(
                `${year} in ${country}`,
                FROM_CATEGORY,
                width,
              ),
            [],
          )),
        );
    const words = [query.name, ...(country ? [country] : [])].join(' ');
    files.push(
      ...(await this.safely(
        () => this.deps.sources.commonsSearch(words, FROM_SEARCH, width),
        [],
      )),
    );
    if (query.kind === 'object' || query.kind === 'document') {
      files.push(
        ...(await this.safely(
          () => this.deps.sources.metSearch(query.name, 6),
          [],
        )),
      );
      const years = query.years?.length
        ? {
            yearStart: Math.min(...query.years) - 1,
            yearEnd: Math.max(...query.years) + 1,
          }
        : {};
      files.push(
        ...(await this.safely(
          () =>
            this.deps.sources.nasaSearch(query.name, { limit: 6, ...years }),
          [],
        )),
      );
    }
    const found = await this.judge(this.unique(files), query, use, qid);
    return {
      found,
      ...(qid ? { qid } : {}),
      ...(found.length ? {} : { reason: `no picture of ${query.name} clears` }),
    };
  }

  /** The best cleared picture, when it is good enough to show. */
  pick(found: readonly PictureCandidate[]): PictureCandidate | null {
    const best = [...found].sort((a, b) => b.score - a.score)[0];
    return best && best.score >= PICK_LEAST ? best : null;
  }

  /** Wikidata's ids for a name, its titles taken off too (Sir, Alhaji, Chief…), the given id first. */
  private async ids(query: PictureQuery): Promise<string[]> {
    const ids = new Set<string>(query.qid ? [query.qid] : []);
    const bare = nameWords(query.name).join(' ');
    const asked = [
      query.name,
      ...(bare && bare !== query.name.toLowerCase() ? [bare] : []),
    ];
    for (const name of asked) {
      const hits = await this.safely(
        () => this.deps.sources.searchEntities(name, 7),
        [],
      );
      for (const hit of hits) ids.add(hit.qid);
      if (ids.size >= 7) break;
    }
    return [...ids].slice(0, 10);
  }

  /** A person's or a place's files: its own Wikidata pictures, those that say they depict it, and its category's. */
  private async filesOf(
    images: readonly string[],
    qid: string,
    category: string | undefined,
    width: number,
  ): Promise<SourceFile[]> {
    const own = images.length
      ? await this.safely(
          () =>
            this.deps.sources.commonsFiles(
              images.map((f) => (f.startsWith('File:') ? f : `File:${f}`)),
              width,
            ),
          [],
        )
      : [];
    const chosen = new Set(own.map((f) => f.sourceId));
    const depicting = await this.safely(
      () => this.deps.sources.commonsDepicting(qid, FROM_DEPICTS, width),
      [],
    );
    const filed = category
      ? await this.safely(
          () =>
            this.deps.sources.commonsCategory(category, FROM_CATEGORY, width),
          [],
        )
      : [];
    return this.unique([...own, ...depicting, ...filed]).map((f) =>
      chosen.has(f.sourceId) ? { ...f, chosen: true } : f,
    );
  }

  private unique(files: readonly SourceFile[]): SourceFile[] {
    const seen = new Map<string, SourceFile>();
    for (const file of files) {
      const key = `${file.source}:${file.sourceId}`;
      const had = seen.get(key);
      seen.set(key, had ? { ...had, chosen: had.chosen || file.chosen } : file);
    }
    return [...seen.values()];
  }

  /**
   * The files that clear, scored: licence and provenance first (a refusal
   * is kept), then whether it can serve (a portrait alone, a photo that
   * names it in its years), then big enough to show.
   */
  private async judge(
    files: readonly SourceFile[],
    query: PictureQuery,
    use: PictureUse,
    qid?: string,
    person?: WikiPerson,
  ): Promise<PictureCandidate[]> {
    const out: PictureCandidate[] = [];
    for (const file of files) {
      if (!/^image\/(?:jpeg|png|tiff|gif|webp)$/u.test(file.mime)) continue;
      const year = yearOf(file);
      const licence = licenceOf({
        ...file,
        ...(year !== undefined ? { year } : {}),
      });
      if (!licence.ok) {
        await this.refused(file, licence.reason, qid);
        continue;
      }
      const fit =
        use === 'portrait' && person
          ? portraitOf(file, { qid: person.qid, name: query.name })
          : photoOf(file, query, qid, year);
      if (!fit.ok) continue;
      if (Math.max(file.width, file.height) < LEAST_PX[use]) continue;
      const focal = focalOf(file, qid);
      const { score, terms } = scoreOf({
        file: {
          ...file,
          quality: file.quality ?? qualityOf(file.categories),
          // An archive's or an agency's file ranks above a crowd upload.
          institutional: file.institutional ?? institutionOf(file) !== null,
        },
        use,
        tier: licence.tier,
        focal,
        ...(year !== undefined ? { year } : {}),
        ...(use === 'portrait' ? {} : { years: query.years ?? [] }),
      });
      const subject = person?.label.split(',')[0] ?? query.name;
      const source = sourceOf(file);
      out.push({
        file,
        licence,
        kind: query.kind,
        subject,
        ...(qid ? { qid } : {}),
        ...(year !== undefined ? { year } : {}),
        chip: chipOf({
          subject,
          ...(year !== undefined ? { year } : {}),
          source,
          licence,
        }),
        credit: creditOf(file, licence, source),
        source,
        focal,
        score,
        notes: [
          Object.entries(terms)
            .map(([k, v]) => `${k} ${v}`)
            .join(', '),
          ...licence.flags,
        ],
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** A refused file kept with why, so it is not fetched and judged again in vain. */
  private async refused(
    file: SourceFile,
    reason: string,
    qid?: string,
  ): Promise<void> {
    try {
      const had = await this.deps.cache.bySource(file.source, file.sourceId);
      if (had?.storageKey) return;
      await this.deps.cache.save({
        ...this.blank(file.source, file.sourceId),
        ...(had ? { id: had.id } : {}),
        qid: qid ?? null,
        subject: file.title.slice(0, 255),
        url: file.url,
        sourceUrl: file.pageUrl,
        licence: file.licenceName.slice(0, 64) || null,
        meta: {
          artist: file.artist,
          credit: file.credit,
          description: file.description.slice(0, 600),
          categories: file.categories.slice(0, 40),
        },
        refusedReason: reason.slice(0, 512),
      });
    } catch (error) {
      this.log(
        `pictures: could not keep a refusal: ${(error as Error).message}`,
      );
    }
  }

  // ── Taking ───────────────────────────────────────────────────────────────

  /**
   * Our copy of a cleared picture: fetched at the width the desk asked
   * for, kept by its sha1 (a picture two films show is stored once), its
   * size measured, its subject in its pixels, whether it has colour, and
   * its depth map beside it when depth is on. Null when it cannot be had.
   */
  async take(
    candidate: PictureCandidate,
    opts: { depth?: boolean; person?: WikiPerson; role?: string } = {},
  ): Promise<PictureRecord | null> {
    const { file } = candidate;
    const had = await this.deps.cache.bySource(file.source, file.sourceId);
    if (
      had?.storageKey &&
      !had.refusedReason &&
      (await this.stored(had.storageKey))
    ) {
      const kept = await this.withDepth(had, opts.depth ?? true);
      return this.recordOf(kept, candidate, opts);
    }
    const from =
      file.thumb && file.thumb.width < file.width ? file.thumb.url : file.url;
    const got = await this.safely(() => this.deps.sources.fetch(from), null);
    if (!got) return null;
    const size = this.deps.pixels.measure(got.bytes);
    if (!size) {
      this.log(`pictures: ${file.sourceId} is no JPEG or PNG`);
      return null;
    }
    const sha1 = createHash('sha1').update(got.bytes).digest('hex');
    const twin = await this.deps.cache.bySha1(sha1);
    let storageKey =
      twin?.storageKey && (await this.stored(twin.storageKey))
        ? twin.storageKey
        : null;
    if (!storageKey) {
      const stored = await this.deps.storage.put({
        key: `pictures/${sha1}.${extOf(size.mime)}`,
        body: got.bytes,
        mimeType: size.mime,
      });
      storageKey = stored.ref;
    }
    const small = await this.safely(
      () => this.deps.pixels.pixels(got.bytes, 256),
      null,
    );
    const [fx, fy, fw, fh] = candidate.focal.box;
    const focal: PixelBox = [
      Math.round(fx * size.width),
      Math.round(fy * size.height),
      Math.round(fw * size.width),
      Math.round(fh * size.height),
    ];
    const row = await this.deps.cache.save({
      ...this.blank(file.source, file.sourceId),
      ...(had ? { id: had.id } : {}),
      qid: candidate.qid ?? null,
      kind: candidate.kind,
      subject: candidate.subject.slice(0, 255),
      url: file.url,
      sourceUrl: file.pageUrl,
      licence: candidate.licence.short,
      credit: candidate.credit,
      chip: candidate.chip.slice(0, 255),
      width: size.width,
      height: size.height,
      focal,
      sha1,
      mime: size.mime,
      storageKey,
      depthKey: twin?.depthKey ?? null,
      meta: {
        code: candidate.licence.code,
        tier: candidate.licence.tier,
        flags: candidate.licence.flags,
        focalFrom: candidate.focal.from,
        score: candidate.score,
        notes: candidate.notes,
        ...(candidate.year !== undefined ? { year: candidate.year } : {}),
        ...(small ? { mono: isMono(small) } : {}),
        title: file.title,
        artist: file.artist,
        licenceName: file.licenceName,
        categories: file.categories.slice(0, 40),
      },
      refusedReason: null,
    });
    const kept = await this.withDepth(row, opts.depth ?? true, got.bytes);
    return this.recordOf(kept, candidate, opts);
  }

  /** Its depth map beside it, made once (by the bytes' sha1, so a twin's is reused). */
  private async withDepth(
    row: PictureCacheRow,
    wanted: boolean,
    bytes?: Buffer,
  ): Promise<PictureCacheRow> {
    if (!wanted || !this.deps.depth || !row.sha1) return row;
    if (row.depthKey && (await this.stored(row.depthKey))) return row;
    try {
      const source = bytes ?? null;
      if (!source) return row;
      const made = await this.deps.depth.depthOf(source);
      if (!made) return row;
      const stored = await this.deps.storage.put({
        key: `pictures/${row.sha1}-depth.png`,
        body: made.png,
        mimeType: 'image/png',
      });
      return await this.deps.cache.save({ ...row, depthKey: stored.ref });
    } catch (error) {
      // The flat picture is the fallback when depth cannot be made.
      this.log(
        `pictures: no depth for ${row.sourceId}: ${(error as Error).message}`,
      );
      return row;
    }
  }

  private async stored(key: string): Promise<boolean> {
    try {
      return (await this.deps.storage.size(key)) > 0;
    } catch {
      return false;
    }
  }

  private recordOf(
    row: PictureCacheRow,
    candidate: PictureCandidate | null,
    opts: { person?: WikiPerson; role?: string } = {},
  ): PictureRecord {
    const meta = row.meta ?? {};
    const person = opts.person;
    const dates = person
      ? lifeOf(person.born, person.died)
      : (meta.dates as string | undefined);
    const role =
      opts.role !== undefined
        ? roleWords(opts.role)
        : (meta.role as string | undefined);
    return {
      id: row.id,
      qid: row.qid,
      source: row.source as PictureRecord['source'],
      sourceId: row.sourceId,
      kind: (row.kind ?? candidate?.kind ?? 'object') as PictureRecord['kind'],
      subject: row.subject ?? candidate?.subject ?? '',
      url: row.url ?? '',
      sourceUrl: row.sourceUrl ?? '',
      licence: row.licence ?? '',
      credit: row.credit ?? '',
      chip: row.chip ?? '',
      width: row.width ?? 0,
      height: row.height ?? 0,
      focal: row.focal ?? [0, 0, row.width ?? 0, row.height ?? 0],
      sha1: row.sha1 ?? '',
      mime: row.mime ?? 'image/jpeg',
      storageKey: row.storageKey ?? '',
      depthKey: row.depthKey,
      ...(typeof meta.year === 'number'
        ? { year: meta.year }
        : candidate?.year !== undefined
          ? { year: candidate.year }
          : {}),
      ...(typeof meta.mono === 'boolean' ? { mono: meta.mono } : {}),
      ...(dates ? { dates } : {}),
      ...(role ? { role } : {}),
    };
  }

  // ── The question, answered once ──────────────────────────────────────────

  /**
   * The picture for a question, from the cache when it was answered in the
   * last 30 days; else found, picked and taken, and the answer kept (which
   * picture, or none and why). Null when nothing clears.
   */
  async lookup(
    query: PictureQuery,
    opts: { depth?: boolean } = {},
  ): Promise<PictureRecord | null> {
    const key = lookupKey(query);
    const asked = await this.safely(
      () => this.deps.cache.bySource('lookup', key),
      null,
    );
    const fresh =
      asked &&
      this.now().getTime() - asked.checkedAt.getTime() < LOOKUP_DAYS * DAY_MS;
    if (asked && fresh) {
      const meta = (asked.meta ?? {}) as {
        picked?: string;
        person?: WikiPerson;
        role?: string;
      };
      if (!meta.picked) return null;
      const row = await this.safely(
        () => this.deps.cache.find(meta.picked!),
        null,
      );
      if (
        row?.storageKey &&
        !row.refusedReason &&
        (await this.stored(row.storageKey))
      ) {
        const kept = await this.withDepthFromStore(row, opts.depth ?? true);
        return this.recordOf(kept, null, {
          ...(meta.person ? { person: meta.person } : {}),
          ...(meta.role !== undefined ? { role: meta.role } : {}),
        });
      }
    }
    const result = await this.safely(() => this.find(query), {
      found: [] as PictureCandidate[],
      reason: 'the sources could not be reached',
    });
    const best = this.pick(result.found);
    const record = best
      ? await this.safely(
          () =>
            this.take(best, {
              depth: opts.depth ?? true,
              ...('person' in result && result.person
                ? { person: result.person }
                : {}),
              ...(query.role !== undefined ? { role: query.role } : {}),
            }),
          null,
        )
      : null;
    const reason = record
      ? null
      : (result.reason ??
        (best
          ? 'it could not be fetched'
          : `nothing scored ${PICK_LEAST} or more`));
    await this.safely(
      () =>
        this.deps.cache.save({
          ...this.blank('lookup', key),
          ...(asked ? { id: asked.id } : {}),
          qid: ('qid' in result && result.qid) || null,
          kind: query.kind,
          subject: query.name.slice(0, 255),
          meta: {
            picked: record?.id ?? null,
            ...('person' in result && result.person
              ? { person: result.person }
              : {}),
            ...(query.role !== undefined ? { role: query.role } : {}),
            candidates: result.found.slice(0, 5).map((c) => ({
              file: c.file.sourceId,
              score: c.score,
              chip: c.chip,
            })),
          },
          refusedReason: reason ? reason.slice(0, 512) : null,
        }),
      null,
    );
    if (reason) this.log(`pictures: ${query.kind} "${query.name}": ${reason}`);
    return record;
  }

  /** A cached picture's depth made when it was taken without it (depth switched on later). */
  private async withDepthFromStore(
    row: PictureCacheRow,
    wanted: boolean,
  ): Promise<PictureCacheRow> {
    if (
      !wanted ||
      !this.deps.depth ||
      (row.depthKey && (await this.stored(row.depthKey)))
    )
      return row;
    const storage = this.deps.storage as Partial<Pick<StoragePort, 'get'>>;
    if (!storage.get || !row.storageKey) return row;
    const bytes = await this.safely(() => storage.get!(row.storageKey!), null);
    return bytes ? this.withDepth(row, true, bytes) : row;
  }

  /** A cached picture by its id, for serving: null for a refused one or one with no copy. */
  async record(id: string): Promise<PictureCacheRow | null> {
    const row = await this.safely(() => this.deps.cache.find(id), null);
    return row && row.storageKey && !row.refusedReason ? row : null;
  }

  private blank(source: string, sourceId: string): Omit<PictureCacheRow, 'id'> {
    return {
      qid: null,
      source,
      sourceId: sourceId.slice(0, 512),
      kind: null,
      subject: null,
      url: null,
      sourceUrl: null,
      licence: null,
      credit: null,
      chip: null,
      width: null,
      height: null,
      focal: null,
      sha1: null,
      mime: null,
      storageKey: null,
      depthKey: null,
      meta: null,
      checkedAt: this.now(),
      refusedReason: null,
    };
  }

  private async safely<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.log(`pictures: ${(error as Error).message}`);
      return fallback;
    }
  }
}

/**
 * Wikidata for the picture desk (research §3.4–3.5): items by name
 * (wbsearchentities), and their facts (wbgetentities): whether one is a
 * person, their years (P569, P570), what they did and held (P106, P39),
 * where they were from or worked (P27, P19, P20, P551, P937), a place's
 * point (P625) and kind (P31), their own picture (P18) and Commons
 * category (P373). The labels of the items those name come in a second
 * request, fifty at a time. Keyless; every request through PoliteHttp.
 */
import type {
  WikiItem,
  WikiPerson,
} from '../../../business/domain/pictures/types';
import type { PoliteHttp } from './polite-http';

const API = 'https://www.wikidata.org/w/api.php';

/** A statement's value as the API gives it. */
interface Snak {
  datavalue?: { value?: unknown };
}
interface Statement {
  rank?: 'preferred' | 'normal' | 'deprecated';
  mainsnak?: Snak;
}
export interface WikiEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  claims?: Record<string, Statement[]>;
  missing?: string;
}

/** A property's values, the preferred first and the deprecated never. */
export function valuesOf(entity: WikiEntity, property: string): unknown[] {
  const statements = (entity.claims?.[property] ?? []).filter(
    (s) => s.rank !== 'deprecated',
  );
  const preferred = statements.filter((s) => s.rank === 'preferred');
  return (preferred.length ? preferred : statements)
    .map((s) => s.mainsnak?.datavalue?.value)
    .filter((v) => v !== undefined && v !== null);
}

const idsOf = (entity: WikiEntity, property: string): string[] =>
  valuesOf(entity, property)
    .map((v) => (v as { id?: string }).id)
    .filter((id): id is string => typeof id === 'string');

/** A time value's year: "+1910-06-12T00:00:00Z" is 1910; BC years are none. */
function yearOf(entity: WikiEntity, property: string): number | undefined {
  for (const value of valuesOf(entity, property)) {
    const m = /^\+(\d{1,4})-/u.exec((value as { time?: string }).time ?? '');
    if (m) return Number(m[1]);
  }
  return undefined;
}

const strings = (entity: WikiEntity, property: string): string[] =>
  valuesOf(entity, property).filter((v): v is string => typeof v === 'string');

const labelOf = (entity: WikiEntity) => entity.labels?.en?.value ?? '';
const descriptionOf = (entity: WikiEntity) =>
  entity.descriptions?.en?.value ?? '';
const aliasesOf = (entity: WikiEntity) =>
  (entity.aliases?.en ?? []).map((a) => a.value);

/** The person a Wikidata entity is, its named items' labels given. */
export function personOf(
  entity: WikiEntity,
  labels: ReadonlyMap<string, string>,
): WikiPerson {
  const named = (ids: string[]) =>
    ids.map((id) => labels.get(id)).filter((l): l is string => Boolean(l));
  const born = yearOf(entity, 'P569');
  const died = yearOf(entity, 'P570');
  const category = strings(entity, 'P373')[0];
  return {
    qid: entity.id,
    label: labelOf(entity),
    aliases: aliasesOf(entity),
    description: descriptionOf(entity),
    human: idsOf(entity, 'P31').includes('Q5'),
    ...(born !== undefined ? { born } : {}),
    ...(died !== undefined ? { died } : {}),
    roles: named([...idsOf(entity, 'P106'), ...idsOf(entity, 'P39')]),
    places: named(
      ['P27', 'P19', 'P20', 'P551', 'P937'].flatMap((p) => idsOf(entity, p)),
    ),
    images: strings(entity, 'P18'),
    ...(category ? { category } : {}),
  };
}

/** The place or thing a Wikidata entity is. */
export function itemOf(entity: WikiEntity): WikiItem {
  const coords = valuesOf(entity, 'P625')[0] as
    { latitude?: number; longitude?: number } | undefined;
  const category = strings(entity, 'P373')[0];
  return {
    qid: entity.id,
    label: labelOf(entity),
    aliases: aliasesOf(entity),
    description: descriptionOf(entity),
    types: idsOf(entity, 'P31'),
    ...(coords &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude)
      ? { geo: { lng: coords.longitude!, lat: coords.latitude! } }
      : {}),
    images: strings(entity, 'P18'),
    ...(category ? { category } : {}),
  };
}

export class WikidataAdapter {
  constructor(private readonly http: PoliteHttp) {}

  async searchEntities(
    name: string,
    limit = 7,
  ): Promise<{ qid: string; label: string; description: string }[]> {
    const url = `${API}?${new URLSearchParams({
      action: 'wbsearchentities',
      search: name,
      language: 'en',
      uselang: 'en',
      type: 'item',
      limit: String(Math.min(20, limit)),
      format: 'json',
    })}`;
    const said = await this.http.json<{
      search?: { id: string; label?: string; description?: string }[];
    }>(url);
    return (said.search ?? []).map((s) => ({
      qid: s.id,
      label: s.label ?? '',
      description: s.description ?? '',
    }));
  }

  /** Items by their words (CirrusSearch over labels, descriptions and aliases), people only when asked. */
  async searchText(
    words: string,
    opts: { limit: number; humans?: boolean },
  ): Promise<{ qid: string }[]> {
    const url = `${API}?${new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: `${words}${opts.humans ? ' haswbstatement:P31=Q5' : ''}`,
      srnamespace: '0',
      srlimit: String(Math.max(1, Math.min(20, opts.limit))),
      srprop: '',
      format: 'json',
    })}`;
    const said = await this.http.json<{
      query?: { search?: { title?: string }[] };
    }>(url);
    return (said.query?.search ?? [])
      .map((hit) => hit.title ?? '')
      .filter((qid) => /^Q\d+$/u.test(qid))
      .map((qid) => ({ qid }));
  }

  /** Entities by id, fifty at a time. */
  async entities(ids: readonly string[], props: string): Promise<WikiEntity[]> {
    const out: WikiEntity[] = [];
    const unique = [...new Set(ids.filter((id) => /^Q\d+$/u.test(id)))];
    for (let i = 0; i < unique.length; i += 50) {
      const url = `${API}?${new URLSearchParams({
        action: 'wbgetentities',
        ids: unique.slice(i, i + 50).join('|'),
        props,
        languages: 'en',
        languagefallback: '1',
        format: 'json',
      })}`;
      const said = await this.http.json<{
        entities?: Record<string, WikiEntity>;
      }>(url);
      for (const entity of Object.values(said.entities ?? {}))
        if (!entity.missing) out.push(entity);
    }
    return out;
  }

  async people(qids: readonly string[]): Promise<WikiPerson[]> {
    const entities = await this.entities(
      qids,
      'claims|labels|descriptions|aliases',
    );
    const humans = entities.filter((e) => idsOf(e, 'P31').includes('Q5'));
    const wanted = humans.flatMap((e) =>
      ['P106', 'P39', 'P27', 'P19', 'P20', 'P551', 'P937'].flatMap((p) =>
        idsOf(e, p),
      ),
    );
    const labels = new Map<string, string>();
    if (wanted.length)
      for (const entity of await this.entities(wanted.slice(0, 150), 'labels'))
        labels.set(entity.id, labelOf(entity));
    return entities.map((e) => personOf(e, labels));
  }

  async items(qids: readonly string[]): Promise<WikiItem[]> {
    return (
      await this.entities(qids, 'claims|labels|descriptions|aliases')
    ).map(itemOf);
  }
}

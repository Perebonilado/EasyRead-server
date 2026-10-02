/**
 * The editor's desk (infographic-editor-plan §3): an explainer show
 * planned the way an editor plans a video, once for the whole topic,
 * before any episode is written. Its working file, kept on the show:
 *
 *  - the angles: questions a video on the topic could answer, each scored
 *    on the playbook's four tests (curiosity gap, tension, whether it can
 *    be shown, payoff), summed and ranked by code; the maker picks one;
 *  - the research log: every fact with its sources and a confidence, the
 *    timeline, the numbers, the myths, the sides a fair film must hear,
 *    look notes for the illustrated scenes, how names are said;
 *  - the plan: the story in six sentences, its beats joined by "but" and
 *    "therefore", what is kept, compressed and cut, a cast of at most
 *    five recurring people each standing for a force, and the episode map;
 *  - the world: the era, a colour for each recurring thing from the
 *    theme's tokens, the recurring places, people and things.
 *
 * Everything here is made sound from whatever a model sent, as the rest
 * of the Studio is (studio.ts): unknown values fall back, lists are
 * capped, text is trimmed. Models name things; code owns the numbers.
 */
import {
  FIGURE_AGES,
  PLAIN_FIGURE,
  figureFor,
  figureOf,
  type FigureSpec,
} from '../scene-figure';
import { readMapBase, type ShowMapBase } from '../scene-map';
import { PALETTE_TOKENS, type PaletteToken } from '../scene-palette';
import { STORY_TIMES, type StoryTime } from '../scene-story';
import {
  STUDIO_VOICES,
  studioId,
  text,
  type StudioFormat,
  type StudioVoice,
} from './studio';

// ── Small helpers ─────────────────────────────────────────────────────────

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): T | null =>
    typeof value === 'string' && list.includes(value.trim() as T)
      ? (value.trim() as T)
      : null;

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);

/** Text with what a search leaves in it taken out: its markdown links and bare addresses. */
export function plainText(value: unknown, most = 400): string {
  if (typeof value !== 'string') return '';
  return text(
    value
      // "([site](https://…))", the search's own citation: gone whole.
      .replace(/\(\s*\[[^\]]*\]\([^)]*\)\s*\)/gu, '')
      // "[words](https://…)": the words kept.
      .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
      .replace(/https?:\/\/\S+/gu, '')
      .replace(/\s+([.,;:!?])/gu, '$1'),
    most,
  );
}

/** Text lines made sound: each trimmed, empty ones gone, at most `most`. */
const texts = (raw: unknown, most: number, chars = 300): string[] =>
  list(raw)
    .map((one) => plainText(one, chars))
    .filter(Boolean)
    .slice(0, most);

/** A whole number within bounds; `fallback` for anything else. */
const whole = (
  raw: unknown,
  least: number,
  most: number,
  fallback: number,
): number => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(most, Math.max(least, n)) : fallback;
};

// ── The angles ────────────────────────────────────────────────────────────

/** The playbook's four tests of a question, each scored 1 to 5. */
export const ANGLE_TESTS = ['gap', 'tension', 'visual', 'payoff'] as const;
export type AngleTest = (typeof ANGLE_TESTS)[number];

export interface EditorAngle {
  question: string;
  /** The video in two sentences, as the maker would tell it to a friend. */
  pitch: string;
  scores: Record<AngleTest, number>;
  /** The four scores added by code, out of 20. */
  total: number;
  verdict: string;
}

/** The most angles kept, and how many are offered to the maker. */
export const MOST_ANGLES = 12;
export const ANGLES_OFFERED = 3;

/**
 * The angles made sound and ranked by code: each score 1 to 5, the total
 * their sum (never the writer's), the best first; one question asked
 * twice is kept once.
 */
export function anglesOf(raw: unknown): EditorAngle[] {
  const seen = new Set<string>();
  const angles = list(raw).flatMap((one): EditorAngle[] => {
    const a = record(one);
    const question = plainText(a.question, 200);
    const key = question
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    if (!question || seen.has(key)) return [];
    seen.add(key);
    const said = record(a.scores);
    const scores = Object.fromEntries(
      ANGLE_TESTS.map((test) => [test, whole(said[test] ?? a[test], 1, 5, 3)]),
    ) as Record<AngleTest, number>;
    return [
      {
        question,
        pitch: plainText(a.pitch, 400),
        scores,
        total: ANGLE_TESTS.reduce((n, test) => n + scores[test], 0),
        verdict: plainText(a.verdict, 200),
      },
    ];
  });
  // The best first; on a tie, the one the writer put first.
  return angles
    .map((angle, k) => ({ angle, k }))
    .sort((x, y) => y.angle.total - x.angle.total || x.k - y.k)
    .map(({ angle }) => angle)
    .slice(0, MOST_ANGLES);
}

// ── The research log ──────────────────────────────────────────────────────

export const CLAIM_KINDS = [
  'date',
  'number',
  'quote',
  'name',
  'event',
  'claim',
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** What the fact check found of a claim the script uses; null before it ran. */
export const CLAIM_STATUSES = [
  'verified',
  'unverified',
  'soften',
  'cut',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface EditorSource {
  url: string;
  title: string;
}

export interface EditorClaim {
  /** Its id in the script's rows: "c1", "c2"… */
  id: string;
  text: string;
  kind: ClaimKind;
  sources: EditorSource[];
  confidence: Confidence;
  /** How it could be shown. */
  visual: string;
  /** Whether people disagree about it: the script must say who says so. */
  contested: boolean;
  /** Who says so, for a contested claim; null otherwise. */
  who: string | null;
  status: ClaimStatus | null;
}

export interface EditorTimelineEvent {
  date: string;
  event: string;
  claims: string[];
  /** Where it happened: a city, a building, a region; absent when no source says. */
  place?: string | null;
}

/** Someone who drives the story: what they wanted, and one concrete thing they did or said. */
export interface EditorPersonNote {
  name: string;
  /** Who they were, in a few words. */
  role: string;
  wanted: string;
  /** One concrete thing they did or said, from a source. */
  did: string;
  claims: string[];
}

/** A turning point told as a scene: who, where, when, what happened, what it looked like. */
export interface EditorMoment {
  when: string;
  where: string;
  who: string;
  what: string;
  /** What it looked like, from sources: what a film would show. */
  looked: string;
  claims: string[];
}

/** A quantity that could become a chart: checked when its claims have two sources. */
export interface EditorNumber {
  label: string;
  value: string;
  claims: string[];
  /** Two sources or more agree on it (code): only then shown as exact. */
  checked: boolean;
}

export interface EditorMyth {
  belief: string;
  truth: string;
  /** How the film handles it. */
  handle: string;
  claims: string[];
}

export interface EditorPerspective {
  side: string;
  view: string;
  claims: string[];
}

export const LOOK_KINDS = ['place', 'person', 'dress', 'object'] as const;
export type LookKind = (typeof LOOK_KINDS)[number];

/** What a place, a person, their dress or a thing looked like at the time, from sources: no photos, words. */
export interface EditorLookNote {
  subject: string;
  kind: LookKind;
  description: string;
  claims: string[];
}

export interface EditorSaying {
  word: string;
  say: string;
}

export interface EditorResearch {
  claims: EditorClaim[];
  timeline: EditorTimelineEvent[];
  /** The people who drive the story; absent in a log kept before they were asked for. */
  people?: EditorPersonNote[];
  /** The turning points told as scenes; absent in a log kept before. */
  moments?: EditorMoment[];
  numbers: EditorNumber[];
  myths: EditorMyth[];
  perspectives: EditorPerspective[];
  looks: EditorLookNote[];
  pronunciations: EditorSaying[];
  open: string[];
  /** How many web searches it took. */
  searched: number;
}

export const RESEARCH_LIMITS = {
  claims: 80,
  /** Claims a log may keep once topped up (a thin log searched again, a maker's request). */
  kept: 120,
  timeline: 30,
  people: 12,
  moments: 10,
  numbers: 24,
  myths: 8,
  perspectives: 8,
  looks: 24,
  pronunciations: 24,
  open: 12,
  sources: 4,
} as const;

/**
 * An address as it is compared: the search tool adds its own tracking to
 * what it found ("?utm_source=openai"), and a writer copies it without;
 * the same page either way.
 */
export function urlKey(url: string): string {
  if (url.startsWith('document:')) return url;
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()])
      if (/^utm_/iu.test(key)) u.searchParams.delete(key);
    u.hash = '';
    const host = u.hostname.toLowerCase().replace(/^www\./u, '');
    const path = u.pathname.replace(/\/+$/u, '');
    const query = u.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** An address by its site and path alone: a page cited without the query it was found with is the same page. */
export function pathKey(url: string): string {
  const key = urlKey(url);
  return key.split('?')[0];
}

/** A source's address made sound: the web's, or a page of the maker's document; null for anything else. */
export function sourceUrl(raw: unknown): string | null {
  const said = typeof raw === 'string' ? raw.trim() : '';
  if (/^document:[\w-]+(?:#p\d+(?:-\d+)?)?$/u.test(said)) return said;
  if (!/^https?:\/\/[^\s]+$/u.test(said)) return null;
  try {
    const u = new URL(said);
    for (const key of [...u.searchParams.keys()])
      if (/^utm_/iu.test(key)) u.searchParams.delete(key);
    return u.toString().slice(0, 600);
  } catch {
    return null;
  }
}

/** How many different pages a claim's sources are. */
export const distinctSources = (sources: readonly EditorSource[]) =>
  new Set(sources.map((s) => urlKey(s.url))).size;

/** Claim ids as written made sound: those of the log, once each. */
export function claimIds(raw: unknown, known: ReadonlySet<string>): string[] {
  return [
    ...new Set(
      list(raw).flatMap((id) => {
        const one = claimIdIn(id, known);
        return one ? [one] : [];
      }),
    ),
  ];
}

/**
 * The claim a writer named, as the log has it: its id alone ("c4"), or
 * its id before its words ("c4: The Gregorian calendar…", "[c4]",
 * "claim c4"), as a search's answer often gives it; none it knows, none.
 */
export function claimIdIn(
  raw: unknown,
  known: ReadonlySet<string>,
): string | null {
  if (typeof raw !== 'string') return null;
  const said = raw.trim().toLowerCase();
  if (known.has(said)) return said;
  const lead = /^[\s[(#]*(?:claim\s+)?([a-z0-9-]+)/u.exec(said)?.[1];
  return lead && known.has(lead) ? lead : null;
}

/**
 * The research log made sound. Given the addresses the search really
 * found (`found`, with titles), a claim keeps only sources among them:
 * a writer may not cite a page no search returned. A claim left with no
 * source is low and unverified. Without `found` (the log read back as
 * kept) its sources are kept as they are.
 */
export function researchOf(
  raw: unknown,
  found: ReadonlyMap<string, EditorSource> | null = null,
  searched?: number,
  /** A top-up's: the claims of the log it adds to, which it may cite by id. */
  cited: ReadonlySet<string> = new Set(),
): EditorResearch {
  const said = record(raw);
  const taken = new Set<string>();
  // A page cited without the query the search found it with is that page.
  const byPath = new Map<string, EditorSource>();
  for (const page of found?.values() ?? [])
    if (!byPath.has(pathKey(page.url))) byPath.set(pathKey(page.url), page);
  // A log read back as kept may hold what a top-up added.
  const claims = list(said.claims)
    .slice(0, found ? RESEARCH_LIMITS.claims : RESEARCH_LIMITS.kept)
    .flatMap((one, k): EditorClaim[] => {
      const c = record(one);
      const claimText = plainText(c.text, 400);
      if (!claimText) return [];
      let id = text(c.id, 16)
        .toLowerCase()
        .replace(/[^a-z0-9-]/gu, '');
      if (!id || taken.has(id)) id = `c${k + 1}`;
      while (taken.has(id)) id = `${id}x`;
      taken.add(id);
      const sources = list(c.sources)
        .flatMap((s): EditorSource[] => {
          const src = record(s);
          const url = sourceUrl(typeof s === 'string' ? s : src.url);
          if (!url) return [];
          if (found) {
            const real = found.get(urlKey(url)) ?? byPath.get(pathKey(url));
            if (!real && !url.startsWith('document:')) return [];
            return [
              {
                url: real?.url ?? url,
                title: plainText(src.title, 160) || real?.title || '',
              },
            ];
          }
          return [{ url, title: plainText(src.title, 160) }];
        })
        .filter(
          (s, i, all) =>
            all.findIndex((o) => urlKey(o.url) === urlKey(s.url)) === i,
        )
        .slice(0, RESEARCH_LIMITS.sources);
      const contested = c.contested === true;
      const status = oneOf(CLAIM_STATUSES)(c.status);
      const kind = oneOf(CLAIM_KINDS)(c.kind) ?? 'claim';
      const said = oneOf(CONFIDENCES)(c.confidence) ?? 'medium';
      return [
        {
          id,
          text: claimText,
          kind,
          sources,
          // No source, no confidence, whatever the writer felt; and a
          // number is sure only when two sources agree on it.
          confidence: !sources.length
            ? 'low'
            : kind === 'number' &&
                said === 'high' &&
                distinctSources(sources) < 2
              ? 'medium'
              : said,
          visual: plainText(c.visual, 240),
          contested,
          who: contested ? plainText(c.who, 120) || null : null,
          status: sources.length ? status : (status ?? 'unverified'),
        },
      ];
    });
  const known = new Set([...cited, ...claims.map((c) => c.id)]);
  const byId = new Map(claims.map((c) => [c.id, c]));
  const ids = (value: unknown) => claimIds(value, known);
  const numbers = list(said.numbers)
    .slice(0, RESEARCH_LIMITS.numbers)
    .flatMap((one): EditorNumber[] => {
      const n = record(one);
      const label = plainText(n.label ?? n.what, 160);
      const value = plainText(n.value, 80);
      if (!label || !value) return [];
      const claimsOf = ids(n.claims);
      const sources = claimsOf.flatMap((id) => byId.get(id)?.sources ?? []);
      return [
        {
          label,
          value,
          claims: claimsOf,
          // Checked against two sources, by code.
          checked: distinctSources(sources) >= 2,
        },
      ];
    });
  return {
    claims,
    timeline: list(said.timeline)
      .slice(0, RESEARCH_LIMITS.timeline)
      .flatMap((one): EditorTimelineEvent[] => {
        const e = record(one);
        const date = plainText(e.date, 40);
        const event = plainText(e.event, 240);
        const place = plainText(e.place, 120);
        return date && event
          ? [
              {
                date,
                event,
                claims: ids(e.claims),
                ...(place ? { place } : {}),
              },
            ]
          : [];
      }),
    people: list(said.people)
      .slice(0, RESEARCH_LIMITS.people)
      .flatMap((one): EditorPersonNote[] => {
        const p = record(one);
        const name = plainText(p.name, 80);
        if (!name) return [];
        return [
          {
            name,
            role: plainText(p.role, 120),
            wanted: plainText(p.wanted, 240),
            did: plainText(p.did, 300),
            claims: ids(p.claims),
          },
        ];
      }),
    moments: list(said.moments)
      .slice(0, RESEARCH_LIMITS.moments)
      .flatMap((one): EditorMoment[] => {
        const m = record(one);
        const what = plainText(m.what, 300);
        if (!what) return [];
        return [
          {
            when: plainText(m.when, 60),
            where: plainText(m.where, 120),
            who: plainText(m.who, 160),
            what,
            looked: plainText(m.looked, 300),
            claims: ids(m.claims),
          },
        ];
      }),
    numbers,
    myths: list(said.myths)
      .slice(0, RESEARCH_LIMITS.myths)
      .flatMap((one): EditorMyth[] => {
        const m = record(one);
        const belief = plainText(m.belief, 240);
        const truth = plainText(m.truth, 300);
        return belief && truth
          ? [
              {
                belief,
                truth,
                handle: plainText(m.handle, 240),
                claims: ids(m.claims),
              },
            ]
          : [];
      }),
    perspectives: list(said.perspectives)
      .slice(0, RESEARCH_LIMITS.perspectives)
      .flatMap((one): EditorPerspective[] => {
        const p = record(one);
        const side = plainText(p.side, 120);
        const view = plainText(p.view, 300);
        return side && view ? [{ side, view, claims: ids(p.claims) }] : [];
      }),
    looks: list(said.looks)
      .slice(0, RESEARCH_LIMITS.looks)
      .flatMap((one): EditorLookNote[] => {
        const l = record(one);
        const subject = plainText(l.subject, 120);
        const description = plainText(l.description, 400);
        return subject && description
          ? [
              {
                subject,
                kind: oneOf(LOOK_KINDS)(l.kind) ?? 'object',
                description,
                claims: ids(l.claims),
              },
            ]
          : [];
      }),
    pronunciations: list(said.pronunciations)
      .slice(0, RESEARCH_LIMITS.pronunciations)
      .flatMap((one): EditorSaying[] => {
        const p = record(one);
        const word = plainText(p.word, 60);
        const say = plainText(p.say, 80);
        return word && say && word !== say ? [{ word, say }] : [];
      }),
    open: texts(said.open, RESEARCH_LIMITS.open, 240),
    searched: searched ?? whole(said.searched, 0, 1000, 0),
  };
}

/**
 * Research topped up with more (a maker's request for something new):
 * the new claims take ids after the old ones' and are added, the old
 * kept as they are; the lists grow, each within its limit.
 */
export function mergedResearch(
  old: EditorResearch,
  more: EditorResearch,
): EditorResearch {
  const taken = new Set(old.claims.map((c) => c.id));
  const renamed = new Map<string, string>();
  let next = old.claims.length + 1;
  const added = more.claims.flatMap((c) => {
    if (old.claims.some((o) => o.text === c.text)) {
      renamed.set(c.id, old.claims.find((o) => o.text === c.text)!.id);
      return [];
    }
    let id = `c${next++}`;
    while (taken.has(id)) id = `c${next++}`;
    taken.add(id);
    renamed.set(c.id, id);
    return [{ ...c, id }];
  });
  // What the top-up cites: its own claims as renamed, or the log's by their ids.
  const kept = new Set(old.claims.map((c) => c.id));
  const ids = (claims: readonly string[]) => [
    ...new Set(
      claims.flatMap((id) =>
        renamed.has(id) ? [renamed.get(id)!] : kept.has(id) ? [id] : [],
      ),
    ),
  ];
  const cap = <T>(items: T[], most: number) => items.slice(0, most);
  return {
    claims: cap([...old.claims, ...added], RESEARCH_LIMITS.kept),
    timeline: cap(
      [
        ...old.timeline,
        ...more.timeline.map((e) => ({ ...e, claims: ids(e.claims) })),
      ],
      RESEARCH_LIMITS.timeline,
    ),
    // Someone already in the log gains what the top-up found of them.
    people: cap(
      [
        ...(old.people ?? []).map((p) => {
          const again = more.people?.find(
            (o) => o.name.toLowerCase() === p.name.toLowerCase(),
          );
          return again
            ? {
                ...p,
                wanted: p.wanted || again.wanted,
                did: p.did || again.did,
                claims: [...new Set([...p.claims, ...ids(again.claims)])],
              }
            : p;
        }),
        ...(more.people ?? [])
          .filter(
            (p) =>
              !(old.people ?? []).some(
                (o) => o.name.toLowerCase() === p.name.toLowerCase(),
              ),
          )
          .map((p) => ({ ...p, claims: ids(p.claims) })),
      ],
      RESEARCH_LIMITS.people,
    ),
    moments: cap(
      [
        ...(old.moments ?? []),
        ...(more.moments ?? []).map((m) => ({ ...m, claims: ids(m.claims) })),
      ],
      RESEARCH_LIMITS.moments,
    ),
    numbers: cap(
      [
        ...old.numbers,
        ...more.numbers.map((n) => ({ ...n, claims: ids(n.claims) })),
      ],
      RESEARCH_LIMITS.numbers,
    ),
    myths: cap(
      [
        ...old.myths,
        ...more.myths.map((m) => ({ ...m, claims: ids(m.claims) })),
      ],
      RESEARCH_LIMITS.myths,
    ),
    perspectives: cap(
      [
        ...old.perspectives,
        ...more.perspectives.map((p) => ({ ...p, claims: ids(p.claims) })),
      ],
      RESEARCH_LIMITS.perspectives,
    ),
    looks: cap(
      [
        ...old.looks,
        ...more.looks.map((l) => ({ ...l, claims: ids(l.claims) })),
      ],
      RESEARCH_LIMITS.looks,
    ),
    pronunciations: cap(
      [
        ...old.pronunciations,
        ...more.pronunciations.filter(
          (p) => !old.pronunciations.some((o) => o.word === p.word),
        ),
      ],
      RESEARCH_LIMITS.pronunciations,
    ),
    open: cap([...old.open, ...more.open], RESEARCH_LIMITS.open),
    searched: old.searched + more.searched,
  };
}

// ── The plan ──────────────────────────────────────────────────────────────

/** How a beat of the story follows the one before: "but", "therefore", or the "and then" the playbook forbids. */
export const CHAIN_LINKS = ['but', 'therefore', 'and then'] as const;
export type ChainLink = (typeof CHAIN_LINKS)[number];

export interface EditorChainBeat {
  beat: string;
  /** How it follows the one before; null for the first. */
  link: ChainLink | null;
}

export const ITEM_DECISIONS = ['keep', 'compress', 'cut'] as const;
export type ItemDecision = (typeof ITEM_DECISIONS)[number];

/** One item of the research faced with the four questions, and what was decided. */
export interface EditorItem {
  item: string;
  claims: string[];
  /** Does it move the question forward? */
  moves: boolean;
  /** Does it set up a payoff? */
  setsUp: boolean;
  /** Can it be shown? */
  visual: boolean;
  /** Will it surprise? */
  surprise: boolean;
  decision: ItemDecision;
  /** The episode it is in, kept or compressed; null when cut. */
  episode: number | null;
  /** About how long it takes on screen. */
  seconds: number;
  reason: string;
}

/** Someone of the show's cast: a recurring person stands for a force in the story; others are on screen once. */
export interface EditorCastMember {
  id: string;
  name: string;
  /** The force they stand for: "the North's caution", "the colonial office". */
  force: string;
  recurring: boolean;
  claims: string[];
}

/** Something planted for later: paid off in its own episode or a later one. */
export interface EditorPlant {
  id: string;
  text: string;
  /** The episode it pays off in. */
  paidIn: number;
}

export interface EditorPlanEpisode {
  number: number;
  title: string;
  question: string;
  /** The kept items it covers, by their place in the plan's items. */
  covers: number[];
  plants: EditorPlant[];
  /** The open loop it ends on (the last, the show's payoff). */
  endsOn: string;
  /** How long its material runs, worked out by code. */
  minutes: number;
  /** The episode made for it, once one is. */
  episodeId: string | null;
  /**
   * Under three minutes because the research holds no more for it (code's
   * word, never the writer's): its beat sheet and script keep to its
   * material, never padded. Absent, an episode runs three to five minutes.
   */
  short?: true;
}

export interface EditorPlan {
  /** The story in six sentences. */
  spine: string[];
  chain: EditorChainBeat[];
  items: EditorItem[];
  cast: EditorCastMember[];
  fairness: string[];
  episodes: EditorPlanEpisode[];
  /** What was cut from the whole show: the description's "what we left out". */
  leftOut: string[];
  /** What code noted as it put the plan right: an episode the research cannot fill to three minutes. */
  notes?: string[];
}

export const PLAN_LIMITS = {
  spine: 6,
  chain: 16,
  items: 60,
  /** Recurring people across the show; each stands for a force. */
  recurring: 5,
  cast: 10,
  fairness: 8,
  episodes: 8,
  leftOut: 12,
  plants: 6,
} as const;

/** How long an item may say it takes on screen, in seconds. */
export const ITEM_SECONDS = [4, 90] as const;

/** The plan made sound: what it says as it says it, ids and numbers held to what exists. Code's own checks and repairs are studio-editor-checks'. */
export function planOf(
  raw: unknown,
  research: EditorResearch | null,
): EditorPlan {
  const said = record(raw);
  const known = new Set((research?.claims ?? []).map((c) => c.id));
  const ids = (value: unknown) => claimIds(value, known);
  const items = list(said.items)
    .slice(0, PLAN_LIMITS.items)
    .flatMap((one): EditorItem[] => {
      const i = record(one);
      const item = plainText(i.item, 300);
      if (!item) return [];
      const decision = oneOf(ITEM_DECISIONS)(i.decision) ?? 'keep';
      const episode = Math.round(Number(i.episode));
      return [
        {
          item,
          claims: ids(i.claims),
          moves: i.moves === true,
          setsUp: i.setsUp === true,
          visual: i.visual === true,
          surprise: i.surprise === true,
          decision,
          episode:
            decision !== 'cut' && Number.isFinite(episode) && episode >= 1
              ? Math.min(PLAN_LIMITS.episodes, episode)
              : null,
          seconds: whole(i.seconds, ITEM_SECONDS[0], ITEM_SECONDS[1], 20),
          reason: plainText(i.reason, 240),
        },
      ];
    });
  const castTaken = new Set<string>();
  const cast = list(said.cast)
    .slice(0, PLAN_LIMITS.cast)
    .flatMap((one): EditorCastMember[] => {
      const c = record(one);
      const name = plainText(c.name, 80);
      if (!name) return [];
      let id = studioId(text(c.id, 40) || name, 'someone');
      while (castTaken.has(id)) id = `${id}-2`;
      castTaken.add(id);
      return [
        {
          id,
          name,
          force: plainText(c.force, 160),
          recurring: c.recurring !== false,
          claims: ids(c.claims),
        },
      ];
    });
  const episodes = list(said.episodes)
    .slice(0, PLAN_LIMITS.episodes)
    .flatMap((one, k): EditorPlanEpisode[] => {
      const e = record(one);
      const title = plainText(e.title, 80);
      const question = plainText(e.question, 200);
      if (!title && !question) return [];
      return [
        {
          number: k + 1,
          title: title || question.slice(0, 60),
          question: question || title,
          covers: list(e.covers)
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n >= 0 && n < items.length),
          plants: list(e.plants)
            .slice(0, PLAN_LIMITS.plants)
            .flatMap((p, j): EditorPlant[] => {
              const plant = record(p);
              const said = plainText(plant.text, 200);
              if (!said) return [];
              return [
                {
                  id:
                    text(plant.id, 16)
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/gu, '') || `p${k + 1}-${j + 1}`,
                  text: said,
                  paidIn: whole(plant.paidIn, 1, PLAN_LIMITS.episodes, k + 1),
                },
              ];
            }),
          endsOn: plainText(e.endsOn, 240),
          minutes: Number(e.minutes) > 0 ? Number(e.minutes) : 0,
          episodeId:
            typeof e.episodeId === 'string' && e.episodeId
              ? e.episodeId.slice(0, 64)
              : null,
          ...(e.short === true ? { short: true as const } : {}),
        },
      ];
    });
  const notes = texts(said.notes, PLAN_LIMITS.episodes, 300);
  return {
    spine: texts(said.spine, PLAN_LIMITS.spine, 300),
    chain: list(said.chain)
      .slice(0, PLAN_LIMITS.chain)
      .flatMap((one, k): EditorChainBeat[] => {
        const c = record(one);
        const beat = plainText(c.beat, 240);
        if (!beat) return [];
        const link = oneOf(CHAIN_LINKS)(
          typeof c.link === 'string' ? c.link.toLowerCase() : c.link,
        );
        return [{ beat, link: k === 0 ? null : (link ?? 'and then') }];
      }),
    items,
    cast,
    fairness: texts(said.fairness, PLAN_LIMITS.fairness, 300),
    episodes,
    leftOut: texts(said.leftOut, PLAN_LIMITS.leftOut, 300),
    ...(notes.length ? { notes } : {}),
  };
}

// ── The world ─────────────────────────────────────────────────────────────

/**
 * The eras a show's world may be set in (plan §6c): what the sets, the
 * clothes and the things are drawn as. Code's illustrated scenes grow
 * into these; today the kit draws the old world and the modern one.
 */
export const ERAS = [
  'ancient',
  'medieval',
  '1500-1800',
  '1800-1900',
  '1900-1945',
  '1945-1975',
  '1975-2000',
  'today',
] as const;
export type Era = (typeof ERAS)[number];

/** An era as people write it: "1945–1975", "the 1960s", "today". */
export function eraNamed(raw: unknown): Era | null {
  const said = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!said) return null;
  const listed = oneOf(ERAS)(said.replace(/[–—]/gu, '-'));
  if (listed) return listed;
  if (/\b(?:today|modern|present|current|now|contemporary)\b/u.test(said))
    return 'today';
  if (/\b(?:ancient|antiquity|bc|bce|classical|bronze|iron age)\b/u.test(said))
    return 'ancient';
  if (/\b(?:medieval|middle ages)\b/u.test(said)) return 'medieval';
  const year = /\b(1[0-9]{3}|20[0-9]{2})s?\b/u.exec(said);
  if (year) {
    const y = Number(year[1]);
    if (y < 500) return 'ancient';
    if (y < 1500) return 'medieval';
    if (y < 1800) return '1500-1800';
    if (y < 1900) return '1800-1900';
    if (y < 1945) return '1900-1945';
    if (y < 1975) return '1945-1975';
    if (y < 2000) return '1975-2000';
    return 'today';
  }
  return null;
}

/** An era as the maker reads it. */
export const ERA_WORDS: Record<Era, string> = {
  ancient: 'ancient times',
  medieval: 'the middle ages',
  '1500-1800': '1500–1800',
  '1800-1900': '1800–1900',
  '1900-1945': '1900–1945',
  '1945-1975': '1945–1975',
  '1975-2000': '1975–2000',
  today: 'today',
};

/**
 * The colours a world's things may take: the names of the theme's own
 * tokens (scene-themes, scene-palette), never a colour of the model's, so
 * a film keeps its look in every theme and in the dark.
 */
export { PALETTE_TOKENS, type PaletteToken } from '../scene-palette';

/**
 * The kinds of place a world's recurring places are, as the set builder
 * knows them (studio-editor-world turns each into a set): out of doors in
 * a town or the country, a public room, an ordinary one.
 */
export const WORLD_PLACE_KINDS = [
  'street',
  'square',
  'market',
  'field',
  'countryside',
  'coast',
  'harbour',
  'hall',
  'office',
  'classroom',
  'lab',
  'home',
  'clinic',
  'workshop',
  'kitchen',
  'park',
] as const;
export type WorldPlaceKind = (typeof WORLD_PLACE_KINDS)[number];

export interface EditorPlace {
  id: string;
  name: string;
  kind: WorldPlaceKind;
  /** How it looks, from the look notes. */
  look: string;
  /** The light it is usually seen in. */
  time: StoryTime;
  claims: string[];
}

export interface EditorPerson {
  id: string;
  name: string;
  role: string;
  /** Their described likeness, from the look notes: build, face, hair, what they wear. */
  likeness: string;
  /** Whether they come back across the show; else on screen once. */
  recurring: boolean;
  /** How the kit draws them: the same in every scene. */
  figure: FigureSpec;
  /** The voice they would speak in, were they given a line. */
  voice: StudioVoice;
  claims: string[];
}

export interface EditorThing {
  name: string;
  look: string;
}

export interface EditorWorld {
  era: Era;
  /** Where the story happens, when it is somewhere: from the topic and its research, never assumed. */
  region: string | null;
  /** Each recurring thing's colour, from the theme's tokens. */
  palette: { thing: string; token: PaletteToken }[];
  /** The colour held back for the payoff, and what it is for. */
  held: { token: PaletteToken; for: string } | null;
  /** When the legend appears and where it stays, in words. */
  legend: string;
  /** The one picture the show comes back to: its base map, its cross-section, its timeline, in words. */
  picture: string;
  /**
   * The show's one map, when its story happens in a place: its region and
   * named regions (each today's areas or countries, and its colour), the
   * seams between them, its year (scene-map's ShowMapBase, made sound by
   * readMapBase). Every map of every scene is drawn into it (withShowMap).
   */
  base?: ShowMapBase | null;
  places: EditorPlace[];
  people: EditorPerson[];
  things: EditorThing[];
}

export const WORLD_LIMITS = {
  palette: 8,
  places: 6,
  /** People drawn for the show: the recurring cast and those on screen once. */
  people: 7,
  things: 8,
} as const;

/** A world person's figure: the kit's spec made sound, a plain adult's where nothing usable came, their id deciding what is unsaid. */
function worldFigure(raw: unknown, id: string): FigureSpec {
  const said = record(raw);
  const age = oneOf(FIGURE_AGES)(said.age) ?? 'adult';
  const plain = figureFor(id, { age, top: PLAIN_FIGURE.top });
  return figureOf({ age, ...said }, plain);
}

/** A voice from what is said of someone, where none was given: their age and their words. */
function voiceOf(raw: unknown, figure: FigureSpec, words: string): StudioVoice {
  const given = oneOf(STUDIO_VOICES)(raw);
  if (given) return given;
  const he =
    /\b(?:he|his|him|man|king|father|sir|mr|lord|emperor|prince|brother|son)\b/iu.test(
      words,
    );
  const old = figure.age === 'elder';
  const young = figure.age === 'child' || figure.age === 'teen';
  if (young) return he ? 'boy' : 'girl';
  if (old) return he ? 'old man' : 'old woman';
  return he ? 'man' : 'woman';
}

/** The world made sound: tokens from the theme's list, ids unique, each list capped. */
export function worldOf(raw: unknown): EditorWorld {
  const said = record(raw);
  const things = new Set<string>();
  const palette = list(said.palette)
    .flatMap((one) => {
      const p = record(one);
      const thing = plainText(p.thing, 60);
      const token = oneOf(PALETTE_TOKENS)(p.token ?? p.colour);
      if (!thing || !token || things.has(thing.toLowerCase())) return [];
      things.add(thing.toLowerCase());
      return [{ thing, token }];
    })
    .slice(0, WORLD_LIMITS.palette);
  const heldRaw = record(said.held);
  const heldToken = oneOf(PALETTE_TOKENS)(heldRaw.token ?? heldRaw.colour);
  const placeIds = new Set<string>();
  const places = list(said.places)
    .flatMap((one): EditorPlace[] => {
      const p = record(one);
      const name = plainText(p.name, 60);
      if (!name) return [];
      let id = studioId(text(p.id, 40) || name, 'place');
      while (placeIds.has(id)) id = `${id}-2`;
      placeIds.add(id);
      return [
        {
          id,
          name,
          kind: oneOf(WORLD_PLACE_KINDS)(p.kind) ?? 'street',
          look: plainText(p.look, 400),
          time: oneOf(STORY_TIMES)(p.time) ?? 'day',
          claims: list(p.claims)
            .map((c) => text(c, 16))
            .filter(Boolean)
            .slice(0, 6),
        },
      ];
    })
    .slice(0, WORLD_LIMITS.places);
  const peopleIds = new Set<string>();
  const people = list(said.people)
    .flatMap((one): EditorPerson[] => {
      const p = record(one);
      const name = plainText(p.name, 60);
      if (!name) return [];
      let id = studioId(text(p.id, 40) || name, 'someone');
      while (peopleIds.has(id)) id = `${id}-2`;
      peopleIds.add(id);
      const figure = worldFigure(p.figure, id);
      const role = plainText(p.role, 120);
      const likeness = plainText(p.likeness, 400);
      return [
        {
          id,
          name,
          role,
          likeness,
          recurring: p.recurring !== false,
          figure,
          voice: voiceOf(p.voice, figure, `${role} ${likeness}`),
          claims: list(p.claims)
            .map((c) => text(c, 16))
            .filter(Boolean)
            .slice(0, 6),
        },
      ];
    })
    .slice(0, WORLD_LIMITS.people);
  return {
    era: eraNamed(said.era) ?? 'today',
    region: plainText(said.region, 120) || null,
    palette,
    held:
      heldToken && !palette.some((p) => p.token === heldToken)
        ? { token: heldToken, for: plainText(heldRaw.for, 160) }
        : null,
    legend: plainText(said.legend, 240),
    // A world kept before the map was its base said its picture there.
    picture: plainText(said.picture ?? said.base, 240),
    base: readMapBase(said.map ?? said.base),
    places,
    people,
    things: list(said.things)
      .flatMap((one): EditorThing[] => {
        const t = record(one);
        const name = plainText(t.name, 60);
        return name ? [{ name, look: plainText(t.look, 240) }] : [];
      })
      .slice(0, WORLD_LIMITS.things),
  };
}

// ── The editor ────────────────────────────────────────────────────────────

/** How far a show's planning has come: each the last document done ("ready" once its first episode is written). */
export const EDITOR_STAGES = [
  'angles',
  'research',
  'plan',
  'world',
  'ready',
] as const;
export type EditorStage = (typeof EDITOR_STAGES)[number];

export interface StudioEditor {
  /** The last of its planning done; null before the angles are written. */
  stage: EditorStage | null;
  /** The question the show answers, once chosen. */
  question: string | null;
  /** The chosen angle's pitch. */
  pitch: string | null;
  /** The one thing the viewer leaves knowing. */
  takeaway: string | null;
  /** What the show is not about: its scope. */
  notThis: string[];
  /** The angles not chosen, kept: often later episodes. */
  subThemes: string[];
  angles: EditorAngle[];
  research: EditorResearch | null;
  plan: EditorPlan | null;
  world: EditorWorld | null;
}

/** A new show the editor will plan once it is an explainer: nothing done yet. */
export const EMPTY_EDITOR: StudioEditor = {
  stage: null,
  question: null,
  pitch: null,
  takeaway: null,
  notThis: [],
  subThemes: [],
  angles: [],
  research: null,
  plan: null,
  world: null,
};

/** A show's editor as kept, read back and made sound; null for a show without one (a story, or made before the editor). */
export function editorOf(raw: unknown): StudioEditor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const said = raw as Record<string, unknown>;
  return {
    stage: oneOf(EDITOR_STAGES)(said.stage),
    question: plainText(said.question, 200) || null,
    pitch: plainText(said.pitch, 400) || null,
    takeaway: plainText(said.takeaway, 300) || null,
    notThis: texts(said.notThis, 6, 200),
    subThemes: texts(said.subThemes, 8, 200),
    angles: anglesOf(said.angles),
    research: said.research ? researchOf(said.research) : null,
    plan: said.plan
      ? planOf(said.plan, said.research ? researchOf(said.research) : null)
      : null,
    world: said.world ? worldOf(said.world) : null,
  };
}

/**
 * Whether new explainer shows are planned by the editor (STUDIO_EDITOR,
 * on unless set off): a show is marked so as it is made, and keeps it.
 */
export function editorSwitchOn(setting: string | undefined | null): boolean {
  return !/^(?:off|false|0|no)$/iu.test((setting ?? '').trim());
}

/** Whether a show is the editor's: an explainer marked so when it was made. */
export function usesEditor(show: {
  format: StudioFormat | null;
  editor?: StudioEditor | null;
}): boolean {
  return show.format === 'explainer' && Boolean(show.editor);
}

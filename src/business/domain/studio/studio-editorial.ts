/**
 * An episode as the editor writes it (infographic-editor-plan §3, stages
 * 4, 5 and 8), kept on the episode as its working file:
 *
 *  - the beat sheet: two or three acts, each with what it must do, its
 *    seconds from its material and its word budget (code's), the line
 *    that re-hooks the viewer as it ends, and what it plants and pays off;
 *  - the hooks drafted, each a different kind and judged, and the one
 *    made of the best (a picture, then a twist, then the question);
 *  - the two-column script: a row a sentence, what is said beside what is
 *    seen, every factual row resting on claims of the show's research;
 *  - the editor's read (its notes), the fact check (what it did to each
 *    claim), and the package that goes with the film when it is shared.
 *
 * Made sound here as everything a model sends is; code's checks and
 * repairs of it are studio-editor-checks', its cutting into scenes
 * studio-editor-cut's.
 */
import {
  SCENE_DELIVERIES,
  SCENE_MUSIC,
  type SceneDelivery,
  type SceneMusic,
} from '../scene-script';
import { text } from './studio';
import {
  claimIds,
  plainText,
  sourceUrl,
  type EditorSource,
} from './studio-editor';

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | null =>
    typeof value === 'string' && values.includes(value.trim() as T)
      ? (value.trim() as T)
      : null;

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);

const whole = (
  raw: unknown,
  least: number,
  most: number,
  fallback: number,
): number => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(most, Math.max(least, n)) : fallback;
};

// ── The beat sheet ────────────────────────────────────────────────────────

export interface EditorialAct {
  title: string;
  /** What it must do. */
  job: string;
  /** How long its material runs. */
  seconds: number;
  /** Its words at the audience's pace, by code: fewer in a grave act. */
  words: number;
  /** The line that ends it and pulls the viewer into the next. */
  rehook: string;
  /** What it plants and pays off, by the plants' ids. */
  plants: string[];
  payoffs: string[];
  /** A grave act (a death, a loss, a turning point): told slower. */
  grave: boolean;
}

export interface EditorialBeats {
  acts: EditorialAct[];
  /** Its acts' seconds, and words, added by code. */
  seconds: number;
  words: number;
}

/** The most acts an episode has, and how long one may run, in seconds. */
export const MOST_ACTS = 4;
export const ACT_SECONDS = [20, 200] as const;

/** A beat sheet made sound, its numbers left for code to work out (budgetBeats). */
export function beatsOf(raw: unknown): EditorialBeats {
  const said = record(raw);
  const acts = list(said.acts)
    .slice(0, MOST_ACTS)
    .flatMap((one, k): EditorialAct[] => {
      const a = record(one);
      const title = plainText(a.title, 80) || `Act ${k + 1}`;
      const ids = (value: unknown) =>
        list(value)
          .map((id) =>
            text(id, 16)
              .toLowerCase()
              .replace(/[^a-z0-9-]/gu, ''),
          )
          .filter(Boolean)
          .slice(0, 6);
      return [
        {
          title,
          job: plainText(a.job, 300),
          seconds: whole(a.seconds, ACT_SECONDS[0], ACT_SECONDS[1], 60),
          words: Math.max(0, Math.round(Number(a.words) || 0)),
          rehook: plainText(a.rehook, 240),
          plants: ids(a.plants),
          payoffs: ids(a.payoffs),
          grave: a.grave === true,
        },
      ];
    });
  return {
    acts,
    seconds: acts.reduce((n, a) => n + a.seconds, 0),
    words: acts.reduce((n, a) => n + a.words, 0),
  };
}

// ── The hooks ─────────────────────────────────────────────────────────────

/** The kinds of hook the playbook drafts, at least five of them different. */
export const HOOK_KINDS = [
  'image',
  'paradox',
  'stakes',
  'crisis',
  'myth',
  'number',
  'question',
  'quote',
] as const;
export type HookKind = (typeof HOOK_KINDS)[number];

export interface EditorialHook {
  text: string;
  kind: HookKind;
  verdict: string;
  claims: string[];
}

export function hooksOf(
  raw: unknown,
  known: ReadonlySet<string>,
): { hooks: EditorialHook[]; hook: string | null; claims: string[] } {
  const said = record(raw);
  const hooks = list(said.hooks)
    .slice(0, 10)
    .flatMap((one): EditorialHook[] => {
      const h = record(one);
      const hookText = plainText(h.text, 400);
      return hookText
        ? [
            {
              text: hookText,
              kind: oneOf(HOOK_KINDS)(h.kind) ?? 'question',
              verdict: plainText(h.verdict, 200),
              claims: claimIds(h.claims, known),
            },
          ]
        : [];
    });
  return {
    hooks,
    hook: plainText(said.hook, 600) || hooks[0]?.text || null,
    claims: claimIds(said.claims, known),
  };
}

// ── The two-column script ─────────────────────────────────────────────────

/**
 * What a row shows, by the playbook's decision rule: a place on the map,
 * when on a timeline or calendar, how many in a chart or counter, who on
 * a name card, why as a flow or things moving, a comparison side by side,
 * exact words on a quote card, or a scene of people and places.
 */
export const ROW_VISUALS = [
  'place',
  'when',
  'how-many',
  'who',
  'why',
  'comparison',
  'exact-words',
  'scene',
] as const;
export type RowVisual = (typeof ROW_VISUALS)[number];

/** What a row shows as a writer may name it otherwise. */
const VISUAL_WORDS: [RegExp, RowVisual][] = [
  [/^(?:map|place|where|location)/u, 'place'],
  [/^(?:when|timeline|calendar|date|time)/u, 'when'],
  [
    /^(?:how[- ]?many|how[- ]?much|number|chart|counter|count|icons?|stat)/u,
    'how-many',
  ],
  [/^(?:who|name ?card|person|portrait)/u, 'who'],
  [/^(?:why|cause|flow|process|how)/u, 'why'],
  [/^(?:comparison|compare|split|versus|vs)/u, 'comparison'],
  [/^(?:exact|quote|words|document)/u, 'exact-words'],
  [/^(?:scene|feeling|illustrat|atmosphere|event|people|moment)/u, 'scene'],
];

export function rowVisualOf(raw: unknown): RowVisual {
  const said = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (
    oneOf(ROW_VISUALS)(said) ??
    VISUAL_WORDS.find(([words]) => words.test(said))?.[1] ??
    'why'
  );
}

export interface EditorialRow {
  /** One sentence the narrator says. */
  say: string;
  visual: RowVisual;
  /** What the viewer sees, as an instruction to the animator. */
  show: string;
  /** The research's claims it rests on, by id. */
  claims: string[];
  /** Its act, from 1. */
  act: number;
  /** A plant it plants, or pays off, by id. */
  plant: string | null;
  payoff: string | null;
  delivery: SceneDelivery;
  /** The music from it on; null carries on. */
  music: SceneMusic | null;
  /** A deliberate hold: it may sit still longer than a row may. */
  hold: boolean;
}

/** The most rows an episode's script has: five minutes of sentences, and some over. */
export const MOST_ROWS = 120;

/** A script's rows made sound: each a sentence with what is seen, its claims those of the log. */
export function rowsOf(
  raw: unknown,
  known: ReadonlySet<string>,
  acts = MOST_ACTS,
): EditorialRow[] {
  return list(raw)
    .slice(0, MOST_ROWS)
    .flatMap((one): EditorialRow[] => {
      const r = record(one);
      const say = plainText(r.say, 600);
      if (!say) return [];
      const id = (value: unknown) =>
        text(value, 16)
          .toLowerCase()
          .replace(/[^a-z0-9-]/gu, '') || null;
      return [
        {
          say,
          visual: rowVisualOf(r.visual),
          show: plainText(r.show, 400),
          claims: claimIds(r.claims, known),
          act: whole(r.act, 1, Math.max(1, acts), 1),
          plant: id(r.plant),
          payoff: id(r.payoff),
          delivery: oneOf(SCENE_DELIVERIES)(r.delivery) ?? 'explain',
          music: oneOf(SCENE_MUSIC)(r.music),
          hold: r.hold === true,
        },
      ];
    });
}

// ── The editor's read and the fact check ──────────────────────────────────

export const FACT_VERDICTS = ['verified', 'soften', 'cut'] as const;
export type FactVerdict = (typeof FACT_VERDICTS)[number];

/** What the fact check made of one claim the script uses. */
export interface EditorialFact {
  claim: string;
  verdict: FactVerdict;
  note: string;
  /** Rows said again, softened: by their place in the script. */
  rewrites: { row: number; say: string }[];
  /** Where the check found it. */
  sources: EditorSource[];
}

export function notesOf(raw: unknown): string[] {
  const said = record(raw);
  return list(said.notes)
    .map((one) =>
      plainText(typeof one === 'string' ? one : record(one).note, 400),
    )
    .filter(Boolean)
    .slice(0, 24);
}

/** The fact check's verdicts made sound: one a claim of the log, rewrites only of rows that are. */
export function factsOf(
  raw: unknown,
  known: ReadonlySet<string>,
  rows: number,
): EditorialFact[] {
  const said = record(raw);
  const seen = new Set<string>();
  return list(said.checks)
    .flatMap((one): EditorialFact[] => {
      const f = record(one);
      const claim = text(f.claim, 16).toLowerCase();
      if (!known.has(claim) || seen.has(claim)) return [];
      seen.add(claim);
      return [
        {
          claim,
          verdict: oneOf(FACT_VERDICTS)(f.verdict) ?? 'verified',
          note: plainText(f.note, 300),
          rewrites: list(f.rewrites).flatMap((w) => {
            const one = record(w);
            const row = Math.round(Number(one.row));
            const say = plainText(one.say, 600);
            return Number.isFinite(row) && row >= 0 && row < rows && say
              ? [{ row, say }]
              : [];
          }),
          sources: list(f.sources).flatMap((s) => {
            const src = record(s);
            const url = sourceUrl(typeof s === 'string' ? s : src.url);
            return url ? [{ url, title: plainText(src.title, 160) }] : [];
          }),
        },
      ];
    })
    .slice(0, 120);
}

// ── The package ───────────────────────────────────────────────────────────

export interface EditorialPackage {
  title: string;
  /** The titles drafted, the best first, each with its verdict. */
  titles: { text: string; verdict: string }[];
  /** The thumbnail: a few words over a frame of the film, the row it is taken from. */
  thumbnail: { words: string; row: number | null };
  description: string;
  pinned: string;
  hashtags: string[];
  /** The "what we left out" paragraph. */
  leftOut: string;
}

/** The most words on a thumbnail. */
export const THUMBNAIL_WORDS = 4;

export function packageOf(raw: unknown, rows: number): EditorialPackage {
  const said = record(raw);
  const titles = list(said.titles)
    .flatMap((one) => {
      const t = record(one);
      const said = plainText(typeof one === 'string' ? one : t.text, 100);
      return said ? [{ text: said, verdict: plainText(t.verdict, 200) }] : [];
    })
    .slice(0, 6);
  const thumb = record(said.thumbnail);
  const row = Math.round(Number(thumb.row));
  return {
    title: plainText(said.title, 100) || titles[0]?.text || '',
    titles,
    thumbnail: {
      words: plainText(thumb.words, 60)
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, THUMBNAIL_WORDS)
        .join(' '),
      row: Number.isFinite(row) && row >= 0 && row < rows ? row : null,
    },
    description: plainText(said.description, 3000),
    pinned: plainText(said.pinned, 500),
    hashtags: [
      ...new Set(
        list(said.hashtags)
          .map((h) =>
            text(h, 40)
              .replace(/^#*/u, '')
              .replace(/[^\p{L}\p{N}_]/gu, ''),
          )
          .filter(Boolean),
      ),
    ]
      .slice(0, 8)
      .map((h) => `#${h}`),
    leftOut: plainText(said.leftOut, 1200),
  };
}

// ── The editorial ─────────────────────────────────────────────────────────

/** How far an episode's editing has come: the last step done. */
export const EDITORIAL_STAGES = [
  'beats',
  'hooks',
  'script',
  'read',
  'facts',
  'board',
  'ready',
] as const;
export type EditorialStage = (typeof EDITORIAL_STAGES)[number];

export interface StudioEditorial {
  /** Which of the plan's episodes it is. */
  number: number;
  question: string;
  stage: EditorialStage;
  beats: EditorialBeats | null;
  hooks: EditorialHook[];
  hook: string | null;
  rows: EditorialRow[];
  /** The editor's read: its notes on the first draft. */
  notes: string[];
  facts: EditorialFact[] | null;
  package: EditorialPackage | null;
  /** The maker's change it is being written again for, until it is. */
  request?: string;
}

/** An editorial begun for one of the plan's episodes: nothing written yet. */
export function freshEditorial(
  number: number,
  question: string,
): StudioEditorial {
  return {
    number,
    question,
    stage: 'beats',
    beats: null,
    hooks: [],
    hook: null,
    rows: [],
    notes: [],
    facts: null,
    package: null,
  };
}

/** An episode's editorial as kept, read back and made sound; null for an episode without one. */
export function editorialOf(raw: unknown): StudioEditorial | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const said = raw as Record<string, unknown>;
  // Read back, a row's claims are those it was kept with: the log's own
  // check ran as it was written.
  const known = new Set(
    list(said.rows).flatMap((r) =>
      list(record(r).claims).map((id) => text(id, 16).toLowerCase()),
    ),
  );
  for (const h of list(said.hooks))
    for (const id of list(record(h).claims))
      known.add(text(id, 16).toLowerCase());
  for (const f of list(said.facts))
    known.add(text(record(f).claim, 16).toLowerCase());
  const beats = said.beats ? beatsOf(said.beats) : null;
  const rows = rowsOf(said.rows, known, beats?.acts.length || 4);
  const hooks = hooksOf({ hooks: said.hooks, hook: said.hook }, known);
  // Kept beats keep their own words and seconds as code worked them out.
  if (beats)
    beats.acts = beats.acts.map((act, k) => ({
      ...act,
      words: Math.max(
        0,
        Math.round(Number(record(list(record(said.beats).acts)[k]).words) || 0),
      ),
    }));
  if (beats) {
    beats.seconds = beats.acts.reduce((n, a) => n + a.seconds, 0);
    beats.words = beats.acts.reduce((n, a) => n + a.words, 0);
  }
  const request = plainText(said.request, 2000);
  return {
    number: whole(said.number, 1, 99, 1),
    question: plainText(said.question, 200),
    stage: oneOf(EDITORIAL_STAGES)(said.stage) ?? 'beats',
    beats,
    hooks: hooks.hooks,
    hook: plainText(said.hook, 600) || null,
    rows,
    notes: list(said.notes)
      .map((n) => plainText(n, 400))
      .filter(Boolean)
      .slice(0, 24),
    facts: said.facts
      ? factsOf({ checks: said.facts }, known, rows.length)
      : null,
    package: said.package ? packageOf(said.package, rows.length) : null,
    ...(request ? { request } : {}),
  };
}

/**
 * What a chart set shows (shot-charts draws it): its spec as the board
 * gives it, made sound; whether there is enough in it to draw; the words
 * and numbers it puts on the stage, which the plan checks count and hold
 * to the research; and its parts, as the board names them ("part:1951",
 * "part:number") and as the drawn asset ids them ("bar-1951", "number").
 *
 * A chart's spec is the kind's own fields as the scene writer's schema
 * has them (schemas.ts, infographicFields), so the readers each kind
 * already has read it: counter {value, unit, prefix, label, then}; icons
 * {icon, count, per, unit, label, highlight, highlightLabel}; calendar
 * {calendars [{label, dates}], merge}; seats {layout, groups [{name,
 * seats, colour}], majority, label}; strike {from, to, label}; transfer
 * {from, to, token, label, shut}; document {style, title, headline,
 * stamp}; split {sides [{label, items, icon}], change}; chart {kind bar
 * or line, unit, bars [{label, value}]}; plot {fn, xFrom, xTo, yFrom,
 * yTo, xLabel, yLabel, points}; flow {direction, nodes [{label, kind}],
 * edges [{from, to, label}]}; and two of the board's own: timeline
 * {events [{when, name}]} and quote {text, speaker, when, claim}. Any of them may
 * carry `source` (where its numbers come from) and `colour` (a token).
 */
import { readCalendar } from '../scene-calendar';
import { numbersIn } from '../scene-chart';
import { readCounter } from '../scene-counter';
import { readDocument } from '../scene-document';
import { readFlow } from '../scene-flow';
import { readIcons } from '../scene-icons';
import { groupId } from '../scene-ids';
import { readSeats } from '../scene-seats';
import { readSplit } from '../scene-split';
import { readStrike } from '../scene-strike';
import { readTransfer } from '../scene-transfer';
import { CHART_KINDS, chartKindOf, type ChartKind } from './shot-lists';
import { keysOf } from './shot-phrases';
import type { PlanChart } from './types';

// ── Small helpers ─────────────────────────────────────────────────────────

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);

/** Words that do not end a short label well: "Powers to the" is "Powers". */
const TRAILING = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'from',
  'with',
  'and',
  'or',
  'but',
]);

/** Text made sound: a string, one line, no longer than `chars`; empty for anything else. */
export function line(raw: unknown, chars = 120): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  return (
    String(raw)
      // eslint-disable-next-line no-control-regex -- control characters are what it takes out
      .replace(/[\u0000-\u001f]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(/^["“'‘]+|["”'’]+$/gu, '')
      .trim()
      .slice(0, chars)
  );
}

/** A label of at most `most` words, ending on a word that ends it well. */
export function clip(raw: unknown, most: number): string {
  const words = line(raw, 200).split(' ').filter(Boolean).slice(0, most);
  while (
    words.length > 1 &&
    TRAILING.has(words[words.length - 1].toLowerCase())
  )
    words.pop();
  return words.join(' ').replace(/[,;:–—-]+$/u, '');
}

/**
 * A long name made a short label: what comes after its last "of" when
 * that is short ("Length of the inner border" is "inner border"), else
 * its first words.
 */
export function shortLabel(raw: unknown, most: number): string {
  const words = line(raw, 200).split(' ').filter(Boolean);
  if (words.length <= most) return clip(raw, most);
  const of = words.map((w) => w.toLowerCase()).lastIndexOf('of');
  const after = of >= 0 ? words.slice(of + 1) : [];
  while (after.length && TRAILING.has(after[0].toLowerCase())) after.shift();
  return after.length && after.length <= most
    ? after.join(' ')
    : clip(raw, most);
}

/** A label's words, or null when it has none. */
const label = (raw: unknown, most: number): string | null =>
  clip(raw, most) || null;

/** A number as a model writes it: 45, "45", "1,500"; null for none. */
function looseNumber(raw: unknown): number | string | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const said = line(raw, 40);
  return said && numbersIn(said).length ? said : null;
}

/** Each of a list's items as a label, at most `most` of them. */
const labels = (raw: unknown, most: number, words: number): string[] =>
  list(raw)
    .map((one) => clip(one, words))
    .filter(Boolean)
    .slice(0, most);

/** The words a label shows: its letters, not its numbers ("15 March 1959" is one word). */
export const wordsIn = (text: string | null | undefined): number =>
  keysOf(text ?? '').filter((k) => /\p{L}/u.test(k)).length;

// ── A chart's spec, as the board gives it ─────────────────────────────────

/** How many words a label on a chart may have (the rules' three), and a title or a headline. */
const LABEL_WORDS = 3;
const TITLE_WORDS = 5;
/** A quote's own words are read, not glanced at: a short passage at most. */
export const QUOTE_WORDS = 30;

/**
 * A chart's spec made sound from the board's answer: the kind's own
 * field (counter, timeline…), or the fields at the chart's top level when
 * the board wrote them there; labels short, lists capped. Null for a kind
 * the board may not draw.
 */
export function chartOf(raw: unknown): PlanChart | null {
  const said = record(raw);
  const kind = chartKindOf(said.kind);
  if (!kind) return null;
  const own = said[kind];
  const fields = own === undefined || own === null ? said : own;
  const spec = specOf(kind, fields);
  const source = line(said.source ?? record(fields).source, 90);
  const colour = line(said.colour ?? record(fields).colour, 24);
  return {
    kind,
    spec: {
      ...spec,
      ...(source ? { source } : {}),
      ...(colour ? { colour } : {}),
    },
  };
}

function specOf(kind: ChartKind, raw: unknown): Record<string, unknown> {
  const said = record(raw);
  switch (kind) {
    case 'counter':
      return {
        value: looseNumber(said.value),
        unit: label(said.unit, 2),
        prefix: line(said.prefix, 12) || null,
        label: label(said.label, LABEL_WORDS),
        then: looseNumber(said.then),
      };
    case 'icons':
      return {
        icon: line(said.icon, 24) || null,
        count: looseNumber(said.count),
        per: typeof said.per === 'number' ? said.per : null,
        unit: label(said.unit, 2),
        label: label(said.label, LABEL_WORDS),
        highlight: looseNumber(said.highlight),
        highlightLabel: label(said.highlightLabel, LABEL_WORDS),
      };
    case 'calendar':
      return {
        calendars: list(said.calendars)
          .map((one) => ({
            label: label(record(one).label, LABEL_WORDS),
            dates: labels(record(one).dates, 4, 4),
          }))
          .filter((one) => one.dates.length)
          .slice(0, 3),
        merge: line(said.merge, 30) || null,
      };
    case 'seats':
      return {
        layout: said.layout === 'chamber' ? 'chamber' : 'hemicycle',
        groups: list(said.groups)
          .map((one) => ({
            name: clip(record(one).name, LABEL_WORDS),
            seats: looseNumber(record(one).seats) ?? 0,
            colour: line(record(one).colour, 24) || null,
          }))
          .filter((one) => one.name)
          .slice(0, 8),
        majority: said.majority === true,
        label: label(said.label, LABEL_WORDS),
      };
    case 'strike':
      return {
        from: label(said.from, LABEL_WORDS),
        to: label(said.to, LABEL_WORDS),
        label: label(said.label, LABEL_WORDS),
      };
    case 'transfer':
      return {
        from: label(said.from, LABEL_WORDS),
        to: label(said.to, LABEL_WORDS),
        token: line(said.token, 24) || null,
        label: label(said.label, 2),
        shut: said.shut === true,
      };
    case 'document':
      return {
        style: said.style === 'newspaper' ? 'newspaper' : 'paper',
        title: label(said.title, TITLE_WORDS),
        headline: label(said.headline, TITLE_WORDS),
        stamp: label(said.stamp, LABEL_WORDS),
      };
    case 'split':
      return {
        sides: list(said.sides)
          .map((one) => ({
            label: label(record(one).label, LABEL_WORDS),
            items: labels(record(one).items, 4, LABEL_WORDS),
            icon: line(record(one).icon, 24) || null,
          }))
          .slice(0, 2),
        change: null,
      };
    case 'chart':
      return {
        kind: said.kind === 'line' ? 'line' : 'bar',
        unit: label(said.unit, 2),
        bars: list(said.bars)
          .map((one) => ({
            label: clip(record(one).label, LABEL_WORDS),
            value: Number(numbersIn(line(record(one).value, 30))[0]),
          }))
          .filter((one) => one.label && Number.isFinite(one.value))
          .slice(0, 8),
      };
    case 'plot':
      return {
        fn: line(said.fn, 120),
        xFrom: Number(said.xFrom),
        xTo: Number(said.xTo),
        yFrom: typeof said.yFrom === 'number' ? said.yFrom : null,
        yTo: typeof said.yTo === 'number' ? said.yTo : null,
        xLabel: label(said.xLabel, LABEL_WORDS),
        yLabel: label(said.yLabel, LABEL_WORDS),
        points: list(said.points)
          .map((one) => ({
            x: Number(record(one).x),
            name: clip(record(one).name, LABEL_WORDS),
          }))
          .filter((one) => Number.isFinite(one.x) && one.name)
          .slice(0, 4),
      };
    case 'timeline': {
      // The scene writer's timeline is a list; the board's may be either.
      const events = Array.isArray(raw) ? raw : list(said.events);
      return {
        events: events
          .map((one) => ({
            when: line(record(one).when ?? record(one).date, 30),
            name: clip(record(one).name ?? record(one).label, LABEL_WORDS),
          }))
          .filter((one) => one.when)
          .slice(0, 6),
      };
    }
    case 'flow': {
      const nodes = list(said.nodes)
        .map((one) => ({
          label: clip(
            typeof one === 'string' ? one : record(one).label,
            LABEL_WORDS,
          ),
          kind: line(record(one).kind, 12) || null,
        }))
        .filter((one) => one.label)
        .slice(0, 6);
      return {
        direction:
          said.direction === 'down' || said.direction === 'cycle'
            ? said.direction
            : 'across',
        nodes,
        edges: list(said.edges)
          .map((one) => ({
            from: clip(record(one).from, LABEL_WORDS),
            to: clip(record(one).to, LABEL_WORDS),
            label: label(record(one).label, 2),
          }))
          .filter((one) => one.from && one.to)
          .slice(0, 8),
      };
    }
    case 'quote': {
      const text = typeof raw === 'string' ? raw : said.text;
      return {
        text: line(text, 400).split(' ').slice(0, QUOTE_WORDS).join(' '),
        speaker: label(said.speaker ?? said.who, 4),
        when: line(said.when ?? said.date, 30) || null,
        // The claim its words are, for the check that they are its words.
        claim: line(said.claim, 12) || null,
      };
    }
  }
}

/** A chart's own fields, as the kind's reader takes them (each reads what it is given soundly). */
const spec = (chart: PlanChart) => chart.spec as never;

/**
 * Whether a chart has what its kind needs to be drawn: a counter its
 * number, a timeline two events, a chart two bars, a flow two steps, a
 * quote its words. The kinds' own readers decide where there is one.
 */
export function chartReady(chart: PlanChart): boolean {
  const s = chart.spec;
  switch (chart.kind as ChartKind) {
    case 'counter':
      return readCounter(spec(chart)) !== null;
    case 'icons':
      return readIcons(spec(chart), '') !== null;
    case 'calendar':
      return readCalendar(spec(chart)) !== null;
    case 'seats':
      return readSeats(spec(chart), '') !== null;
    case 'strike':
      return readStrike(spec(chart)) !== null;
    case 'transfer':
      return readTransfer(spec(chart), '') !== null;
    case 'document':
      return readDocument(spec(chart), '') !== null;
    case 'split':
      return readSplit(spec(chart)) !== null;
    case 'flow':
      return readFlow(spec(chart)).spec !== null;
    case 'chart':
      return list(s.bars).length >= 2;
    case 'plot':
      return Boolean(line(s.fn)) && Number(s.xTo) > Number(s.xFrom);
    case 'timeline':
      return list(s.events).length >= 2;
    case 'quote':
      return Boolean(line(s.text));
    default:
      return false;
  }
}

/**
 * The words a chart puts on the stage, each label once: its labels,
 * names, dates, items and steps (a quote's own words are read with the
 * voice and are not counted; its speaker is).
 */
export function chartTexts(chart: PlanChart): string[] {
  const s = record(chart.spec);
  const of = (raw: unknown, key: string) =>
    list(raw).map((one) => line(record(one)[key]));
  const out: string[] = [];
  switch (chart.kind as ChartKind) {
    case 'counter':
      out.push(line(s.unit), line(s.label));
      break;
    case 'icons':
      out.push(line(s.unit), line(s.label), line(s.highlightLabel));
      break;
    case 'calendar':
      for (const one of list(s.calendars))
        out.push(
          line(record(one).label),
          ...list(record(one).dates).map((d) => line(d)),
        );
      break;
    case 'seats':
      out.push(...of(s.groups, 'name'), line(s.label));
      break;
    case 'strike':
    case 'transfer':
      out.push(line(s.from), line(s.to), line(s.label));
      break;
    case 'document':
      out.push(line(s.title), line(s.headline), line(s.stamp));
      break;
    case 'split':
      for (const side of list(s.sides))
        out.push(
          line(record(side).label),
          ...list(record(side).items).map((i) => line(i)),
        );
      break;
    case 'chart':
      out.push(...of(s.bars, 'label'), line(s.unit));
      break;
    case 'plot':
      out.push(line(s.xLabel), line(s.yLabel), ...of(s.points, 'name'));
      break;
    case 'timeline':
      for (const e of list(s.events))
        out.push(line(record(e).when), line(record(e).name));
      break;
    case 'flow':
      out.push(...of(s.nodes, 'label'), ...of(s.edges, 'label'));
      break;
    case 'quote':
      out.push(line(s.speaker), line(s.when));
      break;
  }
  return out.filter(Boolean);
}

/** How many words a chart puts on the stage. */
export const chartWords = (chart: PlanChart): number =>
  chartTexts(chart).reduce((n, t) => n + wordsIn(t), 0);

/**
 * Every number a chart shows: its values, its counts, its seats, its
 * bars, the years and days of its dates, and the numbers in its words
 * (a quote's too). Each must be one the research or the narration gives.
 */
export function chartNumbers(chart: PlanChart): number[] {
  const s = record(chart.spec);
  const found: number[] = [];
  const add = (raw: unknown) => {
    if (typeof raw === 'number' && Number.isFinite(raw)) found.push(raw);
    else if (typeof raw === 'string') found.push(...numbersIn(raw));
  };
  switch (chart.kind as ChartKind) {
    case 'counter':
      add(s.value);
      add(s.then);
      break;
    case 'icons':
      add(s.count);
      add(s.highlight);
      break;
    case 'seats':
      for (const g of list(s.groups)) add(record(g).seats);
      break;
    case 'chart':
      for (const b of list(s.bars)) add(record(b).value);
      break;
    case 'plot':
      // A curve's numbers are its formula's: worked out, not cited.
      break;
    case 'quote':
      add(s.text);
      break;
  }
  for (const text of chartTexts(chart)) add(text);
  return found;
}

/**
 * A chart with fewer words on it, to fit the stage's budget: its lesser
 * labels gone first (a highlight's, a chamber's, a strike's caption, a
 * headline), then its lists cut to two items, then every label to two
 * words.
 */
export function fewerWords(chart: PlanChart, most: number): PlanChart {
  const lesser: Record<string, string[]> = {
    counter: ['label'],
    icons: ['highlightLabel', 'label'],
    seats: ['label'],
    strike: ['label'],
    transfer: ['label'],
    document: ['headline'],
    calendar: [],
    chart: ['unit'],
    plot: ['yLabel'],
  };
  let out: PlanChart = { kind: chart.kind, spec: { ...chart.spec } };
  for (const key of lesser[chart.kind] ?? []) {
    if (chartWords(out) <= most) return out;
    out = { kind: out.kind, spec: { ...out.spec, [key]: null } };
  }
  const s = record(out.spec);
  const cut = (raw: unknown, keep: number) => list(raw).slice(0, keep);
  if (chartWords(out) > most)
    out = {
      kind: out.kind,
      spec: {
        ...s,
        ...(s.events ? { events: cut(s.events, 4) } : {}),
        ...(s.sides
          ? {
              sides: list(s.sides).map((side) => ({
                ...record(side),
                items: cut(record(side).items, 1),
              })),
            }
          : {}),
        ...(s.nodes ? { nodes: cut(s.nodes, 4) } : {}),
        ...(s.edges ? { edges: [] } : {}),
      },
    };
  if (chartWords(out) <= most) return out;
  // Every label to two words: the stage's budget before the chart's detail.
  const short = (raw: unknown): unknown => {
    if (typeof raw === 'string' && /\p{L}/u.test(raw)) return clip(raw, 2);
    if (Array.isArray(raw)) return raw.map(short);
    if (raw && typeof raw === 'object')
      return Object.fromEntries(
        Object.entries(raw).map(([k, v]) =>
          ['source', 'colour', 'text', 'fn', 'when', 'dates', 'icon'].includes(
            k,
          )
            ? [k, v]
            : [k, short(v)],
        ),
      );
    return raw;
  };
  return { kind: out.kind, spec: short(out.spec) as Record<string, unknown> };
}

// ── A chart's parts ───────────────────────────────────────────────────────

/** The parts every chart of a kind has, by the names the board may give them. */
const ROLES: Record<ChartKind, string[]> = {
  counter: ['number', 'unit', 'label', 'then'],
  icons: ['icons', 'highlight', 'label'],
  calendar: ['merge'],
  seats: ['majority', 'label'],
  strike: ['old', 'new', 'label'],
  transfer: ['tokens', 'from', 'to', 'path', 'label'],
  document: ['page', 'title', 'headline', 'stamp'],
  split: ['side a', 'side b'],
  chart: ['axis'],
  plot: ['curve', 'axis'],
  timeline: ['spine'],
  flow: [],
  quote: ['speaker', 'when'],
};

/** A name as parts are matched: its keys, joined. */
const partKey = (words: string) => keysOf(words).join(' ');

/** A part's id slug, as the drawn assets write them ("bar-1951", "event-lyttleton-constitution"). */
export const partSlug = (words: string) =>
  groupId(words.normalize('NFD').replace(/\p{M}/gu, '')) || 'x';

/** What a chart's parts may be named by: its kind's roles, and every label, name, date, item and step it shows. */
export function chartPartWords(chart: PlanChart): Set<string> {
  const kind = chart.kind as ChartKind;
  const s = record(chart.spec);
  const words = new Set<string>((ROLES[kind] ?? []).map(partKey));
  for (const text of chartTexts(chart)) words.add(partKey(text));
  if (kind === 'timeline')
    for (const e of list(s.events)) {
      words.add(partKey(line(record(e).when)));
      words.add(partKey(line(record(e).name)));
    }
  if (kind === 'counter' && s.value !== null) words.add('number');
  words.delete('');
  return words;
}

/**
 * The ids a part the board names may have in the drawn chart, likeliest
 * first: a role's own id ("number", "stamp", "side-a"), else the kind's
 * id for a label, name, date or step ("bar-1951", "event-1951",
 * "day-2", "step-fan"), else a label's. The builder takes the first the
 * asset has.
 */
export function chartPartIds(chart: PlanChart, words: string): string[] {
  const kind = chart.kind as ChartKind;
  const key = partKey(words);
  const slug = partSlug(words);
  const s = record(chart.spec);
  const ids: string[] = [];
  const matches = (raw: unknown) => partKey(line(raw)) === key;
  if ((ROLES[kind] ?? []).map(partKey).includes(key))
    ids.push(key === 'side a' ? 'side-a' : key === 'side b' ? 'side-b' : slug);
  switch (kind) {
    case 'chart':
      ids.push(`bar-${slug}`);
      break;
    case 'timeline': {
      const at = list(s.events).findIndex(
        (e) => matches(record(e).when) || matches(record(e).name),
      );
      if (at >= 0) {
        const e = record(list(s.events)[at]);
        ids.push(
          `event-${partSlug(line(e.when))}`,
          `event-${partSlug(line(e.name))}`,
          `event-${at + 1}`,
        );
      } else ids.push(`event-${slug}`);
      break;
    }
    case 'calendar': {
      const dates = list(s.calendars).flatMap((c) =>
        list(record(c).dates).map((d) => line(d)),
      );
      const at = dates.findIndex((d) => partKey(d) === key);
      if (at >= 0) ids.push(`day-${at + 1}`, `date-${slug}`);
      break;
    }
    case 'seats':
      ids.push(`group-${slug}`, `seats-${slug}`);
      break;
    case 'split': {
      const side = list(s.sides).findIndex((one) => matches(record(one).label));
      if (side === 0) ids.push('side-a');
      if (side === 1) ids.push('side-b');
      ids.push(`item-${slug}`);
      break;
    }
    case 'transfer':
      if (matches(s.from)) ids.push('from', 'side-a');
      if (matches(s.to)) ids.push('to', 'side-b');
      break;
    case 'flow':
      ids.push(`step-${slug}`, `node-${slug}`);
      break;
    case 'plot':
      ids.push(`point-${slug}`);
      break;
    case 'quote':
      if (matches(s.speaker)) ids.push('speaker');
      break;
  }
  ids.push(`label-${slug}`, slug);
  return [...new Set(ids)];
}

/** Every chart kind, for a check that a stored plan's chart is still one. */
export const isChartKind = (kind: string): kind is ChartKind =>
  (CHART_KINDS as readonly string[]).includes(kind);

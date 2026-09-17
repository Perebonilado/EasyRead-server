/**
 * Mechanisms: the moving pictures a page about a process needs.
 *
 * A token bucket, a queue, a pipeline: no icon shows what they do, and a
 * flow of chips stands still. A mechanism is a small machine the app
 * runs from a few numbers, drawn on the canvas as it works. The model
 * names the kind, the numbers the page gives, and the stages to show in
 * order; every position at every second is the app's, derived from the
 * clock, so a seek lands true.
 */

export const MECHANISM_KINDS = [
  'bucket',
  'queue',
  'pipeline',
  'cycle',
  'balance',
  'spread',
  'pump',
] as const;
export type MechanismKind = (typeof MECHANISM_KINDS)[number];

export interface MechanismParam {
  name: string;
  what: string;
  default: number;
  min: number;
  max: number;
}

export interface MechanismStage {
  name: string;
  what: string;
}

export interface MechanismSpec {
  what: string;
  params: MechanismParam[];
  /** The stages it can show, in the order they make sense. */
  stages: MechanismStage[];
  /** The named places a callout can point at. */
  anchors: string[];
  /** Width over height of its box. */
  aspect: number;
}

export const MECHANISMS: Record<MechanismKind, MechanismSpec> = {
  bucket: {
    what: 'a token bucket or leaky bucket: tokens drip in at a rate, requests take them, and what overflows is lost',
    params: [
      {
        name: 'capacity',
        what: 'tokens the bucket holds',
        default: 8,
        min: 2,
        max: 30,
      },
      {
        name: 'rate',
        what: 'tokens added each second',
        default: 2,
        min: 1,
        max: 10,
      },
      {
        name: 'requests',
        what: 'requests arriving each second',
        default: 2,
        min: 0,
        max: 10,
      },
      {
        name: 'perRequest',
        what: 'tokens each request takes',
        default: 1,
        min: 1,
        max: 5,
      },
    ],
    stages: [
      {
        name: 'fill',
        what: 'tokens drip in and the bucket fills to its capacity, the rest spills',
      },
      { name: 'serve', what: 'requests arrive and each takes its tokens' },
      {
        name: 'burst',
        what: 'requests come three times as fast and drain the bucket',
      },
      { name: 'refuse', what: 'the bucket is empty and requests bounce off' },
    ],
    anchors: ['rim', 'tap', 'outlet', 'level', 'spill'],
    aspect: 1.5,
  },
  queue: {
    what: 'a line of arrivals served by a few servers',
    params: [
      {
        name: 'arrivals',
        what: 'arrivals each second',
        default: 2,
        min: 0,
        max: 10,
      },
      {
        name: 'servers',
        what: 'how many serve at once',
        default: 2,
        min: 1,
        max: 4,
      },
      {
        name: 'service',
        what: 'served each second by one server',
        default: 1,
        min: 0.2,
        max: 10,
      },
    ],
    stages: [
      { name: 'steady', what: 'arrivals are served as they come' },
      {
        name: 'busy',
        what: 'arrivals match what the servers can do and a line forms',
      },
      {
        name: 'overload',
        what: 'arrivals outrun the servers and the line grows',
      },
    ],
    anchors: ['entry', 'line', 'servers', 'exit'],
    aspect: 2,
  },
  pipeline: {
    what: 'items passing through stages in order, each stage taking its time',
    params: [
      { name: 'stages', what: 'how many stages', default: 4, min: 2, max: 6 },
      {
        name: 'slow',
        what: 'which stage is the slow one, counting from one',
        default: 3,
        min: 1,
        max: 6,
      },
      {
        name: 'rate',
        what: 'items entering each second',
        default: 1,
        min: 0.2,
        max: 5,
      },
    ],
    stages: [
      { name: 'flow', what: 'items move through every stage at one pace' },
      {
        name: 'bottleneck',
        what: 'the slow stage backs the others up behind it',
      },
    ],
    anchors: [
      'entry',
      'exit',
      'bottleneck',
      'stage1',
      'stage2',
      'stage3',
      'stage4',
      'stage5',
      'stage6',
    ],
    aspect: 2.2,
  },
  cycle: {
    what: 'things circulating round stations on a ring',
    params: [
      {
        name: 'stations',
        what: 'stations round the ring',
        default: 4,
        min: 2,
        max: 6,
      },
      { name: 'speed', what: 'turns each minute', default: 6, min: 1, max: 30 },
    ],
    stages: [
      { name: 'turn', what: 'things pass every station in turn' },
      { name: 'block', what: 'one station stops and things pile up before it' },
      { name: 'resume', what: 'the station opens and the pile clears' },
    ],
    anchors: [
      'station1',
      'station2',
      'station3',
      'station4',
      'station5',
      'station6',
      'ring',
    ],
    aspect: 1.3,
  },
  balance: {
    what: 'two sides on a scale, tipping to the heavier',
    params: [
      { name: 'left', what: 'weights on the left', default: 3, min: 0, max: 9 },
      {
        name: 'right',
        what: 'weights on the right',
        default: 3,
        min: 0,
        max: 9,
      },
    ],
    stages: [
      { name: 'even', what: 'the two sides as given' },
      { name: 'left', what: 'the left side gains one and tips down' },
      { name: 'right', what: 'the right side gains one and tips down' },
    ],
    anchors: ['left', 'right', 'pivot', 'beam'],
    aspect: 1.6,
  },
  spread: {
    what: 'something passing from one to its neighbours until most have it',
    params: [
      {
        name: 'size',
        what: 'dots along each side of the grid',
        default: 8,
        min: 4,
        max: 12,
      },
      {
        name: 'contacts',
        what: 'neighbours each reaches a second',
        default: 2,
        min: 1,
        max: 5,
      },
    ],
    stages: [
      { name: 'start', what: 'one dot has it' },
      {
        name: 'spread',
        what: 'it passes to neighbours, faster as more have it',
      },
      { name: 'slow', what: 'contacts are halved and the spread slows' },
    ],
    anchors: ['first', 'edge', 'grid'],
    aspect: 1.2,
  },
  pump: {
    what: 'a chamber with a valve each side, filling then pushing out',
    params: [
      {
        name: 'beats',
        what: 'strokes each minute',
        default: 60,
        min: 12,
        max: 180,
      },
    ],
    stages: [
      { name: 'fill', what: 'the inlet valve opens and the chamber fills' },
      {
        name: 'squeeze',
        what: 'the chamber squeezes and the outlet valve lets it out',
      },
      { name: 'steady', what: 'fill and squeeze, over and over' },
    ],
    anchors: ['inlet', 'outlet', 'chamber', 'valve'],
    aspect: 1.5,
  },
};

/** What the model writes for a mechanism card. */
export interface MechanismAsk {
  kind: MechanismKind;
  params?: Record<string, number> | null;
  phases?: { stage: string; text: string }[] | null;
}

/** A mechanism as the app runs it: every number inside its range, the stages in the kind's order. */
export interface VisualMechanism {
  kind: MechanismKind;
  params: Record<string, number>;
  /** Which params were the kind's own defaults rather than the page's. */
  assumed: string[];
  stages: string[];
  texts: string[];
}

export function knownMechanism(
  kind: string | undefined,
): kind is MechanismKind {
  return Boolean(kind && (MECHANISM_KINDS as readonly string[]).includes(kind));
}

/**
 * The mechanism tidied: a number outside its range is clamped, one the
 * page never gives is the default (and counted as assumed), a stage the
 * kind does not know is dropped, and the stages come in the kind's order.
 */
export function tidyMechanism(
  ask: MechanismAsk,
  /** Whether a number is written on the page; null to trust every number. */
  onPage: ((value: number) => boolean) | null,
): VisualMechanism {
  const spec = MECHANISMS[ask.kind];
  const params: Record<string, number> = {};
  const assumed: string[] = [];
  for (const param of spec.params) {
    const given = ask.params?.[param.name];
    if (
      typeof given === 'number' &&
      Number.isFinite(given) &&
      (!onPage || onPage(given))
    ) {
      params[param.name] = Math.max(param.min, Math.min(param.max, given));
    } else {
      params[param.name] = param.default;
      assumed.push(param.name);
    }
  }
  const order = spec.stages.map((s) => s.name);
  const asked = (ask.phases ?? []).filter((p) => order.includes(p.stage));
  const seen = new Set<string>();
  const phases = asked
    .filter((p) => (seen.has(p.stage) ? false : (seen.add(p.stage), true)))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))
    .slice(0, 4);
  const stages = phases.length ? phases.map((p) => p.stage) : [order[0]];
  const texts = phases.length
    ? phases.map((p) => p.text)
    : [spec.stages[0].what.split(',')[0]];
  return { kind: ask.kind, params, assumed, stages, texts };
}

/** What is wrong with a mechanism card in the model's own terms. */
export function mechanismProblems(
  ask: MechanismAsk | undefined,
  who: string,
): string[] {
  const problems: string[] = [];
  if (!ask) return [`${who} has no mechanism.`];
  if (!knownMechanism(ask.kind)) {
    return [
      `${who} names the mechanism "${String(ask.kind)}"; the kinds are ${MECHANISM_KINDS.join(', ')}.`,
    ];
  }
  const spec = MECHANISMS[ask.kind];
  for (const [name, value] of Object.entries(ask.params ?? {})) {
    const param = spec.params.find((p) => p.name === name);
    if (!param) {
      problems.push(
        `${who}: a ${ask.kind} has no number called "${name}"; its numbers are ${spec.params.map((p) => p.name).join(', ')}.`,
      );
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      problems.push(`${who}: "${name}" is not a number.`);
    }
  }
  const phases = ask.phases ?? [];
  if (phases.length > 4) problems.push(`${who}: at most four phases.`);
  for (const phase of phases) {
    if (!spec.stages.some((s) => s.name === phase.stage))
      problems.push(
        `${who}: a ${ask.kind} has no stage "${phase.stage}"; its stages are ${spec.stages.map((s) => s.name).join(', ')}.`,
      );
    if (!phase.text?.trim() || phase.text.length > 24)
      problems.push(
        `${who}: the phase "${phase.stage}" needs a text of one to twenty-four characters.`,
      );
  }
  return problems;
}

/** The catalogue as the prompt prints it. */
export function mechanismCatalogue(): string {
  return MECHANISM_KINDS.map((kind) => {
    const spec = MECHANISMS[kind];
    const params = spec.params
      .map((p) => `${p.name} (${p.what}, ${p.min} to ${p.max})`)
      .join(', ');
    const stages = spec.stages.map((s) => `${s.name} (${s.what})`).join('; ');
    return `${kind}: ${spec.what}. Numbers: ${params}. Stages: ${stages}. Callout parts: ${spec.anchors.join(', ')}.`;
  }).join('\n');
}

/**
 * A lesson scene boarded as shots (explainer-animation-tech §4.1): its
 * registry built from its lines, the research and the world; the board
 * asked (explainer_shots, GPT-5.4 mini) with that registry and the lines;
 * its answer made sound (planOf) and checked (checkPlan); sent back once,
 * with what is wrong in plain words, when something only the board can
 * put right is wrong; the better of its two answers mended silently
 * (mendPlan); and a safe shot given to every line still left without a
 * picture. The maker never sees a problem: what is stored is a plan every
 * check passes, and never a card of words.
 */
import type { FilmShape } from '../../../contracts';
import type { LlmGatewayPort, LlmUsage } from '../../ports/llm.port';
import { readMapBase } from '../scene-map';
import type { EditorResearch, EditorWorld } from '../studio/studio-editor';
import type { EditorialRow } from '../studio/studio-editorial';
import {
  SERIOUS,
  SHOT_LIMITS,
  WHOLE_SET,
  carryMove,
  checkPlan,
  fitsShot,
  mendPlan,
  mostShots,
  planOf,
  quotedWords,
  safeShot,
  sameSet,
  weightOf,
  type PlanOptions,
} from './shot-check';
import { clip } from './shot-parts';
import {
  lineSpans,
  narrationOf,
  phraseAt,
  phraseText,
  sceneNarration,
  uniquePhrase,
} from './shot-phrases';
import { mentionsOf } from './shot-mentions';
import { PLAN_PACE, planGaps } from './shot-pace';
import { buildRegistry, promptList, splitTarget } from './shot-registry';
import type {
  PlanInfo,
  PlanShot,
  RegistryEntry,
  ShotPlan,
  ShotProblem,
  TargetRegistry,
} from './types';

/** What a scene is boarded from. */
export interface BoardShotsInput {
  /** Its lines, in order, as the editor wrote them. */
  rows: readonly EditorialRow[];
  /** Each line's claims, where they differ from the line's own (by line). */
  rowClaims?: readonly (readonly string[])[];
  research: EditorResearch | null;
  world: EditorWorld | null;
  /** The shape the film is made in first; the same plan plays both. */
  shape?: FilmShape;
  /** Where the scene is: for the prompt's words only. */
  scene?: {
    index: number;
    of: number;
    title: string;
    seconds: number;
    episode?: string;
  };
  /** Whom it teaches: how simply it is shown, never who is on screen. */
  audience?: string | null;
  /** Pictures the picture desk cleared (WP11). */
  pictures?: readonly RegistryEntry[];
  /** The kit's ids (WP9): none yet. */
  kit?: readonly string[];
}

export interface BoardShotsResult {
  /** The plan stored: mended, every line with a picture. */
  plan: ShotPlan;
  registry: TargetRegistry;
  /** What was wrong with the board's answer before code mended it: for the log, never the maker. */
  problems: ShotProblem[];
  /** What was wrong with its first answer, when it was sent back: for the log. */
  firstProblems: ShotProblem[];
  /** Each model call, for the ledger. */
  usage: LlmUsage[];
  /** Whether the board was sent back once. */
  sentBack: boolean;
}

/** A scene's lines with the claims given for them. */
const linesOf = (input: BoardShotsInput) =>
  input.rows.map((row, k) => ({
    ...row,
    claims: [...(input.rowClaims?.[k] ?? row.claims)],
  }));

/** The scene's registry. */
const registryFor = (input: BoardShotsInput) =>
  buildRegistry({
    rows: linesOf(input),
    research: input.research,
    world: input.world,
    pictures: input.pictures,
  });

/** What the checks are told of the scene: its kit, whether the show has its map, its lines, and whether it opens the episode. */
const optionsFor = (input: BoardShotsInput): PlanOptions => ({
  kit: input.kit ?? [],
  map: Boolean(readMapBase(input.world?.base)),
  lines: linesOf(input),
  opening: input.scene?.index === 0,
});

/**
 * A mended plan given every line a picture and something new every few
 * words, then mended again; once more if the mend took away what the
 * pace needed.
 */
function finished(
  plan: ShotPlan,
  input: BoardShotsInput,
  registry: TargetRegistry,
): ShotPlan {
  const lines = linesOf(input);
  const narration = sceneNarration(lines);
  const options = optionsFor(input);
  const n = narrationOf(narration);
  const pauses = lineSpans(lines)
    .slice(1)
    .map(([a]) => a);
  let out = plan;
  for (let round = 0; round < 2; round += 1) {
    const covered = withSafeShots(out, lines, registry, input.world);
    const paced = withPace(covered, lines, registry, input.world);
    out = mendPlan(paced, narration, registry, options);
    if (!planGaps(out, n, pauses).length) break;
  }
  return out;
}

/** The board's parts: the scene, what it may name, and its lines (the fake reads them too). */
export function shotParts(
  input: BoardShotsInput,
  registry: TargetRegistry,
): string[] {
  const { scene, world } = input;
  const base = readMapBase(world?.base);
  const lines = linesOf(input);
  return [
    scene
      ? `The scene: scene ${scene.index + 1} of ${scene.of}${scene.episode ? ` of "${scene.episode}"` : ''}, "${scene.title}", about ${scene.seconds} seconds.${scene.index === 0 ? ' It opens the episode: its first picture is there and moving from the first word, and something changes by the third or fourth word.' : ''}`
      : '',
    input.audience
      ? `Whom it teaches: ${input.audience}. That only sets how simply things are shown; no one watching is ever on screen.`
      : '',
    `The film plays ${input.shape === 'tall' ? 'tall (9:16), and wide (16:9)' : 'wide (16:9), and tall (9:16)'} from this one plan: one subject at a time, big.`,
    base
      ? `The show's map: ${base.region}${base.year ? `, in ${base.year}` : ''}, with its regions and seams in the list. Every map shot is this map.`
      : 'This show has no map of its own: no map shot, unless it pins a place marked [pin].',
    world?.held
      ? `The colour held back: "held", only for ${world.held.for}.`
      : '',
    `What you may name (nothing else):\n${promptList(registry)}`,
    [
      "The lines, in order (say: the voice's exact words; about: what the line is about; claims: what it rests on; show: what the editor wants seen, its idea only):",
      ...lines.map((line, k) =>
        [
          `${k + 1}. say: ${line.say}`,
          `   about: ${line.visual} · claims: ${line.claims.join(', ') || 'none'}`,
          line.show ? `   show: ${line.show}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    ].join('\n'),
  ].filter(Boolean);
}

/** A shot moved onto other words: its own, and each of its changes that were on its words. */
function onWords(shot: PlanShot, on: string): PlanShot {
  const was = shot.on;
  return {
    ...shot,
    on,
    info: shot.info.map((i) => (i.on === was ? { ...i, on } : i)),
    camera: shot.camera.map((c) => (c.on === was ? { ...c, on } : c)),
  };
}

/**
 * Every line given a picture: a line on which no shot starts and nothing
 * of the shot it is under comes on gets a safe shot on its first words.
 * A safe shot that only carries the shot before on is that shot's camera
 * moving on the line's words, where it has a move to spare, not a new
 * shot; and so is any once the scene has all the shots it may have.
 */
export function withSafeShots(
  plan: ShotPlan,
  rows: readonly Pick<EditorialRow, 'say' | 'claims' | 'visual'>[],
  registry: TargetRegistry,
  world: Pick<EditorWorld, 'base' | 'era'> | null,
): ShotPlan {
  const n = narrationOf(sceneNarration(rows));
  const spans = lineSpans(rows);
  const most = mostShots(sceneNarration(rows));
  const shots = plan.shots.map((s) => ({ ...s, camera: [...s.camera] }));
  const start = (s: PlanShot) => phraseAt(n, s.on);
  rows.forEach((row, k) => {
    const [a, b] = spans[k];
    if (a >= b) return;
    const busy = shots.some((s) => {
      const from = start(s);
      if (from >= a && from < b) return true;
      return [...s.info.map((i) => i.on), ...s.camera.map((c) => c.on)].some(
        (on) => {
          const at = phraseAt(n, on, Math.max(0, from));
          return at >= a && at < b;
        },
      );
    });
    if (busy) return;
    const before = shots.filter((s) => start(s) >= 0 && start(s) < a);
    const previous = before[before.length - 1] ?? null;
    const next = shots.find((s) => start(s) >= b) ?? null;
    const on = phraseText(n, a, Math.min(3, b - a));
    const safe = onWords(
      safeShot(row, registry, world, { previous, next }),
      on,
    );
    // The shot before, its camera moving on this line's words.
    const carried = () => {
      if (!previous || previous.camera.length >= SHOT_LIMITS.camera)
        return false;
      previous.camera.push(carryMove(previous, on));
      return true;
    };
    if (
      previous &&
      safe.join === 'continue' &&
      sameSet(previous.set, safe.set) &&
      carried()
    )
      return;
    // A new shot within the scene's budget of shots; past it, the picture
    // before holds with its camera moving (the timing fills what is left).
    if (shots.length >= most) {
      carried();
      return;
    }
    shots.splice(previous ? shots.indexOf(previous) + 1 : 0, 0, safe);
  });
  return { shots };
}

/** A change added for the pace: where it lands, three words of the narration said once. */
const wordsAt = (n: ReturnType<typeof narrationOf>, at: number) => {
  const spot = uniquePhrase(n, at, 3);
  return phraseText(n, spot.at, spot.length);
};

/**
 * What a set shows that the pace may bring on: on the map, a place pinned
 * or a region filled the first time (marked after); a seam drawn; on a
 * chart, a number or a date of it marked. Null for what the set cannot
 * show.
 */
function changeFor(
  shot: PlanShot,
  entry: RegistryEntry,
  on: string,
  done: ReadonlySet<string>,
  registry: TargetRegistry,
): PlanInfo | null {
  const change = changeOf(shot, entry, on, done);
  return change && fitsShot(change, shot, registry) ? change : null;
}

function changeOf(
  shot: PlanShot,
  entry: RegistryEntry,
  on: string,
  done: ReadonlySet<string>,
): PlanInfo | null {
  const set = shot.set;
  if (set.kind === 'map') {
    if (entry.kind === 'place' && entry.geo)
      return {
        recipe: done.has(entry.name) ? 'mark' : 'pin',
        target: entry.name,
        on,
      };
    if (entry.kind === 'region')
      return {
        recipe: done.has(entry.name) ? 'mark' : 'fill',
        target: entry.name,
        on,
      };
    if (entry.kind === 'seam')
      return {
        recipe: done.has(entry.name) ? 'mark' : 'seam',
        target: entry.name,
        on,
      };
    return null;
  }
  if (
    set.kind === 'chart' &&
    (entry.kind === 'number' || entry.kind === 'date')
  )
    return { recipe: 'mark', target: entry.name, on };
  return null;
}

/** The parts of a chart in the order it shows them, as the board names them (part:<words>). */
function partsInOrder(shot: PlanShot): string[] {
  if (shot.set.kind !== 'chart') return [];
  const spec = shot.set.chart.spec;
  const list = (raw: unknown): Record<string, unknown>[] =>
    Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const text = (raw: unknown) => (typeof raw === 'string' ? raw.trim() : '');
  switch (shot.set.chart.kind) {
    case 'timeline':
      return list(spec.events).map((e) => text(e.when));
    case 'flow':
      return list(spec.nodes).map((e) => text(e.label));
    case 'chart':
      return list(spec.bars).map((e) => text(e.label));
    case 'split':
      return list(spec.sides).map((e) => text(e.label));
    case 'seats':
      return list(spec.groups).map((e) => text(e.name));
    case 'calendar':
      return list(spec.calendars).flatMap((c) =>
        (Array.isArray(c.dates) ? (c.dates as unknown[]) : []).map(text),
      );
    default:
      return [];
  }
}

/**
 * A picture of what the voice names that the map does not show: a date's
 * calendar sheet, named by what happened (the research's words for it);
 * a person's trace, their own words as a quote or their place pinned on
 * the map. Null when there is none.
 */
function pictureOf(
  entry: RegistryEntry,
  on: string,
  registry: TargetRegistry,
): PlanShot | null {
  const base = {
    on,
    actors: [],
    life: [],
    join: 'cut' as const,
  };
  if (entry.kind === 'date') {
    const when = splitTarget(entry.name).rest;
    const name = clip(entry.about.replace(/^(?:the|a|an)\s+/iu, ''), 3);
    return {
      ...base,
      set: {
        kind: 'chart',
        chart: {
          kind: 'calendar',
          spec: {
            calendars: [{ label: name || null, dates: [when] }],
            merge: null,
          },
        },
      },
      info: [],
      camera: [{ move: 'establish', on }],
      focal: WHOLE_SET,
    };
  }
  if (entry.kind === 'person' && entry.trace?.kind === 'quote') {
    const claim = registry.resolve(entry.trace.ref);
    const text = claim ? quotedWords(claim.about) : '';
    if (!text) return null;
    return {
      ...base,
      set: {
        kind: 'chart',
        chart: {
          kind: 'quote',
          spec: {
            text,
            speaker: clip(splitTarget(entry.name).rest, 4),
            when: null,
          },
        },
      },
      info: [],
      camera: [{ move: 'establish', on }],
      life: ['grain'],
      focal: WHOLE_SET,
    };
  }
  if (entry.kind === 'person' && entry.trace?.kind === 'place') {
    const place = registry.resolve(entry.trace.ref);
    if (!place?.geo) return null;
    return {
      ...base,
      set: { kind: 'map', tilt: 'flat' },
      info: [{ recipe: 'pin', target: place.name, on }],
      camera: [{ move: 'travel', target: place.name, on }],
      life: ['cloud-shadows'],
      focal: place.name,
    };
  }
  return null;
}

/**
 * A plan given something new every few words (PLAN_PACE): through each
 * stretch the voice talks over with nothing new, the first thing its
 * words name that the shot on screen can show comes on as it is named (a
 * place pinned, a region filled, a number or a date marked; a move to it
 * when the shot has no room for another change); where the shot can show
 * none of it, the map cuts in on a place or a region the words name, or
 * a new shot where the voice moves on to its next line (that line's own:
 * the map on its place, a count of the number it says, its exact words);
 * and only then, on the map, a region it has not named yet named in turn,
 * or on a chart its next part marked. Never words standing in for a
 * picture, and never a still picture the voice talks over for long.
 */
export function withPace(
  plan: ShotPlan,
  rows: readonly Pick<EditorialRow, 'say' | 'claims' | 'visual'>[],
  registry: TargetRegistry,
  world: Pick<EditorWorld, 'base' | 'era'> | null,
): ShotPlan {
  const n = narrationOf(sceneNarration(rows));
  const spans = lineSpans(rows);
  const pauses = spans.slice(1).map(([a]) => a);
  const mentions = mentionsOf(n, registry);
  const map = Boolean(readMapBase(world?.base));
  const shots = plan.shots.map((s) => ({
    ...s,
    info: [...s.info],
    camera: [...s.camera],
  }));
  const tried = new Set<string>();
  for (let pass = 0; pass < 48; pass += 1) {
    const gap = planGaps({ shots }, n, pauses).find(
      (g) => !tried.has(`${g.from}:${g.to}`),
    );
    if (!gap) break;
    tried.add(`${gap.from}:${gap.to}`);
    const k = gap.shot;
    const shot = shots[k];
    // Where something new may land: room from the change before, and in
    // reach, so the stretch before it is short enough.
    const lo = gap.from + PLAN_PACE.roomWords;
    const end = gap.to === n.keys.length ? n.keys.length : gap.to - 2;
    const reach = Math.min(end, gap.from + PLAN_PACE.maxWords);
    if (lo > reach) continue;
    const done = new Set(
      shots
        .slice(0, k + 1)
        .flatMap((s) => s.info.map((i) => i.target ?? ''))
        .filter(Boolean),
    );
    const named = mentions.filter((m) => m.at >= lo && m.at <= reach);
    // 1. What the shot on screen shows, named in these words.
    let fixed = false;
    for (const m of named) {
      const change = changeFor(shot, m.entry, wordsAt(n, m.at), done, registry);
      if (!change) continue;
      if (shot.info.length < SHOT_LIMITS.info) shot.info.push(change);
      else if (shot.camera.length < SHOT_LIMITS.camera)
        shot.camera.push({
          move: 'travel',
          target: m.entry.name,
          on: change.on,
        });
      else continue;
      fixed = true;
      break;
    }
    // A chart's own part, named in these words.
    if (!fixed && shot.set.kind === 'chart') {
      for (const part of partsInOrder(shot)) {
        const at = phraseAt(n, part, lo);
        if (!part || at < 0 || at > reach) continue;
        if (shot.info.length >= SHOT_LIMITS.info) break;
        shot.info.push({
          recipe: 'mark',
          target: `part:${part}`,
          on: wordsAt(n, at),
        });
        fixed = true;
        break;
      }
    }
    if (fixed) continue;
    // 2. The map, cut to on a place or a region these words name.
    const onMap = named.find(
      (m) =>
        (m.entry.kind === 'place' && m.entry.geo) || m.entry.kind === 'region',
    );
    if (map && onMap && shot.set.kind !== 'map') {
      const on = wordsAt(n, onMap.at);
      const change = changeOf(
        { ...shot, set: { kind: 'map', tilt: 'flat' } },
        onMap.entry,
        on,
        done,
      )!;
      shots.splice(k + 1, 0, {
        on,
        set: { kind: 'map', tilt: 'flat' },
        actors: [],
        info: [change],
        life: ['cloud-shadows'],
        camera: [{ move: 'travel', target: onMap.entry.name, on }],
        join: 'cut',
        focal: onMap.entry.name,
      });
      continue;
    }
    // A date the voice says: its calendar sheet; a person it names: their
    // trace (their own words, or their place on the map).
    const other = named.find(
      (m) =>
        (m.entry.kind === 'date' &&
          !['timeline', 'calendar'].includes(
            shot.set.kind === 'chart' ? shot.set.chart.kind : '',
          )) ||
        (m.entry.kind === 'person' && m.entry.trace),
    );
    if (other) {
      const picture = pictureOf(other.entry, wordsAt(n, other.at), registry);
      if (picture) {
        shots.splice(k + 1, 0, picture);
        continue;
      }
    }
    // 3. A new shot where the voice moves on: the next line's own picture.
    const line = spans.findIndex(([a]) => a >= lo && a <= reach);
    if (line >= 0) {
      const own = safeShot(rows[line], registry, world, { previous: shot });
      if (own.join !== 'continue' || !sameSet(own.set, shot.set)) {
        const at = spans[line][0];
        const on = wordsAt(n, at);
        const was = own.on;
        shots.splice(k + 1, 0, {
          ...own,
          on,
          info: own.info.map((i) => (i.on === was ? { ...i, on } : i)),
          camera: own.camera.map((c) => (c.on === was ? { ...c, on } : c)),
        });
        continue;
      }
    }
    // 4. Last, the set itself in turn: on the map a region it has not
    // named yet; on a chart its next part.
    const at = Math.min(reach, Math.max(lo, gap.from + 5));
    const on = wordsAt(n, at);
    if (shot.info.length >= SHOT_LIMITS.info) continue;
    if (shot.set.kind === 'map') {
      // The subject the voice is on, marked; else a region not yet named, named.
      const subject = shot.focal ? registry.resolve(shot.focal) : null;
      const marked = shot.info.some(
        (i) => i.recipe === 'mark' && i.target === subject?.name,
      );
      if (subject && !marked && ['place', 'region'].includes(subject.kind)) {
        shot.info.push({ recipe: 'mark', target: subject.name, on });
        continue;
      }
      const region = registry
        .entries()
        .find((e) => e.kind === 'region' && !done.has(e.name));
      if (region) {
        shot.info.push({ recipe: 'label', target: region.name, on });
        continue;
      }
    }
    const next = partsInOrder(shot).find(
      (part) => part && !shot.info.some((i) => i.target === `part:${part}`),
    );
    if (next) shot.info.push({ recipe: 'mark', target: `part:${next}`, on });
  }
  return { shots };
}

/**
 * A scene's shots by code alone, when the board cannot be had: every
 * line its safe shot (the show's map on its place, a count of its
 * number, a quote of its words, the picture before it carried on).
 * Never a card of words.
 */
export function safePlan(input: BoardShotsInput): {
  plan: ShotPlan;
  registry: TargetRegistry;
} {
  const registry = registryFor(input);
  return { plan: finished({ shots: [] }, input, registry), registry };
}

/** A scene's shots boarded: the board asked, checked, sent back once, mended, and every line given a picture. */
export async function boardShots(
  input: BoardShotsInput,
  llm: Pick<LlmGatewayPort, 'shotsBoard'>,
): Promise<BoardShotsResult> {
  const registry = registryFor(input);
  const lines = linesOf(input);
  const narration = sceneNarration(lines);
  const options = optionsFor(input);
  const parts = shotParts(input, registry);
  const usage: LlmUsage[] = [];

  const first = await llm.shotsBoard({ parts });
  usage.push(first.usage);
  let plan = planOf(first.value, narration, options);
  let problems = checkPlan(plan, narration, registry, options);
  const firstProblems = problems;
  let sentBack = false;
  // Sent back once, for what only the board can put right; the rest is mended.
  if (problems.some((p) => SERIOUS.has(p.code))) {
    sentBack = true;
    const again = await llm.shotsBoard({
      parts,
      previous: first.value,
      problems: problems.map((p) => p.message).slice(0, 16),
    });
    usage.push(again.usage);
    const next = planOf(again.value, narration, options);
    const left = checkPlan(next, narration, registry, options);
    if (weightOf(left) <= weightOf(problems)) [plan, problems] = [next, left];
  }
  const mended = mendPlan(plan, narration, registry, {
    ...options,
    start: false,
  });
  return {
    plan: finished(mended, input, registry),
    registry,
    problems,
    firstProblems,
    usage,
    sentBack,
  };
}

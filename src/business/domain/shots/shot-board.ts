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
import { kitGuide, kitIdsFor } from '../kit/registry';
import type { KitLook } from '../kit/style';
import { readMapBase } from '../scene-map';
import type { EditorResearch, EditorWorld } from '../studio/studio-editor';
import type { EditorialRow } from '../studio/studio-editorial';
import {
  SERIOUS,
  SHOT_LIMITS,
  carryMove,
  checkPlan,
  mendPlan,
  mostShots,
  planOf,
  safeShot,
  sameSet,
  weightOf,
  type PlanOptions,
} from './shot-check';
import {
  lineSpans,
  narrationOf,
  phraseAt,
  phraseText,
  sceneNarration,
} from './shot-phrases';
import { buildRegistry, promptList } from './shot-registry';
import type {
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
  /** The show's look (tech §11): which pieces of the kit it may use. Editorial when absent. */
  look?: KitLook;
  /** The kit's ids it may use: by default every piece drawn for its look. */
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

/** What the checks are told of the scene: its kit, and whether the show has its map. */
const optionsFor = (input: BoardShotsInput): PlanOptions => ({
  kit: input.kit ?? kitIdsFor(input.look ?? 'editorial'),
  map: Boolean(readMapBase(input.world?.base)),
});

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
      ? `The scene: scene ${scene.index + 1} of ${scene.of}${scene.episode ? ` of "${scene.episode}"` : ''}, "${scene.title}", about ${scene.seconds} seconds.${scene.index === 0 ? ' It opens the episode: its first picture is there and moving from the first word.' : ''}`
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
    kitPart(input),
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

/** The kit the scene may stand on its sets, for its look: each piece with its settings and moves; none, no actors. */
function kitPart(input: BoardShotsInput): string {
  const ids = input.kit ?? kitIdsFor(input.look ?? 'editorial');
  const guide = kitGuide(input.look ?? 'editorial')
    .split('\n')
    .filter((row) => ids.some((id) => row.startsWith(`- ${id}:`)))
    .join('\n');
  return guide
    ? `The kit (pieces that may stand on a set or on the map; settings and moves as written):\n${guide}`
    : 'The kit has nothing for this show: plan no actors.';
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
  const lines = linesOf(input);
  const plan = mendPlan(
    withSafeShots({ shots: [] }, lines, registry, input.world),
    sceneNarration(lines),
    registry,
    optionsFor(input),
  );
  return { plan, registry };
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
  const covered = withSafeShots(mended, lines, registry, input.world);
  return {
    plan: mendPlan(covered, narration, registry, options),
    registry,
    problems,
    firstProblems,
    usage,
    sentBack,
  };
}

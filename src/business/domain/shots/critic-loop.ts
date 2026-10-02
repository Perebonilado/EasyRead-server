/**
 * The critic's loop (explainer-animation-plan §9.3; the video's critique
 * loop): a scene of shots, once made, is looked at (its stills, the code
 * checks, its contact sheet), scored by the critic, and, where any score
 * is under the pass score, its three worst problems fixed in its plan and
 * the scene built again on the same voice; round after round, until every
 * score passes, LOOP.rounds critics have looked, or the episode's budget
 * for the critic is spent. A shot the last round still finds wrong in its
 * picture becomes its safe shot: nothing ends below the floor. The last
 * version is judged once more, and the scene keeps the best version the
 * critic judged, so a round whose fixes made it worse is undone.
 *
 * It never stops the film: anything that fails (a still, the critic, a
 * fix, a build) ends the loop on the best version made so far, and says
 * why. A critic's answer that leaves axes unscored is asked again once.
 * What each round saw, scored, asked and cost is written down as it goes
 * (SceneFrames, kept on the scene's row). Pure apart from its ports, which
 * the make gives it.
 */
import { CRITIC_AXES, LOOP, RULES_VERSION } from '../studio/explainer-rules';
import type { CriticAxis } from '../studio/explainer-rules';
import type { FrameProblem, FrameScores } from './frame-checks';
import {
  axesFor,
  judged,
  passes,
  problemsInWords,
  type CriticFix,
  type Critique,
} from './shot-critic';
import type { AppliedFix, FixResult } from './shot-fix';
import type { ShotPlan } from './types';
import type { SceneDto } from '../../../contracts';

/** One made version of the scene: its film, its plan, and where it is kept. */
export interface LoopVersion {
  scene: SceneDto;
  plan: ShotPlan;
  /** Its film's storage key: what a round looked at. */
  sceneKey: string;
}

/** What a look at a version found: its sheet, kept, and what code measured. */
export interface LoopLook {
  /** The contact sheet as the critic sees it (a PNG). */
  png: Buffer;
  /** Where it was kept; null when it could not be. */
  sheetKey: string | null;
  stills: number;
  checks: { scores: FrameScores; problems: FrameProblem[] } | null;
}

/** One round, as kept on the scene. */
export interface FramesRound {
  round: number;
  /** The version looked at. */
  sceneKey: string;
  sheetKey: string | null;
  stills: number;
  /** What code measured (0 to 10) and found, in a few lines. */
  checks: Pick<
    FrameScores,
    'readability' | 'composition' | 'pace' | 'truth' | 'overall'
  > | null;
  problems: string[];
  /** The critic's scores and verdict; null when it was not asked (the budget, the last look). */
  critic: {
    scores: Partial<Record<CriticAxis, { score: number; why: string }>>;
    verdict: string;
  } | null;
  fixes: CriticFix[];
  /** What each fix came to. */
  applied: { kind: string; shot: number; outcome: string; what: string }[];
  costUsd: number;
  ms: number;
}

/** How a loop ended. */
export type LoopEnd =
  /** Every score passed. */
  | 'passed'
  /** The rounds ran out; the last round's failing pictures made safe. */
  | 'rounds'
  /** The episode's budget for the critic was spent. */
  | 'budget'
  /** Out of time. */
  | 'time'
  /** The critic gave no scores to judge by. */
  | 'unjudged'
  /** It failed, but asked for nothing code could change. */
  | 'unchanged'
  /** Something failed: the last version kept. */
  | 'error';

/** Everything the loop did to a scene, as its row keeps it (migration 0067). */
export interface SceneFrames {
  version: 1;
  rules: number;
  /** When it was written. */
  at: string;
  rounds: FramesRound[];
  ended: LoopEnd | 'running';
  /** The critic's and the board's spend on it, in dollars. */
  costUsd: number;
  /** The version kept, by its film's key: the best the critic judged. */
  kept?: string;
  /** The kept version's scores, by axis, and whether they pass. */
  scores?: Partial<Record<CriticAxis, number>>;
  pass?: boolean;
  /** Shots made safe after the last round, numbered as the critic saw them. */
  safe?: number[];
  error?: string;
}

/** What the loop is given to do its work with. */
export interface CriticLoopPorts {
  /** The version's stills taken, checked by code and tiled into its sheet, which is kept. */
  look(version: LoopVersion, round: number): Promise<LoopLook>;
  /**
   * The critic asked about a sheet: its answer made sound, and what it
   * cost. `missing`: the axes its last answer left unscored, asked again.
   */
  critic(
    version: LoopVersion,
    look: LoopLook,
    missing?: CriticAxis[],
  ): Promise<{ critique: Critique; costUsd: number }>;
  /** Fixes applied to the version's plan, with the board where they need it, and what that cost. */
  fix(
    version: LoopVersion,
    fixes: CriticFix[],
  ): Promise<FixResult & { costUsd: number }>;
  /** A plan built, timed and composed on the version's voice and kept: the next version. */
  remake(
    plan: ShotPlan,
    from: LoopVersion,
    round: number,
  ): Promise<LoopVersion>;
  /** The loop written down as it goes; a failure to is only logged. */
  record?(frames: SceneFrames): Promise<void>;
  log?(line: string): void;
  /** The time now, in ms (a clock for the deadline). */
  now?(): number;
}

export interface CriticLoopInput {
  first: LoopVersion;
  /** The episode's opening scene: its hook is scored too. */
  opening: boolean;
  /** What the critic may still spend on this scene, in dollars. */
  budgetUsd: number;
  /** A critic's call, as expected before any is made: the loop stops rather than pass the budget. */
  estimateUsd?: number;
  rounds?: number;
  /** When the loop must stop by, on the ports' clock. */
  deadline?: number;
}

export interface CriticLoopResult {
  /** The version the scene ends on: the best the critic judged (a tie, the later), never one that failed to be made. */
  version: LoopVersion;
  frames: SceneFrames;
  /** Whether it is another version than the first. */
  changed: boolean;
  /** Every version made, the first included: those not kept are the caller's to discard. */
  versions: LoopVersion[];
}

/** A critic's call, as expected before one is made: GPT-5.4 mini with a sheet and a scene's words. */
export const CRITIC_CALL_USD = 0.02;

/**
 * Fixes that say a shot's picture itself is wrong: in the last round, its
 * shot becomes its safe shot rather than being drawn again.
 */
const PICTURE_WRONG = new Set<CriticFix['kind']>(['change-set', 'safe-shot']);

/** The fixes the last round makes: a shot whose picture is still wrong made safe, the rest as asked. */
export function lastRoundFixes(fixes: readonly CriticFix[]): CriticFix[] {
  return fixes.map((fix) =>
    PICTURE_WRONG.has(fix.kind)
      ? { ...fix, kind: 'safe-shot', note: `still wrong: ${fix.note}` }
      : fix,
  );
}

/** How good a judged version is, to keep the best: the mean of its scores on the axes it is judged on. */
export function meritOf(critique: Critique, opening: boolean): number {
  const all = axesFor(opening).flatMap((axis) =>
    critique.scores[axis] ? [critique.scores[axis].score] : [],
  );
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
}

/**
 * Two answers about one sheet made one: the second, where it scored every
 * axis; else every axis either scored (the second's first), and the fixes
 * of whichever gave some.
 */
function together(
  first: Critique,
  second: Critique,
  opening: boolean,
): Critique {
  if (judged(second, opening)) return second;
  return {
    scores: { ...first.scores, ...second.scores },
    fixes: second.fixes.length ? second.fixes : first.fixes,
    verdict: second.verdict || first.verdict,
  };
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The critic's loop on a scene, from its first made version (see the module's comment). */
export async function runCriticLoop(
  input: CriticLoopInput,
  ports: CriticLoopPorts,
): Promise<CriticLoopResult> {
  const rounds = Math.max(1, input.rounds ?? LOOP.rounds);
  const { opening } = input;
  const now = () => (ports.now ? ports.now() : Date.now());
  const log = (line: string) => ports.log?.(line);
  let version = input.first;
  const versions: LoopVersion[] = [version];
  /** What the critic made of each version it judged. */
  const verdicts = new Map<LoopVersion, Critique>();
  /** Each version's parent: the version whose fixes made it. */
  const parent = new Map<LoopVersion, LoopVersion>();
  let spent = 0;
  let lastCall = input.estimateUsd ?? CRITIC_CALL_USD;
  const frames: SceneFrames = {
    version: 1,
    rules: RULES_VERSION,
    at: new Date(now()).toISOString(),
    rounds: [],
    ended: 'running',
    costUsd: 0,
  };
  const write = async () => {
    frames.at = new Date(now()).toISOString();
    frames.costUsd = round4(spent);
    await ports
      .record?.(structuredClone(frames))
      .catch((error: Error) => log(`the frames not written: ${error.message}`));
  };
  const late = () => input.deadline !== undefined && now() > input.deadline;
  const affordable = () => spent + lastCall <= input.budgetUsd;

  /** A version's merit: the critic's; for one it did not judge, its parent's (its fixes assumed to do no harm). */
  const merit = (v: LoopVersion): number => {
    const own = verdicts.get(v);
    if (own && judged(own, opening)) return meritOf(own, opening);
    const from = parent.get(v);
    return from ? merit(from) : -Infinity;
  };
  /** The version to keep: the best judged, a tie going to the later. */
  const best = (): LoopVersion =>
    versions.reduce((kept, v) => (merit(v) >= merit(kept) ? v : kept));
  const finish = async (how: LoopEnd, error?: string) => {
    const kept = best();
    const verdict = verdicts.get(kept);
    frames.ended = how;
    frames.kept = kept.sceneKey;
    if (verdict) {
      frames.scores = Object.fromEntries(
        CRITIC_AXES.flatMap((axis) =>
          verdict.scores[axis] ? [[axis, verdict.scores[axis].score]] : [],
        ),
      );
      frames.pass = passes(verdict, opening);
    } else frames.pass = false;
    if (error) frames.error = error.slice(0, 300);
    if (kept !== version)
      log(
        `kept ${kept === input.first ? 'the scene as first made' : 'an earlier version'} (${merit(kept).toFixed(2)} against ${merit(version).toFixed(2)})`,
      );
    await write();
    return {
      version: kept,
      frames,
      changed: kept !== input.first,
      versions,
    };
  };

  /** What a look found, as a round keeps it. */
  const roundOf = (round: number, look: LoopLook): FramesRound => ({
    round,
    sceneKey: version.sceneKey,
    sheetKey: look.sheetKey,
    stills: look.stills,
    checks: look.checks
      ? {
          readability: look.checks.scores.readability,
          composition: look.checks.scores.composition,
          pace: look.checks.scores.pace,
          truth: look.checks.scores.truth,
          overall: look.checks.scores.overall,
        }
      : null,
    problems: look.checks ? problemsInWords(look.checks.problems) : [],
    critic: null,
    fixes: [],
    applied: [],
    costUsd: 0,
    ms: 0,
  });

  /** The critic asked about the version now, asked once more where it left axes unscored. */
  const ask = async (look: LoopLook, kept: FramesRound): Promise<Critique> => {
    const first = await ports.critic(version, look);
    spent += first.costUsd;
    kept.costUsd += first.costUsd;
    if (first.costUsd > 0) lastCall = first.costUsd;
    let critique = first.critique;
    if (!judged(critique, opening) && affordable()) {
      const missing = axesFor(opening).filter((axis) => !critique.scores[axis]);
      log(`round ${kept.round}: asked again for ${missing.join(', ')}`);
      const again = await ports.critic(version, look, missing);
      spent += again.costUsd;
      kept.costUsd += again.costUsd;
      critique = together(critique, again.critique, opening);
    }
    kept.critic = { scores: critique.scores, verdict: critique.verdict };
    verdicts.set(version, critique);
    log(
      `round ${kept.round}: ${CRITIC_AXES.flatMap((axis) => (critique.scores[axis] ? [`${axis} ${critique.scores[axis].score}`] : [])).join(', ')}${passes(critique, opening) ? ' (passes)' : ''}`,
    );
    return critique;
  };

  /** The version it ends on looked at once more, and judged where the budget allows, so its sheet is kept and the best version found. */
  const lastLook = async (round: number, judge: boolean) => {
    if (late()) return;
    try {
      const look = await ports.look(version, round);
      const kept = roundOf(round, look);
      frames.rounds.push(kept);
      if (judge && affordable() && !late()) await ask(look, kept);
    } catch (error) {
      log(`the last look failed: ${(error as Error).message}`);
    }
  };

  for (let round = 1; round <= rounds; round += 1) {
    const started = now();
    if (late()) return finish('time');
    // The budget: never a call that would pass it, nor stills for one.
    if (!affordable()) {
      log(
        `round ${round}: the critic's budget is spent ($${spent.toFixed(3)} of $${input.budgetUsd.toFixed(2)})`,
      );
      if (round > 1) await lastLook(round, false);
      return finish('budget');
    }
    let look: LoopLook;
    try {
      look = await ports.look(version, round);
    } catch (error) {
      return finish(
        'error',
        `round ${round}: the stills: ${(error as Error).message}`,
      );
    }
    const kept = roundOf(round, look);
    frames.rounds.push(kept);
    const close = () => {
      kept.ms = now() - started;
    };
    let critique: Critique;
    try {
      critique = await ask(look, kept);
    } catch (error) {
      close();
      return finish(
        'error',
        `round ${round}: the critic: ${(error as Error).message}`,
      );
    }
    if (!judged(critique, opening)) {
      close();
      return finish('unjudged');
    }
    if (passes(critique, opening)) {
      close();
      return finish('passed');
    }
    const last = round === rounds;
    const fixes = last ? lastRoundFixes(critique.fixes) : critique.fixes;
    kept.fixes = fixes;
    if (!fixes.length) {
      close();
      return finish('unchanged');
    }
    if (late()) {
      close();
      return finish('time');
    }
    let fixed: FixResult & { costUsd: number };
    try {
      fixed = await ports.fix(version, fixes);
      spent += fixed.costUsd;
      kept.costUsd += fixed.costUsd;
    } catch (error) {
      close();
      return finish(
        'error',
        `round ${round}: the fixes: ${(error as Error).message}`,
      );
    }
    kept.applied = fixed.applied.map((one: AppliedFix) => ({
      kind: one.fix.kind,
      shot: one.fix.shot,
      outcome: one.outcome,
      what: one.what,
    }));
    if (last)
      frames.safe = fixed.applied
        .filter(
          (one) => one.fix.kind === 'safe-shot' && one.outcome !== 'skipped',
        )
        .map((one) => one.fix.shot);
    if (JSON.stringify(fixed.plan) === JSON.stringify(version.plan)) {
      close();
      return finish('unchanged');
    }
    try {
      const next = await ports.remake(fixed.plan, version, round);
      parent.set(next, version);
      versions.push(next);
      version = next;
    } catch (error) {
      close();
      return finish(
        'error',
        `round ${round}: the build: ${(error as Error).message}`,
      );
    }
    close();
    await write();
  }
  // The rounds are out: the version it ends on looked at and judged once
  // more, so the best of them is kept.
  await lastLook(rounds + 1, true);
  return finish('rounds');
}

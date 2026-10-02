/**
 * The critic's loop (explainer-animation-plan §9.3; the video's critique
 * loop): a scene of shots, once made, is looked at (its stills, the code
 * checks, its contact sheet), scored by the critic, and, where any score
 * is under the pass score, its three worst problems fixed in its plan and
 * the scene built again on the same voice; round after round, until every
 * score passes, LOOP.rounds critics have looked, or the episode's budget
 * for the critic is spent. A shot the last round still finds wrong in its
 * picture becomes its safe shot: nothing ends below the floor.
 *
 * It never stops the film: anything that fails (a still, the critic, a
 * fix, a build) ends the loop on the last version that was made and kept,
 * and says why. What each round saw, scored, asked and cost is written
 * down as it goes (SceneFrames, kept on the scene's row). Pure apart from
 * its ports, which the make gives it.
 */
import { CRITIC_AXES, LOOP, RULES_VERSION } from '../studio/explainer-rules';
import type { CriticAxis } from '../studio/explainer-rules';
import type { FrameProblem, FrameScores } from './frame-checks';
import {
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
  /** The last critic's scores, by axis, and whether they passed. */
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
  /** The critic asked about a sheet: its answer made sound, and what it cost. */
  critic(
    version: LoopVersion,
    look: LoopLook,
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
  /** The version the scene ends on: the last made and kept without error. */
  version: LoopVersion;
  frames: SceneFrames;
  /** Whether it is another version than the first. */
  changed: boolean;
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

const round2 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The critic's loop on a scene, from its first made version (see the module's comment). */
export async function runCriticLoop(
  input: CriticLoopInput,
  ports: CriticLoopPorts,
): Promise<CriticLoopResult> {
  const rounds = Math.max(1, input.rounds ?? LOOP.rounds);
  const now = () => (ports.now ? ports.now() : Date.now());
  const log = (line: string) => ports.log?.(line);
  let version = input.first;
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
    frames.costUsd = round2(spent);
    await ports
      .record?.(structuredClone(frames))
      .catch((error: Error) => log(`the frames not written: ${error.message}`));
  };
  const end = async (how: LoopEnd, error?: string) => {
    frames.ended = how;
    if (error) frames.error = error.slice(0, 300);
    await write();
    return { version, frames, changed: version !== input.first };
  };
  const late = () => input.deadline !== undefined && now() > input.deadline;

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
  /** The version it ends on looked at once more, by code alone, so its sheet is kept beside the first's. */
  const lastLook = async (round: number) => {
    if (late()) return;
    try {
      frames.rounds.push(roundOf(round, await ports.look(version, round)));
    } catch (error) {
      log(`the last look failed: ${(error as Error).message}`);
    }
  };

  for (let round = 1; round <= rounds; round += 1) {
    const started = now();
    if (late()) return end('time');
    // The budget: never a call that would pass it, nor stills for one.
    if (spent + lastCall > input.budgetUsd) {
      log(
        `round ${round}: the critic's budget is spent ($${spent.toFixed(3)} of $${input.budgetUsd.toFixed(2)})`,
      );
      if (round > 1) await lastLook(round);
      return end('budget');
    }
    let look: LoopLook;
    try {
      look = await ports.look(version, round);
    } catch (error) {
      return end(
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
      const asked = await ports.critic(version, look);
      critique = asked.critique;
      spent += asked.costUsd;
      kept.costUsd += asked.costUsd;
      if (asked.costUsd > 0) lastCall = asked.costUsd;
    } catch (error) {
      close();
      return end(
        'error',
        `round ${round}: the critic: ${(error as Error).message}`,
      );
    }
    kept.critic = { scores: critique.scores, verdict: critique.verdict };
    frames.scores = Object.fromEntries(
      CRITIC_AXES.flatMap((axis) =>
        critique.scores[axis] ? [[axis, critique.scores[axis].score]] : [],
      ),
    );
    frames.pass = passes(critique, input.opening);
    log(
      `round ${round}: ${CRITIC_AXES.flatMap((axis) => (critique.scores[axis] ? [`${axis} ${critique.scores[axis].score}`] : [])).join(', ')}${frames.pass ? ' (passes)' : ''}`,
    );
    if (!judged(critique, input.opening)) {
      close();
      return end('unjudged');
    }
    if (frames.pass) {
      close();
      return end('passed');
    }
    const last = round === rounds;
    const fixes = last ? lastRoundFixes(critique.fixes) : critique.fixes;
    kept.fixes = fixes;
    if (!fixes.length) {
      close();
      return end('unchanged');
    }
    if (late()) {
      close();
      return end('time');
    }
    let fixed: FixResult & { costUsd: number };
    try {
      fixed = await ports.fix(version, fixes);
      spent += fixed.costUsd;
      kept.costUsd += fixed.costUsd;
    } catch (error) {
      close();
      return end(
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
      return end('unchanged');
    }
    try {
      version = await ports.remake(fixed.plan, version, round);
    } catch (error) {
      close();
      return end(
        'error',
        `round ${round}: the build: ${(error as Error).message}`,
      );
    }
    close();
    await write();
  }
  // The rounds are out: the version it ends on looked at once more.
  await lastLook(rounds + 1);
  return end('rounds');
}

/**
 * The turn check (studio-turns-plan): how a made film's people turn,
 * read from its view timelines (`acting.view`) alone, for the log and the
 * tests. A turn is a change of view that is not at a cut (at a cut the
 * camera moves, not the person). It reports, for each person drawn from
 * every side:
 *
 *  - how often they turn (a minute, and the gaps between turns);
 *  - whips: a turn of three views or more (135 degrees and over) in one,
 *    as profile to profile the other way round, when they are not
 *    walking or using a thing of the set;
 *  - flip-backs: a turn undone within FLIP_BACK_MS (A to B and back to A);
 *  - short holds: a view held less than MIN_HOLD_MS between two turns,
 *    with no walk or thing used to turn them;
 *  - faces to camera: a turn to the front with nothing to make it (not
 *    walking toward the camera, not sitting down at a table or coming out
 *    of a door, not speaking to a crowd before the camera, not alone).
 *
 * How a turn is drawn (smoothly, in-betweens and all) is the player's
 * part; this is whether the turns are there to be drawn. Pure.
 */
import type { SceneDto, SceneView } from '../../contracts';
import { walksOf } from './scene-film';
import {
  FLIP_BACK_MS,
  MIN_HOLD_MS,
  flipsBack,
  walkFacing,
  wheelSteps,
} from './scene-views';

/** A key this near a cut is at it. */
const CUT_NEAR_MS = 60;

const ORDER: readonly SceneView[] = [
  'front',
  '3q',
  'profile',
  'back3q',
  'back',
];

/** Where a view is on the wheel of eight: 0 the front, round to the right to 4 the back, 5 to 7 back round on the left. */
export function wheelOf(view: SceneView, mirror: 1 | -1): number {
  const k = Math.max(0, ORDER.indexOf(view));
  return mirror < 0 && k > 0 && k < 4 ? 8 - k : k;
}

export type TurnIssueKind = 'whip' | 'flip-back' | 'short-hold' | 'to-camera';

export interface TurnIssue {
  id: string;
  kind: TurnIssueKind;
  atMs: number;
  /** e.g. "profile→profile-left", "held 650ms". */
  what: string;
}

export interface TurnsOfOne {
  id: string;
  turns: number;
  perMinute: number;
  /** The shortest and the middle gap between two turns, ms. */
  shortestGapMs: number | null;
  medianGapMs: number | null;
}

export interface TurnReport {
  people: TurnsOfOne[];
  issues: TurnIssue[];
  counts: Record<TurnIssueKind, number> & { turns: number };
}

const named = (view: SceneView, mirror: 1 | -1) =>
  view === 'front' || view === 'back' || mirror > 0 ? view : `${view}-left`;

/** The moments the camera cuts: a shot's start and end, and a change of place. */
export function cutsOf(scene: Pick<SceneDto, 'effects' | 'steps'>): number[] {
  const out = new Set<number>();
  for (const e of scene.effects ?? [])
    if (e.do === 'zoom' && e.untilMs !== undefined) {
      out.add(e.atMs);
      out.add(e.untilMs);
    }
  let backdrop: string | undefined;
  for (const step of scene.steps) {
    if (step.backdrop && backdrop && step.backdrop !== backdrop)
      out.add(step.atMs);
    if (step.backdrop) backdrop = step.backdrop;
  }
  return [...out].sort((a, b) => a - b);
}

/** The turn check of a made scene. */
export function turnsCheck(
  scene: Pick<
    SceneDto,
    'acting' | 'effects' | 'steps' | 'stagings' | 'setting' | 'durationMs'
  >,
): TurnReport {
  const cuts = cutsOf(scene);
  const atCut = (t: number) => cuts.some((c) => Math.abs(c - t) <= CUT_NEAR_MS);
  const walks = scene.stagings?.wide ? walksOf(scene) : [];
  const W = scene.stagings?.wide?.w ?? 1600;
  const people: TurnsOfOne[] = [];
  const issues: TurnIssue[] = [];
  const minutes = Math.max(1, scene.durationMs) / 60000;
  for (const [id, acting] of Object.entries(scene.acting ?? {})) {
    const keys = acting.view ?? [];
    if (keys.length < 1) continue;
    const walkAt = (t: number) =>
      walks.find((w) => w.id === id && w.from - 250 <= t && t <= w.to + 250);
    const usingAt = (t: number) =>
      (acting.interact ?? []).find((one) =>
        one.steps.some(([, at, ms]) => at - 250 <= t && t <= at + ms + 250),
      );
    /** A walk or a thing used: a real reason to turn at once. */
    const physical = (t: number) => Boolean(walkAt(t) || usingAt(t));
    const turns: { at: number; from: number; to: number; i: number }[] = [];
    for (let i = 1; i < keys.length; i += 1) {
      const from = wheelOf(keys[i - 1][1], keys[i - 1][2]);
      const to = wheelOf(keys[i][1], keys[i][2]);
      if (from === to || atCut(keys[i][0])) continue;
      turns.push({ at: keys[i][0], from, to, i });
    }
    const gaps = turns.slice(1).map((t, k) => t.at - turns[k].at);
    const sorted = [...gaps].sort((a, b) => a - b);
    people.push({
      id,
      turns: turns.length,
      perMinute: Math.round((turns.length / minutes) * 10) / 10,
      shortestGapMs: sorted.length ? sorted[0] : null,
      medianGapMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    });
    for (const turn of turns) {
      const [at, view, mirror] = keys[turn.i];
      const [, fromView, fromMirror] = keys[turn.i - 1];
      const what = `${named(fromView, fromMirror)}→${named(view, mirror)}`;
      if (wheelSteps(turn.from, turn.to) >= 3 && !physical(at))
        issues.push({ id, kind: 'whip', atMs: at, what });
      // Undone: the next key goes back to where this one came from (or beside it).
      const next = keys[turn.i + 1];
      if (
        next &&
        flipsBack(turn.from, turn.to, wheelOf(next[1], next[2])) &&
        next[0] - at < FLIP_BACK_MS &&
        !atCut(next[0]) &&
        !physical(at) &&
        !physical(next[0])
      )
        issues.push({
          id,
          kind: 'flip-back',
          atMs: at,
          what: `${what} and back after ${next[0] - at}ms`,
        });
      else if (
        next &&
        next[0] - at < MIN_HOLD_MS &&
        !atCut(next[0]) &&
        !physical(at) &&
        !physical(next[0])
      )
        issues.push({
          id,
          kind: 'short-hold',
          atMs: at,
          what: `${named(view, mirror)} held ${next[0] - at}ms`,
        });
      if (view === 'front' && !toCameraMeant(id, at)) {
        issues.push({ id, kind: 'to-camera', atMs: at, what });
      }
    }
    /** Whether a turn to the front at `t` has a reason. */
    function toCameraMeant(who: string, t: number): boolean {
      const walk = walkAt(t);
      if (walk && Math.abs(walkFacing(walk.start, walk.end, W)) <= 22)
        return true;
      const using = usingAt(t);
      if (
        using &&
        ['sit-at', 'stand-from', 'come-through'].includes(using.does)
      )
        return true;
      const crowd = (scene.effects ?? []).some(
        (e) =>
          e.do === 'zoom' &&
          e.shot?.kind === 'crowd' &&
          e.target === who &&
          e.atMs <= t &&
          t < (e.untilMs ?? e.atMs),
      );
      if (crowd) return true;
      // Alone on the stage, the viewer is whom they are with.
      let k = -1;
      for (
        let j = 0;
        j < scene.steps.length && scene.steps[j].atMs <= t;
        j += 1
      )
        k = j;
      const show = k >= 0 ? scene.steps[k].show : [];
      const others = show.filter(
        (other) => other !== who && scene.acting?.[other],
      );
      return others.length === 0;
    }
  }
  const counts = {
    turns: people.reduce((n, p) => n + p.turns, 0),
    whip: 0,
    'flip-back': 0,
    'short-hold': 0,
    'to-camera': 0,
  };
  for (const issue of issues) counts[issue.kind] += 1;
  issues.sort((a, b) => a.atMs - b.atMs);
  return { people, issues, counts };
}

/** The turn check as one line for the log. */
export function turnsLine(report: TurnReport): string {
  const { counts } = report;
  const each = report.people
    .map((p) => `${p.id} ${p.turns} (${p.perMinute}/min)`)
    .join(', ');
  const worst = report.issues
    .slice(0, 4)
    .map((i) => `${i.kind} ${i.id} at ${i.atMs}ms ${i.what}`)
    .join('; ');
  return `${counts.turns} turns${each ? ` (${each})` : ''}: ${counts.whip} whips, ${counts['flip-back']} flip-backs, ${counts['short-hold']} short holds, ${counts['to-camera']} unmotivated to camera${worst ? `; ${worst}` : ''}`;
}

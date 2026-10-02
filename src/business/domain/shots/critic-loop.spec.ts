import type { SceneDto } from '../../../contracts';
import { CRITIC_AXES, LOOP } from '../studio/explainer-rules';
import {
  lastRoundFixes,
  runCriticLoop,
  type CriticLoopPorts,
  type LoopVersion,
  type SceneFrames,
} from './critic-loop';
import type { CriticFix, Critique } from './shot-critic';
import type { ShotPlan } from './types';

/** A plan that says which version it is. */
const planOf = (n: number): ShotPlan => ({
  shots: [
    {
      on: `version ${n}`,
      set: { kind: 'plain' },
      actors: [],
      info: [],
      life: [],
      camera: [],
      join: 'cut',
    },
  ],
});

const version = (n: number): LoopVersion => ({
  scene: { id: `scene-${n}` } as unknown as SceneDto,
  plan: planOf(n),
  sceneKey: `key-${n}`,
});

/** A critique with every axis at a score, and fixes. */
const critique = (score: number, fixes: CriticFix[] = []): Critique => ({
  scores: Object.fromEntries(
    CRITIC_AXES.filter((a) => a !== 'hook').map((axis) => [
      axis,
      { score, why: `${axis} at ${score}` },
    ]),
  ),
  fixes,
  verdict: score >= LOOP.passScore ? 'good' : 'not yet',
});

const fixOn = (
  shot: number,
  kind: CriticFix['kind'] = 'enlarge',
): CriticFix => ({
  kind,
  shot,
  note: 'too small',
});

/** Ports that record what they were asked, with a critic giving the scores in turn. */
function ports(
  scores: number[],
  more: Partial<CriticLoopPorts> = {},
  costs = { critic: 0.01, board: 0 },
) {
  const said = {
    looks: [] as string[],
    critics: [] as string[],
    fixes: [] as CriticFix[][],
    remakes: [] as number[],
    records: [] as SceneFrames[],
  };
  let made = 1;
  const p: CriticLoopPorts = {
    look: (v, round) => {
      said.looks.push(`${v.sceneKey}@${round}`);
      return Promise.resolve({
        png: Buffer.from('sheet'),
        sheetKey: `sheet-${round}`,
        stills: 12,
        checks: null,
      });
    },
    critic: (v) => {
      said.critics.push(v.sceneKey);
      const score =
        scores[Math.min(scores.length - 1, said.critics.length - 1)];
      return Promise.resolve({
        critique: critique(score, [fixOn(1), fixOn(2, 'change-set')]),
        costUsd: costs.critic,
      });
    },
    fix: (v, fixes) => {
      said.fixes.push(fixes);
      made += 1;
      return Promise.resolve({
        plan: planOf(made),
        applied: fixes.map((fix) => ({
          fix,
          outcome: 'applied' as const,
          what: 'done',
        })),
        problems: [],
        boardCalls: 0,
        costUsd: costs.board,
      });
    },
    remake: (plan, _from, round) => {
      said.remakes.push(round);
      const n = Number(plan.shots[0].on.split(' ')[1]);
      return Promise.resolve(version(n));
    },
    record: (frames) => {
      said.records.push(frames);
      return Promise.resolve();
    },
    ...more,
  };
  return { p, said };
}

describe("the critic's loop", () => {
  it('stops at once when every score passes: no fix, no new version', async () => {
    const { p, said } = ports([8.5]);
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      p,
    );
    expect(out.frames.ended).toBe('passed');
    expect(out.changed).toBe(false);
    expect(out.version.sceneKey).toBe('key-1');
    expect(said.critics).toEqual(['key-1']);
    expect(said.fixes).toEqual([]);
    expect(out.frames.pass).toBe(true);
    expect(out.frames.rounds).toHaveLength(1);
    expect(out.frames.costUsd).toBe(0.01);
    // Written down as it ends.
    expect(said.records.at(-1)?.ended).toBe('passed');
  });

  it('fixes and builds again until the scores pass', async () => {
    const { p, said } = ports([6, 7, 8.2]);
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      p,
    );
    expect(out.frames.ended).toBe('passed');
    expect(said.critics).toEqual(['key-1', 'key-2', 'key-3']);
    expect(said.remakes).toEqual([1, 2]);
    expect(out.version.sceneKey).toBe('key-3');
    expect(out.changed).toBe(true);
    expect(out.frames.rounds.map((r) => r.sceneKey)).toEqual([
      'key-1',
      'key-2',
      'key-3',
    ]);
    expect(out.frames.rounds[0].applied).toHaveLength(2);
  });

  it('stops after the most rounds, its last failing pictures made safe, and looks once more by code', async () => {
    const { p, said } = ports([5]);
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      p,
    );
    expect(out.frames.ended).toBe('rounds');
    expect(said.critics).toHaveLength(LOOP.rounds);
    // The last round: the shot whose set was wrong becomes its safe shot; the other fix stands.
    expect(said.fixes.at(-1)!.map((f) => f.kind)).toEqual([
      'enlarge',
      'safe-shot',
    ]);
    expect(out.frames.safe).toEqual([2]);
    // A last look at the version it ends on, with no critic.
    expect(said.looks.at(-1)).toBe(`key-${LOOP.rounds + 1}@${LOOP.rounds + 1}`);
    expect(out.frames.rounds.at(-1)!.critic).toBeNull();
    expect(out.version.sceneKey).toBe(`key-${LOOP.rounds + 1}`);
  });

  it('never asks the critic past the budget', async () => {
    const { p, said } = ports([5], {}, { critic: 0.3, board: 0 });
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.5, estimateUsd: 0.3 },
      p,
    );
    expect(out.frames.ended).toBe('budget');
    expect(said.critics).toHaveLength(1);
    // The first round's fixes were built, and that version is kept.
    expect(out.version.sceneKey).toBe('key-2');
    expect(out.frames.costUsd).toBe(0.3);
    // A budget already spent: not even one call.
    const none = ports([5]);
    const out2 = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0 },
      none.p,
    );
    expect(out2.frames.ended).toBe('budget');
    expect(none.said.critics).toEqual([]);
  });

  it('counts the board’s calls against the budget too', async () => {
    const { p, said } = ports([5], {}, { critic: 0.01, board: 0.3 });
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.4 },
      p,
    );
    expect(said.critics).toHaveLength(2);
    expect(out.frames.ended).toBe('budget');
  });

  it('keeps the last good version when a build fails, and says why', async () => {
    let builds = 0;
    const { p } = ports([5], {
      remake: () => {
        builds += 1;
        if (builds === 2)
          return Promise.reject(new Error('the map would not draw'));
        return Promise.resolve(version(2));
      },
    });
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      p,
    );
    expect(out.frames.ended).toBe('error');
    expect(out.frames.error).toContain('the map would not draw');
    expect(out.version.sceneKey).toBe('key-2');
  });

  it('keeps the first version when the stills or the critic fail', async () => {
    const stills = ports([5], {
      look: () => Promise.reject(new Error('Chrome is gone')),
    });
    const a = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      stills.p,
    );
    expect(a.frames.ended).toBe('error');
    expect(a.changed).toBe(false);
    const critic = ports([5], {
      critic: () => Promise.reject(new Error('429')),
    });
    const b = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      critic.p,
    );
    expect(b.frames.ended).toBe('error');
    expect(b.version.sceneKey).toBe('key-1');
    expect(critic.said.remakes).toEqual([]);
  });

  it('does nothing with a critique it cannot judge by, or fixes that change nothing', async () => {
    const opening = ports([5]);
    // The opening scene with no hook scored: not judged.
    const a = await runCriticLoop(
      { first: version(1), opening: true, budgetUsd: 0.6 },
      opening.p,
    );
    expect(a.frames.ended).toBe('unjudged');
    expect(opening.said.fixes).toEqual([]);
    const same = ports([5], {
      fix: (v, fixes) =>
        Promise.resolve({
          plan: v.plan,
          applied: fixes.map((fix) => ({
            fix,
            outcome: 'no-effect' as const,
            what: '',
          })),
          problems: [],
          boardCalls: 0,
          costUsd: 0,
        }),
    });
    const b = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6 },
      same.p,
    );
    expect(b.frames.ended).toBe('unchanged');
    expect(same.said.remakes).toEqual([]);
  });

  it('stops when its time is up', async () => {
    let clock = 0;
    const { p, said } = ports([5], {
      now: () => clock,
      critic: () => {
        clock += 1000;
        return Promise.resolve({
          critique: critique(5, [fixOn(1)]),
          costUsd: 0.01,
        });
      },
    });
    const out = await runCriticLoop(
      { first: version(1), opening: false, budgetUsd: 0.6, deadline: 500 },
      p,
    );
    expect(out.frames.ended).toBe('time');
    expect(said.remakes).toEqual([]);
  });

  it('turns the last round’s wrong pictures into safe shots, leaving the other fixes as they are', () => {
    expect(
      lastRoundFixes([
        fixOn(1, 'change-set'),
        fixOn(2, 'add-camera'),
        fixOn(3, 'safe-shot'),
      ]).map((f) => `${f.shot}:${f.kind}`),
    ).toEqual(['1:safe-shot', '2:add-camera', '3:safe-shot']);
  });
});

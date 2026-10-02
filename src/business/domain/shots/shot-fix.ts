/**
 * The critic's fixes made into plan edits (explainer-animation-plan §9.3;
 * tech §4.1): each fix on the closed list (shot-critic's CRITIC_FIXES)
 * changes the board's plan as an editor would, and the plan is then held
 * to the rules again by mendPlan, so a fix that asks for something the
 * rules forbid (an unknown target, a recipe its set cannot show) comes to
 * nothing rather than to something wrong.
 *
 * A fix that needs new words from the board (a set the shot does not
 * have, the later part of a shot given its own picture) asks the board
 * for that shot's words alone, with the critic's note (one call); with no
 * board, or no answer, the shot falls back to its safe shot, never to a
 * card of words. Fixes name shots as the critic saw them, by their place
 * in the plan before any edit, so a merge or a split never moves what a
 * later fix is about. Pure apart from the board, which the caller gives.
 */
import type { ShotInfoRecipe } from '../../../contracts';
import type { EditorWorld } from '../studio/studio-editor';
import type { EditorialRow } from '../studio/studio-editorial';
import type { CriticFix } from './shot-critic';
import {
  SHOT_LIMITS,
  WHOLE_SET,
  carryMove,
  checkPlan,
  mendPlan,
  safeShot,
  sameSet,
  type PlanOptions,
} from './shot-check';
import { chartKindOf, moveOf, recipeOf, setKindOf } from './shot-lists';
import {
  keysOf,
  lineSpans,
  narrationOf,
  nearestPhrase,
  phraseAt,
  phraseText,
  sceneNarration,
  type Narration,
} from './shot-phrases';
import { looseKey, splitTarget } from './shot-registry';
import type {
  PlanCamera,
  PlanInfo,
  PlanShot,
  ShotPlan,
  ShotProblem,
  TargetRegistry,
} from './types';

/** What the board is asked when a fix needs new words: one shot's words again, with the critic's note. */
export interface BoardAsk {
  /** The shot, numbered from 1 as the critic saw it. */
  shot: number;
  /** The words its new picture starts on, and every word it covers. */
  from: string;
  words: string;
  /** The set the critic asked for ("chart", "split", "map"…), when it named one. */
  set?: string;
  /** Why, in the critic's words. */
  note: string;
}

/** What a fix is applied with: the scene's lines and what it may name, its world, and the board for new words. */
export interface FixContext {
  rows: readonly Pick<EditorialRow, 'say' | 'claims' | 'visual'>[];
  registry: TargetRegistry;
  world: Pick<EditorWorld, 'base' | 'era'> | null;
  options?: PlanOptions;
  /** The board, asked once a fix that needs it; its answer is a plan whose shots for those words are taken. Absent, such a fix falls back. */
  board?: (ask: BoardAsk) => Promise<ShotPlan | null>;
}

/** What became of one fix. */
export interface AppliedFix {
  fix: CriticFix;
  /**
   * applied: the plan changed as asked; boarded: the board drew the shot
   * again; fell-back: it became its safe shot; no-effect: nothing it asked
   * could be done (or the mend undid it); skipped: its shot was gone.
   */
  outcome: 'applied' | 'boarded' | 'fell-back' | 'no-effect' | 'skipped';
  /** What was done, in a few words, for the log. */
  what: string;
}

export interface FixResult {
  plan: ShotPlan;
  applied: AppliedFix[];
  /** What the plan checks still find after the mend: for the log. */
  problems: ShotProblem[];
  /** How many times the board was asked. */
  boardCalls: number;
}

const copy = <T>(value: T): T => structuredClone(value);

/** Fixes that move, hold, frame or retime what a shot shows, and never mean to take any of it away. */
const KEEPS = new Set<CriticFix['kind']>([
  'enlarge',
  'move-event',
  'lengthen-hold',
  'add-camera',
  'swap-recipe',
  'split',
]);

/** How much a plan shows: its information items, over all its shots. */
const itemsIn = (plan: ShotPlan) =>
  plan.shots.reduce((n, shot) => n + shot.info.length, 0);

/** A camera move added to a shot within its limit: an opening establish or a hold makes way first, else its last move. */
function withMove(shot: PlanShot, move: PlanCamera): void {
  if (shot.camera.length >= SHOT_LIMITS.camera) {
    const spare = shot.camera.findIndex(
      (c) => c.move === 'establish' || c.move === 'hold',
    );
    shot.camera.splice(spare >= 0 ? spare : shot.camera.length - 1, 1);
  }
  shot.camera.push(move);
}

/** Two names for one thing: the same, or the same once loosely read ("North Region", "region:the North"). */
function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const la = looseKey(splitTarget(a).rest);
  return Boolean(la) && la === looseKey(splitTarget(b).rest);
}

/** The name a fix's target has in a shot: one of its own, the registry's, a part of its chart; null for none. */
function targetName(
  raw: string | undefined,
  shot: PlanShot,
  registry: TargetRegistry,
): string | null {
  if (!raw) return null;
  if (raw.trim().toLowerCase() === WHOLE_SET) return WHOLE_SET;
  const own = [
    shot.focal,
    ...shot.info.flatMap((i) => [i.target, i.to]),
    ...shot.camera.map((c) => c.target),
    ...shot.actors.map((a) => `actor:${a.id}`),
  ].find((name) => sameName(name, raw));
  if (own) return own;
  const entry = registry.resolve(raw);
  if (entry) return entry.name;
  const { prefix, rest } = splitTarget(raw);
  if (shot.set.kind === 'chart' && (prefix === 'part' || !prefix) && rest)
    return `part:${rest}`;
  return null;
}

/** An item of a shot a fix names: an information item by its target, its words or its recipe; else a camera move. */
function itemOf(
  shot: PlanShot,
  raw: string | undefined,
): { info: PlanInfo } | { camera: PlanCamera } | null {
  if (!raw) return null;
  const said = raw.trim();
  const recipe = recipeOf(said.split(/\s+/u)[0]);
  const info =
    shot.info.find((i) => sameName(i.target, said)) ??
    shot.info.find(
      (i) => i.text && keysOf(i.text).join(' ') === keysOf(said).join(' '),
    ) ??
    shot.info.find((i) => recipe !== null && i.recipe === recipe) ??
    shot.info.find(
      (i) => i.target && sameName(i.target, said.replace(/^\S+\s+/u, '')),
    );
  if (info) return { info };
  const move = moveOf(said.split(/\s+/u)[0]);
  const camera =
    shot.camera.find((c) => sameName(c.target, said)) ??
    shot.camera.find((c) => move !== null && c.move === move);
  return camera ? { camera } : null;
}

/** Where a phrase is in the narration, inside a span first, else anywhere; loosely when not exactly. */
function find(
  n: Narration,
  words: string | undefined,
  span?: [number, number],
): { at: number; length: number } | null {
  if (!words) return null;
  const length = keysOf(words).length;
  if (span) {
    const inside = phraseAt(n, words, span[0], span[1]);
    if (inside >= 0) return { at: inside, length };
    const near = nearestPhrase(n, words, span[0], span[1]);
    if (near) return near;
  }
  const anywhere = phraseAt(n, words);
  if (anywhere >= 0) return { at: anywhere, length };
  return nearestPhrase(n, words);
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

/** The set a critic's "to" names, as the board is told it: a set kind, or a chart's kind. */
function setAsked(to: string | undefined): string | undefined {
  if (!to) return undefined;
  const chart = chartKindOf(to);
  if (chart) return `a ${chart} chart`;
  const kind = setKindOf(to);
  return kind ?? undefined;
}

/**
 * The critic's fixes applied to a plan, the worst first, each to the shot
 * it named as the critic saw it; the plan then mended (mendPlan) and
 * checked (checkPlan) for the log. What each fix came to is said.
 */
export async function applyFixes(
  plan: ShotPlan,
  fixes: readonly CriticFix[],
  ctx: FixContext,
): Promise<FixResult> {
  const narration = sceneNarration(ctx.rows);
  const n = narrationOf(narration);
  const options = ctx.options ?? {};
  const mend = (shots: PlanShot[]) =>
    mendPlan({ shots }, narration, ctx.registry, options);
  // Each shot's words, as the critic saw the plan: [first key, key after its last].
  const starts = plan.shots.map((shot) => {
    const at = phraseAt(n, shot.on);
    return at >= 0 ? at : (nearestPhrase(n, shot.on)?.at ?? -1);
  });
  const spanOf = (k: number): [number, number] => {
    const from = Math.max(0, starts[k]);
    const next = starts.slice(k + 1).find((at) => at > from);
    return [from, next ?? n.keys.length];
  };
  /**
   * The words a target comes on at in a shot, where that is after its
   * first words (the first item acting on it is later: a timeline's event,
   * a region filled as it is named); null when it is there from the start.
   */
  const comesOnLater = (
    shot: PlanShot,
    target: string,
    span: [number, number],
  ): string | null => {
    const first = shot.info.find((i) => sameName(i.target, target));
    if (!first) return null;
    const at = phraseAt(n, first.on, span[0], span[1]);
    return at > span[0] + 2 ? first.on : null;
  };
  const spans = lineSpans(ctx.rows);
  const rowAt = (key: number) =>
    ctx.rows[
      Math.max(
        0,
        spans.findIndex(([a, b]) => key >= a && key < b),
      )
    ];
  // The shots now standing for each shot the critic saw: one, none (merged
  // away), or more (drawn again by the board).
  const slots: PlanShot[][] = plan.shots.map((shot) => [copy(shot)]);
  const flat = () => slots.flat();
  const applied: AppliedFix[] = [];
  let boardCalls = 0;
  let before = JSON.stringify(mend(flat()));

  /** The board asked for a shot's words (from `from` to the shot's end); its shots for them, or null. */
  const ask = async (
    fix: CriticFix,
    k: number,
    from: number,
  ): Promise<PlanShot[] | null> => {
    if (!ctx.board) return null;
    const [, to] = spanOf(k);
    if (from >= to) return null;
    boardCalls += 1;
    const answer = await ctx
      .board({
        shot: fix.shot,
        from: phraseText(n, from, Math.min(3, to - from)),
        words: phraseText(n, from, to - from),
        ...(setAsked(fix.to) ? { set: setAsked(fix.to) } : {}),
        note: fix.note,
      })
      .catch(() => null);
    if (!answer?.shots.length) return null;
    // Its shots for these words, the first starting where they start.
    const mine = answer.shots.filter((shot) => {
      const at = phraseAt(n, shot.on, from, to);
      return at >= from && at < to;
    });
    if (!mine.length) return null;
    mine.sort(
      (a, b) => phraseAt(n, a.on, from, to) - phraseAt(n, b.on, from, to),
    );
    mine[0] = onWords(mine[0], phraseText(n, from, Math.min(3, to - from)));
    return mine.slice(0, 2).map(copy);
  };

  /** The safe shot for a shot's words: the research's ladder (shot-check's safeShot), on its own words. */
  const safeFor = (k: number): PlanShot => {
    const [from] = spanOf(k);
    const previous = slots.slice(0, k).flat().at(-1) ?? null;
    const next = slots.slice(k + 1).flat()[0] ?? null;
    const shot = slots[k][0] ?? plan.shots[k];
    return onWords(
      safeShot(rowAt(from), ctx.registry, ctx.world, { previous, next }),
      shot.on,
    );
  };

  for (const fix of fixes) {
    const k = fix.shot - 1;
    const kept = slots.map((s) => s.map(copy));
    const slot = slots[k];
    if (!slot?.length) {
      applied.push({
        fix,
        outcome: 'skipped',
        what: `shot ${fix.shot} is gone`,
      });
      continue;
    }
    const shot = slot[0];
    const span = spanOf(k);
    let outcome: AppliedFix['outcome'] = 'applied';
    let what = '';
    switch (fix.kind) {
      case 'enlarge': {
        const target =
          targetName(fix.target, shot, ctx.registry) ??
          (shot.focal && shot.focal !== WHOLE_SET ? shot.focal : null);
        if (!target || target === WHOLE_SET) {
          // A whole set (a chart, a portrait): the whole picture closer.
          const push = shot.camera.find((c) => c.move === 'push' && !c.target);
          if (push) push.amount = push.amount === 'small' ? 'medium' : 'large';
          else withMove(shot, { move: 'push', on: shot.on, amount: 'medium' });
          what = 'pushed in on the whole picture';
          break;
        }
        // Something that comes on later in the shot is pushed in on as it
        // comes, never framed before it is there (empty paper till then).
        const later = comesOnLater(shot, target, span);
        const push = shot.camera.find(
          (c) => c.move === 'push' && (!c.target || sameName(c.target, target)),
        );
        if (push) {
          push.target = target;
          push.amount = push.amount === 'small' ? 'medium' : 'large';
          if (later) push.on = later;
        } else {
          const named = find(n, splitTarget(target).rest, span);
          withMove(shot, {
            move: 'push',
            target,
            on:
              later ??
              (named ? phraseText(n, named.at, named.length) : shot.on),
            amount: 'medium',
          });
        }
        if (!later) shot.focal = target;
        what = `pushed in on ${target}${later ? ` as it comes on ("${later}")` : ''}`;
        break;
      }
      case 'reframe': {
        const target = targetName(fix.target, shot, ctx.registry);
        const later = target ? comesOnLater(shot, target, span) : null;
        if (target && target !== WHOLE_SET && later) {
          // Framed as it comes on: a cut to it then.
          withMove(shot, { move: 'cut-to', target, on: later });
          what = `cut to ${target} as it comes on ("${later}")`;
        } else if (target && target !== WHOLE_SET) {
          shot.focal = target;
          shot.camera = shot.camera.filter(
            (c) => !c.target || sameName(c.target, target),
          );
          what = `framed on ${target}`;
        } else {
          shot.focal = WHOLE_SET;
          shot.camera = shot.camera.filter(
            (c) => c.move !== 'push' && c.move !== 'follow',
          );
          what = 'framed whole';
        }
        break;
      }
      case 'change-set':
      case 'split': {
        // Where the new picture starts: the shot's own words for a new set;
        // for a split, the words the critic named, else the next line in it.
        let from = span[0];
        if (fix.kind === 'split') {
          const named = find(n, fix.to, span);
          const nextLine = spans.find(([a]) => a > span[0] && a < span[1]);
          from =
            named && named.at > span[0]
              ? named.at
              : (nextLine?.[0] ??
                span[0] + Math.floor((span[1] - span[0]) / 2));
          if (from <= span[0] || from >= span[1]) {
            what = 'no words to split at';
            outcome = 'no-effect';
            break;
          }
        }
        const drawn = await ask(fix, k, from);
        if (drawn) {
          slots[k] = fix.kind === 'split' ? [shot, ...drawn] : drawn;
          outcome = 'boarded';
          what = `drawn again by the board: ${drawn.map((s) => s.set.kind).join(', ')}`;
        }
        // A split whose new shot the rules leave no room for (eight a
        // minute), or that the board could not draw: something new at
        // its words at least, the camera moving there.
        if (
          fix.kind === 'split' &&
          (!drawn || JSON.stringify(mend(flat())) === before)
        ) {
          slots[k] = [shot];
          withMove(
            shot,
            carryMove(shot, phraseText(n, from, Math.min(3, span[1] - from))),
          );
          outcome = 'fell-back';
          what = drawn
            ? 'a camera move where it splits (no room for another shot)'
            : 'a camera move where it splits';
        } else if (!drawn) {
          slots[k] = [safeFor(k)];
          outcome = 'fell-back';
          what = `its safe shot: ${slots[k][0].set.kind}`;
        }
        break;
      }
      case 'merge': {
        const next = slots[k + 1];
        if (!next?.length) {
          what = 'no shot after it';
          outcome = 'no-effect';
          break;
        }
        const last = slot[slot.length - 1];
        const other = next.shift()!;
        last.info.push(...other.info);
        last.camera.push(...other.camera);
        last.actors.push(
          ...other.actors.filter(
            (a) => !last.actors.some((b) => b.id === a.id),
          ),
        );
        last.life = [...new Set([...last.life, ...other.life])];
        last.join = other.join;
        what = sameSet(last.set, other.set)
          ? 'one shot of one set'
          : `the ${other.set.kind} folded into the ${last.set.kind}`;
        break;
      }
      case 'move-event': {
        const item = itemOf(shot, fix.target);
        const to = find(n, fix.to);
        if (!item || !to) {
          what = !item ? 'no such item' : 'no such words';
          outcome = 'no-effect';
          break;
        }
        // Words in another shot of the same set take the item there; in
        // one of another set, it keeps to its own shot, on its words
        // nearest them (its last words for words after it, its first for
        // words before).
        const into = slots.findIndex((s, j) => {
          const [a, b] = spanOf(j);
          return (
            s.length > 0 &&
            to.at >= a &&
            to.at < b &&
            sameSet(s[0].set, shot.set)
          );
        });
        const crosses = into >= 0 && into !== k;
        const at =
          crosses || (to.at >= span[0] && to.at < span[1])
            ? to
            : to.at >= span[1]
              ? {
                  at: Math.max(span[0], span[1] - 2),
                  length: Math.min(2, span[1] - span[0]),
                }
              : { at: span[0], length: Math.min(3, span[1] - span[0]) };
        const on = phraseText(n, at.at, at.length);
        if ('info' in item) {
          item.info.on = on;
          if (crosses) {
            shot.info.splice(shot.info.indexOf(item.info), 1);
            slots[into][0].info.push(item.info);
          }
        } else {
          item.camera.on = on;
          if (crosses) {
            shot.camera.splice(shot.camera.indexOf(item.camera), 1);
            withMove(slots[into][0], item.camera);
          }
        }
        what = `onto "${on}"`;
        break;
      }
      case 'lengthen-hold': {
        const item = itemOf(shot, fix.target);
        const to = find(n, fix.to, span);
        if (item && 'info' in item) {
          if (to && to.at > phraseAt(n, item.info.on, span[0], span[1]))
            item.info.until = phraseText(n, to.at, to.length);
          else delete item.info.until;
          what = `${item.info.recipe} kept up${item.info.until ? ` until "${item.info.until}"` : ''}`;
          break;
        }
        const leaving = shot.info.filter((i) => i.until);
        if (leaving.length) {
          for (const i of leaving) delete i.until;
          what = `${leaving.length} kept up to the shot's end`;
          break;
        }
        // Nothing leaves early: the picture held still while it is read.
        const last = shot.info.at(-1);
        withMove(shot, { move: 'hold', on: last?.on ?? shot.on });
        what = 'a hold';
        break;
      }
      case 'add-camera': {
        const move = moveOf(fix.to) ?? 'push';
        const target =
          targetName(fix.target, shot, ctx.registry) ??
          (shot.focal && shot.focal !== WHOLE_SET ? shot.focal : undefined);
        // On the stillest stretch: the middle of the shot's words.
        const mid = span[0] + Math.floor((span[1] - span[0]) / 2);
        withMove(shot, {
          move,
          on: phraseText(n, mid, Math.min(3, span[1] - mid)),
          ...(target && target !== WHOLE_SET ? { target } : {}),
          ...(move === 'push' || move === 'pull' ? { amount: 'small' } : {}),
        });
        what = `${move}${target && target !== WHOLE_SET ? ` on ${target}` : ''}`;
        break;
      }
      case 'swap-recipe': {
        const item = itemOf(shot, fix.target);
        const recipe: ShotInfoRecipe | null = recipeOf(fix.to);
        if (!item || !('info' in item) || !recipe) {
          what = !recipe ? 'no such recipe' : 'no such item';
          outcome = 'no-effect';
          break;
        }
        what = `${item.info.recipe} → ${recipe}`;
        item.info.recipe = recipe;
        break;
      }
      case 'remove-clutter': {
        if (fix.target) {
          const item = itemOf(shot, fix.target);
          const actor = shot.actors.find(
            (a) => sameName(a.id, fix.target) || sameName(a.kit, fix.target),
          );
          if (item && 'info' in item)
            shot.info.splice(shot.info.indexOf(item.info), 1);
          else if (item)
            shot.camera.splice(shot.camera.indexOf(item.camera), 1);
          else if (actor) shot.actors.splice(shot.actors.indexOf(actor), 1);
          else if (shot.life.some((l) => sameName(l, fix.target)))
            shot.life = shot.life.filter((l) => !sameName(l, fix.target));
          else {
            what = 'no such thing';
            outcome = 'no-effect';
            break;
          }
          what = `removed ${fix.target}`;
          break;
        }
        // The least needed: labels past two, cues past one, a third item, pieces past two, life past one.
        const labels = shot.info.filter((i) => i.recipe === 'label');
        const cues = shot.info.filter(
          (i) => i.recipe === 'mark' || i.recipe === 'spotlight',
        );
        const drop = new Set<PlanInfo>([...labels.slice(2), ...cues.slice(1)]);
        let kept = shot.info.filter((i) => !drop.has(i));
        if (kept.length > 3) kept = kept.slice(0, 3);
        const removed = shot.info.length - kept.length;
        shot.info = kept;
        shot.actors = shot.actors.slice(0, 2);
        shot.life = shot.life.slice(0, 1);
        what = `${removed} items fewer`;
        break;
      }
      case 'safe-shot': {
        slots[k] = [safeFor(k)];
        what = `its safe shot: ${slots[k][0].set.kind}`;
        break;
      }
    }
    // Whether it came to anything once the plan is mended; and a fix that
    // only moves, holds or frames what is there, which the mend would
    // make lose some of it (an item moved where its set cannot show it, a
    // recipe its target cannot take), is undone instead.
    const mended = mend(flat());
    const after = JSON.stringify(mended);
    if (
      KEEPS.has(fix.kind) &&
      outcome === 'applied' &&
      itemsIn(mended) < itemsIn(JSON.parse(before) as ShotPlan)
    ) {
      slots.splice(0, slots.length, ...kept);
      applied.push({
        fix,
        outcome: 'no-effect',
        what: `${what} (undone: the rules would drop what it moved)`,
      });
      continue;
    }
    // A fix made by code alone that leaves the plan breaking more of the
    // rules than it did (a merge leaving the voice over nothing new for too
    // long) is undone too. A redraw or a safe shot stays: it puts right a
    // picture the critic saw was wrong, which outweighs the pace.
    const failing = (shots: ShotPlan) =>
      checkPlan(shots, narration, ctx.registry, options).length;
    if (
      outcome === 'applied' &&
      fix.kind !== 'safe-shot' &&
      after !== before &&
      failing(mended) > failing(JSON.parse(before) as ShotPlan)
    ) {
      slots.splice(0, slots.length, ...kept);
      applied.push({
        fix,
        outcome: 'no-effect',
        what: `${what} (undone: the plan would break the rules)`,
      });
      continue;
    }
    if (after === before && outcome !== 'no-effect') {
      outcome = 'no-effect';
      what = `${what} (undone by the rules)`;
    }
    before = after;
    applied.push({ fix, outcome, what });
  }

  const mended = mend(flat());
  return {
    plan: mended,
    applied,
    problems: checkPlan(mended, narration, ctx.registry, options),
    boardCalls,
  };
}

/**
 * What the board is told beside the scene's parts when a fix asks it for
 * one shot's words again: those words alone, the critic's note, and the
 * set the critic named; one or two shots, starting on the words given.
 */
export function boardAskPart(ask: BoardAsk): string {
  return [
    `Board again only these words of the scene, shot ${ask.shot} as it was: "${ask.words}".`,
    `The picture editor says: ${ask.note || 'its picture does not show what the voice says'}.${ask.set ? ` Give it ${ask.set === 'map' || ask.set === 'set' || ask.set === 'plain' ? `the ${ask.set}` : ask.set.startsWith('a ') ? ask.set : `a ${ask.set}`}.` : ''}`,
    `Answer with one or two shots for those words only, the first starting on "${ask.from}", every name from the lists above and every rule as before.`,
  ].join('\n');
}

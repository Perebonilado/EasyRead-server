/**
 * The shot grammar (studio-views-plan §3.2, §3.3): which shot a Studio
 * film's scene takes at each line, chosen by code, on today's front-on
 * sets, the writer's own asks and hints kept.
 *
 *  - The scene opens on the master (the whole stage): no shot of code's
 *    on its first line.
 *  - A real conversation (more than three lines between the same two, one
 *    after the other) opens on the master, or where the two stand near
 *    each other, a profile two-shot of them face to face; then cuts over
 *    the shoulder of whoever listens onto whoever speaks, line by line, a
 *    long one breathing once in its middle on the profile two-shot. Fewer
 *    lines than that are no conversation, and are not cut up.
 *  - A line said into a conversation by a third, on their feet, to those
 *    talking: deep staging, the third near the camera and big, partly off
 *    the frame, the two behind at their places.
 *  - A line said strongly (a whisper, a shout, a strong face): close on
 *    who says it; seen from high when they are sad or small.
 *  - A line said to the crowd before the camera, in a scene about them:
 *    over the crowd onto who says it.
 *  - A hero's pose: seen from low, whole.
 *  - A big action move, and anyone coming on: the whole stage, as the
 *    camera's shots are cut round them (directedShots' doings).
 *
 * Where the place has another side (studio-views-plan §4.2, V3), a
 * conversation is real shot and reverse shot: over the shoulder of the
 * one listening from the front onto whoever spoke first in it, and onto
 * the other from the place's other side, over the first one's shoulder,
 * the camera turned round; the two keep their sides of the frame either
 * way (the 180° rule). In a scene about the crowd before the camera, a
 * second line to them in a row is seen the other way, from behind whoever
 * speaks onto the crowd facing us. A place with no other side (one
 * painted whole) keeps every shot from the front.
 *
 * The cut rules (a shot at least SHOT_LEAST_MS, no jump cut, a cut in the
 * quiet before a line) are directedShots' and withoutJumps'. And the 180°
 * rule: the two of a conversation keep their sides of the frame from one
 * shot of them to the next; the line is crossed only after the whole
 * stage has been seen, or as one of them walks across the other on it.
 */
import type {
  SceneDto,
  SceneEffectDto,
  ScenePlaceDto,
  SceneStepDto,
  SceneView,
} from '../../contracts';
import type { SceneCameraAsk } from './scene-script';
import type { LineAim } from './scene-performance';

/** More lines than this between the same two, one after another, is a conversation. */
export const CONVERSATION_LINES = 3;
/** A conversation this long breathes once in its middle on the profile two-shot. */
export const LONG_CONVERSATION = 7;
/** Two nearer each other than this, a share of the stage's width between their middles, are framed face to face in profile. */
export const PROFILE_NEAR = 0.5;
/** Two closes on strong lines this far apart at least, scaled by the style's cut rate (only where the maker chose a style or a pace). */
export const CLOSE_APART_MS = 5000;
/** At this cut rate or slower (a share of the usual), a conversation holds each shot over two lines. */
export const HOLD_TWO_LINES = 1.3;
/** Below this push, the camera does not go in close on a strong line: a style with little camera movement (a sitcom's). */
export const CLOSE_PUSH = 0.5;
/** Two reaction shots at least this far apart (K8): an argument's lines may each have one, not every line of a chat. */
export const REACTION_APART_MS = 2500;
/** What a line does that makes it an argument: two of these between the same two, and three lines, is a conversation cut shot and reverse shot. */
const ARGUES: ReadonlySet<string> = new Set([
  'accuses',
  'refuses',
  'threatens',
  'warns',
]);
/**
 * The moves of physical comedy, and of anyone coming a cropper: seen on
 * the whole stage, as a big action move is (no shot hides them).
 */
export const PHYSICAL_MOVES: ReadonlySet<string> = new Set([
  'fall',
  'fall-hard',
  'jump',
  'spin',
  'roll',
  'kick',
  'dodge',
]);
/** A joke's or a tease's line is framed with whom it is said to, so their reaction is seen. */
const FUNNY: ReadonlySet<string> = new Set(['jokes', 'teases']);
/** A line that shows a feeling or tells something new: close on whoever says it. */
const TELLING: ReadonlySet<string> = new Set(['reveals', 'confesses']);

/** A line said on the stage, as the grammar reads it. */
export interface GrammarLine {
  /** Its index among the scene's beats. */
  beat: number;
  speaker: string;
  /** Whom it is said to, when the sheet says. */
  to: string | null;
  startMs: number;
  endMs: number;
  /** Said strongly: a whisper, a shout, a strong face. */
  strong: boolean;
  /** Said sad (a sad face, a sob). */
  sad: boolean;
  /** Said to the crowd before the camera, or to everyone. */
  toCrowd: boolean;
  /** What it does to whom it is said to (scene-performance), where read. */
  aim?: LineAim;
  /** It lands (a punchline, a threat, an accusation, a reveal): whom it is said to is seen taking it (K8). */
  lands?: boolean;
  /** It says what the speaker wants (K2). */
  want?: boolean;
}

export interface GrammarInput {
  lines: readonly GrammarLine[];
  /** Who is on the stage at a moment: people, not things. */
  onAt: (t: number) => readonly string[];
  /** Where someone stands at a moment, on the wide stage. */
  placeAt: (id: string, t: number) => ScenePlaceDto | null;
  /** Whether someone is on their feet at a moment, on the open floor: not sat or lying down, not behind or under a thing. */
  standing: (id: string, t: number) => boolean;
  /** Whether someone is small: a child's height or less, an animal. */
  small: (id: string) => boolean;
  /** Whether someone is tiny beside people (a bird, a kitten): never cheated near the camera and big. Absent, no one. */
  tiny?: (id: string) => boolean;
  /** Whether the scene is about the crowd before the camera. */
  addressed: boolean;
  /** Each hero's pose: who, when it begins, and how long it is. */
  heroes: readonly { who: string; atMs: number; ms: number }[];
  /** The stage's width. */
  W: number;
  /** The writer's own asks. */
  asked: readonly SceneCameraAsk[];
  /** The film's hero, where known: the first close-up is theirs, on the line that says what they want (K2). */
  hero?: string | null;
  /** Whether the place has another side to cut to (a set built with its reverse). Absent, it has none. */
  reverse?: boolean;
  /** And whether the people watching are seen on it, facing the camera: a crowd's view the other way. */
  reverseCrowd?: boolean;
  /**
   * The camera's energy for the maker's style and pace (studio-style.ts):
   * `cut` how long it holds, as a share of the usual (above 1 slower, below
   * 1 snappier), and `push` how much it goes in close (0 never). Absent,
   * as usual.
   */
  energy?: { cut: number; push: number };
}

const middle = (p: Pick<ScenePlaceDto, 'x' | 'w'>) => p.x + p.w / 2;

/**
 * The camera a Studio film's scene takes, as the module says: the
 * writer's asks, each on its own line, and code's own on every other
 * line; code's shot given up for the whole stage on the next line it has
 * nothing to say of. In the order they come.
 */
export function grammarCamera(input: GrammarInput): SceneCameraAsk[] {
  const { lines, W } = input;
  const plan = new Map<number, SceneCameraAsk>();
  const cut = input.energy?.cut ?? 1;
  const push = input.energy?.push ?? 1;
  /** Lines between the same two that make a conversation: fewer when snappy, more when slow. */
  const conversation = Math.max(2, Math.round(CONVERSATION_LINES * cut));
  /** Lines on which the shot before holds, in a slow style: no cut there, and no cut back to the whole stage. */
  const held = new Set<number>();
  /** When the last close on a strong line began: the next waits its time. */
  let lastClose = -Infinity;
  /** Close on a strong line, when the style goes in close and the last was long enough ago. */
  const mayClose = (line: GrammarLine) => {
    if (push < CLOSE_PUSH) return false;
    // Spaced out only where the maker chose a style or a pace: else as V2 has it.
    if (input.energy && line.startMs - lastClose < CLOSE_APART_MS * cut)
      return false;
    lastClose = line.startMs;
    return true;
  };
  const first = lines[0]?.beat;
  /** Said strongly, or showing a feeling or telling something new. */
  const strongly = (line: GrammarLine) =>
    line.strong || TELLING.has(line.aim ?? '');
  /** Whom a line is said to, on the stage: whom the sheet says, else whoever answers it. */
  const hearerOf = (line: GrammarLine): string | null => {
    const on = input.onAt(line.startMs);
    if (line.to && line.to !== line.speaker && on.includes(line.to))
      return line.to;
    const next = lines.find((one) => one.beat > line.beat);
    return next && next.speaker !== line.speaker && on.includes(next.speaker)
      ? next.speaker
      : null;
  };
  /** Runs of lines one straight after the other (no narration between). */
  const runs: GrammarLine[][] = [];
  for (const line of lines) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && line.beat === last.beat + 1) run.push(line);
    else runs.push([line]);
  }
  const near = (a: string, b: string, t: number) => {
    const pa = input.placeAt(a, t);
    const pb = input.placeAt(b, t);
    return Boolean(
      pa && pb && Math.abs(middle(pa) - middle(pb)) < PROFILE_NEAR * W,
    );
  };
  /** Close on someone who says a line strongly: from high when sad or small. */
  const closeOn = (line: GrammarLine): SceneCameraAsk => ({
    beat: line.beat,
    shot: 'close',
    on: line.speaker,
    with: null,
    ...(line.sad || input.small(line.speaker) ? { angle: 'high' } : {}),
  });
  /** Said to the crowd before the camera, in a scene about them: over the crowd onto who says it. */
  const toCrowd = (line: GrammarLine) => line.toCrowd && input.addressed;
  /** Lines said to the crowd one after another by each: every second one seen the other way, onto them. */
  let crowdRun: { who: string; n: number } | null = null;
  const crowdShot = (line: GrammarLine): SceneCameraAsk => {
    crowdRun =
      crowdRun?.who === line.speaker
        ? { who: line.speaker, n: crowdRun.n + 1 }
        : { who: line.speaker, n: 1 };
    return {
      beat: line.beat,
      shot: 'crowd',
      on: line.speaker,
      with: null,
      ...(input.reverseCrowd && crowdRun.n % 2 === 0
        ? { reverse: true as const }
        : {}),
    };
  };
  for (const run of runs) {
    crowdRun = null;
    // The two who say most of it to each other.
    const count = new Map<string, number>();
    for (const line of run)
      if (!toCrowd(line))
        count.set(line.speaker, (count.get(line.speaker) ?? 0) + 1);
    const [a, b] = [...count.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([id]) => id);
    const pair = new Set([a, b].filter(Boolean));
    const said = run.filter((line) => pair.has(line.speaker) && !toCrowd(line));
    // An argument is cut up sooner: three lines between the two, two of
    // them an accusation, a refusal, a threat or a warning.
    const argues =
      said.filter((line) => ARGUES.has(line.aim ?? '')).length >= 2 &&
      said.length >= Math.min(3, conversation + 1);
    const talk =
      pair.size === 2 &&
      (said.length > conversation || argues) &&
      said.every((line) => input.onAt(line.startMs).includes(line.speaker));
    if (!talk) {
      for (const line of run) {
        if (line.beat === first) continue;
        const on = input.onAt(line.startMs);
        const hearer = hearerOf(line);
        if (toCrowd(line)) plan.set(line.beat, crowdShot(line));
        else if (FUNNY.has(line.aim ?? '') && hearer)
          plan.set(line.beat, {
            beat: line.beat,
            shot: 'two',
            on: line.speaker,
            with: hearer,
          });
        else if (strongly(line) && on.length >= 2 && mayClose(line))
          plan.set(line.beat, closeOn(line));
      }
      continue;
    }
    const middleLine =
      said.length >= LONG_CONVERSATION
        ? said[Math.floor(said.length / 2)]
        : null;
    let n = 0;
    /** Whoever the first shot over a shoulder is on: seen from the front; the other from the place's other side. */
    let front: string | null = null;
    for (const line of run) {
      const other = line.speaker === a ? b : a;
      const on = input.onAt(line.startMs);
      if (toCrowd(line)) {
        if (line.beat !== first) plan.set(line.beat, crowdShot(line));
        continue;
      }
      if (!pair.has(line.speaker)) {
        // A third says something into it, on their feet, to the two.
        if (
          on.length >= 3 &&
          line.beat !== first &&
          input.standing(line.speaker, line.startMs) &&
          !input.tiny?.(line.speaker)
        )
          plan.set(line.beat, {
            beat: line.beat,
            shot: 'deep',
            on: line.speaker,
            with: null,
          });
        continue;
      }
      n += 1;
      if (line.beat === first) continue;
      const faceToFace =
        near(line.speaker, other, line.startMs) &&
        input.standing(line.speaker, line.startMs) &&
        input.standing(other, line.startMs);
      if (n === 1 || line === middleLine) {
        // Opening it, or breathing in its middle: the two face to face.
        if (faceToFace)
          plan.set(line.beat, {
            beat: line.beat,
            shot: 'profile',
            on: line.speaker,
            with: other,
          });
        continue;
      }
      if (strongly(line) && mayClose(line)) {
        plan.set(line.beat, closeOn(line));
        continue;
      }
      // A joke or a tease with whom it is said to, so their face is seen.
      if (FUNNY.has(line.aim ?? '') && on.includes(other)) {
        plan.set(line.beat, {
          beat: line.beat,
          shot: 'two',
          on: line.speaker,
          with: other,
        });
        continue;
      }
      // A slow style holds each shot over two lines of it.
      if (cut >= HOLD_TWO_LINES && n % 2 === 1) {
        held.add(line.beat);
        continue;
      }
      if (!on.includes(other)) continue;
      front ??= line.speaker;
      plan.set(line.beat, {
        beat: line.beat,
        shot: 'ots',
        on: line.speaker,
        with: other,
        ...(input.reverse && line.speaker !== front
          ? { reverse: true as const }
          : {}),
      });
    }
  }
  // The hero's first close-up, on the line that says what they want (K2).
  const want = lines.find(
    (line) =>
      line.want &&
      line.beat !== first &&
      !toCrowd(line) &&
      (!input.hero || line.speaker === input.hero),
  );
  if (want && push >= CLOSE_PUSH) plan.set(want.beat, closeOn(want));
  // The writer's own, each on its own line; code's everywhere else, and
  // the whole stage again on the next line code has no shot for.
  const asked = [...input.asked];
  const owned = new Set(
    asked.filter((one) => one.after === undefined).map((one) => one.beat),
  );
  // A line that lands, seen on whom it is said to as it ends (K8): a
  // reaction shot, held into their answer when they answer it.
  const reactions: SceneCameraAsk[] = [];
  let lastReaction = -Infinity;
  for (const line of lines) {
    if (!line.lands || toCrowd(line) || owned.has(line.beat)) continue;
    const hearer = hearerOf(line);
    const next = lines.find((one) => one.beat > line.beat);
    if (
      !hearer ||
      line.startMs - lastReaction < REACTION_APART_MS * cut ||
      push < CLOSE_PUSH ||
      (next && owned.has(next.beat)) ||
      asked.some((one) => one.beat === line.beat && one.after !== undefined)
    )
      continue;
    lastReaction = line.startMs;
    reactions.push({
      beat: line.beat,
      shot: 'close',
      on: hearer,
      with: null,
      after: 0,
    });
    if (next?.beat === line.beat + 1 && next.speaker === hearer) {
      plan.delete(next.beat);
      held.add(next.beat);
    }
  }
  const out: SceneCameraAsk[] = [...asked, ...reactions];
  // After a reaction shot, and the answer it holds into: the whole stage
  // again where code has nothing else to say.
  for (const one of reactions) {
    const after = lines.filter((line) => line.beat > one.beat);
    const answer = after[0];
    const then =
      answer && held.has(answer.beat) ? after[1]?.beat : answer?.beat;
    if (
      then !== undefined &&
      !plan.has(then) &&
      !owned.has(then) &&
      !held.has(then)
    )
      out.push({ beat: then, shot: 'wide', on: null, with: null });
  }
  const planned = [...plan.values()]
    .filter((one) => !owned.has(one.beat))
    .sort((x, y) => x.beat - y.beat);
  const beats = lines.map((line) => line.beat);
  for (const one of planned) {
    out.push(one);
    const next = beats.find((beat) => beat > one.beat);
    if (
      next !== undefined &&
      !plan.has(next) &&
      !owned.has(next) &&
      !held.has(next)
    )
      out.push({ beat: next, shot: 'wide', on: null, with: null });
  }
  // A hero's pose, seen from low: from its moment, and the whole stage
  // again once it is struck.
  for (const hero of input.heroes)
    out.push(
      { beat: -1, shot: 'low', on: hero.who, with: null, atMs: hero.atMs },
      {
        beat: -1,
        shot: 'wide',
        on: null,
        with: null,
        atMs: hero.atMs + hero.ms,
      },
    );
  return out.sort(
    (x, y) =>
      (x.atMs !== undefined ? 1 : 0) - (y.atMs !== undefined ? 1 : 0) ||
      x.beat - y.beat ||
      (x.after ?? -1) - (y.after ?? -1),
  );
}

// ── The 180° rule ───────────────────────────────────────────────────────────

/** Whom a shot has in it, two by two: the pair it frames, where it frames two. */
function pairOf(shot: SceneEffectDto): [string, string] | null {
  if (!shot.part) return null;
  return [shot.target, shot.part];
}

/** The step a moment falls in. */
const stepIndex = (steps: readonly Pick<SceneStepDto, 'atMs'>[], t: number) => {
  let k = 0;
  steps.forEach((step, i) => {
    if (step.atMs <= t) k = i;
  });
  return k;
};

/** Someone walking on the wide stage, as scene-film's walksOf has them. */
export interface WalkSeen {
  id: string;
  from: number;
  to: number;
  start: Pick<ScenePlaceDto, 'x' | 'w'>;
  end: Pick<ScenePlaceDto, 'x' | 'w'>;
}

/**
 * Whether one of a pair walks across the other between two moments, on
 * the stage: from one side of them to the other.
 */
function walkedAcross(
  pair: readonly [string, string],
  from: number,
  to: number,
  walks: readonly WalkSeen[],
  placeAt: (id: string, t: number) => Pick<ScenePlaceDto, 'x' | 'w'> | null,
): boolean {
  return walks.some((walk) => {
    if (!pair.includes(walk.id) || walk.to <= from || walk.from >= to)
      return false;
    const other = pair[0] === walk.id ? pair[1] : pair[0];
    const them = placeAt(other, walk.from) ?? placeAt(other, walk.to);
    if (!them) return false;
    const was = Math.sign(middle(walk.start) - middle(them));
    const now = Math.sign(middle(walk.end) - middle(them));
    return was !== 0 && now !== 0 && was !== now;
  });
}

/**
 * The shots of a film's scene kept to the 180° rule (§3.3): a shot of two
 * (a two-shot, over the shoulder, in profile) that has them on the other
 * sides of the frame from the last shot of them, with no whole stage
 * between and neither seen walking across the other, is not taken: the
 * whole stage is seen instead, and the line may be crossed after it.
 * A shot from the place's other side (§4.2) has the two the other way
 * about, but over a shoulder, from either side, the two keep the sides
 * they have from the front: shot and reverse shot keep the line.
 * The rest as they were, copies.
 */
export function keepTheLine(
  shots: readonly SceneEffectDto[],
  steps: readonly Pick<SceneStepDto, 'atMs' | 'show'>[],
  places: readonly Record<string, ScenePlaceDto>[],
  walks: readonly WalkSeen[] = [],
): SceneEffectDto[] {
  const placeAt = (id: string, t: number) => {
    const k = stepIndex(steps, t);
    return steps[k]?.show.includes(id) ? (places[k]?.[id] ?? null) : null;
  };
  /** The side of the frame each of a pair was last seen on, since the whole stage. */
  const sides = new Map<string, { side: number; at: number }>();
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const out: SceneEffectDto[] = [];
  let lastEnd = -Infinity;
  for (const shot of [...shots].sort((a, b) => a.atMs - b.atMs)) {
    // The whole stage between: the line starts afresh.
    if (shot.atMs > lastEnd + 1) sides.clear();
    const pair = pairOf(shot);
    if (pair) {
      const [a, b] = pair;
      const pa = placeAt(a, shot.atMs + 1);
      const pb = placeAt(b, shot.atMs + 1);
      if (pa && pb) {
        // Turned round, a shot of two has them the other way about, but
        // over a shoulder, where the two keep their sides from the front.
        const turned =
          shot.shot?.reverse === true && shot.shot.kind !== 'ots' ? -1 : 1;
        const side = (Math.sign(middle(pa) - middle(pb)) || 1) * turned;
        const was = sides.get(key(a, b));
        const mine = a < b ? side : -side;
        if (
          was &&
          was.side !== mine &&
          !walkedAcross(pair, was.at, shot.atMs, walks, placeAt)
        )
          // Across the line with no whole stage between: not taken.
          continue;
        sides.set(key(a, b), { side: mine, at: shot.atMs });
      }
    }
    out.push({ ...shot });
    lastEnd = Math.max(lastEnd, shot.untilMs ?? shot.atMs);
  }
  return out;
}

/** Someone's screen direction at a moment, from their view: 1 looking to the frame's right, -1 to its left, 0 to us. */
export function screenDirection(
  view: readonly [number, SceneView, 1 | -1][] | undefined,
  t: number,
): number {
  let key: [number, SceneView, 1 | -1] | undefined;
  for (const one of view ?? []) if (one[0] <= t) key = one;
  if (!key || key[1] === 'front' || key[1] === 'back') return 0;
  return key[2];
}

/** A cut that flips someone's screen direction across the line. */
export interface LineCrossing {
  atMs: number;
  who: string;
  /** Whom they look at across the line. */
  toward: string;
  was: number;
  now: number;
}

/**
 * The cuts in a made scene that cross the line (§3.3): from one shot of
 * two (a two-shot, over the shoulder, in profile) to the next of the same
 * two, with no whole stage between, one of them looks to the other side
 * of the frame (as their views have them) and neither was seen walking
 * across the other. Someone who turns to a third between is no crossing:
 * the line is the two's. None in a scene kept to the rule.
 */
export function lineCrossings(
  scene: Pick<SceneDto, 'effects' | 'acting' | 'steps' | 'stagings'>,
  walks: readonly WalkSeen[] = [],
): LineCrossing[] {
  const shots = scene.effects
    .filter((e) => e.do === 'zoom')
    .sort((a, b) => a.atMs - b.atMs);
  const places = scene.stagings.wide.places;
  const placeAt = (id: string, t: number) => {
    const k = stepIndex(scene.steps, t);
    return scene.steps[k]?.show.includes(id) ? (places[k]?.[id] ?? null) : null;
  };
  const mid = (s: SceneEffectDto) =>
    (s.atMs + (s.untilMs ?? s.atMs + 1000)) / 2;
  /** How each of a pair last looked toward the other, since the whole stage was seen. */
  const seen = new Map<string, { at: number; dirs: Record<string, number> }>();
  const out: LineCrossing[] = [];
  let lastEnd = -Infinity;
  for (const shot of shots) {
    if (shot.atMs > lastEnd + 1) seen.clear();
    lastEnd = Math.max(lastEnd, shot.untilMs ?? shot.atMs);
    const pair = pairOf(shot);
    if (!pair) continue;
    const key = [...pair].sort().join('|');
    const dirs = Object.fromEntries(
      pair.map((who) => [
        who,
        screenDirection(scene.acting?.[who]?.view, mid(shot)),
      ]),
    );
    const was = seen.get(key);
    if (was && !walkedAcross(pair, was.at, shot.atMs, walks, placeAt))
      for (const who of pair) {
        const before = was.dirs[who];
        const now = dirs[who];
        if (before && now && before !== now)
          out.push({
            atMs: shot.atMs,
            who,
            toward: who === pair[0] ? pair[1] : pair[0],
            was: before,
            now,
          });
      }
    seen.set(key, { at: shot.atMs, dirs });
  }
  return out;
}

// ── Inserts (studio-screenwriting K5) ───────────────────────────────────────

/** An insert on a thing is on this long, at least and at most, and as near this as the words let it. */
export const INSERT_LEAST_MS = 1200;
export const INSERT_MS = 1600;
export const INSERT_MOST_MS = 2000;
/** It comes in no sooner than this before the moment the thing is handled or named ("on or right after"), and no later than this after it. */
export const INSERT_EARLY_MS = 250;
export const INSERT_LATE_MS = 1500;
/** A cut beside a word keeps this clear of it, where the gap has room. */
const WORD_CLEAR_MS = 30;
/** The same thing is not shown alone again this soon. */
export const INSERT_AGAIN_MS = 6000;

/** An insert asked for: a thing, and the moment it is handled or named, in the scene's time. */
export interface InsertAsk {
  thing: string;
  atMs: number;
}

/** When an insert is on. */
export interface InsertWindow {
  thing: string;
  fromMs: number;
  untilMs: number;
}

/**
 * When each insert asked for is on: from just before its moment (or as
 * soon after as a cut may come), for about INSERT_MS, never cutting in or
 * out in the middle of a word said, none over another, none again on the
 * same thing too soon, and all before `endMs`. One with no such room is
 * not taken.
 */
export function insertWindows(
  asks: readonly InsertAsk[],
  words: readonly { startMs: number; endMs: number }[],
  endMs: number,
): InsertWindow[] {
  const said = [...words].sort((a, b) => a.startMs - b.startMs);
  const inWord = (t: number) => said.some((w) => w.startMs < t && t < w.endMs);
  /** The first moment at or after `t` a cut may come: in the gap after the word it falls in. */
  const freeFrom = (t: number) => {
    const w = said.find((one) => one.startMs < t && t < one.endMs);
    if (!w) return t;
    const next = said.find((one) => one.startMs >= w.endMs);
    return Math.min(
      w.endMs + WORD_CLEAR_MS,
      next ? (w.endMs + next.startMs) / 2 : Infinity,
    );
  };
  const out: InsertWindow[] = [];
  for (const ask of [...asks].sort((a, b) => a.atMs - b.atMs)) {
    if (
      out.some(
        (one) =>
          one.thing === ask.thing && ask.atMs - one.untilMs < INSERT_AGAIN_MS,
      )
    )
      continue;
    const last = out[out.length - 1];
    let from = freeFrom(
      Math.max(0, ask.atMs - INSERT_EARLY_MS, last ? last.untilMs : 0),
    );
    let taken: InsertWindow | null = null;
    for (
      let tries = 0;
      tries < 12 && from <= ask.atMs + INSERT_LATE_MS;
      tries += 1
    ) {
      const lo = from + INSERT_LEAST_MS;
      const hi = Math.min(from + INSERT_MOST_MS, endMs);
      // Where it may end: as near INSERT_MS as a gap between words lets it.
      const ends = [
        from + INSERT_MS,
        lo,
        hi,
        ...said.flatMap((w) => [
          w.startMs - WORD_CLEAR_MS,
          w.startMs,
          w.endMs,
          w.endMs + WORD_CLEAR_MS,
        ]),
      ].filter((t) => t >= lo && t <= hi && !inWord(t));
      const until = ends.sort(
        (a, b) =>
          Math.abs(a - (from + INSERT_MS)) - Math.abs(b - (from + INSERT_MS)),
      )[0];
      if (until !== undefined) {
        taken = {
          thing: ask.thing,
          fromMs: Math.round(from),
          untilMs: Math.round(until),
        };
        break;
      }
      // No room: from the gap after the next word.
      const next = said.find((w) => w.startMs > from);
      if (!next) break;
      from = freeFrom(next.startMs + 1);
    }
    if (taken && !inWord(taken.fromMs) && !inWord(taken.untilMs))
      out.push(taken);
  }
  return out;
}

/**
 * The shots with the inserts cut in: each insert on its own for its
 * length; a shot it falls in goes on either side of it where that side is
 * long enough to take in (`least`), and is not taken there otherwise. The
 * shots of two keep their sides, so the 180° rule holds across an insert
 * as it did (keepTheLine). Copies, in order.
 */
export function withInserts(
  shots: readonly SceneEffectDto[],
  inserts: readonly SceneEffectDto[],
  least: number,
): SceneEffectDto[] {
  let out = shots.map((shot) => ({ ...shot }));
  for (const insert of inserts) {
    const a = insert.atMs;
    const b = insert.untilMs ?? a;
    out = out.flatMap((shot) => {
      const until = shot.untilMs ?? shot.atMs;
      if (until <= a || shot.atMs >= b) return [shot];
      const parts: SceneEffectDto[] = [];
      if (a - shot.atMs >= least) parts.push({ ...shot, untilMs: a });
      if (until - b >= least) parts.push({ ...shot, atMs: b });
      return parts;
    });
  }
  return [...out, ...inserts.map((one) => ({ ...one }))].sort(
    (x, y) => x.atMs - y.atMs,
  );
}

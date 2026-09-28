/**
 * What a made scene shows for each thing its sheet says is done: the
 * check that no action, thing handled or reaction is left out of the film.
 *
 * Each such beat has its time: the quiet after the line before it, until
 * the next line. In that time the viewer sees its doer do something, or
 * nothing: go on, off or across the stage, make a move, look somewhere,
 * handle a thing, change face or show a sign. Its words say what that
 * should be (read against the one list of doings), so a hop where the
 * words say "bounds after it" is seen, but not as the words say; and a
 * beat whose doer does nothing at all in its time is unseen. An unseen
 * beat is played again by its fallback; neither is ever shown to the
 * maker. A thing or a feature the words name that the stage has not got
 * is listed too.
 */
import type { SceneDto } from '../../../contracts';
import { MOUTH_FPS, mouthOf } from '../scene-acting';
import { doingsIn, type Actor } from '../scene-directions';
import {
  ACTION_MOVES,
  BIG_MOVES,
  BOBBING_MOVES,
  MOVE_LANDS,
  MOVE_PHASES,
  aimedFeature,
  bobbingMove,
  doingOf,
  featureKindOf,
  movePhasesMs,
  type ActionMove,
  type Doing,
  type DoingId,
  type StageMove,
} from '../scene-doings';
import { DRAWN } from '../scene-own';
import { genderOf } from '../scene-script';
import { namesOf, type StorySheet, type StudioBible } from './studio';

export interface BeatSeen {
  /** The beat, by its place in the sheet. */
  beat: number;
  who: string;
  /** What its words say is done; "face" for a reaction. */
  expects: string[];
  /** What the viewer sees its doer do in its time. */
  seen: string[];
  /** What its words name that is not on the stage: a thing, a feature. */
  missing: string[];
  /** Seen as the words say; seen, but something else; or nothing at all. */
  verdict: 'seen' | 'unlike' | 'unseen';
}

/** How far before its quiet a beat's moves and steps may begin, and after it end, in ms. */
const BEFORE_MS = 300;
const AFTER_MS = 600;
/** Things handled were once timed on the last word of the line before: so far back they still count. */
const HANDLED_BEFORE_MS = 1500;
/** A place change smaller than this share of the stage is no move. */
const MOVED = 0.02;
/** Moves every line brings, not any beat's doing. */
const LINE_MOVES = new Set(['gesture', 'gesture-left', 'brows', 'lean']);
/** A listener's nod as a line ends (actingOf): so long, so long after its last word. */
const LISTENER_NOD_MS = 500;
const LISTENER_NOD_AFTER_MS = 150;
/** Doings whose eyes are their own: a look, a point, a lean in. */
const AIMS_EYES = new Set<DoingId>(['look', 'point', 'lean-in']);
/** Doings that open or shut a feature, or go through one. */
const SWINGS = new Set<DoingId>(['open', 'close', 'enter', 'leave', 'squeeze']);
/** Doings that cannot be done without a feature of the set. */
const NEEDS_FEATURE = new Set<DoingId>([
  'climb',
  'squeeze',
  'hide',
  'open',
  'close',
]);

/** What a handling looks like, said. */
const HANDLED: Record<string, string> = {
  take: 'takes',
  raise: 'raises',
  break: 'breaks',
  give: 'gives',
  eat: 'eats',
  drink: 'drinks from',
  dip: 'dips into',
  put: 'puts down',
  throw: 'throws',
  catch: 'catches',
  drop: 'drops',
  kick: 'kicks',
  chew: 'chews',
};

/**
 * Each beat of a sheet's time in the film: from the end of the line
 * before it to the start of the next (the quiet it is done in); a line's
 * or narration's own, while it is said. Shared by the audit and by what
 * the film is said to show, so both mean the same moments.
 */
export function beatWindows(
  sheet: Pick<StorySheet, 'beats'>,
  scene: Pick<SceneDto, 'beats' | 'durationMs' | 'settledMs'>,
): { from: number; until: number }[] {
  const end = Math.max(scene.durationMs, scene.settledMs ?? 0);
  let spoken = -1;
  return sheet.beats.map((beat) => {
    if (
      (beat.kind === 'line' || beat.kind === 'narration') &&
      beat.say.trim()
    ) {
      spoken += 1;
      const said = scene.beats[spoken];
      return {
        from: said?.startMs ?? 0,
        until: said?.endMs ?? end,
      };
    }
    return {
      from: spoken >= 0 ? (scene.beats[spoken]?.endMs ?? 0) : 0,
      until: scene.beats[spoken + 1]?.startMs ?? end,
    };
  });
}

/**
 * What a made scene shows for each action, thing handled and reaction of
 * its sheet. `bible` gives the names the words call people by, and who is
 * drawn by the artist (and so moves as a drawing with no rig does).
 */
export function auditScene(
  sheet: StorySheet,
  scene: SceneDto,
  bible: StudioBible | null = null,
): BeatSeen[] {
  const actors: Actor[] = (bible?.characters ?? []).map((c) => ({
    id: c.id,
    names: namesOf(c),
    gender: genderOf(c.voice),
  }));
  // One whose rig acts people's gestures (limbs) shows them as people do.
  const bobs = (id: string) => {
    const thing = scene.things.find((t) => t.id === id);
    return thing?.kind === 'drawing'
      ? thing.rig !== true && !thing.limbs
      : false;
  };
  const W = scene.stagings.wide.w;
  const places = scene.stagings.wide.places;
  const windows = beatWindows(sheet, scene);
  const props = new Set((scene.props ?? []).map((p) => p.id));
  const features = scene.setting?.features ?? [];
  // The show's own, known by their names as the lists' are.
  const own = {
    things: bible?.things ?? [],
    features: (
      bible?.sets.find((s) => s.id === sheet.set)?.features ?? []
    ).filter((f) => f.kind === DRAWN),
  };
  const isOwnFeature = (id: string) => own.features.some((f) => f.id === id);
  const out: BeatSeen[] = [];
  sheet.beats.forEach((beat, at) => {
    if (beat.kind === 'line' || beat.kind === 'narration') return;
    if (beat.kind === 'pause' || !beat.who) return;
    const who = beat.who;
    const { from, until } = windows[at];
    const within = (t: number, before = BEFORE_MS, after = AFTER_MS) =>
      t >= from - before && t < until + after;

    // What the doer is seen doing in the time.
    const seen: string[] = [];
    const steps: ('on' | 'off' | 'across')[] = [];
    scene.steps.forEach((step, k) => {
      if (k === 0 || !within(step.atMs)) return;
      const was = scene.steps[k - 1].show.includes(who);
      const is = step.show.includes(who);
      if (!was && is) steps.push('on');
      else if (was && !is) steps.push('off');
      else if (was && is) {
        const a = places[k - 1]?.[who];
        const b = places[k]?.[who];
        if (a && b && Math.abs(a.x - b.x) > W * MOVED) steps.push('across');
      }
    });
    for (const s of steps)
      seen.push(
        s === 'on'
          ? 'comes on'
          : s === 'off'
            ? 'goes off'
            : 'moves across the stage',
      );
    // A listener's nod as the line before ends is the line's, not this
    // beat's: at its end, as long as the acting's listener nod.
    const moves = (scene.acting?.[who]?.moves ?? [])
      .filter(
        ([t, move, ms]) =>
          within(t) &&
          !LINE_MOVES.has(move) &&
          !(
            move === 'nod' &&
            ms === LISTENER_NOD_MS &&
            Math.abs(t - from - LISTENER_NOD_AFTER_MS) <= 5
          ),
      )
      .map(([, move]) => move);
    for (const move of moves) seen.push(`move ${move}`);
    // Where the eyes go is only the beat's own when it is a look: a glance
    // now and then, and a listener's eyes, are anyone's.
    const looks = (scene.acting?.[who]?.look ?? []).filter(
      ([t, target]) => target !== null && t >= from && t < until,
    );
    const handled: string[] = [];
    for (const prop of scene.props ?? [])
      for (const [t, by, does, to] of prop.does) {
        if (!within(t, HANDLED_BEFORE_MS)) continue;
        if (by === who) handled.push(`${HANDLED[does] ?? does} the ${prop.id}`);
        else if (does === 'give' && to === who)
          handled.push(`is given the ${prop.id}`);
      }
    seen.push(...handled);
    // A face or a sign shown; on a drawing with no sign of its own, a pulse.
    const faces = scene.effects.filter(
      (e) =>
        e.target === who &&
        ((e.do === 'show' && e.part !== null) || e.do === 'pulse') &&
        !e.filler &&
        within(e.atMs),
    );
    for (const face of faces) seen.push(`shows ${face.part ?? 'a pulse'}`);
    // A gate or a door opened or shut in the time: by this beat only when
    // it opens, shuts or goes through something.
    const swung = (scene.setting?.featureStates ?? []).filter(([t]) =>
      within(t),
    );

    if (beat.kind === 'reaction') {
      // A sign that moves the whole body (jumping, shaking) is seen as
      // the move it is, on one the artist drew.
      const signed = Boolean(beat.sign) && moves.length > 0;
      out.push({
        beat: at,
        who,
        expects: ['face'],
        seen,
        missing: [],
        verdict:
          faces.length || signed ? 'seen' : seen.length ? 'unlike' : 'unseen',
      });
      return;
    }

    // What the words say it should be.
    const read = beat.say.trim()
      ? doingsIn(beat.say, { actors, who, ...own }).filter(
          (r) => r.who === null || r.who === who,
        )
      : [];
    const expected: {
      do: DoingId;
      thing: string | null;
      via: string | null;
      target: string | null;
    }[] = read.length
      ? read
      : beat.do
        ? [
            {
              do: beat.do,
              thing: beat.thing ?? beat.prop ?? null,
              via: null,
              target: null,
            },
          ]
        : [];
    for (const [, target] of looks)
      if (expected.some((one) => AIMS_EYES.has(one.do)))
        seen.push(`looks at ${target}`);
    for (const [, id, state] of swung)
      if (expected.some((one) => SWINGS.has(one.do)))
        seen.push(`the ${id} ${state === 'open' ? 'opens' : 'shuts'}`);
    const missing: string[] = [];
    const shown = (doing: Doing, thing: string | null): boolean => {
      if (doing.id === 'open' || doing.id === 'close')
        return swung.some(
          ([, , state]) => state === (doing.id === 'open' ? 'open' : 'shut'),
        );
      if (doing.kind === 'travel')
        return doing.id === 'enter'
          ? steps.includes('on')
          : doing.id === 'leave' || doing.id === 'squeeze'
            ? steps.includes('off')
            : steps.length > 0;
      if (doing.kind === 'handle' && ('prop' in doing.plays || thing)) {
        if (thing && !props.has(thing)) return false;
        return handled.length > 0;
      }
      const wanted = new Set<string>([doing.id]);
      if ('move' in doing.plays) {
        wanted.add(doing.plays.move);
        if (bobs(who)) {
          wanted.add(bobbingMove(doing.plays.move, true));
          wanted.add(bobbingMove(doing.plays.move, false));
        }
      }
      if (wanted.has('look') && looks.length) return true;
      if (wanted.has('point')) wanted.add('point-up');
      return moves.some((move) =>
        bobs(who) && !BOBBING_MOVES.includes(move as StageMove)
          ? false
          : wanted.has(move),
      );
    };
    let all = expected.length > 0;
    for (const one of expected) {
      const doing = doingOf(one.do);
      if (!doing) continue;
      // "It": the thing the sheet says the beat handles.
      const thing =
        one.thing ??
        (doing.kind === 'handle' ? (beat.thing ?? beat.prop) : null);
      if (thing && doing.kind === 'handle' && !props.has(thing))
        missing.push(`the ${thing}`);
      const feature =
        one.via ??
        (one.target && (featureKindOf(one.target) || isOwnFeature(one.target))
          ? one.target
          : null);
      // One a doing cannot be done without, not on the set's stage.
      const kind = feature ? featureKindOf(feature) : null;
      if (
        NEEDS_FEATURE.has(doing.id) &&
        !features.some((f) => f.id === feature || (kind && f.kind === kind))
      )
        missing.push(`the ${feature ?? 'feature it needs'}`);
      if (!shown(doing, doing.kind === 'handle' ? thing : null)) all = false;
    }
    const verdict =
      all && !missing.length ? 'seen' : seen.length ? 'unlike' : 'unseen';
    out.push({
      beat: at,
      who,
      expects: expected.map((e) => e.do),
      seen,
      missing,
      verdict,
    });
  });
  return out;
}

/** An audit in a line for our logs: each beat not seen as its words say, and why. */
export function describeAudit(seen: readonly BeatSeen[]): string[] {
  return seen
    .filter((one) => one.verdict !== 'seen')
    .map(
      (one) =>
        `b${one.beat} ${one.who} ${one.expects.join('+')}: ${one.verdict}${one.seen.length ? ` (shows ${one.seen.join(', ')})` : ''}${one.missing.length ? `; no ${one.missing.join(', ')}` : ''}`,
    );
}

/** A line said on the stage whose speaker's mouth does not move while it is said. */
export interface SilentLine {
  who: string;
  fromMs: number;
  untilMs: number;
}

/** A mouth plan's shapes open at some frame: shut all through is no movement. */
const OPENS = /[1-5]/;

/**
 * Every line said by someone on the stage while their mouth does not move:
 * no mouth planned for them in its time, and nothing else to move it (a
 * figure the kit drew, or one the artist drew whose mouth is code's, moves
 * its own while it is marked talking; one that draws its own mouths only
 * bobs by the plan). Voices from elsewhere move no mouth, and are left out.
 */
export function silentLines(scene: SceneDto): SilentLine[] {
  const out: SilentLine[] = [];
  for (const effect of scene.effects) {
    const say = effect.say;
    if (effect.do !== 'say' || !say || say.from) continue;
    const who = effect.target;
    const thing = scene.things.find((t) => t.id === who);
    if (thing?.kind !== 'drawing' || thing.backdrop) continue;
    const fromMs = effect.atMs;
    const untilMs = say.saidUntilMs ?? say.untilMs;
    // Only while they stand on the stage.
    const step = [...scene.steps].reverse().find((one) => one.atMs <= fromMs);
    if (step && !step.show.includes(who)) continue;
    const planned = (scene.acting?.[who]?.mouth ?? []).some(
      ([start, shapes]) =>
        start < untilMs &&
        start + (shapes.length * 1000) / MOUTH_FPS > fromMs &&
        OPENS.test(shapes),
    );
    if (!planned) out.push({ who, fromMs, untilMs });
  }
  return out;
}

/**
 * A scene whose every line said on the stage moves its speaker's mouth:
 * each silent one given its mouth, shape by shape from its words as the
 * voice says them, as every line's is planned (actingOf). What was put
 * right, for our log; the scene as it was when nothing needed it.
 */
export function withMouths(scene: SceneDto): {
  scene: SceneDto;
  mended: string[];
} {
  const silent = silentLines(scene);
  if (!silent.length) return { scene, mended: [] };
  const acting = { ...(scene.acting ?? {}) };
  const mended: string[] = [];
  for (const line of silent) {
    // The words the voice says in the line's time.
    const words = scene.beats.flatMap((beat) =>
      beat.words
        .filter(([, , start, end]) => start < line.untilMs && end > line.fromMs)
        .map(([from, to, startMs, endMs]) => ({
          text: beat.text.slice(from, to),
          startMs,
          endMs,
        })),
    );
    const shapes = words.length
      ? mouthOf({
          speaker: line.who,
          startMs: words[0].startMs,
          endMs: words[words.length - 1].endMs,
          words,
        })
      : '';
    const start = Math.round(words[0]?.startMs ?? line.fromMs);
    // No words to read: open and shut, as the kit's mouth does talking.
    const said =
      shapes && OPENS.test(shapes)
        ? shapes
        : Array.from(
            {
              length: Math.max(
                3,
                Math.round(((line.untilMs - line.fromMs) * MOUTH_FPS) / 1000),
              ),
            },
            (_, f) => '1220'[f % 4],
          ).join('');
    const own = acting[line.who] ?? {};
    acting[line.who] = {
      ...own,
      mouth: [...(own.mouth ?? []), [start, said] as [number, string]].sort(
        (a, b) => a[0] - b[0],
      ),
    };
    mended.push(
      `${line.who} speaks at ${start}ms with no mouth moving: given one`,
    );
  }
  return { scene: { ...scene, acting }, mended };
}

// ── The action moves, as the film plays them (studio-world-plan §4.5) ─────

/** Something wrong with how an action move plays. */
export interface MoveFault {
  /**
   * `squeezed`: a phase played shorter than its least; `not-landed`: the
   * feet not down where it lands (a leap onto a wall that never gets
   * there, a landing while still aloft or sat); `passes-through`: someone
   * goes through someone else at their depth, or a punch so close it would
   * touch; `too-many`: more big moves than a scene should have.
   */
  id: 'squeezed' | 'not-landed' | 'passes-through' | 'too-many';
  who: string | null;
  move: string | null;
  atMs: number | null;
  why: string;
}

/** A scene has at most this many big moves, unless it is all action: more is a warning. */
export const BIG_MOVES_MOST = 2;
/** A move whose step's change of place begins this near it is what carries them there (the player's FLIGHT_SLACK_MS). */
const CARRIED_SLACK_MS = 250;
/** Two whose feet are this near up and down the stage stand at one depth, as a share of its height. */
const SAME_DEPTH = 0.05;
/** How much two boxes at one depth may overlap, as a share of the narrower's width, before one is in the other. */
const OVERLAP_MOST = 0.35;
/** How far apart a punch keeps its puncher from whom it is at, middle to middle, in the puncher's widths (the player's PUNCH_CLEAR). */
const PUNCH_CLEAR = 0.95;

type Box = { x: number; y: number; w: number; h: number };

/**
 * How each action move of a made scene plays: every phase at no less than
 * its least (a move cut short by the next of the same person's, by the
 * scene's end, or given too little time is squeezed); the feet down where
 * it lands (on a feature's perch for a leap at it, with no walk or sit in
 * the way); no one passing through anyone else at their depth, and no
 * punch near enough to touch; and no more than two big moves in the scene.
 */
export function auditMoves(scene: SceneDto): MoveFault[] {
  const out: MoveFault[] = [];
  const space = scene.stagings.wide;
  const places = space?.places ?? [];
  const H = space?.h ?? 900;
  const end = Math.max(scene.durationMs, scene.settledMs ?? 0);
  const stepAt = (t: number) =>
    scene.steps.reduce((k, step, i) => (step.atMs <= t ? i : k), 0);
  const features = scene.setting?.features ?? [];
  const bottom = (b: Box) => b.y + b.h;
  let big = 0;
  for (const [who, acting] of Object.entries(scene.acting ?? {})) {
    const moves = [...(acting.moves ?? [])].sort((a, b) => a[0] - b[0]);
    moves.forEach(([at, move, ms, toward], i) => {
      if (!(ACTION_MOVES as readonly string[]).includes(move)) return;
      const name = move as ActionMove;
      if (BIG_MOVES.has(name)) big += 1;
      // As long as it plays: to its end, or the next move of theirs, or
      // the scene's end, whichever comes first.
      const next = moves.slice(i + 1).find(([t]) => t > at)?.[0] ?? Infinity;
      const played = Math.max(0, Math.min(at + ms, next, end) - at);
      const phases = movePhasesMs(name, played);
      for (const [phase, [least]] of Object.entries(MOVE_PHASES[name]) as [
        keyof typeof phases,
        [number, number],
      ][])
        if (phases[phase] < least - 1)
          out.push({
            id: 'squeezed',
            who,
            move,
            atMs: at,
            why: `its ${phase} plays ${Math.round(phases[phase])} ms of its least ${least}`,
          });
      // Where their place changes as it begins: the stage carries them.
      const k0 = stepAt(at);
      const carriedAt = scene.steps.findIndex(
        (step, k) =>
          k > 0 &&
          Math.abs(step.atMs - at) <= CARRIED_SLACK_MS &&
          places[k - 1]?.[who] &&
          places[k]?.[who] &&
          (Math.abs(places[k - 1][who].x - places[k][who].x) > 0.5 ||
            Math.abs(bottom(places[k - 1][who]) - bottom(places[k][who])) >
              0.5),
      );
      const from = places[carriedAt > 0 ? carriedAt - 1 : k0]?.[who];
      const to = places[carriedAt > 0 ? carriedAt : k0]?.[who];
      // The feet down where it lands.
      const lands = MOVE_LANDS[name];
      if (lands) {
        const p = movePhasesMs(name, ms);
        const names = ['windUp', 'act', 'follow', 'settle'] as const;
        let t = at;
        for (const one of names) {
          if (one === lands.phase) {
            t += p[one] * lands.at;
            break;
          }
          t += p[one];
        }
        const landing = places[stepAt(t)]?.[who];
        const aimed = aimedFeature(toward);
        const feature = aimed ? features.find((f) => f.id === aimed) : null;
        // Onto a feature one stands up: its perch, to the unit.
        if (name === 'leap' && feature?.perch) {
          const perch = feature.perch.wide;
          if (!landing || Math.abs(bottom(landing) - perch.y) > 1)
            out.push({
              id: 'not-landed',
              who,
              move,
              atMs: Math.round(t),
              why: `not on the ${feature.id}'s perch (feet at ${landing ? Math.round(bottom(landing)) : 'nowhere'}, the perch at ${Math.round(perch.y)})`,
            });
        }
        // Moved somewhere else before they land: by a walk, not the move.
        const moved = scene.steps.some(
          (step, k) =>
            k > 0 &&
            k !== carriedAt &&
            step.atMs > at &&
            step.atMs < t &&
            places[k - 1]?.[who] &&
            places[k]?.[who] &&
            Math.abs(places[k - 1][who].x - places[k][who].x) > 0.5,
        );
        // Still aloft in another move, or sat or lying down, as they land.
        const busy = moves.some(
          ([t0, other, ms0], j) =>
            j !== i &&
            t0 < t &&
            t0 + ms0 > t &&
            (other === 'sit' ||
              other === 'lie' ||
              ((other === 'jump' || other === 'leap' || other === 'land') &&
                t0 > at)),
        );
        if (moved || busy)
          out.push({
            id: 'not-landed',
            who,
            move,
            atMs: Math.round(t),
            why: moved
              ? 'walked somewhere else before landing'
              : 'still aloft or sat down as it lands',
          });
      }
      // No one gone through: where it lands, and on the way along the
      // ground (a sprint), no one else at their depth in the way.
      if (from && to) {
        const k = carriedAt > 0 ? carriedAt : k0;
        for (const [other, box] of Object.entries(places[k] ?? {})) {
          if (other === who || !scene.steps[k]?.show.includes(other)) continue;
          const thing = scene.things.find((x) => x.id === other);
          if (thing?.kind !== 'drawing' || thing.backdrop) continue;
          if (Math.abs(bottom(box) - bottom(to)) > SAME_DEPTH * H) continue;
          const overlap =
            Math.min(to.x + to.w, box.x + box.w) - Math.max(to.x, box.x);
          const between =
            name === 'run-fast' &&
            Math.min(from.x, to.x) < box.x + box.w / 2 &&
            box.x + box.w / 2 < Math.max(from.x, to.x);
          if (overlap > OVERLAP_MOST * Math.min(to.w, box.w) || between)
            out.push({
              id: 'passes-through',
              who,
              move,
              atMs: at,
              why: between
                ? `runs through ${other}`
                : `lands in ${other}'s place`,
            });
        }
      }
      // A punch keeps its distance: never near enough to touch.
      if (name === 'punch' && toward && places[k0]?.[toward] && to) {
        const them = places[k0][toward];
        const gap = Math.abs(them.x + them.w / 2 - (to.x + to.w / 2));
        if (gap < PUNCH_CLEAR * to.w)
          out.push({
            id: 'passes-through',
            who,
            move,
            atMs: at,
            why: `a punch at ${toward} from ${Math.round(gap)} units: near enough to touch`,
          });
      }
    });
  }
  if (big > BIG_MOVES_MOST)
    out.push({
      id: 'too-many',
      who: null,
      move: null,
      atMs: null,
      why: `${big} big moves; one or two a scene, unless it is all action`,
    });
  return out;
}

/** The move audit in a line for our logs. */
export function describeMoves(faults: readonly MoveFault[]): string[] {
  return faults.map(
    (f) =>
      `${f.id}${f.who ? ` ${f.who}` : ''}${f.move ? ` ${f.move}` : ''}${f.atMs !== null ? ` @${f.atMs}` : ''}: ${f.why}`,
  );
}

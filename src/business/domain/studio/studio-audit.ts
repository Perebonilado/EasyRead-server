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
import { doingsIn, type Actor } from '../scene-directions';
import {
  BOBBING_MOVES,
  bobbingMove,
  doingOf,
  featureKindOf,
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
  const bobs = (id: string) => {
    const thing = scene.things.find((t) => t.id === id);
    return thing?.kind === 'drawing' ? thing.rig !== true : false;
  };
  const W = scene.stagings.wide.w;
  const places = scene.stagings.wide.places;
  const end = Math.max(scene.durationMs, scene.settledMs ?? 0);
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
  let spoken = -1;
  sheet.beats.forEach((beat, at) => {
    if (beat.kind === 'line' || beat.kind === 'narration') {
      if (beat.say.trim()) spoken += 1;
      return;
    }
    if (beat.kind === 'pause' || !beat.who) return;
    const who = beat.who;
    const from = spoken >= 0 ? (scene.beats[spoken]?.endMs ?? 0) : 0;
    const until = scene.beats[spoken + 1]?.startMs ?? end;
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

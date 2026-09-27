/**
 * A made scene said in words, from what the film plays and nothing else:
 * who is drawn how, where each one is, who comes and goes, the moves
 * they make, what they hold and wear, what moves along with whom. The
 * sheet gives only the beats' names and times; what is said of each is
 * what the film shows in its time, so a scene whose sheet is right and
 * whose film is wrong reads as wrong.
 *
 * It is what a maker's request is checked against once the scene is made
 * again ("make Tobi get out of bed himself"), and the few faults code can
 * see for itself: someone drawn with the furniture in their drawing, who
 * carries it about; someone moving while held sat or lain down; clothes
 * the words have someone in, carried instead; a thing held that is taller
 * than whoever holds it.
 */
import type { SceneDto, SceneThingDto } from '../../../contracts';
import { beatWindows } from './studio-audit';
import { wornSaidIn } from './studio-check';
import { namesOf, type StorySheet, type StudioBible } from './studio';
import { doingOf } from '../scene-doings';
import { wearableOf } from '../scene-wear';

/** The faults code can see in a made scene, each by its id. */
export const STAGED_FAULTS = [
  // A person drawn in a pose for the whole scene, the kit's rig gone.
  'baked-pose',
  // Furniture that moves with someone: a bed in their drawing, or moving held down.
  'furniture-moves',
  // Clothes the words have someone in, carried or lying about instead.
  'not-worn',
  // A thing held that is taller than whoever holds it.
  'held-too-big',
  // A feature twice: in the set, and in someone's drawing.
  'double-feature',
] as const;
export type StagedFaultId = (typeof STAGED_FAULTS)[number];

export interface StagedFault {
  id: StagedFaultId;
  /** The sheet's beat it shows at; null for the whole scene. */
  beat: number | null;
  who: string;
  /** What is wrong, in plain words, for the writer and for us. */
  why: string;
}

/** Moves every line brings, not any beat's doing. */
const LINE_MOVES = new Set(['gesture', 'gesture-left', 'brows', 'lean']);
/** Moves that need someone on their feet. */
const ON_FEET = new Set([
  'stand',
  'jump',
  'spin',
  'hop',
  'fall',
  'kick',
  'bow',
]);
/** A place change smaller than this share of the stage is none. */
const MOVED = 0.02;

/** A moment as a clock reads it, to a tenth: 0:04.2. */
const at = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${Math.floor((s - whole) * 10)}`;
};

type Drawing = Extract<SceneThingDto, { kind: 'drawing' }>;

/** How tall a drawing is in the figure kit's units: its frame's own height for one the kit drew, else what it says. */
function unitsOf(thing: Drawing): number | null {
  if (thing.units) return thing.units;
  const m = /viewBox="[-\d.]+ [-\d.]+ [-\d.]+ ([\d.]+)"/.exec(thing.svg ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * How a person the kit drew is drawn for the whole scene: in bed (the bed
 * part of the drawing), lying, or standing. From what compose says; for a
 * scene made before it said, from the drawing's shape: rigged, with no
 * legs to bend, and wider than tall is a bed.
 */
export function drawnAs(thing: Drawing): 'in bed' | 'lying' | 'standing' {
  if (thing.drawnAs) return thing.drawnAs;
  if (thing.rig && !thing.legs && thing.aspect > 1) return 'in bed';
  return 'standing';
}

/** Who holds each thing at a moment: someone, worn by someone, or no one. */
function holdersAt(
  scene: SceneDto,
  t: number,
): Map<string, { by: string | null; worn: boolean }> {
  const out = new Map<string, { by: string | null; worn: boolean }>();
  for (const prop of scene.props ?? []) {
    let by: string | null = prop.held?.by ?? null;
    let worn = false;
    // Taken off before anything else is done with it: worn until then.
    if (prop.does[0]?.[2] === 'doff') {
      worn = true;
      by = prop.does[0][1];
    }
    for (const [when, who, does, to] of [...prop.does].sort(
      (a, b) => a[0] - b[0],
    )) {
      if (when > t) break;
      if (does === 'take' || does === 'catch') [by, worn] = [who, false];
      else if (does === 'give') [by, worn] = [to ?? null, false];
      else if (does === 'wear') [by, worn] = [who, true];
      else if (does === 'doff') [by, worn] = [who, false];
      else if (
        does === 'put' ||
        does === 'drop' ||
        does === 'kick' ||
        does === 'throw' ||
        does === 'eat'
      )
        [by, worn] = [null, false];
    }
    out.set(prop.id, { by, worn });
  }
  return out;
}

/**
 * The faults code sees in a made scene, each at the beat it shows in.
 * `bible` gives the names the words call people by.
 */
export function stagedFaults(
  sheet: StorySheet,
  scene: SceneDto,
  bible: StudioBible | null = null,
): StagedFault[] {
  const out: StagedFault[] = [];
  const nameOf = (id: string) =>
    bible?.characters.find((c) => c.id === id)?.name ?? id;
  const windows = beatWindows(sheet, scene);
  const beatAt = (t: number) => {
    const k = windows.findIndex(
      (w, i) =>
        t >= w.from - 300 &&
        t < w.until + 300 &&
        sheet.beats[i].kind !== 'line' &&
        sheet.beats[i].kind !== 'narration',
    );
    return k >= 0 ? k : null;
  };
  const W = scene.stagings.wide.w;
  const places = scene.stagings.wide.places;
  const people = scene.things.filter(
    (t): t is Drawing => t.kind === 'drawing' && Boolean(t.rig),
  );
  const features = scene.setting?.features ?? [];
  for (const person of people) {
    const who = person.id;
    const how = drawnAs(person);
    // The kit's rig gone: a pose drawn for the whole scene.
    if (!person.joints)
      out.push({
        id: 'baked-pose',
        beat: null,
        who,
        why: `${nameOf(who)} is drawn ${how === 'standing' ? 'in one pose' : how} for the whole scene, not as the rigged standing figure`,
      });
    if (how !== 'standing' && features.some((f) => f.kind === 'bed'))
      out.push({
        id: 'double-feature',
        beat: null,
        who,
        why: `${nameOf(who)} is drawn in a bed of their own while the set has its bed`,
      });
    // Furniture in their drawing, carried where they go.
    if (how !== 'standing') {
      const moves = (scene.acting?.[who]?.moves ?? []).filter(([, move]) =>
        ON_FEET.has(move),
      );
      const goes = scene.steps.findIndex((step, k) => {
        if (!k) return false;
        const was = scene.steps[k - 1].show.includes(who);
        const is = step.show.includes(who);
        const a = places[k - 1]?.[who];
        const b = places[k]?.[who];
        return (was && !is) || (a && b && Math.abs(a.x - b.x) > W * MOVED);
      });
      const first = [
        ...moves.map(([t]) => t),
        ...(goes > 0 ? [scene.steps[goes].atMs] : []),
      ].sort((a, b) => a - b)[0];
      if (first !== undefined)
        out.push({
          id: 'furniture-moves',
          beat: beatAt(first),
          who,
          why: `${nameOf(who)} is drawn ${how}, with the ${how === 'in bed' ? 'bed' : 'floor'} part of the drawing, and moves at ${at(first)}: it moves with them`,
        });
    }
    // Moving while held sat or lain down, never got up.
    const moves = scene.acting?.[who]?.moves ?? [];
    for (const [start, move, ms] of moves) {
      if (move !== 'sit' && move !== 'lie') continue;
      const stood = moves.some(
        ([t, m]) => m === 'stand' && t > start && t < start + ms,
      );
      if (stood) continue;
      const k = scene.steps.findIndex(
        (step, i) =>
          i > 0 &&
          step.atMs > start + 50 &&
          step.atMs < start + ms - 50 &&
          ((scene.steps[i - 1].show.includes(who) &&
            !step.show.includes(who)) ||
            (places[i - 1]?.[who] &&
              places[i]?.[who] &&
              Math.abs(places[i - 1][who].x - places[i][who].x) > W * MOVED)),
      );
      if (k > 0)
        out.push({
          id: 'furniture-moves',
          beat: beatAt(scene.steps[k].atMs),
          who,
          why: `${nameOf(who)} moves at ${at(scene.steps[k].atMs)} while still ${move === 'sit' ? 'sitting' : 'lying'} down, without getting up`,
        });
    }
  }
  // Clothes the words have someone in, in a hand or on the ground.
  const actors = (bible?.characters ?? []).map((c) => ({
    id: c.id,
    names: namesOf(c),
  }));
  sheet.beats.forEach((beat, k) => {
    if (!beat.say.trim()) return;
    for (const worn of wornSaidIn(beat.say)) {
      const before = beat.say.slice(0, worn.at);
      const named = actors
        .flatMap((a) =>
          a.names.map((name) => ({ id: a.id, at: before.lastIndexOf(name) })),
        )
        .filter((one) => one.at >= 0)
        .sort((a, b) => b.at - a.at)[0]?.id;
      const who =
        worn.whose === 'my' && beat.kind === 'line'
          ? beat.who
          : worn.whose === 'your' && beat.kind === 'line'
            ? beat.to
            : (named ?? (beat.kind !== 'narration' ? beat.who : null));
      if (!who) continue;
      const wear = wearableOf(worn.thing);
      const prop = (scene.props ?? []).find(
        (p) =>
          p.id === worn.thing ||
          (wear &&
            wearableOf(p.id)?.kit === wear.kit &&
            wearableOf(p.id)?.slot === wear.slot),
      );
      if (!prop) continue;
      // When the words have them in it: as the line is said; as the doing
      // they are in it for is seen (the spin "in his new uniform"), else
      // by the end of its quiet.
      const move = doingOf(beat.do)?.plays;
      const seen =
        beat.kind === 'action' && move && 'move' in move
          ? (scene.acting?.[who]?.moves ?? []).find(
              ([t, m]) => m === move.move && t >= windows[k].from - 300,
            )?.[0]
          : undefined;
      const t =
        beat.kind === 'line' || beat.kind === 'narration'
          ? windows[k].from + 200
          : (seen ?? windows[k].until - 100);
      const now = holdersAt(scene, t).get(prop.id);
      if (!now || now.worn) continue;
      out.push({
        id: 'not-worn',
        beat: k,
        who,
        why: `the words have ${nameOf(who)} in the ${worn.thing} at ${at(t)}, but it is ${now.by ? `in ${nameOf(now.by)}'s hand` : 'lying on the stage'}, not worn`,
      });
    }
  });
  // A thing held that is taller than whoever holds it, and never worn.
  for (const prop of scene.props ?? []) {
    const holders = new Set<string>([
      ...(prop.held ? [prop.held.by] : []),
      ...prop.does.flatMap(([, who, does, to]) =>
        does === 'take' || does === 'catch'
          ? [who]
          : does === 'give' && to
            ? [to]
            : [],
      ),
    ]);
    if (prop.does.some(([, , does]) => does === 'wear')) continue;
    // A scene kept from before things were measured says nothing of it.
    const tall = prop.viewBox?.[3];
    if (!tall) continue;
    for (const who of holders) {
      const holder = people.find((p) => p.id === who);
      const units = holder ? unitsOf(holder) : null;
      if (!units || tall <= units * 0.9) continue;
      out.push({
        id: 'held-too-big',
        beat: null,
        who,
        why: `the ${prop.id} ${nameOf(who)} holds is drawn taller than them`,
      });
      break;
    }
  }
  return out;
}

/**
 * A made scene in words, from what its film plays: `lines` for the
 * checker and the writer, and `key`, the same without its times, which is
 * the same for two makes that show the same.
 */
export function describeStaged(
  sheet: StorySheet,
  scene: SceneDto,
  bible: StudioBible | null = null,
): { lines: string[]; key: string } {
  const nameOf = (id: string) =>
    bible?.characters.find((c) => c.id === id)?.name ??
    scene.things.find((t) => t.id === id && t.kind === 'words')?.id ??
    id;
  const set = bible?.sets.find((s) => s.id === sheet.set);
  const W = scene.stagings.wide.w;
  const places = scene.stagings.wide.places;
  const features = scene.setting?.features ?? [];
  const windows = beatWindows(sheet, scene);
  const people = scene.things.filter(
    (t): t is Drawing =>
      t.kind === 'drawing' && Boolean(t.rig || t.units || t.mouth),
  );
  /** Where someone is at a step: by a feature, else a part of the stage. */
  const whereAt = (k: number, who: string): string => {
    const place = places[k]?.[who];
    if (!place) return 'off the stage';
    const x = place.x + place.w / 2;
    const near = features
      .map((f) => ({ f, d: Math.abs(f.at.wide.x + f.at.wide.w / 2 - x) }))
      .filter(({ f, d }) => d < Math.max(f.at.wide.w * 0.55, W * 0.08))
      .sort((a, b) => a.d - b.d)[0];
    if (near) return `by the ${near.f.name}`;
    const share = x / W;
    return share < 0.2
      ? 'on the left'
      : share < 0.4
        ? 'left of the middle'
        : share < 0.6
          ? 'in the middle'
          : share < 0.8
            ? 'right of the middle'
            : 'on the right';
  };
  const lines: string[] = [];
  lines.push(
    `Scene "${sheet.title}", ${set?.name ?? sheet.set}. The set's things: ${
      features.length
        ? features
            .map(
              (f) =>
                `the ${f.name} (${f.svg ? 'drawn by the stage' : 'painted'})`,
            )
            .join(', ')
        : 'none'
    }.`,
  );
  for (const person of people) {
    const how = drawnAs(person);
    const dresses = scene.effects.filter(
      (e) =>
        e.target === person.id &&
        e.do === 'show' &&
        e.part?.startsWith('dress-'),
    );
    lines.push(
      `${nameOf(person.id)}: ${
        how === 'in bed'
          ? 'drawn in bed: the bed is part of the drawing and goes wherever they go'
          : how === 'lying'
            ? 'drawn lying down for the whole scene'
            : person.rig
              ? 'drawn standing, rigged'
              : 'drawn by the artist'
      }${dresses.length ? `; changes clothes at ${dresses.map((e) => at(e.atMs)).join(', ')}` : ''}.`,
    );
  }
  for (const prop of scene.props ?? []) {
    const holder = prop.held?.by ?? prop.does[0]?.[1];
    const person = people.find((p) => p.id === holder);
    const units = person ? unitsOf(person) : null;
    const tall = prop.viewBox?.[3] ?? 0;
    lines.push(
      `The ${prop.id}: ${units && tall > units * 0.9 ? `drawn taller than ${nameOf(holder)}` : 'hand-sized'}${prop.held ? `, in ${nameOf(prop.held.by)}'s ${prop.held.in === 'mouth' ? 'mouth' : 'hand'} as it opens` : ''}.`,
    );
  }
  // Each beat of the sheet that is done, in its time: what is seen.
  const HANDLED: Record<string, string> = {
    take: 'takes',
    give: 'gives',
    put: 'puts down',
    drop: 'drops',
    throw: 'throws',
    catch: 'catches',
    kick: 'kicks',
    eat: 'eats',
    drink: 'drinks from',
    raise: 'raises',
    break: 'breaks',
    dip: 'dips into',
    chew: 'chews',
    wear: 'puts on',
    doff: 'takes off',
  };
  // Beats done in one quiet are seen together: said once, all named.
  const groups: number[][] = [];
  sheet.beats.forEach((beat, k) => {
    if (beat.kind === 'line' || beat.kind === 'narration' || !beat.who) return;
    const last = groups[groups.length - 1];
    const same =
      last &&
      windows[last[0]].from === windows[k].from &&
      windows[last[0]].until === windows[k].until;
    if (same) last.push(k);
    else groups.push([k]);
  });
  for (const group of groups) {
    const k = group[0];
    const beat = sheet.beats[k];
    const { from, until } = windows[k];
    const inTime = (t: number) => t >= from - 300 && t < until + 600;
    const noted: { t: number; what: string }[] = [];
    let first = Infinity;
    const note = (t: number, what: string) => {
      first = Math.min(first, t);
      noted.push({ t, what });
    };
    for (const person of people) {
      const who = person.id;
      const baked = drawnAs(person) !== 'standing';
      const withIt = baked
        ? `; the ${drawnAs(person) === 'in bed' ? 'bed' : 'floor'} moves with them`
        : '';
      scene.steps.forEach((step, i) => {
        if (!i || !inTime(step.atMs)) return;
        const was = scene.steps[i - 1].show.includes(who);
        const is = step.show.includes(who);
        const via = step.exit?.[who]?.via ?? step.enter[who]?.via;
        if (!was && is)
          note(
            step.atMs,
            `${nameOf(who)} comes on${via ? ` through the ${via}` : ''}`,
          );
        else if (was && !is)
          note(
            step.atMs,
            `${nameOf(who)} goes off${via ? ` through the ${via}` : ''}${step.exit?.[who]?.how === 'run' ? ' at a run' : ''}${withIt}`,
          );
        const inBed = step.abed?.[who];
        const wasInBed = scene.steps[i - 1].abed?.[who];
        if (inBed && !wasInBed)
          note(step.atMs, `${nameOf(who)} gets into the ${inBed}`);
        else if (!inBed && wasInBed && was && is)
          note(
            step.atMs,
            `${nameOf(who)} is out of the ${wasInBed}, beside it`,
          );
        else if (was && is) {
          const a = places[i - 1]?.[who];
          const b = places[i]?.[who];
          if (a && b && Math.abs(a.x - b.x) > W * MOVED)
            note(step.atMs, `${nameOf(who)} goes ${whereAt(i, who)}${withIt}`);
        }
      });
      for (const [t, move] of scene.acting?.[who]?.moves ?? []) {
        if (!inTime(t) || LINE_MOVES.has(move)) continue;
        note(
          t,
          move === 'stand'
            ? `${nameOf(who)} gets up${withIt}`
            : move === 'sit'
              ? `${nameOf(who)} sits down`
              : move === 'lie'
                ? `${nameOf(who)} lies down`
                : `${nameOf(who)} makes the move "${move}"${ON_FEET.has(move) ? withIt : ''}`,
        );
      }
      for (const effect of scene.effects)
        if (
          effect.target === who &&
          effect.do === 'show' &&
          effect.part?.startsWith('dress-') &&
          inTime(effect.atMs)
        )
          note(effect.atMs, `${nameOf(who)} is now dressed in other clothes`);
    }
    for (const prop of scene.props ?? [])
      for (const [t, who, does, to] of prop.does)
        if (inTime(t))
          note(
            t,
            `${nameOf(who)} ${HANDLED[does] ?? does} the ${prop.id}${does === 'give' && to ? ` to ${nameOf(to)}` : ''}`,
          );
    const seen = noted
      .sort((a, b) => a.t - b.t)
      .map((one) => one.what)
      .filter((what, i, all) => all.indexOf(what) === i);
    // Held down from the start: sitting, lying, in bed.
    if (
      k ===
      sheet.beats.findIndex((b) => b.kind !== 'line' && b.kind !== 'narration')
    )
      for (const person of people) {
        const held = (scene.acting?.[person.id]?.moves ?? []).find(
          ([t, move]) =>
            (move === 'sit' || move === 'lie') &&
            t <= (scene.steps[0]?.atMs ?? 0) + 700,
        );
        const bed = scene.steps[0]?.abed?.[person.id];
        if (held)
          seen.unshift(
            `${nameOf(person.id)} opens ${bed ? `in the ${bed}, ${held[1] === 'sit' ? 'sitting up' : 'lying'} under its cover` : held[1] === 'sit' ? 'sitting' : 'lying down'}`,
          );
      }
    const named = group
      .map((i) => {
        const one = sheet.beats[i];
        return `"${one.say.trim() || (one.kind === 'reaction' ? `${nameOf(one.who ?? '')}'s face` : (one.do ?? one.kind))}"`;
      })
      .join(', ');
    lines.push(
      `${group.length > 1 ? `Beats ${k + 1} to ${group[group.length - 1] + 1}` : `Beat ${k + 1}`} ${named}${first < Infinity ? ` ${at(first)}` : ''}: ${seen.length ? seen.join('; ') : 'nothing is seen'}.`,
    );
    void beat;
  }
  // How it ends: who is left where, what lies about, who has what.
  const last = scene.steps.length - 1;
  const end = Math.max(scene.durationMs, scene.settledMs ?? 0);
  const holders = holdersAt(scene, end);
  const left =
    last >= 0
      ? scene.steps[last].show.filter((id) => people.some((p) => p.id === id))
      : [];
  lines.push(
    `At the end: ${left.length ? left.map((id) => `${nameOf(id)} ${whereAt(last, id)}`).join(', ') : 'no one'} on the stage; ${
      [...holders]
        .map(([prop, one]) =>
          one.worn
            ? `${one.by ? nameOf(one.by) : 'someone'} wears the ${prop}`
            : one.by
              ? `${nameOf(one.by)} has the ${prop}`
              : `the ${prop} lies on the stage`,
        )
        .join(', ') || 'nothing handled'
    }.`,
  );
  return {
    lines,
    key: lines.map((line) => line.replace(/ ?\d+:\d\d\.\d/g, '')).join('\n'),
  };
}

/** The words a maker uses for each fault code sees, when that is what they asked about. */
const CONCERNS: Record<StagedFaultId, RegExp> = {
  'baked-pose':
    /\b(?:beds?|sofas?|chairs?|lying|lies|in bed|out of bed|gets? up|stands? up|pose)\b/iu,
  'furniture-moves':
    /\b(?:beds?|sofas?|chairs?|benches|bench|furniture|out of bed|gets? up|stands? up|moves? with|hops?|follows?)\b/iu,
  'not-worn':
    /\b(?:wear(?:s|ing)?|dress(?:ed|es)?|clothes|uniforms?|coats?|put(?:s|ting)? on|carr(?:y|ies|ying)|follow(?:s|ed|ing)?|holding)\b/iu,
  'held-too-big': /\b(?:big|bigger|huge|size|giant|tall(?:er)?)\b/iu,
  'double-feature': /\b(?:two beds?|beds?|twice|double)\b/iu,
};

/** Whether a fault code sees is what a maker's words ask about. */
export function concerns(fault: StagedFault, words: string): boolean {
  return CONCERNS[fault.id].test(words);
}

/**
 * A story's scene sheet as the stage plays it: exactly what the sheet says
 * and nothing else. Who is on the stage is who the sheet has there, in the
 * order of their spots, left to right; who says a line is who the sheet
 * says; each action, reaction and thing handled comes where the sheet has
 * it, in the quiet after the line before it. Nothing is guessed from the
 * words, as a book's page must be: the sheet already said it all.
 *
 * The one thing read from the words is what the narrator says someone
 * does ("Mama waved"), acted as it is said, so that a gesture the
 * narration tells is seen; and only by someone on the stage.
 */
import { faceOfLine } from '../scene-feeling';
import { directionsIn, type Actor } from '../scene-directions';
import { genderOf } from '../scene-script';
import { PROP_KIND } from '../scene-props';
import {
  fitLayout,
  type SceneBeat,
  type SceneEffect,
  type SceneEffectKind,
  type SceneScript,
  type SceneStage,
  type SceneStep,
  type SceneThing,
} from '../scene-script';
import {
  STORY_VERSION,
  type StoryBible,
  type StoryCharacter,
  type StoryPlace,
} from '../scene-story';
import type { FigureFace } from '../scene-figure';
import {
  SPOTS,
  type SheetBeat,
  type Spot,
  type StorySheet,
  type StudioBible,
} from './studio';

/** An action's quiet, at least and at most; and a run of them after one sentence at most. */
const HOLD_LEAST_S = 0.6;
const RUN_MOST_S = 3;
/** Seconds of quiet each kind of moment takes, unless the sheet says. */
const HOLD_S: Partial<Record<string, number>> = {
  enter: 1.4,
  leave: 1.4,
  walk: 1.2,
  hug: 1.6,
  reach: 1,
  still: 1,
};
/** Room after a sentence for what is done with a thing in it. */
const BUSINESS_S = 0.7;
/** How a line said with a feeling lands on the one it is said to. */
const LANDS: Partial<Record<FigureFace, FigureFace>> = {
  angry: 'afraid',
  sad: 'sad',
  happy: 'happy',
  surprised: 'surprised',
  pain: 'sad',
};

const phraseOf = (text: string) =>
  text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
const round = (n: number) => Math.round(n * 100) / 100;

/** The place thing's id: never the same as a character's. */
export const placeThingId = (set: string) => `place-${set}`;

/**
 * The show's bible as a book's story is kept, for the drawing and the
 * voices: each character once (a person drawn by the kit, anyone else by
 * the artist, each in the voice chosen for them), each place once, and
 * each scene a page of it.
 */
export function storyBibleFor(
  bible: StudioBible,
  sheets: readonly StorySheet[],
  title: string,
): StoryBible {
  const firstIn = (id: string) => {
    const at = sheets.findIndex(
      (sheet) =>
        sheet.onStage.some((p) => p.who === id) ||
        sheet.beats.some((b) => b.who === id),
    );
    return at >= 0 ? at + 1 : 1;
  };
  const characters: StoryCharacter[] = bible.characters.map((c, met) => ({
    id: c.id,
    name: c.name,
    aliases: [],
    role: c.role,
    look: c.look,
    traits: c.traits,
    firstPage: firstIn(c.id),
    met,
    voice: c.voice,
    kind: c.kind,
    size: c.size,
    figure: c.figure,
    presence: 'seen',
    carries: c.carries,
    voicePick: c.voicePick,
  }));
  const places: StoryPlace[] = bible.sets.map((s) => ({
    id: s.id,
    name: s.name,
    aliases: [],
    look: s.look,
    firstPage: Math.max(1, sheets.findIndex((sheet) => sheet.set === s.id) + 1),
    sound: s.sound,
    kind: s.kind,
    stand: s.stand,
    front: s.front,
  }));
  return {
    characters,
    places,
    pages: sheets.map((sheet, k) => ({
      page: k + 1,
      summary: sheet.title,
      present: sheet.onStage.map((p) => ({
        id: p.who,
        mood: p.face === 'pain' ? 'sad' : p.face,
      })),
      place: sheet.set || null,
      time: sheet.time,
      weather: sheet.weather,
      crowd: sheet.crowd,
    })),
    world: bible.world,
    version: STORY_VERSION,
    title,
  };
}

/** Whoever the sheet has on the stage, left to right by their spots. */
function inSpotOrder(here: ReadonlyMap<string, Spot>): string[] {
  return [...here]
    .sort((a, b) => SPOTS.indexOf(a[1]) - SPOTS.indexOf(b[1]))
    .map(([id]) => id);
}

/**
 * A story's sheet, checked and mended, as the stage's script. `bible` is
 * the show's; the sheet's people and set are its own.
 */
export function stageStory(sheet: StorySheet, bible: StudioBible): SceneScript {
  const byId = new Map(bible.characters.map((c) => [c.id, c]));
  const place = bible.sets.find((s) => s.id === sheet.set) ?? null;
  const placeId = place ? placeThingId(place.id) : null;

  // Everyone the scene has a part for: on the stage as it opens, coming
  // on, doing or saying anything, or a voice from off it.
  const parts = new Set<string>(sheet.onStage.map((p) => p.who));
  for (const beat of sheet.beats)
    if (beat.who && byId.has(beat.who)) parts.add(beat.who);
  const opening = new Map(sheet.onStage.map((p) => [p.who, p]));
  const cast: SceneThing[] = [];
  if (place && placeId)
    cast.push({
      id: placeId,
      kind: 'place',
      ref: place.id,
      name: place.name,
      sound: place.sound,
    });
  for (const id of parts) {
    const c = byId.get(id);
    if (!c) continue;
    const at = opening.get(id);
    cast.push({
      id,
      kind: 'character',
      ref: id,
      name: c.name,
      state: at?.face ?? null,
      // Everyone equal, so the stage keeps the sheet's own order: its spots.
      met: 0,
      intro: [],
      traits: c.traits,
      ...(at && at.pose !== 'standing' ? { pose: at.pose } : {}),
      ...((at?.holding ?? c.carries)
        ? { holding: (at?.holding ?? c.carries)! }
        : {}),
      ...(c.role === 'minor' ? { minor: true as const } : {}),
    });
  }
  const inCast = new Set(cast.map((t) => t.id));

  // The beats: lines and narration spoken; everything else a moment in
  // the quiet after the sentence before it, or before the first.
  const beats: SceneBeat[] = [];
  /** Each sheet beat's spoken beat, and each other one's moment. */
  const spokenAt = new Map<number, number>();
  const runs = new Map<number, { at: number; hold: number }[]>();
  sheet.beats.forEach((raw, at) => {
    if (raw.kind === 'line' || raw.kind === 'narration') {
      if (!raw.say.trim()) return;
      const beat: SceneBeat = {
        say: raw.say.trim(),
        pause: 'short',
        delivery: 'explain',
        kind: raw.kind === 'line' ? 'line' : 'narration',
      };
      if (raw.kind === 'line' && raw.who && inCast.has(raw.who)) {
        beat.speaker = raw.who;
        beat.lines = [{ span: [0, beat.say.length], speaker: raw.who }];
        if (raw.to && raw.to !== raw.who && inCast.has(raw.to))
          beat.to = raw.to;
        if (raw.from && raw.from !== 'here') beat.from = raw.from;
        if (raw.pace) beat.pace = raw.pace;
      } else if (raw.kind === 'line') {
        // No one of the cast to say it: the narrator, as a quotation.
        beat.kind = 'narration';
        beat.say = `"${beat.say}"`;
      }
      if (!beats.length) beat.music = sheet.music;
      spokenAt.set(at, beats.length);
      beats.push(beat);
      return;
    }
    const after = beats.length - 1;
    const hold =
      raw.kind === 'pause'
        ? (raw.seconds ?? 1)
        : raw.kind === 'business'
          ? BUSINESS_S
          : raw.kind === 'reaction'
            ? 0.6
            : Math.max(HOLD_LEAST_S, raw.seconds ?? HOLD_S[raw.do ?? ''] ?? 1);
    runs.set(after, [...(runs.get(after) ?? []), { at, hold }]);
  });
  /** Each moment: after which spoken beat, and how far into the quiet. */
  const moments = new Map<number, { after: number; offset: number }>();
  let lead = 0;
  for (const [after, run] of runs) {
    const asked = run.reduce((n, one) => n + one.hold, 0);
    const fit = asked > RUN_MOST_S ? RUN_MOST_S / asked : 1;
    let offset = 0;
    for (const one of run) {
      moments.set(one.at, { after, offset: round(offset) });
      offset += one.hold * fit;
    }
    const total = round(Math.min(RUN_MOST_S, asked));
    if (after >= 0) beats[after].holdS = total;
    else lead = total;
  }

  // The stage, step by step.
  const here = new Map<string, Spot>(sheet.onStage.map((p) => [p.who, p.spot]));
  const stageNow = (extra: Partial<SceneStage> = {}): SceneStage => {
    const show = inSpotOrder(here).filter((id) => inCast.has(id));
    return {
      layout: show.length
        ? fitLayout(show.length > 1 ? 'row' : 'one', show.length)
        : 'one',
      show,
      arrows: [],
      ...extra,
    };
  };
  const steps: SceneStep[] = [];
  const opensQuiet = lead > 0;
  steps.push({
    at: { beat: opensQuiet ? -1 : 0, phrase: '' },
    word: 0,
    ...(opensQuiet ? { after: 0 } : {}),
    stage: stageNow(placeId ? { backdrop: placeId } : {}),
    effects: [],
  });

  const lastFace = new Map<string, FigureFace>();
  const faceEffect = (who: string, face: FigureFace | null): SceneEffect[] => {
    if (!face || !here.has(who)) return [];
    lastFace.set(who, face);
    return [{ target: who, part: face, do: 'show' }];
  };
  const moveEffect = (raw: SheetBeat): SceneEffect[] => {
    if (!raw.who || !raw.do || !here.has(raw.who)) return [];
    if (['enter', 'leave', 'walk', 'still'].includes(raw.do)) return [];
    const up = /\b(?:up|sky|stars?|moon|heavens?)\b/iu.test(raw.say);
    const down = /\b(?:down|ground|floor)\b/iu.test(raw.say);
    const toward =
      raw.to && raw.to !== raw.who && (here.has(raw.to) || raw.to === '@up')
        ? raw.to
        : raw.do === 'look' || raw.do === 'point'
          ? up
            ? '@up'
            : down
              ? '@down'
              : null
          : null;
    if ((raw.do === 'hug' || raw.do === 'reach') && !toward) return [];
    if (raw.do === 'look' && !toward) return [];
    return [{ target: raw.who, part: toward, do: raw.do as SceneEffectKind }];
  };

  sheet.beats.forEach((raw, at) => {
    const k = spokenAt.get(at);
    if (k !== undefined) {
      const beat = beats[k];
      const effects: SceneEffect[] = [];
      if (beat.kind === 'line' && beat.speaker) {
        // The face the line is said with: the sheet's; else what its words
        // tell, if it is not the one they wear already.
        const told = raw.feeling ?? faceOfLine(beat.say);
        if (told && told !== lastFace.get(beat.speaker))
          effects.push(...faceEffect(beat.speaker, told));
      }
      if (effects.length)
        steps.push({
          at: { beat: k, phrase: phraseOf(beat.say) },
          word: 0,
          stage: null,
          effects,
        });
      // How it lands on the one it is said to, as it ends: unless the sheet
      // has them react next.
      const next = sheet.beats[at + 1];
      const reacts = next?.kind === 'reaction' && next.who === beat.to;
      const heard = raw.feeling ? LANDS[raw.feeling] : undefined;
      if (beat.to && here.has(beat.to) && heard && !reacts) {
        const words = beat.say.split(/\s+/).filter(Boolean);
        const last = Math.max(0, words.length - 2);
        steps.push({
          at: { beat: k, phrase: words.slice(last).join(' ') },
          word: last,
          stage: null,
          effects: faceEffect(beat.to, heard),
        });
      }
      return;
    }
    const moment = moments.get(at);
    if (!moment) return;
    const effects: SceneEffect[] = [];
    let stage: SceneStage | null = null;
    if (raw.kind === 'action' && raw.who && inCast.has(raw.who)) {
      if (raw.do === 'enter' && !here.has(raw.who)) {
        here.set(raw.who, raw.spot ?? 'centre');
        stage = stageNow({ arrive: [raw.who] });
      } else if (raw.do === 'leave' && here.has(raw.who)) {
        here.delete(raw.who);
        stage = stageNow({ leave: [raw.who] });
      } else if (raw.do === 'walk' && raw.spot && here.has(raw.who)) {
        here.set(raw.who, raw.spot);
        stage = stageNow();
      } else effects.push(...moveEffect(raw));
    }
    if (raw.kind === 'reaction' && raw.who && here.has(raw.who)) {
      if (raw.feeling) effects.push(...faceEffect(raw.who, raw.feeling));
      if (raw.sign)
        effects.push({ target: raw.who, part: raw.sign, do: 'show' });
    }
    if (raw.kind === 'business' && raw.who && raw.prop && raw.do) {
      // Done at the end of the sentence before, as a book's page has it;
      // before any, as the first one begins.
      const onto = beats[Math.max(0, moment.after)];
      if (onto)
        (onto.business ??= []).push({
          at: moment.after >= 0 ? onto.say.length : 0,
          who: raw.who,
          does: raw.do as NonNullable<SceneBeat['business']>[number]['does'],
          prop: raw.prop,
          to: raw.do === 'give' && raw.to ? raw.to : null,
        });
    }
    if (stage || effects.length)
      steps.push({
        at: { beat: moment.after, phrase: phraseOf(raw.say) },
        word: 0,
        after: moment.offset,
        stage,
        effects,
      });
  });

  // What the narrator says someone on the stage does, acted as it is said.
  const actors: Actor[] = cast.flatMap((thing) => {
    if (thing.kind !== 'character') return [];
    const c = byId.get(thing.ref);
    return c
      ? [
          {
            id: thing.id,
            names: [c.name, c.name.split(/\s+/)[0]],
            gender: genderOf(c.voice),
          },
        ]
      : [];
  });
  const props = sheet.props.map((p) => p.prop);
  if (actors.length) {
    const { acts, business } = directionsIn(
      beats.map((beat) => (beat.kind === 'line' ? '' : beat.say)),
      actors,
      [],
      new Map(),
      props,
    );
    for (const { beat, ...act } of acts) (beats[beat].acts ??= []).push(act);
    const done = new Set(
      beats.flatMap((b) =>
        (b.business ?? []).map((x) => `${x.who}|${x.does}|${x.prop}`),
      ),
    );
    for (const { beat, ...one } of business) {
      const key = `${one.who}|${one.does}|${one.prop}`;
      if (done.has(key) || !props.includes(one.prop)) continue;
      done.add(key);
      (beats[beat].business ??= []).push(one);
    }
    for (const beat of beats)
      if (beat.business) beat.business.sort((a, b) => a.at - b.at);
  }

  // The camera, on the sheet's spoken beats: a shot at an action is the
  // next line's.
  const spokenFrom = (at: number) => {
    for (let i = at; i < sheet.beats.length; i += 1) {
      const k = spokenAt.get(i);
      if (k !== undefined) return k;
    }
    return Math.max(0, beats.length - 1);
  };
  const camera = sheet.camera
    .filter((shot) => shot.shot === 'wide' || (shot.on && inCast.has(shot.on)))
    .map((shot) => ({
      beat: spokenFrom(shot.beat),
      shot: shot.shot,
      on: shot.on,
      with: shot.with && inCast.has(shot.with) ? shot.with : null,
    }));

  const propsNear = Object.fromEntries(
    sheet.props.flatMap((p) =>
      p.near && inCast.has(p.near) ? [[p.prop, p.near]] : [],
    ),
  );
  return {
    fit: 'good',
    fitReason: null,
    title: sheet.title,
    mood: sheet.mood,
    beats,
    cast,
    steps,
    ...(placeId ? { backdrop: placeId } : {}),
    ...(lead > 0 ? { lead } : {}),
    ...(props.length ? { props } : {}),
    ...(Object.keys(propsNear).length ? { propsNear } : {}),
    ...(camera.some((shot) => shot.shot !== 'wide') ? { camera } : {}),
    setting: {
      time: sheet.time,
      weather: sheet.weather,
      crowd: sheet.crowd,
      world: bible.world,
    },
  };
}

/** Whether a thing on a scene is eaten or drunk: for the writer's menu. */
export const edible = (prop: keyof typeof PROP_KIND) =>
  PROP_KIND[prop] !== 'thing';

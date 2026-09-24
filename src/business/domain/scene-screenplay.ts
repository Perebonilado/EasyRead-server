/**
 * A story's page as a screenplay: the story told by its characters. Their
 * lines are said in their own voices, to one another, with no narrator
 * saying "says Ada"; what they do the stage shows, in a moment of quiet;
 * and the narrator comes in now and then, briefly, for what the stage
 * cannot show: where and when, time passing, a sound off the stage, a
 * thought.
 *
 * The writer writes the screenplay; code stages it. Who is on the stage
 * follows from who is there as the page opens, who comes and goes, and
 * who speaks, so no one vanishes while they are still in the scene. The
 * book's own lines are held to the book: every one kept, word for word,
 * said by whoever says it there. And the narrator is held to a third of
 * a page whose book is mostly talk.
 */
import { dialogueOf, namedIn, quotedSpans } from './scene-dialogue';
import type { Actor } from './scene-directions';
import { FIGURE_SIGNS } from './scene-figure';
import { idKey } from './scene-ids';
import {
  LINE_PACES,
  MAX_ON_STAGE,
  MAX_STATES,
  SCENE_MOODS,
  STORY_MOVES,
  clean,
  fitLayout,
  genderOf,
  isFace,
  mendCast,
  musicOf,
  storyEntry,
  wordsOf,
  type LinePace,
  type MendOptions,
  type MendedScript,
  type SceneBeat,
  type SceneEffect,
  type SceneMood,
  type SceneMusic,
  type SceneScript,
  type SceneScriptDraft,
  type SceneStage,
  type SceneStep,
  type SceneThing,
} from './scene-script';
import { STAGE_RECIPES } from './scene-stage';

export const SCREENPLAY_BEATS = ['line', 'narration', 'action'] as const;
export type ScreenplayBeatKind = (typeof SCREENPLAY_BEATS)[number];

/**
 * What someone does in an action: walks on or off, one of the moves the
 * rig plays, or keeps still while a face or a thing changes.
 */
export const SCREENPLAY_DOINGS = [
  'enter',
  'leave',
  'hug',
  'reach',
  'point',
  'look',
  ...STORY_MOVES,
  'still',
] as const;
export type ScreenplayDoing = (typeof SCREENPLAY_DOINGS)[number];

/** One beat as the writer returns it: flat, every field present, null where its kind does not use it. */
export interface ScreenplayBeatDraft {
  kind: ScreenplayBeatKind;
  /** A line's speaker; an action's doer, or a thing that changes; whom a narration is about. */
  who: string | null;
  /** Whom a line is said to; whom or what an action is toward. */
  to: string | null;
  /** A line's words as the book has them; the narrator's sentence; what an action shows, unspoken. */
  say: string;
  do: ScreenplayDoing | null;
  /** A face or a sign someone shows from here, or a thing's state. */
  state: string | null;
  /** A thing that comes into view here. */
  show: string | null;
  pace: LinePace | null;
  /** An action's seconds of quiet. */
  hold: number | null;
  /** A narration's new place: the scene moves there. */
  place: string | null;
  music: SceneMusic | null;
  energy: 'low' | 'high' | null;
}

/** What a screenplay needs: a story's character or place, someone unnamed, or a drawing of a thing in the story. */
export type ScreenplayCastDraft = Pick<
  SceneScriptDraft['cast'][number],
  | 'id'
  | 'kind'
  | 'name'
  | 'brief'
  | 'motion'
  | 'parts'
  | 'states'
  | 'shape'
  | 'sound'
  | 'ref'
  | 'state'
  | 'figure'
  | 'count'
  | 'pose'
  | 'signs'
  | 'holding'
>;

export interface ScreenplayDraft {
  fit: 'good' | 'poor';
  fitReason: string | null;
  title: string;
  mood: SceneMood;
  /** Who and what is in the scene as the page opens, by id. */
  opening: string[];
  beats: ScreenplayBeatDraft[];
  cast: ScreenplayCastDraft[];
}

/** An action's quiet: at least this, at most what the voice holds after a sentence. */
export const HOLD_LEAST_S = 0.6;
export const HOLD_MOST_S = 3;
/** A narration sentence longer than this goes back. */
export const NARRATION_SENTENCE_WORDS = 16;
/** The narrator's share of the spoken words, on a page whose book is mostly talk; a little more for young children. */
export const NARRATOR_SHARE = 0.35;
const NARRATOR_SHARE_EARLY = 0.45;
/** A book's page with this share of its words in its characters' mouths, or more, is mostly talk. */
export const TALKY = 0.25;
/** The narrator's words on any page, at most. */
export const NARRATION_MOST = 60;
const NARRATION_MOST_EARLY = 80;
/** A book's line is kept when lines on the page hold this share of its words. */
export const KEPT = 0.8;
/** Actions after one sentence asking this long or longer go back to the writer. */
export const CROWDED_S = 5;

/** A word as lines are compared by: lower case, letters and digits. */
const keyOf = (word: string) =>
  word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const keysOf = (text: string) => wordsOf(text).map(keyOf).filter(Boolean);

/** How many of `wanted` a bag of words holds, each of its words used once. */
function covered(wanted: readonly string[], bag: readonly string[]): number {
  const left = new Map<string, number>();
  for (const word of bag) left.set(word, (left.get(word) ?? 0) + 1);
  let found = 0;
  for (const word of wanted) {
    const n = left.get(word) ?? 0;
    if (n > 0) {
      found += 1;
      left.set(word, n - 1);
    }
  }
  return found;
}

const round = (n: number, places = 2) =>
  Math.round(n * 10 ** places) / 10 ** places;

/**
 * A line as its character says it: the words inside any marks the writer
 * put round it, without the narrator's words ("…," said Ada), a line that
 * ran on into them ending as a sentence does.
 */
export function lineOf(say: string): { text: string; attributed: boolean } {
  const spans = quotedSpans(say);
  if (spans.length) {
    const inner = spans
      .map(([a, b]) => say.slice(a, b).trim())
      .join(' ')
      .replace(/[,;:]$/u, '.');
    let outside = say;
    for (const [a, b] of [...spans].reverse())
      outside = outside.slice(0, a) + outside.slice(b);
    return { text: inner, attributed: /\p{L}/u.test(outside) };
  }
  return {
    text: say.replace(/^["“‘']+|["”’']+$/gu, '').trim(),
    attributed: false,
  };
}

/** A line the book's characters say on a page, and who says it where the book says. */
export interface BookLine {
  text: string;
  words: string[];
  speaker: string | null;
}

/** Every line the book's characters say on the page, in order, each with its speaker where the book tells. */
export function bookLines(
  material: string,
  speakers: readonly Actor[],
): BookLine[] {
  const paragraphs = material
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const found = dialogueOf(paragraphs, speakers);
  const out: BookLine[] = [];
  paragraphs.forEach((paragraph, k) => {
    for (const [a, b] of quotedSpans(paragraph)) {
      const text = paragraph.slice(a, b);
      const words = keysOf(text);
      if (!words.length) continue;
      const line = found.find(
        (one) => one.beat === k && one.span[0] === a && one.span[1] === b,
      );
      out.push({ text, words, speaker: line?.speaker ?? null });
    }
  });
  return out;
}

/** The share of a page's words its characters say. */
export function talkIn(material: string): number {
  const all = wordsOf(material).length;
  if (!all) return 0;
  const said = material
    .split(/\n+/)
    .reduce(
      (n, p) =>
        n +
        quotedSpans(p).reduce(
          (m, [a, b]) => m + wordsOf(p.slice(a, b)).length,
          0,
        ),
      0,
    );
  return said / all;
}

/** The other fields a lesson's cast has, none of them a screenplay's. */
const NOT_CODE = {
  value: null,
  style: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  timeline: null,
  chart: null,
} as const;

const PEOPLE: readonly SceneThing['kind'][] = ['character', 'person'];

/** A step's phrase: the first few words of what it lands on. */
const phraseOf = (text: string) => wordsOf(text).slice(0, 4).join(' ');

/**
 * The screenplay made sound, and staged: the cast as a lesson's is mended,
 * nothing on it labelled; each line whole, in its speaker's voice, said by
 * whoever the book says says it; each action a moment in the quiet after
 * the line before it; and the stage and its changes worked out from who
 * is there, who comes and goes, and who speaks. What the writer must redo
 * (a line of the book lost or reworded, a narrator who says too much) is
 * a problem.
 */
export function mendScreenplay(
  draft: ScreenplayDraft,
  options: MendOptions = {},
): MendedScript {
  const recipe = options.stage ? STAGE_RECIPES[options.stage] : null;
  const early = options.stage === 'early';
  const problems: string[] = [];
  const mended: string[] = [];
  const mendedCast = mendCast(
    (draft.cast ?? []).map((thing) => ({ ...NOT_CODE, ...thing })),
    options,
    { formats: new Set(), recipe, mended, problems },
  );
  const { byId, resolve } = mendedCast;
  // Nothing on a story's stage is a label or a card of words.
  const cast = mendedCast.cast.filter((thing) => {
    if (thing.kind !== 'words' && thing.kind !== 'stat') return true;
    mended.push(`${thing.id}: no words on a story's stage; left out`);
    return false;
  });
  for (const thing of cast)
    if (thing.kind === 'drawing')
      thing.parts = thing.parts.map((part) => ({ ...part, label: false }));
  const inCast = new Set(cast.map((thing) => thing.id));

  /** The thing the writer means, of one of these kinds: by its id, or by a name the story calls them. */
  const known = (
    ref: string | null | undefined,
    kinds: readonly SceneThing['kind'][],
  ): string | null => {
    const said = clean(ref);
    if (!said) return null;
    let id = resolve(said);
    if (!id || !inCast.has(id)) {
      const who = storyEntry(options.characters ?? [], said, said);
      id = who
        ? (cast.find((t) => t.kind === 'character' && t.ref === who.id)?.id ??
          null)
        : null;
    }
    const kind = id ? byId.get(id)?.kind : undefined;
    return id && kind && kinds.includes(kind) ? id : null;
  };
  const isPerson = (id: string | null): id is string =>
    Boolean(id && PEOPLE.includes(byId.get(id)?.kind ?? 'words'));

  // The beats: lines and narration spoken, each action a moment in the
  // quiet after the sentence before it, or in the quiet the page opens with.
  const beats: SceneBeat[] = [];
  const spokenAt = new Map<number, number>();
  const moments = new Map<number, { after: number; offset: number }>();
  /** Each run of actions, after the sentence it follows (-1: before the first). */
  const runs = new Map<number, { at: number; hold: number }[]>();
  (draft.beats ?? []).forEach((raw, at) => {
    if (raw.kind === 'action') {
      const hold = Math.min(
        HOLD_MOST_S,
        Math.max(HOLD_LEAST_S, Number(raw.hold) || 1),
      );
      const after = beats.length - 1;
      runs.set(after, [...(runs.get(after) ?? []), { at, hold }]);
      return;
    }
    const kind = raw.kind === 'line' ? 'line' : 'narration';
    const said =
      kind === 'line'
        ? lineOf(clean(raw.say))
        : { text: clean(raw.say), attributed: false };
    if (said.attributed)
      mended.push(`beat ${at + 1}: the line without the words around it`);
    if (!wordsOf(said.text).length) return;
    const next = (draft.beats ?? [])
      .slice(at + 1)
      .find((b) => b.kind !== 'action');
    const beat: SceneBeat = {
      say: said.text,
      pause: 'short',
      delivery: 'explain',
      kind,
      ...musicOf(
        { say: said.text, music: raw.music, energy: raw.energy },
        next ? { say: next.say } : undefined,
        true,
      ),
    };
    if (kind === 'line') {
      const speaker = known(raw.who, PEOPLE);
      if (speaker) beat.speaker = speaker;
      const to = known(raw.to, PEOPLE);
      if (to && to !== speaker) beat.to = to;
      if (raw.pace && LINE_PACES.includes(raw.pace)) beat.pace = raw.pace;
    }
    spokenAt.set(at, beats.length);
    beats.push(beat);
  });
  // Each run of actions in the quiet after its sentence, one after another;
  // a run longer than the voice holds, quickened to fit.
  let lead = 0;
  const crowded: string[] = [];
  for (const [after, run] of runs) {
    const asked = run.reduce((n, one) => n + one.hold, 0);
    const fit = asked > HOLD_MOST_S ? HOLD_MOST_S / asked : 1;
    let offset = 0;
    for (const one of run) {
      moments.set(one.at, { after, offset: round(offset) });
      offset += one.hold * fit;
    }
    const total = round(Math.min(HOLD_MOST_S, asked), 1);
    if (after >= 0) beats[after].holdS = total;
    else lead = total;
    if (asked > HOLD_MOST_S + 0.01)
      mended.push(
        `${round(asked, 1)}s of actions after ${after >= 0 ? `sentence ${after + 1}` : 'the start'}; quickened to ${HOLD_MOST_S}s`,
      );
    if (asked > CROWDED_S)
      crowded.push(
        after >= 0 ? `"${phraseOf(beats[after].say)}…"` : 'the start',
      );
  }
  if (crowded.length && draft.fit !== 'poor')
    problems.push(
      `Too much happens without a word after ${crowded.join(', ')}: the quiet after one line or narration holds ${HOLD_MOST_S} seconds of action at most. Put a short narration or a line between the actions, or show fewer of them.`,
    );

  // Who says each line, as the book tells it: the book wins.
  const speaking: Actor[] = cast.flatMap((thing) => {
    if (thing.kind !== 'character') return [];
    const who = (options.characters ?? []).find((c) => c.id === thing.ref);
    return who
      ? [
          {
            id: thing.id,
            names: [who.name, ...who.aliases, thing.name],
            gender: genderOf(who.voice),
          },
        ]
      : [];
  });
  const book = options.material ? bookLines(options.material, speaking) : [];
  /** Who of the cast a stretch of text names, people only. */
  const peopleIn = (text: string): string[] => [
    ...new Set(
      namedIn(text, [
        ...speaking,
        ...cast.flatMap((thing) =>
          thing.kind === 'person'
            ? [{ id: thing.id, names: [thing.name] }]
            : [],
        ),
      ]).map((one) => one.id),
    ),
  ];
  beats.forEach((beat, k) => {
    if (beat.kind !== 'line') return;
    const words = keysOf(beat.say);
    let best: BookLine | null = null;
    let share = 0;
    for (const line of book) {
      const found = covered(words, line.words) / Math.max(1, words.length);
      if (found > share) [best, share] = [line, found];
    }
    if (best?.speaker && share >= 0.6 && best.speaker !== beat.speaker) {
      mended.push(
        `line ${k + 1}: said by ${best.speaker} in the book${beat.speaker ? `, not ${beat.speaker}` : ''}`,
      );
      beat.speaker = best.speaker;
      if (beat.to === best.speaker) delete beat.to;
    }
    if (!beat.speaker) {
      // No one to say it: the narrator does, as a quotation.
      mended.push(
        `line ${k + 1}: no one in the cast says it; the narrator does`,
      );
      beat.kind = 'narration';
      beat.say = `"${beat.say}"`;
      delete beat.to;
      delete beat.pace;
      return;
    }
    beat.lines = [{ span: [0, beat.say.length], speaker: beat.speaker }];
  });

  if (draft.fit !== 'poor') {
    // Every line of the book kept, in some line or lines on the page.
    const said = beats.flatMap((b) =>
      b.kind === 'line' ? [keysOf(b.say)] : [],
    );
    const lost = book.filter((line) => {
      let best = 0;
      for (let i = 0; i < said.length; i += 1) {
        let bag: string[] = [];
        for (let j = i; j < Math.min(said.length, i + 4); j += 1) {
          bag = [...bag, ...said[j]];
          best = Math.max(best, covered(line.words, bag) / line.words.length);
        }
      }
      return best < KEPT;
    });
    if (lost.length)
      problems.push(
        `These lines of the book are missing or reworded: ${lost
          .slice(0, 5)
          .map(
            (line) =>
              `"${line.text}"${line.speaker ? ` (${line.speaker})` : ''}`,
          )
          .join(
            '; ',
          )}. Keep every line the book's characters say on this page, in order and word for word, each a line said by whoever says it; a long speech may be split into lines, never reworded.`,
      );
    // The narrator in the background.
    const count = (kind: 'line' | 'narration') =>
      beats
        .filter((b) => b.kind === kind)
        .reduce((n, b) => n + wordsOf(b.say).length, 0);
    const narrated = count('narration');
    const spoken = narrated + count('line');
    const talky = options.material
      ? talkIn(options.material) >= TALKY
      : count('line') > 0;
    const share = early ? NARRATOR_SHARE_EARLY : NARRATOR_SHARE;
    const most = early ? NARRATION_MOST_EARLY : NARRATION_MOST;
    if (talky && narrated > share * spoken)
      problems.push(
        `The narrator says ${narrated} of the ${spoken} spoken words. Let the characters carry the scene: the narrator comes in only where the place or the time changes, or for what the stage cannot show (a sound off the stage, a thought), in a short sentence; what anyone does is an action, shown and not said.`,
      );
    else if (narrated > most)
      problems.push(
        `The narrator says ${narrated} words; keep it to about ${Math.round(most * 0.7)}. What the stage can show is an action, shown and not said.`,
      );
    const long = beats
      .filter((b) => b.kind === 'narration' && !b.say.startsWith('"'))
      .flatMap((b) => b.say.split(/(?<=[.!?…])\s+/u))
      .filter((s) => wordsOf(s).length > NARRATION_SENTENCE_WORDS);
    if (long.length)
      problems.push(
        `Narration runs long: "${long[0]}". Keep each narration sentence to ${NARRATION_SENTENCE_WORDS} words or fewer.`,
      );
    if (beats.length < 2)
      problems.push('A screenplay needs at least two lines or narrations.');
  }

  // The stage: who is there as the page opens, as the writer says, and
  // whoever speaks or does something before they are said to come.
  const present: string[] = [];
  const shown: string[] = [];
  const gone = new Set<string>();
  const put = (id: string) => {
    const list = isPerson(id) ? present : shown;
    if (!list.includes(id)) list.push(id);
  };
  for (const ref of draft.opening ?? []) {
    const id = known(ref, [...PEOPLE, 'drawing']);
    if (id) put(id);
  }
  // Someone who leaves before they are said to come was there; and when
  // the writer did not say who is there, so is anyone who speaks or does
  // something before they are said to come. Otherwise, whoever speaks
  // without being there is cut in as they speak.
  const listed = (draft.opening ?? []).length > 0;
  const moved = new Set<string>();
  (draft.beats ?? []).forEach((raw, at) => {
    const beat = spokenAt.has(at) ? beats[spokenAt.get(at)!] : null;
    const id =
      beat?.kind === 'line' ? (beat.speaker ?? null) : known(raw.who, PEOPLE);
    if (!id || moved.has(id)) return;
    if (raw.kind === 'action' && (raw.do === 'enter' || raw.do === 'leave')) {
      moved.add(id);
      if (raw.do === 'leave') put(id);
      return;
    }
    if (!listed) put(id);
  });
  const stageNow = (extra: Partial<SceneStage> = {}): SceneStage => {
    const show = [...present, ...shown].slice(0, MAX_ON_STAGE);
    return {
      layout: show.length
        ? fitLayout(show.length > 1 ? 'row' : 'one', show.length)
        : 'one',
      show,
      arrows: [],
      ...extra,
    };
  };

  /** A face or a sign someone shows, or a thing's state: shown from now. */
  const stateOf = (
    who: string | null,
    state: string | null,
    look: string,
  ): SceneEffect[] => {
    const name = clean(state);
    const thing = who ? byId.get(who) : undefined;
    if (!who || !name || !thing) return [];
    if (thing.kind === 'character' || thing.kind === 'person') {
      if (isFace(name) || (FIGURE_SIGNS as readonly string[]).includes(name))
        return [{ target: who, part: name, do: 'show' }];
      mended.push(`${who}: no face or sign "${name}"`);
      return [];
    }
    if (thing.kind !== 'drawing') return [];
    let found = thing.states.find((s) => idKey(s.name) === idKey(name));
    if (!found && thing.states.length < MAX_STATES) {
      found = { name, look: clean(look) || name };
      thing.states.push(found);
      mended.push(`${who}: a state "${name}" for the artist to draw`);
    }
    return found ? [{ target: who, part: found.name, do: 'show' }] : [];
  };
  /** A move someone makes: toward whom or what, or up at the sky. */
  const moveOf = (
    who: string | null,
    raw: ScreenplayBeatDraft,
  ): SceneEffect[] => {
    const doing = raw.do;
    if (
      !isPerson(who) ||
      !doing ||
      !(SCREENPLAY_DOINGS as readonly string[]).includes(doing)
    )
      return [];
    if (doing === 'enter' || doing === 'leave' || doing === 'still') return [];
    const toward = known(raw.to, [...PEOPLE, 'drawing']);
    const sky = /\b(?:up|sky|stars?|moon|heavens?)\b/iu.test(raw.say)
      ? '@up'
      : /\b(?:down|ground|floor)\b/iu.test(raw.say)
        ? '@down'
        : null;
    const part =
      toward && toward !== who
        ? toward
        : doing === 'look' || doing === 'point'
          ? sky
          : null;
    if ((doing === 'hug' || doing === 'reach') && !toward) return [];
    if (doing === 'look' && !part) return [];
    return [{ target: who, part, do: doing }];
  };

  const steps: SceneStep[] = [];
  const opensQuiet = [...moments.values()].some((m) => m.after < 0);
  steps.push({
    at: { beat: opensQuiet ? -1 : 0, phrase: '' },
    word: 0,
    ...(opensQuiet ? { after: 0 } : {}),
    stage: stageNow(),
    effects: [],
  });
  (draft.beats ?? []).forEach((raw, at) => {
    const k = spokenAt.get(at);
    if (k !== undefined) {
      // As a line or a narration begins.
      const beat = beats[k];
      const effects: SceneEffect[] = [];
      let stage: SceneStage | null = null;
      const place = known(raw.place, ['place']);
      const prop = known(raw.show, ['drawing']);
      if (prop && !shown.includes(prop)) shown.push(prop);
      // Whoever speaks is on the stage: unless the words sent them off it.
      const speaker = beat.kind === 'line' ? (beat.speaker ?? null) : null;
      const cutIn =
        speaker && !present.includes(speaker) && !gone.has(speaker)
          ? [speaker]
          : [];
      for (const id of cutIn) present.push(id);
      if (place || prop || cutIn.length)
        stage = stageNow({
          ...(place ? { backdrop: place } : {}),
          ...(cutIn.length ? { cutIn } : {}),
        });
      const who = speaker ?? known(raw.who, [...PEOPLE, 'drawing']);
      effects.push(...stateOf(who, raw.state, raw.say), ...moveOf(who, raw));
      if (stage || effects.length)
        steps.push({
          at: { beat: k, phrase: phraseOf(beat.say) },
          word: 0,
          stage,
          effects,
        });
      return;
    }
    const moment = moments.get(at);
    if (!moment) return;
    // A moment of quiet: someone comes or goes, moves, or something changes.
    const who = known(raw.who, [...PEOPLE, 'drawing']);
    const effects: SceneEffect[] = [];
    let stage: SceneStage | null = null;
    if (raw.do === 'enter' && isPerson(who) && !present.includes(who)) {
      // With whoever they bring: "leading a brown goat on a rope".
      const coming = [
        who,
        ...peopleIn(raw.say).filter(
          (id) => id !== who && !present.includes(id),
        ),
      ];
      for (const id of coming) {
        present.push(id);
        gone.delete(id);
      }
      stage = stageNow({ arrive: coming });
    } else if (raw.do === 'leave' && isPerson(who) && present.includes(who)) {
      present.splice(present.indexOf(who), 1);
      gone.add(who);
      stage = stageNow({ leave: [who] });
    }
    const prop = known(raw.show, ['drawing']);
    if (prop && !shown.includes(prop)) {
      shown.push(prop);
      stage = stageNow(stage?.arrive ? { arrive: stage.arrive } : {});
    }
    // Hugged or reached for, someone is there: in view, if they were not.
    const toward = known(raw.to, PEOPLE);
    if (
      toward &&
      (raw.do === 'hug' || raw.do === 'reach') &&
      !present.includes(toward) &&
      !gone.has(toward)
    ) {
      present.push(toward);
      stage = stageNow({
        ...(stage?.arrive ? { arrive: stage.arrive } : {}),
        cutIn: [toward],
      });
    }
    effects.push(...moveOf(who, raw), ...stateOf(who, raw.state, raw.say));
    if (stage || effects.length)
      steps.push({
        at: { beat: moment.after, phrase: phraseOf(clean(raw.say)) },
        word: 0,
        after: moment.offset,
        stage,
        effects,
      });
  });

  const script: SceneScript = {
    fit: draft.fit === 'poor' ? 'poor' : 'good',
    fitReason: draft.fit === 'poor' ? clean(draft.fitReason) || null : null,
    title: clean(draft.title) || 'A page of the story',
    mood: SCENE_MOODS.includes(draft.mood) ? draft.mood : 'calm',
    beats,
    cast,
    steps,
    ...(lead > 0 ? { lead } : {}),
  };
  return { script, problems, mended };
}

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
import {
  dialogueOf,
  heardFrom,
  namedIn,
  quoteContext,
  quotedSpans,
  subjectsIn,
  type HeardFrom,
  type LineEvidence,
} from './scene-dialogue';
import type { Actor } from './scene-directions';
import { FIGURE_SIGNS, figureFor } from './scene-figure';
import { idKey } from './scene-ids';
import {
  LINE_FROMS,
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
  type LineFrom,
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
import { standsOnStage } from './scene-story';

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
  /** Where a line comes from: the stage, off it, above, a phone, a letter, a thought, a dream. */
  from: LineFrom | null;
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
  /**
   * A narration's new place: the scene moves there. A line's: where its
   * speaker is, when the page cuts between two places (Sally in the cave,
   * the boys above it).
   */
  place: string | null;
  /** A narration that opens a scene: who is there in it, by id. */
  with?: string[] | null;
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
/** The most people a story's stage shows at once: more are a crowd, and cut each other in half. */
const STORY_ON_STAGE = 3;

/** A narration that moves the story on in time: a new scene, where it is. */
const TIME_PASSES =
  /^\s*(?:that\s+(?:evening|night|morning|afternoon)|the\s+next\s+(?:day|morning|evening|night)|next\s+(?:day|morning)|later\b|afterwards?\b|meanwhile\b|some\s+(?:days|weeks|months|time)\s+later|(?:a\s+few|several|many)\s+(?:days|weeks|months|hours)\s+(?:later|went\s+by|passed)|when\s+(?:it\s+was\s+)?(?:evening|night|morning)|in\s+the\s+(?:evening|morning)|one\s+(?:day|evening|morning|night)\b)/iu;

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

/** Words in a name that say a man or a woman: "the man with leprosy", "Mark's mother". */
export function genderIn(name: string): 'f' | 'm' | null {
  const words = name.toLowerCase().split(/[^a-z]+/);
  const has = (list: readonly string[]) => words.some((w) => list.includes(w));
  if (
    has([
      'woman',
      'women',
      'mother',
      'mum',
      'mom',
      'girl',
      'daughter',
      'sister',
      'wife',
      'queen',
      'lady',
      'aunt',
      'grandmother',
      'granny',
      'widow',
      'princess',
    ])
  )
    return 'f';
  if (
    has([
      'man',
      'men',
      'father',
      'dad',
      'boy',
      'son',
      'brother',
      'husband',
      'king',
      'lord',
      'uncle',
      'grandfather',
      'prince',
      'leader',
      'ruler',
      'centurion',
      'soldier',
      'captain',
    ])
  )
    return 'm';
  return null;
}

/** A question to the viewer: the stage's check, never a character's line. */
const TO_VIEWER =
  /^\s*(?:think\b|imagine\b|can you (?:spot|see|find|count|guess|remember|work out|tell|name)\b|what would you do\b|what do you think\b|how many\b[^?]*\bcan you\b)/iu;
/** Someone's words reported, not said: "He yelled, asking what was going on." */
const REPORTED =
  /^\s*(?:he|she|they)\s+(?:said|asked|yelled|shouted|told|replied|answered|explained|called|cried|whispered|screamed|sobbed)\b/iu;

/**
 * Why a line is the narrator's, whoever the writer gave it to: a question
 * to the viewer, the speaker telling of themselves by name as another
 * would ("…if Jesus had not gone…", said by Jesus), or words reported
 * rather than said. Null for a line a character may say.
 */
export function narratorsLine(
  say: string,
  speakerNames: readonly string[],
): string | null {
  if (TO_VIEWER.test(say)) return 'a question to the viewer';
  if (REPORTED.test(say)) return 'words reported, not said';
  for (const name of speakerNames) {
    const clean = name.trim();
    if (!clean) continue;
    const self = new RegExp(
      `\\b${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:had|has|is|was|does|did|will|would|could|can|went|goes|came|comes|said|says|thinks|thought|looks|looked)\\b`,
      'iu',
    );
    if (self.test(say)) return 'the speaker told of by name';
  }
  return null;
}

/** A line the book's characters say on a page, who says it where the book says, and where it comes from. */
export interface BookLine {
  text: string;
  words: string[];
  speaker: string | null;
  /** How the speaker was found; strong only when the line's own sentence names them. */
  by: LineEvidence | null;
  from: HeardFrom | null;
}

/**
 * Evidence that names the speaker beside the line, strong enough to
 * overrule the writer: in its own sentence ("Ada asks, …", "…," said
 * Kofi), or acting in the sentence just before it ("Kofi groaned. …").
 */
const STRONG: readonly LineEvidence[] = ['voice', 'lead', 'verb', 'before'];

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
    const spans = quotedSpans(paragraph);
    spans.forEach(([a, b], i) => {
      const text = paragraph.slice(a, b);
      const words = keysOf(text);
      if (!words.length) return;
      const line = found.find(
        (one) => one.beat === k && one.span[0] === a && one.span[1] === b,
      );
      const { clause, after, quote } = quoteContext(paragraph, spans, i);
      out.push({
        text,
        words,
        speaker: line?.speaker ?? null,
        by: line?.by ?? null,
        from: heardFrom(clause, after, quote),
      });
    });
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

  /** One of the story's places in the cast: the writer's own for it, or brought in. */
  const castPlace = (ref: string | null | undefined): string | null => {
    if (!ref) return null;
    const there = cast.find((t) => t.kind === 'place' && t.ref === ref);
    if (there) return there.id;
    const story = (options.places ?? []).find((p) => p.id === ref);
    if (!story) return null;
    let id = ref;
    for (let n = 2; inCast.has(id); n += 1) id = `${ref}-${n}`;
    const thing: SceneThing = {
      id,
      kind: 'place',
      ref,
      name: story.name,
      sound: story.sound ?? null,
    };
    cast.push(thing);
    byId.set(id, thing);
    inCast.add(id);
    mended.push(`${id}: one of the story's places; brought into the cast`);
    return id;
  };
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
    if (!id && kinds.includes('place')) {
      // One of the story's places, which the writer named and left out
      // of its cast: "place": "peter-s-house".
      const key = idKey(said);
      const place = (options.places ?? []).find(
        (p) =>
          p.id === said ||
          idKey(p.id) === key ||
          [p.name, ...p.aliases].some((name) => idKey(name) === key),
      );
      if (place) id = castPlace(place.id);
    }
    const kind = id ? byId.get(id)?.kind : undefined;
    return id && kind && kinds.includes(kind) ? id : null;
  };
  const isPerson = (id: string | null): id is string =>
    Boolean(id && PEOPLE.includes(byId.get(id)?.kind ?? 'words'));

  // The beats: lines and narration spoken, each action a moment in the
  // quiet after the sentence before it, or in the quiet the page opens with.
  const beats: SceneBeat[] = [];
  /** Where the writer says each line comes from, by beat. */
  const fromAsked = new Map<number, LineFrom>();
  /** Whom the writer says says each line, by beat, as written. */
  const whoAsked = new Map<number, string>();
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
      if (raw.who) whoAsked.set(beats.length, raw.who);
      const to = known(raw.to, PEOPLE);
      if (to && to !== speaker) beat.to = to;
      if (raw.pace && LINE_PACES.includes(raw.pace)) beat.pace = raw.pace;
      if (raw.from && LINE_FROMS.includes(raw.from))
        fromAsked.set(beats.length, raw.from);
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

  // Who says each line, as the book tells it: the book wins. The story's
  // characters the writer left out of the cast may say one too, and are
  // brought in when they do: God's voice at a baptism is God's.
  const storyOf = (id: string | null | undefined) => {
    const thing = id ? byId.get(id) : undefined;
    return thing?.kind === 'character'
      ? (options.characters ?? []).find((c) => c.id === thing.ref)
      : undefined;
  };
  const namesOf = (who: NonNullable<MendOptions['characters']>[number]) => {
    const names = [who.name, ...who.aliases];
    // A group or a voice is called by a common noun: "the crowd shouted".
    return who.kind === 'group' || (who.presence ?? 'seen') !== 'seen'
      ? [...names, ...names.map((name) => name.toLowerCase())]
      : names;
  };
  const speaking: Actor[] = cast.flatMap((thing) => {
    if (thing.kind !== 'character') return [];
    const who = (options.characters ?? []).find((c) => c.id === thing.ref);
    return who
      ? [
          {
            id: thing.id,
            names: [...namesOf(who), thing.name],
            gender: genderOf(who.voice),
            presence: who.presence ?? 'seen',
            group: who.kind === 'group',
          },
        ]
      : [];
  });
  // Someone the story does not name, whom the writer put on the page (the
  // man with leprosy): found as "the man with leprosy", in any case.
  for (const thing of cast)
    if (thing.kind === 'person' && thing.name)
      speaking.push({
        id: thing.id,
        names: [thing.name, thing.name.toLowerCase()],
        gender: genderIn(thing.name),
        presence: 'seen',
        group: (thing.count ?? 1) > 1,
      });
  const OUT_OF_CAST = '@';
  for (const who of options.characters ?? [])
    if (!cast.some((t) => t.kind === 'character' && t.ref === who.id))
      speaking.push({
        id: `${OUT_OF_CAST}${who.id}`,
        names: namesOf(who),
        gender: genderOf(who.voice),
        presence: who.presence ?? 'seen',
        group: who.kind === 'group',
      });
  /** A story's character the book gives a line, in the cast: added when the writer left them out. */
  const inCastAs = (speaker: string): string | null => {
    if (!speaker.startsWith(OUT_OF_CAST)) return speaker;
    const ref = speaker.slice(OUT_OF_CAST.length);
    const who = (options.characters ?? []).find((c) => c.id === ref);
    if (!who) return null;
    const there = cast.find((t) => t.kind === 'character' && t.ref === ref);
    if (there) return there.id;
    let id = ref;
    for (let n = 2; inCast.has(id); n += 1) id = `${ref}-${n}`;
    const thing: SceneThing = {
      id,
      kind: 'character',
      ref,
      name: who.name,
      state: null,
      met: 0,
      intro: [],
    };
    cast.push(thing);
    byId.set(id, thing);
    inCast.add(id);
    mended.push(`${id}: says a line of the book; brought into the cast`);
    return id;
  };
  /** Whether someone in the cast can stand on the stage: a voice never does. */
  const stands = (id: string | null | undefined): id is string =>
    isPerson(id ?? null) && standsOnStage(storyOf(id) ?? {});
  /**
   * Where a line comes from: where the book's words say, else where the
   * writer says, held to who says it. A voice from above is always from
   * above; one only heard is never on the stage; someone the tradition
   * never draws stands there as a light.
   */
  const fromFor = (
    speaker: string | undefined,
    said: HeardFrom | null,
    asked: LineFrom | undefined,
  ): LineFrom => {
    const who = storyOf(speaker);
    const presence = who?.presence ?? 'seen';
    // Scripture read out is the narrator's, and never reaches here.
    const from: LineFrom =
      (said === 'written' ? null : said) ?? asked ?? 'here';
    if (presence === 'above')
      return from === 'phone' || from === 'letter' || from === 'dream'
        ? from
        : 'above';
    // A group speaks from the crowd behind the stage when there is one.
    if (who?.kind === 'group' && options.crowd && presence !== 'heard')
      return from === 'phone' || from === 'letter' || from === 'dream'
        ? from
        : 'here';
    if (presence === 'heard' || who?.kind === 'group')
      return from === 'here' || from === 'thought' || from === 'above'
        ? 'off'
        : from;
    if (presence === 'light') return 'here';
    return from === 'above' ? 'here' : from;
  };
  const book = options.material ? bookLines(options.material, speaking) : [];
  /** Who of the cast a stretch of text names, people only. */
  const people = () => [
    ...speaking.filter((one) => !one.id.startsWith(OUT_OF_CAST)),
    ...cast.flatMap((thing) =>
      thing.kind === 'person' ? [{ id: thing.id, names: [thing.name] }] : [],
    ),
  ];
  const peopleIn = (text: string): string[] => [
    ...new Set(namedIn(text, people()).map((one) => one.id)),
  ];
  /** Whom a narration is about, as the one who acts: "Jesus sees the crowd". */
  const actorIn = (text: string): string | null =>
    subjectsIn(text, people())[0]?.id ?? null;
  beats.forEach((beat, k) => {
    if (beat.kind !== 'line') return;
    const words = keysOf(beat.say);
    let best: BookLine | null = null;
    let share = 0;
    for (const line of book) {
      const found = covered(words, line.words) / Math.max(1, words.length);
      if (found > share) [best, share] = [line, found];
    }
    const matched = best && share >= 0.6 ? best : null;
    // Scripture the book quotes ("what was spoken by Isaiah the prophet
    // was fulfilled: …"): read out by the narrator, as a quotation, and
    // said by no one on the stage.
    if (matched?.from === 'written') {
      mended.push(
        `line ${k + 1}: scripture the book quotes; the narrator reads it`,
      );
      beat.kind = 'narration';
      beat.say = `"${beat.say}"`;
      delete beat.speaker;
      delete beat.to;
      delete beat.pace;
      return;
    }
    // Words no character says: the narrator's, whoever the writer gave
    // them to (a question to the viewer; someone telling of themselves as
    // another would; someone's words reported).
    const theirs = beat.speaker ? byId.get(beat.speaker) : undefined;
    const names =
      theirs?.kind === 'character'
        ? [theirs.name, ...(storyOf(beat.speaker)?.aliases ?? [])]
        : theirs?.kind === 'person'
          ? [theirs.name]
          : [];
    const narrators = narratorsLine(beat.say, names);
    if (!matched && narrators) {
      mended.push(`line ${k + 1}: ${narrators}; the narrator says it`);
      beat.kind = 'narration';
      delete beat.speaker;
      delete beat.to;
      delete beat.pace;
      return;
    }
    // The book overrules the writer only where the line's own sentence
    // names who says it; a pronoun or a name nearby is no match for a
    // writer who read the page whole.
    const said =
      matched?.speaker &&
      (!beat.speaker || (matched.by && STRONG.includes(matched.by)))
        ? inCastAs(matched.speaker)
        : null;
    if (said && said !== beat.speaker) {
      mended.push(
        `line ${k + 1}: said by ${said} in the book${beat.speaker ? `, not ${beat.speaker}` : ''}`,
      );
      beat.speaker = said;
      if (beat.to === said) delete beat.to;
    }
    // A voice from heaven, or out of sight, the book gives no one in the
    // story: never someone on the stage. With no voice from above in the
    // story, the narrator says it, from above.
    if (
      !said &&
      (matched?.from === 'above' || matched?.from === 'off') &&
      stands(beat.speaker)
    ) {
      mended.push(
        `line ${k + 1}: a voice ${matched.from === 'above' ? 'from above' : 'out of sight'} in the book, not ${beat.speaker}`,
      );
      delete beat.speaker;
      if (matched.from === 'above') {
        beat.kind = 'narration';
        beat.from = 'above';
        delete beat.to;
        delete beat.pace;
        return;
      }
    }
    // Whom the writer named, now the cast may have grown to take them in:
    // one of the story's characters the writer left out of it.
    if (!beat.speaker && whoAsked.has(k)) {
      const asked = whoAsked.get(k)!;
      const again =
        known(asked, PEOPLE) ??
        (() => {
          const who = storyEntry(options.characters ?? [], asked, asked);
          return who ? inCastAs(`${OUT_OF_CAST}${who.id}`) : null;
        })();
      if (again) beat.speaker = again;
    }
    if (!beat.speaker && whoAsked.has(k)) {
      // Someone the writer names and no one in the story is: brought on,
      // drawn by the kit, rather than their line given to the narrator.
      const asked = clean(whoAsked.get(k));
      if (asked && wordsOf(asked).length <= 5) {
        let id = idKey(asked) || 'someone';
        for (let n = 2; inCast.has(id); n += 1) id = `${idKey(asked)}-${n}`;
        const person: SceneThing = {
          id,
          kind: 'person',
          name: asked,
          figure: figureFor(
            id,
            genderIn(asked) === 'f' ? { hair: 'long' } : {},
          ),
          state: null,
        };
        cast.push(person);
        byId.set(id, person);
        inCast.add(id);
        mended.push(`${id}: says a line and is no one in the cast; brought on`);
        beat.speaker = id;
      }
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
    const from = fromFor(beat.speaker, matched?.from ?? null, fromAsked.get(k));
    if (from !== 'here') beat.from = from;
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
    // A line the book's characters never say: the narrator's words, or
    // the writer's own, put in someone's mouth.
    const invented = beats.filter((b) => {
      if (b.kind !== 'line' || !book.length) return false;
      const words = keysOf(b.say);
      return (
        words.length >= 3 &&
        Math.max(
          0,
          ...book.map((line) => covered(words, line.words) / words.length),
        ) < 0.5
      );
    });
    if (invented.length)
      problems.push(
        `These lines are not in the book: ${invented
          .slice(0, 3)
          .map((b) => `"${b.say}"`)
          .join(
            '; ',
          )}. A character says only the book's own quoted words; what the book tells, the narrator says, or the stage shows as an action.`,
      );
    if (lost.length)
      problems.push(
        `These lines of the book are missing or reworded: ${lost
          .slice(0, 5)
          .map((line) => {
            const who = line.speaker?.startsWith(OUT_OF_CAST)
              ? `${line.speaker.slice(OUT_OF_CAST.length)}, not in your cast yet`
              : line.speaker;
            return `"${line.text}"${who ? ` (${who})` : ''}`;
          })
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

  // Where the story has the page's people, when some are apart from the
  // rest: Sally in the cave, the boys beside it. Each place in the cast,
  // added where the writer left it out, so the stage can cut to it.
  const whereabouts = options.whereabouts ?? null;
  /** Where the page happens, and every place someone on it is. */
  const pageHere = whereabouts ? castPlace(whereabouts.place) : null;
  const pagePlaces = new Set(
    whereabouts
      ? [pageHere, ...Object.values(whereabouts.people).map(castPlace)]
      : [],
  );
  /** Where someone went on the page, by the writer's words: past where the story has them. */
  const movedTo = new Map<string, string>();
  /** Where someone is now: where they went, else where the story has them. */
  const whereOf = (id: string): string | null => {
    if (!whereabouts) return null;
    const moved = movedTo.get(id);
    if (moved) return moved;
    const thing = byId.get(id);
    return thing?.kind === 'character'
      ? castPlace(whereabouts.people[thing.ref])
      : null;
  };
  /** Where a scene is, as the story knows it: a place of the writer's own is where the page happens. */
  const sceneAt = (place: string | null): string | null =>
    place && pagePlaces.has(place) ? place : (pageHere ?? place);

  // The page's scenes. A page may hold several: a new one where a
  // narration moves the story, to a place (the writer's, or one of the
  // story's places its words name) or on in time ("That evening"), or
  // says who is there. Each scene shows only its own people, in its own
  // place: those who speak or act in it, are spoken to, or are named in
  // its narration. Someone who comes on with "enter" arrives, and is not
  // there before.
  const placesById = new Map(
    cast
      .filter((thing) => thing.kind === 'place')
      .map((thing) => {
        const story = (options.places ?? []).find(
          (place) => thing.kind === 'place' && place.id === thing.ref,
        );
        return [thing.id, [thing.name, ...(story?.aliases ?? [])]] as const;
      }),
  );
  const flat = (text: string) =>
    ` ${text
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^\p{L}\p{N}']+/gu, ' ')} `;
  /** One of the page's places its words name: the cast's, else one of the story's, brought in. */
  const placeNamed = (text: string): string | null => {
    const said = flat(text);
    const names = (all: readonly string[]) =>
      all.some((name) => {
        const key = flat(name).trim();
        return key.length > 2 && said.includes(` ${key} `);
      });
    for (const [id, all] of placesById) if (names(all)) return id;
    // "Jesus goes to Peter's house", which the writer left out of its cast.
    for (const place of options.places ?? [])
      if (names([place.name, ...place.aliases])) return castPlace(place.id);
    return null;
  };
  interface Scene {
    /** The draft's beat it opens on. */
    start: number;
    place: string | null;
    /** Who is there as it opens, in order. */
    people: string[];
    /** Whom the writer said is there. */
    given: boolean;
  }
  const scenes: Scene[] = [];
  {
    let current: Scene = { start: 0, place: null, people: [], given: false };
    let begun = false;
    (draft.beats ?? []).forEach((raw, at) => {
      if (raw.kind !== 'narration') {
        begun = true;
        return;
      }
      const place = known(raw.place, ['place']) ?? placeNamed(raw.say);
      const given = (raw.with ?? [])
        .map((ref) => known(ref, PEOPLE))
        .filter((id): id is string => stands(id));
      const moves =
        (place !== null && current.place !== null && place !== current.place) ||
        given.length > 0 ||
        TIME_PASSES.test(raw.say);
      if (moves && begun) {
        scenes.push(current);
        current = {
          start: at,
          place: place ?? current.place,
          people: [],
          given: false,
        };
        begun = false;
      } else if (place) current.place = place;
      if (given.length) {
        current.people = [...new Set(given)];
        current.given = true;
      }
    });
    scenes.push(current);
  }
  const sceneOf = (at: number) =>
    scenes.reduce((found, scene, i) => (scene.start <= at ? i : found), 0);
  // Who each scene opens with, where the writer did not say: the first
  // scene, those who speak or act in it before they are said to come; a
  // later one, those its opening narration names. Anyone else in it comes
  // into view as they speak, or walks on with "enter".
  /** Who has a part in each scene, in order. */
  const parts: string[][] = [];
  scenes.forEach((scene, i) => {
    const end = scenes[i + 1]?.start ?? (draft.beats ?? []).length;
    const seen: string[] = [];
    const arriving = new Set<string>();
    const meet = (id: string | null | undefined, arrives = false) => {
      if (!stands(id) || seen.includes(id) || arriving.has(id)) return;
      if (arrives) arriving.add(id);
      else seen.push(id);
    };
    for (let at = scene.start; at < end; at += 1) {
      const raw = (draft.beats ?? [])[at];
      const beat = spokenAt.has(at) ? beats[spokenAt.get(at)!] : null;
      if (raw.kind === 'action') {
        const who = known(raw.who, PEOPLE);
        meet(who, raw.do === 'enter');
        if (raw.do !== 'enter' && raw.do !== 'leave')
          meet(known(raw.to, PEOPLE));
      } else if (beat?.kind === 'line') {
        // Heard from off the stage, down a phone or in a letter: not here.
        if (beat.from === undefined || beat.from === 'thought')
          meet(beat.speaker);
        meet(beat.to);
      } else if (beat) for (const id of peopleIn(beat.say)) meet(id);
    }
    parts.push([...seen, ...arriving]);
    if (scene.given) return;
    if (i === 0) {
      scene.people = seen;
      return;
    }
    const opener = (draft.beats ?? [])[scene.start];
    const beat = spokenAt.has(scene.start)
      ? beats[spokenAt.get(scene.start)!]
      : null;
    scene.people =
      opener?.kind === 'narration' && beat
        ? peopleIn(beat.say).filter((id) => stands(id) && !arriving.has(id))
        : [];
  });
  // The first scene opens with whom the writer listed who is in it, and
  // anyone else in it who is there before they come; never someone the
  // writer listed who has no part in it until later.
  const opening = (draft.opening ?? [])
    .map((ref) => known(ref, [...PEOPLE, 'drawing']))
    .filter((id): id is string => Boolean(id));
  const present: string[] = [];
  const shown: string[] = [];
  const gone = new Set<string>();
  /** Who is in another place of the scene, apart from the rest, by the place. */
  const apart = new Map<string, string>();
  /**
   * Whether someone is apart from a scene, where the story has them (the
   * boys beside the tree while the scene is in the cave): kept in view
   * there, never brought into the scene's place.
   */
  const settle = (id: string | null | undefined, scenePlace: string | null) => {
    if (!whereabouts || !stands(id)) return;
    const at = whereOf(id);
    const here = sceneAt(scenePlace);
    if (!at || !here) return;
    if (at !== here) apart.set(id, at);
    else apart.delete(id);
  };
  /** When each last spoke, by the draft's beat, for whom three a stage shows. */
  const lastSpoke = new Map<string, number>();
  for (const id of opening)
    if (byId.get(id)?.kind === 'drawing') shown.push(id);
    else if (stands(id) && parts[0].includes(id)) present.push(id);
  // The writer said no one who is in it: those who are there before they
  // are said to come.
  if (!present.length) for (const id of scenes[0].people) present.push(id);
  // As the page opens, everyone where the story has them: the writer's
  // first scene is the page as the story tells it.
  for (const id of new Set([...present, ...parts[0]]))
    settle(id, scenes[0].place);
  /** The three a story's stage shows of those there: who spoke last first, kept in their places. */
  const three = (people: readonly string[]): string[] => {
    if (people.length <= STORY_ON_STAGE) return [...people];
    const recent = [...people]
      .sort(
        (a, b) =>
          (lastSpoke.get(b) ?? -1) - (lastSpoke.get(a) ?? -1) ||
          people.indexOf(a) - people.indexOf(b),
      )
      .slice(0, STORY_ON_STAGE);
    return people.filter((id) => recent.includes(id));
  };
  /** Where the stage looks: the scene's own place, or another where someone is apart. */
  let view: string | null = null;
  const stageNow = (extra: Partial<SceneStage> = {}): SceneStage => {
    const people =
      view === null
        ? present.filter((id) => !apart.has(id))
        : [...apart].filter(([, place]) => place === view).map(([id]) => id);
    const show = [...three(people), ...(view === null ? shown : [])].slice(
      0,
      MAX_ON_STAGE,
    );
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
      if (!stands(who)) return [];
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
      !stands(who) ||
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

  /** Whom each last hugged or took by the hand: who goes along with them. */
  const touched = new Map<string, string>();
  /**
   * Who comes or goes with someone: whoever the words name ("leading a
   * brown goat"); and where they go together ("together", "they", "both",
   * "with"), whom the action is toward, or else whom they last took by
   * the hand.
   */
  const companionsOf = (who: string, raw: ScreenplayBeatDraft): string[] => {
    // Never the one left ("John's followers leave Jesus"), nor whom the
    // action is toward.
    const left = new RegExp(
      `\\b(?:leave|leaves|left|leaving|from|to|toward|towards)\\s+(?:the\\s+)?$`,
      'iu',
    );
    const named = namedIn(raw.say, [
      ...speaking.filter((one) => !one.id.startsWith(OUT_OF_CAST)),
    ])
      .filter(
        (one) =>
          !left.test(raw.say.slice(Math.max(0, one.at - 20), one.at)) &&
          one.id !== known(raw.to, PEOPLE),
      )
      .map((one) => one.id);
    const along = /\b(?:together|they|both|with)\b/iu.test(raw.say)
      ? (known(raw.to, PEOPLE) ?? touched.get(who) ?? null)
      : null;
    return [...new Set([...named, ...(along ? [along] : [])])].filter(
      (id) => id !== who,
    );
  };
  const steps: SceneStep[] = [];
  const opensQuiet = [...moments.values()].some((m) => m.after < 0);
  /** What the stage last showed: a new step only where that changes. */
  let lastShow: string[] = [];
  const differs = (show: readonly string[]) =>
    show.length !== lastShow.length || show.some((id, i) => id !== lastShow[i]);
  const first = stageNow(scenes[0].place ? { backdrop: scenes[0].place } : {});
  lastShow = first.show;
  /** The place the stage last showed: a narration naming it again changes nothing. */
  let shownPlace: string | null = scenes[0].place;
  steps.push({
    at: { beat: opensQuiet ? -1 : 0, phrase: '' },
    word: 0,
    ...(opensQuiet ? { after: 0 } : {}),
    stage: first,
    effects: [],
  });
  let sceneIndex = 0;
  (draft.beats ?? []).forEach((raw, at) => {
    // A new scene: the stage clears to its people, in its place, by a cut.
    let fresh: Partial<SceneStage> | null = null;
    const nowScene = sceneOf(at);
    if (nowScene !== sceneIndex) {
      sceneIndex = nowScene;
      const scene = scenes[nowScene];
      // A scene that names no one ("When evening comes, …") goes on with
      // whoever was there: never an empty stage.
      const stay = present.filter((id) => !apart.has(id) && !gone.has(id));
      present.splice(
        0,
        present.length,
        ...(scene.people.length ? scene.people : stay),
      );
      shown.length = 0;
      gone.clear();
      apart.clear();
      view = null;
      fresh = { ...(scene.place ? { backdrop: scene.place } : {}), cut: true };
      // A later scene's people went there; the rest are where they were.
      const there = sceneAt(scene.place);
      if (whereabouts && there)
        for (const id of scene.people) movedTo.set(id, there);
      for (const id of new Set([...present, ...parts[nowScene]]))
        settle(id, scene.place);
    }
    const scenePlace = scenes[sceneIndex].place;
    const k = spokenAt.get(at);
    if (k !== undefined) {
      // As a line or a narration begins.
      const beat = beats[k];
      const effects: SceneEffect[] = [];
      const named =
        beat.kind === 'narration' && !fresh
          ? known(raw.place, ['place'])
          : null;
      const place = named && named !== shownPlace ? named : null;
      const prop = known(raw.show, ['drawing']);
      if (prop && !shown.includes(prop)) shown.push(prop);
      // Whoever speaks is on the stage: unless the words sent them off it,
      // or the line comes from somewhere else. Someone there says it from
      // where they are, and a phone or a letter goes to whom it is to.
      const speaker = beat.kind === 'line' ? (beat.speaker ?? null) : null;
      if (
        speaker &&
        present.includes(speaker) &&
        (beat.from === 'off' || beat.from === 'phone' || beat.from === 'letter')
      )
        delete beat.from;
      if (beat.from === 'phone' || beat.from === 'letter') {
        const holder = beat.to ?? null;
        const thing = holder ? byId.get(holder) : undefined;
        if (
          (thing?.kind === 'character' || thing?.kind === 'person') &&
          !thing.holding &&
          (thing.pose ?? 'standing') === 'standing'
        ) {
          thing.holding = beat.from;
          mended.push(`${holder}: holds the ${beat.from} the line comes from`);
        }
      }
      const here = beat.from === undefined || beat.from === 'thought';
      if (speaker) lastSpoke.set(speaker, at);
      // Where the stage looks: at the speaker, in their own place if it is
      // not the scene's (the cave, while the others are above it); for a
      // narration about only those apart, at them.
      let look = fresh ? null : view;
      if (beat.kind === 'line' && speaker && here && stands(speaker)) {
        // Where the writer says the line is said; else where the story
        // has them.
        const lineAt = known(raw.place, ['place']);
        if (lineAt) {
          if (sceneAt(lineAt) !== sceneAt(scenePlace))
            apart.set(speaker, lineAt);
          else apart.delete(speaker);
          if (whereabouts) movedTo.set(speaker, sceneAt(lineAt) ?? lineAt);
        } else settle(speaker, scenePlace);
        look = apart.get(speaker) ?? null;
      } else if (beat.kind === 'narration') {
        const about = [
          ...new Set([
            ...(known(raw.who, PEOPLE) ? [known(raw.who, PEOPLE)!] : []),
            ...peopleIn(beat.say),
          ]),
        ].filter(stands);
        for (const id of about) settle(id, scenePlace);
        if (about.length)
          look = about.every((id) => apart.has(id))
            ? apart.get(about[0])!
            : null;
      }
      // Someone here who is not on the stage comes into view. One the
      // words sent off calls from off it, unless no one is left: then the
      // scene goes with them, and they are back.
      // So does the one a narration is about ("Jesus sees the crowd").
      const comer =
        beat.kind === 'line'
          ? here
            ? speaker
            : null
          : beat.kind === 'narration'
            ? actorIn(beat.say)
            : null;
      const cutIn =
        comer &&
        look === null &&
        stands(comer) &&
        !present.includes(comer) &&
        !apart.has(comer) &&
        (!gone.has(comer) || !present.length)
          ? [comer]
          : [];
      for (const id of cutIn) {
        present.push(id);
        gone.delete(id);
      }
      const switched = look !== view;
      view = look;
      const next = stageNow({
        ...(fresh ?? {}),
        ...(place ? { backdrop: place } : {}),
        ...(switched && !fresh
          ? {
              backdrop: view ?? scenePlace ?? pageHere ?? undefined,
              cut: true as const,
            }
          : {}),
        ...(cutIn.length ? { cutIn } : {}),
      });
      let stage: SceneStage | null = null;
      if (
        fresh ||
        place ||
        prop ||
        cutIn.length ||
        switched ||
        differs(next.show)
      ) {
        stage = next;
        lastShow = next.show;
        shownPlace = next.backdrop ?? shownPlace;
      }
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
    let extra: Partial<SceneStage> | null = fresh;
    // What someone apart does is seen where they are. Someone coming
    // arrives in the scene's place, or where the story has them.
    const entering =
      raw.do === 'enter' &&
      stands(who) &&
      (!present.includes(who) || apart.has(who));
    if (!entering) settle(who, scenePlace);
    const arriveAt = (() => {
      const at = entering ? whereOf(who) : null;
      return at && at !== sceneAt(scenePlace) ? at : null;
    })();
    const look = entering
      ? arriveAt
      : who && apart.has(who)
        ? apart.get(who)!
        : who && stands(who)
          ? null
          : view;
    if (look !== view && !fresh) {
      view = look;
      extra = {
        backdrop: view ?? scenePlace ?? pageHere ?? undefined,
        cut: true,
      };
    }
    if (entering) {
      // With whoever they bring: "leading a brown goat on a rope".
      const coming = [
        who,
        ...companionsOf(who, raw).filter(
          (id) => !present.includes(id) || apart.has(id),
        ),
      ];
      for (const id of coming) {
        if (!present.includes(id)) present.push(id);
        if (arriveAt) apart.set(id, arriveAt);
        else apart.delete(id);
        if (whereabouts) {
          const into = arriveAt ?? sceneAt(scenePlace);
          if (into) movedTo.set(id, into);
        }
        gone.delete(id);
        lastSpoke.set(id, at);
      }
      extra = { ...(extra ?? {}), arrive: coming };
    } else if (raw.do === 'leave' && stands(who) && present.includes(who)) {
      // And whoever goes with them: "together, they walk home".
      const going = [
        who,
        ...companionsOf(who, raw).filter((id) => present.includes(id)),
      ];
      for (const id of going) {
        present.splice(present.indexOf(id), 1);
        gone.add(id);
        apart.delete(id);
      }
      extra = { ...(extra ?? {}), leave: going };
      // No one left where the stage looks, and some of the page elsewhere
      // (the last two climb out of the cave, the boys above): it cuts to
      // them, and is never left empty.
      if (!stageNow().show.length) {
        const elsewhere = [...apart.values()].find((place) => place !== view);
        if (elsewhere) {
          view = elsewhere;
          extra = { ...extra, backdrop: elsewhere, cut: true };
        }
      }
    }
    if (isPerson(who) && (raw.do === 'hug' || raw.do === 'reach')) {
      const other = known(raw.to, PEOPLE);
      if (other) touched.set(who, other);
    }
    const prop = known(raw.show, ['drawing']);
    if (prop && !shown.includes(prop)) shown.push(prop);
    // Hugged or reached for, someone is there: in view, if they were not.
    const toward = known(raw.to, PEOPLE);
    if (
      stands(toward) &&
      (raw.do === 'hug' || raw.do === 'reach') &&
      !present.includes(toward) &&
      !gone.has(toward)
    ) {
      present.push(toward);
      lastSpoke.set(toward, at);
      extra = { ...(extra ?? {}), cutIn: [toward] };
    }
    const next = stageNow(extra ?? {});
    let stage: SceneStage | null = null;
    if (extra || prop || differs(next.show)) {
      stage = next;
      lastShow = next.show;
      shownPlace = next.backdrop ?? shownPlace;
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

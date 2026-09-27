/**
 * How the characters act on a page, planned from what the page already
 * knows: who says each line and when, who is on the stage, each word's
 * time. The stage plays the plan on the voice's clock (the player's
 * `actingAt`), so it moves in step with the words, and every make of a
 * page acts the same.
 *
 * Nothing here needs the writer. Listeners look at whoever speaks, and
 * the speaker at whom they answer; the two in a conversation turn toward
 * each other; mouths take the shape of the words; a speaker gestures as a
 * line starts, nods on its stressed word and lifts their brows on a
 * question; listeners nod when it ends. Someone named in the narration
 * draws a glance; a newcomer draws everyone's eyes. What the writer asks
 * for besides (a look, a reach, a hug, a point at something) is played
 * where it asks.
 */
import type {
  SceneActingDto,
  SceneActingMove,
  SceneStepDto,
} from '../../contracts';
import type { NarratedMove } from './scene-directions';
import {
  ACTED_MOVES,
  HELD_MOVES,
  aimedFeature,
  type ActedMove,
} from './scene-doings';

/** A line as it is said: who says it, when, and each word's time. */
export interface SpokenLine {
  speaker: string;
  /** Whom it is said to, when the screenplay says. */
  to?: string;
  /**
   * Where it comes from, when not from someone on the stage: a voice from
   * above draws every eye up; one off the stage, to its side; a phone's
   * or a letter's, to whoever hears it or holds it. A thought no one else
   * hears, and a dream no one hears at all.
   */
  from?: 'off' | 'above' | 'phone' | 'letter' | 'thought' | 'dream' | 'crowd';
  /** The side of the stage an off-stage voice is on. */
  side?: -1 | 1;
  /** Shouted, whispered: a shout can startle whoever hears it. */
  pace?: 'calm' | 'quick' | 'slow' | 'whisper' | 'shout';
  startMs: number;
  endMs: number;
  words: { text: string; startMs: number; endMs: number }[];
}

/**
 * What someone is asked to do, by the writer or the narration's words, at
 * a moment, toward someone or something ("@up", the sky; "@down", the
 * ground), or no one. "attend": everyone else looks at them.
 */
/** Moves the writer asks for that the arms do: a line's gesture leaves them be. */
const ARMS_DO: ReadonlySet<string> = new Set([
  'point',
  'reach',
  'wave',
  'hug',
  'clap',
]);

export interface DirectedMove {
  atMs: number;
  target: string;
  other: string | null;
  do: NarratedMove | 'attend' | 'lean-in' | ActedMove;
  /** How long it takes, when a screenplay's list of doings says; else as long as the move does. */
  ms?: number;
}

/**
 * A line that startles whoever hears it. In a film, whose lines are said
 * as the sheet says: shouted and ending on a "!", or a cry of alarm
 * ("Look out!", "Stop!"); not every "!": "Catch the ball!" said happily
 * makes no one jump. On a book's page, any line ending on a "!".
 */
const ALARM =
  /\b(?:look out|watch out|careful|stop|help|no|danger|fire|get back|get down|hurry)\b[^.?]*!["'”’]?\s*$/iu;
export const startles = (
  line: Pick<SpokenLine, 'pace'>,
  said: string,
  film = false,
) =>
  /!["'”’]?\s*$/u.test(said) &&
  (!film || line.pace === 'shout' || ALARM.test(said));

/** Words that point off the stage: "He went that way!" */
const THAT_WAY = /\b(?:that way|this way|over there|out there|down there)\b/iu;
/** How long a point off the stage at "that way" is held. */
const POINT_OFF_MS = 1400;
/** Someone gone off this lately is who a line said to no one is said after. */
const GONE_LATELY_MS = 12_000;

/** The word a place in a line's words falls in, counting them as said, one space apart. */
function wordAt(
  words: SpokenLine['words'],
  at: number,
): SpokenLine['words'][number] {
  let from = 0;
  for (const word of words) {
    if (at < from + word.text.length + 1) return word;
    from += word.text.length + 1;
  }
  return words[words.length - 1];
}

/** Frames of the mouth's shapes a second. */
export const MOUTH_FPS = 30;

/**
 * How someone moves, from what the story says they are like: how often
 * and how quickly (energy), and how big (size). Both 1 for anyone the
 * story says nothing of, or nothing these words tell.
 */
export interface ActingStyle {
  energy: number;
  size: number;
}
const NEUTRAL: ActingStyle = { energy: 1, size: 1 };
const LIVELY =
  /\b(?:playful|lively|cheerful|excited|energetic|impatient|cheeky|mischievous|curious|eager|funny|restless|chatty|boisterous|bubbly|adventurous|naughty|noisy)\b/i;
const CALM =
  /\b(?:calm|wise|gentle|patient|old|elderly|tired|sleepy|slow|serene|thoughtful|dignified|solemn|peaceful|storyteller)\b/i;
const SHY =
  /\b(?:shy|timid|nervous|scared|anxious|worried|fearful|meek|cautious)\b/i;
const BIG = /\b(?:proud|loud|bossy|confident|dramatic|boastful|bold|brave)\b/i;

/** Someone's style of moving, from the words the story uses of them. */
export function styleOf(traits: readonly string[]): ActingStyle {
  let energy = 1;
  let size = 1;
  for (const trait of traits) {
    if (LIVELY.test(trait)) energy = Math.max(energy, 1.25);
    if (CALM.test(trait)) energy = Math.min(energy, 0.8);
    if (SHY.test(trait)) {
      size = Math.min(size, 0.75);
      energy = Math.min(energy, 0.85);
    }
    if (BIG.test(trait)) size = Math.max(size, 1.2);
  }
  return { energy, size };
}

/** How long each move the narration may ask for takes. */
const MOVE_MS: Record<
  'shake' | 'laugh' | 'hop' | 'clap' | 'sob' | 'shrug',
  number
> = {
  shake: 1100,
  laugh: 1500,
  hop: 1100,
  clap: 1500,
  sob: 2600,
  shrug: 1200,
};

/** How long each of the body's own moves takes, when nothing says. */
const ACTED_MS: Record<ActedMove, number> = {
  jump: 1100,
  crouch: 1400,
  sit: 1400,
  stand: 1200,
  lie: 1600,
  fall: 1200,
  spin: 1200,
  bow: 1200,
  kick: 1100,
  wag: 1500,
  lick: 1200,
  chew: 1600,
  sniff: 1200,
  dig: 1600,
  wriggle: 1200,
  bark: 1000,
  roll: 1400,
  'shake-off': 1200,
};

/** The body's own moves done toward someone or something, whom the eyes go to while they do it. */
const EYES_ON: readonly ActedMove[] = [
  'jump',
  'crouch',
  'bow',
  'kick',
  'lick',
  'chew',
  'sniff',
  'dig',
  'bark',
];

/** What ends sitting or lying down: getting up, or any move that cannot be made sitting. */
const ENDS_HOLD = new Set<string>([
  'stand',
  'jump',
  'sit',
  'lie',
  'fall',
  'spin',
  'roll',
  'bow',
  'kick',
  'dig',
  'shake-off',
  'hop',
  'hug',
]);

/** A small, stable number from a name: the same choice in every make. */
function beatOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/**
 * A word's sounds as the mouth shows them, in order, with how long each
 * holds against the others: shut for m, b and p; teeth on the lip for f
 * and v; round for o, u, w; open for a; wide for e, i, y; a little open
 * for the rest. Vowels hold twice as long as consonants.
 */
export function shapesOf(word: string): { shape: number; weight: number }[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  const out: { shape: number; weight: number }[] = [];
  const pairs: [string, number, number][] = [
    ['oo', 4, 2],
    ['ou', 4, 2],
    ['ow', 4, 2],
    ['ee', 3, 2],
    ['ea', 3, 2],
    ['ai', 3, 2],
    ['ay', 3, 2],
    ['ph', 5, 1],
    ['th', 1, 1],
    ['sh', 1, 1],
    ['ch', 1, 1],
  ];
  let i = 0;
  while (i < letters.length) {
    const pair = pairs.find(([two]) => letters.startsWith(two, i));
    if (pair) {
      out.push({ shape: pair[1], weight: pair[2] });
      i += 2;
      continue;
    }
    const c = letters[i];
    out.push(
      'mbp'.includes(c)
        ? { shape: 0, weight: 1 }
        : 'fv'.includes(c)
          ? { shape: 5, weight: 1 }
          : 'ouwq'.includes(c)
            ? { shape: 4, weight: 2 }
            : c === 'a'
              ? { shape: 2, weight: 2 }
              : 'eiy'.includes(c)
                ? { shape: 3, weight: 2 }
                : { shape: 1, weight: 1 },
    );
    i += 1;
  }
  return out.length ? out : [{ shape: 1, weight: 1 }];
}

/**
 * A line's mouth, frame by frame at MOUTH_FPS from its first word: each
 * word's time shared out over its sounds, shut between words that are
 * apart, one digit a frame.
 */
export function mouthOf(line: SpokenLine): string {
  if (!line.words.length) return '';
  const start = line.words[0].startMs;
  const end = line.words[line.words.length - 1].endMs;
  const frames = Math.max(1, Math.round(((end - start) * MOUTH_FPS) / 1000));
  const spans: { from: number; to: number; shape: number }[] = [];
  for (const word of line.words) {
    const shapes = shapesOf(word.text);
    const total = shapes.reduce((n, s) => n + s.weight, 0);
    let at = word.startMs;
    for (const { shape, weight } of shapes) {
      const to = at + ((word.endMs - word.startMs) * weight) / total;
      spans.push({ from: at, to, shape });
      at = to;
    }
  }
  let out = '';
  let k = 0;
  for (let f = 0; f < frames; f += 1) {
    const t = start + (f * 1000) / MOUTH_FPS;
    while (k < spans.length - 1 && spans[k].to <= t) k += 1;
    const span = spans[k];
    // Between words set apart, the lips close.
    out += t < span.from - 60 || t > span.to + 60 ? '0' : String(span.shape);
  }
  return out;
}

/** One wish of where someone looks for a while, and how far they turn toward it. */
interface Gaze {
  from: number;
  to: number;
  target: string | null;
  turn: number;
  /** Which wins when two overlap: a line over a glance. */
  rank: number;
}

const RANK = {
  idle: 0,
  entrance: 1,
  named: 2,
  listen: 3,
  speak: 4,
  directed: 5,
};

/**
 * Who is on the stage when, from the steps: each thing's times on it,
 * from the step that shows it to the one that stops.
 */
function presence(
  steps: readonly SceneStepDto[],
  durationMs: number,
): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  steps.forEach((step, k) => {
    const until = steps[k + 1]?.atMs ?? durationMs;
    for (const id of step.show) {
      const spans = out.get(id) ?? [];
      const last = spans[spans.length - 1];
      if (last && last[1] === step.atMs) last[1] = until;
      else spans.push([step.atMs, until]);
      out.set(id, spans);
    }
  });
  return out;
}

/** The step on the stage at a moment. */
function stepAt(
  steps: readonly SceneStepDto[],
  t: number,
): SceneStepDto | null {
  let found: SceneStepDto | null = null;
  for (const step of steps) if (step.atMs <= t) found = step;
  return found;
}

/**
 * The page's performance, by the id of each one who acts in it: the
 * story's characters and the people drawn on it.
 */
export function actingOf(input: {
  actors: readonly string[];
  /** Every name each actor is known by, to catch the narration naming them. */
  names: ReadonlyMap<string, readonly string[]>;
  steps: readonly SceneStepDto[];
  lines: readonly SpokenLine[];
  /** The narration's words outside anyone's quotes, with their times. */
  narration: readonly { text: string; startMs: number; endMs: number }[];
  directed: readonly DirectedMove[];
  durationMs: number;
  /** Whether they walk on and off, and between places: in a story. */
  walks: boolean;
  /** What each is like, as the story says: how they move. */
  traits?: ReadonlyMap<string, readonly string[]>;
  /** Who the book meets for the first time on this page. */
  firsts?: ReadonlySet<string>;
  /** A film's: only a shout or a cry of alarm startles, not any "!". */
  film?: boolean;
  /** When each one goes somewhere else on the stage: a step, which no one takes sitting. */
  goes?: ReadonlyMap<string, readonly number[]>;
}): Record<string, SceneActingDto> {
  const { steps, lines, durationMs } = input;
  const actors = new Set(input.actors);
  const styles = new Map(
    input.actors.map((id) => [id, styleOf(input.traits?.get(id) ?? [])]),
  );
  const styleFor = (id: string) => styles.get(id) ?? NEUTRAL;
  const onStage = presence(steps, durationMs);
  const on = (id: string, t: number) =>
    (onStage.get(id) ?? []).some(([a, b]) => a <= t && t < b);
  const gazes = new Map<string, Gaze[]>();
  const moves = new Map<string, [number, SceneActingMove, number, string?][]>();
  const mouths = new Map<string, [number, string][]>();
  const gaze = (id: string, one: Gaze) => {
    if (!actors.has(id)) return;
    gazes.set(id, [...(gazes.get(id) ?? []), one]);
  };
  const move = (
    id: string,
    at: number,
    what: SceneActingMove,
    ms: number,
    toward?: string,
  ) => {
    if (!actors.has(id)) return;
    moves.set(id, [
      ...(moves.get(id) ?? []),
      toward
        ? [Math.round(at), what, Math.round(ms), toward]
        : [Math.round(at), what, Math.round(ms)],
    ]);
  };
  /** Who else of the actors is on the stage at a moment, nearest first in its order. */
  const others = (id: string, t: number) => {
    const show = stepAt(steps, t)?.show ?? [];
    const at = show.indexOf(id);
    return show
      .filter((one) => one !== id && actors.has(one) && on(one, t))
      .sort(
        (a, b) =>
          Math.abs(show.indexOf(a) - at) - Math.abs(show.indexOf(b) - at),
      );
  };

  /** Who went off, when and by which side: where a call after them goes. */
  const wentOff = new Map<string, { at: number; side: '@left' | '@right' }>();
  for (const step of steps)
    for (const [id, exit] of Object.entries(step.exit ?? {}))
      wentOff.set(id, {
        at: step.atMs,
        side: exit.side === 'left' ? '@left' : '@right',
      });
  /** The side someone went off by, if they had gone by `t`. */
  const sideWent = (id: string, t: number) => {
    const gone = wentOff.get(id);
    return gone && gone.at <= t ? gone.side : undefined;
  };
  /** The side the next to go after `t` goes off by. */
  const nextGone = (t: number) =>
    [...wentOff.values()]
      .filter((one) => one.at > t)
      .sort((a, b) => a.at - b.at)[0]?.side;
  /** Away from whom they tell, across the stage. */
  const awayFrom = (
    id: string,
    them: string | null,
    t: number,
  ): '@left' | '@right' => {
    const show = stepAt(steps, t)?.show ?? [];
    return them && show.indexOf(them) > show.indexOf(id) ? '@left' : '@right';
  };

  // Lines: the speaker looks at whom they talk to, the rest at them.
  // Whom they talk to: whoever the line calls by name ("Tell us a story,
  // Nana"), else whom they answer, else whom they spoke to last, going
  // on, else whoever is nearest.
  const spokeTo = new Map<string, string>();
  /** How many lines each has said so far. */
  const spokenBy = new Map<string, number>();
  lines.forEach((line, i) => {
    const { speaker, startMs: from, endMs: to } = line;
    // A voice from above: every eye goes up, brows raised. From off the
    // stage: every face turns to its side. Down a phone or from a letter:
    // whoever hears it or holds it listens, and the rest look at them.
    // A dream's no one hears.
    if (line.from && line.from !== 'thought') {
      const hearers = others(speaker, from);
      const holder =
        (line.from === 'phone' || line.from === 'letter') &&
        line.to &&
        hearers.includes(line.to)
          ? line.to
          : null;
      if (line.from === 'dream') return;
      hearers.forEach((one, k) => {
        const toward =
          line.from === 'crowd'
            ? null
            : line.from === 'above'
              ? '@up'
              : line.from === 'off' || (!holder && line.from === 'phone')
                ? (line.side ?? 1) < 0
                  ? '@left'
                  : '@right'
                : one === holder
                  ? line.from === 'letter'
                    ? '@down'
                    : null
                  : holder;
        gaze(one, {
          from: from + 150 + k * 110,
          to: to + 600,
          target: toward,
          turn: toward === '@left' || toward === '@right' ? 0.6 : 0.35,
          rank: RANK.listen,
        });
        if (line.from === 'above' && k < 2)
          move(one, from + 200 + k * 150, 'brows', 1100);
      });
      if (
        holder &&
        /[.!]["'”’]?\s*$/.test(line.words.map((w) => w.text).join(' '))
      )
        move(holder, to + 150, 'nod', 500);
      return;
    }
    // A thought: the thinker looks up and away, brows raised, their mouth
    // still; no one else hears it.
    if (line.from === 'thought') {
      gaze(speaker, {
        from: from - 200,
        to: to + 300,
        target: '@up',
        turn: 0,
        rank: RANK.speak,
      });
      move(speaker, from, 'brows', Math.min(1400, to - from));
      return;
    }
    const before = lines[i - 1];
    const bare = new Set(
      line.words.map((w) => w.text.replace(/[^\p{L}\p{N}'-]/gu, '')),
    );
    const called =
      (line.to && on(line.to, from) ? line.to : undefined) ??
      [...input.names].find(
        ([id, names]) =>
          id !== speaker &&
          on(id, from) &&
          names.some((name) => bare.has(name.split(/\s+/)[0])),
      )?.[0];
    const last = spokeTo.get(speaker);
    const answering =
      called ??
      (before && before.speaker !== speaker && on(before.speaker, from)
        ? before.speaker
        : last && on(last, from)
          ? last
          : (others(speaker, from)[0] ?? null));
    if (answering) spokeTo.set(speaker, answering);
    // Called after someone gone ("Pip! Where are you going?"), or said
    // with no one to answer just after someone went: toward the side they
    // went. Called for someone not here at all: a look round for them.
    const first = line.words[0]?.text ?? '';
    const calledOff = /[!,]["'”’]?$/u.test(first)
      ? [...input.names].find(
          ([id, names]) =>
            id !== speaker &&
            !on(id, from) &&
            names.some(
              (name) =>
                name.split(/\s+/)[0] === first.replace(/[^\p{L}'-]/gu, ''),
            ),
        )?.[0]
      : undefined;
    const lastGone = [...wentOff]
      .filter(
        ([id, { at }]) =>
          id !== speaker && at <= from && from - at < GONE_LATELY_MS,
      )
      .sort((a, b) => b[1].at - a[1].at)[0];
    const after = calledOff ?? (!answering ? lastGone?.[0] : undefined);
    const offSide = after ? sideWent(after, from) : undefined;
    // Called by a name none here has, asking where they are ("Pip! Pip!
    // Where are you?"): someone not in the scene at all.
    const callsFor =
      /^\p{Lu}[\p{L}'-]*[!,]["'”’]?$/u.test(first) &&
      /\bwhere\b/iu.test(line.words.map((w) => w.text).join(' ')) &&
      ![...input.names].some(
        ([id, names]) =>
          on(id, from) &&
          names.some(
            (name) =>
              name.split(/\s+/)[0] === first.replace(/[^\p{L}'-]/gu, ''),
          ),
      );
    const lookRound = (Boolean(after) && !offSide) || (!after && callsFor);
    if (lookRound) {
      const mid = (from + to) / 2;
      gaze(speaker, {
        from: from - 250,
        to: mid,
        target: '@left',
        turn: 0.5,
        rank: RANK.speak,
      });
      gaze(speaker, {
        from: mid,
        to: to + 300,
        target: '@right',
        turn: 0.5,
        rank: RANK.speak,
      });
    } else
      gaze(speaker, {
        from: from - 250,
        to: to + 300,
        target: offSide ?? answering,
        turn: offSide ? 0.6 : answering ? 0.5 : 0,
        rank: RANK.speak,
      });
    others(speaker, from).forEach((listener, k) =>
      gaze(listener, {
        from: from + 150 + k * 90,
        to: to + 500,
        target: speaker,
        turn: listener === answering ? 0.5 : 0.35,
        rank: RANK.listen,
      }),
    );
    mouths.set(speaker, [
      ...(mouths.get(speaker) ?? []),
      [Math.round(line.words[0]?.startMs ?? from), mouthOf(line)],
    ]);
    const words = line.words;
    const said = words.map((w) => w.text).join(' ');
    // "That way!": a point off the stage, where someone went or is going,
    // else away from whom they tell, the eyes after it.
    const thatWay = THAT_WAY.exec(said);
    if (thatWay) {
      const side =
        offSide ??
        lastGone?.[1].side ??
        nextGone(from) ??
        awayFrom(speaker, answering, from);
      const word = wordAt(words, thatWay.index);
      move(speaker, word.startMs, 'point', POINT_OFF_MS, side);
      gaze(speaker, {
        from: word.startMs,
        to: word.startMs + POINT_OFF_MS + 200,
        target: side,
        turn: 0.6,
        rank: RANK.directed,
      });
    }
    // A gesture as a line starts: the hand opens toward whom they answer,
    // or, with no one to face, the arms in turn. A lively one gestures on
    // a short line too, and quicker; a calm one on every other long one.
    const style = styleFor(speaker);
    const fewest = style.energy > 1.1 ? 3 : style.energy < 0.9 ? 6 : 4;
    const nth = spokenBy.get(speaker) ?? 0;
    spokenBy.set(speaker, nth + 1);
    const toward = offSide ?? answering ?? undefined;
    // None while their arms do what the writer asked: a point, a reach.
    const armsBusy = input.directed.some(
      (one) =>
        one.target === speaker &&
        ARMS_DO.has(one.do) &&
        one.atMs < to &&
        one.atMs + (one.ms ?? 1200) > from,
    );
    if (
      !thatWay &&
      !lookRound &&
      !armsBusy &&
      words.length >= fewest &&
      !(style.energy < 0.9 && nth % 2 === 1)
    )
      move(
        speaker,
        from + 120,
        toward || i % 2 === 0 ? 'gesture' : 'gesture-left',
        Math.min(1500, Math.max(800, (to - from) * 0.6)) / style.energy,
        toward,
      );
    // A nod on the stressed word: before a ! or ., else the longest.
    if (words.length >= 2) {
      const stressed =
        [...words]
          .reverse()
          .find((w) => /[!.]["'”’]?$/.test(w.text) && w !== words[0]) ??
        [...words].sort(
          (a, b) =>
            b.text.replace(/\W/g, '').length - a.text.replace(/\W/g, '').length,
        )[0];
      move(speaker, stressed.startMs, 'nod', 450);
    }
    // Brows up on a question.
    if (/\?["'”’]?\s*$/.test(said))
      move(speaker, words[words.length - 1].startMs - 200, 'brows', 800);
    // A listener nods when a line ends; a startling one leans them back.
    const listeners = others(speaker, from);
    if (listeners.length) {
      const one =
        listeners[Math.floor(beatOf(`${speaker}:${i}`) * listeners.length)];
      if (startles(line, said, input.film))
        move(one, to + 100, 'lean', 800, speaker);
      else if (/[.]["'”’]?\s*$/.test(said) && beatOf(`nod:${i}`) < 0.7)
        move(one, to + 150, 'nod', 500);
    }
  });

  // The narration names someone: the others glance at them.
  for (const word of input.narration) {
    for (const [id, names] of input.names) {
      if (!on(id, word.startMs)) continue;
      const bare = word.text.replace(/[^\p{L}\p{N}' -]/gu, '');
      if (!names.some((name) => name.split(/\s+/)[0] === bare)) continue;
      for (const other of others(id, word.startMs))
        gaze(other, {
          from: word.startMs + 100,
          to: word.startMs + 1300,
          target: id,
          turn: 0,
          rank: RANK.named,
        });
    }
  }

  // A newcomer draws everyone's eyes.
  steps.forEach((step, k) => {
    const before = k > 0 ? steps[k - 1].show : [];
    for (const id of step.show) {
      if (before.includes(id) || !actors.has(id)) continue;
      for (const other of others(id, step.atMs + 1))
        gaze(other, {
          from: step.atMs + 200,
          to: step.atMs + 1300,
          target: id,
          turn: 0.2,
          rank: RANK.entrance,
        });
    }
  });

  // What the writer or the narration asked for, where it asked.
  for (const one of input.directed) {
    const { atMs: at, target: who, other } = one;
    /** A side of the stage: a voice off it, someone gone off it, a feature at it. */
    const side = other === '@left' || other === '@right' ? other : undefined;
    /** Someone real to turn to: another on the stage, not the sky. */
    const them =
      other && !other.startsWith('@') && on(other, at) ? other : null;
    /** A feature of the set, where it stands: turned to as to someone. */
    const feature = aimedFeature(other) ? other : null;
    const look = (
      id: string,
      target: string | null,
      ms: number,
      turn: number,
    ) => gaze(id, { from: at, to: at + ms, target, turn, rank: RANK.directed });
    switch (one.do) {
      case 'look':
        if (other)
          look(
            who,
            them ?? other,
            one.ms ?? 2500,
            them || feature ? 0.5 : side ? 0.6 : 0,
          );
        break;
      case 'attend':
        for (const watcher of others(who, at)) look(watcher, who, 1600, 0.35);
        break;
      case 'hug': {
        if (!them) break;
        const ms = one.ms ?? 2200;
        move(who, at, 'hug', ms, them);
        move(them, at + 120, 'hug', ms - 100, who);
        look(who, them, ms, 0.6);
        gaze(them, {
          from: at,
          to: at + ms,
          target: who,
          turn: 0.6,
          rank: RANK.directed,
        });
        break;
      }
      case 'reach':
      case 'point': {
        const ms = one.ms ?? (one.do === 'point' ? 1700 : 1400);
        if (side) {
          // Out to one side of the stage: the arm that way, the eyes after it.
          move(who, at, 'point', ms, side);
          look(who, side, ms + 200, 0.6);
        } else if (other?.startsWith('@')) {
          move(who, at, 'point-up', ms);
          look(who, other, ms + 200, 0);
        } else if (them || other) {
          move(who, at, one.do, ms, them ?? other!);
          look(who, them ?? other, ms + 100, 0.4);
        }
        break;
      }
      case 'wave': {
        const toward = them ?? feature ?? side;
        move(who, at, 'wave', one.ms ?? 1900, toward);
        if (toward) look(who, toward, (one.ms ?? 1900) + 100, 0.4);
        break;
      }
      case 'nod':
        move(who, at, 'nod', one.ms ?? 600);
        break;

      case 'lean-in': {
        const toward = them ?? feature ?? side;
        move(who, at, 'lean-in', one.ms ?? 1500, toward);
        if (toward) look(who, toward, one.ms ?? 1500, 0.4);
        break;
      }
      default:
        if ((ACTED_MOVES as readonly string[]).includes(one.do)) {
          // The body's own: toward whom or what it is done, the eyes on
          // it while it is (a lick, a sniff, a bow).
          const acted = one.do as ActedMove;
          const toward = them ?? feature ?? side;
          const ms = one.ms ?? ACTED_MS[acted];
          move(who, at, acted, ms, toward ?? undefined);
          if (toward && EYES_ON.includes(acted))
            look(who, toward, ms + 100, 0.5);
        } else
          move(
            who,
            at,
            one.do,
            one.ms ?? MOVE_MS[one.do as keyof typeof MOVE_MS],
          );
    }
  }

  // Sitting or lying down, they stay so until they get up (or make a move
  // that cannot be made sitting), go somewhere else on the stage, or go:
  // held until then, and up again as they rise.
  for (const [id, list] of moves) {
    list.sort((a, b) => a[0] - b[0]);
    list.forEach((one, k) => {
      if (!(HELD_MOVES as readonly string[]).includes(one[1])) return;
      const next = list.slice(k + 1).find((later) => ENDS_HOLD.has(later[1]));
      const gone =
        (onStage.get(id) ?? []).find(
          ([a, b]) => a <= one[0] && one[0] < b,
        )?.[1] ?? durationMs;
      const walks = input.goes?.get(id)?.find((at) => at > one[0]);
      const until = Math.min(
        next ? next[0] + (next[1] === 'stand' ? next[2] : 0) : Infinity,
        walks ?? Infinity,
        gone,
      );
      one[2] = Math.max(one[2], Math.round(until - one[0]));
    });
  }

  // Met for the first time: a move that says what they are like, a
  // moment after they first come on. A lively one hops, a calm one nods
  // slowly, a shy one looks down.
  for (const id of input.firsts ?? []) {
    const came = (onStage.get(id) ?? [])[0]?.[0];
    if (came === undefined || !actors.has(id)) continue;
    const style = styleFor(id);
    const at = came + 700;
    if (style.energy > 1.1) move(id, at, 'hop', 1100);
    else if (style.size < 0.9)
      gaze(id, {
        from: at,
        to: at + 1400,
        target: '@down',
        turn: 0,
        rank: RANK.directed,
      });
    else if (style.energy < 0.9) move(id, at, 'nod', 900);
  }

  // A long quiet stretch: a glance now and then at someone else there.
  for (const id of actors)
    for (const [from, to] of onStage.get(id) ?? []) {
      for (let t = from + 4000; t < to - 2000; t += 5200) {
        const busy = (gazes.get(id) ?? []).some(
          (g) => g.rank > RANK.idle && g.from < t + 1600 && g.to > t - 1500,
        );
        if (busy) continue;
        const near = others(id, t);
        if (!near.length) continue;
        if (beatOf(`${id}:${t}`) < 0.35) continue;
        gaze(id, {
          from: t,
          to: t + 1100,
          target: near[Math.floor(beatOf(`glance:${id}:${t}`) * near.length)],
          turn: 0.15,
          rank: RANK.idle,
        });
      }
    }

  const out: Record<string, SceneActingDto> = {};
  for (const id of actors) {
    const acted: SceneActingDto = {};
    const look = sweep(gazes.get(id) ?? []);
    if (look.length) acted.look = look;
    const said = mouths.get(id);
    if (said?.length) acted.mouth = said;
    const moved = moves.get(id);
    if (moved?.length) acted.moves = moved.sort((a, b) => a[0] - b[0]);
    if (input.walks && onStage.has(id)) acted.walks = true;
    const { size } = styleFor(id);
    if (size !== 1) acted.size = size;
    if (Object.keys(acted).length) out[id] = acted;
  }
  return out;
}

/**
 * Where someone looks from moment to moment, from the wishes that
 * overlap: the highest ranked wins, the latest on a tie, and between
 * wishes they look at the viewer. Keyframes only where it changes.
 */
function sweep(wishes: Gaze[]): [number, string | null, number][] {
  if (!wishes.length) return [];
  const times = [
    ...new Set(wishes.flatMap((w) => [Math.max(0, w.from), Math.max(0, w.to)])),
  ].sort((a, b) => a - b);
  const out: [number, string | null, number][] = [];
  for (const t of times) {
    const live = wishes
      .filter((w) => w.from <= t && t < w.to)
      .sort((a, b) => b.rank - a.rank || b.from - a.from)[0];
    const next: [number, string | null, number] = live
      ? [Math.round(t), live.target, Math.round(live.turn * 100) / 100]
      : [Math.round(t), null, 0];
    const last = out[out.length - 1];
    if (last && last[1] === next[1] && last[2] === next[2]) continue;
    if (!last && next[1] === null) continue;
    out.push(next);
  }
  return out;
}

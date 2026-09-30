/**
 * Acting that matches the words (a Studio film's): what each line does to
 * the one it is said to, read from its own words (studio-screenwriting
 * W2: asks, refuses, warns, begs, teases, jokes, orders, accuses,
 * threatens, comforts, praises, confesses, reveals, bargains, dodges; and
 * the lines that hand, take or show a thing), the word it turns on, and
 * how each one on the stage plays it:
 *
 *  - the speaker's gesture is chosen by what the line does (a palm up to
 *    ask, a head shake and a raised palm to refuse, a wagging finger to
 *    warn, clasped hands to beg, a point to accuse), its fullest moment
 *    on the line's key word rather than as the line starts; their face is
 *    the line's feeling; and a thing on the stage the line names is
 *    looked at, or pointed to, as it is named;
 *  - whoever it is said to reacts on the word that hits them (a flinch at
 *    a warning, a take at an accusation or a reveal, a laugh at a joke, a
 *    nod at comfort), before they answer, with a face to match, held a
 *    moment and then given back;
 *  - feeling moves the body: anger and warmth step toward, fear and hurt
 *    step back, a small step the player keeps on the stage and apart.
 *
 * And the check (actedLines): for each line of a made scene, what acting
 * happened, whether it matches what the line does, and whether it is
 * timed to its key word; the lines nothing was acted for.
 *
 * Pure: the same words give the same acting in every make.
 */
import type { SceneDto } from '../../contracts';
import type { FigureFace } from './scene-figure';
import {
  GLAD_RECIPES,
  LOW_RECIPES,
  RECIPE_OF_FACE,
  hash01,
  type FaceHow,
  type FaceRecipe,
} from './scene-face-rig';

/** What a line does to the one it is said to (W2), and the physical ones: handing, taking, showing a thing. */
export const LINE_AIMS = [
  'gives',
  'takes',
  'shows',
  'refuses',
  'threatens',
  'warns',
  'accuses',
  'begs',
  'confesses',
  'comforts',
  'praises',
  'teases',
  'jokes',
  'bargains',
  'dodges',
  'reveals',
  'greets',
  'agrees',
  'orders',
  'asks',
  'says',
] as const;
export type LineAim = (typeof LINE_AIMS)[number];

/** A sheet's own word for an aim, as W2 lists them, to one of ours: "lies" is played as a dodge, "pleads" as a beg. */
export function aimNamed(word: string | null | undefined): LineAim | null {
  const w = (word ?? '').trim().toLowerCase();
  if ((LINE_AIMS as readonly string[]).includes(w)) return w as LineAim;
  const alias: Record<string, LineAim> = {
    pleads: 'begs',
    lies: 'dodges',
    points: 'shows',
    hands: 'gives',
    answers: 'says',
    tells: 'says',
    informs: 'says',
    insults: 'teases',
    mocks: 'teases',
    commands: 'orders',
    demands: 'orders',
    apologises: 'confesses',
    apologizes: 'confesses',
    reassures: 'comforts',
    thanks: 'praises',
  };
  return alias[w] ?? null;
}

/**
 * Words that say what a line does, most telling first: a line that hands
 * something over is a giving before it is anything else; a refusal
 * before a question ("No, why would I?").
 */
const AIM_WORDS: { aim: LineAim; words: RegExp }[] = [
  {
    aim: 'gives',
    words:
      /\b(?:here(?:'s| is| are| you go| take)|take (?:it|this|mine|these)|have (?:it|this|mine)|(?:this|it)'?s? (?:is )?for you|for you\b)/iu,
  },
  {
    aim: 'takes',
    words:
      /\b(?:give (?:it|that|them|me)|hand (?:it|that|them|me)|pass (?:me|it|that)|let me (?:have|take|hold|see)|i'?ll take (?:it|that)|gimme)\b/iu,
  },
  {
    aim: 'shows',
    words:
      /\b(?:look (?:at|here)|see (?:this|that|here)|check (?:this|it) out|watch (?:this|me)|behold)\b/iu,
  },
  {
    aim: 'refuses',
    words:
      /(?:^\W*(?:no|nope|never|nah)\b|\b(?:i won'?t|i will not|i can'?t|i refuse|not (?:a chance|happening|today|now|again)|absolutely not|no way|forget it|not me)\b)/iu,
  },
  {
    aim: 'threatens',
    words:
      /\b(?:or else|you'?ll be sorry|i'?ll (?:tell|make you|get you)|you'?d better|last chance|i'?m warning you)\b/iu,
  },
  {
    aim: 'warns',
    words:
      /\b(?:careful|watch out|look out|mind (?:the|your|out)|don'?t (?:touch|go|do that|you dare|move|look)|stop|wait)\b/iu,
  },
  {
    aim: 'praises',
    words:
      /\b(?:well done|good job|great job|amazing|brilliant|so proud|clever|wonderful|thank you|thanks|you'?re the best)\b/iu,
  },
  {
    aim: 'accuses',
    words:
      /\b(?:you (?:took|did|ate|broke|lied|stole|never|always|said|promised|forgot|ruined|lost|hid)|it was you|how could you|why did you|your fault|you did this)\b/iu,
  },
  {
    aim: 'begs',
    words:
      /\b(?:please|i beg|i'?m begging|just this once|pretty please|help me|won'?t you|can'?t you)\b/iu,
  },
  {
    aim: 'confesses',
    words:
      /\b(?:it was me|i did it|i'?m sorry|i have to tell you|the truth is|i lied|i broke|i ate|i took|i lost|my fault|sorry)\b/iu,
  },
  {
    aim: 'comforts',
    words:
      /\b(?:it'?s (?:ok(?:ay)?|alright|all right|fine)|don'?t (?:worry|cry|be (?:sad|scared|afraid))|i'?m here|we'?ll (?:find|fix|figure|get)|never mind|there,? there|you'?re safe)\b/iu,
  },
  {
    aim: 'teases',
    words:
      /\b(?:scaredy|slowpoke|silly|bet you can'?t|ha,? ?ha|chicken|sure you did|oh really|you wish|nice try|who'?s (?:scared|slow) now)\b/iu,
  },
  {
    aim: 'jokes',
    words: /\b(?:knock,? knock|just kidding|joking|a joke|get it\?)/iu,
  },
  {
    aim: 'bargains',
    words:
      /\b(?:deal\?|how about|what if|i'?ll give you|in exchange|trade you|if you \w+[^.?!]*,? (?:i'?ll|then))\b/iu,
  },
  {
    aim: 'dodges',
    words:
      /\b(?:who,? me|what,? me|no idea|i don'?t know (?:what|anything)|nothing,? (?:nothing|really)|anyway|um+|er+)\b/iu,
  },
  {
    aim: 'reveals',
    words:
      /\b(?:guess what|you know what|turns out|the thing is|i found|we found|it'?s (?:a|the|him|her|them)\b[^.?]*!)/iu,
  },
  {
    aim: 'greets',
    words: /^\W*(?:hi|hello|hey|good (?:morning|afternoon|evening))\b/iu,
  },
  {
    aim: 'agrees',
    words:
      /^\W*(?:yes|yeah|yep|ok(?:ay)?|sure|fine|alright|all right|deal|right)\b/iu,
  },
];

/** A line that starts on an order: the first word a verb said to someone, ending on a "." or "!". */
const ORDER =
  /^\W*(?:\p{Lu}[\p{L}'-]*,\s*)?(?:go|come|sit|stand|get|put|bring|listen|hurry|move|leave|open|close|shut|stay|run|hold|find|tell|fix|keep|follow|catch|jump|hide|stop|wait)\b[^?]*[.!]["'”’]?\s*$/iu;

/** Words no key word is: too small to carry a line. */
const SMALL =
  /^(?:a|an|the|to|of|in|on|at|and|or|but|is|it|i|you|me|my|your|we|us|he|she|they|them|his|her|its|our|this|that|be|am|are|was|were|do|did|so|just|for|with|up|by)$/iu;

/** A word as compared: lower case, letters only. */
const bare = (word: string) =>
  word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]/gu, '')
    .replace(/'s$/u, '');

/** A thing on the stage a line may name: where a look or a point goes (a feature "f:<id>", or who holds it), and its words. */
export interface NameableThing {
  aim: string;
  words: readonly string[];
  /** The thing itself: a thing of the stage's by its id, or a feature as "f:<id>" (what an insert frames). */
  id?: string;
}

/** What a line does, and the words it turns on. */
export interface LineRead {
  aim: LineAim;
  /** The key word, by its place among the words: where the gesture lands. */
  key: number;
  /** The word that hits the one it is said to: where they react; the last for a punchline. */
  hit: number;
  /** A thing on the stage the line names, and the word naming it. */
  thing?: { aim: string; word: number };
  /** Someone on the stage it names, not whom it is said to, and the word. */
  named?: { id: string; word: number };
  /** A line that lands (a joke's punchline, a threat, an accusation, bad news): the listener's face is shown after it. */
  lands: boolean;
  /** A line that says what the speaker wants (K2): "I want", "I have to", "I need". */
  want: boolean;
}

/** The word a character offset falls in, counting words one space apart. */
function wordIndexAt(words: readonly string[], at: number): number {
  let from = 0;
  for (let i = 0; i < words.length; i += 1) {
    if (at < from + words[i].length + 1) return i;
    from += words[i].length + 1;
  }
  return Math.max(0, words.length - 1);
}

/** The word a line stresses: before its ! or ., else its longest word that is not a small one. */
export function stressedWord(words: readonly string[]): number {
  if (!words.length) return 0;
  for (let i = words.length - 1; i > 0; i -= 1)
    if (/[!.]["'”’]?$/u.test(words[i]) && !SMALL.test(bare(words[i]))) return i;
  let best = 0;
  words.forEach((word, i) => {
    const w = bare(word);
    if (SMALL.test(w)) return;
    if (w.length > bare(words[best]).length || SMALL.test(bare(words[best])))
      best = i;
  });
  return best;
}

/** Words that say what the speaker wants (studio-screenwriting K2). */
const WANT =
  /\b(?:i (?:want|need|wish|have to|must|really want|just want)|i'?ve got to|i'?m going to (?:find|get|win|make|fix|save|be)|i'?ll (?:find|get|win|make|fix|save)|if only i|all i want)\b/iu;

/** The aims whose blow lands on their key word; the rest on the last word (a punchline) or the stressed one. */
const HITS_AT_KEY: ReadonlySet<LineAim> = new Set([
  'refuses',
  'threatens',
  'warns',
  'accuses',
  'confesses',
  'reveals',
  'praises',
  'comforts',
  'gives',
  'shows',
  'greets',
]);
/** The aims that land: the listener's face is shown after them (K8). */
const LANDS: ReadonlySet<LineAim> = new Set([
  'threatens',
  'accuses',
  'jokes',
  'teases',
  'reveals',
  'confesses',
  'refuses',
]);

/**
 * What a line does and where it turns, from its words: the sheet's own
 * aim where it gave one; else read from the words. `names`: the others
 * on the stage by their first names; `things`: what on the stage it may
 * name.
 */
export function readLine(
  words: readonly string[],
  context: {
    aim?: string | null;
    names?: ReadonlyMap<string, readonly string[]>;
    things?: readonly NameableThing[];
    /** Whom it is said to: named, they are not "someone named". */
    to?: string | null;
  } = {},
): LineRead {
  const said = words.join(' ');
  let aim = aimNamed(context.aim);
  let key = -1;
  for (const one of AIM_WORDS) {
    const m = one.words.exec(said);
    if (!m) continue;
    if (!aim) aim = one.aim;
    if (aim === one.aim) {
      // The first word of what matched that carries weight.
      const first = wordIndexAt(
        words,
        m.index + (m[0].length - m[0].trimStart().length),
      );
      const span = m[0].trim().split(/\s+/).length;
      key = first;
      for (let i = first; i < Math.min(words.length, first + span); i += 1)
        if (!SMALL.test(bare(words[i]))) {
          key = i;
          break;
        }
      break;
    }
  }
  if (!aim && ORDER.test(said)) {
    aim = 'orders';
    key = words.findIndex((w) => !/,$/u.test(w) || words.length === 1);
  }
  if (!aim && /\?["'”’]?\s*$/u.test(said)) aim = 'asks';
  aim ??= 'says';
  const stressed = stressedWord(words);
  if (key < 0) key = aim === 'asks' ? questionKey(words) : stressed;
  // A thing on the stage the line names, as it names it.
  let thing: LineRead['thing'];
  for (let i = 0; i < words.length && !thing; i += 1) {
    const w = bare(words[i]);
    if (!w || SMALL.test(w)) continue;
    for (const one of context.things ?? [])
      if (
        one.words.some(
          (name) => name === w || `${name}s` === w || `${name}es` === w,
        )
      ) {
        thing = { aim: one.aim, word: i };
        break;
      }
  }
  // Showing, taking or giving a thing it names turns on the thing.
  if (thing && (aim === 'shows' || aim === 'takes' || aim === 'gives'))
    key = thing.word;
  let named: LineRead['named'];
  for (const [id, names] of context.names ?? []) {
    if (id === context.to) continue;
    const i = words.findIndex((w) =>
      names.some((name) => bare(name.split(/\s+/)[0]) === bare(w)),
    );
    if (i >= 0 && (!named || i < named.word)) named = { id, word: i };
  }
  const hit = HITS_AT_KEY.has(aim) ? key : words.length - 1;
  return {
    aim,
    key: Math.max(0, Math.min(words.length - 1, key)),
    hit: Math.max(0, Math.min(words.length - 1, hit)),
    ...(thing ? { thing } : {}),
    ...(named ? { named } : {}),
    lands: LANDS.has(aim),
    want: WANT.test(said),
  };
}

/** A question turns on its question word, else its stressed word. */
function questionKey(words: readonly string[]): number {
  const wh = words.findIndex((w) =>
    /^(?:who|what|where|when|why|how|which|whose)\b/iu.test(bare(w)),
  );
  return wh >= 0 ? wh : stressedWord(words);
}

/** The face a line is said with when neither the sheet nor its words say (faceOfLine): what it does. */
export function faceOfAim(aim: LineAim): FigureFace | null {
  switch (aim) {
    case 'threatens':
    case 'accuses':
      return 'angry';
    case 'begs':
    case 'warns':
      return 'afraid';
    case 'confesses':
      return 'sad';
    case 'comforts':
    case 'praises':
    case 'teases':
    case 'jokes':
    case 'greets':
    case 'gives':
      return 'happy';
    case 'reveals':
    case 'shows':
      return 'surprised';
    case 'asks':
    case 'bargains':
    case 'dodges':
      return 'thinking';
    default:
      return null;
  }
}

/** The moves a line's aim is acted with: the ones the player has for it (the arms, the head, the feet). */
export type PerformMove =
  | 'gesture'
  | 'gesture-left'
  | 'point'
  | 'reach'
  | 'wave'
  | 'nod'
  | 'shake'
  | 'shrug'
  | 'clap'
  | 'laugh'
  | 'hop'
  | 'brows'
  | 'lean-in'
  | 'palm-out'
  | 'plead'
  | 'fist'
  | 'wag-finger'
  | 'hand-chest'
  | 'step-in'
  | 'step-back'
  | 'flinch'
  | 'take'
  | 'ready';

/**
 * Where a move is fullest, as a share of its time: a gesture opens a
 * fifth of the way in, a nod at its middle. The move starts so this falls
 * on the word it is timed to.
 */
export const PEAK_AT: Record<PerformMove, number> = {
  gesture: 0.2,
  'gesture-left': 0.2,
  point: 0.2,
  reach: 0.25,
  wave: 0.15,
  nod: 0.5,
  shake: 0.25,
  shrug: 0.2,
  clap: 0.15,
  laugh: 0.1,
  hop: 0.25,
  brows: 0.15,
  'lean-in': 0.25,
  'palm-out': 0.2,
  plead: 0.25,
  fist: 0.2,
  'wag-finger': 0.15,
  'hand-chest': 0.25,
  'step-in': 0.3,
  'step-back': 0.2,
  flinch: 0.1,
  take: 0.12,
  ready: 0.6,
};

/** How long each is, when nothing says. */
export const PERFORM_MS: Record<PerformMove, number> = {
  gesture: 1100,
  'gesture-left': 1100,
  point: 1400,
  reach: 1300,
  wave: 1500,
  nod: 500,
  shake: 900,
  shrug: 1100,
  clap: 1200,
  laugh: 1300,
  hop: 1000,
  brows: 800,
  'lean-in': 1200,
  'palm-out': 1200,
  plead: 1500,
  fist: 1300,
  'wag-finger': 1300,
  'hand-chest': 1500,
  'step-in': 2600,
  'step-back': 2200,
  flinch: 700,
  take: 900,
  ready: 600,
};

/** A move of the speaker's for a line: which, toward whom (true: whom it is said to; "thing": what it names), and on which word. */
export interface SpeakerMove {
  move: PerformMove;
  toward: 'them' | 'thing' | 'away' | null;
  on: 'key' | 'start' | 'end' | 'thing';
  /** Only for one who moves a lot (a lively one). */
  lively?: true;
}

/** How a speaker acts what their line does. */
export function speakerMoves(read: LineRead): SpeakerMove[] {
  const key = (move: PerformMove, toward: SpeakerMove['toward'] = 'them') => ({
    move,
    toward,
    on: 'key' as const,
  });
  switch (read.aim) {
    case 'asks':
      return [key('gesture')];
    case 'refuses':
      return [key('shake', null), key('palm-out')];
    case 'warns':
      return [key('wag-finger')];
    case 'threatens':
      return [key('fist'), { move: 'step-in', toward: 'them', on: 'start' }];
    case 'accuses':
      return [key('point'), { move: 'step-in', toward: 'them', on: 'start' }];
    case 'begs':
      return [key('plead')];
    case 'teases':
      return [key('point'), { move: 'laugh', toward: null, on: 'end' }];
    case 'jokes':
      return [key('gesture'), { move: 'brows', toward: null, on: 'end' }];
    case 'orders':
      return [read.thing ? key('point', 'thing') : key('palm-out')];
    case 'comforts':
      return [key('reach'), { move: 'step-in', toward: 'them', on: 'start' }];
    case 'praises':
      return [
        { move: 'clap', toward: null, on: 'key', lively: true },
        key('gesture'),
      ];
    case 'confesses':
      return [key('hand-chest', null)];
    case 'reveals':
      return [read.thing ? key('point', 'thing') : key('gesture')];
    case 'bargains':
      return [
        key('gesture'),
        { move: 'gesture-left', toward: null, on: 'end' },
      ];
    case 'dodges':
      return [key('shrug', null)];
    case 'gives':
    case 'takes':
      return [key('reach')];
    case 'shows':
      return [read.thing ? key('point', 'thing') : key('gesture')];
    case 'greets':
      return [{ move: 'wave', toward: 'them', on: 'start' }];
    case 'agrees':
      return [key('nod', null)];
    default:
      return [key('gesture')];
  }
}

/** How someone hearing a line reacts, and the face they react with. */
export interface Reaction {
  move: PerformMove | null;
  face: FigureFace | null;
  /** Their eyes go somewhere else a moment: down (guilty, hurt), up (an eye-roll). */
  glance?: '@down' | '@up';
  /** A step back (fear, hurt) or in (warmth). */
  step?: 'step-back' | 'step-in';
}

/** What one is like, as reacting goes: proud (rolls their eyes), shy (looks down), lively (bigger). */
export interface Temper {
  proud: boolean;
  shy: boolean;
  lively: boolean;
}

const PROUD =
  /\b(?:proud|bossy|grumpy|stern|serious|sarcastic|cool|vain|haughty|smug|stubborn|boastful)\b/iu;
const SHY =
  /\b(?:shy|timid|nervous|meek|quiet|anxious|guilty|worried|cautious|gentle)\b/iu;
const LIVELY =
  /\b(?:playful|lively|cheerful|excited|energetic|cheeky|bubbly|bouncy|funny|silly|chatty|boisterous)\b/iu;

/** Someone's temper, from the words the story uses of them. */
export function temperOf(traits: readonly string[]): Temper {
  const all = traits.join(' ');
  return {
    proud: PROUD.test(all),
    shy: SHY.test(all),
    lively: LIVELY.test(all),
  };
}

/** How the one a line is said to reacts to it, in character. */
export function reactionTo(aim: LineAim, temper: Temper): Reaction {
  switch (aim) {
    case 'jokes':
      return temper.proud
        ? { move: 'shake', face: 'neutral', glance: '@up' }
        : { move: 'laugh', face: 'happy' };
    case 'teases':
      return temper.proud
        ? { move: 'shake', face: 'angry', glance: '@up' }
        : temper.shy
          ? { move: 'take', face: 'sad', glance: '@down' }
          : { move: 'take', face: 'angry' };
    case 'threatens':
      return { move: 'flinch', face: 'afraid', step: 'step-back' };
    case 'warns':
      return { move: 'flinch', face: 'afraid' };
    case 'accuses':
      return temper.shy
        ? { move: 'take', face: 'afraid', glance: '@down', step: 'step-back' }
        : { move: 'take', face: 'surprised' };
    case 'refuses':
      return temper.shy
        ? { move: null, face: 'sad', glance: '@down', step: 'step-back' }
        : { move: 'take', face: 'sad' };
    case 'confesses':
    case 'reveals':
      return { move: 'take', face: 'surprised' };
    case 'begs':
      return { move: 'brows', face: 'thinking' };
    case 'comforts':
      return { move: 'nod', face: 'happy', step: 'step-in' };
    case 'praises':
      return temper.shy
        ? { move: 'nod', face: 'happy', glance: '@down' }
        : { move: temper.lively ? 'hop' : 'nod', face: 'happy' };
    case 'greets':
    case 'gives':
      return { move: 'nod', face: 'happy' };
    case 'asks':
    case 'bargains':
      return { move: 'brows', face: 'thinking' };
    case 'shows':
      return { move: 'brows', face: 'surprised' };
    case 'dodges':
      return { move: 'brows', face: 'thinking' };
    case 'orders':
    case 'agrees':
    case 'takes':
      return { move: 'nod', face: null };
    default:
      return { move: 'nod', face: null };
  }
}

/** When a move starts so that its fullest moment falls at `at`, not before `least`. */
export function startFor(
  move: PerformMove,
  ms: number,
  at: number,
  least = -Infinity,
): number {
  return Math.round(Math.max(least, at - PEAK_AT[move] * ms));
}

// ── Faces worn a moment: a reaction over the face they had ─────────────────

/** A face worn a moment over the one someone has: who, from when, which, how long. */
export type FeltFace = [
  who: string,
  atMs: number,
  face: FigureFace,
  ms: number,
];

/**
 * Face changes for reactions, over a scene's faces as they already are
 * (one at a time, a hide of the one worn and a show of the next): each
 * reaction's face shown at its moment and the one worn before given back
 * after it, or as the next change of theirs comes, whichever is first.
 * A reaction with the face they already wear, or one their drawing has
 * not got, changes nothing. New effects only.
 */
export function feltEffects<
  E extends {
    atMs: number;
    target: string;
    part: string | null;
    do: string;
  },
>(
  effects: readonly E[],
  felt: readonly FeltFace[],
  faces: ReadonlySet<string>,
  has: (id: string, face: string) => boolean,
): { atMs: number; target: string; part: string; do: 'show' | 'hide' }[] {
  const out: {
    atMs: number;
    target: string;
    part: string;
    do: 'show' | 'hide';
  }[] = [];
  const changes = (who: string) =>
    effects
      .filter(
        (e) =>
          e.target === who &&
          e.do === 'show' &&
          e.part !== null &&
          faces.has(e.part),
      )
      .sort((a, b) => a.atMs - b.atMs);
  const taken: { who: string; from: number; to: number }[] = [];
  for (const [who, at, face, ms] of [...felt].sort((a, b) => a[1] - b[1])) {
    if (!has(who, face)) continue;
    if (
      taken.some((one) => one.who === who && at < one.to && at + ms > one.from)
    )
      continue;
    const list = changes(who);
    const worn = [...list].reverse().find((e) => e.atMs <= at)?.part;
    if (!worn || worn === face) continue;
    const next = list.find((e) => e.atMs > at)?.atMs ?? Infinity;
    const until = Math.min(at + ms, next - 1);
    if (until - at < 400) continue;
    taken.push({ who, from: at, to: until });
    out.push(
      { atMs: Math.round(at), target: who, part: worn, do: 'hide' },
      { atMs: Math.round(at), target: who, part: face, do: 'show' },
      { atMs: Math.round(until), target: who, part: face, do: 'hide' },
      { atMs: Math.round(until), target: who, part: worn, do: 'show' },
    );
  }
  return out;
}

// ── Faces of moving parts: what a line is said with, and felt ──────────────

/** The face a line's aim is said with, in someone's temper (the rigged face's recipes): null where the line does nothing to a face. */
export function recipeOfAim(aim: LineAim, temper: Temper): FaceRecipe | null {
  switch (aim) {
    case 'asks':
      return temper.proud ? 'sceptical' : 'curious';
    case 'refuses':
      return temper.shy ? 'worried' : temper.proud ? 'annoyed' : 'determined';
    case 'warns':
      return 'worried';
    case 'threatens':
      return temper.lively ? 'furious' : 'angry';
    case 'accuses':
      return temper.shy ? 'annoyed' : 'angry';
    case 'begs':
      return 'pleading';
    case 'confesses':
      return temper.proud ? 'embarrassed' : 'guilty';
    case 'comforts':
    case 'gives':
      return 'tender';
    case 'praises':
      return temper.lively ? 'delight' : 'joy';
    case 'teases':
      return temper.lively && !temper.proud ? 'amused' : 'smug';
    case 'jokes':
      return 'amused';
    case 'bargains':
      return 'smug';
    case 'dodges':
      return 'amused';
    case 'reveals':
      return temper.lively ? 'delight' : 'surprise';
    case 'shows':
      return temper.proud ? 'smug' : 'curious';
    case 'greets':
    case 'takes':
      return 'joy';
    case 'agrees':
      return 'relieved';
    case 'orders':
      return 'determined';
    default:
      return null;
  }
}

/** Faces that are a low face sharpened, not a mask over it: said over sadness or anger as they are. */
const KEEPS_LOW: ReadonlySet<string> = new Set([
  'determined',
  'pleading',
  'sceptical',
  'suspicious',
  'exasperated',
]);

/** How a line is said and felt: the recipe on the face, the one beneath it, and how it comes on. */
export interface LineFace {
  said: FaceRecipe;
  felt: FaceRecipe | null;
  how: FaceHow;
  /** A lie: a flash of what is felt just before it, and the eyes dart. */
  lie: boolean;
}

/**
 * The face a line is said with and what is felt under it (studio-story-
 * plan §3B): what the line does, in the speaker's temper; the face they
 * wear (the sheet's) felt beneath it where the two part ways, so "It's
 * fine" said over sadness smiles with sad eyes, and a warning given in
 * fear is a brave face over frightened eyes. A dodge is a lie: an
 * innocent smile over guilt (a shy one's, fear). A threat or an
 * accusation burns slowly over the line. `said` and `felt`: the sheet's
 * own words for them, where it gave them.
 */
export function lineFace(
  read: Pick<LineRead, 'aim'>,
  temper: Temper,
  worn: string | null,
  own: { said?: string | null; felt?: string | null } = {},
): LineFace | null {
  const wornRecipe = worn ? (RECIPE_OF_FACE[worn] ?? null) : null;
  const aimed = recipeOfAim(read.aim, temper);
  const said = (own.said as FaceRecipe | undefined) ?? aimed ?? wornRecipe;
  if (!said || said === 'neutral') return null;
  const how: FaceHow =
    read.aim === 'threatens' || read.aim === 'accuses' ? 'slow' : 'ease';
  if (own.felt)
    return {
      said,
      felt: own.felt as FaceRecipe,
      how,
      lie: GLAD_RECIPES.has(said) && LOW_RECIPES.has(own.felt),
    };
  if (read.aim === 'dodges')
    return { said, felt: temper.shy ? 'fear' : 'guilty', how, lie: true };
  // The face they wear beneath, where what they say is its opposite.
  const masks =
    wornRecipe &&
    wornRecipe !== said &&
    ((GLAD_RECIPES.has(said) && LOW_RECIPES.has(wornRecipe)) ||
      (said === 'determined' &&
        (wornRecipe === 'fear' || wornRecipe === 'sad')));
  // Said as it is felt: the sheet's low face, where the aim's face is no
  // sharper form of it (an angry "Who ate my cake?" is asked angrily).
  if (
    !masks &&
    wornRecipe &&
    LOW_RECIPES.has(wornRecipe) &&
    !LOW_RECIPES.has(said) &&
    !KEEPS_LOW.has(said)
  )
    return { said: wornRecipe, felt: null, how, lie: false };
  return { said, felt: masks ? wornRecipe : null, how, lie: false };
}

/** How someone hearing a line takes it, on the rigged face: a recipe, where their eyes go a moment, and how it comes on. */
export interface ReactionFace {
  recipe: FaceRecipe;
  glance?: '@up' | '@down';
  how: FaceHow;
}

/** For each aim, the faces a listener may take it with, by temper: picked among so no one pulls the same face twice running. */
const TAKEN: Partial<
  Record<
    LineAim,
    {
      proud?: ReactionFace[];
      shy?: ReactionFace[];
      lively?: ReactionFace[];
      any: ReactionFace[];
    }
  >
> = (() => {
  const f = (
    recipe: FaceRecipe,
    how: FaceHow = 'ease',
    glance?: '@up' | '@down',
  ): ReactionFace => (glance ? { recipe, how, glance } : { recipe, how });
  return {
    jokes: {
      proud: [f('exasperated', 'ease', '@up'), f('bored'), f('sceptical')],
      shy: [f('amused'), f('shy', 'ease', '@down')],
      lively: [f('delight', 'take'), f('amused')],
      any: [f('amused'), f('joy'), f('delight')],
    },
    teases: {
      proud: [
        f('annoyed', 'slow'),
        f('exasperated', 'ease', '@up'),
        f('sceptical'),
      ],
      shy: [
        f('embarrassed', 'take', '@down'),
        f('shy', 'ease', '@down'),
        f('sad'),
      ],
      any: [f('annoyed', 'take'), f('sceptical'), f('smug')],
    },
    threatens: {
      proud: [f('sceptical'), f('determined'), f('annoyed')],
      shy: [f('terror', 'take'), f('fear', 'take')],
      any: [f('fear', 'take'), f('worried'), f('shock', 'take')],
    },
    warns: {
      proud: [f('sceptical'), f('annoyed')],
      any: [f('worried', 'take'), f('fear', 'take'), f('surprise', 'take')],
    },
    accuses: {
      proud: [f('furious', 'take'), f('annoyed', 'take'), f('shock', 'take')],
      shy: [
        f('guilty', 'take', '@down'),
        f('embarrassed', 'take', '@down'),
        f('fear', 'take'),
      ],
      any: [
        f('shock', 'take'),
        f('surprise', 'take'),
        f('guilty', 'take', '@down'),
      ],
    },
    refuses: {
      proud: [f('annoyed', 'take'), f('sceptical'), f('furious', 'slow')],
      shy: [f('heartbroken', 'ease', '@down'), f('sad', 'ease', '@down')],
      any: [f('sad', 'take'), f('annoyed', 'take'), f('pleading')],
    },
    confesses: {
      proud: [f('furious', 'take'), f('annoyed', 'take'), f('sceptical')],
      any: [f('shock', 'take'), f('sad'), f('annoyed', 'take')],
    },
    reveals: {
      any: [f('shock', 'take'), f('surprise', 'take'), f('delight', 'take')],
    },
    begs: {
      proud: [f('sceptical'), f('smug'), f('thinking')],
      shy: [f('worried'), f('tender')],
      any: [f('thinking'), f('tender'), f('sceptical')],
    },
    comforts: {
      shy: [f('shy', 'ease', '@down'), f('relieved')],
      any: [f('relieved'), f('tender'), f('joy')],
    },
    praises: {
      proud: [f('proud'), f('smug')],
      shy: [f('shy', 'ease', '@down'), f('embarrassed', 'ease', '@down')],
      lively: [f('delight', 'take'), f('joy')],
      any: [f('joy'), f('proud'), f('tender')],
    },
    greets: { any: [f('joy'), f('delight'), f('tender')] },
    gives: { any: [f('delight', 'take'), f('joy'), f('tender')] },
    asks: {
      proud: [f('sceptical'), f('smug')],
      any: [f('thinking'), f('confused'), f('curious')],
    },
    bargains: {
      proud: [f('sceptical'), f('smug')],
      any: [f('thinking'), f('suspicious'), f('curious')],
    },
    shows: { any: [f('surprise', 'take'), f('curious'), f('delight', 'take')] },
    dodges: { any: [f('suspicious'), f('sceptical'), f('annoyed')] },
    orders: {
      proud: [f('annoyed'), f('exasperated', 'ease', '@up')],
      any: [f('determined'), f('worried')],
    },
  };
})();

/**
 * The face someone takes a line with, in character, varied: of the faces
 * their temper takes that aim with, one picked by `pick` (0 to 1, stable
 * for the line and the listener), never `last` (the face they took the
 * line before with) when there is another. So a proud one rolls their
 * eyes at one joke and looks bored at the next. Null where a line leaves
 * the face be.
 */
export function reactionFace(
  aim: LineAim,
  temper: Temper,
  pick: number,
  last: string | null = null,
): ReactionFace | null {
  const one = TAKEN[aim];
  if (!one) return null;
  const list =
    (temper.proud && one.proud) ||
    (temper.shy && one.shy) ||
    (temper.lively && one.lively) ||
    one.any;
  const open = list.filter((r) => r.recipe !== last);
  const from = open.length ? open : list;
  return from[Math.min(from.length - 1, Math.floor(pick * from.length))];
}

/** A stable pick for a listener and a line: which of their faces they take it with. */
export const reactionPick = (who: string, line: number) =>
  hash01(`react:${who}`, line);

// ── The check: which acting each line got ──────────────────────────────────

/** The moves that are acting for a line, the speaker's: what their body does as they say it. */
const SPEAKER_ACTING: ReadonlySet<string> = new Set([
  'gesture',
  'gesture-left',
  'point',
  'point-up',
  'reach',
  'wave',
  'nod',
  'shake',
  'shrug',
  'clap',
  'laugh',
  'hop',
  'lean-in',
  'hug',
  'palm-out',
  'plead',
  'fist',
  'wag-finger',
  'hand-chest',
  'step-in',
  'sob',
]);
/** The moves a listener reacts with. */
export const REACTION_MOVES: ReadonlySet<string> = new Set([
  'flinch',
  'take',
  'laugh',
  'nod',
  'brows',
  'shake',
  'hop',
  'lean',
  'step-back',
  'step-in',
]);
/** The aims whose thing, when the line names one, is pointed to. */
const POINTS_AT_THING: ReadonlySet<LineAim> = new Set([
  'shows',
  'orders',
  'reveals',
  'asks',
  'takes',
]);
/** How near its key word a move's fullest moment is to count as timed to it. */
export const ON_KEY_MS = 350;

/** A line of a made scene, as the check reads its acting. */
export interface LineActed {
  /** Its index among the scene's beats. */
  beat: number;
  speaker: string;
  text: string;
  aim: LineAim;
  keyWord: string;
  /** The speaker's moves while they say it. */
  moves: string[];
  /** One of them is what the line's aim is acted with. */
  matches: boolean;
  /** One of them is fullest within ON_KEY_MS of its key word. */
  onKey: boolean;
  /** They look at whom they speak to (or at what it names). */
  looks: boolean;
  /** Someone hearing it reacts with a move before the next line. */
  reacted: string[];
}

/**
 * For each line said by someone on the stage in a made scene, what acting
 * happened: the speaker's moves, whether one is what the line does and
 * timed to its key word, whether they look at whom it is said to, and who
 * reacted. `aims`: the sheet's aim for a beat, where it gave one.
 */
export function actedLines(
  scene: Pick<SceneDto, 'beats' | 'acting' | 'effects'>,
  aims: ReadonlyMap<number, string> = new Map(),
): LineActed[] {
  const out: LineActed[] = [];
  const says = scene.effects.filter(
    (e) => e.do === 'say' && e.say && !e.say.from,
  );
  scene.beats.forEach((beat, b) => {
    const said = says.find(
      (e) =>
        e.atMs >= beat.startMs - 400 &&
        e.atMs <= beat.endMs &&
        beat.text.includes(e.say!.text.slice(0, 12)),
    );
    if (!said || !beat.words.length) return;
    const speaker = said.target;
    const acting = scene.acting?.[speaker];
    if (!acting) return;
    const words = beat.words.map(([a, z]) => beat.text.slice(a, z));
    const read = readLine(words, { aim: aims.get(b) ?? null });
    const keyAt = beat.words[read.key][2];
    const from = beat.startMs - 400;
    const to = beat.endMs + 400;
    const moves = (acting.moves ?? []).filter(
      ([at, move, ms]) => SPEAKER_ACTING.has(move) && at < to && at + ms > from,
    );
    const wanted = new Set<string>(speakerMoves(read).map((one) => one.move));
    // A thing the line names is pointed to: the check does not know the
    // stage's things, so a point is what such a line may be acted with.
    if (POINTS_AT_THING.has(read.aim)) wanted.add('point');
    const peak = (move: string, at: number, ms: number) =>
      at + (PEAK_AT[move as PerformMove] ?? 0.2) * ms;
    const matches = moves.some(([, move]) => wanted.has(move));
    const onKey = moves.some(
      ([at, move, ms]) => Math.abs(peak(move, at, ms) - keyAt) <= ON_KEY_MS,
    );
    const looks = (acting.look ?? []).some(
      ([at, target], k, list) =>
        target !== null &&
        !target.startsWith('@') &&
        at < beat.endMs &&
        (list[k + 1]?.[0] ?? Infinity) > beat.startMs,
    );
    const next = scene.beats[b + 1]?.startMs ?? beat.endMs + 2500;
    const reacted = Object.entries(scene.acting ?? {}).flatMap(([id, one]) =>
      id === speaker
        ? []
        : (one.moves ?? [])
            .filter(
              ([at, move]) =>
                REACTION_MOVES.has(move) && at >= beat.startMs && at < next,
            )
            .map(([, move]) => `${id}:${move}`),
    );
    out.push({
      beat: b,
      speaker,
      text: beat.text,
      aim: read.aim,
      keyWord: words[read.key] ?? '',
      moves: moves.map(([, move]) => move),
      matches,
      onKey,
      looks,
      reacted,
    });
  });
  return out;
}

/**
 * What on a film's stage its lines may name, and where a look at it goes:
 * each feature of the set (at "f:<id>", by its name and its kind), and
 * each thing there, at whoever holds it or has it before them as the
 * scene opens (by its name, its id's words). A thing with no one by it is
 * left out: there is nowhere yet to look.
 */
export function nameableThings(script: {
  features?: readonly { id: string; name: string; kind: string }[];
  props?: readonly string[];
  propsHeld?: Partial<Record<string, { by: string }>>;
  propsNear?: Partial<Record<string, string>>;
  ownThings?: readonly { id: string; name: string }[];
}): NameableThing[] {
  const wordsOf = (...names: string[]) => [
    ...new Set(
      names
        .flatMap((name) => name.toLowerCase().split(/[\s_-]+/))
        .map(bare)
        .filter((w) => w.length > 2 && !SMALL.test(w)),
    ),
  ];
  const out: NameableThing[] = [];
  for (const feature of script.features ?? []) {
    const name = feature.name.toLowerCase().split(/\s+/);
    out.push({
      aim: `f:${feature.id}`,
      // The last word of its name is what it is: "the old gate", a gate.
      words: wordsOf(name[name.length - 1] ?? '', feature.kind),
      id: `f:${feature.id}`,
    });
  }
  for (const prop of script.props ?? []) {
    const by = script.propsHeld?.[prop]?.by ?? script.propsNear?.[prop];
    if (!by) continue;
    const own = script.ownThings?.find((one) => one.id === prop)?.name;
    const name = (own ?? prop).toLowerCase().split(/\s+/);
    out.push({
      aim: by,
      words: wordsOf(name[name.length - 1] ?? prop),
      id: prop,
    });
  }
  return out;
}

/** What the shot grammar reads of a line (scene-shots' GrammarLine): what it does, whether it lands, whether it says a want. */
export function grammarRead(
  say: string,
  /** The writer's own aim for it, where they gave one: it wins over the words. */
  aim?: string | null,
): {
  aim: LineAim;
  lands: boolean;
  want: boolean;
} {
  const read = readLine(say.split(/\s+/).filter(Boolean), {
    aim: aim ?? null,
  });
  return { aim: read.aim, lands: read.lands, want: read.want };
}

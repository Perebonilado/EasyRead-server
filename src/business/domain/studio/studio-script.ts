/**
 * The whole script as a story (studio-story-plan §1.5, §1.6, §3F; S3 and
 * S4): what code sees across the scenes once they are written, and the
 * table read, a critic's read of the whole script against a rubric.
 *
 * Code checks four things the scene checks cannot, each a note for the
 * scene it is about:
 * - voice: lines any character could have said (stock lines, a pet
 *   phrase in the wrong mouth, a speaker who never sounds like their
 *   sheet, a long line from someone who talks in short ones);
 * - telling: lines that narrate what the viewer sees ("Unlocked.",
 *   "Door's locked.", "I'm opening the box"), the narrator by another name;
 * - plants: what the beat sheet plants and pays off is in the words of
 *   the scenes that serve those beats;
 * - turns: each scene's planned turn shows in what is said and done.
 *
 * The table read scores the rubric from 0 to 10 with notes for each
 * scene; below the bar, the failing scenes are written again with their
 * notes. Its first item is clarity, judged from a first-time viewer's cold
 * read of the first scene as the film shows it (never from the plan): a
 * film they cannot follow is below the bar, whatever else it does well.
 * Nothing of it is said to the maker.
 */
import type {
  LineAim,
  SheetBeat,
  SheetInsert,
  StorySheet,
  StudioBible,
  StudioCharacter,
  StudioOutline,
} from './studio';
import { namesOf, thingNamed } from './studio';
import {
  contextOf,
  covered,
  stemOf,
  stemsOf,
  trackSetups,
  type Premise,
  type Persona,
  type SetupPart,
  type StoryLink,
  type StudioStory,
  type TrackedPlant,
} from './studio-story';
import { quietItem, quietRuns, timeQuiet } from './studio-stage';
import { looksOf } from './studio-words';

// ── The rubric ────────────────────────────────────────────────────────────

/** The table read's rubric (§1.6), with the production checks (§3F). */
export const RUBRIC = [
  {
    key: 'clarity',
    name: 'Clarity',
    test: 'a first-time viewer, who only sees and hears the film, could say after scene 1 what it is about, who wants what, what stands in the way and what is at stake (and by when, if there is a clock); judged by what the first-time viewer said, never by the plan',
  },
  {
    key: 'want',
    name: 'Clear want and stakes',
    test: 'by the end of the first scene we know what the hero wants and what is at risk',
  },
  {
    key: 'escalation',
    name: 'Escalation',
    test: 'each attempt is harder or costs more',
  },
  {
    key: 'turn',
    name: 'A real turn',
    test: 'something changes the direction; not just more of the same',
  },
  {
    key: 'choice',
    name: "The hero's choice",
    test: 'the climax is decided by what the hero does, not by luck or a grown-up',
  },
  {
    key: 'setups',
    name: 'Setups and payoffs',
    test: 'every plant pays off; nothing comes from nowhere',
  },
  {
    key: 'character',
    name: 'Character',
    test: 'each character acts and speaks like their sheet; the flaw shows; someone changes',
  },
  {
    key: 'dialogue',
    name: 'Dialogue',
    test: 'lines are specific to the speaker, with subtext; no speeches; no one explains their feelings outright',
  },
  {
    key: 'heart',
    name: 'Humour or heart',
    test: 'moments that land for the tone (laughs for a comedy, warmth for a gentle story, chills for a spooky one)',
  },
  {
    key: 'narration',
    name: 'Narration',
    test: "within the maker's narrator setting; the characters carry the story",
  },
  {
    key: 'show',
    name: "Show, don't tell",
    test: 'what the stage can show (actions, faces, things) is shown, not narrated or explained',
  },
  {
    key: 'fit',
    name: 'Fit',
    test: 'right for the audience, and within the length',
  },
  {
    key: 'hook',
    name: 'A hook',
    test: 'it opens with a hook: a joke, a mystery or a problem in the first seconds',
  },
  {
    key: 'build',
    name: 'A build',
    test: 'a clear build to the climax: the scenes climb toward it',
  },
  {
    key: 'low',
    name: 'A low point',
    test: 'a moment it seems lost (or, in a very short film, a clear moment of doubt) before the climax',
  },
  {
    key: 'today',
    name: 'Why today',
    test: "the viewer can tell why today is different from the hero's ordinary day: the ordinary day is seen, then it breaks",
  },
  {
    key: 'care',
    name: 'We care',
    test: "something in the first scene puts us on the hero's side: something they do, a small kindness, a small unfairness done to them",
  },
  {
    key: 'button',
    name: 'A button',
    test: 'it ends on a button: a last laugh or a warm beat, not a summary or a moral said out loud (unless the maker asked for a moral)',
  },
] as const;
export type RubricKey = (typeof RUBRIC)[number]['key'];
export const RUBRIC_KEYS: RubricKey[] = RUBRIC.map((r) => r.key);

/**
 * The bar a script must clear, calibrated on the story bench: its
 * overall score, every rubric item, and each scene's own. Below it, the
 * failing scenes are written again.
 */
export const BAR = { overall: 7, item: 5, scene: 6, clarity: 7 } as const;
/** A first-time viewer confused by this many things or more finds the film unclear, whatever its score. */
export const CONFUSED_MOST = 2;
/**
 * Rounds of rewrites at most, after the first read: none (Richard,
 * 2026-09-30, "Cut the rewrites"): the read scores the script for the
 * log, and the script is ready as written. 2 was the old way; the
 * worker's STUDIO_TABLEREAD_ROUNDS sets it again.
 */
export const TABLE_READ_ROUNDS = 0;

/** One scene as the table read found it. */
export interface SceneRead {
  /** Which scene, from 0. */
  scene: number;
  score: number;
  /** Whether the critic scored it; one it left out has the overall, and is never sent back for it. */
  given: boolean;
  /** Specific notes for its writer; empty for none. */
  notes: string[];
}

/** A line the critic heard as anyone's. */
export interface VoiceSlip {
  scene: number;
  who: string;
  line: string;
  why: string;
}

/** The table read: the rubric's scores, the overall, and notes scene by scene. */
export interface TableRead {
  scores: Partial<Record<RubricKey, number>>;
  overall: number;
  scenes: SceneRead[];
  voice: VoiceSlip[];
  /** A sentence or two, for the log. */
  verdict: string;
  /** What a first-time viewer made of the first scene, as the film shows it; null where no one watched. */
  viewer: ColdRead | null;
  /** What code found the viewer got wrong against the premise (the clarity sentence, T1): any one puts the film below the clarity floor. */
  misses: string[];
  /** What else they could not tell (who someone is, the clock, the impossible thing's rule): counted with their own confusions. */
  unsure: string[];
  /** The viewer's confusions that count against it (countedConfusions); absent on a read made before they were told apart. */
  confused?: string[];
  /** Clarity as the critic scored it, before any floor code put under it; absent where it gave none. */
  clarityGiven?: number;
}

/**
 * What a first-time viewer made of the film's opening, seeing and hearing
 * only what the film shows: never the plan, the logline or the names no
 * one says.
 */
export interface ColdRead {
  /** What they think it is about, in a sentence. */
  about: string;
  /** The clarity sentence, as they finish it: "[who] wants [what] because [why], but [what is in the way], by [when]". */
  sentence: string;
  /** Whose story it is, as they saw them. */
  who: string;
  wants: string;
  obstacle: string;
  stakes: string;
  /** By when, where there is a clock; empty for none seen. */
  clock: string;
  /** What they did not understand: what stopped them following who wants what, and why. */
  confused: string[];
  /** What they want to find out: the questions the film means them to ask (what happens next, a mystery's answer, how a trick works). Never counted against it. */
  wondering: string[];
  /** How sure they are of what it is about, 0 to 10. */
  sure: number;
  /** Who is who (T3): each person they saw, and what they are to the hero, or "could not tell". */
  people: { who: string; is: string }[];
  /** Anything impossible they saw, and its rules as they understood them (T4); empty for nothing. */
  impossible: string;
}

const score = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n)
    ? null
    : Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
};
const said = (value: unknown, most: number) =>
  typeof value === 'string' ? value.trim().slice(0, most) : '';

/** A cold read made sound; null for nothing usable. */
export function coldReadOf(raw: unknown): ColdRead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const about = said(r.about, 300);
  if (!about) return null;
  return {
    about,
    sentence: said(r.sentence, 300),
    who: said(r.who, 200),
    wants: said(r.wants, 200),
    obstacle: said(r.obstacle, 200),
    stakes: said(r.stakes, 200),
    clock: said(r.clock, 120),
    confused: (Array.isArray(r.confused) ? r.confused : [])
      .map((c) => said(c, 200))
      .filter(Boolean)
      .slice(0, 6),
    wondering: (Array.isArray(r.wondering) ? r.wondering : [])
      .map((c) => said(c, 200))
      .filter(Boolean)
      .slice(0, 6),
    sure: score(r.sure) ?? 0,
    people: (Array.isArray(r.people) ? r.people : [])
      .flatMap((one: unknown) => {
        if (!one || typeof one !== 'object') return [];
        const p = one as Record<string, unknown>;
        const who = said(p.who, 120);
        return who ? [{ who, is: said(p.is, 200) }] : [];
      })
      .slice(0, 8),
    impossible: said(r.impossible, 300),
  };
}

/** A cold read in words, for the table read and the writer. */
export function describeColdRead(viewer: ColdRead): string {
  return [
    `About: ${viewer.about}`,
    ...(viewer.sentence ? [`In one sentence: ${viewer.sentence}`] : []),
    `Whose story: ${viewer.who || 'could not tell'}`,
    `Wants: ${viewer.wants || 'could not tell'}`,
    `In the way: ${viewer.obstacle || 'could not tell'}`,
    `At stake: ${viewer.stakes || 'could not tell'}`,
    `By when: ${viewer.clock || 'no clock seen'}`,
    `Confused by: ${viewer.confused.join('; ') || 'nothing'}`,
    ...(viewer.wondering.length
      ? [
          `Wants to find out (the film's own questions, not confusion): ${viewer.wondering.join('; ')}`,
        ]
      : []),
    ...(viewer.people.length
      ? [
          `Who is who: ${viewer.people.map((p) => `${p.who}: ${p.is || 'could not tell'}`).join('; ')}`,
        ]
      : []),
    ...(viewer.impossible ? [`Anything impossible: ${viewer.impossible}`] : []),
    `How sure (0 to 10): ${viewer.sure}`,
  ].join('\n');
}

/** A slot the viewer left open, or words that only hedge. */
const COULD_NOT =
  /could ?n[o']?t tell|cannot tell|can['’]t tell|not sure|unclear|unknown|don['’]?t know|no idea|nothing|^none\b|^n\/a$|^-$/iu;
const COULD_NOT_ALL = new RegExp(COULD_NOT.source, 'giu');
/** A guess, not an answer: "possibly a friend", "a rival or a friend". */
const HEDGED =
  /\b(?:possibly|maybe|perhaps|probably|might be|could be|seems? to be)\b[^,;)]*|\b[\p{L}-]+ or (?:an? )?[\p{L}-]+\b/giu;
/**
 * Whether the viewer left a slot open: nothing, or "could not tell" with
 * nothing but a guess beside it. "Could not tell (the opponent in the
 * bet)" is an answer; "a stranger or a friend, could not tell" is not.
 */
const couldNot = (said: string) => {
  const t = said.trim();
  if (!t) return true;
  if (!COULD_NOT.test(t)) return false;
  return !stemsOf(t.replace(COULD_NOT_ALL, ' ').replace(HEDGED, ' ')).length;
};
/** A name as a whole word in some words. */
const wordIn = (name: string, said: string) =>
  new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'iu').test(
    said,
  );

// ── Words alike: the gist of a want, an obstacle, a stake ─────────────────

/** Stems every want or obstacle has, which say nothing of what this one is ("get back", "the table inside"). */
const EVERYDAY = new Set([
  'get',
  'got',
  'make',
  'mak',
  'take',
  'tak',
  'go',
  'com',
  'come',
  'back',
  'want',
  'need',
  'try',
  'tri',
  'keep',
  'find',
  'see',
  'thing',
  'way',
  'place',
  'time',
  'day',
  'table',
  'inside',
  'outside',
  'whole',
  'can',
  'will',
  'must',
  'would',
  'could',
  'should',
  'let',
  'put',
  'give',
  'giv',
  'even',
  'more',
  'own',
  'still',
  // A question's own words: "why", "whether", "exactly".
  'why',
  'whether',
  'exact',
  // What is left of "doesn't", "can't" once split.
  'doesn',
  'don',
  'didn',
  'isn',
  'wasn',
  'aren',
  'won',
  'couldn',
  'wouldn',
]);
/** Words that say the same thing, as one ("eyesight" is "eye", "flat" is "home"). Stems as stemOf leaves them. */
const SAME_AS: Record<string, string> = {
  eyesight: 'eye',
  sight: 'eye',
  blind: 'eye',
  vision: 'eye',
  apartment: 'home',
  flat: 'home',
  house: 'home',
  mum: 'mother',
  mom: 'mother',
  mama: 'mother',
  mamita: 'mother',
  mommy: 'mother',
  dad: 'father',
  daddy: 'father',
  papa: 'father',
  grandma: 'grandmother',
  granny: 'grandmother',
  gran: 'grandmother',
  nana: 'grandmother',
  grandpa: 'grandfather',
  grandad: 'grandfather',
  granddad: 'grandfather',
  kid: 'child',
  children: 'child',
  afraid: 'fear',
  frighten: 'fear',
  error: 'mistake',
  cash: 'money',
  latch: 'lock',
};
/** Stems as their gist: the everyday ones left out, words that say the same made one. */
const gistStems = (stems: readonly string[]): string[] => [
  ...new Set(stems.filter((w) => !EVERYDAY.has(w)).map((w) => SAME_AS[w] ?? w)),
];
/** What some words are about, stemmed: never their little or everyday words, nor the names given. */
export const gistOf = (said: string, names: ReadonlySet<string> = new Set()) =>
  gistStems(stemsOf(said, names));
/** A premise's part in its clauses: "his failing eyes and her fear of mistakes" is two. */
const clausesOf = (text: string) =>
  text
    .split(/[;,:—–]|\b(?:and|or|but|who|which|when|before|until|so)\b/iu)
    .map((c) => c.trim())
    .filter(Boolean);

/**
 * Whether some words (their gist) give a premise's part in other words:
 * enough of its gist (`least`), or most of one of its clauses. "Poor
 * eyesight and inexperience" gives "his failing eyes and her fear of
 * mistakes": one clause of it, said another way.
 */
export function conveys(
  part: string,
  said: readonly string[],
  names: ReadonlySet<string> = new Set(),
  least = 0.3,
): boolean {
  const whole = gistOf(part, names);
  if (!whole.length) return false;
  if (covered(whole, said) >= least) return true;
  return clausesOf(part).some((clause) => {
    const gist = gistOf(clause, names);
    return gist.length >= 2 && covered(gist, said) >= 0.5;
  });
}

/**
 * The want's own nouns: its words the premise leans on again for why
 * today, what is at stake, the clock or the title ("rent" in "the rent
 * envelope on the table inside her locked apartment", when the rent is
 * due tonight). Any one of them said or shown gives the want.
 */
export function wantWords(
  premise: Pick<Premise, 'want' | 'whyToday' | 'stakes' | 'clock' | 'title'>,
  names: ReadonlySet<string> = new Set(),
): string[] {
  const again = gistOf(
    [premise.whyToday, premise.stakes, premise.clock, premise.title]
      .filter(Boolean)
      .join(' '),
    names,
  );
  return gistOf(premise.want, names).filter((w) => covered([w], again) > 0);
}

// ── Who the viewer meant ──────────────────────────────────────────────────

/** The cast as a first-time viewer met them in the scenes they watched: who was never named (and by what label), and who spoke. */
export interface CastSeen {
  /** Each character no one named, by id: the label the viewer knew them by ("UNNAMED 2"). */
  labels: ReadonlyMap<string, string>;
  /** Everyone who said a line, from the stage or from off it. */
  speakers: ReadonlySet<string>;
}

/**
 * Which of the cast the viewer means by some words: one named, or known by
 * the label the film gave them ("UNNAMED 2"), else the one whose looks the
 * words describe ("the girl with braids and a pink t-shirt"). Null for
 * none, or for words that fit two alike.
 */
function castMeant(
  said: string,
  bible: Pick<StudioBible, 'characters'>,
  seen?: CastSeen,
  first?: string,
): string | null {
  const named = bible.characters.filter(
    (c) =>
      namesOf(c).some((n) => wordIn(n, said)) ||
      (seen?.labels.get(c.id) && wordIn(seen.labels.get(c.id)!, said)),
  );
  if (named.length) return (named.find((c) => c.id === first) ?? named[0]).id;
  const words = stemsOf(said.replace(/\bunnamed \d+\b/giu, ' '));
  const fits = bible.characters
    .map((c) => ({
      id: c.id,
      n: stemsOf(looksOf(c) ?? '').filter((w) => words.includes(w)).length,
    }))
    .sort((a, b) => b.n - a.n);
  return fits[0] && fits[0].n >= 2 && (fits[1]?.n ?? 0) < fits[0].n
    ? fits[0].id
    : null;
}

/** A question about who someone is to someone: counted once, however many ways it is asked. */
const WHO_IS_WHO =
  /\brelationship\b|\brelated\b|\bknow each other\b|\bto (?:each other|one another|the others?|him|her|them)\b|\bwho (?:\S+ ){1,6}(?:is|are)\b|\bwhat (?:\S+ ){1,6}(?:is|are) to\b|\b(?:daughter|son|sister|brother|cousin|niece|nephew|friend|stranger|hired)\b/iu;
/** A question the film means the viewer to ask: why, how, who did it, whether it will. */
const STORY_QUESTION = /^\s*(?:why|how|who|whether)\b|\b(?:why|how)\b/iu;
/** A question about the film's own telling, not its story: whose the voice-over is. */
const ABOUT_TELLING = /\bvoice-?over\b|\bnarrator\b/iu;

/**
 * The viewer's confusions that count against the film (T5): what stopped
 * them following it. Not a question the story means them to ask at this
 * point (why or how the obstacle works, the mystery's answer, whether the
 * hero will manage it: its words most of them the premise's own); not
 * whose the voice-over is; and who is who asked once, however many ways,
 * and not at all when the "who is who" answers already hold it.
 */
export function countedConfusions(
  viewer: Pick<ColdRead, 'confused'>,
  premise: Premise | null | undefined,
  bible: Pick<StudioBible, 'characters'>,
  whoUnsure = false,
): string[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const story = premise
    ? gistOf(
        [
          premise.want,
          premise.obstacle,
          premise.stakes,
          premise.clock,
          premise.logline,
          premise.hook,
          premise.oddity ? `${premise.oddity.what} ${premise.oddity.rule}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        names,
      )
    : [];
  let whoIsWho = whoUnsure;
  const out: string[] = [];
  for (const item of viewer.confused) {
    if (ABOUT_TELLING.test(item)) continue;
    if (WHO_IS_WHO.test(item)) {
      if (!whoIsWho) out.push(item);
      whoIsWho = true;
      continue;
    }
    const gist = gistOf(item.replace(/\bunnamed \d+\b/giu, ' '), names);
    const theStory =
      STORY_QUESTION.test(item) &&
      (/^\s*whether\b/iu.test(item) ||
        (gist.length > 0 && covered(gist, story) >= 0.5));
    if (!theStory) out.push(item);
  }
  return out;
}

/** An oddity a cartoon takes for granted: animals, toys or robots that talk. A viewer who saw nothing strange in it followed it. */
const TALKING = /\b(?:talk|talks|talking|speak|speaks|speaking)\b/iu;

/**
 * The clarity sentence checked by code against the premise (T1, T3, T4):
 * whose story the viewer took it for, what they said the hero wants and
 * what is in the way. Any of those wrong is a miss, and the film is
 * unclear whatever the model scored. Their words are held to the
 * premise's gist, never its wording: "poor eyesight" is "failing eyes",
 * and UNNAMED 2 is whoever the film showed as UNNAMED 2. What else they
 * could not tell is unsure, counted with their own confusions: the clock;
 * the impossible thing and its rule (never animals that talk, which any
 * cartoon has); who someone the story turns on is to the hero, when they
 * speak (T3). `confused` is their confusions that count (countedConfusions).
 * Nothing for a premise developed before it had its parts.
 */
export function judgeColdRead(
  viewer: ColdRead | null,
  premise: Premise | null | undefined,
  bible: Pick<StudioBible, 'characters'>,
  seen?: CastSeen,
): { misses: string[]; unsure: string[]; confused: string[] } {
  const misses: string[] = [];
  const unsure: string[] = [];
  if (!viewer || !premise || (!premise.want && !premise.obstacle))
    return { misses, unsure, confused: viewer?.confused ?? [] };
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const gist = (said: string) =>
    gistOf(said.replace(/\bunnamed \d+\b/giu, ' '), names);
  const theirWant = gist(`${viewer.wants} ${viewer.sentence}`);
  const gotWant =
    !couldNot(viewer.wants) &&
    (conveys(premise.want, theirWant, names) ||
      covered(gist(viewer.wants), gist(`${premise.want} ${premise.logline}`)) >=
        0.4);
  const hero = bible.characters.find((c) => c.id === premise.hero);
  if (hero) {
    const meant = couldNot(viewer.who)
      ? null
      : castMeant(viewer.who, bible, seen, hero.id);
    const other = bible.characters.find(
      (c) => c.id === meant && c.id !== hero.id,
    );
    if (couldNot(viewer.who))
      misses.push(
        `they could not tell whose story it is (it is ${hero.name}'s)`,
      );
    // The same goal seen from the side of the one it is about ("Sigrid
    // wants to mend the net", of "to see Sigrid mend the net alone"): a
    // two-hander read another way, not a film they could not follow.
    else if (
      other &&
      !(gotWant && namesOf(other).some((n) => wordIn(n, premise.want)))
    )
      misses.push(
        `they took it for ${other.name}'s story ("${viewer.who}"), not ${hero.name}'s`,
      );
  }
  if (premise.want && !gotWant)
    misses.push(
      `they said the hero wants "${viewer.wants || 'could not tell'}"; the story's want is "${premise.want}"`,
    );
  if (premise.obstacle) {
    // Someone of the cast named as what is in the way, by the viewer too
    // (by name, or as the film showed them).
    const inWay = bible.characters.filter(
      (c) =>
        c.id !== premise.hero &&
        namesOf(c).some((n) => wordIn(n, premise.obstacle)),
    );
    const theirs = couldNot(viewer.obstacle)
      ? null
      : castMeant(viewer.obstacle, bible, seen);
    const got =
      !couldNot(viewer.obstacle) &&
      (inWay.some((c) => c.id === theirs) ||
        conveys(
          premise.obstacle,
          gist(`${viewer.obstacle} ${viewer.sentence}`),
          names,
        ) ||
        covered(
          gist(viewer.obstacle),
          gist(`${premise.obstacle} ${premise.logline}`),
        ) >= 0.3);
    if (!got)
      misses.push(
        `they said what is in the way is "${viewer.obstacle || 'could not tell'}"; it is "${premise.obstacle}"`,
      );
  }
  if (premise.clock && couldNot(viewer.clock))
    unsure.push(`saw no deadline (the story's clock: ${premise.clock})`);
  if (premise.oddity) {
    const st = (said: string) =>
      stemsOf(said.replace(/\bunnamed \d+\b/giu, ' '), names);
    const rule = st(`${premise.oddity.what} ${premise.oddity.rule}`);
    const theirs = st(viewer.impossible);
    const granted =
      TALKING.test(premise.oddity.what) && couldNot(viewer.impossible);
    if (
      !granted &&
      (couldNot(viewer.impossible) ||
        Math.max(covered(theirs, rule), covered(rule, theirs)) < 0.25)
    )
      unsure.push(
        `did not get the impossible thing and its rule (${premise.oddity.what}: ${premise.oddity.rule})`,
      );
  }
  // Who the others are to the hero (T3): never the hero themselves, and
  // only someone the story turns on (the premise names them) who speaks.
  // Whom code cannot tell the viewer meant is asked about all the same.
  const story = [
    premise.want,
    premise.obstacle,
    premise.stakes,
    premise.clock,
    premise.logline,
  ].join(' ');
  const heroNames = hero ? namesOf(hero) : [];
  let whoUnsure = false;
  for (const p of viewer.people) {
    if (
      !couldNot(p.is) ||
      p.who.trim().toLowerCase() === viewer.who.trim().toLowerCase() ||
      heroNames.some((n) => wordIn(n, p.who)) ||
      /\b(?:hero|protagonist|herself|himself|themselves)\b/iu.test(p.is)
    )
      continue;
    const id = castMeant(p.who, bible, seen);
    const c = id ? bible.characters.find((one) => one.id === id) : null;
    if (c && c.id === premise.hero) continue;
    if (c && !namesOf(c).some((n) => wordIn(n, story))) continue;
    if (c && seen && !seen.speakers.has(c.id)) continue;
    unsure.push(`could not tell who ${p.who} is to the hero`);
    whoUnsure = true;
  }
  return {
    misses,
    unsure,
    confused: countedConfusions(viewer, premise, bible, whoUnsure),
  };
}

// ── The whole film, retold (T2) ────────────────────────────────────────────

/** How a first-time viewer joined one scene to the next, retelling the film. */
export type RetellLink = StoryLink | 'and then';

/** A first-time viewer's retelling of the whole film as a story spine, with the join between each scene. */
export interface Retell {
  /** Each scene in a sentence, with how it follows the one before (the first's link is null). */
  scenes: { scene: number; link: RetellLink | null; what: string }[];
  /** "Until finally…": the climax as they saw it. */
  finally: string;
  /** What the film was about, in a sentence. */
  about: string;
}

/** A retelling made sound for a film of `count` scenes; null for nothing usable. */
export function retellOf(raw: unknown, count: number): Retell | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const scenes = (Array.isArray(r.scenes) ? r.scenes : [])
    .flatMap((one: unknown) => {
      if (!one || typeof one !== 'object') return [];
      const s = one as Record<string, unknown>;
      const k = Math.round(Number(s.scene)) - 1;
      if (!Number.isFinite(k) || k < 0 || k >= count) return [];
      const link =
        typeof s.link === 'string' ? s.link.trim().toLowerCase() : '';
      return [
        {
          scene: k,
          link:
            k === 0
              ? null
              : link.startsWith('therefore') || link === 'so'
                ? ('therefore' as const)
                : link.startsWith('but')
                  ? ('but' as const)
                  : ('and then' as const),
          what: said(s.what, 300),
        },
      ];
    })
    .slice(0, count);
  if (!scenes.length) return null;
  return { scenes, finally: said(r.finally, 300), about: said(r.about, 300) };
}

/**
 * What the retelling says to the writers (T2): each join the viewer could
 * only make with "and then" is a note on the later scene; an "Until
 * finally" that is not the planned climax is a note on the climax's scene.
 */
export function retellNotes(
  retell: Retell | null,
  story: StudioStory | null | undefined,
  outline: StudioOutline,
  bible: Pick<StudioBible, 'characters'>,
): ScriptNote[] {
  if (!retell) return [];
  const out: ScriptNote[] = [];
  for (const one of retell.scenes)
    if (one.link === 'and then')
      out.push({
        scene: one.scene,
        kind: 'retell',
        message: `A first-time viewer, retelling the whole film, could only join scene ${one.scene} to scene ${one.scene + 1} with "and then": they could not see why this scene follows. Make it happen because of the scene before (therefore) or against it (but), in what is said and done on screen.`,
      });
  if (story && retell.finally) {
    const climax = story.beats.beats.findIndex((b) => b.role === 'climax');
    const serves = sceneOfBeats(story, outline);
    const k = climax >= 0 ? serves[climax] : -1;
    if (k >= 0) {
      const names = new Set(
        bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
      );
      const planned = stemsOf(story.beats.beats[climax].what, names);
      const seen = stemsOf(retell.finally, names);
      if (
        planned.length >= 3 &&
        Math.max(covered(planned, seen), covered(seen, planned)) < 0.2
      )
        out.push({
          scene: k,
          kind: 'retell',
          message: `A first-time viewer took the climax to be "${retell.finally}", not what was planned (${story.beats.beats[climax].what.replace(/[.!]+$/u, '')}): make the climax the biggest moment on screen, decided by what the hero does.`,
        });
    }
  }
  return out;
}

/**
 * A table read made sound for a script of `count` scenes; every scene
 * read, its score the overall where none was given. Clarity is a floor:
 * a film a first-time viewer cannot follow is no better overall than its
 * clarity, so it never clears the bar. Where the critic left clarity out,
 * the viewer's own sureness stands for it.
 */
export function tableReadOf(
  raw: unknown,
  count: number,
  viewer: ColdRead | null = null,
  judged: { misses: string[]; unsure: string[]; confused?: string[] } = {
    misses: [],
    unsure: [],
  },
): TableRead {
  const read =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const given =
    read.scores && typeof read.scores === 'object'
      ? (read.scores as Record<string, unknown>)
      : {};
  const scores: Partial<Record<RubricKey, number>> = {};
  for (const key of RUBRIC_KEYS) {
    const n = score(given[key]);
    if (n !== null) scores[key] = n;
  }
  // The critic's own clarity, before any floor: for the log and the bench.
  const clarityGiven = scores.clarity;
  if (scores.clarity === undefined && viewer) scores.clarity = viewer.sure;
  // Two things or more a first-time viewer could not follow (their
  // confusions that count, and what code found them unsure of): not
  // clear, whatever the score.
  const confused = viewer ? (judged.confused ?? viewer.confused) : [];
  if (
    viewer &&
    confused.length + judged.unsure.length >= CONFUSED_MOST &&
    scores.clarity !== undefined
  )
    scores.clarity = Math.min(scores.clarity, BAR.clarity - 1);
  // The clarity sentence wrong against the premise: not clear, whatever the score.
  if (viewer && judged.misses.length && scores.clarity !== undefined)
    scores.clarity = Math.min(scores.clarity, BAR.clarity - 1);
  const items = Object.values(scores);
  const mean = items.length
    ? Math.round((items.reduce((a, b) => a + b, 0) / items.length) * 10) / 10
    : 0;
  const clarity = scores.clarity;
  const overall = Math.min(
    score(read.overall) ?? mean,
    clarity !== undefined && clarity < BAR.clarity ? clarity : 10,
  );
  const byScene = new Map<number, SceneRead>();
  for (const one of Array.isArray(read.scenes) ? read.scenes : []) {
    if (!one || typeof one !== 'object') continue;
    const s = one as Record<string, unknown>;
    const k = Math.round(Number(s.scene)) - 1;
    if (!Number.isFinite(k) || k < 0 || k >= count || byScene.has(k)) continue;
    byScene.set(k, {
      scene: k,
      score: score(s.score) ?? overall,
      given: score(s.score) !== null,
      notes: (Array.isArray(s.notes) ? s.notes : [])
        .map((n) => said(n, 400))
        .filter(Boolean)
        .slice(0, 6),
    });
  }
  const scenes = Array.from(
    { length: count },
    (_, k) =>
      byScene.get(k) ?? { scene: k, score: overall, given: false, notes: [] },
  );
  const voice = (Array.isArray(read.voice) ? read.voice : [])
    .flatMap((one: unknown): VoiceSlip[] => {
      if (!one || typeof one !== 'object') return [];
      const v = one as Record<string, unknown>;
      const k = Math.round(Number(v.scene)) - 1;
      const line = said(v.line, 200);
      if (!line || !Number.isFinite(k) || k < 0 || k >= count) return [];
      return [{ scene: k, who: said(v.who, 40), line, why: said(v.why, 200) }];
    })
    .slice(0, 12);
  return {
    scores,
    overall,
    scenes,
    voice,
    verdict: said(read.verdict, 600),
    viewer,
    misses: judged.misses,
    unsure: judged.unsure,
    confused,
    ...(clarityGiven !== undefined ? { clarityGiven } : {}),
  };
}

/** Whether a read is below the clarity floor: a first-time viewer could not follow it. */
export const unclear = (read: Pick<TableRead, 'scores'>): boolean =>
  (read.scores.clarity ?? 10) < BAR.clarity;

/** Why a read is below the bar, in words; empty when it clears it. */
export function belowBar(read: TableRead): string[] {
  const out: string[] = [];
  if (unclear(read)) out.push(`clarity ${read.scores.clarity} (the floor)`);
  if (read.overall < BAR.overall) out.push(`overall ${read.overall}`);
  for (const r of RUBRIC) {
    const n = read.scores[r.key];
    if (n !== undefined && n < BAR.item) out.push(`${r.key} ${n}`);
  }
  return out;
}

/**
 * The scenes to write again, from 0 and in order: those scoring below
 * the bar, the lowest first; the first when the hook fails and the last
 * when the button does; else the lowest with notes. At most half of them
 * (at least one), so a round stays cheap and the script stays itself.
 */
export function scenesToRewrite(
  read: TableRead,
  code: readonly ScriptNote[] = [],
): number[] {
  const count = read.scenes.length;
  if (!count) return [];
  const most = Math.max(1, Math.ceil(count / 2));
  const low = [...read.scenes]
    .filter((s) => s.given && s.score < BAR.scene)
    .sort((a, b) => a.score - b.score)
    .map((s) => s.scene);
  const failing = (key: RubricKey) => (read.scores[key] ?? 10) < BAR.item;
  const chosen = new Set<number>();
  if (unclear(read) || failing('hook') || failing('want')) chosen.add(0);
  if (failing('button')) chosen.add(count - 1);
  for (const k of low) if (chosen.size < most) chosen.add(k);
  // A scene a first-time viewer could not see follow from the one before.
  for (const n of code)
    if ((n.kind === 'retell' || n.kind === 'opening') && chosen.size < most)
      chosen.add(n.scene);
  if (!chosen.size) {
    const noted = [...read.scenes]
      .filter(
        (s) => s.notes.length || read.voice.some((v) => v.scene === s.scene),
      )
      .sort((a, b) => a.score - b.score);
    if (noted.length) chosen.add(noted[0].scene);
  }
  return [...chosen].slice(0, most).sort((a, b) => a - b);
}

/** A read in one line, for the log: "7.8 (want 8, … ; lowest dialogue 5)". */
export function describeRead(read: TableRead): string {
  const items = RUBRIC_KEYS.flatMap((key) =>
    read.scores[key] === undefined ? [] : [`${key} ${read.scores[key]}`],
  );
  const scenes = read.scenes.map((s) => s.score).join('/');
  return `${read.overall} (${items.join(', ')}; scenes ${scenes})`;
}

// ── The script in words ───────────────────────────────────────────────────

const nameIn =
  (bible: Pick<StudioBible, 'characters'>) => (id: string | null) =>
    (id && bible.characters.find((c) => c.id === id)?.name) || id || 'someone';

/** One beat as a screenplay has it. */
function beatWords(
  beat: SheetBeat,
  name: (id: string | null) => string,
): string {
  switch (beat.kind) {
    case 'line': {
      const how = [
        beat.to ? `to ${name(beat.to)}` : '',
        beat.aim ? `aim: ${beat.aim}` : '',
        beat.feeling && beat.feeling !== 'neutral' ? beat.feeling : '',
        beat.felt ? `feeling ${beat.felt} beneath` : '',
        beat.pace && beat.pace !== 'calm' ? beat.pace : '',
        beat.from && beat.from !== 'here' ? beat.from : '',
      ].filter(Boolean);
      return `${name(beat.who).toUpperCase()}${how.length ? ` (${how.join('; ')})` : ''}: ${beat.say}`;
    }
    case 'narration':
      return `NARRATOR: ${beat.say}`;
    case 'reaction':
      return `[${name(beat.who)} reacts: ${[beat.feeling, beat.sign].filter(Boolean).join(', ') || 'a look'}]`;
    case 'pause':
      return `[a pause${beat.seconds ? `, ${beat.seconds}s` : ''}]`;
    default:
      return `[${beat.say || `${name(beat.who)} ${beat.doSaid ?? beat.do ?? ''} ${beat.thing ?? beat.prop ?? ''}`.trim()}]`;
  }
}

/** The spoken words of a scene: the characters' and the narrator's. */
export function spokenOf(sheet: StorySheet): {
  lines: number;
  narration: number;
} {
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  let lines = 0;
  let narration = 0;
  for (const b of sheet.beats)
    if (b.kind === 'line') lines += count(b.say);
    else if (b.kind === 'narration') narration += count(b.say);
  return { lines, narration };
}

/**
 * The whole script as a screenplay, for the table read: each scene with
 * its place, who is there, what it was planned to do, and every beat
 * numbered from 1; and what code measured of it.
 */
export function scriptInWords(
  sheets: readonly StorySheet[],
  bible: StudioBible,
  outline: StudioOutline,
): string {
  const name = nameIn(bible);
  return sheets
    .map((sheet, k) => {
      const plan = planned(outline, k);
      const place =
        bible.sets.find((s) => s.id === sheet.set)?.name ?? sheet.set;
      const spoken = spokenOf(sheet);
      const all = spoken.lines + spoken.narration;
      const share = all ? Math.round((spoken.narration / all) * 100) : 0;
      return [
        `SCENE ${k + 1}: "${sheet.title}", in ${place}, ${sheet.time}; ${sheet.onStage.map((p) => name(p.who)).join(', ') || 'no one'} there as it opens; about ${outline.scenes[k]?.seconds ?? '?'} seconds; ${all} spoken words, the narrator ${share}% of them.`,
        plan
          ? `  (Planned: ${[plan.purpose, plan.turn ? `turn: ${plan.turn}` : '', plan.moment ? `moment: ${plan.moment}` : ''].filter(Boolean).join('; ')})`
          : '',
        ...sheet.beats.map((b, j) => `  ${j + 1}. ${beatWords(b, name)}`),
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

/**
 * The film's opening as a first-time viewer has it (the cold read): only
 * what is seen and heard, scene by scene up to `upTo` (from 0). No plan,
 * no logline, no place names no one says; each person known by their
 * name only once someone says it, till then by how they look. What they
 * hold, what they do and the faces they pull are what the stage shows.
 */
export function filmAsSeen(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters' | 'sets'>,
  upTo = 0,
): string {
  return watch(sheets, bible, upTo).film;
}

/**
 * The cast as a first-time viewer met them, up to scene `upTo` (from 0):
 * the label each one no one named went by ("UNNAMED 2"), as filmAsSeen
 * wrote it, and who spoke. What the viewer says of "UNNAMED 2" is said of
 * them (judgeColdRead).
 */
export function castAsSeen(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters' | 'sets'>,
  upTo = 0,
): CastSeen {
  const { unnamed, speakers } = watch(sheets, bible, upTo);
  return {
    labels: new Map([...unnamed].map(([id, n]) => [id, `UNNAMED ${n}`])),
    speakers,
  };
}

/** The film as seen (filmAsSeen), with who went unnamed and who spoke. */
function watch(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters' | 'sets'>,
  upTo: number,
): { film: string; unnamed: Map<string, number>; speakers: Set<string> } {
  const speakers = new Set<string>();
  const heard = new Set<string>();
  const unnamed = new Map<string, number>();
  const seen = new Set<string>();
  const spoken = (text: string) => {
    for (const c of bible.characters)
      if (
        namesOf(c).some((name) =>
          new RegExp(
            `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'iu',
          ).test(text),
        )
      )
        heard.add(c.id);
  };
  const label = (id: string | null) => {
    if (!id) return 'someone';
    const c = bible.characters.find((one) => one.id === id);
    if (!c) return id;
    if (heard.has(c.id)) return c.name.toUpperCase();
    if (!unnamed.has(c.id)) unnamed.set(c.id, unnamed.size + 1);
    const tag = `UNNAMED ${unnamed.get(c.id)}`;
    if (seen.has(c.id)) return tag;
    seen.add(c.id);
    return `${tag} (${c.kind === 'person' ? '' : `${c.kind}: `}${looksOf(c)})`;
  };
  /** An action's words with the names no one has said put as the viewer knows them. */
  const shown = (text: string) => {
    let out = text;
    for (const c of bible.characters) {
      if (heard.has(c.id)) continue;
      for (const name of namesOf(c)) {
        const re = new RegExp(
          `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:['’]s)?\\b`,
          'giu',
        );
        if (re.test(out)) out = out.replace(re, label(c.id));
      }
    }
    return out;
  };
  const FROM: Record<string, string> = {
    off: 'from off screen',
    phone: 'on the phone',
    letter: 'reading out a letter',
    thought: 'thinking, heard as a voice-over',
    above: 'a voice from above',
    dream: 'in a dream or memory',
  };
  const film = sheets
    .slice(0, upTo + 1)
    .map((sheet, k) => {
      const set = bible.sets.find((one) => one.id === sheet.set);
      const opening = sheet.onStage
        .map(
          (p) =>
            `${label(p.who)}${p.pose && p.pose !== 'standing' ? `, ${p.pose}` : ''}${p.holding ? `, holding ${p.holding}` : ''}`,
        )
        .join('; ');
      const lines = sheet.beats.map((b) => {
        switch (b.kind) {
          case 'line': {
            const who = label(b.who);
            const to = b.to ? label(b.to) : '';
            if (b.who) speakers.add(b.who);
            spoken(b.say);
            const how = [to ? `to ${to}` : '', b.from ? FROM[b.from] : '']
              .filter(Boolean)
              .join(', ');
            return `${who}${how ? ` (${how})` : ''}: ${b.say}`;
          }
          case 'narration':
            spoken(b.say);
            return `A VOICE-OVER: ${b.say}`;
          case 'reaction':
            return `[${label(b.who)} looks ${[b.feeling, b.sign].filter(Boolean).join(', ') || 'on'}]`;
          case 'pause':
            return '[a pause]';
          default:
            return `[we see: ${shown(b.say || `${label(b.who)} ${b.do ?? ''} ${b.thing ?? b.prop ?? ''}`.trim()).replace(/[.!]+$/u, '')}]`;
        }
      });
      return [
        `SCENE ${k + 1}. We see: ${set?.look || 'a place'}, ${sheet.time}${sheet.weather && sheet.weather !== 'clear' ? `, ${sheet.weather}` : ''}. There as it opens: ${opening || 'no one'}.`,
        ...lines.map((l) => `  ${l}`),
      ].join('\n');
    })
    .join('\n\n');
  return { film, unnamed, speakers };
}

/** A scene's plan, from the story its outline was built from: by title, else by place. */
function planned(outline: StudioOutline, k: number) {
  const scene = outline.scenes[k];
  const plan = outline.story?.plan.scenes;
  if (!scene || !plan) return null;
  return (
    plan.find((one) => one.title === scene.title) ??
    (plan.length === outline.scenes.length ? plan[k] : null)
  );
}

// ── Code's checks across the script ───────────────────────────────────────

/** A note from code for one scene. */
export interface ScriptNote {
  /** Which scene, from 0. */
  scene: number;
  kind:
    | 'voice'
    | 'telling'
    | 'plant'
    | 'turn'
    | 'aim'
    | 'lint'
    | 'comedy'
    | 'opening'
    | 'retell';
  message: string;
}

/** Lines anyone says in any story: said instead of something only this speaker would say. */
const STOCK = new Set(
  [
    'okay',
    'ok',
    'yes',
    'no',
    'what',
    'oh',
    'oh no',
    'wow',
    'whoa',
    'hey',
    'hi',
    'hello',
    'look',
    'come on',
    'lets go',
    'let us go',
    'hurry',
    'hurry up',
    'really',
    'great',
    'cool',
    'yay',
    'hooray',
    'thank you',
    'thanks',
    'sorry',
    'im sorry',
    'me too',
    'good idea',
    'good job',
    'well done',
    'we did it',
    'you did it',
    'i dont know',
    'what happened',
    'are you okay',
    'are you ok',
    'dont worry',
    'lets do it',
    'lets do this',
    'you are right',
    'youre right',
    'thats right',
    'here you go',
    'what do we do now',
    'i have an idea',
    'what was that',
    'what is that',
    'whats that',
    'i did it',
    'thank you so much',
    'no way',
    'oh my',
    'uh oh',
    'see you',
    'goodbye',
    'bye',
  ].map((s) => s.replace(/[^a-z ]/gu, '')),
);

/** A line as compared with the stock lines: lower case, letters and spaces. */
const plain = (line: string) =>
  line
    .toLowerCase()
    .replace(/[’']/gu, '')
    .replace(/[^a-z\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

/** Whether a line is one anyone says: all of it, or every sentence of it, stock. */
export function isStockLine(line: string): boolean {
  const parts = line
    .split(/[.!?…]+/u)
    .map(plain)
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => STOCK.has(p));
}

/** How a character speaks, as code can hear it. */
export interface VoiceProfile {
  id: string;
  name: string;
  /** Their pet phrases, from the quotes in their voice note. */
  phrases: string[];
  /** Words of theirs: from their pet phrases and traits, stemmed. */
  stems: string[];
  /** Talks in short sentences. */
  short: boolean;
}

/** The quoted phrases of a voice note: "says 'What do we know?'". */
function quotedIn(voice: string): string[] {
  const out: string[] = [];
  const re =
    /["“]([^"”]{2,60})["”]|(?:^|[\s(])['‘]([^'’]{2,60})['’](?=[\s,.;:!?)]|$)/gu;
  for (const m of voice.matchAll(re)) {
    const phrase = (m[1] ?? m[2] ?? '').trim();
    if (phrase) out.push(phrase);
  }
  return out;
}

/** A character's voice as code can hear it; null for one with no sheet. */
export function voiceProfile(
  c: Pick<StudioCharacter, 'id' | 'name'> & { persona?: Persona },
  names: ReadonlySet<string> = new Set(),
): VoiceProfile | null {
  const p = c.persona;
  if (!p || !p.voice) return null;
  const phrases = quotedIn(p.voice);
  return {
    id: c.id,
    name: c.name,
    phrases,
    stems: stemsOf([...phrases, ...p.personality].join(' '), names),
    short:
      /\bshort\b|\bclipped\b|\bterse\b|\bfew words\b|\bone-word\b|\bchirpy\b/iu.test(
        p.voice,
      ),
  };
}

/** Whether a line has one of a profile's pet phrases in it. */
const hasPhrase = (profile: VoiceProfile, line: string) => {
  const said = ` ${plain(line)} `;
  return profile.phrases.some((phrase) => {
    const words = plain(phrase);
    return words.length > 1 && said.includes(` ${words} `);
  });
};

/**
 * The voice lint (§1.5): lines any character could have said. A pet
 * phrase in the wrong mouth; two or more stock lines making up a
 * quarter of a scene's; a long line from someone who talks in short
 * ones; and someone with several lines, none of which sounds like
 * their sheet (none of their phrases, nothing of their words).
 */
export function lintVoices(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters'>,
): ScriptNote[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const profiles = new Map(
    bible.characters.flatMap((c) => {
      const profile = voiceProfile(c, names);
      return profile ? [[c.id, profile] as const] : [];
    }),
  );
  const out: ScriptNote[] = [];
  /** Each pet phrase once its owner has said it: another saying it after is a callback, never a slip. */
  const owned = new Set<string>();
  /** Per speaker: how many lines, how many their own, and where most were said. */
  const heard = new Map<
    string,
    { lines: number; own: number; at: Map<number, number> }
  >();
  sheets.forEach((sheet, k) => {
    const lines = sheet.beats.filter(
      (b) => b.kind === 'line' && b.who && b.from !== 'letter',
    );
    const stock = lines.filter((b) => isStockLine(b.say));
    if (stock.length >= 2 && stock.length / Math.max(1, lines.length) >= 0.25)
      out.push({
        scene: k,
        kind: 'voice',
        message: `Lines any character could say: ${stock
          .slice(0, 4)
          .map((b) => `"${b.say}"`)
          .join(
            ', ',
          )}. Give each one something only its speaker would say, in their way (or let a look or an action carry it).`,
      });
    let long = 0;
    for (const b of lines) {
      const profile = profiles.get(b.who!);
      if (!profile) continue;
      const own =
        hasPhrase(profile, b.say) ||
        covered(stemsOf(b.say, names), profile.stems) > 0;
      const tally = heard.get(profile.id) ?? {
        lines: 0,
        own: 0,
        at: new Map(),
      };
      tally.lines += 1;
      if (own) tally.own += 1;
      tally.at.set(k, (tally.at.get(k) ?? 0) + 1);
      heard.set(profile.id, tally);
      for (const phrase of profile.phrases)
        if (hasPhrase({ ...profile, phrases: [phrase] }, b.say))
          owned.add(phrase);
      // The last scene may hand a phrase on: the lesson learnt, said back.
      if (!own && k < sheets.length - 1)
        for (const other of profiles.values())
          if (
            other.id !== profile.id &&
            other.phrases.some(
              (phrase) =>
                !owned.has(phrase) &&
                hasPhrase({ ...other, phrases: [phrase] }, b.say),
            )
          ) {
            out.push({
              scene: k,
              kind: 'voice',
              message: `"${b.say}" is ${profile.name}'s line, but it is ${other.name}'s pet phrase: give ${profile.name} words of their own, or give the line to ${other.name}.`,
            });
            break;
          }
      const count = b.say.split(/\s+/).filter(Boolean).length;
      if (profile.short && count > 12 && long < 2) {
        long += 1;
        out.push({
          scene: k,
          kind: 'voice',
          message: `"${b.say}" is ${count} words, and ${profile.name} talks in short sentences: cut it down, or break it with a reaction.`,
        });
      }
    }
  });
  for (const [id, tally] of heard) {
    const profile = profiles.get(id)!;
    if (tally.lines < 4 || tally.own > 0) continue;
    if (!profile.phrases.length && profile.stems.length < 3) continue;
    const at = [...tally.at.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      scene: at,
      kind: 'voice',
      message: `None of ${profile.name}'s ${tally.lines} lines sounds like them: use their way of speaking${
        profile.phrases.length
          ? ` (${profile.phrases
              .slice(0, 3)
              .map((p) => `"${p}"`)
              .join(', ')})`
          : ''
      } somewhere in this scene.`,
    });
  }
  return out;
}

/** Past forms the light stemmer cannot take back to their verb: "sent" is "send". */
const IRREGULAR: Record<string, string> = {
  sent: 'send',
  went: 'go',
  gone: 'go',
  gave: 'give',
  given: 'give',
  took: 'take',
  taken: 'take',
  left: 'leave',
  got: 'get',
  made: 'make',
  broke: 'break',
  broken: 'break',
  threw: 'throw',
  thrown: 'throw',
  caught: 'catch',
  shut: 'shut',
  put: 'put',
  ate: 'eat',
  eaten: 'eat',
  drank: 'drink',
  fell: 'fall',
  fallen: 'fall',
  found: 'find',
  brought: 'bring',
  bought: 'buy',
  paid: 'pay',
  sold: 'sell',
  held: 'hold',
  sat: 'sit',
  stood: 'stand',
  ran: 'run',
  came: 'come',
  dropped: 'drop',
};
/** A word's stem, its irregular past taken back to its verb. */
const verbStem = (word: string) =>
  IRREGULAR[word.toLowerCase()] ?? stemOf(word);
/** A text's stems, as the telling check compares them. */
const tellStems = (text: string, names: ReadonlySet<string>) =>
  stemsOf(text, names).map((w) => IRREGULAR[w] ?? w);

/** The verb an action or business beat's words say its doer does: the word after their name ("Dee unlocks the door" is "unlock"). */
function shownVerb(
  beat: SheetBeat,
  bible: Pick<StudioBible, 'characters'>,
): string | null {
  const c = bible.characters.find((one) => one.id === beat.who);
  const say = beat.say.trim();
  if (!c || !say) return null;
  for (const name of namesOf(c)) {
    const m = new RegExp(
      `^(?:and |then )?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:slowly |quickly |finally |then )?([\\p{L}’'-]+)`,
      'iu',
    ).exec(say);
    if (m) return verbStem(m[1]);
  }
  return null;
}

/** A line's first-person narration of what its speaker is doing: "I'm opening the box", "I am taking the key". */
const DOING_NOW =
  /^(?:(?:and|so|ok(?:ay)?|right|now)[, ]+)?i(?:['’]m| am)(?: now| just)? (\p{L}+ing)\b/iu;

/** A status fragment: a sentence of three words or fewer saying how something is ("Door's locked.", "That's fine.", "It's 11:52."). */
const STATUS =
  /^(?:it|that|this|\p{L}+)['’]s\s+(?:\p{L}+\s+)?[\p{L}\p{N}:.]+[.!]?$/iu;
/** A time on a clock, said: "11:52", "ten minutes", "midnight". */
const CLOCK_TIME =
  /\b\d{1,2}[:.]\d{2}\b|\b(?:\d+|one|two|three|four|five|ten|fifteen|twenty|thirty) minutes?\b|\b(?:o['’]clock|midnight|noon)\b|\b(?:eleven|twelve|ten|nine|eight|seven|six|five|four|three|two|one) (?:fifty|forty|thirty|twenty|fifteen|ten|oh)[- ]?\w*\b/iu;

/** Two stems alike, as the stemmer leaves them ("unlock" and "unlocked"). */
const same = (a: string, b: string) =>
  a === b ||
  (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** Aims that do something to the one a line is said to, whatever its verb: never a report of the picture. */
const MOVES_ON: ReadonlySet<LineAim> = new Set<LineAim>([
  'orders',
  'warns',
  'threatens',
  'bargains',
  'begs',
  'pleads',
  'asks',
  'refuses',
  'teases',
  'accuses',
]);

/** Where a voice is heard from with no one on the stage to say it: from off, down a phone, from above. */
const AWAY: ReadonlySet<string> = new Set(['off', 'phone', 'above']);

/**
 * Whether a line from the stage is said to someone off it: to one heard
 * in the scene from off (through a door, on an intercom, down a phone),
 * or to one of the cast it calls by name who is not there ("Mr. Sal, I
 * only need—", "…come out, Mr. Sal."). The sheet can only say to whom a
 * line is said among those on the stage (a line to anyone else is mended
 * to no one), so this is how a conversation with a voice is known.
 */
export function saidAway(
  sheet: StorySheet,
  beat: SheetBeat,
  here: ReadonlySet<string>,
  bible: Pick<StudioBible, 'characters'>,
): boolean {
  if (
    sheet.beats.some(
      (b) =>
        b.kind === 'line' &&
        b.who &&
        b.who !== beat.who &&
        AWAY.has(b.from ?? 'here'),
    )
  )
    return true;
  return bible.characters.some(
    (c) =>
      c.id !== beat.who &&
      !here.has(c.id) &&
      namesOf(c).some((name) => {
        const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(
          `(?:^|[.!?…]\\s+)${n}\\s*[,!?—–-]|,\\s*${n}\\s*(?:[.!?…—–-]|$)`,
          'iu',
        ).test(beat.say.trim());
      }),
  );
}

/**
 * The telling lint: lines that narrate what the viewer sees, the
 * narrator by another name. A short sentence that says again what a move
 * within two beats of it shows (its verb: "Unlocked." by "Dee unlocks
 * the door", "Sent." by "Tessa sends the money"); a short sentence all of
 * whose words a narration beside it has already said ("Door's locked."
 * after "The door is locked."); and "I'm opening the box" said as its
 * speaker opens it. A line should do something to the one it is said to.
 */
export function lintTelling(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters'>,
): ScriptNote[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const nameOf = (id: string | null) =>
    bible.characters.find((c) => c.id === id)?.name ?? id ?? 'someone';
  const out: ScriptNote[] = [];
  /** Lines said to no one by someone alone, across the film: one, a question or a cry, at most. */
  let alone = 0;
  /** Lines with a time on a clock, across the film: the deadline said once, felt after. */
  let clocks = 0;
  sheets.forEach((sheet, k) => {
    let flagged = 0;
    let clocksHere = 0;
    const here = new Set(sheet.onStage.map((p) => p.who));
    sheet.beats.forEach((beat, j) => {
      if (beat.kind === 'action' && beat.who) {
        if (beat.do === 'enter') here.add(beat.who);
        if (beat.do === 'leave' || beat.do === 'go-through')
          here.delete(beat.who);
      }
      // The time announced by a narrator: said by people, or seen.
      if (beat.kind === 'narration' && CLOCK_TIME.test(beat.say))
        out.push({
          scene: k,
          kind: 'telling',
          message: `Beat ${j + 1}: the narration announces the time ("${beat.say}"): let someone say the deadline once, as a threat or a bargain, and after that let a clock or a glance at a phone show it.`,
        });
      if (beat.kind !== 'line' || !beat.who || flagged >= 3) return;
      if (beat.from === 'letter' || beat.from === 'thought') return;
      // The clock said again and again: once, then felt.
      if (CLOCK_TIME.test(beat.say)) {
        clocks += 1;
        clocksHere += 1;
        if (clocksHere === 2 || clocks === 3) {
          flagged += 1;
          out.push({
            scene: k,
            kind: 'telling',
            message: `Beat ${j + 1}: "${beat.say}" says the time again: say the deadline once, then let it be felt (a clock face, a phone buzzing, someone glancing at it), never announced.`,
          });
          return;
        }
      }
      // Said to no one by someone alone on the stage: the narrator's job.
      if (
        (beat.from ?? 'here') === 'here' &&
        !beat.to &&
        [...here].every((id) => id === beat.who) &&
        !saidAway(sheet, beat, here, bible)
      ) {
        alone += 1;
        if (alone > 1 || !/[?!]\s*$/u.test(beat.say)) {
          flagged += 1;
          out.push({
            scene: k,
            kind: 'telling',
            message: `Beat ${j + 1}: ${nameOf(beat.who)} says "${beat.say}" to no one, alone: that is a narrator in disguise. Show it in what they do, or bring someone on to say it to.`,
          });
          return;
        }
      }
      const near = sheet.beats.filter(
        (b, i) => i !== j && Math.abs(i - j) <= 2,
      );
      const moves = near.filter(
        (b) => b.kind === 'action' || b.kind === 'business',
      );
      const told = near.filter((b) => b.kind === 'narration');
      const sentences = beat.say
        .split(/(?<=[.!?…])\s+/u)
        .map((x) => x.trim())
        .filter(Boolean);
      let why: string | null = null;
      // Two status fragments in a row: a report of the picture.
      const status = sentences.filter(
        (x) => x.split(/\s+/u).length <= 3 && STATUS.test(x),
      );
      if (
        sentences.some(
          (x, i) =>
            i > 0 &&
            STATUS.test(x) &&
            STATUS.test(sentences[i - 1]) &&
            x.split(/\s+/u).length <= 3 &&
            sentences[i - 1].split(/\s+/u).length <= 3,
        )
      )
        why = `${status.map((x) => `"${x}"`).join(' ')} report how things are, as a narrator would`;
      const doing = why ? null : DOING_NOW.exec(beat.say.trim());
      if (doing) {
        const verb = verbStem(doing[1]);
        const own = moves.find(
          (b) =>
            b.who === beat.who &&
            (shownVerb(b, bible) ?? '') !== '' &&
            same(shownVerb(b, bible)!, verb),
        );
        if (own)
          why = `says what ${nameOf(beat.who)} is doing as we watch it (${own.say.replace(/[.!]+$/u, '')})`;
      }
      for (const sentence of sentences) {
        if (why) break;
        const words = sentence.split(/\s+/u).filter(Boolean).length;
        if (words > 5) continue;
        const stems = tellStems(sentence, names);
        if (!stems.length) continue;
        // A move on someone ("One sip, and leave some.", ordered as the
        // speaker sips) says a verb we see, and does something with it.
        const echoed = moves.find((b) => {
          if (beat.to && beat.aim && MOVES_ON.has(beat.aim)) return false;
          const verb = shownVerb(b, bible);
          return verb !== null && stems.some((w) => same(w, verb));
        });
        if (echoed) {
          why = `"${sentence}" says what we have just seen (${echoed.say.replace(/[.!]+$/u, '')})`;
          break;
        }
        const narrated = told.find(
          (b) =>
            stems.length >= 2 && covered(stems, tellStems(b.say, names)) >= 1,
        );
        if (narrated)
          why = `"${sentence}" says again what the narration beside it says ("${narrated.say.replace(/[.!]+$/u, '')}")`;
      }
      if (!why) return;
      flagged += 1;
      out.push({
        scene: k,
        kind: 'telling',
        message: `Beat ${j + 1}: ${nameOf(beat.who)}'s "${beat.say}" narrates: ${why}. Cut it and let the picture carry it, or give ${nameOf(beat.who)} a line that does something to ${beat.to ? nameOf(beat.to) : 'someone'} (asks, refuses, teases, begs, warns).`,
      });
    });
  });
  return out;
}

/** Everything a scene's words name: its lines, its narration, what its moves say, and its things. */
function sceneStems(sheet: StorySheet, names: ReadonlySet<string>): string[] {
  return stemsOf(
    [
      ...sheet.beats.flatMap((b) => [
        b.say,
        b.prop ?? '',
        b.thing ?? '',
        b.target ?? '',
        b.via ?? '',
        b.doSaid ?? '',
      ]),
      ...sheet.props.map((p) => p.prop),
      ...sheet.onStage.map((p) => p.holding ?? ''),
    ].join(' '),
    names,
  );
}

/** Which scene serves each beat, from 0: the first whose plan names it; -1 for none. */
function sceneOfBeats(story: StudioStory, outline: StudioOutline): number[] {
  const out = story.beats.beats.map(() => -1);
  story.plan.scenes.forEach((scene, j) => {
    const k =
      outline.scenes.findIndex((s) => s.title === scene.title) >= 0
        ? outline.scenes.findIndex((s) => s.title === scene.title)
        : story.plan.scenes.length === outline.scenes.length
          ? j
          : -1;
    if (k < 0) return;
    for (const b of scene.beats) if (b < out.length && out[b] < 0) out[b] = k;
  });
  return out;
}

/**
 * Plants in the words (§1.3): what a beat plants is in the words of the
 * scene that serves it (or one before), and what a beat pays off is in
 * the words of its scene. A habit or a running gag runs by itself.
 */
export function checkPlantsShown(
  story: StudioStory,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: StudioBible,
): ScriptNote[] {
  const context = contextOf(bible, story.premise);
  const names = new Set((context.names ?? []).flatMap((n) => stemsOf(n)));
  const words = sheets.map((sheet) => sceneStems(sheet, names));
  const serves = sceneOfBeats(story, outline);
  const out: ScriptNote[] = [];
  /** Whether a scene's words have a plant: by its short id, or by half its words. */
  const has = (k: number, plant: { stems: string[]; idStems: string[] }) =>
    k >= 0 &&
    k < words.length &&
    (covered(plant.idStems, words[k]) >= 0.5 ||
      covered(plant.stems, words[k]) >= 0.5);
  for (const tracked of trackSetups(story.beats, context).plants) {
    if (tracked.running || !tracked.stems.length) continue;
    const k = serves[tracked.at];
    if (k < 0 || k >= sheets.length) continue;
    const planted = Array.from({ length: k + 1 }, (_, j) => j).some((j) =>
      has(j, tracked),
    );
    if (!planted)
      out.push({
        scene: k,
        kind: 'plant',
        message: `This scene plants "${tracked.plant.what}" for later, but its words never show it: let us see or hear it here (a thing handled, a line, a look at it).`,
      });
    // Paid off where the beats say (else where a later beat carries it
    // out): in the words of one of the scenes that play those beats.
    const paying = [
      ...new Set(
        (tracked.paid.length ? tracked.paid : tracked.shown)
          .map((at) => serves[at])
          .filter((j) => j > k && j < sheets.length),
      ),
    ];
    if (paying.length && !paying.some((j) => has(j, tracked)))
      out.push({
        scene: paying[paying.length - 1],
        kind: 'plant',
        message: `This scene pays off "${tracked.plant.what}", planted in scene ${k + 1}, but its words never bring it back: let it come back here, and matter.`,
      });
  }
  return out;
}

/**
 * Each scene's turn (§1.4) as written: its planned turn should show in
 * what is said and done. Code hears it by its words; a turn none of
 * whose words are in the scene is a note.
 */
export function checkTurnsShown(
  story: StudioStory,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: StudioBible,
): ScriptNote[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const out: ScriptNote[] = [];
  sheets.forEach((sheet, k) => {
    const plan = planned(outline, k);
    if (!plan?.turn) return;
    const turn = stemsOf(plan.turn, names);
    if (turn.length < 3) return;
    const said = sceneStems(sheet, names);
    if (covered(turn, said) < 0.2)
      out.push({
        scene: k,
        kind: 'turn',
        message: `The scene's turn, as planned, does not show in what is said or done: by its end, ${plan.turn.replace(/[.!]+$/u, '')}.`,
      });
  });
  return out;
}

// ── Lines that do things (W2–W11, C4) ─────────────────────────────────────

/** The deadline said as a move between people: a threat, a warning, a bargain, an order, a plea. */
const CLOCK_AIMS: ReadonlySet<LineAim> = new Set<LineAim>([
  'warns',
  'threatens',
  'bargains',
  'orders',
  'pleads',
  'begs',
]);
/** "As you know, Bob": telling someone what they already know (W5). */
const AS_YOU_KNOW =
  /\b(?:as you know|as you well know|like i (?:told|said)|as i (?:said|told)|you know (?:that )?i\b|remember (?:that|when) we|you already know)\b/iu;
/** A feeling said outright (W6). */
const STATED_FEELING =
  /\bi(?:['’]m| am| feel)(?: so| really| very| a bit| just| kind of)? (?:sad|angry|mad|scared|afraid|nervous|jealous|happy|upset|worried|lonely|embarrassed|hurt|frustrated|terrified|anxious|heartbroken)\b/iu;
/** A scene opening on a hello (W7). */
const GREETING =
  /^(?:hi|hello|hey|good (?:morning|afternoon|evening)|howdy|greetings)\b/iu;
/** Remarking on how absurd it all is, which breaks a comedy's spell (W9). */
const ABSURD_REMARK =
  /\b(?:this is (?:so |completely |totally |just )?(?:crazy|insane|ridiculous|absurd|weird|nuts|bananas|madness)|what is (?:even )?happening|what['’]s (?:even )?happening|are you kidding|this can(?:not|['’]t) be (?:real|happening))\b/iu;
/** A summary or a lesson at the end, not a button (W10). */
const LESSON =
  /\b(?:learned|learnt|the lesson|from now on|and that['’]?s why|the moral)\b/iu;

/** How many people may speak in a film this long (C4): two or three under two minutes, four under five. */
export const facesFor = (minutes: number | null | undefined): number =>
  (minutes ?? 1) <= 2 ? 3 : (minutes ?? 1) <= 5 ? 4 : 6;

const wordCount = (said: string) => said.split(/\s+/u).filter(Boolean).length;

/**
 * The lint of lines as moves (W2–W11, C4), each a note for its scene:
 * - every line has an aim from the list, and is said to someone when
 *   anyone else is there;
 * - the same aim three times running from one speaker is flagged;
 * - the deadline, the first time it is said, is a threat, a warning or a
 *   bargain between people;
 * - no "as you know", no feelings said outright, no scene opening on a
 *   hello, no more than one line over twenty words a scene, no speaker
 *   with three lines running;
 * - in a comedy, a take (a reaction or a pause) after a joke, and nobody
 *   remarking on how absurd it is;
 * - the last line is a button, never a lesson (unless the ending is a moral);
 * - no more speaking faces than a film this long can teach.
 */
export function lintLines(
  sheets: readonly StorySheet[],
  bible: Pick<StudioBible, 'characters'>,
  opts: {
    genre?: string | null;
    ending?: string | null;
    minutes?: number | null;
    /** Which scene the first sheet is, from 0: a scene checked alone. */
    from?: number;
  } = {},
): ScriptNote[] {
  const nameOf = (id: string | null) =>
    bible.characters.find((c) => c.id === id)?.name ?? id ?? 'someone';
  const funny = opts.genre === 'comedy' || opts.genre === 'dark-comedy';
  const base = opts.from ?? 0;
  const out: ScriptNote[] = [];
  let clockSaid = false;
  const speakers: string[] = [];
  sheets.forEach((sheet, i) => {
    const k = base + i;
    const note = (kind: ScriptNote['kind'], message: string) =>
      out.push({ scene: k, kind, message });
    const here = new Set(sheet.onStage.map((p) => p.who));
    const aimless: string[] = [];
    const toNoOne: string[] = [];
    const long: string[] = [];
    const aims = new Map<string, LineAim[]>();
    let repeated = false;
    let runFlagged = false;
    let firstLine = true;
    sheet.beats.forEach((beat, j) => {
      if (beat.kind === 'action' && beat.who) {
        if (beat.do === 'enter') here.add(beat.who);
        if (beat.do === 'leave' || beat.do === 'go-through')
          here.delete(beat.who);
      }
      if (beat.kind !== 'line' || !beat.who) return;
      const from = beat.from ?? 'here';
      const at = `beat ${j + 1}: "${beat.say}"`;
      // W7: a scene that opens on a hello.
      if (firstLine && j <= 1 && GREETING.test(beat.say.trim()))
        note(
          'lint',
          `Beat ${j + 1}: the scene opens on a hello ("${beat.say}"): enter late. Start inside the trouble and cut the greetings.`,
        );
      firstLine = false;
      if (
        (from === 'here' || from === 'off' || from === 'phone') &&
        !speakers.includes(beat.who)
      ) {
        speakers.push(beat.who);
        if (speakers.length === facesFor(opts.minutes) + 1)
          note(
            'lint',
            `${nameOf(beat.who)} is the ${speakers.length}th person to speak: a film this short has room for ${facesFor(opts.minutes)} speaking faces at most. Give their line to someone we know, or let them only be seen.`,
          );
      }
      // W2: an aim, from the list.
      if (!beat.aim && from !== 'letter') aimless.push(at);
      if (beat.aim) {
        const had = aims.get(beat.who) ?? [];
        had.push(beat.aim);
        aims.set(beat.who, had);
        if (
          !repeated &&
          had.length >= 3 &&
          had.slice(-3).every((a) => a === beat.aim)
        ) {
          repeated = true;
          note(
            'aim',
            `${nameOf(beat.who)} ${beat.aim} three times running (to beat ${j + 1}): change the move (a threat becomes a bargain, a question a dare), so the scene goes somewhere.`,
          );
        }
      }
      // Said to someone when anyone else is there.
      const others = [...here].filter((id) => id !== beat.who);
      if (
        from === 'here' &&
        !beat.to &&
        others.length &&
        !saidAway(sheet, beat, here, bible)
      )
        toNoOne.push(at);
      // W4: the deadline, the first time, as a move between people.
      if (CLOCK_TIME.test(beat.say) && from !== 'letter') {
        if (!clockSaid && beat.aim && !CLOCK_AIMS.has(beat.aim))
          note(
            'aim',
            `Beat ${j + 1}: the deadline is first said as "${beat.say}" (${beat.aim}): say it once as a threat, a warning or a bargain between people, with its reason ("by noon, or the order goes to the shop across the road").`,
          );
        clockSaid = true;
      }
      // W5: as you know.
      if (AS_YOU_KNOW.test(beat.say))
        note(
          'lint',
          `Beat ${j + 1}: "${beat.say}" tells ${beat.to ? nameOf(beat.to) : 'someone'} what they already know: give it to someone who does not know it, turn it into a fight, or let a thing on screen show it.`,
        );
      // W6: a feeling said outright.
      const lastScene = k === base + sheets.length - 1;
      if (
        from !== 'thought' &&
        STATED_FEELING.test(beat.say) &&
        !(opts.ending === 'moral' && lastScene)
      )
        note(
          'lint',
          `Beat ${j + 1}: "${beat.say}" says the feeling outright: show it in what ${nameOf(beat.who)} does (a hand that will not let go, a step back), and let the line say something else.`,
        );
      // W11: long lines, and speeches.
      if (wordCount(beat.say) > 20) long.push(at);
      const prev = sheet.beats.slice(Math.max(0, j - 2), j);
      if (
        !runFlagged &&
        prev.length === 2 &&
        prev.every((b) => b.kind === 'line' && b.who === beat.who)
      ) {
        runFlagged = true;
        note(
          'lint',
          `Beats ${j - 1} to ${j + 1}: ${nameOf(beat.who)} has three lines running: break it with a reaction, an interruption or an answer.`,
        );
      }
      if (funny) {
        // W9: deadpan.
        if (ABSURD_REMARK.test(beat.say))
          note(
            'comedy',
            `Beat ${j + 1}: "${beat.say}" remarks on how strange it is, which breaks the spell: in a comedy everyone takes it dead seriously and chases their goal.`,
          );
        // W8: the take after a joke.
        if (beat.aim === 'jokes') {
          const next = sheet.beats.slice(j + 1, j + 3);
          if (
            next.length &&
            !next.some((b) => b.kind === 'reaction' || b.kind === 'pause')
          )
            note(
              'comedy',
              `Beat ${j + 1}: the joke "${beat.say}" has no take: put a pause or a reaction (the listener's look) right after it, before the next line.`,
            );
        }
      }
    });
    if (aimless.length)
      note(
        'aim',
        `Lines with no aim: ${aimless.slice(0, 4).join('; ')}. Every line does something to the one it is said to: asks, refuses, warns, bargains, teases, accuses, pleads, lies. Give each an aim, or cut it and let the picture carry it.`,
      );
    if (toNoOne.length)
      note(
        'aim',
        `Lines said to no one while others are there: ${toNoOne.slice(0, 4).join('; ')}. Say each to someone (to), so it does something to them.`,
      );
    if (long.length > 1)
      note(
        'lint',
        `${long.length} lines over twenty words (${long.slice(0, 3).join('; ')}): one a scene at most. Cut them down, or break them with a reaction.`,
      );
  });
  // W10: the button.
  const last = sheets[sheets.length - 1];
  const lastLine = last
    ? [...last.beats]
        .reverse()
        .find((b) => b.kind === 'line' || b.kind === 'narration')
    : undefined;
  if (
    lastLine &&
    opts.ending !== 'moral' &&
    LESSON.test(lastLine.say) &&
    opts.from === undefined
  )
    out.push({
      scene: sheets.length - 1,
      kind: 'comedy',
      message: `The film ends on a summary ("${lastLine.say}"): end on a button instead, a laugh, a warm look or a callback, never a lesson.`,
    });
  return out;
}

/** When each part of the setup should have landed in scene 1, in seconds, for a film this long (the first-minute template). */
export function openingBy(
  minutes: number | null | undefined,
): Record<SetupPart, number> {
  const m = minutes ?? 1;
  return m <= 1
    ? { want: 15, obstacle: 15, stakes: 20, clock: 20, oddity: 25 }
    : m <= 3
      ? { want: 25, obstacle: 25, stakes: 30, clock: 30, oddity: 40 }
      : { want: 45, obstacle: 45, stakes: 60, clock: 60, oddity: 75 };
}

/**
 * When each beat of a scene starts, in seconds, as the stage plays it:
 * lines at 2.5 words a second, and what happens between two lines timed
 * as the stage times a quiet (at the same time where the stage runs them
 * so, quickened to fit, a physical sequence held), never a flat three
 * seconds a move.
 */
export function startsOf(sheet: StorySheet): number[] {
  const at = sheet.beats.map(() => 0);
  const runs = quietRuns(sheet);
  let t = 0;
  const quiet = (after: number) => {
    const run = runs.get(after);
    if (!run) return;
    const timed = timeQuiet(run.map((j) => quietItem(sheet.beats[j])));
    run.forEach((j, k) => (at[j] = t + timed.starts[k]));
    t += timed.total;
  };
  quiet(-1);
  let spoken = -1;
  sheet.beats.forEach((beat, j) => {
    if (beat.kind !== 'line' && beat.kind !== 'narration') return;
    at[j] = t;
    if (!beat.say.trim()) return;
    t += Math.max(1, wordCount(beat.say) / 2.5);
    spoken += 1;
    quiet(spoken);
  });
  return at;
}

const PART_WORDS: Record<SetupPart, string> = {
  want: 'what the hero wants',
  obstacle: 'what stands in their way',
  stakes: 'what they lose if they fail',
  clock: 'by when',
  oddity: 'the one impossible thing working, with its rule',
};

/**
 * The opening, timed (W1, S1): scene 1 walked with a running clock (lines
 * at 2.5 words a second, the quiets between them as the stage plays
 * them: startsOf), and what is
 * said or handled by each point collected. The want, what is in the way,
 * the stakes, the clock and the impossible thing each land by their time
 * (by 25 s, 30 s and 40 s in a film of one to three minutes), in any
 * words that give them (conveys: their gist, or one clause of it, said
 * another way; the want by any of its own nouns, wantWords) or the plan's
 * for them. Each that does not is a note for scene 1. Nothing for a
 * premise developed before it had its parts.
 */
export function checkOpening(
  sheet: StorySheet,
  story: StudioStory | null | undefined,
  bible: Pick<StudioBible, 'characters'>,
  minutes: number | null | undefined,
): string[] {
  const premise = story?.premise;
  if (!premise || (!premise.want && !premise.obstacle)) return [];
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const st = (said: string) => stemsOf(said, names);
  const plan = story.plan.scenes[0];
  const by = openingBy(minutes);
  // What is seen from the start: the things on the stage, and in hands.
  const opening = st(
    [
      ...sheet.props.map((p) => p.prop),
      ...sheet.onStage.map((p) => p.holding ?? ''),
    ].join(' '),
  );
  const timeline: {
    at: number;
    kind: SheetBeat['kind'];
    who: string | null;
    stems: string[];
    clock: boolean;
  }[] = [];
  const starts = startsOf(sheet);
  for (const [j, beat] of sheet.beats.entries()) {
    const words = [
      beat.say,
      beat.thing ?? '',
      beat.prop ?? '',
      beat.doSaid ?? '',
    ].join(' ');
    timeline.push({
      at: starts[j],
      kind: beat.kind,
      who: beat.who,
      stems: st(words),
      clock:
        (beat.kind === 'line' || beat.kind === 'business') &&
        CLOCK_TIME.test(beat.say),
    });
  }
  /** What is said or shown by a time: everything, or only a kind of beat by someone (the plan's line, or its action). */
  const heardBy = (
    seconds: number,
    only?: { kinds: SheetBeat['kind'][]; by: string },
  ) => {
    const upTo = timeline.filter(
      (b) =>
        b.at < seconds &&
        (!only ||
          (only.kinds.includes(b.kind) && (!only.by || b.who === only.by))),
    );
    return {
      stems: [...(only ? [] : opening), ...upTo.flatMap((b) => b.stems)],
      clock: upTo.some((b) => b.clock),
    };
  };
  const parts: { part: SetupPart; words: string }[] = [
    { part: 'want', words: premise.want },
    { part: 'obstacle', words: premise.obstacle },
    { part: 'stakes', words: premise.stakes },
    { part: 'clock', words: premise.clock },
    {
      part: 'oddity',
      words: premise.oddity
        ? `${premise.oddity.what} ${premise.oddity.rule}`
        : '',
    },
  ];
  const keyWords = wantWords(premise, names);
  const out: string[] = [];
  // The hero is called by their name in scene 1, so the viewer knows whose story it is.
  const hero = bible.characters.find((c) => c.id === premise.hero);
  if (
    hero &&
    !sheet.beats.some(
      (b) =>
        (b.kind === 'line' || b.kind === 'narration') &&
        namesOf(hero).some((n) => wordIn(n, b.say)),
    )
  )
    out.push(
      `No one says ${hero.name}'s name in scene 1, so the viewer never learns whose story it is: let someone call ${hero.name} by name early on, in a line that does something to them.`,
    );
  for (const { part, words } of parts) {
    if (!words) continue;
    const piece = plan?.setup.find((p) => p.part === part);
    const heard = heardBy(by[part]);
    // The plan's own means: its line said by whom it names, its action
    // done by them, its thing anywhere on screen.
    const means = piece?.what
      ? piece.how === 'line'
        ? heardBy(by[part], { kinds: ['line'], by: piece.by })
        : piece.how === 'action'
          ? heardBy(by[part], { kinds: ['action', 'business'], by: piece.by })
          : heard
      : null;
    // Given in any words: its gist, or one clause of it, said another
    // way; the want, by any of its own nouns ("rent", of "the rent
    // envelope on the table inside her locked apartment").
    const said = gistStems(heard.stems);
    const got =
      conveys(words, said, names) ||
      (part === 'want' && keyWords.some((w) => covered([w], said) > 0)) ||
      (means && piece ? covered(st(piece.what), means.stems) >= 0.5 : false) ||
      // The plan's means played another way (its action as a line, or
      // done by someone else): most of its words by then.
      (piece?.what ? covered(st(piece.what), heard.stems) >= 0.6 : false) ||
      (part === 'clock' && heard.clock);
    if (got) continue;
    const how = piece
      ? piece.how === 'line'
        ? `as the plan has it, a line from ${piece.by} to ${piece.to}: "${piece.what}"`
        : piece.how === 'action'
          ? `as the plan has it, an action: ${piece.what}`
          : `as the plan has it, a thing on screen: ${piece.what}`
      : 'as a line said to someone, an action or a thing on screen';
    out.push(
      `By about ${by[part]} seconds into scene 1, nothing said or shown gives ${PART_WORDS[part]} (${words.replace(/[.!]+$/u, '')}). Land it before then, ${how}; never by a narrator.`,
    );
  }
  return out;
}

/** The plants a scene sets up, from the beats it serves: the real ones, never a habit or the running gag. */
export function plantsOfScene(
  story: StudioStory,
  outline: StudioOutline,
  bible: Pick<StudioBible, 'characters'>,
  k: number,
): TrackedPlant[] {
  const context = contextOf(bible, story.premise);
  const serves = sceneOfBeats(story, outline);
  return trackSetups(story.beats, context).plants.filter(
    (p) => !p.running && p.stems.length && serves[p.at] === k,
  );
}

/** Whether a plant is a thing that can be handled (a spoon, a key ring), not a skill or a secret. */
const isThing = (plant: TrackedPlant) =>
  Boolean(
    thingNamed(plant.plant.what) ??
    thingNamed(plant.plant.id.replace(/-/gu, ' ')),
  );

/** The beat that handles a planted thing on screen (business with it as its thing), from 0; -1 for none. */
function handledAt(
  sheet: StorySheet,
  plant: TrackedPlant,
  names: ReadonlySet<string>,
): number {
  return sheet.beats.findIndex((b) => {
    if (b.kind !== 'business') return false;
    const handled = stemsOf(`${b.thing ?? ''} ${b.prop ?? ''} ${b.say}`, names);
    return (
      covered(plant.idStems, handled) >= 0.5 ||
      covered(plant.stems, handled) >= 0.5
    );
  });
}

/**
 * Planted things handled on screen (K5): a thing a scene plants is taken,
 * given or used as business in it, so the viewer sees it before it
 * matters. Each that is only talked about is a note.
 */
export function checkPlantsHandled(
  story: StudioStory,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: Pick<StudioBible, 'characters'>,
): ScriptNote[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const out: ScriptNote[] = [];
  sheets.forEach((sheet, k) => {
    for (const plant of plantsOfScene(story, outline, bible, k))
      if (isThing(plant) && handledAt(sheet, plant, names) < 0)
        out.push({
          scene: k,
          kind: 'plant',
          message: `"${plant.plant.what}" is planted here for later: let someone handle it on screen (a business beat with it as the thing: take, give, use, put), so the viewer sees it before it matters.`,
        });
  });
  return out;
}

/**
 * The inserts a scene's sheet asks the camera for (K5), as data: each
 * planted thing it handles, at the first beat that handles it.
 */
export function insertsFor(
  sheet: StorySheet,
  plants: readonly TrackedPlant[],
  bible: Pick<StudioBible, 'characters'>,
): SheetInsert[] {
  const names = new Set(
    bible.characters.flatMap((c) => [c.id, ...stemsOf(c.name)]),
  );
  const out: SheetInsert[] = [];
  for (const plant of plants) {
    if (!isThing(plant)) continue;
    const at = handledAt(sheet, plant, names);
    if (at < 0) continue;
    const beat = sheet.beats[at];
    const thing = beat.thing ?? beat.prop ?? plant.plant.id;
    if (!out.some((one) => one.beat === at)) out.push({ beat: at, thing });
  }
  return out.sort((a, b) => a.beat - b.beat);
}

/** A film's length in minutes, from its outline's seconds. */
export const minutesOf = (outline: StudioOutline): number =>
  outline.scenes.reduce((n, s) => n + (s.seconds ?? 0), 0) / 60;

/** Everything code sees across a story's script, scene by scene. */
export function checkScript(
  story: StudioStory | null | undefined,
  sheets: readonly StorySheet[],
  outline: StudioOutline,
  bible: StudioBible,
): ScriptNote[] {
  const minutes = minutesOf(outline);
  const opening =
    sheets[0] && story ? checkOpening(sheets[0], story, bible, minutes) : [];
  return [
    ...lintVoices(sheets, bible),
    ...lintTelling(sheets, bible),
    ...lintLines(sheets, bible, {
      genre: story?.premise.genre ?? null,
      ending: story?.premise.ending ?? null,
      minutes,
    }),
    ...opening.map((message) => ({
      scene: 0,
      kind: 'opening' as const,
      message,
    })),
    ...(story
      ? [
          ...checkPlantsShown(story, sheets, outline, bible),
          ...checkPlantsHandled(story, sheets, outline, bible),
          ...checkTurnsShown(story, sheets, outline, bible),
        ]
      : []),
  ];
}

/** What the first scene's writer is told when a first-time viewer could not follow it. */
function clarityNotes(
  viewer: ColdRead | null,
  misses: readonly string[] = [],
  unsure: readonly string[] = [],
  confused: readonly string[] = viewer?.confused ?? [],
): string[] {
  return [
    ...(misses.length || unsure.length
      ? [
          `Against the story, the first-time viewer got it wrong: ${[...misses, ...unsure].join('; ')}. Make each of these plain in what is said and done in this scene.`,
        ]
      : []),
    ...(viewer
      ? [
          `A first-time viewer, seeing and hearing only this scene, thought it was about: "${viewer.about}"${viewer.sentence ? `; in one sentence: "${viewer.sentence}"` : ''}; wants: "${viewer.wants || 'could not tell'}"; at stake: "${viewer.stakes || 'could not tell'}"; by when: "${viewer.clock || 'no clock seen'}"${confused.length ? `; confused by: ${confused.join('; ')}` : ''}.`,
        ]
      : []),
    FIRST_SCENE_RULE,
  ];
}

/**
 * The first scene's rule (the clarity item's), for its writer: what a
 * first-time viewer must know by its end, from what is seen and said.
 */
export const FIRST_SCENE_RULE = [
  'This is the first scene: by its end a first-time viewer, who sees and hears only the film, can finish the sentence "[who] wants [a thing we can see] because [what it means to them], but [what is in the way], by [when] or else [what they lose]".',
  "Open on the place and the hero doing their everyday thing, in a way that makes us care; then the problem arrives, as an action or a line said to them by someone with a reason; then the hero shows or says what they must get, and the obstacle is seen. Follow the plan's setup: each part by the line, the action or the thing it names.",
  'By about twenty seconds in (thirty in a film of two minutes or more), someone has said or shown what the hero wants, what stops them and by when: through lines that do something to someone (a threat, a bargain, an accusation), or through actions and things. Never through a narrator, and never a line describing what we can see.',
  'Say the deadline once, as a threat, a promise or a bargain between people, with its reason ("by midnight, or the lock is changed"); after that it is felt through things and pressure (a clock face, a phone buzzing, a glance), never announced.',
  'A fact comes out when someone uses it to get what they want, never as an explanation, and never told to someone who already knows it ("as you know").',
  'Who each person is to the hero comes out in how they talk to each other. Anything impossible in this world is shown working once, with its rule, before the story leans on it, so the viewer believes it.',
].join(' ');

/** Code's notes in words, for the table read: scene by scene. */
export function describeNotes(notes: readonly ScriptNote[]): string {
  return notes.length
    ? notes
        .map((n) => `- Scene ${n.scene + 1} (${n.kind}): ${n.message}`)
        .join('\n')
    : 'Nothing.';
}

/**
 * The notes for one scene's writer, from the read and from code: the
 * critic's notes, the lines it heard as anyone's, and what code found.
 */
export function notesFor(
  k: number,
  read: TableRead,
  code: readonly ScriptNote[],
  bible: Pick<StudioBible, 'characters'>,
): string[] {
  const voiceOf = (who: string) => {
    const c = bible.characters.find(
      (x) =>
        x.id === who.toLowerCase() ||
        x.name.toLowerCase() === who.toLowerCase(),
    );
    return c?.persona?.voice
      ? ` (${c.name} ${c.persona.voice.replace(/[.!]+$/u, '')})`
      : '';
  };
  const count = read.scenes.length;
  // Code's notes, what most loses a viewer first, a few at most: a rewrite
  // told too much at once loses what already worked.
  const rank: ScriptNote['kind'][] = [
    'opening',
    'retell',
    'telling',
    'aim',
    'plant',
    'turn',
    'comedy',
    'lint',
    'voice',
  ];
  const codes = code
    .filter((n) => n.scene === k)
    .sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind))
    .slice(0, 5)
    .map((n) => n.message);
  const clarity =
    k === 0 && unclear(read)
      ? clarityNotes(read.viewer, read.misses, read.unsure, read.confused)
      : [];
  // Scene 1 of a film a first-time viewer could not follow: what they
  // got wrong and what they made of it lead, and the critic's own notes
  // are fewer, so the list never cuts the viewer's read away. The rule
  // itself goes last: the writer is given it with the scene as well.
  const critic = (read.scenes[k]?.notes ?? []).slice(
    0,
    clarity.length ? 4 : undefined,
  );
  return [
    // What a first-time viewer missed comes first: nothing matters more.
    ...clarity.slice(0, -1),
    ...critic,
    ...read.voice
      .filter((v) => v.scene === k)
      .map(
        (v) =>
          `"${v.line}" could be anyone's line${v.why ? ` (${v.why})` : ''}: say it as ${v.who || 'its speaker'} would${voiceOf(v.who)}.`,
      ),
    ...codes,
    ...clarity.slice(-1),
    ...(k === 0 && (read.scores.hook ?? 10) < BAR.item
      ? [
          'Open with a hook: a joke, a mystery or a problem in the first seconds.',
        ]
      : []),
    ...(k === count - 1 && (read.scores.button ?? 10) < BAR.item
      ? ['End on a button: a last laugh or a warm beat, never a summary.']
      : []),
  ].slice(0, 12);
}

/**
 * The screenwriting notes code can put right itself, so a scene is not
 * sent back to its writer for them (Richard, 2026-09-30: "Cut the
 * rewrites"): the hero called by name in scene 1, a line with no aim
 * given the one its words carry, and a line said to no one while others
 * are there said to the one it is for. What code cannot put right (a
 * line that reports, the want landed late, a long quiet) is only noted,
 * for the log and the table read's score.
 *
 * And what a scene still goes back to its writer for, at most once: only
 * what the stage cannot play (an error: narration in a film with no
 * narrator, someone who is none of the cast, a broken sheet), someone the
 * plan puts in the scene who never comes into it, and the lines a change
 * the maker asked for lost.
 *
 * Also the checklist the writer is given with its first ask, so the first
 * draft keeps the rules and no second call is paid for.
 */
import {
  LINE_AIMS,
  LINE_WORDS,
  WORDS_A_SECOND,
  namesOf,
  secondsOf,
  type LineAim,
  type OutlineScene,
  type SheetBeat,
  type StorySheet,
  type StudioBible,
  type StudioBrief,
  type StudioOutline,
} from './studio';
import { readLine } from '../scene-performance';
import type { SheetProblem } from './studio-check';
import { isStockLine } from './studio-script';
import type { NarratorRule } from './studio-narrator';
import type { PlannedScene, SetupPart, StudioStory } from './studio-story';

const AIMS = new Set<string>(LINE_AIMS);

const wordCount = (said: string) => said.split(/\s+/u).filter(Boolean).length;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const says = (name: string, said: string) =>
  new RegExp(`(?:^|[^\\p{L}])${escape(name)}(?![\\p{L}])`, 'iu').test(said);

/** About how long a beat plays, for timing an opening: lines at 2.5 words a second, a move about 3 s. */
function secondsOfBeat(beat: SheetBeat): number {
  if (beat.kind === 'line' || beat.kind === 'narration')
    return Math.max(1, wordCount(beat.say) / 2.5);
  if (beat.kind === 'action' || beat.kind === 'business') return 3;
  if (beat.kind === 'reaction') return 1;
  return beat.seconds ?? 1;
}

/** Who is on the stage as each beat plays, by id, from the opening and the comings and goings. */
function presentAt(sheet: StorySheet): Set<string>[] {
  const here = new Set(sheet.onStage.map((p) => p.who));
  return sheet.beats.map((beat) => {
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter') here.add(beat.who);
      if (
        beat.do === 'leave' ||
        beat.do === 'squeeze' ||
        beat.do === 'go-through'
      )
        here.delete(beat.who);
    }
    return new Set(here);
  });
}

/** A line's words with a name said to the one it is for: after its first sentence's words, "Stop, Nadia. Give it back!". */
export function withName(say: string, name: string): string {
  const trimmed = say.trim();
  if (/^[-—–]|[-—–]$/u.test(trimmed) && !/[.!?…]/u.test(trimmed))
    return `${name}, ${trimmed}`;
  const end = trimmed.search(/[.!?…]+(?:["'”’])?(?:\s|$)/u);
  if (end > 0) return `${trimmed.slice(0, end)}, ${name}${trimmed.slice(end)}`;
  return `${trimmed.replace(/[,;:]+$/u, '')}, ${name}`;
}

/**
 * Scene 1 with the hero called by name, where no one says it: the first
 * line said to them by someone else (early, where there is one) takes
 * their name. Unchanged where their name is said, or no one speaks to
 * them.
 */
export function nameTheHero(
  sheet: StorySheet,
  story: Pick<StudioStory, 'premise'> | null | undefined,
  bible: Pick<StudioBible, 'characters'>,
  /** By when it should be said, in seconds. */
  by = 25,
): { sheet: StorySheet; fixed: string[] } {
  const hero = bible.characters.find((c) => c.id === story?.premise.hero);
  if (!hero) return { sheet, fixed: [] };
  const names = namesOf(hero);
  const said = sheet.beats.some(
    (b) =>
      (b.kind === 'line' || b.kind === 'narration') &&
      names.some((n) => says(n, b.say)),
  );
  if (said) return { sheet, fixed: [] };
  const present = presentAt(sheet);
  const known = new Set(bible.characters.map((c) => c.id));
  let t = 0;
  const candidates: { at: number; early: boolean; toHero: boolean }[] = [];
  sheet.beats.forEach((beat, at) => {
    const start = t;
    t += secondsOfBeat(beat);
    if (beat.kind !== 'line' || !beat.who || beat.who === hero.id) return;
    if (
      !known.has(beat.who) ||
      beat.from === 'letter' ||
      beat.from === 'thought'
    )
      return;
    const toHero = beat.to === hero.id;
    // Said to no one, with the hero there: it is said to them.
    const free = !beat.to && present[at].has(hero.id);
    if (!toHero && !free) return;
    if (wordCount(beat.say) + wordCount(hero.name) > LINE_WORDS) return;
    candidates.push({ at, early: start < by, toHero });
  });
  const pick =
    candidates.find((c) => c.early && c.toHero) ??
    candidates.find((c) => c.early) ??
    candidates.find((c) => c.toHero) ??
    candidates[0];
  if (!pick) return { sheet, fixed: [] };
  const beats = sheet.beats.map((beat, at) =>
    at === pick.at
      ? { ...beat, to: hero.id, say: withName(beat.say, hero.name) }
      : beat,
  );
  return {
    sheet: { ...sheet, beats },
    fixed: [
      `beat ${pick.at + 1}: ${hero.name} called by name ("${beats[pick.at].say}")`,
    ],
  };
}

/** Lines with no aim given the one their words carry, as the film reads them anyway; one whose words carry none is left. */
export function aimsFromWords(sheet: StorySheet): {
  sheet: StorySheet;
  fixed: string[];
} {
  const fixed: string[] = [];
  const beats = sheet.beats.map((beat, at) => {
    if (beat.kind !== 'line' || beat.aim || beat.from === 'letter') return beat;
    const read = readLine(beat.say.split(/\s+/u).filter(Boolean), {
      to: beat.to,
    });
    if (!AIMS.has(read.aim)) return beat;
    fixed.push(`beat ${at + 1}: aim "${read.aim}" from its words`);
    return { ...beat, aim: read.aim as LineAim };
  });
  return fixed.length
    ? { sheet: { ...sheet, beats }, fixed }
    : { sheet, fixed };
}

/**
 * Lines said to no one while others are there, said to someone: the only
 * other one there; else whoever spoke last, or speaks next, of those
 * there; else the first of them.
 */
export function linesToSomeone(sheet: StorySheet): {
  sheet: StorySheet;
  fixed: string[];
} {
  const present = presentAt(sheet);
  const fixed: string[] = [];
  const speakers = sheet.beats.map((b) => (b.kind === 'line' ? b.who : null));
  const beats = sheet.beats.map((beat, at) => {
    if (beat.kind !== 'line' || !beat.who || beat.to) return beat;
    if ((beat.from ?? 'here') !== 'here') return beat;
    const others = [...present[at]].filter((id) => id !== beat.who);
    if (!others.length) return beat;
    const last = speakers
      .slice(0, at)
      .reverse()
      .find((id) => id && others.includes(id));
    const next = speakers.slice(at + 1).find((id) => id && others.includes(id));
    const to = others.length === 1 ? others[0] : (last ?? next ?? others[0]);
    fixed.push(`beat ${at + 1}: said to ${to}`);
    return { ...beat, to };
  });
  return fixed.length
    ? { sheet: { ...sheet, beats }, fixed }
    : { sheet, fixed };
}

/** Every craft note code can put right, put right: in scene 1 the hero named; every line said to someone and with an aim. */
export function fixCraft(
  sheet: StorySheet,
  bible: Pick<StudioBible, 'characters'>,
  outline: Pick<StudioOutline, 'story'>,
  k: number,
  minutes = 1,
): { sheet: StorySheet; fixed: string[] } {
  const to = linesToSomeone(sheet);
  const named =
    k === 0
      ? nameTheHero(to.sheet, outline.story, bible, minutes <= 1 ? 15 : 25)
      : { sheet: to.sheet, fixed: [] };
  const aimed = aimsFromWords(named.sheet);
  return {
    sheet: aimed.sheet,
    fixed: [...to.fixed, ...named.fixed, ...aimed.fixed],
  };
}

/** A scene may run this much over its planned seconds before code trims it. */
export const TRIM_OVER = 1.15;

/**
 * Small moves of the body that change nothing on the stage (no one goes
 * anywhere, sits, falls or takes anything): what a scene that runs long
 * loses first. The acting still gestures from the lines.
 */
const SMALL_MOVES = new Set<string>([
  'wave',
  'nod',
  'shake',
  'laugh',
  'hop',
  'clap',
  'shrug',
  'lean-in',
  'look',
  'point',
  'reach',
  'spin',
  'bow',
  'wag',
  'lick',
  'sniff',
  'bark-bounce',
  'jump',
  'wriggle',
  'shake-off',
]);

/** The sheet without the beats at `drop`, the camera and the inserts moved with the beats they were on. */
function withoutBeats(
  sheet: StorySheet,
  drop: ReadonlySet<number>,
): StorySheet {
  const kept: number[] = [];
  sheet.beats.forEach((_, k) => {
    if (!drop.has(k)) kept.push(k);
  });
  // A shot on a beat that went is taken at the next one kept.
  const moved = (at: number) => kept.findIndex((k) => k >= at);
  const camera = sheet.camera.flatMap((shot) => {
    const at = moved(shot.beat);
    return at < 0 ? [] : [{ ...shot, beat: at }];
  });
  const out: StorySheet = {
    ...sheet,
    beats: kept.map((k) => sheet.beats[k]),
    // One shot a beat: the last asked for it.
    camera: camera.filter(
      (shot, i) => !camera.slice(i + 1).some((s) => s.beat === shot.beat),
    ),
  };
  if (sheet.inserts) {
    const inserts = sheet.inserts.flatMap((one) =>
      drop.has(one.beat) ? [] : [{ ...one, beat: kept.indexOf(one.beat) }],
    );
    if (inserts.length) out.inserts = inserts;
    else delete out.inserts;
  }
  return out;
}

/**
 * A scene that runs well over its planned seconds (by more than
 * TRIM_OVER) trimmed toward them by code, never by another call: first
 * the small moves of the body that change nothing on the stage (the ones
 * in a quiet between lines first, the latest first), then pauses held
 * over a second cut to one, then lines anyone could say ("Okay!", "Let's
 * go!"), never in scene 1, where the setup is, and never below two lines.
 */
export function trimToLength(
  sheet: StorySheet,
  planned: number | null,
  opts: { first?: boolean } = {},
): { sheet: StorySheet; fixed: string[] } {
  if (!planned) return { sheet, fixed: [] };
  const most = planned * TRIM_OVER;
  const was = secondsOf(sheet);
  if (was <= most) return { sheet, fixed: [] };
  const isLine = (k: number) =>
    sheet.beats[k]?.kind === 'line' || sheet.beats[k]?.kind === 'narration';
  const drop = new Set<number>();
  const fixed: string[] = [];
  const now = () => secondsOf(withoutBeats(sheet, drop));
  const small = sheet.beats
    .map((beat, k) => ({ beat, k }))
    .filter(
      ({ beat }) =>
        beat.kind === 'action' && beat.do !== null && SMALL_MOVES.has(beat.do),
    )
    .map(({ k }) => ({ k, quiet: !isLine(k - 1) || !isLine(k + 1) }))
    .sort((a, b) => Number(b.quiet) - Number(a.quiet) || b.k - a.k);
  for (const { k } of small) {
    if (now() <= most) break;
    drop.add(k);
  }
  if (drop.size)
    fixed.push(
      `${drop.size} small move${drop.size > 1 ? 's' : ''} cut for length`,
    );
  let out = withoutBeats(sheet, drop);
  if (secondsOf(out) > most) {
    const held = out.beats.filter(
      (b) => b.kind === 'pause' && (b.seconds ?? 1) > 1,
    ).length;
    if (held) {
      out = {
        ...out,
        beats: out.beats.map((b) =>
          b.kind === 'pause' && (b.seconds ?? 1) > 1 ? { ...b, seconds: 1 } : b,
        ),
      };
      fixed.push(`${held} long pause${held > 1 ? 's' : ''} cut to a second`);
    }
  }
  if (secondsOf(out) > most && !opts.first) {
    const lines = out.beats.filter((b) => b.kind === 'line').length;
    const stock = out.beats
      .map((b, k) => ({ b, k }))
      .filter(({ b }) => b.kind === 'line' && isStockLine(b.say))
      .map(({ k }) => k)
      .reverse();
    const cut = new Set<number>();
    for (const k of stock) {
      if (lines - cut.size <= 2) break;
      if (secondsOf(withoutBeats(out, cut)) <= most) break;
      cut.add(k);
    }
    if (cut.size) {
      out = withoutBeats(out, cut);
      fixed.push(
        `${cut.size} line${cut.size > 1 ? 's' : ''} anyone could say cut for length`,
      );
    }
  }
  const is = secondsOf(out);
  if (is === was) return { sheet, fixed: [] };
  return {
    sheet: out,
    fixed: [
      `trimmed from about ${was} to ${is} seconds (planned ${planned}): ${fixed.join('; ')}`,
    ],
  };
}

/**
 * Who the plan puts in the scene and never comes into it (not on the
 * stage, never entering, never speaking or doing anything): only the
 * cast who matter, never a minor part. A warning in itself (the stage
 * plays the scene without them), but a scene goes back to its writer
 * for it.
 */
export function missingCast(
  sheet: StorySheet,
  scene: Pick<OutlineScene, 'cast'> | null | undefined,
  bible: Pick<StudioBible, 'characters'>,
): SheetProblem[] {
  if (!scene) return [];
  const seen = new Set<string>([
    ...sheet.onStage.map((p) => p.who),
    ...sheet.beats.flatMap((b) => (b.who ? [b.who] : [])),
  ]);
  return scene.cast.flatMap((id): SheetProblem[] => {
    const who = bible.characters.find((c) => c.id === id);
    if (!who || who.role === 'minor' || seen.has(id)) return [];
    return [
      {
        rule: 'cast',
        message: `${who.name} is in this scene's plan but never comes into it: bring them on (on the stage as it opens, or with "enter") and give them something to say or do.`,
        beat: null,
        level: 'warning',
      },
    ];
  });
}

/**
 * What a scene goes back to its writer for, at most once: what the stage
 * cannot play (errors: narration past the maker's narrator, someone none
 * of the cast, a broken sheet), someone the plan has who never comes in,
 * and, written again as the maker asked, the lines it lost that no one
 * asked to lose. A length, a long quiet, a picture that stands still and
 * every craft note are logged, never sent back.
 */
export function hardFailures(
  problems: readonly SheetProblem[],
  missing: readonly SheetProblem[] = [],
): SheetProblem[] {
  return [
    ...problems.filter((p) => p.level === 'error' || p.rule === 'kept'),
    ...missing,
  ];
}

const PART_WORDS: Record<SetupPart, string> = {
  want: 'what the hero wants',
  obstacle: 'what is in the way',
  stakes: 'what they lose if they fail',
  clock: 'by when',
  oddity: 'the one impossible thing working, with its rule',
};

/**
 * The rules code will hold the first draft to, as a short checklist for
 * the writer's first ask: the scene's length in words, its hand-off, and
 * in scene 1 the hero's name and each part of the setup by its time.
 */
export function craftChecklist(input: {
  brief: Pick<StudioBrief, 'minutes'>;
  bible: Pick<StudioBible, 'characters'>;
  outline: StudioOutline;
  k: number;
  narrator: NarratorRule | null;
  /** When each part of the setup should land in scene 1, in seconds. */
  by?: Partial<Record<SetupPart, number>>;
}): string {
  const { bible, outline, k } = input;
  const scene = outline.scenes[k];
  const story = outline.story;
  const plan: PlannedScene | undefined =
    story?.plan.scenes.find((s) => s.title === scene?.title) ??
    (story && story.plan.scenes.length === outline.scenes.length
      ? story.plan.scenes[k]
      : undefined);
  const nameOf = (id: string) =>
    bible.characters.find((c) => c.id === id)?.name ?? id;
  const out: string[] = [];
  if (scene) {
    const words = Math.round(scene.seconds * WORDS_A_SECOND);
    out.push(
      `Its length is a hard limit: about ${scene.seconds} seconds. All its lines together come to at most ${words} words, less 7 words for every action or business beat (each move takes about three seconds): with 4 moves, ${Math.max(10, words - 28)} words at most. Count them before you answer: a scene over its time has its small moves and stock lines cut by code.`,
    );
    const matter = scene.cast.filter(
      (id) => bible.characters.find((c) => c.id === id)?.role !== 'minor',
    );
    if (matter.length)
      out.push(
        `${matter.map(nameOf).join(', ')} ${matter.length > 1 ? 'are' : 'is'} in it: each on the stage or coming on, with something to say or do.`,
      );
  }
  const hero = bible.characters.find((c) => c.id === story?.premise.hero);
  if (k === 0 && hero)
    out.push(
      `Someone calls ${hero.name} by name, in one of the first lines said to ${hero.name}.`,
    );
  if (k === 0 && plan?.setup.length)
    for (const piece of plan.setup) {
      const at = input.by?.[piece.part];
      out.push(
        `${at ? `By ${at} seconds in` : 'Early'}, ${PART_WORDS[piece.part]}: ${piece.how === 'line' ? `a line from ${nameOf(piece.by)} to ${nameOf(piece.to)}` : piece.how === 'action' ? `an action by ${nameOf(piece.by) || 'someone'}` : 'a thing on screen, handled or looked at'}: ${piece.what}`,
      );
    }
  out.push(
    'Every line has an aim, and a "to" whenever anyone else is on the stage; no line says what the viewer can see, what the listener already knows, or a feeling outright; no hello to open on.',
    'A line at least every six seconds (ten when there is real action): a longer quiet is broken with a line.',
  );
  if (input.narrator?.mode === 'none' || !input.narrator)
    out.push('No narration beats at all: this film has no narrator.');
  if (k > 0 && plan?.link)
    out.push(
      `Its first beats show why it follows the scene before: ${plan.link === 'but' ? 'something goes against it (but)' : 'it happens because of it (therefore)'}.`,
    );
  return `Before you answer, check each of these (code holds the sheet to them):\n- ${out.join('\n- ')}`;
}

/**
 * How the scene before will leave things, from its plan: for a scene
 * written at the same time as the one before it, which carries on from
 * how that one is planned to end. Code puts the hand-off right from how
 * it really ends, once both are written.
 */
export function plannedHandOff(
  outline: StudioOutline,
  k: number,
  bible: Pick<StudioBible, 'characters' | 'sets'>,
): string | null {
  if (k === 0) return null;
  const was = outline.scenes[k - 1];
  if (!was) return null;
  const story = outline.story;
  const plan =
    story?.plan.scenes.find((s) => s.title === was.title) ??
    (story && story.plan.scenes.length === outline.scenes.length
      ? story.plan.scenes[k - 1]
      : undefined);
  const nameOf = (id: string) =>
    bible.characters.find((c) => c.id === id)?.name ?? id;
  const place = bible.sets.find((s) => s.id === was.set)?.name ?? was.set;
  return [
    `The scene before (scene ${k}, "${was.title}") is being written at the same time as this one, to its plan: in ${place ?? 'its place'}${was.set ? ` (${was.set})` : ''} with ${was.cast.map((id) => `${nameOf(id)} (${id})`).join(', ') || 'no one'}. ${was.summary}`,
    plan?.turn ? `It ends: ${plan.turn}` : '',
    'Carry on from how it is planned to end: in the same place and time, the people there are still there unless they left; in a new place or time, start afresh. Hold in a hand only what this scene needs; code carries over what the scene before really leaves in whose hands, where people stand and what they wear.',
  ]
    .filter(Boolean)
    .join(' ');
}

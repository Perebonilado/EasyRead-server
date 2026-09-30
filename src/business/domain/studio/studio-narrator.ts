/**
 * The narrator as the maker set it (studio-story-plan §2): nowhere in a
 * pure film; lightly, one line to open or close a scene and to bridge to
 * the next; a storyteller throughout; or one of the cast telling it in
 * their own voice. A story whose maker chose none is a pure film: acted,
 * not narrated. The writer is told the rule, code checks each scene
 * keeps it, and what is over is made a line or an action where the words
 * say one, else cut.
 */
import type { SheetProblem } from './studio-check';
import {
  namesOf,
  type NarratorMode,
  type SheetBeat,
  type StorySheet,
  type StudioBible,
  type StudioBrief,
} from './studio';
import type { DoingId } from '../scene-doings';
import type { FigureFace } from '../scene-figure';

/** The narrator's rule for a show's scenes: its mode, and in "character" mode who tells it, by id. */
export interface NarratorRule {
  mode: NarratorMode;
  character: string | null;
}

/**
 * A story's narrator when the maker chose none: no one. Films are acted,
 * not narrated; a narrator is the maker's choice, never the Studio's.
 */
export const DEFAULT_NARRATOR: NarratorMode = 'none';

/** A light narrator speaks this many times a scene at most: once, to open it or to close it. */
export const LIGHT_MOST_NARRATIONS = 1;

/** The narrator a brief's story has: the maker's choice, else none. Null for an explainer, which a narrator teaches. */
export function narratorModeOf(
  brief: Pick<StudioBrief, 'narrator'> & {
    format?: StudioBrief['format'];
  },
): NarratorMode | null {
  if (brief.format === 'explainer') return null;
  return brief.narrator ?? DEFAULT_NARRATOR;
}

/** The most of a scene's spoken words the narrator may say, by mode. */
export const NARRATION_SHARE: Record<NarratorMode, number> = {
  none: 0,
  light: 0.1,
  storyteller: 0.35,
  character: 0.35,
};
/** A light narrator's one short bridge always fits, however short the scene: this many words. */
export const LIGHT_LEAST_WORDS = 8;

/** Who of the cast a name or an id is, by id; null for no one. */
export function castIdOf(
  said: string | null | undefined,
  bible: Pick<StudioBible, 'characters'> | null,
): string | null {
  if (!said || !bible) return null;
  const word = said.trim().toLowerCase();
  const found = bible.characters.find(
    (c) =>
      c.id === word || namesOf(c).some((name) => name.toLowerCase() === word),
  );
  return found?.id ?? null;
}

/** The brief's narrator as a rule for its scenes: none where the maker chose none; null for an explainer. */
export function narratorRuleOf(
  brief: Pick<StudioBrief, 'narrator' | 'narratorCharacter'> & {
    format?: StudioBrief['format'];
  },
  bible: Pick<StudioBible, 'characters'> | null = null,
): NarratorRule | null {
  const mode = narratorModeOf(brief);
  if (!mode) return null;
  return {
    mode,
    character:
      mode === 'character'
        ? (castIdOf(brief.narratorCharacter, bible) ??
          bible?.characters.find((c) => c.role === 'main')?.id ??
          null)
        : null,
  };
}

/** The narrator's rule in words, for the writers. */
export function narratorWords(
  brief: Pick<StudioBrief, 'narrator' | 'narratorCharacter'> & {
    format?: StudioBrief['format'];
  },
): string {
  switch (narratorModeOf(brief)) {
    case 'none':
      return 'Narrator: none. A pure film: no narration beats at all. Everything is told by what the characters say and do; where and when shows in the set, the time and the weather, and what matters is said by someone in the scene, in their own words.';
    case 'light':
      return 'Narrator: light. At most one short narration a scene, to open it or to close it (a bridge to the next), never in its middle, a tenth of its words at most; the characters carry everything else.';
    case 'storyteller':
      return 'Narrator: a warm storyteller throughout, as a picture book is read, but the characters still say their own lines: the narrator a third of the words at most.';
    case 'character':
      return `Narrator: ${brief.narratorCharacter || 'the main character'} tells it, in the first person ("I", "we"), in their own voice and way of speaking: narration beats are theirs, a third of the words at most; their own lines are still lines.`;
    default:
      return '';
  }
}

const wordCount = (say: string) => say.split(/\s+/).filter(Boolean).length;

/** Whether a beat is one of the scene's story beats (not a narration, not a pause). */
const isStory = (beat: SheetBeat) =>
  beat.kind !== 'narration' && beat.kind !== 'pause';

/** Where a light narrator may speak: before the first of the scene's story beats, or after the last. */
function atAnEdge(beats: readonly SheetBeat[], at: number): boolean {
  const first = beats.findIndex(isStory);
  let last = -1;
  beats.forEach((beat, k) => {
    if (isStory(beat)) last = k;
  });
  return first < 0 || at < first || at > last;
}

/** How many of a scene's spoken words are the narrator's, and of all. */
function shareOf(beats: readonly SheetBeat[]): {
  narrated: number;
  all: number;
} {
  let narrated = 0;
  let all = 0;
  for (const beat of beats) {
    if (beat.kind !== 'line' && beat.kind !== 'narration') continue;
    const n = wordCount(beat.say);
    all += n;
    if (beat.kind === 'narration') narrated += n;
  }
  return { narrated, all };
}

/** The most narrated words a scene of `all` words may have under a mode. */
const mostNarrated = (mode: NarratorMode, all: number) =>
  mode === 'light'
    ? Math.max(Math.floor(all * NARRATION_SHARE.light), LIGHT_LEAST_WORDS)
    : Math.floor(all * NARRATION_SHARE[mode]);

/** What a scene's narration breaks of the maker's narrator, each a problem for the writer. */
export function narrationProblems(
  sheet: StorySheet,
  bible: Pick<StudioBible, 'characters'>,
  rule: NarratorRule | null,
): SheetProblem[] {
  if (!rule) return [];
  const out: SheetProblem[] = [];
  const error = (message: string, beat: number | null = null) =>
    out.push({ rule: 'narrator', message, beat, level: 'error' });
  if (rule.mode === 'none') {
    sheet.beats.forEach((beat, k) => {
      if (beat.kind === 'narration')
        error(
          `Beat ${k + 1} is narration, and this film has no narrator: show it, or have someone say it.`,
          k,
        );
    });
    return out;
  }
  if (rule.mode === 'light') {
    let told = 0;
    sheet.beats.forEach((beat, k) => {
      if (beat.kind !== 'narration') return;
      if (!atAnEdge(sheet.beats, k))
        error(
          `Beat ${k + 1} is narration in the middle of the scene; the narrator only opens or closes a scene: show it, or have someone say it.`,
          k,
        );
      else if ((told += 1) > LIGHT_MOST_NARRATIONS)
        error(
          `Beat ${k + 1} is a second narration; a light narrator speaks once a scene at most, to open it or to close it: show it, or have someone say it.`,
          k,
        );
    });
  }
  const { narrated, all } = shareOf(sheet.beats);
  if (narrated > mostNarrated(rule.mode, all))
    error(
      `The narrator says ${narrated} of the scene's ${all} words; ${Math.round(NARRATION_SHARE[rule.mode] * 100)}% at most: let the characters say and do more of it.`,
    );
  if (
    rule.mode === 'character' &&
    rule.character &&
    !bible.characters.some((c) => c.id === rule.character)
  )
    out.push({
      rule: 'narrator',
      message: `The one telling the story ("${rule.character}") is none of the cast.`,
      beat: null,
      level: 'warning',
    });
  return out;
}

/** A move a narration's verb says, played by whoever it names. */
const VERB_DOINGS: [RegExp, DoingId][] = [
  [/^(?:looks?|glances?|stares?|peers?|peeks?|watches)\b/iu, 'look'],
  [/^nods?\b/iu, 'nod'],
  [/^shakes? (?:his|her|their|its) head\b/iu, 'shake'],
  [/^(?:laughs?|giggles?|chuckles?)\b/iu, 'laugh'],
  [/^claps?\b/iu, 'clap'],
  [/^(?:sobs?|cries|cry|weeps?)\b/iu, 'sob'],
  [/^shrugs?\b/iu, 'shrug'],
  [/^waves?\b/iu, 'wave'],
  [/^points?\b/iu, 'point'],
  [/^hops?\b/iu, 'hop'],
  [/^jumps?\b/iu, 'jump'],
  [/^(?:spins?|twirls?)\b/iu, 'spin'],
  [/^bows?\b/iu, 'bow'],
];
/** A face a narration's verb says. */
const VERB_FACES: [RegExp, FigureFace][] = [
  [/^(?:smiles?|grins?|beams?)\b/iu, 'happy'],
  [/^(?:sighs?|frowns?|pouts?|sniffs?|droops?)\b/iu, 'sad'],
  [/^gasps?\b/iu, 'surprised'],
  [/^(?:scowls?|glares?|huffs?|stamps?|fumes?)\b/iu, 'angry'],
  [/^(?:shivers?|trembles?|gulps?|freezes?|shudders?)\b/iu, 'afraid'],
  [/^(?:wonders?|thinks?|ponders?|frowns? in thought)\b/iu, 'thinking'],
];

const blank = (kind: SheetBeat['kind']): SheetBeat => ({
  kind,
  who: null,
  to: null,
  say: '',
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: null,
  pace: null,
  seconds: null,
});

/** Who is on the stage as a beat plays: those there as the scene opens, and those come on before it, less those gone. */
function onStageAt(sheet: StorySheet, at: number): Set<string> {
  const here = new Set(sheet.onStage.map((p) => p.who));
  sheet.beats.slice(0, at).forEach((beat) => {
    if (!beat.who) return;
    if (beat.do === 'enter') here.add(beat.who);
    if (beat.do === 'leave') here.delete(beat.who);
  });
  return here;
}

/**
 * A narration as what its words show, where they say it plainly of
 * someone on the stage ("Kai looks at the gate", "Nana sighs"): an action
 * or a face of theirs, its words kept as what it shows. Null where they
 * say nothing the stage can show.
 */
export function narrationAsBeat(
  sheet: StorySheet,
  bible: Pick<StudioBible, 'characters'>,
  at: number,
): SheetBeat | null {
  const beat = sheet.beats[at];
  if (beat?.kind !== 'narration') return null;
  const say = beat.say.trim();
  const here = onStageAt(sheet, at);
  for (const c of bible.characters) {
    if (!here.has(c.id)) continue;
    for (const name of namesOf(c)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(
        `^(?:and |then |so )?${escaped}\\s+(.*)$`,
        'iu',
      ).exec(say);
      if (!m) continue;
      const rest = m[1];
      const doing = VERB_DOINGS.find(([verb]) => verb.test(rest))?.[1];
      if (doing)
        return {
          ...blank('action'),
          who: c.id,
          say: say.replace(/[.!]+$/u, ''),
          do: doing,
        };
      const face = VERB_FACES.find(([verb]) => verb.test(rest))?.[1];
      if (face) return { ...blank('reaction'), who: c.id, feeling: face };
    }
  }
  return null;
}

/** A sheet's camera kept on the beats that stay, each at its new place. */
function keptCamera(
  sheet: StorySheet,
  kept: readonly number[],
): StorySheet['camera'] {
  return sheet.camera.flatMap((shot) => {
    const at = kept.indexOf(shot.beat);
    return at < 0 ? [] : [{ ...shot, beat: at }];
  });
}

/**
 * A scene's narration kept to the maker's narrator: what is over (any at
 * all with none; the middle of a scene, or past a tenth of its words,
 * with a light one; past a third with a storyteller) made the action or
 * the face its words say, else cut, the last first. The rest as written.
 */
export function narrationKept(
  sheet: StorySheet,
  bible: Pick<StudioBible, 'characters'>,
  rule: NarratorRule | null,
): StorySheet {
  if (!rule || !narrationProblems(sheet, bible, rule).length) return sheet;
  const beats = sheet.beats.map((beat) => ({ ...beat }));
  /** Each beat's index in the sheet as written, or null for one gone. */
  const from: (number | null)[] = beats.map((_, k) => k);
  const replace = (k: number) => {
    const as = narrationAsBeat({ ...sheet, beats }, bible, k);
    if (as) beats[k] = as;
    else from[k] = null;
  };
  const live = () => beats.filter((_, k) => from[k] !== null);
  const narrated = () =>
    beats.flatMap((beat, k) =>
      from[k] !== null && beat.kind === 'narration' ? [k] : [],
    );
  // Nowhere, or nowhere in its middle.
  for (const k of narrated())
    if (
      rule.mode === 'none' ||
      (rule.mode === 'light' && !atAnEdge(live(), live().indexOf(beats[k])))
    )
      replace(k);
  // A light narrator once: the first at an edge kept (the opening bridge).
  if (rule.mode === 'light')
    for (const k of narrated().slice(LIGHT_MOST_NARRATIONS)) replace(k);
  // Past its share: the last first (an opening bridge is kept longest),
  // made what it shows or cut.
  for (const k of [...narrated()].reverse()) {
    const { narrated: n, all } = shareOf(live());
    if (n <= mostNarrated(rule.mode, all)) break;
    replace(k);
  }
  const kept = from.flatMap((k) => (k === null ? [] : [k]));
  const out = beats.filter((_, k) => from[k] !== null);
  return { ...sheet, beats: out, camera: keptCamera(sheet, kept) };
}

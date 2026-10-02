/**
 * The critic (explainer-animation-plan §9.3; tech §4.1): a model that looks
 * at a scene's contact sheet beside its script and its shots, scores it
 * from 1 to 10 on the rules' axes (CRITIC_AXES), and names the scene's
 * worst problems as fixes from a closed list, which code applies to the
 * plan (shot-fix) before the scene is built again on the same voice. The
 * video's lesson: the films people share are the ones that were looked
 * at, scored and fixed, round after round; with no one in the loop, the
 * app does the looking.
 *
 * Here: the closed list of fixes, with when each is used (for the prompt);
 * the moments a scene's sheet is taken at (every shot's start, middle and
 * end, and every beat's middle, thinned to what a sheet can show); what
 * the critic is told of the scene in words (its lines, its shots as made
 * with the words said over each, what the code checks measured); its
 * answer made sound (critiqueOf); and whether a scene passes. Pure.
 */
import type { SceneDto, ShotDto } from '../../../contracts';
import { CRITIC_AXES, LOOP, type CriticAxis } from '../studio/explainer-rules';
import type { EditorialRow } from '../studio/studio-editorial';
import type { FrameProblem, FrameScores } from './frame-checks';
import { nearestOf } from './shot-lists';
import { chartTexts, clip, line } from './shot-parts';
import type { PlanSet, PlanShot, ShotPlan } from './types';

// ── The closed list of fixes ──────────────────────────────────────────────

/** What the critic may ask for, each with when it is the fix (the prompt quotes these). */
export const CRITIC_FIXES = {
  enlarge:
    'the subject is too small to read at phone size: the camera pushes in on it (target: what to make big)',
  reframe:
    'the camera frames the wrong thing, or crops what matters: frame the target instead (no target: show the whole)',
  'change-set':
    "the shot's picture cannot show what the voice says (a number nobody says, a chart of the wrong thing, the map when the words are about an idea): give it another set (to: map, chart, a chart kind such as split, seats, flow, timeline or quote, photo, portrait, document, or set); the note says what it should show",
  split:
    'one shot holds one picture over several different ideas: the later part gets its own picture from the words in "to"; the note says what it should show',
  merge:
    'this shot and the next show the same thing and flicker between them: make them one',
  'move-event':
    'something lands on the wrong words, before or after the voice names it: move the item named by target onto the words in "to"',
  'lengthen-hold':
    'words or a dense picture leave before they can be read: keep the target up (until the words in "to", or to the end of its shot)',
  'add-camera':
    'a still stretch where nothing moves: add a camera move (to: push, pull, travel, follow, cut-to, establish or hold) on the target',
  'swap-recipe':
    'an item\'s motion is wrong for what it shows: give the item named by target the recipe in "to" (for example count, grow, fill, mark, spotlight, flow, label)',
  'remove-clutter':
    'too much on screen at once, or something that does not belong: remove the target (no target: the least needed items)',
  'safe-shot':
    'nothing in the shot works and nothing above would save it: replace it with the plain, true default (the map on its place, a count of its number, the words as a quote)',
} as const;
export type CriticFixKind = keyof typeof CRITIC_FIXES;
export const CRITIC_FIX_KINDS = Object.keys(CRITIC_FIXES) as CriticFixKind[];

/** A word a model gives for a fix, read as the nearest on the list (synonyms as nearestOf reads them: letters and digits only). */
export const fixKindOf = nearestOf(CRITIC_FIX_KINDS, {
  zoom: 'enlarge',
  bigger: 'enlarge',
  pushin: 'enlarge',
  zoomin: 'enlarge',
  scale: 'enlarge',
  crop: 'reframe',
  frame: 'reframe',
  recompose: 'reframe',
  replace: 'change-set',
  replaceset: 'change-set',
  newset: 'change-set',
  changechart: 'change-set',
  set: 'change-set',
  cut: 'split',
  divide: 'split',
  combine: 'merge',
  join: 'merge',
  retime: 'move-event',
  move: 'move-event',
  timing: 'move-event',
  hold: 'lengthen-hold',
  dwell: 'lengthen-hold',
  longer: 'lengthen-hold',
  camera: 'add-camera',
  cameramove: 'add-camera',
  push: 'add-camera',
  recipe: 'swap-recipe',
  animation: 'swap-recipe',
  clutter: 'remove-clutter',
  declutter: 'remove-clutter',
  simplify: 'remove-clutter',
  remove: 'remove-clutter',
  fallback: 'safe-shot',
  safe: 'safe-shot',
});

/** One fix as the critic asks for it: on a shot (numbered from 1, as the sheet labels them), what it acts on, what it becomes, and why. */
export interface CriticFix {
  kind: CriticFixKind;
  shot: number;
  target?: string;
  to?: string;
  note: string;
}

export interface CriticScore {
  score: number;
  why: string;
}

/** The critic's answer, made sound. */
export interface Critique {
  /** By axis; an axis the critic did not score is absent (the hook, but on the opening scene). */
  scores: Partial<Record<CriticAxis, CriticScore>>;
  /** At most LOOP.worst, the worst first. */
  fixes: CriticFix[];
  /** Its verdict on the scene in a line, for the log. */
  verdict: string;
}

// ── The answer made sound ─────────────────────────────────────────────────

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);

/** An axis a model names, as the rules name it. */
const axisOf = nearestOf(CRITIC_AXES, {
  clear: 'clarity',
  picturefit: 'clarity',
  legibility: 'readability',
  readable: 'readability',
  framing: 'composition',
  layout: 'composition',
  pace: 'motion',
  animation: 'motion',
  movement: 'motion',
  layers: 'depth',
  texture: 'depth',
  accuracy: 'truth',
  honesty: 'truth',
  fit: 'truth',
  craft: 'polish',
  finish: 'polish',
  opening: 'hook',
});

/** A score as the critic may write it: 1 to 10, to a tenth; null for none. */
function scoreOf(raw: unknown): number | null {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseFloat(raw)
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(10, Math.max(1, n)) * 10) / 10;
}

/** The axes a scene is scored on: every axis but the hook, which only the opening scene has. */
export const axesFor = (opening: boolean): CriticAxis[] =>
  CRITIC_AXES.filter((axis) => opening || axis !== 'hook');

/**
 * The critic's answer made sound (critic-schemas' shape, or near it):
 * each score on its axis, 1 to 10, the hook only for the opening scene;
 * each fix of a kind on the list, on a shot the scene has, its words
 * trimmed; one fix a kind a shot; at most LOOP.worst, in the critic's
 * order, worst first.
 */
export function critiqueOf(
  raw: unknown,
  scene: { shots: readonly number[]; opening: boolean },
): Critique {
  const said = record(raw);
  const scores: Critique['scores'] = {};
  const allowed = new Set(axesFor(scene.opening));
  // A list of { axis, score, why }, or one field an axis.
  const given: Record<string, unknown>[] = Array.isArray(said.scores)
    ? said.scores.map(record)
    : Object.entries(record(said.scores)).map(([axis, value]) => ({
        axis,
        ...(typeof value === 'object' ? record(value) : { score: value }),
      }));
  for (const one of given) {
    const axis = axisOf(one.axis);
    const score = scoreOf(one.score);
    if (!axis || score === null || !allowed.has(axis) || scores[axis]) continue;
    scores[axis] = { score, why: clip(one.why, 30) };
  }
  const shots = new Set(scene.shots);
  const fixes: CriticFix[] = [];
  for (const one of list(said.fixes).map(record)) {
    const kind = fixKindOf(one.kind);
    const shot =
      typeof one.shot === 'number'
        ? Math.round(one.shot)
        : Number.parseInt(line(one.shot, 8).replace(/^s/iu, ''), 10);
    if (!kind || !shots.has(shot)) continue;
    if (fixes.some((f) => f.kind === kind && f.shot === shot)) continue;
    const target = line(one.target, 80);
    const to = line(one.to, 80);
    fixes.push({
      kind,
      shot,
      ...(target ? { target } : {}),
      ...(to ? { to } : {}),
      note: clip(one.note, 40),
    });
    if (fixes.length >= LOOP.worst) break;
  }
  return { scores, fixes, verdict: clip(said.verdict, 40) };
}

/** The axes a critique scores under the loop's pass score. */
export function failingAxes(critique: Critique): CriticAxis[] {
  return CRITIC_AXES.filter(
    (axis) => (critique.scores[axis]?.score ?? 10) < LOOP.passScore,
  );
}

/** Whether a critique judged the scene at all: a score on every axis it is scored on. */
export const judged = (critique: Critique, opening: boolean): boolean =>
  axesFor(opening).every((axis) => critique.scores[axis] !== undefined);

/** Whether a scene passes: judged, and every score at the loop's pass score or over. */
export const passes = (critique: Critique, opening: boolean): boolean =>
  judged(critique, opening) && failingAxes(critique).length === 0;

/** The lowest of a critique's scores; null when it gave none. */
export function lowestScore(critique: Critique): number | null {
  const all = Object.values(critique.scores).map((s) => s.score);
  return all.length ? Math.min(...all) : null;
}

/** The mean of a critique's scores, to a tenth; null when it gave none. */
export function meanScore(critique: Critique): number | null {
  const all = Object.values(critique.scores).map((s) => s.score);
  return all.length
    ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10
    : null;
}

// ── The moments a sheet is taken at ───────────────────────────────────────

/** A sheet's size: the most stills it shows, and how close two may be. */
export const CRITIC_SHEET = { most: 20, apartMs: 500 } as const;

/** One moment of the scene to see, on its own clock, and the shot it is in. */
export interface CriticMoment {
  ms: number;
  /** The shot on screen, by its id ("s3"); null between shots. */
  shot: string | null;
  why: 'start' | 'middle' | 'end' | 'beat';
}

/** The shot on screen at a moment of the scene: the last to have started. */
export function shotAt(
  shots: readonly Pick<ShotDto, 'id' | 'startMs' | 'endMs'>[],
  ms: number,
): string | null {
  let found: string | null = null;
  for (const shot of shots)
    if (shot.startMs <= ms && ms < shot.endMs) found = shot.id;
  return found;
}

/**
 * The moments a scene's sheet is taken at (plan §9.1): every shot's
 * start (once its join is over), middle and end, and every beat's middle,
 * on the scene's clock; never two within CRITIC_SHEET.apartMs (a shot's
 * moment kept over a beat's); at most `most`, thinned where they crowd
 * most, beats first, a shot's start last of all.
 */
export function criticMoments(
  scene: Pick<SceneDto, 'durationMs' | 'beats' | 'shots'>,
  most: number = CRITIC_SHEET.most,
): CriticMoment[] {
  const shots = scene.shots?.shots ?? [];
  const last = Math.max(0, scene.durationMs - 1);
  const at = (ms: number) => Math.round(Math.min(last, Math.max(0, ms)));
  const wanted: CriticMoment[] = [];
  shots.forEach((shot, k) => {
    const into = Math.min(600, shots[k - 1]?.joinMs ?? 0);
    const start = Math.min(shot.endMs - 1, shot.startMs + into);
    const end = Math.max(start, shot.endMs - Math.max(1, shot.joinMs));
    wanted.push(
      { ms: at(start), shot: shot.id, why: 'start' },
      { ms: at((start + end) / 2), shot: shot.id, why: 'middle' },
      { ms: at(end), shot: shot.id, why: 'end' },
    );
  });
  for (const beat of scene.beats ?? []) {
    const ms = at((beat.startMs + beat.endMs) / 2);
    wanted.push({ ms, shot: shotAt(shots, ms), why: 'beat' });
  }
  // A shot's moments first: a beat's only where no shot's is near.
  const rank = { start: 0, end: 1, middle: 2, beat: 3 } as const;
  const kept: CriticMoment[] = [];
  for (const one of [...wanted].sort(
    (a, b) => rank[a.why] - rank[b.why] || a.ms - b.ms,
  ))
    if (!kept.some((k) => Math.abs(k.ms - one.ms) < CRITIC_SHEET.apartMs))
      kept.push(one);
  kept.sort((a, b) => a.ms - b.ms);
  // Too many: the one nearest its neighbours goes, beats before shots'
  // middles and ends, a shot's start never while anything else may.
  while (kept.length > Math.max(1, most)) {
    let worst = -1;
    let worstKey = Infinity;
    kept.forEach((one, k) => {
      const gap = Math.min(
        k > 0 ? one.ms - kept[k - 1].ms : Infinity,
        k < kept.length - 1 ? kept[k + 1].ms - one.ms : Infinity,
      );
      const key = (3 - rank[one.why]) * 1e9 + gap;
      if (key < worstKey) {
        worstKey = key;
        worst = k;
      }
    });
    kept.splice(worst, 1);
  }
  return kept;
}

/** A moment as the sheet labels it: "s3 · 12.4s". */
export const momentLabel = (moment: Pick<CriticMoment, 'ms' | 'shot'>) =>
  `${moment.shot ? `${moment.shot} · ` : ''}${(moment.ms / 1000).toFixed(1)}s`;

// ── What the critic is told ───────────────────────────────────────────────

/** The words the voice says from one moment to another, as said. */
export function spokenBetween(
  scene: Pick<SceneDto, 'beats'>,
  fromMs: number,
  toMs: number,
  most = 40,
): string {
  const words: string[] = [];
  for (const beat of scene.beats ?? [])
    for (const [a, b, start] of beat.words ?? [])
      if (start >= fromMs && start < toMs) words.push(beat.text.slice(a, b));
  return words.length > most
    ? `${words.slice(0, most).join(' ')} …`
    : words.join(' ');
}

/** A set in a few words: its kind, and a chart's own words. */
export function setInWords(set: PlanSet): string {
  switch (set.kind) {
    case 'map':
      return `the show's map (${set.tilt ?? 'flat'})`;
    case 'chart': {
      const words = chartTexts(set.chart).filter(Boolean).slice(0, 6);
      return `a ${set.chart.kind} chart${words.length ? `: ${words.map((w) => `"${clip(w, 6)}"`).join(', ')}` : ''}`;
    }
    case 'portrait':
      return `the portrait of ${set.person}`;
    case 'photo':
      return `the photo ${set.photo}`;
    case 'document':
      return `the document ${set.document}`;
    case 'set':
      return `a drawn set (${[set.set.land, set.set.time, set.set.weather, set.set.town].filter(Boolean).join(', ')})`;
    default:
      return 'plain paper';
  }
}

/** A planned shot in a line: its set, subject, information, camera, people and life. */
export function shotInWords(shot: PlanShot): string {
  const parts = [`set: ${setInWords(shot.set)}`];
  if (shot.focal) parts.push(`subject: ${shot.focal}`);
  if (shot.info.length)
    parts.push(
      `information: ${shot.info
        .map(
          (i) =>
            `${i.recipe}${i.target ? ` ${i.target}` : ''}${i.to ? ` to ${i.to}` : ''}${i.text ? ` "${i.text}"` : ''} on "${i.on}"${i.until ? ` until "${i.until}"` : ''}`,
        )
        .join('; ')}`,
    );
  if (shot.camera.length)
    parts.push(
      `camera: ${shot.camera
        .map(
          (c) =>
            `${c.move}${c.amount ? ` ${c.amount}` : ''}${c.target ? ` on ${c.target}` : ''} at "${c.on}"`,
        )
        .join('; ')}`,
    );
  if (shot.actors.length)
    parts.push(
      `pieces: ${shot.actors.map((a) => `${a.kit}${a.side ? ` (${a.side})` : ''}`).join(', ')}`,
    );
  if (shot.life.length) parts.push(`life: ${shot.life.join(', ')}`);
  parts.push(`then: ${shot.join}`);
  return parts.join(' · ');
}

/** A scene's code-check problems in a few lines: each check once, with how often, when and its worst. */
export function problemsInWords(
  problems: readonly FrameProblem[],
  most = 8,
): string[] {
  const by = new Map<string, FrameProblem[]>();
  for (const p of problems) by.set(p.code, [...(by.get(p.code) ?? []), p]);
  return [...by.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, most)
    .map(([code, all]) => {
      const worst = all.reduce((w, p) =>
        (p.severity ?? 1) > (w.severity ?? 1) ? p : w,
      );
      const when = [...new Set(all.map((p) => (p.ms / 1000).toFixed(1)))]
        .slice(0, 4)
        .join(', ');
      return `${code} ×${all.length} (at ${when} s): ${clip(worst.message, 30)}`;
    });
}

/** What the critic is told of a scene beside its sheet. */
export interface CriticSceneInput {
  title: string;
  /** Where it is in its episode, from 0, and how many scenes the episode has. */
  index: number;
  of: number;
  episode?: string;
  /** Its lines, in order: what the voice says and what the editor wanted seen. */
  rows: readonly Pick<EditorialRow, 'say' | 'show'>[];
  /** The scene as made: its shots' times and the words said over them. */
  scene: Pick<SceneDto, 'durationMs' | 'beats' | 'shots'>;
  /** Its plan, whose shot k is the made shot `s${k + 1}`. */
  plan: ShotPlan;
  /** What the code checks measured on the same stills. */
  checks?: { scores: FrameScores; problems: readonly FrameProblem[] } | null;
  look: 'editorial' | 'illustrated';
  audience?: string | null;
  /** How many stills the sheet shows. */
  stills: number;
}

/** The scene's opening: its first shot on its episode's first words. */
export const isOpening = (input: Pick<CriticSceneInput, 'index'>) =>
  input.index === 0;

/** The shots a critic may name: the made scene's, by number. */
export const shotNumbers = (scene: Pick<SceneDto, 'shots'>): number[] =>
  (scene.shots?.shots ?? [])
    .map((s) => Number.parseInt(s.id.replace(/^s/u, ''), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

/** The words the critic reads beside a scene's sheet (critic-prompts says what to do with them). */
export function criticParts(input: CriticSceneInput): string[] {
  const seconds = Math.round(input.scene.durationMs / 1000);
  const shots = input.scene.shots?.shots ?? [];
  const opening = isOpening(input);
  const scores = input.checks?.scores;
  return [
    `The scene: "${input.title}", scene ${input.index + 1} of ${input.of}${input.episode ? ` of "${input.episode}"` : ''}, ${seconds} seconds.${opening ? ' It opens the episode: score its hook (the first 2 seconds).' : ''}`,
    `The look: ${input.look === 'illustrated' ? 'illustrated (era-dressed characters on real maps and sets, archive art)' : 'editorial (maps, charts, archive photos and verified portraits, silhouettes for groups)'}.`,
    input.audience
      ? `Whom it teaches: ${input.audience}. That only sets how simply it is shown; no one watching is ever on screen.`
      : '',
    [
      "The script, line by line (say: the voice's exact words; show: what the editor wanted seen):",
      ...input.rows.map(
        (row, k) =>
          `${k + 1}. say: ${row.say}${row.show ? `\n   show: ${row.show}` : ''}`,
      ),
    ].join('\n'),
    [
      'The shots as made (the sheet labels each still with its shot and its moment):',
      ...shots.map((made) => {
        const k = Number.parseInt(made.id.replace(/^s/u, ''), 10) - 1;
        const planned = input.plan.shots[k];
        const said = spokenBetween(input.scene, made.startMs, made.endMs);
        return [
          `${made.id} · ${(made.startMs / 1000).toFixed(1)}–${(made.endMs / 1000).toFixed(1)} s`,
          `   the voice says: ${said ? `"${said}"` : '(nothing)'}`,
          planned ? `   plan: ${shotInWords(planned)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }),
    ].join('\n'),
    scores
      ? [
          `What code measured on the same stills (facts, 0 to 10): readability ${scores.readability}, composition ${scores.composition}, pace ${scores.pace}, truth ${scores.truth}.`,
          ...(input.checks!.problems.length
            ? [
                'Its problems:',
                ...problemsInWords(input.checks!.problems).map((p) => `- ${p}`),
              ]
            : ['It found no problem.']),
        ].join('\n')
      : '',
    `The contact sheet: ${input.stills} stills of this scene in order, each labelled with its shot and its moment in seconds.`,
  ].filter(Boolean);
}

/** What the critic is told of a reference sheet or an old film's, for calibration: the frames alone. */
export function framesOnlyParts(input: {
  stills: number;
  apartSeconds?: number;
}): string[] {
  const apart = input.apartSeconds ?? 3;
  return [
    `A contact sheet of ${input.stills} stills from about ${Math.round((input.stills - 1) * apart)} seconds of one explainer film, ${apart} seconds apart, in order, each labelled with its moment.`,
    'You have no script and no shot list: judge clarity by whether each frame makes one point plainly, at a glance; judge motion by how the picture changes and builds from still to still. Score no hook. Name no fixes: give "fixes" as an empty list.',
  ];
}

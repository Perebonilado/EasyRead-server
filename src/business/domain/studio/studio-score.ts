/**
 * What a Studio film's music needs from its story (studio-story-plan §3D,
 * S10): the player's composer (the client's film-score.ts) scores the
 * film from it, in the browser, on the film's own clock.
 *
 * - **The colour:** the genre (the story's, else the maker's), the tone and
 *   whether it is made for children: dark comedy dry and plucked, drama
 *   warm, adventure driving, spooky low and bell-like.
 * - **The curve:** each scene's story beats in order, each with its role
 *   and planned tension (0 to 10), so the music's intensity follows it,
 *   drops out at the low point and before the climax, and comes home on
 *   the button.
 * - **The themes:** whose story it is (the hero, whose motif returns at
 *   the want, the low point, the climax and the button), and a foil when
 *   there is one: whoever most often threatens, accuses, refuses or
 *   teases the hero, in the lines the scenes say.
 * - **The hits:** each scene's lines whose aim lands a moment (a joke, a
 *   tease, a reveal, a threat, an accusation, a confession), by their
 *   words: the player finds them among the scene's sentences.
 *
 * Pure: the same story and sheets give the same score.
 */
import type { StudioScoreDto } from '../../../contracts';
import type { SceneSheet, SheetBeat, StudioBrief } from './studio';
import type { StudioStory } from './studio-story';

/** The aims whose line lands a moment the music marks. */
export const SCORED_AIMS: ReadonlySet<string> = new Set([
  'jokes',
  'teases',
  'reveals',
  'threatens',
  'accuses',
  'confesses',
]);

/** Aims said against someone: whoever says them to the hero most is the foil. */
const AGAINST: ReadonlySet<string> = new Set([
  'threatens',
  'accuses',
  'refuses',
  'teases',
  'orders',
  'warns',
]);

/** A story sheet's beats; an explainer's has none. */
const beatsOf = (sheet: SceneSheet | null): readonly SheetBeat[] =>
  sheet && sheet.kind === 'story' ? sheet.beats : [];

const clampTension = (n: number) =>
  Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : 5)));

/** A film's score, from its story, its brief, its cast and its scenes' sheets (in the film's order). */
export function scoreOf(input: {
  brief: Pick<StudioBrief, 'genre' | 'tone' | 'audience'>;
  story: StudioStory | null;
  cast: readonly { id: string; role: string }[];
  /** The film's scenes, in order: their place in the episode (the plan's scene) and their sheet. */
  scenes: readonly { position: number; sheet: SceneSheet | null }[];
}): StudioScoreDto {
  const { brief, story, cast, scenes } = input;
  const genre = story?.premise.genre ?? brief.genre ?? null;
  const mains = cast.filter((c) => c.role === 'main');
  const hero =
    (story?.premise.hero && cast.some((c) => c.id === story.premise.hero)
      ? story.premise.hero
      : null) ??
    mains[0]?.id ??
    null;

  // The foil: whoever says the most lines against the hero.
  const against = new Map<string, number>();
  for (const scene of scenes)
    for (const beat of beatsOf(scene.sheet))
      if (
        beat.kind === 'line' &&
        beat.who &&
        beat.who !== hero &&
        beat.to === hero &&
        beat.aim &&
        AGAINST.has(beat.aim)
      )
        against.set(beat.who, (against.get(beat.who) ?? 0) + 1);
  const foil =
    [...against.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0]?.[0] ?? null;

  const planned = story?.plan.scenes ?? [];
  const sheetBeats = story?.beats.beats ?? [];
  return {
    genre,
    tone: brief.tone ?? null,
    young: brief.audience === 'young children' || brief.audience === 'children',
    hero,
    foil,
    scenes: scenes.map((scene) => {
      const plan = planned[scene.position];
      const beats = (plan?.beats ?? [])
        .map((k) => sheetBeats[k])
        .filter((b): b is NonNullable<typeof b> => !!b)
        .map((b) => ({ role: b.role, intensity: clampTension(b.intensity) }));
      const lines = beatsOf(scene.sheet).flatMap((beat) =>
        beat.kind === 'line' &&
        beat.aim &&
        SCORED_AIMS.has(beat.aim) &&
        beat.say.trim()
          ? [{ say: beat.say.trim(), who: beat.who, aim: beat.aim }]
          : [],
      );
      return { beats, lines };
    }),
  };
}

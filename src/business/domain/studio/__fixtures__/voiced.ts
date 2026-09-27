/**
 * For tests: a staged scene composed as the stage would compose it, with
 * a voice made up for it (each sentence at two and a half words a second,
 * each followed by the quiet its sheet asked for) and plain drawings, so
 * what the film shows can be looked at without a voice or an artist.
 */
import type { SceneDto } from '../../../../contracts';
import { composeScene } from '../../scene-compose';
import type { SceneScript } from '../../scene-script';
import type { GatedDrawing } from '../../scene-svg';
import type { TimedBeat } from '../../scene-timing';
import { outfitWords } from '../../scene-wear';

const WORD_MS = 400;

/** A person's plain drawing says what they wear, as the kit's does: as they open, then each outfit they change into. */
const outfitsOf = (thing: SceneScript['cast'][number]): string[] | null =>
  thing.kind === 'character' && (thing.wears || thing.dress?.length)
    ? [
        thing.wears ? outfitWords(thing.wears) : 'their usual clothes',
        ...(thing.dress ?? []).map((one) => outfitWords(one.spec)),
      ]
    : null;

const figure = (
  rig: boolean,
  outfits: string[] | null = null,
): GatedDrawing => ({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="10" height="10"/></svg>',
  viewBox: [0, 0, 600, 900],
  aspect: 0.6,
  parts: {},
  labels: {},
  states: Object.fromEntries(
    [
      'neutral',
      'happy',
      'sad',
      'angry',
      'afraid',
      'surprised',
      'thinking',
      'pain',
      // Each outfit changed into is a state of its own, as the kit draws it.
      ...(outfits ?? []).slice(1).map((_, k) => `dress-${k + 1}`),
    ].map((face) => [face, face]),
  ),
  moves: true,
  callouts: [],
  field: null,
  ...(rig ? { acts: true } : {}),
  ...(rig && outfits ? { outfits } : {}),
});

/** The scene as made, and when each spoken beat was said. */
export function voiced(
  script: SceneScript,
  /** Who is drawn by the artist, with no rig. */
  artists: readonly string[] = [],
  /** A place's painted set, by its thing's id; absent, none is painted. */
  sets: Readonly<Record<string, GatedDrawing>> = {},
): { scene: SceneDto; beats: TimedBeat[] } {
  let t = (script.lead ?? 0) * 1000 + 300;
  const beats: TimedBeat[] = script.beats.map((beat) => {
    const words = [...beat.say.matchAll(/\S+/g)];
    const start = t;
    const end = start + words.length * WORD_MS;
    t = end + Math.max(300, (beat.holdS ?? 0) * 1000);
    return {
      text: beat.say,
      startMs: start,
      endMs: end,
      words: words.map((m, i) => [
        m.index,
        m.index + m[0].length,
        start + i * WORD_MS,
        start + i * WORD_MS + WORD_MS - 80,
      ]),
    };
  });
  const drawings = new Map<string, GatedDrawing | null>(
    script.cast.map((thing) => [
      thing.id,
      thing.kind === 'character'
        ? figure(!artists.includes(thing.id), outfitsOf(thing))
        : (sets[thing.id] ?? null),
    ]),
  );
  const { scene } = composeScene({
    script,
    drawings,
    beats,
    durationMs: t,
    timing: 'voice',
    generator: 'scene-2',
    profile: { kind: 'fiction', tone: 'light', story: true, film: true },
  });
  return { scene, beats };
}

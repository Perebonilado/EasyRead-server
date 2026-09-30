/**
 * An explainer's continuous builds (studio-explainer-plan, Asks 3 and 4,
 * part C): which scenes grow one diagram between them, and each such
 * scene's script laid out on the board the scenes before it left.
 *
 * The outline's writer may mark a scene's `build` ("start" a diagram, or
 * "continue" the one before's); code turns one on where the writer did
 * not, when two scenes side by side name at least SHARED_LEAST of the
 * show's recurring pictures (the heart's chambers, the water cycle's
 * stages), and puts right what cannot be (a "continue" with nothing
 * before it to continue, a "start" that nothing continues). A story's
 * scene, and a story clip in an explainer, never builds.
 */
import {
  BOARD_MOST,
  boardOf,
  nameWords,
  type BoardCarry,
} from '../scene-board';
import type { SceneScript, SceneThing } from '../scene-script';
import type { OutlineScene, StudioPicture } from './studio';

/** How many of the show's pictures two scenes side by side share to be one build. */
export const SHARED_LEAST = 2;

/** A scene with people and a place is acted: a story's, or a clip's (E8). */
const acted = (scene: OutlineScene) =>
  scene.set !== null ||
  scene.cast.length > 0 ||
  (scene as { kind?: string }).kind === 'clip';

/** The show's pictures a scene names, in its title, summary, teaching or points. */
export function picturesIn(
  scene: OutlineScene,
  pictures: readonly StudioPicture[],
): string[] {
  const said = new Set(
    nameWords(
      [scene.title, scene.summary, scene.teach ?? '', ...scene.points].join(
        ' ',
      ),
    ),
  );
  return pictures
    .filter((p) => {
      const words = nameWords(p.name);
      return words.length > 0 && words.every((w) => said.has(w));
    })
    .map((p) => p.name);
}

/**
 * An outline's scenes, each marked as it builds: the writer's marks made
 * sound, and a build turned on by code where two side by side share
 * SHARED_LEAST of the show's pictures.
 */
export function withBuilds(
  scenes: readonly OutlineScene[],
  pictures: readonly StudioPicture[],
): OutlineScene[] {
  const build = scenes.map((scene) =>
    acted(scene) ? null : (scene.build ?? null),
  );
  const named = scenes.map((scene) => picturesIn(scene, pictures));
  for (let k = 1; k < scenes.length; k += 1) {
    if (acted(scenes[k]) || acted(scenes[k - 1])) continue;
    const shared = named[k].filter((p) => named[k - 1].includes(p));
    if (shared.length >= SHARED_LEAST) build[k] = 'continue';
  }
  for (let k = 0; k < scenes.length; k += 1) {
    if (build[k] !== 'continue') continue;
    // The first scene, or one after a scene that acts, has nothing to continue.
    if (k === 0 || acted(scenes[k - 1])) build[k] = 'start';
    else if (build[k - 1] === null) build[k - 1] = 'start';
  }
  // A start nothing continues is a scene of its own.
  for (let k = 0; k < scenes.length; k += 1)
    if (build[k] === 'start' && build[k + 1] !== 'continue') build[k] = null;
  return scenes.map((scene, k) => {
    const { build: _, ...rest } = scene;
    void _;
    return build[k] ? { ...rest, build: build[k] } : rest;
  });
}

/** The scenes of the build a scene is in, first and last; null for a scene of its own. */
export function sectionOf(
  scenes: readonly Pick<OutlineScene, 'build'>[],
  k: number,
): { from: number; to: number } | null {
  if (!scenes[k]?.build) return null;
  let from = k;
  while (from > 0 && scenes[from].build === 'continue') from -= 1;
  if (scenes[from].build !== 'start') return null;
  let to = k;
  while (scenes[to + 1]?.build === 'continue') to += 1;
  return { from, to };
}

/**
 * A scene of a build laid out on its board: each scene of the section
 * from its start to this one laid out in turn on what the one before left,
 * from their scripts (`scriptAt`, as they are made). Null for a scene of
 * its own, or where a scene before it has no script yet.
 */
export function buildScript(
  scenes: readonly Pick<OutlineScene, 'build'>[],
  k: number,
  scriptAt: (position: number) => SceneScript | null,
): {
  script: SceneScript;
  carry: BoardCarry;
  /** Its section, and whether it is the section's last scene. */
  section: { from: number; to: number };
  notes: string[];
} | null {
  const section = sectionOf(scenes, k);
  if (!section) return null;
  let carry: BoardCarry | null = null;
  const notes: string[] = [];
  for (let j = section.from; j <= k; j += 1) {
    const script = scriptAt(j);
    if (!script) return null;
    const made = boardOf(script, carry, { end: j === section.to });
    if (j === k)
      return {
        script: made.script,
        carry: made.carry,
        section,
        notes: [...notes, ...made.notes],
      };
    carry = made.carry;
  }
  return null;
}

/**
 * The drawings a build shares between its scenes: every drawing of the
 * section on the board in more than one of them, by its id. Each is drawn
 * once for the section, before its scenes are made side by side, so they
 * all draw it alike and none draws it again.
 */
export function sharedDrawings(
  scenes: readonly Pick<OutlineScene, 'build'>[],
  scriptAt: (position: number) => SceneScript | null,
): Extract<SceneThing, { kind: 'drawing' }>[] {
  // Counted within each section: another section's "sun" is its own.
  const seen = new Map<string, number>();
  const things = new Map<string, Extract<SceneThing, { kind: 'drawing' }>>();
  for (let k = 0; k < scenes.length; k += 1) {
    const built = buildScript(scenes, k, scriptAt);
    if (!built) continue;
    const on = new Set(built.script.steps.flatMap((s) => s.stage?.show ?? []));
    for (const thing of built.script.cast)
      if (thing.kind === 'drawing' && on.has(thing.id)) {
        const key = `${built.section.from}:${thing.id}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if (!things.has(key)) things.set(key, thing);
      }
  }
  return [...things.entries()]
    .filter(([key]) => (seen.get(key) ?? 0) > 1)
    .map(([, thing]) => thing)
    .slice(0, BOARD_MOST * 2);
}

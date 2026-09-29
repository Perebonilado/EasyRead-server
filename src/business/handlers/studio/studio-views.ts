/**
 * The Studio as the app sees it: a show, an episode, a scene, made into
 * what the client draws. A scene is stale when its sheet, or anyone or
 * anywhere it shows, changed since it was made; what making the episode
 * would take is the stale scenes' seconds; and what keeps it from being
 * made is said in plain words.
 */
import type {
  StudioBibleDto,
  StudioBriefDto,
  StudioEpisodeDto,
  StudioExplainerSheetDto,
  StudioMessageDto,
  StudioSceneDto,
  StudioSheetDto,
} from '../../../contracts';
import {
  BRIEF_CONTROLS,
  briefMissing,
  secondsOf,
  sheetHash,
  type ExplainerSheet,
  type SceneSheet,
  type StudioBible,
  type StudioBrief,
} from '../../domain/studio/studio';
import { carriedWears, checkExplainer } from '../../domain/studio/studio-check';
import type { SceneThing } from '../../domain/scene-script';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioSceneRecord,
} from '../../repositories/studio.repository';

/**
 * A scene's fingerprint: its sheet, and the people and the place it shows
 * as the show has them now; and the clothes they come into it wearing,
 * only where they wear something the scenes before changed them into, so
 * a film whose scenes change no clothes keeps the fingerprint it had.
 */
export function sceneFingerprint(
  sheet: SceneSheet,
  bible: StudioBible | null,
  brief: StudioBrief,
  carried: readonly { who: string; figure: unknown }[] = [],
): string {
  if (sheet.kind === 'explainer')
    return sheetHash(sheet, {
      subject: bible?.subject ?? '',
      maths: bible?.maths ?? false,
      audience: brief.audience,
    });
  const who = new Set([
    ...sheet.onStage.map((p) => p.who),
    ...sheet.beats.flatMap((b) => (b.who ? [b.who] : [])),
  ]);
  // A set's features are the sheets' own to name: one joining the set
  // later changes no scene that does not name it.
  const set = (bible?.sets ?? []).find((s) => s.id === sheet.set) ?? null;
  const plain = set ? { ...set, features: undefined } : null;
  const worn = carried.filter((w) => who.has(w.who));
  return sheetHash(sheet, {
    characters: (bible?.characters ?? []).filter((c) => who.has(c.id)),
    set: plain,
    world: bible?.world ?? null,
    ...(worn.length ? { worn } : {}),
  });
}

/** Whether a scene needs making: never made, failed, or changed since. `carried`: the clothes its people come into it in (carriedWears). */
export function needsMaking(
  scene: StudioSceneRecord,
  bible: StudioBible | null,
  brief: StudioBrief,
  carried: readonly { who: string; figure: unknown }[] = [],
): boolean {
  if (!scene.sheet) return false;
  if (scene.status === 'failed' || !scene.sceneKey) return true;
  return (
    scene.madeHash !== sceneFingerprint(scene.sheet, bible, brief, carried)
  );
}

export function briefDto(brief: StudioBrief): StudioBriefDto {
  return {
    format: brief.format,
    idea: brief.idea,
    audience: brief.audience,
    minutes: brief.minutes,
    tone: brief.tone,
    setting: brief.setting,
    characters: brief.characters,
    include: brief.include,
    sourceChars: brief.source?.length ?? 0,
    ...Object.fromEntries(
      BRIEF_CONTROLS.flatMap((key) => (brief[key] ? [[key, brief[key]]] : [])),
    ),
  };
}

export function bibleDto(
  bible: StudioBible,
  drawings: {
    characters: Map<string, string>;
    sets: Map<string, string>;
    candidates?: Map<
      string,
      {
        words: string;
        first?: boolean;
        options: { id: string; drawing: string }[];
      }
    >;
    drawing?: Set<string>;
  },
): StudioBibleDto {
  return {
    characters: bible.characters.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      role: c.role,
      look: c.look,
      figure: c.figure
        ? (c.figure as unknown as Record<string, string | number | string[]>)
        : null,
      ...(c.animal ? { animal: c.animal } : {}),
      ...(c.creature ? { creature: c.creature } : {}),
      size: c.size,
      voice: c.voice,
      voicePick: c.voicePick,
      traits: c.traits,
      carries: c.carries,
      drawing: drawings.characters.get(c.id) ?? null,
      ...(drawings.drawing?.has(c.id) ? { drawingNow: true } : {}),
      ...(drawings.candidates?.get(c.id)?.options.length
        ? { candidates: drawings.candidates.get(c.id)! }
        : {}),
    })),
    sets: bible.sets.map((s) => ({
      ...s,
      drawing: drawings.sets.get(s.id) ?? null,
    })),
    world: bible.world,
    subject: bible.subject,
    maths: bible.maths,
    pictures: bible.pictures,
    ...(bible.things?.length ? { things: bible.things.map((t) => t.id) } : {}),
  };
}

/** What a thing on a lesson's stage is called, for its card. */
function nameOf(thing: SceneThing): string {
  switch (thing.kind) {
    case 'words':
      return `"${thing.text}"`;
    case 'stat':
      return `${thing.value} ${thing.caption}`.trim();
    case 'math':
      return thing.name || 'working';
    default:
      return 'name' in thing && thing.name ? thing.name : thing.kind;
  }
}

/** An explainer's sheet as its card reads: each sentence, and what comes on the stage as it is said. */
export function explainerCard(
  sheet: ExplainerSheet,
  teach: string | null,
): StudioExplainerSheetDto {
  const { script } = checkExplainer(sheet, {
    teach,
    stage: null,
    maths: true,
    planned: null,
  });
  const byId = new Map(script.cast.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const shows = script.beats.map(() => [] as string[]);
  for (const step of [...script.steps].sort(
    (a, b) => a.at.beat - b.at.beat || a.word - b.word,
  )) {
    const k = Math.max(0, Math.min(shows.length - 1, step.at.beat));
    for (const id of step.stage?.show ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const thing = byId.get(id);
      if (thing && shows[k]) shows[k].push(nameOf(thing));
    }
  }
  // The draft's own sentences, so a line's place is the one an edit
  // names; what comes on with each, where the mend kept them all.
  const aligned = script.beats.length === sheet.draft.beats.length;
  return {
    kind: 'explainer',
    title: sheet.title,
    transition: sheet.transition,
    lines: sheet.draft.beats.map((beat, k) => ({
      say: beat.say,
      shows: aligned ? (shows[k] ?? []) : [],
    })),
  };
}

export function sheetDto(
  sheet: SceneSheet,
  teach: string | null,
): StudioSheetDto {
  return sheet.kind === 'explainer' ? explainerCard(sheet, teach) : sheet;
}

export function sceneDto(
  scene: StudioSceneRecord,
  episode: StudioEpisodeRecord,
  bible: StudioBible | null,
  brief: StudioBrief,
  /** The clothes its people come into it in, where the scenes before changed them. */
  carried: readonly { who: string; figure: unknown }[] = [],
): StudioSceneDto {
  const planned = episode.outline?.scenes[scene.position];
  const made = Boolean(scene.sceneKey);
  return {
    id: scene.id,
    position: scene.position,
    title:
      scene.sheet?.title ?? planned?.title ?? `Scene ${scene.position + 1}`,
    status: scene.status,
    step: scene.step,
    error: scene.error,
    sheet: scene.sheet ? sheetDto(scene.sheet, planned?.teach ?? null) : null,
    problems: scene.problems,
    stale: made && needsMaking(scene, bible, brief, carried),
    made,
    seconds: scene.durationMs
      ? Math.round(scene.durationMs / 1000)
      : scene.sheet
        ? secondsOf(scene.sheet)
        : (planned?.seconds ?? 0),
    durationMs: scene.durationMs,
    canUndo: Boolean(scene.previousSheet),
  };
}

/** Why an episode cannot be made now; empty when it can. */
export function blockersOf(
  episode: StudioEpisodeRecord,
  scenes: StudioSceneRecord[],
  bible: StudioBible | null,
  brief: StudioBrief,
): string[] {
  if (episode.phase !== 'script' && episode.phase !== 'made')
    return [
      brief.format === 'explainer'
        ? 'Approve the outline first.'
        : 'Approve the outline and the cast first.',
    ];
  if (episode.busy === 'make') return ['The film is being made now.'];
  if (episode.busy) return ['Still writing: wait for it to finish.'];
  const out: string[] = [];
  if (!scenes.length) out.push('There are no scenes yet.');
  if (scenes.some((s) => s.status === 'writing' || !s.sheet))
    out.push('Some scenes are still being written.');
  const carried = carriedWears(scenes, bible);
  if (
    !out.length &&
    !scenes.some((s) => needsMaking(s, bible, brief, carried.get(s.position)))
  )
    out.push('Every scene is made already.');
  return out;
}

export function episodeDto(
  episode: StudioEpisodeRecord,
  scenes: StudioSceneRecord[],
  bible: StudioBible | null,
  brief: StudioBrief,
): StudioEpisodeDto {
  const carried = carriedWears(scenes, bible);
  const dtos = scenes.map((s) =>
    sceneDto(s, episode, bible, brief, carried.get(s.position)),
  );
  return {
    id: episode.id,
    showId: episode.showId,
    number: episode.number,
    title: episode.title,
    logline: episode.logline,
    phase: episode.phase,
    busy: episode.busy,
    error: episode.error,
    outline: episode.outline,
    scenes: dtos,
    durationMs: episode.durationMs,
    shareToken: episode.shareToken,
    toMakeSeconds: scenes
      .filter((s) => needsMaking(s, bible, brief, carried.get(s.position)))
      .reduce((n, s) => n + (s.sheet ? secondsOf(s.sheet) : 0), 0),
    blockers: blockersOf(episode, scenes, bible, brief),
    hasThumb: Boolean(episode.thumbKey),
  };
}

export function messageDto(message: StudioMessageRecord): StudioMessageDto {
  const event =
    message.meta?.kind === 'event' ? (message.meta.event ?? null) : null;
  return {
    id: message.id,
    role: message.role,
    episodeId: message.episodeId,
    // One kept from before events were: something said.
    kind: event ? 'event' : 'say',
    event: event
      ? {
          what: event.what,
          step: event.step,
          ...(event.sceneId ? { sceneId: event.sceneId } : {}),
          ...(event.characterId ? { characterId: event.characterId } : {}),
          ...(event.version ? { version: event.version } : {}),
          line: event.line,
        }
      : null,
    content: message.content,
    choices: message.meta?.choices ?? [],
    refused: Boolean(message.meta?.refused),
    createdAt: message.createdAt.toISOString(),
  };
}

export { briefMissing };

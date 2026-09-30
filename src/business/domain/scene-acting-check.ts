/**
 * How a made film's scene is acted and shot, checked from the scene alone
 * (studio-screenwriting K4, K8; scene-performance): shot by shot, who
 * speaks in it, whether their face is seen as they speak, and whether the
 * one they speak to is seen reacting; line by line, whether what the
 * speaker does matches what the line does, timed to its key word; and the
 * numbers: the share of lines acted to match, and the share of the time
 * someone speaks that their face is seen (it should be over 90%).
 *
 * A face is seen when the still of that moment (stillPlan) has their head
 * in the frame, turned no further than profile (not their back, not over
 * whose shoulder the shot looks), and no more than FACE_COVERED hidden by
 * what is drawn in front of it.
 */
import type { SceneDto, SceneEffectDto } from '../../contracts';
import { FACE_COVERED, covered, faceOf, type Box } from './scene-faces-seen';
import {
  REACTION_MOVES,
  actedLines,
  type LineActed,
} from './scene-performance';
import { stillPlan } from './scene-still';

/** How often a line's time is looked at for the speaker's face. */
export const FACE_SAMPLE_MS = 250;
/** The share of speaking time a face should be seen, at least. */
export const FACES_SEEN_LEAST = 0.9;

/** Whether someone's face is seen at `t`, as the still of that moment has it. */
export function faceSeenAt(scene: SceneDto, id: string, t: number): boolean {
  const plan = stillPlan(scene, t, 480);
  const k = plan.parts.findIndex((part) => part.key === `thing:${id}`);
  if (k < 0) return false;
  const me = plan.parts[k];
  if (me.soft || me.view === 'back' || me.view === 'back3q') return false;
  const face = faceOf(me.box);
  const inFrame: Box = {
    x: Math.max(0, face.x),
    y: Math.max(0, face.y),
    w: Math.min(plan.W, face.x + face.w) - Math.max(0, face.x),
    h: Math.min(plan.H, face.y + face.h) - Math.max(0, face.y),
  };
  if (inFrame.w <= 0 || inFrame.h <= 0) return false;
  if ((inFrame.w * inFrame.h) / (face.w * face.h) < 0.6) return false;
  // What is drawn after them, over them: people and features nearer, the
  // set's things before the camera. A layer that fills the frame is a
  // wash (a room's fourth wall faded), not a thing in front.
  const over = plan.parts
    .slice(k + 1)
    .filter(
      (part) =>
        part.kind !== 'crowd' &&
        !(part.kind === 'layer' && part.box.w >= plan.W * 0.95),
    )
    .map((part) => part.box);
  return covered(face, over) <= FACE_COVERED;
}

/** Whether someone reacting from `at` is seen doing it: their face on screen within REACTION_SEEN_MS (K8). */
export function reactionSeen(scene: SceneDto, id: string, at: number): boolean {
  for (let t = at; t <= at + REACTION_SEEN_MS; t += 200)
    if (faceSeenAt(scene, id, t)) return true;
  return false;
}

/** A shot as the check reads it: from when, to when, and what it frames. */
export interface ShotRead {
  fromMs: number;
  toMs: number;
  /** "wide", "close on X", "over Y's shoulder onto X", "two-shot X and Y", as it frames. */
  what: string;
  lines: {
    beat: number;
    speaker: string;
    text: string;
    /** The share of the time they speak in this shot that their face is seen. */
    faceSeen: number;
    /** Whom it is said to, when anyone here reacts to it. */
    listener: string | null;
    /** Whether that one is seen reacting, within REACTION_SEEN_MS of when they begin (judged once, in the shot the line starts in); null when no one reacts, or in a later shot of the line. */
    reactionSeen: boolean | null;
  }[];
}

const nameOf = (shot: SceneEffectDto | null): string => {
  if (!shot) return 'wide';
  const turned = shot.shot?.reverse ? 'reverse: ' : '';
  const angle = shot.shot?.angle ? `${shot.shot.angle} ` : '';
  switch (shot.shot?.kind) {
    case 'ots':
      return `${turned}over ${shot.part}'s shoulder onto ${shot.target}`;
    case 'profile':
      return `${turned}profile two-shot ${shot.target} and ${shot.part}`;
    case 'deep':
      return `${turned}deep staging on ${shot.target}`;
    case 'crowd':
      return `${turned}over the crowd onto ${shot.target}`;
    default:
      return shot.part
        ? `${turned}two-shot ${shot.target} and ${shot.part}`
        : `${turned}${angle}close on ${shot.target}`;
  }
};

/** How soon after a line's reaction begins the one reacting must be seen (K8: within about a second). */
export const REACTION_SEEN_MS = 1200;

/** The shots of a scene, in order, the whole stage between them. */
export function shotsOf(scene: SceneDto): {
  fromMs: number;
  toMs: number;
  shot: SceneEffectDto | null;
}[] {
  const zooms = scene.effects
    .filter((e) => e.do === 'zoom' && e.untilMs !== undefined)
    .sort((a, b) => a.atMs - b.atMs);
  const out: { fromMs: number; toMs: number; shot: SceneEffectDto | null }[] =
    [];
  let t = 0;
  for (const zoom of zooms) {
    if (zoom.atMs > t) out.push({ fromMs: t, toMs: zoom.atMs, shot: null });
    out.push({ fromMs: zoom.atMs, toMs: zoom.untilMs!, shot: zoom });
    t = zoom.untilMs!;
  }
  if (t < scene.durationMs)
    out.push({ fromMs: t, toMs: scene.durationMs, shot: null });
  return out.filter((one) => one.toMs > one.fromMs);
}

/**
 * Shot by shot: who speaks in it, whether their face is seen as they
 * speak, and whether whoever they speak to is seen reacting when they do.
 */
export function shotReport(scene: SceneDto): ShotRead[] {
  const lines = actedLines(scene);
  const says = scene.effects.filter(
    (e) => e.do === 'say' && e.say && !e.say.from,
  );
  return shotsOf(scene).map(({ fromMs, toMs, shot }) => ({
    fromMs,
    toMs,
    what: nameOf(shot),
    lines: lines.flatMap((line) => {
      const beat = scene.beats[line.beat];
      const said = says.find(
        (e) =>
          e.target === line.speaker &&
          e.atMs >= beat.startMs - 400 &&
          e.atMs <= beat.endMs,
      );
      const end = said?.say?.saidUntilMs ?? beat.endMs;
      const from = Math.max(beat.startMs, fromMs);
      const to = Math.min(end, toMs);
      if (to <= from) return [];
      let seen = 0;
      let all = 0;
      for (let t = from; t < to; t += FACE_SAMPLE_MS) {
        all += 1;
        if (faceSeenAt(scene, line.speaker, t)) seen += 1;
      }
      // Who reacts to it, and when: each of their reactions before the next line.
      const next = scene.beats[line.beat + 1]?.startMs ?? end + 2500;
      const reactions = Object.entries(scene.acting ?? {})
        .filter(([id]) => id !== line.speaker)
        .flatMap(([id, one]) =>
          (one.moves ?? [])
            .filter(
              ([at, move]) =>
                REACTION_MOVES.has(move) && at >= beat.startMs && at < next,
            )
            .map(([at, , ms]) => ({ id, at: at + Math.min(ms * 0.3, 300) })),
        )
        .sort((a, b) => a.at - b.at);
      const reaction = reactions[0];
      // Judged once, in the shot the line starts in, wherever it falls.
      const starts = beat.startMs >= fromMs && beat.startMs < toMs;
      return [
        {
          beat: line.beat,
          speaker: line.speaker,
          text: line.text,
          faceSeen: all ? seen / all : 1,
          listener: reaction?.id ?? null,
          // Seen when any of the reactions of whoever reacts first is seen.
          reactionSeen:
            reaction && starts
              ? reactions
                  .filter((one) => one.id === reaction.id)
                  .some((one) => reactionSeen(scene, one.id, one.at))
              : null,
        },
      ];
    }),
  }));
}

/** The numbers: how many lines, how many acted to match and on their key word, and how much of the speaking the faces are seen. */
export interface ActingNumbers {
  lines: number;
  /** Lines with any acting of the speaker's. */
  acted: number;
  /** Lines whose acting is what the line does. */
  matching: number;
  /** Lines with a move at its fullest on the key word. */
  onKey: number;
  /** Lines someone reacted to. */
  reactedTo: number;
  /** The share of speaking time the speaker's face is seen. */
  facesSeen: number;
  /** The share of reactions seen where they happen. */
  reactionsSeen: number;
  /** The lines nothing was acted for. */
  unacted: LineActed[];
}

/** The numbers of a scene (or several): acting and faces. */
export function actingNumbers(scenes: readonly SceneDto[]): ActingNumbers {
  let lines = 0;
  let acted = 0;
  let matching = 0;
  let onKey = 0;
  let reactedTo = 0;
  let seen = 0;
  let spoken = 0;
  let reactions = 0;
  let reactionsSeen = 0;
  const unacted: LineActed[] = [];
  for (const scene of scenes) {
    const read = actedLines(scene);
    lines += read.length;
    for (const line of read) {
      if (line.moves.length) acted += 1;
      else unacted.push(line);
      if (line.matches) matching += 1;
      if (line.onKey) onKey += 1;
      if (line.reacted.length) reactedTo += 1;
    }
    for (const shot of shotReport(scene))
      for (const line of shot.lines) {
        const beat = scene.beats[line.beat];
        const inShot = Math.max(
          0,
          Math.min(beat.endMs, shot.toMs) - Math.max(beat.startMs, shot.fromMs),
        );
        spoken += inShot;
        seen += inShot * line.faceSeen;
        if (line.reactionSeen !== null) {
          reactions += 1;
          if (line.reactionSeen) reactionsSeen += 1;
        }
      }
  }
  return {
    lines,
    acted,
    matching,
    onKey,
    reactedTo,
    facesSeen: spoken ? seen / spoken : 1,
    reactionsSeen: reactions ? reactionsSeen / reactions : 1,
    unacted,
  };
}

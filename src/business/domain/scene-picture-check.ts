/**
 * The picture check (studio-scenery-plan §8.6): a made scene looked at as
 * the viewer sees it. Two to four stills of its film (the fullest moment,
 * each moment a change the maker asked for is seen, and its last frame)
 * are set beside what the sheet says is there: who is on the stage, what
 * each thing of the place is, and what the change asked should show. A
 * vision model says whether each still matches, and what is wrong where
 * it does not (an ark drawn as a bus, someone missing, a face covered,
 * someone too small to see, someone floating off the level they stand
 * on, someone hidden behind things of the place). Code says what it can see for itself first:
 * a thing of the place named as one thing and drawn by the stage as
 * another. What is wrong goes back to the writer once, free, as problems.
 */
import type { SceneDto } from '../../contracts';
import { FEATURE_WORDS, type FeatureKind } from './scene-doings';
import { fullestStep } from './scene-compose';
import { shotAtMoment, stepAtMoment } from './scene-still';
import { interactClaims } from './scene-interact';

/** A moment of a scene to look at: when, and why that one. */
export interface PictureMoment {
  t: number;
  why: string;
}

/** The most stills a scene is looked at in, and how near two may be before they are one. */
export const MOST_STILLS = 4;
const SAME_MOMENT_MS = 1200;
/** How long before the next change a moment is taken: everyone there, standing still. */
const SETTLED_BEFORE_MS = 350;

/**
 * The moments a made scene is looked at (§8.6): the fullest, as it stands
 * just before the stage next changes; each moment a change the maker
 * asked for is seen (`asked`, in the scene's time); and its last frame.
 * Two within a moment of each other are one; at most MOST_STILLS, the
 * asked ones kept first after the fullest.
 */
export function pictureMoments(
  scene: SceneDto,
  asked: readonly number[] = [],
): PictureMoment[] {
  // The shot grammar's shots (studio-views-plan §3): the first over a
  // shoulder, the first in deep staging and the first over the crowd,
  // each in its middle, where people are seen from another side.
  const grammar = (
    ['reverse', 'ots', 'deep', 'crowd', 'profile'] as const
  ).flatMap((kind) => {
    const shot = scene.effects.find(
      (e) =>
        e.do === 'zoom' &&
        e.untilMs &&
        // The first from the place's other side (§4.2), then the first of each kind from the front.
        (kind === 'reverse'
          ? e.shot?.reverse === true
          : e.shot?.kind === kind && !e.shot.reverse),
    );
    return shot
      ? [
          {
            t: (shot.atMs + (shot.untilMs ?? shot.atMs)) / 2,
            why: SHOT_WHY[kind],
          },
        ]
      : [];
  });
  const end = Math.max(0, (scene.settledMs ?? scene.durationMs) - 100);
  const k = fullestStep(scene);
  const from = scene.steps[k]?.atMs ?? 0;
  const next = scene.steps[k + 1]?.atMs;
  // Just before the stage next changes; the last step's, halfway through
  // it, so it is not the last frame over again.
  const fullest = Math.max(
    from,
    next !== undefined
      ? Math.min(end, next - SETTLED_BEFORE_MS)
      : from + (end - from) / 2,
  );
  const wanted: PictureMoment[] = [
    { t: fullest, why: 'the fullest moment' },
    ...asked.map((t, i) => ({
      t: Math.max(0, Math.min(end, t)),
      why:
        asked.length > 1 ? `the asked change (${i + 1})` : 'the asked change',
    })),
    ...grammar.slice(0, 2),
    { t: end, why: 'the last frame' },
  ];
  const out: PictureMoment[] = [];
  for (const one of wanted) {
    if (out.length >= MOST_STILLS) break;
    if (out.some((kept) => Math.abs(kept.t - one.t) < SAME_MOMENT_MS)) continue;
    out.push({ t: Math.round(one.t), why: one.why });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Why a still of each of the shot grammar's shots is looked at. */
const SHOT_WHY = {
  reverse: "a shot from the place's other side",
  ots: 'an over-the-shoulder shot',
  deep: 'a deep-staged shot',
  crowd: 'a shot over the crowd',
  profile: 'a profile two-shot',
} as const;

/** Words too common to tell one line from another. */
const COMMON = new Set(
  'that this with from have they them their there then than when what which where while will would could should into onto about after before again just only make made more much very some every each other '.split(
    ' ',
  ),
);

/**
 * The moments a change the maker asked for is seen: the lines whose words
 * share the most with what they asked (a name, a thing), each as it ends;
 * at most two. None where no line shares a word with it.
 */
export function askedMoments(scene: SceneDto, request: string): number[] {
  const words = (text: string) =>
    new Set(
      (text.toLowerCase().match(/[a-z']{4,}/gu) ?? []).filter(
        (w) => !COMMON.has(w),
      ),
    );
  const asked = words(request);
  if (!asked.size) return [];
  return scene.beats
    .map((beat) => ({
      at: beat.endMs,
      shared: [...words(`${beat.who ?? ''} ${beat.text}`)].filter((w) =>
        asked.has(w),
      ).length,
    }))
    .filter((one) => one.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.at - b.at)
    .slice(0, 2)
    .map((one) => one.at)
    .sort((a, b) => a - b);
}

/** Someone the sheet has on the stage: their id, name and look in words. */
export interface CastClaim {
  id: string;
  name: string;
  look: string;
}

/** What the sheet says a still should show, in words for the judge. */
export interface PictureClaims {
  /** Who is on the stage then, by name, with how they look. */
  onStage: string[];
  /** Each thing of the place the stage draws, by its name in the story. */
  things: string[];
  /** What the change the maker asked for should show, when this moment is its. */
  asked: string | null;
  /**
   * What the people are doing with the place's things then, and how those
   * things stand (studio-interactions-plan §2.6): "the door is open", "Ada
   * is sitting at the table". Absent where nothing is used.
   */
  doing?: string[];
  /** How the shot then frames them, when it is one of the shot grammar's (studio-views-plan §3). */
  shot?: string;
}

/**
 * What a still at `t` should show, from the scene and its sheet's cast:
 * everyone on the stage then (as the scene stands them), each thing of
 * the place the stage draws (a gate, a bench, the ark), and, at a moment
 * a change was asked for, what it should show.
 */
export function pictureClaims(
  scene: SceneDto,
  t: number,
  cast: readonly CastClaim[],
  asked: string | null = null,
): PictureClaims {
  const step = scene.steps[stepAtMoment(scene, t)];
  const byId = new Map(cast.map((one) => [one.id, one]));
  const onStage = (step?.show ?? []).flatMap((id) => {
    const one = byId.get(id);
    return one ? [`${one.name}${one.look ? ` (${one.look})` : ''}`] : [];
  });
  const things = (scene.setting?.features ?? [])
    .filter((f) => f.svg && f.at.wide.w > 0)
    .map((f) => f.name);
  const doing = interactClaims(scene, t, (id) => byId.get(id)?.name ?? id);
  const shot = shotAtMoment(scene, t);
  const name = (id: string | null) =>
    (id ? byId.get(id)?.name : null) ?? 'someone';
  const turned = shot?.shot?.reverse === true;
  const framing =
    turned && shot?.shot?.kind === 'crowd'
      ? `It is taken the other way, from behind ${name(shot.target)}, onto the people watching, who face the camera.`
      : turned && shot?.shot?.kind === 'ots'
        ? `It is a reverse shot, taken from the place's other side (its other wall, or the other side of the street): ${name(shot.part)} is near the camera, seen from behind at the frame's edge, big, cropped and a little soft; ${name(shot.target)} faces us past them.`
        : shot?.shot?.kind === 'ots'
          ? `It is an over-the-shoulder shot: ${name(shot.part)} is near the camera, seen from behind at the frame's edge, big, cropped and a little soft; ${name(shot.target)} faces us past them.`
          : shot?.shot?.kind === 'deep'
            ? `It is a deep-staged shot: ${name(shot.target)} is near the camera, big and partly off the frame's edge; the others are behind at their places.`
            : shot?.shot?.kind === 'crowd'
              ? `It is a shot over the heads of the people watching onto ${name(shot.target)}.`
              : shot?.shot?.kind === 'profile'
                ? `It is a profile two-shot: ${name(shot.target)} and ${name(shot.part)} face each other, each seen from the side.`
                : null;
  return {
    onStage,
    things,
    asked,
    ...(doing.length ? { doing } : {}),
    ...(framing ? { shot: framing } : {}),
  };
}

/** The claims as the judge reads them. */
export function claimsText(claims: PictureClaims, why: string): string {
  return [
    `This still is ${why} of the scene.`,
    `On the stage, each seen whole and big enough to know: ${claims.onStage.length ? claims.onStage.join('; ') : 'no one'}.`,
    claims.shot ?? '',
    claims.onStage.length
      ? claims.shot
        ? 'Each stands on the ground at their own level (or sits or stands on what holds them), never floating; and each but the one near the camera is in clear view, not hidden or mostly covered by things of the place.'
        : 'Each stands on the ground at their own level (or sits or stands on what holds them), never floating; and each is in clear view, not hidden or mostly covered by things of the place.'
      : '',
    claims.things.length
      ? `The things of the place, each drawn as what it is named: ${claims.things.map((name) => `"${name}"`).join(', ')}.`
      : 'No named things of the place.',
    claims.doing?.length ? `Seen now: ${claims.doing.join('; ')}.` : '',
    claims.asked
      ? `The maker asked for this change, which should show now: ${claims.asked}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the judge says of a still: whether it matches what the sheet says, and what is wrong where it does not. */
export interface PictureVerdict {
  matches: boolean;
  wrong: string[];
}

/**
 * Words for things the stage has no drawing of, which a thing of a place
 * may be named as: a boat, an ark, a tent. Named so and drawn as one of
 * the stage's own kinds, it is drawn as something else.
 */
const OTHER_THINGS =
  /\b(arks?|boats?|ships?|canoes?|rafts?|trains?|carts?|wagons?|chariots?|thrones?|tents?|towers?|temples?|altars?|pyramids?|statues?|bridges?|huts?|ovens?|kilns?|looms?|ploughs?|plows?|fires?|campfires?)\b/iu;

/**
 * What code sees wrong in a scene's things before any picture is looked
 * at: a thing of the place the stage draws as one of its kinds, named in
 * the story as something that kind is not ("the half-built ark" drawn as
 * the stage's road vehicle). Each as a problem for the writer.
 */
export function namedAsDrawn(scene: SceneDto): string[] {
  const out: string[] = [];
  for (const feature of scene.setting?.features ?? []) {
    if (!feature.svg) continue;
    const kind = feature.kind as FeatureKind;
    const own = FEATURE_WORDS[kind];
    if (!own || own.test(feature.name)) continue;
    const other =
      (Object.keys(FEATURE_WORDS) as FeatureKind[]).find(
        (k) => k !== kind && FEATURE_WORDS[k].test(feature.name),
      ) ?? OTHER_THINGS.exec(feature.name)?.[1]?.toLowerCase();
    if (!other) continue;
    const drawn =
      kind === 'vehicle'
        ? 'a road vehicle (the stage draws a car, a van, a bus or a truck)'
        : `a ${kind}`;
    out.push(
      `"${feature.name}" is drawn as ${drawn}, not as ${/^[aeiou]/iu.test(other) ? 'an' : 'a'} ${other.replace(/s$/u, '')}: the picture shows the wrong thing.`,
    );
  }
  return out;
}

/**
 * The problems a picture check found, for the writer's one free try
 * again: code's own first, then each still's, said once each. None when
 * every still matches and code sees nothing.
 */
export function pictureProblems(
  code: readonly string[],
  looked: readonly { why: string; verdict: PictureVerdict }[],
): string[] {
  const out = [...code];
  for (const { why, verdict } of looked) {
    if (verdict.matches && !verdict.wrong.length) continue;
    for (const wrong of verdict.wrong.length
      ? verdict.wrong
      : ['it does not show what the sheet says']) {
      const line = `In ${why}: ${wrong}`;
      if (!out.some((one) => one.toLowerCase().includes(wrong.toLowerCase())))
        out.push(line);
    }
  }
  return out;
}

/**
 * A show, an episode and its scenes put into words: for the writers, who
 * are told what they build on, and for the producer, who is told what the
 * maker can see. The same words both ways, so the producer never talks of
 * a scene the writer was never told of.
 */
import { describeFigure } from '../scene-figure';
import { STAGE_NAMES } from '../scene-stage';
import {
  AUDIENCE_STAGE,
  briefMissing,
  secondsOf,
  type OutlineScene,
  type SceneSheet,
  type StudioBible,
  type StudioBrief,
  type StudioOutline,
} from './studio';

/** The brief, a line a field, the maker's own text last. */
export function describeBrief(brief: StudioBrief): string {
  const lines = [
    `Format: ${brief.format ?? 'not decided'}`,
    `Idea: ${brief.idea || 'not said yet'}`,
    `Audience: ${brief.audience ? `${brief.audience} (${STAGE_NAMES[AUDIENCE_STAGE[brief.audience]]})` : 'not said yet'}`,
    `Length of an episode: ${brief.minutes ? `${brief.minutes} minute${brief.minutes === 1 ? '' : 's'}` : 'not said yet'}`,
    `Tone: ${brief.tone ?? 'not said yet'}`,
  ];
  if (brief.setting) lines.push(`Setting: ${brief.setting}`);
  if (brief.characters) lines.push(`Characters: ${brief.characters}`);
  if (brief.include) lines.push(`To include: ${brief.include}`);
  if (brief.source)
    lines.push(`The maker's own text, to make it from:\n${brief.source}`);
  return lines.join('\n');
}

/** The cast and the places, with their ids, or an explainer's subject and pictures. */
export function describeBible(
  bible: StudioBible | null,
  story: boolean,
): string {
  if (!bible) return story ? 'No cast yet.' : 'No subject yet.';
  if (!story)
    return [
      `Subject: ${bible.subject || 'as the brief says'}`,
      bible.maths ? 'It works with equations, sums and graphs.' : '',
      bible.pictures.length
        ? `Draw these the same way every time they appear:\n${bible.pictures
            .map((p) => `- ${p.name}: ${p.is}. Draw: ${p.draw}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  const people = bible.characters.map((c) => {
    const looks =
      c.kind === 'person' && c.figure ? describeFigure(c.figure) : c.look;
    return `- ${c.id}: ${c.name}, ${c.role}, ${c.kind}${c.size ? ` (${c.size})` : ''}; ${c.traits.join(', ') || 'no traits given'}; looks: ${looks}; voice: ${c.voice}${c.carries ? `; carries a ${c.carries}` : ''}`;
  });
  const places = bible.sets.map(
    (s) =>
      `- ${s.id}: ${s.name}, ${s.kind}${s.front ? `, people stand behind the ${s.front}` : ''}: ${s.look}`,
  );
  const world = bible.world
    ? `The world: ${[bible.world.era, bible.world.region, bible.world.culture].filter(Boolean).join('; ')}`
    : '';
  return [
    `The characters (by id):\n${people.join('\n') || '- none'}`,
    `The places (by id):\n${places.join('\n') || '- none'}`,
    world,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** One scene of the outline, as the writer and the producer are told it. */
export function describeOutlineScene(
  scene: OutlineScene,
  k: number,
  story: boolean,
): string {
  return story
    ? `Scene ${k + 1}, "${scene.title}", about ${scene.seconds} seconds, in ${scene.set ?? 'no place'} with ${scene.cast.join(', ') || 'no one'}: ${scene.summary}`
    : `Scene ${k + 1}, "${scene.title}", about ${scene.seconds} seconds: ${scene.summary}${scene.points.length ? ` Small ideas: ${scene.points.join('; ')}.` : ''}`;
}

export function describeOutline(
  outline: StudioOutline,
  story: boolean,
): string {
  return [
    `"${outline.title}": ${outline.logline}`,
    ...outline.scenes.map((scene, k) => describeOutlineScene(scene, k, story)),
  ].join('\n');
}

/** A scene's sheet in a few lines, as a screenplay reads: for the producer. */
export function describeSheet(sheet: SceneSheet, k: number): string {
  if (sheet.kind === 'explainer')
    return `Scene ${k + 1}, "${sheet.title}" (${secondsOf(sheet)}s): ${sheet.draft.beats
      .map((b) => b.say)
      .join(' ')
      .slice(0, 400)}`;
  const lines = sheet.beats
    .map((b) =>
      b.kind === 'line'
        ? `${b.who}: "${b.say}"`
        : b.kind === 'narration'
          ? `NARRATOR: ${b.say}`
          : b.kind === 'pause'
            ? '(pause)'
            : `(${b.who} ${b.do ?? b.feeling ?? b.sign ?? ''}${b.prop ? ` ${b.prop}` : ''})`,
    )
    .join(' ');
  return `Scene ${k + 1}, "${sheet.title}" in ${sheet.set} (${secondsOf(sheet)}s): ${lines.slice(0, 500)}`;
}

/**
 * What the maker sees now, for the producer: the brief and what it still
 * needs; then the outline, the cast or the scenes, whichever is up.
 */
export function describeForProducer(input: {
  brief: StudioBrief;
  bible: StudioBible | null;
  outline: StudioOutline | null;
  sheets: (SceneSheet | null)[];
  phase: string;
  episode: number;
}): string {
  const story = input.brief.format !== 'explainer';
  const missing = briefMissing(input.brief);
  const parts = [
    `Episode ${input.episode}.`,
    `The brief:\n${describeBrief({ ...input.brief, source: input.brief.source ? `(${input.brief.source.length} characters of their own text)` : null })}`,
    missing.length
      ? `Still missing: ${missing.join(', ')}.`
      : 'The brief is complete.',
  ];
  if (input.outline && input.phase !== 'brief')
    parts.push(`The outline:\n${describeOutline(input.outline, story)}`);
  if (input.bible && story && input.phase === 'cast')
    parts.push(describeBible(input.bible, true));
  if (input.phase === 'script' || input.phase === 'made')
    parts.push(
      `The scenes:\n${input.sheets
        .map((sheet, k) =>
          sheet ? describeSheet(sheet, k) : `Scene ${k + 1}: being written`,
        )
        .join('\n')}`,
    );
  return parts.join('\n\n');
}

/** The episodes before this one, for the outline of the next: what happened, so it stays true. */
export function describeEarlier(
  earlier: { number: number; outline: StudioOutline | null }[],
): string {
  return earlier
    .filter((e) => e.outline)
    .map(
      (e) =>
        `Episode ${e.number}, "${e.outline!.title}": ${e.outline!.logline} ${e
          .outline!.scenes.map((s) => s.summary)
          .join(' ')}`,
    )
    .join('\n');
}

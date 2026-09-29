/**
 * A show, an episode and its scenes put into words: for the writers, who
 * are told what they build on, and for the producer, who is told what the
 * maker can see. The same words both ways, so the producer never talks of
 * a scene the writer was never told of.
 */
import { describeAnimal } from '../scene-animal';
import { describeCreature } from '../scene-creature';
import { describeFigure } from '../scene-figure';
import { DRAWN } from '../scene-own';
import { STAGE_NAMES, STAGE_RECIPES, type LearningStage } from '../scene-stage';
import { WORDS_A_SECOND } from './studio';
import { narratorWords } from './studio-narrator';
import { controlWords, safetyWords } from './studio-style';
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
  // The maker's own controls, where they chose them; and what is safe for
  // this audience and genre.
  if (brief.format !== 'explainer') {
    const narrator = narratorWords(brief);
    if (narrator) lines.push(narrator);
    lines.push(...controlWords(brief));
    const safe = safetyWords(brief);
    if (safe) lines.push(`Safety: ${safe}`);
  }
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
      c.kind === 'person' && c.figure
        ? describeFigure(c.figure)
        : c.animal
          ? describeAnimal(c.animal)
          : c.creature
            ? describeCreature(c.creature)
            : c.look;
    return `- ${c.id}: ${c.name}, ${c.role}, ${c.kind}${c.size ? ` (${c.size})` : ''}; ${c.traits.join(', ') || 'no traits given'}; looks: ${looks}; voice: ${c.voice}${c.carries ? `; carries a ${c.carries}` : ''}`;
  });
  const places = bible.sets.map(
    (s) =>
      `- ${s.id}: ${s.name}, ${s.kind}${s.front ? `, people stand behind the ${s.front}` : ''}: ${s.look}${
        s.features?.length
          ? ` Features (by id): ${s.features
              .map(
                (f) =>
                  `${f.id} (${f.kind === DRAWN ? `the show's own ${f.name}` : `a ${f.kind}`}${f.spot === 'back' ? ', at the back' : `, on the ${f.spot}`}${f.opens ? ', opens and shuts' : ''})`,
              )
              .join(', ')}.`
          : ''
      }`,
  );
  const world = bible.world
    ? `The world: ${[bible.world.era, bible.world.region, bible.world.culture].filter(Boolean).join('; ')}`
    : '';
  // The show's own things, drawn for it: named as they are, by id.
  const things = bible.things?.length
    ? `The show's own things (by id), handled like any other: ${bible.things.map((t) => t.id).join(', ')}.`
    : '';
  return [
    `The characters (by id):\n${people.join('\n') || '- none'}`,
    `The places (by id):\n${places.join('\n') || '- none'}`,
    things,
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
  /** Each scene's state in the film: made, changed since it was made, not made yet, being written or made. */
  states?: string[];
  phase: string;
  episode: number;
  /** What the maker is looking at in the panel as they write: "scene 3 ("The ball")", "the cast". */
  looking?: string | null;
  /** New drawings of characters waiting to be chosen from: whose, how many, and what was asked. */
  waiting?: { name: string; options: number; words: string }[];
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
        .map((sheet, k) => {
          const state = input.states?.[k];
          return `${sheet ? describeSheet(sheet, k) : `Scene ${k + 1}: being written`}${state ? ` [${state}]` : ''}`;
        })
        .join('\n')}`,
    );
  if (input.waiting?.length)
    parts.push(
      `New drawings waiting to be chosen from (on their cards and in the conversation):\n${input.waiting
        .map(
          (one) =>
            `${one.name}: ${one.options === 1 ? 'drawing 1' : `drawings 1 to ${one.options}`}${one.words ? `, drawn again for "${one.words.slice(0, 120)}"` : ', other ways to draw them for the first time (drawing 1 is the one they have)'}`,
        )
        .join('\n')}`,
    );
  if (input.looking)
    parts.push(
      `The maker is looking at ${input.looking} as they write: "it" or "this" most likely means that.`,
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

/**
 * Whom an explainer's scene teaches and how, for the lesson writer: the
 * stage's recipe, but with the scene's own length in place of a page's.
 * A page runs as long as its text; a scene runs the seconds its outline
 * gave it, and the writer is held to them.
 */
export function describeScene(
  stage: LearningStage | null,
  seconds: number,
): string {
  const words = Math.max(20, Math.round(seconds * WORDS_A_SECOND));
  const budget = `This scene is spoken in about ${seconds} seconds: about ${words} spoken words in all, and never more than ${Math.round(words * 1.25)}. Say only what this scene teaches, in that many words; the scenes around it say the rest.`;
  if (!stage) return budget;
  const r = STAGE_RECIPES[stage];
  return [
    `Who the learner is: ${r.reader}`,
    `Sentences of ${r.sentence[0]} to ${r.sentence[1]} words.`,
    `At most ${r.terms} new terms in the scene.`,
    `How to explain: ${r.explain}`,
    `Checks: ${r.checks}`,
    `What goes on the stage: ${r.pictures}`,
    `Tone: ${r.tone}.`,
    budget,
  ].join('\n');
}

/**
 * A sentence of the producer's that says it changed something itself,
 * when it set nothing going: "I've updated scene 1.", "All fixed!". The
 * producer changes nothing by itself; a line from the Studio says what
 * came of a change.
 */
const CLAIMS_CHANGED = new RegExp(
  [
    "[^.!?]*\\b(?:i['’]ve|i have|we['’]ve|we have|i|we)\\s+(?:now\\s+|just\\s+|already\\s+|also\\s+)?(?:changed|fixed|updated|rewritten|rewrote|redone|redid|sorted|removed|added|made\\s+(?:that|the|this|those|it)\\s+changes?)\\b[^.!?]*[.!?]*",
    '(?<=^|[.!?]\\s*)\\s*(?:all\\s+)?(?:done|fixed|sorted|changed)\\s*[.!]+',
  ].join('|'),
  'giu',
);

/** A promise to check what is made: only a scene changed as asked is checked, never the film made again or a change to the cast. */
const PROMISES_CHECK =
  /,?\s*(?:and|then)\s+(?:I['’]ll\s+|I will\s+|we['’]ll\s+)?(?:check|re-?check|look over)\s+(?:it|them|that|the (?:film|scene|scenes))(?:\s+again)?/giu;

/** A promise to make something again, which a change to the cast never does by itself. */
const PROMISES_MAKE =
  /,?\s*(?:and|then)\s+(?:I['’]ll\s+|I will\s+|we['’]ll\s+)?(?:re-?make|make)\s+(?:it|them|the (?:film|scene|scenes))\s+again/giu;

/**
 * The producer's reply as the maker gets it, when it sets nothing going
 * or sets work going that is not a scene's (an outline, the cast, the
 * film): with nothing set going, a sentence that says it changed
 * something itself is left out, and with nothing left, it says plainly
 * that nothing has changed; work set going is never promised a check,
 * which only a scene changed as asked gets; and a change to the cast or
 * the places, with scenes made, says those show it once made again. A
 * change to a scene is said in code's own words instead (sceneReply).
 */
export function honestReply(
  reply: string,
  action: string,
  /** Whether any scene of the episode was made. */
  made = false,
): string {
  if (action === 'none') {
    const out = reply
      .replace(CLAIMS_CHANGED, '')
      .replace(/\s{2,}/gu, ' ')
      .trim();
    return out || "Nothing has changed yet. Tell me what you'd like changed.";
  }
  let out = reply.replace(PROMISES_CHECK, '');
  // A change to the cast or the places makes nothing again by itself.
  if (action === 'cast') out = out.replace(PROMISES_MAKE, '');
  out = out.replace(/\s{2,}/gu, ' ').trim();
  return action === 'cast' && made && !/\bmade again\b/iu.test(out)
    ? `${out} The scenes made before show it once the film is made again.`
    : out;
}

/** The longest request said back in a reply, in characters. */
const SAID_BACK = 300;

/**
 * What the producer says it will do with a change to scenes, in code's own
 * words, never taken from the producer's: what it will try, and what then
 * comes of each scene. A story's scene that was made is made again and
 * checked; an explainer's is shown once it is made again; one not made
 * yet, once the film is made. What the stage cannot show is said to be
 * left out, never promised. Never "done": a line from the Studio says what
 * came of it once it is checked.
 */
export function sceneReply(input: {
  scenes: readonly {
    number: number;
    next: 'checked' | 'remade' | 'film';
  }[];
  request: string;
  /** What of it the stage cannot show, in a few words: left out. */
  cannot?: string | null;
}): string {
  const numbers = (list: readonly { number: number }[]) => {
    const n = list.map((s) => String(s.number));
    return `scene${n.length > 1 ? 's' : ''} ${n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0]}`;
  };
  const clipped = (text: string) => {
    const said = text.trim().replace(/[.!?\s]+$/u, '');
    if (said.length <= SAID_BACK) return said;
    const cut = said.slice(0, SAID_BACK);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), SAID_BACK / 2))}…`;
  };
  const cannot = input.cannot?.trim().replace(/[.!?\s]+$/u, '');
  const parts: string[] = [];
  if (cannot)
    parts.push(`The stage can't show ${cannot}, so I'll leave that out.`);
  const request = clipped(input.request);
  parts.push(
    request
      ? `I'll rewrite ${numbers(input.scenes)}: ${request}${request.endsWith('…') ? '' : '.'}`
      : `I'll rewrite ${numbers(input.scenes)}.`,
  );
  const checked = input.scenes.filter((s) => s.next === 'checked');
  const remade = input.scenes.filter((s) => s.next === 'remade');
  const film = input.scenes.filter((s) => s.next === 'film');
  const all = input.scenes.length;
  const one = (n: number, it: string, them: string) => (n > 1 ? them : it);
  const then: string[] = [];
  if (checked.length)
    then.push(
      checked.length === all
        ? `Then I'll make ${one(all, 'it', 'them')} again and check ${one(all, 'it', 'them')}`
        : `Then I'll make ${numbers(checked)} again and check ${one(checked.length, 'it', 'them')}`,
    );
  if (remade.length)
    then.push(
      remade.length === all
        ? `${one(all, 'It shows', 'They show')} in the film once ${one(all, "it's", "they're")} made again`
        : `${numbers(remade)} ${one(remade.length, 'shows', 'show')} once made again`,
    );
  if (film.length)
    then.push(
      film.length === all
        ? `${one(all, 'It shows', 'They show')} once the film is made`
        : `${numbers(film)} ${one(film.length, 'shows', 'show')} once the film is made`,
    );
  const next = then.join('; ');
  parts.push(`${next.charAt(0).toUpperCase()}${next.slice(1)}.`);
  return parts.join(' ');
}

/** The longest a check's word to the maker runs, in characters. */
const TOLD_MOST = 200;

/**
 * What a check tells the maker, made safe to say: one or two plain
 * sentences at most, and nothing about their film minutes, credit, money
 * or refunds, which a check has no say in (words asking for that are the
 * maker's, not the film's). Empty when nothing safe is left.
 */
export function tellOf(tell: string | null | undefined): string {
  const said = (tell ?? '').replace(/\s+/gu, ' ').trim();
  if (
    !said ||
    /\b(?:refund\w*|credit\w*|allowance|minutes? (?:this|a|per) month|free of charge|money|paid|payment|charge[ds]?|instructions?|system prompt|developer)\b/iu.test(
      said,
    )
  )
    return '';
  if (said.length <= TOLD_MOST) return said;
  const cut = said.slice(0, TOLD_MOST);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return end > TOLD_MOST / 3
    ? cut.slice(0, end + 1)
    : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * The editor's working file put into words, for the editor model at each
 * step (infographic-editor-plan §3): what the step builds on, said the
 * same way every time, so a later step reads exactly what an earlier one
 * wrote. The words each step is given are its prompt's parts.
 */
import { describeBrief } from './studio-words';
import type { StudioBrief } from './studio';
import {
  ERA_WORDS,
  distinctSources,
  type EditorClaim,
  type EditorPlan,
  type EditorResearch,
  type EditorWorld,
  type StudioEditor,
} from './studio-editor';
import type {
  EditorialBeats,
  EditorialRow,
  StudioEditorial,
} from './studio-editorial';
import { longestRow, yeses, type EditorPace } from './studio-editor-checks';

/** The brief as the editor reads it: the maker's, with an episode's length its material's. */
export function describeEditorBrief(brief: StudioBrief): string {
  return [
    ...describeBrief(brief)
      .split('\n')
      .filter((line) => !line.startsWith('Length of an episode')),
    'Length: a show of episodes, each three to five minutes, as long as its material.',
  ].join('\n');
}

/** The show's question, as the maker chose it, and what it is and is not. */
export function describeQuestion(
  editor: Pick<
    StudioEditor,
    'question' | 'pitch' | 'takeaway' | 'notThis' | 'subThemes'
  >,
): string {
  return [
    `The show's question: ${editor.question ?? 'not chosen yet'}`,
    editor.pitch ? `Its pitch: ${editor.pitch}` : '',
    editor.takeaway ? `The viewer leaves knowing: ${editor.takeaway}` : '',
    editor.notThis.length ? `Not about: ${editor.notThis.join('; ')}` : '',
    editor.subThemes.length
      ? `Other questions it could answer (often later episodes): ${editor.subThemes.join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** One claim in a line: its id, kind, how sure, its sources, who says so. */
export function describeClaim(claim: EditorClaim): string {
  const sources = distinctSources(claim.sources);
  return `${claim.id} [${claim.kind}, ${claim.confidence}${sources ? `, ${sources} source${sources === 1 ? '' : 's'}` : ', no source'}${claim.contested ? `, contested${claim.who ? `: ${claim.who}` : ''}` : ''}${claim.status ? `, ${claim.status}` : ''}] ${claim.text}${claim.visual ? ` (could be shown: ${claim.visual})` : ''}`;
}

/** The research log in words: all of it, or only the claims asked for. */
export function describeResearch(
  research: EditorResearch,
  only: ReadonlySet<string> | null = null,
): string {
  const claims = only
    ? research.claims.filter((c) => only.has(c.id))
    : research.claims;
  const parts = [
    `Claims (by id):\n${claims.map((c) => `- ${describeClaim(c)}`).join('\n') || '- none'}`,
  ];
  if (only) return parts.join('\n\n');
  if (research.timeline.length)
    parts.push(
      `Timeline:\n${research.timeline.map((e) => `- ${e.date}: ${e.event}${e.claims.length ? ` (${e.claims.join(', ')})` : ''}`).join('\n')}`,
    );
  if (research.numbers.length)
    parts.push(
      `Numbers:\n${research.numbers.map((n) => `- ${n.label}: ${n.value} (${n.claims.join(', ') || 'no claim'}; ${n.checked ? 'two sources agree' : 'one source: never say it as exact'})`).join('\n')}`,
    );
  if (research.myths.length)
    parts.push(
      `Myths:\n${research.myths.map((m) => `- Believed: ${m.belief} | True: ${m.truth}${m.handle ? ` | Handle: ${m.handle}` : ''}`).join('\n')}`,
    );
  if (research.perspectives.length)
    parts.push(
      `Perspectives a fair film hears:\n${research.perspectives.map((p) => `- ${p.side}: ${p.view}`).join('\n')}`,
    );
  if (research.looks.length)
    parts.push(
      `Look notes:\n${research.looks.map((l) => `- ${l.subject} (${l.kind}): ${l.description}`).join('\n')}`,
    );
  if (research.pronunciations.length)
    parts.push(
      `Say: ${research.pronunciations.map((p) => `${p.word} as "${p.say}"`).join('; ')}`,
    );
  if (research.open.length)
    parts.push(`Open questions: ${research.open.join(' | ')}`);
  return parts.join('\n\n');
}

/** The plan in words: the spine, the chain, the cast, the fairness notes, the episodes. */
export function describePlan(plan: EditorPlan): string {
  return [
    `The story in six sentences:\n${plan.spine.map((s, k) => `${k + 1}. ${s}`).join('\n')}`,
    plan.chain.length
      ? `The chain:\n${plan.chain.map((c) => `- ${c.link ? `${c.link.toUpperCase()}: ` : ''}${c.beat}`).join('\n')}`
      : '',
    plan.cast.length
      ? `The cast:\n${plan.cast.map((c) => `- ${c.name}${c.force ? `, for ${c.force}` : ''}${c.recurring ? '' : ' (once, on a name card)'}`).join('\n')}`
      : '',
    plan.fairness.length
      ? `Fairness:\n${plan.fairness.map((f) => `- ${f}`).join('\n')}`
      : '',
    `The episodes:\n${plan.episodes.map((e) => `${e.number}. "${e.title}": ${e.question} (about ${e.minutes || '?'} min)${e.endsOn ? ` Ends on: ${e.endsOn}` : ''}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** One of the plan's episodes as its writer is told it: its question, its items, its plants and payoffs, what it ends on. */
export function describePlannedEpisode(
  plan: EditorPlan,
  number: number,
): string {
  const episode = plan.episodes.find((e) => e.number === number);
  if (!episode) return `Episode ${number}: not in the plan.`;
  const items = episode.covers.map((k) => plan.items[k]).filter(Boolean);
  const due = plan.episodes
    .filter((e) => e.number < number)
    .flatMap((e) => e.plants.filter((p) => p.paidIn === number));
  const next = plan.episodes.find((e) => e.number === number + 1);
  return [
    `Episode ${number} of ${plan.episodes.length}: "${episode.title}"`,
    `Its question: ${episode.question}`,
    `About ${episode.minutes || 4} minutes of material.`,
    `What it covers, in order:\n${items
      .map(
        (i) =>
          `- ${i.decision === 'compress' ? '(a line or two) ' : ''}${i.item}${i.claims.length ? ` [${i.claims.join(', ')}]` : ''}`,
      )
      .join('\n')}`,
    episode.plants.length
      ? `It plants: ${episode.plants.map((p) => `${p.id} "${p.text}" (paid off in episode ${p.paidIn})`).join('; ')}`
      : '',
    due.length
      ? `It pays off: ${due.map((p) => `${p.id} "${p.text}"`).join('; ')}`
      : '',
    episode.endsOn ? `It ends on: ${episode.endsOn}` : '',
    next
      ? `The next episode asks: ${next.question}`
      : 'It is the last episode: it ends on the show’s final payoff.',
    number === 1
      ? 'It is the first episode: it opens on a cold open and the show’s driving question.'
      : 'It is a later episode: it opens with a five to ten second "last time" line, then its own hook.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The items of the plan cut from the whole show, for the package. */
export const describeLeftOut = (plan: EditorPlan) =>
  plan.leftOut.length ? `Left out of the show: ${plan.leftOut.join('; ')}` : '';

/**
 * The show's one map in words, for its boards: its region, and its named
 * regions already made, each named with members null on a map to keep its
 * shape and its colour in every scene (MAP_GROUPS_GUIDE).
 */
export function describeShowMap(world: Pick<EditorWorld, 'base'>): string {
  const base = world.base;
  if (!base) return '';
  const groups = base.groups ?? [];
  return [
    `The show's map: ${base.region}${base.year ? `, in ${base.year}` : ''}; every map in its scenes is drawn in this one frame.`,
    groups.length
      ? `Its regions, already made (on a map, name one in map.groups with members null, and it keeps its shape and its colour): ${groups.map((g) => `${g.name}${g.colour ? ` (${g.colour})` : ''}`).join('; ')}.`
      : '',
    base.seams?.length
      ? `Its seams: ${base.seams.map((m) => m.name || m.between.join(' and ')).join('; ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The world in words, for a writer: its era, colours, base picture and map, places, people and things, each by its name (never an id). */
export function describeWorld(world: EditorWorld): string {
  return [
    `Era: ${ERA_WORDS[world.era]}${world.region ? `; where: ${world.region}` : ''}`,
    world.palette.length
      ? `Colours (by token; the same thing keeps its colour in every frame): ${world.palette.map((p) => `${p.thing} = ${p.token}`).join('; ')}${world.held ? `; held back for the payoff: ${world.held.token} (${world.held.for})` : ''}`
      : '',
    world.picture ? `The base picture: ${world.picture}` : '',
    describeShowMap(world),
    world.legend ? `The legend: ${world.legend}` : '',
    // By their names only: a writer given an id writes it into the script.
    world.places.length
      ? `Places:\n${world.places.map((p) => `- ${p.name} (${p.kind}, usually ${p.time}): ${p.look}`).join('\n')}`
      : '',
    world.people.length
      ? `People:\n${world.people.map((p) => `- ${p.name}, ${p.role}${p.recurring ? '' : ' (once)'}; looks: ${p.likeness}`).join('\n')}`
      : '',
    world.things.length
      ? `Recurring things: ${world.things.map((t) => `${t.name} (${t.look})`).join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The beat sheet in words, with code's word budgets. */
export function describeBeats(beats: EditorialBeats): string {
  return [
    `The episode runs about ${Math.round(beats.seconds)} seconds, about ${beats.words} spoken words.`,
    ...beats.acts.map(
      (a, k) =>
        `Act ${k + 1}, "${a.title}" (${a.seconds} s, about ${a.words} words${a.grave ? ', grave: slower' : ''}): ${a.job}${a.rehook ? ` Ends on: ${a.rehook}` : ''}${a.plants.length ? ` Plants: ${a.plants.join(', ')}.` : ''}${a.payoffs.length ? ` Pays off: ${a.payoffs.join(', ')}.` : ''}`,
    ),
  ].join('\n');
}

/** A script's rows, numbered from 1, as the read and the fact check read them. */
export function describeRows(rows: readonly EditorialRow[]): string {
  return rows
    .map(
      (r, k) =>
        `Row ${k + 1} [act ${r.act}, ${r.visual}${r.claims.length ? `, ${r.claims.join(' ')}` : ''}${r.hold ? ', hold' : ''}] SAY: ${r.say} | SHOW: ${r.show}`,
    )
    .join('\n');
}

/** The rows as the fact check numbers them: from 0, for its rewrites. */
export function describeRowsFromZero(rows: readonly EditorialRow[]): string {
  return rows
    .map((r, k) => `${k} [${r.claims.join(' ') || 'no claim'}] ${r.say}`)
    .join('\n');
}

/** The scripts of the earlier episodes, briefly, for exact callbacks and the "last time" line. */
export function describeEarlierScripts(
  earlier: readonly Pick<StudioEditorial, 'number' | 'question' | 'rows'>[],
): string {
  return earlier
    .map(
      (e) =>
        `Episode ${e.number} ("${e.question}"):\n${e.rows.map((r) => r.say).join(' ')}`,
    )
    .join('\n\n');
}

/** How long a row's sentence may be, and the pace, for the writer. */
export function describePace(pace: EditorPace): string {
  return `The narrator speaks about ${pace.wpm} words a minute: a sentence of 8 to 15 words is three to six seconds. Sentences of ${pace.sentence[0]} to ${pace.sentence[1]} words, never more than ${longestRow(pace)}.`;
}

/** The items the plan weighed, in words: for a re-plan, what is known and decided. */
export function describeItems(plan: EditorPlan): string {
  return plan.items
    .map(
      (i, k) =>
        `${k}. [${i.decision}${i.episode ? `, episode ${i.episode}` : ''}, ${yeses(i)} yeses] ${i.item}`,
    )
    .join('\n');
}

/**
 * The editor's desk as the producer is told it: how this show is planned,
 * where its planning is, and what the maker can do now, so the producer's
 * reply and its step agree with what code does with the maker's words.
 */
export function describeEditorForProducer(
  editor: StudioEditor,
  episode: {
    number: number;
    phase: string;
    editorial: Pick<StudioEditorial, 'number' | 'rows' | 'stage'> | null;
  },
): string {
  const lines = [
    'This explainer is planned as an editor plans a video: a show of episodes of three to five minutes each, as long as their material. Never ask how long it should run.',
  ];
  if (!editor.stage)
    lines.push(
      'When the brief is complete and the maker is ready, action "outline" starts the planning: the questions the show could answer are found first.',
    );
  else if (editor.stage === 'angles' && !editor.question)
    lines.push(
      `The questions the show could answer are offered on a card, best first:\n${editor.angles
        .slice(0, 3)
        .map((a, k) => `${k + 1}. ${a.question}`)
        .join(
          '\n',
        )}\nThe maker picks one there, or says which ("the second one") or "you choose"; the Studio takes it from their words. Help them choose; never pick for them unless asked.`,
    );
  if (editor.question) lines.push(`The show's question: ${editor.question}`);
  if (editor.plan)
    lines.push(
      `The episodes planned:\n${editor.plan.episodes
        .map(
          (e) =>
            `${e.number}. "${e.title}": ${e.question}${e.episodeId ? ' (begun)' : ' (waiting)'}`,
        )
        .join('\n')}`,
    );
  else if (editor.question)
    lines.push(
      'The show is being researched and planned now; its first episode is written straight after.',
    );
  const editorial = episode.editorial;
  if (editorial?.rows.length && episode.phase === 'outline')
    lines.push(
      `Episode ${editorial.number}'s script is written in two columns (${editorial.rows.length} lines): "Make it" makes the film (action "make"); a change to the script is action "outline" with request their change.`,
    );
  if (episode.phase === 'made' && editor.plan)
    lines.push(
      'To go on: one of the waiting episodes, by its title, or anything else they want added, is action "episode" with request their words.',
    );
  return lines.join('\n');
}

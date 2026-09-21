/**
 * A stage scene, measured and looked at, without the worker or a model.
 *
 * Takes a stage narration as JSON (the shape the writer hands in), runs
 * the rules and the placer over it, times it against a steady voice, and
 * prints the table the plan set as done: how often something happens,
 * the longest the stage stands still, how much of what happens is more
 * than a thing appearing, and the longest run of words anywhere. Then it
 * writes a filmstrip so the numbers can be checked by eye.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register \
 *     scripts/visual-stage-check.ts <narration.json> [sheet.png]
 *
 * With no file it runs the page written into this script, which is there
 * so the tool always has something to show.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spokenForm } from '../src/business/domain/spoken';
import {
  ALL_SHAPE_KINDS,
  STAGES,
  estimateVisualWordTimes,
  layoutProblems,
  timeVisual,
  visualProblems,
} from '../src/business/domain/visual';
import {
  directStage,
  type StageNarration,
} from '../src/business/domain/visual-direct';
import { rasterise, renderFilm } from '../src/business/domain/visual-render';
import {
  MAX_STILL_S,
  STAGE_LIMITS,
  STAGE_TARGET,
  layoutStage,
  stageCadence,
  stageDelivery,
  stageMeasure,
  stageProblems,
  stillProblems,
  wordsOnStage,
} from '../src/business/domain/visual-stage';

/** The video the plan measured, for the column beside ours. */
const VIDEO = {
  changesPerMinute: 79,
  longestStillS: 11.4,
  movingShare: 0.6,
  wipesPerMinute: 1.7,
  longestRunWords: 3,
};

const BUILT_IN: StageNarration = {
  title: 'How a message reaches a phone',
  fit: 'good',
  fitReason: null,
  sentences: [
    'A message looks instant, so here is what really happens.',
    'It starts on a phone, which is where you type it.',
    'The phone hands it to a tower, and the tower takes it from there.',
    'The tower passes it on to the exchange that knows where to send it.',
    'The exchange looks up the other phone and pushes the message across.',
    'If that phone is off, the message waits at the exchange.',
    'The exchange holds it, and tries again a moment later.',
    'When the phone comes back, the message lands and you see a tick.',
    'One exchange would be a bottleneck, so there are many of them.',
    'They sit in a line and share the traffic between them.',
    'That is the whole path, from a typed line to a tick.',
  ],
  sections: [
    {
      title: '1. The path',
      cast: [
        { name: 'phone', looksLike: 'a slab of glass in a hand' },
        { name: 'tower', looksLike: 'a tall mast with arms' },
        { name: 'exchange', looksLike: 'a box of shelves' },
      ],
      beats: [
        { sentence: 0, about: ['phone'], does: 'introduces', word: null },
        { sentence: 1, about: ['phone'], does: 'focuses', word: null },
        { sentence: 2, about: ['phone', 'tower'], does: 'sends', word: 'text' },
        {
          sentence: 3,
          about: ['tower', 'exchange'],
          does: 'sends',
          word: 'on',
        },
        { sentence: 4, about: ['exchange'], does: 'counts', word: '1' },
      ],
    },
    {
      title: '2. When it waits',
      cast: [
        { name: 'phone', looksLike: 'a slab of glass in a hand' },
        { name: 'exchange', looksLike: 'a box of shelves' },
      ],
      beats: [
        { sentence: 5, about: ['phone'], does: 'fails', word: null },
        { sentence: 6, about: ['exchange'], does: 'focuses', word: null },
        { sentence: 7, about: ['phone'], does: 'fixes', word: null },
      ],
    },
    {
      title: '3. Many of them',
      cast: [
        { name: 'exchange', looksLike: 'a box of shelves' },
        { name: 'phone', looksLike: 'a slab of glass in a hand' },
      ],
      beats: [
        { sentence: 8, about: ['exchange'], does: 'copies', word: null },
        { sentence: 9, about: ['exchange'], does: 'rearranges', word: null },
        { sentence: 10, about: ['phone'], does: 'introduces', word: null },
      ],
    },
  ],
};

/** A steady voice: the bench's rate, with the scene's own silences. */
const CHARS_A_SECOND = 16.5;

async function main(): Promise<void> {
  const file = process.argv[2];
  const out = process.argv[3] ?? 'stage-sheet.png';
  const narration: StageNarration = file
    ? (JSON.parse(readFileSync(file, 'utf8')) as StageNarration)
    : BUILT_IN;

  const scene = directStage(narration);
  const drawable = (name: string) => ALL_SHAPE_KINDS.includes(name);
  const script = layoutStage(scene, { stage: STAGES.box, known: drawable });

  const faults = [
    ...stageProblems(scene).map((p) => `scene: ${p}`),
    ...stillProblems(script).map((p) => `still: ${p}`),
    ...wordsOnStage(script).map((p) => `words: ${p}`),
    ...layoutProblems(script, STAGES.box).map((p) => `layout: ${p}`),
    ...visualProblems(script, null).map((p) => `visual: ${p}`),
  ];

  const delivery = stageDelivery(scene);
  const forms = scene.sentences.map((s) => spokenForm(s));
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < forms.length; i += 1) {
    starts.push(Math.round(at));
    at +=
      (forms[i].text.length / CHARS_A_SECOND) * 1000 * (1 / delivery[i].speed);
    at += delivery[i].pauseAfter * 1000;
  }
  const durationMs = Math.round(at);
  const timeline = timeVisual({
    script,
    forms,
    times: estimateVisualWordTimes({
      forms,
      pausesS: delivery.map((d) => d.pauseAfter),
      durationMs,
      audioKey: 'check',
      pieceStartsMs: starts,
    }),
    durationMs,
    timing: 'estimated',
  });

  const m = stageMeasure(timeline);
  const row = (
    what: string,
    ours: string | number,
    video: string | number,
    target: string | number,
    ok: boolean,
  ) =>
    `${what.padEnd(28)} ${String(ours).padStart(7)}  ${String(video).padStart(7)}  ${String(target).padStart(8)}  ${ok ? 'ok' : 'NO'}`;

  console.log(`\n${scene.title}`);
  console.log(
    `${scene.sections.length} sections, ${scene.sentences.length} sentences, ${Math.round(durationMs / 1000)}s\n`,
  );
  console.log(
    `${''.padEnd(28)} ${'ours'.padStart(7)}  ${'video'.padStart(7)}  ${'target'.padStart(8)}`,
  );
  console.log(
    row(
      'changes a minute',
      m.changesPerMinute,
      VIDEO.changesPerMinute,
      `>= ${STAGE_TARGET.changesPerMinute}`,
      m.changesPerMinute >= STAGE_TARGET.changesPerMinute,
    ),
  );
  console.log(
    row(
      'longest still, seconds',
      m.longestStillS,
      VIDEO.longestStillS,
      `<= ${MAX_STILL_S}`,
      m.longestStillS <= MAX_STILL_S,
    ),
  );
  console.log(
    row(
      'stills over the rule',
      m.stillsOverRule,
      '20 in 700s',
      '0',
      m.stillsOverRule === 0,
    ),
  );
  console.log(
    row(
      'more than appearing',
      `${Math.round(m.movingShare * 100)}%`,
      `${Math.round(VIDEO.movingShare * 100)}%`,
      `>= ${Math.round(STAGE_TARGET.movingShare * 100)}%`,
      m.movingShare >= STAGE_TARGET.movingShare,
    ),
  );
  console.log(
    row(
      'wipes a minute',
      m.wipesPerMinute,
      VIDEO.wipesPerMinute,
      `<= ${STAGE_TARGET.wipesPerMinute}`,
      m.wipesPerMinute <= STAGE_TARGET.wipesPerMinute,
    ),
  );
  console.log(
    row(
      'longest run of words',
      m.longestRunWords,
      VIDEO.longestRunWords,
      `<= ${STAGE_LIMITS.maxRunWords}`,
      m.longestRunWords <= STAGE_LIMITS.maxRunWords,
    ),
  );

  const said = stageCadence(timeline);
  console.log(
    said.length
      ? `\n${said.map((s) => `- ${s}`).join('\n')}`
      : '\nThe cadence is within the guide.',
  );
  console.log(
    faults.length
      ? `\n${faults.length} fault(s):\n${faults.map((f) => `- ${f}`).join('\n')}`
      : '\nNo faults.',
  );

  const moments = scene.sections.map((section) => {
    const own = section.beats.map((b) => b.sentence);
    return { from: Math.min(...own), to: Math.max(...own) };
  });
  const svg = renderFilm(script, moments, {
    w: STAGES.box.W,
    h: STAGES.box.H,
  });
  const across = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 1128);
  writeFileSync(out, await rasterise(svg, Math.round((across / 1128) * 1800)));
  console.log(`\nfilmstrip: ${out}`);
}

void main();

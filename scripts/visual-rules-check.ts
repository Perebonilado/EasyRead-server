/**
 * One page through the narrator and the rules, offline: the marks the
 * narrator wrote, the cards the rules made, what the checks said, and a
 * contact sheet to look at. No director, no worker.
 *
 *   OPENAI_API_KEY=... npx ts-node --transpile-only -r tsconfig-paths/register scripts/visual-rules-check.ts <material.txt> <title> <out.png> [plan.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PROMPTS } from '../src/web/adapters/prompts';
import { visualNarrationSchema } from '../src/web/adapters/ai-sdk/schemas';
import { directByRules, stepDown } from '../src/business/domain/visual-direct';
import {
  assembleTutorial,
  layoutTutorial,
  momentsNamed,
  tidyNarration,
  tidyTutorial,
  tutorialProblems,
} from '../src/business/domain/visual-cards';
import {
  STAGES,
  layoutProblems,
  materialPool,
  repairVisual,
  visualProblems,
} from '../src/business/domain/visual';
import { rasterise, renderFilm } from '../src/business/domain/visual-render';
import { fieldFor } from '../src/business/domain/visual-presets';

async function main() {
  const [materialPath, title, outPath, planPath] = process.argv.slice(2);
  const material = readFileSync(materialPath, 'utf8').trim();
  const plan: unknown = planPath
    ? (JSON.parse(readFileSync(planPath, 'utf8')) as unknown)
    : { title };
  // Both packages are ESM; the adapter loads them the same way.
  const { generateObject } = await import('ai');
  const { createOpenAI } = await import('@ai-sdk/openai');
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const modelName = process.env.AI_MODEL_VISUAL_NARRATION || 'gpt-4.1';
  const started = Date.now();
  const result = await generateObject({
    model: openai(modelName),
    schema: visualNarrationSchema,
    system: PROMPTS.visualNarration,
    prompt: [
      `Chapter: ${title}`,
      `The chapter's plan: ${JSON.stringify(plan)}`,
      `The page:\n${material}`,
    ].join('\n\n'),
  });
  const usage = result.usage;
  console.log(
    `narration: ${modelName}, ${Date.now() - started} ms, ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out`,
  );
  const narration = tidyNarration(result.object);
  console.log(
    `title: ${narration.title}; ${narration.sentences.length} sentences, ${narration.moments.length} moments`,
  );
  for (const [i, m] of narration.moments.entries())
    console.log(
      `  m${i} [${m.from}-${m.to}] ${m.show?.kind ?? '(no mark)'} ${JSON.stringify(
        { ...(m.show ?? {}), kind: undefined },
      )
        .replace(/,?"[a-z]+":null/g, '')
        .slice(0, 110)}  :: ${m.intent}`,
    );

  let decisions = directByRules(narration, {
    field: fieldFor(`${material} ${narration.sentences.join(' ')}`),
  });
  const pool = materialPool(material);
  const materialWords = material.split(/\s+/).filter(Boolean).length;
  const build = () => {
    const tutorial = tidyTutorial(assembleTutorial(narration, decisions));
    const scripts = {
      box: repairVisual(layoutTutorial(tutorial, STAGES.box), STAGES.box),
      wide: repairVisual(layoutTutorial(tutorial, STAGES.wide), STAGES.wide),
    };
    const problems = [
      ...tutorialProblems(tutorial, pool, materialWords, material),
      ...new Set([
        ...visualProblems(scripts.box, null),
        ...layoutProblems(scripts.box, STAGES.box),
        ...layoutProblems(scripts.wide, STAGES.wide).map(
          (p) => `In the wide staging: ${p}`,
        ),
      ]),
    ];
    return { tutorial, scripts, problems };
  };
  let { tutorial, scripts, problems } = build();
  console.log(
    `cards: ${tutorial.moments.map((m) => m.card + (m.continues ? '+' : '') + (m.plain ? '(plain)' : '')).join(', ')}`,
  );
  for (let round = 0; problems.length && round < 2; round += 1) {
    console.log(
      `round ${round + 1}: ${problems.length} problem(s)\n  - ${problems.slice(0, 8).join('\n  - ')}`,
    );
    const named = momentsNamed(problems)
      .map((k) => tutorial.moments[k]?.index)
      .filter((i): i is number => i !== undefined);
    if (!named.length) break;
    decisions = stepDown(decisions, named, narration, problems);
    ({ tutorial, scripts, problems } = build());
  }
  console.log(
    `after: ${problems.length} problem(s); cards: ${tutorial.moments.map((m) => m.card + (m.continues ? '+' : '') + (m.plain ? '(plain)' : '')).join(', ')}`,
  );
  const svg = renderFilm(scripts.box, tutorial.moments, {
    w: STAGES.box.W,
    h: STAGES.box.H,
  });
  const across = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 1128);
  writeFileSync(
    outPath,
    await rasterise(svg, Math.round((across / 1128) * 1600)),
  );
  console.log(`sheet: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

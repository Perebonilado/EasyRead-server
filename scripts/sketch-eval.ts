/**
 * Does the tutor's sketch show what was asked? Each fixture is an ask from
 * a real page; the writer draws it, the geometry is rendered, and a vision
 * model judges the picture against what a reader should see.
 *
 *   npm run sketch:eval                       the sketch writer, every fixture
 *   npm run sketch:eval -- --graph-only       the graph-only writer the board had before templates
 *   npm run sketch:eval -- ring-servers       one fixture
 *   npm run sketch:eval -- --save DIR         keep the rendered pictures
 *   npm run sketch:eval -- --write-baseline   record this run's scores for its mode
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';
import {
  LIVE_DIAGRAM_LIMITS,
  diagramProblems,
  geometryProblems,
  layoutDiagram,
  regionLayout,
} from '../src/business/domain/diagram';
import {
  describeSketch,
  graphPlan,
  layoutSketch,
  repairDraft,
  repairSketch,
  sketchGeometryProblems,
  sketchProblems,
  templateHint,
  type SketchDraft,
} from '../src/business/domain/sketch';
import { figureKindFor } from '../src/business/domain/ask';
import {
  loadSketchFixtures,
  readBaseline,
  scoreVerdicts,
  sketchSvg,
  writeBaseline,
  type SketchVerdict,
} from '../src/business/domain/sketch-eval';
import type { DiagramGeometry } from '../src/business/domain/board';

const args = process.argv.slice(2);
const graphOnly = args.includes('--graph-only');
const writeBase = args.includes('--write-baseline');
const saveAt = args.includes('--save')
  ? args[args.indexOf('--save') + 1]
  : null;
const only = args.filter(
  (arg, i) => !arg.startsWith('--') && args[i - 1] !== '--save',
);
const REGION = { w: 920, h: 620 };
const mode = graphOnly ? 'graph-only' : 'sketch';

async function toPng(svg: string): Promise<Buffer> {
  const { Resvg } =
    (await import('@resvg/resvg-js')) as typeof import('@resvg/resvg-js');
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: 'width', value: 920 } }).render().asPng(),
  );
}

async function main(): Promise<void> {
  const llm = new AiSdkLlmAdapter(new ConfigService(process.env));
  const fixtures = loadSketchFixtures().filter(
    (fixture) => !only.length || only.includes(fixture.name),
  );
  if (saveAt) mkdirSync(saveAt, { recursive: true });
  const verdicts: SketchVerdict[] = [];
  for (const fixture of fixtures) {
    const started = Date.now();
    let geometry: DiagramGeometry | null = null;
    let template: SketchVerdict['template'] = 'none';
    let caption: string | null = null;
    let correction: string | undefined;
    for (let attempt = 1; attempt <= 2 && !geometry; attempt += 1) {
      if (graphOnly) {
        const kind = figureKindFor(fixture.description);
        const result = await llm.lectureDiagram({
          topicTitle: 'Chapter',
          figure: { kind, shows: fixture.description },
          spoken: fixture.material,
          pageText: fixture.material.slice(0, 4000),
          context: fixture.material.slice(0, 4000),
          correction,
        });
        const problems = diagramProblems(
          result.value,
          fixture.material,
          fixture.material,
          {
            live: true,
            maxNodes: LIVE_DIAGRAM_LIMITS.maxNodes,
            maxEdges: LIVE_DIAGRAM_LIMITS.maxEdges,
          },
        );
        if (problems.length) {
          correction = problems.map((p) => `${p.kind}: ${p.detail}`).join('; ');
          continue;
        }
        const laid = layoutDiagram(
          result.value,
          kind,
          fixture.material,
          fixture.name,
          60,
          regionLayout(REGION, kind),
        );
        if (geometryProblems(laid).length) {
          correction = geometryProblems(laid)
            .map((p) => p.detail)
            .join('; ');
          continue;
        }
        geometry = laid;
        template = 'graph';
        caption = `${result.value.nodes.length} boxes joined by ${result.value.edges.length} arrows`;
      } else {
        const result = await llm.lectureSketch({
          topicTitle: 'Chapter',
          shows: fixture.description,
          hint: templateHint(fixture.description),
          material: fixture.material,
          pageText: fixture.material.slice(0, 4000),
          correction,
        });
        const draft: SketchDraft =
          result.value.template === 'graph'
            ? { ...result.value, ...repairDraft(graphPlan(result.value)) }
            : repairSketch(result.value);
        template = draft.template;
        const problems = sketchProblems(
          draft,
          fixture.material,
          fixture.description,
        );
        if (problems.length) {
          correction = problems.map((p) => `${p.kind}: ${p.detail}`).join('; ');
          continue;
        }
        const laid = layoutSketch(
          draft,
          fixture.material,
          fixture.name,
          REGION,
          60,
          fixture.description,
        );
        if (sketchGeometryProblems(laid).length) {
          correction = sketchGeometryProblems(laid)
            .map((p) => p.detail)
            .join('; ');
          continue;
        }
        geometry = laid;
        caption = describeSketch(draft);
      }
    }
    const writerMs = Date.now() - started;
    if (!geometry) {
      verdicts.push({
        name: fixture.name,
        template: 'none',
        expected: fixture.expect,
        shows: false,
        wrong: `no drawable sketch: ${correction ?? ''}`,
        caption: null,
        writerMs,
      });
      continue;
    }
    const svg = sketchSvg(geometry);
    const png = await toPng(svg);
    if (saveAt) {
      writeFileSync(join(saveAt, `${mode}-${fixture.name}.svg`), svg);
      writeFileSync(join(saveAt, `${mode}-${fixture.name}.png`), png);
    }
    const judged = await llm.judgeSketch({
      png,
      description: fixture.description,
      see: fixture.see,
    });
    verdicts.push({
      name: fixture.name,
      template,
      expected: fixture.expect,
      shows: judged.value.shows,
      wrong: judged.value.wrong,
      caption,
      writerMs,
    });
  }

  console.log(`\nmode: ${mode}\n`);
  for (const verdict of verdicts) {
    console.log(
      `${verdict.shows ? 'ok' : 'XX'} ${verdict.name.padEnd(22)} ${String(verdict.template).padEnd(8)} want ${verdict.expected.padEnd(7)} ${String(verdict.writerMs).padStart(6)}ms  ${verdict.caption ?? ''}${verdict.wrong ? `\n     wrong: ${verdict.wrong}` : ''}`,
    );
  }
  const score = scoreVerdicts(verdicts);
  const baseline = readBaseline();
  const then = baseline[mode];
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  console.log(
    `\nshows ${pct(score.shows)}${then ? ` (baseline ${pct(then.shows)})` : ''}   template ${pct(score.template)}${then ? ` (baseline ${pct(then.template)})` : ''}   ${score.count} fixtures`,
  );
  if (writeBase && !only.length) {
    writeBaseline({ ...baseline, [mode]: score });
    console.log('baseline written');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

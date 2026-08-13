/**
 * A live check against the configured provider, deliberately small.
 *
 * Four calls — summarize, simplify one page, one streamed highlight, one
 * embedding batch — which is cents, not dollars. Run this before turning the
 * full pipeline loose on a 300-page document, because the failures worth
 * catching here (a wrong model id, a provider that won't do structured output,
 * a key without access) all show up on call one.
 *
 *   npm run check:models
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from '../src/web/adapters/ai-sdk/ai-sdk-llm.adapter';

const PAGE = `THYROID HORMONE SYNTHESIS
Iodide is actively transported into the follicular cell by the sodium-iodide
symporter, a process referred to as iodide trapping. It is then oxidised by
thyroid peroxidase and organified onto tyrosine residues of thyroglobulin,
yielding monoiodotyrosine (MIT) and diiodotyrosine (DIT). Coupling of these
residues produces T3 and T4, which are stored in the colloid until required.`;

const SUMMARY =
  'A human physiology lecture on the posterior pituitary and the thyroid gland, ' +
  'for undergraduate medical students.';

const rule = (title: string) => console.log(`\n\x1b[1m── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\x1b[0m`);

async function main() {
  const adapter = new AiSdkLlmAdapter(new ConfigService(process.env));
  adapter.onModuleInit(); // throws on a missing key, before anything is spent

  let spentIn = 0;
  let spentOut = 0;
  const account = (label: string, usage: { model: string; tokensIn: number; tokensOut: number; latencyMs: number }) => {
    spentIn += usage.tokensIn;
    spentOut += usage.tokensOut;
    console.log(
      `\x1b[2m  ${label}: ${usage.model}  in ${usage.tokensIn} / out ${usage.tokensOut} tokens  ${usage.latencyMs}ms\x1b[0m`,
    );
  };

  rule('summarize');
  const summary = await adapter.summarize({ title: 'Posterior pituitary and thyroid gland', text: PAGE });
  console.log(summary.value);
  account('summarize', summary.usage);

  rule('simplify one page (structured output)');
  const simplified = await adapter.simplifyPage({
    task: 'simplify_standard',
    pageText: PAGE,
    summary: SUMMARY,
    pageNumber: 12,
  });
  for (const block of simplified.value) {
    const prefix = block.type === 'bullet' ? '  •' : block.type === 'paragraph' ? '   ' : '  #';
    console.log(`${prefix} ${block.text}`);
  }
  account('simplify_standard', simplified.usage);

  rule('easiest read (same page, easier level)');
  const easiest = await adapter.simplifyPage({
    task: 'simplify_easiest',
    pageText: PAGE,
    summary: SUMMARY,
    pageNumber: 12,
  });
  for (const block of easiest.value) {
    const prefix = block.type === 'bullet' ? '  •' : block.type === 'paragraph' ? '   ' : '  #';
    console.log(`${prefix} ${block.text}`);
  }
  account('simplify_easiest', easiest.usage);

  rule('highlight: explain (streamed)');
  process.stdout.write('  ');
  const answer = await adapter.answerHighlight({
    task: 'highlight_explain',
    selection: 'iodide trapping',
    context: `[p.12] ${PAGE}`,
    summary: SUMMARY,
    onToken: (chunk) => process.stdout.write(chunk),
  });
  console.log();
  account('highlight_explain', answer.usage);

  rule('embeddings');
  const embedded = await adapter.embed({ texts: ['iodide trapping', 'thyroid peroxidase'] });
  console.log(`  ${embedded.value.length} vectors, ${embedded.value[0].length} dimensions`);
  account('embed', embedded.usage);

  rule('total');
  console.log(`  ${spentIn} input + ${spentOut} output tokens across 5 calls`);

  // The two things most worth eyeballing: did it keep the technical terms, and
  // did it invent anything the page never said?
  const text = simplified.value.map((block) => block.text).join(' ');
  const kept = ['MIT', 'DIT', 'T3', 'T4', 'thyroglobulin'].filter((term) => text.includes(term));
  console.log(`  technical terms preserved: ${kept.join(', ') || '(none — check the prompt)'}`);
}

main().catch((error: Error) => {
  console.error(`\n\x1b[31m${error.message}\x1b[0m`);
  process.exit(1);
});

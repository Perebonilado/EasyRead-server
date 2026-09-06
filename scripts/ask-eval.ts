/**
 * Does the tutor help a learner who reaches ahead of the page?
 *
 *   npm run ask:eval                     every fixture, as the session builds it
 *   npm run ask:eval -- --with-passages  with the book's passages on the question, as the release will post them
 *   npm run ask:eval -- --write-baseline record this run's scores under its mode
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { ModelRegistry } from '../src/web/adapters/ai-sdk/models';
import { askInstructions, type AskContext } from '../src/business/domain/ask';
import { TUTORS } from '../src/business/domain/values/tutors';
import {
  loadAskFixtures,
  readAskBaseline,
  scoreAskVerdicts,
  writeAskBaseline,
  type AskFixture,
  type AskVerdict,
} from '../src/business/domain/ask-eval';

const args = process.argv.slice(2);
const withPassages = args.includes('--with-passages');
const writeBase = args.includes('--write-baseline');
const only = args.filter((arg) => !arg.startsWith('--'));
const mode = withPassages ? 'with-passages' : 'plain';

function contextOf(fixture: AskFixture): AskContext {
  const tutor = TUTORS[0];
  const ahead = fixture.chapter.beats.find(
    (beat) => beat.pageNumber > fixture.pageNumber,
  );
  const pages = fixture.chapter.beats.map((beat) => beat.pageNumber);
  return {
    tutor: { name: tutor.name, askPersona: tutor.askPersona },
    title: 'System Design Interview',
    summary: 'How large systems are designed, one problem per chapter.',
    style: 'steady',
    noteLevel: 'standard',
    pageNumber: fixture.pageNumber,
    pageCount: fixture.pageCount,
    chapter: {
      title: fixture.chapter.title,
      pageIndex: Math.max(1, pages.indexOf(fixture.pageNumber) + 1),
      pageCount: Math.max(1, pages.length),
      arc: fixture.chapter.arc,
      next: ahead?.goal ?? null,
      beats: fixture.chapter.beats,
    },
    heard: fixture.heard,
    moment: null,
    highlighted: null,
    profileLine: null,
    conversation: null,
    invited: true,
  };
}

async function main(): Promise<void> {
  const registry = new ModelRegistry(new ConfigService(process.env));
  const { generateText, generateObject } = await registry.modules();
  const { model: answerer } = await registry.languageModel('chat_document');
  const { model: judge } = await registry.languageModel('lecture_verify');
  const fixtures = loadAskFixtures().filter(
    (f) => !only.length || only.includes(f.name),
  );
  const verdicts: AskVerdict[] = [];
  for (const fixture of fixtures) {
    const ctx = contextOf(fixture);
    const pageContext = `\n\nTHE PAGE THEY ARE ON, as the note reads:\n${fixture.pageText.slice(0, 3500)}`;
    const notes: string[] = [];
    if (withPassages) {
      notes.push(
        `PASSAGES THE BOOK HAS ON WHAT THEY JUST SAID, found by searching the whole book; answer from them and say the page when you use one:\n${fixture.passages
          .map((p) => `[page ${p.pageNumber}] ${p.text.slice(0, 700)}`)
          .join('\n')}`,
      );
    }
    // The passages ride with the instructions here; in the call they are a
    // system item posted before the answer, which this provider's text API
    // does not allow mid-conversation.
    const answered = await generateText({
      model: answerer,
      system: [askInstructions(ctx) + pageContext, ...notes].join('\n\n'),
      messages: [{ role: 'user' as const, content: fixture.question }],
    });
    const judged = await generateObject({
      model: judge,
      schema: z.object({
        confirms: z.boolean(),
        namesAnswer: z.boolean(),
        namesPage: z.boolean(),
        wrong: z.string().max(300).nullable(),
      }),
      system:
        "You judge a tutor's spoken answer to a learner who has reached ahead of the page. Say whether the answer (1) confirms or plainly addresses the problem the learner raised, (2) names the answer the book gives, as described, and (3) names the page where the book gives it. Be strict: re-explaining the current page does not count as confirming. When something is missing, say in one sentence what.",
      prompt: `The learner, on page ${fixture.pageNumber}, said: "${fixture.question}"\nA good answer: ${fixture.expect} The book's answer is on page ${fixture.answerPages.join(' or ')}.\n\nThe tutor answered:\n${answered.text}`,
    });
    verdicts.push({
      name: fixture.name,
      ...judged.object,
      answer: answered.text,
    });
  }
  console.log(`\nmode: ${mode}\n`);
  for (const v of verdicts) {
    const flags = `${v.confirms ? 'confirms' : '       '} ${v.namesAnswer ? 'answer' : '      '} ${v.namesPage ? 'page' : '    '}`;
    console.log(
      `${v.confirms && v.namesAnswer && v.namesPage ? 'ok' : 'XX'} ${v.name.padEnd(24)} ${flags}${v.wrong ? `\n     wrong: ${v.wrong}` : ''}\n     "${v.answer.replace(/\s+/g, ' ').slice(0, 220)}"`,
    );
  }
  const score = scoreAskVerdicts(verdicts);
  const then = readAskBaseline()[mode];
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  console.log(
    `\nhelped ${pct(score.helped)}${then ? ` (baseline ${pct(then.helped)})` : ''}   confirms ${pct(score.confirms)}   answer ${pct(score.namesAnswer)}   page ${pct(score.namesPage)}   ${score.count} fixtures`,
  );
  if (writeBase && !only.length) {
    writeAskBaseline({ ...readAskBaseline(), [mode]: score });
    console.log('baseline written');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

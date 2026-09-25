/**
 * A chapter's teacher's notes, printed for looking over:
 *
 *   npm run scene:notes -- <documentId> <page> [--again]
 *
 * The notes of the chapter the page is in, as its videos are written from
 * them: made with the real reader if they are not yet, or made again with
 * --again. Each page: how it stands to the one before and why, its goal,
 * its small ideas with what to show, and what it hands on.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { SceneProcessor } from '../src/pipeline/processors/scene.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule],
  providers: [SceneProcessor],
})
class SceneNotesModule {}

async function main() {
  const [documentId, page] = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'));
  if (!documentId || !page) {
    console.error('npm run scene:notes -- <documentId> <page> [--again]');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(SceneNotesModule, {
    logger: ['log', 'warn', 'error'],
  });
  const { topic, notes } = await app
    .get(SceneProcessor)
    .chapterNotes(documentId, Number(page), process.argv.includes('--again'));
  if (!notes) {
    console.log(`No notes could be made for "${topic.title}".`);
    await app.close();
    return;
  }
  const lines = [
    `"${topic.title}", pages ${notes.from}-${notes.to}`,
    `Thread: ${notes.thread}`,
    ...(notes.example ? [`Running example: ${notes.example}`] : []),
    ...(notes.diagram ? [`The picture it builds: ${notes.diagram}`] : []),
    ...(notes.pictures?.length
      ? [
          'How its things are drawn:',
          ...notes.pictures.map(
            (one) =>
              `  ${one.name}: ${one.is}; draw ${one.draw}${one.person ? ' (a person)' : ''}`,
          ),
        ]
      : []),
  ];
  for (const one of notes.pages) {
    lines.push(
      '',
      `p${one.page} ${one.relation.toUpperCase()}${one.evidence ? ` (${one.evidence})` : ''}`,
      `  goal: ${one.goal}`,
    );
    if (one.newHere.length) lines.push(`  new: ${one.newHere.join(', ')}`);
    if (one.callback) lines.push(`  builds on: ${one.callback}`);
    one.points.forEach((point, k) =>
      lines.push(
        `  ${k + 1}. [${point.kind}] ${point.say}${point.show ? `  → show: ${point.show}` : ''}`,
      ),
    );
    if (one.lists.length) lines.push(`  lists: ${one.lists.join('; ')}`);
    if (one.pitfall) lines.push(`  mistake: ${one.pitfall}`);
    if (one.check) lines.push(`  check: ${one.check}`);
    if (one.handoff) lines.push(`  hands on: ${one.handoff}`);
    if (one.endsOn.length) lines.push(`  ends on: ${one.endsOn.join(', ')}`);
  }
  console.log(lines.join('\n'));
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

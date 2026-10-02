/**
 * The picture desk by hand (explainer-animation-tech §4.3; WP11): what it
 * finds for an editor's episode, or for one person or place, with every
 * licence, every refusal and why, as a person checking its work reads it.
 *
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --episode <id> [--out <file.json>]
 *       the episode's one pass (its people's portraits, its places' photos
 *       from the research's years), as the board will be offered them
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --person "Ahmadu Bello" [--years 1957,1960] [--place Nigeria] [--role "…"]
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --place-photo Lagos --years 1957,1960 [--country Nigeria]
 *       one question: every candidate it cleared, ranked, and the one it takes
 *
 * It asks the sources politely (one request at a time) and keeps what it
 * takes in the picture cache and the storage the settings name (set
 * STORAGE_ROOT to share a tree's storage). PICTURE_DEPTH=off for no depth.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import type { PictureDesk } from '../src/business/domain/pictures/desk';
import {
  deskPass,
  passQuestions,
} from '../src/business/domain/pictures/episode';
import type { PictureQuery } from '../src/business/domain/pictures/types';
import { PICTURE_DESK } from '../src/business/ports/tokens';
import { STUDIO_REPOSITORY } from '../src/business/repositories/tokens';
import type { StudioRepository } from '../src/business/repositories/studio.repository';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule] })
class PicturesDeskModule {}

const option = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const years = () =>
  (option('--years') ?? '')
    .split(',')
    .map((y) => Number(y.trim()))
    .filter((y) => Number.isFinite(y) && y > 0);

async function one(desk: PictureDesk, query: PictureQuery): Promise<void> {
  console.log(`\nAsked: ${JSON.stringify(query)}`);
  const result = await desk.find(query);
  if (result.qid)
    console.log(
      `Wikidata: ${result.qid}${result.person ? ` (${result.person.label}, ${result.person.description})` : ''}`,
    );
  if (!result.found.length)
    console.log(`Nothing clears: ${result.reason ?? ''}`);
  for (const [i, c] of result.found.entries())
    console.log(
      `  ${i + 1}. ${c.score.toFixed(3)}  ${c.file.sourceId}\n      ${c.chip}\n      ${c.licence.code} (tier ${c.licence.tier}) · ${c.file.width}×${c.file.height} · focal ${c.focal.from} · ${c.notes.join(' · ')}\n      ${c.file.pageUrl}`,
    );
  const picked = await desk.lookup(query);
  console.log(
    picked
      ? `Taken: ${picked.id} ${picked.width}×${picked.height} ${picked.storageKey}${picked.depthKey ? ` + ${picked.depthKey}` : ''}\n  ${picked.credit}`
      : 'Taken: none',
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(PicturesDeskModule, {
    logger: ['warn', 'error'],
  });
  try {
    const desk = app.get<PictureDesk>(PICTURE_DESK);
    const person = option('--person');
    const place = option('--place-photo');
    if (person) {
      await one(desk, {
        name: person,
        kind: 'person',
        ...(years().length ? { years: years() } : {}),
        ...(option('--place') ? { place: [option('--place')!] } : {}),
        ...(option('--role') ? { role: option('--role')! } : {}),
      });
      return;
    }
    if (place) {
      await one(desk, {
        name: place,
        kind: 'place',
        ...(years().length ? { years: years() } : {}),
        ...(option('--country') ? { place: [option('--country')!] } : {}),
      });
      return;
    }
    const episodeId = option('--episode');
    if (!episodeId)
      throw new Error(
        'Give --episode <id>, --person "<name>" or --place-photo <name>',
      );
    const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
    const episode = await studio.findEpisode(episodeId);
    const show = episode ? await studio.findShow(episode.showId) : null;
    if (!episode?.editorial || !show)
      throw new Error(`No editor's episode ${episodeId}`);
    const input = {
      rows: episode.editorial.rows,
      research: show.editor?.research ?? null,
      world: show.editor?.world ?? null,
    };
    console.log(`"${episode.title}": ${input.rows.length} lines`);
    for (const q of passQuestions(input))
      console.log(`  asks: ${q.for} ${JSON.stringify(q.query)}`);
    const pictures = await deskPass(desk, input, {
      log: (m) => console.log(`  ${m}`),
    });
    console.log(`\nCleared ${pictures.entries.length}:`);
    for (const { entry, place: shows } of pictures.entries)
      console.log(
        `  ${entry.name}${shows ? ` (offered where the lines name ${shows})` : ''}\n    ${entry.picture?.credit}\n    ${entry.picture?.fullCredit}`,
      );
    const out = option('--out');
    if (out) {
      writeFileSync(resolve(out), JSON.stringify(pictures, null, 2));
      console.log(`\nWritten to ${resolve(out)}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

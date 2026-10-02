/**
 * The picture desk by hand (explainer-animation-tech §4.3; WP11): what it
 * finds for an editor's episode, or for one person or place, with every
 * licence, every refusal and why, as a person checking its work reads it.
 *
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --episode <id> [--out <file.json>]
 *       the episode's one pass (its people's portraits, its places' photos
 *       from the research's years), as the board will be offered them
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --research television [--out <file.json>]
 *       the same pass on a research log kept for trying it (the first years
 *       of television, pictures/__fixtures__/television.ts)
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --person "Ahmadu Bello" [--years 1957,1960] [--place Nigeria] [--role "…"]
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --place-photo Lagos --years 1957,1960 [--country Nigeria]
 *   npx ts-node --transpile-only scripts/pictures-desk.ts --event "Nigeria becomes independent" --years 1960 [--country Nigeria] [--where Lagos]
 *       one question: every candidate it cleared, ranked, and the ones it takes
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
  countsOf,
  deskPass,
  eventName,
  eventNames,
  passQuestions,
} from '../src/business/domain/pictures/episode';
import type {
  PictureCandidate,
  PictureQuery,
} from '../src/business/domain/pictures/types';
import { TELEVISION } from '../src/business/domain/pictures/__fixtures__/television';
import { costOf } from '../src/business/domain/cost';
import type { LlmUsage } from '../src/business/ports/llm.port';
import { LLM_GATEWAY, STORAGE } from '../src/business/ports/tokens';
import type { LlmGatewayPort } from '../src/business/ports/llm.port';
import type { StoragePort } from '../src/business/ports/storage.port';
import {
  PICTURE_CACHE_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../src/business/repositories/tokens';
import type { PictureCacheRepository } from '../src/business/repositories/picture-cache.repository';
import { pictureDeskOf } from '../src/web/adapters/pictures/picture-desk.factory';
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

/** The model calls the desk made (its look at each picture it took), for the spend. */
const calls: LlmUsage[] = [];
const onUsage = (usage: LlmUsage) => calls.push(usage);
function spend(): string {
  const usd = calls.reduce(
    (sum, u) =>
      sum +
      (costOf({
        task: 'picture_focus',
        model: u.model,
        tokensIn: u.tokensIn,
        tokensOut: u.tokensOut,
      }) ?? 0),
    0,
  );
  return `${calls.length} look${calls.length === 1 ? '' : 's'} at pictures, $${usd.toFixed(4)}`;
}

async function one(desk: PictureDesk, query: PictureQuery): Promise<void> {
  console.log(`\nAsked: ${JSON.stringify(query)}`);
  const result = await desk.find(query);
  if (result.qid)
    console.log(
      `Wikidata: ${result.qid}${result.person ? ` (${result.person.label}, ${result.person.description})` : ''}`,
    );
  const list = (title: string, found: readonly PictureCandidate[]) => {
    if (!found.length) return;
    console.log(title);
    for (const [i, c] of found.slice(0, 8).entries())
      console.log(
        `  ${i + 1}. ${c.score.toFixed(3)}  ${c.file.sourceId}\n      ${c.chip}\n      ${c.licence.code} (tier ${c.licence.tier}) · ${c.file.width}×${c.file.height} · focal ${c.focal.from} · ${c.notes.join(' · ')}\n      ${c.file.pageUrl}`,
      );
  };
  if (!result.found.length && !result.photos?.length)
    console.log(`Nothing clears: ${result.reason ?? ''}`);
  else if (!result.found.length && query.kind === 'person')
    console.log('No portrait of them alone clears; photos of them do.');
  list(query.kind === 'person' ? 'Portraits:' : 'Cleared:', result.found);
  list('Photos of them among others:', result.photos ?? []);
  const taken = await desk.lookupAll(query, { onUsage });
  if (!taken.length) console.log('Taken: none');
  for (const picked of taken)
    console.log(
      `Taken (${picked.use ?? 'photo'}): ${picked.id} ${picked.width}×${picked.height} ${picked.storageKey}${picked.depthKey ? ` + ${picked.depthKey}` : ''}\n  ${picked.chip}\n  ${picked.credit}`,
    );
  console.log(`Spend: ${spend()}`);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(PicturesDeskModule, {
    logger: ['warn', 'error'],
  });
  try {
    // The desk as the worker makes it, its reasons said here.
    const desk: PictureDesk = pictureDeskOf({
      setting: (name) => process.env[name],
      cache: app.get<PictureCacheRepository>(PICTURE_CACHE_REPOSITORY),
      storage: app.get<StoragePort>(STORAGE),
      llm: app.get<LlmGatewayPort>(LLM_GATEWAY),
      log: (message) => console.log(`  ${message}`),
    });
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
        asked: `a place: ${place}${option('--country') ? `, ${option('--country')}` : ''}, itself (its streets, buildings, skyline or landscape)`,
      });
      return;
    }
    const event = option('--event');
    if (event) {
      const where = option('--where');
      const country = option('--country');
      const names = eventNames(event, []);
      await one(desk, {
        name: eventName(event),
        kind: 'event',
        years: years(),
        place: [where, country].filter((p): p is string => Boolean(p)),
        words: [event, ...(where ? [where] : [])],
        ...(names.length ? { names } : {}),
        asked: `an event: ${event} (${years().join(', ')}${where ? `, ${where}` : ''})`,
      });
      return;
    }
    const episodeId = option('--episode');
    const research = option('--research');
    if (!episodeId && research !== 'television')
      throw new Error(
        'Give --episode <id>, --research television, --person "<name>" or --place-photo <name>',
      );
    let input: Parameters<typeof passQuestions>[0];
    if (episodeId) {
      const studio = app.get<StudioRepository>(STUDIO_REPOSITORY);
      const episode = await studio.findEpisode(episodeId);
      const show = episode ? await studio.findShow(episode.showId) : null;
      if (!episode?.editorial || !show)
        throw new Error(`No editor's episode ${episodeId}`);
      input = {
        rows: episode.editorial.rows,
        research: show.editor?.research ?? null,
        world: show.editor?.world ?? null,
      };
      console.log(`"${episode.title}": ${input.rows.length} lines`);
    } else {
      input = TELEVISION;
      console.log(`The first years of television: ${input.rows.length} lines`);
    }
    const questions = passQuestions(input);
    for (const q of questions)
      console.log(`  asks: ${q.shows.kind} ${JSON.stringify(q.query)}`);
    const asked = (kind: string) =>
      questions.filter((q) => q.shows.kind === kind).length;
    const pictures = await deskPass(desk, input, {
      log: (m) => console.log(`  ${m}`),
      onUsage,
    });
    console.log(`\nCleared ${pictures.entries.length}:`);
    for (const { entry, offer } of pictures.entries)
      console.log(
        `  ${entry.name}${entry.shows ? ` (shows ${entry.shows.kind}: ${entry.shows.name})` : ' (portrait)'}${offer.kind === 'event' ? '' : ` offered where the lines name ${offer.name}`}\n    ${entry.about}\n    ${entry.picture?.credit}\n    ${entry.picture?.fullCredit}`,
      );
    const counts = countsOf(pictures);
    console.log(
      `\nBy kind: people ${counts.portraits} portraits + ${counts.person} more photos (of ${asked('person')} asked); places ${counts.place} (of ${asked('place')}); events ${counts.event} (of ${asked('event')}); things ${counts.thing} (of ${asked('thing')})`,
    );
    console.log(`\nSpend: ${spend()}`);
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

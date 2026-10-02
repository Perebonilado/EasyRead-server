/**
 * The map stage's sample scene (work package 8): "The Regional Turn"'s own
 * map (its show's world.base, read from the database and nothing written),
 * made the geo asset the player draws, under two of the episode's own lines
 * timed by hand as shots:
 *
 *  1. a tilted terrain map of the country, Lagos pinned;
 *  2. the three regions filling one after another, each in its side's colour;
 *  3. a spotlight on the regions, Lagos dimming with the rest;
 *  4. the camera pulling back to show them among their neighbours.
 *
 * Written as <name>.json and <name>-tall.json into each --out folder, for
 * the client's /dev/shots (public/dev-scenes/shots) and its tests
 * (src/lib/shots/__fixtures__).
 *
 *   npx ts-node --transpile-only scripts/shots-map-sample.ts --episode <id> --out <dir> [--out <dir>] [--name kano]
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'mysql2/promise';
import type {
  SceneDto,
  ShotDto,
  ShotInfoDto,
  ShotTargetDto,
} from '../src/contracts';
import { placeNamed } from '../src/business/domain/scene-map-places';
import { STAGES } from '../src/business/domain/scene-shape';
import { shotLook, MAP_TILT } from '../src/business/domain/shots/shot-build';
import { MAP_ASSET, mapSetAsset } from '../src/business/domain/shots/shot-map';
import { showTheme } from '../src/business/domain/studio/studio-look';
import type { PaletteToken } from '../src/business/domain/scene-palette';

const flags = (name: string) =>
  process.argv.flatMap((one, i) =>
    one === name && process.argv[i + 1] ? [process.argv[i + 1]] : [],
  );

/** Two of the episode's own lines (rows 6 and 29 of its script), as a voice might say them: a word every 400 ms. */
const LINES: [string, number][] = [
  [
    'Politics now ran through three regional bases, not one neutral national center in Lagos.',
    400,
  ],
  [
    'Independence had to fit that bargain, because reform had already moved power outward in practice.',
    7000,
  ],
];
const WORD_MS = 400;
const DURATION_MS = 15_000;

function beatsOf(): SceneDto['beats'] {
  return LINES.map(([text, startMs]) => {
    const found = [...text.matchAll(/\S+/g)];
    const words = found.map(
      (m, i) =>
        [
          m.index,
          m.index + m[0].length,
          startMs + i * WORD_MS,
          startMs + (i + 1) * WORD_MS - 40,
        ] as [number, number, number, number],
    );
    return {
      text,
      startMs,
      endMs: words[words.length - 1][3],
      words,
    };
  });
}

/** The moment a word of a line is said. */
const wordAt = (line: number, word: number) => LINES[line][1] + word * WORD_MS;

async function main(): Promise<void> {
  const episodeId = flags('--episode')[0];
  const outs = flags('--out');
  const name = flags('--name')[0] ?? 'kano';
  if (!episodeId || !outs.length)
    throw new Error('--episode <id> and --out <dir> are needed');
  const db = await createConnection(process.env.DATABASE_URL!);
  type Row = { editor: string | null; brief: string; bible: string | null };
  const [rows] = await db.query(
    'SELECT s.editor, s.brief, s.bible FROM studio_episodes e JOIN studio_shows s ON s.id = e.show_id WHERE e.id = ?',
    [episodeId],
  );
  await db.end();
  const row = (rows as Row[])[0];
  if (!row?.editor) throw new Error('no editor show for that episode');
  const editor = JSON.parse(row.editor) as {
    world?: {
      base?: unknown;
      palette?: { thing: string; token: PaletteToken }[];
      held?: { token: PaletteToken } | null;
    };
  };
  const world = editor.world ?? {};
  const theme =
    showTheme(
      JSON.parse(row.brief) as never,
      row.bible ? (JSON.parse(row.bible) as never) : null,
    ) ?? 'paper';
  const look = shotLook({
    palette: world.palette ?? [],
    held: world.held?.token ?? null,
    theme,
  });
  const map = await mapSetAsset(world.base, look, 'wide', theme);
  if (!map || map.asset.kind !== 'geo')
    throw new Error("the show's map could not be made");
  const feature = (id: string): ShotTargetDto => ({
    kind: 'feature',
    asset: MAP_ASSET,
    id,
  });
  const lagos = placeNamed('Lagos')!;
  const regions = ['North Region', 'West Region', 'East Region'];
  const ids = regions.map((one) => map.parts[one]);
  if (ids.some((id) => !id)) throw new Error('a region is missing');
  const set: ShotDto['set'] = {
    kind: 'map',
    asset: MAP_ASSET,
    style: 'atlas',
    tilt: MAP_TILT,
    bearing: 0,
    terrain: true,
  };
  const whole: ShotTargetDto = { kind: 'asset', asset: MAP_ASSET };
  const life = (seed: number) => [
    { effect: 'cloud-shadows' as const, seed, amount: 0.6 },
  ];
  const lastMs = DURATION_MS - 400;
  // The regions fill one after another as "three regional bases" is said, each settling before the next.
  const fills: ShotInfoDto[] = ids.map((id, k) => ({
    id: `s1-fill-${k + 1}`,
    recipe: 'fill',
    target: feature(id),
    atMs: 1500 + k * 600,
    durMs: 600,
    colour: regions[k],
  }));
  // On "not one neutral national center", the regions are lit and the rest, Lagos with it, dims.
  const spots: ShotInfoDto[] = ids.map((id, k) => ({
    id: `s1-spot-${k + 1}`,
    recipe: 'spotlight',
    target: feature(id),
    atMs: wordAt(0, 7) - 700,
    durMs: 700,
    untilMs: lastMs,
  }));
  const shots: ShotDto[] = [
    {
      id: 's1',
      startMs: 0,
      endMs: 7000,
      set,
      actors: [],
      info: [
        {
          id: 's1-pin-lagos',
          recipe: 'pin',
          target: { kind: 'geo', lng: lagos.lon, lat: lagos.lat },
          atMs: 600,
          durMs: 350,
          // Dimmed with the rest under the spotlight, it leaves before the camera pulls back.
          untilMs: wordAt(1, 10) - 400,
          text: 'Lagos',
        },
        ...fills,
        ...spots,
      ],
      life: life(17),
      camera: [{ move: 'establish', atMs: 0, durMs: 1800 }],
      focal: whole,
      join: 'continue',
      joinMs: 0,
      ...(map.chip ? { chip: map.chip } : {}),
    },
    {
      id: 's2',
      startMs: 7000,
      endMs: DURATION_MS,
      set,
      actors: [],
      info: [],
      life: life(17),
      // On "moved power outward", the camera pulls back to show the regions among their neighbours.
      camera: [
        { move: 'pull', atMs: wordAt(1, 10) - 300, durMs: 2600, amount: 0.75 },
      ],
      focal: whole,
      join: 'cut',
      joinMs: 0,
      ...(map.chip ? { chip: map.chip } : {}),
    },
  ];
  for (const shape of ['wide', 'tall'] as const) {
    const stage = STAGES[shape];
    const scene: SceneDto = {
      version: 4,
      generator: 'shots-map-sample',
      title: 'Three regional bases',
      ...(shape === 'tall' ? { shape } : {}),
      durationMs: DURATION_MS,
      settledMs: DURATION_MS,
      timing: 'estimated',
      beats: beatsOf(),
      things: [],
      steps: [],
      effects: [],
      sound: { mood: 'curious' },
      stagings: {
        box: { w: stage.w, h: stage.h, places: [] },
        wide: { w: stage.w, h: stage.h, places: [] },
      },
      engine: 'shots',
      shots: {
        version: 1,
        look,
        assets: { [MAP_ASSET]: map.asset },
        shots,
        sounds: [],
      },
    };
    for (const out of outs) {
      mkdirSync(out, { recursive: true });
      const file = join(out, `${name}${shape === 'tall' ? '-tall' : ''}.json`);
      writeFileSync(file, JSON.stringify(scene));
      console.log(
        `${file}: ${Math.round(JSON.stringify(scene).length / 1024)} KB`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

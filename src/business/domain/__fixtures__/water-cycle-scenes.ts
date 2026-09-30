/**
 * The water-cycle build (water-cycle-build.ts) made into its three scenes
 * as the Studio makes them, for the board lab and the tests: its drawings
 * drawn by hand in the house palette, its voice timed by an estimate. No
 * model is asked, nothing is voiced.
 */
import type { FilmShape } from '../scene-shape';
import type {
  StudioEpisodeRecord,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../repositories/studio.repository';
import { studioMakeOf } from '../../../pipeline/processors/studio.processor';
import { composeScene } from '../scene-compose';
import { textPacing, trimCards } from '../scene-reading';
import { SCENE_GENERATOR_VERSION, type SceneScript } from '../scene-script';
import { gateDrawing, type GatedDrawing } from '../scene-svg';
import type { TimedBeat } from '../scene-timing';
import type { StudioBible, StudioBrief } from '../studio/studio';
import { studioReading } from '../studio/studio-motion';
import {
  WATER_OUTLINE,
  WATER_PICTURES,
  WATER_SHEETS,
} from './water-cycle-build';

const INK = '#1F2A37';

/** Each picture of the build, drawn by hand. */
export const WATER_SVGS: Record<string, string> = {
  sun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><g id="rays" stroke="${INK}" stroke-width="14" stroke-linecap="round">${Array.from(
    { length: 12 },
    (_, i) => {
      const a = (i * Math.PI) / 6;
      const r0 = 250;
      const r1 = 340;
      return `<line x1="${400 + r0 * Math.cos(a)}" y1="${400 + r0 * Math.sin(a)}" x2="${400 + r1 * Math.cos(a)}" y2="${400 + r1 * Math.sin(a)}"/>`;
    },
  ).join(
    '',
  )}</g><circle cx="400" cy="400" r="200" fill="#F2B33D" stroke="${INK}" stroke-width="14"/><path d="M320 430 Q400 500 480 430" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><circle cx="340" cy="360" r="18" fill="${INK}"/><circle cx="460" cy="360" r="18" fill="${INK}"/></svg>`,
  sea: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><path d="M40 300 Q160 220 280 300 T520 300 T760 300 T920 300 L920 560 L40 560 Z" fill="#3D8FD1" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/><path d="M80 400 Q180 350 280 400 T480 400 T680 400 T880 400" fill="none" stroke="#CFE6F3" stroke-width="12" stroke-linecap="round"/><path d="M120 480 Q220 440 320 480 T520 480 T720 480" fill="none" stroke="#CFE6F3" stroke-width="10" stroke-linecap="round"/></svg>`,
  vapour: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${[
    220, 400, 580,
  ]
    .map(
      (x) =>
        `<path d="M${x} 700 C${x - 90} 600 ${x + 90} 520 ${x} 420 C${x - 90} 320 ${x + 90} 240 ${x} 140" fill="none" stroke="#6B7785" stroke-width="22" stroke-linecap="round"/><path d="M${x - 30} 170 L${x} 110 L${x + 30} 170" fill="none" stroke="#6B7785" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('')}</svg>`,
  drops: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${[
    [260, 300],
    [420, 240],
    [560, 340],
    [330, 470],
    [500, 500],
    [400, 380],
  ]
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y - 70} C${x + 50} ${y} ${x + 50} ${y + 50} ${x} ${y + 50} C${x - 50} ${y + 50} ${x - 50} ${y} ${x} ${y - 70} Z" fill="#CFE6F3" stroke="${INK}" stroke-width="10"/>`,
    )
    .join('')}</svg>`,
  cloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><path d="M220 460 C120 460 100 340 200 320 C190 220 320 180 380 250 C420 150 580 150 610 260 C700 220 800 290 760 370 C850 390 840 470 760 470 Z" fill="#F4F1EA" stroke="${INK}" stroke-width="14" stroke-linejoin="round"/><path d="M300 400 Q360 430 420 400" fill="none" stroke="#6B7785" stroke-width="10" stroke-linecap="round"/></svg>`,
  rain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${Array.from(
    { length: 9 },
    (_, i) => {
      const x = 160 + (i % 3) * 220 + (Math.floor(i / 3) % 2) * 60;
      const y = 140 + Math.floor(i / 3) * 210;
      return `<line x1="${x}" y1="${y}" x2="${x - 40}" y2="${y + 130}" stroke="#3D8FD1" stroke-width="22" stroke-linecap="round"/>`;
    },
  ).join('')}</svg>`,
  river: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><path d="M0 420 Q240 200 480 360 T960 300 L960 600 L0 600 Z" fill="#A7D58C" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/><path d="M60 600 C200 500 420 520 520 440 C620 360 820 420 940 380" fill="none" stroke="#3D8FD1" stroke-width="46" stroke-linecap="round"/><path d="M60 600 C200 500 420 520 520 440 C620 360 820 420 940 380" fill="none" stroke="${INK}" stroke-width="6" stroke-dasharray="4 18" stroke-linecap="round"/></svg>`,
};

/** A voice timed by estimate: about two and a half words a second, a breath between sentences. */
export function timedBeats(script: SceneScript): {
  beats: TimedBeat[];
  durationMs: number;
} {
  let at = 700;
  const beats = script.beats.map((beat) => {
    const words: number[][] = [];
    let char = 0;
    const start = at;
    for (const word of beat.say.split(/\s+/)) {
      const from = beat.say.indexOf(word, char);
      char = from + word.length;
      const ms = 180 + word.length * 45;
      words.push([from, char, Math.round(at), Math.round(at + ms)]);
      at += ms + 40;
    }
    const end = at;
    at += beat.delivery === 'key' || beat.delivery === 'recap' ? 900 : 550;
    return { text: beat.say, startMs: start, endMs: end, words };
  });
  return { beats, durationMs: Math.round(at + 400) };
}

/** The build's three scenes, each composed as the Studio would, in order. */
export async function composeWaterBuild(
  /** The film's shape (studio-vertical-plan): a tall build's board is turned, 3 × 4. */
  shape: FilmShape = 'wide',
): Promise<(ReturnType<typeof composeScene> & { pacing: string[] })[]> {
  const bible: StudioBible = {
    characters: [],
    sets: [],
    world: null,
    subject: 'science: the water cycle',
    maths: false,
    pictures: WATER_PICTURES,
  };
  const brief = {
    format: 'explainer',
    idea: 'the water cycle',
    audience: 'children',
    tone: 'calm',
    source: null,
  } as unknown as StudioBrief;
  const show = {
    id: 'lab',
    userId: 'lab',
    title: 'The Water Cycle',
    format: 'explainer',
    brief,
    bible,
  } as unknown as StudioShowRecord;
  const episode = {
    id: 'lab-e1',
    showId: 'lab',
    number: 1,
    title: 'The water cycle',
    outline: {
      title: 'The water cycle',
      logline: 'Where rain comes from.',
      scenes: WATER_OUTLINE,
    },
  } as unknown as StudioEpisodeRecord;
  const rows = WATER_SHEETS.map(
    (sheet, position) =>
      ({
        id: `r${position}`,
        episodeId: 'lab-e1',
        position,
        sheet,
        status: 'ready',
      }) as StudioSceneRecord,
  );
  const reading = studioReading(brief);
  const drawn = new Map<string, GatedDrawing>();
  for (const [id, svg] of Object.entries(WATER_SVGS)) {
    const gated = await gateDrawing(svg, { parts: [], states: [], motion: '' });
    if (!gated.drawing) throw new Error(`${id}: ${gated.notes.join(' ')}`);
    drawn.set(id, gated.drawing);
  }
  return rows.map((row) => {
    const of = studioMakeOf(show, episode, row, rows, bible);
    const script = of.script!;
    const { beats, durationMs } = timedBeats(script);
    const drawings = new Map(
      script.cast.map((t) => [
        t.id,
        drawn.get(t.id) ?? drawn.get(t.id === 'wisps' ? 'vapour' : '') ?? null,
      ]),
    );
    const made = composeScene({
      script: trimCards(script, reading.cardWords),
      drawings,
      beats,
      durationMs,
      timing: 'estimated',
      generator: SCENE_GENERATOR_VERSION,
      profile: { ...of.profile, film: true },
      ...(shape !== 'wide' ? { shape } : {}),
    });
    made.scene.reading = { wpm: reading.wpm, motion: reading.motion };
    return { ...made, pacing: textPacing(made.scene, reading) };
  });
}

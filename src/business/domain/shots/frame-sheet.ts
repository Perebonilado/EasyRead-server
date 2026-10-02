/**
 * What the frame checks hand to people (explainer-animation-plan.md §9.1):
 * a contact sheet per scene, its stills tiled four across, each labelled
 * with its moment and the scene's title, a strip under it naming what
 * failed there; and a written summary of the scores, scene by scene and
 * for the episode, with what fails most. The critic (WP13) reads the same
 * sheets. Pure: the sheet is an SVG of the tiles (PNGs, as data) and their
 * words, rendered by the caller (scene-raster's rasterise).
 */
import type { FilmShape } from '../../../contracts';
import { RULES_VERSION } from '../studio/explainer-rules';
import type {
  FrameCode,
  FrameProblem,
  FrameScores,
  StillImage,
} from './frame-checks';

/** A still made smaller: each block of `factor` × `factor` pixels averaged into one. */
export function shrink(image: StillImage, factor: number): StillImage {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return image;
  const width = Math.max(1, Math.floor(image.width / f));
  const height = Math.max(1, Math.floor(image.height / f));
  const data = new Uint8Array(width * height * 4);
  const n = f * f;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < f; dy += 1) {
        const row = ((y * f + dy) * image.width + x * f) * 4;
        for (let dx = 0; dx < f; dx += 1) {
          const at = row + dx * 4;
          r += image.data[at];
          g += image.data[at + 1];
          b += image.data[at + 2];
          a += image.data[at + 3];
        }
      }
      const to = (y * width + x) * 4;
      data[to] = Math.round(r / n);
      data[to + 1] = Math.round(g / n);
      data[to + 2] = Math.round(b / n);
      data[to + 3] = Math.round(a / n);
    }
  return { width, height, data };
}

/** One still on a sheet: its PNG (base64), its moment on the scene's clock, and what failed in it. */
export interface SheetTile {
  png: string;
  ms: number;
  codes: FrameCode[];
}

export interface SheetInput {
  /** The scene's title, on every tile and over the sheet. */
  title: string;
  /** A line under the title: the scene's scores. */
  subtitle: string;
  tiles: SheetTile[];
  shape: FilmShape;
  columns?: number;
}

/** A tile's size by the film's shape, and the sheet's spacing, in the sheet's pixels. */
const TILE: Record<FilmShape, { w: number; h: number }> = {
  wide: { w: 480, h: 270 },
  tall: { w: 270, h: 480 },
};
const GAP = 14;
const MARGIN = 18;
const HEADER = 74;
const STRIP = 48;
const FONT = 'Liberation Sans';

export const escapeXml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c] ?? c,
  );

/** Words cut to a length, with an ellipsis where they were cut. */
export const cut = (text: string, most: number): string =>
  text.length <= most
    ? text
    : `${text.slice(0, Math.max(1, most - 1)).trimEnd()}…`;

/** A moment as people read it: 12.3s. */
export const secondsOf = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** What failed in a still, in a few words: each check once, most first. */
export function codesLine(codes: readonly FrameCode[]): string {
  const counts = new Map<FrameCode, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => (n > 1 ? `${code} ×${n}` : code))
    .join(' · ');
}

/** A scene's contact sheet as an SVG: the tiles four across, each with its moment, the title, and what failed under it. */
export function sheetSvg(input: SheetInput): {
  svg: string;
  width: number;
  height: number;
} {
  const tile = TILE[input.shape];
  const columns = Math.max(1, input.columns ?? 4);
  const rows = Math.max(1, Math.ceil(input.tiles.length / columns));
  const width = MARGIN * 2 + columns * tile.w + (columns - 1) * GAP;
  const height = HEADER + rows * (tile.h + STRIP + GAP) - GAP + MARGIN;
  // About as many characters as fit across a tile at the strip's size.
  const fit = Math.floor(tile.w / 8.2);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`,
    `<rect width="${width}" height="${height}" fill="#14161b"/>`,
    `<text x="${MARGIN}" y="${MARGIN + 24}" font-size="26" font-weight="700" fill="#ffffff">${escapeXml(cut(input.title, Math.floor(width / 15)))}</text>`,
    `<text x="${MARGIN}" y="${MARGIN + 50}" font-size="16" fill="#b8bec9">${escapeXml(cut(input.subtitle, Math.floor(width / 8.5)))}</text>`,
  ];
  input.tiles.forEach((one, k) => {
    const x = MARGIN + (k % columns) * (tile.w + GAP);
    const y = HEADER + Math.floor(k / columns) * (tile.h + STRIP + GAP);
    const failing = one.codes.length > 0;
    parts.push(
      `<image x="${x}" y="${y}" width="${tile.w}" height="${tile.h}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${one.png}" xlink:href="data:image/png;base64,${one.png}"/>`,
      `<rect x="${x - 1}" y="${y - 1}" width="${tile.w + 2}" height="${tile.h + 2}" fill="none" stroke="${failing ? '#ff5d5d' : '#3a3f4a'}" stroke-width="${failing ? 3 : 1}"/>`,
      `<text x="${x}" y="${y + tile.h + 19}" font-size="15" fill="#e8ebf0"><tspan font-weight="700">${secondsOf(one.ms)}</tspan> · ${escapeXml(cut(input.title, fit - 8))}</text>`,
      `<text x="${x}" y="${y + tile.h + 39}" font-size="14" fill="${failing ? '#ff8a8a' : '#7fd19b'}">${escapeXml(cut(failing ? codesLine(one.codes) : 'nothing failed', fit))}</text>`,
    );
  });
  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}

/** A scene's scores in a line: each axis, the overall, the word cards' and the subject's shares. */
export function scoresLine(scores: FrameScores): string {
  const share = (n: number | null) =>
    n === null ? '–' : `${(n * 100).toFixed(1)}%`;
  return [
    `readability ${scores.readability}`,
    `composition ${scores.composition}`,
    `pace ${scores.pace}`,
    `truth ${scores.truth}`,
    `overall ${scores.overall}${scores.pass ? ' (passes)' : ''}`,
    `word cards ${share(scores.cardShare)}`,
    `subject ${share(scores.focalShare)} of the frame, ${share(scores.focalHeight)} of its height`,
  ].join(' · ');
}

/** One scene's part of the summary. */
export interface SummaryScene {
  n: number;
  title: string;
  durationMs: number;
  scores: FrameScores;
  problems: FrameProblem[];
  sheet: string;
}

/** The written summary: the scores by scene and for the episode, what fails most, and each scene's worst. */
export function summaryMarkdown(input: {
  title: string;
  episodeId: string;
  shape: FilmShape;
  per: string;
  at: string;
  ms: number;
  scenes: SummaryScene[];
  episode: FrameScores;
}): string {
  const share = (n: number | null) =>
    n === null ? '–' : `${(n * 100).toFixed(1)}%`;
  const row = (name: string, s: FrameScores, sheet = '') =>
    `| ${name} | ${s.stills} | ${s.readability} | ${s.composition} | ${s.pace} | ${s.truth} | **${s.overall}** | ${share(s.cardShare)} | ${share(s.personShare)} | ${share(s.focalShare)} / ${share(s.focalHeight)} | ${sheet} |`;
  const lines = [
    `# Frames: ${input.title}`,
    '',
    `Episode \`${input.episodeId}\`, ${input.shape}; stills per ${input.per}; rules v${RULES_VERSION}; ${input.at}; checked in ${Math.round(input.ms / 1000)} s.`,
    '',
    'Scores are out of 10 (8 passes). Word cards and people are shares of the scene’s time; the subject is the median share of the frame’s area / height over the stills.',
    '',
    '| Scene | Stills | Readability | Composition | Pace | Truth | Overall | Word cards | Kit people | Subject (area / height) | Sheet |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...input.scenes.map((scene) =>
      row(
        `${scene.n}. ${escapeTable(scene.title)}`,
        scene.scores,
        `[sheet](${scene.sheet})`,
      ),
    ),
    row('**Episode**', input.episode),
    '',
    '## What fails most',
    '',
  ];
  const all = input.scenes.flatMap((scene) => scene.problems);
  const byCode = new Map<FrameCode, number>();
  for (const problem of all)
    byCode.set(problem.code, (byCode.get(problem.code) ?? 0) + 1);
  const top = [...byCode.entries()].sort((a, b) => b[1] - a[1]);
  if (!top.length) lines.push('Nothing failed.');
  for (const [code, n] of top)
    lines.push(
      `- \`${code}\` (${all.find((p) => p.code === code)?.axis}): ${n}`,
    );
  for (const scene of input.scenes) {
    lines.push(
      '',
      `## ${scene.n}. ${scene.title}`,
      '',
      scoresLine(scene.scores),
      '',
    );
    // Each kind of failure once, its first, so a scene's worst read at a glance.
    const seen = new Set<string>();
    const worst = scene.problems.filter((problem) => {
      const key = `${problem.code}:${problem.ids?.[0] ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!worst.length) lines.push('Nothing failed.');
    for (const problem of worst.slice(0, 12))
      lines.push(
        `- ${secondsOf(problem.ms)} \`${problem.code}\`: ${problem.message}`,
      );
    if (worst.length > 12)
      lines.push(
        `- and ${worst.length - 12} more kinds (checks.json has them all)`,
      );
  }
  return `${lines.join('\n')}\n`;
}

const escapeTable = (text: string) => text.replace(/\|/g, '\\|');

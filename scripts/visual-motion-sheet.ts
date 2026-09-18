/**
 * The motion sheet: every motion, every manner and every mechanism the
 * stage can run, five frames each, on one page, so a change to any of
 * them is looked at before it ships. Kept in the repo as the golden set.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/visual-motion-sheet.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { MOTIONS } from '../src/business/domain/living.generated/motion';
import { rasterise, renderStill } from '../src/business/domain/visual-render';
import type { VisualElement } from '../src/business/domain/visual';
import { FIGURE_MANNERS } from '../src/business/domain/visual-figures';
import {
  MECHANISM_KINDS,
  MECHANISMS,
} from '../src/business/domain/visual-mechanisms';

const FRAMES = [0, 600, 1400, 2600, 4800];
const CELL = { w: 180, h: 135 };
const GAP = 8;
const LABEL = 16;

type Row = { label: string; element: VisualElement; phases?: VisualElement[] };
const rows: Row[] = [];
for (const motion of MOTIONS)
  rows.push({
    label: `motion: ${motion}`,
    element: {
      id: 'thing',
      type: 'shape',
      x: 90,
      y: 66,
      w: 56,
      h: 56,
      kind: 'coins',
      color: 'amber',
      motion,
      ...(motion === 'along' ? { motionTo: { x: 150, y: 66 } } : {}),
    } as VisualElement,
  });
for (const manner of FIGURE_MANNERS)
  rows.push({
    label: `manner: ${manner}`,
    element: {
      id: 'thing',
      type: 'figure',
      x: 90,
      y: 66,
      w: 120,
      h: 84,
      of: 'insect',
      outline: 'insect',
      parts: ['wings', 'legs', 'antennae'],
      manner,
      seed: 3,
      color: 'amber',
    } as VisualElement,
  });
for (const kind of MECHANISM_KINDS) {
  const spec = MECHANISMS[kind];
  const stages = spec.stages.map((s) => s.name);
  // A phase chip per stage, off the cell, so the still shows the stage the frame is on.
  const phases = stages.map(
    (name, i) =>
      ({
        id: `ph${i}`,
        type: 'chip',
        x: -200,
        y: -200,
        text: name,
        color: 'blue',
      }) as VisualElement,
  );
  rows.push({
    label: `mechanism: ${kind}`,
    element: {
      id: 'thing',
      type: 'mechanism',
      x: 90,
      y: 66,
      w: 160,
      h: 110,
      kind,
      params: {},
      stages,
      phaseIds: phases.map((p) => p.id),
      seed: 1,
      color: 'blue',
    } as unknown as VisualElement,
    phases,
  });
}

const width = 150 + FRAMES.length * (CELL.w + GAP) + GAP;
const height = rows.length * (CELL.h + GAP) + GAP;
const tiles = rows
  .map((row, r) => {
    const y = GAP + r * (CELL.h + GAP);
    const label = `<text x="8" y="${y + 20}" font-family="Helvetica" font-size="12" font-weight="700" fill="#ffffff">${row.label}</text>`;
    const frames = FRAMES.map((ms, f) => {
      const x = 150 + f * (CELL.w + GAP);
      const clip = `c${r}-${f}`;
      // A machine is a stage further on in each frame, a few seconds into it.
      const phases = row.phases ?? [];
      const stage = Math.min(phases.length - 1, f);
      const shown = new Map<string, number>([[row.element.id, 1]]);
      phases.slice(0, stage + 1).forEach((p) => shown.set(p.id, 1));
      const at = phases.length ? 2500 : ms;
      return (
        `<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${CELL.w}" height="${CELL.h}"/></clipPath>` +
        `<g clip-path="url(#${clip})"><g transform="translate(${x} ${y})">${renderStill([row.element, ...phases], shown, CELL, false, at)}</g></g>` +
        `<rect x="${x}" y="${y}" width="${CELL.w}" height="${CELL.h}" fill="none" stroke="#3B4560"/>` +
        (r === 0
          ? `<text x="${x + 4}" y="${y - 2}" font-family="Helvetica" font-size="10" fill="#8B95A8">${ms} ms</text>`
          : '')
      );
    }).join('');
    return label + frames;
  })
  .join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -${LABEL} ${width} ${height + LABEL}" width="${width}" height="${height + LABEL}"><rect x="0" y="-${LABEL}" width="${width}" height="${height + LABEL}" fill="#0F1520"/>${tiles}</svg>`;
(async () => {
  const png = await rasterise(svg, width * 1.5);
  const out = join(__dirname, '..', 'docs', 'visual-motion-sheet.png');
  writeFileSync(out, png);
  console.log(
    `${rows.length} rows, ${FRAMES.length} frames each -> ${out} (${png.length} bytes)`,
  );
})();

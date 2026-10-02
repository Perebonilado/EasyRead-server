/**
 * Two sides set against each other at full frame (two systems, before and
 * after, one region and another): the frame cut in two, each half washed
 * faintly in its side's colour, its name large in that colour and a short
 * list under it. Side by side in a wide frame; one over the other in a
 * tall one, running on down past the frame's foot when the lists are
 * long. The voice names the sides; it never says which is where.
 *
 * Parts: each side `side-a` and `side-b` (their halves), each side's name
 * `label-<name>`, each item `item-<name>`, the line between them
 * `divider` (its path).
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { iconPaths } from '../scene-icon-set';
import { readSplit, type SplitDraft } from '../scene-split';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  coloursFor,
  defsPrefix,
  esc,
  fit,
  fitBalanced,
  frameOf,
  linesBox,
  mix,
  paintOf,
  partSvg,
  r1,
  slugOf,
  textSvg,
  union,
} from './shot-chart-kit';

export function splitAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const spec = readSplit(bodyOf('split', raw) as unknown as SplitDraft);
  if (!spec) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const floor = frame.size.label;
  const colours = coloursFor(
    paint,
    spec.sides.map((s) => ({ name: s.label, token: s.colour })),
  );
  const prefix = defsPrefix(
    `split|${spec.sides.map((s) => s.label).join('|')}`,
  );
  const icons = [
    ...new Set(spec.sides.map((s) => s.icon).filter((i) => i !== null)),
  ];
  const out: string[] = [
    icons.length
      ? `<defs>${icons.map((name) => `<symbol id="${prefix}-${name}" viewBox="0 0 100 100">${iconPaths(name)}</symbol>`).join('')}</defs>`
      : '',
  ];
  const pad = floor * 0.8;
  // Each side's words laid out for its half's width.
  const halfW = tall ? text.x1 - text.x0 : (text.x1 - text.x0) / 2 - pad * 1.5;
  const layoutOf = (i: 0 | 1, largest = frame.size.title * 1.2) => {
    const side = spec.sides[i];
    const head = fitBalanced(
      side.label,
      halfW,
      largest,
      floor,
      2,
      700,
      'display',
    );
    const iconSize = side.icon ? floor * 1.1 : 0;
    const items = side.items.map((item) =>
      fit(
        item,
        halfW - (iconSize ? iconSize + floor * 0.4 : 0),
        floor,
        floor,
        2,
        600,
      ),
    );
    const headH = head.lines.length * head.size * 1.08;
    const itemsH = items.reduce(
      (h, it) => h + it.lines.length * floor * 1.15 + floor * 0.3,
      0,
    );
    return {
      head,
      items,
      iconSize,
      height: headH + (items.length ? floor * 0.7 + itemsH : 0),
    };
  };
  // A tall frame's two sides one over the other, both inside the safe
  // band: their names a little smaller where both will not fit at a title's size.
  const midGap = pad * 1.8;
  const bandH = text.y1 - text.y0;
  let laid = [layoutOf(0), layoutOf(1)];
  if (tall && laid[0].height + laid[1].height + midGap > bandH)
    laid = [layoutOf(0, floor * 1.15), layoutOf(1, floor * 1.15)];
  const ids = spec.sides.map((side, i) => ({
    side: i === 0 ? 'side-a' : 'side-b',
    label: book.id(`label-${slugOf(side.label) || String(i + 1)}`),
  }));
  // The halves: full bleed, left and right, or top and bottom.
  // A tall frame's line between them where the first side's words end
  // (the two together in the middle of the band), each side's wash running
  // on to its edge of the frame.
  const spare = Math.max(0, bandH - laid[0].height - laid[1].height - midGap);
  const mid = tall
    ? text.y0 + spare * 0.35 + laid[0].height + midGap / 2
    : frame.W / 2;
  const halves: ShotBox[] = tall
    ? [
        [0, 0, frame.W, mid],
        [0, mid, frame.W, frame.H - mid],
      ]
    : [
        [0, 0, mid, frame.H],
        [mid, 0, frame.W - mid, frame.H],
      ];
  const boxes: ShotBox[] = [];
  let bottom = frame.H;
  spec.sides.forEach((side, k) => {
    const i = k as 0 | 1;
    const { head, items, iconSize, height } = laid[i];
    const colour = colours[i];
    const [hx, hy, hw, hh] = halves[i];
    const x = tall ? text.x0 : i === 0 ? text.x0 : mid + pad * 1.5;
    // The words stand together in the middle of their half's words area.
    // A tall frame's first side ends at the line, its second starts from it.
    const areaTop = tall
      ? i === 0
        ? mid - midGap / 2 - height
        : mid + midGap / 2
      : text.y0;
    const areaBottom = tall ? (i === 0 ? mid - midGap / 2 : text.y1) : text.y1;
    const top = Math.max(
      areaTop,
      areaTop + (areaBottom - areaTop - height) * (tall ? 0 : 0.45),
    );
    const inner: string[] = [
      `<rect x="${r1(hx)}" y="${r1(hy)}" width="${r1(hw)}" height="${r1(hh)}" fill="${esc(mix(paint.paper, colour.colour, paint.dark ? 0.14 : 0.08))}"/>`,
    ];
    let y = top;
    const base = y + head.size * ASCENT;
    const hbox = linesBox(
      head.lines,
      x,
      base,
      head.size,
      'start',
      1.08,
      700,
      'display',
    );
    book.add(ids[i].label, { box: hbox, role: colour.role });
    inner.push(
      textSvg(
        head.lines,
        x,
        base,
        {
          size: head.size,
          fill: colour.colour,
          family: paint.display,
          leading: 1.08,
        },
        ids[i].label,
      ),
    );
    y = hbox[1] + hbox[3] + floor * 0.7;
    side.items.forEach((item, j) => {
      const id = book.id(`item-${slugOf(item) || `${i + 1}-${j + 1}`}`);
      const lines = items[j].lines;
      const tx = x + (iconSize ? iconSize + floor * 0.4 : 0);
      const ib = y + floor * ASCENT;
      const tbox = linesBox(lines, tx, ib, floor, 'start', 1.15, 600);
      const box = iconSize
        ? union(tbox, [x, ib - floor * 0.85, iconSize, iconSize])
        : tbox;
      book.add(id, { box, role: 'ink' });
      inner.push(
        partSvg(
          id,
          (iconSize
            ? `<use href="#${prefix}-${side.icon}" x="${r1(x)}" y="${r1(ib - floor * 0.85)}" width="${r1(iconSize)}" height="${r1(iconSize)}" fill="${esc(colour.colour)}"/>`
            : '') +
            textSvg(lines, tx, ib, {
              size: floor,
              fill: paint.ink,
              family: paint.text,
              weight: 600,
            }),
        ),
      );
      y = tbox[1] + tbox[3] + floor * 0.3;
    });
    book.add(ids[i].side, { box: halves[i], role: colour.role });
    out.push(partSvg(ids[i].side, inner.join('')));
    boxes.push(union(hbox, [x, top, halfW, y - top]));
    if (tall && i === 1) bottom = Math.max(frame.H, y + pad * 2, hy + hh);
  });
  // The line between them.
  const stroke = Math.max(3, frame.H * 0.004);
  const path = tall ? `M0 ${r1(mid)}H${frame.W}` : `M${r1(mid)} 0V${frame.H}`;
  book.add('divider', {
    box: tall
      ? [0, mid - stroke, frame.W, stroke * 2]
      : [mid - stroke, 0, stroke * 2, frame.H],
    path,
    role: 'ink',
  });
  out.push(
    partSvg(
      'divider',
      `<path d="${path}" stroke="${esc(paint.ink)}" stroke-width="${r1(stroke)}"/>`,
    ),
  );
  // A tall frame's second side may run on past the frame's foot: the camera travels down to it.
  const long = tall && bottom > frame.H;
  const box: ShotBox = long
    ? [0, 0, frame.W, Math.ceil(bottom)]
    : [0, 0, frame.W, frame.H];
  return assetOf(
    frame,
    paint,
    out.join(''),
    book,
    long ? [0, 0, frame.W, frame.H] : union(...boxes),
    box,
  );
}

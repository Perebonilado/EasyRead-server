/**
 * A unit chart at full frame: a number shown as that many icons (people,
 * schools, coins) in a grid that fills the picture, beside (or, in a tall
 * frame, under) what it counts. A number too large to draw one by one is
 * drawn with each icon standing for a round number of them, and a key
 * says so; a part of one is a part of an icon, drawn over its faint whole.
 *
 * A subset the voice picks out ("30 of them") is a part of its own,
 * `highlight`, holding its icons: the grid stands back in the muted ink so
 * a recipe can light the subset.
 *
 * Parts: every icon `icon-<n>` (from the first, row by row), the whole
 * grid `icons`, the subset `highlight`, the caption `label`, the `key`
 * and the `source`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { valueText } from '../scene-chart';
import { iconPaths } from '../scene-icon-set';
import { gridOf, perIcon, readIcons, type IconsDraft } from '../scene-icons';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  defsPrefix,
  esc,
  extraOf,
  fit,
  frameOf,
  linesBox,
  mainColour,
  paintOf,
  partSvg,
  r1,
  sourceLine,
  sourceSvg,
  textSvg,
  union,
  wordsWithin,
} from './shot-chart-kit';

/** The most icons a grid draws, in either shape: past this each stands for more (a hundred makes a grid of percentages). */
export const MOST_ICONS = 100;

/** A unit chart as the writer gives it, or as code keeps it (its subset an object). */
function draftOf(raw: Record<string, unknown>): IconsDraft {
  const body = bodyOf('icons', raw);
  const highlight = body.highlight;
  if (highlight && typeof highlight === 'object' && !Array.isArray(highlight)) {
    const h = highlight as Record<string, unknown>;
    return {
      ...(body as unknown as IconsDraft),
      highlight: (h.count as number | string | null) ?? null,
      highlightLabel: (h.label as string | null) ?? null,
    };
  }
  return body as unknown as IconsDraft;
}

export function iconsAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('icons', raw);
  // Its words kept whole within the lengths the reader keeps them to.
  const spec = readIcons(
    wordsWithin(draftOf(raw), { unit: 24, label: 60, highlightLabel: 40 }),
    extra.name,
    extra,
  );
  if (!spec) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const floor = frame.size.label;
  const per = perIcon(spec.count, MOST_ICONS, spec.per);
  const exact = spec.count / per;
  const whole = Math.floor(exact + 1e-9);
  const part = exact - whole > 0.04 ? exact - whole : 0;
  const n = Math.max(1, whole + (part ? 1 : 0));
  // A subset to light: the grid stands back in the muted ink, ready.
  const colour = spec.highlight
    ? { colour: paint.muted, role: 'muted' }
    : mainColour(paint, spec.colour);
  const labelText =
    spec.label ?? (spec.unit ? valueText(spec.count, spec.unit) : null);
  const scaled =
    /\b(?:thousand|million|billion|trillion|lakh|crore|bn|m|k)\b/i.test(
      spec.unit ?? '',
    );
  const keyText = per > 1 || scaled ? `= ${valueText(per, spec.unit)}` : null;
  const source = sourceLine(spec.source);
  const prefix = defsPrefix(`icons|${spec.icon}|${spec.count}|${per}|${shape}`);
  const symbol = `${prefix}-${spec.icon}`;
  const out: string[] = [
    `<defs><symbol id="${symbol}" viewBox="0 0 100 100">${iconPaths(spec.icon)}</symbol></defs>`,
  ];
  // The words: a column at the left of a wide frame, the top of a tall one's words' area.
  const textW = tall ? text.x1 - text.x0 : frame.W * 0.3;
  const label = labelText
    ? fit(labelText, textW, frame.size.title, floor, tall ? 3 : 4, 600)
    : null;
  const keySize = floor;
  const wordsH =
    (label ? label.lines.length * label.size * 1.15 : 0) +
    (keyText ? keySize * 1.9 : 0) +
    (source ? frame.size.chip * 2.4 : 0);
  // A tall frame's source goes with the words over the grid.
  const hasWords = Boolean(label || keyText || (tall && source));
  // The grid's area.
  const area = tall
    ? {
        x0: frame.pic.x0,
        x1: frame.pic.x1,
        y0: hasWords ? text.y0 + wordsH + floor * 0.6 : text.y0,
        y1: frame.pic.y1,
      }
    : hasWords
      ? {
          x0: text.x0 + textW + floor * 1.2,
          x1: text.x1,
          y0: text.y0,
          y1: text.y1,
        }
      : { x0: text.x0, x1: text.x1, y0: text.y0, y1: text.y1 };
  const aw = area.x1 - area.x0;
  const ah = area.y1 - area.y0;
  const laid = gridOf(n, aw, ah);
  const cell = Math.min(laid.cell, frame.H * (tall ? 0.22 : 0.32));
  const size = cell * 0.84;
  const rows = Math.ceil(n / laid.cols);
  const gw = laid.cols * cell;
  const gh = rows * cell;
  const gx = area.x0 + (aw - gw) / 2;
  const gy = area.y0 + (ah - gh) / (tall ? 3 : 2);
  const at = (i: number) => ({
    x: gx + (i % laid.cols) * cell + (cell - size) / 2,
    y: gy + Math.floor(i / laid.cols) * cell + (cell - size) / 2,
  });
  const lit = spec.highlight
    ? Math.max(1, Math.min(n, Math.round(spec.highlight.count / per)))
    : 0;
  const use = (i: number) => {
    const { x, y } = at(i);
    const id = `icon-${i + 1}`;
    book.add(id, {
      box: [x, y, size, size],
      role: colour.role,
      pivot: [0.5, 1],
    });
    return `<use data-part="${id}" href="#${symbol}" x="${r1(x)}" y="${r1(y)}" width="${r1(size)}" height="${r1(size)}"/>`;
  };
  const icons: string[] = [];
  const first: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const isPart = part && i === n - 1;
    let drawn = use(i);
    if (isPart) {
      // A part of an icon: its faint whole, and its share over it.
      const { x, y } = at(i);
      const clip = `${prefix}-part`;
      out.push(
        `<defs><clipPath id="${clip}"><rect x="${r1(x)}" y="${r1(y - 2)}" width="${r1(size * part)}" height="${r1(size + 4)}"/></clipPath></defs>`,
      );
      drawn =
        `<use href="#${symbol}" x="${r1(x)}" y="${r1(y)}" width="${r1(size)}" height="${r1(size)}" fill="${esc(paint.faint)}"/>` +
        `<g clip-path="url(#${clip})">${drawn}</g>`;
    }
    (i < lit ? first : icons).push(drawn);
  }
  const gridBox: ShotBox = [gx, gy, gw, gh];
  if (lit) {
    const box = union(
      ...Array.from({ length: lit }, (_, i): ShotBox => [
        at(i).x,
        at(i).y,
        size,
        size,
      ]),
    );
    book.add('highlight', {
      box,
      value: spec.highlight!.count,
      role: colour.role,
    });
    icons.unshift(partSvg('highlight', first.join('')));
  }
  book.add('icons', { box: gridBox, value: spec.count, role: colour.role });
  out.push(partSvg('icons', icons.join(''), ` fill="${esc(colour.colour)}"`));
  // The words beside or over it.
  const wx = text.x0;
  let y = tall ? text.y0 : Math.max(text.y0, gy + gh / 2 - wordsH / 2);
  const focal: ShotBox[] = [gridBox];
  if (label) {
    const base = y + label.size * ASCENT;
    const box = linesBox(label.lines, wx, base, label.size, 'start', 1.15, 600);
    book.add('label', { box, role: 'ink' });
    out.push(
      textSvg(
        label.lines,
        wx,
        base,
        { size: label.size, fill: paint.ink, family: paint.text, weight: 600 },
        'label',
      ),
    );
    focal.push(box);
    y = box[1] + box[3] + floor * 0.3;
  }
  if (keyText) {
    // The key: one icon, and what it stands for.
    const k = keySize * 1.1;
    const tx = wx + k + keySize * 0.3;
    const base = y + keySize * 1.05;
    const box = union(
      [wx, y + keySize * 0.15, k, k],
      linesBox([keyText], tx, base, keySize, 'start', 1.15, 600),
    );
    book.add('key', { box, role: 'muted' });
    out.push(
      partSvg(
        'key',
        `<use href="#${symbol}" x="${r1(wx)}" y="${r1(y + keySize * 0.15)}" width="${r1(k)}" height="${r1(k)}" fill="${esc(colour.colour)}"/>` +
          textSvg([keyText], tx, base, {
            size: keySize,
            fill: paint.muted,
            family: paint.text,
            weight: 600,
          }),
      ),
    );
    y += keySize * 1.9;
  }
  if (source) {
    // Under the words; under the grid when there are none.
    const sy = hasWords
      ? y + frame.size.chip * 1.2
      : text.y1 - frame.size.chip * 0.35;
    out.push(sourceSvg(book, paint, frame, source, wx, sy, textW).svg);
  }
  return assetOf(frame, paint, out.join(''), book, union(...focal));
}

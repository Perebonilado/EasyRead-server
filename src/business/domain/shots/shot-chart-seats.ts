/**
 * A chamber's seats at full frame: a parliament's hemicycle, or a
 * chamber's two benches facing across the floor. Every seat is a dot; the
 * empty chamber is drawn faint under them, so a recipe that brings a
 * group's seats on lights them where they sit; each group fills a wedge
 * of the arc in its side's colour. Its total stands in the hollow, a key
 * names each group with its seats, and a majority line says how many make
 * one when asked.
 *
 * A chamber too large to draw seat by seat (past MOST_SEATS) is drawn
 * with each dot standing for a round number of members, and the key says
 * so.
 *
 * Parts: each group's seats `group-<name>` (its seats as its value), the
 * whole chamber `chamber`, each seat `seat-<n>` round the arc from its
 * first end (when there are at most MOST_SEAT_PARTS), the `total`, the
 * `majority` (its line's path), the `key` and each of its entries
 * `key-<name>`, the caption `label`, the `source`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { perIcon } from '../scene-icons';
import { benches, hemicycle, readSeats, type SeatsDraft } from '../scene-seats';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  coloursFor,
  esc,
  extraOf,
  figuresWidth,
  fitBalanced,
  frameOf,
  grouped,
  linesBox,
  paintOf,
  partSvg,
  r1,
  slugOf,
  sourceLine,
  sourceSvg,
  textSvg,
  union,
  wordsWidth,
  wordsWithin,
} from './shot-chart-kit';

/** The most dots a chamber draws: past this, each stands for more members. */
export const MOST_SEATS = 700;
/** The most seats named one by one, as parts. */
export const MOST_SEAT_PARTS = 240;

export function seatsAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('seats', raw);
  // Its words kept whole within the lengths the reader keeps them to.
  const spec = readSeats(
    wordsWithin(bodyOf('seats', raw) as unknown as SeatsDraft, {
      name: 28,
      label: 60,
    }),
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
  const members = spec.groups.reduce((sum, g) => sum + g.seats, 0);
  const per = perIcon(members, MOST_SEATS);
  // Each group's dots: its share, rounded so the dots add up.
  const shares = spec.groups.map((g) => g.seats / per);
  const counts = shares.map(Math.floor);
  let left =
    Math.max(1, Math.round(members / per)) - counts.reduce((a, b) => a + b, 0);
  shares
    .map((d, i) => ({ i, frac: d - Math.floor(d) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (left > 0) {
        counts[i] += 1;
        left -= 1;
      }
    });
  const n = counts.reduce((a, b) => a + b, 0);
  const colours = coloursFor(
    paint,
    spec.groups.map((g) => ({ name: g.name, token: g.colour })),
  );
  const ids = spec.groups.map((g, i) =>
    book.id(`group-${slugOf(g.name) || String(i + 1)}`),
  );
  const keyIds = ids.map((id) => book.id(`key-${id.slice(6)}`));
  const source = sourceLine(spec.source);
  // The words round it: its caption over it, its key under it.
  const width = text.x1 - text.x0;
  const label = spec.label
    ? fitBalanced(spec.label, width, frame.size.title, floor, 3, 600)
    : null;
  const labelH = label
    ? label.lines.length * label.size * 1.15 + floor * 0.4
    : 0;
  const entries = spec.groups.map((g, i) => ({
    words: `${g.name} ${grouped(g.seats)}`,
    colour: colours[i],
  }));
  const entryW = (e: { words: string }) =>
    floor * 1.25 + wordsWidth(e.words, floor, 700) + floor * 1.1;
  const rows: number[][] = [[]];
  let rowW = 0;
  entries.forEach((e, i) => {
    const w = entryW(e);
    if (rows[rows.length - 1].length && rowW + w > width) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push(i);
    rowW += w;
  });
  const perKey = per > 1 ? `Each dot = ${grouped(per)} members` : null;
  const keyH = rows.length * floor * 1.55 + (perKey ? floor * 1.4 : 0);
  const sourceH = source ? frame.size.chip * 2.6 : 0;
  const majority = spec.majority && spec.layout === 'hemicycle';
  const majorityH = majority ? floor * 1.6 : 0;
  const out: string[] = [];
  const underlay: string[] = [];
  const seatSvg: string[][] = spec.groups.map(() => []);
  const seatBoxes: ShotBox[][] = spec.groups.map(() => []);
  let chamber: ShotBox;
  let centre = { x: frame.W / 2, y: 0 };
  let inner = 0;
  let R = 0;
  // A tall frame's words all stand over the chamber, inside the safe band
  // (its caption, its key, its total, its source, its majority), and the
  // chamber spans the picture under them; a wide frame's key goes under it.
  const hemi = spec.layout === 'hemicycle';
  const over = hemi || tall;
  const totalH = hemi ? frame.size.title * 1.35 : 0;
  const keyTop = text.y0 + labelH;
  const top = over
    ? keyTop + keyH + totalH + sourceH + majorityH
    : text.y0 + labelH + majorityH;
  if (spec.layout === 'hemicycle') {
    const arc = hemicycle(n);
    // A tall frame's chamber spans the picture, its key running on under it.
    // The chamber under its words, as large as the picture lets it be,
    // running on under the captions' band (a picture may).
    const room = Math.min(
      frame.W * (tall ? 0.47 : 0.4),
      (frame.pic.y1 - top) / (1 + arc.dot),
    );
    R = Math.max(floor * 2, room);
    const dot = arc.dot * R;
    centre = { x: frame.W / 2, y: top + R * (1 + arc.dot) };
    inner = arc.inner * R;
    const ordered = [...arc.seats].sort((a, b) => a.order - b.order);
    let start = 0;
    spec.groups.forEach((_, gi) => {
      for (const seat of ordered.slice(start, start + counts[gi])) {
        const x = centre.x + seat.x * R;
        const y = centre.y + seat.y * R;
        seatSvg[gi].push(`${r1(x)} ${r1(y)}`);
        seatBoxes[gi].push([x - dot, y - dot, dot * 2, dot * 2]);
      }
      start += counts[gi];
    });
    for (const seat of ordered)
      underlay.push(
        `${r1(centre.x + seat.x * R)} ${r1(centre.y + seat.y * R)}`,
      );
    chamber = [
      centre.x - R - dot,
      centre.y - R - dot,
      (R + dot) * 2,
      R + dot * 2,
    ];
    // Each dot a circle of its radius.
    const circles = (points: string[], extra = '') =>
      points
        .map((p) => {
          const [x, y] = p.split(' ');
          return `<circle cx="${x}" cy="${y}" r="${r1(dot)}"${extra}/>`;
        })
        .join('');
    out.push(`<g fill="${esc(paint.faint)}">${circles(underlay)}</g>`);
    let k = 0;
    const groups = spec.groups.map((g, gi) => {
      const dots = seatSvg[gi]
        .map((p) => {
          k += 1;
          const [x, y] = p.split(' ');
          const id = n <= MOST_SEAT_PARTS ? `seat-${k}` : null;
          if (id)
            book.add(id, {
              box: [Number(x) - dot, Number(y) - dot, dot * 2, dot * 2],
              role: colours[gi].role,
              pivot: [0.5, 0.5],
            });
          return `<circle${id ? ` data-part="${id}"` : ''} cx="${x}" cy="${y}" r="${r1(dot)}"/>`;
        })
        .join('');
      book.add(ids[gi], {
        box: seatBoxes[gi].length ? union(...seatBoxes[gi]) : chamber,
        value: g.seats,
        role: colours[gi].role,
      });
      return partSvg(ids[gi], dots, ` fill="${esc(colours[gi].colour)}"`);
    });
    out.push(partSvg('chamber', groups.join('')));
    // The total in the hollow, "seats" under it where there is room (a
    // tall frame's over the chamber, with its words).
    const total = grouped(members);
    const size = Math.min(
      inner * 0.72,
      (inner * 1.55) / Math.max(1, figuresWidth(total, 1, paint.figure)),
    );
    if (over) {
      // "312 seats": from the words' left edge in a tall frame, centred over a wide one's chamber.
      const tsize = frame.size.title;
      const base = keyTop + keyH + tsize * ASCENT;
      const tw = linesBox(
        [total],
        0,
        base,
        tsize,
        'start',
        1.15,
        700,
        'display',
        paint.figure,
      )[2];
      const sw = wordsWidth('seats', floor, 600);
      const tx = tall ? text.x0 : frame.W / 2 - (tw + floor * 0.3 + sw) / 2;
      const box = linesBox(
        [total],
        tx,
        base,
        tsize,
        'start',
        1.15,
        700,
        'display',
        paint.figure,
      );
      book.add('total', { box, value: members, role: 'ink' });
      out.push(
        textSvg(
          [total],
          tx,
          base,
          {
            size: tsize,
            fill: paint.ink,
            family: paint.display,
            tabular: true,
          },
          'total',
        ) +
          textSvg(['seats'], tx + tw + floor * 0.3, base, {
            size: floor,
            fill: paint.muted,
            family: paint.text,
            weight: 600,
          }),
      );
    } else if (size >= floor) {
      const word = inner * 0.45 >= floor * 1.1;
      const base = centre.y - (word ? floor * 0.95 : size * 0.1);
      const box = linesBox(
        [total],
        centre.x,
        base,
        size,
        'middle',
        1.15,
        700,
        'display',
        paint.figure,
      );
      book.add('total', { box, value: members, role: 'ink' });
      out.push(
        textSvg(
          [total],
          centre.x,
          base,
          {
            size,
            fill: paint.ink,
            family: paint.display,
            anchor: 'middle',
            tabular: true,
          },
          'total',
        ),
      );
      if (word)
        out.push(
          textSvg(['seats'], centre.x, centre.y - floor * 0.12, {
            size: floor,
            fill: paint.muted,
            family: paint.text,
            weight: 600,
            anchor: 'middle',
          }),
        );
    }
    if (majority) {
      const needed = Math.floor(members / 2) + 1;
      const words = `${grouped(needed)} for a majority`;
      const lineTop = centre.y - R - dot * 2.2;
      const lineBottom = centre.y - inner + dot;
      const path = `M${r1(centre.x)} ${r1(lineBottom)}V${r1(lineTop)}`;
      const base = lineTop - floor * 0.35;
      const tbox = linesBox(
        [words],
        centre.x,
        base,
        floor,
        'middle',
        1.15,
        700,
      );
      book.add('majority', {
        box: union(tbox, [centre.x - 2, lineTop, 4, lineBottom - lineTop]),
        path,
        role: 'ink',
      });
      out.push(
        partSvg(
          'majority',
          `<path d="${path}" stroke="${esc(paint.ink)}" stroke-width="${r1(Math.max(3, floor * 0.07))}" stroke-dasharray="${r1(floor * 0.3)} ${r1(floor * 0.25)}" stroke-linecap="round"/>` +
            textSvg([words], centre.x, base, {
              size: floor,
              fill: paint.ink,
              family: paint.text,
              anchor: 'middle',
            }),
        ),
      );
    }
  } else {
    // Two benches facing across the floor, each group a block of columns:
    // across a wide frame; in a tall one turned to face each other across
    // a floor that runs down the frame, under their key.
    const bench = benches(n);
    const down = bench.rows * 2 + 1.6;
    const pitch = tall
      ? Math.min(
          (frame.pic.x1 - frame.pic.x0) / down,
          (frame.pic.y1 - top - floor * 0.5) / bench.cols,
          floor * 2.2,
        )
      : Math.min(
          (text.x1 - text.x0) / bench.cols,
          (text.y1 - top - keyH - sourceH - floor) / down,
          floor * 2.2,
        );
    const dot = pitch * 0.4;
    const along = bench.cols * pitch;
    const across = down * pitch;
    const x0 = tall
      ? (frame.W - across) / 2 + pitch / 2
      : (frame.W - along) / 2 + pitch / 2;
    const y0 = top + pitch / 2;
    const at = (seat: { x: number; y: number }) =>
      tall
        ? { x: x0 + seat.y * pitch, y: y0 + seat.x * pitch }
        : { x: x0 + seat.x * pitch, y: y0 + seat.y * pitch };
    // The floor between the benches.
    const floorAt = pitch * (bench.rows + 0.25);
    out.push(
      tall
        ? `<rect x="${r1(x0 - pitch / 2 + floorAt + pitch * 0.15)}" y="${r1(y0 - pitch * 0.2)}" width="${r1(pitch * 0.8)}" height="${r1(along - pitch * 0.6)}" rx="${r1(pitch * 0.2)}" fill="${esc(paint.faint)}"/>`
        : `<rect x="${r1(x0 - pitch * 0.2)}" y="${r1(top + floorAt + pitch * 0.15)}" width="${r1(along - pitch * 0.6)}" height="${r1(pitch * 0.8)}" rx="${r1(pitch * 0.2)}" fill="${esc(paint.faint)}"/>`,
    );
    const ordered = [...bench.seats].sort((a, b) => a.order - b.order);
    out.push(
      `<g fill="${esc(paint.faint)}">${ordered.map((s) => `<circle cx="${r1(at(s).x)}" cy="${r1(at(s).y)}" r="${r1(dot)}"/>`).join('')}</g>`,
    );
    let start = 0;
    let k = 0;
    const groups = spec.groups.map((g, gi) => {
      const mine = ordered.slice(start, start + counts[gi]);
      start += counts[gi];
      const dots = mine
        .map((s) => {
          k += 1;
          const { x, y } = at(s);
          const id = n <= MOST_SEAT_PARTS ? `seat-${k}` : null;
          if (id)
            book.add(id, {
              box: [x - dot, y - dot, dot * 2, dot * 2],
              role: colours[gi].role,
              pivot: [0.5, 0.5],
            });
          seatBoxes[gi].push([x - dot, y - dot, dot * 2, dot * 2]);
          return `<circle${id ? ` data-part="${id}"` : ''} cx="${r1(x)}" cy="${r1(y)}" r="${r1(dot)}"/>`;
        })
        .join('');
      return { dots, gi };
    });
    chamber = tall
      ? [x0 - pitch / 2, top, across, along]
      : [x0 - pitch / 2, top, along, across];
    out.push(
      partSvg(
        'chamber',
        groups
          .map(({ dots, gi }) => {
            book.add(ids[gi], {
              box: seatBoxes[gi].length ? union(...seatBoxes[gi]) : chamber,
              value: spec.groups[gi].seats,
              role: colours[gi].role,
            });
            return partSvg(ids[gi], dots, ` fill="${esc(colours[gi].colour)}"`);
          })
          .join(''),
      ),
    );
    centre = { x: frame.W / 2, y: chamber[1] + chamber[3] };
  }
  book.add('chamber', { box: chamber, value: members });
  // The caption over it.
  if (label) {
    const base = text.y0 + label.size * ASCENT;
    const x = tall ? text.x0 : frame.W / 2;
    const anchor = tall ? 'start' : 'middle';
    const box = linesBox(label.lines, x, base, label.size, anchor, 1.15, 600);
    book.add('label', { box, role: 'ink' });
    out.push(
      textSvg(
        label.lines,
        x,
        base,
        {
          size: label.size,
          fill: paint.ink,
          family: paint.text,
          weight: 600,
          anchor,
        },
        'label',
      ),
    );
  }
  // The key under it: each group's dot, name and seats.
  let y = over ? keyTop : chamber[1] + chamber[3] + floor * 0.9;
  const keyItems: string[] = [];
  const keyBoxes: ShotBox[] = [];
  for (const row of rows) {
    const total =
      row.reduce((sum, i) => sum + entryW(entries[i]), 0) - floor * 1.1;
    let x = tall ? text.x0 : (frame.W - total) / 2;
    const base = y + floor * ASCENT;
    for (const i of row) {
      const e = entries[i];
      const dotR = floor * 0.36;
      const box = union(
        [x, base - floor * 0.5 - dotR, dotR * 2, dotR * 2],
        linesBox([e.words], x + floor * 1.25, base, floor, 'start', 1.15, 700),
      );
      book.add(keyIds[i], { box, role: e.colour.role });
      keyBoxes.push(box);
      keyItems.push(
        partSvg(
          keyIds[i],
          `<circle cx="${r1(x + dotR)}" cy="${r1(base - floor * 0.32)}" r="${r1(dotR)}" fill="${esc(e.colour.colour)}"/>` +
            textSvg([e.words], x + floor * 1.25, base, {
              size: floor,
              fill: paint.ink,
              family: paint.text,
            }),
        ),
      );
      x += entryW(e);
    }
    y += floor * 1.55;
  }
  if (perKey) {
    const base = y + floor * ASCENT;
    const x = tall ? text.x0 : frame.W / 2;
    const anchor = tall ? 'start' : 'middle';
    keyBoxes.push(linesBox([perKey], x, base, floor, anchor, 1.15, 600));
    keyItems.push(
      textSvg([perKey], x, base, {
        size: floor,
        fill: paint.muted,
        family: paint.text,
        weight: 600,
        anchor,
      }),
    );
    y += floor * 1.4;
  }
  book.add('key', { box: union(...keyBoxes), role: 'ink' });
  out.push(partSvg('key', keyItems.join('')));
  let bottom = y;
  if (source) {
    const drawn = sourceSvg(
      book,
      paint,
      frame,
      source,
      tall ? text.x0 : frame.W / 2,
      over
        ? keyTop + keyH + totalH + frame.size.chip * 1.1
        : y + frame.size.chip * 0.9,
      width,
      tall ? 'start' : 'middle',
    );
    out.push(drawn.svg);
    bottom = drawn.box[1] + drawn.box[3];
  }
  const focal = over
    ? union(
        chamber,
        book.parts.key?.box,
        book.parts.label?.box,
        book.parts.total?.box,
      )
    : union(chamber, book.parts.total?.box, book.parts.majority?.box);
  // A tall chamber whose key runs past the words' area runs on down.
  const long = tall && bottom > text.y1;
  const box: ShotBox = long
    ? [0, 0, frame.W, Math.ceil(bottom + (frame.H - text.y1))]
    : [0, 0, frame.W, frame.H];
  return assetOf(
    frame,
    paint,
    out.join(''),
    book,
    long ? [0, 0, frame.W, frame.H] : focal,
    box,
  );
}

/**
 * A still of the stage, drawn on the server the way the pane draws it,
 * so a judge can look at what a learner would see: every visible
 * element of a moment as SVG, figures and mechanisms at their first
 * frame, and a numbered sheet of every moment of a page.
 */
import { buildFigure } from './living.generated/figures';
import { ICONS, ICON_UNIT } from './living.generated/icons';
import { buildMechanism } from './living.generated/mechanisms';
import { PRESETS } from './living.generated/presets';
import { presetAnchor } from './visual-presets';
import { AT_REST, atRest, motionPose } from './living.generated/motion';
import {
  ALL,
  BAR_HEIGHT,
  BUBBLE_HEIGHT,
  BUBBLE_PAD,
  BUBBLE_TAIL,
  BUBBLE_TEXT_SIZE,
  CHIP_HEIGHT,
  CHIP_ICON_ROOM,
  CHIP_TEXT_SIZE,
  DIM_ALPHA,
  LABEL_SIZE,
  SHAPE_TEXT_SIZE,
  SHOWS,
  TICK_ROOM,
  attachPoint,
  boxOf,
  chipWidthOf,
  endPoint,
  labelWidth,
  textWidth,
  type VisualElement,
  type VisualPoint,
  type VisualScript,
} from './visual';

const STAGE = '#1B2232';
const GRID = '#252E42';
interface Paint {
  fill: string;
  rim: string;
  text: string;
}
const PAINT: Record<string, Paint> = {
  green: { fill: '#6CC06F', rim: '#3A8C41', text: '#8FDB92' },
  amber: { fill: '#F2B44A', rim: '#C4861A', text: '#F7C766' },
  blue: { fill: '#6E9EEA', rim: '#3B6DCB', text: '#8DB4F3' },
  violet: { fill: '#A691E3', rim: '#7860C4', text: '#BBA9EE' },
  orange: { fill: '#F0A24E', rim: '#C27722', text: '#F5B96F' },
  red: { fill: '#EE6D6D', rim: '#C24343', text: '#F38C8C' },
  ink: { fill: '#E9EDF5', rim: '#B7C0D1', text: '#F4F6FA' },
  muted: { fill: '#8B95A8', rim: '#636D86', text: '#A5AEBF' },
};
const paintOf = (name?: string): Paint => PAINT[name ?? 'ink'] ?? PAINT.ink;
const FONT = 'Helvetica, Arial, sans-serif';

const esc = (text: string) =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 100) / 100).toString();

function textAt(
  x: number,
  y: number,
  text: string,
  size: number,
  fill: string,
  weight = 600,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  extra = '',
): string {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" font-family="${FONT}"${extra}>${esc(text)}</text>`;
}

/** The colour a figure's role takes in a card's paint. */
function roleColour(role: string, paint: Paint, filled: boolean): string {
  switch (role) {
    case 'body':
      return paint.fill;
    case 'core':
      return PAINT.violet.fill;
    case 'accent':
      return PAINT.blue.text;
    case 'ink':
      return STAGE;
    case 'warm':
      return PAINT.red.fill;
    default:
      return filled ? paint.rim : paint.text;
  }
}

type Drawing = ReturnType<typeof buildFigure>;

function opsSvg(drawing: Drawing, paint: Paint, alpha = 1): string {
  return drawing.ops
    .map((op) => {
      if (op.kind === 'dots')
        return op.points
          .map(
            ([x, y]) =>
              `<circle cx="${n(x)}" cy="${n(y)}" r="${n(op.r)}" fill="${roleColour(op.fill, paint, true)}" opacity="${n(alpha * (op.alpha ?? 1))}"/>`,
          )
          .join('');
      const fill = op.fill
        ? `fill="${roleColour(op.fill, paint, true)}" fill-opacity="${n(op.fillAlpha ?? 1)}"`
        : 'fill="none"';
      const stroke =
        op.stroke !== undefined || !op.fill
          ? `stroke="${roleColour(op.stroke ?? 'edge', paint, Boolean(op.fill))}" stroke-width="${n(op.width ?? 1.6)}" stroke-linejoin="round" stroke-linecap="round"`
          : '';
      return `<path d="${op.d}" ${fill} ${stroke} opacity="${n(alpha * (op.alpha ?? 1))}"/>`;
    })
    .join('');
}

/** A hand-made preset or an icon scaled into its box. */
function drawn(
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint: Paint,
  mode: 'solid' | 'outline' | 'tint',
  d?: string,
): string | null {
  const preset = d ? { body: d, aspect: 1 } : PRESETS[name];
  // A drawing that came as markup is dropped in whole, scaled from its
  // own viewBox into the box the card gave it, groups and all.
  if (preset && 'svg' in preset && preset.svg) {
    const inner = preset.svg
      .replace(/^[\s\S]*?<svg[^>]*>/i, '')
      .replace(/<\/svg>\s*$/i, '');
    return `<g transform="translate(${n(x - w / 2)} ${n(y - h / 2)}) scale(${n(w / 100)} ${n(h / 100)})" fill="none" stroke="${paint.text}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" color="${paint.text}">${inner}</g>`;
  }
  if (preset && 'body' in preset && preset.body) {
    const at = `translate(${n(x - w / 2)} ${n(y - h / 2)}) scale(${n(w)} ${n(h)})`;
    const pen = 2.6 / Math.sqrt(w * h);
    // A diagram is line whatever the card would have filled: a closed
    // loop of wire that gets filled is a disc, and a section has no
    // inside left to put anything in.
    const line = ('outline' in preset && preset.outline) || mode === 'outline';
    const ink = line ? paint.text : paint.rim;
    const body = `<path d="${preset.body ?? ''}" transform="${at}" fill="${line ? 'none' : paint.fill}" stroke="${ink}" stroke-width="${n(pen)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const detail =
      'detail' in preset && preset.detail
        ? `<path d="${preset.detail}" transform="${at}" fill="none" stroke="${ink}" stroke-width="${n(pen * 0.9)}" stroke-linejoin="round" stroke-linecap="round"/>`
        : '';
    // A part that carries its own ink is drawn as its own group, named
    // for the part. That name is the handle: a callout points at it, and
    // a cue can draw, light or dim it without touching the rest. A part
    // with only a point still works — it is a pin, not a group — which
    // is every part in the hand-made set.
    const parts =
      'parts' in preset && preset.parts
        ? Object.entries(preset.parts)
            .map(([part, spec]) => {
              const marks = [
                spec.fill
                  ? `<path d="${spec.fill}" transform="${at}" fill="${line ? 'none' : paint.fill}" stroke="${ink}" stroke-width="${n(pen)}" stroke-linejoin="round" stroke-linecap="round"/>`
                  : '',
                spec.stroke
                  ? `<path d="${spec.stroke}" transform="${at}" fill="none" stroke="${ink}" stroke-width="${n(pen * 0.9)}" stroke-linejoin="round" stroke-linecap="round"/>`
                  : '',
              ].join('');
              return marks ? `<g id="${part}">${marks}</g>` : '';
            })
            .join('')
        : '';
    return body + detail + parts;
  }
  const icon = ICONS[name];
  if (!icon) return null;
  const at = `translate(${n(x - w / 2)} ${n(y - h / 2)}) scale(${n(w / ICON_UNIT)} ${n(h / ICON_UNIT)})`;
  return (
    (mode !== 'outline'
      ? `<path d="${icon.body}" transform="${at}" fill="${paint.fill}" fill-opacity="0.35"/>`
      : '') +
    `<path d="${icon.detail}" transform="${at}" fill="${mode === 'outline' ? paint.text : paint.rim}"/>`
  );
}

function chart(
  element: Extract<VisualElement, { type: 'chart' }>,
  paint: Paint,
): string {
  const { x, y, w, h, series, unit } = element;
  const left = x - w / 2;
  const top = y - h / 2;
  const unitOf = (v: number) =>
    `${v.toLocaleString('en-US')}${unit ? ` ${unit}` : ''}`;
  const count = Math.max(1, series.length);
  const max = Math.max(1e-9, ...series.map((s) => s.value));
  const palette = [
    PAINT.blue,
    PAINT.violet,
    PAINT.green,
    PAINT.amber,
    PAINT.orange,
    PAINT.red,
  ];
  const small = (
    px: number,
    py: number,
    text: string,
    fill: string,
    size = 8.5,
    weight = 600,
  ) => textAt(px, py, text, size, fill, weight);
  if (element.kind === 'shares') {
    const total = Math.max(
      1e-9,
      series.reduce((sum, s) => sum + s.value, 0),
    );
    let at = left;
    const barY = y - 8;
    return series
      .map((s, i) => {
        const segW = (s.value / total) * w;
        const p = palette[i % palette.length];
        const out = `<rect x="${n(at)}" y="${n(barY - 13)}" width="${n(segW)}" height="26" fill="${p.fill}" fill-opacity="0.85" stroke="${STAGE}" stroke-width="1.5"/>${small(at + segW / 2, barY + 27, s.label, p.text, 8.5, 700)}${small(at + segW / 2, barY + 38, `${Math.round((s.value / total) * 100)}%`, PAINT.muted.text, 8)}`;
        at += segW;
        return out;
      })
      .join('');
  }
  if (element.kind === 'pair') {
    const pair = [series[0], series[1] ?? series[0]];
    const plotH = h - 44;
    const base = top + 14 + plotH;
    const bw = w * 0.22;
    return (
      pair
        .map((s, i) => {
          const bx = x + (i === 0 ? -w * 0.2 : w * 0.2) - bw / 2;
          const bh = Math.max(6, (s.value / max) * plotH);
          const p = palette[i];
          return `<rect x="${n(bx)}" y="${n(base - bh)}" width="${n(bw)}" height="${n(bh)}" rx="5" fill="${p.fill}" fill-opacity="0.55" stroke="${p.rim}" stroke-width="2"/>${small(bx + bw / 2, base - bh - 8, unitOf(s.value), p.text, 15, 700)}${small(bx + bw / 2, base + 14, s.label, PAINT.muted.text, 9.5)}`;
        })
        .join('') +
      `<line x1="${n(left)}" y1="${n(base)}" x2="${n(left + w)}" y2="${n(base)}" stroke="${PAINT.muted.rim}" stroke-width="1.5"/>`
    );
  }
  const plotTop = top + 16;
  const base = top + h - 20;
  const plotH = base - plotTop;
  const step = w / count;
  const axis = `<line x1="${n(left)}" y1="${n(base)}" x2="${n(left + w)}" y2="${n(base)}" stroke="${PAINT.muted.rim}" stroke-width="1.5"/>`;
  if (element.kind === 'line') {
    const pts = series.map(
      (s, i) =>
        [
          left + step * (i + 0.5),
          base - (s.value / max) * plotH * 0.85,
        ] as const,
    );
    const d = pts
      .map((p, i) => `${i ? 'L' : 'M'} ${n(p[0])} ${n(p[1])}`)
      .join(' ');
    return (
      axis +
      `<path d="${d}" fill="none" stroke="${paint.text}" stroke-width="2.5" stroke-linejoin="round"/>` +
      pts
        .map(
          (p, i) =>
            `<circle cx="${n(p[0])}" cy="${n(p[1])}" r="4" fill="${paint.fill}" stroke="${paint.rim}" stroke-width="1.8"/>${small(p[0], p[1] - 9, unitOf(series[i].value), paint.text, 8.5, 700)}${small(p[0], base + 13, series[i].label, PAINT.muted.text)}`,
        )
        .join('')
    );
  }
  const bw = Math.min(46, step * 0.62);
  return (
    axis +
    series
      .map((s, i) => {
        const cx = left + step * (i + 0.5);
        const bh = Math.max(4, (s.value / max) * plotH * 0.85);
        return `<rect x="${n(cx - bw / 2)}" y="${n(base - bh)}" width="${n(bw)}" height="${n(bh)}" rx="4" fill="${paint.fill}" fill-opacity="0.55" stroke="${paint.rim}" stroke-width="2"/>${small(cx, base - bh - 6, unitOf(s.value), paint.text, 8.5, 700)}${small(cx, base + 13, s.label, PAINT.muted.text)}`;
      })
      .join('')
  );
}

/** Where a named part of a figure or mechanism is, for a callout's leader. */
function anchorOf(
  byId: Map<string, VisualElement>,
  of: string,
  part: string,
  ms = 0,
  shown: Map<string, number> = new Map(),
): VisualPoint | null {
  const target = byId.get(of);
  if (!target) return null;
  if (target.type === 'figure') {
    const { anchors } = buildFigure(target, ms, ms === 0);
    return anchors[part] ?? anchors.centre ?? [target.x, target.y];
  }
  if (target.type === 'mechanism') {
    const { anchors } = buildMechanism(
      target,
      stageShown(target, shown),
      Math.max(ms, 3000),
      false,
    );
    return anchors[part] ?? anchors.centre ?? [target.x, target.y];
  }
  // A drawing from a field's pack carries its own named parts, so a
  // callout can point at the cortex of a kidney and not at the middle
  // of its box. An organ without them is no use to a page about it.
  if (target.type === 'shape') {
    const at = presetAnchor(target.kind, part);
    if (at)
      return [
        target.x - target.w / 2 + at[0] * target.w,
        target.y - target.h / 2 + at[1] * target.h,
      ];
  }
  const box = boxOf(target);
  return box ? [box.x + box.w / 2, box.y + box.h / 2] : null;
}

/** Which stage a mechanism is in at a frame: the last of its phase chips shown. */
function stageShown(
  element: Extract<VisualElement, { type: 'mechanism' }>,
  shown: Map<string, number>,
): number {
  let stage = 0;
  element.phaseIds.forEach((id, index) => {
    if (shown.has(id)) stage = index;
  });
  return stage;
}

function elementSvg(
  element: VisualElement,
  byId: Map<string, VisualElement>,
  alpha: number,
  ms = 0,
  shown: Map<string, number> = new Map(),
): string {
  const paint = paintOf(element.color);
  const wrap = (inner: string) =>
    alpha < 1 ? `<g opacity="${n(alpha)}">${inner}</g>` : inner;
  switch (element.type) {
    case 'label': {
      const kind = element.size ?? 'md';
      const size = LABEL_SIZE[kind];
      const w = labelWidth(element);
      const left =
        element.anchor === 'start'
          ? element.x
          : element.anchor === 'end'
            ? element.x - w
            : element.x - w / 2;
      const accent = paintOf(element.accent ?? 'amber').text;
      if (kind === 'eyebrow')
        return wrap(
          `<circle cx="${n(left + 4)}" cy="${n(element.y)}" r="2.2" fill="${accent}"/><circle cx="${n(left + w - 4)}" cy="${n(element.y)}" r="2.2" fill="${accent}"/>` +
            textAt(
              left + w / 2,
              element.y + size * 0.36,
              element.text.toUpperCase(),
              size,
              paint.text,
              700,
              'middle',
              ` letter-spacing="${n(size * 0.22)}" opacity="0.85"`,
            ),
        );
      const heavy = kind === 'xl' || kind === 'lg' || kind === 'huge';
      const tick = element.tick
        ? `<path d="M ${n(left + 1)} ${n(element.y + 0.5)} l 3.2 3.4 l 6.4 -7.2" fill="none" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
        : '';
      return wrap(
        tick +
          textAt(
            element.tick ? left + TICK_ROOM : element.x,
            element.y + size * 0.35,
            element.text,
            size,
            paint.text,
            heavy ? 700 : 600,
            element.tick ? 'start' : (element.anchor ?? 'middle'),
          ),
      );
    }
    case 'chip': {
      const w = chipWidthOf(element.text, Boolean(element.icon));
      const icon = element.icon
        ? drawn(
            element.icon,
            element.x - w / 2 + 12 + 7.5,
            element.y,
            15,
            15,
            paint,
            'solid',
          )
        : null;
      return wrap(
        `<rect x="${n(element.x - w / 2)}" y="${n(element.y - CHIP_HEIGHT / 2)}" width="${n(w)}" height="${CHIP_HEIGHT}" rx="${CHIP_HEIGHT / 2}" fill="${STAGE}" stroke="${paint.text}" stroke-width="2.2"/>` +
          (icon ?? '') +
          textAt(
            element.x + (icon ? CHIP_ICON_ROOM / 2 : 0),
            element.y + 4.5,
            element.text,
            CHIP_TEXT_SIZE,
            paint.text,
            700,
          ),
      );
    }
    case 'bar': {
      const { x, y, w } = element;
      const left = x - w / 2;
      const fillW = Math.max(0, Math.min(1, element.value)) * w;
      return wrap(
        `<rect x="${n(left)}" y="${n(y - BAR_HEIGHT / 2)}" width="${n(w)}" height="${BAR_HEIGHT}" rx="4" fill="${STAGE}" stroke="${paint.rim}" stroke-width="1.6"/>` +
          `<rect x="${n(left)}" y="${n(y - BAR_HEIGHT / 2)}" width="${n(fillW)}" height="${BAR_HEIGHT}" rx="4" fill="${paint.fill}" fill-opacity="0.6"/>` +
          (element.left
            ? textAt(
                left,
                y - BAR_HEIGHT / 2 - 5,
                element.left,
                8.5,
                PAINT.muted.text,
                600,
                'start',
              )
            : '') +
          (element.right
            ? textAt(
                left + w,
                y - BAR_HEIGHT / 2 - 5,
                element.right,
                8.5,
                PAINT.muted.text,
                600,
                'end',
              )
            : '') +
          (element.markers ?? [])
            .map((m) => {
              const mx = left + Math.max(0, Math.min(1, m.at)) * w;
              return `<line x1="${n(mx)}" y1="${n(y - BAR_HEIGHT / 2 - 1)}" x2="${n(mx)}" y2="${n(y + BAR_HEIGHT / 2 + 6)}" stroke="${paint.text}" stroke-width="2"/>${textAt(mx, y + BAR_HEIGHT / 2 + 17, m.text, 9.5, paint.text, 700)}`;
            })
            .join(''),
      );
    }
    case 'bubble': {
      const w = textWidth(element.text, BUBBLE_TEXT_SIZE, true) + BUBBLE_PAD;
      const left = element.x - w / 2;
      const top = element.y - BUBBLE_HEIGHT / 2;
      const bottom = top + BUBBLE_HEIGHT;
      const tailX = element.tail === 'right' ? left + w - 22 : left + 22;
      const tipX = element.tail === 'right' ? tailX + 8 : tailX - 8;
      const r = 9;
      const d = `M ${n(left + r)} ${n(top)} H ${n(left + w - r)} Q ${n(left + w)} ${n(top)} ${n(left + w)} ${n(top + r)} V ${n(bottom - r)} Q ${n(left + w)} ${n(bottom)} ${n(left + w - r)} ${n(bottom)} H ${n(tailX + 6)} L ${n(tipX)} ${n(bottom + BUBBLE_TAIL)} L ${n(tailX - 6)} ${n(bottom)} H ${n(left + r)} Q ${n(left)} ${n(bottom)} ${n(left)} ${n(bottom - r)} V ${n(top + r)} Q ${n(left)} ${n(top)} ${n(left + r)} ${n(top)} Z`;
      return wrap(
        `<path d="${d}" fill="${PAINT.ink.fill}" stroke="${paint.rim}" stroke-width="1.8" stroke-linejoin="round"/>` +
          textAt(
            element.x,
            element.y + 4,
            element.text,
            BUBBLE_TEXT_SIZE,
            STAGE,
            700,
          ),
      );
    }
    case 'shape': {
      const { x, y, w, h } = element;
      const mode = element.fill ?? 'tint';
      const text = element.text
        ? textAt(
            x,
            y + 4,
            element.text,
            SHAPE_TEXT_SIZE,
            mode === 'outline' ? paint.text : STAGE,
            700,
          )
        : '';
      const picture =
        element.kind === 'path'
          ? drawn('', x, y, w, h, paint, mode, element.d)
          : drawn(element.kind, x, y, w, h, paint, mode);
      // A moving thing is drawn where its motion has it at this time, as the player would.
      const pose = element.motion
        ? motionPose(
            element.motion,
            ms / 1000,
            null,
            element.motionTo
              ? { dx: element.motionTo.x - x, dy: element.motionTo.y - y }
              : null,
          )
        : AT_REST;
      const posed = (svg: string) =>
        atRest(pose)
          ? svg
          : `<g transform="translate(${n(pose.dx)} ${n(pose.dy)}) rotate(${n(pose.rotate)} ${n(x)} ${n(y)}) translate(${n(x)} ${n(y)}) scale(${pose.scale.toFixed(3)}) translate(${n(-x)} ${n(-y)})">${svg}</g>`;
      if (picture) return wrap(posed(picture + text));
      const common = `fill="${mode === 'outline' ? 'none' : paint.fill}" stroke="${mode === 'outline' ? paint.text : paint.rim}" stroke-width="2.4" stroke-linejoin="round"`;
      switch (element.kind) {
        case 'scrim':
          return wrap(
            `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="16" fill="${STAGE}" fill-opacity="0.9"/>`,
          );
        case 'overlap': {
          const r = h / 2;
          const other = paintOf('violet');
          return wrap(
            `<circle cx="${n(x - (w / 2 - r))}" cy="${n(y)}" r="${n(r)}" fill="${paint.fill}" fill-opacity="0.35" stroke="${paint.rim}" stroke-width="2.4"/><circle cx="${n(x + (w / 2 - r))}" cy="${n(y)}" r="${n(r)}" fill="${other.fill}" fill-opacity="0.35" stroke="${other.rim}" stroke-width="2.4"/>` +
              text,
          );
        }
        case 'circle':
          return wrap(
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.min(w, h) / 2)}" ${common}/>` +
              text,
          );
        case 'ellipse':
          return wrap(
            `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${common}/>` +
              text,
          );
        case 'triangle':
          return wrap(
            `<polygon points="${n(x)},${n(y - h / 2)} ${n(x + w / 2)},${n(y + h / 2)} ${n(x - w / 2)},${n(y + h / 2)}" ${common}/>` +
              text,
          );
        case 'diamond':
          return wrap(
            `<polygon points="${n(x)},${n(y - h / 2)} ${n(x + w / 2)},${n(y)} ${n(x)},${n(y + h / 2)} ${n(x - w / 2)},${n(y)}" ${common}/>` +
              text,
          );
        default:
          return wrap(
            `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="${element.kind === 'roundRect' ? 14 : 2}" ${common}/>` +
              text,
          );
      }
    }
    case 'line':
    case 'arrow': {
      const roughFrom = endPoint(element.from, byId);
      const roughTo = endPoint(element.to, byId);
      if (!roughFrom || !roughTo) return '';
      const from = attachPoint(element.from, roughTo, byId);
      const to = attachPoint(element.to, roughFrom, byId);
      if (!from || !to) return '';
      const bend = element.type === 'arrow' ? (element.bend ?? 0) : 0;
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.sign(bend) * Math.min(Math.abs(bend) * 2, len * 0.6);
      const cx = (from[0] + to[0]) / 2 + (-dy / len) * bow;
      const cy = (from[1] + to[1]) / 2 + (dx / len) * bow;
      const d = bend
        ? `M ${n(from[0])} ${n(from[1])} Q ${n(cx)} ${n(cy)} ${n(to[0])} ${n(to[1])}`
        : `M ${n(from[0])} ${n(from[1])} L ${n(to[0])} ${n(to[1])}`;
      const endAngle = bend
        ? Math.atan2(to[1] - cy, to[0] - cx)
        : Math.atan2(dy, dx);
      const head = (at: VisualPoint, angle: number) => {
        const L = Math.max(5, Math.min(9, (len + Math.abs(bend) * 0.8) / 4));
        const W = L * 0.62;
        return `<polygon points="${n(at[0])},${n(at[1])} ${n(at[0] - L * Math.cos(angle) + W * Math.sin(angle))},${n(at[1] - L * Math.sin(angle) - W * Math.cos(angle))} ${n(at[0] - L * Math.cos(angle) - W * Math.sin(angle))},${n(at[1] - L * Math.sin(angle) + W * Math.cos(angle))}" fill="${paint.text}"/>`;
      };
      const dash =
        element.type === 'line' && element.dashed
          ? ' stroke-dasharray="6 5"'
          : '';
      return wrap(
        `<path d="${d}" fill="none" stroke="${paint.text}" stroke-width="3" stroke-linecap="round"${dash}/>` +
          (element.type === 'arrow' ? head(to, endAngle) : '') +
          (element.type === 'arrow' && element.double
            ? head(from, Math.atan2(from[1] - to[1], from[0] - to[0]))
            : ''),
      );
    }
    case 'icon': {
      const picture = drawn(
        element.name,
        element.x,
        element.y,
        element.size,
        element.size,
        paint,
        'solid',
      );
      return picture ? wrap(picture) : '';
    }
    case 'dots':
      return wrap(
        element.points
          .map(
            ([x, y]) =>
              `<circle cx="${n(x)}" cy="${n(y)}" r="${n(element.r ?? 3)}" fill="${paint.fill}"/>`,
          )
          .join(''),
      );
    case 'chart':
      return wrap(chart(element, paint));
    case 'figure':
      return wrap(opsSvg(buildFigure(element, ms, ms === 0), paint));
    case 'mechanism':
      // A few seconds into its stage, so the still shows it at work.
      return wrap(
        opsSvg(
          buildMechanism(
            element,
            stageShown(element, shown),
            Math.max(ms, 3000),
            false,
          ),
          paint,
        ),
      );
    case 'callout': {
      const size = LABEL_SIZE.sm;
      const w = labelWidth({ ...element, type: 'label', size: 'sm' });
      const start = element.anchor !== 'end';
      const left = start ? element.x : element.x - w;
      const at = anchorOf(byId, element.of, element.part, ms, shown);
      const from: VisualPoint = [start ? left - 4 : left + w + 4, element.y];
      const leader = at
        ? `<line x1="${n(from[0])}" y1="${n(from[1])}" x2="${n(at[0])}" y2="${n(at[1])}" stroke="${paint.text}" stroke-width="1.2" stroke-opacity="0.8"/><circle cx="${n(at[0])}" cy="${n(at[1])}" r="2.4" fill="${paint.text}"/>`
        : '';
      return wrap(
        leader +
          textAt(
            start ? left + 4 : left + w - 4,
            element.y + size * 0.35,
            element.text,
            size,
            paint.text,
            700,
            start ? 'start' : 'end',
          ),
      );
    }
    default:
      return '';
  }
}

/** What is on screen, and dimmed, after each sentence: a replay of the cues. */
export function shownAfterEach(script: VisualScript): Map<string, number>[] {
  const alpha = new Map<string, number>();
  return script.segments.map((segment) => {
    for (const cue of segment.cues) {
      if (cue.do === 'clear') alpha.clear();
      else if (SHOWS.has(cue.do)) alpha.set(cue.target, 1);
      else if (cue.do === 'hide') alpha.delete(cue.target);
      else if (cue.do === 'dim' && alpha.has(cue.target))
        alpha.set(cue.target, DIM_ALPHA);
      else if (cue.do === 'undim') {
        // The closing frame lights the whole stage at once.
        if (cue.target === ALL) for (const id of alpha.keys()) alpha.set(id, 1);
        else if (alpha.has(cue.target)) alpha.set(cue.target, 1);
      }
    }
    return new Map(alpha);
  });
}

/** One still of the stage: the elements shown, each at its alpha, over the dark grid. */
export function renderStill(
  elements: VisualElement[],
  shown: Map<string, number>,
  space: { w: number; h: number },
  standalone = true,
  ms = 0,
): string {
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const inner =
    `<rect width="${space.w}" height="${space.h}" fill="${STAGE}"/>` +
    `<path d="${Array.from({ length: Math.ceil(space.w / 24) }, (_, i) => `M ${i * 24} 0 V ${space.h}`).join(' ')} ${Array.from({ length: Math.ceil(space.h / 24) }, (_, i) => `M 0 ${i * 24} H ${space.w}`).join(' ')}" stroke="${GRID}" stroke-width="0.6" fill="none"/>` +
    elements
      .filter((e) => shown.has(e.id))
      .map((e) => elementSvg(e, byId, shown.get(e.id) ?? 1, ms, shown))
      .join('');
  return standalone
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${space.w} ${space.h}" width="${space.w}" height="${space.h}">${inner}</svg>`
    : inner;
}

/**
 * Every moment of a page on one sheet, numbered: the still at the end of
 * the moment's last sentence, three to a row.
 */
export function renderSheet(
  script: VisualScript,
  moments: { from: number; to: number }[],
  space: { w: number; h: number },
  columns = 3,
): string {
  const after = shownAfterEach(script);
  const gap = 12;
  const labelRoom = 18;
  const cellW = space.w + gap;
  const cellH = space.h + labelRoom + gap;
  const rows = Math.ceil(moments.length / columns);
  const width = columns * cellW + gap;
  const height = rows * cellH + gap;
  const tiles = moments
    .map((m, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = gap + col * cellW;
      const y = gap + row * cellH;
      const shown =
        after[Math.max(0, Math.min(after.length - 1, m.to))] ??
        new Map<string, number>();
      return (
        `<g transform="translate(${x} ${y})">` +
        textAt(0, 12, `${i + 1}`, 12, '#ffffff', 700, 'start') +
        `<g transform="translate(0 ${labelRoom})">${renderStill(script.elements, shown, space, false)}</g>` +
        `<rect x="0" y="${labelRoom}" width="${space.w}" height="${space.h}" fill="none" stroke="#3B4560" stroke-width="1"/>` +
        `</g>`
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0F1520"/>${tiles}</svg>`;
}

/** An SVG as a PNG, the page's width in pixels. */
export async function rasterise(svg: string, width: number): Promise<Buffer> {
  const { Resvg } =
    (await import('@resvg/resvg-js')) as typeof import('@resvg/resvg-js');
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
  })
    .render()
    .asPng();
}

/** The width of a card's picture, in pixels across. */
export const THUMB_WIDTH = 480;

/**
 * One still of the page for a card: the end of the moment that shows the
 * most, so the picture is the page at its fullest.
 */
export function renderThumb(
  script: VisualScript,
  moments: { from: number; to: number }[],
  space: { w: number; h: number },
): string {
  const after = shownAfterEach(script);
  const at = (m: { to: number }) =>
    after[Math.max(0, Math.min(after.length - 1, m.to))] ??
    new Map<string, number>();
  const richest = moments.reduce(
    (best, m) => (at(m).size > at(best).size ? m : best),
    moments[0] ?? { from: 0, to: 0 },
  );
  return renderStill(script.elements, at(richest), space, true, 4800);
}

/**
 * A card's picture cut from a judge's filmstrip, for a page made before
 * cards had one: the third frame of the first row, that moment at its
 * fullest. The strip's geometry is renderFilm's, at whatever width it was
 * rasterised.
 */
export async function thumbFromFilm(
  png: Buffer,
  space: { w: number; h: number },
  width = THUMB_WIDTH,
): Promise<Buffer> {
  const pngW = png.readUInt32BE(16);
  const pngH = png.readUInt32BE(20);
  const gap = 10;
  const labelRoom = 18;
  const frameW = space.w + gap;
  const scale = pngW / (3 * frameW + gap + 8);
  // Two units in from the frame's top and left: the row's label and the frame's rim stay out.
  const x = (gap + 8 + 2 * frameW + 2) * scale;
  const y = (labelRoom + 2) * scale;
  const w = (space.w - 3) * scale;
  const h = (space.h - 3) * scale;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
    `<image href="data:image/png;base64,${png.toString('base64')}" x="0" y="0" width="${pngW}" height="${pngH}"/>` +
    `</svg>`;
  return rasterise(svg, width);
}

/** The moments of a filmstrip: three frames across a still moment, five across one that moves, so motion and the order parts arrive in can be judged. */
const FRAME_MS = [400, 2200, 4800];
const MOVING_FRAME_MS = [400, 1400, 2500, 3600, 4800];

/** Whether anything shown by the end of a moment moves: a figure not held still, a picture with a motion, a machine. */
export function momentMoves(
  script: VisualScript,
  moment: { from: number; to: number },
): boolean {
  const after = shownAfterEach(script);
  const shown =
    after[Math.max(0, Math.min(after.length - 1, moment.to))] ??
    new Map<string, number>();
  return script.elements.some(
    (e) =>
      shown.has(e.id) &&
      ((e.type === 'figure' && e.manner !== 'still') ||
        (e.type === 'shape' && Boolean(e.motion)) ||
        e.type === 'mechanism'),
  );
}

/** The times of a moment's frames: five when it moves, else three. */
export function frameTimes(
  script: VisualScript,
  moment: { from: number; to: number },
): number[] {
  return momentMoves(script, moment) ? MOVING_FRAME_MS : FRAME_MS;
}

/**
 * A filmstrip of the page: one row per moment (or per moment asked for,
 * by position), three frames left to right across its sentences, living
 * things a little further into their motion in each. Rows carry the
 * moment's number as the judge is told it.
 */
export function renderFilm(
  script: VisualScript,
  moments: { from: number; to: number }[],
  space: { w: number; h: number },
  positions?: number[],
): string {
  const after = shownAfterEach(script);
  const rows = (positions ?? moments.map((_, i) => i)).filter(
    (k) => moments[k],
  );
  const gap = 10;
  const labelRoom = 18;
  const frameW = space.w + gap;
  const rowH = space.h + labelRoom + gap;
  const times = rows.map((k) => frameTimes(script, moments[k]));
  const across = Math.max(3, ...times.map((t) => t.length));
  const width = across * frameW + gap + 8;
  const height = rows.length * rowH + gap;
  const tiles = rows
    .map((k, r) => {
      const m = moments[k];
      const y = gap + r * rowH;
      const own = times[r];
      const frames = own
        .map((ms, f) => {
          const sentence =
            m.from + Math.floor(((m.to - m.from) * f) / (own.length - 1));
          const shown =
            after[Math.max(0, Math.min(after.length - 1, sentence))] ??
            new Map<string, number>();
          const x = gap + 8 + f * frameW;
          const clip = `film-${k}-${f}`;
          return (
            `<clipPath id="${clip}"><rect x="${x}" y="${labelRoom}" width="${space.w}" height="${space.h}"/></clipPath>` +
            `<g clip-path="url(#${clip})"><g transform="translate(${x} ${labelRoom})">${renderStill(script.elements, shown, space, false, ms)}</g></g>` +
            `<rect x="${x}" y="${labelRoom}" width="${space.w}" height="${space.h}" fill="none" stroke="#3B4560" stroke-width="1"/>`
          );
        })
        .join('');
      return `<g transform="translate(0 ${y})">${textAt(gap + 8, 12, `${k + 1}`, 12, '#ffffff', 700, 'start')}${frames}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0F1520"/>${tiles}</svg>`;
}

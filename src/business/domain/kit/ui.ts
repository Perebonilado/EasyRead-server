/**
 * The UI kit (explainer-animation-tech §11, WP18): devices with screens
 * built by code, and a cursor, for tech and how-to explainers (how an app
 * works, how a page is designed, how a flow goes), after Richard's UI/UX
 * reference: one device that never cuts and changes state, the camera
 * pushing into the part being talked about, a cursor driving every change.
 *
 *  - Devices: a phone, a tablet, a laptop, a browser window, a desktop
 *    app's window, a watch. Each is a frame (its body, its bezel) with a
 *    `screen` part the camera frames by default, its screen built from a
 *    small spec (ui-screens.ts). A generic UI only: no logo, no real
 *    app's name or look, no brand's colour; a real product is shown by its
 *    own screenshot from the picture desk when a licence allows, never
 *    drawn.
 *  - Every piece of a screen is a named part with a box, and a piece that
 *    changes carries its states as rig states (each a layer shown, the
 *    others hidden), so the board names a part and a state and the client
 *    makes the change.
 *  - The cursor (`ui.cursor`): an arrow and a hand, its hot spot the rig's
 *    `cursor.tip`. It moves to a part, clicks (a press and a ripple; the
 *    part changes state at the press), drags (a slider's knob), scrolls
 *    and types; ui-timing.ts times its moves and the changes they make.
 *  - The desk: the soft backdrop a device stands on, in the show's paper
 *    and accent.
 *
 * A device's units are a screen's points (a phone is 390 wide), not the
 * kit's centimetres: a device stands on its desk, never beside a person,
 * and placeUi sizes it to the frame.
 */
import type { FilmShape, ShotBox, ShotSvgAssetDto } from '../../../contracts';
import type { KitEntry, KitParams } from './registry';
import { assemble, svgOf, tidy, type KitPiece, type RigPart } from './rig';
import type { KitStyle } from './style';
import { mixOk } from './style';
import {
  appColour,
  esc,
  f1,
  paint,
  r1,
  rect,
  uiPalette,
  type UiLook,
  type UiPalette,
} from './ui-paint';
import {
  CLICKABLE,
  UI_PIECES,
  UI_SCREENS,
  UI_STATE_WORDS,
  drawScreen,
  type ScreenArea,
  type ScreenSpec,
  type UiKind,
  type UiPart,
  type UiPiece,
  type UiScreen,
} from './ui-screens';

// ── Devices ───────────────────────────────────────────────────────────────

export const UI_DEVICE_USES = {
  phone: 'a phone: an app, a mobile page',
  tablet: 'a tablet: an app with more room',
  laptop: 'a laptop: a web app, a dashboard, a tool',
  browser: 'a browser window: a website, a web app',
  window: 'a desktop app’s window',
  watch: 'a watch: a glance, a reminder, a ring of progress',
} as const;
export type UiDevice = keyof typeof UI_DEVICE_USES;
export const UI_DEVICES = Object.keys(UI_DEVICE_USES) as UiDevice[];

/** A device's frame: its whole box, its screen's area, and how its body is drawn. */
interface Frame {
  box: ShotBox;
  area: ScreenArea;
  body: (pal: UiPalette, clip: string) => { under: string; over: string };
}

const BODY = {
  light: '#F2F3F5',
  edge: '#D5D8DE',
  glass: '#0D0E11',
  key: '#E7E9EC',
} as const;

/** Each device's frame, in its own points. */
function frameOf(device: UiDevice): Frame {
  switch (device) {
    case 'phone': {
      const W = 414;
      const H = 868;
      const area: ScreenArea = {
        x: 12,
        y: 12,
        w: 390,
        h: 844,
        r: 47,
        form: 'phone',
        status: 50,
        foot: 34,
      };
      return {
        box: [0, 0, W, H],
        area,
        body: (pal) => ({
          under: `${sideButtons(W)}${rr(0, 0, W, H, 58, BODY.light, `stroke="${BODY.edge}" stroke-width="2"`)}${rr(6, 6, W - 12, H - 12, 52, BODY.glass)}`,
          over: `<rect x="${f1(W / 2 - 62)}" y="23" width="124" height="36" rx="18" fill="${BODY.glass}"/><rect x="${f1(W / 2 - 67)}" y="${f1(H - 12 - 13)}" width="134" height="5" rx="2.5" ${paint(pal, 'text')}/>`,
        }),
      };
    }
    case 'tablet': {
      const W = 812;
      const H = 1068;
      const area: ScreenArea = {
        x: 22,
        y: 22,
        w: 768,
        h: 1024,
        r: 20,
        form: 'tablet',
        status: 28,
        foot: 20,
      };
      return {
        box: [0, 0, W, H],
        area,
        body: () => ({
          under: `${rr(0, 0, W, H, 46, BODY.light, `stroke="${BODY.edge}" stroke-width="2"`)}${rr(6, 6, W - 12, H - 12, 40, BODY.glass)}`,
          over: `<circle cx="${f1(W / 2)}" cy="13" r="3.5" fill="#2A2D33"/>`,
        }),
      };
    }
    case 'laptop': {
      const lidW = 1312;
      const lidH = 838;
      const baseW = 1500;
      const baseH = 30;
      const lx = (baseW - lidW) / 2;
      const area: ScreenArea = {
        x: lx + 16,
        y: 16,
        w: 1280,
        h: 800,
        r: 6,
        form: 'wide',
        status: 0,
        foot: 0,
      };
      return {
        box: [0, 0, baseW, lidH + baseH],
        area,
        body: () => ({
          under: `${rr(lx, 0, lidW, lidH, 26, BODY.glass, `stroke="#2A2D33" stroke-width="2"`)}<path d="M0 ${f1(lidH)}H${baseW}V${f1(lidH + baseH * 0.55)}Q${baseW} ${f1(lidH + baseH)} ${f1(baseW - 40)} ${f1(lidH + baseH)}H40Q0 ${f1(lidH + baseH)} 0 ${f1(lidH + baseH * 0.55)}Z" fill="${BODY.key}" stroke="${BODY.edge}" stroke-width="1.5"/><rect x="${f1(baseW / 2 - 110)}" y="${f1(lidH)}" width="220" height="9" rx="4.5" fill="#CBCED4"/>`,
          over: `<circle cx="${f1(baseW / 2)}" cy="8" r="3" fill="#30333A"/>`,
        }),
      };
    }
    case 'browser': {
      const W = 1280;
      const H = 820;
      const bar = 56;
      const area: ScreenArea = {
        x: 0,
        y: bar,
        w: W,
        h: H - bar,
        r: 0,
        form: 'wide',
        status: 0,
        foot: 0,
      };
      return {
        box: [0, 0, W, H],
        area,
        body: (pal) => ({
          under: `${rr(0, 0, W, H, 16, '#FFFFFF', `stroke="${BODY.edge}" stroke-width="1.5"`)}<path d="M0 16Q0 0 16 0H${W - 16}Q${W} 0 ${W} 16V${bar}H0Z" ${paint(pal, 'surface2')}/>${dots(22, bar / 2)}${rect(pal, 116, 12, 200, bar - 12, 10, 'bg')}<rect x="132" y="${f1(bar / 2 + 1)}" width="110" height="8" rx="4" ${paint(pal, 'bar')}/>${rect(pal, 340, 13, W - 400, 30, 15, 'bg')}${lockAt(pal, 356, 18)}<rect x="384" y="${f1(13 + 11)}" width="190" height="8" rx="4" ${paint(pal, 'bar')}/>`,
          over: '',
        }),
      };
    }
    case 'window': {
      const W = 1200;
      const H = 780;
      const bar = 42;
      const area: ScreenArea = {
        x: 0,
        y: bar,
        w: W,
        h: H - bar,
        r: 0,
        form: 'wide',
        status: 0,
        foot: 0,
      };
      return {
        box: [0, 0, W, H],
        area,
        body: (pal) => ({
          under: `${rr(0, 0, W, H, 14, '#FFFFFF', `stroke="${BODY.edge}" stroke-width="1.5"`)}<path d="M0 14Q0 0 14 0H${W - 14}Q${W} 0 ${W} 14V${bar}H0Z" ${paint(pal, 'surface2')}/>${dots(20, bar / 2)}<rect x="${f1(W / 2 - 70)}" y="${f1(bar / 2 - 4)}" width="140" height="8" rx="4" ${paint(pal, 'bar')}/>`,
          over: '',
        }),
      };
    }
    case 'watch': {
      const W = 236;
      const H = 280;
      const band = 70;
      const area: ScreenArea = {
        x: 19,
        y: band + 19,
        w: 198,
        h: 242,
        r: 52,
        form: 'watch',
        status: 0,
        foot: 0,
      };
      return {
        box: [0, 0, W + 14, H + 2 * band],
        area,
        body: () => ({
          under: `<rect x="38" y="0" width="${W - 76}" height="${band + 40}" rx="24" fill="#3A3D44"/><rect x="38" y="${f1(band + H - 40)}" width="${W - 76}" height="${band + 40}" rx="24" fill="#3A3D44"/><rect x="${W - 4}" y="${f1(band + 70)}" width="16" height="46" rx="6" fill="#B9BDC4"/>${rr(0, band, W, H, 68, '#C9CCD2')}${rr(6, band + 6, W - 12, H - 12, 62, BODY.glass)}`,
          over: '',
        }),
      };
    }
  }
}

/** A plain rounded rectangle in a fixed colour (a device's body, never the screen's). */
function rr(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  extra = '',
): string {
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(r)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
}

/** A phone's buttons on its edges. */
function sideButtons(W: number): string {
  return [
    rr(-3, 168, 6, 34, 3, '#C9CCD2'),
    rr(-3, 226, 6, 62, 3, '#C9CCD2'),
    rr(-3, 302, 6, 62, 3, '#C9CCD2'),
    rr(W - 3, 252, 6, 96, 3, '#C9CCD2'),
  ].join('');
}

/** A window's three grey dots (no maker's colours). */
function dots(x: number, cy: number): string {
  return [0, 1, 2]
    .map(
      (k) =>
        `<circle cx="${f1(x + k * 20)}" cy="${f1(cy)}" r="6.5" fill="#C4C8CF"/>`,
    )
    .join('');
}

function lockAt(pal: UiPalette, x: number, y: number): string {
  return `<path d="M${f1(x + 3)} ${f1(y + 9)}h12v10h-12zM${f1(x + 5.5)} ${f1(y + 9)}v-3a3.5 3.5 0 0 1 7 0v3" fill="none" ${paint(pal, 'text3', 'stroke')} stroke-width="1.8"/>`;
}

// ── A device's spec from its settings ─────────────────────────────────────

/** A word as a list keys it. */
const key = (raw: string) =>
  raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The nearest of a list to a word: itself, a word it starts with, or none. */
function nearest<T extends string>(raw: unknown, list: readonly T[]): T | null {
  if (typeof raw !== 'string') return null;
  const k = key(raw);
  if (!k) return null;
  return (
    list.find((v) => v === k) ??
    list.find((v) => k.startsWith(v) || v.startsWith(k)) ??
    list.find((v) => k.includes(v)) ??
    null
  );
}

/** Words of a setting, a few at most. */
const wordsOf = (raw: unknown, most: number): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const out = raw
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, most)
    .join(' ');
  return out || undefined;
};

/** A list of short labels from a setting: split at commas or semicolons. */
export function itemsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap((one) => itemsOf(one)).slice(0, 6);
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,;|]/)
    .map((one) => wordsOf(one, 3) ?? '')
    .filter(Boolean)
    .slice(0, 6);
}

/** Parts in a state they start in: "btn-primary: disabled, slider-volume: 0.7". */
export function initialOf(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'string') return out;
  for (const one of raw.split(/[,;]/)) {
    const [part, state] = one.split(/[:=]/).map((s) => s?.trim());
    if (!part || !state) continue;
    const id = key(part.replace(/@.*/, '')) || part;
    const word = /^\d*\.?\d+$/.test(state)
      ? state
      : (nearest(state, UI_STATE_WORDS) ?? '');
    if (word) out[id] = word;
  }
  return out;
}

/** The pieces the board listed, each the nearest of the list. */
export function piecesList(raw: unknown): UiPiece[] {
  return itemsOf(typeof raw === 'string' ? raw.replace(/\s+and\s+/g, ',') : raw)
    .map((one) => nearest(one, UI_PIECES))
    .filter((one): one is UiPiece => one !== null)
    .slice(0, 12);
}

/** What a device's screen is carried into the next shot with: the states its parts end in, words typed, how far it scrolled. */
export interface UiCarried {
  initial?: Record<string, string>;
  typed?: Record<string, string>;
  scrolled?: number;
  theme?: 'light' | 'dark';
}

/** A device's spec: its settings made sound, and what an earlier shot left it in. */
export function specOf(
  params: Readonly<Record<string, unknown>>,
  carried: UiCarried = {},
): ScreenSpec {
  const screen = nearest(params.screen, UI_SCREENS) ?? 'product';
  const pieces = piecesList(params.pieces);
  const title = wordsOf(params.title, 4);
  const said = wordsOf(params.words, 3);
  const items = itemsOf(params.items);
  const theme = carried.theme ?? (params.theme === 'dark' ? 'dark' : 'light');
  return {
    screen,
    ...(pieces.length ? { pieces } : {}),
    theme,
    ...(title ? { title } : {}),
    ...(said ? { words: said } : {}),
    ...(items.length ? { items } : {}),
    initial: { ...initialOf(params.state), ...(carried.initial ?? {}) },
    ...(carried.typed ? { typed: carried.typed } : {}),
    ...(carried.scrolled ? { scrolled: carried.scrolled } : {}),
  };
}

/** The look the kit draws from, out of a kit style. */
export function uiLookOf(style: KitStyle): UiLook {
  return {
    paper: style.paper,
    ink: style.ink,
    muted: style.muted,
    accent: style.accent,
    text: style.face ?? 'Plus Jakarta Sans',
    display: style.face ?? 'Plus Jakarta Sans',
  };
}

// ── A device made ─────────────────────────────────────────────────────────

/** A device's parts beyond the rig's: each one's kind, states and box, for the checks and the timing. */
export interface UiPartInfo {
  kind?: UiKind;
  /** The part it is drawn in (a switch in its settings row). */
  parent?: string;
  states?: readonly string[];
  state?: string;
  box: ShotBox;
  value?: number;
}

/** A device made, with what its parts are. */
export interface UiDeviceMade {
  piece: KitPiece;
  parts: Record<string, UiPartInfo>;
  spec: ScreenSpec;
  /** How far its content can scroll. */
  scrollMost: number;
}

/** A device drawn from its spec: its frame, its screen, its parts and their states as the rig's. */
export function makeDevice(
  device: UiDevice,
  spec: ScreenSpec,
  look: UiLook,
  seed: number,
): UiDeviceMade {
  const frame = frameOf(device);
  const pal = uiPalette(look, spec.theme);
  const clip = 'ui-screen-clip';
  const drawn = drawScreen(pal, spec, frame.area, 'screen', seed >>> 0);
  const body = frame.body(pal, clip);
  const a = frame.area;
  const defs = `<defs><clipPath id="${clip}"><rect x="${f1(a.x)}" y="${f1(a.y)}" width="${f1(a.w)}" height="${f1(a.h)}" rx="${f1(a.r)}"/></clipPath>${drawn.defs}</defs>`;
  const shadow = deviceShadow(frame.box, device);
  const parts: RigPart[] = [
    {
      id: 'device',
      parent: null,
      markup: shadow + body.under,
      box: frame.box,
      pivot: [frame.box[0] + frame.box[2] / 2, frame.box[1] + frame.box[3] / 2],
    },
  ];
  for (const part of drawn.parts) {
    const box = tidy(part.box);
    const pivot = part.pivot ?? [box[0] + box[2] / 2, box[1] + box[3] / 2];
    const attrs =
      part.id === 'screen'
        ? `${part.attrs ?? ''} clip-path="url(#${clip})"`.trim()
        : part.attrs;
    parts.push({
      id: part.id,
      parent: part.parent,
      markup: part.markup,
      box,
      pivot,
      ...(attrs ? { attrs } : {}),
    });
  }
  if (body.over)
    parts.push({
      id: 'glass',
      parent: 'device',
      markup: body.over,
      box: frame.box,
      pivot: [frame.box[0] + frame.box[2] / 2, frame.box[1] + frame.box[3] / 2],
    });
  const made = assemble(parts);
  // The rig's states: each piece's (`btn-primary:loading`), its layers shown and hidden.
  const states: KitPiece['rig']['states'] = {};
  const info: Record<string, UiPartInfo> = {};
  for (const part of drawn.parts) {
    info[part.id] = {
      box: tidy(part.box),
      ...(part.parent ? { parent: part.parent } : {}),
      ...(part.kind ? { kind: part.kind } : {}),
      ...(part.states ? { states: part.states } : {}),
      ...(part.state ? { state: part.state } : {}),
      ...(part.value !== undefined ? { value: part.value } : {}),
    };
    if (!part.states) continue;
    for (const state of part.states) {
      const pose: Record<string, { opacity: number }> = {};
      if (part.kind === 'tabs')
        part.states.forEach((tab) => {
          pose[`${part.id}.tab-${tab}@on`] = { opacity: tab === state ? 1 : 0 };
          pose[`${part.id}.tab-${tab}@off`] = {
            opacity: tab === state ? 0 : 1,
          };
        });
      else if (
        part.kind === 'modal' ||
        part.kind === 'toast' ||
        part.kind === 'keyboard'
      )
        pose[part.id] = { opacity: state === 'shown' ? 1 : 0 };
      else if (part.kind !== 'screen')
        for (const other of part.states)
          pose[`${part.id}@${other}`] = { opacity: other === state ? 1 : 0 };
      states[`${part.id}:${state}`] = pose;
    }
  }
  for (const [id, dto] of Object.entries(made.parts)) {
    if (info[id]?.value !== undefined) dto.value = info[id].value;
    // A group's box is what it holds: its pivot, given for the box it was meant to have, is kept inside it.
    const [fx, fy] = dto.pivot ?? [0.5, 0.5];
    if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) dto.pivot = [0.5, 0.5];
  }
  const font = esc(look.text);
  const svg = svgOf(
    frame.box,
    `${defs}<g font-family="${font}">${made.markup}</g>`,
  );
  const piece: KitPiece = {
    id: `ui.${device}:${spec.screen}:${spec.theme}`,
    svg,
    parts: made.parts,
    rig: { states, moves: ['enter', 'exit'] },
    focal: tidy([a.x, a.y, a.w, a.h]),
    box: frame.box,
    colours: ['paper', 'ink', 'accent'],
    notes: [`a ${device}'s ${spec.screen} screen, ${spec.theme}`],
  };
  return { piece, parts: info, spec, scrollMost: drawn.scrollMost };
}

/** A device's shadow on its desk: soft layers, wider at the foot. */
function deviceShadow(box: ShotBox, device: UiDevice): string {
  const [x, y, w, h] = box;
  const r =
    device === 'phone'
      ? 58
      : device === 'watch'
        ? 60
        : device === 'tablet'
          ? 46
          : 20;
  const top = device === 'watch' ? y + 70 : y;
  const hh = device === 'watch' ? h - 140 : h;
  return [
    { g: 26, dy: 30, o: 0.05 },
    { g: 14, dy: 18, o: 0.06 },
    { g: 5, dy: 8, o: 0.07 },
  ]
    .map(
      (one) =>
        `<rect x="${f1(x - one.g)}" y="${f1(top - one.g + one.dy)}" width="${f1(w + 2 * one.g)}" height="${f1(hh + 2 * one.g)}" rx="${f1(r + one.g)}" fill="#141821" opacity="${one.o}"/>`,
    )
    .join('');
}

// ── The cursor ────────────────────────────────────────────────────────────

/** The cursor's moves, as the stage plays them. */
export const CURSOR_MOVES = [
  'enter',
  'exit',
  'move-to',
  'click',
  'drag',
  'scroll',
  'type',
] as const;
export type CursorMove = (typeof CURSOR_MOVES)[number];

/** Words a board may use for a cursor's moves. */
export const CURSOR_SYNONYMS: Readonly<Record<string, CursorMove>> = {
  move: 'move-to',
  go: 'move-to',
  'go-to': 'move-to',
  hover: 'move-to',
  point: 'move-to',
  'point-at': 'move-to',
  walk: 'move-to',
  tap: 'click',
  press: 'click',
  select: 'click',
  choose: 'click',
  toggle: 'click',
  switch: 'click',
  check: 'click',
  open: 'click',
  slide: 'drag',
  'drag-to': 'drag',
  pull: 'drag',
  swipe: 'scroll',
  'scroll-down': 'scroll',
  'scroll-up': 'scroll',
  write: 'type',
  enter: 'enter',
  'type-in': 'type',
  appear: 'enter',
  leave: 'exit',
  disappear: 'exit',
};

/** A cursor's move as the board named it. */
export function cursorMove(name: string): CursorMove | null {
  const k = key(name);
  if ((CURSOR_MOVES as readonly string[]).includes(k)) return k as CursorMove;
  return CURSOR_SYNONYMS[k] ?? null;
}

/**
 * The cursor: an arrow (dark, with a light edge, so it reads on any
 * screen) and a pointing hand, its tip at (0, 0), and the ring a click
 * sends out. The hand shows over what can be clicked; the client swaps
 * them and presses and ripples by time (actors.ts).
 */
export function makeCursor(style: KitStyle, colour?: string): KitPiece {
  const fill =
    colour === 'accent' ? style.accent : mixOk(style.ink, '#000000', 0.25);
  const edge = '#FFFFFF';
  const ring = style.accent;
  const arrow = `<path d="M0 0L0 27.5L6.6 21.4L11.2 31.6L15.6 29.6L11.1 19.7L19.8 19.4Z" fill="${fill}" stroke="${edge}" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke"/>`;
  // A hand pointing up, its fingertip the tip.
  const hand = `<path d="M-2.6 2.2C-2.6 0.6-1.5-0.4 0-0.4S2.6 0.6 2.6 2.2V12.4C3 10.6 4.4 10 5.6 10.2C7 10.4 7.8 11.4 7.9 12.9C8.4 11.4 9.7 10.9 10.9 11.1C12.3 11.4 13 12.5 13 14C13.5 12.8 14.6 12.4 15.6 12.6C16.9 12.9 17.5 14 17.5 15.3V22.4C17.5 28.4 13.6 32.4 8.2 32.4H6.4C2.7 32.4 0.6 30.9-1.6 27.8L-7.6 19.5C-8.6 18.1-8.3 16.4-7 15.6C-5.7 14.8-4.1 15.2-3.1 16.4L-2.6 17.1Z" fill="#FFFFFF" stroke="${fill}" stroke-width="2.2" stroke-linejoin="round"/><path d="M5.6 19V25.6M10.3 19.4V25.6M14.8 19.9V25.4" stroke="${fill}" stroke-width="1.6" stroke-linecap="round"/>`;
  const parts: RigPart[] = [
    // The ring and the hand are drawn whole: the stage poses all three at every moment
    // (a pose's opacity multiplies the drawn one, so a part drawn hidden could never show).
    {
      id: 'ripple',
      parent: null,
      markup: `<circle cx="0" cy="0" r="22" fill="${ring}" fill-opacity="0.16" stroke="${ring}" stroke-width="2.6"/>`,
      box: [-22, -22, 44, 44],
      pivot: [0, 0],
    },
    {
      id: 'hand',
      parent: null,
      markup: hand,
      box: [-9, -1.5, 28, 35],
      pivot: [0, 0],
    },
    {
      id: 'arrow',
      parent: null,
      markup: arrow,
      box: [-1.5, -1.5, 23, 35],
      pivot: [0, 0],
    },
  ];
  const made = assemble(parts);
  const box: ShotBox = [-24, -24, 48, 60];
  return {
    id: 'ui.cursor',
    svg: svgOf(box, made.markup),
    parts: made.parts,
    rig: { states: {}, moves: [...CURSOR_MOVES], cursor: { tip: [0, 0] } },
    focal: [-2, -2, 24, 36],
    box,
    colours: ['ink', 'accent'],
    notes: ['the cursor: an arrow and a hand, its tip at (0, 0)'],
  };
}

// ── The desk ──────────────────────────────────────────────────────────────

/** The desk's size in each shape: the frame's, in the stage's units. */
export const DESK: Readonly<Record<FilmShape, { w: number; h: number }>> = {
  wide: { w: 1600, h: 900 },
  tall: { w: 900, h: 1600 },
};

/**
 * The soft backdrop a device stands on: the show's paper washed toward
 * its accent in one corner and the app's colour in the other, a pale glow
 * where the device stands. No tool rail, no grid of another app.
 */
export function uiDesk(
  look: Pick<UiLook, 'paper' | 'accent'>,
  shape: FilmShape,
): ShotSvgAssetDto {
  const { w: W, h: H } = DESK[shape];
  const app = appColour(look.accent, 'light');
  const top = mixOk(look.paper, '#FFFFFF', 0.35);
  const warm = mixOk(look.paper, look.accent, 0.12);
  const cool = mixOk(look.paper, app, 0.16);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="desk-wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cool}"/><stop offset="0.55" stop-color="${top}"/><stop offset="1" stop-color="${warm}"/></linearGradient><radialGradient id="desk-glow" cx="0.5" cy="0.45" r="0.55"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.75"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect data-part="desk" x="0" y="0" width="${W}" height="${H}" fill="url(#desk-wash)"/><rect x="0" y="0" width="${W}" height="${H}" fill="url(#desk-glow)"/></svg>`;
  return {
    kind: 'svg',
    svg,
    box: [0, 0, W, H],
    parts: { desk: { box: [0, 0, W, H] } },
    focal: [W * 0.2, H * 0.12, W * 0.6, H * 0.76],
  };
}

// ── Placing devices on the desk ───────────────────────────────────────────

/** How big a device stands on the desk: its height's share of the desk, and its width's most. */
const SIZE: Readonly<
  Record<UiDevice, Record<FilmShape, { h: number; w: number }>>
> = {
  phone: { wide: { h: 0.8, w: 0.5 }, tall: { h: 0.68, w: 0.66 } },
  tablet: { wide: { h: 0.8, w: 0.6 }, tall: { h: 0.6, w: 0.82 } },
  laptop: { wide: { h: 0.78, w: 0.76 }, tall: { h: 0.5, w: 0.94 } },
  browser: { wide: { h: 0.76, w: 0.78 }, tall: { h: 0.5, w: 0.94 } },
  window: { wide: { h: 0.76, w: 0.78 }, tall: { h: 0.5, w: 0.94 } },
  watch: { wide: { h: 0.74, w: 0.4 }, tall: { h: 0.46, w: 0.6 } },
};

/** Where two or more devices' middle sits on a tall desk: low enough that the words' band above them has room for their labels. */
const TALL_PAIR_MIDDLE = 0.64;

/** Where a subject's middle sits on the desk, as a share of its height: the camera's optical centre (client camera.ts). */
const MIDDLE: Readonly<Record<FilmShape, number>> = { wide: 0.46, tall: 0.42 };

/** A device placed: its feet (the middle of its box's foot) and its height, in the desk's units; and its box there. */
export interface UiPlaced {
  at: { x: number; y: number };
  size: number;
  /** Its box on the desk. */
  box: ShotBox;
  /** Its units to the desk's. */
  k: number;
}

/**
 * Devices placed side by side on the desk (one in the middle; two as a
 * before and after, the same size, a gap between them), each as big as
 * its kind stands, all one scale so a before and an after compare.
 */
export function placeDevices(
  devices: readonly { device: UiDevice; box: ShotBox }[],
  shape: FilmShape,
): UiPlaced[] {
  if (!devices.length) return [];
  const { w: W, h: H } = DESK[shape];
  const n = devices.length;
  const gap = W * (shape === 'tall' ? 0.05 : 0.07);
  // One scale for all: the smallest any of them needs to fit its share.
  const share = (d: { device: UiDevice; box: ShotBox }) => {
    const size = SIZE[d.device][shape];
    const byH = (H * size.h) / d.box[3];
    const byW = (W * size.w) / d.box[2];
    return Math.min(byH, byW);
  };
  let k = Math.min(...devices.map(share));
  const widths = () =>
    devices.reduce((sum, d) => sum + d.box[2] * k, 0) + gap * (n - 1);
  if (n > 1) {
    const room = W * (shape === 'tall' ? 0.94 : 0.86);
    if (widths() > room) k *= room / widths();
  }
  const total = widths();
  let x = (W - total) / 2;
  return devices.map((d) => {
    const w = d.box[2] * k;
    const h = d.box[3] * k;
    // A tall before and after stands low, leaving the words' band above it for their labels.
    const cy =
      H * (shape === 'tall' && n > 1 ? TALL_PAIR_MIDDLE : MIDDLE[shape]);
    const top = Math.max(H * 0.04, Math.min(H * 0.96 - h, cy - h / 2));
    const box: ShotBox = [r1(x), r1(top), r1(w), r1(h)];
    x += w + gap;
    return {
      at: { x: r1(box[0] + w / 2), y: r1(top + h) },
      size: r1(h),
      box,
      k,
    };
  });
}

/** The cursor's height on the desk: about a twentieth of the frame, so it reads in either shape. */
export function cursorSize(shape: FilmShape, cursorBox: ShotBox): number {
  const { w: W, h: H } = DESK[shape];
  // The arrow itself is 35 of the box's 60 units: it stands about 4.5% of the frame's short side.
  return r1((0.045 * Math.min(W, H) * cursorBox[3]) / 35);
}

/** A point of a device's own (its units) on the desk. */
export function onDesk(
  placed: UiPlaced,
  deviceBox: ShotBox,
  p: [number, number],
): [number, number] {
  return [
    r1(placed.box[0] + (p[0] - deviceBox[0]) * placed.k),
    r1(placed.box[1] + (p[1] - deviceBox[1]) * placed.k),
  ];
}

/** A box of a device's own on the desk. */
export function boxOnDesk(
  placed: UiPlaced,
  deviceBox: ShotBox,
  b: ShotBox,
): ShotBox {
  const [x, y] = onDesk(placed, deviceBox, [b[0], b[1]]);
  return [x, y, r1(b[2] * placed.k), r1(b[3] * placed.k)];
}

/**
 * Where the cursor's tip rests before it acts: on the device's screen,
 * low and to the right, clear of what it will point at.
 */
export function cursorRest(
  placed: UiPlaced,
  deviceBox: ShotBox,
  focal: ShotBox,
): [number, number] {
  return onDesk(placed, deviceBox, [
    focal[0] + focal[2] * 0.8,
    focal[1] + focal[3] * 0.64,
  ]);
}

/** The cursor's feet (its box's foot middle) for its tip at a point, at a height. */
export function cursorFeet(
  tip: [number, number],
  size: number,
  cursorBox: ShotBox,
): { x: number; y: number } {
  const k = size / cursorBox[3];
  return {
    x: r1(tip[0] + k * (cursorBox[0] + cursorBox[2] / 2)),
    y: r1(tip[1] + k * (cursorBox[1] + cursorBox[3])),
  };
}

// ── The registry's entries ────────────────────────────────────────────────

/** Whether a kit id is the UI kit's. */
export const isUiKit = (id: string): boolean => id.startsWith('ui.');
export const isUiDevice = (id: string): boolean =>
  isUiKit(id) && id !== 'ui.cursor';

/** The device a kit id draws. */
export const deviceOf = (id: string): UiDevice | null => {
  const name = id.replace(/^ui\./, '');
  return (UI_DEVICES as readonly string[]).includes(name)
    ? (name as UiDevice)
    : null;
};

const SCREEN_PARAM = {
  values: UI_SCREENS,
  default: 'product',
  about: 'the kind of screen',
} as const;

const DEVICE_PARAMS = {
  screen: SCREEN_PARAM,
  pieces: {
    text: 140,
    default: '',
    about: `instead of a kind of screen, its pieces from the top, from: ${UI_PIECES.join(', ')}`,
  },
  theme: {
    values: ['light', 'dark'],
    default: 'light',
    about: 'the screen’s theme',
  },
  title: {
    text: 48,
    default: '',
    about: 'the screen’s title, words the line says',
  },
  words: { text: 36, default: '', about: 'the main button’s words' },
  items: {
    text: 120,
    default: '',
    about:
      'up to five labels, commas between: rows, fields, switches, features',
  },
  state: {
    text: 120,
    default: '',
    about: 'parts that start in another state: "part: state, …"',
  },
} as const;

/** A device's piece made from its settings (the registry's make: no shot before it). */
function deviceMaker(device: UiDevice) {
  return (params: KitParams, style: KitStyle, seed: number): KitPiece =>
    makeDevice(device, specOf(params), uiLookOf(style), seed).piece;
}

export const UI_KIT: Readonly<Record<string, KitEntry>> = Object.fromEntries([
  ...UI_DEVICES.map((device): [string, KitEntry] => [
    `ui.${device}`,
    {
      family: 'ui',
      looks: ['editorial', 'illustrated'],
      about: `${UI_DEVICE_USES[device]}, its screen built from a kind of screen or a list of pieces, every piece a part (its states swap on a click). A generic UI only, never a real product’s.`,
      params: DEVICE_PARAMS,
      moves: ['enter', 'exit'],
      make: deviceMaker(device),
    },
  ]),
  [
    'ui.cursor',
    {
      family: 'ui',
      looks: ['editorial', 'illustrated'],
      about:
        'the cursor on a device’s screen: it moves to a part, clicks it (the part changes to the move’s state), drags a slider to a value, scrolls, types words into a field.',
      params: {},
      moves: [...CURSOR_MOVES],
      synonyms: CURSOR_SYNONYMS,
      make: (_params: KitParams, style: KitStyle) => makeCursor(style),
    },
  ],
]);

// ── What a device's parts are, without drawing it twice ───────────────────

const PARTS = new Map<string, UiDeviceMade>();

/** A device as made for its settings (kept, so the checks and the build ask once). */
export function deviceFor(
  kit: string,
  params: Readonly<Record<string, unknown>> = {},
  look: UiLook = PLAIN_LOOK,
  seed = 1,
  carried: UiCarried = {},
): UiDeviceMade | null {
  const device = deviceOf(kit);
  if (!device) return null;
  const spec = specOf(params, carried);
  const k = JSON.stringify([device, spec, look, seed]);
  let made = PARTS.get(k);
  if (!made) {
    made = makeDevice(device, spec, look, seed);
    if (PARTS.size > 64) PARTS.clear();
    PARTS.set(k, made);
  }
  return made;
}

/** A look for the checks, when only a device's parts are asked: their names do not depend on colours. */
export const PLAIN_LOOK: UiLook = {
  paper: '#F4EFE6',
  ink: '#1D232B',
  muted: '#646B76',
  accent: '#D9480F',
  text: 'Plus Jakarta Sans',
  display: 'Plus Jakarta Sans',
};

/**
 * The parts a board may name on a device, by id: what a callout may point
 * at, the camera push into and the cursor act on (its layers aside).
 */
export function uiPartNames(
  kit: string,
  params: Readonly<Record<string, unknown>> = {},
): string[] {
  const made = deviceFor(kit, params);
  if (!made) return [];
  return Object.keys(made.parts).filter(
    (id) =>
      !id.includes('@') &&
      !/\.(field|text|caret|placeholder|content|pill)$/.test(id),
  );
}

/** A part of a device by a name the board wrote: its id, or the one whose id it ends or starts. */
export function uiPartNamed(
  kit: string,
  params: Readonly<Record<string, unknown>>,
  name: string,
): string | null {
  const names = uiPartNames(kit, params);
  const k = key(name.replace(/^part:/i, ''));
  if (!k) return null;
  const made = deviceFor(kit, params);
  // Of several a name fits, the control (a switch, a slider, a button) before the row that holds it.
  const best = (found: string[]) =>
    found.find((id) => clickable(made?.parts[id]?.kind)) ?? found[0] ?? null;
  return (
    best(names.filter((id) => id === k)) ??
    best(names.filter((id) => id.replace(/\./g, '-') === k)) ??
    best(names.filter((id) => id.endsWith(`-${k}`) || id.endsWith(`.${k}`))) ??
    best(names.filter((id) => id.startsWith(`${k}-`))) ??
    null
  );
}

/** An actor of a shot as the checks and the build see it: its id, its kit and its settings. */
export interface UiActorRef {
  id: string;
  kit: string;
  params?: Readonly<Record<string, unknown>>;
}

/**
 * The device part a name points at in a shot ("phone.btn-primary",
 * "part:btn-primary", "btn-primary", "Brightness"): the device it names
 * first, else the first device that has such a part; null when none has.
 */
export function uiTargetIn(
  actors: readonly UiActorRef[],
  name: string,
): { actor: string; part: string } | null {
  const devices = actors.filter((a) => isUiDevice(a.kit));
  if (!devices.length) return null;
  const bare = name.trim().replace(/^(?:actor|part):/i, '');
  const dot = bare.indexOf('.');
  if (dot > 0) {
    const owner = devices.find((a) => a.id === bare.slice(0, dot));
    if (owner) {
      const part = uiPartNamed(
        owner.kit,
        owner.params ?? {},
        bare.slice(dot + 1),
      );
      return part ? { actor: owner.id, part } : null;
    }
  }
  for (const a of devices) {
    const part = uiPartNamed(a.kit, a.params ?? {}, bare);
    if (part) return { actor: a.id, part };
  }
  return null;
}

/** Whether a part's kind is one a cursor clicks. */
export const clickable = (kind: UiKind | undefined): boolean =>
  Boolean(kind && CLICKABLE.has(kind));

export { UI_SCREENS, UI_PIECES, UI_STATE_WORDS };
export type { UiScreen, UiPiece, UiKind, UiPart };

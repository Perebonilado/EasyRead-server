/**
 * A screen of the UI kit (explainer-animation-tech §11, WP18), built by
 * code from a small spec the board fills from closed lists: a kind of
 * screen (a product page, settings, a sign-in form, a dashboard...) or a
 * list of pieces stacked in order, a theme, and the script's few words.
 *
 * Every piece is a named part with its box (`btn-primary`, `card-2`,
 * `toggle-dark`, `chart.bar-3`), so a callout can point at it, the camera
 * push into it and the cursor act on it. A piece that changes carries its
 * states as layers of its own, each a part (`btn-primary@loading`), the
 * one it starts in shown and the others drawn hidden; the client's swap
 * recipe passes from one to the next behind a short blur, its container
 * morphing in size, radius and fill where the layers' boxes differ, so a
 * change is always the same element changing and never a cut. Its kind
 * (`data-ui`) tells the client how it changes: a toggle's knob slides, a
 * slider's knob glides along its track, an input is typed into, a modal
 * rises over a dimmed screen, the screen's content scrolls, the whole
 * screen turns dark.
 *
 * Words come from the spec only (a title, a button's words, a list's
 * labels); every other line of text is a wireframe's grey bar. Numbers on
 * a screen are bars too: a screen in a film never states a figure the
 * research does not give.
 */
import type { ShotBox } from '../../../contracts';
import type { Pt } from './shape';
import {
  bar,
  circle,
  esc,
  f1,
  fitWords,
  icon,
  outline,
  paint,
  placeholder,
  r1,
  rect,
  slug,
  softShadow,
  widthOf,
  words,
  wordsBox,
  type UiPalette,
  type UiRole,
} from './ui-paint';

// ── The closed lists ──────────────────────────────────────────────────────

/** The kinds of screen the board may ask for, each with when it is used. */
export const UI_SCREEN_USES = {
  product:
    'a shop’s product page: picture, title, rating, features, price, a button to buy',
  settings:
    'a settings page: rows of switches (a dark mode, notifications) and a slider',
  login: 'a sign-in form: two fields, a remember-me box, a button',
  dashboard: 'a dashboard: figures on cards, a bar chart, a donut, a list',
  feed: 'a social feed: posts with a picture and a like button',
  chat: 'a conversation: messages and a box to type in',
  checkout: 'a cart or checkout: items, a total, a button to pay',
  article: 'an article or a help page: a title, a picture, paragraphs',
  list: 'a list or search results: a search box and rows',
  profile: 'a profile: a picture, a name, figures, a follow button',
  player: 'a player: a cover, a progress slider, play controls',
} as const;
export type UiScreen = keyof typeof UI_SCREEN_USES;
export const UI_SCREENS = Object.keys(UI_SCREEN_USES) as UiScreen[];

/** The pieces a screen may be built of, in order from the top, when the board lists its own. */
export const UI_PIECE_USES = {
  nav: 'a top bar with a back arrow',
  header: 'a big title',
  search: 'a search box (it can be typed into)',
  image: 'a picture’s place',
  title: 'the title words',
  badge: 'a small tag beside the title',
  rating: 'stars',
  body: 'lines of text',
  chips: 'small feature tags (the items)',
  price: 'a price and a quantity',
  button: 'the main button (the words)',
  'button-secondary': 'a second, outlined button',
  input: 'a text field (an item names it; it can be typed into)',
  toggle: 'a switch (an item names it)',
  slider: 'a slider (an item names it; it can be dragged)',
  checkbox: 'a box to tick (an item names it)',
  rows: 'list rows (the items)',
  card: 'a card with a picture',
  stats: 'figures on small cards',
  chart: 'a bar chart (it can grow)',
  'chart-line': 'a line chart (it can draw)',
  donut: 'a donut chart',
  avatar: 'a round picture of a person, generic',
  messages: 'chat messages (the items)',
  tabs: 'a tab bar at the foot',
  modal: 'a dialog that opens over the screen (hidden until swapped to shown)',
  toast: 'a short notice that slides in (hidden until swapped to shown)',
  keyboard: 'an on-screen keyboard (hidden until swapped to shown)',
} as const;
export type UiPiece = keyof typeof UI_PIECE_USES;
export const UI_PIECES = Object.keys(UI_PIECE_USES) as UiPiece[];

/** What a part is, as the client changes it (its `data-ui`). */
export type UiKind =
  | 'screen'
  | 'scroll'
  | 'button'
  | 'toggle'
  | 'checkbox'
  | 'slider'
  | 'input'
  | 'card'
  | 'row'
  | 'chip'
  | 'like'
  | 'tabs'
  | 'modal'
  | 'toast'
  | 'keyboard'
  | 'chart'
  | 'stat'
  | 'image'
  | 'text';

/**
 * The states each kind can show, the first its rest. A slider's value
 * and a scroll's offset are numbers instead (0 to 1, and units down).
 */
export const UI_STATES: Readonly<Partial<Record<UiKind, readonly string[]>>> = {
  screen: ['light', 'dark'],
  button: ['default', 'hover', 'pressed', 'loading', 'success', 'disabled'],
  toggle: ['off', 'on'],
  checkbox: ['off', 'on'],
  input: ['default', 'focus', 'error', 'success'],
  card: ['default', 'hover', 'selected'],
  row: ['default', 'hover', 'selected'],
  chip: ['default', 'selected'],
  like: ['off', 'on'],
  tabs: ['1', '2', '3', '4'],
  modal: ['hidden', 'shown'],
  toast: ['hidden', 'shown'],
  keyboard: ['hidden', 'shown'],
};

/** Every state word any part may take, for the board's list. */
export const UI_STATE_WORDS: readonly string[] = [
  ...new Set(Object.values(UI_STATES).flat()),
];

/** The kinds a cursor clicks (it turns into a hand over them). */
export const CLICKABLE: ReadonlySet<UiKind> = new Set<UiKind>([
  'button',
  'toggle',
  'checkbox',
  'slider',
  'card',
  'row',
  'chip',
  'like',
  'tabs',
  'input',
]);

// ── What a screen is built into ───────────────────────────────────────────

/** One part of a screen, ready for the rig's assemble(). */
export interface UiPart {
  id: string;
  parent: string | null;
  markup: string;
  box: ShotBox;
  /** Where it turns or scales about, in the piece's units; its box's middle when absent. */
  pivot?: Pt;
  attrs?: string;
  kind?: UiKind;
  /** The states it can show, each a layer `<id>@<state>` (a slider's and a scroll's are numbers). */
  states?: readonly string[];
  /** The state it is drawn in. */
  state?: string;
  /** A bar's value (a chart's), a slider's position (0–1). */
  value?: number;
}

/** What a screen is made of: its parts (under `parent`), its defs, and how far its content reaches. */
export interface ScreenDrawing {
  parts: UiPart[];
  defs: string;
  /** How far the content can scroll, in units (0 when it all shows). */
  scrollMost: number;
}

/** The words and settings a screen is built from. */
export interface ScreenSpec {
  screen: UiScreen;
  /** The pieces in order, when the board lists its own instead of a kind of screen. */
  pieces?: UiPiece[];
  theme: 'light' | 'dark';
  title?: string;
  /** The main button's words. */
  words?: string;
  /** A list's labels: rows, fields, switches, features, messages. */
  items?: string[];
  /** Parts drawn in another state than their rest ("btn-primary" → "disabled"), a slider at a value ("0.7"). */
  initial?: Record<string, string>;
  /** Words already typed into a field, by its id. */
  typed?: Record<string, string>;
  /** How far the content is already scrolled, in units. */
  scrolled?: number;
}

/** The screen's own area in the piece: where the drawing goes, its corner radius, its form. */
export interface ScreenArea {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  /** A phone's column, a wide window's layout, a watch's face. */
  form: 'phone' | 'wide' | 'tablet' | 'watch';
  /** How tall the top strip is that holds the clock and the signal (a phone's), 0 for none. */
  status: number;
  /** The bottom strip a phone keeps clear for its home bar. */
  foot: number;
}

// ── The builder ───────────────────────────────────────────────────────────

/** The parts as they are made: unique ids, defs, and what a piece may ask of the screen. */
class Builder {
  readonly parts: UiPart[] = [];
  readonly defs: string[] = [];
  private readonly used = new Set<string>();
  private images = 0;

  constructor(
    readonly pal: UiPalette,
    readonly spec: ScreenSpec,
    readonly area: ScreenArea,
    readonly seed: number,
  ) {}

  /** An id not yet used: the base, else the base numbered on from 2. */
  id(base: string): string {
    let id = base;
    for (let k = 2; this.used.has(id); k += 1) id = `${base}-${k}`;
    this.used.add(id);
    return id;
  }

  add(part: UiPart): UiPart {
    this.parts.push(part);
    return part;
  }

  /** The state a part starts in: as the spec says when it is one of its own, else its rest. */
  initial(id: string, states: readonly string[]): string {
    const want = this.spec.initial?.[id];
    return want && states.includes(want) ? want : states[0];
  }

  /** A picture's place, its defs kept. */
  image(x: number, y: number, w: number, h: number, r: number): string {
    this.images += 1;
    const made = placeholder(
      this.pal,
      `img${this.images}`,
      x,
      y,
      w,
      h,
      r,
      this.seed + this.images * 3,
    );
    this.defs.push(made.defs);
    return made.markup;
  }

  /** A stateful part: its group with its kind and state, and a layer for each state, the drawn one shown. */
  stateful(
    id: string,
    parent: string,
    kind: UiKind,
    box: ShotBox,
    layer: (state: string) => { markup: string; box?: ShotBox },
    shared: {
      id: string;
      markup: string;
      box: ShotBox;
      attrs?: string;
      pivot?: Pt;
    }[] = [],
    states: readonly string[] = UI_STATES[kind] ?? ['default'],
    extra = '',
    rest?: string,
  ): string {
    const want = this.spec.initial?.[id];
    const drawn =
      want && states.includes(want)
        ? want
        : rest && states.includes(rest)
          ? rest
          : states[0];
    this.add({
      id,
      parent,
      markup: '',
      box,
      kind,
      states,
      state: drawn,
      attrs: `data-ui="${kind}" data-state="${drawn}"${extra ? ` ${extra}` : ''}`,
    });
    for (const state of states) {
      const made = layer(state);
      this.add({
        id: `${id}@${state}`,
        parent: id,
        markup: made.markup,
        box: made.box ?? box,
        attrs:
          state === drawn ? 'data-layer="1"' : 'data-layer="1" opacity="0"',
      });
    }
    for (const one of shared)
      this.add({
        id: one.id,
        parent: id,
        markup: one.markup,
        box: one.box,
        ...(one.attrs ? { attrs: one.attrs } : {}),
        ...(one.pivot ? { pivot: one.pivot } : {}),
      });
    return drawn;
  }
}

/** The spec's words for a piece: the item at k, trimmed to a few words. */
const itemOf = (spec: ScreenSpec, k: number, most = 3): string | undefined => {
  const raw = spec.items?.[k]?.trim();
  if (!raw) return undefined;
  return raw.split(/\s+/).slice(0, most).join(' ');
};

/** A seeded number in [0, 1) for the k-th draw of a seed. */
const rnd = (seed: number, k: number): number => {
  let t = (seed + k * 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** An empty rectangle over a screen: a group that spans it whatever it holds. */
const span = (area: ScreenArea): string =>
  `<rect x="${f1(area.x)}" y="${f1(area.y)}" width="${f1(area.w)}" height="${f1(area.h)}" fill="none"/>`;

/** A container's box as its layers mark it: the client morphs one into the next. */
const BOX = 'data-ui-box="1"';

// ── Pieces ────────────────────────────────────────────────────────────────

/** Sizes in a phone's units; a wide window's are the same, its column wider. */
const M = 20;

interface Lay {
  b: Builder;
  /** The part pieces are put under (the scrolling content). */
  parent: string;
  x: number;
  w: number;
}

function navBar(l: Lay, y: number, over = false): number {
  const { b } = l;
  const pal = b.pal;
  const h = 52;
  const id = b.id('nav');
  // The screen's title in the bar, unless a title or a header below says it big.
  const below = piecesOf(b.spec).some((p) => p === 'header' || p === 'title');
  const title =
    b.spec.title && !over && !below
      ? fitWords(b.spec.title, l.w * 0.56, 17, 600)
      : '';
  const fg: UiRole = over ? 'text' : 'text';
  const chip = (cx: number, glyph: string) =>
    over
      ? `${circle(pal, cx, y + h / 2, 19, 'surface', 'opacity="0.92"')}${icon(pal, glyph, cx - 11, y + h / 2 - 11, 22, fg)}`
      : icon(pal, glyph, cx - 12, y + h / 2 - 12, 24, fg);
  const left = l.x + 6;
  const right = l.x + l.w - 6;
  b.add({
    id,
    parent: l.parent,
    markup: '',
    box: [l.x - M, y, l.w + 2 * M, h],
  });
  b.add({
    id: b.id('nav-back'),
    parent: id,
    markup: chip(left + 12, 'back'),
    box: [left - 8, y + 6, 40, 40],
  });
  if (title)
    b.add({
      id: b.id('nav-title'),
      parent: id,
      markup: words(
        pal,
        l.x + l.w / 2,
        y + h / 2 + 6,
        title,
        17,
        600,
        'text',
        'middle',
      ),
      box: wordsBox(l.x + l.w / 2, y + h / 2 + 6, title, 17, 600, 'middle'),
    });
  else if (!over && !below)
    b.add({
      id: b.id('nav-title'),
      parent: id,
      markup: bar(pal, l.x + l.w / 2 - 50, y + h / 2 - 5, 100, 10, 'bar'),
      box: [l.x + l.w / 2 - 50, y + h / 2 - 5, 100, 10],
    });
  b.add({
    id: b.id('nav-action'),
    parent: id,
    markup: chip(right - 12, over ? 'heart' : 'more'),
    box: [right - 32, y + 6, 40, 40],
  });
  return y + h;
}

function header(l: Lay, y: number): number {
  const { b } = l;
  const text = b.spec.title ? fitWords(b.spec.title, l.w, 30, 700) : '';
  const id = b.id('header');
  if (text) {
    const base = y + 40;
    b.add({
      id,
      parent: l.parent,
      markup: words(
        b.pal,
        l.x,
        base,
        text,
        30,
        800,
        'text',
        'start',
        'letter-spacing="-0.4"',
      ),
      box: wordsBox(l.x, base, text, 30, 700),
    });
  } else
    b.add({
      id,
      parent: l.parent,
      markup: bar(b.pal, l.x, y + 18, l.w * 0.5, 22, 'text3'),
      box: [l.x, y + 18, l.w * 0.5, 22],
    });
  return y + 58;
}

function titleRow(l: Lay, y: number, size = 23): number {
  const { b } = l;
  const text = b.spec.title ? fitWords(b.spec.title, l.w, size, 700) : '';
  const id = b.id('title');
  if (text) {
    const base = y + size * 0.95;
    b.add({
      id,
      parent: l.parent,
      markup: words(
        b.pal,
        l.x,
        base,
        text,
        size,
        800,
        'text',
        'start',
        'letter-spacing="-0.3"',
      ),
      box: wordsBox(l.x, base, text, size, 700),
    });
  } else
    b.add({
      id,
      parent: l.parent,
      markup: bar(b.pal, l.x, y + 5, l.w * 0.66, size * 0.7, 'text3'),
      box: [l.x, y + 5, l.w * 0.66, size * 0.7],
    });
  return y + size * 1.45;
}

function bodyLines(l: Lay, y: number, lines = 3, id = 'body'): number {
  const { b } = l;
  const widths = [1, 0.95, 0.88, 0.97, 0.9, 0.62];
  let markup = '';
  for (let k = 0; k < lines; k += 1) {
    const w = l.w * (k === lines - 1 ? 0.58 : widths[k % widths.length]);
    markup += bar(b.pal, l.x, y + 4 + k * 17, w, 8, 'bar');
  }
  const h = lines * 17;
  b.add({
    id: b.id(id),
    parent: l.parent,
    markup,
    box: [l.x, y + 4, l.w, h - 9],
  });
  return y + h + 4;
}

function metaRow(l: Lay, y: number): number {
  const { b } = l;
  const pal = b.pal;
  // A category's small coloured line, and a tag at the far side.
  b.add({
    id: b.id('category'),
    parent: l.parent,
    markup: bar(pal, l.x, y + 9, 58, 9, 'app'),
    box: [l.x, y + 9, 58, 9],
  });
  const w = 74;
  const x = l.x + l.w - w;
  b.add({
    id: b.id('badge'),
    parent: l.parent,
    markup: `${rect(pal, x, y, w, 27, 13.5, 'hot')}${icon(pal, 'percent', x + 9, y + 5.5, 16, 'appText', 2.2)}${bar(pal, x + 31, y + 9.5, 33, 8, 'appText')}`,
    box: [x, y, w, 27],
  });
  return y + 36;
}

function ratingRow(l: Lay, y: number): number {
  const { b } = l;
  const pal = b.pal;
  let markup = '';
  for (let k = 0; k < 5; k += 1)
    markup += icon(
      pal,
      'star',
      l.x + k * 21,
      y,
      19,
      k < 4 ? 'star' : 'starOff',
    );
  markup += bar(pal, l.x + 5 * 21 + 8, y + 6, 74, 8, 'bar');
  b.add({
    id: b.id('rating'),
    parent: l.parent,
    markup,
    box: [l.x, y, 5 * 21 + 82, 19],
  });
  return y + 30;
}

const CHIP_ICONS = ['truck', 'drop', 'leaf', 'globe', 'tag', 'bolt'];

function chips(l: Lay, y: number): number {
  const { b } = l;
  const pal = b.pal;
  const cols = l.w > 500 ? 4 : 2;
  const cw = (l.w - (cols - 1) * 10) / cols;
  const h = 34;
  for (let k = 0; k < 4; k += 1) {
    const cx = l.x + (k % cols) * (cw + 10);
    const cy = y + Math.floor(k / cols) * (h + 8);
    const id = b.id(`chip-${k + 1}`);
    const label = itemOf(b.spec, k, 2);
    const text = label ? fitWords(label, cw - 46, 13, 600) : '';
    const content = `${circle(pal, cx + 15, cy + h / 2, 13, 'appSoft')}${icon(pal, CHIP_ICONS[k], cx + 6.5, cy + h / 2 - 8.5, 17, 'app', 2)}${
      text
        ? words(pal, cx + 36, cy + h / 2 + 4.5, text, 13, 600, 'text2')
        : bar(
            pal,
            cx + 36,
            cy + h / 2 - 4,
            Math.min(cw - 50, 64 + rnd(b.seed, k) * 24),
            8,
            'bar',
          )
    }`;
    b.stateful(
      id,
      l.parent,
      'chip',
      [cx, cy, cw, h],
      (state) => ({
        markup:
          state === 'selected'
            ? rect(pal, cx, cy, cw, h, h / 2, 'appSoft', BOX) +
              outline(pal, cx, cy, cw, h, h / 2, 'app', 1.5)
            : rect(pal, cx, cy, cw, h, h / 2, 'surface2', BOX),
      }),
      [{ id: `${id}.content`, markup: content, box: [cx, cy, cw, h] }],
    );
  }
  return y + 2 * (h + 8) + (cols === 4 ? -(h + 8) : 0) + 4;
}

function priceRow(l: Lay, y: number): number {
  const { b } = l;
  const pal = b.pal;
  // A price's place: a bold figure's bar and a struck old one, never a made-up figure.
  b.add({
    id: b.id('price'),
    parent: l.parent,
    markup: `${bar(pal, l.x, y + 10, 84, 20, 'text')}${bar(pal, l.x + 94, y + 15, 44, 10, 'text3')}${rect(pal, l.x + 92, y + 19, 48, 2, 1, 'text3')}`,
    box: [l.x, y + 10, 140, 20],
  });
  const w = 116;
  const x = l.x + l.w - w;
  b.add({
    id: b.id('qty'),
    parent: l.parent,
    markup: `${outline(pal, x, y + 2, w, 38, 19, 'line', 1.5)}${icon(pal, 'minus', x + 10, y + 9, 24, 'text')}${bar(pal, x + w / 2 - 7, y + 16, 14, 10, 'text')}${icon(pal, 'plus', x + w - 34, y + 9, 24, 'text')}`,
    box: [x, y + 2, w, 38],
  });
  return y + 52;
}

/** The main button, or a second outlined one: its states, its container morphing between them. */
function button(
  l: Lay,
  y: number,
  secondary = false,
  half?: 'left' | 'right',
): number {
  const { b } = l;
  const pal = b.pal;
  const h = l.w > 500 ? 50 : 54;
  const gap = 10;
  const w = half ? (l.w - gap) / 2 : l.w;
  const x = half === 'right' ? l.x + w + gap : l.x;
  const id = b.id(secondary ? 'btn-secondary' : 'btn-primary');
  const raw = secondary ? itemOf(b.spec, 3, 3) : b.spec.words?.trim();
  const label = raw ? fitWords(raw, w - 40, 17, 700) : '';
  const r = h / 2.6;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const content = (role: UiRole) =>
    label
      ? words(
          pal,
          cx,
          cy + 6,
          label,
          17,
          700,
          role,
          'middle',
          'letter-spacing="0.2"',
        )
      : bar(pal, cx - w * 0.17, cy - 5, w * 0.34, 10, role);
  const fillRole: UiRole = secondary ? 'bg' : 'app';
  const textRole: UiRole = secondary ? 'app' : 'appText';
  const edge = (role: UiRole) =>
    secondary ? outline(pal, x + 1, y + 1, w - 2, h - 2, r, role, 2) : '';
  // The round shape a button closes to while it works and once it is done.
  const ring = h;
  const rx = cx - ring / 2;
  b.stateful(id, l.parent, 'button', [x, y, w, h], (state) => {
    switch (state) {
      case 'hover':
        return {
          markup: `${rect(pal, x, y, w, h, r, secondary ? 'appSoft' : 'appDeep', BOX)}${edge('app')}${content(textRole)}`,
        };
      case 'pressed':
        return {
          markup: `${rect(pal, x + 3, y + 2, w - 6, h - 4, r, secondary ? 'appSoft' : 'appDeep', BOX)}${edge('appDeep')}${content(textRole)}`,
          box: [x + 3, y + 2, w - 6, h - 4],
        };
      case 'loading':
        return {
          markup: `${rect(pal, rx, y, ring, h, ring / 2, secondary ? 'appSoft' : 'app', BOX)}<g data-ui-spin="1"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="11" fill="none" ${paint(pal, secondary ? 'app' : 'appText', 'stroke')} stroke-width="3" stroke-dasharray="52 18" stroke-linecap="round"/></g>`,
          box: [rx, y, ring, h],
        };
      case 'success':
        return {
          markup: `${rect(pal, rx, y, ring, h, ring / 2, 'success', BOX)}${icon(pal, 'check', cx - 13, cy - 13, 26, 'appText', 3)}`,
          box: [rx, y, ring, h],
        };
      case 'disabled':
        return {
          markup: `${rect(pal, x, y, w, h, r, 'surface2', BOX)}${content('text3')}`,
        };
      default:
        return {
          markup: `${rect(pal, x, y, w, h, r, fillRole, BOX)}${edge('app')}${content(textRole)}`,
        };
    }
  });
  return y + h + 12;
}

/** A field: its fill, its placeholder, the words typed into it, its caret, and an outline for each state. */
function input(l: Lay, y: number, k: number, secret = false): number {
  const { b } = l;
  const pal = b.pal;
  const label = itemOf(b.spec, k, 2);
  const id = b.id(label ? `input-${slug(label) || k + 1}` : `input-${k + 1}`);
  const h = 54;
  const x = l.x;
  const w = l.w;
  const r = 14;
  const base = y + h / 2 + 6;
  const typed = b.spec.typed?.[id] ?? '';
  const place = label
    ? words(
        pal,
        x + 18,
        base,
        fitWords(label, w - 70, 16, 600),
        16,
        500,
        'text3',
      )
    : secret
      ? [0, 1, 2, 3, 4, 5]
          .map((n) => circle(pal, x + 24 + n * 15, y + h / 2, 4, 'text3'))
          .join('')
      : bar(pal, x + 18, y + h / 2 - 5, w * 0.38, 10, 'bar');
  const outlineOf = (role: UiRole, width: number) =>
    outline(pal, x, y, w, h, r, role, width, BOX);
  b.stateful(
    id,
    l.parent,
    'input',
    [x, y, w, h],
    (state) => {
      switch (state) {
        case 'focus':
          return { markup: `${outlineOf('app', 2.5)}` };
        case 'error':
          return {
            markup: `${outlineOf('error', 2.5)}${icon(pal, 'alert', x + w - 38, y + h / 2 - 11, 22, 'error')}${bar(pal, x + 4, y + h + 8, w * 0.42, 8, 'error')}`,
            box: [x, y, w, h + 16],
          };
        case 'success':
          return {
            markup: `${outlineOf('success', 2.5)}${icon(pal, 'check', x + w - 38, y + h / 2 - 11, 22, 'success', 2.6)}`,
          };
        default:
          return { markup: outlineOf('line', 1.5) };
      }
    },
    [
      {
        id: `${id}.field`,
        markup: rect(pal, x, y, w, h, r, 'surface2'),
        box: [x, y, w, h],
      },
      {
        id: `${id}.placeholder`,
        markup: place,
        box: [x + 18, y + h / 2 - 10, w * 0.5, 20],
        ...(typed ? { attrs: 'opacity="0"' } : {}),
      },
      {
        id: `${id}.text`,
        markup: `<text x="${f1(x + 18)}" y="${f1(base)}" font-size="16" font-weight="600" ${paint(pal, 'text')}>${esc(typed)}</text>`,
        box: [x + 18, y + h / 2 - 10, w - 60, 20],
        attrs: `data-ui-text="1" data-x="${f1(x + 18)}" data-size="16"${secret ? ' data-secret="1"' : ''}`,
      },
      {
        id: `${id}.caret`,
        markup: rect(pal, x + 18, y + h / 2 - 11, 2, 22, 1, 'app'),
        box: [x + 18, y + h / 2 - 11, 2, 22],
        attrs: 'opacity="0"',
      },
    ],
  );
  return y + h + 22;
}

/** A switch: its track in each state, its knob sliding between them. */
function toggleAt(
  b: Builder,
  parent: string,
  id: string,
  x: number,
  y: number,
): void {
  const pal = b.pal;
  const w = 51;
  const h = 31;
  const travel = w - h;
  const drawn = b.initial(id, UI_STATES.toggle!);
  const knobX = x + h / 2 + (drawn === 'on' ? travel : 0);
  b.stateful(
    id,
    parent,
    'toggle',
    [x, y, w, h],
    (state) => ({
      markup: rect(
        pal,
        x,
        y,
        w,
        h,
        h / 2,
        state === 'on' ? 'success' : 'track',
        BOX,
      ),
    }),
    [
      {
        id: `${id}.knob`,
        markup: `${circle(pal, knobX, y + h / 2 + 1.2, h / 2 - 2.2, 'shade', 'opacity="0.18"')}${circle(pal, knobX, y + h / 2, h / 2 - 2.5, 'knob')}`,
        box: [knobX - h / 2 + 2.5, y + 2.5, h - 5, h - 5],
        attrs: `data-travel="${travel}"`,
      },
    ],
    UI_STATES.toggle,
  );
}

/** A box to tick. */
function checkAt(
  b: Builder,
  parent: string,
  id: string,
  x: number,
  y: number,
): void {
  const pal = b.pal;
  const s = 24;
  b.stateful(id, parent, 'checkbox', [x, y, s, s], (state) => ({
    markup:
      state === 'on'
        ? `${rect(pal, x, y, s, s, 7, 'app', BOX)}${icon(pal, 'check', x + 2, y + 2, 20, 'appText', 3)}`
        : `${rect(pal, x, y, s, s, 7, 'bg', BOX)}${outline(pal, x + 1, y + 1, s - 2, s - 2, 6, 'line', 2)}`,
  }));
}

/** A slider: its track, the part filled to its value, its knob. */
function sliderAt(
  b: Builder,
  parent: string,
  id: string,
  x: number,
  y: number,
  w: number,
  value: number,
): void {
  const pal = b.pal;
  const given = Number(b.spec.initial?.[id]);
  const v = Number.isFinite(given) ? Math.max(0, Math.min(1, given)) : value;
  const h = 6;
  const cy = y + 14;
  const kx = x + v * w;
  b.add({
    id,
    parent,
    markup: '',
    box: [x - 14, y, w + 28, 28],
    kind: 'slider',
    value: v,
    attrs: `data-ui="slider" data-value="${r1(v * 1000) / 1000}"`,
  });
  b.add({
    id: `${id}.track`,
    parent: id,
    markup: rect(pal, x, cy - h / 2, w, h, h / 2, 'track'),
    box: [x, cy - h / 2, w, h],
  });
  b.add({
    id: `${id}.fill`,
    parent: id,
    markup: rect(pal, x, cy - h / 2, Math.max(h, v * w), h, h / 2, 'app'),
    box: [x, cy - h / 2, Math.max(h, v * w), h],
  });
  b.add({
    id: `${id}.knob`,
    parent: id,
    markup: `${circle(pal, kx, cy + 1.5, 13, 'shade', 'opacity="0.16"')}${circle(pal, kx, cy, 13, 'knob')}<circle cx="${f1(kx)}" cy="${f1(cy)}" r="13" fill="none" ${paint(pal, 'line', 'stroke')} stroke-width="1"/>`,
    box: [kx - 13, cy - 13, 26, 26],
  });
}

/** Rows of settings: a label and its control (a switch, a slider, a box to tick), in a rounded group. */
function settingRows(l: Lay, y: number, start = 0): number {
  const { b } = l;
  const pal = b.pal;
  const labels = (b.spec.items?.length ? b.spec.items : []).slice(
    start,
    start + 5,
  );
  const count = Math.max(labels.length, 3);
  const rowH = 58;
  const top = y;
  const group = b.id('settings');
  b.add({
    id: group,
    parent: l.parent,
    markup: `${rect(pal, l.x, top, l.w, rowH * count, 18, 'surface2')}`,
    box: [l.x, top, l.w, rowH * count],
  });
  for (let k = 0; k < count; k += 1) {
    const label = itemOf(b.spec, start + k, 3);
    const ry = top + k * rowH;
    const rowId = b.id(
      label ? `setting-${slug(label)}` : `setting-${start + k + 1}`,
    );
    const slider = label
      ? /bright|volume|size|speed|level|zoom|sound|font/i.test(label)
      : k === 2;
    const sep = k ? rect(pal, l.x + 16, ry, l.w - 32, 1, 0, 'line') : '';
    const iconName = label
      ? /dark|night|theme/i.test(label)
        ? 'moon'
        : /notif|alert/i.test(label)
          ? 'bell'
          : /bright|light/i.test(label)
            ? 'sun'
            : /wi-?fi|net/i.test(label)
              ? 'wifi'
              : /lock|privacy|secur/i.test(label)
                ? 'lock'
                : /mail/i.test(label)
                  ? 'mail'
                  : 'gear'
      : ['moon', 'bell', 'sun', 'lock', 'gear'][k % 5];
    const glyph = `${rect(pal, l.x + 14, ry + 14, 30, 30, 8, 'app')}${icon(pal, iconName, l.x + 18, ry + 18, 22, 'appText', 2)}`;
    const text = label
      ? words(
          pal,
          l.x + 56,
          ry + rowH / 2 + 6,
          fitWords(label, l.w * 0.5, 16, 600),
          16,
          600,
          'text',
        )
      : bar(
          pal,
          l.x + 56,
          ry + rowH / 2 - 5,
          96 + rnd(b.seed, k + 9) * 40,
          10,
          'bar',
        );
    b.add({
      id: rowId,
      parent: group,
      markup: sep + glyph + text,
      box: [l.x, ry, l.w, rowH],
    });
    const word = label ? slug(label).split('-')[0] : '';
    if (slider) {
      const sid = b.id(word ? `slider-${word}` : `slider-${start + k + 1}`);
      sliderAt(
        b,
        rowId,
        sid,
        l.x + l.w * 0.56,
        ry + rowH / 2 - 14,
        l.w * 0.38,
        0.35,
      );
    } else {
      const tid = b.id(word ? `toggle-${word}` : `toggle-${start + k + 1}`);
      toggleAt(b, rowId, tid, l.x + l.w - 51 - 14, ry + (rowH - 31) / 2);
    }
  }
  return top + rowH * count + 16;
}

/** List rows: a round picture or icon, two lines, a chevron; a highlight for each state. */
function listRows(l: Lay, y: number, count: number, start = 0): number {
  const { b } = l;
  const pal = b.pal;
  const rowH = 66;
  for (let k = 0; k < count; k += 1) {
    const ry = y + k * rowH;
    const id = b.id(`row-${k + 1}`);
    const label = itemOf(b.spec, start + k, 3);
    const text = label
      ? words(
          pal,
          l.x + 60,
          ry + 29,
          fitWords(label, l.w - 110, 16, 600),
          16,
          600,
          'text',
        )
      : bar(pal, l.x + 60, ry + 19, 110 + rnd(b.seed, k + 20) * 60, 10, 'bar');
    const content = `${circle(pal, l.x + 22, ry + rowH / 2, 21, 'appSoft')}${icon(pal, ['user', 'image', 'folder', 'mail', 'calendar', 'bell'][k % 6], l.x + 11, ry + rowH / 2 - 11, 22, 'app', 2)}${text}${bar(pal, l.x + 60, ry + 40, 80 + rnd(b.seed, k + 30) * 70, 8, 'bar')}${icon(pal, 'chevron', l.x + l.w - 24, ry + rowH / 2 - 10, 20, 'text3', 2)}${k < count - 1 ? rect(pal, l.x + 60, ry + rowH - 1, l.w - 60, 1, 0, 'line') : ''}`;
    b.stateful(
      id,
      l.parent,
      'row',
      [l.x - 8, ry + 3, l.w + 16, rowH - 6],
      (state) => ({
        markup:
          state === 'default'
            ? rect(
                pal,
                l.x - 8,
                ry + 3,
                l.w + 16,
                rowH - 6,
                14,
                'bg',
                `${BOX} opacity="0"`,
              )
            : state === 'hover'
              ? rect(
                  pal,
                  l.x - 8,
                  ry + 3,
                  l.w + 16,
                  rowH - 6,
                  14,
                  'surface2',
                  BOX,
                )
              : `${rect(pal, l.x - 8, ry + 3, l.w + 16, rowH - 6, 14, 'appSoft', BOX)}${rect(pal, l.x - 8, ry + 15, 4, rowH - 30, 2, 'app')}`,
      }),
      [
        {
          id: `${id}.content`,
          markup: content,
          box: [l.x - 8, ry + 3, l.w + 16, rowH - 6],
        },
      ],
    );
  }
  return y + count * rowH + 8;
}

/** A card: a picture over two lines, its shadow deeper as it lifts, an outline when chosen. */
function card(
  l: Lay,
  y: number,
  x: number,
  w: number,
  h: number,
  k: number,
): void {
  const { b } = l;
  const pal = b.pal;
  const id = b.id(`card-${k + 1}`);
  const pic = b.image(x, y, w, h * 0.62, 0);
  const clip = `card${k}${b.seed % 997}`;
  b.defs.push(
    `<clipPath id="${clip}"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="16"/></clipPath>`,
  );
  const label = itemOf(b.spec, k, 3);
  const content = `<g clip-path="url(#${clip})">${pic}</g>${
    label
      ? words(
          pal,
          x + 14,
          y + h * 0.62 + 28,
          fitWords(label, w - 28, 15, 700),
          15,
          700,
          'text',
        )
      : bar(pal, x + 14, y + h * 0.62 + 16, w * 0.6, 10, 'bar')
  }${bar(pal, x + 14, y + h * 0.62 + 40, w * 0.38, 8, 'bar')}`;
  b.stateful(
    id,
    l.parent,
    'card',
    [x, y, w, h],
    (state) => ({
      markup:
        state === 'hover'
          ? `${softShadow(pal, x, y - 3, w, h, 16, 18, 1.4)}${rect(pal, x, y - 3, w, h, 16, 'surface', BOX)}`
          : state === 'selected'
            ? `${softShadow(pal, x, y, w, h, 16, 10)}${rect(pal, x, y, w, h, 16, 'surface', BOX)}${outline(pal, x - 2, y - 2, w + 4, h + 4, 18, 'app', 3)}`
            : `${softShadow(pal, x, y, w, h, 16, 10)}${rect(pal, x, y, w, h, 16, 'surface', BOX)}`,
      ...(state === 'hover' ? { box: [x, y - 3, w, h] as ShotBox } : {}),
    }),
    [{ id: `${id}.content`, markup: content, box: [x, y, w, h] }],
  );
}

function cards(l: Lay, y: number, count = 2): number {
  const cols = l.w > 500 ? 3 : 2;
  const gap = 12;
  const w = (l.w - (cols - 1) * gap) / cols;
  const h = w * 1.18;
  for (let k = 0; k < count; k += 1)
    card(
      l,
      y + Math.floor(k / cols) * (h + gap),
      l.x + (k % cols) * (w + gap),
      w,
      h,
      k,
    );
  return y + Math.ceil(count / cols) * (h + gap) + 4;
}

function stats(l: Lay, y: number, count = 2): number {
  const { b } = l;
  const pal = b.pal;
  const gap = 12;
  const w = (l.w - (count - 1) * gap) / count;
  const h = 92;
  for (let k = 0; k < count; k += 1) {
    const x = l.x + k * (w + gap);
    const label = itemOf(b.spec, k, 2);
    b.add({
      id: b.id(`stat-${k + 1}`),
      parent: l.parent,
      markup: `${rect(pal, x, y, w, h, 16, 'surface2')}${
        label
          ? words(
              pal,
              x + 14,
              y + 26,
              fitWords(label, w - 28, 13, 600),
              13,
              600,
              'text2',
            )
          : bar(pal, x + 14, y + 16, w * 0.45, 8, 'bar')
      }${bar(pal, x + 14, y + 38, w * 0.55, 20, 'text')}${rect(pal, x + 14, y + 68, 46, 16, 8, k === 1 ? 'errorSoft' : 'successSoft')}${icon(pal, 'chart', x + 18, y + 69, 14, k === 1 ? 'error' : 'success', 2)}`,
      box: [x, y, w, h],
      kind: 'stat',
      attrs: 'data-ui="stat"',
    });
  }
  return y + h + 14;
}

/** A bar chart on a card: each bar a part that grows up from its foot (its value its share of the tallest). */
function barChart(l: Lay, y: number, x = l.x, w = l.w, h = 210): number {
  const { b } = l;
  const pal = b.pal;
  const id = b.id('chart');
  const n = w > 500 ? 9 : 7;
  const padX = 18;
  const top = y + 46;
  const foot = y + h - 30;
  const slot = (w - 2 * padX) / n;
  const bw = slot * 0.56;
  b.add({
    id,
    parent: l.parent,
    markup: `${rect(pal, x, y, w, h, 18, 'surface2')}${bar(pal, x + padX, y + 18, 96, 10, 'text3')}${rect(pal, x + padX, foot, w - 2 * padX, 1.5, 0, 'line')}`,
    box: [x, y, w, h],
    kind: 'chart',
    attrs: 'data-ui="chart"',
  });
  const values: number[] = [];
  for (let k = 0; k < n; k += 1) values.push(0.35 + 0.6 * rnd(b.seed + 77, k));
  const most = Math.max(...values);
  values.forEach((v, k) => {
    const bh = (foot - top) * (v / most);
    const bx = x + padX + k * slot + (slot - bw) / 2;
    const last = k === n - 1;
    b.add({
      id: `${id}.bar-${k + 1}`,
      parent: id,
      markup: rect(
        pal,
        bx,
        foot - bh,
        bw,
        bh,
        Math.min(6, bw / 2),
        last ? 'app' : 'appSoft',
      ),
      box: [r1(bx), r1(foot - bh), r1(bw), r1(bh)],
      pivot: [bx + bw / 2, foot],
      value: Math.round(v * 100),
    });
    b.add({
      id: `${id}.tick-${k + 1}`,
      parent: id,
      markup: bar(pal, bx + bw / 2 - 8, foot + 10, 16, 6, 'bar'),
      box: [bx + bw / 2 - 8, foot + 10, 16, 6],
    });
  });
  return y + h + 14;
}

/** A line chart on a card: its line a part with its path (for the draw recipe), a soft area under it. */
function lineChart(l: Lay, y: number, x = l.x, w = l.w, h = 190): number {
  const { b } = l;
  const pal = b.pal;
  const id = b.id('trend');
  const padX = 18;
  const top = y + 44;
  const foot = y + h - 22;
  const n = 8;
  const pts: Pt[] = [];
  for (let k = 0; k < n; k += 1) {
    const v = 0.25 + 0.6 * rnd(b.seed + 31, k) + (k / n) * 0.25;
    pts.push([
      x + padX + (k * (w - 2 * padX)) / (n - 1),
      foot - (foot - top) * Math.min(1, v),
    ]);
  }
  const d = pts
    .map((p, k) => `${k ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`)
    .join('');
  const area = `${d}L${f1(pts[n - 1][0])} ${f1(foot)}L${f1(pts[0][0])} ${f1(foot)}Z`;
  b.add({
    id,
    parent: l.parent,
    markup: `${rect(pal, x, y, w, h, 18, 'surface2')}${bar(pal, x + padX, y + 18, 86, 10, 'text3')}<path d="${area}" ${paint(pal, 'appSoft')}/>`,
    box: [x, y, w, h],
    kind: 'chart',
    attrs: 'data-ui="chart"',
  });
  b.add({
    id: `${id}.line`,
    parent: id,
    markup: `<path d="${d}" fill="none" ${paint(pal, 'app', 'stroke')} stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${circle(pal, pts[n - 1][0], pts[n - 1][1], 5, 'app')}`,
    box: [x + padX, top, w - 2 * padX, foot - top],
  });
  return y + h + 14;
}

/** A donut on a card: three arcs of the app's colour. */
function donut(l: Lay, y: number, x = l.x, w = l.w, h = 190): number {
  const { b } = l;
  const pal = b.pal;
  const id = b.id('donut');
  const r = Math.min(w * 0.3, (h - 60) / 2);
  const cx = x + w / 2;
  const cy = y + 34 + (h - 34) / 2;
  const c = 2 * Math.PI * r;
  const shares = [0.48, 0.3, 0.22];
  const roles: UiRole[] = ['app', 'appDeep', 'appSoft'];
  let at = 0;
  let arcs = '';
  shares.forEach((s, k) => {
    arcs += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" ${paint(pal, roles[k], 'stroke')} stroke-width="${f1(r * 0.36)}" stroke-dasharray="${f1(c * s - 3)} ${f1(c)}" stroke-dashoffset="${f1(-c * at)}" transform="rotate(-90 ${f1(cx)} ${f1(cy)})"/>`;
    at += s;
  });
  b.add({
    id,
    parent: l.parent,
    markup: `${rect(pal, x, y, w, h, 18, 'surface2')}${bar(pal, x + 18, y + 18, 70, 10, 'text3')}${arcs}${bar(pal, cx - 22, cy - 8, 44, 16, 'text')}`,
    box: [x, y, w, h],
    kind: 'chart',
    attrs: 'data-ui="chart"',
  });
  return y + h + 14;
}

function avatarAt(
  b: Builder,
  parent: string,
  id: string,
  cx: number,
  cy: number,
  r: number,
): void {
  const pal = b.pal;
  const head = r * 0.36;
  b.add({
    id,
    parent,
    markup: `${circle(pal, cx, cy, r, 'appSoft')}<g>${circle(pal, cx, cy - r * 0.18, head, 'app', 'opacity="0.75"')}<path d="M${f1(cx - r * 0.62)} ${f1(cy + r * 0.72)}C${f1(cx - r * 0.5)} ${f1(cy + r * 0.2)} ${f1(cx + r * 0.5)} ${f1(cy + r * 0.2)} ${f1(cx + r * 0.62)} ${f1(cy + r * 0.72)}Z" ${paint(pal, 'app')} opacity="0.75"/></g>`,
    box: [cx - r, cy - r, 2 * r, 2 * r],
    kind: 'image',
  });
}

function messages(l: Lay, y: number): number {
  const { b } = l;
  const pal = b.pal;
  let at = y;
  for (let k = 0; k < 5; k += 1) {
    const mine = k % 2 === 1;
    const label = itemOf(b.spec, k, 5);
    const text = label ? fitWords(label, l.w * 0.62, 15, 600) : '';
    const tw = text
      ? widthOf(text, 15, 600)
      : l.w * (0.32 + 0.3 * rnd(b.seed, k + 40));
    const w = tw + 32;
    const h = 42;
    const x = mine ? l.x + l.w - w : l.x;
    const id = b.id(`msg-${k + 1}`);
    b.add({
      id,
      parent: l.parent,
      markup: `${rect(pal, x, at, w, h, 20, mine ? 'app' : 'surface2')}${
        text
          ? words(
              pal,
              x + 16,
              at + 26,
              text,
              15,
              600,
              mine ? 'appText' : 'text',
            )
          : bar(pal, x + 16, at + 17, tw, 8, mine ? 'appText' : 'bar')
      }`,
      box: [x, at, w, h],
    });
    at += h + 10;
  }
  return at + 4;
}

function search(l: Lay, y: number): number {
  const { b } = l;
  const pal = b.pal;
  const id = b.id('search');
  const h = 46;
  const x = l.x;
  const w = l.w;
  const label = itemOf(b.spec, 5, 2);
  b.stateful(
    id,
    l.parent,
    'input',
    [x, y, w, h],
    (state) => ({
      markup:
        state === 'focus'
          ? outline(pal, x, y, w, h, h / 2, 'app', 2.5, BOX)
          : rect(pal, x, y, w, h, h / 2, 'surface2', `${BOX} opacity="0"`),
    }),
    [
      {
        id: `${id}.field`,
        markup: `${rect(pal, x, y, w, h, h / 2, 'surface2')}${icon(pal, 'search', x + 14, y + 11, 24, 'text3', 2.2)}`,
        box: [x, y, w, h],
      },
      {
        id: `${id}.placeholder`,
        markup: label
          ? words(pal, x + 48, y + h / 2 + 6, label, 16, 500, 'text3')
          : bar(pal, x + 48, y + h / 2 - 5, w * 0.36, 10, 'bar'),
        box: [x + 48, y + h / 2 - 10, w * 0.5, 20],
        ...(b.spec.typed?.[id] ? { attrs: 'opacity="0"' } : {}),
      },
      {
        id: `${id}.text`,
        markup: `<text x="${f1(x + 48)}" y="${f1(y + h / 2 + 6)}" font-size="16" font-weight="600" ${paint(pal, 'text')}>${esc(b.spec.typed?.[id] ?? '')}</text>`,
        box: [x + 48, y + h / 2 - 10, w - 70, 20],
        attrs: `data-ui-text="1" data-x="${f1(x + 48)}" data-size="16"`,
      },
      {
        id: `${id}.caret`,
        markup: rect(pal, x + 48, y + h / 2 - 11, 2, 22, 1, 'app'),
        box: [x + 48, y + h / 2 - 11, 2, 22],
        attrs: 'opacity="0"',
      },
    ],
  );
  return y + h + 16;
}

/** A like button: a heart that fills. */
function likeAt(
  b: Builder,
  parent: string,
  id: string,
  x: number,
  y: number,
): void {
  const pal = b.pal;
  b.stateful(id, parent, 'like', [x, y, 28, 28], (state) => ({
    markup:
      state === 'on'
        ? icon(pal, 'heartFill', x + 2, y + 2, 24, 'hot')
        : icon(pal, 'heart', x + 2, y + 2, 24, 'text', 2),
  }));
}

function post(l: Lay, y: number, k: number): number {
  const { b } = l;
  const pal = b.pal;
  const id = b.id(`post-${k + 1}`);
  const imgH = l.w * 0.82;
  b.add({ id, parent: l.parent, markup: '', box: [l.x, y, l.w, imgH + 120] });
  avatarAt(b, id, b.id(`avatar-${k + 1}`), l.x + 18, y + 22, 18);
  b.add({
    id: b.id(`post-${k + 1}-head`),
    parent: id,
    markup: `${bar(pal, l.x + 46, y + 12, 92, 9, 'text3')}${bar(pal, l.x + 46, y + 27, 56, 7, 'bar')}${icon(pal, 'more', l.x + l.w - 24, y + 10, 24, 'text3')}`,
    box: [l.x + 46, y + 12, l.w - 46, 22],
  });
  b.add({
    id: b.id(`image-${k + 1}`),
    parent: id,
    markup: b.image(l.x, y + 50, l.w, imgH, 16),
    box: [l.x, y + 50, l.w, imgH],
    kind: 'image',
  });
  const ay = y + 50 + imgH + 10;
  likeAt(b, id, b.id(`like-${k + 1}`), l.x, ay);
  b.add({
    id: b.id(`post-${k + 1}-actions`),
    parent: id,
    markup: `${icon(pal, 'comment', l.x + 40, ay + 2, 24, 'text', 2)}${icon(pal, 'share', l.x + 78, ay + 2, 24, 'text', 2)}${icon(pal, 'bookmark', l.x + l.w - 26, ay + 2, 24, 'text', 2)}${bar(pal, l.x, ay + 40, l.w * 0.8, 8, 'bar')}${bar(pal, l.x, ay + 56, l.w * 0.5, 8, 'bar')}`,
    box: [l.x + 40, ay, l.w - 40, 64],
  });
  return ay + 76;
}

/** The tab bar at a screen's foot: four tabs, the chosen one in the app's colour with a pill under its icon. */
function tabBar(
  b: Builder,
  parent: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pal = b.pal;
  const id = b.id('tabs');
  const glyphs = ['home', 'search', 'heart', 'user'];
  const n = 4;
  const slot = w / n;
  const drawn = b.initial(id, UI_STATES.tabs!);
  b.add({
    id,
    parent,
    markup: `${rect(pal, x, y, w, h, 0, 'bg')}${rect(pal, x, y, w, 1, 0, 'line')}`,
    box: [x, y, w, h],
    kind: 'tabs',
    states: UI_STATES.tabs,
    state: drawn,
    attrs: `data-ui="tabs" data-state="${drawn}" data-slot="${f1(slot)}"`,
  });
  const at = Number(drawn) - 1;
  b.add({
    id: `${id}.pill`,
    parent: id,
    markup: rect(
      pal,
      x + at * slot + slot / 2 - 28,
      y + 8,
      56,
      32,
      16,
      'appSoft',
    ),
    box: [x + at * slot + slot / 2 - 28, y + 8, 56, 32],
  });
  for (let k = 0; k < n; k += 1) {
    const cx = x + k * slot + slot / 2;
    const tid = `${id}.tab-${k + 1}`;
    b.add({
      id: tid,
      parent: id,
      markup: '',
      box: [cx - slot / 2, y, slot, h],
    });
    for (const on of [false, true])
      b.add({
        id: `${tid}@${on ? 'on' : 'off'}`,
        parent: tid,
        markup: `${icon(pal, glyphs[k], cx - 12, y + 12, 24, on ? 'app' : 'text3', 2.1)}${bar(pal, cx - 14, y + 46, 28, 6, on ? 'app' : 'bar')}`,
        box: [cx - 14, y + 12, 28, 40],
        attrs:
          (k === at) === on ? 'data-layer="1"' : 'data-layer="1" opacity="0"',
      });
  }
}

/** A dialog over the screen: a dimming scrim and a card that rises into place; hidden until it is swapped to shown. */
function modal(b: Builder, parent: string, area: ScreenArea): void {
  const pal = b.pal;
  const id = b.id('modal');
  const drawn = b.initial(id, UI_STATES.modal!);
  const w = Math.min(area.w - 48, 340);
  const h = 230;
  const x = area.x + (area.w - w) / 2;
  const y = area.y + area.h * 0.42 - h / 2;
  b.add({
    id,
    parent,
    markup: '',
    box: [x, y, w, h],
    kind: 'modal',
    states: UI_STATES.modal,
    state: drawn,
    attrs: `data-ui="modal" data-state="${drawn}"${drawn === 'hidden' ? ' opacity="0"' : ''}`,
  });
  b.add({
    id: `${id}.scrim`,
    parent: id,
    markup: rect(
      pal,
      area.x,
      area.y,
      area.w,
      area.h,
      0,
      'scrim',
      'opacity="0.42"',
    ),
    box: [area.x, area.y, area.w, area.h],
  });
  const title = b.spec.title ? fitWords(b.spec.title, w - 48, 19, 700) : '';
  const yes = b.spec.words
    ? fitWords(b.spec.words, (w - 58) / 2 - 16, 15, 700)
    : '';
  const bw = (w - 58) / 2;
  b.add({
    id: `${id}.card`,
    parent: id,
    markup: `${softShadow(pal, x, y, w, h, 22, 22, 1.6)}${rect(pal, x, y, w, h, 22, 'surface')}${circle(pal, x + w / 2, y + 42, 22, 'appSoft')}${icon(pal, 'bell', x + w / 2 - 12, y + 30, 24, 'app', 2.2)}${
      title
        ? words(pal, x + w / 2, y + 96, title, 19, 700, 'text', 'middle')
        : bar(pal, x + w / 2 - 70, y + 84, 140, 14, 'text3')
    }${bar(pal, x + 32, y + 116, w - 64, 8, 'bar')}${bar(pal, x + 52, y + 132, w - 104, 8, 'bar')}${rect(pal, x + 22, y + h - 66, bw, 46, 14, 'surface2')}${bar(pal, x + 22 + bw / 2 - 26, y + h - 48, 52, 10, 'text3')}${rect(pal, x + 36 + bw, y + h - 66, bw, 46, 14, 'app')}${
      yes
        ? words(
            pal,
            x + 36 + bw * 1.5,
            y + h - 37,
            yes,
            15,
            700,
            'appText',
            'middle',
          )
        : bar(pal, x + 36 + bw * 1.5 - 26, y + h - 48, 52, 10, 'appText')
    }`,
    box: [x, y, w, h],
    pivot: [x + w / 2, y + h / 2],
  });
}

/** A notice that slides down from the top; hidden until it is swapped to shown. */
function toast(b: Builder, parent: string, area: ScreenArea): void {
  const pal = b.pal;
  const id = b.id('toast');
  const drawn = b.initial(id, UI_STATES.toast!);
  const w = Math.min(area.w - 40, 330);
  const h = 56;
  const x = area.x + (area.w - w) / 2;
  const y = area.y + area.status + 8;
  const said = b.spec.words ? fitWords(b.spec.words, w - 84, 15, 700) : '';
  b.add({
    id,
    parent,
    markup: `${softShadow(pal, x, y, w, h, h / 2, 16, 1.5)}${rect(pal, x, y, w, h, h / 2, 'text')}${circle(pal, x + 28, y + h / 2, 15, 'success')}${icon(pal, 'check', x + 18, y + h / 2 - 10, 20, 'appText', 2.8)}${
      said
        ? words(pal, x + 54, y + h / 2 + 5, said, 15, 700, 'bg')
        : bar(pal, x + 54, y + h / 2 - 5, w * 0.5, 10, 'bg')
    }`,
    box: [x, y, w, h],
    kind: 'toast',
    states: UI_STATES.toast,
    state: drawn,
    attrs: `data-ui="toast" data-state="${drawn}"${drawn === 'hidden' ? ' opacity="0"' : ''}`,
  });
}

/** An on-screen keyboard: rows of blank keys (no script's letters), sliding up from the foot. */
function keyboard(b: Builder, parent: string, area: ScreenArea): void {
  const pal = b.pal;
  const id = b.id('keyboard');
  const drawn = b.initial(id, UI_STATES.keyboard!);
  const h = Math.min(area.h * 0.36, 300);
  const x = area.x;
  const y = area.y + area.h - h;
  const w = area.w;
  let keys = '';
  const rows = [10, 9, 7];
  const kw = (w - 16) / 10;
  rows.forEach((count, k) => {
    const left = x + 8 + ((10 - count) * kw) / 2;
    for (let n = 0; n < count; n += 1)
      keys += rect(
        pal,
        left + n * kw + 3,
        y + 14 + k * 54,
        kw - 6,
        44,
        7,
        'key',
      );
  });
  keys += rect(pal, x + 8 + kw * 2.5, y + 14 + 3 * 54, kw * 5, 44, 7, 'key');
  b.add({
    id,
    parent,
    markup: `${rect(pal, x, y, w, h, 0, 'surface2')}${keys}`,
    box: [x, y, w, h],
    kind: 'keyboard',
    states: UI_STATES.keyboard,
    state: drawn,
    attrs: `data-ui="keyboard" data-state="${drawn}"${drawn === 'hidden' ? ' opacity="0"' : ''}`,
  });
}

// ── Screens ───────────────────────────────────────────────────────────────

/** Each kind of screen as pieces from the top, for a phone's column. */
const SCREEN_PIECES: Record<UiScreen, UiPiece[]> = {
  product: [
    'image',
    'badge',
    'title',
    'rating',
    'body',
    'chips',
    'price',
    'button',
  ],
  settings: ['nav', 'header', 'toggle', 'rows'],
  login: ['avatar', 'header', 'body', 'input', 'input', 'checkbox', 'button'],
  dashboard: ['header', 'stats', 'chart', 'rows', 'tabs'],
  feed: ['nav', 'card', 'tabs'],
  chat: ['nav', 'messages', 'input'],
  checkout: ['nav', 'header', 'rows', 'price', 'button'],
  article: ['nav', 'title', 'body', 'image', 'body'],
  list: ['header', 'search', 'rows', 'tabs'],
  profile: ['image', 'avatar', 'title', 'stats', 'button', 'card', 'tabs'],
  player: ['nav', 'image', 'title', 'body', 'slider', 'button'],
};

/** The pieces a screen is built of: the board's own list, else its kind's. */
export function piecesOf(
  spec: Pick<ScreenSpec, 'screen' | 'pieces'>,
): UiPiece[] {
  return spec.pieces?.length ? spec.pieces : SCREEN_PIECES[spec.screen];
}

/**
 * A phone's (or a tablet's, or a window's centred column's) screen: the
 * pieces stacked from the top in a scrolling content group, a tab bar and
 * the overlays fixed over it.
 */
function column(
  b: Builder,
  area: ScreenArea,
  root: string,
  gap = 0,
): { most: number; end: number } {
  const pal = b.pal;
  const spec = b.spec;
  const pieces = piecesOf(spec);
  const wide = area.form !== 'phone';
  const colW = wide ? Math.min(area.w - 2 * 48, 620) : area.w - 2 * M;
  const x = area.x + (area.w - colW) / 2;
  const content = 'content';
  b.add({
    id: content,
    parent: root,
    markup: span(area),
    box: [area.x, area.y, area.w, area.h],
    kind: 'scroll',
    attrs: `data-ui="scroll" data-scroll="${f1(spec.scrolled ?? 0)}"${spec.scrolled ? ` transform="translate(0 ${f1(-spec.scrolled)})"` : ''}`,
  });
  const l: Lay = { b, parent: content, x, w: colW };
  const tabs = pieces.includes('tabs');
  const tabH = tabs ? 64 + area.foot : 0;
  const heroFirst = pieces[0] === 'image' && !wide;
  let y = area.y + (heroFirst ? 0 : area.status + 6);
  let inputs = 0;
  let toggles = 0;
  let k = 0;
  for (const piece of pieces) {
    switch (piece) {
      case 'nav':
        // A desktop window has its own bar: no back arrow in it.
        if (!wide) y = navBar(l, y);
        break;
      case 'header':
        y = header(l, y);
        break;
      case 'search':
        y = search(l, y);
        break;
      case 'image': {
        const hero = k === 0 && !wide;
        const h = hero ? Math.round(area.h * 0.4) : colW * 0.56;
        const ix = hero ? area.x : x;
        const iw = hero ? area.w : colW;
        b.add({
          id: b.id('image'),
          parent: content,
          markup: b.image(ix, y, iw, h, hero ? 0 : 18),
          box: [ix, y, iw, h],
          kind: 'image',
        });
        if (hero) navBar({ ...l }, area.y + area.status - 4, true);
        y += h + 16;
        break;
      }
      case 'title':
        y = titleRow(l, y);
        break;
      case 'badge':
        y = metaRow(l, y);
        break;
      case 'rating':
        y = ratingRow(l, y);
        break;
      case 'body':
        y = bodyLines(
          l,
          y,
          spec.screen === 'login'
            ? 2
            : pieces.filter((p) => p === 'body').length > 1
              ? 5
              : 3,
        );
        break;
      case 'chips':
        y = chips(l, y);
        break;
      case 'price':
        y = priceRow(l, y);
        break;
      case 'button':
        y = button(l, y);
        break;
      case 'button-secondary':
        y = button(l, y - 4, true);
        break;
      case 'input': {
        if (spec.screen === 'chat' && !spec.pieces?.length) {
          composer(b, root, area);
          break;
        }
        const secret =
          spec.screen === 'login' && inputs === 1 && !itemOf(spec, 1);
        y = input(l, y, inputs, secret);
        inputs += 1;
        break;
      }
      case 'toggle':
        y = settingRows(l, y, toggles);
        toggles += 3;
        break;
      case 'slider': {
        const label = itemOf(spec, 0);
        const sid = b.id(
          label ? `slider-${slug(label).split('-')[0]}` : 'slider-1',
        );
        sliderAt(b, content, sid, x + 14, y + 4, colW - 28, 0.3);
        y += 44;
        break;
      }
      case 'checkbox': {
        const label = itemOf(spec, 2);
        const id = b.id(
          label ? `check-${slug(label).split('-')[0]}` : 'check-1',
        );
        checkAt(b, content, id, x, y + 2);
        b.add({
          id: b.id('check-label'),
          parent: content,
          markup: label
            ? words(
                pal,
                x + 36,
                y + 20,
                fitWords(label, colW - 40, 15, 600),
                15,
                600,
                'text2',
              )
            : bar(pal, x + 36, y + 10, 110, 9, 'bar'),
          box: [x + 36, y + 6, colW * 0.5, 18],
        });
        y += 40;
        break;
      }
      case 'rows':
        y =
          spec.screen === 'settings'
            ? settingRows(l, y, toggles + 0)
            : listRows(
                l,
                y,
                spec.screen === 'dashboard'
                  ? 2
                  : spec.screen === 'checkout'
                    ? 3
                    : 4,
                spec.screen === 'dashboard' ? 2 : toggles,
              );
        break;
      case 'card':
        if (spec.screen === 'feed') {
          y = post(l, y, 0);
          y = post(l, y, 1);
        } else y = cards(l, y, spec.screen === 'profile' ? 2 : 2);
        break;
      case 'stats':
        y = stats(l, y, colW > 500 ? 3 : 2);
        break;
      case 'chart':
        y = barChart(l, y);
        break;
      case 'chart-line':
        y = lineChart(l, y);
        break;
      case 'donut':
        y = donut(l, y);
        break;
      case 'avatar': {
        const r = spec.screen === 'profile' ? 46 : 34;
        const cy = spec.screen === 'profile' ? y - r * 0.9 : y + r + 8;
        avatarAt(b, content, b.id('avatar'), area.x + area.w / 2, cy, r);
        y = spec.screen === 'profile' ? cy + r + 14 : cy + r + 18;
        break;
      }
      case 'messages':
        y = messages(l, y);
        break;
      case 'tabs':
      case 'modal':
      case 'toast':
      case 'keyboard':
        k += 1;
        continue;
    }
    if (piece !== 'image' || k > 0 || wide) y += gap;
    k += 1;
  }
  // The fixed pieces over the content: the tab bar at the foot, then the overlays.
  if (tabs) tabBar(b, root, area.x, area.y + area.h - tabH, area.w, tabH);
  if (pieces.includes('modal')) modal(b, root, area);
  if (pieces.includes('toast')) toast(b, root, area);
  if (pieces.includes('keyboard')) keyboard(b, root, area);
  const reach = y + 24 + tabH;
  return {
    most: Math.max(0, Math.round(reach - (area.y + area.h))),
    end: y + tabH,
  };
}

/** A conversation's typing box at the screen's foot, and its send button. */
function composer(b: Builder, root: string, area: ScreenArea): void {
  const pal = b.pal;
  const h = 48;
  const y = area.y + area.h - area.foot - h - 10;
  const x = area.x + M;
  const w = area.w - 2 * M - h - 10;
  input({ b, parent: root, x, w }, y, 9);
  const id = b.id('btn-send');
  const sx = x + w + 10;
  b.stateful(id, root, 'button', [sx, y, h + 6, h + 6], (state) => ({
    markup: `${rect(pal, sx, y, h + 6, h + 6, (h + 6) / 2, state === 'pressed' ? 'appDeep' : state === 'disabled' ? 'surface2' : 'app', BOX)}${icon(pal, 'send', sx + 14, y + 15, 24, 'appText', 2.2)}`,
  }));
}

/** A wide window's dashboard: a sidebar, a header, figures, a chart beside a donut, a list. */
function dashboardWide(b: Builder, area: ScreenArea, root: string): number {
  const pal = b.pal;
  const side = Math.min(232, area.w * 0.2);
  const content = 'content';
  b.add({
    id: content,
    parent: root,
    markup: span(area),
    box: [area.x, area.y, area.w, area.h],
    kind: 'scroll',
    attrs: `data-ui="scroll" data-scroll="${f1(b.spec.scrolled ?? 0)}"`,
  });
  // The sidebar: the app's mark, then its sections, the first chosen.
  const sb = 'sidebar';
  b.add({
    id: sb,
    parent: root,
    markup: `${rect(pal, area.x, area.y, side, area.h, 0, 'surface2')}${rect(pal, area.x + 22, area.y + 24, 32, 32, 9, 'app')}${icon(pal, 'bolt', area.x + 27, area.y + 29, 22, 'appText')}${bar(pal, area.x + 64, area.y + 35, 72, 11, 'text3')}`,
    box: [area.x, area.y, side, area.h],
  });
  const glyphs = ['home', 'chart', 'folder', 'calendar', 'mail', 'gear'];
  for (let k = 0; k < 6; k += 1) {
    const ry = area.y + 86 + k * 46;
    const id = b.id(`menu-${k + 1}`);
    const label = undefined as string | undefined;
    b.stateful(
      id,
      sb,
      'row',
      [area.x + 12, ry, side - 24, 38],
      (state) => ({
        markup:
          state === 'default'
            ? rect(
                pal,
                area.x + 12,
                ry,
                side - 24,
                38,
                10,
                'surface2',
                `${BOX} opacity="0"`,
              )
            : rect(
                pal,
                area.x + 12,
                ry,
                side - 24,
                38,
                10,
                state === 'selected' ? 'appSoft' : 'line',
                BOX,
              ),
      }),
      [
        {
          id: `${id}.content`,
          markup: `${icon(pal, glyphs[k], area.x + 24, ry + 8, 22, k === 0 ? 'app' : 'text2', 2)}${
            label
              ? words(
                  pal,
                  area.x + 56,
                  ry + 24,
                  fitWords(label, side - 80, 14, 600),
                  14,
                  600,
                  k === 0 ? 'app' : 'text2',
                )
              : bar(
                  pal,
                  area.x + 56,
                  ry + 15,
                  70 + rnd(b.seed, k) * 40,
                  8,
                  k === 0 ? 'app' : 'bar',
                )
          }`,
          box: [area.x + 12, ry, side - 24, 38],
        },
      ],
      UI_STATES.row,
      '',
      // The first section shows as chosen.
      k === 0 ? 'selected' : 'default',
    );
  }
  const x = area.x + side + 32;
  const w = area.w - side - 64;
  const l: Lay = { b, parent: content, x, w };
  // The header: the title, a search box, a round picture.
  const title = b.spec.title ? fitWords(b.spec.title, w * 0.45, 28, 700) : '';
  b.add({
    id: b.id('header'),
    parent: content,
    markup: title
      ? words(
          pal,
          x,
          area.y + 58,
          title,
          28,
          800,
          'text',
          'start',
          'letter-spacing="-0.3"',
        )
      : bar(pal, x, area.y + 38, 180, 20, 'text3'),
    box: title
      ? wordsBox(x, area.y + 58, title, 28, 700)
      : [x, area.y + 38, 180, 20],
  });
  search({ ...l, x: x + w - 330, w: 270 }, area.y + 26);
  avatarAt(b, content, b.id('avatar'), x + w - 22, area.y + 49, 22);
  let y = area.y + 96;
  y = stats({ ...l }, y, 3);
  const cw = (w - 16) * 0.64;
  barChart(l, y, x, cw, 260);
  donut(l, y, x + cw + 16, w - cw - 16, 260);
  y += 274;
  y = listRows(l, y, 3, 3);
  return Math.max(0, Math.round(y - (area.y + area.h)));
}

/** A wide window's product page: the picture beside its details. */
function productWide(b: Builder, area: ScreenArea, root: string): number {
  const content = 'content';
  b.add({
    id: content,
    parent: root,
    markup: span(area),
    box: [area.x, area.y, area.w, area.h],
    kind: 'scroll',
    attrs: `data-ui="scroll" data-scroll="${f1(b.spec.scrolled ?? 0)}"`,
  });
  const pad = 48;
  const iw = (area.w - 3 * pad) * 0.5;
  const ih = Math.min(area.h - 2 * pad, iw * 1.05);
  b.add({
    id: b.id('image'),
    parent: content,
    markup: b.image(area.x + pad, area.y + pad, iw, ih, 22),
    box: [area.x + pad, area.y + pad, iw, ih],
    kind: 'image',
  });
  const x = area.x + 2 * pad + iw;
  const w = area.w - 3 * pad - iw;
  const l: Lay = { b, parent: content, x, w };
  let y = area.y + pad + 4;
  y = metaRow(l, y);
  y = titleRow(l, y, 30);
  y = ratingRow(l, y);
  y = bodyLines(l, y, 4);
  y = chips(l, y + 4);
  y = priceRow(l, y + 4);
  y = button(l, y + 6);
  return Math.max(0, Math.round(y - (area.y + area.h)));
}

/** A watch's face: a ring of progress, a figure's place, one button. */
function watchFace(b: Builder, area: ScreenArea, root: string): number {
  const pal = b.pal;
  const content = 'content';
  b.add({
    id: content,
    parent: root,
    markup: span(area),
    box: [area.x, area.y, area.w, area.h],
    kind: 'scroll',
    attrs: 'data-ui="scroll" data-scroll="0"',
  });
  const cx = area.x + area.w / 2;
  const r = area.w * 0.27;
  const cy = area.y + area.h * 0.38;
  const c = 2 * Math.PI * r;
  b.add({
    id: b.id('ring'),
    parent: content,
    markup: `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" ${paint(pal, 'appSoft', 'stroke')} stroke-width="14"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" ${paint(pal, 'app', 'stroke')} stroke-width="14" stroke-linecap="round" stroke-dasharray="${f1(c * 0.68)} ${f1(c)}" transform="rotate(-90 ${f1(cx)} ${f1(cy)})"/>${bar(pal, cx - 20, cy - 7, 40, 14, 'text')}`,
    box: [cx - r - 7, cy - r - 7, 2 * r + 14, 2 * r + 14],
    kind: 'chart',
    attrs: 'data-ui="chart"',
  });
  const title = b.spec.title
    ? fitWords(b.spec.title, area.w - 40, 15, 700)
    : '';
  b.add({
    id: b.id('title'),
    parent: content,
    markup: title
      ? words(pal, cx, area.y + area.h * 0.7, title, 15, 700, 'text', 'middle')
      : bar(pal, cx - 40, area.y + area.h * 0.66, 80, 10, 'text3'),
    box: [cx - area.w / 2 + 20, area.y + area.h * 0.62, area.w - 40, 18],
  });
  button(
    { b, parent: content, x: area.x + 24, w: area.w - 48 },
    area.y + area.h * 0.76,
  );
  return 0;
}

/**
 * A screen drawn into its area: its background (the `screen` part, which
 * turns dark and light), its content as the spec and the form say, the
 * status strip over it. Returns the parts under `root` and the defs.
 */
export function drawScreen(
  pal: UiPalette,
  spec: ScreenSpec,
  area: ScreenArea,
  root: string,
  seed: number,
): ScreenDrawing {
  const b = new Builder(pal, spec, area, seed);
  for (const id of ['device', 'bezel', 'screen', 'content', 'status', 'island'])
    b.id(id);
  b.add({
    id: root,
    parent: 'device',
    markup: rect(pal, area.x, area.y, area.w, area.h, area.r, 'bg'),
    box: [area.x, area.y, area.w, area.h],
    kind: 'screen',
    states: UI_STATES.screen,
    state: pal.theme,
    attrs: `data-ui="screen" data-state="${pal.theme}"`,
  });
  let most = 0;
  if (area.form === 'watch') most = watchFace(b, area, root);
  else if (
    area.form === 'wide' &&
    spec.screen === 'dashboard' &&
    !spec.pieces?.length
  )
    most = dashboardWide(b, area, root);
  else if (
    area.form === 'wide' &&
    spec.screen === 'product' &&
    !spec.pieces?.length
  )
    most = productWide(b, area, root);
  else {
    // Measured once on a scratch builder, then drawn with the room left shared between the pieces.
    const trial = new Builder(pal, spec, area, seed);
    for (const id of [
      'device',
      'bezel',
      'screen',
      'content',
      'status',
      'island',
    ])
      trial.id(id);
    const { end } = column(trial, area, root);
    const pieces = piecesOf(spec).filter(
      (p) => !['tabs', 'modal', 'toast', 'keyboard'].includes(p),
    ).length;
    const room = area.y + area.h - area.foot - 16 - end;
    const gap =
      room > 0 && area.form !== 'wide'
        ? Math.min(area.form === 'tablet' ? 40 : 22, room / Math.max(1, pieces))
        : 0;
    most = column(b, area, root, gap).most;
  }
  if (area.status > 0) {
    // The status strip: a short bar for the time, the signal, the battery; no clock face, no carrier, no brand.
    const sy = area.y + area.status / 2 + 2;
    const right = area.x + area.w - 30;
    let marks = bar(pal, area.x + 34, sy - 6, 34, 12, 'text');
    for (let k = 0; k < 4; k += 1)
      marks += rect(
        pal,
        right - 62 + k * 5.5,
        sy + 4 - (4 + k * 2.5),
        3.6,
        4 + k * 2.5,
        1,
        'text',
      );
    marks += icon(pal, 'wifi', right - 38, sy - 8, 16, 'text', 2.2);
    marks += `${outline(pal, right - 16, sy - 6, 25, 12, 4, 'text', 1.3)}${rect(pal, right - 13.5, sy - 3.5, 17, 7, 2, 'text')}`;
    b.add({
      id: 'status',
      parent: root,
      markup: marks,
      box: [area.x, area.y, area.w, area.status],
    });
  }
  return { parts: b.parts, defs: b.defs.join(''), scrollMost: most };
}

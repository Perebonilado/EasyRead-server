/**
 * The UI kit on the shots (explainer-animation-tech §11, WP18): a shot on
 * the desk built into its devices and its cursor, and a scene's cursor
 * moves timed into the changes they make.
 *
 * Building (buildUi): the shot's devices stand side by side on the desk
 * (kit/ui placeDevices), each drawn in the state the shot before left it
 * in, so one device carries on across shots and never cuts; the cursor
 * starts where the last shot's left it. Every move a cursor makes is made
 * explicit here, so nothing later guesses: a click on a switch says which
 * way it goes, a drag says the slider's value, a scroll how far, a type
 * the words.
 *
 * Timing (uiTimed, after the voice has timed the shots): the cursor gets
 * to what it acts on in its own time (an approach before a click, a drag,
 * a type, as long as the distance takes), and each action makes its
 * change at the moment it presses: a swap of the part's state at the
 * click's press, a slider's glide during the drag, the content's scroll,
 * the words typed after the field takes focus. Callouts are numbered in
 * the order they come on in each run of shots, and a frost join's next
 * shot gets its chapter's number. The client mirrors the press and the
 * hot spot (lib/shots/ui-cursor.ts), so the change lands under the tip.
 */
import type {
  FilmShape,
  ShotActorDto,
  ShotAssetDto,
  ShotBox,
  ShotDto,
  ShotInfoDto,
  ShotLookDto,
  ShotMoveDto,
  ShotSvgAssetDto,
  ShotTargetDto,
} from '../../../contracts';
import { toAsset } from '../kit/rig';
import { kitStyle } from '../kit/style';
import {
  CURSOR_MOVES,
  boxOnDesk,
  cursorFeet,
  cursorMove,
  cursorRest,
  cursorSize,
  deviceFor,
  deviceOf,
  isUiDevice,
  isUiKit,
  makeCursor,
  placeDevices,
  uiDesk,
  uiLookOf,
  uiTargetIn,
  type UiCarried,
  type UiDeviceMade,
  type UiPlaced,
} from '../kit/ui';
import {
  SETTLE_LEAD_MS,
  type UntimedActor,
  type UntimedMove,
} from './shot-time';
import type { PlanActor, PlanShot } from './types';

// ── The press and the hot spot (mirrored by the client) ───────────────────

/** A click's press: the cursor scales down and back in this long, and the part it presses changes as it starts. */
export const PRESS_MS = 90;
/** A beat between arriving and pressing, as a hand settles before it clicks. */
export const SETTLE_MS = 60;

/** How long the cursor takes to cross the frame at most and at least. */
export const TRAVEL_MS = { least: 240, most: 700 } as const;
/** A letter typed, on average (each a little more or less, seeded on the client). */
export const LETTER_MS = 62;
/** A part's change, by its kind: a content's swap behind its blur, a switch's slide, a dialog's rise, a screen turning dark. */
export const SWAP_MS: Readonly<Record<string, number>> = {
  button: 180,
  card: 200,
  row: 180,
  chip: 180,
  input: 180,
  like: 220,
  toggle: 220,
  checkbox: 200,
  tabs: 260,
  modal: 360,
  toast: 360,
  keyboard: 360,
  screen: 520,
  scroll: 700,
};

/** A part's kind by its id, as the kit names its parts (the client reads the same). */
export function kindOfPart(id: string): string {
  // A part inside another (a knob, a chart's bar) is of its holder's kind.
  const bare = id.split('.')[0];
  if (id === 'screen') return 'screen';
  if (id === 'content') return 'scroll';
  if (/^tabs(\.tab-\d+)?$/.test(id)) return 'tabs';
  if (bare === 'search' || /^search-\d+$/.test(bare)) return 'input';
  const prefix = bare.split('-')[0];
  return (
    (
      {
        btn: 'button',
        toggle: 'toggle',
        slider: 'slider',
        input: 'input',
        check: 'checkbox',
        card: 'card',
        row: 'row',
        menu: 'row',
        chip: 'chip',
        like: 'like',
        modal: 'modal',
        toast: 'toast',
        keyboard: 'keyboard',
        chart: 'chart',
        trend: 'chart',
        donut: 'chart',
        stat: 'stat',
      } as Record<string, string>
    )[prefix] ?? 'part'
  );
}

/**
 * Where the cursor's tip goes on a part (desk units): a little right of
 * and below a button's middle, as a hand clicks; a field near its start;
 * a switch's middle; a slider's knob where its value puts it.
 */
export function hotSpot(
  kind: string,
  box: ShotBox,
  value?: number,
): [number, number] {
  const r = (n: number) => Math.round(n * 10) / 10;
  const [x, y, w, h] = box;
  const [px, py] = spotIn(kind, x, y, w, h, value);
  return [r(px), r(py)];
}

function spotIn(
  kind: string,
  x: number,
  y: number,
  w: number,
  h: number,
  value?: number,
): [number, number] {
  switch (kind) {
    case 'slider':
      return [x + w * (value ?? 0.5), y + h / 2];
    case 'input':
      return [x + w * 0.24, y + h * 0.56];
    case 'toggle':
    case 'checkbox':
    case 'like':
      return [x + w * 0.5, y + h * 0.56];
    case 'button':
    case 'card':
    case 'row':
    case 'chip':
    case 'tabs':
      return [x + w * 0.58, y + h * 0.6];
    default:
      return [x + w * 0.5, y + h * 0.5];
  }
}

/** How long the cursor takes to go a distance, for a desk this wide. */
export function travelMs(distance: number, deskShort: number): number {
  const across = distance / Math.max(1, deskShort);
  return Math.round(
    Math.max(TRAVEL_MS.least, Math.min(TRAVEL_MS.most, 220 + 520 * across)),
  );
}

/**
 * A cursor move's own length before the voice times it: a click is its
 * press (so it lands just before its word); a drag, a scroll and typing
 * are as long as they take (and start on their word, uiTimed); a move
 * to a part is worked out from its distance once it is timed.
 */
export function ownMs(move: string, state?: string): number {
  switch (move) {
    case 'click':
      return PRESS_MS;
    case 'drag':
      return 900;
    case 'scroll':
      return SWAP_MS.scroll;
    case 'type':
      return PRESS_MS + 160 + [...(state ?? '')].length * LETTER_MS;
    default:
      return 450;
  }
}

/** The moves that are a process, not a change: they start on their word (shot-time's STARTS_ON_WORD for recipes). */
const ON_WORD = new Set(['drag', 'scroll', 'type']);

/** How far before its word a process starts: a beat, so the hand is moving as the word is said. */
const ON_WORD_LEAD_MS = 150;

/** A switch's way after a click: the other one. */
const OTHER: Readonly<Record<string, string>> = { on: 'off', off: 'on' };

// ── Building a shot's devices and cursor ──────────────────────────────────

/** A device of the shot on the desk: its actor, its kit, how it is made and placed. */
export interface UiDeviceOnDesk {
  id: string;
  kit: string;
  params: Readonly<Record<string, unknown>>;
  asset: string;
  made: UiDeviceMade;
  placed: UiPlaced;
}

/** What a scene's devices and cursor are left in from shot to shot, by actor id. */
export interface UiCarry {
  devices: Map<string, UiCarried>;
  cursor: Map<string, [number, number]>;
}

export const newUiCarry = (): UiCarry => ({
  devices: new Map(),
  cursor: new Map(),
});

/** A shot's devices and cursor built. */
export interface UiBuilt {
  actors: UntimedActor[];
  assets: Record<string, ShotSvgAssetDto>;
  devices: UiDeviceOnDesk[];
  notes: string[];
  /** A device's part as a target of this shot; null when none of its devices has it. */
  target(name: string): ShotTargetDto | null;
  /** A target's box on the desk, for the camera: a device's part, a device whole. */
  boxOf(target: ShotTargetDto): ShotBox | null;
  /** What the shot is about when the plan names nothing: a device's screen, or both devices of a before and an after. */
  focus: ShotTargetDto | null;
}

/** The desk's asset for a shape, in the show's paper and accent. */
export function deskAsset(
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto {
  return uiDesk(
    { paper: look.palette.paper, accent: look.palette.accent },
    shape,
  );
}

/** A string's FNV-1a hash, for seeds and asset ids. */
const hashOf = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * A shot's UI actors built: its devices placed side by side and drawn as
 * the scene's earlier shots left them; its cursor where it was, its moves
 * each made explicit; what the shot leaves them in kept for the next.
 * Other actors are not this module's (null when the shot has no UI).
 */
export function buildUi(
  planned: PlanShot,
  i: number,
  ctx: { look: ShotLookDto; shape: FilmShape; seed: string; carry: UiCarry },
): UiBuilt | null {
  const ui = (planned.actors ?? []).filter((a) => isUiKit(a.kit));
  if (!ui.length) return null;
  const notes: string[] = [];
  const style = kitStyle(ctx.look, { shape: ctx.shape });
  const look = uiLookOf(style);
  const assets: Record<string, ShotSvgAssetDto> = {};
  const devicesPlanned = ui.filter((a) => isUiDevice(a.kit) && deviceOf(a.kit));
  const made = devicesPlanned.map((a) => {
    const params = (a.params ?? {}) as Record<string, unknown>;
    const carried = ctx.carry.devices.get(a.id) ?? {};
    const one = deviceFor(
      a.kit,
      params,
      look,
      hashOf(`${ctx.seed}:${a.id}`),
      carried,
    )!;
    return { a, params, made: one };
  });
  const placed = placeDevices(
    made.map((m) => ({ device: deviceOf(m.a.kit)!, box: m.made.piece.box })),
    ctx.shape,
  );
  const devices: UiDeviceOnDesk[] = made.map((m, k) => {
    const dto = toAsset(m.made.piece);
    const asset = `ui-${hashOf(dto.svg).toString(36)}`;
    assets[asset] = dto;
    return {
      id: m.a.id,
      kit: m.a.kit,
      params: m.params,
      asset,
      made: m.made,
      placed: placed[k],
    };
  });
  const refs = devices.map((d) => ({ id: d.id, kit: d.kit, params: d.params }));
  const target = (name: string): ShotTargetDto | null => {
    const found = uiTargetIn(refs, name);
    if (found) return { kind: 'actor', actor: found.actor, part: found.part };
    const bare = name.trim().replace(/^actor:/i, '');
    return devices.some((d) => d.id === bare)
      ? { kind: 'actor', actor: bare }
      : null;
  };
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const boxOf = (t: ShotTargetDto): ShotBox | null => {
    if (t.kind !== 'actor') return null;
    const d = deviceById.get(t.actor);
    if (!d) return null;
    const own = t.part ? d.made.parts[t.part]?.box : d.made.piece.box;
    return own ? boxOnDesk(d.placed, d.made.piece.box, own) : null;
  };
  const actors: UntimedActor[] = devices.map((d, k) => ({
    id: d.id,
    asset: d.asset,
    at: d.placed.at,
    size: d.placed.size,
    z: 10 + k,
    moves: [],
  }));

  // What each device is in as the shot goes: its parts' states, its words typed, its scroll.
  const states = new Map<string, UiCarried>(
    devices.map((d) => [
      d.id,
      {
        initial: { ...(d.made.spec.initial ?? {}) },
        typed: { ...(d.made.spec.typed ?? {}) },
        scrolled: d.made.spec.scrolled ?? 0,
        theme: d.made.spec.theme,
      },
    ]),
  );
  const stateOf = (device: UiDeviceOnDesk, part: string): string | undefined =>
    states.get(device.id)!.initial?.[part] ?? device.made.parts[part]?.state;
  /** A change the shot makes: a device's part in a new state (the screen's theme, a field's words, the content's scroll). */
  const change = (deviceId: string, part: string, state: string) => {
    const s = states.get(deviceId);
    if (!s) return;
    if (part === 'screen' && (state === 'dark' || state === 'light'))
      s.theme = state;
    else if (part === 'content') s.scrolled = Number(state) || 0;
    else s.initial = { ...(s.initial ?? {}), [part]: state };
  };

  // The board's own swaps and typing on the devices, as the shot ends.
  for (const one of planned.info ?? []) {
    if (
      (one.recipe !== 'swap' && one.recipe !== 'type') ||
      !one.target ||
      !one.text
    )
      continue;
    const t = target(one.target);
    if (t?.kind !== 'actor' || !t.part) continue;
    if (one.recipe === 'type') {
      const s = states.get(t.actor);
      if (s) s.typed = { ...(s.typed ?? {}), [t.part]: one.text };
    } else change(t.actor, t.part, one.text);
  }

  // The cursor: one a shot, where the last shot's left it, else resting on the first device.
  const cursors = ui.filter((a) => a.kit === 'ui.cursor').slice(0, 1);
  for (const one of cursors) {
    const piece = makeCursor(
      style,
      typeof one.params?.colour === 'string' ? one.params.colour : undefined,
    );
    const dto = toAsset(piece);
    const asset = `ui-cursor-${hashOf(dto.svg).toString(36)}`;
    assets[asset] = dto;
    const size = cursorSize(ctx.shape, piece.box);
    const first = devices[0];
    const tip =
      ctx.carry.cursor.get(one.id) ??
      (first
        ? cursorRest(first.placed, first.made.piece.box, first.made.piece.focal)
        : [800, 500]);
    const moves: UntimedMove[] = [];
    let at: [number, number] = tip;
    for (const move of (one.moves ?? []).slice(0, 6)) {
      const name = cursorMove(move.move);
      if (!name || !(CURSOR_MOVES as readonly string[]).includes(name)) {
        notes.push(`shot ${i + 1}: the cursor cannot ${move.move}; left out`);
        continue;
      }
      if (name === 'enter' || name === 'exit') {
        moves.push({ move: name, on: move.on, durMs: 300 });
        continue;
      }
      const to = move.to ? target(move.to) : null;
      const device =
        to?.kind === 'actor' ? deviceById.get(to.actor) : undefined;
      if (
        (name === 'move-to' ||
          name === 'click' ||
          name === 'drag' ||
          name === 'type') &&
        (!to || !device)
      ) {
        notes.push(
          `shot ${i + 1}: the cursor's ${name} to "${move.to ?? ''}" left out (no such part on the devices)`,
        );
        continue;
      }
      let part = to?.kind === 'actor' ? to.part : undefined;
      let state: string | undefined;
      const kind = part ? kindOfPart(part) : 'part';
      if (name === 'click' && device && part) {
        // A tab is chosen by its number on the tab bar (the cursor clicks the tab itself).
        const tab = /^tabs\.tab-(\d+)$/.exec(part);
        if (tab) {
          state = tab[1];
          change(device.id, 'tabs', state);
        } else {
          const states = device.made.parts[part]?.states ?? [];
          const asked =
            move.state && states.includes(move.state) ? move.state : undefined;
          const now = stateOf(device, part);
          state =
            asked ??
            (kind === 'toggle' || kind === 'checkbox' || kind === 'like'
              ? (OTHER[now ?? 'off'] ?? 'on')
              : kind === 'card' || kind === 'row' || kind === 'chip'
                ? 'selected'
                : kind === 'input'
                  ? 'focus'
                  : undefined);
        }
        if (state && !tab) change(device.id, part, state);
        // A switch for the dark theme turns the screen dark with it.
        if (part && /^toggle-(dark|night|theme)/.test(part) && state)
          change(device.id, 'screen', state === 'on' ? 'dark' : 'light');
      }
      if (name === 'drag' && device && part) {
        if (kind !== 'slider') {
          notes.push(
            `shot ${i + 1}: the cursor drags only a slider; ${part} left alone`,
          );
        } else {
          const now = Number(
            stateOf(device, part) ?? device.made.parts[part]?.value ?? 0.3,
          );
          const asked = Number(move.state);
          const v =
            Number.isFinite(asked) && move.state !== undefined
              ? asked
              : now < 0.5
                ? 0.8
                : 0.2;
          state = String(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100);
          change(device.id, part, state);
        }
      }
      if (name === 'type' && device && part) {
        if (kind !== 'input') {
          notes.push(
            `shot ${i + 1}: the cursor types only into a field; ${part} left alone`,
          );
          continue;
        }
        const words = (move.text ?? move.state ?? '').trim();
        if (!words) {
          notes.push(
            `shot ${i + 1}: the cursor's type on ${part} had no words; left out`,
          );
          continue;
        }
        state = words;
        const s = states.get(device.id);
        if (s) s.typed = { ...(s.typed ?? {}), [part]: words };
        change(device.id, part, 'focus');
      }
      if (name === 'scroll') {
        const d = device ?? devices[0];
        if (!d) continue;
        const most = d.made.scrollMost;
        const now = states.get(d.id)!.scrolled ?? 0;
        const screen = d.made.parts.screen?.box;
        let offset: number;
        const into =
          to?.kind === 'actor' && to.part && to.part !== 'content'
            ? d.made.parts[to.part]?.box
            : undefined;
        if (into && screen) offset = into[1] - screen[1] - screen[3] * 0.22;
        else if (/up|top|back/i.test(move.state ?? move.text ?? '')) offset = 0;
        else offset = now + (screen ? screen[3] * 0.55 : 300);
        offset = Math.round(Math.max(0, Math.min(most, offset)));
        if (offset === now) {
          notes.push(
            `shot ${i + 1}: the cursor's scroll left out (the screen does not scroll there)`,
          );
          continue;
        }
        state = String(offset);
        part = 'content';
        change(d.id, 'content', state);
        moves.push({
          move: name,
          on: move.on,
          to: { kind: 'actor', actor: d.id, part },
          state,
          durMs: SWAP_MS.scroll,
        });
        continue;
      }
      const t: ShotTargetDto =
        to!.kind === 'actor'
          ? { kind: 'actor', actor: to!.actor, ...(part ? { part } : {}) }
          : to!;
      moves.push({
        move: name,
        on: move.on,
        to: t,
        ...(state ? { state } : {}),
        durMs: ownMs(name, state),
      });
      const b = boxOf(t);
      if (b) {
        const value =
          kind === 'slider'
            ? Number(state ?? stateOf(device!, part!) ?? 0.5)
            : undefined;
        at = hotSpot(kind, b, value);
      }
    }
    actors.push({
      id: one.id,
      asset,
      at: cursorFeet(tip, size, piece.box),
      size,
      z: 100,
      moves,
    });
    ctx.carry.cursor.set(one.id, at);
  }
  for (const d of devices) ctx.carry.devices.set(d.id, states.get(d.id)!);
  const focus: ShotTargetDto | null =
    devices.length === 1
      ? { kind: 'actor', actor: devices[0].id, part: 'screen' }
      : devices.length > 1
        ? {
            kind: 'box',
            box: devices
              .map((d) => d.placed.box)
              .reduce((a, b) => {
                const x0 = Math.min(a[0], b[0]);
                const y0 = Math.min(a[1], b[1]);
                return [
                  x0,
                  y0,
                  Math.max(a[0] + a[2], b[0] + b[2]) - x0,
                  Math.max(a[1] + a[3], b[1] + b[3]) - y0,
                ];
              }),
          }
        : null;
  return { actors, assets, devices, notes, target, boxOf, focus };
}

/** Whether a plan's actor is the UI kit's (its own module builds it). */
export const isUiActor = (actor: PlanActor): boolean => isUiKit(actor.kit);

// ── Timing a scene's cursor ───────────────────────────────────────────────

/** A part of an actor on the desk at a shot: its box, from the actor's place and its asset. */
function partBox(
  shot: ShotDto,
  assets: Record<string, ShotAssetDto>,
  actorId: string,
  part?: string,
): ShotBox | null {
  const actor = shot.actors.find((a) => a.id === actorId);
  if (!actor || !('x' in actor.at)) return null;
  const asset = assets[actor.asset];
  if (asset?.kind !== 'svg') return null;
  const [ax, ay, aw, ah] = asset.box;
  const k = actor.size / Math.max(1e-6, ah);
  const own = part ? asset.parts[part]?.box : asset.box;
  if (!own) return null;
  // As the stage places it: its feet at `at`, its box's foot middle there.
  const left = actor.at.x + k * (own[0] - (ax + aw / 2));
  const top = actor.at.y - k * (ay + ah) + k * own[1];
  return [left, top, own[2] * k, own[3] * k];
}

/** A slider's value as drawn, from its asset part. */
const drawnValue = (
  shot: ShotDto,
  assets: Record<string, ShotAssetDto>,
  actorId: string,
  part: string,
): number | undefined => {
  const actor = shot.actors.find((a) => a.id === actorId);
  const asset = actor ? assets[actor.asset] : undefined;
  return asset?.kind === 'svg' ? asset.parts[part]?.value : undefined;
};

/** The cursor's tip at its feet: where an actor stands (its `at`) and its size, back to the tip at (0, 0) of its piece. */
function tipOf(actor: ShotActorDto, asset: ShotSvgAssetDto): [number, number] {
  if (!('x' in actor.at)) return [0, 0];
  const [ax, ay, aw, ah] = asset.box;
  const k = actor.size / Math.max(1e-6, ah);
  const tip = asset.rig?.cursor?.tip ?? [0, 0];
  return [
    actor.at.x + k * (tip[0] - (ax + aw / 2)),
    actor.at.y + k * (tip[1] - (ay + ah)),
  ];
}

/**
 * A scene's cursors timed and their changes made (after the voice has
 * timed the shots): an approach before each action that needs one, each
 * click's swap at its press, a drag's glide, a scroll, words typed; then
 * each run's callouts numbered and each frost's chapter. Pure.
 */
export function uiTimed(
  given: readonly ShotDto[],
  assets: Record<string, ShotAssetDto>,
): ShotDto[] {
  const shots = given.map((shot) => ({
    ...shot,
    actors: shot.actors.map((a) => ({ ...a, moves: [...a.moves] })),
    info: [...shot.info],
  }));
  for (const shot of shots) {
    for (const actor of shot.actors) {
      const asset = assets[actor.asset];
      if (asset?.kind !== 'svg' || !asset.rig?.cursor) continue;
      const desk = assets[('asset' in shot.set && shot.set.asset) || ''];
      const deskShort =
        desk?.kind === 'svg' ? Math.min(desk.box[2], desk.box[3]) : 900;
      let tip = tipOf(actor, asset);
      let free = shot.startMs;
      const out: ShotMoveDto[] = [];
      const values = new Map<string, number>();
      let n = 0;
      const add = (info: Omit<ShotInfoDto, 'id'>) => {
        n += 1;
        shot.info.push({ id: `${shot.id}-${actor.id}-ui${n}`, ...info });
      };
      const timed = actor.moves.map((move) =>
        ON_WORD.has(move.move)
          ? {
              ...move,
              atMs: Math.max(
                shot.startMs,
                move.atMs + move.durMs + SETTLE_LEAD_MS - ON_WORD_LEAD_MS,
              ),
            }
          : move,
      );
      for (const move of timed.sort((a, b) => a.atMs - b.atMs)) {
        const to = move.to?.kind === 'actor' ? move.to : null;
        const part = to?.part;
        const kind = part ? kindOfPart(part) : 'part';
        const box = to ? partBox(shot, assets, to.actor, part) : null;
        const value =
          kind === 'slider' && to && part
            ? (values.get(`${to.actor}.${part}`) ??
              drawnValue(shot, assets, to.actor, part) ??
              0.5)
            : undefined;
        /** The cursor gets to a point by `by`, leaving no sooner than it is free. */
        const approach = (point: [number, number], by: number) => {
          const d = Math.hypot(point[0] - tip[0], point[1] - tip[1]);
          if (d < 2) return by;
          const want = travelMs(d, deskShort);
          const start = Math.max(free, by - want);
          const len = Math.max(TRAVEL_MS.least * 0.6, by - start);
          out.push({
            move: 'move-to',
            atMs: Math.round(start),
            durMs: Math.round(len),
            to: { kind: 'box', box: [point[0] - 0.5, point[1] - 0.5, 1, 1] },
          });
          tip = point;
          free = start + len;
          return start + len;
        };
        switch (move.move) {
          case 'move-to': {
            if (!box) continue;
            const point = hotSpot(kind, box, value);
            const end = move.atMs + move.durMs;
            const d = Math.hypot(point[0] - tip[0], point[1] - tip[1]);
            const len = travelMs(d, deskShort);
            const start = Math.max(free, end - len);
            out.push({
              ...move,
              atMs: Math.round(start),
              durMs: Math.round(Math.max(120, end - start)),
            });
            tip = point;
            free = Math.max(free, end);
            break;
          }
          case 'click': {
            if (!box || !to) continue;
            const point = hotSpot(kind, box, value);
            let press = Math.max(move.atMs, free);
            const arrived = approach(point, press - SETTLE_MS);
            press = Math.max(press, arrived + SETTLE_MS);
            out.push({ ...move, atMs: Math.round(press), durMs: PRESS_MS });
            free = press + PRESS_MS;
            if (move.state && part) {
              // A tab's click chooses it on its bar.
              const onBar = /^tabs\.tab-\d+$/.test(part);
              const swapTo: ShotTargetDto = onBar
                ? { kind: 'actor', actor: to.actor, part: 'tabs' }
                : to;
              const swapKind = onBar ? 'tabs' : kind;
              // A button pressed shows its press, then the state it was asked for.
              if (kind === 'button' && move.state !== 'pressed')
                add({
                  recipe: 'swap',
                  target: to,
                  text: 'pressed',
                  atMs: Math.round(press),
                  durMs: 120,
                  untilMs: Math.round(press + 170),
                });
              add({
                recipe: 'swap',
                target: swapTo,
                text: move.state,
                atMs: Math.round(
                  kind === 'button' && move.state !== 'pressed'
                    ? press + 150
                    : press,
                ),
                durMs: SWAP_MS[swapKind] ?? 180,
              });
              if (/^toggle-(dark|night|theme)/.test(part))
                add({
                  recipe: 'swap',
                  target: { kind: 'actor', actor: to.actor, part: 'screen' },
                  text: move.state === 'on' ? 'dark' : 'light',
                  atMs: Math.round(press + 60),
                  durMs: SWAP_MS.screen,
                });
            } else if (kind === 'button') {
              // A button with nothing to become still shows its press.
              add({
                recipe: 'swap',
                target: to,
                text: 'pressed',
                atMs: Math.round(press),
                durMs: 120,
                untilMs: Math.round(press + 200),
              });
            }
            break;
          }
          case 'drag': {
            if (!box || !to || !part || kind !== 'slider') continue;
            const from = hotSpot(
              'slider',
              boxKnobTrack(shot, assets, to.actor, part) ?? box,
              value,
            );
            const v = Number(move.state ?? value ?? 0.5);
            let press = Math.max(move.atMs, free);
            const arrived = approach(from, press - SETTLE_MS);
            press = Math.max(press, arrived + SETTLE_MS);
            const len = Math.max(420, move.durMs);
            out.push({
              ...move,
              atMs: Math.round(press),
              durMs: Math.round(len),
            });
            add({
              recipe: 'swap',
              target: to,
              text: String(v),
              atMs: Math.round(press + PRESS_MS),
              durMs: Math.round(len - 2 * PRESS_MS),
            });
            values.set(`${to.actor}.${part}`, v);
            const track = boxKnobTrack(shot, assets, to.actor, part) ?? box;
            tip = hotSpot('slider', track, v);
            free = press + len;
            break;
          }
          case 'scroll': {
            if (!to) continue;
            const at = Math.max(move.atMs, free);
            const len = Math.max(400, move.durMs || SWAP_MS.scroll);
            out.push({ ...move, atMs: Math.round(at), durMs: Math.round(len) });
            add({
              recipe: 'swap',
              target: { kind: 'actor', actor: to.actor, part: 'content' },
              text: move.state ?? '0',
              atMs: Math.round(at),
              durMs: Math.round(len),
            });
            free = at + len;
            break;
          }
          case 'type': {
            if (!box || !to || !move.state) continue;
            const point = hotSpot('input', box);
            let press = Math.max(move.atMs, free);
            const arrived = approach(point, press - SETTLE_MS);
            press = Math.max(press, arrived + SETTLE_MS);
            const letters = [...move.state].length;
            const len = Math.round(PRESS_MS + 160 + letters * LETTER_MS);
            out.push({ ...move, atMs: Math.round(press), durMs: len });
            add({
              recipe: 'swap',
              target: to,
              text: 'focus',
              atMs: Math.round(press),
              durMs: SWAP_MS.input,
            });
            add({
              recipe: 'type',
              target: to,
              text: move.state,
              atMs: Math.round(press + PRESS_MS + 160),
              durMs: letters * LETTER_MS,
            });
            free = press + len;
            break;
          }
          default:
            out.push(move);
            free = Math.max(free, move.atMs + move.durMs);
        }
      }
      actor.moves = out.sort((a, b) => a.atMs - b.atMs);
    }
    shot.info.sort((a, b) => a.atMs - b.atMs);
  }
  return numbered(chapters(shots));
}

/** A slider's track on the desk (where its knob runs), from its `.track` part. */
function boxKnobTrack(
  shot: ShotDto,
  assets: Record<string, ShotAssetDto>,
  actorId: string,
  part: string,
): ShotBox | null {
  return partBox(shot, assets, actorId, `${part}.track`);
}

/** What a set is, to tell two shots on one set (as the client's runs.ts keys it). */
const setKey = (shot: ShotDto) =>
  shot.set.kind === 'plain' ? 'plain' : `${shot.set.kind}:${shot.set.asset}`;

/** Each run's callouts numbered 1, 2, 3… in the order they come on (a run: shots on one set joined by continue). */
export function numbered(shots: ShotDto[]): ShotDto[] {
  let n = 0;
  return shots.map((shot, i) => {
    const before = shots[i - 1];
    if (
      !before ||
      before.join !== 'continue' ||
      setKey(before) !== setKey(shot)
    )
      n = 0;
    const info = [...shot.info]
      .sort((a, b) => a.atMs - b.atMs)
      .map((item) =>
        item.recipe === 'callout' ? { ...item, value: (n += 1) } : item,
      );
    return { ...shot, info };
  });
}

/** The shot after each frost join opens its chapter: the frosts of the scene counted from one. */
export function chapters(shots: ShotDto[]): ShotDto[] {
  let k = 0;
  return shots.map((shot, i) => {
    if (shots[i - 1]?.join !== 'frost') return shot;
    k += 1;
    return shot.chapter !== undefined ? shot : { ...shot, chapter: k };
  });
}

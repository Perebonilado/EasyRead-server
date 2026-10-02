/**
 * The UI kit on the shots: a plan's devices and cursor built on the desk
 * (placed, named, carried from shot to shot), and the cursor timed into
 * its changes: an approach before an action, each click's swap at its
 * press, a drag's glide, typing after the field takes focus, callouts
 * numbered in the order their words come, a frost's chapter.
 */
import type { ShotDto, ShotInfoDto, ShotSvgAssetDto } from '../../../contracts';
import type { TimedBeat } from '../scene-timing';
import { buildShots, type BuildContext } from './shot-build';
import { registryOf } from './shot-registry';
import { timeShots } from './shot-time';
import {
  PRESS_MS,
  SETTLE_MS,
  UI_ROOM,
  chapters,
  hotSpot,
  kindOfPart,
  numbered,
  travelMs,
  uiCamera,
  uiFrame,
  uiTimed,
} from './shot-ui';
import type { ShotPlan } from './types';

const ctx: BuildContext = {
  shape: 'wide',
  palette: [],
  held: null,
  theme: 'paper',
  map: null,
  seed: 'ui-scene',
};

/** Lines as the voice says them, each word an even share of its line's time. */
function beatsOf(lines: [string, number, number][]): TimedBeat[] {
  return lines.map(([text, startMs, endMs]) => {
    const found = [...text.matchAll(/\S+/g)];
    const each = (endMs - startMs) / found.length;
    return {
      text,
      startMs,
      endMs,
      words: found.map((m, i) => [
        m.index,
        m.index + m[0].length,
        Math.round(startMs + i * each),
        Math.round(startMs + (i + 1) * each - 40),
      ]),
    };
  });
}

const LINES: [string, number, number][] = [
  ['Open the settings of the app.', 0, 2000],
  ['First turn on dark mode, and the whole screen changes.', 2400, 6000],
  ['Then slide the brightness all the way up.', 6400, 9000],
  ['Now type your email to sign in.', 9400, 12000],
];
const BEATS = beatsOf(LINES);
const DURATION = 12_500;

/** The ms a word of the narration is said at (its first time). */
function wordAt(word: string): number {
  for (const beat of BEATS)
    for (const [a, b, start] of beat.words)
      if (beat.text.slice(a, b).replace(/[.,]/g, '') === word) return start;
  throw new Error(word);
}

const phone = {
  id: 'phone',
  kit: 'ui.phone',
  params: { screen: 'settings', items: 'Dark mode, Notifications, Brightness' },
};

const PLAN: ShotPlan = {
  shots: [
    {
      on: 'Open the settings',
      set: { kind: 'screen' },
      actors: [
        phone,
        {
          id: 'cursor',
          kit: 'ui.cursor',
          moves: [
            { move: 'tap', on: 'turn on dark mode', to: 'phone.toggle-dark' },
            {
              move: 'slide',
              on: 'slide the brightness',
              to: 'Brightness',
              state: '0.9',
            },
          ],
        },
      ],
      info: [
        { recipe: 'callout', target: 'phone.toggle-dark', on: 'First turn on' },
        {
          recipe: 'callout',
          target: 'phone.slider-brightness',
          on: 'Then slide',
        },
      ],
      life: [],
      camera: [
        {
          move: 'push',
          target: 'phone.toggle-dark',
          on: 'dark mode',
          amount: 'medium',
        },
      ],
      join: 'continue',
    },
    {
      on: 'Now type your email',
      set: { kind: 'screen' },
      actors: [
        phone,
        {
          id: 'cursor',
          kit: 'ui.cursor',
          moves: [
            {
              move: 'move-to',
              on: 'Now type',
              to: 'phone.toggle-notifications',
            },
          ],
        },
      ],
      info: [
        {
          recipe: 'callout',
          target: 'phone.toggle-notifications',
          on: 'to sign in',
        },
      ],
      life: [],
      camera: [],
      join: 'frost',
    },
    {
      on: 'sign in',
      set: { kind: 'screen' },
      actors: [phone],
      info: [{ recipe: 'callout', target: 'phone.toggle-dark', on: 'sign in' }],
      life: [],
      camera: [],
      join: 'cut',
    },
  ],
};

const built = buildShots(PLAN, registryOf([]), ctx);
const timed = timeShots(built.shots, BEATS, DURATION);
const shots = uiTimed(timed, built.assets);
const [first, second, third] = shots;
const cursorOf = (shot: ShotDto) => shot.actors.find((a) => a.id === 'cursor')!;
const swaps = (shot: ShotDto) => shot.info.filter((i) => i.recipe === 'swap');

describe('building a shot of the UI kit', () => {
  it('stands the device on the desk and the cursor on its screen', () => {
    expect(first.set).toEqual({ kind: 'set', asset: 'desk' });
    const desk = built.assets.desk as ShotSvgAssetDto;
    expect(desk.box).toEqual([0, 0, 1600, 900]);
    const device = first.actors.find((a) => a.id === 'phone')!;
    const asset = built.assets[device.asset] as ShotSvgAssetDto;
    expect(asset.parts['toggle-dark']).toBeDefined();
    expect('x' in device.at && device.at.x).toBeCloseTo(800, 0);
    expect(device.size).toBeGreaterThan(600);
    const cursor = cursorOf(first);
    expect((built.assets[cursor.asset] as ShotSvgAssetDto).rig?.cursor).toEqual(
      { tip: [0, 0] },
    );
    // The shot is about the device's screen when the plan names nothing.
    expect(first.focal).toEqual({
      kind: 'actor',
      actor: 'phone',
      part: 'screen',
    });
  });

  it('names the device’s parts as the actor’s, for the information and the cursor', () => {
    const callouts = first.info.filter((i) => i.recipe === 'callout');
    expect(callouts.map((c) => c.target)).toEqual([
      { kind: 'actor', actor: 'phone', part: 'toggle-dark' },
      { kind: 'actor', actor: 'phone', part: 'slider-brightness' },
    ]);
    const clicks = cursorOf(first).moves.filter((m) => m.move === 'click');
    expect(clicks).toHaveLength(1);
    // A switch with no state asked for flips: off to on.
    expect(clicks[0]).toMatchObject({
      to: { kind: 'actor', actor: 'phone', part: 'toggle-dark' },
      state: 'on',
    });
    const drag = cursorOf(first).moves.find((m) => m.move === 'drag')!;
    expect(drag).toMatchObject({
      to: { kind: 'actor', actor: 'phone', part: 'slider-brightness' },
      state: '0.9',
    });
    // The camera pushes into the part with room round it, on the desk.
    const push = first.camera.find((c) => c.move === 'travel' && c.atMs > 0)!;
    expect(push.target?.kind).toBe('box');
  });

  it('carries the device into the next shot as the last one left it: the same device, never a cut', () => {
    const before = built.assets[
      first.actors.find((a) => a.id === 'phone')!.asset
    ] as ShotSvgAssetDto;
    const after = built.assets[
      second.actors.find((a) => a.id === 'phone')!.asset
    ] as ShotSvgAssetDto;
    expect(before.svg).toMatch(
      /data-part="toggle-dark" data-ui="toggle" data-state="off"/,
    );
    expect(after.svg).toMatch(
      /data-part="toggle-dark" data-ui="toggle" data-state="on"/,
    );
    // The dark switch turned the screen dark, and the slider stays where it was dragged.
    expect(after.svg).toMatch(
      /data-part="screen" data-ui="screen" data-state="dark"/,
    );
    expect(after.parts['slider-brightness'].value).toBeCloseTo(0.9);
    // The same place on the desk.
    const a = first.actors.find((x) => x.id === 'phone')!;
    const b = second.actors.find((x) => x.id === 'phone')!;
    expect(b.at).toEqual(a.at);
    expect(b.size).toBe(a.size);
  });

  it('keeps a chapter break on the same desk, and joins other shots on it as one run', () => {
    expect(first.join).toBe('continue');
    expect(second.join).toBe('frost');
  });
});

describe('timing the cursor into its changes', () => {
  it('changes a clicked part at the press, the moment the click starts', () => {
    const click = cursorOf(first).moves.find((m) => m.move === 'click')!;
    expect(click.durMs).toBe(PRESS_MS);
    const swap = swaps(first).find(
      (s) => s.target?.kind === 'actor' && s.target.part === 'toggle-dark',
    )!;
    expect(swap.atMs).toBe(click.atMs);
    expect(swap.text).toBe('on');
    // The press lands just before its words ("dark mode" follows "turn on").
    expect(click.atMs).toBeLessThan(wordAt('dark'));
    expect(click.atMs).toBeGreaterThan(wordAt('turn') - 1000);
    // The screen turns dark with its switch.
    const screen = swaps(first).find(
      (s) => s.target?.kind === 'actor' && s.target.part === 'screen',
    )!;
    expect(screen.text).toBe('dark');
    expect(screen.atMs).toBeGreaterThanOrEqual(click.atMs);
  });

  it('moves the cursor to what it clicks first, arriving a beat before the press', () => {
    const moves = cursorOf(first).moves;
    const click = moves.find((m) => m.move === 'click')!;
    const approach = moves
      .filter((m) => m.move === 'move-to' && m.atMs < click.atMs)
      .pop()!;
    expect(approach).toBeDefined();
    expect(approach.atMs + approach.durMs).toBeLessThanOrEqual(
      click.atMs - SETTLE_MS + 1,
    );
    expect(approach.to?.kind).toBe('box');
    // Moves never overlap.
    for (let k = 1; k < moves.length; k += 1)
      expect(moves[k].atMs).toBeGreaterThanOrEqual(
        moves[k - 1].atMs + moves[k - 1].durMs - 1,
      );
  });

  it('glides a dragged slider while the cursor drags it, starting on its word', () => {
    const drag = cursorOf(first).moves.find((m) => m.move === 'drag')!;
    const glide = swaps(first).find(
      (s) =>
        s.target?.kind === 'actor' && s.target.part === 'slider-brightness',
    )!;
    expect(glide.atMs).toBe(drag.atMs + PRESS_MS);
    expect(glide.atMs + glide.durMs).toBe(drag.atMs + drag.durMs - PRESS_MS);
    expect(glide.text).toBe('0.9');
    expect(Math.abs(drag.atMs - wordAt('slide'))).toBeLessThan(400);
  });

  it('numbers callouts in the order their words come, run by run', () => {
    const value = (shot: ShotDto) =>
      shot.info.filter((i) => i.recipe === 'callout').map((i) => i.value);
    expect(value(first)).toEqual([1, 2]);
    // The next shot carries on the same run: its callout is the third.
    expect(value(second)).toEqual([3]);
    // After the frost a new run counts from one.
    expect(value(third)).toEqual([1]);
    expect(third.chapter).toBe(1);
  });

  it('is pure: the same shots give the same timing, and what it is given is left as it was', () => {
    const copy = JSON.stringify(timed);
    const again = uiTimed(timed, built.assets);
    expect(JSON.stringify(again)).toBe(JSON.stringify(shots));
    expect(JSON.stringify(timed)).toBe(copy);
  });
});

describe('the press and the hot spot', () => {
  it('names each part’s kind by its id, as the client does', () => {
    expect(kindOfPart('btn-primary')).toBe('button');
    expect(kindOfPart('toggle-dark')).toBe('toggle');
    expect(kindOfPart('slider-brightness')).toBe('slider');
    expect(kindOfPart('input-email')).toBe('input');
    expect(kindOfPart('search')).toBe('input');
    expect(kindOfPart('tabs.tab-2')).toBe('tabs');
    expect(kindOfPart('menu-1')).toBe('row');
    expect(kindOfPart('chart.bar-2')).toBe('chart');
    expect(kindOfPart('screen')).toBe('screen');
    expect(kindOfPart('content')).toBe('scroll');
    expect(kindOfPart('title')).toBe('part');
  });

  it('puts the tip a little right of and under a button’s middle, on a slider’s knob, near a field’s start', () => {
    expect(hotSpot('button', [0, 0, 100, 50])).toEqual([58, 30]);
    expect(hotSpot('slider', [0, 0, 200, 20], 0.25)).toEqual([50, 10]);
    expect(hotSpot('input', [0, 0, 100, 50])).toEqual([24, 28]);
    expect(hotSpot('title', [0, 0, 100, 50])).toEqual([50, 25]);
  });

  it('takes longer the further the cursor goes, within its bounds', () => {
    expect(travelMs(0, 900)).toBe(240);
    expect(travelMs(450, 900)).toBeGreaterThan(travelMs(100, 900));
    expect(travelMs(5000, 900)).toBe(700);
  });

  it('counts chapters and callouts from the shots alone', () => {
    const shot = (
      id: string,
      join: ShotDto['join'],
      info: Partial<ShotInfoDto>[] = [],
    ): ShotDto => ({
      id,
      startMs: 0,
      endMs: 1000,
      set: { kind: 'set', asset: 'desk' },
      actors: [],
      info: info.map((i, k) => ({
        id: `${id}-${k}`,
        recipe: 'callout',
        atMs: 0,
        durMs: 400,
        ...i,
      })),
      life: [],
      camera: [],
      join,
      joinMs: 0,
    });
    const out = chapters([
      shot('a', 'frost'),
      shot('b', 'frost'),
      shot('c', 'cut'),
    ]);
    expect(out.map((s) => s.chapter)).toEqual([undefined, 1, 2]);
    const counted = numbered([
      shot('a', 'continue', [{ atMs: 500 }, { atMs: 100 }]),
      shot('b', 'cut', [{ atMs: 0 }]),
    ]);
    expect(counted[0].info.map((i) => [i.atMs, i.value])).toEqual([
      [100, 1],
      [500, 2],
    ]);
    expect(counted[1].info[0].value).toBe(3);
  });
});

describe('the camera on a device', () => {
  const desk: [number, number, number, number] = [0, 0, 1600, 900];

  it('frames a part close, with room round it, inside the desk', () => {
    const part: [number, number, number, number] = [700, 300, 60, 30];
    const framed = uiFrame(part, desk, 'medium');
    expect(framed[2]).toBeCloseTo(900 * UI_ROOM.medium, 0);
    expect(framed[0]).toBeLessThanOrEqual(part[0]);
    expect(framed[0] + framed[2]).toBeGreaterThanOrEqual(part[0] + part[2]);
    expect(uiFrame(part, desk, 'large')[2]).toBeLessThan(
      uiFrame(part, desk, 'small')[2],
    );
    const corner = uiFrame([1580, 880, 20, 20], desk, 'small');
    expect(corner[0] + corner[2]).toBeLessThanOrEqual(1600);
    expect(corner[1] + corner[3]).toBeLessThanOrEqual(900);
  });

  it('turns a push into a device part into a travel to it, and a pull back to the device', () => {
    const ui = {
      boxOf: () => [700, 300, 60, 30] as [number, number, number, number],
      frameOf: () => [600, 290, 300, 50] as [number, number, number, number],
      focus: { kind: 'actor' as const, actor: 'phone', part: 'screen' },
    };
    const push = uiCamera(
      { move: 'push', amount: 'medium' },
      { kind: 'actor', actor: 'phone', part: 'toggle-dark' },
      ui,
      desk,
    )!;
    expect(push.move).toBe('travel');
    expect(push.durMs).toBeGreaterThan(600);
    // The row a control sits in is what is framed.
    const box = (push.target as { box: [number, number, number, number] }).box;
    expect(box[0]).toBeLessThanOrEqual(600);
    expect(box[0] + box[2]).toBeGreaterThanOrEqual(900);
    const pull = uiCamera({ move: 'pull' }, null, ui, desk)!;
    expect(pull.move).toBe('travel');
    expect(pull.target).toEqual(ui.focus);
    expect(pull.durMs).toBeGreaterThan(0);
    // A move on something else is the build's as usual.
    expect(
      uiCamera({ move: 'push' }, { kind: 'box', box: [0, 0, 1, 1] }, ui, desk),
    ).toBeNull();
  });

  it('frames a control with the settings row it sits in', () => {
    const push = first.camera.find(
      (c) => c.atMs > 0 && c.target?.kind === 'box',
    )!;
    const device = first.actors.find((a) => a.id === 'phone')!;
    const asset = built.assets[device.asset] as ShotSvgAssetDto;
    const row = asset.parts['setting-dark-mode'].box;
    const k = device.size / asset.box[3];
    const framed = (push.target as { box: [number, number, number, number] })
      .box;
    // As wide as the row's on the desk, at least.
    expect(framed[2]).toBeGreaterThanOrEqual(row[2] * k - 1);
  });

  it('in a tall frame moves in on a part named under the captions’ band, at its moment; never in a wide one', () => {
    const plan: ShotPlan = {
      shots: [
        {
          on: 'Open the settings',
          set: { kind: 'screen' },
          actors: [
            { id: 'phone', kit: 'ui.phone', params: { screen: 'product' } },
          ],
          info: [
            {
              recipe: 'callout',
              target: 'phone.btn-primary',
              on: 'Then slide',
            },
          ],
          life: [],
          camera: [],
          join: 'cut',
        },
      ],
    };
    const made = (shape: 'wide' | 'tall') => {
      const b = buildShots(plan, registryOf([]), { ...ctx, shape });
      return uiTimed(timeShots(b.shots, BEATS, DURATION), b.assets)[0];
    };
    const tall = made('tall');
    const callout = tall.info.find((i) => i.recipe === 'callout')!;
    const travel = tall.camera.find((c) => c.move === 'travel')!;
    expect(travel).toBeDefined();
    expect(Math.abs(travel.atMs - callout.atMs)).toBeLessThanOrEqual(450);
    expect(made('wide').camera.some((c) => c.move === 'travel')).toBe(false);
  });
});

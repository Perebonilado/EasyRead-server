/**
 * The UI kit: every device draws every kind of screen, and every piece,
 * as a sound kit piece in both themes; every part that changes has a
 * layer and a rig state for each of its states, the one it starts in
 * shown; a screen shows only the words its spec gives; devices stand on
 * the desk in both shapes, side by side at one scale for a before and an
 * after; the cursor's tip and moves are its rig's.
 */
import type { ShotLookDto } from '../../../contracts';
import { KIT, actorMove, makeKit, paramsOf } from './registry';
import { validateRig } from './rig';
import { kitStyle } from './style';
import {
  DESK,
  PLAIN_LOOK,
  UI_DEVICES,
  boxOnDesk,
  cursorFeet,
  cursorMove,
  cursorSize,
  deviceFor,
  initialOf,
  itemsOf,
  makeCursor,
  makeDevice,
  piecesList,
  placeDevices,
  specOf,
  uiDesk,
  uiPartNamed,
  uiPartNames,
} from './ui';
import { UI_PIECES, UI_SCREENS, UI_STATES } from './ui-screens';
import { appColour, hueOf, uiPalette } from './ui-paint';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    sides: {},
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};

/** Every <text>'s words in a drawing. */
const textsIn = (svg: string): string[] =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);

/** Whether an element of a drawing with this data-part is drawn hidden. */
const hidden = (svg: string, part: string): boolean => {
  const tag =
    new RegExp(`<g data-part="${part.replace(/[.@]/g, '\\$&')}"[^>]*>`).exec(
      svg,
    )?.[0] ?? '';
  return /\bopacity="0"/.test(tag);
};

describe('the UI kit', () => {
  describe('devices and screens', () => {
    it.each(UI_DEVICES)(
      'a %s draws every kind of screen, in both themes, as a sound piece',
      (device) => {
        for (const screen of UI_SCREENS)
          for (const theme of ['light', 'dark'] as const) {
            const made = makeDevice(
              device,
              specOf({ screen, theme }),
              PLAIN_LOOK,
              3,
            );
            expect(validateRig(made.piece)).toEqual([]);
            expect(made.piece.parts.screen).toBeDefined();
            expect(made.piece.parts.device).toBeDefined();
            // The camera's default subject is the screen.
            expect(made.piece.focal).toEqual(made.parts.screen.box);
            expect(made.piece.svg.length).toBeLessThan(200_000);
          }
      },
    );

    it.each(UI_PIECES)(
      'the piece "%s" draws alone and in a list, on a phone and a laptop',
      (piece) => {
        for (const device of ['phone', 'laptop'] as const) {
          const alone = makeDevice(
            device,
            specOf({ pieces: piece }),
            PLAIN_LOOK,
            5,
          );
          expect(validateRig(alone.piece)).toEqual([]);
          const many = makeDevice(
            device,
            specOf({ pieces: `nav, ${piece}, title, ${piece}, button` }),
            PLAIN_LOOK,
            5,
          );
          expect(validateRig(many.piece)).toEqual([]);
        }
      },
    );

    it('every id of the ui family makes a sound piece through the registry, in both shapes', () => {
      const ids = Object.keys(KIT).filter((id) => id.startsWith('ui.'));
      expect(ids.sort()).toEqual(
        [...UI_DEVICES.map((d) => `ui.${d}`), 'ui.cursor'].sort(),
      );
      for (const id of ids)
        for (const shape of ['wide', 'tall'] as const) {
          const style = kitStyle(LOOK, { shape });
          const made = makeKit(
            id,
            { screen: 'settings', items: 'Dark mode, Volume' },
            style,
            9,
          );
          expect(made).not.toBeNull();
          expect(validateRig(made!.piece)).toEqual([]);
          expect(KIT[id].looks).toEqual(['editorial', 'illustrated']);
        }
    });

    it('keeps the script’s words, a few each, and draws nothing else as words', () => {
      const params = paramsOf('ui.phone', {
        screen: 'product',
        title: 'Organic Strawberries from the farm today',
        words: 'Add to cart now please',
        items: 'Free delivery, Fresh, Organic, Local',
      });
      // The settings keep the line's words; the screen sets a few of them.
      expect(params.title).toBe('Organic Strawberries from the farm today');
      expect(specOf(params).title).toBe('Organic Strawberries from the');
      const made = makeDevice('phone', specOf(params), PLAIN_LOOK, 1);
      const said = new Set([
        'Organic Strawberries from',
        'Organic Strawberries from the',
        'Organic Strawberries',
        'Add to cart',
        'Free delivery',
        'Fresh',
        'Organic',
        'Local',
      ]);
      for (const text of textsIn(made.piece.svg))
        expect(said.has(text)).toBe(true);
      // No figure anywhere: a price is a bar.
      expect(textsIn(made.piece.svg).join(' ')).not.toMatch(/\d/);
    });

    it('draws a screen with no words given as a wireframe: no words at all', () => {
      for (const screen of UI_SCREENS) {
        const made = makeDevice('phone', specOf({ screen }), PLAIN_LOOK, 2);
        expect(textsIn(made.piece.svg)).toEqual([]);
      }
    });
  });

  describe('parts and their states', () => {
    const settings = makeDevice(
      'phone',
      specOf({
        screen: 'settings',
        items: 'Dark mode, Notifications, Brightness',
      }),
      PLAIN_LOOK,
      4,
    );

    it('names its pieces by what they are and what the script calls them', () => {
      const names = uiPartNames('ui.phone', {
        screen: 'settings',
        items: 'Dark mode, Notifications, Brightness',
      });
      expect(names).toEqual(
        expect.arrayContaining([
          'screen',
          'toggle-dark',
          'toggle-notifications',
          'slider-brightness',
          'setting-dark-mode',
        ]),
      );
      const product = uiPartNames('ui.phone', { screen: 'product' });
      expect(product).toEqual(
        expect.arrayContaining([
          'image',
          'title',
          'rating',
          'price',
          'qty',
          'btn-primary',
          'chip-1',
          'badge',
        ]),
      );
      const laptop = uiPartNames('ui.laptop', { screen: 'dashboard' });
      expect(laptop).toEqual(
        expect.arrayContaining([
          'chart',
          'chart.bar-1',
          'donut',
          'stat-1',
          'sidebar',
          'menu-1',
        ]),
      );
      // Layers and a field's inner parts are not names for the board.
      expect(names.some((n) => n.includes('@'))).toBe(false);
      expect(names.some((n) => n.endsWith('.caret'))).toBe(false);
    });

    it('finds a part by the name a board writes', () => {
      const params = {
        screen: 'settings',
        items: 'Dark mode, Notifications, Brightness',
      };
      expect(uiPartNamed('ui.phone', params, 'toggle-dark')).toBe(
        'toggle-dark',
      );
      expect(uiPartNamed('ui.phone', params, 'Brightness')).toBe(
        'slider-brightness',
      );
      expect(uiPartNamed('ui.phone', params, 'part:dark-mode')).toBe(
        'setting-dark-mode',
      );
      expect(
        uiPartNamed('ui.phone', { screen: 'product' }, 'btn-primary'),
      ).toBe('btn-primary');
      expect(
        uiPartNamed('ui.phone', { screen: 'product' }, 'a-tractor'),
      ).toBeNull();
    });

    it('draws a layer and a rig state for every state of every part that changes, the one it starts in shown', () => {
      for (const screen of UI_SCREENS)
        for (const device of ['phone', 'laptop'] as const) {
          const made = makeDevice(device, specOf({ screen }), PLAIN_LOOK, 6);
          const { parts, rig, svg } = made.piece;
          for (const [id, info] of Object.entries(made.parts)) {
            if (!info.states || info.kind === 'screen') continue;
            for (const state of info.states) {
              const pose = rig.states[`${id}:${state}`];
              expect(pose).toBeDefined();
              for (const posed of Object.keys(pose))
                expect(parts[posed]).toBeDefined();
              if (
                info.kind === 'tabs' ||
                info.kind === 'modal' ||
                info.kind === 'toast' ||
                info.kind === 'keyboard'
              )
                continue;
              expect(parts[`${id}@${state}`]).toBeDefined();
              expect(hidden(svg, `${id}@${state}`)).toBe(state !== info.state);
            }
          }
        }
    });

    it('carries the kinds the client changes them by, and a knob, a track, a field’s words and caret', () => {
      const { svg, parts } = settings.piece;
      expect(svg).toMatch(
        /data-part="toggle-dark" data-ui="toggle" data-state="off"/,
      );
      expect(svg).toMatch(/data-part="toggle-dark\.knob" data-travel="20"/);
      expect(svg).toMatch(
        /data-part="slider-brightness" data-ui="slider" data-value="0\.35"/,
      );
      expect(parts['slider-brightness.track']).toBeDefined();
      expect(parts['slider-brightness.fill']).toBeDefined();
      expect(parts['slider-brightness.knob']).toBeDefined();
      expect(parts['slider-brightness'].value).toBeCloseTo(0.35);
      expect(svg).toMatch(
        /data-part="screen" data-ui="screen" data-state="light"/,
      );
      expect(svg).toMatch(/data-part="content" data-ui="scroll"/);
      const login = makeDevice(
        'phone',
        specOf({ screen: 'login', items: 'Email, Password' }),
        PLAIN_LOOK,
        4,
      ).piece;
      expect(login.parts['input-email.text']).toBeDefined();
      expect(login.parts['input-email.caret']).toBeDefined();
      expect(login.parts['input-email.placeholder']).toBeDefined();
      expect(login.svg).toMatch(
        /data-part="input-email\.text" data-ui-text="1"/,
      );
      // A bar of a chart grows from its foot.
      const dash = makeDevice(
        'laptop',
        specOf({ screen: 'dashboard' }),
        PLAIN_LOOK,
        4,
      ).piece;
      expect(dash.parts['chart.bar-1'].pivot?.[1]).toBeCloseTo(1, 2);
      expect(dash.parts['chart.bar-1'].value).toBeGreaterThan(0);
    });

    it('carries every element’s colour in both themes, so a screen turns dark by changing its fills', () => {
      const { svg } = settings.piece;
      expect((svg.match(/data-fill-dark="/g) ?? []).length).toBeGreaterThan(20);
      const dark = makeDevice(
        'phone',
        specOf({ screen: 'settings', theme: 'dark' }),
        PLAIN_LOOK,
        4,
      ).piece.svg;
      expect(dark).toMatch(
        /data-part="screen" data-ui="screen" data-state="dark"/,
      );
    });

    it('starts parts in the states a spec or an earlier shot leaves them in', () => {
      const made = makeDevice(
        'phone',
        specOf(
          {
            screen: 'settings',
            items: 'Dark mode',
            state: 'toggle-dark: on, slider-2: 0.8',
          },
          { typed: {}, theme: 'dark' },
        ),
        PLAIN_LOOK,
        4,
      );
      expect(made.parts['toggle-dark'].state).toBe('on');
      expect(hidden(made.piece.svg, 'toggle-dark@on')).toBe(false);
      expect(hidden(made.piece.svg, 'toggle-dark@off')).toBe(true);
      expect(made.spec.theme).toBe('dark');
      const typed = makeDevice(
        'phone',
        specOf(
          { screen: 'login', items: 'Email' },
          { typed: { 'input-email': 'ana@site.org' } },
        ),
        PLAIN_LOOK,
        4,
      ).piece.svg;
      expect(typed).toMatch(/>ana@site\.org<\/text>/);
      expect(typed).toMatch(/data-part="input-email\.placeholder" opacity="0"/);
    });

    it('lists each kind’s states, the first its rest', () => {
      expect(UI_STATES.button).toEqual([
        'default',
        'hover',
        'pressed',
        'loading',
        'success',
        'disabled',
      ]);
      expect(UI_STATES.toggle).toEqual(['off', 'on']);
      expect(UI_STATES.input).toEqual(['default', 'focus', 'error', 'success']);
    });
  });

  describe('the settings a board writes', () => {
    it('reads lists, states and pieces', () => {
      expect(itemsOf('Dark mode, Notifications; Wi-Fi')).toEqual([
        'Dark mode',
        'Notifications',
        'Wi-Fi',
      ]);
      expect(
        initialOf('btn-primary: Loading, slider-volume=0.7, nonsense'),
      ).toEqual({ 'btn-primary': 'loading', 'slider-volume': '0.7' });
      expect(piecesList('nav, image, title and button, a spaceship')).toEqual([
        'nav',
        'image',
        'title',
        'button',
      ]);
      expect(specOf({ screen: 'Settings page' }).screen).toBe('settings');
      expect(specOf({ screen: 'nonsense' }).screen).toBe('product');
    });

    it('reads a cursor’s moves by their own words first', () => {
      expect(actorMove('tap', 'ui.cursor')).toBe('click');
      expect(actorMove('move', 'ui.cursor')).toBe('move-to');
      expect(actorMove('Move to', 'ui.cursor')).toBe('move-to');
      expect(actorMove('enter', 'ui.cursor')).toBe('enter');
      expect(actorMove('slide', 'ui.cursor')).toBe('drag');
      // Another piece keeps the kit's words.
      expect(actorMove('move', 'people.person')).toBe('walk');
      expect(cursorMove('swipe')).toBe('scroll');
      expect(cursorMove('juggle')).toBeNull();
    });
  });

  describe('the app’s colours', () => {
    it('never wears the show’s accent: its hue is turned well away', () => {
      for (const accent of [
        '#D9480F',
        '#1864AB',
        '#2F9E44',
        '#AE3EC9',
        '#777777',
      ]) {
        const app = appColour(accent, 'light');
        const a = hueOf(accent);
        const b = hueOf(app);
        const apart = Math.abs(((((b.h - a.h) % 360) + 540) % 360) - 180);
        if (a.c > 0.03) expect(apart).toBeGreaterThan(90);
        expect(b.c).toBeGreaterThan(0.08);
      }
      const pal = uiPalette({ ...PLAIN_LOOK }, 'dark');
      expect(pal.theme).toBe('dark');
      expect(pal.dark.bg).not.toBe(pal.light.bg);
    });
  });

  describe('on the desk', () => {
    it.each(['wide', 'tall'] as const)(
      'stands one device in the middle of a %s desk, whole and big',
      (shape) => {
        const { w: W, h: H } = DESK[shape];
        for (const device of UI_DEVICES) {
          const made = deviceFor(`ui.${device}`, { screen: 'product' })!;
          const [placed] = placeDevices(
            [{ device, box: made.piece.box }],
            shape,
          );
          const [x, y, w, h] = placed.box;
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(W + 0.5);
          expect(y + h).toBeLessThanOrEqual(H + 0.5);
          expect(Math.max(w / W, h / H)).toBeGreaterThan(0.45);
          expect(Math.abs(x + w / 2 - W / 2)).toBeLessThan(1);
          expect(placed.at.y).toBeCloseTo(y + h, 0);
        }
        expect(uiDesk(PLAIN_LOOK, shape).box).toEqual([0, 0, W, H]);
      },
    );

    it.each(['wide', 'tall'] as const)(
      'stands a before and an after side by side at one scale on a %s desk',
      (shape) => {
        const { w: W, h: H } = DESK[shape];
        const box = deviceFor('ui.phone', { screen: 'product' })!.piece.box;
        const [a, b] = placeDevices(
          [
            { device: 'phone', box },
            { device: 'phone', box },
          ],
          shape,
        );
        expect(a.k).toBeCloseTo(b.k, 6);
        expect(a.box[0] + a.box[2]).toBeLessThan(b.box[0]);
        expect(b.box[0] + b.box[2]).toBeLessThanOrEqual(W);
        expect(a.box[3]).toBeGreaterThan(H * 0.35);
      },
    );

    it('puts a part of a device where the device stands, and the cursor’s tip on a point', () => {
      const made = deviceFor('ui.phone', { screen: 'product' })!;
      const [placed] = placeDevices(
        [{ device: 'phone', box: made.piece.box }],
        'wide',
      );
      const btn = boxOnDesk(
        placed,
        made.piece.box,
        made.parts['btn-primary'].box,
      );
      expect(btn[0]).toBeGreaterThan(placed.box[0]);
      expect(btn[1] + btn[3]).toBeLessThan(placed.box[1] + placed.box[3]);
      const cursor = makeCursor(kitStyle(LOOK));
      expect(validateRig(cursor)).toEqual([]);
      expect(cursor.rig.cursor).toEqual({ tip: [0, 0] });
      expect(cursor.rig.moves).toEqual([
        'enter',
        'exit',
        'move-to',
        'click',
        'drag',
        'scroll',
        'type',
      ]);
      const size = cursorSize('wide', cursor.box);
      const feet = cursorFeet([500, 300], size, cursor.box);
      const k = size / cursor.box[3];
      // The feet are the box's foot middle; the tip sits at (0, 0) of the piece.
      expect(feet.x - k * (cursor.box[0] + cursor.box[2] / 2)).toBeCloseTo(
        500,
        0,
      );
      expect(feet.y - k * (cursor.box[1] + cursor.box[3])).toBeCloseTo(300, 0);
    });
  });

  it('builds the same piece for the same settings, whatever was built before', () => {
    const a = makeDevice('phone', specOf({ screen: 'feed' }), PLAIN_LOOK, 11)
      .piece.svg;
    makeDevice('laptop', specOf({ screen: 'dashboard' }), PLAIN_LOOK, 2);
    const b = makeDevice('phone', specOf({ screen: 'feed' }), PLAIN_LOOK, 11)
      .piece.svg;
    expect(a).toBe(b);
  });
});

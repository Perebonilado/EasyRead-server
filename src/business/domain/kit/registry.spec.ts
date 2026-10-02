/**
 * The registry: every id of the kit makes a sound piece in both shapes
 * for several seeds; settings are read as the nearest on their lists or
 * their defaults; a show's look is offered only its own pieces; the
 * board's guide names each id with its settings and moves.
 */
import type { ShotLookDto } from '../../../contracts';
import {
  KIT,
  KIT_IDS,
  kitGuide,
  kitIdsFor,
  makeKit,
  paramsOf,
} from './registry';
import { validateRig } from './rig';
import { kitStyle } from './style';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    sides: { North: '#0050BE' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};

describe('the kit', () => {
  it.each(KIT_IDS)(
    '%s makes a sound piece in both shapes for several seeds',
    (id) => {
      for (const shape of ['wide', 'tall'] as const)
        for (const seed of [1, 7, 42, 1234]) {
          const style = kitStyle(LOOK, { shape });
          const piece = KIT[id].make(paramsOf(id, {}), style, seed);
          expect(validateRig(piece)).toEqual([]);
          expect(piece.svg.length).toBeLessThan(400_000);
          expect(makeKit(id, {}, style, seed)).not.toBeNull();
        }
    },
  );

  it('reads settings as the nearest on their lists, numbers into their ranges', () => {
    expect(
      paramsOf('people.person', { pose: 'Walking', era: 'today' }),
    ).toMatchObject({
      pose: 'walking',
      era: 'today',
    });
    expect(paramsOf('people.person', { pose: 'points' }).pose).toBe('pointing');
    expect(paramsOf('people.person', { pose: 'juggling' }).pose).toBe(
      'standing',
    );
    expect(paramsOf('people.group', { count: '40' }).count).toBe(12);
    expect(paramsOf('people.group', { count: 'seven' }).count).toBe(5);
    expect(paramsOf('people.crowd', { count: '45,000' }).count).toBe(45000);
    // A setting the piece has not is dropped; the colour is code's, never the board's.
    expect(
      paramsOf('people.person', { colour: 'red', tail: 'long' }),
    ).not.toHaveProperty('colour');
  });

  it('offers a show only its look’s pieces', () => {
    expect(kitIdsFor('editorial')).toEqual(
      expect.arrayContaining(['people.person', 'people.crowd']),
    );
    for (const id of kitIdsFor('illustrated'))
      expect(KIT[id].looks).toContain('illustrated');
    expect(kitIdsFor('illustrated')).not.toContain('people.person');
  });

  it('guides the board: each id, its settings and its moves', () => {
    const guide = kitGuide('editorial');
    for (const id of kitIdsFor('editorial'))
      expect(guide).toContain(`- ${id}:`);
    expect(guide).toMatch(/count 3–12/);
    expect(guide).toMatch(/Moves: enter, exit/);
  });

  it('makes nothing for an id it does not have', () => {
    expect(makeKit('people.student', {}, kitStyle(LOOK), 1)).toBeNull();
  });
});

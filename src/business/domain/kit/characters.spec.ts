/**
 * The illustrated look's characters: every id, pose and dress makes a
 * sound piece in both shapes for several seeds; a group is never clones;
 * the same settings and seed draw the same piece; the faces a state turns
 * to are drawn hidden beside the one worn; only an illustrated show is
 * offered characters; and the wardrobe reads dress only from the words.
 */
import type { ShotLookDto } from '../../../contracts';
import {
  CHARACTER_KIT,
  CHARACTER_POSES,
  FACE_STATES,
  characterSpec,
  drawCharacter,
  marchTurns,
} from './characters';
import { KIT, kitGuide, kitIdsFor, makeKit, paramsOf } from './registry';
import { partTree, validateRig } from './rig';
import { kitStyle } from './style';
import { CLOTH, EXPRESSIONS, outfitOf } from './wardrobe';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    sides: { Rome: '#B83A2E', Arabs: '#2F7D4A' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const wide = kitStyle(LOOK, { look: 'illustrated' });
const tall = kitStyle(LOOK, { look: 'illustrated', shape: 'tall' });

const make = (
  id: string,
  params: Record<string, unknown>,
  seed: number,
  style = wide,
) => {
  const made = makeKit(id, params, style, seed, 'Rome');
  if (!made) {
    const raw = KIT[id].make(
      { ...(params as Record<string, string>), colour: 'Rome' },
      style,
      seed,
    );
    throw new Error(
      `${id} ${JSON.stringify(params)} #${seed}: ${validateRig(raw).join('; ')}`,
    );
  }
  return made.piece;
};

const DRESSES = [
  'Roman legionary',
  'Arab horseman, white keffiyeh, brown robe',
  'a 19th-century officer in a blue coat, pickelhaube',
  'medieval king',
  'monk',
  'Viking',
  'Inca, red unku',
  'Mamluk soldier',
  'pharaoh',
  'woman in a long green dress, bonnet',
  'samurai',
  'factory worker',
  '',
];

describe('the illustrated characters', () => {
  it('makes a sound piece for every pose and dress, in both shapes, for several seeds', () => {
    for (const style of [wide, tall])
      for (const seed of [1, 2, 3]) {
        for (const pose of CHARACTER_POSES)
          expect(
            validateRig(make('character.person', { pose }, seed, style)),
          ).toEqual([]);
        for (const dress of DRESSES)
          expect(
            validateRig(
              make('character.person', { dress, era: 'medieval' }, seed, style),
            ),
          ).toEqual([]);
        for (const pose of ['standing', 'cheering', 'marching'])
          for (const count of [2, 4, 6])
            expect(
              validateRig(
                make(
                  'character.group',
                  { pose, count, dress: 'Roman legionaries', era: 'ancient' },
                  seed,
                  style,
                ),
              ),
            ).toEqual([]);
      }
  });

  it('draws each character to the figure standard, its face, hat, prop and shield parts its own', () => {
    const piece = make(
      'character.person',
      { dress: 'Roman legionary', era: 'ancient', expression: 'angry' },
      4,
    );
    expect(piece.rig.figures).toEqual([{ prefix: '', facing: 0 }]);
    for (const part of [
      'head',
      'face',
      'hat',
      'prop',
      'shield',
      'torso',
      'skirt',
    ])
      expect(piece.parts).toHaveProperty(part);
    const { parent } = partTree(piece.svg);
    // The face, the hidden faces and the hat turn with the head; the prop with the forearm that holds it.
    expect(parent.get('face')).toBe('head');
    expect(parent.get('hat')).toBe('head');
    expect(parent.get('prop')).toMatch(/^forearm-[lr]$/);
    expect(parent.get('shield')).toMatch(/^forearm-[lr]$/);
    // The other faces are drawn hidden, each a state that shows it.
    for (const face of FACE_STATES.filter((f) => f !== 'angry')) {
      expect(piece.svg).toContain(`data-part="face-${face}" opacity="0"`);
      expect(piece.rig.states[face]).toMatchObject({
        face: { opacity: 0 },
        [`face-${face}`]: { opacity: 1 },
      });
      // At rest every other face is named hidden, so a change crossfades.
      expect(piece.rig.states.rest[`face-${face}`]).toEqual({ opacity: 0 });
    }
  });

  it('draws a walk or a march in profile, facing the way it goes', () => {
    const right = make('character.person', { pose: 'marching' }, 5);
    expect(right.rig.figures).toEqual([{ prefix: '', facing: 1 }]);
    const left = make(
      'character.person',
      { pose: 'walking', facing: 'left' },
      5,
    );
    expect(left.rig.figures).toEqual([{ prefix: '', facing: -1 }]);
    const column = make(
      'character.group',
      {
        pose: 'marching',
        count: 4,
        dress: 'Roman legionaries',
        era: 'ancient',
      },
      5,
    );
    expect(column.rig.figures?.map((f) => f.facing)).toEqual([1, 1, 1, 1]);
  });

  it('draws a group of different people, never clones, each a figure of its own', () => {
    for (const seed of [11, 12, 13]) {
      const group = make(
        'character.group',
        { count: 5, dress: 'Vikings', era: 'medieval' },
        seed,
      );
      expect(group.rig.figures?.map((f) => f.prefix)).toEqual([
        'f1.',
        'f2.',
        'f3.',
        'f4.',
        'f5.',
      ]);
      // Each figure's head, drawn where it stands, is its own drawing.
      const heads = [1, 2, 3, 4, 5].map((k) => {
        const at = group.svg.indexOf(`data-part="f${k}.head"`);
        const end = group.svg.indexOf('data-part="f', at + 10);
        return group.svg
          .slice(at, end)
          .replace(/matrix\([^)]*\)/g, '')
          .replace(/f\d\./g, '');
      });
      expect(new Set(heads).size).toBe(5);
    }
    // Two seeds draw two different groups.
    const a = make('character.group', { count: 3 }, 21).svg;
    const b = make('character.group', { count: 3 }, 22).svg;
    expect(a).not.toEqual(b);
  });

  it('draws the same piece for the same settings and seed, every time', () => {
    const params = {
      dress: 'Arab horseman, white keffiyeh',
      pose: 'pointing',
      expression: 'happy',
    };
    const first = make('character.person', params, 31);
    const again = make('character.person', params, 31);
    expect(again).toEqual(first);
  });

  it('turns a march by its phase alone, the legs and arms opposite', () => {
    for (const phase of [0, 0.13, 0.25, 0.5, 0.77])
      expect(marchTurns(phase, true)).toEqual(marchTurns(phase, true));
    const up = marchTurns(0.25, true);
    const down = marchTurns(0.75, true);
    expect(up['thigh-l']).toBeCloseTo(-(down['thigh-l'] ?? 0), 6);
    expect(Math.sign(up['thigh-l'] ?? 0)).toBe(-Math.sign(up['thigh-r'] ?? 0));
    expect(Math.sign(up['arm-l'] ?? 0)).toBe(-Math.sign(up['thigh-l'] ?? 0));
  });

  it('wears every expression it is given', () => {
    for (const expression of EXPRESSIONS) {
      const spec = characterSpec({ expression }, wide, 41);
      expect(spec.expression).toBe(expression);
      const ink = { colour: '#111111', line: 2.2, thin: 1.2, id: () => 'x' };
      const drawn = drawCharacter(
        spec,
        { at: [0, 0], facing: 0, prefix: '', parent: null },
        ink,
      );
      expect(drawn.parts.find((p) => p.id === 'face')?.markup).toContain(
        '<path',
      );
    }
  });

  it('labels a named character in its notes, from its own words', () => {
    const piece = make(
      'character.person',
      {
        name: 'Charles Darwin',
        dress: 'white beard, black frock coat',
        era: '1800-1900',
      },
      51,
    );
    expect(piece.notes?.[0]).toMatch(/Charles Darwin/);
  });
});

describe('the look decides the kit', () => {
  it('offers characters only to an illustrated show, and silhouettes only to an editorial one', () => {
    expect(kitIdsFor('illustrated')).toEqual(
      expect.arrayContaining(['character.person', 'character.group']),
    );
    for (const id of Object.keys(CHARACTER_KIT))
      expect(kitIdsFor('editorial')).not.toContain(id);
    expect(kitIdsFor('illustrated')).not.toContain('people.person');
    expect(kitGuide('illustrated')).toContain('- character.person:');
    expect(kitGuide('editorial')).not.toContain('character.');
    // The dress is the research's words, kept as said.
    expect(kitGuide('illustrated')).toMatch(/dress in words/);
  });

  it('keeps a character’s dress and name as words, trimmed and cut at a word', () => {
    const params = paramsOf('character.person', {
      dress: '  Roman   legionary, red tunic <b>banded</b> armour ',
      name: 'Julius Caesar',
    });
    expect(params.dress).toBe('Roman legionary, red tunic b banded /b armour');
    expect(params.name).toBe('Julius Caesar');
    const long = paramsOf('character.person', {
      dress: 'a '.repeat(80) + 'end',
    });
    expect(String(long.dress).length).toBeLessThanOrEqual(90);
  });
});

describe('the wardrobe', () => {
  const pick = <T>(list: readonly T[]) => list[0];
  const dress = (
    words: string,
    role: 'person' | 'soldier' = 'person',
    era = 'ancient' as const,
  ) => outfitOf(words, { role, era, side: '#123456', pick }).outfit;

  it('dresses a kind of character the words name, as it was worn', () => {
    const legionary = dress('Roman legionaries marching');
    expect(legionary).toMatchObject({
      top: 'armour',
      armour: 'bands',
      head: 'crested-helmet',
      shield: 'scutum',
      prop: 'spear',
      shieldColour: '#123456',
    });
    const horseman = dress('Arab horseman, white keffiyeh, brown robe');
    expect(horseman).toMatchObject({
      top: 'robe',
      head: 'keffiyeh',
      main: CLOTH.brown,
    });
    expect(horseman.headColour).toBe(CLOTH.white);
  });

  it('keeps a soldier’s uniform when the words call it a coat, in the colour they say', () => {
    const officer = outfitOf('a 19th-century officer in a blue coat', {
      role: 'person',
      era: '1800-1900',
      side: '#123456',
      pick,
    });
    expect(officer.outfit.top).toBe('uniform');
    expect(officer.outfit.main).toBe(CLOTH.blue);
  });

  it('never dresses anyone in a culture’s dress the words do not name', () => {
    for (const era of [
      'ancient',
      'medieval',
      '1500-1800',
      '1800-1900',
      'today',
    ] as const)
      for (const role of [
        'person',
        'soldier',
        'ruler',
        'merchant',
        'farmer',
      ] as const) {
        const plain = outfitOf('', { role, era, side: '#123456', pick }).outfit;
        expect([
          'keffiyeh',
          'turban',
          'turban-helmet',
          'nemes',
          'fez',
          'gat',
          'kufi',
          'headband',
        ]).not.toContain(plain.head);
        expect(['unku', 'kilt', 'toga']).not.toContain(plain.top);
      }
  });
});

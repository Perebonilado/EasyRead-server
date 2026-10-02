import type { ShotLookDto } from '../../../contracts';
import { BUILDING_KINDS, CLIMATES, drawBuilding } from './buildings';
import { DOCUMENT_KINDS, drawDocument } from './documents';
import { ERA_IDS } from './eras';
import { HP_RATIO, MACHINE_KINDS, MACHINE_LAYOUTS, drawTurbofan, ratiosOf } from './machines';
import { OBJECT_KINDS, drawObject } from './objects';
import { KIT, kitGuide, kitIdsFor, makeKit, unknownOf } from './registry';
import { type KitPiece, validateRig } from './rig';
import { type KitLook, kitStyle } from './style';
import { THINGS_KIT } from './things';

const LOOK: ShotLookDto = {
  palette: { paper: '#FBF7EF', ink: '#1F2A37', muted: '#5B6675', accent: '#E0663A', sides: { North: '#0050BE' } },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};
const LOOKS: KitLook[] = ['editorial', 'illustrated'];
const styleOf = (look: KitLook) => kitStyle(LOOK, { look });

/** What is wrong with a piece beyond the rig's own checks: its parts far outside it, its focal outside it. */
function inside(piece: KitPiece): string[] {
  const [bx, by, bw, bh] = piece.box;
  const out: string[] = [];
  const slack = Math.max(bw, bh) * 0.05;
  for (const [id, part] of Object.entries(piece.parts)) {
    const [x, y, w, h] = part.box;
    if (w === 0 && h === 0) continue;
    if (x < bx - slack || y < by - slack || x + w > bx + bw + slack || y + h > by + bh + slack) out.push(`${id} outside its piece`);
  }
  return out;
}

describe('the things kit (buildings, documents, objects, machines)', () => {
  const cases: [string, Record<string, unknown>][] = [
    ...BUILDING_KINDS.map((kind): [string, Record<string, unknown>] => ['building', { kind }]),
    ...DOCUMENT_KINDS.map((kind): [string, Record<string, unknown>] => ['document', { kind }]),
    ...OBJECT_KINDS.map((kind): [string, Record<string, unknown>] => ['object', { kind }]),
    ...MACHINE_KINDS.map((kind): [string, Record<string, unknown>] => ['machine', { kind }]),
    ['machine.turbofan', {}],
    ['machine.turbofan', { bypass: 'low', hp: 6, lpt: 3 }],
  ];

  it.each(LOOKS)('draws every piece sound in the %s look, for several seeds, its parts and focal inside it', (look) => {
    for (const [id, params] of cases)
      for (const seed of [1, 7, 4242]) {
        const made = makeKit(id, params, styleOf(look), seed);
        if (!made) throw new Error(`${id} ${JSON.stringify(params)} failed its checks: ${JSON.stringify(validateRig(KIT[id].make({ ...params } as never, styleOf(look), seed)).slice(0, 4))}`);
        expect(inside(made.piece)).toEqual([]);
        expect(made.piece.svg).toMatch(/^<svg[^>]*viewBox="/);
        expect(made.piece.box[1] + made.piece.box[3]).toBeCloseTo(0, 0);
      }
  });

  it('draws the same piece for the same seed, every time', () => {
    for (const [id, params] of cases) {
      const a = makeKit(id, params, styleOf('editorial'), 11)!.piece;
      const b = makeKit(id, params, styleOf('editorial'), 11)!.piece;
      expect(b.svg).toBe(a.svg);
      expect(b.parts).toEqual(a.parts);
    }
  });

  it('outlines the illustrated look and leaves the editorial look without outlines', () => {
    const editorial = makeKit('building', { kind: 'factory' }, styleOf('editorial'), 1)!.piece.svg;
    const illustrated = makeKit('building', { kind: 'factory' }, styleOf('illustrated'), 1)!.piece.svg;
    expect(editorial).not.toMatch(/stroke-width="[\d.]+" stroke-linejoin/);
    expect(illustrated).toMatch(/stroke-width="[\d.]+" stroke-linejoin/);
  });

  it('is offered to the board in both looks, one line a family', () => {
    for (const look of LOOKS) {
      const ids = kitIdsFor(look);
      for (const id of Object.keys(THINGS_KIT)) expect(ids).toContain(id);
      expect(kitGuide(look)).toMatch(/- building: .*Settings: kind house \| flats/);
      expect(kitGuide(look)).toMatch(/- machine\.turbofan: .*core-flow/);
    }
  });

  it('reads the words people use for a kind, and draws nothing for a kind it does not have, never its default', () => {
    const kindOf = (id: string, kind: string) => makeKit(id, { kind }, styleOf('editorial'), 1)?.params.kind;
    expect(kindOf('object', 'laptop')).toBe('computer');
    expect(kindOf('object', 'padlock')).toBe('lock');
    expect(kindOf('object', 'oil drum')).toBe('barrel');
    expect(kindOf('document', 'treaty')).toBe('charter');
    expect(kindOf('building', 'skyscraper')).toBe('tower');
    expect(kindOf('building', 'Factories')).toBe('factory');
    expect(kindOf('machine', 'waterwheel')).toBe('water-wheel');
    // Not coins for a microscope, not a house for a power station.
    expect(unknownOf('object', { kind: 'microscope' })).toEqual(['kind']);
    expect(makeKit('object', { kind: 'microscope' }, styleOf('editorial'), 1)).toBeNull();
    expect(makeKit('building', { kind: 'power station' }, styleOf('editorial'), 1)).toBeNull();
    // A kind left out is the default.
    expect(makeKit('building', {}, styleOf('editorial'), 1)?.params.kind).toBe('house');
  });
});

describe('buildings', () => {
  it('follow era and climate, never a country: flat roofs where it is dry, steep where it is cold, glass for today’s towers', () => {
    const style = styleOf('editorial');
    const arid = drawBuilding('house', { era: 'today', climate: 'arid', size: 'small', material: 'auto' }, style, 2);
    const cold = drawBuilding('house', { era: '1900-1945', climate: 'cold', size: 'medium', material: 'auto' }, style, 2);
    // A pitched roof rises above its walls by much more than a parapet does.
    const rise = (piece: KitPiece) => piece.parts.walls.box[1] - piece.parts.roof.box[1];
    expect(rise(cold)).toBeGreaterThan(rise(arid) * 3);
    expect(drawBuilding('tower', { era: 'today', climate: 'temperate', size: 'medium', material: 'auto' }, style, 1).notes?.[0]).toMatch(/^glass/);
    expect(drawBuilding('factory', { era: '1800-1900', climate: 'temperate', size: 'large', material: 'auto' }, style, 1).notes?.[0]).toMatch(/^brick/);
    for (const era of ERA_IDS)
      for (const climate of CLIMATES)
        expect(validateRig(drawBuilding('school', { era, climate, size: 'medium', material: 'auto' }, style, 3))).toEqual([]);
  });

  it('has its parts to one standard: walls, roof, windows, their lights, door; a factory’s stacks with smoke at their tops; a hall’s flag', () => {
    const style = styleOf('editorial');
    const factory = drawBuilding('factory', { era: '1900-1945', climate: 'temperate', size: 'large', material: 'auto' }, style, 1);
    for (const part of ['building', 'walls', 'roof', 'windows', 'lights', 'door', 'chimney', 'smoke', 'chimney-2', 'smoke-2'])
      expect(factory.parts[part]).toBeDefined();
    // The smoke rises from the top of its stack.
    expect(factory.parts.smoke.box[1]).toBeLessThanOrEqual(factory.parts.chimney.box[1] + 5);
    const hall = drawBuilding('hall', { era: '1900-1945', climate: 'temperate', size: 'medium', material: 'auto' }, style, 1);
    expect(hall.parts.flag).toBeDefined();
    // Its lights go out by day.
    expect(factory.rig.states.day).toEqual({ lights: { opacity: 0 } });
  });

  it('wears a side’s colour when the board gives one, and its brick otherwise', () => {
    const style = styleOf('editorial');
    const brick = drawBuilding('house', { era: 'today', climate: 'temperate', size: 'medium', material: 'brick' }, style, 1);
    const side = drawBuilding('house', { era: 'today', climate: 'temperate', size: 'medium', material: 'brick', colour: 'North' }, style, 1);
    expect(side.colours).toEqual(['side']);
    expect(brick.colours).toEqual(['brick']);
    expect(side.svg).not.toBe(brick.svg);
    // The ink is no side: a building given no side keeps its brick.
    expect(drawBuilding('house', { era: 'today', climate: 'temperate', size: 'medium', material: 'brick', colour: 'ink' }, style, 1).svg).toBe(brick.svg);
  });
});

describe('documents', () => {
  it('show no words of their own: their lines are bars', () => {
    for (const kind of DOCUMENT_KINDS) expect(drawDocument(kind, {}, styleOf('editorial'), 3).svg).not.toContain('<text');
  });

  it('set a caller’s words from the research escaped, eight at most', () => {
    const piece = drawDocument('newspaper', { text: 'War <ends> & peace "at last" in the north and south and east' }, styleOf('editorial'), 3);
    expect(piece.svg).toContain('War &lt;ends&gt; &amp; peace');
    expect(piece.svg).not.toContain('<ends>');
    expect(piece.svg).not.toContain(' east<');
  });

  it('have a spot a stamp lands on, a signature the draw recipe writes, and a ballot’s cross as its marked state', () => {
    const letter = drawDocument('letter', {}, styleOf('editorial'), 1);
    expect(letter.parts.stamp.box[2]).toBeGreaterThan(0);
    expect(letter.parts.signature.path).toMatch(/^M[\d.-]+ [\d.-]+C/);
    const ballot = drawDocument('ballot', {}, styleOf('editorial'), 1);
    expect(ballot.rig.states.blank).toEqual({ cross: { opacity: 0 } });
    expect(ballot.parts['box-1']).toBeDefined();
  });

  it('never draws a currency: no figure on a note unless the line gives one', () => {
    expect(drawDocument('note', {}, styleOf('editorial'), 1).svg).not.toContain('<text');
    expect(drawDocument('note', { value: 20 }, styleOf('editorial'), 1).svg).toContain('>20<');
  });
});

describe('objects', () => {
  it('count: a stack of coins as many as it is given, its value the count', () => {
    const five = drawObject('coins', { count: 5 }, styleOf('editorial'), 1);
    const twelve = drawObject('coins', { count: 12 }, styleOf('editorial'), 1);
    expect(five.parts.stack.value).toBe(5);
    expect(twelve.parts.stack.value).toBe(12);
    expect(twelve.parts.stack.box[3]).toBeGreaterThan(five.parts.stack.box[3]);
  });

  it('change by their states: a screen lights, a lamp goes out, a lock opens', () => {
    const style = styleOf('editorial');
    expect(drawObject('phone', {}, style, 1).rig.states.on).toEqual({ 'screen-off': { opacity: 0 } });
    expect(drawObject('lamp', {}, style, 1).rig.states.off).toEqual({ light: { opacity: 0 } });
    expect(drawObject('lock', {}, style, 1).rig.states.open.shackle.rotate).toBeLessThan(0);
    expect(drawObject('battery', { count: 4 }, style, 1).parts.charge.value).toBe(0.4);
  });
});

describe('machines', () => {
  it('turn meshed gears the other way at the ratio of their sizes, and pulleys on a belt the same way', () => {
    const gears = ratiosOf(MACHINE_LAYOUTS.gears);
    const [g1, g2, g3] = ['gear-1', 'gear-2', 'gear-3'].map((id) => MACHINE_LAYOUTS.gears.parts.find((p) => p.id === id)!);
    expect(gears.get('gear-1')).toBe(1);
    expect(gears.get('gear-2')).toBeCloseTo(-(g1.r! / g2.r!), 6);
    expect(gears.get('gear-3')).toBeCloseTo(g1.r! / g3.r!, 6);
    // Meshed neighbours touch: their middles as far apart as their radii (less their teeth's overlap).
    expect(Math.abs(g2.at[0] - g1.at[0])).toBeCloseTo(g1.r! + g2.r! - 4, 6);
    const pulleys = ratiosOf(MACHINE_LAYOUTS.pulleys);
    expect(pulleys.get('pulley-2')).toBeCloseTo(50 / 24, 6);
    expect(pulleys.get('pulley-2')).toBeGreaterThan(0);
  });

  it('give each turning part its ratio as its value and its move in the rig', () => {
    for (const kind of MACHINE_KINDS) {
      const piece = KIT.machine.make({ kind }, styleOf('editorial'), 1);
      const machine = piece.rig.machine!;
      expect(machine.turns).toBeGreaterThan(0);
      expect(Object.keys(machine.parts).length).toBeGreaterThan(0);
      for (const [id, how] of Object.entries(machine.parts)) {
        expect(piece.parts[id]).toBeDefined();
        if (how.move === 'spin') expect(Number.isFinite(piece.parts[id].value)).toBe(true);
        if (how.move === 'belt') expect(piece.parts[id].path).toBeTruthy();
        if (how.move === 'slide') expect(how.stroke).toBeGreaterThan(0);
      }
    }
    const gears = KIT.machine.make({ kind: 'gears' }, styleOf('editorial'), 1);
    expect(gears.parts['gear-2'].value).toBeCloseTo(-2, 3);
    const [px, py] = gears.parts['gear-2'].pivot!;
    expect(px).toBeCloseTo(0.5, 1);
    expect(py).toBeCloseTo(0.5, 1);
  });
});

describe('the turbofan cutaway', () => {
  const piece = drawTurbofan({ lp: 3, hp: 9, hpt: 2, lpt: 5, bypass: 'high' }, styleOf('editorial'));

  it('has every part named, its stages counted from its settings', () => {
    for (const part of ['fan', 'spinner', 'compressor', 'lp-compressor', 'hp-compressor', 'combustor', 'fuel-nozzle', 'igniter', 'turbine', 'hp-turbine', 'lp-turbine', 'nozzle', 'lp-shaft', 'hp-shaft', 'casing', 'nacelle', 'bypass', 'core', 'hub', 'exhaust'])
      expect(piece.parts[part]).toBeDefined();
    const count = (prefix: string) => Object.keys(piece.parts).filter((id) => new RegExp(`^${prefix}-\\d+$`).test(id)).length;
    expect([count('lp-compressor'), count('hp-compressor'), count('hp-turbine'), count('lp-turbine')]).toEqual([3, 9, 2, 5]);
    const fewer = drawTurbofan({ lp: 2, hp: 5, hpt: 1, lpt: 3, bypass: 'low' }, styleOf('editorial'));
    expect(Object.keys(fewer.parts).filter((id) => /^hp-compressor-\d+$/.test(id))).toHaveLength(5);
  });

  it('lays its stages in order along the flow: fan, compressors, combustor, turbines, nozzle', () => {
    const x = (part: string) => piece.parts[part].box[0];
    expect(x('fan')).toBeLessThan(x('lp-compressor'));
    expect(x('lp-compressor')).toBeLessThan(x('hp-compressor'));
    expect(x('hp-compressor')).toBeLessThan(x('combustor'));
    expect(x('combustor')).toBeLessThan(x('hp-turbine'));
    expect(x('hp-turbine')).toBeLessThan(x('lp-turbine'));
    expect(x('lp-turbine')).toBeLessThan(x('nozzle'));
  });

  it('has the core and bypass flows’ paths, the core’s value where its squeeze ends', () => {
    for (const id of ['core-flow', 'bypass-flow', 'core-flow-2', 'bypass-flow-2']) {
      expect(piece.parts[id].path).toMatch(/^M[\d.-]+ [\d.-]+C/);
      expect(piece.parts[id].box[2]).toBeGreaterThan(300);
    }
    const squeeze = piece.parts['core-flow'].value!;
    expect(squeeze).toBeGreaterThan(0.3);
    expect(squeeze).toBeLessThan(0.8);
  });

  it('turns its high-pressure spool faster than its low, each rotor row running along its row', () => {
    const machine = piece.rig.machine!;
    expect(machine.parts.fan.move).toBe('belt');
    const speed = (id: string) => piece.parts[id].value! / (2 * Math.PI);
    const radiusOf = (id: string) => piece.parts[id].box[3];
    expect(machine.parts['hp-compressor-1'].move).toBe('belt');
    // Per unit of its row's size, the high-pressure spool runs HP_RATIO times the low.
    expect(speed('hp-turbine-1') / speed('lp-turbine-1')).toBeGreaterThan(HP_RATIO * 0.5);
    expect(radiusOf('fan')).toBeGreaterThan(radiusOf('hp-compressor-1'));
  });

  it('fills nearly all of its box, so framed as its shot’s subject it fills seven tenths of a wide frame', () => {
    expect(piece.focal[2] / piece.box[2]).toBeGreaterThan(0.95);
    expect(validateRig(piece)).toEqual([]);
  });
});

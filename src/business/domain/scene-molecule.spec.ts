import {
  KNOWN_MOLECULES,
  moleculeOf,
  moleculePartNames,
  moleculesIn,
} from './scene-molecule-names';
import { renderMolecule } from './scene-molecule';

const known = (key: string) => KNOWN_MOLECULES.find((m) => m.key === key)!;

describe('molecules: the table', () => {
  it('holds each structure to its formula, as openchemlib reads it', async () => {
    const { Molecule } = await import('openchemlib');
    for (const one of KNOWN_MOLECULES)
      expect([
        one.key,
        Molecule.fromSmiles(one.smiles).getMolecularFormula().formula,
      ]).toEqual([one.key, one.formula]);
  });

  it('has the molecules a lesson names most, and each name once', () => {
    for (const key of [
      'water',
      'carbon-dioxide',
      'oxygen',
      'methane',
      'ethanol',
      'ammonia',
      'glucose',
      'sodium-chloride',
      'caffeine',
      'aspirin',
      'adenine',
      'guanine',
      'cytosine',
      'thymine',
      'uracil',
    ])
      expect(known(key)).toBeDefined();
    const keys = KNOWN_MOLECULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ['water', 'water'],
    ['H2O', 'water'],
    ['H₂O', 'water'],
    ['a glucose molecule', 'glucose'],
    ['Structure of caffeine', 'caffeine'],
    ['CO2', 'carbon-dioxide'],
    ['acetylsalicylic acid', 'aspirin'],
    ['acetaminophen', 'paracetamol'],
    ['table salt', 'sodium-chloride'],
    ['NaCl', 'sodium-chloride'],
    ['Ethanoic acid', 'acetic-acid'],
    ['sulphuric acid', 'sulfuric-acid'],
  ])('%s is %s', (name, key) => {
    expect(moleculeOf(name)?.key).toBe(key);
  });

  it('never makes up a structure: a molecule it does not know is null', () => {
    expect(moleculeOf('unobtainium')).toBeNull();
    expect(moleculeOf('DNA')).toBeNull();
    expect(moleculeOf('haemoglobin')).toBeNull();
    expect(moleculeOf('')).toBeNull();
  });

  it('finds the molecules a sentence names', () => {
    expect(
      moleculesIn('the structural formula of glucose beside water').map(
        (m) => m.key,
      ),
    ).toEqual(['glucose', 'water']);
  });
});

describe('molecules: drawn by code', () => {
  it('draws a small molecule atom by atom: water is an oxygen and two hydrogens', async () => {
    const drawn = await renderMolecule(known('water'), 'wide');
    expect(Object.keys(drawn.parts).sort()).toEqual(['hydrogen', 'oxygen']);
    expect(drawn.svg.match(/>H</g)).toHaveLength(2);
    expect(drawn.svg.match(/>O</g)).toHaveLength(1);
  });

  it('draws a larger one as a skeleton, its other atoms written with their hydrogens', async () => {
    const glucose = await renderMolecule(known('glucose'), 'wide');
    expect(glucose.svg.match(/>O</g)?.length).toBe(6);
    expect(typeof glucose.parts.oxygen).toBe('string');
    expect(typeof glucose.parts.ring).toBe('string');
    const caffeine = await renderMolecule(known('caffeine'), 'wide');
    expect(caffeine.svg.match(/>N</g)).toHaveLength(4);
    expect(caffeine.parts['double bond']).toBeDefined();
  });

  it('has a group for every part the writer may point at, for every molecule it knows, small', async () => {
    for (const one of KNOWN_MOLECULES) {
      const drawn = await renderMolecule(one, 'wide');
      for (const name of moleculePartNames(one.smiles))
        expect([one.key, name, Boolean(drawn.parts[name])]).toEqual([
          one.key,
          name,
          true,
        ]);
      for (const id of new Set(Object.values(drawn.parts)))
        expect(drawn.svg).toContain(`id="${id}"`);
      expect(drawn.svg.length).toBeLessThan(30 * 1024);
    }
  });

  it('is turned to fit a tall frame, its words at least near its audience size', async () => {
    const wide = await renderMolecule(known('caffeine'), 'wide', 32);
    const tall = await renderMolecule(known('caffeine'), 'tall', 32);
    expect(tall.viewBox[2]).toBeLessThanOrEqual(720 + 1);
    expect(wide.smallest).toBeGreaterThanOrEqual(32 * 0.85);
    expect(tall.smallest).toBeGreaterThanOrEqual(32 * 0.85);
  });
});

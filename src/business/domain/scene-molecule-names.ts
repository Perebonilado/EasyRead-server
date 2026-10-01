/**
 * The molecules code knows by name, each with its structure written once
 * here as SMILES and checked by its tests (its formula, as openchemlib
 * reads it). The writer only ever names a molecule; a structure is never
 * a model's to write, and a name not here is set as its name in type.
 *
 * Common ones across school and everyday science, from anywhere: the
 * air and water, fuels, foods and sugars, medicines, the bases of DNA,
 * acids and salts.
 */

export interface KnownMolecule {
  /** Its key in this table. */
  key: string;
  /** Its name as the stage writes it. */
  name: string;
  /** Its structure, as SMILES. */
  smiles: string;
  /** Its formula, as the tests hold it to (Hill order, as openchemlib writes it). */
  formula: string;
  /** Other names it goes by, and its formula as people write it. */
  aliases: string[];
}

const M = (
  key: string,
  name: string,
  smiles: string,
  formula: string,
  aliases: string[] = [],
): KnownMolecule => ({ key, name, smiles, formula, aliases });

export const KNOWN_MOLECULES: readonly KnownMolecule[] = [
  // The air, water and simple gases.
  M('water', 'Water', 'O', 'H2O', ['h2o', 'dihydrogen monoxide']),
  M('carbon-dioxide', 'Carbon dioxide', 'O=C=O', 'CO2', ['co2']),
  M('carbon-monoxide', 'Carbon monoxide', '[C-]#[O+]', 'CO', []),
  M('oxygen', 'Oxygen', 'O=O', 'O2', ['o2', 'oxygen gas', 'dioxygen']),
  M('ozone', 'Ozone', '[O-][O+]=O', 'O3', ['o3']),
  M('nitrogen', 'Nitrogen', 'N#N', 'N2', ['n2', 'nitrogen gas', 'dinitrogen']),
  M('hydrogen', 'Hydrogen', '[H][H]', 'H2', [
    'h2',
    'hydrogen gas',
    'dihydrogen',
  ]),
  M('chlorine', 'Chlorine', 'ClCl', 'Cl2', ['cl2', 'chlorine gas']),
  M('ammonia', 'Ammonia', 'N', 'H3N', ['nh3']),
  M('sulfur-dioxide', 'Sulfur dioxide', 'O=S=O', 'O2S', [
    'so2',
    'sulphur dioxide',
  ]),
  M('nitrogen-dioxide', 'Nitrogen dioxide', '[O-][N+]=O', 'NO2', ['no2']),
  M('hydrogen-peroxide', 'Hydrogen peroxide', 'OO', 'H2O2', ['h2o2']),
  // Fuels and simple organic molecules.
  M('methane', 'Methane', 'C', 'CH4', ['ch4', 'natural gas']),
  M('ethane', 'Ethane', 'CC', 'C2H6', ['c2h6']),
  M('propane', 'Propane', 'CCC', 'C3H8', ['c3h8']),
  M('butane', 'Butane', 'CCCC', 'C4H10', ['c4h10']),
  M('ethene', 'Ethene', 'C=C', 'C2H4', ['ethylene', 'c2h4']),
  M('ethyne', 'Ethyne', 'C#C', 'C2H2', ['acetylene', 'c2h2']),
  M('benzene', 'Benzene', 'c1ccccc1', 'C6H6', ['c6h6']),
  M('methanol', 'Methanol', 'CO', 'CH4O', ['methyl alcohol', 'ch3oh']),
  M('ethanol', 'Ethanol', 'CCO', 'C2H6O', [
    'ethyl alcohol',
    'c2h5oh',
    'drinking alcohol',
  ]),
  M('glycerol', 'Glycerol', 'OCC(O)CO', 'C3H8O3', ['glycerine', 'glycerin']),
  M('acetic-acid', 'Ethanoic acid', 'CC(=O)O', 'C2H4O2', [
    'acetic acid',
    'ch3cooh',
  ]),
  M('urea', 'Urea', 'NC(N)=O', 'CH4N2O', ['carbamide']),
  // Sugars and foods.
  M('glucose', 'Glucose', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', 'C6H12O6', [
    'dextrose',
    'blood sugar',
    'c6h12o6',
  ]),
  M(
    'fructose',
    'Fructose',
    'OC[C@H]1O[C@](O)(CO)[C@@H](O)[C@@H]1O',
    'C6H12O6',
    ['fruit sugar'],
  ),
  M(
    'sucrose',
    'Sucrose',
    'OC[C@H]1O[C@@](CO)(O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@@H](O)[C@@H]1O',
    'C12H22O11',
    ['table sugar', 'sugar', 'c12h22o11'],
  ),
  M('lactic-acid', 'Lactic acid', 'CC(O)C(=O)O', 'C3H6O3', []),
  M('citric-acid', 'Citric acid', 'OC(=O)CC(O)(CC(=O)O)C(=O)O', 'C6H8O7', []),
  M('vitamin-c', 'Vitamin C', 'OC[C@H](O)[C@H]1OC(=O)C(O)=C1O', 'C6H8O6', [
    'ascorbic acid',
  ]),
  M('caffeine', 'Caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'C8H10N4O2', []),
  M(
    'capsaicin',
    'Capsaicin',
    'COc1cc(CNC(=O)CCCC/C=C/C(C)C)ccc1O',
    'C18H27NO3',
    [],
  ),
  // Medicines and the body's messengers.
  M('aspirin', 'Aspirin', 'CC(=O)Oc1ccccc1C(=O)O', 'C9H8O4', [
    'acetylsalicylic acid',
  ]),
  M('paracetamol', 'Paracetamol', 'CC(=O)Nc1ccc(O)cc1', 'C8H9NO2', [
    'acetaminophen',
  ]),
  M('ibuprofen', 'Ibuprofen', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', 'C13H18O2', []),
  M('nicotine', 'Nicotine', 'CN1CCC[C@H]1c1cccnc1', 'C10H14N2', []),
  M('dopamine', 'Dopamine', 'NCCc1ccc(O)c(O)c1', 'C8H11NO2', []),
  M('serotonin', 'Serotonin', 'NCCc1c[nH]c2ccc(O)cc12', 'C10H12N2O', []),
  M('adrenaline', 'Adrenaline', 'CNC[C@H](O)c1ccc(O)c(O)c1', 'C9H13NO3', [
    'epinephrine',
  ]),
  // The bases of DNA and RNA, and the simplest amino acids.
  M('adenine', 'Adenine', 'Nc1ncnc2[nH]cnc12', 'C5H5N5', []),
  M('guanine', 'Guanine', 'Nc1nc2[nH]cnc2c(=O)[nH]1', 'C5H5N5O', []),
  M('cytosine', 'Cytosine', 'Nc1cc[nH]c(=O)n1', 'C4H5N3O', []),
  M('thymine', 'Thymine', 'Cc1c[nH]c(=O)[nH]c1=O', 'C5H6N2O2', []),
  M('uracil', 'Uracil', 'O=c1cc[nH]c(=O)[nH]1', 'C4H4N2O2', []),
  M('glycine', 'Glycine', 'NCC(=O)O', 'C2H5NO2', []),
  M('alanine', 'Alanine', 'C[C@H](N)C(=O)O', 'C3H7NO2', []),
  // Acids, bases and salts.
  M('hydrochloric-acid', 'Hydrogen chloride', 'Cl', 'HCl', [
    'hydrochloric acid',
    'hcl',
  ]),
  M('sulfuric-acid', 'Sulfuric acid', 'OS(=O)(=O)O', 'H2O4S', [
    'sulphuric acid',
    'h2so4',
  ]),
  M('nitric-acid', 'Nitric acid', 'O[N+](=O)[O-]', 'HNO3', ['hno3']),
  M('carbonic-acid', 'Carbonic acid', 'OC(=O)O', 'CH2O3', ['h2co3']),
  M('sodium-chloride', 'Sodium chloride', '[Na+].[Cl-]', 'ClNa', [
    'nacl',
    'salt',
    'table salt',
    'common salt',
  ]),
  M('sodium-hydroxide', 'Sodium hydroxide', '[Na+].[OH-]', 'HONa', [
    'naoh',
    'caustic soda',
    'lye',
  ]),
  M('sodium-bicarbonate', 'Sodium bicarbonate', '[Na+].OC([O-])=O', 'CHO3Na', [
    'baking soda',
    'sodium hydrogen carbonate',
    'nahco3',
  ]),
  M('calcium-carbonate', 'Calcium carbonate', '[Ca+2].[O-]C([O-])=O', 'CO3Ca', [
    'caco3',
    'limestone',
    'chalk',
  ]),
];

/** A molecule's name reduced for matching: lower case, no "a", "molecule", "structure of" or punctuation. */
export function moleculeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(
      /\b(a|an|the|of|molecules?|structures?|structural|formula|skeletal|chemical|diagram|model|ball and stick|space filling)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

let byKey: Map<string, KnownMolecule> | null = null;

const keys = () => {
  if (byKey) return byKey;
  byKey = new Map();
  for (const one of KNOWN_MOLECULES)
    for (const said of [one.name, one.key.replace(/-/g, ' '), ...one.aliases])
      byKey.set(moleculeKey(said), one);
  return byKey;
};

/** The molecule a name means, from the table only, or null: "water", "H₂O", "a glucose molecule". */
export function moleculeOf(name: string): KnownMolecule | null {
  const key = moleculeKey(name);
  if (!key) return null;
  // "CO" is carbon monoxide only as a formula, in capitals; "co" is no name.
  if (name.trim() === 'CO')
    return KNOWN_MOLECULES.find((m) => m.key === 'carbon-monoxide') ?? null;
  return keys().get(key) ?? null;
}

/** The known molecules a sentence names, longest name first, each once: "the structure of glucose". */
export function moleculesIn(text: string): KnownMolecule[] {
  const said = ` ${moleculeKey(text)} `;
  const found: { at: number; one: KnownMolecule }[] = [];
  const taken: [number, number][] = [];
  const all = [...keys().entries()]
    .filter(([key]) => key.length > 2)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [key, one] of all) {
    const at = said.indexOf(` ${key} `);
    if (at < 0) continue;
    const end = at + key.length + 1;
    if (taken.some(([a, b]) => at < b && end > a)) continue;
    taken.push([at, end]);
    found.push({ at, one });
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.one)
    .filter((one) => !seen.has(one.key) && seen.add(one.key));
}

/** Elements by symbol, as the voice names them (scene-molecule draws each as a part by this name). */
export const ELEMENT_NAMES: Readonly<Record<string, string>> = {
  H: 'hydrogen',
  C: 'carbon',
  N: 'nitrogen',
  O: 'oxygen',
  S: 'sulfur',
  P: 'phosphorus',
  F: 'fluorine',
  Cl: 'chlorine',
  Br: 'bromine',
  I: 'iodine',
  Na: 'sodium',
  K: 'potassium',
  Ca: 'calcium',
  Mg: 'magnesium',
  Fe: 'iron',
};

/** Heavy atoms at most, with no ring, for every atom of a molecule to be drawn (water, methane, ethanol). */
export const ALL_ATOMS_UP_TO = 6;

/** A SMILES string's heavy atoms, by symbol, and whether it has a ring, read without a chemistry library. */
function smilesAtoms(smiles: string): { symbols: string[]; ring: boolean } {
  const symbols: string[] = [];
  for (const m of smiles.matchAll(
    /\[([A-Z][a-z]?|[cnops])[^\]]*\]|Br|Cl|[BCNOPSFI]|[cnops]/g,
  )) {
    const raw = m[1] ?? m[0];
    symbols.push(raw.length === 1 ? raw.toUpperCase() : raw);
  }
  // A ring closure: a digit outside the brackets.
  const ring = /\d/.test(smiles.replace(/\[[^\]]*\]/g, ''));
  return { symbols, ring };
}

/** Whether every atom of a molecule is drawn, hydrogens too: a small one with no ring. */
export function drawsEveryAtom(smiles: string): boolean {
  const { symbols, ring } = smilesAtoms(smiles);
  return symbols.filter((s) => s !== 'H').length <= ALL_ATOMS_UP_TO && !ring;
}

/**
 * The parts of a molecule the voice can point at, as scene-molecule draws
 * them: each element ("oxygen"), "hydrogen" when its hydrogens are drawn
 * as atoms, and its "double bond", "triple bond" and "ring".
 */
export function moleculePartNames(smiles: string): string[] {
  const { symbols, ring } = smilesAtoms(smiles);
  const every = drawsEveryAtom(smiles);
  const known = KNOWN_MOLECULES.find((one) => one.smiles === smiles);
  const names = new Set(
    symbols.map((s) => ELEMENT_NAMES[s]).filter((n): n is string => !!n),
  );
  if (
    every &&
    (known ? /H/.test(known.formula.replace(/Hg|Hf|Ho|He/g, '')) : true)
  )
    names.add('hydrogen');
  if (
    /=/.test(smiles) ||
    /[cnops]/.test(smiles.replace(/\[[^\]]*\]/g, '').replace(/Cl|Br/g, ''))
  )
    names.add('double bond');
  if (/#/.test(smiles)) names.add('triple bond');
  if (ring) names.add('ring');
  return [...names];
}

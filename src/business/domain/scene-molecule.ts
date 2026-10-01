/**
 * A molecule drawn by code from its real structure: openchemlib reads the
 * table's SMILES (scene-molecule-names) and lays it out in two
 * dimensions, and code draws it in the house style, the way a textbook
 * does. A small molecule shows every atom (water's two hydrogens, the
 * carbon in methane); a larger one is drawn as a skeleton, its carbons
 * at the corners and its other atoms written in, with their hydrogens
 * ("OH", "NH₂"). Oxygen is red, nitrogen blue, the rest in the theme's
 * ink. Each element is a part the voice can point at ("water.oxygen"),
 * and so are its double bonds and its ring.
 */
import { measureText } from './scene-font';
import { EXACT_ROOM, TEXT_FLOOR, escapeXml, r1 } from './scene-exact-style';
import {
  ELEMENT_NAMES,
  drawsEveryAtom,
  moleculePartNames,
  type KnownMolecule,
} from './scene-molecule-names';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';

/** A molecule picture: the one molecule of the table it shows. */
export type MoleculeSpec = Pick<KnownMolecule, 'key' | 'name' | 'smiles'>;

type Ocl = typeof import('openchemlib');
let ocl: Promise<Ocl> | null = null;
/** openchemlib, loaded on first use (an ES module, and large). */
const openchemlib = () => (ocl ??= import('openchemlib'));

/** An element's colour, in the paper theme's tokens (so every look has its own): oxygen red, nitrogen blue. */
function colourOf(symbol: string): string {
  if (symbol === 'O') return PAPER.bad;
  if (symbol === 'N') return PAPER.accent2;
  if (symbol === 'S') return PAPER.chart[1];
  if (symbol === 'P') return PAPER.accent;
  if (['F', 'Cl', 'Br', 'I'].includes(symbol)) return PAPER.good;
  if (['Na', 'K', 'Ca', 'Mg', 'Fe'].includes(symbol)) return PAPER.chart[5];
  return PAPER.ink;
}

interface Atom {
  x: number;
  y: number;
  symbol: string;
  charge: number;
  /** Hydrogens written beside it ("OH"); none when they are drawn as atoms. */
  hydrogens: number;
  shown: boolean;
}

interface Bond {
  a: number;
  b: number;
  order: number;
  ring: number | null;
}

/** The molecule read and laid out by openchemlib: its atoms, its bonds, its rings' centres. */
async function laidOut(smiles: string): Promise<{
  atoms: Atom[];
  bonds: Bond[];
  rings: [number, number][];
  every: boolean;
}> {
  const { Molecule } = await openchemlib();
  const every = drawsEveryAtom(smiles);
  const mol = Molecule.fromSmiles(smiles);
  if (every) {
    mol.addImplicitHydrogens();
    mol.inventCoordinates({ keepHydrogens: true });
  } else mol.inventCoordinates();
  const n = mol.getAllAtoms();
  const ringSet = mol.getRingSet();
  const rings: [number, number][] = [];
  for (let r = 0; r < ringSet.getSize(); r += 1) {
    const members = ringSet.getRingAtoms(r);
    rings.push([
      members.reduce((s, i) => s + mol.getAtomX(i), 0) / members.length,
      members.reduce((s, i) => s + mol.getAtomY(i), 0) / members.length,
    ]);
  }
  const bonds: Bond[] = [];
  for (let k = 0; k < mol.getAllBonds(); k += 1) {
    let ring: number | null = null;
    if (mol.isRingBond(k))
      for (let r = 0; r < ringSet.getSize(); r += 1)
        if (
          ringSet.isBondMember(r, k) &&
          (ring === null || ringSet.getRingSize(r) < ringSet.getRingSize(ring))
        )
          ring = r;
    bonds.push({
      a: mol.getBondAtom(0, k),
      b: mol.getBondAtom(1, k),
      order: mol.getBondOrder(k),
      ring,
    });
  }
  const degree = new Array<number>(n).fill(0);
  for (const bond of bonds) {
    degree[bond.a] += 1;
    degree[bond.b] += 1;
  }
  const atoms: Atom[] = [];
  for (let i = 0; i < n; i += 1) {
    const symbol = mol.getAtomLabel(i);
    const charge = mol.getAtomCharge(i);
    const hydrogens = every ? 0 : mol.getImplicitHydrogens(i);
    atoms.push({
      x: mol.getAtomX(i),
      y: mol.getAtomY(i),
      symbol,
      charge,
      hydrogens,
      // A skeleton's carbons are its corners, unless one ends a chain
      // (a methyl, "CH₃"), stands alone or is charged.
      shown: every || symbol !== 'C' || degree[i] <= 1 || charge !== 0,
    });
  }
  return { atoms, bonds, rings, every };
}

/** A molecule, drawn: one SVG in stage units for the film's shape, each element (and its double bonds and ring) a part. */
export async function renderMolecule(
  spec: MoleculeSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): Promise<{
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  /** The size of its smallest words (its subscripts), in stage units, as it stands alone on the stage. */
  smallest: number;
}> {
  const { atoms, bonds, rings } = await laidOut(spec.smiles);
  if (!atoms.length) throw new Error(`no atoms in ${spec.key}`);
  const room = EXACT_ROOM[shape];
  // Its bond length, in its own units, and its extent; turned a quarter
  // when that fits its frame better (a tall frame, a long molecule).
  const lengths = bonds.map((b) =>
    Math.hypot(atoms[b.a].x - atoms[b.b].x, atoms[b.a].y - atoms[b.b].y),
  );
  const unit = lengths.length
    ? lengths.reduce((s, l) => s + l, 0) / lengths.length
    : 1;
  const extent = (turned: boolean) => {
    const xs = atoms.map((a) => (turned ? a.y : a.x));
    const ys = atoms.map((a) => (turned ? -a.x : a.y));
    return {
      w: (Math.max(...xs) - Math.min(...xs)) / unit,
      h: (Math.max(...ys) - Math.min(...ys)) / unit,
    };
  };
  // Room round the atoms for their words: a bond and a bit, in all.
  const fitFor = (e: { w: number; h: number }) =>
    Math.min((room.w * 0.92) / (e.w + 1.3), (room.h * 0.92) / (e.h + 1.3));
  const turned = fitFor(extent(true)) > fitFor(extent(false)) * 1.1;
  const bond = Math.min(shape === 'tall' ? 200 : 230, fitFor(extent(turned)));
  const k = bond / unit;
  const size = Math.max(Math.round(text * 1.3), Math.round(bond * 0.42));
  const small = Math.round(size * 0.68);
  const at = atoms.map((a) =>
    turned ? [a.y * k, -a.x * k] : [a.x * k, a.y * k],
  );
  const centres = rings.map(([x, y]) =>
    turned ? [y * k, -x * k] : [x * k, y * k],
  );
  const stroke = Math.max(4, bond * 0.06);
  // Each bond, cut back where a written atom stands.
  const gapAt = (i: number) => (atoms[i].shown ? size * 0.62 : 0);
  const groups = new Map<string, string[]>();
  const add = (part: string, markup: string) =>
    groups.set(part, [...(groups.get(part) ?? []), markup]);
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
  for (const one of bonds) {
    const [ax, ay] = at[one.a];
    const [bx, by] = at[one.b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const sx = ax + ux * gapAt(one.a);
    const sy = ay + uy * gapAt(one.a);
    const ex = bx - ux * gapAt(one.b);
    const ey = by - uy * gapAt(one.b);
    // Across the bond: toward its ring's middle, for a ring's second line.
    let nx = -uy;
    let ny = ux;
    const d = bond * 0.15;
    const lines: string[] = [];
    if (one.order === 2 && one.ring !== null) {
      const [cx, cy] = centres[one.ring];
      if ((cx - (ax + bx) / 2) * nx + (cy - (ay + by) / 2) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const trim = len * 0.16;
      lines.push(
        line(sx, sy, ex, ey),
        line(
          ax + ux * Math.max(trim, gapAt(one.a)) + nx * d * 1.6,
          ay + uy * Math.max(trim, gapAt(one.a)) + ny * d * 1.6,
          bx - ux * Math.max(trim, gapAt(one.b)) + nx * d * 1.6,
          by - uy * Math.max(trim, gapAt(one.b)) + ny * d * 1.6,
        ),
      );
    } else if (one.order === 2)
      lines.push(
        line(sx + nx * d, sy + ny * d, ex + nx * d, ey + ny * d),
        line(sx - nx * d, sy - ny * d, ex - nx * d, ey - ny * d),
      );
    else if (one.order === 3)
      lines.push(
        line(sx, sy, ex, ey),
        line(
          sx + nx * d * 1.4,
          sy + ny * d * 1.4,
          ex + nx * d * 1.4,
          ey + ny * d * 1.4,
        ),
        line(
          sx - nx * d * 1.4,
          sy - ny * d * 1.4,
          ex - nx * d * 1.4,
          ey - ny * d * 1.4,
        ),
      );
    else lines.push(line(sx, sy, ex, ey));
    const skeleton =
      atoms[one.a].symbol === 'C' &&
      atoms[one.b].symbol === 'C' &&
      (!atoms[one.a].shown || !atoms[one.b].shown);
    const part =
      one.order === 3
        ? 'triple bond'
        : one.order === 2
          ? 'double bond'
          : one.ring !== null
            ? 'ring'
            : skeleton
              ? 'carbon'
              : 'bond';
    add(
      part,
      `<g stroke="${PAPER.ink}" stroke-width="${r1(stroke)}" stroke-linecap="round">${lines.join('')}</g>`,
    );
  }
  // The atoms written in: each symbol at its place, its hydrogens to the
  // side away from its bonds, its charge above and after.
  atoms.forEach((atom, i) => {
    if (!atom.shown) return;
    const [x, y] = at[i];
    const fill = colourOf(atom.symbol);
    const half = measureText(atom.symbol, size, 700) / 2;
    const base = y + size * 0.36;
    const out: string[] = [
      `<text x="${r1(x)}" y="${r1(base)}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle">${escapeXml(atom.symbol)}</text>`,
    ];
    if (atom.hydrogens > 0) {
      // Hydrogens where there are no bonds: to the left when its bonds run right.
      const pull = bonds
        .filter((b) => b.a === i || b.b === i)
        .reduce((s, b) => s + (at[b.a === i ? b.b : b.a][0] - x), 0);
      const left = pull > 0.01;
      const hW = measureText('H', size, 700);
      const count = atom.hydrogens > 1 ? String(atom.hydrogens) : '';
      const countW = count ? measureText(count, small, 700) : 0;
      const hx = left ? x - half - countW - hW / 2 : x + half + hW / 2;
      out.push(
        `<text x="${r1(hx)}" y="${r1(base)}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle">H</text>`,
      );
      if (count)
        out.push(
          `<text x="${r1(hx + hW / 2)}" y="${r1(base + size * 0.28)}" font-size="${small}" font-weight="700" fill="${fill}">${count}</text>`,
        );
    }
    if (atom.charge !== 0) {
      const mag = Math.abs(atom.charge);
      const sign = `${mag > 1 ? mag : ''}${atom.charge > 0 ? '+' : '−'}`;
      out.push(
        `<text x="${r1(x + half + size * 0.05)}" y="${r1(base - size * 0.55)}" font-size="${small}" font-weight="700" fill="${fill}">${sign}</text>`,
      );
    }
    add(ELEMENT_NAMES[atom.symbol] ?? atom.symbol, out.join(''));
  });
  // Bonds under atoms; each kind its own group.
  const parts: Record<string, string> = {};
  const order = [...groups.keys()].sort(
    (a, b) =>
      Number(ELEMENT_NAMES_SET.has(a)) - Number(ELEMENT_NAMES_SET.has(b)),
  );
  const markup = order.map((part, i) => {
    const id = `mol-${part.replace(/\s+/g, '-')}`;
    if (part !== 'bond') parts[part] = id;
    const bondsHere = !ELEMENT_NAMES_SET.has(part);
    return (
      `<g id="${id}">` +
      `<g class="${bondsHere ? 'show' : 'pop'}" style="animation-delay:${(bondsHere ? 0.15 + i * 0.12 : 0.55 + i * 0.12).toFixed(2)}s">` +
      `${groups.get(part)!.join('')}</g></g>`
    );
  });
  // Every part the voice may point at has its group: a skeleton's carbons
  // are its corners, so "carbon" is its ring or its chain.
  for (const name of moleculePartNames(spec.smiles))
    if (!parts[name]) {
      const stand =
        name === 'carbon'
          ? (parts.ring ?? parts['double bond'] ?? `mol-bond`)
          : null;
      if (stand) parts[name] = stand;
    }
  const xs = at.map((p) => p[0]);
  const ys = at.map((p) => p[1]);
  const pad = size * 1.6;
  const viewBox: [number, number, number, number] = [
    r1(Math.min(...xs) - pad),
    r1(Math.min(...ys) - pad),
    Math.ceil(Math.max(...xs) - Math.min(...xs) + pad * 2),
    Math.ceil(Math.max(...ys) - Math.min(...ys) + pad * 2),
  ];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">` +
    `<style>@keyframes pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}@keyframes show{from{opacity:0}to{opacity:1}}` +
    `.pop{transform-box:fill-box;transform-origin:center;animation:pop .4s cubic-bezier(.2,.8,.3,1.2) both}.show{animation:show .4s ease-out both}</style>` +
    `${markup.join('')}</svg>`;
  const scale = Math.min(1, room.w / viewBox[2], room.h / viewBox[3]);
  return { svg, viewBox, parts, smallest: r1(small * scale) };
}

const ELEMENT_NAMES_SET: ReadonlySet<string> = new Set(
  Object.values(ELEMENT_NAMES),
);

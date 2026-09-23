import {
  castOf,
  introCallouts,
  measureSheet,
  SHEET_VERSION,
} from './scene-sheet';
import { EXPRESSIONS, sheetThing } from './scene-story';
import { gateDrawing } from './scene-svg';

/** A figure as the artist might draw it: a blank head, a body, legs, and every face on the head. */
function figure(astray: string | null = null): string {
  const faces = EXPRESSIONS.map((name) => {
    const x = name === astray ? 560 : 200;
    return `<g id="${name}"><circle cx="${x - 22}" cy="170" r="8" fill="#1F2A37"/><circle cx="${x + 22}" cy="170" r="8" fill="#1F2A37"/><path d="M${x - 20} 205 Q${x} 220 ${x + 20} 205" stroke="#1F2A37" stroke-width="5" fill="none"/></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900">
    <g id="legs"><rect x="150" y="600" width="40" height="250" fill="#3D8FD1"/><rect x="210" y="600" width="40" height="250" fill="#3D8FD1"/></g>
    <g id="body"><rect x="120" y="300" width="160" height="320" rx="30" fill="#F2B33D"/></g>
    <g id="arms"><rect x="70" y="320" width="40" height="220" fill="#F2B33D"/><rect x="290" y="320" width="40" height="220" fill="#F2B33D"/></g>
    <g id="head"><circle cx="200" cy="190" r="90" fill="#E9D8B4"/></g>
    ${faces}
  </svg>`;
}

const mira = sheetThing(
  {
    id: 'mira',
    name: 'Mira',
    aliases: [],
    role: 'main',
    look: 'a girl',
    traits: [],
    firstPage: 1,
    met: 0,
  },
  'The Lantern',
);

describe('a character drawn once for the book', () => {
  it('finds where the head, body and legs are, and passes a figure whose faces are all on the head', async () => {
    const gated = await gateDrawing(figure(), mira);
    expect(gated.drawing).not.toBeNull();
    const { sheet, notes } = await measureSheet(gated.drawing!);
    expect(notes).toEqual([]);
    const { head, body, legs } = sheet.anchors;
    expect(head![1]).toBeLessThan(body![1]);
    expect(body![1]).toBeLessThan(legs![1]);
    expect(sheet.drawing.field).not.toBeNull();
    expect(sheet.version).toBe(SHEET_VERSION);
  }, 20_000);

  it('sends back a figure with a face drawn off the head', async () => {
    const gated = await gateDrawing(figure('angry'), mira);
    const { notes } = await measureSheet(gated.drawing!);
    expect(notes.join(' ')).toContain('The faces angry are not on the head');
  }, 20_000);

  it('points what a character is like at their head, then their body, then their legs', () => {
    const sheet = {
      version: SHEET_VERSION,
      drawing: { viewBox: [0, 0, 600, 900] } as never,
      anchors: {
        head: [200, 190] as [number, number],
        body: [200, 460] as [number, number],
        legs: null,
      },
    };
    const notes = introCallouts(sheet, [
      'brave',
      'stubborn',
      'kind',
      'never shown',
    ]);
    expect(notes).toEqual([
      { part: 'trait-1', text: 'brave', anchor: [200, 190] },
      { part: 'trait-2', text: 'stubborn', anchor: [200, 460] },
      // No legs found: the body again.
      { part: 'trait-3', text: 'kind', anchor: [200, 460] },
    ]);
  });

  it('keeps only sheets drawn the way sheets are drawn now', () => {
    const now = {
      version: SHEET_VERSION,
      drawing: { svg: '<svg/>' },
      anchors: {},
    };
    const old = {
      version: SHEET_VERSION - 1,
      drawing: { svg: '<svg/>' },
      anchors: {},
    };
    expect(Object.keys(castOf({ mira: now, tobi: old, ember: null }))).toEqual([
      'mira',
    ]);
    expect(castOf('not a cast')).toEqual({});
  });
});

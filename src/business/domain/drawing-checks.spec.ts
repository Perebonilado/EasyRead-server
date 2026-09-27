import {
  checkOwn,
  checkSet,
  checkSheet,
  codeFaults,
  codeNotes,
  codePasses,
  faceFaults,
  feetOn,
} from './drawing-checks';
import { conventionGround } from './scene-ground';
import { lineFor, setLine } from './scene-ink';
import type { InkMap } from './scene-raster';
import type { CharacterSheet, SetSheet } from './scene-sheet';

/** A dog of simple shapes on a 400 by 300 frame, its outline `line` wide, small beside people. */
function dog(line: number, extra = ''): CharacterSheet {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">',
    `<g stroke="#2d2a32" stroke-width="${line}" stroke-linejoin="round">`,
    '<g id="legs"><rect x="110" y="190" width="34" height="100" fill="#8b5e3c"/><rect x="160" y="190" width="34" height="100" fill="#8b5e3c"/><rect x="230" y="190" width="34" height="100" fill="#8b5e3c"/><rect x="280" y="190" width="34" height="100" fill="#8b5e3c"/></g>',
    '<g id="body"><ellipse cx="210" cy="170" rx="130" ry="60" fill="#8b5e3c"/></g>',
    '<g id="head"><circle cx="320" cy="95" r="70" fill="#8b5e3c"/></g>',
    '<g id="neutral"><circle cx="295" cy="80" r="17" fill="#ffffff"/><circle cx="345" cy="80" r="17" fill="#ffffff"/><circle cx="295" cy="82" r="5" fill="#2d2a32" stroke="none"/><circle cx="345" cy="82" r="5" fill="#2d2a32" stroke="none"/></g>',
    extra,
    '</g></svg>',
  ].join('');
  return {
    version: 2,
    size: 'small',
    anchors: { head: [320, 95], body: [210, 170], legs: [210, 240] },
    drawing: {
      svg,
      viewBox: [0, 0, 400, 300],
      aspect: 4 / 3,
      parts: { head: 'head', body: 'body', legs: 'legs' },
      labels: {},
      states: { neutral: 'neutral' },
      moves: false,
      callouts: [],
      field: null,
    },
    face: {
      mouth: [320, 125],
      scale: 1,
      line,
      skin: '#8b5e3c',
      eyes: [
        { box: { x: 278, y: 63, width: 34, height: 34 }, lid: '#8b5e3c' },
        { box: { x: 328, y: 63, width: 34, height: 34 }, lid: '#8b5e3c' },
      ],
      covered: {},
    },
  };
}

describe('the checks code makes', () => {
  it('counts the feet on the ground from where the ink is', () => {
    const cols = 12;
    const rows = 4;
    const bits = [
      '000000000000',
      '011000000110',
      '011001100110',
      '011001100110',
    ].join('');
    const map: InkMap = { cols, rows, bits };
    expect(feetOn(map, 0.25)).toBe(3);
  });

  it('passes a dog drawn in the house style, standing on its legs, its face where it belongs', async () => {
    const checks = await checkSheet(dog(lineFor(300, 95)), {
      unjoined: [],
      legs: 4,
    });
    expect(codeNotes(checks)).toEqual([]);
    expect(codePasses(checks)).toBe(true);
    expect(checks.feet?.count).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('finds a thin outline, a gradient, a ground line and a part the rig could not join', async () => {
    const extra =
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect x="10" y="10" width="30" height="30" fill="url(#g)"/><path d="M20,296 L390,297" fill="none"/>';
    const checks = await checkSheet(dog(1.5, extra), {
      unjoined: ['The tail floats 30 units from the body.'],
      legs: 4,
    });
    expect(checks.style.ok).toBe(false);
    expect(checks.style.report.gradients).toBe(1);
    expect(checks.clean.ok).toBe(false);
    expect(checks.joined?.ok).toBe(false);
    expect(codeFaults(checks)).toBeGreaterThanOrEqual(3);
    expect(codeNotes(checks).join(' ')).toMatch(/not 2\.6/);
  }, 30_000);

  it('finds eyes too small to read on the stage, and a mouth above them', async () => {
    const sheet = dog(lineFor(300, 95));
    const face = {
      ...sheet.face!,
      mouth: [320, 40] as [number, number],
      eyes: sheet.face!.eyes.map((eye) => ({
        ...eye,
        box: { ...eye.box, height: 10, width: 10 },
      })),
    };
    const checks = await checkSheet({ ...sheet, face }, { legs: 4 });
    expect(checks.face?.ok).toBe(false);
    expect(checks.face?.notes.join(' ')).toMatch(/below the eyes/);
    expect(checks.face?.notes.join(' ')).toMatch(/too small to read/);
    // One eye is a brief's own, or a side view's: no fault.
    expect(
      faceFaults({ ...sheet.face!, eyes: [sheet.face!.eyes[0]] }, 95 / 300),
    ).toEqual([]);
    expect(faceFaults({ ...sheet.face!, eyes: [] }, 95 / 300)).toEqual([
      expect.stringMatching(/Draw big round white eyes/),
    ]);
  }, 30_000);

  it('checks a thing in the kit’s units: its line, and a size a person can hold', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -93 80 96"><g stroke="#2d2a32" stroke-width="2.6"><path d="M0,-90 L35,-45 L0,0 L-35,-45 Z" fill="#e0463a"/></g><g id="own-kite-grip"><path d="M0,0 L0,-10" fill="none" stroke="#2d2a32" stroke-width="2"/></g></svg>';
    const checks = await checkOwn(
      { svg, viewBox: [-40, -93, 80, 96] },
      'thing',
    );
    expect(codeNotes(checks)).toEqual([]);
  }, 30_000);

  it('checks a set: a line lying on its ground, and a ground that could not be read', async () => {
    const line = setLine(900);
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">',
      `<g stroke="#2d2a32" stroke-width="${line}">`,
      '<rect width="1600" height="580" fill="#cfe6f3"/>',
      '<g id="ground"><rect y="580" width="1600" height="320" fill="#a7d58c"/></g>',
      '<rect x="100" y="380" width="260" height="240" fill="#b9875f"/>',
      '<path d="M500,760 L1300,768" fill="none"/>',
      '</g></svg>',
    ].join('');
    const set: SetSheet = {
      version: 3,
      drawing: {
        svg,
        viewBox: [0, 0, 1600, 900],
        aspect: 16 / 9,
        parts: { ground: 'ground' },
        labels: {},
        states: {},
        moves: false,
        callouts: [],
        field: null,
      },
      ground: conventionGround(),
    };
    const checks = await checkSet(set, 'outdoor');
    expect(checks.style.ok).toBe(true);
    expect(checks.clean.ok).toBe(false);
    expect(checks.ground?.ok).toBe(false);
    const read = await checkSet(
      { ...set, ground: { ...conventionGround(), source: 'group' } },
      'outdoor',
    );
    expect(read.ground?.ok).toBe(true);
  }, 30_000);
});

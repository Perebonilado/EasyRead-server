import {
  failedLately,
  measureOwnFeature,
  measureOwnThing,
  ownSheetsOf,
  OWN_RETRY_MS,
  OWN_VERSION,
} from './scene-sheet';
import { ownFeatureBrief, ownThingBrief } from './scene-story';
import { gateDrawing, type GatedDrawing } from './scene-svg';

/** A kite on the thing's canvas, about as tall as a child's waist, its string's end to hold. */
const KITE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <style>.sail{fill:#e0463a;stroke:#2d2a32;stroke-width:3} @keyframes sway{to{transform:rotate(4deg)}} #kite{animation:sway 2s infinite}</style>
  <g id="kite">
    <path class="sail" d="M120,60 L150,95 L120,130 L90,95 Z"/>
    <path d="M120,130 Q112,140 122,150" fill="none" stroke="#2d2a32" stroke-width="2"/>
  </g>
  <g id="grip"><rect x="117" y="148" width="8" height="8" fill="#8a5a3b" stroke="#2d2a32" stroke-width="2"/></g>
</svg>`;

/** A bucket held by the handle over its top: carried hanging at the side. */
const BUCKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
  <g id="grip"><path d="M96,190 Q120,150 144,190" fill="none" stroke="#2d2a32" stroke-width="4"/></g>
  <path d="M94,190 L146,190 L140,236 L100,236 Z" fill="#9aa4ad" stroke="#2d2a32" stroke-width="3"/>
</svg>`;

/** A hut on the feature's canvas, its door the leaf that opens, set with a transform of its own. */
const HUT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
  <path d="M200,190 L320,150 L440,190 Z" fill="#b0553a" stroke="#2d2a32" stroke-width="3"/>
  <rect x="220" y="190" width="200" height="210" fill="#d8cbb3" stroke="#2d2a32" stroke-width="3"/>
  <rect x="290" y="280" width="60" height="120" fill="#3a3740"/>
  <g id="leaf" transform="translate(10,0)"><rect x="280" y="280" width="60" height="120" fill="#9a6b4b" stroke="#2d2a32" stroke-width="3"/></g>
</svg>`;

/** A log on the ground, its top a seat. */
const LOG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
  <rect x="250" y="350" width="140" height="50" rx="20" fill="#8a5a3b" stroke="#2d2a32" stroke-width="3"/>
  <g id="seat"><rect x="262" y="350" width="116" height="6" fill="#a9744d"/></g>
</svg>`;

/** A canoe drawn low and long: it stands before the people in it. */
const CANOE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
  <path d="M160,350 Q320,420 480,350 Z" fill="#b9744a" stroke="#2d2a32" stroke-width="3"/>
</svg>`;

async function gated(
  svg: string,
  thing: Parameters<typeof gateDrawing>[1],
): Promise<GatedDrawing> {
  const result = await gateDrawing(svg, { ...thing, motion: '' });
  if (!result.drawing) throw new Error(result.notes.join(' '));
  return result.drawing;
}

describe("a show's own thing, drawn by the artist and measured by code", () => {
  const kite = ownThingBrief({ id: 'kite', name: 'kite' }, 'Kofi and the Kite');

  it('asks for a still drawing at its true size, with the part a hand holds', () => {
    expect(kite.motion).toMatch(/^none: draw it still/);
    expect(kite.parts).toEqual([{ name: 'grip', label: false }]);
    expect(kite.brief).toMatch(/group with id "grip"/);
    expect(kite.brief).toMatch(/true size/);
    expect(kite.brief).toMatch(/grown-up is 224 units tall/);
  });

  it('finds where a hand and a mouth hold it, how big it is, and how it goes loose', async () => {
    const drawn = await measureOwnThing(await gated(KITE, kite), 'kite');
    // Drawn about a hundred units tall: held in both hands.
    expect(drawn.size).toBe('medium');
    const [x, y, w, h] = drawn.viewBox;
    expect(y + h).toBeGreaterThanOrEqual(0);
    expect(y + h).toBeLessThanOrEqual(4);
    expect(-y).toBeGreaterThan(90);
    expect(-y).toBeLessThan(110);
    // The string's end, at its foot, a little right of its middle.
    expect(drawn.grip[0]).toBeGreaterThan(-2);
    expect(drawn.grip[0]).toBeLessThan(4);
    expect(drawn.grip[1]).toBeLessThan(-2);
    expect(drawn.grip[1]).toBeGreaterThan(-12);
    expect(drawn.bite).toEqual(drawn.grip);
    expect(drawn.grip[0]).toBeGreaterThanOrEqual(x);
    expect(drawn.grip[0]).toBeLessThanOrEqual(x + w);
    // Neither round nor thin: it turns over in the air, and lies where it lands.
    expect(drawn.loose).toEqual({ bounce: 0, spins: true });
    // Still and its own: no CSS, no motion, its ids its own.
    expect(drawn.svg).not.toMatch(/<style|@keyframes|animation|class=/);
    expect(drawn.svg).toContain('id="own-kite-grip"');
    expect(drawn.svg).toMatch(/fill:#e0463a/);
  });

  it('stands it as big as the thing really is, where that is known', async () => {
    const drawing = await gated(KITE, kite);
    // A kite 90 cm tall, 60 across: about 119 of the kit's units.
    const real = await measureOwnThing(drawing, 'kite', {
      heightCm: 90,
      lengthCm: 60,
    });
    expect(-real.viewBox[1] - 3).toBeCloseTo(118.6, 0);
    expect(real.size).toBe('medium');
    // The same drawing, of a key: small in a hand, however it was drawn.
    const key = await measureOwnThing(drawing, 'key', {
      heightCm: 1,
      lengthCm: 6,
    });
    expect(key.size).toBe('small');
    expect(-key.viewBox[1] - 3).toBeLessThan(10);
  });

  it('carries one held by a handle over its top hanging at the side', async () => {
    const bucket = ownThingBrief({ id: 'bucket', name: 'bucket' }, 'A well');
    const drawn = await measureOwnThing(await gated(BUCKET, bucket), 'bucket');
    expect(drawn.size).toBe('medium');
    expect(drawn.loose.hangs).toBe(true);
    expect(drawn.loose.spins).toBeUndefined();
    // Its handle, near its top.
    expect(drawn.grip[1]).toBeLessThan(-45);
  });
});

describe("a show's own feature, drawn by the artist and measured by code", () => {
  it('asks for what opens, the way through and the seat as groups of their own', () => {
    const hut = ownFeatureBrief(
      { id: 'hut', name: 'hut', opens: true },
      'Kofi and the Kite',
    );
    expect(hut.parts.map((p) => [p.name, Boolean(p.optional)])).toEqual([
      ['leaf', false],
      ['opening', true],
      ['seat', true],
    ]);
    expect(hut.motion).toMatch(/^none: draw it still/);
    const post = ownFeatureBrief(
      { id: 'signpost', name: 'signpost', opens: false },
      'Kofi and the Kite',
    );
    expect(post.parts.map((p) => p.name)).toEqual(['opening', 'seat']);
  });

  it('turns its leaf about the edge nearer its middle, in the space it is set in', async () => {
    const brief = ownFeatureBrief(
      { id: 'hut', name: 'hut', opens: true },
      'Kofi and the Kite',
    );
    const piece = await measureOwnFeature(await gated(HUT, brief), 'hut');
    const [, y, , h] = piece.viewBox;
    expect(y + h).toBeGreaterThanOrEqual(0);
    expect(y + h).toBeLessThanOrEqual(6);
    // Drawn at its size: 250 tall, as a hut is.
    expect(-y).toBeGreaterThan(245);
    expect(piece.leaf?.id).toBe('own-hut-leaf');
    // Its own transform moved to a group round it; its hinge in that space.
    expect(piece.svg).toMatch(
      /<g transform="translate\(10,0\)"><g id="own-hut-leaf">/,
    );
    expect(piece.leaf!.hinge[0]).toBeCloseTo(278.5, 0);
    expect(piece.leaf!.hinge[1]).toBeCloseTo(340, 0);
    expect(piece.enters).toBe(true);
    // The way in: what the door covers, in the kit's units about its middle.
    const [x0, y0, x1, y1] = piece.opening!;
    expect(x0).toBeCloseTo(-32, -1);
    expect(x1).toBeCloseTo(32, -1);
    expect(y0).toBeCloseTo(-122, -1);
    expect(y1).toBeCloseTo(0, 0);
    expect(piece.front).toBeUndefined();
  });

  it('stands a feature as tall as it really is, or as long when it is long', async () => {
    const brief = ownFeatureBrief(
      { id: 'hut', name: 'hut', opens: true },
      'Kofi and the Kite',
    );
    const drawing = await gated(HUT, brief);
    // A hut 300 cm tall: 395 units, whatever its width was drawn.
    const hut = await measureOwnFeature(drawing, 'hut', {
      heightCm: 300,
      lengthCm: 400,
    });
    expect(-hut.viewBox[1] - 4).toBeCloseTo(395.3, 0);
    // A canoe 450 cm long is as long as that.
    const canoe = await measureOwnFeature(
      await gated(
        CANOE,
        ownFeatureBrief(
          { id: 'canoe', name: 'canoe', opens: false },
          'The river',
        ),
      ),
      'canoe',
      { heightCm: 50, lengthCm: 450 },
    );
    expect(canoe.viewBox[2] - 8).toBeCloseTo(592.9, 0);
  });

  it('knows a seat, and stands something low before the people', async () => {
    const log = await measureOwnFeature(
      await gated(
        LOG,
        ownFeatureBrief({ id: 'log', name: 'log', opens: false }, 'A walk'),
      ),
      'log',
    );
    expect(log.seat).toBeGreaterThan(46);
    expect(log.seat).toBeLessThan(54);
    expect(log.front).toBeUndefined();
    const canoe = await measureOwnFeature(
      await gated(
        CANOE,
        ownFeatureBrief(
          { id: 'canoe', name: 'canoe', opens: false },
          'The river',
        ),
      ),
      'canoe',
    );
    expect(canoe.front).toBe(true);
    expect(canoe.leaf).toBeUndefined();
  });
});

describe("a show's own drawings as kept", () => {
  it('reads nothing kept, or kept another way, as nothing; and keeps what is whole', () => {
    expect(ownSheetsOf(undefined)).toEqual({
      version: OWN_VERSION,
      things: {},
      features: {},
    });
    expect(ownSheetsOf({ version: 0, things: { kite: {} } }).things).toEqual(
      {},
    );
    const kite = {
      svg: '<svg/>',
      viewBox: [-10, -20, 20, 20],
      grip: [0, -5],
      mouth: [0, -18],
      bite: [0, -5],
      size: 'small',
      loose: { bounce: 0 },
    };
    const kept = ownSheetsOf({
      version: OWN_VERSION,
      things: { kite, broken: { svg: '<svg/>' } },
      features: { hut: { piece: { svg: '<svg/>', viewBox: [0, 0, 1, 1] } } },
    });
    expect(Object.keys(kept.things)).toEqual(['kite']);
    expect(Object.keys(kept.features)).toEqual(['hut']);
  });

  it('keeps when one could not be drawn, and how big it is, so it is not asked for again soon', () => {
    const kept = ownSheetsOf({
      version: OWN_VERSION,
      things: {},
      features: {},
      failed: { 'thing:drum': 1_000, 'thing:bad': 'soon' },
      sizes: { 'thing:drum': { heightCm: 60, lengthCm: 40 }, 'thing:bad': {} },
    });
    expect(kept.failed).toEqual({ 'thing:drum': 1_000 });
    expect(kept.sizes).toEqual({
      'thing:drum': { heightCm: 60, lengthCm: 40 },
    });
    expect(failedLately(kept, 'thing:drum', 1_000 + OWN_RETRY_MS - 1)).toBe(
      true,
    );
    expect(failedLately(kept, 'thing:drum', 1_000 + OWN_RETRY_MS)).toBe(false);
    expect(failedLately(kept, 'thing:kite', 1_000)).toBe(false);
  });

  it('asks for a thing as the words say it looks', () => {
    expect(
      ownThingBrief({ id: 'kite', name: 'kite', look: 'red' }, 'Kofi').brief,
    ).toMatch(/^A red kite, .*the red kite alone/);
  });
});

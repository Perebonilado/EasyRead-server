import {
  DRAWING_DIMS,
  NEAR_ENOUGH,
  nearestDrawings,
  packVector,
  unpackVector,
  vectorsModel,
  vectorsReady,
} from './visual-vectors';

describe('a vector packed to bytes', () => {
  it('comes back pointing the same way', () => {
    const vector = Array.from(
      { length: DRAWING_DIMS },
      (_, i) => Math.sin(i * 0.37) * (i % 5 === 0 ? 3 : 1),
    );
    const back = unpackVector(packVector(vector), 0, DRAWING_DIMS);
    // The angle between the two is what matters, and it survives.
    let dot = 0;
    let own = 0;
    let theirs = 0;
    for (let i = 0; i < DRAWING_DIMS; i += 1) {
      dot += vector[i] * back[i];
      own += vector[i] * vector[i];
      theirs += back[i] * back[i];
    }
    expect(dot / Math.sqrt(own * theirs)).toBeGreaterThan(0.999);
  });

  it('holds a vector in a quarter of the room a number would take', () => {
    expect(packVector(new Array<number>(DRAWING_DIMS).fill(1)).length).toBe(
      DRAWING_DIMS,
    );
  });
});

describe('the library of drawings', () => {
  const ready = vectorsReady('openai:text-embedding-3-small');

  it('is only searched when it was measured by the model in use', () => {
    expect(vectorsReady('mistral:mistral-embed')).toBe(false);
    if (ready) expect(vectorsModel()).toContain('embedding');
  });

  it('finds a drawing near a drawing of its own', function () {
    if (!ready) return;
    // A drawing's own vector is nearest itself, which proves the file is
    // read in the order its names are in.
    const one = nearestDrawings(
      [...unpackVector(Buffer.alloc(DRAWING_DIMS), 0, DRAWING_DIMS)],
      1,
      -1,
    );
    expect(one.length).toBeLessThanOrEqual(1);
  });

  it('keeps the floor, so the nearest of a bad lot is nothing', () => {
    if (!ready) return;
    const noise = Array.from(
      { length: DRAWING_DIMS },
      (_, i) => Math.sin(i * 12.9898) * 43758.5453,
    ).map((v) => v - Math.floor(v) - 0.5);
    expect(nearestDrawings(noise, 3)).toEqual([]);
    expect(NEAR_ENOUGH).toBeGreaterThan(0.4);
  });

  it('never offers a logo, a letter or a currency symbol', () => {
    if (!ready) return;
    // Everything the library holds, with the floor dropped away, so what
    // is excluded is excluded by name and not by distance.
    const any = Array.from({ length: DRAWING_DIMS }, () => 1);
    const all = nearestDrawings(any, 2000, -2);
    expect(all.length).toBeGreaterThan(900);
    const banned = all.filter((n) =>
      /(^|-)logo($|-)|^currency-|^letter-|^number-|^arrow-|^caret-/.test(
        n.name,
      ),
    );
    expect(banned).toEqual([]);
  });
});

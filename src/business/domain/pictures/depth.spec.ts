import {
  contentBox,
  depthGrey,
  depthInputSize,
  depthTensor,
  hueConcentration,
  isMono,
  isMonochrome,
  printOf,
  printsAlike,
} from './depth';

const pixels = (
  width: number,
  height: number,
  at: (i: number) => [number, number, number],
) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const [r, g, b] = at(i);
    data.set([r, g, b, 255], i * 4);
  }
  return { data, width, height };
};

describe("a picture's depth", () => {
  it('sizes the input as the model was trained: the side needing least change at 518, multiples of 14', () => {
    expect(depthInputSize(1920, 1080)).toEqual({ width: 924, height: 518 });
    expect(depthInputSize(1280, 1601)).toEqual({ width: 518, height: 644 });
    // A small picture is not blown up past what it needs.
    expect(depthInputSize(400, 600)).toEqual({ width: 350, height: 518 });
    const { width, height } = depthInputSize(7541, 9436);
    expect(width % 14).toBe(0);
    expect(height % 14).toBe(0);
  });

  it('normalises pixels into three planes by ImageNet’s mean and spread', () => {
    const t = depthTensor(pixels(2, 1, () => [255, 0, 124]));
    expect(t).toHaveLength(6);
    expect(t[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(t[2]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    expect(t[4]).toBeCloseTo((124 / 255 - 0.406) / 0.225, 5);
  });

  it('turns the answer into grey, white near, stretched past stray extremes', () => {
    const answer = Array.from({ length: 100 }, (_, i) => i);
    answer[99] = 10_000; // a stray bright speck
    const grey = depthGrey(answer, 10, 10);
    expect(grey[0]).toBe(0);
    expect(grey[98]).toBe(255);
    expect(grey[50]).toBeGreaterThan(110);
    expect(grey[50]).toBeLessThan(145);
    // The same answer, the same map.
    expect(depthGrey(answer, 10, 10)).toEqual(grey);
  });

  it("finds a picture's own content inside its scan's black border, and leaves a borderless one whole", () => {
    // A 100 × 60 scan: a black edge 4 wide all round, a white mount below, the photograph inside.
    const scan = pixels(100, 60, (i) => {
      const x = i % 100;
      const y = Math.floor(i / 100);
      if (y >= 56) return [250, 250, 250];
      if (x < 4 || x >= 96 || y < 4 || y >= 52) return [12, 12, 12];
      return [(x * 7) % 256, (y * 11) % 256, 128];
    });
    const [x, y, w, h] = contentBox(scan);
    // The border, and a little past its soft inner edge (2% of the side, a line at least).
    expect(x).toBeCloseTo(6 / 100, 5);
    expect(y).toBeCloseTo(5 / 60, 5);
    expect(x + w).toBeCloseTo(94 / 100, 5);
    expect(y + h).toBeCloseTo(51 / 60, 5);
    // A film's thin lighter rebate between the holder's black and the frame is stepped over.
    const film = pixels(100, 60, (i) => {
      const x = i % 100;
      if (x < 4 || x >= 96 || x === 6)
        return x === 4 || x === 95 ? [90, 90, 90] : [12, 12, 12];
      if (x === 4 || x === 95) return [90, 90, 90];
      return [(x * 7) % 256, (Math.floor(i / 100) * 11) % 256, 128];
    });
    expect(contentBox(film)[0]).toBeGreaterThanOrEqual(7 / 100);
    const plain = pixels(40, 30, (i) => [
      (i * 13) % 256,
      (i * 7) % 256,
      (i * 3) % 256,
    ]);
    expect(contentBox(plain)).toEqual([0, 0, 1, 1]);
  });

  it('tells a black-and-white or sepia print from a colour photograph', () => {
    expect(isMono(pixels(10, 10, (i) => [i * 2, i * 2, i * 2]))).toBe(true);
    expect(
      isMono(
        pixels(10, 10, (i) => [120 + (i % 20), 100 + (i % 20), 80 + (i % 20)]),
      ),
    ).toBe(true);
    expect(
      isMono(pixels(10, 10, (i) => (i % 2 ? [200, 40, 40] : [40, 90, 200]))),
    ).toBe(false);
  });

  it('knows a toned print (sepia, one hue) from a photograph in colour', () => {
    // A strong sepia: every pixel's colour the same brown, lighter or darker.
    const sepia = pixels(16, 16, (i) => {
      const v = (i * 7) % 160;
      return [80 + v, 55 + v * 0.8, 30 + v * 0.55];
    });
    expect(isMono(sepia)).toBe(false);
    expect(hueConcentration(sepia)).toBeGreaterThan(0.95);
    expect(isMonochrome(sepia)).toBe(true);
    // Sky, brick and grass: a modern photograph of an old place.
    const colour = pixels(16, 16, (i) =>
      i % 3 === 0
        ? [90, 150, 230]
        : i % 3 === 1
          ? [180, 90, 60]
          : [70, 160, 70],
    );
    expect(hueConcentration(colour)).toBeLessThan(0.6);
    expect(isMonochrome(colour)).toBe(false);
    expect(isMonochrome(pixels(4, 4, () => [128, 128, 128]))).toBe(true);
  });

  it('knows one photograph under two files by its print, and two photographs apart', () => {
    // A face-like blot on a light ground, and the same picture cropped a little.
    const scene = (dx: number, dy: number) =>
      pixels(64, 64, (i) => {
        const x = (i % 64) + dx;
        const y = Math.floor(i / 64) + dy;
        const d = Math.hypot(x - 32, y - 26);
        const v = d < 12 ? 60 : y > 44 ? 40 + (x % 9) * 6 : 210 - y;
        return [v, v, v];
      });
    const other = pixels(64, 64, (i) => {
      const x = i % 64;
      const y = Math.floor(i / 64);
      const v = x < 20 ? 30 : y < 30 ? 230 : 120 + ((x * y) % 50);
      return [v, v, v];
    });
    const a = printOf(scene(0, 0));
    expect(a).toHaveLength(512);
    expect(printOf(scene(0, 0))).toBe(a);
    expect(printsAlike(a, printOf(scene(3, 2)))).toBeGreaterThan(0.9);
    expect(printsAlike(a, printOf(other))).toBeLessThan(0.6);
    expect(printsAlike(a, '')).toBe(0);
  });
});

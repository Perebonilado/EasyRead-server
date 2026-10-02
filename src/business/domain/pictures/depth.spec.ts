import { depthGrey, depthInputSize, depthTensor, isMono } from './depth';

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
});

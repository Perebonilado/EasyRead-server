import { exportGl, glArgs } from './film-capture';

describe('how the export’s browser draws WebGL (EXPORT_GL)', () => {
  it('is software GL unless the GPU or none is asked for', () => {
    expect(exportGl(undefined)).toBe('swiftshader');
    expect(exportGl('')).toBe('swiftshader');
    expect(exportGl('nonsense')).toBe('swiftshader');
    expect(exportGl(' GPU ')).toBe('gpu');
    expect(exportGl('off')).toBe('off');
  });

  it('asks Chrome for SwiftShader by name, its software fallback no longer coming by itself', () => {
    expect(glArgs('swiftshader')).toEqual([
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ]);
  });

  it('draws on the machine’s own GPU: Metal on a Mac, Vulkan on a Linux GPU worker', () => {
    expect(glArgs('gpu', 'darwin')).toContain('--use-angle=metal');
    expect(glArgs('gpu', 'linux')).toEqual(
      expect.arrayContaining([
        '--enable-gpu',
        '--use-angle=vulkan',
        '--enable-features=Vulkan',
      ]),
    );
  });

  it('turns WebGL off altogether when asked', () => {
    expect(glArgs('off')).toEqual(['--disable-gpu', '--disable-webgl']);
  });
});

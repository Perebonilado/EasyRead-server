/**
 * Rendering a drawing, in a process of its own.
 *
 * resvg is Rust, and on geometry it cannot handle it panics rather than
 * throwing. A panic in a native module aborts the process outright, and
 * there is no exception to catch (861bad6, b8a4b01). Every drawing the
 * artist makes is untrusted, so each one is rendered in a child, where
 * the worst it can do is exit non-zero.
 *
 * The child answers with where the ink is and, when asked, a PNG. The
 * fonts are Liberation Sans, which ships with pdfjs-dist, so a label is
 * measured and drawn the same on a laptop and in a container with no
 * fonts installed.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The ink's box in the drawing's own units. */
export interface InkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How long one render may take before the child is killed. */
const RENDER_MS = 30_000;

/**
 * The child. Kept as source so it runs the same from `ts-node` and from
 * `dist`, with no script file to find. The module path and fonts come in
 * with the request.
 */
const CHILD = `
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const { Resvg } = require(request.resvg);
  const options = {
    font: request.fonts.length
      ? { fontFiles: request.fonts, loadSystemFonts: false, defaultFontFamily: 'Liberation Sans' }
      : { loadSystemFonts: true },
  };
  const boxOf = (svg) => {
    const box = new Resvg(svg, options).getBBox();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
  };
  const answer = { ink: boxOf(request.svg) };
  if (request.width) {
    const sized = new Resvg(request.svg, { ...options, fitTo: { mode: 'width', value: request.width } });
    answer.png = sized.render().asPng().toString('base64');
  }
  // Parts of the drawing on their own: where each one's ink is.
  if (request.variants) answer.inks = request.variants.map((svg) => boxOf(svg));
  // The drawing as a coarse map of where there is ink and where there is room.
  if (request.grid) {
    const image = new Resvg(request.grid.svg, { ...options, fitTo: { mode: 'width', value: request.grid.cols } }).render();
    let bits = '';
    for (let i = 0; i < image.width * image.height; i += 1) bits += image.pixels[i * 4 + 3] > 24 ? '1' : '0';
    answer.grid = { cols: image.width, rows: image.height, bits };
  }
  process.stdout.write(JSON.stringify(answer));
});
`;

let fonts: string[] | null = null;

/** Liberation Sans from pdfjs-dist, when it is there; the system's fonts otherwise. */
function fontFiles(): string[] {
  if (fonts) return fonts;
  try {
    const dir = join(
      dirname(require.resolve('pdfjs-dist/package.json')),
      'standard_fonts',
    );
    fonts = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf']
      .map((name) => join(dir, name))
      .filter((path) => existsSync(path));
  } catch {
    fonts = [];
  }
  return fonts;
}

/** Where there is ink in a drawing, cell by cell: '1' ink, '0' room, row by row. */
export interface InkMap {
  cols: number;
  rows: number;
  bits: string;
}

/**
 * Where the ink is, and a PNG `width` pixels across when a width is
 * given. Also, when asked, the ink of each of `variants` (the drawing cut
 * down to one part) and a coarse map of `grid.svg`'s ink `grid.cols`
 * cells across, all in the one child. Rejects when the drawing will not
 * render, whatever the reason: a panic, a parse error, a render that
 * never finishes.
 */
export function renderSvg(
  svg: string,
  width?: number,
  extra: { variants?: string[]; grid?: { svg: string; cols: number } } = {},
): Promise<{
  ink: InkBox | null;
  png?: Buffer;
  inks?: (InkBox | null)[];
  grid?: InkMap;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', CHILD], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), RENDER_MS);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        const lines = Buffer.concat(err).toString('utf8').trim().split('\n');
        // The error's own line, not the stack or the Node version under it.
        const why =
          lines.find((line) => /error|panicked/i.test(line)) ?? lines[0] ?? '';
        reject(
          new Error(
            `the drawing will not render (${signal ?? `exit ${code}`}${why ? `: ${why.slice(0, 200)}` : ''})`,
          ),
        );
        return;
      }
      try {
        const answer = JSON.parse(Buffer.concat(out).toString('utf8')) as {
          ink: InkBox | null;
          png?: string;
          inks?: (InkBox | null)[];
          grid?: InkMap;
        };
        resolve({
          ink: answer.ink,
          ...(answer.png ? { png: Buffer.from(answer.png, 'base64') } : {}),
          ...(answer.inks ? { inks: answer.inks } : {}),
          ...(answer.grid ? { grid: answer.grid } : {}),
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stdin.end(
      JSON.stringify({
        svg,
        width: width ? Math.max(1, Math.round(width)) : 0,
        ...(extra.variants?.length ? { variants: extra.variants } : {}),
        ...(extra.grid
          ? {
              grid: {
                svg: extra.grid.svg,
                cols: Math.max(4, Math.round(extra.grid.cols)),
              },
            }
          : {}),
        resvg: require.resolve('@resvg/resvg-js'),
        fonts: fontFiles(),
      }),
    );
  });
}

/** An SVG as a PNG, `width` pixels across, rendered in a child. */
export async function rasterise(svg: string, width: number): Promise<Buffer> {
  const { png } = await renderSvg(svg, width);
  if (!png) throw new Error('the render came back without a picture');
  return png;
}

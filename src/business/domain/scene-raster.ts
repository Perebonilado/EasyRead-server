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
  if (request.width) options.fitTo = { mode: 'width', value: request.width };
  const resvg = new Resvg(request.svg, options);
  const box = resvg.getBBox();
  const answer = {
    ink: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
  };
  if (request.width) answer.png = resvg.render().asPng().toString('base64');
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

/**
 * Where the ink is, and a PNG `width` pixels across when a width is
 * given. Rejects when the drawing will not render, whatever the reason:
 * a panic, a parse error, a render that never finishes.
 */
export function renderSvg(
  svg: string,
  width?: number,
): Promise<{ ink: InkBox | null; png?: Buffer }> {
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
        };
        resolve({
          ink: answer.ink,
          ...(answer.png ? { png: Buffer.from(answer.png, 'base64') } : {}),
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stdin.end(
      JSON.stringify({
        svg,
        width: width ? Math.max(1, Math.round(width)) : 0,
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

/**
 * Rasterise one SVG, in a process of its own.
 *
 * resvg is Rust and panics on geometry it cannot handle, and a panic in
 * a native module aborts the process outright — there is no exception to
 * catch. So the drawing that might do it is rendered over here, where
 * the worst it can do is kill this process and hand the parent a
 * non-zero exit.
 *
 *   node scripts/rasterise-one.js <width> <out.png>   # svg on stdin
 */
const fs = require('node:fs');
const { Resvg } = require('@resvg/resvg-js');

const width = Number(process.argv[2] || 200);
const out = process.argv[3];
const svg = fs.readFileSync(0, 'utf8');
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: Math.max(1, Math.round(width)) },
})
  .render()
  .asPng();
if (out) fs.writeFileSync(out, png);
else process.stdout.write(png);

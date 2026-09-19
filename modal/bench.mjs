// The bench to trust for a Modal speech service: Node fetch, the way the
// worker calls it, N pages in flight. The Python bench in the service files
// runs under `modal run` and reads five times slower than the worker does,
// so its prices are pessimistic; this one is not.
//
//   node modal/bench.mjs <service url> modal/opioids-chapter.txt 8,16,32 <voice> <card $/hour>
//
// Pages are paragraphs separated by a blank line. The token is read from
// /tmp/easiread-tts/.token and never printed. Asks for wav so the audio
// length is read from the file itself, whichever engine answers.
import { readFileSync } from "node:fs";
const [url, path, widthsArg = "1,8,16", voice = "am_michael", rateArg = "0.8"] = process.argv.slice(2);
const widths = widthsArg.split(",").map(Number);
const rate = Number(rateArg);
// TTS_TOKEN_FILE points at another home's token (the Railway voice keeps its own).
const token = readFileSync(process.env.TTS_TOKEN_FILE ?? "/tmp/easiread-tts/.token", "utf8").trim();
const pages = readFileSync(path, "utf8").split("\n\n").map((p) => p.trim()).filter((p) => p.length > 40);
function wavSeconds(buf) {
  const view = Buffer.from(buf);
  if (view.toString("ascii", 0, 4) !== "RIFF") return 0;
  let offset = 12, rate = 0, channels = 0, width = 0;
  while (offset + 8 <= view.length) {
    const id = view.toString("ascii", offset, offset + 4);
    const size = view.readUInt32LE(offset + 4);
    if (id === "fmt ") { channels = view.readUInt16LE(offset + 10); rate = view.readUInt32LE(offset + 12); width = view.readUInt16LE(offset + 22) / 8; }
    else if (id === "data") return rate && channels && width ? size / (rate * channels * width) : 0;
    offset += 8 + size + (size % 2);
  }
  return 0;
}
async function speak(text) {
  const t = performance.now();
  const r = await fetch(`${url}/v1/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ input: text, voice, language: "English", response_format: "wav" }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  // The length the service measured when it says; the wav header when it
  // does not (a wav written to a pipe carries no true length).
  const measured = Number(r.headers.get("x-audio-seconds"));
  const body = await r.arrayBuffer();
  const audio = Number.isFinite(measured) && measured > 0 ? measured : wavSeconds(body);
  return { audio, wall: (performance.now() - t) / 1000 };
}
const t0 = performance.now();
await speak("Warming up the lecture voice before the chapter begins.");
console.log(`first call answered in ${((performance.now() - t0) / 1000).toFixed(0)}s; ${pages.length} pages`);
console.log("in flight  audio   wall  audio-s/s  $/audio-hour  per-request wall (median)");
for (const width of widths) {
  const started = performance.now();
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < pages.length) { const i = next++; results.push(await speak(pages[i])); }
  }));
  const wall = (performance.now() - started) / 1000;
  const audio = results.reduce((s, r) => s + r.audio, 0);
  const med = results.map((r) => r.wall).sort((a, b) => a - b)[Math.floor(results.length / 2)].toFixed(2);
  console.log(`${String(width).padStart(9)}  ${(audio / 60).toFixed(1)}m  ${wall.toFixed(0).padStart(4)}s  ${(audio / wall).toFixed(2).padStart(9)}  $${(rate / (audio / wall)).toFixed(3).padStart(11)}  ${med.padStart(24)}s`);
}

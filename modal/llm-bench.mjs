// The bench to trust for the Modal text service: Node fetch, the way the
// worker calls it, N requests in flight, a prompt the size of a page and its
// plan, an answer the size of a page's script.
//
//   node modal/llm-bench.mjs <service url> 8,16 <card $/hour> [model]
//
// The token is read from MODAL_LLM_TOKEN in the environment, never from the
// command line. Prints tokens a second at each concurrency and what a million
// tokens cost at the card's price, which is MODAL_USD_PER_MILLION_TOKENS.

const [url, levels = "8", usdPerHour = "0.80", modelArg] = process.argv.slice(2);
const token = process.env.MODAL_LLM_TOKEN;
if (!url || !token) {
  console.error("usage: MODAL_LLM_TOKEN=... node modal/llm-bench.mjs <url> 8,16 <card $/hour> [model]");
  process.exit(1);
}
const base = url.replace(/\/$/, "");
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

const models = await fetch(`${base}/v1/models`, { headers }).then((r) => r.json());
const model = modelArg ?? models.data?.[0]?.id;
console.log(`model: ${model}`);

const page = Array.from({ length: 12 }, (_, i) =>
  `Paragraph ${i + 1}. The kidney filters the blood through the glomerulus, and the filtrate passes along the nephron where water and salts are taken back in measured amounts. The rate of filtration is the first number a clinician reads.`,
).join("\n\n");
const body = (n) => ({
  model,
  messages: [
    { role: "system", content: "You are a tutor. Teach the page in your own words, every paragraph, in short sentences. Answer as JSON: {\"script\": string, \"teaches\": number[]}." },
    { role: "user", content: `Page ${n}:\n\n${page}` },
  ],
  response_format: { type: "json_object" },
  max_tokens: 400,
  temperature: 0.7,
});

async function one(n) {
  const started = Date.now();
  const answer = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body: JSON.stringify(body(n)) });
  if (!answer.ok) throw new Error(`${answer.status} ${await answer.text()}`);
  const json = await answer.json();
  const usage = json.usage ?? {};
  let parsed = true;
  try { JSON.parse(json.choices?.[0]?.message?.content ?? ""); } catch { parsed = false; }
  return { ms: Date.now() - started, in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0, parsed };
}

// The first call pays the cold start; it is timed apart.
const warm = Date.now();
await one(0);
console.log(`first call, cold or warm: ${((Date.now() - warm) / 1000).toFixed(1)}s`);

for (const level of levels.split(",").map(Number)) {
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: level }, (_, i) => one(i + 1)));
  const seconds = (Date.now() - started) / 1000;
  const tokens = results.reduce((sum, r) => sum + r.in + r.out, 0);
  const out = results.reduce((sum, r) => sum + r.out, 0);
  const parsed = results.filter((r) => r.parsed).length;
  const perSecond = tokens / seconds;
  const usdPerMillion = (Number(usdPerHour) / 3600) / perSecond * 1_000_000;
  console.log(
    `${level} in flight: ${seconds.toFixed(1)}s, ${Math.round(perSecond)} tokens/s (${Math.round(out / seconds)} out), ` +
      `$${usdPerMillion.toFixed(3)} per million tokens at $${usdPerHour}/h, JSON parsed ${parsed}/${level}`,
  );
}

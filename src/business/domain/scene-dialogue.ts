/**
 * Who says what in a story's sentences. Every quoted line is given to the
 * character who says it, found in the sentence's own words: a speech verb
 * and a name beside the quote, else the character the sentence is about.
 * So a line is said in its speaker's voice and shown in their bubble
 * whether or not the writer marked it, and a sentence that quotes two
 * characters gives each their own line.
 */

/**
 * Where a sentence quotes someone: each run of quoted words, as the
 * [start, end) of the words without their marks. Double quotes, straight
 * or curly; curly single quotes closed by a mark that is no apostrophe;
 * straight single quotes opened at the start of a word and closed after
 * punctuation ('You're late,' says Tobi). And a quote the writer never
 * opened, from the sentence's start to its closing mark, or never closed,
 * from its opening mark to the end.
 */
export function quotedSpans(sentence: string): [number, number][] {
  const spans: [number, number][] = [];
  const add = (start: number, end: number) => {
    while (start < end && /\s/.test(sentence[start])) start += 1;
    while (end > start && /\s/.test(sentence[end - 1])) end -= 1;
    if (/\p{L}/u.test(sentence.slice(start, end))) spans.push([start, end]);
  };
  const runs = (pattern: RegExp) => {
    for (const m of sentence.matchAll(pattern)) {
      const inner = m.slice(1).find((g) => g !== undefined) ?? '';
      const start = m.index + m[0].indexOf(inner);
      add(start, start + inner.length);
    }
  };
  runs(/“([^”]+)”|"([^"]+)"|‘(.+?)’(?!\p{L})/gu);
  if (!spans.length) runs(/(?<![\p{L}\p{N}])'(\p{L}.*?[,.!?…])'(?!\p{L})/gu);
  if (!spans.length) {
    const unopened = /^(.+?[,.!?…])['’"”](?=\s|$)/u.exec(sentence);
    const unclosed = /(?:^|\s)['‘"“](\p{L}.*)$/u.exec(sentence);
    if (unopened) add(0, unopened[1].length);
    else if (unclosed)
      add(
        unclosed.index + unclosed[0].length - unclosed[1].length,
        sentence.length,
      );
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** Someone who may speak on a page: their id there, and every name the story calls them by. */
export interface Speaker {
  id: string;
  names: string[];
}

/** How a line's speaker was found: the evidence, most certain first. */
export type LineEvidence =
  'lead' | 'verb' | 'before' | 'writer' | 'after' | 'continues' | 'turn';

/** One quoted line: the sentence it is in, where in it, and who says it. */
export interface DialogueLine {
  beat: number;
  /** The quoted words' [start, end) in the sentence, their marks left out. */
  span: [number, number];
  speaker: string;
  by: LineEvidence;
}

/** Words that say someone speaks, as a story tells it. */
const SPEECH =
  'says|said|asks|asked|replies|replied|answers|answered|shouts|shouted|yells|yelled|calls|called|cries|cried|whispers|whispered|mutters|muttered|murmurs|murmured|adds|added|explains|explained|begins|began|continues|continued|snaps|snapped|exclaims|exclaimed|insists|insisted|agrees|agreed|admits|admitted|tells|told|warns|warned|promises|promised|squeaks|squeaked|growls|growled|barks|barked|chirps|chirped|hisses|hissed|roars|roared|pleads|pleaded|begs|begged|announces|announced|declares|declared|wonders|wondered|repeats|repeated|jokes|joked|teases|teased|grumbles|grumbled|sings|sang|calls out|called out';
/** What someone does as they speak: theirs only when the sentence runs on into it ("Yes," Kofi nodded). */
const ACTION =
  'laughs|laughed|giggles|giggled|chuckles|chuckled|groans|groaned|sighs|sighed|smiles|smiled|grins|grinned|nods|nodded|gasps|gasped|shrugs|shrugged|winks|winked|beams|beamed';
const VERB = new RegExp(`\\b(?:${SPEECH}|${ACTION})\\b`, 'iu');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where each speaker is named in a stretch of text: never as someone's ("Mira's grandfather"). */
export function namedIn(
  text: string,
  speakers: readonly Speaker[],
): { id: string; at: number; end: number }[] {
  const found: { id: string; at: number; end: number }[] = [];
  for (const speaker of speakers)
    for (const name of speaker.names) {
      const clean = name.trim();
      if (!clean) continue;
      // A name is a name as written ("Rose", never the sun that rose); a
      // lower-case one ("the fox") is found at a sentence's start too.
      const proper = /^\p{Lu}/u.test(clean);
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])${escape(clean)}(?![\\p{L}\\p{N}])(?!['’]s\\b)`,
        proper ? 'gu' : 'giu',
      );
      for (const m of text.matchAll(pattern))
        found.push({ id: speaker.id, at: m.index, end: m.index + m[0].length });
    }
  // A longer name wins over one inside it: "Nana Efua" over "Nana"; and
  // two of someone's names on the same words are one.
  return found
    .filter(
      (one, i) =>
        !found.some(
          (other, j) =>
            other !== one &&
            other.at <= one.at &&
            other.end >= one.end &&
            (other.end - other.at > one.end - one.at ||
              (j < i && other.id === one.id && other.at === one.at)),
        ),
    )
    .sort((a, b) => a.at - b.at);
}

/**
 * Who a clause that leads into a quote says is speaking: one ending in a
 * comma or a colon ("Ada asks, …"; "Nana Efua laughs and promises a new
 * story: …"; "…," said Ada, and Kofi replied, …"). The part with its
 * last speech verb names them, or, naming no one ("…and says,"), the part
 * before it does.
 */
function leadIn(clause: string, speakers: readonly Speaker[]): string | null {
  if (!/[,:—–-]\s*['"“‘]?\s*$/u.test(clause)) return null;
  const parts = clause.split(/[,;:]|\s(?:and|but|then)\s/u);
  let k = parts.length - 1;
  while (k >= 0 && !VERB.test(parts[k])) k -= 1;
  for (let j = k; j >= 0; j -= 1) {
    const named = namedIn(parts[j], speakers)[0];
    if (named) return named.id;
  }
  return null;
}

/**
 * Every quoted line in a page's sentences, with who says it, found in the
 * order of the evidence:
 *
 * 1. a clause leading into the quote with a comma or a colon (Ada asks,
 *    "…"; Nana Efua laughs and promises a story: "…");
 * 2. a speech verb and a name right after it ("…," said Ada; "…," Ada
 *    said; "…," says Mira's grandfather), or a gesture when the sentence
 *    runs on into it ("Yes," Kofi nodded);
 * 3. the first character named in the last clause before it, since the
 *    last quote or the sentence's start (Nana Efua smiles. "…");
 * 4. the writer's own word for who the sentence quotes;
 * 5. the first character named after it, before the next quote;
 * 6. the speaker of the quote before it in the same sentence, whose speech
 *    it goes on with ("Ah," he said. "So you've met…");
 * 7. in a conversation of two, the other of them.
 *
 * Names inside a quote never count, nor anyone's that is someone else's
 * ("Mira's grandfather" names the grandfather). A quote none of these
 * finds stays the narrator's, and is left out.
 */
export function dialogueOf(
  sentences: readonly string[],
  speakers: readonly Speaker[],
  /** The writer's own word, by sentence: its `speaker`, then its `say`s, in order. */
  given: ReadonlyMap<number, readonly string[]> = new Map(),
): DialogueLine[] {
  const lines: DialogueLine[] = [];
  const known = new Set(speakers.map((s) => s.id));
  sentences.forEach((sentence, beat) => {
    const spans = quotedSpans(sentence);
    if (!spans.length) return;
    // The sentence with its quotes blanked: only the words around them count.
    let outside = sentence;
    for (const [a, b] of spans)
      outside = outside.slice(0, a) + ' '.repeat(b - a) + outside.slice(b);
    const hints = (given.get(beat) ?? []).filter((id) => known.has(id));
    spans.forEach(([a, b], i) => {
      const next = spans[i + 1]?.[0] ?? sentence.length;
      const after = outside.slice(b, next);
      const before = outside.slice(i ? spans[i - 1][1] : 0, a);
      const clauses = before
        .split(/(?<=[.!?…])\s+/u)
        .filter((c) => /\p{L}/u.test(c));
      const clause = clauses[clauses.length - 1] ?? '';
      let speaker: string | null = null;
      let by: LineEvidence | null = null;
      const found = (id: string | null | undefined, how: LineEvidence) => {
        if (!speaker && id) [speaker, by] = [id, how];
      };
      // 1. Ada asks, "…"
      found(leadIn(clause, speakers), 'lead');
      // 2. "…," said Ada / "…," Ada said / "Yes," Kofi nodded.
      if (!speaker) {
        const runsOn = /[,—–-]$/u.test(sentence.slice(a, b));
        const verbs = runsOn ? `${SPEECH}|${ACTION}` : SPEECH;
        const attributed = new RegExp(
          `^[\\s'"’”]*(?:(?:${verbs})\\b([^,.;:!?…]*)|([^,.;:!?…]*?)\\s+(?:${verbs})\\b)`,
          'iu',
        ).exec(after);
        if (attributed)
          found(
            namedIn(attributed[1] ?? attributed[2] ?? '', speakers)[0]?.id,
            'verb',
          );
      }
      // 3. Nana Efua smiles. "…"
      found(namedIn(clause, speakers)[0]?.id, 'before');
      // 4. The writer's word: one for each quote, the last for any after.
      found(hints[Math.min(i, hints.length - 1)], 'writer');
      // 5. Named after it, before the next quote.
      found(namedIn(after, speakers)[0]?.id, 'after');
      // 6. Going on with the quote before it.
      const last = lines[lines.length - 1];
      if (i > 0 && last?.beat === beat) found(last.speaker, 'continues');
      // 7. A conversation of two: the other one answers.
      if (lines.length >= 2) {
        const [x, y] = lines.slice(-2);
        if (x.speaker !== y.speaker && beat - y.beat <= 1)
          found(x.speaker, 'turn');
      }
      if (speaker && by) lines.push({ beat, span: [a, b], speaker, by });
    });
  });
  return lines;
}

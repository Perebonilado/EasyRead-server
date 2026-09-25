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
  /** Whether "she" or "he" may mean them; "they", a group. */
  gender?: 'f' | 'm' | null;
  /** A group who speak as one: the "they" of a line. */
  group?: boolean;
  /**
   * Whether they are seen, or only heard ("heard"), or a voice from above
   * ("above"); absent, seen. A voice the words bring in is theirs.
   */
  presence?: 'seen' | 'heard' | 'above' | 'light';
}

/** How a line's speaker was found: the evidence, most certain first. */
export type LineEvidence =
  | 'voice'
  | 'lead'
  | 'verb'
  | 'pronoun'
  | 'before'
  | 'writer'
  | 'after'
  | 'continues'
  | 'turn';

/**
 * Where a line comes from when the words around it say so: a voice from
 * heaven or the sky ("above"), a voice from somewhere out of sight
 * ("off"), a phone or a radio, a letter read out, a thought.
 */
export type HeardFrom = 'above' | 'off' | 'phone' | 'letter' | 'thought';

/** One quoted line: the sentence it is in, where in it, and who says it. */
export interface DialogueLine {
  beat: number;
  /** The quoted words' [start, end) in the sentence, their marks left out. */
  span: [number, number];
  speaker: string;
  by: LineEvidence;
  /** Where it comes from, when the words around it say. */
  from?: HeardFrom;
}

/** A voice from heaven, the sky, the clouds: no one on the stage says it. */
const VOICE_ABOVE =
  /\b(?:a|the)\s+(?:loud\s+|great\s+|deep\s+|gentle\s+)?voice\s+(?:came\s+|spoke\s+|sounded\s+|was\s+heard\s+|rang\s+out\s+|boomed\s+|called\s+|said\s+)?(?:from|out\s+of)\s+(?:heaven|the\s+heavens|the\s+sky|the\s+skies|above|on\s+high|the\s+clouds?)\b|\bfrom\s+(?:heaven|the\s+heavens|the\s+clouds?|on\s+high)\s*,?\s*(?:a|the)\s+voice\b/iu;
/** A voice out of sight, from no one the sentence names; never "in a small voice". */
const VOICE_OFF =
  /(?<!\b(?:in|with|of)\s)\b(?:a|the|an\s+unseen|a\s+distant|a\s+far-off)\s+(?:small\s+|loud\s+|low\s+|deep\s+|gentle\s+|strange\s+|familiar\s+|faint\s+|muffled\s+)?voices?\b/iu;
/** A voice down a line: whoever says it is at the other end. */
const PHONE =
  /\bvoices?\s+(?:came\s+|crackled\s+|sounded\s+|buzzed\s+)?(?:over|down|through|from|on)\s+the\s+(?:phone|telephone|line|radio|walkie-talkie|intercom|receiver|speaker)\b|\b(?:phone|telephone|radio|receiver|walkie-talkie)\s+(?:crackled|buzzed)\b|\b(?:on|over)\s+the\s+(?:radio|intercom)\b/iu;
/** A letter, a note, a message read out: its writer's words. */
const LETTER =
  /\b(?:letter|note|message|postcard|telegram|scroll)\s+(?:said|says|read|reads|went|ran)\b|\b(?:wrote|writes|had\s+written)\b/iu;
/** Words said to oneself, never aloud. */
const TO_ONESELF =
  /\b(?:says|said|whispers|whispered|mutters|muttered)\s+to\s+(?:him|her|them)sel(?:f|ves)\b|\bin\s+(?:his|her|their)\s+(?:head|mind)\b/iu;
const THINKS = /^(?:thinks|thought|thinking|wonders|wondered)$/iu;

/**
 * The words after a quote that may say who says it: the rest of its
 * sentence, when the quote runs on into them ("…," she thought; "…?"
 * asked Ada) or they go on in lower case. After a quote that ends its
 * sentence, what comes next is a sentence of its own.
 */
function attributionAfter(quote: string, after: string): string {
  const next = after.split(/(?<=[.!?…])\s/u)[0] ?? '';
  return /[,?!—–-]$/u.test(quote.trim()) || /^[\s'"’”]*\p{Ll}/u.test(next)
    ? next
    : '';
}

/**
 * Where a quoted line comes from, from the clause that leads into it and
 * the words after it that say who says it: a voice from heaven, a voice
 * out of sight, a voice down a phone, a letter read out, or a thought,
 * whose verb is the one that brings the quote in ("Mira thought, …"; "…,"
 * she wondered). Null for a line said on the stage, as most are.
 */
export function heardFrom(
  lead: string,
  after: string,
  quote: string,
): HeardFrom | null {
  const near = attributionAfter(quote, after);
  const around = `${lead} ${near}`;
  if (VOICE_ABOVE.test(around)) return 'above';
  if (PHONE.test(around)) return 'phone';
  if (LETTER.test(around)) return 'letter';
  if (!/\baloud\b/iu.test(around)) {
    if (TO_ONESELF.test(around)) return 'thought';
    const verbs = (text: string) =>
      [...text.matchAll(new RegExp(`\\b(?:${SPEECH})\\b`, 'giu'))].map(
        (m) => m[0],
      );
    const leadsIn = /[,:—–-]\s*['"“‘]?\s*$/u.test(lead);
    const verb = leadsIn ? verbs(lead).at(-1) : verbs(near)[0];
    if (verb && THINKS.test(verb)) return 'thought';
  }
  if (VOICE_OFF.test(around)) return 'off';
  return null;
}

/**
 * A quote in its sentence, as its speaker is found from it: the clause
 * that leads into it, since the quote before or the sentence's start; the
 * words after it, to the next quote; and its own words. Quotes are
 * blanked, so only the words around them count.
 */
export function quoteContext(
  sentence: string,
  spans: readonly [number, number][],
  i: number,
): { clause: string; after: string; quote: string } {
  let outside = sentence;
  for (const [a, b] of spans)
    outside = outside.slice(0, a) + ' '.repeat(b - a) + outside.slice(b);
  const [a, b] = spans[i];
  const next = spans[i + 1]?.[0] ?? sentence.length;
  const before = outside.slice(i ? spans[i - 1][1] : 0, a);
  const clauses = before
    .split(/(?<=[.!?…])\s+/u)
    .filter((c) => /\p{L}/u.test(c));
  return {
    clause: clauses[clauses.length - 1] ?? '',
    after: outside.slice(b, next),
    quote: sentence.slice(a, b),
  };
}

/**
 * Who a sentence is about, as a pronoun after it may mean them: the first
 * of those who fit named near its start as someone who acts. Undefined
 * when it begins with a pronoun or names only someone who does not fit
 * (the disciples, for "he"): look further back. Null when its subject is
 * someone the story does not name ("A man with leprosy came…"): the
 * pronoun is theirs, and no one's here.
 */
function subjectOf(
  sentence: string,
  fits: readonly Speaker[],
  everyone: readonly Speaker[],
): string | null | undefined {
  const main = mainClause(outsideQuotes(sentence))
    .trim()
    .replace(/^(?:then|and|but|so|now|again)\s+/iu, '');
  if (!/\p{L}/u.test(main)) return undefined;
  const head = main.split(/\s+/).slice(0, 8).join(' ');
  const named = subjectsIn(head, fits)[0];
  if (named) return named.id;
  if (/^(?:he|she|they|it|his|her|their|its)\b/iu.test(main)) return undefined;
  if (subjectsIn(head, everyone).length) return undefined;
  if (
    /^(?:a|an|the|some|one|another|two|three|four|five|several|many)\b/iu.test(
      main,
    )
  )
    return null;
  return undefined;
}

/** A sentence with its quoted words blanked out, so only the words around them count. */
function outsideQuotes(sentence: string): string {
  let outside = sentence;
  for (const [a, b] of quotedSpans(sentence))
    outside = outside.slice(0, a) + ' '.repeat(b - a) + outside.slice(b);
  return outside;
}

/** Words that say someone speaks, as a story tells it: aloud, in a thought, or in writing. */
const SPEECH =
  'thinks|thought|writes|wrote|says|said|asks|asked|replies|replied|answers|answered|shouts|shouted|yells|yelled|calls|called|cries|cried|whispers|whispered|mutters|muttered|murmurs|murmured|adds|added|explains|explained|begins|began|continues|continued|snaps|snapped|exclaims|exclaimed|insists|insisted|agrees|agreed|admits|admitted|tells|told|warns|warned|promises|promised|squeaks|squeaked|growls|growled|barks|barked|chirps|chirped|hisses|hissed|roars|roared|pleads|pleaded|begs|begged|announces|announced|declares|declared|wonders|wondered|repeats|repeated|jokes|joked|teases|teased|grumbles|grumbled|sings|sang|calls out|called out|responds|responded|remarks|remarked|demands|demanded|inquires|inquired|screams|screamed|sobs|sobbed|urges|urged|interrupts|interrupted|commands|commanded|orders|ordered|rebukes|rebuked|scolds|scolded|mumbles|mumbled|stammers|stammered|whimpers|whimpered|bellows|bellowed|saying|say|ask|tell|reply|answer|shout|yell';
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
      // lower-case one ("the fox") is found at a sentence's start too. A
      // name after "the" or "a" is a noun, in any case: "the centurion"
      // is the Centurion.
      const proper = /^\p{Lu}/u.test(clean);
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])${escape(clean)}(?![\\p{L}\\p{N}])(?!['’]s\\b)`,
        proper ? 'gu' : 'giu',
      );
      for (const m of text.matchAll(pattern))
        found.push({ id: speaker.id, at: m.index, end: m.index + m[0].length });
      if (proper) {
        const noun = new RegExp(
          `(?<=\\b(?:the|a|an|this|that)\\s+)${escape(clean)}(?![\\p{L}\\p{N}])(?!['’]s\\b)`,
          'giu',
        );
        for (const m of text.matchAll(noun))
          if (!found.some((f) => f.id === speaker.id && f.at === m.index))
            found.push({
              id: speaker.id,
              at: m.index,
              end: m.index + m[0].length,
            });
      }
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

/** Words before a name that make it the object, not the one who acts: "pointed to his disciples". */
const OBJECT_BEFORE =
  /\b(?:to|at|with|toward|towards|for|from|about|of|by|on|into|onto|before|behind|beside|near|among|after|like|unto|upon|over|under|around)\s+(?:(?:the|a|an|his|her|their|its|our|my|your)\s+)?$/iu;

/** Where each speaker is named as someone who acts: never as the object of a word like "to" or "with". */
export function subjectsIn(
  text: string,
  speakers: readonly Speaker[],
): { id: string; at: number; end: number }[] {
  return namedIn(text, speakers).filter(
    (one) => !OBJECT_BEFORE.test(text.slice(Math.max(0, one.at - 24), one.at)),
  );
}

/** The sentence's main clause: past a leading "When Jesus went to Capernaum," and the like. */
const mainClause = (sentence: string) =>
  /^\s*(?:when|while|as|after|before|if|because|since|although|though|once|until|whenever)\b[^,]*,/iu.test(
    sentence,
  )
    ? sentence.replace(/^[^,]*,/u, '')
    : sentence;

/**
 * Whose voice, letter or note the words bring in, by the name that owns
 * it ("Mum's voice came from the kitchen", "Grandpa's letter said").
 */
function ownerIn(text: string, speakers: readonly Speaker[]): string | null {
  for (const speaker of speakers)
    for (const name of speaker.names) {
      const clean = name.trim();
      if (!clean) continue;
      const owned = new RegExp(
        `(?<![\\p{L}\\p{N}])${escape(clean)}['’]s\\s+(?:\\p{L}+\\s+)?(?:voice|letter|note|message|postcard|telegram|words)\\b`,
        /^\p{Lu}/u.test(clean) ? 'u' : 'iu',
      );
      if (owned.test(text)) return speaker.id;
    }
  return null;
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
    const named = subjectsIn(parts[j], speakers)[0];
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
    const hints = (given.get(beat) ?? []).filter((id) => known.has(id));
    spans.forEach(([a, b], i) => {
      const { clause, after, quote } = quoteContext(sentence, spans, i);
      let speaker: string | null = null;
      let by: LineEvidence | null = null;
      const found = (id: string | null | undefined, how: LineEvidence) => {
        if (!speaker && id) [speaker, by] = [id, how];
      };
      // 0. A voice from heaven, or from out of sight, naming no one: never
      // anyone on the stage. The one heard from above says it, or the one
      // only heard; with none, the narrator does.
      const from = heardFrom(clause, after, quote);
      const near = attributionAfter(quote, after);
      const around = `${clause} ${near}`;
      if (
        (VOICE_ABOVE.test(around) || VOICE_OFF.test(around)) &&
        !namedIn(around, speakers).length
      ) {
        const heard = speakers.filter((s) =>
          from === 'above'
            ? s.presence === 'above'
            : s.presence === 'heard' || s.presence === 'above',
        );
        if (heard.length === 1 || (from === 'above' && heard.length))
          found(heard[0].id, 'voice');
        if (!speaker) return;
      }
      // Someone's own voice, letter or note: "Mum's voice came from the hall".
      found(ownerIn(around, speakers), 'voice');
      // 1. Ada asks, "…"
      found(leadIn(clause, speakers), 'lead');
      // Words after the quote that lead into the next one are the next
      // one's: "…," replied James. "…" Then Sally said, "…".
      const leadsNext =
        i < spans.length - 1 &&
        /[,:—–-]\s*['"“‘]?\s*$/u.test(after) &&
        VERB.test(after.split(/(?<=[.!?…])\s+/u).pop() ?? '');
      // 2. "…," said Ada / "…," Ada said / "Yes," Kofi nodded.
      if (!speaker && !(leadsNext && !/[,—–-]$/u.test(sentence.slice(a, b)))) {
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
      // 2b. They asked him, "…" / "…," she said / He bowed down and asked,
      // "…": the pronoun's own. "They" is the story's one group; "he" or
      // "she" the one speaker who fits, or of those who fit, the one the
      // sentence before is about: its subject, never someone it names as
      // the object ("came to Jesus"). None there, and it is not guessed.
      if (!speaker) {
        const lead = /[,:—–-]\s*['"“‘]?\s*$/u.test(clause)
          ? new RegExp(
              `^[\\s'"’”]*(?:(?:then|and|so|but|now|again)\\s+)?(he|she|they)\\b[^.!?…]*\\b(?:${SPEECH})\\b`,
              'iu',
            ).exec(clause)?.[1]
          : undefined;
        // A clause that ends its own sentence ("…," he asked. "No," she
        // said.) is the quote before's: the words after this one come first.
        const own = !/[.!?…]['"’”]?\s*$/u.test(clause);
        const pronoun =
          lead ??
          new RegExp(
            `^[\\s'"’”]*(?:(?:${SPEECH})\\s+(he|she|they)\\b|(he|she|they)\\s+(?:${SPEECH})\\b)`,
            'iu',
          )
            .exec(near)
            ?.slice(1)
            .find(Boolean) ??
          (own
            ? new RegExp(
                `\\b(he|she|they)\\s+(?:\\w+\\s+)?(?:${SPEECH})\\b`,
                'iu',
              ).exec(clause)?.[1]
            : undefined);
        if (pronoun) {
          const word = pronoun.toLowerCase();
          const fits = speakers.filter((s) =>
            word === 'they'
              ? s.group
              : s.gender === (word === 'she' ? 'f' : 'm'),
          );
          if (fits.length === 1) found(fits[0].id, 'pronoun');
          else if (fits.length > 1) {
            // Whom it stands for: the subject of the nearest sentence
            // before that has one who fits, this paragraph's or the ones
            // before; none if a sentence's subject is someone the story
            // does not name ("A man with leprosy came to Jesus.").
            // Split where the book's own sentences end, quotes and all
            // ("…my brothers?” And pointing…"), before any is blanked.
            const earlier = sentence
              .slice(0, a)
              .split(/(?<=[.!?…]['"’”]?)\s+/u)
              .slice(0, -1);
            const before = [
              ...sentences
                .slice(Math.max(0, beat - 2), beat)
                .flatMap((one) => one.split(/(?<=[.!?…]['"’”]?)\s+/u)),
              ...earlier,
            ].reverse();
            // "He stretched out his hand and touched him saying, …": two
            // of them, a "he" and a "him", and the one who spoke last is
            // as likely the "him". Not guessed.
            const two =
              (word === 'he' && /\bhim\b/iu.test(clause)) ||
              (word === 'she' && /\bher\b/iu.test(clause));
            const spoke = lines[lines.length - 1]?.speaker;
            for (const one of before.slice(0, 4)) {
              const subject = subjectOf(one, fits, speakers);
              if (subject === null) break;
              if (subject) {
                if (!(two && subject === spoke)) found(subject, 'pronoun');
                break;
              }
            }
          }
          // A pronoun no one fits leaves the quote to the steps below,
          // never to the speaker of the quote before (a new speaker).
          if (!speaker && word === 'they') return;
        }
      }
      // 3. Nana Efua smiles. "…": an action, never the quote before's own
      // "James said." standing between the two.
      const tagOfLast =
        i > 0 &&
        new RegExp(
          `^[\\s\\p{P}]*(?:\\p{L}+\\s+){0,3}(?:${SPEECH})\\b(?:\\s+\\p{L}+){0,3}[\\s\\p{P}]*$`,
          'iu',
        ).test(outsideQuotes(sentence).slice(spans[i - 1][1], a));
      if (!tagOfLast) found(subjectsIn(clause, speakers)[0]?.id, 'before');
      // 4. The writer's word: one for each quote, the last for any after.
      found(hints[Math.min(i, hints.length - 1)], 'writer');
      // 5. Named after it, before the next quote: never whoever the words
      // lead into the next quote with ("Jesus reached out, saying, …").
      if (!leadsNext) found(subjectsIn(after, speakers)[0]?.id, 'after');
      // 6. Going on with the quote before it, with nothing between them
      // but its speaker's own "he said".
      const last = lines[lines.length - 1];
      if (i > 0 && last?.beat === beat) {
        const between = outsideQuotes(sentence).slice(spans[i - 1][1], a);
        const same = new RegExp(
          `^[\\s\\p{P}]*(?:(?:\\p{L}+\\s+){0,3}(?:${SPEECH})(?:\\s+\\p{L}+){0,3})?[\\s\\p{P}]*$`,
          'iu',
        );
        const others = namedIn(between, speakers).filter(
          (one) => one.id !== last.speaker,
        );
        // A quote with its own tag after it ("…," replied his sister) is
        // whoever that tag is about, even one the story has no name for.
        const ownTag = new RegExp(`\\b(?:${SPEECH})\\b`, 'iu').test(near);
        if (same.test(between) && !others.length && !ownTag)
          found(last.speaker, 'continues');
      }
      // 7. A conversation of two: the other one answers.
      if (lines.length >= 2) {
        const [x, y] = lines.slice(-2);
        if (x.speaker !== y.speaker && beat - y.beat <= 1)
          found(x.speaker, 'turn');
      }
      if (speaker && by)
        lines.push({
          beat,
          span: [a, b],
          speaker,
          by,
          ...(from ? { from } : {}),
        });
    });
  });
  return lines;
}

/**
 * Whether a lecture page teaches everything on the page it was written
 * from.
 *
 * A student reads the paragraphs while the lecturer speaks, and trusts
 * that what is on the page is what is taught. The plan must place every
 * paragraph in a move or name why it is skipped; the writer must then
 * teach every paragraph it was given; and a written page is checked for
 * the paragraphs it left out, which go back to the writer quoted. The
 * test for "taught" is the writer's own tag on the paragraph, or half of
 * the words only that paragraph uses said in the script.
 */
import type { Block } from '../../contracts';

const STOP = new Set(
  'about above after again against also among another anything around because been before being below between both called cannot could does doing down during each either every from further having here into itself just less many might more most much must nothing often only other over same should since some such than that their them then there these they this those through under until upon very were what when where whether which while whom whose will with within without would your'.split(
    ' ',
  ),
);

/**
 * A word cut to its stem, so "excretion" and "excreting", "regulation"
 * and "regulating", "removal" and "removing" count as the same word: a
 * common ending taken off, then the first six letters.
 */
export function stem(word: string): string {
  const bare = word
    .replace(/'s$/, '')
    .replace(/(?:ing|ion|ed|es|al|ly|s)$/, '');
  return bare.length > 6 ? bare.slice(0, 6) : bare;
}

/** The words that carry a text: four letters or more, lower-cased, common words dropped, cut to their stems. */
export function contentWordsOf(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  return new Set(
    words
      .filter((word) => !STOP.has(word))
      .map(stem)
      .filter(Boolean),
  );
}

/** The first carrying words of a text, in order, as stems: what a list item is named by. */
export function headWordsOf(text: string, count = 2): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  return words
    .filter((word) => !STOP.has(word))
    .map(stem)
    .filter(Boolean)
    .slice(0, count);
}

const plain = (text: string): string =>
  text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface ContentBlock {
  /** The block's index in the note, the number the planner and the writer use. */
  index: number;
  text: string;
  words: Set<string>;
}

/** The fewest carrying words a block needs to count as a paragraph to teach. */
const CONTENT_WORDS_MIN = 4;

/** A line that is about the page rather than of it: a copyright, a source, a figure's label, a link. */
const REFERENCE_LINE =
  /^\s*(?:©|copyright\b|source[s]?\s*[:-]|references?\b|adapted from\b|retrieved\b|https?:\/\/|doi\b|isbn\b|fig(?:ure)?\.?\s*\d|table\s*\d|slide\s*\d|page\s*\d+\s*(?:of\s*\d+)?$)/i;

/** Whether a block is a reference line rather than a paragraph to teach. */
export function looksLikeReference(text: string): boolean {
  if (REFERENCE_LINE.test(text)) return true;
  // A journal or a publisher's mark: a short line with a divider in it.
  return text.includes(' | ') && text.split(/\s+/).length <= 8;
}

/** The paragraphs of a note that carry content: not headings, not a line of a word or two, not a reference line. */
export function contentBlocks(blocks: Block[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  blocks.forEach((block, index) => {
    if (String(block.type).toLowerCase().startsWith('heading')) return;
    const text = plain(block.text ?? '');
    if (looksLikeReference(text)) return;
    const words = contentWordsOf(text);
    if (words.size < CONTENT_WORDS_MIN) return;
    out.push({ index, text, words });
  });
  return out;
}

/** The words a paragraph alone uses on its page, which is what tells it apart when it is taught. */
export function distinctiveWords(
  block: ContentBlock,
  all: ContentBlock[],
): Set<string> {
  const elsewhere = new Set<string>();
  for (const other of all) {
    if (other.index === block.index) continue;
    for (const word of other.words) elsewhere.add(word);
  }
  return new Set([...block.words].filter((word) => !elsewhere.has(word)));
}

const share = (part: Set<string>, whole: Set<string>): number => {
  if (!whole.size) return 0;
  let hit = 0;
  for (const word of whole) if (part.has(word)) hit += 1;
  return hit / whole.size;
};

/** Said when at least this share of the paragraph's own words are in the script. */
const TAUGHT_SHARE = 0.5;
/** For a paragraph with no words of its own, this share of all its words. */
const TAUGHT_SHARE_PLAIN = 0.6;

/**
 * Whether a paragraph is taught by a script, by its own words: half of
 * the words only it uses on the page, or, for a list item named by its
 * first words, those first words said.
 */
export function saidEnough(
  block: ContentBlock,
  all: ContentBlock[],
  said: Set<string>,
): boolean {
  const head = headWordsOf(block.text);
  if (head.length === 2 && head.every((word) => said.has(word))) return true;
  const own = distinctiveWords(block, all);
  if (own.size) return share(said, own) >= TAUGHT_SHARE;
  return share(said, block.words) >= TAUGHT_SHARE_PLAIN;
}

export interface UncoveredBlock {
  index: number;
  text: string;
}

/** The block numbers the writer's tags name. */
export function taughtBlocksOf(tags: { teaches: string[] }[]): Set<number> {
  const out = new Set<number>();
  for (const tag of tags) {
    for (const address of tag.teaches) {
      const block = Number(address.split('.')[0]);
      if (Number.isInteger(block)) out.add(block);
    }
  }
  return out;
}

/**
 * The paragraphs of the page a script leaves untaught: not tagged by any
 * section and not said in their own words. Paragraphs the plan skipped
 * for a checked reason are exempt.
 */
export function uncoveredBlocks(input: {
  blocks: Block[];
  script: string;
  taught: Set<number>;
  exempt?: Set<number>;
}): UncoveredBlock[] {
  const all = contentBlocks(input.blocks);
  const said = contentWordsOf(input.script.replace(/\[[^\]]*\]/g, ' '));
  const out: UncoveredBlock[] = [];
  for (const block of all) {
    if (input.exempt?.has(block.index)) continue;
    if (input.taught.has(block.index)) continue;
    if (saidEnough(block, all, said)) continue;
    out.push({ index: block.index, text: block.text });
  }
  return out;
}

/** The untaught paragraphs as the writer is told them, each quoted. */
export function coverageDetail(uncovered: UncoveredBlock[]): string {
  return uncovered
    .map(
      (block) =>
        `Paragraph ${block.index} is not taught: "${block.text.length > 140 ? `${block.text.slice(0, 140)}...` : block.text}"`,
    )
    .join('; ');
}

/** Whether a paragraph skipped as a repeat was in fact taught before: its own words appear in what came earlier. */
export function repeatVerified(
  block: ContentBlock,
  all: ContentBlock[],
  earlier: string[],
): boolean {
  const before = contentWordsOf(earlier.join(' '));
  return saidEnough(block, all, before);
}

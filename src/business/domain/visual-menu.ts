/**
 * The menu of the possible: everything the app can draw for one page,
 * resolved in advance so the director chooses among things that will
 * draw. Every phrase of the page and the narration is run through the
 * resolver; the cards, figures, mechanisms and motions are listed with
 * what moves in each; the limits are stated. Cheap and exact.
 */
import { MOTIONS, MOTION_MEANINGS } from './living.generated/motion';
import { CARD_KINDS, TUTORIAL_LIMITS } from './visual-cards';
import {
  FIGURE_ANCHORS,
  OUTLINE_LOOKS,
  FIGURE_MANNERS,
  FIGURE_OUTLINES,
  MANNER_MEANINGS,
  OUTLINE_PARTS,
  guessFigure,
  mannersThatMove,
  resolveDrawing,
} from './visual-figures';
import { MECHANISMS, MECHANISM_KINDS } from './visual-mechanisms';
import { fieldFor, pictureCandidates } from './visual-presets';
import type { Near } from './visual-vectors';

/** How many phrases with still pictures the menu lists, the surest first. */
const MAX_PICTURE_LINES = 60;
/** How many drawings a phrase is offered, and how many of each drawing's words. */
const CANDIDATES = 3;

const STOP = new Set(
  'a an the of and or for to in on at with by from some any this that it its their his her is are was were be as into over under than then so if not no they them we you he she who which what when where how all each both more most other such only own same very can will just also than into out up down about after before between through during without within along across behind beyond'.split(
    ' ',
  ),
);

/** What moves in each card, for the director. */
const CARD_MOTION: Record<(typeof CARD_KINDS)[number], string> = {
  title: 'an eyebrow and a heading; still, for a section start',
  statement:
    'one line in big type with words in emphasis; still, for the line to remember',
  number: 'a figure that counts up to itself and a bar that fills',
  chips:
    'named things that pop in on their words, each with its picture or moving figure',
  list: 'items that rise in on their words',
  picture:
    'one thing, moving when alive, with callouts that follow its parts, a bubble, and a motion',
  term: 'a word and its meaning; still',
  compare:
    'two columns whose items come in on their words, each side with its picture or figure',
  flow: 'steps that pop in on their words, arrows that draw and run beads while the step is named',
  hub: 'a centre with inputs and outputs arriving on their words, arrows drawing to it',
  chart: 'bars that grow, a line that draws, shares that fill',
  scene:
    'two to four pictures or figures on a ground line, each with a motion, arriving on their words',
  timeline: 'points that pop along a line on their words',
  table: 'rows that come in on their words',
  rings: 'rings that grow out from the centre on their words',
  overlap: 'two circles and what they share, arriving on their words',
  count: 'one big figure counting up',
  mechanism:
    'a machine that runs, phase by phase, each phase starting on its sentence',
};

/**
 * The phrases of a text worth trying: single words, and pairs of words
 * that stood side by side in the text itself. Pairing content words
 * across whatever was dropped between them invents things nobody wrote:
 * "budgets. The kidneys sit" became "budgets kidneys", which is not a
 * thing and cannot be drawn.
 */
function phrasesOf(text: string): string[] {
  const out = new Set<string>();
  // Sentence by sentence, so a pair never spans a full stop.
  for (const clause of text.toLowerCase().split(/[.!?;:\n]+/)) {
    const tokens = clause
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    let previous: string | null = null;
    for (const token of tokens) {
      const worth = token.length > 2 && !STOP.has(token);
      if (worth) {
        out.add(token);
        if (previous) out.add(`${previous} ${token}`);
      }
      previous = worth ? token : null;
    }
  }
  return [...out];
}

export interface VisualMenu {
  /** Living things and built shapes the page names, each with its outline, parts and manners. */
  figures: string[];
  /** Things the library may draw still, by the page's own word, each with the drawings that could be it. */
  pictures: string[];
  /** The menu as the director reads it. */
  text: string;
  /**
   * Things the page names that nothing in the library draws. Kept so a
   * page's misses can be counted: the list of what the library is short
   * of is exactly the order in which to draw more.
   */
  missing: string[];
}

/** The things a page names that are worth asking a search by meaning about: the ones spelling found nothing for. */
export function phrasesToSearch(
  material: string,
  sentences: string[],
  limit = 80,
): string[] {
  const phrases = phrasesOf(`${material}\n${sentences.join(' ')}`).slice(
    0,
    900,
  );
  const unmatched = phrases.filter(
    (phrase) =>
      !guessFigure(phrase)?.alive && !pictureCandidates(phrase, 1).length,
  );
  // Two words before one: "blood pressure" is a thing, "blood" on its own is a word.
  return unmatched
    .sort(
      (a, b) => b.split(' ').length - a.split(' ').length || a.localeCompare(b),
    )
    .slice(0, limit);
}

/**
 * The menu for a page: what its words and the narration's would draw,
 * and everything else that is possible, said once. `field` is what the
 * document is about, so a word is read in its field: "sign" in a page of
 * law is a signature.
 */
export function buildMenu(
  material: string,
  sentences: string[],
  field?: string,
  /** What a search by meaning found for the phrases spelling could not place, by phrase. */
  near: ReadonlyMap<string, readonly Near[]> = new Map(),
  /** Terms someone has set by hand, which win over anything the app finds. */
  handPicked: ReadonlyMap<string, string> = new Map(),
): VisualMenu {
  // The field this page is in, read from its own words. A field's own
  // term is answered from that field's pack or by words.
  const subject = fieldFor(`${material} ${sentences.join(' ')}`);
  const phrases = phrasesOf(`${material}\n${sentences.join(' ')}`).slice(
    0,
    900,
  );
  const figures = new Map<string, string>();
  const missing = new Set<string>();
  const pictures = new Map<
    string,
    { line: string; score: number; names: string }
  >();
  for (const phrase of phrases) {
    const alive = guessFigure(phrase)?.alive;
    if (alive) {
      const drawn = resolveDrawing(phrase, null, subject);
      if (drawn?.kind !== 'figure') continue;
      const key = `${drawn.figure.outline}:${drawn.figure.parts.join(',')}`;
      // One phrase per figure, the fullest, so "tsetse fly" stands rather than "tsetse".
      const have = figures.get(key);
      if (!have || phrase.length > have.length) figures.set(key, phrase);
      continue;
    }
    const hand = handPicked.get(phrase);
    const candidates = hand
      ? [{ name: hand, score: 300, tags: [] as string[] }]
      : pictureCandidates(phrase, CANDIDATES, near.get(phrase) ?? [], subject);
    if (!candidates.length) {
      missing.add(phrase);
      continue;
    }

    const names = candidates.map((c) => c.name).join('|');
    // One phrase per set of candidates, the shortest: "sign" stands for "sign the".
    const have = pictures.get(names);
    if (have && have.line.length <= phrase.length) continue;
    const sure = candidates[0].name === phrase;
    pictures.set(names, {
      score: candidates[0].score,
      names,
      line: sure
        ? phrase
        : `${phrase}: ${candidates
            .map((c) =>
              c.tags.length ? `${c.name} (${c.tags.join(', ')})` : c.name,
            )
            .join(', ')}`,
    });
  }
  const figureLines = [...figures.entries()].map(([key, phrase]) => {
    const drawn = resolveDrawing(phrase, null, subject);
    if (!drawn || drawn.kind !== 'figure') return '';
    const { outline, parts, manner } = drawn.figure;
    const more = OUTLINE_PARTS[outline].filter((p) => !parts.includes(p));
    return `${phrase}: ${outline} (${parts.join(', ')}${more.length ? `; can add ${more.join(', ')}` : ''}; ${manner}${key ? '' : ''})`;
  });
  const pictureLines = [...pictures.values()]
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length)
    .slice(0, MAX_PICTURE_LINES)
    .map((p) => p.line);
  const cards = CARD_KINDS.map((kind) => `${kind}: ${CARD_MOTION[kind]}`).join(
    '\n',
  );
  const mechanisms = MECHANISM_KINDS.map((kind) => {
    const spec = MECHANISMS[kind];
    return `${kind}: ${spec.what}; numbers ${spec.params.map((p) => p.name).join(', ')}; stages ${spec.stages.map((s) => s.name).join(', ')}; callout places ${spec.anchors.filter((a) => !/\d$/.test(a)).join(', ')}`;
  }).join('\n');
  // Each outline as a shape seen on the page, never as a kind of thing:
  // an outline named by what it is for pulls in anything that shares
  // that purpose, which is how a kidney came to be drawn as a beaker.
  const outlines = FIGURE_OUTLINES.map(
    (o) =>
      `${o}, ${OUTLINE_LOOKS[o]} (parts ${OUTLINE_PARTS[o].join(', ') || 'none'}; callout places ${FIGURE_ANCHORS[o].join(', ')}; moves as ${mannersThatMove(o).join(', ') || 'still only'})`,
  ).join('; ');
  const L = TUTORIAL_LIMITS;
  const text = [
    ...(field
      ? [
          `FIELD: ${field}. Read every thing the page names in this field; a word that means one thing here is drawn as that thing.`,
        ]
      : []),
    'MOVING FIGURES this page names (drawn alive, on the canvas, with these parts and manner; a callout can point at any part or place):',
    figureLines.length
      ? figureLines.map((l) => `- ${l}`).join('\n')
      : '- none found',
    "STILL PICTURES the page names, each with the library drawings that could be it and each drawing's own words. Name a picture by the drawing's name, never by the page's word when several drawings are listed; when none of them is the thing, name none:",
    pictureLines.length
      ? pictureLines.map((l) => `- ${l}`).join('\n')
      : '- none found',
    'Anything else named becomes words in a chip or a label; never a wrong picture. A chip needs no picture; a chip with a wrong one is a fault.',
    "COMPOSED PICTURE, for a picture card when no single drawing is the thing: two library drawings as one, compose {base, add, place}, place one of over (add centred on base), inside (small, centred), beside (side by side), badge (small, at the base's lower right). A signed deed: base file-text, add signature, place badge. A locked deed: base file-text, add lock, place badge.",
    [
      'OUTLINES. An outline is a claim about what a thing looks like, not',
      'about what it does: a thing that holds or filters fluid is not',
      'thereby shaped like a tank. So before naming one, say in looksLike',
      "what the thing looks like in the page's own terms, its form in one",
      'line (a bean-shaped organ with a notch on one edge; a long looping',
      'tube; bands of rock lying on each other), and then name the',
      'outline that line bears out. When none of them is what the thing',
      'looks like, that is the normal answer: show it with a hub, a flow,',
      'chips, a compare, or the words themselves. The outlines:',
      `${outlines}.`,
    ].join(' '),
    `MANNERS a figure moves in: ${FIGURE_MANNERS.map((m) => `${m} (${MANNER_MEANINGS[m]})`).join('; ')}.`,
    'MECHANISMS (a machine that runs on the canvas):',
    mechanisms,
    `MOTIONS for a picture or a scene picture, each with what it looks like and when it fits; a motion runs for its sentence and then rests: ${MOTIONS.map((m) => `${m}: ${MOTION_MEANINGS[m].what}, for ${MOTION_MEANINGS[m].when}`).join('; ')}.`,
    'CARDS and what moves in each:',
    cards,
    `LIMITS: chips ${L.maxChipChars} characters, list items ${L.maxListItemChars}, headings ${L.maxHeadingChars}, statements ${L.maxStatementWords} words, names ${L.maxNameChars}, bubbles ${L.maxBubbleChars}, callouts ${L.maxCalloutChars} (${L.maxCallouts} a card), items ${L.maxItems} a card, ${L.maxInkChars} characters of text on a card in all, every number on the page.`,
  ].join('\n');
  // Only what reads as a thing is worth counting as missing: a lone
  // short word is noise, a pair is usually something the page names.
  const missed = [...missing]
    .filter((phrase) => phrase.includes(' ') || phrase.length > 5)
    .sort();
  return {
    figures: figureLines,
    pictures: pictureLines,
    text,
    missing: missed,
  };
}

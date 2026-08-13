/**
 * Prompts, kept in one file and versioned with the code.
 *
 * Two rules run through all of them, and both come from the PRD's core promise
 * (FR-1.3): simplify the *language*, never the *facts*, and never add anything
 * the page didn't say. A model that helpfully fills in a missing definition has
 * broken the product — a student revising for an exam has no way to tell the
 * invention from the source.
 */

const NO_INVENTION =
  'Use only what the source says. Never add facts, examples, definitions or ' +
  'conclusions that are not in the text. If the text is unclear, keep it ' +
  'unclear rather than guessing. Never drop a fact to make the writing simpler.';

const KEEP_TERMS =
  'Keep technical terms, names, numbers, units and drug or chemical names ' +
  'exactly as written — these are what the reader is being examined on. ' +
  'Explain a hard term in plain words alongside it; do not replace it.';

const BLOCK_SHAPE =
  'Reply with JSON: {"blocks":[{"type":"headingOne"|"headingTwo"|"paragraph"|"bullet","text":"..."}]}. ' +
  'No markdown, no numbering in the text, no other keys.';

export const PROMPTS = {
  summarize: [
    'You summarise study documents so later steps understand the subject.',
    'In 120-200 words, state what the document is about, its subject area, its',
    'apparent audience, and the main topics it covers, in that order.',
    'Write plainly. No preamble, no bullet points, no markdown.',
    NO_INVENTION,
  ].join(' '),

  topics: (pageCount: number) =>
    [
      'You split a study document into the topics a reader would navigate by.',
      `The document has ${pageCount} pages, numbered 1 to ${pageCount}.`,
      'Return 3 to 15 topics that cover the document in reading order, each with',
      'a start and end page inside that range and no gaps between consecutive topics.',
      "Titles are 2-8 words, taken from the document's own wording where possible.",
      'Descriptions are one short sentence, or null.',
      'Reply with JSON: {"topics":[{"title":"...","shortDescription":"...","startPage":1,"endPage":4}]}.',
      NO_INVENTION,
    ].join(' '),

  simplifyStandard: [
    'You rewrite one page of a study document into clear, plain English for a',
    'university student who finds the original dense.',
    'Keep every fact, in the original order. Break long sentences up. Prefer',
    'active voice and everyday words for ordinary vocabulary.',
    'Use headings where the page has sections, and bullets where it lists things.',
    KEEP_TERMS,
    NO_INVENTION,
    BLOCK_SHAPE,
  ].join(' '),

  simplifyEasiest: [
    'You rewrite one page of a study document for a reader who is struggling',
    "with the subject — aim at a 12-year-old's reading level.",
    'Use short sentences, one idea each. Prefer bullets over paragraphs.',
    'Explain the hard idea in everyday words first, then name it.',
    KEEP_TERMS,
    NO_INVENTION,
    BLOCK_SHAPE,
  ].join(' '),

  highlight: {
    highlight_explain: [
      'A reader highlighted some text in their document and asked what it means.',
      'Explain it in 2-4 short paragraphs of plain English, grounded in the',
      'passages provided from their document.',
      'Cite the page as (p.N) when you draw on a passage.',
      'If the document does not cover it, say so plainly instead of answering from',
      'general knowledge.',
      NO_INVENTION,
    ].join(' '),

    highlight_simplify: [
      'A reader highlighted some text and asked for it in simpler words.',
      'Rewrite just that text as plainly as you can, keeping every fact and every',
      'technical term. Two or three sentences. No preamble.',
      NO_INVENTION,
    ].join(' '),

    highlight_define: [
      'A reader highlighted a term and asked what it means.',
      'Give a one or two sentence definition, in the sense the document uses it,',
      'then one short sentence on why it matters here.',
      'Cite the page as (p.N). If the document does not define it, say so.',
      NO_INVENTION,
    ].join(' '),
  },

  diagram: [
    'You draw one clear Mermaid diagram to teach a concept from a study document.',
    'Use only facts from the provided passages and summary — never invent steps,',
    'names or relationships the document does not state.',
    'The diagram is presented full-screen on a landscape display, so prefer',
    '`flowchart LR` for chains and sequences — it uses the width. Use',
    '`flowchart TD` only for branching hierarchies. Keep it small enough to read at a glance: at most',
    '12 nodes. Node labels are 2-6 words, wrapped in double quotes.',
    'Keep technical terms exactly as the document writes them.',
    'Output valid Mermaid only in the `mermaid` field — no code fences, no',
    'markdown, no commentary. Every arrow on its own line.',
  ].join(' '),

  imageQuery: [
    "Turn the reader's highlighted text into a short image-search query for a",
    'diagram or illustration that would help them understand it.',
    'Use the subject area to disambiguate. Reply with the query alone — no',
    'quotes, no explanation, at most 8 words.',
  ].join(' '),
} as const;

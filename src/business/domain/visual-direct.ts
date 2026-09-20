import {
  type CardItem,
  findWord,
  type Moment,
  RUN_MOMENTS,
  TUTORIAL_LIMITS,
  type VisualDecision,
  type VisualDecisions,
  type VisualMark,
  type VisualNarration,
} from './visual-cards';
import { figureHasAnchor, resolveDrawing } from './visual-figures';
import { presetParts } from './visual-presets';
import type { Near } from './visual-vectors';

/**
 * The director, as rules. The narrator marks what each moment shows; the
 * rules fill the card the mark asks for, from the page's own words, with
 * the drawing the library finds for a name, cut to the limits before a
 * check can refuse it. Nothing here reasons about the page: the reasoning
 * was the narrator's, made once with the whole chapter in mind.
 */
export interface RulesContext {
  /** The field the page is in, for the packs' wall. */
  field?: string;
  /** What a search by meaning found for the names spelling could not place. */
  near?: ReadonlyMap<string, readonly Near[]>;
  /** Terms someone set by hand, which win over anything the app finds. */
  handPicked?: ReadonlyMap<string, string>;
}

const L = TUTORIAL_LIMITS;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** Text cut to a limit of characters and words at a word boundary, never mid-word; null when even the first word is too long. */
export function fit(
  text: string | null | undefined,
  maxChars: number,
  maxWords = Infinity,
): string | null {
  if (!text) return null;
  const ws = words(text.replace(/[.;:,]+$/, ''));
  while (ws.length && (ws.join(' ').length > maxChars || ws.length > maxWords))
    ws.pop();
  return ws.length ? ws.join(' ') : null;
}

/** The drawing the library has for a name, by its name, or nothing. */
export function drawingFor(name: string, ctx: RulesContext): string | null {
  const key = name.trim().toLowerCase();
  const hand = ctx.handPicked?.get(key);
  if (hand) return hand;
  const drawn = resolveDrawing(key, null, ctx.field);
  if (drawn?.kind === 'picture') return drawn.name;
  // A living thing is drawn as a figure from its own name.
  if (drawn?.kind === 'figure') return key;
  const near = ctx.near?.get(key)?.[0];
  return near?.name ?? null;
}

/** The shortest of the moment's own sentences that fits a statement, else the intent cut to fit. */
export function lineOf(
  narration: VisualNarration,
  m: { from: number; to: number; intent: string },
): string {
  const own = narration.sentences
    .slice(m.from, m.to + 1)
    .filter(
      (s) =>
        words(s).length <= L.maxStatementWords &&
        s.length <= L.maxStatementChars,
    )
    .sort((a, b) => a.length - b.length)[0];
  return (
    own ??
    fit(m.intent, L.maxStatementChars, L.maxStatementWords) ??
    m.intent.slice(0, L.maxStatementChars)
  );
}

/** Reveals for a card's parts on the sentences that name them, in order, or none. */
export function revealsFor(
  narration: VisualNarration,
  m: { from: number; to: number },
  parts: string[],
): Moment['reveals'] {
  const reveals: { part: number; sentence: number; word?: number }[] = [];
  for (let k = 0; k < parts.length; k += 1) {
    let found: { sentence: number; word: number } | null = null;
    for (let i = m.from; i <= m.to; i += 1) {
      const word = findWord(narration.sentences[i] ?? '', parts[k]);
      if (word !== null) {
        found = { sentence: i, word };
        break;
      }
    }
    if (!found) return undefined;
    const last = reveals[reveals.length - 1];
    if (
      last &&
      (found.sentence < last.sentence ||
        (found.sentence === last.sentence && found.word < (last.word ?? 0)))
    )
      return undefined;
    reveals.push({ part: k, ...found });
  }
  return reveals.length > 1 ? reveals : undefined;
}

const items = (
  names: string[] | null | undefined,
  ctx: RulesContext,
  max: number = L.maxItems,
): CardItem[] =>
  (names ?? [])
    .map((name) => fit(name, L.maxChipChars, L.maxItemWords))
    .filter((text): text is string => Boolean(text))
    .slice(0, max)
    .map((text) => {
      const picture = drawingFor(text, ctx);
      return picture ? { text, picture } : { text };
    });

const decide = (
  index: number,
  intent: string,
  why: string,
  card: Omit<Moment, 'from' | 'to' | 'index' | 'intent'>,
): VisualDecision => ({
  index,
  reasoning: `By rule: ${why}.`,
  shouldSee: fit(intent, 160) ?? intent,
  confidence: 'high',
  ...card,
});

/** The card for one marked moment, or null when the mark cannot be honoured and the words must do. */
function cardFor(
  narration: VisualNarration,
  index: number,
  ctx: RulesContext,
  before: VisualDecision | null,
  run: number,
): VisualDecision | null {
  const m = narration.moments[index];
  const mark: VisualMark = m.show ?? { kind: 'none' };
  const first = index === 0;
  switch (mark.kind) {
    case 'thing': {
      const name = mark.names?.[0]?.trim();
      const picture = name ? drawingFor(name, ctx) : null;
      if (!name) return null;
      if (!picture) {
        // No drawing, but named parts: the thing at the centre, its parts
        // around it, which says what a picture with callouts would have.
        // The centre's box is narrower than a chip: it clips past about 22 characters.
        const centre = fit(name, 22, L.maxItemWords);
        const around = items(mark.parts, ctx, L.maxSide);
        if (!centre || !around.length) return null;
        const reveals = revealsFor(
          narration,
          m,
          around.map((i) => i.text),
        );
        return decide(
          index,
          m.intent,
          `the moment shows ${name} and its parts, which the library does not draw`,
          {
            card: 'hub',
            centre: { text: centre },
            inputs: around,
            ...(reveals ? { reveals } : {}),
          },
        );
      }
      const shown =
        fit(name, L.maxNameChars, 3) ?? name.slice(0, L.maxNameChars);
      const drawn = resolveDrawing(picture, null, ctx.field);
      const places = presetParts(picture);
      const callouts = (mark.parts ?? [])
        .map((part) => part.trim().toLowerCase())
        .filter((part) =>
          drawn?.kind === 'figure'
            ? figureHasAnchor(drawn.figure, part)
            : Boolean(places?.[part]),
        )
        .slice(0, L.maxCallouts)
        .map((part) => ({
          part,
          text: fit(part, L.maxCalloutChars, L.maxCalloutWords) ?? part,
        }));
      // The same thing across neighbouring moments keeps the stage.
      const same =
        !first &&
        before?.card === 'picture' &&
        before.picture === picture &&
        run < RUN_MOMENTS;
      return decide(
        index,
        m.intent,
        `the moment shows ${name}, which the library draws`,
        {
          card: 'picture',
          picture,
          name: shown,
          ...(callouts.length ? { callouts } : {}),
          ...(same ? { continues: true } : {}),
        },
      );
    }
    case 'things': {
      const its = items(mark.names, ctx);
      if (its.length < 2) return null;
      const reveals = revealsFor(
        narration,
        m,
        its.map((i) => i.text),
      );
      return decide(index, m.intent, 'the moment names a set of things', {
        card: 'chips',
        items: its,
        ...(fit(mark.heading, L.maxHeadingChars)
          ? { heading: fit(mark.heading, L.maxHeadingChars)! }
          : {}),
        ...(reveals ? { reveals } : {}),
      });
    }
    case 'steps': {
      const its = items(mark.names, ctx);
      if (its.length < 2) return null;
      const reveals = revealsFor(
        narration,
        m,
        its.map((i) => i.text),
      );
      return decide(
        index,
        m.intent,
        'the moment walks through steps in order',
        {
          card: 'flow',
          items: its,
          ...(fit(mark.heading, L.maxHeadingChars)
            ? { heading: fit(mark.heading, L.maxHeadingChars)! }
            : {}),
          ...(reveals ? { reveals } : {}),
        },
      );
    }
    case 'figure': {
      // A figure is cut by characters only: "1 mg/dL = 88" is four words.
      const figure = fit(mark.figure, L.maxFigureChars);
      if (!figure) return null;
      return decide(index, m.intent, 'the moment gives a figure that matters', {
        card: 'number',
        figure,
        ...(fit(mark.caption, L.maxCaptionChars)
          ? { caption: fit(mark.caption, L.maxCaptionChars)! }
          : {}),
      });
    }
    case 'term': {
      const term = fit(mark.term ?? mark.names?.[0], L.maxTermChars, 3);
      if (!term) return null;
      return decide(index, m.intent, 'the moment defines a term', {
        card: 'term',
        term,
        ...(fit(mark.text, L.maxMeaningChars)
          ? { meaning: fit(mark.text, L.maxMeaningChars)! }
          : {}),
      });
    }
    case 'compare': {
      const sides = (mark.sides ?? []).slice(0, 2).map((side) => {
        const label = fit(side.label, L.maxChipChars, L.maxItemWords);
        const own = (side.items ?? [])
          .map((item) => fit(item, L.maxChipChars, L.maxItemWords))
          .filter((item): item is string => Boolean(item))
          .slice(0, L.maxSide);
        const picture = label ? drawingFor(label, ctx) : null;
        return label
          ? {
              label,
              ...(picture ? { picture } : {}),
              ...(own.length ? { items: own } : {}),
            }
          : null;
      });
      const [left, right] = sides;
      if (
        !left ||
        !right ||
        (!left.picture && !left.items) ||
        (!right.picture && !right.items)
      )
        return null;
      return decide(
        index,
        m.intent,
        'the moment sets two things side by side',
        {
          card: 'compare',
          left,
          right,
        },
      );
    }
    case 'line':
      return decide(index, m.intent, 'the moment is the line to remember', {
        card: 'statement',
        text:
          fit(mark.text, L.maxStatementChars, L.maxStatementWords) ??
          lineOf(narration, m),
      });
    case 'place': {
      const pictures = (mark.names ?? [])
        .map((name) => {
          const picture = drawingFor(name, ctx);
          const shown = fit(name, L.maxNameChars, 3);
          return picture && shown ? { picture, name: shown } : null;
        })
        .filter((p): p is { picture: string; name: string } => Boolean(p))
        .slice(0, L.maxPictures);
      if (pictures.length < 2) return null;
      return decide(
        index,
        m.intent,
        'the moment is a place with things in it',
        {
          card: 'scene',
          pictures,
        },
      );
    }
    case 'layers': {
      const layers = (mark.names ?? [])
        .map((name) => fit(name, 18, 3))
        .filter((l): l is string => Boolean(l))
        .slice(0, L.maxLayers);
      if (layers.length < 2) return null;
      return decide(index, m.intent, 'the moment lays things in layers', {
        card: 'rings',
        layers,
      });
    }
    case 'timeline': {
      const texts = (mark.text ?? '').split('|').map((t) => t.trim());
      const points = (mark.names ?? [])
        .map((name, k) => {
          const label = fit(name, 14, 3);
          return label ? { label, text: fit(texts[k], 40) ?? '' } : null;
        })
        .filter((p): p is { label: string; text: string } => Boolean(p))
        .slice(0, L.maxPoints);
      if (points.length < 2) return null;
      return decide(index, m.intent, 'the moment runs along a line of points', {
        card: 'timeline',
        points,
      });
    }
    case 'none':
    default: {
      const heading = fit(mark.heading, L.maxHeadingChars);
      if (first)
        return decide(index, m.intent, 'the page opens', {
          card: 'title',
          heading:
            heading ??
            fit(narration.title, L.maxHeadingChars) ??
            narration.title.slice(0, L.maxHeadingChars),
        });
      if (heading && before?.card !== 'title')
        return decide(index, m.intent, 'a section opens', {
          card: 'title',
          heading,
        });
      return null;
    }
  }
}

/**
 * Every narration moment decided by its mark. A moment the mark cannot
 * honour, or with no mark, is its own shortest sentence in big type, and
 * never two of those in a row: the second becomes a title of its intent
 * when the one before was not, else it ships plain.
 */
export function directByRules(
  narration: VisualNarration,
  ctx: RulesContext = {},
): VisualDecisions {
  const out: VisualDecision[] = [];
  let before: VisualDecision | null = null;
  let run = 0;
  narration.moments.forEach((m, index) => {
    let decision = cardFor(narration, index, ctx, before, run);
    if (!decision) {
      if (before?.card === 'statement') {
        const heading = fit(m.intent, L.maxHeadingChars);
        decision = heading
          ? decide(
              index,
              m.intent,
              'the words carry it; a heading so two statements never meet',
              { card: 'title', heading },
            )
          : null;
      } else {
        decision = decide(index, m.intent, 'the words carry it', {
          card: 'statement',
          text: lineOf(narration, m),
        });
      }
    }
    if (decision) {
      run = decision.continues ? run + 1 : 0;
      out.push(decision);
      before = decision;
    } else {
      before = null;
      run = 0;
    }
  });
  return { moments: out };
}

/**
 * The step-down where the director was asked to redo. A problem that
 * names one item of a card takes that item out and keeps the card, so
 * one invented word does not cost the whole picture; a card that cannot
 * be kept becomes its own shortest sentence in big type; one that is
 * already that is dropped, which ships it plain.
 */
export function stepDown(
  decisions: VisualDecisions,
  indexes: number[],
  narration: VisualNarration,
  problems: string[] = [],
): VisualDecisions {
  const trimmed = (
    d: VisualDecision,
    position: number,
  ): VisualDecision | null => {
    const own = problems.filter((p) => p.startsWith(`Moment ${position + 1} `));
    if (!own.length) return null;
    let changed = false;
    let next: VisualDecision = { ...d };
    for (const problem of own) {
      const item =
        /(?:item|the (?:left|right) item) (\d+)|item \d+ "([^"]+)"|the (left|right) item says "([^"]+)"/.exec(
          problem,
        );
      const said = /says "([^"]+)"/.exec(problem)?.[1];
      if (!said) return null;
      if (next.items?.length) {
        const items = next.items.filter((i) => i.text !== said);
        if (items.length < 2 || items.length === next.items.length) return null;
        next = { ...next, items, reveals: undefined };
        changed = true;
      } else if (next.card === 'compare' && item) {
        const sideName = /the (left|right) item/.exec(problem)?.[1] as
          'left' | 'right' | undefined;
        const side = sideName ? next[sideName] : undefined;
        if (!side) return null;
        const items = (side.items ?? []).filter((t) => t !== said);
        if (!items.length && !side.picture) return null;
        next = { ...next, [sideName as string]: { ...side, items } };
        changed = true;
      } else if (next.card === 'rings' && next.layers) {
        const layers = next.layers.filter((l) => l !== said);
        if (layers.length < 2) return null;
        next = { ...next, layers };
        changed = true;
      } else return null;
    }
    return changed ? next : null;
  };
  const moments = decisions.moments
    .map((d) => {
      if (!indexes.includes(d.index)) return d;
      const kept = trimmed(d, positionOf(d.index, narration));
      if (kept) return kept;
      if (d.card === 'statement') return null;
      const m = narration.moments[d.index];
      return decide(
        d.index,
        m.intent,
        'stepped down to the words after a check refused the card',
        {
          card: 'statement',
          text: lineOf(narration, m),
        },
      );
    })
    .filter((d): d is VisualDecision => Boolean(d));
  // Two statements never meet: the later one ships plain.
  return {
    moments: moments.filter(
      (d, i) =>
        !(
          d.card === 'statement' &&
          moments[i - 1]?.card === 'statement' &&
          moments[i - 1].index === d.index - 1
        ),
    ),
  };
}

/** A decision's position among the tutorial's moments, which is how a check names it. */
function positionOf(index: number, narration: VisualNarration): number {
  // Every narration moment is a tutorial moment, decided or plain, in order.
  return Math.max(0, Math.min(narration.moments.length - 1, index));
}

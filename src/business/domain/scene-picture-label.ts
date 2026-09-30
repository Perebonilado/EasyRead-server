/**
 * A drawing shows what its label says (studio-glitch-plan §2).
 *
 * "Protective factors act like brakes" became three brake calipers
 * captioned "Parental support", "Education" and "Positive peer
 * influence": each brief drew the comparison's picture, not the thing its
 * name says, and all three alike. A viewer sees three car brakes with
 * words under them that do not match. By code, from the words alone, no
 * model asked:
 *
 *  - a drawing whose brief never names what its label says (its quoted
 *    words aside, which are only writing on it), and
 *  - whose brief draws the picture of a comparison the voice makes ("act
 *    like brakes", "is like a phone with three bars"), or is drawn alike
 *    (the same brief, the name aside) as another of the scene's with a
 *    different label,
 *
 * does not agree with its label. A symbol that stands alone for its name
 * (a padlock for "Confidentiality") is left as it is: nothing says it is
 * a comparison, and nothing else is drawn the same.
 *
 * And a drawing carried over or kept (a build's board, the page before)
 * is only the same thing when it is drawn as the same thing: its name
 * and its brief's subject, never its kind and name alone.
 */

/** Little words that say nothing of what a thing is. */
const LITTLE = new Set(
  'a an the of and or to in on at by for with from its it their this that these those is are be as like into onto over under above below beside each one two three four five six seven eight nine ten large small big little simple icon picture drawing drawn image card words word written label labelled labeled caption shows show showing bold green red blue yellow orange purple grey gray black white pale light dark colour color side view front top bottom left right middle centre center underneath below'.split(
    ' ',
  ),
);

/** A word as matched: lower case, its ending left off (brakes and braking are one). */
const stem = (word: string) =>
  word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 5);

/** The words of some text that say what it is. */
export function subjectWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !LITTLE.has(w))
    .map(stem);
}

/** A brief with what it quotes left out: words to be written on the drawing, not what it draws. */
export const unquoted = (brief: string): string =>
  brief.replace(/(['"‘“])(?:(?!\1).){1,80}?(['"’”])/gu, ' ');

/** How alike two lists of words are: what they share over what either has. */
function alike(a: readonly string[], b: readonly string[]): number {
  const x = new Set(a);
  const y = new Set(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / (x.size + y.size - both);
}

/** The pictures of the comparisons the voice makes: "act like brakes" → brake. */
export function comparisonsIn(sentences: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const said of sentences)
    for (const m of said.matchAll(
      /\b(?:like|as|resembles?|imagine|picture)\s+(?:a|an|the|two|three|four|five)?\s*([\p{L}-]+)(?:\s+([\p{L}-]+))?/giu,
    ))
      for (const w of [m[1], m[2]])
        if (w && w.length >= 3 && !LITTLE.has(w.toLowerCase()))
          out.add(stem(w));
  return out;
}

/** What a drawing to be checked needs: its id, label and brief. */
export interface Pictured {
  id: string;
  name: string;
  brief: string;
}

/** A drawing that does not show what its label says, and why. */
export interface PictureMismatch {
  id: string;
  name: string;
  /** `comparison`: it draws a comparison's picture; `twin`: it is drawn as another with a different label is. */
  why: 'comparison' | 'twin';
  /** The comparison's word, or the other drawing's id. */
  with: string;
}

/** Whether a brief names what a label says, its quoted words aside. */
export function namesItsLabel(name: string, brief: string): boolean {
  const label = subjectWords(name);
  if (!label.length) return true;
  const said = new Set(subjectWords(unquoted(brief)));
  return label.some((w) => said.has(w));
}

/**
 * Each drawing whose picture does not agree with its label, as above.
 * `said` is what the voice says in the scene.
 */
export function picturesAgainstLabels(
  drawings: readonly Pictured[],
  said: readonly string[],
): PictureMismatch[] {
  const comparisons = comparisonsIn(said);
  const out: PictureMismatch[] = [];
  for (const one of drawings) {
    if (!one.brief || namesItsLabel(one.name, one.brief)) continue;
    const drawnAs = subjectWords(unquoted(one.brief));
    const compared = drawnAs.find((w) => comparisons.has(w));
    if (compared) {
      out.push({
        id: one.id,
        name: one.name,
        why: 'comparison',
        with: compared,
      });
      continue;
    }
    const twin = drawings.find(
      (other) =>
        other !== one &&
        subjectWords(other.name).join(' ') !==
          subjectWords(one.name).join(' ') &&
        alike(drawnAs, subjectWords(unquoted(other.brief))) >= 0.6,
    );
    if (twin)
      out.push({ id: one.id, name: one.name, why: 'twin', with: twin.id });
  }
  return out;
}

/**
 * Whether two things are one thing to carry over or keep: the same name,
 * and, for drawings, briefs of the same subject (or either with none).
 */
export function sameSubject(
  a: { name: string; brief?: string | null },
  b: { name: string; brief?: string | null },
): boolean {
  if (subjectWords(a.name).join(' ') !== subjectWords(b.name).join(' '))
    return false;
  if (!a.brief || !b.brief) return true;
  const x = subjectWords(unquoted(a.brief));
  const y = subjectWords(unquoted(b.brief));
  return !x.length || !y.length || alike(x, y) >= 0.25;
}

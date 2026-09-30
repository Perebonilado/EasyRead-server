/**
 * How an explainer ends (studio-explainer-plan, Ask 9, idea 5): "What
 * next?", two or three questions a curious viewer might ask after it,
 * written with the outline (no call of their own), each a next episode.
 *
 * Pure: no model, no I/O.
 */

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export const NEXT_MOST = 3;
export const NEXT_CHARS = 90;

/** The outline's follow-up questions made sound: two or three short, distinct questions; none is none. */
export function nextQuestionsOf(raw: unknown, title = ''): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>([title.toLowerCase().replace(/\W+/g, '')]);
  const out: string[] = [];
  for (const one of raw) {
    if (typeof one !== 'string') continue;
    let q = clean(one).replace(/^[-•\d.)\s]+/, '');
    if (!q || q.length > NEXT_CHARS) continue;
    if (!q.endsWith('?')) q = `${q.replace(/[.!]+$/, '')}?`;
    const key = q.toLowerCase().replace(/\W+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= NEXT_MOST) break;
  }
  return out.length >= 2 ? out : [];
}

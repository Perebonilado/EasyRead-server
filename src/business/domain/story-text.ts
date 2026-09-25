/**
 * A story page's own words, as a video's writer reads them: the page's
 * text in reading order without what is not the story. The notes after
 * the rule go, as do a running head, verse numbers ("8:3 He stretched…"),
 * footnote marks ("the truth,0 I have") and lone numbers; the lines run
 * together into paragraphs, a heading kept as its own.
 */
import { NOTES_RULE } from './reading-order';

/** A heading: a short line in title case, with no sentence's end. */
function isHeading(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 8) return false;
  if (/[.!?,;:”"’]$/u.test(line)) return false;
  const long = words.filter((word) => word.replace(/\P{L}/gu, '').length >= 4);
  if (!long.length) return false;
  const capital = long.filter((word) => /^\p{Lu}/u.test(word));
  return capital.length / long.length >= 0.6;
}

/** The lines as one text, for counting what is in them. */
const body = (lines: readonly string[]) => lines.join('\n');

// eslint-disable-next-line no-control-regex -- the marks a font's glyphs leave when the text layer cannot map them
const MARKS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

export function storyText(text: string): string {
  // Control characters: the marks of a font the text layer could not map.
  text = text
    .split('\n')
    // A line of nothing but a footnote's marks is no line, and ends no
    // paragraph: "the outer darkness, where", the marks, "there will be".
    .filter((line) => !(line.match(MARKS) && !line.replace(MARKS, '').trim()))
    .join('\n')
    .replace(MARKS, '')
    // A word broken over a line: "fol -" and "lowed".
    .replace(/(\p{L}) ?-\n(\p{Ll})/gu, '$1$2');
  const rule = text.split('\n').findIndex((line) => line.trim() === NOTES_RULE);
  const lines = (
    rule >= 0 ? text.split('\n').slice(0, rule) : text.split('\n')
  ).map((line) => line.trim());
  // A running head: a book's name, a chapter and verse, and a page
  // number; wherever the page's reading order left it.
  const head = /^\S+(?:\s+\S+)?\s+\d{1,3}:\d{1,3}(?:\s+\d{1,4})?$/u;
  for (let i = lines.length - 1; i >= 0; i -= 1)
    if (head.test(lines[i])) lines.splice(i, 1);
  // A page numbered by verse, as a Bible is: its numbers and marks are
  // everywhere, and go wherever they stand ("8:12 but the sons", "sky0").
  const verses = (body(lines).match(/(?:^|\s)\d{1,3}:\d{0,3}(?=\s)/gmu) ?? [])
    .length;
  const bible = verses >= 3;
  const kept = lines
    // A lone number: a page number, or a footnote's mark set on its own.
    .filter((line) => !/^\d{1,4}$/u.test(line))
    .map((line) => {
      let out = line;
      out = bible
        ? out
            .replace(/(^|\s)\d{1,3}:\d{0,3}(?=\s|$)/gu, '$1')
            .replace(/(\p{L}|(?<!\d)[,.;:!?”’])\d{1,2}(?=\s|$)/gu, '$1')
            .replace(/(^|\s)0(?=\s|$)/gu, '$1')
        : out
            // Verse numbers before a verse's first word.
            .replace(/(^|\s)\d{1,3}:\d{1,3}\s+(?=[\p{Lu}“"‘'(])/gu, '$1')
            // A footnote's mark after the stop it notes: "the truth,0 I".
            .replace(/(?<!\d)([,.;:!?”’])\d{1,2}(?=\s|$)/gu, '$1');
      const cleaned = out.replace(/\s{2,}/g, ' ').trim();
      // A line of nothing but a verse's number ends no paragraph: it goes.
      return line && !cleaned ? null : cleaned;
    })
    .filter((line): line is string => line !== null);
  const paragraphs: string[] = [];
  let current = '';
  const close = () => {
    if (current.trim()) paragraphs.push(current.replace(/\s+/g, ' ').trim());
    current = '';
  };
  kept.forEach((line, i) => {
    if (!line) {
      close();
      return;
    }
    const next = kept[i + 1] ?? '';
    // A new speaker's line: a line that opens a quote after one that
    // closed a quote begins a paragraph, as the book set it.
    if (/^[“"‘]/u.test(line) && /[”"’]$/u.test(current.trim())) close();
    // A heading stands alone when the line after it begins a sentence.
    if (isHeading(line) && (!next || /^[\p{Lu}“"‘'\d]/u.test(next))) {
      close();
      paragraphs.push(line);
      return;
    }
    // A word broken over a line with a footnote's mark between its
    // halves ("let-", "0", "ter"): joined once the mark has gone.
    const broken = /(\p{L}) ?-$/u.exec(current);
    if (broken && /^\p{Ll}/u.test(line)) {
      current = `${current.slice(0, broken.index)}${broken[1]}${line}`;
      return;
    }
    current += `${current ? ' ' : ''}${line}`;
  });
  close();
  return paragraphs.join('\n');
}

/**
 * How a page ends: its last sentences, as many whole ones as fit in
 * `most` characters. What a line at the top of the next page follows on
 * from ("Mark, James, there's something down here", said by the one who
 * climbed down on the page before).
 */
export function pageEnd(text: string, most = 400): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= most) return flat;
  const tail = flat.slice(-most);
  const start = /[.!?…][”"’]?\s+(?=[\p{Lu}“"‘])/u.exec(tail);
  return start ? tail.slice(start.index + start[0].length) : tail;
}

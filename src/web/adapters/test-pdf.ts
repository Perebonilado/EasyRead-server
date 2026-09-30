/**
 * A small PDF written by hand, for tests and local checks: pages of plain
 * text in Helvetica, a heading set large at the top of any page that has
 * one, and, if asked, an outline (bookmarks) naming the pages chapters
 * open on. No library: a PDF this plain is a few objects and a table of
 * where they start.
 */

export interface TestPage {
  /** Set large at the top, when the page opens something. */
  heading?: string;
  /** The page's body, a paragraph a line. */
  lines: string[];
}

export interface TestBookmark {
  title: string;
  /** The page it opens, from 1. */
  page: number;
  children?: TestBookmark[];
}

const escape = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Words wrapped to lines of about `width` characters. */
function wrapped(text: string, width = 88): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** The PDF's bytes. */
export function testPdf(
  pages: readonly TestPage[],
  bookmarks: readonly TestBookmark[] = [],
): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  // 1 catalog, 2 pages, 3 font: filled in once the rest is known.
  add('');
  add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (const page of pages) {
    const ops: string[] = ['BT'];
    let y = 780;
    if (page.heading) {
      ops.push(`/F1 22 Tf 1 0 0 1 56 ${y} Tm (${escape(page.heading)}) Tj`);
      y -= 40;
    }
    for (const paragraph of page.lines)
      for (const line of wrapped(paragraph)) {
        if (y < 60) break;
        ops.push(`/F1 11 Tf 1 0 0 1 56 ${y} Tm (${escape(line)}) Tj`);
        y -= 15;
      }
    ops.push('ET');
    const stream = ops.join('\n');
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  // The outline: each level's entries linked first to last, under their parent.
  let outlines = 0;
  if (bookmarks.length) {
    outlines = add('');
    const level = (
      items: readonly TestBookmark[],
      parent: number,
    ): number[] => {
      const ids = items.map(() => add(''));
      items.forEach((item, k) => {
        const kids = item.children?.length ? level(item.children, ids[k]) : [];
        objects[ids[k] - 1] = [
          `<< /Title (${escape(item.title)}) /Parent ${parent} 0 R`,
          `/Dest [${pageIds[item.page - 1]} 0 R /XYZ 0 842 0]`,
          k > 0 ? `/Prev ${ids[k - 1]} 0 R` : '',
          k < ids.length - 1 ? `/Next ${ids[k + 1]} 0 R` : '',
          kids.length
            ? `/First ${kids[0]} 0 R /Last ${kids[kids.length - 1]} 0 R /Count ${kids.length}`
            : '',
          '>>',
        ]
          .filter(Boolean)
          .join(' ');
      });
      return ids;
    };
    const top = level(bookmarks, outlines);
    objects[outlines - 1] =
      `<< /Type /Outlines /First ${top[0]} 0 R /Last ${top[top.length - 1]} 0 R /Count ${top.length} >>`;
  }
  objects[0] = `<< /Type /Catalog /Pages 2 0 R${outlines ? ` /Outlines ${outlines} 0 R /PageMode /UseOutlines` : ''} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, k) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${k + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

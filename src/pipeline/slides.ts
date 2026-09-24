import { inflateRawSync } from 'node:zlib';
import { Element, Text, type ChildNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { ommlToLatex } from './omml';

/**
 * The text of a slide deck, read from the deck itself rather than from the
 * PDF made of it. A .pptx is a zip of XML; each slide's text runs are in
 * order inside it, and the deck's own slide list says which slide comes
 * first. One slide is one page, the page numbering the PDF already has.
 * Speaker notes are not read.
 *
 * Returns null when the file is not a deck this reader understands, so the
 * caller keeps the PDF's text. No library: a zip's central directory and
 * deflate are all it takes, and Node has deflate.
 */
export function readSlideTexts(file: Buffer): string[] | null {
  const entries = zipEntries(file);
  if (!entries) return null;
  const presentation = entries.get('ppt/presentation.xml');
  const rels = entries.get('ppt/_rels/presentation.xml.rels');
  if (!presentation || !rels) return null;

  // The slide list names relationship ids; the rels file maps them to files.
  const targets = new Map<string, string>();
  for (const match of rels.matchAll(
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?>/g,
  )) {
    targets.set(match[1], match[2].replace(/^\/?ppt\//, '').replace(/^\//, ''));
  }
  // The same attributes in the other order.
  for (const match of rels.matchAll(
    /<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"[^>]*\/?>/g,
  )) {
    if (!targets.has(match[2])) {
      targets.set(
        match[2],
        match[1].replace(/^\/?ppt\//, '').replace(/^\//, ''),
      );
    }
  }
  const order = [
    ...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g),
  ].map((match) => match[1]);
  if (!order.length) return null;

  const texts: string[] = [];
  for (const id of order) {
    const target = targets.get(id);
    const xml = target
      ? (entries.get(`ppt/${target}`) ?? entries.get(target))
      : undefined;
    if (xml === undefined) return null;
    texts.push(slideText(xml));
  }
  return texts;
}

/**
 * A slide's paragraphs, each on its own line, runs joined as written; an
 * equation as LaTeX between dollar signs, where it stands in its
 * paragraph (two of them for one set on its own). What PowerPoint keeps
 * for an older reader in place of an equation (a picture of it, or its
 * symbols as plain text) is passed over.
 */
export function slideText(xml: string): string {
  const doc = parseDocument(xml, { xmlMode: true });
  const lines: string[] = [];
  const visit = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (!(node instanceof Element) || node.name === 'mc:Fallback') continue;
      if (node.name === 'a:p') {
        const line = paragraphText(node);
        if (line) lines.push(line);
      } else visit(node.children);
    }
  };
  visit(doc.children);
  return lines.join('\n');
}

/** One paragraph's words and equations, in order. */
function paragraphText(paragraph: Element): string {
  let out = '';
  const visit = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      if (!(node instanceof Element) || node.name === 'mc:Fallback') continue;
      if (node.name === 'a:t')
        out += node.children
          .map((c) => (c instanceof Text ? c.data : ''))
          .join('');
      else if (node.name === 'm:oMathPara')
        out += ` $$${kidsOf(node, 'm:oMath').map(ommlToLatex).join(' \\\\ ')}$$ `;
      else if (node.name === 'm:oMath') out += ` $${ommlToLatex(node)}$ `;
      else if (node.name === 'a:br') out += ' ';
      else visit(node.children);
    }
  };
  visit(paragraph.children);
  // A line break inside a paragraph is a break in the text too.
  return out.replace(/\s+/g, ' ').trim();
}

const kidsOf = (node: Element, name: string): Element[] =>
  node.children.filter(
    (one): one is Element => one instanceof Element && one.name === name,
  );

/**
 * The zip's files by name, read from its central directory. Only the XML
 * parts are decoded; media is skipped unread. Null for anything that is
 * not a zip.
 */
function zipEntries(file: Buffer): Map<string, string> | null {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (
    let i = file.length - 22;
    i >= Math.max(0, file.length - 65_557);
    i -= 1
  ) {
    if (file.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = file.readUInt16LE(eocd + 10);
  let offset = file.readUInt32LE(eocd + 16);
  const entries = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    if (file.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = file.readUInt16LE(offset + 10);
    const compressedSize = file.readUInt32LE(offset + 20);
    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const localOffset = file.readUInt32LE(offset + 42);
    const name = file.toString('utf8', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    const localNameLength = file.readUInt16LE(localOffset + 26);
    const localExtraLength = file.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = file.subarray(start, start + compressedSize);
    if (method === 0) entries.set(name, raw.toString('utf8'));
    else if (method === 8)
      entries.set(name, inflateRawSync(raw).toString('utf8'));
    else return null;
  }
  return entries;
}

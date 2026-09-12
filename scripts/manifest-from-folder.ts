/**
 * The first draft of a catalogue manifest, from a folder pulled down from
 * a drive. Walks the tree and writes one CSV row per file, guessing the
 * department, level and course from the folder names and the order from a
 * leading number in the file name. Fix the guesses in a spreadsheet, then
 * feed the CSV to import-catalogue.
 *
 *   npx ts-node --transpile-only scripts/manifest-from-folder.ts ~/rwanda-year3 > manifest.csv
 *
 * Columns: path, department, level, course, code, order, title, format.
 * Folders are read as department / level / course when three deep,
 * level / course when two deep, and course alone when one deep; anything
 * that is not PDF, Word or PowerPoint is listed with an empty format so it
 * can be dropped.
 */
import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: manifest-from-folder <folder>');
  process.exit(1);
}

const FORMATS: Record<string, string> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function csv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rows = walk(root).map((file) => {
  const rel = relative(root, file);
  const parts = rel.split(sep);
  const folders = parts.slice(0, -1);
  const name = basename(file, extname(file));
  const leading = /^\s*(\d+)[.\s_-]+(.*)$/.exec(name);
  const order = leading ? Number(leading[1]) : '';
  const title = (leading ? leading[2] : name).replace(/[_]+/g, ' ').trim();
  const [department, level, course] =
    folders.length >= 3
      ? [folders[0], folders[1], folders.slice(2).join(' / ')]
      : folders.length === 2
        ? ['', folders[0], folders[1]]
        : ['', '', folders[0] ?? ''];
  return {
    path: rel,
    department,
    level,
    course,
    code: '',
    order,
    title,
    format: FORMATS[extname(file).toLowerCase()] ?? '',
  };
});

console.log('path,department,level,course,code,order,title,format');
for (const row of rows) {
  console.log(
    [
      row.path,
      row.department,
      row.level,
      row.course,
      row.code,
      row.order,
      row.title,
      row.format,
    ]
      .map(csv)
      .join(','),
  );
}
console.error(`${rows.length} files listed`);

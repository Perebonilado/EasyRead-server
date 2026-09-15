/**
 * A folder and a manifest in, a school's catalogue out, through the
 * admin's own routes: departments, levels and courses are created where
 * the manifest names ones that do not exist, each file is hashed and
 * skipped when the school already has it, and the rest are uploaded in
 * manifest order. Run it again later and only what is new goes in.
 *
 *   EASIREAD_EMAIL=you@example.com EASIREAD_PASSWORD=... \
 *   npx ts-node --transpile-only scripts/import-catalogue.ts \
 *     --school university-of-rwanda --folder ~/rwanda-year3 --manifest manifest.csv [--prepare steady]
 *
 * EASIREAD_API defaults to http://localhost:4000/api/v1. The manifest is
 * the CSV manifest-from-folder writes, corrected by hand: rows with an
 * empty format are skipped, as are rows with an empty course.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

interface Row {
  path: string;
  department: string;
  level: string;
  course: string;
  code: string;
  order: string;
  title: string;
  format: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** A small CSV reader: quoted fields, doubled quotes, one record per line. */
function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const split = (line: string): string[] => {
    const out: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        out.push(field);
        field = '';
      } else field += ch;
    }
    out.push(field);
    return out;
  };
  const header = split(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = split(line);
    const row = Object.fromEntries(
      header.map((key, index) => [key, (values[index] ?? '').trim()]),
    );
    return row as unknown as Row;
  });
}

async function main() {
  const school = arg('school');
  const folder = arg('folder');
  const manifest = arg('manifest');
  const prepare = arg('prepare');
  const email = process.env.EASIREAD_EMAIL;
  const password = process.env.EASIREAD_PASSWORD;
  const api = process.env.EASIREAD_API ?? 'http://localhost:4000/api/v1';
  if (!school || !folder || !manifest || !email || !password) {
    console.error(
      'usage: --school <slug> --folder <dir> --manifest <csv> [--prepare steady,gentle]; EASIREAD_EMAIL and EASIREAD_PASSWORD set',
    );
    process.exit(1);
  }

  const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
  };
  const call = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const response = await fetch(`${api}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `${method} ${path}: ${response.status} ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  };

  // The school, by its address.
  const { institutions } = await call<{
    institutions: { id: string; slug: string; name: string }[];
  }>('GET', '/admin/institutions');
  const found = institutions.find((row) => row.slug === school);
  if (!found)
    throw new Error(`no school at /${school}; create it in the admin first`);
  const detail = await call<{
    departments: { id: string; name: string }[];
    levels: { id: string; name: string }[];
    courses: {
      id: string;
      departmentId: string;
      levelId: string | null;
      name: string;
    }[];
  }>('GET', `/admin/institutions/${found.id}`);
  const same = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase();

  const departmentId = async (name: string): Promise<string> => {
    const have = detail.departments.find((d) => same(d.name, name));
    if (have) return have.id;
    const made = await call<{ id: string; name: string }>(
      'POST',
      `/admin/institutions/${found.id}/departments`,
      { name },
    );
    detail.departments.push(made);
    console.log(`department: ${name}`);
    return made.id;
  };
  const levelId = async (name: string): Promise<string | null> => {
    if (!name) return null;
    const have = detail.levels.find((l) => same(l.name, name));
    if (have) return have.id;
    const made = await call<{ id: string; name: string }>(
      'POST',
      `/admin/institutions/${found.id}/levels`,
      { name },
    );
    detail.levels.push(made);
    console.log(`level: ${name}`);
    return made.id;
  };
  const courseId = async (row: Row): Promise<string> => {
    const dep = await departmentId(row.department || 'General');
    const lvl = await levelId(row.level);
    const have = detail.courses.find(
      (c) =>
        c.departmentId === dep &&
        (c.levelId ?? null) === lvl &&
        same(c.name, row.course),
    );
    if (have) return have.id;
    const made = await call<{
      id: string;
      departmentId: string;
      levelId: string | null;
      name: string;
    }>('POST', `/admin/institutions/${found.id}/courses`, {
      departmentId: dep,
      levelId: lvl,
      name: row.course,
      code: row.code || null,
    });
    detail.courses.push(made);
    console.log(`course: ${row.course}`);
    return made.id;
  };

  const rows = parseCsv(readFileSync(manifest, 'utf8')).filter(
    (row) => row.format && row.course && MIME[row.format],
  );
  let uploaded = 0;
  let skipped = 0;
  for (const row of rows) {
    const file = join(folder, row.path);
    const bytes = readFileSync(file);
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const course = await courseId(row);
    const intent = await call<
      { documentId: string } | { duplicateOf: string; title: string }
    >(
      'POST',
      `/admin/institutions/${found.id}/courses/${course}/upload-intent`,
      {
        filename: basename(row.path),
        mimeType: MIME[row.format],
        sizeBytes: bytes.length,
        contentHash,
        ...(row.order ? { orderIndex: Number(row.order) } : {}),
      },
    );
    if ('duplicateOf' in intent) {
      skipped += 1;
      console.log(`skip (already here as "${intent.title}"): ${row.path}`);
      continue;
    }
    const put = await fetch(`${api}/documents/${intent.documentId}/content`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': MIME[row.format],
      },
      body: bytes,
    });
    if (!put.ok) throw new Error(`content ${row.path}: ${put.status}`);
    if (row.title && row.title !== basename(row.path, `.${row.format}`)) {
      await call(
        'PATCH',
        `/admin/institutions/${found.id}/materials/${intent.documentId}`,
        {
          title: row.title,
        },
      );
    }
    uploaded += 1;
    console.log(`uploaded: ${row.path}`);
  }
  console.log(`${uploaded} uploaded, ${skipped} skipped, ${rows.length} rows`);

  if (prepare) {
    const styles = prepare
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const estimate = await call<{
      totalUsd: number;
      documents: number;
      pages: number;
    }>('POST', `/admin/institutions/${found.id}/estimate`, {
      styles,
    });
    console.log(
      `prepare: ${estimate.documents} documents, ${estimate.pages} pages, about $${estimate.totalUsd.toFixed(2)}. Run it from the admin once the uploads have finished processing.`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

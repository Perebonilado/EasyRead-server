/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for repositories whose interface is Promise-shaped. */
import { MoveMaterialHandler } from './materials.handlers';
import { Document, type DocumentProps } from '../../domain/entities/document';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { InstitutionRepository } from '../../repositories/institution.repository';

const SCHOOL = 'school-1';

const makeDoc = (overrides: Partial<DocumentProps> = {}) =>
  new Document({
    id: 'doc-1',
    userId: 'admin',
    title: 'Renal function',
    fileName: 'renal.pdf',
    status: 'ready',
    pageCount: 14,
    sourceMimeType: 'application/pdf',
    sizeBytes: 1000,
    source: 'uploaded',
    brief: null,
    sourceUrl: null,
    importManifest: null,
    originalFileRef: null,
    canonicalPdfRef: null,
    thumbnailRef: null,
    contentVersion: 1,
    simplificationUnavailable: false,
    failureReason: null,
    deletedAt: null,
    createdAt: new Date('2026-09-01'),
    institutionId: SCHOOL,
    departmentId: 'medicine',
    levelId: 'year-4',
    courseId: null,
    contentHash: null,
    orderIndex: 0,
    ...overrides,
  });

const COURSES = {
  pharmacology: {
    id: 'pharmacology',
    institutionId: SCHOOL,
    departmentId: 'medicine',
    levelId: 'year-4',
    name: 'Pharmacology',
    code: 'PHA 401',
    orderIndex: 0,
  },
  ethics: {
    id: 'ethics',
    institutionId: SCHOOL,
    departmentId: 'medicine',
    levelId: null,
    name: 'Ethics',
    code: null,
    orderIndex: 1,
  },
  soils: {
    id: 'soils',
    institutionId: SCHOOL,
    departmentId: 'agriculture',
    levelId: 'year-4',
    name: 'Soils',
    code: null,
    orderIndex: 0,
  },
};

function build(doc: Document) {
  const saved: Document[] = [];
  const documents = {
    async findById(id: string) {
      return doc.props.id === id ? doc : null;
    },
    async save(document: Document) {
      saved.push(document);
    },
  } as unknown as DocumentRepository;
  const institutions = {
    async findDepartment(id: string) {
      return ['medicine', 'agriculture'].includes(id)
        ? { id, institutionId: SCHOOL, name: id, slug: id, orderIndex: 0 }
        : null;
    },
    async findLevel(id: string) {
      return ['year-3', 'year-4'].includes(id)
        ? { id, institutionId: SCHOOL, name: id, orderIndex: 0 }
        : null;
    },
    async findCourse(id: string) {
      return COURSES[id as keyof typeof COURSES] ?? null;
    },
  } as unknown as InstitutionRepository;
  const handler = new MoveMaterialHandler(documents, institutions);
  const move = (body: Parameters<MoveMaterialHandler['handle']>[0]) =>
    handler.handle({ userId: 'admin', institutionId: SCHOOL, ...body });
  return { move, saved };
}

describe('a file and its course', () => {
  it('goes into a course of its own place', async () => {
    const doc = makeDoc();
    const { move, saved } = build(doc);
    const result = await move({
      documentId: 'doc-1',
      courseId: 'pharmacology',
    });
    expect(result.data).toEqual({ ok: true });
    expect(doc.props.courseId).toBe('pharmacology');
    expect(saved).toHaveLength(1);
  });

  it('follows the course to its year when it had another', async () => {
    const doc = makeDoc({ levelId: 'year-3' });
    const { move } = build(doc);
    await move({ documentId: 'doc-1', courseId: 'pharmacology' });
    expect(doc.props.levelId).toBe('year-4');
    expect(doc.props.courseId).toBe('pharmacology');
  });

  it('refuses a course of another department', async () => {
    const doc = makeDoc();
    const { move, saved } = build(doc);
    await expect(
      move({ documentId: 'doc-1', courseId: 'soils' }),
    ).rejects.toThrow('another department');
    expect(doc.props.courseId).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it('leaves the course behind when moved to another department', async () => {
    const doc = makeDoc({ courseId: 'pharmacology' });
    const { move } = build(doc);
    await move({ documentId: 'doc-1', departmentId: 'agriculture' });
    expect(doc.props.departmentId).toBe('agriculture');
    expect(doc.props.courseId).toBeNull();
  });

  it("leaves a year's course behind when moved to another year, and keeps a department-wide one", async () => {
    const yearCourse = makeDoc({ courseId: 'pharmacology' });
    await build(yearCourse).move({ documentId: 'doc-1', levelId: 'year-3' });
    expect(yearCourse.props.courseId).toBeNull();

    const wide = makeDoc({ courseId: 'ethics' });
    await build(wide).move({ documentId: 'doc-1', levelId: 'year-3' });
    expect(wide.props.courseId).toBe('ethics');
    expect(wide.props.levelId).toBe('year-3');
  });

  it('takes a file out of any course with null, and keeps it with nothing said', async () => {
    const out = makeDoc({ courseId: 'pharmacology' });
    await build(out).move({ documentId: 'doc-1', courseId: null });
    expect(out.props.courseId).toBeNull();

    const kept = makeDoc({ courseId: 'pharmacology' });
    await build(kept).move({ documentId: 'doc-1', title: 'Renal, week 2' });
    expect(kept.props.courseId).toBe('pharmacology');
    expect(kept.props.title).toBe('Renal, week 2');
  });
});

import { OcrProcessor } from './ocr.processor';
import type { JobContext } from './base.processor';

/**
 * The OCR step's promises, exercised with fakes: text a model reads lands in
 * the page rows, a page that fails costs only itself, and a wholesale failure
 * degrades to "still a scan" instead of failing the document.
 */

const PAGE_COUNT = 3;
const DOC_ID = 'doc-1';

function build(overrides: {
  ocrPage?: (input: { png: Buffer; pageNumber: number }) => Promise<unknown>;
  pageImages?: () => Promise<unknown[]>;
  engine?: {
    isConfigured: () => boolean;
    readPages: (
      pdf: Buffer,
      pageNumbers: number[],
    ) => Promise<{ pageNumber: number; markdown: string }[]>;
  };
}) {
  const written: {
    pageNumber: number;
    text: string;
    isEmpty: boolean;
  }[] = [];
  const doc = {
    id: DOC_ID,
    contentVersion: 1,
    props: {
      pageCount: PAGE_COUNT,
      canonicalPdfRef: 'documents/doc-1/canonical.pdf',
      simplificationUnavailable: true,
      source: 'uploaded',
      deletedAt: null,
    },
    refreshAfterOcr(empty: number, total: number) {
      this.props.simplificationUnavailable = total > 0 && empty / total > 0.6;
    },
  };
  const chained: string[] = [];
  const skipped: string[] = [];
  let saved = false;

  const processor = new OcrProcessor(
    // documents
    {
      findById: async () => doc,
      save: async () => {
        saved = true;
      },
    } as never,
    // runs
    {
      claim: async () => true,
      complete: async () => undefined,
      skip: async (_: string, step: string) => {
        skipped.push(step);
      },
    } as never,
    // pages
    {
      findRange: async () => [
        { pageNumber: 1, text: '', charCount: 0, isEmpty: true },
        {
          pageNumber: 2,
          text: 'digital text here',
          charCount: 17,
          isEmpty: false,
        },
        { pageNumber: 3, text: '', charCount: 0, isEmpty: true },
      ],
      countEmpty: async () =>
        2 - written.filter((page) => !page.isEmpty).length,
      writeOcrText: async (
        _doc: string,
        pageNumber: number,
        text: string,
        _chars: number,
        isEmpty: boolean,
      ) => {
        written.push({ pageNumber, text, isEmpty });
      },
    } as never,
    // calls
    { record: async () => undefined },
    // storage
    { get: async () => Buffer.from('pdf') } as never,
    // pdf toolkit
    {
      pageImages:
        overrides.pageImages ??
        (async () => [
          { pageNumber: 1, png: Buffer.from('a'), width: 800, height: 1000 },
          { pageNumber: 3, png: Buffer.from('b'), width: 800, height: 1000 },
        ]),
    } as never,
    // ocr engine — unconfigured by default, so tests exercise the fallback
    (overrides.engine ?? { isConfigured: () => false }) as never,
    // llm
    {
      ocrPage:
        overrides.ocrPage ??
        (async ({ pageNumber }: { pageNumber: number }) => ({
          value: {
            blocks: [
              {
                type: 'headingOne',
                text: `Endocrine notes, page ${pageNumber}`,
              },
              { type: 'bullet', text: 'insulin lowers blood glucose' },
              {
                type: 'paragraph',
                text: 'Glucagon raises it again by mobilising hepatic glycogen stores.',
              },
            ],
            handwritten: true,
          },
          usage: { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
        })),
    } as never,
    // orchestrator
    {
      afterOcr: async () => {
        chained.push('afterOcr');
      },
    } as never,
  );

  return { processor, doc, written, chained, skipped, saved: () => saved };
}

const context: JobContext = { isFinalAttempt: true, attemptsMade: 1 };
const job = { documentId: DOC_ID, contentVersion: 1 };

describe('OcrProcessor', () => {
  it('writes read pages into their rows and hands off to the pipeline', async () => {
    const { processor, written, chained, doc } = build({});
    await processor.process(job, context);

    expect(written.map((page) => page.pageNumber).sort()).toEqual([1, 3]);
    expect(written[0].text).toContain('- insulin lowers blood glucose');
    expect(written[0].isEmpty).toBe(false);
    // Both empty pages recovered, so the scan verdict is lifted.
    expect(doc.props.simplificationUnavailable).toBe(false);
    expect(chained).toEqual(['afterOcr']);
  });

  it('a failing page costs only itself', async () => {
    const { processor, written, chained } = build({
      ocrPage: async ({ pageNumber }: { pageNumber: number }) => {
        if (pageNumber === 1) throw new Error('model unavailable');
        return {
          value: {
            blocks: [{ type: 'paragraph', text: 'page three text' }],
            handwritten: false,
          },
          usage: { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
        };
      },
    });
    await processor.process(job, context);

    expect(written.map((page) => page.pageNumber)).toEqual([3]);
    expect(chained).toEqual(['afterOcr']);
  });

  it('prefers the batch engine when configured, one call for all pages', async () => {
    const calls: number[][] = [];
    const { processor, written, chained, doc } = build({
      engine: {
        isConfigured: () => true,
        readPages: async (_pdf, pageNumbers) => {
          calls.push(pageNumbers);
          return pageNumbers.map((pageNumber) => ({
            pageNumber,
            markdown: `## Page ${pageNumber}\n\nInsulin is made by the beta cells of the pancreas.`,
          }));
        },
      },
    });
    await processor.process(job, context);

    // One batch call carrying exactly the empty pages, not one per page.
    expect(calls).toEqual([[1, 3]]);
    expect(written.map((page) => page.pageNumber).sort()).toEqual([1, 3]);
    expect(written[0].text).toContain('## Page 1');
    expect(doc.props.simplificationUnavailable).toBe(false);
    expect(chained).toEqual(['afterOcr']);
  });

  it('degrades to a plain scan when the step itself dies, never failing the document', async () => {
    const { processor, chained, skipped, doc } = build({
      pageImages: async () => {
        throw new Error('pdf exploded');
      },
    });
    await processor.process(job, context);

    expect(skipped).toEqual(['ocr']);
    expect(chained).toEqual(['afterOcr']);
    // Untouched: the document remains what it was, a viewable scan.
    expect(doc.props.simplificationUnavailable).toBe(true);
  });
});

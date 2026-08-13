import { buildDigest } from './digest';

const page = (pageNumber: number, text: string, isEmpty = false) => ({
  pageNumber,
  text,
  charCount: text.length,
  isEmpty,
});

describe('buildDigest', () => {
  it('tags every page so topics and citations can name one', () => {
    const digest = buildDigest([
      page(1, 'Thyroid hormones'),
      page(2, 'Vasopressin'),
    ]);
    expect(digest).toContain('[p.1] Thyroid hormones');
    expect(digest).toContain('[p.2] Vasopressin');
  });

  it('skips figure-only pages', () => {
    const digest = buildDigest([page(1, 'Real text'), page(2, '', true)]);
    expect(digest).not.toContain('[p.2]');
  });

  it('samples the whole document rather than truncating the tail', () => {
    // The budget is far too small for the content, which is exactly the case
    // where head-truncation would lose the later chapters entirely.
    const pages = Array.from({ length: 100 }, (_, i) =>
      page(i + 1, 'x'.repeat(5_000)),
    );
    const digest = buildDigest(pages, 20_000);

    expect(digest).toContain('[p.1]');
    expect(digest).toContain('[p.100]');
  });

  it('is empty for a document with no extractable text', () => {
    expect(buildDigest([page(1, '', true), page(2, '', true)])).toBe('');
  });
});

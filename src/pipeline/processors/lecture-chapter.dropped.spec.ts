/* eslint-disable @typescript-eslint/require-await -- an in-memory fake stands in
   for the repository, whose interface is Promise-shaped. */
import { LectureChapterProcessor } from './lecture-chapter.processor';

/** A dropped chapter job says so on the pages it still owed, and only those. */
describe('a chapter job the queue gave up on', () => {
  it('marks the pages still pending as failed, with the reason', async () => {
    const marked: unknown[] = [];
    const lectures = {
      async markPendingFailed(input: unknown) {
        marked.push(input);
        return 2;
      },
    };
    const none = {} as never;
    const processor = new LectureChapterProcessor(
      none,
      none,
      none,
      lectures as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    );
    await processor.onDropped(
      {
        documentId: 'doc',
        contentVersion: 3,
        topicId: 't1',
        orderIndex: 0,
        style: 'steady',
      },
      'job stalled more than allowable limit',
    );
    expect(marked).toEqual([
      {
        documentId: 'doc',
        contentVersion: 3,
        topicId: 't1',
        style: 'steady',
        error: 'Interrupted: job stalled more than allowable limit',
      },
    ]);
  });
});

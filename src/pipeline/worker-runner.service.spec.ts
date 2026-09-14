import { isDropped } from './worker-runner.service';

/**
 * The queue's last word on a job is what turns pending pages into failed
 * ones; a failure that will be retried must leave them alone.
 */
describe('when the queue has given up on a job', () => {
  const error = (message: string, name?: string) => ({ message, name });

  it('is out of attempts', () => {
    expect(isDropped({ attemptsMade: 1 }, error('boom'), 2)).toBe(false);
    expect(isDropped({ attemptsMade: 2 }, error('boom'), 2)).toBe(true);
  });

  it('was declared unrecoverable, whatever the attempts', () => {
    expect(
      isDropped(
        { attemptsMade: 1 },
        error('bad file', 'UnrecoverableError'),
        2,
      ),
    ).toBe(true);
  });

  it('stalled once too often, however many attempts remain', () => {
    expect(
      isDropped(
        { attemptsMade: 0 },
        error('job stalled more than allowable limit'),
        2,
      ),
    ).toBe(true);
  });

  it('is gone altogether', () => {
    expect(isDropped(undefined, error('lost'), 2)).toBe(true);
  });
});

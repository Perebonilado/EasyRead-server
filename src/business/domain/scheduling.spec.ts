import {
  NEW_MEMORY,
  daysBetween,
  ratingFor,
  retrievability,
  schedule,
  type Memory,
  type Rating,
} from './scheduling';

const NOW = new Date('2026-09-01T10:00:00Z');

/** Walks a card through a run of answers, as a real learner would. */
function run(ratings: Rating[], from: Memory = NEW_MEMORY) {
  let memory = from;
  let last = NOW;
  const intervals: number[] = [];
  for (const rating of ratings) {
    const next = schedule({ ...memory }, rating, last);
    intervals.push(next.intervalDays);
    last = next.dueAt;
    memory = { ...next, elapsedDays: next.intervalDays };
  }
  return { memory, intervals };
}

describe('retrievability', () => {
  it('is certain the moment of review and decays after', () => {
    expect(retrievability(0, 10)).toBeCloseTo(1, 5);
    expect(retrievability(10, 10)).toBeLessThan(1);
    expect(retrievability(100, 10)).toBeLessThan(retrievability(10, 10));
  });

  it('decays more slowly for a more stable memory', () => {
    expect(retrievability(30, 100)).toBeGreaterThan(retrievability(30, 10));
  });

  it('treats an unlearned item as unrecallable rather than certain', () => {
    expect(retrievability(5, 0)).toBe(0);
  });
});

describe('schedule', () => {
  it('sends a first-time success into review, days out', () => {
    const next = schedule(NEW_MEMORY, 'good', NOW);
    expect(next.state).toBe('review');
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.intervalDays).toBeGreaterThanOrEqual(1);
    expect(next.dueAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('brings a failed first attempt back inside the session, not tomorrow', () => {
    const next = schedule(NEW_MEMORY, 'again', NOW);
    expect(next.state).toBe('learning');
    expect(next.intervalDays).toBe(0);
    expect(next.lapses).toBe(1);
    // Ten minutes out: still this session, not the very next card.
    const minutes = (next.dueAt.getTime() - NOW.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(0);
    expect(minutes).toBeLessThan(60);
  });

  it('grows the interval every time it is recalled', () => {
    const { intervals } = run(['good', 'good', 'good', 'good']);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });

  it('grows faster for easy than for good, and slower for hard', () => {
    const easy = run(['good', 'easy']).intervals[1];
    const good = run(['good', 'good']).intervals[1];
    const hard = run(['good', 'hard']).intervals[1];
    expect(easy).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(hard);
  });

  it('keeps hard-won stability through a lapse instead of resetting it', () => {
    const learned = run(['good', 'good', 'good', 'good']).memory;
    const lapsed = schedule(learned, 'again', NOW);

    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    // Knocked down, not to zero: months of knowing something is not undone
    // by one blank.
    expect(lapsed.stability).toBeLessThan(learned.stability);
    expect(lapsed.stability).toBeGreaterThan(0);
  });

  it('makes a repeatedly failed item harder, and an easy one easier', () => {
    const struggled = run(['good', 'again', 'again']).memory;
    const breezed = run(['easy', 'easy', 'easy']).memory;
    expect(struggled.difficulty).toBeGreaterThan(breezed.difficulty);
  });

  it('counts every answer as a rep and only failures as lapses', () => {
    const { memory } = run(['good', 'again', 'good', 'hard']);
    expect(memory.reps).toBe(4);
    expect(memory.lapses).toBe(1);
  });

  it('never schedules absurdly far out, however well it goes', () => {
    let memory = NEW_MEMORY;
    let last = NOW;
    for (let i = 0; i < 40; i += 1) {
      const next = schedule({ ...memory }, 'easy', last);
      last = next.dueAt;
      memory = { ...next, elapsedDays: next.intervalDays };
      expect(next.intervalDays).toBeLessThanOrEqual(365 * 2);
    }
  });

  it('rewards a review that arrives late, because recall was harder', () => {
    const learned = run(['good', 'good']).memory;
    const onTime = schedule({ ...learned, elapsedDays: 1 }, 'good', NOW);
    const late = schedule({ ...learned, elapsedDays: 60 }, 'good', NOW);
    // Remembering it after two months is stronger evidence than remembering
    // it tomorrow, so it earns a longer next interval.
    expect(late.stability).toBeGreaterThan(onTime.stability);
  });

  it('keeps difficulty inside its bounds under any run of answers', () => {
    for (const rating of ['again', 'hard', 'good', 'easy'] as Rating[]) {
      const { memory } = run(Array<Rating>(25).fill(rating));
      expect(memory.difficulty).toBeGreaterThanOrEqual(1);
      expect(memory.difficulty).toBeLessThanOrEqual(10);
    }
  });
});

describe('ratingFor', () => {
  it('fails a wrong answer however confident it was', () => {
    expect(ratingFor(false)).toBe('again');
    expect(ratingFor(false, 1)).toBe('again');
  });

  it('reads confidence on a right answer as how well it is known', () => {
    expect(ratingFor(true, 0.2)).toBe('hard');
    expect(ratingFor(true, 0.6)).toBe('good');
    expect(ratingFor(true, 1)).toBe('easy');
  });

  it('assumes nothing when no confidence was captured', () => {
    expect(ratingFor(true)).toBe('good');
  });
});

describe('daysBetween', () => {
  it('counts whole elapsed days and never goes negative', () => {
    const later = new Date('2026-09-11T10:00:00Z');
    expect(daysBetween(NOW, later)).toBe(10);
    expect(daysBetween(later, NOW)).toBe(0);
  });
});

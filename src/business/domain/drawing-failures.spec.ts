import {
  FAILURES_PREFIX,
  failureId,
  failureKey,
  fixtureOfFailure,
  noteOf,
  type DrawingFailure,
} from './drawing-failures';
import { drawerOf } from './drawing-bench';
import { SHEET_VERSION, type CharacterSheet } from './scene-sheet';

const sheet: CharacterSheet = {
  version: SHEET_VERSION,
  drawing: {
    svg: '<svg/>',
    viewBox: [0, 0, 10, 10],
    groups: [],
    states: {},
    moves: true,
    callouts: [],
    field: null,
  },
  anchors: { head: null, body: null, legs: null },
} as unknown as CharacterSheet;

const failure = (more: Partial<DrawingFailure>): DrawingFailure => ({
  id: '2026-09-28-s1-pip-abc',
  at: '2026-09-28T10:00:00.000Z',
  showId: 's1',
  book: 'Farm Friends',
  characterId: 'pip',
  name: 'Pip',
  kind: 'animal',
  size: 'small',
  look: 'a small brown dog.',
  note: null,
  asked: null,
  which: 'theirs',
  drawer: 'artist',
  svg: '<svg/>',
  ...more,
});

describe('a drawing the maker said was not right', () => {
  it('is kept under the failures folder, by day, show, character and drawing', () => {
    const id = failureId({
      at: new Date('2026-09-28T10:00:00Z'),
      showId: 'b5c2e8a0-1111',
      characterId: 'Pip the Dog',
      stamp: 'abcdef1234567890',
    });
    expect(id).toBe('2026-09-28-b5c2e8a0-pip-the-dog-abcdef123456');
    expect(failureKey({ id })).toBe(`${FAILURES_PREFIX}${id}.json`);
    expect(FAILURES_PREFIX).toBe('drawing-bench/failures/');
  });

  it('keeps the note trimmed and short, and none for nothing said', () => {
    expect(noteOf('  ears   too big ')).toBe('ears too big');
    expect(noteOf('   ')).toBeNull();
    expect(noteOf(undefined)).toBeNull();
    expect(noteOf('x'.repeat(900))).toHaveLength(500);
  });
});

describe('a failure as a brief of the drawing bench', () => {
  it('draws the artist’s drawing again from it, as the note asks', () => {
    const made = fixtureOfFailure(
      failure({ note: 'his ears are too big', sheet }),
    );
    expect(made).toEqual({
      fixture: {
        id: 'failure-2026-09-28-s1-pip-abc',
        kind: 'redraw',
        name: 'Pip',
        book: 'Farm Friends',
        is: 'animal',
        size: 'small',
        legs: null,
        look: 'a small brown dog.',
        words: 'his ears are too big',
        from: 'failure-2026-09-28-s1-pip-abc.json',
      },
      old: sheet,
    });
  });

  it('draws it afresh from its look when nothing was said', () => {
    const made = fixtureOfFailure(failure({ sheet }));
    expect('fixture' in made && made.fixture).toMatchObject({
      kind: 'character',
      look: 'a small brown dog.',
    });
    expect('old' in made).toBe(false);
  });

  it('draws a kit’s by the kit from its spec, holding it to what the maker said', () => {
    const made = fixtureOfFailure(
      failure({
        drawer: 'kit',
        note: 'the collar should be blue',
        animal: { species: 'dog' } as never,
      }),
    );
    if (!('fixture' in made)) throw new Error('no fixture');
    expect(made.fixture).toMatchObject({
      kind: 'character',
      drawer: 'kit',
      animal: { species: 'dog' },
      look: 'a small brown dog. The maker said it was not right: the collar should be blue',
    });
    expect(drawerOf(made.fixture)).toBe('kit');
  });

  it('skips people, whom the bench does not draw, and a kit’s with no spec', () => {
    expect(fixtureOfFailure(failure({ kind: 'person' }))).toEqual({
      skipped: 'Pip is a person: the bench draws no people',
    });
    expect(fixtureOfFailure(failure({ drawer: 'kit' }))).toEqual({
      skipped: 'Pip has no spec to draw',
    });
  });
});

import { SHEET_VERSION, type CharacterSheet } from '../scene-sheet';
import { sceneFingerprint } from '../../handlers/studio/studio-views';
import { bibleOf, briefOf, storySheetOf } from './studio';
import {
  DRAWING_MS,
  NO_WORK,
  beingDrawn,
  castLine,
  castWorkOf,
  characterMeant,
  chosen,
  doneDrawing,
  drawnStamp,
  gesturingIn,
  keptDrawn,
  markDrawing,
  named,
  oneLookRequest,
  oneRedrawn,
  toDraw,
  withCandidate,
  withoutCandidate,
} from './studio-drawings';

const bible = bibleOf({
  characters: [
    { name: 'Humpty Dumpty', id: 'humpty', kind: 'creature', look: 'an egg' },
    { name: "the King's Horse", id: 'horse', kind: 'animal', look: 'brown' },
    {
      name: "the King's Man",
      id: 'kingsman',
      kind: 'person',
      voice: 'man',
      figure: { age: 'adult' },
    },
  ],
  sets: [{ name: 'The Wall', id: 'wall' }],
});

const sheet = (svg: string): CharacterSheet => ({
  version: SHEET_VERSION,
  drawing: {
    svg,
    viewBox: [0, 0, 10, 10],
    aspect: 1,
    parts: {},
    labels: {},
    states: {},
    moves: true,
    callouts: [],
    field: null,
  },
  anchors: { head: null, body: null, legs: null },
});

const T = 1_000_000;

describe('what of a cast is being drawn, and what waits to be chosen', () => {
  it('reads back only what it can: anything else is no work', () => {
    expect(castWorkOf(null)).toEqual(NO_WORK);
    expect(
      castWorkOf({
        drawing: { humpty: { since: T, words: 'rounder' }, horse: {} },
        candidates: {
          humpty: { sheet: sheet('<svg/>'), words: 'rounder', at: T },
          horse: { sheet: {}, words: 'x' },
        },
      }),
    ).toEqual({
      drawing: { humpty: { since: T, words: 'rounder' } },
      candidates: {
        humpty: { sheet: sheet('<svg/>'), words: 'rounder', at: T },
      },
    });
  });

  it('marks a character being drawn, and not once done or long gone', () => {
    const work = markDrawing(NO_WORK, ['humpty'], T, 'rounder');
    expect(beingDrawn(work, 'humpty', T + 1000)).toBe(true);
    expect(beingDrawn(work, 'horse', T + 1000)).toBe(false);
    // Drawing that never finished draws no more.
    expect(beingDrawn(work, 'humpty', T + DRAWING_MS + 1)).toBe(false);
    expect(beingDrawn(doneDrawing(work, ['humpty']), 'humpty', T)).toBe(false);
  });

  it('draws at the cast step every animal and creature with no drawing kept, and no person', () => {
    expect(toDraw(bible, {}, NO_WORK, T)).toEqual(['humpty', 'horse']);
    // One drawn already, and one being drawn: none of them again.
    expect(
      toDraw(
        bible,
        { horse: sheet('<svg/>') },
        markDrawing(NO_WORK, ['humpty'], T),
        T + 5,
      ),
    ).toEqual([]);
  });
});

describe('a new drawing of one character, and the maker’s choice', () => {
  const old = sheet('<svg><circle r="1"/></svg>');
  const rounder = sheet('<svg><circle r="2"/></svg>');
  const waiting = withCandidate(NO_WORK, 'humpty', rounder, 'rounder', T);

  it('waits beside the drawing they have: the cast is not touched', () => {
    expect(waiting.candidates.humpty.sheet).toBe(rounder);
    expect(withoutCandidate(waiting, 'humpty').candidates).toEqual({});
    // Nothing waiting, nothing to let go.
    expect(withoutCandidate(NO_WORK, 'humpty')).toBe(NO_WORK);
  });

  it('once chosen, replaces the drawing, and marks the character with it', () => {
    const picked = chosen(
      bible,
      { humpty: old, horse: old },
      waiting,
      'humpty',
    )!;
    expect(picked.cast.humpty).toBe(rounder);
    expect(picked.cast.horse).toBe(old);
    expect(picked.work.candidates).toEqual({});
    const humpty = picked.bible.characters.find((c) => c.id === 'humpty')!;
    expect(humpty.drawn).toBe(drawnStamp(rounder));
    expect(
      picked.bible.characters.find((c) => c.id === 'horse')!.drawn,
    ).toBeUndefined();
    // Nothing waiting: nothing to choose.
    expect(chosen(bible, {}, NO_WORK, 'humpty')).toBeNull();
  });

  it('makes stale only the scenes that show the character chosen', () => {
    const brief = briefOf({ format: 'story' });
    const withHumpty = storySheetOf({
      title: 'The wall',
      set: 'wall',
      onStage: [{ who: 'humpty', spot: 'left' }],
      beats: [{ kind: 'line', who: 'humpty', say: 'Hello!' }],
    });
    const withHorse = storySheetOf({
      title: 'The yard',
      set: 'wall',
      onStage: [{ who: 'horse', spot: 'left' }],
      beats: [{ kind: 'line', who: 'horse', say: 'Neigh.' }],
    });
    const picked = chosen(bible, { humpty: old }, waiting, 'humpty')!;
    expect(sceneFingerprint(withHumpty, picked.bible, brief)).not.toBe(
      sceneFingerprint(withHumpty, bible, brief),
    );
    expect(sceneFingerprint(withHorse, picked.bible, brief)).toBe(
      sceneFingerprint(withHorse, bible, brief),
    );
  });

  it('keeps the choice when the cast is written again, but not for a look that changed', () => {
    const picked = chosen(bible, { humpty: old }, waiting, 'humpty')!.bible;
    // The writer's answer knows nothing of drawings.
    const again = bibleOf({
      ...picked,
      characters: picked.characters.map((c) => ({ ...c, drawn: undefined })),
    });
    expect(
      keptDrawn(again, picked).characters.find((c) => c.id === 'humpty')!.drawn,
    ).toBe(drawnStamp(rounder));
    const changed = {
      ...again,
      characters: again.characters.map((c) =>
        c.id === 'humpty' ? { ...c, look: 'a golden egg' } : c,
      ),
    };
    expect(
      keptDrawn(changed, picked).characters.find((c) => c.id === 'humpty')!
        .drawn,
    ).toBeUndefined();
    // And a stamp the writer made up is none.
    const made = {
      ...again,
      characters: again.characters.map((c) =>
        c.id === 'horse' ? { ...c, drawn: 'abcdef123456' } : c,
      ),
    };
    expect(
      keptDrawn(made, picked).characters.find((c) => c.id === 'horse')!.drawn,
    ).toBeUndefined();
  });
});

describe('a request about one character', () => {
  it('names who it is about, by any name the words may call them', () => {
    expect(named('Redraw Humpty, rounder', bible).map((c) => c.id)).toEqual([
      'humpty',
    ]);
    // "the" names no one.
    expect(named('make the sky blue', bible)).toEqual([]);
  });

  it('is a drawing again of that one character, never the whole cast', () => {
    expect(oneRedrawn('redraw Humpty', bible)?.id).toBe('humpty');
    expect(
      oneRedrawn("Draw the King's Horse again, with a white blaze", bible)?.id,
    ).toBe('horse');
    // More than one, or no drawing asked for: the cast's writer's.
    expect(oneRedrawn('redraw Humpty and the horse', bible)).toBeNull();
    expect(oneRedrawn('add a dragon', bible)).toBeNull();
    expect(oneRedrawn('Humpty should be braver', bible)).toBeNull();
  });

  it('finds whom the producer meant by id or name', () => {
    expect(characterMeant('humpty', bible)?.id).toBe('humpty');
    expect(characterMeant('Humpty Dumpty', bible)?.id).toBe('humpty');
    expect(characterMeant("the King's Horse", bible)?.id).toBe('horse');
    expect(characterMeant('the egg', bible)).toBeNull();
    expect(characterMeant(null, bible)).toBeNull();
  });

  it('asks the cast’s writer to change a person’s look and no one else', () => {
    const man = bible.characters.find((c) => c.id === 'kingsman')!;
    expect(oneLookRequest(man, 'a blue plume')).toBe(
      "Change only the King's Man's look, as the maker asks: a blue plume. Keep everyone else and every place exactly as they are.",
    );
  });
});

describe('what a change to the whole cast is said to have done', () => {
  it('says what changed, never how many there are', () => {
    const after = bibleOf({
      ...bible,
      characters: [
        ...bible.characters.map((c) =>
          c.id === 'horse' ? { ...c, look: 'a white horse' } : c,
        ),
        { name: 'Queen Bee', id: 'bee', kind: 'creature' },
      ],
      sets: [...bible.sets, { name: 'The Market', id: 'market' }],
    });
    expect(castLine(bible, after)).toBe(
      "Cast changed: a new character, Queen Bee; the King's Horse's look; a new place, The Market",
    );
  });

  it('says so when nothing needed changing', () => {
    expect(castLine(bible, bible)).toBe(
      'Cast looked at again: nothing needed changing',
    );
  });

  it('says who left and which place was taken out', () => {
    const after = bibleOf({
      ...bible,
      characters: bible.characters.filter((c) => c.id !== 'horse'),
      sets: [{ name: 'The Yard', id: 'yard' }],
    });
    expect(castLine(bible, after)).toBe(
      "Cast changed: the King's Horse left out; a new place, The Yard; The Wall taken out",
    );
  });
});

describe('who gestures on the stage', () => {
  it('is whoever the artist drew with arms that turn or a head that nods', () => {
    const rigged = (rig: CharacterSheet['rig']): CharacterSheet => ({
      ...sheet('<svg/>'),
      rig,
    });
    const cast = {
      humpty: rigged({ version: 5, joints: {}, mended: [], arms: { r: 30 } }),
      horse: rigged({ version: 5, joints: {}, mended: [], nods: true }),
      dot: rigged({ version: 5, joints: {}, mended: [] }),
      kingsman: sheet('<svg/>'),
    };
    expect([...gesturingIn(cast)].sort()).toEqual(['horse', 'humpty']);
  });
});

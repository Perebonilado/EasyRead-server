import { plainAnimal } from '../scene-animal';
import { plainCreature } from '../scene-creature';
import {
  SHEET_VERSION,
  animalSheet,
  creatureSheet,
  type CharacterSheet,
} from '../scene-sheet';
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
  drawnByArtist,
  drawnStamp,
  gesturingIn,
  keptDrawn,
  keptKits,
  lookChanged,
  markDrawing,
  named,
  oneLookRequest,
  oneRedrawn,
  redrawnToChoose,
  toDraw,
  anotherWay,
  isTheirs,
  optionMeant,
  pickOf,
  withCandidate,
  withOptions,
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
      // One new drawing kept before there were three is one option.
      candidates: {
        humpty: {
          words: 'rounder',
          at: T,
          options: [
            { id: drawnStamp(sheet('<svg/>')), sheet: sheet('<svg/>') },
          ],
        },
      },
    });
  });

  it('reads back up to three options each once, with their ids, and a first drawing’s takes', () => {
    const a = sheet('<svg><circle r="1"/></svg>');
    const b = sheet('<svg><circle r="2"/></svg>');
    const kept = castWorkOf({
      drawing: {},
      candidates: {
        horse: {
          words: '',
          at: T,
          first: true,
          options: [
            { sheet: a },
            { sheet: a },
            { sheet: b, look: 'a brown horse' },
            { sheet: {} },
            { figure: null },
          ],
        },
      },
    });
    expect(kept.candidates.horse).toEqual({
      words: '',
      at: T,
      first: true,
      options: [
        { id: drawnStamp(a), sheet: a },
        { id: drawnStamp(b), sheet: b, look: 'a brown horse' },
      ],
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
    expect(waiting.candidates.humpty.options[0].sheet).toBe(rounder);
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

describe('an animal the kit draws', () => {
  const kit = bibleOf({
    characters: [
      {
        name: 'Clover',
        id: 'clover',
        kind: 'animal',
        look: 'a chestnut horse',
        animal: { species: 'horse' },
      },
      { name: 'Pip', id: 'pip', kind: 'animal', look: 'a small brown dog' },
      { name: 'Eggbert', id: 'eggbert', kind: 'creature', look: 'an egg' },
    ],
  });
  const clover = kit.characters[0];
  const pip = kit.characters[1];

  it('is drawn by code, not the artist; any other animal and a creature are the artist’s', () => {
    expect(drawnByArtist(clover)).toBe(false);
    expect(drawnByArtist(pip)).toBe(true);
    expect(drawnByArtist(kit.characters[2])).toBe(true);
    // At the cast step only the artist's are drawn.
    expect(toDraw(kit, {}, NO_WORK, T)).toEqual(['pip', 'eggbert']);
    // A change asked of any but a person's look is a new drawing to choose.
    expect(redrawnToChoose(clover)).toBe(true);
    expect(redrawnToChoose(pip)).toBe(true);
  });

  it('has its look changed when its spec changes', () => {
    const blanket = {
      ...clover,
      animal: { ...clover.animal!, wear: { back: 'saddle blanket' as const } },
    };
    expect(lookChanged(clover, blanket)).toBe(true);
    expect(lookChanged(clover, { ...clover })).toBe(false);
  });

  it('keeps whom the artist drew so when the cast is written again, and the kit’s spec when the writer leaves it out', () => {
    const rewritten = bibleOf({
      characters: [
        // The writer left Clover's spec out, and gave Pip one.
        { ...clover, animal: undefined },
        { ...pip, animal: { species: 'dog', coat: 'brown' } },
        kit.characters[2],
        // Someone new, with a spec of their own.
        { name: 'Dot', id: 'dot', kind: 'animal', animal: { species: 'duck' } },
      ],
    });
    const kept = keptKits(rewritten, kit).characters;
    expect(kept.find((c) => c.id === 'clover')!.animal).toEqual(clover.animal);
    expect(kept.find((c) => c.id === 'pip')!.animal).toBeUndefined();
    expect(kept.find((c) => c.id === 'dot')!.animal?.species).toBe('duck');
    // A first cast is as written.
    expect(keptKits(rewritten, null)).toBe(rewritten);
  });

  it('once its new drawing is chosen, has the new spec and its words, the artist’s no more', async () => {
    const spec = {
      ...clover.animal!,
      wear: { back: 'saddle blanket' as const },
      wearColour: 'red' as const,
    };
    const drawnAgain = await animalSheet(spec, 'clover');
    const waiting = withCandidate(
      NO_WORK,
      'clover',
      drawnAgain,
      'give her a red saddle blanket',
      T,
      'a chestnut horse with a red saddle blanket',
    );
    const picked = chosen(kit, {}, waiting, 'clover')!;
    const now = picked.bible.characters.find((c) => c.id === 'clover')!;
    expect(now.animal).toEqual(spec);
    expect(now.look).toBe('a chestnut horse with a red saddle blanket');
    expect(picked.cast.clover).toBe(drawnAgain);
    // A kit drawing chosen for one the artist drew makes it the kit's.
    const pipAsKit = withCandidate(
      NO_WORK,
      'pip',
      await animalSheet({ ...clover.animal!, species: 'dog' }, 'pip'),
      'draw him with the kit',
      T,
    );
    const pipNow = chosen(kit, {}, pipAsKit, 'pip')!.bible.characters.find(
      (c) => c.id === 'pip',
    )!;
    expect(drawnByArtist(pipNow)).toBe(false);
    expect(pipNow.look).toBe('a small brown dog');
  });

  it('gestures with its arms when it has them: a monkey', async () => {
    const cast = {
      momo: await animalSheet(plainAnimal('monkey'), 'momo'),
      clover: await animalSheet(plainAnimal('horse'), 'clover'),
    };
    expect([...gesturingIn(cast)]).toEqual(['momo']);
  });
});

describe('a creature the kit draws', () => {
  const kit = bibleOf({
    characters: [
      {
        name: 'Eggbert',
        id: 'eggbert',
        kind: 'creature',
        look: 'a white egg with a bow tie',
        size: 'large',
        creature: {
          body: 'egg',
          size: 'small',
          bodyColour: 'white',
          wear: { neck: 'bow tie' },
        },
      },
      { name: 'Marina', id: 'marina', kind: 'creature', look: 'a mermaid' },
      // Only a creature has one.
      {
        name: 'Pip',
        id: 'pip',
        kind: 'animal',
        look: 'a dog',
        creature: { body: 'egg' },
      },
    ],
  });
  const [eggbert, marina, pip] = kit.characters;

  it('is drawn by code, not the artist, at its own size; one that does not fit is the artist’s', () => {
    expect(eggbert.creature?.body).toBe('egg');
    expect(eggbert.size).toBe('small');
    expect('creature' in marina).toBe(false);
    expect('creature' in pip).toBe(false);
    expect(drawnByArtist(eggbert)).toBe(false);
    expect(drawnByArtist(marina)).toBe(true);
    expect(toDraw(kit, {}, NO_WORK, T)).toEqual(['marina', 'pip']);
    expect(redrawnToChoose(eggbert)).toBe(true);
    expect(lookChanged(eggbert, { ...eggbert })).toBe(false);
    expect(
      lookChanged(eggbert, {
        ...eggbert,
        creature: { ...eggbert.creature!, texture: 'crack' },
      }),
    ).toBe(true);
  });

  it('keeps its spec when the writer leaves it out, and gives none to whom the artist drew', () => {
    const rewritten = bibleOf({
      characters: [
        { ...eggbert, creature: undefined },
        { ...marina, creature: { body: 'drop' } },
        pip,
      ],
    });
    const kept = keptKits(rewritten, kit).characters;
    expect(kept[0].creature).toEqual(eggbert.creature);
    expect(kept[0].size).toBe('small');
    expect(kept[1].creature).toBeUndefined();
  });

  it('once its new drawing is chosen, has the new spec and its words; it gestures with its arms', async () => {
    const spec = {
      ...eggbert.creature!,
      build: 'stout' as const,
      texture: 'crack' as const,
    };
    const drawnAgain = await creatureSheet(spec, 'eggbert');
    const waiting = withCandidate(
      NO_WORK,
      'eggbert',
      drawnAgain,
      'rounder, with a crack on top',
      T,
      'a round white egg with a crack on top and a bow tie',
    );
    const picked = chosen(kit, {}, waiting, 'eggbert')!;
    const now = picked.bible.characters.find((c) => c.id === 'eggbert')!;
    expect(now.creature).toEqual(spec);
    expect(now.look).toBe(
      'a round white egg with a crack on top and a bow tie',
    );
    expect(picked.cast.eggbert).toBe(drawnAgain);
    const cast = {
      eggbert: drawnAgain,
      boo: await creatureSheet(
        { ...plainCreature('ghost'), arms: 'none' },
        'boo',
      ),
    };
    expect([...gesturingIn(cast)]).toEqual(['eggbert']);
  });
});

describe('three to choose from (Phase E)', () => {
  const a = sheet('<svg><circle r="1"/></svg>');
  const b = sheet('<svg><circle r="2"/></svg>');
  const c = sheet('<svg><circle r="3"/></svg>');
  const d = sheet('<svg><circle r="4"/></svg>');
  const three = withOptions(
    NO_WORK,
    'humpty',
    [{ sheet: a }, { sheet: b }, { sheet: b }, { sheet: c }, { sheet: d }],
    'rounder',
    T,
  );

  it('keeps each drawing once, at most three, each with its own id', () => {
    const waiting = three.candidates.humpty;
    expect(waiting.options.map((o) => o.id)).toEqual([a, b, c].map(drawnStamp));
    // None is no change.
    expect(withOptions(NO_WORK, 'humpty', [], 'x', T)).toBe(NO_WORK);
  });

  it('uses the one chosen, by its id or its number; the first when none is said', () => {
    const cast = { humpty: a };
    expect(
      chosen(bible, cast, three, 'humpty', drawnStamp(c))!.cast.humpty,
    ).toBe(c);
    expect(chosen(bible, cast, three, 'humpty', 2)!.cast.humpty).toBe(b);
    expect(chosen(bible, cast, three, 'humpty')!.cast.humpty).toBe(a);
    expect(chosen(bible, cast, three, 'humpty', 4)).toBeNull();
    expect(chosen(bible, cast, three, 'humpty', 'nope')).toBeNull();
    expect(optionMeant(undefined, 1)).toBeNull();
  });

  it('gives a person the figure chosen, and their look, with no drawing kept', () => {
    const tobi = bible.characters.find((one) => one.kind === 'person')!;
    const figure = { ...tobi.figure!, hairColour: 'black' as const };
    const waiting = withOptions(
      NO_WORK,
      tobi.id,
      [{ figure, look: 'a boy with black hair' }],
      'black hair',
      T,
    );
    const picked = chosen(bible, {}, waiting, tobi.id)!;
    const now = picked.bible.characters.find((one) => one.id === tobi.id)!;
    expect(now.figure).toEqual(figure);
    expect(now.look).toBe('a boy with black hair');
    expect(now.drawn).toBeUndefined();
    expect(picked.cast).toEqual({});
    // Their look changed: every scene with them is made again.
    expect(lookChanged(tobi, now)).toBe(true);
    expect(isTheirs(waiting.candidates[tobi.id].options[0], now)).toBe(true);
    expect(isTheirs(waiting.candidates[tobi.id].options[0], tobi)).toBe(false);
  });

  it('knows which one the maker’s words choose', () => {
    expect(pickOf('use the second one')).toBe(2);
    expect(pickOf('I like the first one best')).toBe(1);
    expect(pickOf('the last one, please')).toBe(3);
    expect(pickOf('number 3')).toBe(3);
    expect(pickOf('the middle one')).toBe(2);
    expect(pickOf('keep the old one')).toBe(0);
    expect(pickOf('none of them, keep him as he is')).toBe(0);
    expect(pickOf('use this one')).toBeNull();
    expect(pickOf('make him taller')).toBeNull();
  });

  it('draws someone again another way when no one said how', () => {
    expect(anotherWay({ name: 'Pip' })).toBe(
      'Draw Pip again, another way, as their look says.',
    );
  });
});

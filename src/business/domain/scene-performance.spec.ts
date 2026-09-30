/**
 * Acting that matches the words (scene-performance): what a line does,
 * read from its words; the gesture it is acted with, at its fullest on
 * the key word; whoever it is said to looking at the speaker and reacting
 * where it hits them, before they answer; feeling moving the body; the
 * faces worn a moment and given back; and the check that says what acting
 * each line got.
 */
import type { SceneDto, SceneStepDto } from '../../contracts';
import { actingOf, type SpokenLine } from './scene-acting';
import {
  ON_KEY_MS,
  PEAK_AT,
  PERFORM_MS,
  actedLines,
  faceOfAim,
  feltEffects,
  nameableThings,
  reactionTo,
  readLine,
  speakerMoves,
  startFor,
  temperOf,
  type FeltFace,
  type PerformMove,
} from './scene-performance';

const words = (text: string) => text.split(' ');
const aim = (text: string) => readLine(words(text)).aim;

/** A line said word by word, 300ms a word. */
const said = (
  speaker: string,
  text: string,
  startMs: number,
  to?: string,
): SpokenLine => {
  const list = text.split(' ').map((word, i) => ({
    text: word,
    startMs: startMs + i * 300,
    endMs: startMs + i * 300 + 260,
  }));
  return {
    speaker,
    ...(to ? { to } : {}),
    startMs,
    endMs: list[list.length - 1].endMs,
    words: list,
  };
};

const step = (atMs: number, show: string[]): SceneStepDto => ({
  atMs,
  layout: 'row',
  show,
  arrows: [],
  enter: {},
  focus: null,
});

/** A film's two (or three), talking, as the stage acts them. */
const film = (
  lines: SpokenLine[],
  more: Partial<Parameters<typeof actingOf>[0]> = {},
  who: string[] = ['sam', 'alex'],
) => {
  const felt: FeltFace[] = [];
  const acting = actingOf({
    actors: who,
    names: new Map([
      ['sam', ['Sam']],
      ['alex', ['Alex']],
      ['ria', ['Ria']],
    ]),
    steps: [step(0, who)],
    lines,
    narration: [],
    directed: [],
    durationMs: 30_000,
    walks: true,
    film: true,
    felt,
    ...more,
  });
  return { acting, felt };
};

const peak = ([at, move, ms]: [number, string, number, string?]) =>
  at + (PEAK_AT[move as PerformMove] ?? 0.2) * ms;

describe('what a line does, read from its words', () => {
  it('reads asking, refusing, warning, begging, teasing, accusing, threatening and confessing', () => {
    expect(aim('Who ate the last piece of cake?')).toBe('asks');
    expect(aim('No! I will not say sorry.')).toBe('refuses');
    expect(aim("I won't do it.")).toBe('refuses');
    expect(aim('Careful, the floor is wet.')).toBe('warns');
    expect(aim('Please, just one more slice?')).toBe('begs');
    expect(aim("Bet you can't catch me!")).toBe('teases');
    expect(aim('You took my shoe!')).toBe('accuses');
    expect(aim('Tell me, or else I tell Mum.')).toBe('threatens');
    expect(aim('Okay. It was me. I am sorry.')).toBe('confesses');
    expect(aim("Don't worry, we'll find him.")).toBe('comforts');
    expect(aim('Well done, you did it!')).toBe('praises');
    expect(aim('Guess what? I found the key!')).toBe('reveals');
    expect(aim('Knock knock. Who is there?')).toBe('jokes');
    expect(aim('Hello there.')).toBe('greets');
    expect(aim('Sit down and listen.')).toBe('orders');
    expect(aim('The bus comes at noon.')).toBe('says');
  });

  it('reads handing, taking and showing, and turns them on the thing they name', () => {
    const things = [{ aim: 'f:table', words: ['table'] }];
    expect(aim('Here, have this apple.')).toBe('gives');
    expect(aim('Give it to me, now.')).toBe('takes');
    const shown = readLine(words('Look at the table by the door.'), { things });
    expect(shown.aim).toBe('shows');
    expect(shown.thing).toEqual({ aim: 'f:table', word: 3 });
    expect(shown.key).toBe(3);
  });

  it('takes the sheet’s own aim where it gives one, and W2’s words for it', () => {
    expect(
      readLine(words('The bus comes at noon.'), { aim: 'warns' }).aim,
    ).toBe('warns');
    expect(readLine(words('I never touched it.'), { aim: 'lies' }).aim).toBe(
      'dodges',
    );
  });

  it('finds the key word each turns on: the no, the name of the fault, the please, the question word', () => {
    const key = (text: string) => {
      const w = words(text);
      return w[readLine(w).key];
    };
    expect(key('Not me. I was out all day.')).toBe('Not');
    expect(key('You were home. You did this!')).toBe('You');
    expect(key('Well, please, can I have one?')).toBe('please,');
    expect(key('So who ate the cake?')).toBe('who');
    expect(key('The bus comes at noon.')).toBe('noon.');
  });

  it('knows a punchline lands on its last word, a warning on its key word, and a line that says a want', () => {
    const joke = readLine(words('Knock knock. A soggy scientist.'));
    expect(joke.hit).toBe(4);
    expect(joke.lands).toBe(true);
    const warning = readLine(words('Careful, the floor is wet.'));
    expect(warning.hit).toBe(0);
    expect(readLine(words('I need to win this race.')).want).toBe(true);
    expect(readLine(words('The race is at noon.')).want).toBe(false);
  });

  it('acts each aim with its own gesture, and each with a face', () => {
    const moves = (text: string) =>
      speakerMoves(readLine(words(text))).map((one) => one.move);
    expect(moves('Who took it?')).toEqual(['gesture']);
    expect(moves('No, never.')).toEqual(['shake', 'palm-out']);
    expect(moves('Careful, it is hot.')).toEqual(['wag-finger']);
    expect(moves('Please, help me.')).toEqual(['plead']);
    expect(moves('You took my shoe!')).toEqual(['point', 'step-in']);
    expect(moves('Tell me, or else.')).toEqual(['fist', 'step-in']);
    expect(moves('It was me. Sorry.')).toEqual(['hand-chest']);
    expect(faceOfAim('accuses')).toBe('angry');
    expect(faceOfAim('begs')).toBe('afraid');
    expect(faceOfAim('teases')).toBe('happy');
  });

  it('has listeners react in character: the proud roll their eyes at a joke, the shy look down', () => {
    const plain = temperOf([]);
    expect(reactionTo('jokes', plain)).toEqual({
      move: 'laugh',
      face: 'happy',
    });
    expect(reactionTo('jokes', temperOf(['proud']))).toMatchObject({
      move: 'shake',
      glance: '@up',
    });
    expect(reactionTo('threatens', plain)).toMatchObject({
      move: 'flinch',
      face: 'afraid',
      step: 'step-back',
    });
    expect(reactionTo('accuses', temperOf(['shy']))).toMatchObject({
      glance: '@down',
      step: 'step-back',
    });
    expect(reactionTo('comforts', plain).step).toBe('step-in');
  });

  it('starts a move so that its fullest moment falls on the word', () => {
    expect(startFor('gesture', 1000, 5000)).toBe(4800);
    expect(startFor('nod', 500, 5000)).toBe(4750);
    expect(startFor('gesture', 1000, 5000, 4900)).toBe(4900);
  });
});

describe("a film's line, acted", () => {
  it('times the gesture to the key word, not to the start of the line', () => {
    const line = said(
      'sam',
      'You were home all day. You did this!',
      1000,
      'alex',
    );
    const { acting } = film([line]);
    const point = acting.sam.moves!.find(([, move]) => move === 'point')!;
    // "You did": the second "You", the sixth word.
    const keyAt = line.words[5].startMs;
    expect(Math.abs(peak(point) - keyAt)).toBeLessThanOrEqual(ON_KEY_MS);
    expect(point[3]).toBe('alex');
    expect(point[0]).toBeGreaterThan(line.startMs + 800);
  });

  it('acts every line, each as what it does', () => {
    const lines = [
      said('sam', 'Who ate the cake?', 1000, 'alex'),
      said('alex', 'Not me. I was out.', 3000, 'sam'),
      said('sam', 'Careful, there is cream on your nose.', 5400, 'alex'),
      said('alex', 'Please, can we share the next one?', 8400, 'sam'),
    ];
    const { acting } = film(lines);
    const has = (id: string, move: string, from: number, to: number) =>
      acting[id].moves!.some(([at, m]) => m === move && at >= from && at < to);
    expect(has('sam', 'gesture', 500, 2500)).toBe(true);
    expect(has('alex', 'shake', 2500, 5000)).toBe(true);
    expect(has('alex', 'palm-out', 2500, 5000)).toBe(true);
    expect(has('sam', 'wag-finger', 5000, 7000)).toBe(true);
    expect(has('alex', 'plead', 8000, 10_000)).toBe(true);
  });

  it('has whoever it is said to look at the speaker, and react before they answer', () => {
    const accuse = said('sam', 'You took my cake. You did this!', 1000, 'alex');
    const reply = said('alex', 'No! Why me?', accuse.endMs + 600, 'sam');
    const { acting, felt } = film([accuse, reply]);
    const look = acting.alex.look!;
    const lookAt = (t: number) =>
      [...look].reverse().find(([at]) => at <= t)?.[1] ?? null;
    expect(lookAt(accuse.startMs + 400)).toBe('sam');
    const take = acting.alex.moves!.find(([, move]) => move === 'take')!;
    expect(take).toBeDefined();
    expect(take[0]).toBeGreaterThanOrEqual(accuse.startMs);
    expect(peak(take)).toBeLessThan(reply.startMs);
    expect(take[3]).toBe('sam');
    // Their face changes as it hits them, and holds into the take.
    const face = felt.find(([who]) => who === 'alex')!;
    expect(face[2]).toBe('surprised');
    expect(face[1]).toBeLessThan(take[0] + 100);
  });

  it('lets a shy listener look away a moment, and anyone looks at a thing the line names', () => {
    const line = said(
      'sam',
      'Look at the plate by the table, Alex.',
      1000,
      'alex',
    );
    const { acting } = film([line], {
      traits: new Map([['alex', ['shy']]]),
      things: [{ aim: 'f:table', words: ['table'] }],
    });
    // The speaker looks at the table as she names it.
    const named = line.words[6].startMs;
    const lookAt = (id: string, t: number) =>
      [...acting[id].look!].reverse().find(([at]) => at <= t)?.[1] ?? null;
    expect(lookAt('sam', named + 100)).toBe('f:table');
    // At Alex before it.
    expect(lookAt('sam', line.startMs + 300)).toBe('alex');
    // The shy one looks at her, and down a moment while she speaks.
    expect(lookAt('alex', line.startMs + 400)).toBe('sam');
    expect(
      acting.alex.look!.some(
        ([at, to]) => to === '@down' && at > line.startMs && at < line.endMs,
      ),
    ).toBe(true);
  });

  it('leans in a little before taking the turn, and steps toward in anger, back in fear', () => {
    const a = said(
      'sam',
      'Tell me the truth, or else I tell Mum.',
      1000,
      'alex',
    );
    const b = said('alex', 'It was not me.', a.endMs + 500, 'sam');
    const { acting } = film([a, b]);
    const ready = acting.alex.moves!.find(([, move]) => move === 'ready')!;
    expect(ready[0]).toBeLessThan(b.startMs);
    expect(ready[0] + ready[2]).toBeGreaterThan(b.startMs - 200);
    expect(
      acting.sam.moves!.some(
        ([, move, , to]) => move === 'step-in' && to === 'alex',
      ),
    ).toBe(true);
    expect(
      acting.alex.moves!.some(
        ([, move, , to]) => move === 'step-back' && to === 'sam',
      ),
    ).toBe(true);
  });

  it('takes no step sitting down', () => {
    const a = said('sam', 'You took it. You did this!', 3000, 'alex');
    const { acting } = film([a], {
      directed: [{ atMs: 0, target: 'sam', other: null, do: 'sit' }],
    });
    expect(acting.sam.moves!.some(([, move]) => move === 'step-in')).toBe(
      false,
    );
  });

  it('has the others laugh at a joke, on its punchline', () => {
    const joke = said('sam', 'Knock knock. A soggy scientist.', 1000, 'alex');
    const { acting } = film([joke], {}, ['sam', 'alex', 'ria']);
    const laughs = ['alex', 'ria'].filter((id) =>
      (acting[id]?.moves ?? []).some(
        ([at, move]) => move === 'laugh' && at >= joke.endMs,
      ),
    );
    expect(laughs.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps a book page as it was: no line acted by its aim', () => {
    const acting = actingOf({
      actors: ['sam', 'alex'],
      names: new Map(),
      steps: [step(0, ['sam', 'alex'])],
      lines: [
        said('sam', 'Careful, the floor is wet and slippery.', 1000, 'alex'),
      ],
      narration: [],
      directed: [],
      durationMs: 9000,
      walks: true,
    });
    expect(acting.sam.moves!.some(([, move]) => move === 'wag-finger')).toBe(
      false,
    );
  });
});

describe('faces worn a moment, and given back', () => {
  const effects = [
    { atMs: 0, target: 'alex', part: 'neutral', do: 'show' },
    { atMs: 9000, target: 'alex', part: 'neutral', do: 'hide' },
    { atMs: 9000, target: 'alex', part: 'happy', do: 'show' },
  ];
  const faces = new Set(['neutral', 'happy', 'sad', 'surprised', 'afraid']);
  it('shows the reaction and gives back the face worn before it', () => {
    const out = feltEffects(
      effects,
      [['alex', 2000, 'surprised', 1500]],
      faces,
      () => true,
    );
    expect(out).toEqual([
      { atMs: 2000, target: 'alex', part: 'neutral', do: 'hide' },
      { atMs: 2000, target: 'alex', part: 'surprised', do: 'show' },
      { atMs: 3500, target: 'alex', part: 'surprised', do: 'hide' },
      { atMs: 3500, target: 'alex', part: 'neutral', do: 'show' },
    ]);
  });
  it('ends it before their next change, and leaves out a face they wear already or have not got', () => {
    const cut = feltEffects(
      effects,
      [['alex', 8000, 'sad', 3000]],
      faces,
      () => true,
    );
    expect(cut[2].atMs).toBe(8999);
    expect(
      feltEffects(
        effects,
        [['alex', 2000, 'neutral', 1500]],
        faces,
        () => true,
      ),
    ).toEqual([]);
    expect(
      feltEffects(effects, [['alex', 2000, 'sad', 1500]], faces, () => false),
    ).toEqual([]);
  });
});

describe('what on the stage a line may name', () => {
  it('is each feature, by its name and kind, and each thing where someone has it', () => {
    expect(
      nameableThings({
        features: [{ id: 'gate', name: 'the old gate', kind: 'gate' }],
        props: ['ball', 'plate', 'kite'],
        propsHeld: { ball: { by: 'leo' } },
        propsNear: { plate: 'alex' },
        ownThings: [{ id: 'kite', name: 'red kite' }],
      }),
    ).toEqual([
      { aim: 'f:gate', words: ['gate'], id: 'f:gate' },
      { aim: 'leo', words: ['ball'], id: 'ball' },
      { aim: 'alex', words: ['plate'], id: 'plate' },
    ]);
  });
});

describe('the check: which acting each line got', () => {
  it('says what each line was acted with, whether it matches and is on its key word, and who reacted', () => {
    const accuse = said('sam', 'You took my cake. You did this!', 1000, 'alex');
    const reply = said('alex', 'No! Why me?', accuse.endMs + 600, 'sam');
    const { acting } = film([accuse, reply]);
    const beatOf = (line: SpokenLine) => ({
      text: line.words.map((w) => w.text).join(' '),
      startMs: line.startMs,
      endMs: line.endMs,
      words: line.words.reduce<number[][]>((out, w, i) => {
        const at = i ? out[i - 1][1] + 1 : 0;
        out.push([at, at + w.text.length, w.startMs, w.endMs]);
        return out;
      }, []),
    });
    const scene = {
      beats: [beatOf(accuse), beatOf(reply)],
      acting,
      effects: [accuse, reply].map((line) => ({
        atMs: line.startMs - 150,
        target: line.speaker,
        part: null,
        do: 'say',
        say: {
          id: line.speaker,
          text: line.words.map((w) => w.text).join(' '),
          untilMs: line.endMs,
        },
      })),
    } as unknown as SceneDto;
    const read = actedLines(scene);
    expect(read.map((one) => [one.speaker, one.aim])).toEqual([
      ['sam', 'accuses'],
      ['alex', 'refuses'],
    ]);
    expect(read.every((one) => one.matches && one.onKey && one.looks)).toBe(
      true,
    );
    expect(read[0].reacted).toEqual(expect.arrayContaining(['alex:take']));
    // A line nothing was acted for is said.
    const bare = actedLines({ ...scene, acting: { sam: {}, alex: {} } });
    expect(bare.every((one) => one.moves.length === 0)).toBe(true);
    expect(PERFORM_MS.take).toBeGreaterThan(0);
  });
});

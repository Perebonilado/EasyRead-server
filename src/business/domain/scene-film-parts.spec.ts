import type { SceneDto, SceneThingDto } from '../../contracts';
import { drawingFromFilm, partsFromFilm } from './scene-film-parts';
import type { SceneScript } from './scene-script';

/**
 * A scene made before its parts were kept, its parts rebuilt from its film
 * as stored (studio-vertical-plan §1.4): its voice as the film plays it,
 * and each drawing as the film shows it, its labels' places measured again
 * by code. Nothing is drawn or voiced.
 */
const CELL = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">',
  '<g id="body"><rect x="10" y="20" width="120" height="60" fill="#c33"/></g>',
  '<g id="tail"><rect x="150" y="40" width="40" height="20" fill="#36c"/></g>',
  '</svg>',
].join('');

type Drawn = Extract<SceneThingDto, { kind: 'drawing' }>;
const drawn = (patch: Partial<Drawn> = {}): Drawn => ({
  id: 'cell',
  kind: 'drawing',
  svg: CELL,
  aspect: 2,
  caption: 'Cell',
  parts: { body: 'body', tail: 'tail' },
  labels: {},
  states: {},
  hidden: [],
  moves: false,
  callouts: { body: 'Body', tail: 'Flagellum' },
  calloutsLater: [],
  ...patch,
});

const script = {
  title: 'Cells',
  cast: [
    { id: 'cell', kind: 'drawing', name: 'Cell', brief: 'a cell' },
    { id: 'note', kind: 'words', text: 'Small', style: 'card' },
  ],
  beats: [{ say: 'A cell has a body.' }],
  steps: [],
} as unknown as SceneScript;

const film = (things: SceneThingDto[]): SceneDto =>
  ({
    title: 'Cells',
    durationMs: 3000,
    timing: 'aligned',
    voicePace: 1.1,
    beats: [
      {
        text: 'A cell has a body.',
        startMs: 200,
        endMs: 2400,
        words: [[0, 1, 200, 400]],
        delivery: 'key',
      },
    ],
    things,
    steps: [],
    effects: [],
  }) as unknown as SceneDto;

describe('a drawing rebuilt from the film', () => {
  it('reads its viewBox, keeps its groups, and points each label at the middle of its part', async () => {
    const drawing = await drawingFromFilm(drawn());
    expect(drawing).toMatchObject({
      svg: CELL,
      viewBox: [0, 0, 200, 100],
      aspect: 2,
      parts: { body: 'body', tail: 'tail' },
      moves: false,
    });
    const body = drawing!.callouts.find((c) => c.part === 'body')!;
    expect(body.text).toBe('Body');
    expect(body.anchor[0]).toBeCloseTo(70, 0);
    expect(body.anchor[1]).toBeCloseTo(50, 0);
    expect(body.box![2]).toBeCloseTo(120, -1);
    expect(drawing!.callouts.map((c) => c.part).sort()).toEqual([
      'body',
      'tail',
    ]);
    // Where it has ink, for words set over it.
    expect(drawing!.field?.viewBox).toEqual([0, 0, 200, 100]);
    expect(drawing!.field?.map.cols).toBe(48);
  });

  it('drops a label with no part to point at, and says so', async () => {
    const notes: string[] = [];
    const drawing = await drawingFromFilm(
      drawn({ callouts: { body: 'Body', fin: 'Fin' } }),
      notes,
    );
    expect(drawing!.callouts.map((c) => c.part)).toEqual(['body']);
    expect(notes.join(' ')).toContain('fin');
  });

  it('keeps a drawing with no labels as it is, measuring nothing', async () => {
    const drawing = await drawingFromFilm(drawn({ callouts: undefined }));
    expect(drawing).toMatchObject({ callouts: [], field: null });
  });

  it('keeps a drawing whose part is not in it, its label not set, and says so', async () => {
    const notes: string[] = [];
    const drawing = await drawingFromFilm(
      drawn({ parts: { body: 'body', tail: 'gone' } }),
      notes,
    );
    expect(drawing!.callouts.map((c) => c.part)).toEqual(['body']);
    expect(notes.join(' ')).toContain('tail');
  });

  it('gives what an artist’s animal carries back in its own units', async () => {
    const drawing = await drawingFromFilm(
      drawn({ callouts: undefined, head: [0.5, 0.25], lips: true }),
    );
    expect(drawing).toMatchObject({ head: [100, 25], lips: true });
  });

  it('is null for an svg with no size', async () => {
    expect(
      await drawingFromFilm(
        drawn({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>' }),
      ),
    ).toBeNull();
  });
});

describe('a scene’s parts rebuilt from its film', () => {
  it('keeps its voice as the film plays it and its drawings as the film shows them', async () => {
    const rebuilt = await partsFromFilm(film([drawn()]), script);
    expect(rebuilt).not.toBeNull();
    const { parts, notes } = rebuilt!;
    expect(notes).toEqual([]);
    expect(parts).toMatchObject({
      version: 1,
      script,
      durationMs: 3000,
      timing: 'aligned',
      voicePace: 1.1,
    });
    // The voice's own beats: what the stage added to them is its own again.
    expect(parts.beats).toEqual([
      {
        text: 'A cell has a body.',
        startMs: 200,
        endMs: 2400,
        words: [[0, 1, 200, 400]],
      },
    ]);
    expect(parts.drawings.map(([id]) => id)).toEqual(['cell']);
    expect(parts.cards).toBeUndefined();
  });

  it('makes a drawing the film showed as a card a card again', async () => {
    const rebuilt = await partsFromFilm(
      film([{ id: 'cell', kind: 'words', text: 'Cell', style: 'card' }]),
      script,
    );
    expect(rebuilt!.parts.drawings).toEqual([]);
    expect(rebuilt!.parts.cards).toEqual(['cell']);
  });

  it('is null when the film never showed a drawing its script asks for', async () => {
    expect(await partsFromFilm(film([]), script)).toBeNull();
  });
});

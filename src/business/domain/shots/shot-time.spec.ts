import {
  BEATS,
  DURATION_MS,
  timedBeats,
  wordAt,
} from './__fixtures__/regional-turn';
import {
  CAMERA_MS,
  CUE_HOLD_MS,
  CUT_LEAD_MS,
  DRIFT_MS,
  JOIN_MS,
  RECIPE_MS,
  SETTLE_LEAD_MS,
  findPhrase,
  keyOf,
  retimeShots,
  spokenWordsOf,
  timeShots,
  type UntimedShot,
} from './shot-time';

const words = spokenWordsOf(BEATS);

/** An untimed shot on the map with nothing in it, to be filled per test. */
const shot = (
  id: string,
  on: string,
  more: Partial<UntimedShot> = {},
): UntimedShot => ({
  id,
  on,
  set: {
    kind: 'map',
    asset: 'map',
    style: 'atlas',
    tilt: 0,
    bearing: 0,
    terrain: false,
  },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  ...more,
});

const region = (part: string) => ({
  kind: 'asset' as const,
  asset: 'map',
  part,
});

describe('the words a plan anchors to', () => {
  it('keys a word by what it says: case, accents, quotes and punctuation gone, any script kept', () => {
    expect(keyOf('“Self-government,”')).toBe('selfgovernment');
    expect(keyOf('Côte')).toBe('cote');
    expect(keyOf('1951’s')).toBe('1951s');
    expect(keyOf('Ìbàdàn')).toBe('ibadan');
    expect(keyOf('Αθήνα')).toBe('αθηνα');
    expect(keyOf('—')).toBe('');
  });

  it('finds a phrase among the spoken words, across sentences and however it is hyphenated', () => {
    const first = findPhrase(words, 'colonial Nigeria');
    expect(words[first!].startMs).toBe(wordAt(0, 4));
    // The board wrote it spaced; the line has it hyphenated.
    const self = findPhrase(words, 'self government');
    expect(words[self!].startMs).toBe(wordAt(2, 2));
    // From the end of one line into the next.
    const across = findPhrase(words, 'legislatures. Then the fight');
    expect(words[across!].startMs).toBe(wordAt(0, 11));
    expect(findPhrase(words, 'THE 1951 Constitution')).not.toBeNull();
  });

  it('finds the next time a phrase is said after a point, and a near phrase when the words differ a little', () => {
    const once = findPhrase(words, 'regional legislatures')!;
    const again = findPhrase(words, 'regional legislatures', once + 1)!;
    expect(words[again].beat).toBe(4);
    // "regional legislature gained" shares two of three words with the line.
    expect(findPhrase(words, 'regional legislature real')).not.toBeNull();
    expect(findPhrase(words, 'nothing like this at all')).toBeNull();
    expect(findPhrase(words, '   ')).toBeNull();
  });
});

describe('the shots on the voice', () => {
  const plan = [
    shot('s1', 'After the 1945 strikes', {
      info: [
        {
          id: 'pin',
          recipe: 'pin',
          target: { kind: 'box', box: [10, 10, 4, 4] },
          on: 'colonial Nigeria',
        },
        {
          id: 'fill',
          recipe: 'fill',
          target: region('group-north-region'),
          on: 'regional legislatures',
          until: 'Then the fight',
        },
      ],
      camera: [
        { move: 'establish', on: 'After the 1945 strikes' },
        { move: 'push', on: 'shifting power', amount: 0.05 },
      ],
    }),
    shot('s2', 'Then the fight changed', {
      join: 'dissolve',
      info: [
        {
          id: 'first',
          recipe: 'label',
          target: region('group-west-region'),
          text: 'West',
          on: 'Then the fight',
        },
      ],
      camera: [
        {
          move: 'push',
          on: 'three',
          amount: 0.12,
          target: region('group-east-region'),
        },
      ],
    }),
    shot('s3', 'Why did self-government'),
  ];
  const timed = timeShots(plan, BEATS, DURATION_MS);

  it('starts each shot just before its words and runs it to the next, the first from the start, the last to the end', () => {
    expect(timed.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(timed[0].startMs).toBe(0);
    expect(timed[1].startMs).toBe(wordAt(1, 0) - CUT_LEAD_MS);
    expect(timed[2].startMs).toBe(wordAt(2, 0) - CUT_LEAD_MS);
    expect(timed[0].endMs).toBe(timed[1].startMs);
    expect(timed[1].endMs).toBe(timed[2].startMs);
    expect(timed[2].endMs).toBe(DURATION_MS);
    expect(timed[1].joinMs).toBe(JOIN_MS.dissolve);
    expect(timed[0].joinMs).toBe(JOIN_MS.cut);
  });

  it('settles every change a breath before its word (the settle rule)', () => {
    const pin = timed[0].info.find((i) => i.id === 'pin')!;
    expect(pin.durMs).toBe(RECIPE_MS.pin);
    expect(pin.atMs).toBe(wordAt(0, 4) - RECIPE_MS.pin - SETTLE_LEAD_MS);
    expect(pin.atMs + pin.durMs).toBe(wordAt(0, 4) - 100);
    const fill = timed[0].info.find((i) => i.id === 'fill')!;
    expect(fill.atMs + fill.durMs + SETTLE_LEAD_MS).toBe(wordAt(0, 10));
  });

  it('never starts a change before its shot', () => {
    const first = timed[1].info[0];
    expect(first.atMs).toBe(timed[1].startMs);
  });

  it('starts a flow on its word and lets it run, where a change settles before its word', () => {
    const flowing = timeShots(
      [
        shot('s1', 'After the 1945 strikes', {
          info: [
            {
              id: 'flow',
              recipe: 'flow',
              target: region('group-west-region'),
              to: region('group-north-region'),
              on: 'shifting power',
            },
          ],
        }),
      ],
      BEATS,
      DURATION_MS,
    );
    const flow = flowing[0].info[0];
    expect(flow.atMs).toBe(wordAt(0, 7) - SETTLE_LEAD_MS);
    expect(flow.durMs).toBe(RECIPE_MS.flow);
    // Moved with a slower voice, it still starts on its word.
    const slower = retimeShots(
      flowing,
      (ms) => Math.round(ms * 1.2),
      DURATION_MS * 1.2,
    );
    expect(slower[0].info[0].atMs).toBe(
      Math.round((flow.atMs + SETTLE_LEAD_MS) * 1.2) - SETTLE_LEAD_MS,
    );
  });

  it('ends a piece of information on its until words, after it has landed', () => {
    const fill = timed[0].info.find((i) => i.id === 'fill')!;
    // "Then the fight" opens the next shot: the fill lets go as it comes, inside its own shot.
    expect(fill.untilMs).toBe(timed[0].endMs);
    expect(fill.untilMs!).toBeGreaterThanOrEqual(fill.atMs + fill.durMs);
  });

  it('times the camera by its move: an establish from the shot start, a drift on its word, a push settled before its word', () => {
    const [establish, drift] = timed[0].camera;
    expect(establish).toMatchObject({
      move: 'establish',
      atMs: 0,
      durMs: CAMERA_MS.establish,
    });
    expect(drift.atMs).toBe(wordAt(0, 7) - SETTLE_LEAD_MS);
    // As long as a drift runs, but never past its shot.
    expect(drift.durMs).toBe(Math.min(DRIFT_MS, timed[0].endMs - drift.atMs));
    expect(drift.durMs).toBeLessThan(DRIFT_MS);
    const push = timed[1].camera[0];
    expect(push.atMs + push.durMs + SETTLE_LEAD_MS).toBe(wordAt(1, 11));
  });

  it('lets a cue go a few seconds after it has drawn the eye, and a label with its shot', () => {
    const long = timeShots(
      [
        shot('s1', 'After the 1945 strikes', {
          info: [
            {
              id: 'ring',
              recipe: 'mark',
              target: region('group-north-region'),
              on: 'colonial Nigeria',
            },
            {
              id: 'name',
              recipe: 'label',
              target: region('group-north-region'),
              text: 'North',
              on: 'colonial Nigeria',
            },
          ],
        }),
      ],
      BEATS,
      DURATION_MS,
    );
    const [ring, name] = long[0].info;
    expect(ring.untilMs).toBe(ring.atMs + ring.durMs + CUE_HOLD_MS);
    expect(name.untilMs).toBe(long[0].endMs);
  });

  it('is the same every time, and leaves what it was given as it was', () => {
    const before = JSON.stringify(plan);
    expect(timeShots(plan, BEATS, DURATION_MS)).toEqual(timed);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('places a shot whose words are not said after the one before it, and says so', () => {
    const notes: string[] = [];
    const lost = timeShots(
      [
        shot('s1', 'After the 1945 strikes'),
        shot('s2', 'words nobody says'),
        shot('s3', 'The 1951 constitution'),
      ],
      BEATS,
      DURATION_MS,
      { notes },
    );
    expect(lost.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(lost[1].startMs).toBe(1200);
    expect(notes.join(' ')).toContain('"words nobody says" is not said');
  });

  it('leaves out a shot with no room before the next', () => {
    const notes: string[] = [];
    const crammed = timeShots(
      [
        shot('s1', 'After the 1945 strikes'),
        shot('s2', 'the 1945 strikes'),
        shot('s3', 'colonial Nigeria'),
      ],
      BEATS,
      DURATION_MS,
      { notes },
    );
    expect(crammed.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(notes.join(' ')).toContain('shot 2: no room');
  });
});

describe('the shots timed again when the voice is', () => {
  const plan = [
    shot('s1', 'After the 1945 strikes', {
      info: [
        {
          id: 'pin',
          recipe: 'pin',
          target: { kind: 'box', box: [0, 0, 4, 4] },
          on: 'colonial Nigeria',
        },
      ],
      camera: [{ move: 'establish', on: 'After' }],
    }),
    shot('s2', 'Then the fight changed', {
      info: [
        {
          id: 'label',
          recipe: 'label',
          target: { kind: 'box', box: [0, 0, 4, 4] },
          text: 'three',
          on: 'but three',
          until: 'three',
        },
      ],
    }),
  ];
  const timed = timeShots(plan, BEATS.slice(0, 2), DURATION_MS);

  it('stays as it was on the same voice', () => {
    expect(retimeShots(timed, (ms) => ms, DURATION_MS)).toEqual(timed);
  });

  it('settles each change where its word now is, keeping its length', () => {
    const slower = (ms: number) => Math.round(ms * 1.25);
    const again = retimeShots(timed, slower, Math.round(DURATION_MS * 1.25));
    const stretched = timeShots(
      plan,
      timedBeats([BEATS[0].text, BEATS[1].text], {
        startMs: 125,
        wordMs: 400,
        gapMs: 875,
      }),
      Math.round(DURATION_MS * 1.25),
    );
    expect(again[1].startMs).toBeCloseTo(stretched[1].startMs, -1);
    const pin = again[0].info[0];
    expect(pin.durMs).toBe(RECIPE_MS.pin);
    expect(pin.atMs).toBeCloseTo(stretched[0].info[0].atMs, -1);
    expect(again[1].endMs).toBe(Math.round(DURATION_MS * 1.25));
  });
});

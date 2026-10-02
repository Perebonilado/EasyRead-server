import type { SceneDto, SceneThingDto, ShotDto } from '../../../contracts';
import {
  CONTRAST,
  FOCAL,
  FRAME_CHECKS,
  PACE,
  TEXT,
  dwellMs,
} from '../studio/explainer-rules';
import {
  cardShareOf,
  checkFrames,
  colourOf,
  contrastOf,
  episodeScores,
  eventsOf,
  glyphBox,
  isLargeText,
  personBan,
  personShareOf,
  ringColour,
  sizeFloor,
  stillStats,
  subjectAt,
  windowsOf,
  type FrameBox,
  type FrameItem,
  type FrameReport,
  type StillImage,
} from './frame-checks';

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** A still at a tenth of the frame's size, one colour, with boxes (in the frame's pixels) painted on it. */
function still(
  ground: Rgb,
  boxes: { box: FrameBox; rgb: Rgb }[] = [],
  frame = { width: 1920, height: 1080 },
): StillImage {
  const width = frame.width / 10;
  const height = frame.height / 10;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set([...ground, 255], i * 4);
  }
  for (const { box, rgb } of boxes)
    for (
      let y = Math.floor(box[1] / 10);
      y < Math.ceil((box[1] + box[3]) / 10);
      y += 1
    )
      for (
        let x = Math.floor(box[0] / 10);
        x < Math.ceil((box[0] + box[2]) / 10);
        x += 1
      )
        if (x >= 0 && y >= 0 && x < width && y < height)
          data.set([...rgb, 255], (y * width + x) * 4);
  return { width, height, data };
}

/** A lesson scene of today's engine: things on steps, cues, and a voice from `voice[0]` to `voice[1]`. */
function lesson(
  o: {
    things?: SceneThingDto[];
    steps?: { atMs: number; show: string[]; focus?: string | null }[];
    effects?: SceneDto['effects'];
    durationMs?: number;
    voice?: [number, number];
  } = {},
): SceneDto {
  const durationMs = o.durationMs ?? 12_000;
  const [from, to] = o.voice ?? [300, durationMs - 300];
  return {
    version: 4,
    generator: 'test',
    title: 'A lesson',
    durationMs,
    timing: {} as SceneDto['timing'],
    beats: [{ text: 'words', startMs: from, endMs: to, words: [] }],
    things: o.things ?? [drawing('engine')],
    steps: (o.steps ?? [{ atMs: 0, show: ['engine'] }]).map((step) => ({
      atMs: step.atMs,
      layout: 'one',
      show: step.show,
      arrows: [],
      enter: {},
      focus: step.focus ?? null,
    })) as SceneDto['steps'],
    effects: o.effects ?? [],
    stagings: {
      box: { w: 1600, h: 900, places: [] },
      wide: { w: 1600, h: 900, places: [] },
    },
  } as unknown as SceneDto;
}

function drawing(
  id: string,
  extra: Partial<Extract<SceneThingDto, { kind: 'drawing' }>> = {},
): SceneThingDto {
  return {
    id,
    kind: 'drawing',
    svg: '<svg/>',
    aspect: 1,
    caption: null,
    parts: {},
    labels: {},
    states: {},
    hidden: [],
    moves: false,
    ...extra,
  };
}

function report(
  items: FrameItem[],
  ms = 3000,
  shape: 'wide' | 'tall' = 'wide',
): FrameReport {
  return shape === 'wide'
    ? { ms, shape, width: 1920, height: 1080, items }
    : { ms, shape, width: 1080, height: 1920, items };
}

const engine = (
  box: FrameBox,
  role: FrameItem['role'] = 'focal',
): FrameItem => ({ id: 'engine', role, box, opacity: 1 });
const label = (
  id: string,
  box: FrameBox,
  extra: Partial<FrameItem> = {},
): FrameItem => ({
  id,
  role: 'label',
  box,
  text: id,
  fontPx: 64,
  fg: 'rgb(20, 20, 20)',
  opacity: 1,
  ...extra,
});
const codes = (result: ReturnType<typeof checkFrames>) =>
  result.problems.map((p) => p.code);

describe('the subject', () => {
  it('fails a subject under its share of a wide frame, and calls a strip tiny', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [report([engine([800, 500, 165, 65])])],
      shape: 'wide',
    });
    expect(codes(result)).toEqual(
      expect.arrayContaining(['focal-small', 'tiny-subject']),
    );
    expect(result.stills[0].area).toBeCloseTo((165 * 65) / (1920 * 1080), 3);
    const tiny = result.problems.find((p) => p.code === 'tiny-subject');
    expect(tiny?.axis).toBe('truth');
  });

  it('passes a wide subject by its height or by its area', () => {
    const tall = checkFrames({
      scene: lesson(),
      reports: [report([engine([700, 100, 300, 0.36 * 1080])])],
      shape: 'wide',
    });
    expect(codes(tall)).not.toContain('focal-small');
    const broad = checkFrames({
      scene: lesson(),
      reports: [report([engine([100, 400, 1900, 140])])],
      shape: 'wide',
    });
    expect(broad.stills[0].area).toBeGreaterThanOrEqual(FOCAL.wideMinArea);
    expect(codes(broad)).not.toContain('focal-small');
  });

  it('asks a tall frame for half its height', () => {
    const short = checkFrames({
      scene: lesson(),
      reports: [report([engine([0, 400, 1080, 0.45 * 1920])], 3000, 'tall')],
      shape: 'tall',
    });
    expect(codes(short)).toContain('focal-small');
    const big = checkFrames({
      scene: lesson(),
      reports: [report([engine([0, 300, 1080, 0.55 * 1920])], 3000, 'tall')],
      shape: 'tall',
    });
    expect(codes(big)).not.toContain('focal-small');
  });

  it("judges the thing the voice's cues point at, not the stage's focus (the jet engine beside its classroom)", () => {
    const scene = lesson({
      things: [drawing('classroom'), drawing('engine')],
      steps: [{ atMs: 0, show: ['classroom', 'engine'], focus: 'classroom' }],
      effects: [
        { atMs: 1200, target: 'engine', part: 'intake', do: 'point' },
        {
          atMs: 2000,
          target: 'classroom',
          part: null,
          do: 'pulse',
          filler: true,
        },
      ],
    });
    expect(subjectAt(scene, 500)).toBe('classroom');
    expect(subjectAt(scene, 2500)).toBe('engine');
    const result = checkFrames({
      scene,
      reports: [
        report(
          [
            { id: 'classroom', role: 'focal', box: [100, 200, 1000, 650] },
            engine([1300, 800, 165, 65], 'actor'),
          ],
          2500,
        ),
      ],
      shape: 'wide',
    });
    expect(result.stills[0].subject).toBe('engine');
    expect(codes(result)).toContain('focal-small');
  });

  it('calls words with no picture under a speaking voice a frame with no picture', () => {
    const words = [label('Hotter', [700, 400, 400, 120], { card: true })];
    expect(
      codes(
        checkFrames({
          scene: lesson(),
          reports: [report(words, 3000)],
          shape: 'wide',
        }),
      ),
    ).toContain('no-picture');
    // Before the voice starts, a title alone is fine.
    expect(
      codes(
        checkFrames({
          scene: lesson({ voice: [5000, 11_000] }),
          reports: [report(words, 1000)],
          shape: 'wide',
        }),
      ),
    ).not.toContain('no-picture');
  });
});

describe('readable words', () => {
  it('holds every word to the floor of the frame’s short side, chips and captions to their own', () => {
    const wide = report([]);
    expect(sizeFloor({ role: 'label' }, wide)).toBeCloseTo(60, 5);
    expect(sizeFloor({ role: 'chip' }, wide)).toBeCloseTo(28, 5);
    expect(sizeFloor({ role: 'caption' }, wide)).toBeCloseTo(64, 5);
    // A tall frame's short side is its width: its captions at 64 px are read as the research sets them.
    expect(sizeFloor({ role: 'caption' }, report([], 0, 'tall'))).toBeCloseTo(
      TEXT.caption * 1080,
      5,
    );
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([200, 100, 1500, 800]),
          label('small', [300, 200, 200, 40], { fontPx: 40 }),
          label('big', [300, 400, 300, 70], { fontPx: 64 }),
          {
            id: 'chip',
            role: 'chip',
            box: [120, 900, 300, 30],
            text: 'NASA · CC0',
            fontPx: 30,
            opacity: 1,
          },
          {
            id: 'caption-1',
            role: 'caption',
            box: [600, 960, 700, 60],
            text: 'Air goes around',
            fontPx: 56,
            opacity: 1,
          },
        ]),
      ],
      shape: 'wide',
    });
    const small = result.problems.filter((p) => p.code === 'text-small');
    expect(small.map((p) => p.ids)).toEqual([['small']]);
    expect(small[0].limit).toBe(60);
    expect(
      result.problems
        .filter((p) => p.code === 'caption-small')
        .map((p) => p.ids),
    ).toEqual([['caption-1']]);
  });

  it('does not judge words still coming or going', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([200, 100, 1500, 800]),
          label('fading', [300, 200, 200, 40], {
            fontPx: 20,
            opacity: FRAME_CHECKS.judgedOpacity - 0.1,
          }),
        ]),
      ],
      shape: 'wide',
    });
    expect(codes(result)).not.toContain('text-small');
  });

  it('reads contrast against the pixels just outside the words, or what the page says is under them', () => {
    const image = still(WHITE, [
      { box: [1000, 600, 300, 100], rgb: [30, 30, 30] },
    ]);
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([100, 100, 800, 800]),
          label('grey', [300, 200, 200, 60], { fg: 'rgb(170, 170, 170)' }),
          label('ink', [300, 400, 200, 60], { fg: 'rgb(20, 20, 20)' }),
          // White on the dark box: fine against what is behind it.
          label('reversed', [1050, 620, 200, 60], { fg: 'rgb(255, 255, 255)' }),
          // Pale words with a dark rim round them: read against the rim.
          label('rimmed', [1500, 200, 200, 60], {
            fg: 'rgb(250, 250, 250)',
            bg: 'rgb(20, 20, 20)',
          }),
          // Half there, they are half as dark.
          label('faint', [1500, 400, 200, 60], {
            fg: 'rgb(20, 20, 20)',
            opacity: 0.65,
          }),
        ]),
      ],
      pixels: [image],
      shape: 'wide',
    });
    const low = result.problems.filter((p) => p.code === 'contrast-low');
    expect(low.map((p) => p.ids?.[0]).sort()).toEqual(['grey']);
    expect(low[0].value).toBeLessThan(CONTRAST.text);
    expect(contrastOf([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
  });

  it('finds words on words, a label over its own subject, and words where the captions go', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([300, 300, 400, 200], 'actor'),
          { id: 'big', role: 'focal', box: [900, 100, 900, 800], opacity: 1 },
          label('fan', [500, 200, 200, 80]),
          label('core', [600, 220, 200, 80]),
          label('over-engine', [300, 300, 300, 150], { of: 'engine' }),
          // Words drawn into a drawing are its own: never "on" it.
          label('engine#text-1', [320, 320, 300, 150], {
            of: 'engine',
            fg: 'rgb(0, 0, 0)',
          }),
          label('low', [700, 950, 300, 70]),
          {
            id: 'caption-1',
            role: 'caption',
            box: [600, 950, 700, 64],
            text: 'the air',
            fontPx: 64,
            opacity: 1,
          },
        ]),
      ],
      shape: 'wide',
    });
    const overlaps = result.problems
      .filter((p) => p.code === 'words-overlap')
      .map((p) => p.ids);
    expect(overlaps).toContainEqual(['fan', 'core']);
    const covers = result.problems.filter((p) => p.code === 'covers-subject');
    expect(covers.map((p) => p.ids?.[0])).toEqual(['over-engine']);
    expect(
      result.problems.filter((p) => p.code === 'on-caption').map((p) => p.ids),
    ).toEqual([['low']]);
  });

  it('keeps a tall frame’s words out of its caption band, captions or not', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report(
          [
            engine([0, 300, 1080, 1000]),
            label('in-band', [200, 1100, 400, 80]),
          ],
          3000,
          'tall',
        ),
      ],
      shape: 'tall',
    });
    expect(codes(result)).toContain('on-caption');
  });

  it('keeps words inside the safe area, the picture full-bleed', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([0, 0, 1920, 1080]),
          label('edge', [20, 500, 200, 70]),
          label('inside', [400, 500, 200, 70]),
        ]),
      ],
      shape: 'wide',
    });
    expect(
      result.problems
        .filter((p) => p.code === 'outside-safe')
        .map((p) => p.ids),
    ).toEqual([['edge']]);
  });

  it('lets small print lie where the captions go and sit at the frame’s edge, but not be cut by it', () => {
    const chip = (
      id: string,
      box: FrameBox,
      role: FrameItem['role'] = 'chip',
    ): FrameItem => ({
      id,
      role,
      box,
      text: id,
      fontPx: 30,
      fg: 'rgb(20, 20, 20)',
      opacity: 1,
    });
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([0, 0, 1920, 1080]),
          // "Today's borders" in the map's foot corner: in the band, past the text safe area, on the frame.
          chip("Today's borders", [40, 960, 260, 32]),
          chip('Illustration', [1500, 990, 200, 30], 'tag'),
          chip('cut', [0, 300, 200, 30]),
          // A word a viewer must read in the band is still the captions'.
          label('East Region', [700, 900, 300, 70]),
          label('edge', [40, 500, 200, 70]),
        ]),
      ],
      shape: 'wide',
    });
    const ids = (code: string) =>
      result.problems.filter((p) => p.code === code).map((p) => p.ids?.[0]);
    expect(ids('on-caption')).toEqual(['East Region']);
    expect(ids('outside-safe').sort()).toEqual(['cut', 'edge']);
    expect(
      result.problems.find(
        (p) => p.code === 'outside-safe' && p.ids?.[0] === 'cut',
      )?.message,
    ).toContain("cut by the frame's edge");
  });

  it('holds large text to WCAG’s 3:1 and the rest to 4.5:1, large measured on the short side', () => {
    const wide = report([]);
    expect(isLargeText({ fontPx: TEXT.large * 1080 }, wide)).toBe(true);
    expect(isLargeText({ fontPx: 23 }, wide)).toBe(false);
    expect(isLargeText({ fontPx: 19, weight: 700 }, wide)).toBe(true);
    expect(isLargeText({ fontPx: 19, weight: 400 }, wide)).toBe(false);
    expect(isLargeText({ fontPx: 24 }, report([], 0, 'tall'))).toBe(true);
    // A grey at about 3.5:1 on white: a large year passes, small words do not.
    const grey = 'rgb(137, 137, 137)';
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([100, 100, 800, 800]),
          label('1951', [1000, 200, 200, 106], { fontPx: 84, fg: grey }),
          label('small', [1000, 400, 200, 30], { fontPx: 20, fg: grey }),
          label('bold', [1000, 500, 200, 30], {
            fontPx: 20,
            fg: grey,
            weight: 700,
          }),
        ]),
      ],
      pixels: [still(WHITE)],
      shape: 'wide',
    });
    const low = result.problems.filter((p) => p.code === 'contrast-low');
    expect(low.map((p) => p.ids?.[0])).toEqual(['small']);
    expect(low[0].limit).toBe(CONTRAST.text);
    expect(low[0].value).toBeGreaterThan(CONTRAST.large);
  });

  it('judges two words of one drawing where their glyphs are, and words of two drawings by their boxes', () => {
    // A year over its label: their boxes meet by 12 px, from the year's descent to the label's ascent.
    const year = label('1951', [400, 300, 200, 106], {
      fontPx: 84,
      of: 'timeline',
    });
    const below = label('Regional legislatures', [380, 394, 500, 60], {
      fontPx: 48,
      of: 'timeline',
    });
    expect(glyphBox(year)[3]).toBeCloseTo(
      106 - 2 * 84 * FRAME_CHECKS.glyphInset,
      5,
    );
    const overlaps = (items: FrameItem[]) =>
      checkFrames({
        scene: lesson(),
        reports: [report([engine([0, 0, 1920, 1080]), ...items])],
        shape: 'wide',
      }).problems.filter((p) => p.code === 'words-overlap');
    expect(overlaps([year, below])).toEqual([]);
    // A callout landing on a map's word is words over words.
    const callout = label('Kaduna', [380, 394, 500, 60], { fontPx: 48 });
    expect(overlaps([year, callout]).map((p) => p.ids)).toEqual([
      ['1951', 'Kaduna'],
    ]);
    // Two of one drawing's words set on each other still are.
    const onTop = label('1952', [420, 320, 200, 106], {
      fontPx: 84,
      of: 'timeline',
    });
    expect(overlaps([year, onTop])).toHaveLength(1);
  });
});

describe('blank frames and flashes', () => {
  it('finds a blank frame under a speaking voice, from its pixels', () => {
    const blank = checkFrames({
      scene: lesson(),
      reports: [report([])],
      pixels: [still(WHITE)],
      shape: 'wide',
    });
    expect(codes(blank)).toContain('blank');
    expect(blank.stills[0].ink).toBe(0);
    const drawn = checkFrames({
      scene: lesson(),
      reports: [report([engine([300, 200, 1200, 700])])],
      pixels: [
        still(WHITE, [{ box: [300, 200, 1200, 700], rgb: [40, 60, 90] }]),
      ],
      shape: 'wide',
    });
    expect(codes(drawn)).not.toContain('blank');
  });

  it('calls a frame of nothing but its captions blank: the stage’s own ink is what counts', () => {
    const pill: FrameBox = [600, 900, 700, 120];
    const caption: FrameItem = {
      id: 'caption-1',
      role: 'caption',
      box: pill,
      text: 'Modern airliners',
      fontPx: 64,
      opacity: 1,
    };
    const pixels = [still([20, 24, 40], [{ box: pill, rgb: BLACK }])];
    const empty = checkFrames({
      scene: lesson(),
      reports: [report([caption])],
      pixels,
      shape: 'wide',
    });
    expect(codes(empty)).toContain('blank');
    // The same pixels, the pill not a caption: it is the stage's ink.
    const drawn = checkFrames({
      scene: lesson(),
      reports: [report([])],
      pixels,
      shape: 'wide',
    });
    expect(codes(drawn)).not.toContain('blank');
  });

  it('finds the brightness jumping and straight back between close stills, but not across a join', () => {
    const at = [3000, 3400, 3800];
    const reports = at.map((ms) => report([engine([0, 0, 1920, 1080])], ms));
    const pixels = [still(WHITE), still(BLACK), still(WHITE)];
    const flash = checkFrames({
      scene: lesson(),
      reports,
      pixels,
      shape: 'wide',
    });
    expect(
      flash.problems.filter((p) => p.code === 'flash').map((p) => p.ms),
    ).toEqual([3400]);
    const joined = checkFrames({
      scene: lesson(),
      reports,
      pixels,
      shape: 'wide',
      joins: [false, true, false],
    });
    expect(codes(joined)).not.toContain('flash');
  });

  it('names the still a flash is in by its report, a still with no report between', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([engine([0, 0, 1920, 1080])], 3000),
        null,
        report([engine([0, 0, 1920, 1080])], 3400),
        report([engine([0, 0, 1920, 1080])], 3800),
      ],
      pixels: [still(WHITE), null, still(BLACK), still(WHITE)],
      shape: 'wide',
    });
    const flash = result.problems.find((p) => p.code === 'flash');
    expect(flash?.still).toBe(2);
    expect(result.stills.map((s) => s.codes.includes('flash'))).toEqual([
      false,
      true,
      false,
    ]);
  });
});

describe('pace and dwell, from the scene', () => {
  it('counts each change of the stage and each part shown or pointed at, a sub-step with its event', () => {
    const scene = lesson({
      steps: [
        { atMs: 0, show: ['engine'] },
        { atMs: 4000, show: ['engine'] },
      ],
      effects: [
        { atMs: 300, target: 'engine', part: 'fan', do: 'point' },
        { atMs: 2000, target: 'engine', part: 'fan', do: 'pulse' },
        {
          atMs: 2500,
          target: 'engine',
          part: 'core',
          do: 'show',
          filler: true,
        },
        { atMs: 4200, target: 'engine', part: 'core', do: 'show' },
      ],
    });
    expect(eventsOf(scene)).toEqual([0, 4000]);
  });

  it('finds cues too close, a stall while the voice speaks, and a late first change', () => {
    const scene = lesson({
      durationMs: 20_000,
      voice: [200, 19_000],
      steps: [
        { atMs: 2000, show: ['engine'] },
        { atMs: 2800, show: ['engine'] },
        { atMs: 5000, show: ['engine'] },
      ],
    });
    const result = checkFrames({
      scene,
      reports: [],
      shape: 'wide',
      first: true,
    });
    const short = result.problems.find((p) => p.code === 'gap-short');
    expect(short?.ms).toBe(2800);
    expect(short?.limit).toBe(PACE.minGapMs);
    const long = result.problems.find((p) => p.code === 'gap-long');
    expect(long?.ms).toBe(5000);
    expect(long?.value).toBe(14_000);
    expect(codes(result)).toContain('first-late');
    expect(result.scores.pace).toBeLessThan(8);
  });

  it('lets a declared hold run long in the shots engine', () => {
    const shots = {
      version: 1,
      look: {},
      assets: {},
      sounds: [],
      shots: [
        {
          id: 's1',
          startMs: 0,
          endMs: 12_000,
          set: { kind: 'plain' },
          actors: [],
          life: [],
          join: 'cut',
          joinMs: 0,
          info: [
            { id: 'i1', recipe: 'label', atMs: 1000, durMs: 250, text: 'Fan' },
          ],
          camera: [{ move: 'hold', atMs: 1500, durMs: 9000 }],
        } as unknown as ShotDto,
      ],
    };
    const scene = {
      ...lesson({ durationMs: 12_000, voice: [200, 11_000] }),
      engine: 'shots',
      shots,
    } as unknown as SceneDto;
    expect(eventsOf(scene)).toEqual([0, 1000]);
    expect(
      codes(checkFrames({ scene, reports: [], shape: 'wide' })),
    ).not.toContain('gap-long');
    const unheld = {
      ...scene,
      shots: { ...shots, shots: [{ ...shots.shots[0], camera: [] }] },
    } as unknown as SceneDto;
    expect(
      codes(checkFrames({ scene: unheld, reports: [], shape: 'wide' })),
    ).toContain('gap-long');
  });

  it('holds words up long enough to read them, but not one that runs on past the scene', () => {
    const scene = lesson({
      durationMs: 10_000,
      things: [
        drawing('engine'),
        {
          id: 'share',
          kind: 'stat',
          value: '80%',
          caption: 'goes round the core',
        },
      ],
      steps: [
        { atMs: 0, show: ['engine'] },
        { atMs: 3000, show: ['engine', 'share'] },
        { atMs: 4000, show: ['engine'] },
        { atMs: 8000, show: ['engine', 'share'] },
      ],
    });
    const windows = windowsOf(scene);
    expect(windows.get('share')).toEqual([
      [3000, 4000],
      [8000, 10_000],
    ]);
    const dwell = checkFrames({
      scene,
      reports: [],
      shape: 'wide',
    }).problems.filter((p) => p.code === 'dwell-short');
    expect(dwell).toHaveLength(1);
    expect(dwell[0].limit).toBe(dwellMs(5));
    expect(dwell[0].value).toBe(1000);
  });
});

describe('what an explainer never shows', () => {
  it('weighs the word cards by the time they are up, and scores truth by it', () => {
    const scene = lesson({
      durationMs: 9000,
      things: [
        drawing('engine'),
        { id: 'hotter', kind: 'words', text: 'Hotter', style: 'keyword' },
        { id: 'title', kind: 'words', text: 'Jets', style: 'title' },
      ],
      steps: [
        { atMs: 0, show: ['title'] },
        { atMs: 3000, show: ['hotter'] },
        { atMs: 6000, show: ['engine'] },
      ],
    });
    expect(cardShareOf(scene)).toBeCloseTo(1 / 3, 3);
    const result = checkFrames({ scene, reports: [], shape: 'wide' });
    expect(result.scores.cardShare).toBeCloseTo(1 / 3, 3);
    expect(result.problems.find((p) => p.code === 'word-card')?.banned).toBe(
      'word-card',
    );
    // Three times a third, all of it: nothing left of truth's 10.
    expect(result.scores.truth).toBe(0);
  });

  it("names the kit's people in a lesson by the ban each breaks", () => {
    const scene = lesson({
      durationMs: 10_000,
      things: [
        drawing('engine'),
        drawing('student', {
          rig: true,
          joints: { r: [], l: [] },
          caption: 'Teen student',
        }),
        drawing('workers', { rig: true, caption: 'Workers' }),
        drawing('macaulay', { wears: ['suit'], caption: 'Herbert Macaulay' }),
      ],
      steps: [
        { atMs: 0, show: ['engine', 'student'] },
        { atMs: 5000, show: ['engine', 'workers', 'macaulay'] },
      ],
    });
    const people = checkFrames({
      scene,
      reports: [],
      shape: 'wide',
    }).problems.filter((p) => p.code === 'person');
    expect(people.map((p) => [p.ids?.[0], p.banned])).toEqual([
      ['student', 'audience-on-screen'],
      ['workers', 'stock-figure-for-group'],
      ['macaulay', 'drawn-likeness'],
    ]);
    expect(personShareOf(scene)).toBe(1);
    expect(personBan('Mechanic')).toBe('audience-on-screen');
    // As the baselines named them.
    expect(personBan('Delegates')).toBe('stock-figure-for-group');
    expect(personBan('Northern leaders')).toBe('stock-figure-for-group');
    expect(personBan('Retail investor')).toBe('audience-on-screen');
    expect(personBan('Nnamdi Azikiwe')).toBe('drawn-likeness');
    expect(personBan('Tafawa Balewa')).toBe('drawn-likeness');
    expect(personBan('King Charles')).toBe('drawn-likeness');
    // A story's people act: they are no lesson's stand-ins.
    const story = {
      ...scene,
      effects: [
        {
          atMs: 100,
          target: 'student',
          part: null,
          do: 'say',
          say: { id: 'a', text: 'hi', untilMs: 900 },
        },
      ],
    } as unknown as SceneDto;
    expect(personShareOf(story)).toBe(0);
  });

  it('marks a word card seen on the frame in the still it is in', () => {
    const result = checkFrames({
      scene: lesson(),
      reports: [
        report([
          engine([100, 100, 1200, 800]),
          label('Hotter', [1400, 300, 300, 100], { card: true }),
        ]),
      ],
      shape: 'wide',
    });
    expect(result.stills[0].codes).toContain('word-card');
  });
});

describe('scores', () => {
  const scene = lesson({
    things: [
      drawing('engine'),
      { id: 'hotter', kind: 'words', text: 'Hotter', style: 'keyword' },
    ],
    steps: [
      { atMs: 0, show: ['engine'] },
      { atMs: 4000, show: ['engine', 'hotter'] },
      { atMs: 7000, show: ['engine'] },
    ],
  });
  const reports = [
    report([engine([200, 100, 1500, 850])], 2000),
    report(
      [
        engine([800, 500, 165, 65]),
        label('Hotter', [300, 300, 300, 80], { card: true, fontPx: 40 }),
      ],
      5000,
    ),
    report(
      [engine([200, 100, 1500, 850]), label('fan', [400, 300, 200, 70])],
      8000,
    ),
  ];

  it('scores each axis out of 10 by how much of the scene fails it, and how badly', () => {
    const { scores, problems } = checkFrames({ scene, reports, shape: 'wide' });
    // The strip: 6% of the height against 35%, so 83% short of its floor, in one still of three.
    const strip = problems.find((p) => p.code === 'focal-small');
    expect(strip?.severity).toBeCloseTo(1 - 65 / 1080 / FOCAL.wideMinHeight, 2);
    expect(scores.composition).toBe(
      Math.round(
        100 * (1 - FRAME_CHECKS.weights.focal * (strip!.severity! / 3)),
      ) / 10,
    );
    // Words at 40 px against 60 are a third short, in one of the two stills with words.
    expect(scores.readability).toBe(
      Math.round(100 * (1 - FRAME_CHECKS.weights.textSmall * (1 / 3 / 2))) / 10,
    );
    expect(scores.readability).toBe(7.5);
    expect(scores.cardShare).toBeCloseTo(0.25, 3);
    // A card a quarter of the time leaves a quarter of truth; the strip takes its part of that.
    const tiny = problems.find((p) => p.code === 'tiny-subject')!.severity!;
    expect(scores.truth).toBeCloseTo(
      10 *
        (1 - FRAME_CHECKS.weights.card * 0.25) *
        (1 - FRAME_CHECKS.weights.tiny * (tiny / 3)),
      1,
    );
    expect(scores.pace).toBe(10);
    expect(scores.overall).toBeCloseTo(
      (scores.readability + scores.composition + scores.pace + scores.truth) /
        4,
      1,
    );
    expect(scores.pass).toBe(false);
    expect(scores.focalShare).toBeCloseTo((1500 * 850) / (1920 * 1080), 3);
  });

  it('gives the same answer for the same stills, in any order of asking', () => {
    const once = checkFrames({ scene, reports, shape: 'wide' });
    checkFrames({ scene, reports: [...reports].reverse(), shape: 'wide' });
    const again = checkFrames({ scene, reports, shape: 'wide' });
    expect(again).toEqual(once);
  });

  it('passes a scene that breaks nothing', () => {
    const clean = lesson({
      steps: [
        { atMs: 0, show: ['engine'] },
        { atMs: 2500, show: ['engine'] },
        { atMs: 5000, show: ['engine'] },
        { atMs: 7500, show: ['engine'] },
      ],
    });
    const { scores, problems } = checkFrames({
      scene: clean,
      reports: [report([engine([200, 100, 1500, 850])], 3000)],
      pixels: [
        still(WHITE, [{ box: [200, 100, 1500, 850], rgb: [40, 60, 90] }]),
      ],
      shape: 'wide',
    });
    expect(problems).toEqual([]);
    expect(scores).toMatchObject({
      readability: 10,
      composition: 10,
      pace: 10,
      truth: 10,
      overall: 10,
      pass: true,
    });
  });

  it("weighs an episode's scenes by their length, and takes the subject's median over every still", () => {
    const facts = (area: number) => ({
      ms: 0,
      subject: 'x',
      area,
      height: area,
      luminance: null,
      ink: null,
      codes: [],
    });
    const scores = (value: number, cardShare: number) => ({
      readability: value,
      composition: value,
      pace: value,
      truth: value,
      overall: value,
      pass: value >= 8,
      cardShare,
      personShare: 0,
      focalShare: null,
      focalHeight: null,
      stills: 1,
    });
    const episode = episodeScores([
      {
        scores: scores(10, 0),
        durationMs: 30_000,
        stills: [facts(0.5), facts(0.4)],
      },
      { scores: scores(4, 0.4), durationMs: 10_000, stills: [facts(0.01)] },
    ]);
    expect(episode.readability).toBe(8.5);
    expect(episode.cardShare).toBeCloseTo(0.1, 3);
    expect(episode.focalShare).toBe(0.4);
    expect(episode.stills).toBe(3);
    expect(episode.pass).toBe(true);
  });
});

describe('colours and pixels', () => {
  it('reads the page’s colours, with their alpha', () => {
    expect(colourOf('rgb(10, 20, 30)')).toEqual({
      rgb: [10, 20, 30],
      alpha: 1,
    });
    expect(colourOf('rgba(0, 0, 0, 0.78)')).toEqual({
      rgb: [0, 0, 0],
      alpha: 0.78,
    });
    expect(colourOf('#ff8000')).toEqual({ rgb: [255, 128, 0], alpha: 1 });
    expect(colourOf('none')).toBeNull();
    expect(colourOf(undefined)).toBeNull();
  });

  it('takes the median colour of the band just outside a box', () => {
    const image = still(WHITE, [
      { box: [500, 500, 200, 100], rgb: [200, 0, 0] },
    ]);
    // The words over the red box, the band round them still on the red.
    expect(
      ringColour(image, [530, 520, 140, 60], { width: 1920, height: 1080 }),
    ).toEqual([200, 0, 0]);
    expect(
      ringColour(image, [100, 100, 100, 40], { width: 1920, height: 1080 }),
    ).toEqual(WHITE);
  });

  it('measures a still’s brightness and ink', () => {
    expect(stillStats(still(WHITE)).luminance).toBeCloseTo(1, 3);
    expect(stillStats(still(BLACK)).luminance).toBe(0);
    const half = stillStats(
      still(WHITE, [{ box: [0, 0, 960, 1080], rgb: BLACK }]),
    );
    expect(half.ink).toBeGreaterThan(0.4);
  });
});

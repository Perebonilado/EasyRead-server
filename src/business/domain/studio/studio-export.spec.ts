import {
  CHAPTER_GAP_MS,
  EXPORT_FAILED,
  RENDER_KEY_MS,
  concatArgs,
  concatList,
  contentDisposition,
  downloadName,
  encodeArgs,
  episodeChapter,
  exportDtoOf,
  exportFps,
  ffmetadata,
  filmPrint,
  filmsFor,
  keySecret,
  loudnessOf,
  measureArgs,
  muxArgs,
  progressOf,
  readKey,
  readyLine,
  showChapters,
  signKey,
  soundChapters,
  soundGraph,
  type ExportRecordLike,
  type FilmPrintPart,
  type SoundPlan,
} from './studio-export';

const SECRET = 'a-secret-for-tests';
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const EPISODE = '01a0f1f1-6dfc-73d2-8e42-247ccc2496bf';

describe('keys', () => {
  it('lets in what it was signed for, until it runs out', () => {
    const key = signKey(
      { scope: 'episode', id: EPISODE, expiresAt: NOW + RENDER_KEY_MS },
      SECRET,
    );
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(readKey(key, SECRET, NOW)).toEqual({
      scope: 'episode',
      id: EPISODE,
      expiresAt: NOW + RENDER_KEY_MS,
    });
    expect(readKey(key, SECRET, NOW + RENDER_KEY_MS + 1)).toBeNull();
  });

  it('keeps what it is for: a show, a file', () => {
    for (const scope of ['show', 'file'] as const) {
      const key = signKey(
        { scope, id: EPISODE, expiresAt: NOW + 1000 },
        SECRET,
      );
      expect(readKey(key, SECRET, NOW)?.scope).toBe(scope);
    }
  });

  it('refuses one changed, signed with another secret, or not a key at all', () => {
    const key = signKey(
      { scope: 'episode', id: EPISODE, expiresAt: NOW + 60_000 },
      SECRET,
    );
    const other = EPISODE.replace('01a0', '01a1');
    expect(readKey(key.replace(EPISODE, other), SECRET, NOW)).toBeNull();
    expect(readKey(key.replace(/^e\./, 's.'), SECRET, NOW)).toBeNull();
    expect(readKey(key, 'another-secret', NOW)).toBeNull();
    expect(readKey('', SECRET, NOW)).toBeNull();
    expect(readKey(null, SECRET, NOW)).toBeNull();
    expect(readKey('e.../etc/passwd.x.y', SECRET, NOW)).toBeNull();
  });

  it('signs with its own secret when it has one, else one made from the access secret', () => {
    expect(keySecret({ own: ' mine ', access: 'jwt' })).toBe('mine');
    const made = keySecret({ own: '', access: 'jwt' });
    expect(made).not.toBe('jwt');
    expect(made).toBe(keySecret({ access: 'jwt' }));
    expect(made).not.toBe(keySecret({ access: 'other' }));
    expect(keySecret({})).toHaveLength(64);
  });
});

describe('the sound', () => {
  const plan: SoundPlan = {
    voices: [
      { file: 'a.mp3', startsAtMs: 2400, inMs: 0, outMs: 31_250 },
      { file: 'b.mp3', startsAtMs: 34_900.6, inMs: 120, outMs: 28_000 },
    ],
    beds: ['music.wav'],
    durationMs: 66_500,
  };

  it('lays each voice where the film plays it, the part heard, under the beds, as long as the video', () => {
    const graph = soundGraph(plan, 1, '');
    expect(graph).toContain(
      '[1:a]atrim=start=0.000:end=31.250,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=delays=2400:all=1[v0]',
    );
    expect(graph).toContain('[2:a]atrim=start=0.120:end=28.000');
    expect(graph).toContain('adelay=delays=34901:all=1[v1]');
    expect(graph).toContain('[3:a]aresample=48000');
    // A plain sum, as the speakers hear it: nothing scaled down for being one of three.
    expect(graph).toContain(
      '[v0][v1][b0]amix=inputs=3:normalize=0:dropout_transition=0:duration=longest,apad=whole_dur=66.500,atrim=end=66.500[out]',
    );
  });

  it('has a silent track for a film with nothing to hear, and no mix for one sound', () => {
    expect(soundGraph({ voices: [], beds: [], durationMs: 5000 }, 0, '')).toBe(
      'anullsrc=r=48000:cl=stereo,atrim=end=5.000,apad=whole_dur=5.000,atrim=end=5.000[out]',
    );
    const one = soundGraph(
      { voices: [], beds: ['m.wav'], durationMs: 5000 },
      0,
      'x',
    );
    expect(one).not.toContain('amix');
    expect(one).toContain('[b0]apad=whole_dur=5.000,atrim=end=5.000,x[out]');
  });

  it('measures first, then brings the mix to the platforms’ loudness as it is muxed', () => {
    const measure = measureArgs(plan);
    expect(measure.slice(-4)).toEqual(['[out]', '-f', 'null', '-']);
    expect(measure.join(' ')).toContain(
      'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
    );
    expect(measure.filter((a) => a === '-i')).toHaveLength(3);

    const mux = muxArgs(
      plan,
      'video.mp4',
      { I: -22.5, TP: -3.1, LRA: 6.2, thresh: -33, offset: 0.4 },
      'out.mp4',
    );
    expect(mux.slice(mux.indexOf('-i'), mux.indexOf('-i') + 2)).toEqual([
      '-i',
      'video.mp4',
    ]);
    const graph = mux[mux.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[1:a]atrim');
    expect(graph).toContain(
      'loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=-22.5:measured_TP=-3.1:measured_LRA=6.2:measured_thresh=-33:offset=0.4:linear=true',
    );
    expect(mux).toEqual(
      expect.arrayContaining(['-map', '0:v', '[out]', 'copy', 'aac', '160k']),
    );
    expect(mux[mux.length - 1]).toBe('out.mp4');
    // Nothing measured (a silent film): mixed, not normalised.
    expect(muxArgs(plan, 'v.mp4', null, 'o.mp4').join(' ')).not.toContain(
      'loudnorm',
    );
  });

  it('reads what loudnorm measured from its report', () => {
    const report = `[Parsed_loudnorm_3 @ 0x1]
{
	"input_i" : "-23.41",
	"input_tp" : "-4.02",
	"input_lra" : "5.70",
	"input_thresh" : "-33.86",
	"output_i" : "-14.01",
	"output_tp" : "-1.50",
	"output_lra" : "4.90",
	"output_thresh" : "-24.40",
	"normalization_type" : "dynamic",
	"target_offset" : "0.01"
}`;
    expect(loudnessOf(report)).toEqual({
      I: -23.41,
      TP: -4.02,
      LRA: 5.7,
      thresh: -33.86,
      offset: 0.01,
    });
    expect(loudnessOf(report.replace('"-23.41"', '"-inf"'))).toBeNull();
    expect(loudnessOf('no report')).toBeNull();
  });

  it('encodes JPEG frames as H.264 in broadcast colours', () => {
    const args = encodeArgs(30, 'v.mp4');
    expect(args).toEqual(
      expect.arrayContaining([
        'image2pipe',
        'mjpeg',
        'libx264',
        '-crf',
        '20',
        'fast',
        'bt709',
        '+faststart',
        '-an',
      ]),
    );
    expect(args.join(' ')).toContain(
      'in_range=full:out_range=limited,format=yuv420p',
    );
    expect(args[args.length - 1]).toBe('v.mp4');
  });
});

describe('chapters', () => {
  it('writes the title and each chapter up to the next, its own marks escaped', () => {
    const text = ffmetadata({
      title: 'Blood; = #1\nagain',
      chapters: [
        { atMs: 0, title: 'Opening' },
        { atMs: 61_000, title: 'Why = how' },
      ],
      durationMs: 120_000,
    });
    expect(text).toBe(
      [
        ';FFMETADATA1',
        'title=Blood\\; \\= \\#1 again',
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        'START=0',
        'END=61000',
        'title=Opening',
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        'START=61000',
        'END=120000',
        'title=Why \\= how',
        '',
      ].join('\n'),
    );
  });

  it('makes chapters sound: in order, apart, the first at the start, none past the end', () => {
    expect(
      soundChapters(
        [
          { atMs: 90_000, title: 'Three' },
          { atMs: 30_000, title: 'Two' },
          { atMs: 32_000, title: 'Too close' },
          { atMs: 500_000, title: 'Past the end' },
          { atMs: 40_000, title: '  ' },
        ],
        200_000,
        'The film',
      ),
    ).toEqual([
      { atMs: 0, title: 'The film' },
      { atMs: 30_000, title: 'Two' },
      { atMs: 90_000, title: 'Three' },
    ]);
    // A first act near the start is the start.
    expect(
      soundChapters([{ atMs: 1200, title: 'Act one' }], 60_000, 'x'),
    ).toEqual([{ atMs: 0, title: 'Act one' }]);
    expect(soundChapters([], 60_000, 'x')).toEqual([]);
  });

  it('runs a show’s chapters end to end: each episode, its acts inside it', () => {
    const chapters = showChapters([
      {
        number: 1,
        title: 'How it began',
        durationMs: 200_000,
        chapters: [
          { atMs: 0, title: 'Act one' },
          { atMs: 95_000, title: 'Act two' },
        ],
      },
      {
        number: 2,
        title: 'Why it nearly fell apart',
        durationMs: 180_000,
        chapters: [],
      },
    ]);
    expect(chapters).toEqual([
      { atMs: 0, title: episodeChapter(1, 'How it began') },
      { atMs: 95_000, title: 'Act two' },
      { atMs: 200_000, title: 'Episode 2: Why it nearly fell apart' },
    ]);
    expect(CHAPTER_GAP_MS).toBeGreaterThan(0);
  });

  it('lists the parts for the concat demuxer, quoted, and joins them with the chapters', () => {
    expect(concatList(['/tmp/a.mp4', "/tmp/it's.mp4"])).toBe(
      "file '/tmp/a.mp4'\nfile '/tmp/it'\\''s.mp4'\n",
    );
    const args = concatArgs('list.txt', 'meta.txt', 'out.mp4');
    expect(args).toEqual(
      expect.arrayContaining([
        'concat',
        'list.txt',
        'meta.txt',
        '-map_chapters',
        '1',
        'copy',
      ]),
    );
  });
});

describe('the file', () => {
  it('is named by the episode’s title, the show’s for the whole show, vertical said', () => {
    expect(
      downloadName({
        showTitle: 'Blood Protozoa',
        episodeTitle: 'Trypanosomes: a/b "test"?',
        scope: 'episode',
        shape: 'tall',
      }),
    ).toBe('Trypanosomes a b test (vertical).mp4');
    expect(
      downloadName({
        showTitle: 'Blood Protozoa',
        episodeTitle: 'One',
        scope: 'show',
        shape: 'wide',
      }),
    ).toBe('Blood Protozoa.mp4');
    expect(
      downloadName({
        showTitle: '...',
        episodeTitle: '///',
        scope: 'episode',
        shape: 'wide',
      }),
    ).toBe('Film.mp4');
  });

  it('is sent with its name as it is, and a plain one for old browsers', () => {
    expect(contentDisposition('Ça va (vertical).mp4')).toBe(
      `attachment; filename="_a va (vertical).mp4"; filename*=UTF-8''%C3%87a%20va%20(vertical).mp4`,
    );
  });
});

describe('what a video is made of', () => {
  const ep = (
    id: string,
    number: number,
    shape: 'wide' | 'tall',
    twinOf: string | null = null,
  ) => ({ id, number, shape, twinOf });
  const episodes = [
    ep('two', 2, 'wide'),
    ep('one', 1, 'wide'),
    ep('one-tall', 1, 'tall', 'one'),
    ep('three', 3, 'wide'),
  ];
  const made = (e: { id: string }) => e.id !== 'three';

  it('is the episode asked for, in its own shape or as its twin', () => {
    expect(
      filmsFor({
        scope: 'episode',
        shape: 'wide',
        lead: episodes[1],
        episodes,
        made,
      }).map((e) => e.id),
    ).toEqual(['one']);
    expect(
      filmsFor({
        scope: 'episode',
        shape: 'tall',
        lead: episodes[1],
        episodes,
        made,
      }).map((e) => e.id),
    ).toEqual(['one-tall']);
    // No twin in that shape, or not made: nothing.
    expect(
      filmsFor({
        scope: 'episode',
        shape: 'tall',
        lead: episodes[0],
        episodes,
        made,
      }),
    ).toEqual([]);
    expect(
      filmsFor({
        scope: 'episode',
        shape: 'wide',
        lead: episodes[3],
        episodes,
        made,
      }),
    ).toEqual([]);
  });

  it('is every made episode of the show in that shape, by number', () => {
    expect(
      filmsFor({
        scope: 'show',
        shape: 'wide',
        lead: episodes[0],
        episodes,
        made,
      }).map((e) => e.id),
    ).toEqual(['one', 'two']);
    expect(
      filmsFor({
        scope: 'show',
        shape: 'tall',
        lead: episodes[0],
        episodes,
        made,
      }).map((e) => e.id),
    ).toEqual(['one-tall']);
  });
});

describe('asking twice', () => {
  const film: FilmPrintPart = {
    episodeId: EPISODE,
    number: 1,
    title: 'One',
    scenes: [{ id: 's1', sceneKey: 'k1', audioKey: 'a1', durationMs: 1000 }],
  };
  const print = (over: Partial<Parameters<typeof filmPrint>[0]> = {}) =>
    filmPrint({
      scope: 'episode',
      shape: 'wide',
      captions: true,
      showTitle: 'Show',
      watermark: false,
      films: [film],
      ...over,
    });

  it('is the same for the same film, and changes with anything seen or heard', () => {
    expect(print()).toBe(print());
    expect(print()).toHaveLength(32);
    expect(print({ captions: false })).not.toBe(print());
    expect(print({ shape: 'tall' })).not.toBe(print());
    expect(print({ watermark: true })).not.toBe(print());
    expect(
      print({
        films: [{ ...film, scenes: [{ ...film.scenes[0], audioKey: 'a2' }] }],
      }),
    ).not.toBe(print());
    expect(print({ films: [{ ...film, title: 'Renamed' }] })).not.toBe(print());
  });
});

describe('progress and the maker’s view', () => {
  it('counts the frames most, and is never done before it is kept', () => {
    expect(progressOf({ framesDone: 0, framesTotal: 100 })).toBe(0);
    expect(progressOf({ framesDone: 50, framesTotal: 100 })).toBe(0.45);
    expect(
      progressOf({
        framesDone: 100,
        framesTotal: 100,
        soundDone: 1,
        soundTotal: 1,
      }),
    ).toBe(0.97);
    expect(
      progressOf({
        framesDone: 500,
        framesTotal: 100,
        soundDone: 9,
        soundTotal: 1,
      }),
    ).toBe(0.97);
    expect(progressOf({ framesDone: 1, framesTotal: 0 })).toBe(0);
  });

  const record: ExportRecordLike = {
    id: 'x1',
    episodeId: EPISODE,
    scope: 'episode',
    shape: 'wide',
    status: 'rendering',
    progress: 0.4,
    fileKey: null,
    bytes: null,
    error: null,
    createdAt: new Date(NOW),
  };

  it('hands out the link and the size only once it is done, and its reason only when it failed', () => {
    expect(exportDtoOf(record, 'http://x/file')).toEqual({
      id: 'x1',
      episodeId: EPISODE,
      scope: 'episode',
      shape: 'wide',
      status: 'rendering',
      progress: 0.4,
      url: null,
      bytes: null,
      error: null,
      createdAt: new Date(NOW).toISOString(),
    });
    expect(
      exportDtoOf(
        {
          ...record,
          status: 'done',
          fileKey: 'k',
          bytes: 1234,
          progress: 0.97,
        },
        'http://x/file',
      ),
    ).toMatchObject({
      status: 'done',
      progress: 1,
      url: 'http://x/file',
      bytes: 1234,
    });
    expect(
      exportDtoOf({ ...record, status: 'failed', error: EXPORT_FAILED }, 'u'),
    ).toMatchObject({ url: null, error: EXPORT_FAILED });
  });

  it('says in the thread when a video is ready', () => {
    expect(
      readyLine({
        scope: 'episode',
        shape: 'tall',
        title: 'One',
        durationMs: 272_400,
      }),
    ).toBe('Your video is ready: “One” (vertical, 4:32)');
    expect(
      readyLine({
        scope: 'show',
        shape: 'wide',
        title: 'Show',
        durationMs: 61_000,
      }),
    ).toBe('Your video is ready: “Show” (the whole show, 1:01)');
  });

  it('takes a frame rate from 12 to 60, else 30', () => {
    expect(exportFps('24')).toBe(24);
    expect(exportFps(undefined)).toBe(30);
    expect(exportFps('fast')).toBe(30);
    expect(exportFps(240)).toBe(30);
  });
});

/**
 * The clarity checks held to real films: the story bench of 30 September
 * (npm run story:bench -- --scenes, seven briefs, three reads each), its
 * cold reads, its critic's scores and its scripts as saved. Code's own
 * judges (the clarity sentence against the premise, the confusions that
 * count, the timed opening, lines said to no one) are run again on them
 * here, with no model called.
 *
 * On that run clarity sat at exactly 6 (BAR.clarity - 1, code's floor) on
 * five briefs out of seven, most of them clear to a careful first-time
 * reader: the floor came from paraphrase read as a miss ("poor eyesight"
 * for "failing eyes"), a mystery's own question read as confusion ("who
 * moved the cat"), talking animals read as an impossible thing missed,
 * and minor parts asked about. Mumbai's scene 1 is unclear, and stays so.
 *
 * "Due by Midnight" is the live film of the same night; its sheets are not
 * saved here, so its want, its intercom scene and its lines are rebuilt
 * from the worker's log (the premise's words and the flagged lines as
 * logged).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bibleOf, storySheetOf, type StorySheet } from './studio';
import {
  BAR,
  CONFUSED_MOST,
  RUBRIC_KEYS,
  castAsSeen,
  checkOpening,
  coldReadOf,
  judgeColdRead,
  lintLines,
  lintTelling,
  tableReadOf,
  unclear,
} from './studio-script';
import { premiseOf, type StudioStory } from './studio-story';
import {
  audienceIn,
  checksAt,
  describeAudience,
  heardWho,
  recipeFor,
} from './studio-audience';
import { measurePlain, plainExplainer } from './studio-plain';
import { explainerSheetOf } from './studio';

interface Fixture {
  id: string;
  brief: { minutes: number; audience: string };
  premise: Record<string, unknown>;
  plan: { scenes: unknown[] };
  characters: unknown[];
  reads: {
    viewer: unknown;
    misses: string[];
    unsure: string[];
    clarity: number;
    overall: number;
    code: { scene: number; kind: string; message: string }[];
  }[];
  best: number;
  first: unknown[];
  kept?: unknown[];
}

const dir = join(__dirname, '__fixtures__', 'story-bench');
const bench = new Map<string, Fixture>(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fx = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture;
      return [fx.id, fx];
    }),
);

/** A saved brief as the judges take it: its cast, premise, story and scripts. */
function film(id: string) {
  const fx = bench.get(id)!;
  const first: StorySheet[] = fx.first.map((s) => storySheetOf(s));
  const kept: StorySheet[] = fx.kept
    ? fx.kept.map((s) => storySheetOf(s))
    : first;
  const sets = [...new Set(first.map((s) => s.set))].map((set) => ({
    id: set,
    name: set,
  }));
  const bible = bibleOf({ characters: fx.characters, sets });
  const premise = premiseOf(fx.premise);
  const story = {
    premise,
    beats: { template: 'medium', beats: [] },
    plan: fx.plan,
  } as unknown as StudioStory;
  /**
   * Read r judged again. Only the first and the kept scripts were saved:
   * a read of another stands on the first's cast as seen (its labels and
   * speakers, which rewrites of scene 1 keep).
   */
  const judged = (r: number) =>
    judgeColdRead(
      coldReadOf(fx.reads[r].viewer),
      premise,
      bible,
      castAsSeen(r === fx.best ? kept : first, bible, 0),
    );
  /** Whether code put read r under the clarity floor, as saved and as now. */
  const floored = (r: number) => {
    const read = fx.reads[r];
    const viewer = coldReadOf(read.viewer)!;
    const now = judged(r);
    return {
      was:
        read.misses.length > 0 ||
        viewer.confused.length + read.unsure.length >= CONFUSED_MOST,
      now:
        now.misses.length > 0 ||
        now.confused.length + now.unsure.length >= CONFUSED_MOST,
    };
  };
  return { fx, first, kept, bible, premise, story, judged, floored };
}

/** A read of a saved cold read, the critic's items all 8. */
function readOf(
  saved: Fixture['reads'][number],
  judged: ReturnType<typeof judgeColdRead>,
) {
  return tableReadOf(
    {
      scores: Object.fromEntries(RUBRIC_KEYS.map((k) => [k, 8])),
      overall: 7.6,
      scenes: [],
    },
    5,
    coldReadOf(saved.viewer),
    judged,
  );
}

describe('clarity on the story bench of 30 September, judged again by code', () => {
  it('holds seven briefs to the floor only where the viewer could not follow', () => {
    // Per brief, each read: under code's floor as saved → as judged now.
    const floors = Object.fromEntries(
      [...bench.keys()].sort().map((id) => {
        const f = film(id);
        return [
          id,
          f.fx.reads.map((_, r) => {
            const { was, now } = f.floored(r);
            return `${was ? 'floor' : 'free'}→${now ? 'floor' : 'free'}`;
          }),
        ];
      }),
    );
    expect(floors).toEqual({
      'andes-adventure': ['free→free', 'free→free', 'free→free'],
      // Talking animals, a fable's "why", the voice-over's owner: none count.
      'fable-desert': ['floor→free', 'floor→free', 'free→free'],
      // The ball's rule and the girl who made the bet go unseen at first;
      // the third read adds a real confusion.
      'lagos-comedy': ['floor→floor', 'floor→free', 'floor→floor'],
      // Genuinely unclear: the want is not in scene 1 at all.
      'mumbai-romance': ['floor→floor', 'floor→floor', 'floor→floor'],
      'no-setting-lost-toy': ['free→free', 'floor→free', 'free→free'],
      // Read 1: who the young woman is, asked twice, counts once; but the
      // viewer also could not see why Anders cannot mend it himself.
      'norway-drama': ['floor→floor', 'floor→free', 'floor→free'],
      // A mystery: who moved the cat, and how, is what it means us to ask.
      'seoul-mystery': ['floor→free', 'floor→free', 'floor→free'],
    });
  });

  it('takes a paraphrase of the obstacle for the obstacle (Norway)', () => {
    const f = film('norway-drama');
    expect(f.fx.reads[0].misses).toEqual([
      expect.stringMatching(
        /said what is in the way is "Anders's poor eyesight and the young woman's inexperience"/,
      ),
    ]);
    expect(f.judged(0).misses).toEqual([]);
    // Who the young woman is, asked two ways, is one confusion.
    expect(f.judged(0).confused).toEqual([
      "whether the young woman is Anders's daughter or a hired hand",
      'why Anders cannot mend the net himself despite his experience',
    ]);
  });

  it("reads a two-hander from the other side as the same story, not the wrong hero's (Norway)", () => {
    const f = film('norway-drama');
    expect(f.fx.reads[1].misses[0]).toMatch(/took it for Sigrid's story/);
    expect(f.judged(1).misses).toEqual([]);
    // Farfar is Norwegian; the viewer's one confusion stays theirs.
    expect(f.judged(1).confused).toHaveLength(1);
  });

  it("never counts a mystery's own questions, nor a small part's, as confusion (Seoul)", () => {
    const f = film('seoul-mystery');
    const viewer = coldReadOf(f.fx.reads[0].viewer)!;
    expect(viewer.confused).toEqual([
      'how the cat moved',
      'who moved the cat',
      'why the crumbs caused the luck to walk out',
    ]);
    expect(f.judged(0)).toEqual({ misses: [], unsure: [], confused: [] });
    // Read 2: the shop cat, who never speaks, is no one to ask about;
    // Halmoni, whom the story turns on and who speaks, is.
    expect(f.judged(1).unsure).toEqual([
      'could not tell who The shopkeeper (elder, pink cardigan) is to the hero',
    ]);
  });

  it('knows UNNAMED 2 is whoever the film showed as UNNAMED 2, and keeps a want the viewer truly missed (Mumbai)', () => {
    const f = film('mumbai-romance');
    expect(f.fx.reads[1].misses).toHaveLength(2);
    const now = f.judged(1);
    // "UNNAMED 2 taking her seat": Kabir, who is in the way.
    expect(now.misses).toEqual([
      expect.stringMatching(
        /said the hero wants "to submit her script at the gate by nine"/,
      ),
    ]);
    expect(unclear(readOf(f.fx.reads[1], now))).toBe(true);
  });

  it('takes talking animals as a fable does (Fable)', () => {
    const f = film('fable-desert');
    expect(f.fx.reads[0].unsure[0]).toMatch(/did not get the impossible thing/);
    expect(f.judged(0).unsure).toEqual([]);
    // Lagos's ball, whose rule the viewer did not see, is still asked about.
    expect(film('lagos-comedy').judged(1).unsure).toEqual([
      expect.stringMatching(/did not get the impossible thing/),
    ]);
  });

  it("leaves the critic's own clarity where code finds the viewer followed, and floors it where not", () => {
    const seoul = film('seoul-mystery');
    const clear = readOf(seoul.fx.reads[0], seoul.judged(0));
    expect(clear.scores.clarity).toBe(8);
    expect(clear.clarityGiven).toBe(8);
    expect(clear.overall).toBe(7.6);
    const mumbai = film('mumbai-romance');
    const muddled = readOf(mumbai.fx.reads[0], mumbai.judged(0));
    expect(muddled.scores.clarity).toBe(BAR.clarity - 1);
    expect(muddled.clarityGiven).toBe(8);
    expect(muddled.confused).toEqual([
      'what the drama notice is for',
      'what their relationship is',
    ]);
  });

  it('times the opening as the stage plays it, and takes each part in other words (Norway, Lagos, Fable)', () => {
    const partOf = (message: string) =>
      /gives ([^(]+) \(/.exec(message)?.[1]?.trim() ?? 'name';
    const now = (id: string) => {
      const f = film(id);
      return checkOpening(f.first[0], f.story, f.bible, f.fx.brief.minutes).map(
        partOf,
      );
    };
    const was = (id: string) =>
      bench
        .get(id)!
        .reads[0].code.filter((n) => n.kind === 'opening')
        .map((n) => partOf(n.message));
    expect(was('norway-drama')).toEqual([
      'what the hero wants',
      'what stands in their way',
      'what they lose if they fail',
      'by when',
    ]);
    // "You'll mend the last rows yourself… If the net's wrong, there's no
    // winter catch", and three tries at the needle, land in time; the boat
    // waiting at the quay does not say by when.
    expect(now('norway-drama')).toEqual(['by when']);
    expect(was('lagos-comedy')).toEqual(['what they lose if they fail']);
    expect(now('lagos-comedy')).toEqual([]);
    expect(was('fable-desert')).toEqual(['what they lose if they fail']);
    expect(now('fable-desert')).toEqual([]);
    // Nina's name is still never said in scene 1.
    expect(now('andes-adventure')).toEqual(['name']);
  });
});

describe('"Due by Midnight", rebuilt from the worker log', () => {
  const bible = bibleOf({
    characters: [
      { id: 'maya', name: 'Maya', voice: 'woman', role: 'main' },
      { id: 'sal', name: 'Mr. Sal', voice: 'old man', role: 'supporting' },
    ],
    sets: [
      { id: 'street', name: 'Street' },
      { id: 'stairwell', name: 'Stairwell' },
    ],
  });
  const premise = premiseOf({
    title: 'Due by Midnight',
    logline:
      'Maya must get the rent envelope out of her locked apartment by midnight, but the only spare key is with Mr. Sal, who never opens his door.',
    hero: 'maya',
    genre: 'comedy',
    // As the worker logged them.
    want: 'The rent envelope on the table inside her locked apartment',
    obstacle:
      'Sal, one floor down, who holds the only spare key and never opens his door',
    clock: 'midnight, when the rent is due',
    stakes: 'she loses the apartment',
    whyToday: 'the rent is due at midnight and her door has locked behind her',
  });
  const story = {
    premise,
    beats: { template: 'medium', beats: [] },
    plan: { scenes: [{ title: 'Locked out', setup: [] }] },
  } as unknown as StudioStory;

  it("takes the want from the rent and midnight said, never asking for the premise's exact words", () => {
    const opening = storySheetOf({
      title: 'Locked out',
      set: 'street',
      onStage: [{ who: 'maya', spot: 'centre' }],
      beats: [
        {
          kind: 'business',
          who: 'maya',
          say: 'Maya tries the knob.',
          do: 'open',
        },
        {
          kind: 'line',
          who: 'maya',
          say: "Maya, you absolute genius. Rent's due at midnight and I'm out here.",
          from: 'here',
        },
      ],
    });
    expect(
      checkOpening(opening, story, bible, 2).filter((m) =>
        /what the hero wants/.test(m),
      ),
    ).toEqual([]);
  });

  it('counts lines to a voice on the intercom, or to someone called by name off the stage, as said to someone', () => {
    const intercom = (sal: boolean) =>
      storySheetOf({
        title: 'The buzzer',
        set: 'stairwell',
        onStage: [{ who: 'maya', spot: 'centre' }],
        beats: [
          {
            kind: 'business',
            who: 'maya',
            say: 'Maya presses the buzzer.',
            do: 'use',
          },
          ...(sal
            ? [{ kind: 'line', who: 'sal', say: 'Who is it?', from: 'off' }]
            : []),
          { kind: 'line', who: 'maya', say: 'Mr. Sal, I only need—' },
          ...(sal
            ? [{ kind: 'line', who: 'sal', say: 'No.', from: 'off' }]
            : []),
          {
            kind: 'line',
            who: 'maya',
            say: "Nobody's asking you to come out, Mr. Sal. Just push the key under the door.",
          },
        ],
      });
    for (const sal of [true, false]) {
      const sheet = intercom(sal);
      expect(
        lintTelling([sheet], bible).filter((n) => /to no one/.test(n.message)),
      ).toEqual([]);
      expect(
        lintLines([sheet], bible).filter((n) =>
          /said to no one/.test(n.message),
        ),
      ).toEqual([]);
    }
    // Alone, to no one: still a narrator in disguise.
    const alone = storySheetOf({
      title: 'Alone',
      set: 'street',
      onStage: [{ who: 'maya', spot: 'centre' }],
      beats: [{ kind: 'line', who: 'maya', say: 'The rent is on the table.' }],
    });
    expect(lintTelling([alone], bible)[0].message).toMatch(
      /Maya says "The rent is on the table\." to no one, alone/,
    );
  });
});

/**
 * Four explainer briefs of the plan (Ask 8): a grade 5 class on the water
 * cycle, teens on equations, a first-year nursing student new to blood
 * pressure, and an adult learning English on budgets. Each is its maker's
 * words, its outline's scenes, and narration as a writer for that
 * audience would give it. Scored by code alone: whom the words say it is
 * for, where the checks for understanding fall, and whether each scene's
 * words are plain enough for them. No model is called.
 */
interface ExplainerFixture {
  id: string;
  said: string;
  expect: Record<string, string>;
  pictures: string[];
  scenes: {
    seconds: number;
    teach: string;
    says: string[];
    question?: number;
  }[];
}

const explainerDir = join(__dirname, '__fixtures__', 'explainer-bench');
const explainers: ExplainerFixture[] = readdirSync(explainerDir)
  .filter((f) => f.endsWith('.json'))
  .map(
    (f) =>
      JSON.parse(
        readFileSync(join(explainerDir, f), 'utf8'),
      ) as ExplainerFixture,
  );

describe('the explainer bench, by code (Ask 8)', () => {
  it('has the four briefs of the plan', () => {
    expect(explainers.map((fx) => fx.id).sort()).toEqual([
      'adult-english-budgets',
      'grade5-water-cycle',
      'nursing-blood-pressure',
      'teen-algebra',
    ]);
  });

  describe.each(explainers.map((fx) => [fx.id, fx] as const))(
    '%s',
    (_id, fx) => {
      const who = heardWho(audienceIn(fx.said), undefined)!;
      const recipe = recipeFor(who);
      const checks = checksAt(fx.scenes, recipe, who);

      it('hears whom it is for from the maker’s words', () => {
        expect(who).toMatchObject(fx.expect);
        expect(describeAudience(who)).toContain(recipe.reader);
      });

      it('asks the viewer a question where the recipe spaces the checks, and nowhere else', () => {
        expect(checks).toEqual(fx.scenes.map((s) => s.question !== undefined));
      });

      it('keeps every scene’s words plain enough for them, with nothing for code to fix', () => {
        fx.scenes.forEach((scene, k) => {
          const sheet = explainerSheetOf({
            kind: 'explainer',
            draft: {
              fit: 'good',
              fitReason: null,
              title: `Scene ${k + 1}`,
              mood: 'curious',
              beats: scene.says.map((say, b) => ({
                say,
                pause: 'short',
                delivery: b === scene.question ? 'question' : 'explain',
              })),
              cast: [],
              steps: [],
            },
          });
          const out = plainExplainer(sheet, {
            recipe,
            material: scene.teach,
            terms: fx.pictures,
            check: checks[k],
          });
          expect([k, out.fixes, out.problems]).toEqual([k, [], []]);
          expect(out.measure.longest).toBeLessThanOrEqual(recipe.sentence[1]);
        });
        const film = measurePlain(fx.scenes.flatMap((s) => s.says).join(' '), {
          terms: fx.pictures,
          material: fx.scenes.map((s) => s.teach).join(' '),
        });
        expect(film.grade).toBeLessThanOrEqual(recipe.grade + 1);
      });

      it('would send a university page given to them back, alongside the rest, if it is above them', () => {
        const hard = explainerSheetOf({
          kind: 'explainer',
          draft: {
            fit: 'good',
            fitReason: null,
            title: 'Hard',
            mood: 'curious',
            beats: [
              {
                say: 'The hydrological cycle constitutes a continuous circulation of water, driven primarily by solar radiation and gravitational forces, whereby evaporation transports substantial quantities of moisture into the atmosphere.',
                pause: 'short',
                delivery: 'explain',
              },
            ],
            cast: [],
            steps: [],
          },
        });
        const out = plainExplainer(hard, { recipe });
        expect(out.problems.length).toBeGreaterThan(0);
        expect(
          out.problems.every(
            (p) => p.rule === 'plain' && p.level === 'warning',
          ),
        ).toBe(true);
      });
    },
  );
});

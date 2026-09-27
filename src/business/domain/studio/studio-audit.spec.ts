import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../../contracts';
import { bibleOf, storySheetOf, type StudioBible } from './studio';
import {
  auditScene,
  describeAudit,
  silentLines,
  withMouths,
} from './studio-audit';
import {
  endStateOf,
  mendSheet,
  repairSheet,
  withFeatures,
  type EndState,
} from './studio-check';
import { stageStory } from './studio-stage';
import { voiced } from './__fixtures__/voiced';

/** "Maya and the Missing Pup", as written and as made on 2026-09-26 (public/dev-scenes/maya-s1 to s5, trimmed). */
const maya = (file: string): unknown =>
  JSON.parse(
    readFileSync(join(__dirname, '__fixtures__', 'maya', file), 'utf8'),
  );
const bible = bibleOf(maya('bible.json'));
const sheet = (n: number) => storySheetOf(maya(`s${n}-sheet.json`));
const made = (n: number) => maya(`s${n}-made.json`) as SceneDto;
const audit = (n: number) => auditScene(sheet(n), made(n), bible);
const verdict = (n: number, beat: number) =>
  audit(n).find((one) => one.beat === beat)?.verdict;

describe('a made scene, looked at beat by beat', () => {
  it('finds what the Maya film made today leaves out, or shows as something else', () => {
    const wrong = (n: number) =>
      audit(n)
        .filter((one) => one.verdict !== 'seen')
        .map((one) => one.beat);
    expect(wrong(1)).toEqual(expect.arrayContaining([2, 3, 5, 7]));
    expect(wrong(4)).toContain(12);
    expect(wrong(5)).toEqual(expect.arrayContaining([2, 8]));
    // What shows as its words say passes: a face, a hug, a laugh, an exit.
    expect(verdict(1, 8)).toBe('seen');
    expect(verdict(1, 14)).toBe('seen');
    expect(verdict(4, 8)).toBe('seen');
    expect(verdict(4, 15)).toBe('seen');
  });

  it('says why: the ball never leaves her hand, a hop where he should chase, no gate to squeeze under', () => {
    const seen = audit(1);
    const beat = (b: number) => seen.find((one) => one.beat === b)!;
    expect(beat(2)).toMatchObject({
      expects: ['throw'],
      missing: ['the ball'],
      verdict: 'unlike',
    });
    expect(beat(3)).toMatchObject({ expects: ['chase'], verdict: 'unlike' });
    expect(beat(3).seen).toContain('move hop');
    expect(beat(7)).toMatchObject({
      expects: ['squeeze'],
      missing: ['the gate'],
    });
    expect(beat(7).seen).toContain('goes off');
    expect(describeAudit(seen)[0]).toMatch(/^b2 maya throw: unlike/);
  });

  it('tells a beat that shows nothing from one that shows something else', () => {
    expect(verdict(4, 12)).toBe('unseen');
    expect(verdict(5, 2)).toBe('unseen');
    expect(verdict(5, 8)).toBe('unseen');
    expect(verdict(1, 3)).toBe('unlike');
  });

  it('finds nothing left out once the five sheets are mended and staged', () => {
    let show: StudioBible = bible;
    let before: EndState | null = null;
    for (let n = 1; n <= 5; n += 1) {
      show = withFeatures(
        show,
        sheet(n).set,
        mendSheet(sheet(n), show, before).features,
      );
      const fixed = repairSheet(sheet(n), show, before);
      const { scene } = voiced(stageStory(fixed, show), ['pip']);
      const unseen = auditScene(fixed, scene, show).filter(
        (one) => one.verdict === 'unseen',
      );
      expect({ scene: n, unseen }).toEqual({ scene: n, unseen: [] });
      before = endStateOf(fixed);
    }
  });

  it('sees a thing thrown, dropped and chewed once things are apart from the people who hold them', () => {
    let show: StudioBible = bible;
    let before: EndState | null = null;
    const seen: Record<number, ReturnType<typeof auditScene>> = {};
    for (let n = 1; n <= 5; n += 1) {
      show = withFeatures(
        show,
        sheet(n).set,
        mendSheet(sheet(n), show, before).features,
      );
      const fixed = repairSheet(sheet(n), show, before);
      const { scene } = voiced(stageStory(fixed, show, { before }), ['pip']);
      seen[n] = auditScene(fixed, scene, show).map((one) => ({
        ...one,
        say: fixed.beats[one.beat].say,
      }));
      before = endStateOf(fixed, show, before);
    }
    const verdict = (n: number, say: string) =>
      seen[n].find((one) => (one as { say?: string }).say === say);
    expect(verdict(1, 'Maya throws the ball for Pip.')).toMatchObject({
      verdict: 'seen',
      missing: [],
    });
    expect(verdict(1, 'Maya throws the ball for Pip.')?.seen).toContain(
      'throws the ball',
    );
    expect(verdict(5, 'Pip drops the ball.')).toMatchObject({
      verdict: 'seen',
    });
    expect(verdict(5, "Pip chews Maya's shoe.")).toMatchObject({
      verdict: 'seen',
    });
  });

  it("counts only the beat's own doing: never a listener's nod, a glance, or a gate someone else shuts", () => {
    const fixed = repairSheet(sheet(4), bible);
    const lick = fixed.beats.findIndex((b) => b.do === 'lick');
    const { scene } = voiced(stageStory(fixed, bible), ['pip']);
    const spoken = fixed.beats
      .slice(0, lick)
      .filter((b) => b.kind === 'line' || b.kind === 'narration').length;
    const from = scene.beats[spoken - 1].endMs;
    // Nothing of its own: a listener's nod as the line ends, a glance at
    // Maya, and the gate shut by someone else, all in its time.
    const quiet: SceneDto = {
      ...scene,
      acting: {
        ...scene.acting,
        pip: {
          ...scene.acting?.pip,
          moves: [[from + 150, 'nod', 500]],
          look: [[from + 400, 'maya', 0.2]],
        },
      },
      setting: {
        ...scene.setting,
        featureStates: [[from + 600, 'gate', 'shut']],
      },
      props: [],
    };
    expect(
      auditScene(fixed, quiet, bible).find((one) => one.beat === lick),
    ).toMatchObject({ verdict: 'unseen', seen: [] });
  });

  it('plays a beat that showed nothing by its fallback, and then it shows', () => {
    const fixed = repairSheet(sheet(4), bible);
    const lick = fixed.beats.findIndex((b) => b.do === 'lick');
    const plain = stageStory(fixed, bible, { plain: new Set([lick]) });
    const played = plain.steps
      .flatMap((s) => s.effects)
      .filter((e) => e.target === 'pip');
    expect(played.length).toBeGreaterThan(0);
    const { scene } = voiced(plain, ['pip']);
    expect(
      auditScene(fixed, scene, bible).find((one) => one.beat === lick)?.verdict,
    ).not.toBe('unseen');
  });
});

describe('every line said on the stage moves its speaker’s mouth', () => {
  // Made with its mouths left out (the fixture is trimmed of them), as a
  // scene whose planning missed a speaker would be.
  const scene = made(1);
  const lines = scene.effects.filter((e) => e.do === 'say' && !e.say?.from);

  it('finds each line whose speaker’s mouth does not move, kit or artist', () => {
    const silent = silentLines(scene);
    expect(silent.length).toBe(lines.length);
    expect(new Set(silent.map((one) => one.who))).toEqual(
      new Set(['maya', 'mama']),
    );
  });

  it('gives each its mouth from its words as the voice says them, and leaves the rest as it was', () => {
    const { scene: mended, mended: notes } = withMouths(scene);
    expect(notes).toHaveLength(lines.length);
    expect(silentLines(mended)).toEqual([]);
    const first = lines[0];
    const plan = mended.acting![first.target].mouth!;
    // From the line's first word, a digit a frame, opening and shutting.
    const word = scene.beats.find(
      (beat) =>
        beat.endMs > first.atMs && beat.startMs < first.say!.saidUntilMs!,
    )!.words[0];
    expect(plan[0][0]).toBe(Math.round(word[2]));
    expect(plan[0][1]).toMatch(/^[0-5]+$/);
    expect(plan[0][1]).toMatch(/[1-5]/);
    // What else they do is kept.
    expect(mended.acting!.maya.look).toEqual(scene.acting!.maya.look);
    // Put right once is right: nothing more to do.
    expect(withMouths(mended).mended).toEqual([]);
  });

  it('leaves out a voice from elsewhere, and whoever is off the stage', () => {
    const off: SceneDto = {
      ...scene,
      effects: scene.effects.map((e) =>
        e === lines[0] ? { ...e, say: { ...e.say!, from: 'off' as const } } : e,
      ),
    };
    expect(silentLines(off).length).toBe(lines.length - 1);
  });
});

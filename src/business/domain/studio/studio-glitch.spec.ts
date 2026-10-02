/**
 * The three faults Richard saw in "Adolescent Health Medicine: Five
 * Foundations" (studio-glitch-plan), on the film's own scenes: the
 * HEADSSS checklist flipping with its own items as cards at 3:30–3:38,
 * three brake calipers captioned "Parental support", "Education" and
 * "Positive peer influence", and words on words as the stage changed.
 * Each checked as the film was made (the faults are there) and as it is
 * composed now (they are gone).
 */
import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import type { SceneDto, SceneStepDto } from '../../../contracts';
import { keepIds, type BoardCarry } from '../scene-board';
import { clearDrawnWords } from '../scene-drawn-words';
import { captionLines, wholeWords } from '../scene-layout';
import { picturesAgainstLabels, sameSubject } from '../scene-picture-label';
import {
  HOLD_MS,
  flickersOf,
  holdMsOf,
  readingOf,
  steadyStages,
} from '../scene-reading';
import { listsIn, type SceneScript } from '../scene-script';
import { passingOverlaps, standingOverlaps } from '../scene-text-check';
import {
  ADOLESCENT_FILM,
  composeAdolescentFilm,
  madeScene,
  type ComposedScene,
} from './__fixtures__/adolescent-health';
import { pictureMismatches, repairExplainer } from './studio-check';

jest.setTimeout(120_000);

let film: ComposedScene[];
beforeAll(async () => {
  film = await composeAdolescentFilm();
});

describe('the film as made (the faults are there)', () => {
  it('flips between the HEADSSS checklist and its items as cards every half second', () => {
    const flickers = flickersOf(madeScene(ADOLESCENT_FILM.scenes[4]));
    const quick = flickers.filter((f) => f.atMs >= 32_000 && f.atMs <= 42_000);
    expect(quick.length).toBeGreaterThanOrEqual(12);
    expect(quick.some((f) => f.kind === 'flip')).toBe(true);
    expect(Math.min(...quick.map((f) => f.heldMs))).toBeLessThan(500);
  });

  it('draws three brake calipers for "Parental support", "Education" and "Positive peer influence"', () => {
    const wrong = pictureMismatches(ADOLESCENT_FILM.scenes[2].sheet);
    expect(wrong.map((w) => w.id)).toEqual(['brake1', 'brake2', 'brake3']);
    expect(
      wrong.every((w) => w.why === 'comparison' && w.with === 'brake'),
    ).toBe(true);
  });
});

describe('the film composed now', () => {
  it('holds every stage at least the hold, in every scene', () => {
    for (const { scene } of film) {
      const hold = holdMsOf(readingOf(scene));
      expect(hold).toBeGreaterThanOrEqual(HOLD_MS);
      expect(flickersOf(scene, hold)).toEqual([]);
      scene.steps.forEach((step, k) => {
        if (k)
          expect(step.atMs - scene.steps[k - 1].atMs).toBeGreaterThanOrEqual(
            hold,
          );
      });
    }
  });

  it('shows the HEADSSS history on its checklist alone, its rows pointed at, never its items again as cards', () => {
    const { scene } = film[4];
    const from = scene.steps.findIndex((s) => s.show.includes('headsss'));
    expect(from).toBeGreaterThan(0);
    for (const step of scene.steps.slice(from))
      expect(step.show).toEqual(['headsss']);
    expect(
      scene.things.some((t) =>
        /^item-(home|education|drugs|safety)/.test(t.id),
      ),
    ).toBe(false);
    const points = scene.effects.filter(
      (e) => e.target === 'headsss' && e.do === 'point',
    );
    expect(points.map((e) => e.part)).toEqual([
      'Home',
      'Education or Employment',
      'Activities',
      'Drugs',
      'Sexuality',
      'Suicide or Depression',
      'Safety',
    ]);
  });

  it('leaves out the three protective factors drawn as brakes, never sets them as cards, and every other picture agrees with its label', () => {
    const risks = film[2].scene;
    // An explainer's picture that is not what its label says is left out
    // (explainer-animation-plan §10): no brake, and no card of its name.
    for (const id of ['brake1', 'brake2', 'brake3'])
      expect(risks.things.find((t) => t.id === id)).toBeUndefined();
    expect(
      risks.things.filter(
        (t) =>
          t.kind === 'words' &&
          ['Parental support', 'Education', 'Positive peer influence'].includes(
            t.text,
          ),
      ),
    ).toEqual([]);
    // The stage keeps showing what it had.
    expect(risks.steps.some((step) => step.show.length > 0)).toBe(true);
    ADOLESCENT_FILM.scenes.forEach((one, n) => {
      const repaired = repairExplainer(one.sheet, {
        teach: null,
        stage: null,
        maths: false,
        planned: null,
      });
      expect([n, pictureMismatches(repaired)]).toEqual([n, []]);
    });
  });

  it('sets no words on words or on things, at any step of either staging, nor while the stage changes', () => {
    for (const { scene, audit } of film) {
      expect(standingOverlaps(scene, 'box')).toEqual([]);
      expect(standingOverlaps(scene, 'wide')).toEqual([]);
      expect(passingOverlaps(scene)).toEqual([]);
      const words = [...audit.box.flat(), ...audit.wide.flat()].filter((c) =>
        c.kind.startsWith('words'),
      );
      expect(words).toEqual([]);
    }
  });

  it('as it was made, laid out the same, arrivals came onto what was still going', () => {
    // The same layouts timed as the player timed them before arrivals waited for room.
    const passing = film.flatMap(({ scene }) =>
      passingOverlaps(scene, readingOf(scene), false),
    );
    expect(passing.length).toBeGreaterThan(10);
  });

  it('cuts no card or caption short: "Contraceptives", "Empowerment" and the ladder\'s caption whole', () => {
    const cards = film.flatMap(({ scene }) =>
      [...scene.stagings.wide.places, ...scene.stagings.box.places].flatMap(
        (places) =>
          Object.values(places).flatMap((at) => at.caption?.lines ?? []),
      ),
    );
    expect(cards.filter((line) => line.endsWith('…'))).toEqual([]);
  });

  it('sets the words drawn in the policy and the ladder clear of the seal and the gavel', () => {
    expect(film[5].words.policy?.map((w) => w.did)).toEqual(['moved', 'moved']);
    const top = film[5].words.ladder?.find(
      (w) => w.words === 'Confidentiality limits',
    );
    expect(top?.did).toBe('moved');
    expect(top?.over).toContain('gavel');
    for (const { words } of film)
      for (const found of Object.values(words))
        expect(found.filter((w) => w.did === 'left')).toEqual([]);
  });
});

// ── The rules on their own ──────────────────────────────────────────────

const step = (atMs: number, show: string[]): SceneStepDto => ({
  atMs,
  layout: 'row',
  show,
  arrows: [],
  enter: {},
  focus: null,
});

function scene(steps: SceneStepDto[], durationMs = 20_000): SceneDto {
  const places = steps.map((s) =>
    Object.fromEntries(
      s.show.map((id, i) => [id, { x: i * 300, y: 100, w: 200, h: 200 }]),
    ),
  );
  return {
    durationMs,
    steps,
    effects: [
      { atMs: 2100, target: 'b', part: null, do: 'pulse' },
      { atMs: 2200, target: 'a', part: 'x', do: 'point' },
    ],
    things: [],
    beats: [],
    stagings: {
      wide: {
        w: 1600,
        h: 900,
        places: structuredClone(places),
        pills: places.map(() => ({})),
      },
      box: {
        w: 1600,
        h: 900,
        places: structuredClone(places),
        pills: places.map(() => ({})),
      },
    },
  } as unknown as SceneDto;
}

describe('steadyStages: no stage quicker than the eye', () => {
  it('does not show a stage that flips straight back, nor what was done to it meanwhile', () => {
    const s = scene([
      step(0, ['a']),
      step(2000, ['b']),
      step(2450, ['a']),
      step(8000, ['c']),
    ]);
    steadyStages(s, HOLD_MS);
    expect(s.steps.map((x) => x.show)).toEqual([['a'], ['c']]);
    expect(s.stagings.wide.places).toHaveLength(2);
    expect(s.effects.map((e) => e.target)).toEqual(['a']);
  });

  it('brings a quick stage on with the next where the next only adds to it', () => {
    const s = scene([
      step(0, ['a']),
      step(3000, ['a', 'b']),
      step(3400, ['a', 'b', 'c']),
    ]);
    steadyStages(s, HOLD_MS);
    expect(s.steps.map((x) => [x.atMs, x.show])).toEqual([
      [0, ['a']],
      [3000, ['a', 'b', 'c']],
    ]);
  });

  it('puts the next change off until the stage has held, where there is room', () => {
    const s = scene([
      step(0, ['a']),
      step(3000, ['b']),
      step(3500, ['c']),
      step(9000, ['d']),
    ]);
    steadyStages(s, HOLD_MS);
    expect(s.steps.map((x) => x.atMs)).toEqual([0, 3000, 4200, 9000]);
    expect(flickersOf(s)).toEqual([]);
  });

  it('holds a young child longer', () => {
    expect(holdMsOf({ motion: 0.8 })).toBeGreaterThan(holdMsOf({ motion: 1 }));
  });
});

describe('a list said aloud', () => {
  it('keeps "Education or Employment" one item of a list that goes on', () => {
    const [list] = listsIn(
      'Then take the HEADSSS history: Home, Education or Employment, Activities, Drugs, Sexuality, Suicide or Depression, and Safety.',
    );
    expect(list.map((i) => i.text)).toEqual([
      'Home',
      'Education or Employment',
      'Activities',
      'Drugs',
      'Sexuality',
      'Suicide or Depression',
      'Safety',
    ]);
  });

  it('never starts an item with the little word it hangs from', () => {
    const [list] = listsIn(
      'Unprotected sex raises the risk of STIs, teenage pregnancy and emotional stress.',
    );
    expect(list[0].text).toBe('STIs');
  });
});

describe('pictures and their labels', () => {
  it('leaves a symbol that stands alone for its name', () => {
    expect(
      picturesAgainstLabels(
        [
          {
            id: 'lock',
            name: 'Confidentiality',
            brief:
              "A padlock icon with a keyhole, a small label 'confidentiality' below it.",
          },
        ],
        ['Assure confidentiality.'],
      ),
    ).toEqual([]);
  });

  it('finds drawings drawn alike under different labels', () => {
    const brief = (name: string) =>
      `A green shield icon with the words '${name}' under it.`;
    expect(
      picturesAgainstLabels(
        [
          { id: 'a', name: 'Sleep', brief: brief('Sleep') },
          { id: 'b', name: 'Diet', brief: brief('Diet') },
        ],
        [],
      ).map((w) => w.why),
    ).toEqual(['twin', 'twin']);
  });

  it('keeps a drawing on the board only when it is drawn as the same thing', () => {
    const drawing = (id: string, brief: string) => ({
      id,
      kind: 'drawing' as const,
      name: 'Brake',
      brief,
      motion: '',
      parts: [],
      states: [],
      shape: 'square' as const,
      sound: null,
    });
    expect(
      sameSubject(
        drawing('a', 'A brake caliper, side view'),
        drawing('b', 'A car brake caliper'),
      ),
    ).toBe(true);
    expect(
      sameSubject(
        drawing('a', 'A brake caliper, side view'),
        drawing('b', 'A parent and a teenager talking at a table'),
      ),
    ).toBe(false);
    const carry = {
      things: [drawing('brake', 'A brake caliper, side view')],
      order: ['brake'],
      cells: {},
      arrows: [],
      quiet: {},
      frame: 'whole',
    } as unknown as BoardCarry;
    const written = {
      beats: [],
      cast: [drawing('brake2', 'A parent and a teenager talking at a table')],
      steps: [],
    } as unknown as SceneScript;
    expect(keepIds(written, carry).kept).toEqual([]);
  });
});

describe('words set whole', () => {
  it('sets a long word on a card smaller, else breaks it, never cut short', () => {
    expect(captionLines('Contraceptives', 180, 52).lines[0]).toMatch(/…$/);
    const whole = wholeWords('Contraceptives', 180, 52);
    expect(whole.lines.join('').replace('-', '')).toBe('Contraceptives');
  });
});

describe('words drawn in a drawing', () => {
  it('moves words off a shape they run over, and leaves words on their plate', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <rect id="plate" x="0" y="0" width="400" height="200" fill="#F4F1EA"/>
      <circle id="seal" cx="120" cy="60" r="30" fill="#E0663A"/>
      <text x="100" y="70" font-size="24" font-family="sans-serif">Title here</text>
      <text x="200" y="170" font-size="20" font-family="sans-serif">On the plate</text>
    </svg>`;
    const root = parseDocument(svg, { xmlMode: true }).children.find(
      (n) => 'name' in n && (n as Element).name === 'svg',
    ) as Element;
    const done = await clearDrawnWords(root, [0, 0, 400, 200]);
    expect(done).toEqual([
      { words: 'Title here', did: 'moved', over: ['seal'] },
    ]);
  });
});

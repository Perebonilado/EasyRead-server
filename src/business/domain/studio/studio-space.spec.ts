/**
 * People in the room they have (studio-space-plan), on "The Star and the
 * Manger" as Richard watched it (made) and as the Studio composes it now:
 * no one walks through anyone, no face melts behind another's, baby Jesus
 * lies in the manger (an infant of the kit, not a child tipped over on
 * it), and no one stands in the manger or the stool. And the parts on
 * their own: the kit's baby, cradles, the arc a group stands in, walks
 * bent round a body, a step in that stops short, a baby in someone's arms.
 */
import type { SceneDto, ScenePlaceDto } from '../../../contracts';
import { cradleOf, isCradle } from '../scene-affordances';
import {
  INFANT_HEIGHT,
  agedFor,
  drawFigure,
  figureFrame,
  type FigureSpec,
} from '../scene-figure';
import { VIEW_RIG } from '../scene-figure-views';
import { pathPlace } from '../scene-film';
import {
  furnitureOf,
  hiddenBy,
  spreadDepth,
  standsIn,
} from '../scene-layout';
import { walkRound } from '../scene-paths';
import { figureDrawing } from '../scene-sheet';
import { spaceFaults, spaceCounts, bodiesAt } from '../scene-space';
import { spaceOut } from '../scene-spacing';
import type { GatedDrawing } from '../scene-svg';
import { babyNamed, isBaby, storySheetOf } from './studio';
import { mendSheet, repairSheet, withFound } from './studio-check';
import { stageStory } from './studio-stage';
import {
  NATIVITY_FILM,
  composeNativity,
  nativityMade,
  type ComposedNativity,
} from './__fixtures__/nativity';
import { voiced } from './__fixtures__/voiced';

jest.setTimeout(120_000);

const bible = NATIVITY_FILM.show.bible;
const made = [0, 1, 2, 3, 4].map(nativityMade);
const total = (scenes: readonly SceneDto[]) => {
  const out = { through: 0, hidden: 0, outside: 0, stand: 0 };
  for (const scene of scenes)
    for (const [kind, n] of Object.entries(spaceCounts(spaceFaults(scene))))
      out[kind as keyof typeof out] += n;
  return out;
};

let film: ComposedNativity[];
beforeAll(async () => {
  film = await composeNativity();
});

describe('the film as made (the faults are there)', () => {
  it('walks Joseph through Mary, lays Jesus out past the manger, and stands people in the manger and the stool', () => {
    expect(total(made)).toEqual({ through: 2, hidden: 1, outside: 2, stand: 6 });
    const five = spaceFaults(made[4]);
    expect(five.filter((f) => f.kind === 'outside').map((f) => f.a)).toEqual([
      'jesus',
      'jesus',
    ]);
    expect(
      five.some(
        (f) => f.kind === 'hidden' && f.a === 'joseph' && f.b === 'shepherd',
      ),
    ).toBe(true);
    expect(
      spaceFaults(made[0]).some(
        (f) => f.kind === 'through' && f.a === 'joseph' && f.b === 'mary',
      ),
    ).toBe(true);
  });
});

describe('the film composed now', () => {
  it('has no walk through anyone, no face melted behind another, no one out of the manger or in a thing', () => {
    expect(total(film.map((one) => one.scene))).toEqual({
      through: 0,
      hidden: 0,
      outside: 0,
      stand: 0,
    });
  });

  it('draws baby Jesus as the kit’s infant, a third of a grown-up tall', () => {
    const { scene } = film[4];
    const places = scene.stagings.wide.places[0];
    // Beside Mary at much her depth: about a third of her height.
    const ratio = places.jesus.h / places.mary.h;
    expect(ratio).toBeGreaterThan(0.28);
    expect(ratio).toBeLessThan(0.42);
  });

  it('lays Jesus in the manger, his head over its rim and inside its ends, its front over him', () => {
    const { scene } = film[4];
    const manger = scene.setting!.features!.find((f) => f.id === 'manger')!;
    expect(manger.rim).toBeGreaterThanOrEqual(0);
    expect(scene.steps[0].abed).toEqual({ jesus: 'manger' });
    const box = manger.at.wide;
    for (const t of [2000, 10_000, 24_000]) {
      const jesus = bodiesAt(scene, t).find((b) => b.id === 'jesus')!;
      expect(jesus.lying).not.toBeNull();
      const [hx, hy] = jesus.lying!.head;
      const [fx] = jesus.lying!.foot;
      for (const x of [hx - jesus.face.r, hx + jesus.face.r, fx]) {
        expect(x).toBeGreaterThan(box.x);
        expect(x).toBeLessThan(box.x + box.w);
      }
      // The head shows over the rim, and does not hang above it.
      const rim = box.y + box.h * manger.rim!;
      expect(hy).toBeLessThan(rim + jesus.face.r * 0.5);
      expect(hy).toBeGreaterThan(rim - jesus.face.r * 2);
    }
  });

  it('keeps the shepherd by the door he came in at, left of Mary, and every walk round who is in the way', () => {
    const { scene } = film[4];
    const [first] = scene.stagings.wide.places;
    const mid = (p: ScenePlaceDto) => p.x + p.w / 2;
    expect(mid(first.shepherd)).toBeLessThan(mid(first.mary));
    expect(mid(first.mary)).toBeLessThan(mid(first.joseph));
    // Joseph's last walk in scene 1 goes before the manger, not through it.
    const walked = film[0].scene.stagings.wide.places.some((step) =>
      Object.values(step).some((p) => p.via?.length),
    );
    expect(walked).toBe(true);
    expect(film[0].staging.join('\n')).toMatch(/Joseph walks (?:before|behind)/);
  });
});

describe('the parts', () => {
  const baby: FigureSpec = NATIVITY_FILM.show.bible.characters.find(
    (c) => c.id === 'jesus',
  )!.figure!;

  it('draws a baby when the words say one, and knows the cast’s', () => {
    expect(baby.age).toBe('child');
    expect(agedFor(baby, ['Baby Jesus']).age).toBe('infant');
    expect(agedFor(baby, ['a newborn wrapped in cloths']).age).toBe('infant');
    expect(agedFor(baby, ['Tobi', 'a boy of six']).age).toBe('child');
    expect(isBaby(bible, 'jesus')).toBe(true);
    expect(isBaby(bible, 'mary')).toBe(false);
    expect(babyNamed(bible, 'Baby Jesus')).toBe('jesus');
    expect(babyNamed(bible, 'the baby')).toBe('jesus');
    expect(babyNamed(bible, 'bread')).toBeNull();
  });

  it('stands a baby a third of a grown-up tall, arms folded in their wrap', async () => {
    const drawn = await figureDrawing(agedFor(baby, ['Baby Jesus']), 'jesus', {
      rig: VIEW_RIG,
      faceRig: true,
    });
    const adult = figureFrame('adult')[3];
    expect(drawn.stands!.units / adult).toBeCloseTo(INFANT_HEIGHT, 2);
    expect(drawFigure(agedFor(baby, ['baby']), 'x').svg).not.toMatch(
      /class="foot"[^>]*><ellipse/,
    );
  });

  it('lays one in a cradle along its hollow, below its rim', () => {
    expect(isCradle({ kind: 'drawn', name: 'wooden manger' })).toBe(true);
    expect(isCradle({ kind: 'drawn', name: 'flat rock' })).toBe(false);
    expect(isCradle({ kind: 'bed', name: 'cot bed' })).toBe(false);
    const { lies, rim } = cradleOf({
      viewBox: [-83.1, -128.8, 166.1, 132.8],
      seat: 124.8,
    });
    expect(lies.head).toBeLessThan(lies.foot);
    expect(lies.head).toBeGreaterThan(-83.1);
    expect(lies.foot).toBeLessThan(83);
    expect(rim).toBeCloseTo(0.03, 2);
  });

  it('gathers four or more in an arc, its ends nearer the camera', () => {
    const four = [0, 1, 2, 3].map((i) => spreadDepth(i, 4));
    expect(Math.min(four[0], four[3])).toBeGreaterThan(
      Math.max(four[1], four[2]),
    );
    const five = [0, 1, 2, 3, 4].map((i) => spreadDepth(i, 5));
    expect(five[2]).toBe(Math.min(...five));
  });

  it('keeps someone out of a thing on the floor, and from behind one that hides them', () => {
    const stool = furnitureOf({ x: 100, y: 600, w: 100, h: 200 }, 800, 900);
    expect(standsIn(150, 30, 800, stool)).toBe(true);
    expect(standsIn(260, 30, 800, stool)).toBe(false);
    expect(standsIn(150, 30, 700, stool)).toBe(false);
    const behind = { x: 110, y: 380, w: 80, h: 360 };
    expect(hiddenBy(behind, 740, stool)).toBeGreaterThan(0.35);
    expect(hiddenBy(behind, 820, stool)).toBe(0);
  });

  it('brings two together without passing anyone between them', () => {
    const at = spaceOut(
      [
        { id: 'a', x: 100, half: 30, d: 0.5, perM: 100, free: true },
        { id: 'b', x: 300, half: 30, d: 0.5, perM: 100, free: false },
        { id: 'c', x: 900, half: 30, d: 0.5, perM: 100, free: true },
      ],
      [{ a: 'a', b: 'c', why: 'talk' }],
      { least: 0, most: 1600 },
    );
    expect(at.get('a')!).toBeLessThan(300);
    expect(at.get('c')!).toBeGreaterThan(300);
  });

  it('bends a walk round someone standing in its way, and keeps it straight where no one is', () => {
    const place = (x: number, d = 0.5): ScenePlaceDto => ({
      x,
      y: 400,
      w: 200,
      h: 400,
      d,
    });
    const atDepth = (p: ScenePlaceDto, d: number): ScenePlaceDto => ({
      ...p,
      y: p.y - (0.5 - d) * 100,
      h: p.h * (0.8 + d * 0.4),
      d,
    });
    const steps = [
      { atMs: 0, show: ['a', 'b'] },
      { atMs: 1000, show: ['a', 'b'] },
    ];
    const places = [
      { a: place(100), b: place(700) },
      { a: place(1300), b: place(700) },
    ];
    const notes = walkRound({
      W: 1600,
      steps,
      places,
      walks: () => true,
      furniture: [],
      atDepth,
    });
    expect(notes[0]).toMatch(/a walks behind b, not through/);
    const via = places[1].a.via!;
    expect(via).toHaveLength(2);
    expect(via.every((v) => (v.d ?? 0.5) <= 0.3)).toBe(true);
    // Along it, never in b's row where b is.
    for (let p = 0; p <= 1; p += 0.02) {
      const now = pathPlace(places[0].a, places[1].a, p, 1600);
      const mid = now.x + now.w / 2;
      if (Math.abs(mid - 800) < 110)
        expect(Math.abs((now.d ?? 0.5) - 0.5)).toBeGreaterThanOrEqual(0.2);
    }
    const clear = [
      { a: place(100), b: place(700, 0.1) },
      { a: place(1300), b: place(700, 0.1) },
    ];
    expect(walkRound({ W: 1600, steps, places: clear, walks: () => true, furniture: [], atDepth })).toEqual([]);
    expect(clear[1].a.via).toBeUndefined();
  });

  it('puts a baby in the arms of whoever holds them, just before them, and carries them with them', async () => {
    const sheet = storySheetOf({
      title: 'Held',
      set: 'stable',
      onStage: [
        {
          who: 'mary',
          spot: 'centre-left',
          pose: 'standing',
          holding: 'Baby Jesus',
        },
        { who: 'jesus', spot: 'centre', pose: 'lying' },
        { who: 'joseph', spot: 'right', pose: 'standing' },
      ],
      beats: [
        { kind: 'line', who: 'mary', say: 'Look at him, Joseph.' },
        {
          kind: 'action',
          who: 'mary',
          do: 'walk',
          spot: 'centre-right',
        },
        { kind: 'line', who: 'joseph', say: 'He is so small.' },
      ],
    });
    const mended = mendSheet(repairSheet(sheet, bible), bible);
    const jesus = mended.sheet.onStage.find((p) => p.who === 'jesus')!;
    expect(jesus.on).toBe('mary');
    const shown = withFound(bible, mended.sheet.set, mended);
    const script = stageStory(mended.sheet, shown);
    expect(script.steps.find((s) => s.stage)!.stage!.at!.jesus).toBe(
      'held:mary',
    );
    const drawn = new Map<string, GatedDrawing>();
    for (const id of ['mary', 'jesus', 'joseph']) {
      const c = bible.characters.find((one) => one.id === id)!;
      const thing = script.cast.find((t) => t.id === id);
      const { anchors: _a, ...drawing } = await figureDrawing(
        agedFor(c.figure!, [c.name, c.look]),
        id,
        {
          ...(thing?.kind === 'character' && thing.pose
            ? { pose: thing.pose }
            : {}),
          rig: VIEW_RIG,
        },
      );
      void _a;
      drawn.set(id, drawing);
    }
    const { scene } = voiced(script, [], {}, {}, { stands: true, drawn });
    scene.stagings.wide.places.forEach((step) => {
      const baby = step.jesus;
      const mary = step.mary;
      expect(baby.held).toBe('mary');
      // At her chest, across her.
      const mid = mary.x + mary.w / 2;
      expect(baby.y + baby.h).toBeGreaterThan(mary.y + mary.h * 0.4);
      expect(baby.y + baby.h).toBeLessThan(mary.y + mary.h * 0.8);
      expect(Math.abs(baby.x + baby.w / 2 - mid)).toBeLessThan(mary.w * 0.5);
    });
    expect(
      spaceFaults(scene).filter((f) => f.a === 'jesus' || f.b === 'jesus'),
    ).toEqual([]);
  });
});

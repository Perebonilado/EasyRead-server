/**
 * The classroom (the crowd before the camera): the bench's Primary 4
 * classroom, drawn with two rows of pupils before the camera, and Mrs Ade
 * at the blackboard. In the scene about them she addresses the class,
 * with a close shot on her as she speaks; in one that is not, she and
 * Tobi talk by her desk. As compose decides: the rows shown only in a
 * scene about them, and only in its wide shot. Built by code, no model
 * asked.
 */
import type { SceneDto, SceneEffectDto } from '../../../../contracts';
import { PLAIN_FIGURE, drawFigure } from '../../scene-figure';
import { floorAt } from '../../scene-layout';
import { buildSet, floorOf, layoutOf } from '../../scene-set-layout';
import {
  audienceOutOfShots,
  crowdAddressed,
  withoutAudience,
} from '../../scene-set-audience';
import { SET_BENCH } from '../../set-bench';

/** The words of each scene: one about the class, one not. */
export const CLASS_BEATS = {
  addressed: [
    {
      kind: 'narration' as const,
      say: 'Mrs Ade turns to the class.',
      startMs: 400,
      endMs: 2000,
    },
    {
      kind: 'line' as const,
      say: 'Good morning, class! Today we learn about the rain.',
      startMs: 2200,
      endMs: 5600,
    },
  ],
  among: [
    {
      kind: 'line' as const,
      say: 'Tobi, have you finished your sums?',
      startMs: 400,
      endMs: 2600,
    },
    {
      kind: 'line' as const,
      say: 'Almost, Mrs Ade.',
      startMs: 2800,
      endMs: 4200,
    },
  ],
};

/** The classroom scene, about the class or not. */
export function classroomScene(about: boolean): SceneDto {
  const bench = SET_BENCH.find((one) => one.id === 'classroom')!;
  const set = buildSet(
    layoutOf(bench.layout, bench.place, bench.world),
    bench.place,
  );
  const floor = floorOf('indoor');
  const beats = about ? CLASS_BEATS.addressed : CLASS_BEATS.among;
  const addressed = crowdAddressed(beats);
  const teacher = drawFigure({ ...PLAIN_FIGURE, age: 'adult' }, 'ade');
  const tobi = drawFigure({ ...PLAIN_FIGURE, age: 'child' }, 'tobi');
  const stand = (
    middle: number,
    d: number,
    frame: [number, number, number, number],
  ) => {
    const at = floorAt(d, 844, floor.eye, 888);
    const h = frame[3] * 1.9 * at.k;
    const w = (h * frame[2]) / frame[3];
    return { x: middle - w / 2, y: at.feet - h, w, h, d };
  };
  const places = {
    ade: stand(800, 0.35, teacher.viewBox),
    ...(about ? {} : { tobi: stand(1050, 0.4, tobi.viewBox) }),
  };
  const shots: SceneEffectDto[] = [
    {
      atMs: 2200,
      untilMs: 5600,
      target: 'ade',
      part: null,
      do: 'zoom',
    },
  ];
  const rows = set.layered.fore
    .map(({ id }) => id)
    .filter((id) => id.startsWith('fg-au'));
  const layers = set.layered.layers.map((one) =>
    one.id === 'foreground' && !addressed
      ? { ...one, svg: withoutAudience(one.svg) }
      : { ...one },
  );
  const faces = (states: Record<string, string>) =>
    Object.entries(states).flatMap(([name, id]) =>
      name === 'neutral' ? [] : [id],
    );
  const drawing = (id: string, svg: string, patch: object) => ({
    id,
    kind: 'drawing',
    svg,
    aspect: 1,
    caption: null,
    parts: {},
    labels: {},
    states: {},
    hidden: [],
    moves: false,
    ...patch,
  });
  const show = ['place-classroom', 'ade', ...(about ? [] : ['tobi'])];
  return {
    version: 4,
    title: 'Primary 4',
    durationMs: 6400,
    settledMs: 6000,
    beats: beats.map((b) => ({
      text: b.say,
      startMs: b.startMs,
      endMs: b.endMs,
      words: [],
    })),
    things: [
      drawing('place-classroom', set.svg, {
        backdrop: true,
        layers,
        setWidth: set.layered.width,
        ...(set.layered.focal !== undefined
          ? { focal: set.layered.focal }
          : {}),
        floor: [floor.back, floor.front],
      }),
      drawing('ade', teacher.svg, {
        rig: true,
        aspect: teacher.viewBox[2] / teacher.viewBox[3],
        states: teacher.states,
        hidden: faces(teacher.states),
      }),
      drawing('tobi', tobi.svg, {
        rig: true,
        aspect: tobi.viewBox[2] / tobi.viewBox[3],
        states: tobi.states,
        hidden: faces(tobi.states),
      }),
    ],
    steps: [
      {
        atMs: 0,
        layout: 'free',
        show,
        arrows: [],
        enter: {},
        focus: 'ade',
        backdrop: 'place-classroom',
      },
    ],
    effects: shots,
    stagings: {
      box: { w: 1600, h: 900, places: [places], bubbles: {} },
      wide: {
        w: 1600,
        h: 900,
        places: [
          { ...places, 'place-classroom': { x: 0, y: 0, w: 1600, h: 900 } },
        ],
        bubbles: {},
      },
    },
    acting: {},
    setting: {
      full: true,
      film: true,
      ...(addressed
        ? { fades: audienceOutOfShots(rows, shots, [{ atMs: 0 }], 6400) }
        : {}),
    },
  } as unknown as SceneDto;
}

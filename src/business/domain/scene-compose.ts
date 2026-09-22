/**
 * The scene put together: the storyboard on the audio, every thing placed
 * for both stagings, and the decisions a storyboard leaves to code: how
 * each newcomer arrives, where the camera leans, what is hidden until it
 * is pointed at, and what fills a stretch where nothing would change.
 */
import type {
  SceneArrowDto,
  SceneDto,
  SceneEffectDto,
  SceneEnterName,
  ScenePlaceDto,
  SceneStepDto,
  SceneThingDto,
  SceneTiming,
} from '../../contracts';
import {
  STAGINGS,
  layoutStep,
  type LaidThing,
  type StagingName,
} from './scene-layout';
import type { SceneScript, SceneStep, SceneThing } from './scene-script';
import type { GatedDrawing } from './scene-svg';
import { anchorMs, quietGaps, spaced, type TimedBeat } from './scene-timing';

/** Effects in one step come this far apart, so each is seen. */
const EFFECT_STAGGER_MS = 180;

/** The thing as the client gets it: its drawing, or a card with its name when the drawing failed. */
export function thingDto(
  thing: SceneThing,
  drawing: GatedDrawing | null | undefined,
): SceneThingDto {
  if (thing.kind === 'stat')
    return {
      id: thing.id,
      kind: 'stat',
      value: thing.value,
      caption: thing.caption,
    };
  if (thing.kind === 'words')
    return {
      id: thing.id,
      kind: 'words',
      text: thing.text,
      style: thing.style,
    };
  if (!drawing)
    return { id: thing.id, kind: 'words', text: thing.name, style: 'card' };
  return {
    id: thing.id,
    kind: 'drawing',
    svg: drawing.svg,
    aspect: drawing.aspect,
    caption: thing.name || null,
    parts: drawing.parts,
    labels: drawing.labels,
    states: drawing.states,
    hidden: [],
    moves: drawing.moves,
  };
}

const laid = (thing: SceneThingDto): LaidThing =>
  thing.kind === 'drawing'
    ? { kind: 'drawing', aspect: thing.aspect, caption: thing.caption }
    : thing.kind === 'stat'
      ? { kind: 'stat', value: thing.value, caption: thing.caption }
      : { kind: 'words', text: thing.text, style: thing.style };

/** How a newcomer arrives: out of what an arrow brings it from, across in a row, wiped on when wide, else a pop. */
export function entranceFor(
  id: string,
  step: { layout: SceneStepDto['layout']; arrows: SceneArrowDto[] },
  before: string[],
  thing: SceneThingDto | undefined,
): { how: SceneEnterName; from?: string } {
  const source = step.arrows.find(
    (a) => a.to === id && before.includes(a.from),
  );
  if (source) return { how: 'grow', from: source.from };
  if (thing?.kind === 'words' && thing.style === 'title')
    return { how: 'fade' };
  if (step.layout === 'row') return { how: 'slide' };
  if (thing?.kind === 'drawing' && thing.aspect >= 1.6) return { how: 'wipe' };
  return { how: 'pop' };
}

export interface ComposeInput {
  script: SceneScript;
  drawings: ReadonlyMap<string, GatedDrawing | null>;
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  generator: string;
}

/**
 * The scene the player plays. Steps are timed on their phrases and kept
 * apart; effects follow their step; a stretch longer than the quiet limit
 * gets a pulse on the thing in focus; every step is placed twice.
 */
export function composeScene(input: ComposeInput): {
  scene: SceneDto;
  filled: number;
} {
  const { script, drawings, beats, durationMs } = input;
  const things = script.cast.map((thing) =>
    thingDto(thing, drawings.get(thing.id)),
  );
  const byId = new Map(things.map((thing) => [thing.id, thing]));

  // Every step on its words, in order; stage changes kept apart.
  const timed = script.steps.map((step) => ({
    step,
    atMs: anchorMs(beats, step.at.beat, step.word),
  }));
  timed.sort((a, b) => a.atMs - b.atMs);
  const stageTimes = spaced(
    timed.filter((t) => t.step.stage).map((t) => t.atMs),
    durationMs,
  );
  let k = 0;
  for (const t of timed) if (t.step.stage) t.atMs = stageTimes[k++];

  const steps: SceneStepDto[] = [];
  const effects: SceneEffectDto[] = [];
  let before: string[] = [];
  let focus: string | null = null;
  const same = (a: SceneStepDto, stage: NonNullable<SceneStep['stage']>) =>
    a.layout === stage.layout &&
    a.show.join() === stage.show.join() &&
    a.arrows
      .map((x) => x.id)
      .sort()
      .join() ===
      stage.arrows
        .map((x) => `${x.from}>${x.to}`)
        .sort()
        .join();
  for (const timedStep of timed) {
    const { atMs } = timedStep;
    let { step } = timedStep;
    // The writer restating the stage as it stands: its effects, and no change.
    if (step.stage && steps.length && same(steps[steps.length - 1], step.stage))
      step = { ...step, stage: null };
    if (step.stage) {
      const arrows: SceneArrowDto[] = step.stage.arrows.map((a) => ({
        id: `${a.from}>${a.to}`,
        from: a.from,
        to: a.to,
        label: a.label,
        flow: a.flow,
      }));
      const enter: SceneStepDto['enter'] = {};
      const newcomers = step.stage.show.filter((id) => !before.includes(id));
      for (const id of newcomers)
        enter[id] = entranceFor(
          id,
          { layout: step.stage.layout, arrows },
          before,
          byId.get(id),
        );
      const zoom = step.effects.find((e) => e.do === 'zoom')?.target;
      focus =
        newcomers[0] ??
        zoom ??
        (focus && step.stage.show.includes(focus)
          ? focus
          : step.stage.show[0]) ??
        null;
      steps.push({
        atMs: Math.round(atMs),
        layout: step.stage.layout,
        show: step.stage.show,
        arrows,
        enter,
        focus,
      });
      before = step.stage.show;
    }
    step.effects.forEach((effect, i) => {
      effects.push({
        atMs: Math.round(atMs + (step.stage ? 350 : 0) + i * EFFECT_STAGGER_MS),
        target: effect.target,
        part: effect.part,
        do: effect.do,
      });
    });
  }

  // What stays hidden until an effect shows it: a label pointed at later, and every state.
  for (const effect of effects) {
    const thing = byId.get(effect.target);
    if (thing?.kind !== 'drawing' || !effect.part) continue;
    if (effect.do === 'point') {
      const label = thing.labels[effect.part];
      if (label && !thing.hidden.includes(label)) thing.hidden.push(label);
    }
  }
  for (const thing of things)
    if (thing.kind === 'drawing')
      for (const id of Object.values(thing.states))
        if (!thing.hidden.includes(id)) thing.hidden.push(id);
  // An effect on a part the drawing does not have moves the whole drawing instead.
  for (const effect of effects) {
    const thing = byId.get(effect.target);
    if (!effect.part) continue;
    if (thing?.kind !== 'drawing') {
      effect.part = null;
      if (effect.do !== 'zoom') effect.do = 'pulse';
      continue;
    }
    const known =
      effect.do === 'show' || effect.do === 'hide'
        ? thing.states[effect.part]
        : (thing.parts[effect.part] ?? thing.labels[effect.part]);
    if (!known) {
      effect.part = null;
      effect.do = 'pulse';
    }
  }

  // The quiet stretches: a pulse on whatever holds the eye then.
  let filled = 0;
  const changes = [...steps.map((s) => s.atMs), ...effects.map((e) => e.atMs)];
  for (const [from, to] of quietGaps(changes, durationMs)) {
    const span = to - from;
    const count = Math.floor(span / 6000);
    for (let i = 1; i <= count; i += 1) {
      const at = Math.round(from + (span * i) / (count + 1));
      const current = [...steps].reverse().find((s) => s.atMs <= at);
      const target = current?.focus ?? current?.show[0];
      if (!target) continue;
      effects.push({ atMs: at, target, part: null, do: 'pulse' });
      filled += 1;
    }
  }
  effects.sort((a, b) => a.atMs - b.atMs);

  const place = (staging: StagingName) => {
    const lookup = new Map(things.map((thing) => [thing.id, laid(thing)]));
    return steps.map(
      (step) =>
        layoutStep(step.layout, step.show, lookup, staging) as Record<
          string,
          ScenePlaceDto
        >,
    );
  };

  return {
    scene: {
      version: 3,
      generator: input.generator,
      title: script.title,
      durationMs,
      timing: input.timing,
      beats: beats.map((b) => ({
        text: b.text,
        startMs: b.startMs,
        endMs: b.endMs,
        words: b.words,
      })),
      things: things.filter((thing) =>
        steps.some((s) => s.show.includes(thing.id)),
      ),
      steps,
      effects,
      stagings: {
        box: { w: STAGINGS.box.w, h: STAGINGS.box.h, places: place('box') },
        wide: { w: STAGINGS.wide.w, h: STAGINGS.wide.h, places: place('wide') },
      },
    },
    filled,
  };
}

/** The step to show on the page's card: the fullest, the later one on a tie. */
export function fullestStep(scene: SceneDto): number {
  let best = 0;
  scene.steps.forEach((step, i) => {
    if (step.show.length >= scene.steps[best].show.length) best = i;
  });
  return best;
}

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The stage colours, matching the player's. */
export const STAGE_PAINT = {
  ground: '#FBF7EF',
  ink: '#1F2A37',
  muted: '#5B6675',
  accent: '#E0663A',
  card: '#FFFFFF',
  cardEdge: '#E4DCCB',
} as const;

/**
 * One still of the page for its card, as SVG: the fullest step in the
 * box staging. Each drawing comes as a PNG already rendered on its own,
 * so no two drawings' ids or styles can meet in one document.
 */
export function thumbSvg(
  scene: SceneDto,
  pngs: ReadonlyMap<string, Buffer>,
): string {
  const staging = scene.stagings.box;
  const index = fullestStep(scene);
  const step = scene.steps[index];
  if (!step)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${staging.w} ${staging.h}"><rect width="${staging.w}" height="${staging.h}" fill="${STAGE_PAINT.ground}"/></svg>`;
  const places = staging.places[index];
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  const parts: string[] = [];
  const text = (
    x: number,
    y: number,
    size: number,
    body: string,
    weight = 600,
    fill: string = STAGE_PAINT.ink,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" font-family="Liberation Sans, sans-serif">${escape(body)}</text>`;
  const caption = (p: ScenePlaceDto, fill: string = STAGE_PAINT.ink) =>
    p.caption
      ? p.caption.lines
          .map((line, i) =>
            text(
              p.caption!.x + p.caption!.w / 2,
              p.caption!.y + p.caption!.size * (0.9 + i * 1.2),
              p.caption!.size,
              line,
              600,
              fill,
            ),
          )
          .join('')
      : '';
  for (const arrow of step.arrows) {
    const a = places[arrow.from];
    const b = places[arrow.to];
    if (!a || !b) continue;
    parts.push(
      `<line x1="${a.x + a.w / 2}" y1="${a.y + a.h / 2}" x2="${b.x + b.w / 2}" y2="${b.y + b.h / 2}" stroke="${STAGE_PAINT.muted}" stroke-width="6" stroke-linecap="round" stroke-dasharray="18 14"/>`,
    );
  }
  for (const id of step.show) {
    const thing = byId.get(id);
    const p = places[id];
    if (!thing || !p) continue;
    if (thing.kind === 'drawing') {
      const png = pngs.get(id);
      if (png)
        parts.push(
          `<image x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" href="data:image/png;base64,${png.toString('base64')}"/>`,
        );
      parts.push(caption(p));
    } else if (thing.kind === 'stat') {
      parts.push(
        text(
          p.x + p.w / 2,
          p.y + (p.size ?? 80) * 0.9,
          p.size ?? 80,
          thing.value,
          700,
          STAGE_PAINT.accent,
        ),
      );
      parts.push(caption(p, STAGE_PAINT.muted));
    } else {
      if (thing.style !== 'title')
        parts.push(
          `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${Math.min(p.h / 2, 28)}" fill="${STAGE_PAINT.card}" stroke="${STAGE_PAINT.cardEdge}" stroke-width="3"/>`,
        );
      parts.push(caption(p));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${staging.w} ${staging.h}"><rect width="${staging.w}" height="${staging.h}" fill="${STAGE_PAINT.ground}"/>${parts.join('')}</svg>`;
}

/** The step as one line for the log: when, what layout, what is on it. */
export function describeStep(step: SceneStep, index: number): string {
  return `${index + 1}. [${step.at.beat + 1}:${step.word}] "${step.at.phrase}" ${step.stage ? `${step.stage.layout}(${step.stage.show.join(', ')})` : ''}${step.effects.length ? ` ${step.effects.map((e) => `${e.do} ${e.target}${e.part ? `.${e.part}` : ''}`).join(', ')}` : ''}`;
}

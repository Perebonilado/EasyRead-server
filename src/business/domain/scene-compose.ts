/**
 * The scene put together: the storyboard on the audio, every thing placed
 * for both stagings, and the decisions a storyboard leaves to code: how
 * each newcomer arrives, where the camera leans, what is hidden until it
 * is pointed at, and what fills a stretch where nothing would change.
 */
import type {
  SceneArrowDto,
  SceneBubbleDto,
  SceneDto,
  SceneEffectDto,
  SceneEnterName,
  ScenePillDto,
  ScenePlaceDto,
  SceneStepDto,
  SceneThingDto,
  SceneTiming,
} from '../../contracts';
import type { Callout, InkField } from './scene-callouts';
import { measureText } from './scene-font';
import {
  auditStep,
  arrowPath,
  pillBox,
  placeBubble,
  placeLabels,
  placePill,
  segmentsOf,
  type Collision,
  type Ink,
  type Words,
} from './scene-labels';
import {
  STAGINGS,
  extentOf,
  layoutStep,
  type LaidThing,
  type Place,
  type Rect,
  type StagingName,
} from './scene-layout';
import {
  isCodeThing,
  quotedSpans,
  type SceneScript,
  type SceneStep,
  type SceneThing,
} from './scene-script';
import { EXPRESSIONS } from './scene-story';
import type { GatedDrawing } from './scene-svg';
import { anchorMs, quietGaps, spaced, type TimedBeat } from './scene-timing';

/** How strongly the scene behind the stage shows on its paper: enough to be there, faint enough to read over. */
export const BACKDROP_OPACITY = 0.5;

/** Effects in one step come this far apart, so each is seen. */
const EFFECT_STAGGER_MS = 180;
/** How long a speech bubble stays after the voice has said its words. */
const SAY_AFTER_MS = 700;

/** The most a bubble holds, in characters: a line or two, read at a glance. */
const SAY_CHARS = 80;

/**
 * What a character says in a sentence: the words it quotes, as the voice
 * says them, or of a speech the sentences that start it, as many as a
 * bubble holds at a glance. Null for a sentence that quotes no one: then
 * there is nothing for a bubble to hold.
 */
export function spokenIn(sentence: string): string | null {
  const quoted = quotedSpans(sentence).map(([start, end]) =>
    sentence.slice(start, end).replace(/[,;:]$/, ''),
  );
  if (!quoted.length) return null;
  const said = quoted.join(' … ');
  if (said.length <= SAY_CHARS) return said;
  // A speech: its first sentences, as many as fit, the first always.
  const sentences = said.split(/(?<=[.!?…])\s+/);
  let kept = sentences[0];
  for (const next of sentences.slice(1)) {
    if (kept.length + 1 + next.length > SAY_CHARS) break;
    kept = `${kept} ${next}`;
  }
  if (kept.length <= SAY_CHARS * 1.5) return kept;
  const cut = kept.slice(0, SAY_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}

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
  // What a thing drawn by code is called on a card, if it could not be drawn.
  const called =
    thing.name ||
    (
      {
        math: 'Working',
        plot: 'Graph',
        quote: 'Quotation',
        timeline: 'Timeline',
        chart: 'Chart',
      } as Record<string, string>
    )[thing.kind] ||
    thing.id;
  if (!drawing)
    return { id: thing.id, kind: 'words', text: called, style: 'card' };
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
    ambience:
      thing.kind === 'drawing' || thing.kind === 'place' ? thing.sound : null,
    ...(isCodeThing(thing) ? { source: thing.kind } : {}),
    // A place is the scene behind the stage, never in a slot, and uncaptioned.
    ...(thing.kind === 'place'
      ? { backdrop: true as const, caption: null }
      : {}),
    ...(drawing.callouts.length
      ? {
          callouts: Object.fromEntries(
            drawing.callouts.map((c) => [c.part, c.text]),
          ),
          calloutsLater: [],
        }
      : {}),
  };
}

/** What code knows of a drawing that the player never needs: where its labels point, where its ink is. */
interface Geometry {
  callouts: Callout[];
  viewBox: [number, number, number, number];
  field: InkField | null;
  /** A passage's words: their size, which its notes are never set above. */
  words?: { size: number };
  /** A character's head: where their bubbles point. */
  head?: [number, number];
}

const laid = (thing: SceneThingDto, geometry?: Geometry): LaidThing =>
  thing.kind === 'drawing'
    ? {
        kind: 'drawing',
        aspect: thing.aspect,
        caption: thing.caption,
        ...(thing.source ? { source: thing.source } : {}),
        ...(geometry?.callouts.length
          ? { callouts: geometry.callouts, viewBox: geometry.viewBox }
          : {}),
        ...(geometry?.words ? { words: geometry.words } : {}),
      }
    : thing.kind === 'stat'
      ? { kind: 'stat', value: thing.value, caption: thing.caption }
      : { kind: 'words', text: thing.text, style: thing.style };

/**
 * Working, a graph or a passage beside pictures takes the main slot: on
 * such a page they are what is read, and set a third of the stage wide
 * they cannot be. One goes large in a focus with the rest beside it; two
 * or more stand in a column.
 */
export function wordsFirst(
  stage: { layout: SceneStepDto['layout']; show: string[] },
  things: ReadonlyMap<string, SceneThingDto>,
): { layout: SceneStepDto['layout']; show: string[] } {
  const coded = (id: string) => {
    const thing = things.get(id);
    return thing?.kind === 'drawing' && Boolean(thing.source);
  };
  const main = stage.show.filter(coded);
  if (!main.length || stage.show.length === 1 || stage.layout === 'stack')
    return stage;
  const rest = stage.show.filter((id) => !coded(id));
  if (main.length === 1 && rest.length <= 3)
    return { layout: 'focus', show: [...main, ...rest] };
  return { layout: 'stack', show: [...main, ...rest].slice(0, 4) };
}

/**
 * Characters stand the same way round every time: in a row, whoever the
 * book met first stands on the left, so any two who meet again stand as
 * they stood before and never swap across the stage. Only the characters
 * trade places; everything else keeps the writer's order.
 */
export function sidesKept(
  stage: { layout: SceneStepDto['layout']; show: string[] },
  cast: ReadonlyMap<string, SceneThing>,
): { layout: SceneStepDto['layout']; show: string[] } {
  if (stage.layout !== 'row' && stage.layout !== 'compare') return stage;
  const people = stage.show
    .map((id, at) => ({ id, at, thing: cast.get(id) }))
    .filter((one) => one.thing?.kind === 'character');
  if (people.length < 2) return stage;
  const met = (thing: SceneThing | undefined) =>
    thing?.kind === 'character' ? thing.met : 0;
  const leftFirst = [...people].sort(
    (a, b) => met(a.thing) - met(b.thing) || a.at - b.at,
  );
  const show = [...stage.show];
  people.forEach((one, k) => {
    show[one.at] = leftFirst[k].id;
  });
  return { layout: stage.layout, show };
}

/** How long before a character comes on their first face is put on: the player fades a state in over 320ms. */
const FACE_EARLY_MS = 400;

/**
 * A character wears one face at a time: a face shown takes the place of
 * the one before it, and a face hidden leaves them calm again, never with
 * none. Every face is hidden until shown, so the first, the one they come
 * on with, is shown just before they do: seen, not heard.
 */
export function oneFaceAtATime(
  effects: SceneEffectDto[],
  cast: readonly SceneThing[],
  steps: readonly SceneStepDto[],
  /** Whether they were drawn: one set as a card has no faces. */
  drawn: (id: string) => boolean = () => true,
): SceneEffectDto[] {
  const faces = new Set<string>(EXPRESSIONS);
  const characters = new Map(
    cast.flatMap((thing) =>
      thing.kind === 'character' && drawn(thing.id)
        ? [[thing.id, thing] as const]
        : [],
    ),
  );
  const isFace = (effect: SceneEffectDto) =>
    characters.has(effect.target) &&
    Boolean(effect.part && faces.has(effect.part)) &&
    (effect.do === 'show' || effect.do === 'hide');
  const out = effects.filter((effect) => !isFace(effect));
  for (const [id, character] of characters) {
    const enters = steps.find((step) => step.show.includes(id));
    if (!enters) continue;
    let wearing: string = character.state ?? 'neutral';
    out.push({
      atMs: Math.max(0, enters.atMs - FACE_EARLY_MS),
      target: id,
      part: wearing,
      do: 'show',
      filler: true,
    });
    const asked = effects
      .filter((effect) => effect.target === id && isFace(effect))
      .sort((a, b) => a.atMs - b.atMs);
    for (const effect of asked) {
      const next =
        effect.do === 'show'
          ? effect.part!
          : effect.part === wearing
            ? 'neutral'
            : wearing;
      if (next === wearing) continue;
      out.push(
        { atMs: effect.atMs, target: id, part: wearing, do: 'hide' },
        { atMs: effect.atMs, target: id, part: next, do: 'show' },
      );
      wearing = next;
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Whether words only say what a thing on the stage already says: its caption, its number's caption, its words. */
function repeats(words: string, thing: SceneThingDto | undefined): boolean {
  if (!thing) return false;
  const said =
    thing.kind === 'drawing'
      ? thing.caption
      : thing.kind === 'stat'
        ? thing.caption
        : thing.text;
  const key = (text: string | null) =>
    (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Boolean(key(said)) && key(said) === key(words);
}

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
  /** What the frame audit found wrong, per staging, per step. */
  audit: Record<StagingName, Collision[][]>;
} {
  const { script, drawings, beats, durationMs } = input;
  const things = script.cast.map((thing) =>
    thingDto(thing, drawings.get(thing.id)),
  );
  const byId = new Map(things.map((thing) => [thing.id, thing]));
  const castById = new Map(script.cast.map((thing) => [thing.id, thing]));

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
  let saying = 1;
  let before: string[] = [];
  let focus: string | null = null;
  // The scene behind the stage: the page's own place from the start, and
  // each place the writer shows from its step on, when it was painted.
  const painted = (id: string | null | undefined) =>
    id && byId.get(id)?.kind === 'drawing' ? id : null;
  let backdrop = painted(script.backdrop);
  const same = (a: SceneStepDto, stage: NonNullable<SceneStep['stage']>) =>
    (a.backdrop ?? null) === (painted(stage.backdrop) ?? backdrop) &&
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
    if (step.stage)
      step = {
        ...step,
        stage: {
          ...step.stage,
          ...sidesKept(wordsFirst(step.stage, byId), castById),
        },
      };
    // The writer restating the stage as it stands: its effects, and no change.
    if (step.stage && steps.length && same(steps[steps.length - 1], step.stage))
      step = { ...step, stage: null };
    if (step.stage) {
      const arrows: SceneArrowDto[] = step.stage.arrows.map((a) => ({
        id: `${a.from}>${a.to}`,
        from: a.from,
        to: a.to,
        // A label that only says what an end already says is noise.
        label:
          a.label &&
          [a.from, a.to].some((id) => repeats(a.label!, byId.get(id)))
            ? null
            : a.label,
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
      backdrop = painted(step.stage.backdrop) ?? backdrop;
      steps.push({
        atMs: Math.round(atMs),
        layout: step.stage.layout,
        show: step.stage.show,
        arrows,
        enter,
        focus,
        ...(backdrop ? { backdrop } : {}),
      });
      before = step.stage.show;
    }
    step.effects.forEach((effect, i) => {
      const at = Math.round(
        atMs + (step.stage ? 350 : 0) + i * EFFECT_STAGGER_MS,
      );
      // A character's words, from the sentence that quotes them, held
      // until the voice has said the sentence.
      const said =
        effect.do === 'say'
          ? spokenIn(script.beats[step.at.beat]?.say ?? '')
          : null;
      if (effect.do === 'say') {
        effects.push(
          said
            ? {
                atMs: at,
                target: effect.target,
                part: null,
                do: 'say',
                say: {
                  id: `say-${saying++}`,
                  text: said,
                  untilMs: Math.round(
                    (beats[step.at.beat]?.endMs ?? at) + SAY_AFTER_MS,
                  ),
                },
              }
            : { atMs: at, target: effect.target, part: null, do: 'pulse' },
        );
        return;
      }
      effects.push({
        atMs: at,
        target: effect.target,
        part: effect.part,
        do: effect.do,
      });
    });
  }

  effects.splice(
    0,
    effects.length,
    ...oneFaceAtATime(
      effects,
      script.cast,
      steps,
      (id) => byId.get(id)?.kind === 'drawing',
    ),
  );
  // A bubble belongs to the stage it is said on and to its sentence: it
  // goes at the next change of stage, or when someone speaks after it.
  const says = effects.filter((effect) => effect.say);
  says.forEach((effect, i) => {
    const nextStage = steps.find((step) => step.atMs > effect.atMs)?.atMs;
    effect.say!.untilMs = Math.min(
      effect.say!.untilMs,
      nextStage ?? durationMs,
      says[i + 1]?.atMs ?? durationMs,
      durationMs,
    );
  });
  /** The step a moment falls in. */
  const stepOf = (t: number) => {
    let k = -1;
    steps.forEach((step, i) => {
      if (step.atMs <= t) k = i;
    });
    return k;
  };

  // Working grows as the voice works it: a line the writer never showed
  // appears after the line before it, spread through its time on stage.
  for (const thing of things) {
    if (thing.kind !== 'drawing' || thing.source !== 'math') continue;
    const lines = Object.keys(thing.states)
      .map((name) => ({ name, k: Number(/\d+/.exec(name)?.[0] ?? 0) }))
      .sort((a, b) => a.k - b.k);
    const first = steps.findIndex((step) => step.show.includes(thing.id));
    if (first < 0 || !lines.length) continue;
    const leaves = steps.findIndex(
      (step, i) => i > first && !step.show.includes(thing.id),
    );
    const end = leaves < 0 ? durationMs : steps[leaves].atMs;
    let last = steps[first].atMs + 300;
    lines.forEach(({ name }, i) => {
      const shown = effects.find(
        (e) => e.target === thing.id && e.part === name && e.do === 'show',
      );
      if (shown) {
        last = shown.atMs;
        return;
      }
      const left = lines.length - i + 1;
      last = Math.round(
        Math.min(
          end - 200,
          last + Math.min(3200, Math.max(1200, (end - last) / left)),
        ),
      );
      effects.push({ atMs: last, target: thing.id, part: name, do: 'show' });
    });
  }

  // What stays hidden until an effect shows it: a label pointed at later, and every state.
  for (const effect of effects) {
    const thing = byId.get(effect.target);
    if (thing?.kind !== 'drawing' || !effect.part) continue;
    if (effect.do === 'point') {
      const label = thing.labels[effect.part];
      if (label && !thing.hidden.includes(label)) thing.hidden.push(label);
      // A label the stage sets waits for its point the same way.
      if (
        thing.callouts?.[effect.part] !== undefined &&
        !thing.calloutsLater?.includes(effect.part)
      )
        thing.calloutsLater?.push(effect.part);
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
        : (thing.parts[effect.part] ??
          thing.labels[effect.part] ??
          thing.callouts?.[effect.part]);
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
      effects.push({
        atMs: at,
        target,
        part: null,
        do: 'pulse',
        filler: true,
      });
      filled += 1;
    }
  }
  effects.sort((a, b) => a.atMs - b.atMs);

  const geometry = new Map<string, Geometry>();
  for (const thing of script.cast) {
    const drawing = drawings.get(thing.id);
    if (thing.kind !== 'stat' && thing.kind !== 'words' && drawing)
      geometry.set(thing.id, {
        callouts: drawing.callouts,
        viewBox: drawing.viewBox,
        field: drawing.field,
        ...(drawing.words ? { words: drawing.words } : {}),
        ...(drawing.head ? { head: drawing.head } : {}),
      });
  }
  const introduced = new Set(
    script.cast.flatMap((thing) =>
      thing.kind === 'character' && thing.intro.length ? [thing.id] : [],
    ),
  );
  const place = (staging: StagingName) => {
    const lookup = new Map(
      things.map((thing) => [thing.id, laid(thing, geometry.get(thing.id))]),
    );
    // What a character is like is set beside them only while they have the
    // room for it: with at most one other thing on the stage. In a crowd
    // they stand without it, and give up no room to it.
    const crowd = new Map(lookup);
    for (const id of introduced) {
      const thing = lookup.get(id);
      if (thing?.kind === 'drawing')
        crowd.set(id, {
          kind: 'drawing',
          aspect: thing.aspect,
          caption: thing.caption,
        });
    }
    const stage = STAGINGS[staging];
    const places: Record<string, ScenePlaceDto>[] = [];
    const pills: Record<string, ScenePillDto | null>[] = [];
    const bubbles: Record<string, SceneBubbleDto | null> = {};
    const audit: Collision[][] = [];
    for (const [k, step] of steps.entries()) {
      const crowded = step.show.length > 2;
      const laidOut = layoutStep(
        step.layout,
        step.show,
        crowded ? crowd : lookup,
        staging,
      );
      const arrows = step.arrows.flatMap((arrow) => {
        const a = laidOut[arrow.from];
        const b = laidOut[arrow.to];
        return a && b
          ? [{ arrow, path: arrowPath(a, b, step.layout === 'cycle', stage) }]
          : [];
      });
      // What an arrow's label must keep off: every run of words, a
      // drawing's ink (not the empty corners of its box), and anything
      // whose ink is not known, whole.
      const inks = inksOf(laidOut, geometry);
      const inked = new Set(inks.map((ink) => ink.owner));
      const solid = [
        ...wordsOf(laidOut, byId, {}, []).map((w) => w.box),
        ...inks.flatMap((ink) => ink.boxes),
        ...Object.entries(laidOut)
          .filter(([id]) => byId.get(id)?.kind === 'drawing' && !inked.has(id))
          .map(([, at]) => extentOf(at)),
      ];
      // Each arrow's label on its arrow, clear of the things and of one another.
      const stepPills: Record<string, ScenePillDto | null> = {};
      const pillBoxes: Rect[] = [];
      for (const { arrow, path } of arrows) {
        if (!arrow.label) continue;
        const pill = placePill({
          label: arrow.label,
          path,
          avoid: {
            boxes: [...solid, ...pillBoxes],
            segments: arrows
              .filter((other) => other.arrow.id !== arrow.id)
              .flatMap((other) => segmentsOf(other.path)),
          },
          stage,
        });
        stepPills[arrow.id] = pill;
        if (pill) pillBoxes.push(pillBox(path, pill));
      }
      // Each drawing's labels beside it, clear of the arrows and their labels.
      const segments = arrows.flatMap((one) => segmentsOf(one.path));
      for (const id of step.show) {
        const found = geometry.get(id);
        const at = laidOut[id];
        if (!found?.callouts.length || !at?.room) continue;
        if (crowded && introduced.has(id)) continue;
        const labels = placeLabels({
          place: at,
          room: at.room,
          viewBox: found.viewBox,
          callouts: found.callouts,
          avoid: { boxes: pillBoxes, segments },
        });
        // What someone is like, cut short, is better not said at all.
        if (
          introduced.has(id) &&
          labels.some((label) => label.lines.some((l) => l.endsWith('…')))
        )
          continue;
        at.labels = labels;
      }
      // What each character says at this step, in a bubble by their head,
      // clear of every word, ink and arrow; audited as words like the rest.
      const spoken: Words[] = [];
      for (const effect of says) {
        if (stepOf(effect.atMs) !== k) continue;
        const at = laidOut[effect.target];
        const found = geometry.get(effect.target);
        let bubble: SceneBubbleDto | null = null;
        if (at && found?.head) {
          const s = at.w / found.viewBox[2];
          bubble = placeBubble({
            text: effect.say!.text,
            head: [
              at.x + (found.head[0] - found.viewBox[0]) * s,
              at.y + (found.head[1] - found.viewBox[1]) * s,
            ],
            body: at,
            stage,
            avoid: {
              boxes: [
                ...solid,
                ...pillBoxes,
                ...wordsOf(laidOut, byId, stepPills, arrows).map((w) => w.box),
              ],
              segments,
            },
          });
        }
        bubbles[effect.say!.id] = bubble;
        if (bubble)
          spoken.push({
            owner: `${effect.target}:say`,
            what: effect.say!.id,
            box: bubble,
          });
      }
      const seen = {
        inks,
        arrows: arrows.map((one) => ({
          id: one.arrow.id,
          segments: segmentsOf(one.path),
        })),
        stage,
      };
      const standing = wordsOf(laidOut, byId, stepPills, arrows);
      const found = auditStep({ words: standing, ...seen });
      // A bubble is on the stage with everything else, but never with the
      // bubble before it: each is checked against the step alone.
      for (const bubble of spoken) {
        const key = `${bubble.owner}:${bubble.what}`;
        found.push(
          ...auditStep({ words: [...standing, bubble], ...seen }).filter(
            (one) => one.a === key || one.b === key,
          ),
        );
      }
      audit.push(found);
      places.push(
        Object.fromEntries(
          Object.entries(laidOut).map(([id, at]) => {
            // The room is code's own business: the player gets the place without it.
            const { room, labelsAt, labelSize, ...seen } = at;
            void room;
            void labelsAt;
            void labelSize;
            return [id, seen];
          }),
        ),
      );
      pills.push(stepPills);
    }
    return { places, pills, bubbles, audit };
  };
  const box = place('box');
  const wide = place('wide');

  return {
    scene: {
      version: 4,
      generator: input.generator,
      title: script.title,
      durationMs,
      timing: input.timing,
      sound: { mood: script.mood },
      beats: beats.map((b) => ({
        text: b.text,
        startMs: b.startMs,
        endMs: b.endMs,
        words: b.words,
      })),
      things: things.filter((thing) =>
        steps.some((s) => s.show.includes(thing.id) || s.backdrop === thing.id),
      ),
      steps,
      effects,
      stagings: {
        box: {
          w: STAGINGS.box.w,
          h: STAGINGS.box.h,
          places: box.places,
          pills: box.pills,
          ...(says.length ? { bubbles: box.bubbles } : {}),
        },
        wide: {
          w: STAGINGS.wide.w,
          h: STAGINGS.wide.h,
          places: wide.places,
          pills: wide.pills,
          ...(says.length ? { bubbles: wide.bubbles } : {}),
        },
      },
    },
    filled,
    audit: { box: box.audit, wide: wide.audit },
  };
}

/** Where a run of words sits: its measured width, centred where it is set. */
function textBox(
  lines: string[],
  size: number,
  centreX: number,
  top: number,
  weight: 600 | 700 = 600,
  /** A line's height, in sizes: a number alone, with nothing below its baseline, is shorter than words. */
  line = 1.2,
): Rect {
  const w = Math.max(0, ...lines.map((l) => measureText(l, size, weight)));
  return { x: centreX - w / 2, y: top, w, h: lines.length * size * line };
}

/** Every run of words on the stage at one step, with whose it is. */
function wordsOf(
  places: Record<string, Place>,
  things: ReadonlyMap<string, SceneThingDto>,
  pills: Record<string, ScenePillDto | null>,
  arrows: { arrow: SceneArrowDto; path: [number, number][] }[],
): Words[] {
  const out: Words[] = [];
  for (const [id, at] of Object.entries(places)) {
    const thing = things.get(id);
    const c = at.caption;
    if (thing?.kind === 'words') {
      out.push({ owner: id, what: 'words', box: at });
      continue;
    }
    if (thing?.kind === 'stat')
      out.push({
        owner: id,
        what: 'value',
        // As the layout keeps room for it: its figures and no more.
        box: textBox(
          [thing.value],
          at.size ?? 80,
          at.x + at.w / 2,
          at.y,
          700,
          1.1,
        ),
      });
    if (c)
      out.push({
        owner: id,
        what: 'caption',
        box: textBox(c.lines, c.size, c.x + c.w / 2, c.y),
      });
    for (const label of at.labels ?? [])
      out.push({ owner: id, what: `label ${label.part}`, box: label });
  }
  for (const { arrow, path } of arrows) {
    const pill = pills[arrow.id];
    if (pill)
      out.push({ owner: arrow.id, what: 'pill', box: pillBox(path, pill) });
  }
  return out;
}

/** Where each drawing on the stage has ink at one step: its ink map's filled cells, run by run. */
function inksOf(
  places: Record<string, Place>,
  geometry: ReadonlyMap<string, Geometry>,
): Ink[] {
  const out: Ink[] = [];
  for (const [id, at] of Object.entries(places)) {
    const found = geometry.get(id);
    const field = found?.field;
    if (!found || !field) continue;
    const [vx, vy, vw] = found.viewBox;
    const s = at.w / vw;
    const [fx, fy, fw, fh] = field.viewBox;
    const { cols, rows, bits } = field.map;
    const cw = fw / cols;
    const ch = fh / rows;
    const boxes: Rect[] = [];
    for (let row = 0; row < rows; row += 1) {
      let start = -1;
      for (let col = 0; col <= cols; col += 1) {
        const inked = col < cols && bits[row * cols + col] === '1';
        if (inked && start < 0) start = col;
        if (!inked && start >= 0) {
          boxes.push({
            x: at.x + (fx + start * cw - vx) * s,
            y: at.y + (fy + row * ch - vy) * s,
            w: (col - start) * cw * s,
            h: ch * s,
          });
          start = -1;
        }
      }
    }
    out.push({ owner: id, boxes });
  }
  return out;
}

/**
 * A drawing's groups still hidden at `t`: every one hidden at the start
 * but the states shown by then and not hidden again, and the labels
 * pointed at. What a still of that moment shows, a character's face
 * included.
 */
export function hiddenAt(
  scene: SceneDto,
  thing: Extract<SceneThingDto, { kind: 'drawing' }>,
  t: number,
): string[] {
  const hidden = new Set(thing.hidden);
  const mine = scene.effects
    .filter((e) => e.target === thing.id && e.part && e.atMs <= t)
    .sort((a, b) => a.atMs - b.atMs);
  for (const effect of mine) {
    const state = thing.states[effect.part!];
    const label = thing.labels[effect.part!];
    if (effect.do === 'show' && state) hidden.delete(state);
    if (effect.do === 'hide' && state) hidden.add(state);
    if (effect.do === 'point' && label) hidden.delete(label);
  }
  return [...hidden];
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
  return stepSvg(scene, pngs, 'box', fullestStep(scene));
}

/**
 * One step of a staging as a still: its drawings from their PNGs, their
 * captions and the labels shown by then, the numbers and the words, and
 * the arrows as dashes. The card's still, and the bench's contact sheet.
 */
export function stepSvg(
  scene: SceneDto,
  pngs: ReadonlyMap<string, Buffer>,
  stagingName: StagingName,
  index: number,
): string {
  const staging = scene.stagings[stagingName];
  const step = scene.steps[index];
  if (!step)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${staging.w} ${staging.h}"><rect width="${staging.w}" height="${staging.h}" fill="${STAGE_PAINT.ground}"/></svg>`;
  const places = staging.places[index];
  const byId = new Map(scene.things.map((t) => [t.id, t]));
  const parts: string[] = [];
  // The scene behind the stage, covering it, faded as the player fades it.
  const scenery = step.backdrop ? pngs.get(step.backdrop) : undefined;
  if (scenery)
    parts.push(
      `<image x="0" y="0" width="${staging.w}" height="${staging.h}" preserveAspectRatio="xMidYMid slice" opacity="${BACKDROP_OPACITY}" href="data:image/png;base64,${scenery.toString('base64')}"/>`,
    );
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
      // Its labels as the stage sets them, those shown by this step.
      const until = scene.steps[index + 1]?.atMs ?? scene.durationMs;
      for (const label of p.labels ?? []) {
        const later = thing.calloutsLater?.includes(label.part);
        const pointed = scene.effects.some(
          (e) =>
            e.target === id &&
            e.part === label.part &&
            e.do === 'point' &&
            e.atMs < until,
        );
        if (later && !pointed) continue;
        if (label.leader) {
          const [x1, y1, x2, y2] = label.leader;
          parts.push(
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STAGE_PAINT.muted}" stroke-width="3" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="5" fill="${STAGE_PAINT.muted}"/>`,
          );
        }
        label.lines.forEach((line, i) =>
          parts.push(
            `<text x="${label.align === 'end' ? label.x + label.w : label.align === 'middle' ? label.x + label.w / 2 : label.x}" y="${label.y + label.size * (0.9 + i * 1.2)}" font-size="${label.size}" font-weight="600" fill="${STAGE_PAINT.ink}" text-anchor="${label.align}" font-family="Liberation Sans, sans-serif">${escape(line)}</text>`,
          ),
        );
      }
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

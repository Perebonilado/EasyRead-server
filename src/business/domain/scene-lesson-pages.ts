/**
 * A tall lesson paged by code (studio-vertical-plan §4.3): a phone's
 * screen holds at most three things at once (ON_STAGE_MOST), so a step
 * showing more is split, with no writer asked.
 *
 *  - A build going on (what is on the stage, and a few more): the newest
 *    kept, the ones there longest gone, as a phone's feed scrolls on; a
 *    hub keeps its centre.
 *  - Too many at once: pages of the step's things, in their order, each
 *    on a later word of the same sentence (up to the next change of the
 *    stage), what was there leaving as the next page comes up (`page`).
 *  - The same things again, straight after: the page on the stage stays.
 *
 * A 2 × 2 of drawings alone may hold four (TALL_GRID_MOST). A story's
 * page (its people at their stations) and a build's board (which pages
 * itself, scene-board) are left as they are.
 */
import { ON_STAGE_MOST, TALL_GRID_MOST } from './scene-lesson-shape';
import {
  wordsOf,
  type SceneScript,
  type SceneStage,
  type SceneStep,
} from './scene-script';

/** The most a stage of a tall lesson holds: three, or four drawings in a 2 × 2. */
export function tallMost(
  stage: Pick<SceneStage, 'layout' | 'show'>,
  kinds: ReadonlyMap<string, string>,
): number {
  const grid = stage.layout === 'grid' || stage.layout === 'row';
  return grid &&
    stage.show.length === TALL_GRID_MOST &&
    stage.show.every((id) => kinds.get(id) === 'drawing')
    ? TALL_GRID_MOST
    : ON_STAGE_MOST.tall;
}

/** Pages of at most `most`, as even as they can be: five as three and two, four as two and two. */
export function pagesOf<T>(items: readonly T[], most: number): T[][] {
  const count = Math.ceil(items.length / most);
  const out: T[][] = [];
  let at = 0;
  for (let k = 0; k < count; k += 1) {
    const size = Math.ceil((items.length - at) / (count - k));
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}

/** A stage with only these of its things, its arrows between them. */
function onlyThese(
  stage: SceneStage,
  show: string[],
  layout: SceneStage['layout'],
  page: boolean,
): SceneStage {
  const { page: _was, ...rest } = stage;
  void _was;
  return {
    ...rest,
    layout,
    show,
    arrows: stage.arrows.filter(
      (a) => show.includes(a.from) && show.includes(a.to),
    ),
    ...(page ? { page: true as const } : {}),
  };
}

/** The layout a page of a step is laid out in: the step's own where it still fits, else a column. */
function pageLayout(
  layout: SceneStage['layout'],
  count: number,
): SceneStage['layout'] {
  if (count <= 1) return 'one';
  if (layout === 'compare') return count === 2 ? 'compare' : 'row';
  if (layout === 'cycle') return count >= 3 ? 'cycle' : 'row';
  return layout;
}

/** An effect is a page's when it is on one of the page's things (or on nothing on the stage). */
const effectsFor = (
  step: SceneStep,
  page: readonly string[],
  all: readonly string[],
) =>
  step.effects.filter(
    (e) => page.includes(e.target) || !all.includes(e.target),
  );

/**
 * A tall lesson's script with no stage of more than its screen holds:
 * the steps paged as the module says. A script with none too full is
 * given back as it was.
 */
export function pagedForTall(script: SceneScript): SceneScript {
  const story =
    script.stations === true ||
    Boolean(script.board) ||
    script.cast.some(
      (thing) => thing.kind === 'character' || thing.kind === 'place',
    );
  if (story) return script;
  const kinds = new Map(script.cast.map((thing) => [thing.id, thing.kind]));
  const full = (step: SceneStep) =>
    Boolean(step.stage) &&
    step.stage!.show.length > tallMost(step.stage!, kinds);
  if (!script.steps.some(full)) return script;
  const out: SceneStep[] = [];
  /** What the stage shows now, as paged; and the whole step it is a page of. */
  let onStage: string[] = [];
  let whole: string | null = null;
  script.steps.forEach((step, i) => {
    const stage = step.stage;
    if (!stage || !full(step)) {
      out.push(step);
      if (stage) {
        onStage = stage.show;
        whole = null;
      }
      return;
    }
    const most = tallMost(stage, kinds);
    const show = stage.show;
    // The same things again: the page on the stage stays, with any arrows new between them.
    if (whole === show.join()) {
      out.push({
        ...step,
        stage: onlyThese(
          stage,
          onStage,
          pageLayout(stage.layout, onStage.length),
          false,
        ),
        effects: effectsFor(step, onStage, show),
      });
      return;
    }
    const carried = show.filter((id) => onStage.includes(id));
    const fresh = show.filter((id) => !onStage.includes(id));
    whole = show.join();
    if (carried.length && fresh.length < most) {
      // A build going on: the newest kept, those there longest gone; a hub keeps its centre.
      const centre = stage.layout === 'hub' ? show[0] : null;
      const rest = show.filter((id) => id !== centre);
      const room = most - (centre ? 1 : 0);
      const newest = rest.filter((id) => fresh.includes(id)).slice(-room);
      const olderRoom = Math.max(0, room - newest.length);
      const older = olderRoom
        ? rest.filter((id) => carried.includes(id)).slice(-olderRoom)
        : [];
      const kept = [
        ...(centre ? [centre] : []),
        ...rest.filter((id) => newest.includes(id) || older.includes(id)),
      ];
      const gone = onStage.some((id) => !kept.includes(id));
      out.push({
        ...step,
        stage: onlyThese(
          stage,
          kept,
          pageLayout(stage.layout, kept.length),
          gone,
        ),
        effects: effectsFor(step, kept, show),
      });
      onStage = kept;
      return;
    }
    // Too many at once: pages over the sentence's words, up to the stage's next change.
    const hub = stage.layout === 'hub' ? show[0] : null;
    const pages = hub
      ? pagesOf(show.slice(1), most - 1).map((page) => [hub, ...page])
      : pagesOf(show, most);
    const words = wordsOf(script.beats[step.at.beat]?.say ?? '');
    const next = script.steps
      .slice(i + 1)
      .find((one) => one.stage && one.at.beat === step.at.beat);
    const end =
      next && next.after === undefined
        ? next.word
        : Math.max(words.length, step.word + 1);
    const span = Math.max(0, end - step.word);
    pages.forEach((page, k) => {
      const layout = pageLayout(stage.layout, page.length);
      if (k === 0) {
        out.push({
          ...step,
          stage: onlyThese(
            stage,
            page,
            layout,
            onStage.some((id) => !page.includes(id)) && onStage.length > 0,
          ),
          effects: effectsFor(step, page, show),
        });
        return;
      }
      const word = Math.min(
        Math.max(step.word + 1, words.length - 1),
        step.word + Math.round((k * span) / pages.length),
      );
      out.push({
        at: {
          beat: step.at.beat,
          phrase: words.slice(word, word + 3).join(' '),
        },
        word,
        ...(step.after !== undefined ? { after: step.after + k * 2 } : {}),
        stage: onlyThese(stage, page, layout, true),
        effects: effectsFor(step, page, show).filter((e) =>
          page.includes(e.target),
        ),
      });
    });
    onStage = pages[pages.length - 1];
  });
  return { ...script, steps: out };
}

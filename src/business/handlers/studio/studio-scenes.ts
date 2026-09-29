/**
 * One story scene written as its sheet, as the worker writes it and as
 * the story bench and the table read do: the writer asked (studioScene),
 * what it sent mended and checked, sent back once with what keeps it from
 * being made, and what it still got wrong repaired by code, so the scene
 * is always one the stage can play. Nothing is stored here: the caller
 * keeps the sheet, and grows the show with what its words named.
 */
import type { LlmGatewayPort, LlmUsage } from '../../ports/llm.port';
import {
  storySheetOf,
  type StorySheet,
  type StudioBible,
  type StudioBrief,
  type StudioOutline,
} from '../../domain/studio/studio';
import {
  checkSheet,
  describeEnd,
  errorsIn,
  linesKept,
  mendSheet,
  repairSheet,
  sentBackFor,
  withFound,
  type EndState,
  type SheetProblem,
} from '../../domain/studio/studio-check';
import { narratorRuleOf } from '../../domain/studio/studio-narrator';
import {
  describePlannedScene,
  describeSceneBeats,
} from '../../domain/studio/studio-story';
import {
  describeBible,
  describeBrief,
  describeOutline,
  describeOutlineScene,
} from '../../domain/studio/studio-words';

/** A scene's own plan in words, from the story its outline was built from; empty for none. */
export function planOf(outline: StudioOutline, k: number): string {
  const scene = outline.scenes[k];
  const plan = outline.story?.plan.scenes;
  if (!scene || !plan) return '';
  const own =
    plan.find((one) => one.title === scene.title) ??
    (plan.length === outline.scenes.length ? plan[k] : undefined);
  return own
    ? [describePlannedScene(own), describeSceneBeats(outline.story!, own)]
        .filter(Boolean)
        .join('\n')
    : '';
}

/**
 * Whether one set of problems is worse than another: more that keep a
 * scene from being made, then more of anything sent back. Below zero,
 * better; zero, as good.
 */
export function worse(
  a: readonly SheetProblem[],
  b: readonly SheetProblem[],
): number {
  return (
    errorsIn(a).length - errorsIn(b).length ||
    sentBackFor(a).length - sentBackFor(b).length
  );
}

export interface WrittenSheet {
  sheet: StorySheet;
  /** What code still finds in it: warnings only, once repaired. */
  problems: SheetProblem[];
  /** What code mended of what was sent, for the log. */
  mended: string[];
}

/**
 * A story scene's sheet written: from the outline, its plan and how the
 * scene before left the stage. With `old` and a `request`, the maker's
 * change, the rest kept. With `old` and `notes`, the story's own notes
 * (the table read): the scene written again to put them right, ending as
 * it ended.
 */
export async function writeStorySheet(
  llm: Pick<LlmGatewayPort, 'studioScene'>,
  input: {
    brief: StudioBrief;
    bible: StudioBible;
    outline: StudioOutline;
    k: number;
    before: EndState | null;
    /** The seconds it should run, about. */
    planned: number | null;
    old?: StorySheet | null;
    request?: string;
    notes?: string[];
    record?: (usage: LlmUsage) => Promise<void> | void;
    log?: (line: string) => void;
  },
): Promise<WrittenSheet> {
  const { bible, outline, k, before, planned } = input;
  const old = input.old ?? null;
  const request = input.request;
  const record = input.record ?? (() => undefined);
  const log = input.log ?? (() => undefined);
  const narrator = narratorRuleOf(input.brief, bible);
  const ask = {
    brief: describeBrief(input.brief),
    bible: describeBible(bible, true),
    outline: describeOutline(outline, true),
    scene: outline.scenes[k]
      ? [describeOutlineScene(outline.scenes[k], k, true), planOf(outline, k)]
          .filter(Boolean)
          .join('\n')
      : `Scene ${k + 1}: the scene the maker asked for.`,
    before: describeEnd(before, bible),
  };
  const notes = input.notes?.length && old ? input.notes : null;
  const first = await llm.studioScene({
    ...ask,
    ...(request && old ? { previous: old, request } : {}),
    ...(notes ? { previous: old, problems: notes } : {}),
  });
  await record(first.usage);
  const judged = (raw: unknown) => {
    const mended = mendSheet(storySheetOf(raw), bible, before);
    return {
      sheet: mended.sheet,
      mended: mended.mended,
      // Held to the show as the words grew it: a thing they named is
      // there; and, written again as asked, to the lines it had.
      problems: [
        ...checkSheet(
          mended.sheet,
          withFound(bible, mended.sheet.set, mended),
          planned,
          before,
          narrator,
        ),
        ...(request && old ? linesKept(old, mended.sheet, request) : []),
      ],
    };
  };
  let best = judged(first.value);
  const reasons = sentBackFor(best.problems);
  if (reasons.length) {
    log(`goes back: ${reasons.map((p) => p.message).join(' ')}`);
    const again = await llm.studioScene({
      ...ask,
      previous: first.value,
      problems: [
        ...reasons.map((p) => p.message),
        // The story's notes stay put right as the staging is.
        ...(notes
          ? ['Keep what the notes before asked for: only the above changes.']
          : []),
      ],
      ...(request ? { request } : {}),
    });
    await record(again.usage);
    const second = judged(again.value);
    if (worse(second.problems, best.problems) <= 0) best = second;
  }
  // What the writer still got wrong is put right here, not handed to the
  // maker: the scene is always one the stage can play.
  if (errorsIn(best.problems).length) {
    log(
      `repaired: ${errorsIn(best.problems)
        .map((p) => p.message)
        .join(' ')}`,
    );
    const sheet = repairSheet(best.sheet, bible, before, narrator);
    best = {
      ...best,
      sheet,
      problems: checkSheet(
        sheet,
        withFound(bible, sheet.set, mendSheet(sheet, bible, before)),
        planned,
        before,
        narrator,
      ),
    };
  }
  if (best.mended.length) log(`mended: ${best.mended.slice(0, 8).join('; ')}`);
  return best;
}

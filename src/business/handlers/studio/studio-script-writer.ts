/**
 * A story's whole script written, as the worker writes it and as the
 * story bench does: its scenes a few at once (Richard, 2026-09-30: the
 * scenes one after another took "forever"), then carried on from one to
 * the next by code.
 *
 * Every scene already has its plan (its start, its turn, how it ends,
 * its summary), so none waits for the one before it to be written: each
 * is told how the scene before is planned to end (plannedHandOff), and
 * written at most `writers` at a time, for DeepSeek's rate limits. Once
 * all are written, code walks them in order, as the table read's mend
 * does when an ending changes: each is mended to carry on from how the
 * one before really ends (who is still there, who holds what, what they
 * wear, the door they went through), repaired where that leaves it
 * unplayable, and the show grown with what its words named, scene by
 * scene. That walk is the only part that must go in order, and it is
 * code: no call waits on another.
 */
import type { LlmGatewayPort, LlmUsage } from '../../ports/llm.port';
import type {
  StorySheet,
  StudioBible,
  StudioBrief,
  StudioOutline,
} from '../../domain/studio/studio';
import {
  checkSheet,
  endStateOf,
  errorsIn,
  mendSheet,
  repairSheet,
  withFound,
  type EndState,
  type SheetProblem,
} from '../../domain/studio/studio-check';
import { plannedHandOff } from '../../domain/studio/studio-craft-fix';
import {
  narratorRuleOf,
  type NarratorRule,
} from '../../domain/studio/studio-narrator';
import { insertsFor, plantsOfScene } from '../../domain/studio/studio-script';
import { writeStorySheet, type WrittenSheet } from './studio-scenes';

/** Scenes written at once by default: DeepSeek takes a few calls side by side. */
export const SCENE_WRITERS = 3;

/**
 * How a story's script is written and read, from the deployment's
 * settings (Richard, 2026-09-30: fast and cheap first):
 * - STUDIO_SCENE_WRITERS, scenes written at once (3; 1 writes them in turn);
 * - STUDIO_TABLEREAD, "on" (the default) scores the written script once
 *   and logs it, "off" skips the read and its cold read altogether;
 * - STUDIO_TABLEREAD_ROUNDS, rounds of rewrites below the bar after the
 *   read (0: none; the script is ready as written; 2 was the old way);
 * - STUDIO_RETELL, "on" adds the first-time viewer's retelling of the
 *   whole film to the read (one more call a read; off by default);
 * - STUDIO_STORY_SENDBACKS, answers sent back in all while the story is
 *   developed, only for what breaks its structure (1).
 * Thinking on the read is STUDIO_TABLEREAD_THINKING (off by default), on
 * the cold read STUDIO_COLDREAD_THINKING (off), both in the adapter.
 */
export interface ScriptSettings {
  writers: number;
  tableRead: boolean;
  rounds: number;
  retell: boolean;
  storySendBacks: number;
}

export function scriptSettings(
  get: (name: string) => string | undefined,
): ScriptSettings {
  const count = (name: string, otherwise: number, most: number) => {
    const n = Math.round(Number(get(name)));
    return get(name) !== undefined && get(name) !== '' && Number.isFinite(n)
      ? Math.max(0, Math.min(most, n))
      : otherwise;
  };
  return {
    writers: Math.max(1, count('STUDIO_SCENE_WRITERS', SCENE_WRITERS, 6)),
    tableRead: get('STUDIO_TABLEREAD') !== 'off',
    rounds: count('STUDIO_TABLEREAD_ROUNDS', 0, 2),
    retell: get('STUDIO_RETELL') === 'on',
    storySendBacks: count('STUDIO_STORY_SENDBACKS', 1, 4),
  };
}

/** One scene of a script, carried on from the one before. */
export interface CarriedScene {
  sheet: StorySheet;
  /** What code finds in it as it carries on: warnings only, once repaired. */
  problems: SheetProblem[];
  /** How the scene before left the stage; null for the first. */
  before: EndState | null;
}

export interface WrittenScript {
  /** Every scene, in order. */
  scenes: CarriedScene[];
  /** Each scene as its writer's answer came back (mended, checked and repaired alone), in order: what `onWritten` was given. */
  drafts: WrittenSheet[];
  /** The show as the words grew it: a feature of a set named, a thing of its own. */
  bible: StudioBible;
}

/**
 * The scenes, in order, each mended to carry on from how the one before
 * really ends; repaired where that leaves something the stage cannot
 * play; the inserts of what each plants asked for again; and the show
 * grown with what each one's words named.
 */
export function carryOn(
  sheets: readonly StorySheet[],
  bible: StudioBible,
  outline: StudioOutline,
  narrator: NarratorRule | null,
): { scenes: CarriedScene[]; bible: StudioBible } {
  let grown = bible;
  let before: EndState | null = null;
  const scenes: CarriedScene[] = [];
  sheets.forEach((given, k) => {
    const planned = outline.scenes[k]?.seconds ?? null;
    const found = (sheet: StorySheet) =>
      withFound(grown, sheet.set, mendSheet(sheet, grown, before));
    let sheet = mendSheet(given, grown, before).sheet;
    let problems = checkSheet(sheet, found(sheet), planned, before, narrator);
    if (errorsIn(problems).length) {
      sheet = repairSheet(sheet, grown, before, narrator);
      problems = checkSheet(sheet, found(sheet), planned, before, narrator);
    }
    const plants = outline.story
      ? plantsOfScene(outline.story, outline, grown, k)
      : [];
    const inserts = insertsFor(sheet, plants, grown);
    if (inserts.length) sheet = { ...sheet, inserts };
    grown = found(sheet);
    scenes.push({ sheet, problems, before });
    before = endStateOf(sheet, grown, before);
  });
  return { scenes, bible: grown };
}

/**
 * Every scene of a story's outline written, `writers` at a time, each
 * from its plan and the plan of the scene before; then carried on in
 * order by code (carryOn). `onWritten` is told of each as its writer's
 * answer comes back, in whatever order they come.
 */
export async function writeStoryScript(
  llm: Pick<LlmGatewayPort, 'studioScene'>,
  input: {
    brief: StudioBrief;
    bible: StudioBible;
    outline: StudioOutline;
    /** At most this many written at once; 1 writes them one after another. */
    writers?: number;
    record?: (usage: LlmUsage) => Promise<void> | void;
    /** A line for the log, about scene k (from 0). */
    log?: (k: number, line: string) => void;
    onWritten?: (k: number, written: WrittenSheet) => Promise<void> | void;
  },
): Promise<WrittenScript> {
  const { brief, bible, outline } = input;
  const count = outline.scenes.length;
  const writers = Math.max(1, Math.min(input.writers ?? SCENE_WRITERS, count));
  const drafts: WrittenSheet[] = new Array<WrittenSheet>(count);
  let next = 0;
  let failed = false;
  const lane = async () => {
    // A scene that could not be written stops the rest being asked: the
    // job is tried again whole.
    while (next < count && !failed) {
      const k = next++;
      try {
        drafts[k] = await writeStorySheet(llm, {
          brief,
          bible,
          outline,
          k,
          before: null,
          beforeWords: plannedHandOff(outline, k, bible),
          planned: outline.scenes[k]?.seconds ?? null,
          record: input.record,
          log: (line) => input.log?.(k, line),
        });
        await input.onWritten?.(k, drafts[k]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const lanes = Array.from({ length: writers }, lane);
  const settled = await Promise.allSettled(lanes);
  const refused = settled.find(
    (one): one is PromiseRejectedResult => one.status === 'rejected',
  );
  if (refused) throw refused.reason;
  const carried = carryOn(
    drafts.map((d) => d.sheet),
    bible,
    outline,
    narratorRuleOf(brief, bible),
  );
  return { ...carried, drafts };
}

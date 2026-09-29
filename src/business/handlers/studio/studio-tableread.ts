/**
 * The table read (studio-story-plan §1.6, S4), as the worker runs it once
 * every scene of a story is written and before the script is ready, and
 * as the story bench runs it: a critic (studio_check, DeepSeek, thinking
 * on) reads the whole script with the brief, the story and everyone's
 * sheet, and scores it against the rubric, with notes for each scene.
 * Code's own checks across the script (voice, plants, turns) go to the
 * critic and to the writer. Below the bar, only the failing scenes are
 * written again through the scene writer, their notes as the problems,
 * ending as they ended; at most two rounds, and the best-read script is
 * kept. Silent: the maker sees the better script, never the notes.
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
import {
  narratorRuleOf,
  narratorWords,
} from '../../domain/studio/studio-narrator';
import {
  TABLE_READ_ROUNDS,
  belowBar,
  checkScript,
  describeNotes,
  describeRead,
  notesFor,
  scenesToRewrite,
  scriptInWords,
  tableReadOf,
  type ScriptNote,
  type TableRead,
} from '../../domain/studio/studio-script';
import { describeStory } from '../../domain/studio/studio-story';
import { describeBible, describeBrief } from '../../domain/studio/studio-words';
import { worse, writeStorySheet } from './studio-scenes';

/** One read of the script, and what was written again after it. */
export interface ReadRound {
  read: TableRead;
  /** What code found across the script as read. */
  code: ScriptNote[];
  sheets: StorySheet[];
  /** The scenes written again after this read, from 0; empty when none. */
  rewritten: number[];
}

export interface TableReadResult {
  /** Every read, the first first. */
  rounds: ReadRound[];
  /** Which round's script is kept: the best read. */
  best: number;
  /** The script kept. */
  sheets: StorySheet[];
  /** The scenes of it that differ from the script as given, from 0, each with what code finds in it now. */
  changed: Map<number, SheetProblem[]>;
  /** The show as the words grew it (a feature named, a thing of its own). */
  bible: StudioBible;
}

/** What every rewrite is told, so the next scene still carries on from it. */
const KEEP_END =
  'Keep the scene in its place, with its cast, and end it as it ends now: the same people on the stage and the same things in the same hands, since the next scene carries on from there.';

/** The ends of a script's scenes in turn: before[k] is how scene k-1 left the stage. */
function endsOf(
  sheets: readonly StorySheet[],
  bible: StudioBible,
): (EndState | null)[] {
  const out: (EndState | null)[] = [];
  let before: EndState | null = null;
  for (const sheet of sheets) {
    out.push(before);
    before = endStateOf(sheet, bible, before);
  }
  return out;
}

/**
 * The table read of a written story script, with at most `rounds` rounds
 * of targeted rewrites below the bar. `rewrite: false` only reads it (the
 * bench's "before").
 */
export async function tableRead(
  llm: Pick<LlmGatewayPort, 'studioTableRead' | 'studioScene'>,
  input: {
    brief: StudioBrief;
    bible: StudioBible;
    outline: StudioOutline;
    sheets: StorySheet[];
    rounds?: number;
    rewrite?: boolean;
    record?: (
      usage: LlmUsage,
      task: 'studio_check' | 'studio_write',
    ) => Promise<void> | void;
    log?: (line: string) => void;
  },
): Promise<TableReadResult> {
  const { brief, outline } = input;
  const most = input.rounds ?? TABLE_READ_ROUNDS;
  const record = input.record ?? (() => undefined);
  const log = input.log ?? (() => undefined);
  const story = outline.story ?? null;
  const narrator = narratorRuleOf(brief, input.bible);
  let bible = input.bible;

  const readOnce = async (sheets: StorySheet[]) => {
    const code = checkScript(story, sheets, outline, bible);
    const result = await llm.studioTableRead({
      brief: describeBrief(brief),
      bible: describeBible(bible, true),
      story: story ? describeStory(story) : '',
      narrator:
        narratorWords(brief) ||
        'Narrator: left to the Studio; the characters carry the scenes, the narrator a third of the words at most.',
      script: scriptInWords(sheets, bible, outline),
      code: describeNotes(code),
    });
    await record(result.usage, 'studio_check');
    return { read: tableReadOf(result.value, sheets.length), code };
  };

  /** The scenes asked for written again with their notes; the rest kept, and mended where the scene before now ends differently. */
  const rewriteRound = async (
    sheets: StorySheet[],
    targets: readonly number[],
    read: TableRead,
    code: readonly ScriptNote[],
  ) => {
    const was = endsOf(sheets, bible);
    const next = [...sheets];
    const problems = new Map<number, SheetProblem[]>();
    let before: EndState | null = null;
    for (let k = 0; k < sheets.length; k += 1) {
      const planned = outline.scenes[k]?.seconds ?? null;
      const drifted = JSON.stringify(before) !== JSON.stringify(was[k]);
      if (targets.includes(k)) {
        const notes = notesFor(k, read, code, bible);
        const written = await writeStorySheet(llm, {
          brief,
          bible,
          outline,
          k,
          before,
          planned,
          old: sheets[k],
          notes: [...notes, KEEP_END],
          record: (usage) => record(usage, 'studio_write'),
          log: (line) => log(`s${k + 1}: ${line}`),
        });
        // Kept only when the stage can play it as well as the one it replaces.
        const had = checkSheet(
          sheets[k],
          withFound(bible, sheets[k].set, mendSheet(sheets[k], bible, before)),
          planned,
          before,
          narrator,
        );
        if (worse(written.problems, had) <= 0) {
          next[k] = written.sheet;
          problems.set(k, written.problems);
        } else log(`s${k + 1}: the rewrite plays worse; the scene is kept`);
      } else if (drifted) {
        // The scene before now ends otherwise: this one carries on from it.
        const held = (sheet: StorySheet) =>
          checkSheet(
            sheet,
            withFound(bible, sheet.set, mendSheet(sheet, bible, before)),
            planned,
            before,
            narrator,
          );
        let sheet = mendSheet(sheets[k], bible, before).sheet;
        let found = held(sheet);
        if (errorsIn(found).length) {
          sheet = repairSheet(sheet, bible, before, narrator);
          found = held(sheet);
        }
        next[k] = sheet;
        problems.set(k, found);
      }
      bible = withFound(bible, next[k].set, mendSheet(next[k], bible, before));
      before = endStateOf(next[k], bible, before);
    }
    return { sheets: next, problems };
  };

  const rounds: ReadRound[] = [];
  const changedBy: Map<number, SheetProblem[]>[] = [];
  const biblesBy: StudioBible[] = [];
  let sheets = input.sheets;
  let changed = new Map<number, SheetProblem[]>();
  for (let r = 0; ; r += 1) {
    const { read, code } = await readOnce(sheets);
    rounds.push({ read, code, sheets, rewritten: [] });
    changedBy.push(changed);
    biblesBy.push(bible);
    const bar = belowBar(read);
    log(
      `table read${r ? ` again (${r})` : ''} ${describeRead(read)}${bar.length ? `; below the bar: ${bar.join(', ')}` : ''}`,
    );
    if (!bar.length || r >= most || input.rewrite === false) break;
    const targets = scenesToRewrite(read);
    if (!targets.length) break;
    rounds[r].rewritten = targets;
    log(`writing again: scene ${targets.map((k) => k + 1).join(', ')}`);
    const next = await rewriteRound(sheets, targets, read, code);
    sheets = next.sheets;
    changed = new Map([...changed, ...next.problems]);
  }
  let best = 0;
  rounds.forEach((round, r) => {
    if (round.read.overall > rounds[best].read.overall) best = r;
  });
  const kept = rounds[best].sheets;
  return {
    rounds,
    best,
    sheets: kept,
    changed: new Map(
      [...changedBy[best]].filter(([k]) => kept[k] !== input.sheets[k]),
    ),
    bible: biblesBy[best],
  };
}

/**
 * The table read (studio-story-plan §1.6, S4), as the worker runs it once
 * every scene of a story is written and before the script is ready, and
 * as the story bench runs it: a critic (studio_check, DeepSeek, thinking
 * on) reads the whole script with the brief, the story and everyone's
 * sheet, and scores it against the rubric, with notes for each scene.
 * First a first-time viewer (the cold read) watches the opening as the
 * film shows it, with none of the plan, and says what it is about; the
 * critic scores clarity by that, and a film below the clarity floor never
 * passes: its first scene is written again with what the viewer missed,
 * and a read the viewer can follow is kept before one that scores higher.
 * Code's own checks across the script (voice, telling, plants, turns) go
 * to the critic and to the writer. Below the bar, only the failing scenes are
 * written again through the scene writer, their notes as the problems,
 * ending as they ended; at most two rounds, each from the best-read
 * script so far, and the best-read script is kept. Silent: the maker
 * sees the better script, never the notes.
 */
import type { LlmGatewayPort, LlmUsage } from '../../ports/llm.port';
import { progressNow } from '../../domain/work-progress';
import { rewriteSays } from './studio-progress';
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
  castAsSeen,
  checkScript,
  coldReadOf,
  describeColdRead,
  describeNotes,
  describeRead,
  filmAsSeen,
  judgeColdRead,
  notesFor,
  retellNotes,
  retellOf,
  scenesToRewrite,
  scriptInWords,
  tableReadOf,
  unclear,
  type ColdRead,
  type Retell,
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
  /** The whole film as a first-time viewer retold it; null where no one did. */
  retell?: Retell | null;
  /** Which read's script the rewrite after this one started from: the best so far, never one that read worse. */
  from?: number;
}

/**
 * The best of the reads so far, from 0: one a first-time viewer can
 * follow before any that scores higher but loses them; else the higher
 * overall; the earlier on a tie.
 */
export function bestRead(rounds: readonly Pick<ReadRound, 'read'>[]): number {
  let best = 0;
  rounds.forEach((round, r) => {
    const was = rounds[best].read;
    const clearer = unclear(was) && !unclear(round.read);
    const asClear = unclear(was) === unclear(round.read);
    if (clearer || (asClear && round.read.overall > was.overall)) best = r;
  });
  return best;
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
  llm: Pick<LlmGatewayPort, 'studioTableRead' | 'studioScene'> &
    Partial<Pick<LlmGatewayPort, 'studioColdRead' | 'studioRetell'>>,
  input: {
    brief: StudioBrief;
    bible: StudioBible;
    outline: StudioOutline;
    sheets: StorySheet[];
    rounds?: number;
    rewrite?: boolean;
    /** Whether a first-time viewer retells the whole film too (one more call a read); off unless asked. */
    retell?: boolean;
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

  /** What a first-time viewer makes of the first scene as the film shows it; null where it cannot be asked. */
  const coldRead = async (sheets: StorySheet[]): Promise<ColdRead | null> => {
    if (!llm.studioColdRead || !sheets.length) return null;
    try {
      const result = await llm.studioColdRead({
        kind: `A short animated film${brief.audience ? ` for ${brief.audience}` : ''}${brief.tone ? `, ${brief.tone}` : ''}.`,
        film: filmAsSeen(sheets, bible, 0),
      });
      await record(result.usage, 'studio_check');
      return coldReadOf(result.value);
    } catch (error) {
      log(`the cold read could not run (${(error as Error).message})`);
      return null;
    }
  };

  /** The whole film retold by a first-time viewer as a story spine, each join "therefore", "but" or "and then" (T2); null where it cannot be asked. */
  const retold = async (sheets: StorySheet[]): Promise<Retell | null> => {
    if (!input.retell || !llm.studioRetell || sheets.length < 2) return null;
    try {
      const result = await llm.studioRetell({
        kind: `A short animated film${brief.audience ? ` for ${brief.audience}` : ''}${brief.tone ? `, ${brief.tone}` : ''}.`,
        film: filmAsSeen(sheets, bible, sheets.length - 1),
      });
      await record(result.usage, 'studio_check');
      return retellOf(result.value, sheets.length);
    } catch (error) {
      log(`the retelling could not run (${(error as Error).message})`);
      return null;
    }
  };

  const readOnce = async (sheets: StorySheet[]) => {
    progressNow({ says: 'Reading the whole script' });
    const [viewer, retell] = await Promise.all([
      coldRead(sheets),
      retold(sheets),
    ]);
    const judged = judgeColdRead(
      viewer,
      story?.premise,
      bible,
      castAsSeen(sheets, bible, 0),
    );
    const asked = viewer
      ? viewer.confused.filter((c) => !judged.confused.includes(c))
      : [];
    const code = [
      ...checkScript(story, sheets, outline, bible),
      ...retellNotes(retell, story, outline, bible),
    ];
    if (viewer)
      log(
        `cold read of scene 1 (sure ${viewer.sure}): ${viewer.about}${judged.confused.length ? `; confused by: ${judged.confused.join('; ')}` : ''}${asked.length || viewer.wondering.length ? `; the film's own questions: ${[...asked, ...viewer.wondering].join('; ')}` : ''}${judged.misses.length ? `; against the story: ${judged.misses.join('; ')}` : ''}${judged.unsure.length ? `; unsure: ${judged.unsure.join('; ')}` : ''}`,
      );
    if (retell)
      log(
        `retold: ${retell.scenes.map((s) => `${s.link ? `${s.link} ` : ''}${s.what}`).join(' / ')}`,
      );
    const result = await llm.studioTableRead({
      brief: describeBrief(brief),
      bible: describeBible(bible, true),
      story: story ? describeStory(story) : '',
      narrator:
        narratorWords(brief) ||
        'Narrator: none. A pure film: the characters carry every scene in what they say and do.',
      script: scriptInWords(sheets, bible, outline),
      code: describeNotes(code),
      ...(viewer
        ? {
            viewer: [
              describeColdRead(viewer),
              ...(judged.misses.length
                ? [
                    `Against the premise, code found the viewer got wrong: ${judged.misses.join('; ')}.`,
                  ]
                : []),
              ...(judged.unsure.length
                ? [
                    `Code found the viewer could not tell: ${judged.unsure.join('; ')}.`,
                  ]
                : []),
              ...(asked.length
                ? [
                    `Not confusion, but questions the story means them to ask at this point: ${asked.join('; ')}.`,
                  ]
                : []),
            ].join('\n'),
          }
        : {}),
    });
    await record(result.usage, 'studio_check');
    return {
      read: tableReadOf(result.value, sheets.length, viewer, judged),
      code,
      retell,
    };
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
        progressNow(rewriteSays(k, notes));
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
        progressNow({ scene: k, done: true });
        // Kept only when the stage can play it as well as the one it replaces.
        const had = checkSheet(
          sheets[k],
          withFound(bible, sheets[k].set, mendSheet(sheets[k], bible, before)),
          planned,
          before,
          narrator,
          brief.audience,
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
            brief.audience,
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
    const { read, code, retell } = await readOnce(sheets);
    rounds.push({ read, code, sheets, rewritten: [], retell });
    changedBy.push(changed);
    biblesBy.push(bible);
    const bar = belowBar(read);
    log(
      `table read${r ? ` again (${r})` : ''} ${describeRead(read)}${bar.length ? `; below the bar: ${bar.join(', ')}` : ''}`,
    );
    if (!bar.length || r >= most || input.rewrite === false) break;
    // Written again from the best script so far, with its read's notes: a
    // rewrite that read worse is never built on.
    const base = bestRead(rounds);
    const from = rounds[base];
    const targets = scenesToRewrite(from.read, from.code);
    if (!targets.length) break;
    if (base !== r) {
      sheets = from.sheets;
      bible = biblesBy[base];
      changed = changedBy[base];
    }
    rounds[r].rewritten = targets;
    rounds[r].from = base;
    log(
      `writing again: scene ${targets.map((k) => k + 1).join(', ')}${base !== r ? ` (from read ${base + 1}, the best so far)` : ''}`,
    );
    const next = await rewriteRound(sheets, targets, from.read, from.code);
    sheets = next.sheets;
    changed = new Map([...changed, ...next.problems]);
  }
  // The best read kept.
  const best = bestRead(rounds);
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

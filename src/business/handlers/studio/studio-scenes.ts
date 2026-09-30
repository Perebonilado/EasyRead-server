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
import {
  craftChecklist,
  fixCraft,
  hardFailures,
  missingCast,
  trimToLength,
} from '../../domain/studio/studio-craft-fix';
import { narratorRuleOf } from '../../domain/studio/studio-narrator';
import {
  FIRST_SCENE_RULE,
  checkOpening,
  insertsFor,
  lintLines,
  lintTelling,
  minutesOf,
  openingBy,
  plantsOfScene,
} from '../../domain/studio/studio-script';
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
  /** What the screenwriting checks still find in its lines (aims, reports, the opening), for the log and the table read. */
  craft: string[];
}

/**
 * The screenwriting checks of one scene as written, each a note for its
 * writer: every line an aim and someone to say it to, no reports of the
 * picture, no "as you know", no feelings said outright, no hello to open
 * on; in a comedy a take after a joke; and in scene 1, the setup landed
 * in time (checkOpening).
 */
export function craftOf(
  sheet: StorySheet,
  bible: StudioBible,
  outline: StudioOutline,
  k: number,
): { all: string[]; failing: string[] } {
  const story = outline.story ?? null;
  const minutes = minutesOf(outline);
  const opening =
    k === 0 && story ? checkOpening(sheet, story, bible, minutes) : [];
  const telling = lintTelling([sheet], bible).map((n) => n.message);
  const lines = lintLines([sheet], bible, {
    genre: story?.premise.genre ?? null,
    ending: story?.premise.ending ?? null,
    minutes,
    from: k,
  });
  return {
    all: [...opening, ...telling, ...lines.map((n) => n.message)],
    // What fails a scene, and sends it back to its writer at once: the
    // opening not landed, lines that report, lines with no aim or no one
    // to say them to, "as you know", feelings said outright, a hello to
    // open on. The rest (a take, a long line) is the table read's.
    failing: [
      ...opening,
      ...telling,
      ...lines
        .filter((n) =>
          /^Lines (?:with no aim|said to no one)|already know|outright|opens on a hello|the deadline is first said/u.test(
            n.message,
          ),
        )
        .map((n) => n.message),
    ],
  };
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
    /**
     * How the scene before is planned to end, in words, for a scene
     * written at the same time as it (writeStoryScript): said to the
     * writer in place of how it really ended, which code puts right after.
     */
    beforeWords?: string | null;
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
      ? [
          describeOutlineScene(outline.scenes[k], k, true),
          planOf(outline, k),
          // The film's first scene sets the story up where it is seen.
          k === 0 ? FIRST_SCENE_RULE : '',
          // What code will hold it to, so the first draft keeps it.
          craftChecklist({
            brief: input.brief,
            bible,
            outline,
            k,
            narrator,
            by: openingBy(minutesOf(outline)),
          }),
        ]
          .filter(Boolean)
          .join('\n')
      : `Scene ${k + 1}: the scene the maker asked for.`,
    before: input.beforeWords || describeEnd(before, bible),
  };
  const notes = input.notes?.length && old ? input.notes : null;
  const first = await llm.studioScene({
    ...ask,
    ...(request && old ? { previous: old, request } : {}),
    ...(notes ? { previous: old, problems: notes } : {}),
  });
  await record(first.usage);
  // The things this scene plants, for the camera's inserts.
  const plants = outline.story
    ? plantsOfScene(outline.story, outline, bible, k)
    : [];
  const judged = (raw: unknown) => {
    const made = mendSheet(storySheetOf(raw), bible, before);
    // The craft notes code can put right, put right here, not sent back.
    const fixed = fixCraft(made.sheet, bible, outline, k, minutesOf(outline));
    // Too long for its seconds: trimmed by code, not written again (never
    // a change the maker asked for).
    const trimmed =
      request && old
        ? { sheet: fixed.sheet, fixed: [] }
        : trimToLength(fixed.sheet, planned, { first: k === 0 });
    const mended = {
      ...made,
      sheet: trimmed.sheet,
      mended: [...trimmed.fixed, ...fixed.fixed, ...made.mended],
    };
    const craft = craftOf(mended.sheet, bible, outline, k);
    return {
      sheet: mended.sheet,
      mended: mended.mended,
      missing: missingCast(mended.sheet, outline.scenes[k], bible),
      craft: craft.all,
      failing: craft.failing,
      // Held to the show as the words grew it: a thing they named is
      // there; and, written again as asked, to the lines it had.
      problems: [
        ...checkSheet(
          mended.sheet,
          withFound(bible, mended.sheet.set, mended),
          planned,
          before,
          narrator,
          input.brief.audience,
        ),
        ...(request && old ? linesKept(old, mended.sheet, request) : []),
      ],
    };
  };
  let best = judged(first.value);
  // Back once, and only for what the stage cannot play or the plan's cast
  // left out (hardFailures): every craft note is put right by code above
  // or logged below, never paid for with a second call.
  const reasons = hardFailures(best.problems, best.missing);
  const failing: string[] = [];
  if (reasons.length || failing.length) {
    log(
      `goes back: ${[...reasons.map((p) => p.message), ...failing].join(' ')}`,
    );
    const again = await llm.studioScene({
      ...ask,
      previous: first.value,
      problems: [
        ...reasons.map((p) => p.message),
        ...failing,
        // The story's notes stay put right as the staging is: said again,
        // since this answer is written from the last and nothing else,
        // and a cut for length comes out of other beats, never theirs.
        ...(notes
          ? [
              'Keep everything these notes asked for; to fit the time, cut or tighten other beats, never what they asked for:',
              ...notes,
            ]
          : []),
      ],
      ...(request ? { request } : {}),
    });
    await record(again.usage);
    const second = judged(again.value);
    // What the stage can play first; then the lines that do more.
    const staged = worse(second.problems, best.problems);
    if (
      staged < 0 ||
      (staged === 0 && second.failing.length <= best.failing.length)
    )
      best = second;
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
        input.brief.audience,
      ),
    };
  }
  if (best.mended.length) log(`mended: ${best.mended.slice(0, 8).join('; ')}`);
  if (best.craft.length) log(`craft still: ${best.craft.join(' ')}`);
  // A thing planted here, handled on screen: a close shot of it asked for (data only).
  const inserts = insertsFor(best.sheet, plants, bible);
  if (inserts.length) best = { ...best, sheet: { ...best.sheet, inserts } };
  return best;
}

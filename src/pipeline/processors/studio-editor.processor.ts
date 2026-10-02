/**
 * The editor's desk on the worker (infographic-editor-plan §3): the jobs
 * that plan an explainer show as an editor plans a video, and write its
 * episodes. The Studio's processor hands them here; nothing here reaches
 * into the reader.
 *
 * The show, once (on its first episode, each job setting the next going):
 *   angles  the questions it could answer, scored and ranked by code; the
 *           maker picks one (studio.service pickAngle), and research starts;
 *   research  the research log, with the web (only pages a search found
 *           stand as sources; a document is the first source);
 *   plan    the spine, the selection, the episode map, checked and put
 *           right by code (three to five minutes an episode, never padded);
 *   world   the era, the colours, the places and people, made the show's
 *           cast and sets for its illustrated scenes; then the first
 *           episode's edit.
 * An episode, each time:
 *   edit    beats, hooks, the whole two-column script, the editor's read,
 *           one revision, the fact check, cut into scenes, the package;
 *           kept as it goes, so a try after a failure carries on.
 *   replan  research topped up for what the maker asked, and the episodes
 *           not made yet planned again around it; then that episode's edit.
 *   boards  (the script job, for an editor's episode) each scene's board on
 *           its written rows: a lesson's storyboard, an illustrated scene's
 *           narrated shots.
 *
 * Every model answer is made sound and checked by code, sent back once,
 * and what is still wrong mended silently: the maker is never shown it.
 */
import { createHash } from 'node:crypto';
import { progressNow } from '../../business/domain/work-progress';
import {
  explainerSheetOf,
  storySheetOf,
  isIllustrated,
  type ExplainerSheet,
  type OutlineScene,
  type SheetBeat,
  type StorySheet,
  type StudioBible,
} from '../../business/domain/studio/studio';
import {
  EMPTY_EDITOR,
  anglesOf,
  mergedResearch,
  plainText,
  planOf,
  researchOf,
  urlKey,
  worldOf,
  type EditorPlan,
  type EditorResearch,
  type EditorSource,
  type EditorWorld,
  type StudioEditor,
} from '../../business/domain/studio/studio-editor';
import {
  beatsOf,
  factsOf,
  freshEditorial,
  hooksOf,
  notesOf,
  packageOf,
  rowsOf,
  type EditorialRow,
  type StudioEditorial,
} from '../../business/domain/studio/studio-editorial';
import {
  PLAIN_PACE,
  applyFacts,
  beatProblems,
  budgetBeats,
  hookProblems,
  mendHook,
  mendRows,
  planProblems,
  promiseReturns,
  scriptProblems,
  soundPackage,
  soundPlan,
  soundScenes,
  splitLongActs,
  withoutDirections,
  withoutRepeats,
  researchProblems,
  concreteContext,
  spokenWords,
  unusedClaims,
  episodeTarget,
  fitBeats,
  planLengthProblems,
  rowWords,
  type EditorPace,
} from '../../business/domain/studio/studio-editor-checks';
import {
  editorOutline,
  illustratedSwitchOn,
  shotsSwitchOn,
} from '../../business/domain/studio/studio-editor-cut';
import { boardShots, safePlan } from '../../business/domain/shots/shot-board';
import { pictureCredits } from '../../business/domain/shots/shot-pictures';
import { registryOf } from '../../business/domain/shots/shot-registry';
import {
  countsOf,
  deskPass,
  picturesFor,
  withPictureCredits,
  type DeskLike,
  type EpisodePictures,
} from '../../business/domain/pictures/episode';
import type {
  RegistryEntry,
  ShotPlan,
} from '../../business/domain/shots/types';
import {
  onShowMap,
  pinOnShowMap,
  worldBible,
  worldColours,
} from '../../business/domain/studio/studio-editor-world';
import {
  numberOf,
  type CounterDraft,
} from '../../business/domain/scene-counter';
import { quotedSpans } from '../../business/domain/scene-script';
import {
  describeBeats,
  describeEarlierScripts,
  describeEditorBrief,
  describeLeftOut,
  describePace,
  describePlan,
  describePlannedEpisode,
  describeQuestion,
  describeResearch,
  describeRows,
  describeRowsFromZero,
  describeWorld,
} from '../../business/domain/studio/studio-editor-words';
import {
  bandOf,
  recipeOf,
  stageOf,
} from '../../business/domain/studio/studio-audience';
import {
  lookStyleFor,
  showLookStyle,
} from '../../business/domain/studio/studio-look';
import {
  checkExplainer,
  checkSheet,
  errorsIn,
  mendSheet,
  repairExplainer,
  repairSheet,
  withFound,
  type SheetProblem,
} from '../../business/domain/studio/studio-check';
import { hostOn, withHost } from '../../business/domain/studio/studio-host';
import { worse } from '../../business/handlers/studio/studio-scenes';
import { sceneFingerprint } from '../../business/handlers/studio/studio-views';
import { logEvent } from '../../business/handlers/studio/studio-log';
import { webSearchCost } from '../../business/domain/cost';
import type {
  EditorFound,
  LlmGatewayPort,
  LlmTask,
  LlmUsage,
} from '../../business/ports/llm.port';
import type { JobQueuePort } from '../../business/ports/job-queue.port';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  StudioEpisodeRecord,
  StudioEventRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { StudioJobData } from '../queues';
import type { StudioMaterialService } from './studio-material';
import type { SceneScriptDraft } from '../../business/domain/scene-script';

/** The editor's own jobs on the Studio's queue. */
export const EDITOR_JOBS = [
  'angles',
  'research',
  'plan',
  'world',
  'edit',
  'replan',
] as const;
export type EditorJobKind = (typeof EDITOR_JOBS)[number];
export const isEditorJob = (kind: string): kind is EditorJobKind =>
  (EDITOR_JOBS as readonly string[]).includes(kind);

/** The angles' quick look round: a few searches at most. */
export const ANGLE_SEARCHES = 3;
/** A top-up for something new the maker asks for. */
export const TOP_UP_SEARCHES = 10;

/** The searches a thin research log is given when it goes back once. */
export const DEEPER_SEARCHES = 16;
/** Boards written at once: each its own scene. */
const BOARDERS = 3;

/** What the thread says of the editor's work, in the maker's words. */
export const EDITOR_LINES = {
  angles: (n: number) =>
    `${n === 1 ? 'A question' : `${Math.min(n, 3)} questions`} this show could answer: pick one, or let me choose`,
  research: (claims: number, sources: number, myths: number) =>
    `Researched: ${claims} facts from ${sources} source${sources === 1 ? '' : 's'}${myths ? `, ${myths} myth${myths === 1 ? '' : 's'} to put right` : ''}`,
  plan: (episodes: number, minutes: number, kept: number, of: number) =>
    `Planned: ${episodes === 1 ? 'one episode' : `${episodes} episodes`} of about ${Math.round(minutes)} minutes; ${kept} of ${of} findings kept`,
  replan: (request: string, episodes: number) =>
    `Planned again around “${request.length > 60 ? `${request.slice(0, 59)}…` : request}”: ${episodes === 1 ? 'one more episode' : `${episodes} more episodes`}`,
  world: (era: string, places: number, people: number) =>
    `The world is drawn up: ${era}, ${places} place${places === 1 ? '' : 's'}, ${people} ${people === 1 ? 'person' : 'people'}`,
  editorial: (number: number, title: string, seconds: number, rows: number) =>
    `Episode ${number}'s script is written: “${title}”, about ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}, ${rows} lines`,
  failed: {
    angles: 'The questions could not be found. Try again in a moment.',
    research: 'The research could not be done. Try again in a moment.',
    plan: 'The episodes could not be planned. Try again in a moment.',
    world: 'The world could not be drawn up. Try again in a moment.',
    edit: 'The script could not be written. Try again in a moment.',
    replan: 'The next episodes could not be planned. Try again in a moment.',
  } satisfies Record<EditorJobKind, string>,
};

/** The audience's pace and sentences, as the recipe has them; a grown-up's where none is said. */
export function editorPace(brief: StudioShowRecord['brief']): EditorPace {
  const recipe = recipeOf(brief);
  return recipe
    ? { wpm: recipe.wpm, sentence: [recipe.sentence[0], recipe.sentence[1]] }
    : PLAIN_PACE;
}

/** The pages a search found, by their address as compared: only these may stand as sources. */
const foundMap = (found: readonly EditorFound[]) =>
  new Map<string, EditorSource>(
    found.map((f) => [urlKey(f.url), { url: f.url, title: f.title }]),
  );

/** Everything the editor's desk needs, given by the Studio's processor (or a script that runs it in-process). */
export interface EditorDeps {
  studio: StudioRepository;
  llm: LlmGatewayPort;
  calls: AiCallLogRepository;
  queue: Pick<JobQueuePort, 'enqueueStudio'>;
  /** A setting, by its name: the config's, else the environment's. */
  setting: (name: string) => string | undefined;
  material?: StudioMaterialService | null;
  /**
   * The picture desk (WP11): archive photos and portraits for a shots
   * episode's scenes, asked once an episode before they are boarded.
   * Absent or null, no pictures: people are shown by their traces.
   */
  pictures?: DeskLike | null;
  logger: { log(message: string): void; warn(message: string): void };
}

export class StudioEditorProcessor {
  constructor(private readonly deps: EditorDeps) {}

  private get studio() {
    return this.deps.studio;
  }

  private get llm() {
    return this.deps.llm;
  }

  /** An editor's job, run: false for a job that is none of the editor's. */
  async run(
    job: Pick<StudioJobData, 'kind' | 'request'>,
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<boolean> {
    switch (job.kind) {
      case 'angles':
        await this.angles(show, episode, key);
        return true;
      case 'research':
        await this.research(show, episode, key);
        return true;
      case 'plan':
        await this.plan(show, episode, key);
        return true;
      case 'world':
        await this.world(show, episode, key);
        return true;
      case 'edit':
        await this.edit(show, episode, key, job.request);
        return true;
      case 'replan':
        await this.replan(show, episode, job.request ?? '', key);
        return true;
      default:
        return false;
    }
  }

  /**
   * An outline asked of an editor's show (the documents' path sets one
   * going, as a brief made complete there does): its planning begun when
   * it has none, else the episode's script written (or written again with
   * what was asked).
   */
  async outlineAsked(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request?: string,
    key?: string,
  ): Promise<void> {
    const editor = show.editor ?? EMPTY_EDITOR;
    if (!editor.stage) {
      await this.studio.updateEpisode(episode.id, { busy: 'angles' });
      await this.angles(show, episode, key);
      return;
    }
    if (editor.plan && editor.world) {
      await this.studio.updateEpisode(episode.id, { busy: 'edit' });
      await this.edit(show, episode, key, request);
      return;
    }
    // Still being planned: its first episode is written once it is.
    await this.studio.updateEpisode(episode.id, { busy: null });
  }

  /** An editor's job given up on: said in the thread, the episode free again. */
  async failed(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    kind: EditorJobKind,
    key?: string,
  ): Promise<void> {
    await this.log(
      show,
      episode,
      {
        what: 'failed',
        step: kind === 'edit' ? 'outline' : 'brief',
        line: EDITOR_LINES.failed[kind],
      },
      key,
    );
    await this.studio.updateEpisode(episode.id, {
      busy: null,
      error: 'That did not work. Try again in a moment.',
    });
  }

  // ── The show ────────────────────────────────────────────────────────────

  /** The questions the show could answer, scored and ranked: for the maker to pick. */
  async angles(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<void> {
    progressNow({ says: 'Finding the questions this could answer' });
    const said = await this.makerSaid(show);
    const answer = await this.llm.editorSearch({
      step: 'angles',
      parts: [
        `The brief:\n${describeEditorBrief(show.brief)}`,
        said ? `What the maker said, in their words:\n${said}` : '',
      ],
      searches: ANGLE_SEARCHES,
    });
    await this.record(episode.id, answer.usage, 'explainer_research');
    const value = answer.value.value;
    const editor: StudioEditor = {
      ...(show.editor ?? EMPTY_EDITOR),
      ...editorOfAngles(value),
      stage: 'angles',
      question: null,
      pitch: null,
    };
    if (!editor.angles.length) throw new Error('No angles came back');
    await this.studio.updateShow(show.id, { editor });
    await this.log(
      show,
      episode,
      {
        what: 'angles',
        step: 'brief',
        line: EDITOR_LINES.angles(editor.angles.length),
      },
      key,
    );
    await this.studio.updateEpisode(episode.id, { busy: null, error: null });
    this.deps.logger.log(
      `studio ${episode.id}: angles: ${editor.angles
        .slice(0, 3)
        .map((a) => `${a.total} "${a.question}"`)
        .join(' | ')}`,
    );
  }

  /** The research log for the whole show, with the web; a document its first source. Then the plan. */
  async research(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<void> {
    const editor = show.editor ?? EMPTY_EDITOR;
    progressNow({ says: 'Researching the topic' });
    const document = await this.documentFor(show, episode);
    const asked = [
      `The brief:\n${describeEditorBrief(show.brief)}`,
      describeQuestion(editor),
      document?.words ?? '',
    ];
    const answer = await this.llm.editorSearch({
      step: 'research',
      parts: asked,
    });
    await this.record(episode.id, answer.usage, 'explainer_research');
    let research = researchOf(
      answer.value.value,
      foundMap(answer.value.found),
      answer.usage.searches ?? 0,
    );
    if (!research.claims.length)
      throw new Error('The research came back empty');
    // A thin log (few dated events, no numbers, people with no claim, no
    // turning point told as a scene) is searched again once, and added to.
    const thin = researchProblems(research);
    if (thin.length) {
      this.deps.logger.log(
        `studio ${episode.id}: the research goes back: ${thin.join(' ')}`,
      );
      progressNow({ says: 'Researching deeper' });
      const more = await this.llm.editorSearch({
        step: 'research',
        parts: [
          ...asked,
          `The research log so far (add to it; never repeat it):\n${describeResearch(research)}`,
          `It is thin. Search for what it lacks and answer with only what is new: number new claims from c${research.claims.length + 1}, and cite the log's own claims by their ids where they hold.\n- ${thin.join('\n- ')}`,
        ],
        searches: DEEPER_SEARCHES,
      });
      await this.record(episode.id, more.usage, 'explainer_research');
      research = mergedResearch(
        research,
        researchOf(
          more.value.value,
          foundMap(more.value.found),
          more.usage.searches ?? 0,
          new Set(research.claims.map((c) => c.id)),
        ),
      );
    }
    await this.saveEditor(show.id, (now) => ({
      ...now,
      stage: 'research',
      research,
    }));
    const sources = new Set(
      research.claims.flatMap((c) => c.sources.map((s) => urlKey(s.url))),
    ).size;
    await this.log(
      show,
      episode,
      {
        what: 'research',
        step: 'brief',
        line: EDITOR_LINES.research(
          research.claims.length,
          sources,
          research.myths.length,
        ),
      },
      key,
    );
    this.deps.logger.log(
      `studio ${episode.id}: research: ${research.claims.length} claims (${research.claims.filter((c) => c.confidence === 'high').length} sure, ${research.claims.filter((c) => !c.sources.length).length} unsourced), ${sources} sources, ${research.searched} searches`,
    );
    await this.next(show, episode, 'plan');
  }

  /** The spine, the selection and the episode map, checked and put right by code. Then the world. */
  async plan(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<void> {
    const editor = show.editor;
    if (!editor?.research) throw new Error('No research to plan from');
    progressNow({ says: 'Planning the episodes' });
    const pace = editorPace(show.brief);
    const parts = [
      `The brief:\n${describeEditorBrief(show.brief)}`,
      describeQuestion(editor),
      `The research:\n${describeResearch(editor.research)}`,
      describePace(pace),
    ];
    const plan = await this.writePlan(parts, editor.research, episode.id, pace);
    const sound = soundPlan(plan, pace, editor.research);
    if (sound.fixed.length)
      this.deps.logger.log(
        `studio ${episode.id}: plan put right by code: ${sound.fixed.join('; ')}`,
      );
    const planned = withEpisode(sound.plan, 1, episode.id);
    await this.saveEditor(show.id, (now) => ({
      ...now,
      stage: 'plan',
      plan: planned,
    }));
    const kept = planned.items.filter((i) => i.decision !== 'cut').length;
    const minutes = planned.episodes.reduce((n, e) => n + e.minutes, 0);
    await this.log(
      show,
      episode,
      {
        what: 'plan',
        step: 'brief',
        line: EDITOR_LINES.plan(
          planned.episodes.length,
          planned.episodes.length ? minutes / planned.episodes.length : 0,
          kept,
          editor.research.claims.length,
        ),
      },
      key,
    );
    this.deps.logger.log(
      `studio ${episode.id}: plan: ${planned.episodes.map((e) => `${e.number}. "${e.title}" ${e.minutes} min`).join('; ')}`,
    );
    await this.next(show, episode, 'world');
  }

  /**
   * The plan written, and sent back once with what code found wrong (a
   * first episode short of three minutes while the research holds more,
   * among it); the better kept. `fill` is the research its episodes may
   * still draw on: all of it, or what the episodes made have not used.
   */
  private async writePlan(
    parts: string[],
    research: EditorResearch,
    episodeId: string,
    pace: EditorPace,
    fill: Pick<EditorResearch, 'claims'> = research,
  ): Promise<EditorPlan> {
    const wrong = (plan: EditorPlan) => [
      ...planProblems(plan),
      ...planLengthProblems(plan, pace, fill),
    ];
    const first = await this.llm.editorWrite({ step: 'plan', parts });
    await this.record(episodeId, first.usage, 'explainer_edit');
    let plan = planOf(first.value, research);
    const problems = wrong(plan);
    if (problems.length) {
      this.deps.logger.log(
        `studio ${episodeId}: the plan goes back: ${problems.join(' ')}`,
      );
      const again = await this.llm.editorWrite({
        step: 'plan',
        parts,
        previous: first.value,
        problems,
      });
      await this.record(episodeId, again.usage, 'explainer_edit');
      const second = planOf(again.value, research);
      if (second.episodes.length && wrong(second).length <= problems.length)
        plan = second;
    }
    if (!plan.episodes.length && !plan.items.length)
      throw new Error('The plan came back empty');
    return plan;
  }

  /** The look of the show's world, and the show's cast and sets for its illustrated scenes. Then episode 1's edit. */
  async world(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<void> {
    const editor = show.editor;
    if (!editor?.plan || !editor.research)
      throw new Error('No plan to draw the world for');
    progressNow({ says: 'Designing the world' });
    const answer = await this.llm.editorWrite({
      step: 'world',
      parts: [
        `The brief:\n${describeEditorBrief(show.brief)}`,
        describeQuestion(editor),
        `The plan:\n${describePlan(editor.plan)}`,
        // Its timeline too: where each dated event happened, with the
        // claims that say so, so every place of the world is a real one.
        `The research's look notes, people and places:\n${describeResearch({
          ...editor.research,
          claims: editor.research.claims.filter((c) =>
            ['name', 'event', 'date'].includes(c.kind),
          ),
          numbers: [],
          myths: [],
          perspectives: [],
          open: [],
        })}`,
      ],
    });
    await this.record(episode.id, answer.usage, 'explainer_edit');
    // Its places and people real ones, each with a claim of the research.
    const value = answer.value;
    const subject =
      (typeof value.subject === 'string' && value.subject.trim()) ||
      editor.question ||
      show.brief.idea;
    const made = worldOf(answer.value, editor.research);
    // How its people are drawn, chosen now with its world (tech §11):
    // characters for history and culture and the young, portraits and
    // silhouettes for the news, money, power and science.
    const world = {
      ...made,
      style: lookStyleFor({
        subject: `${subject} ${editor.question ?? ''}`,
        band: bandOf(show.brief) ?? 'general-adult',
        era: made.era,
      }),
    };
    // The show's cast and sets for its illustrated scenes, its host kept
    // as the show had them (on for children, as every explainer).
    const before = show.bible;
    const bible = withHost(
      worldBible(world, before, {
        subject: subject.slice(0, 80),
        maths: value.maths === true,
      }),
      before,
      hostOn(show.brief),
      show.id,
    ).bible;
    await this.studio.updateShow(show.id, { bible });
    await this.saveEditor(show.id, (now) => ({
      ...now,
      stage: 'world',
      world,
    }));
    await this.log(
      show,
      episode,
      {
        what: 'world',
        step: 'brief',
        line: EDITOR_LINES.world(
          world.era === 'today' ? 'today' : world.era.replace('-', '–'),
          world.places.length,
          world.people.length,
        ),
      },
      key,
    );
    // The first episode is the plan's first: its editing begins.
    const question = editor.plan.episodes[0]?.question ?? editor.question ?? '';
    await this.studio.updateEpisode(episode.id, {
      editorial: freshEditorial(1, question),
    });
    await this.next(show, episode, 'edit');
  }

  /**
   * The episodes not made yet planned again around what the maker asks
   * for: the research topped up for it, the plan written again with the
   * made episodes kept exactly as they are; this episode is the first of
   * the new ones. Then its edit.
   */
  async replan(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request: string,
    key?: string,
  ): Promise<void> {
    const editor = show.editor;
    if (!editor?.research || !editor.plan)
      throw new Error('No plan to plan again');
    progressNow({ says: 'Researching what you asked for' });
    const more = await this.llm.editorSearch({
      step: 'research',
      parts: [
        `The brief:\n${describeEditorBrief(show.brief)}`,
        describeQuestion(editor),
        `The show is researched already. Research only this, to add to it: ${request}`,
        `What the research has already (do not repeat it):\n${describeResearch(
          editor.research,
        )
          .split('\n')
          .slice(0, 60)
          .join('\n')}`,
      ],
      searches: TOP_UP_SEARCHES,
    });
    await this.record(episode.id, more.usage, 'explainer_research');
    const research = mergedResearch(
      editor.research,
      researchOf(
        more.value.value,
        foundMap(more.value.found),
        more.usage.searches ?? 0,
      ),
    );
    progressNow({ says: 'Planning the next episodes' });
    const kept = editor.plan.episodes.filter((e) => e.episodeId);
    const pace = editorPace(show.brief);
    // What the episodes made have said already is not theirs to fill with.
    const said = new Set(
      kept.flatMap((e) =>
        e.covers.flatMap((k) => editor.plan!.items[k]?.claims ?? []),
      ),
    );
    const fill = { claims: research.claims.filter((c) => !said.has(c.id)) };
    const plan = await this.writePlan(
      [
        `The brief:\n${describeEditorBrief(show.brief)}`,
        describeQuestion(editor),
        `The research:\n${describeResearch(research)}`,
        `The show's plan so far:\n${describePlan(editor.plan)}`,
        kept.length
          ? `The episodes made or begun already, kept exactly as they are: ${kept.map((e) => `${e.number}. "${e.title}"`).join('; ')}. Plan only the episodes after them.`
          : '',
        `The maker asks for more: ${request}. Plan the episodes still to come around it.`,
        describePace(pace),
      ],
      research,
      episode.id,
      pace,
      fill,
    );
    const fresh = soundPlan(plan, pace, fill).plan;
    const joined = withEpisode(
      joinedPlan(editor.plan, fresh),
      kept.length + 1,
      episode.id,
    );
    await this.saveEditor(show.id, (now) => ({
      ...now,
      research,
      plan: joined,
    }));
    const number = kept.length + 1;
    const ours = joined.episodes.find((e) => e.number === number);
    await this.studio.updateEpisode(episode.id, {
      editorial: freshEditorial(number, ours?.question ?? request),
    });
    await this.log(
      show,
      episode,
      {
        what: 'plan',
        step: 'brief',
        line: EDITOR_LINES.replan(
          request,
          joined.episodes.length - kept.length,
        ),
      },
      key,
    );
    await this.next(show, episode, 'edit');
  }

  // ── An episode ──────────────────────────────────────────────────────────

  /**
   * An episode written as an editor writes one: its beat sheet, its hooks,
   * the whole two-column script, the editor's read and one revision, the
   * fact check, its scenes cut, its package. Kept after each step, so a
   * try after a failure carries on where the last stopped. With a
   * request, the maker's change: the script written again with it.
   */
  async edit(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
    request?: string,
  ): Promise<void> {
    const editor = show.editor;
    if (!editor?.plan || !editor.research)
      throw new Error('No plan to write the episode from');
    const research = editor.research;
    const plan = editor.plan;
    const world = editor.world;
    const pace = editorPace(show.brief);
    const number =
      plan.episodes.find((e) => e.episodeId === episode.id)?.number ??
      episode.editorial?.number ??
      Math.min(episode.number, Math.max(1, plan.episodes.length));
    const planned = plan.episodes.find((e) => e.number === number);
    let editorial: StudioEditorial =
      episode.editorial ?? freshEditorial(number, planned?.question ?? '');
    // A change asked of a written script: written again from the script.
    if (request && editorial.rows.length)
      editorial = {
        ...editorial,
        stage: 'hooks',
        request,
        facts: null,
        package: null,
      };
    const keep = async (patch: Partial<StudioEditorial>) => {
      editorial = { ...editorial, ...patch };
      await this.studio.updateEpisode(episode.id, { editorial });
    };
    const known = new Set(research.claims.map((c) => c.id));
    const earlier = await this.earlierEditorials(show, episode);
    const base = [
      `The brief:\n${describeEditorBrief(show.brief)}`,
      describeQuestion(editor),
      `The show's plan:\n${describePlan(plan)}`,
      `This episode:\n${describePlannedEpisode(plan, number)}`,
    ];

    // The length it is written to: its material's, three to five minutes.
    const target = episodeTarget(plan, number, pace.wpm);
    // What holds it concrete: the episode's people, the names, the places, the numbers.
    const concrete = concreteContext(research, plan, number, world ?? null);

    // The beat sheet: acts, seconds from the material, words by code.
    if (!editorial.beats) {
      progressNow({ says: 'Laying out the beat sheet' });
      const due = {
        plants: planned?.plants.map((p) => p.id) ?? [],
        payoffs: plan.episodes
          .filter((e) => e.number < number)
          .flatMap((e) => e.plants.filter((p) => p.paidIn === number))
          .map((p) => p.id),
      };
      const parts = [
        ...base,
        target
          ? `Its length: about ${target.seconds} seconds of material (about ${Math.round((target.seconds / 60) * 2) / 2} minutes): lay the acts out to it, their seconds adding up to about ${target.seconds}.`
          : '',
        describePace(pace),
      ];
      const first = await this.llm.editorWrite({ step: 'beats', parts });
      await this.record(episode.id, first.usage, 'explainer_edit');
      let beats = budgetBeats(beatsOf(first.value), pace);
      const problems = beatProblems(beats, due);
      if (problems.length) {
        const again = await this.llm.editorWrite({
          step: 'beats',
          parts,
          previous: first.value,
          problems,
        });
        await this.record(episode.id, again.usage, 'explainer_edit');
        const second = budgetBeats(beatsOf(again.value), pace);
        if (
          second.acts.length &&
          beatProblems(second, due).length <= problems.length
        )
          beats = second;
      }
      if (!beats.acts.length) throw new Error('The beat sheet came back empty');
      // Laid out to the episode's planned length by code, then its words.
      await keep({
        beats: budgetBeats(splitLongActs(fitBeats(beats, target)), pace),
        stage: 'beats',
      });
    }
    const beats = editorial.beats!;

    // The hooks: five drafted and judged, the best made one.
    if (!editorial.hook) {
      progressNow({ says: 'Drafting the hooks' });
      // The whole log: its turning points and people are where a hook's
      // picture comes from.
      const parts = [
        ...base,
        `The beat sheet:\n${describeBeats(beats)}`,
        `The research:\n${describeResearch(research)}`,
        earlier.length
          ? `The episodes before (for the "last time" line):\n${describeEarlierScripts(earlier)}`
          : '',
      ];
      const first = await this.llm.editorWrite({ step: 'hooks', parts });
      await this.record(episode.id, first.usage, 'explainer_edit');
      let hooks = hooksOf(first.value, known);
      const problems = hookProblems(
        hooks.hook ?? '',
        hooks.claims,
        research,
        concrete.people,
      );
      if (problems.length) {
        const again = await this.llm.editorWrite({
          step: 'hooks',
          parts,
          previous: first.value,
          problems,
        });
        await this.record(episode.id, again.usage, 'explainer_edit');
        const second = hooksOf(again.value, known);
        if (
          second.hook &&
          hookProblems(second.hook, second.claims, research, concrete.people)
            .length <= problems.length
        )
          hooks = second;
      }
      if (!hooks.hook) throw new Error('No hook came back');
      await keep({
        hooks: hooks.hooks,
        hook: mendHook(hooks.hook),
        hookClaims: hooks.claims,
        stage: 'hooks',
      });
    }
    const hook = editorial.hook!;
    // Its length, as the beat sheet gives it: the material's, in words and rows.
    const perRow = rowWords(pace);
    const scriptParts = [
      ...base,
      concrete.cast.length
        ? `The people of this episode, each named where they act, at least once: ${concrete.cast.join(', ')}.`
        : '',
      `The beat sheet:\n${describeBeats(beats)}`,
      `Its length: about ${Math.round(beats.seconds)} seconds, about ${beats.words} spoken words, so about ${Math.round(beats.words / perRow)} rows of one sentence each (about ${perRow} words a row). Write every act out in full, to its words.`,
      `The hook (open with it, as written):\n${hook}`,
      `The research:\n${describeResearch(research)}`,
      world ? `The world:\n${describeWorld(world)}` : '',
      describePace(pace),
      earlier.length
        ? `The episodes before, for exact callbacks and the "last time" line:\n${describeEarlierScripts(earlier)}`
        : '',
    ];
    const ctx = { research, pace, beats, world: world ?? null, concrete };

    // The whole script, in one pass: two columns at once.
    if (editorial.stage === 'beats' || editorial.stage === 'hooks') {
      progressNow({ says: 'Writing the script' });
      const first = await this.llm.editorWrite({
        step: 'script',
        parts: scriptParts,
        ...(editorial.request && editorial.rows.length
          ? { previous: { rows: editorial.rows }, request: editorial.request }
          : {}),
      });
      await this.record(episode.id, first.usage, 'explainer_edit');
      let rows = rowsOf(first.value.rows, known, beats.acts.length);
      // An answer whose rows did not come back in shape (seen once: the
      // whole list made sound to nothing) is asked for once more.
      if (!rows.length) {
        const again = await this.llm.editorWrite({
          step: 'script',
          parts: scriptParts,
        });
        await this.record(episode.id, again.usage, 'explainer_edit');
        rows = rowsOf(again.value.rows, known, beats.acts.length);
      }
      if (!rows.length) throw new Error('The script came back empty');
      await keep({ rows, notes: [], stage: 'script' });
    }

    // The editor's read, and the one revision.
    if (editorial.stage === 'script') {
      progressNow({ says: 'Reading the script as an editor' });
      const found = codeNotes(editorial.rows, ctx, editorial.question);
      const read = await this.llm.editorWrite({
        step: 'read',
        parts: [
          ...base,
          `The beat sheet:\n${describeBeats(beats)}`,
          `The research's claims:\n${describeResearch(research, known)}`,
          `The script:\n${describeRows(editorial.rows)}`,
          found.length ? `What code found:\n- ${found.join('\n- ')}` : '',
        ],
      });
      await this.record(episode.id, read.usage, 'explainer_edit');
      const notes = notesOf(read.value);
      progressNow({ says: 'Revising the script' });
      // Its length is kept with new matter, never with the repeats the
      // read cut (Richard: as much of the research as fits, 3–5 minutes):
      // the claims of the episode not yet said go with the revision.
      const fresh = unusedClaims(
        plan,
        research,
        number,
        editorial.rows,
        earlier,
      );
      const length = `Keep the script at about ${beats.words} spoken words (the draft says ${spokenWords(editorial.rows)}). Wherever a note asks you to cut or merge a repeated idea, put a NEW point in its place, one row each, from the episode's claims not yet used${fresh.length ? ` (${fresh.join(', ')})` : ''}, each where it belongs in the story's order.`;
      const again = await this.llm.editorWrite({
        step: 'script',
        parts: fresh.length
          ? [
              ...scriptParts,
              `The episode's claims not yet used:\n${describeResearch(research, new Set(fresh))}`,
            ]
          : scriptParts,
        previous: { rows: editorial.rows },
        problems: [...notes, ...found, length],
      });
      await this.record(episode.id, again.usage, 'explainer_edit');
      const revised = rowsOf(again.value.rows, known, beats.acts.length);
      // A revision that lost most of the script is no revision: the draft stands.
      const rows =
        revised.length >= Math.ceil(editorial.rows.length * 0.6)
          ? revised
          : editorial.rows;
      // Mended silently: a stage direction still in it said as what it
      // means, or dropped, never voiced; a row said again nearly word for
      // word dropped; its sentences and words; its scenes people in
      // places, never a lone shot between lesson rows.
      const plain = withoutDirections(rows, ctx);
      let once = withoutRepeats(plain.rows);
      const said = [...plain.fixed, ...once.fixed];
      if (said.length)
        this.deps.logger.log(`studio ${episode.id}: ${said.join('; ')}`);
      // Still well short of its length once the repeats are gone, while the
      // research holds more: filled once, with new rows of unused claims
      // put where they belong, every other row left as it is.
      const have = spokenWords(once.rows);
      const more = unusedClaims(plan, research, number, once.rows, earlier);
      if (have < beats.words * 0.85 && more.length) {
        progressNow({ says: 'Filling the script out' });
        const rowsShort = Math.max(
          1,
          Math.round((beats.words - have) / Math.max(1, rowWords(pace))),
        );
        const filled = await this.llm.editorWrite({
          step: 'script',
          parts: [
            ...scriptParts,
            `The episode's claims not yet used:\n${describeResearch(research, new Set(more))}`,
          ],
          previous: { rows: once.rows },
          problems: [
            `The script is about ${beats.words - have} spoken words short of its length (${have} of about ${beats.words}). Add about ${rowsShort} new rows, each one NEW point from the episode's claims not yet used (${more.join(', ')}), each placed where it belongs in the story's order, each with its own picture. Keep every other row exactly as it is, word for word. Never say an idea the script already says.`,
          ],
        });
        await this.record(episode.id, filled.usage, 'explainer_edit');
        const longer = withoutRepeats(
          withoutDirections(
            rowsOf(filled.value.rows, known, beats.acts.length),
            ctx,
          ).rows,
        );
        if (
          spokenWords(longer.rows) > have &&
          longer.rows.length >= once.rows.length
        ) {
          this.deps.logger.log(
            `studio ${episode.id}: filled out from ${have} to ${spokenWords(longer.rows)} words`,
          );
          once = longer;
        }
      }
      const scenes = soundScenes(mendRows(once.rows, ctx).rows, world ?? null);
      if (scenes.fixed)
        this.deps.logger.log(
          `studio ${episode.id}: ${scenes.fixed} scene rows made the lesson's`,
        );
      await keep({ rows: scenes.rows, notes, stage: 'read' });
    }

    // The fact check: every claim the script uses, with the web.
    if (editorial.stage === 'read') {
      progressNow({ says: 'Checking the facts' });
      const used = new Set(editorial.rows.flatMap((r) => r.claims));
      let facts = editorial.facts ?? [];
      let checked = research;
      let rows = editorial.rows;
      if (used.size) {
        const answer = await this.llm.editorSearch({
          step: 'facts',
          parts: [
            describeQuestion(editor),
            `The script, its rows numbered from 0:\n${describeRowsFromZero(editorial.rows)}`,
            `The claims it uses:\n${describeResearch(research, used)}`,
          ],
          searches: Math.min(
            Number(this.deps.setting('EXPLAINER_FACTS_SEARCHES') ?? 20) || 20,
            used.size * 2,
          ),
        });
        await this.record(episode.id, answer.usage, 'explainer_research');
        const pages = foundMap(answer.value.found);
        facts = factsOf(answer.value.value, used, editorial.rows.length).map(
          (fact) => ({
            ...fact,
            sources: fact.sources.filter((s) => pages.has(urlKey(s.url))),
          }),
        );
        const applied = applyFacts(editorial.rows, facts, research);
        checked = applied.research;
        rows = mendRows(applied.rows, ctx).rows;
        this.deps.logger.log(
          `studio ${episode.id}: facts: ${facts.length} checked, ${applied.softened} rows softened, ${applied.cut} cut`,
        );
      }
      // What the check found, kept on the show's research: its claims' status.
      await this.saveEditor(show.id, (now) => ({
        ...now,
        research: now.research
          ? {
              ...now.research,
              claims: now.research.claims.map(
                (c) => checked.claims.find((o) => o.id === c.id) ?? c,
              ),
            }
          : now.research,
      }));
      await keep({ rows, facts, stage: 'facts' });
    }

    // Cut into scenes: the Studio's own outline, so the boards, the voice
    // and the player work on it as on any explainer's.
    progressNow({ says: 'Cutting the script into scenes' });
    const rows = world?.places.length
      ? editorial.rows
      : // No place to set a scene in: what would have been one is a lesson's.
        editorial.rows.map((r) =>
          r.visual === 'scene' ? { ...r, visual: 'why' as const } : r,
        );
    const title = planned?.title ?? `Episode ${number}`;
    const outline = editorOutline({
      title,
      question: editorial.question || planned?.question || '',
      rows,
      beats,
      world: world ?? null,
      wpm: pace.wpm,
      // Illustrated scenes when switched on (STUDIO_ILLUSTRATED); off, a
      // scene row is a lesson's, its board drawing the moment.
      illustrated: illustratedSwitchOn(this.deps.setting('STUDIO_ILLUSTRATED')),
    });
    if (!outline.scenes.length) throw new Error('The script cut into nothing');
    await keep({ rows, stage: 'board' });

    // The package: what goes with the film when it is shared.
    if (!editorial.package) {
      progressNow({ says: 'Writing the title and description' });
      try {
        const answer = await this.llm.editorWrite({
          step: 'package',
          parts: [
            `The brief:\n${describeEditorBrief(show.brief)}`,
            describeQuestion(editor),
            `This episode:\n${describePlannedEpisode(plan, number)}`,
            `The script, its rows numbered from 0:\n${describeRowsFromZero(rows)}`,
            describeLeftOut(plan),
          ],
        });
        await this.record(episode.id, answer.usage, 'explainer_edit');
        editorial = {
          ...editorial,
          package: soundPackage(
            packageOf(answer.value, rows.length),
            plan.leftOut,
          ),
        };
      } catch (error) {
        // A film is never held up for its description.
        this.deps.logger.warn(
          `studio ${episode.id}: no package: ${(error as Error).message}`,
        );
      }
    }
    const done: StudioEditorial = { ...editorial, stage: 'ready' };
    delete done.request;
    await this.studio.updateEpisode(episode.id, {
      editorial: done,
      outline,
      title,
      logline: outline.logline,
      phase: 'outline',
      busy: null,
      error: null,
    });
    // The show's title, from its first episode, where the maker gave none.
    if (number === 1 && (!show.title || show.title === 'New show'))
      await this.studio.updateShow(show.id, {
        title: (done.package?.title || title).slice(0, 120),
      });
    if (editor.stage !== 'ready')
      await this.saveEditor(show.id, (now) => ({ ...now, stage: 'ready' }));
    const seconds = outline.scenes.reduce((n, s) => n + s.seconds, 0);
    await this.log(
      show,
      episode,
      {
        what: 'editorial',
        step: 'outline',
        line: EDITOR_LINES.editorial(number, title, seconds, rows.length),
      },
      key,
    );
    // The producer says it is ready, with the next step as buttons.
    await this.studio
      .addMessage({
        ...(key ? { id: keyedMessageId(show.id, `${key}:ready`) } : {}),
        showId: show.id,
        episodeId: episode.id,
        role: 'assistant',
        content: `The script for episode ${number} is ready: “${title}”, about ${Math.max(1, Math.round(seconds / 60))} minutes. Read it in two columns, or I can make it now.`,
        meta: { choices: ['Make it', 'Read the script'] },
      })
      .catch(() => undefined);
    this.deps.logger.log(
      `studio ${episode.id}: edited episode ${number}: ${rows.length} rows, ${outline.scenes.length} scenes (${outline.scenes.filter(isIllustrated).length} illustrated), about ${seconds}s`,
    );
  }

  /** The editorials of the show's episodes before this one, in order: for callbacks and the "last time" line. */
  private async earlierEditorials(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<StudioEditorial[]> {
    return (await this.studio.listEpisodes(show.id))
      .filter(
        (e) =>
          e.id !== episode.id &&
          !e.twinOf &&
          e.editorial?.rows.length &&
          e.editorial.number < (episode.editorial?.number ?? episode.number),
      )
      .sort((a, b) => a.editorial!.number - b.editorial!.number)
      .map((e) => e.editorial!);
  }

  // ── Boards ──────────────────────────────────────────────────────────────

  /**
   * An editor's episode's scenes boarded, a few at once (the script job):
   * each lesson scene's storyboard and each illustrated scene's shots, on
   * the rows it is, its words never changed. True once every scene has a
   * sheet.
   */
  async boards(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<number> {
    const outline = episode.outline;
    const editorial = episode.editorial;
    if (!outline?.editor || !editorial) throw new Error('No script to board');
    const bible = show.bible ?? EMPTY_BIBLE_FOR(show);
    const rows = await this.studio.replaceScenes(
      episode.id,
      outline.scenes.length,
    );
    // Lesson scenes boarded as shots (EXPLAINER_SHOTS): decided here, once,
    // and kept on each sheet, so the make follows the sheet, not the switch.
    const shots = shotsSwitchOn(this.deps.setting('EXPLAINER_SHOTS'));
    // The picture desk's one pass for the episode (WP11), before any scene
    // is boarded, so every scene is offered what cleared.
    const pictures = shots ? await this.pictureDesk(show, episode) : null;
    const credits: string[] = [];
    let k = 0;
    const lanes = Array.from(
      { length: Math.min(BOARDERS, rows.length) },
      async () => {
        while (k < rows.length) {
          const at = k++;
          const scene = outline.scenes[at];
          progressNow({ says: `Boarding scene ${at + 1}`, scene: at });
          try {
            if (isIllustrated(scene))
              await this.illustratedBoard(show, episode, bible, rows[at], at);
            else if (shots) {
              const sheet = await this.shotsBoard(
                show,
                episode,
                bible,
                rows[at],
                at,
                pictures,
              );
              if (sheet.shots && sheet.registry)
                credits.push(
                  ...pictureCredits(sheet.shots, registryOf(sheet.registry)),
                );
            } else await this.lessonBoard(show, episode, bible, rows[at], at);
          } catch (error) {
            // A board that cannot be had is a plain one, never a hole in
            // the film: its lines said over what they name.
            this.deps.logger.warn(
              `studio ${episode.id} s${at + 1}: boarded plainly: ${(error as Error).message}`,
            );
            await this.plainBoard(show, episode, bible, rows[at], at, shots);
          }
          progressNow({ scene: at, done: true });
        }
      },
    );
    await Promise.all(lanes);
    if (shots) await this.creditPictures(episode, credits);
    return rows.length;
  }

  /**
   * The picture desk's pass for an episode (WP11): its people's portraits
   * and photos, its places' photos, its key events' and the things its
   * lines name, cleared and kept; null when there is no desk, it is
   * switched off (PICTURE_DESK=off), or it cannot be reached, which never
   * holds a film up.
   */
  async pictureDesk(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<EpisodePictures | null> {
    const desk = this.deps.pictures;
    if (
      !desk ||
      /^(?:off|false|0|no)$/iu.test(this.deps.setting('PICTURE_DESK') ?? '')
    )
      return null;
    progressNow({ says: 'Finding archive pictures' });
    const calls: LlmUsage[] = [];
    try {
      const pictures = await deskPass(
        desk,
        {
          rows: episode.editorial?.rows ?? [],
          research: show.editor?.research ?? null,
          world: show.editor?.world ?? null,
        },
        {
          log: (message) =>
            this.deps.logger.log(`studio ${episode.id}: ${message}`),
          // The desk's look at each picture it takes is a model call: in the ledger.
          onUsage: (usage) => calls.push(usage),
        },
      );
      for (const usage of calls)
        await this.record(episode.id, usage, 'picture_focus');
      const counts = countsOf(pictures);
      this.deps.logger.log(
        `studio ${episode.id}: the picture desk cleared ${pictures.entries.length} picture${pictures.entries.length === 1 ? '' : 's'} (${counts.portraits} portraits, ${counts.person} more of people, ${counts.place} of places, ${counts.event} of events, ${counts.thing} of things)`,
      );
      return pictures;
    } catch (error) {
      this.deps.logger.warn(
        `studio ${episode.id}: no pictures: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * The episode's description with the full credit of every picture its
   * film shows at its foot (research §3.4: TASL credits in the
   * description), replacing any list an earlier board left.
   */
  private async creditPictures(
    episode: StudioEpisodeRecord,
    credits: readonly string[],
  ): Promise<void> {
    const now = (await this.studio.findEpisode(episode.id)) ?? episode;
    const editorial = now.editorial;
    const pack = editorial?.package;
    if (!editorial || !pack) return;
    const description = withPictureCredits(pack.description, credits);
    if (description === pack.description) return;
    await this.studio.updateEpisode(episode.id, {
      editorial: { ...editorial, package: { ...pack, description } },
    });
  }

  /**
   * A scene boarded by code alone, when its board cannot be had: a
   * lesson's lines over what the research can show truthfully of them
   * (plainLesson: a number, a place on the show's map, exact words), never
   * a keyword card; an illustrated scene's narration in its place, its
   * people there.
   */
  private async plainBoard(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    bible: StudioBible,
    row: StudioSceneRecord,
    k: number,
    /** Lesson scenes are boarded as shots (EXPLAINER_SHOTS). */
    shots = false,
  ): Promise<void> {
    const scene = episode.outline!.scenes[k];
    const lines = this.rowsOf(episode, scene);
    // A shots scene by code alone: every line its safe shot, never a card.
    if (shots && !isIllustrated(scene)) {
      const safe = safePlan({
        rows: lines,
        research: show.editor?.research ?? null,
        world: show.editor?.world ?? null,
      });
      const sheet = shotsSheet(
        scene,
        lines,
        safe.plan,
        safe.registry.entries(),
      );
      await this.studio.updateScene(row.id, {
        sheet,
        sheetHash: sceneFingerprint(sheet, bible, show.brief),
        problems: [],
        status: 'ready',
        error: null,
      });
      return;
    }
    const sheet = isIllustrated(scene)
      ? plainShots(scene, lines, bible)
      : plainLesson(scene, lines, show.editor);
    await this.studio.updateScene(row.id, {
      sheet,
      sheetHash: sceneFingerprint(sheet, bible, show.brief, []),
      problems: [],
      status: 'ready',
      error: null,
    });
  }

  /** The lines a scene says: its rows, in order. */
  private rowsOf(
    episode: StudioEpisodeRecord,
    scene: OutlineScene,
  ): EditorialRow[] {
    const all = episode.editorial?.rows ?? [];
    return scene.rows ? all.slice(scene.rows[0], scene.rows[1] + 1) : [];
  }

  /** A lesson scene's storyboard on its written lines, held to the lesson checks and sent back once. */
  async lessonBoard(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    bible: StudioBible,
    row: StudioSceneRecord,
    k: number,
  ): Promise<ExplainerSheet> {
    const outline = episode.outline!;
    const scene = outline.scenes[k];
    const lines = this.rowsOf(episode, scene);
    const world = show.editor?.world ?? null;
    const stage = stageOf(show.brief);
    const recipe = recipeOf(show.brief);
    const parts = [
      `Document: ${show.title}`,
      `Chapter: ${outline.title}`,
      // Whom it is for: the narration is written, so no word budget.
      `Whom it teaches: ${show.brief.audience ?? 'adults'}${recipe ? `. ${recipe.pictures}` : ''}`,
      `This is scene ${k + 1} of ${outline.scenes.length} of "${outline.title}", about ${scene.seconds} seconds.${k === 0 ? ' It opens the episode.' : ''}`,
      // A moment of people in a place is shown by what is real in it,
      // never a drawing of them or of the place (explainer-animation-plan
      // §10).
      `The lines, one beat each, word for word, with what the editor wants seen:\n${lines.map((r, i) => `${i + 1}. SAY: ${r.say}\n   SHOW: ${r.show || '(your choice)'} [${r.visual}]${r.visual === 'scene' ? ' (a moment of the story: show what is real in it, where it happened as the show’s map with the place pinned, a document, a number, exact words as a quote; never a drawing of people or of a place, never a keyword card)' : ''}`).join('\n')}`,
      world ? `The show's world and colours:\n${describeWorld(world)}` : '',
      `The page:\n${scene.teach ?? ''}`,
    ];
    // Mended in the show's colours: each thing its palette names keeps its token.
    const options = {
      teach: scene.teach,
      source: null,
      stage,
      maths: bible.maths,
      planned: scene.seconds,
      ...worldColours(world),
    };
    const first = await this.llm.editorBoard({ kind: 'lesson', parts });
    await this.record(episode.id, first.usage, 'explainer_board');
    // On its written lines and the playbook's pace, every moment at a real
    // place the show's map with the place pinned (never a drawing of it,
    // never a word card), and every map on the show's one map, in its
    // colours.
    const sheetOf = (draft: unknown) =>
      onShowMap(
        explainerSheetOf({
          kind: 'explainer',
          title: scene.title,
          transition: 'cut',
          draft: drawnMoments(onTheLines(draft, lines), lines, world),
        }),
        world,
      );
    let sheet = sheetOf(first.value);
    let problems: SheetProblem[] = checkExplainer(sheet, options).problems;
    if (errorsIn(problems).length) {
      const again = await this.llm.editorBoard({
        kind: 'lesson',
        parts,
        previous: first.value,
        problems: errorsIn(problems).map((p) => p.message),
      });
      await this.record(episode.id, again.usage, 'explainer_board');
      const next = sheetOf(again.value);
      const left = checkExplainer(next, options).problems;
      if (worse(left, problems) <= 0) [sheet, problems] = [next, left];
    }
    // What the board still got wrong is left out, never handed back.
    if (errorsIn(problems).length) {
      sheet = repairExplainer(sheet, options);
      problems = checkExplainer(sheet, options).problems;
    }
    // A board left showing nothing at all is the plain one: what the
    // research can show of its lines, never an empty stage or a card.
    if (!checkExplainer(sheet, options).script.steps.some((s) => s.stage)) {
      sheet = plainLesson(scene, lines, show.editor);
      problems = checkExplainer(sheet, options).problems;
    }
    await this.studio.updateScene(row.id, {
      sheet,
      sheetHash: sceneFingerprint(sheet, bible, show.brief),
      problems,
      status: 'ready',
      error: null,
    });
    return sheet;
  }

  /**
   * A lesson scene boarded as shots (EXPLAINER_SHOTS; explainer-animation-
   * tech §4.1): the plan of shots on its written lines, named from closed
   * lists and the scene's registry, checked, sent back once and mended
   * (shots/shot-board); its sheet keeps the beats word for word, the plan,
   * the registry and each line's claims, with no things and no steps.
   */
  async shotsBoard(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    bible: StudioBible,
    row: StudioSceneRecord,
    k: number,
    /** The episode's pictures (pictureDesk), of which the scene is offered what is about it. */
    pictures: EpisodePictures | null = null,
  ): Promise<ExplainerSheet> {
    const outline = episode.outline!;
    const scene = outline.scenes[k];
    const lines = this.rowsOf(episode, scene);
    const board = await boardShots(
      {
        rows: lines,
        research: show.editor?.research ?? null,
        world: show.editor?.world ?? null,
        // The show's look decides the kit: characters or silhouettes.
        look:
          showLookStyle(show.brief, show.editor?.world, show.bible) ??
          'editorial',
        pictures: picturesFor(lines, pictures),
        scene: {
          index: k,
          of: outline.scenes.length,
          title: scene.title,
          seconds: scene.seconds,
          episode: outline.title,
        },
        audience: show.brief.audience,
      },
      this.llm,
    );
    for (const usage of board.usage)
      await this.record(episode.id, usage, 'explainer_shots');
    if (board.problems.length)
      this.deps.logger.log(
        `studio ${episode.id} s${k + 1}: shots mended: ${board.problems
          .slice(0, 6)
          .map((p) => p.code)
          .join(', ')}${board.sentBack ? ' (sent back once)' : ''}`,
      );
    const sheet = shotsSheet(
      scene,
      lines,
      board.plan,
      board.registry.entries(),
    );
    await this.studio.updateScene(row.id, {
      sheet,
      sheetHash: sceneFingerprint(sheet, bible, show.brief),
      problems: [],
      status: 'ready',
      error: null,
    });
    return sheet;
  }

  /** An illustrated scene's narrated shots on its written lines: a story's sheet, checked, sent back once and repaired. */
  async illustratedBoard(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    given: StudioBible,
    row: StudioSceneRecord,
    k: number,
  ): Promise<StorySheet> {
    const outline = episode.outline!;
    const scene = outline.scenes[k];
    const lines = this.rowsOf(episode, scene);
    const world = show.editor?.world ?? null;
    const set =
      (scene.set && given.sets.find((s) => s.id === scene.set)?.id) ??
      given.sets[0]?.id ??
      '';
    const place = world?.places.find((p) => p.id === set);
    const people = given.characters.filter(
      (c) => !c.host && (scene.cast.includes(c.id) || !scene.cast.length),
    );
    const parts = [
      `Set: ${set}${place ? ` (${place.name}: ${place.look}; usually seen at ${place.time})` : ''}`,
      `People here: ${scene.cast.join(', ') || 'none named: a few people of the world, or none'}`,
      `The world's people (by id):\n${people.map((c) => `- ${c.id}: ${c.name}; looks: ${c.look}`).join('\n') || '- none'}`,
      world ? `Era: ${world.era}` : '',
      `About ${scene.seconds} seconds of shots.`,
      `The narration, in order, each line with what is seen while it is said:\n${lines.map((r, i) => `${i + 1}. ${r.say}\n   SHOW: ${r.show}`).join('\n')}`,
    ];
    const first = await this.llm.editorBoard({ kind: 'illustrated', parts });
    await this.record(episode.id, first.usage, 'explainer_board');
    const judge = (sheet: StorySheet) =>
      checkSheet(
        sheet,
        withFound(given, sheet.set, mendSheet(sheet, given, null)),
        scene.seconds,
        null,
        null,
        show.brief.audience,
      );
    let sheet = narratedSheet(storySheetOf(first.value), lines, set, given);
    let problems = judge(sheet);
    if (errorsIn(problems).length) {
      const again = await this.llm.editorBoard({
        kind: 'illustrated',
        parts,
        previous: first.value,
        problems: errorsIn(problems).map((p) => p.message),
      });
      await this.record(episode.id, again.usage, 'explainer_board');
      const next = narratedSheet(storySheetOf(again.value), lines, set, given);
      const left = judge(next);
      if (worse(left, problems) <= 0) [sheet, problems] = [next, left];
    }
    if (errorsIn(problems).length) {
      sheet = narratedSheet(
        repairSheet(sheet, given, null, null),
        lines,
        set,
        given,
      );
      problems = judge(sheet);
    }
    // A feature its words name joins its set for good, as a story's does.
    const found = mendSheet(sheet, given, null);
    if (found.features.length || found.things.length) {
      const grown = withFound(given, sheet.set, found);
      await this.studio.updateShow(show.id, { bible: grown });
      given.sets.splice(0, given.sets.length, ...grown.sets);
      if (grown.things) given.things = grown.things;
    }
    await this.studio.updateScene(row.id, {
      sheet,
      sheetHash: sceneFingerprint(sheet, given, show.brief, []),
      problems,
      status: 'ready',
      error: null,
    });
    return sheet;
  }

  // ── After the film is made ──────────────────────────────────────────────

  /**
   * An editor's episode made: the producer says so, and offers the plan's
   * next episodes (each by its title) or something else; when the map is
   * used up, the whole show as one film. Once a film.
   */
  async afterMade(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    film: string,
  ): Promise<void> {
    const plan = show.editor?.plan;
    if (!plan || !episode.editorial) return;
    const number = episode.editorial.number;
    const waiting = plan.episodes.filter((e) => !e.episodeId);
    const content = waiting.length
      ? `Episode ${number} is ready. There's more to tell:`
      : `Episode ${number} is ready, and that's the whole story told. You can download the whole show as one film.`;
    const choices = waiting.length
      ? [
          ...waiting.slice(0, 4).map((e) => e.title.slice(0, 40)),
          'Something else',
        ]
      : ['Download the whole show'];
    await this.studio
      .addMessage({
        id: keyedMessageId(show.id, `editor-more:${episode.id}:${film}`),
        showId: show.id,
        episodeId: episode.id,
        role: 'assistant',
        content,
        meta: { choices },
      })
      .catch((error: Error) =>
        this.deps.logger.warn(
          `studio ${episode.id}: not said: ${error.message}`,
        ),
      );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** The next of the show's planning set going on its first episode, under its own name. */
  private async next(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    kind: 'plan' | 'world' | 'edit',
  ): Promise<void> {
    await this.studio.updateEpisode(episode.id, { busy: kind, error: null });
    await this.deps.queue.enqueueStudio([
      {
        kind,
        showId: show.id,
        episodeId: episode.id,
        userId: show.userId,
      },
    ]);
  }

  /** The show's editor changed as it is now, never as this job first read it: another job may have moved it on. */
  private async saveEditor(
    showId: string,
    change: (now: StudioEditor) => StudioEditor,
  ): Promise<void> {
    const now = (await this.studio.findShow(showId))?.editor ?? EMPTY_EDITOR;
    await this.studio.updateShow(showId, { editor: change(now) });
  }

  /** What the maker said in the thread before the planning began: their words, for the angles. */
  private async makerSaid(show: StudioShowRecord): Promise<string> {
    const thread = await this.studio
      .listMessages(show.id, 30)
      .catch((): Awaited<ReturnType<StudioRepository['listMessages']>> => []);
    return thread
      .filter((m) => m.role === 'user' && m.content.length < 900)
      .map((m) => `- ${m.content}`)
      .slice(-8)
      .join('\n');
  }

  /**
   * A show made from a document: its pages for this episode, the research's
   * first source, each claim from them cited by page. Null for none, or
   * pages that cannot be read.
   */
  private async documentFor(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<{ words: string } | null> {
    const document = show.brief.document;
    const pick = episode.pages ?? (document ? { ...document } : null);
    if (!this.deps.material || !document || !pick) return null;
    try {
      const material = await this.deps.material.forOutline({
        documentId: document.documentId,
        pick: {
          ranges: pick.ranges,
          topicIds: pick.topicIds,
          label: pick.label,
        },
        minutes: 5,
        about: `An infographic video show made from "${document.title}".`,
        record: (usage) => this.record(episode.id, usage, 'scene_notes'),
      });
      if (!material) return null;
      return {
        words: [
          `The maker's document "${document.title}" is the first source: it outranks the web. Cite a claim from it as document:${document.documentId}#p<page> (its page, marked [page N] below). Search the web only to check it and to add what it lacks; where the web disagrees with the document, keep the document's claim and add the web's as contested.`,
          material.text,
        ].join('\n\n'),
      };
    } catch (error) {
      this.deps.logger.warn(
        `studio ${episode.id}: its pages could not be read for the research: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async log(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    event: StudioEventRecord,
    key?: string,
  ): Promise<void> {
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: episode.id },
      event,
      key,
    ).catch((error: Error) =>
      this.deps.logger.warn(
        `studio ${episode.id}: not recorded: ${error.message}`,
      ),
    );
  }

  /** A call in the ledger, and its web searches beside it, each priced. */
  async record(
    episodeId: string,
    usage: LlmUsage,
    task: LlmTask,
  ): Promise<void> {
    await this.deps.calls
      .record({
        documentId: episodeId,
        task,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        tokensCached: usage.tokensCached ?? null,
        latencyMs: usage.latencyMs,
        outcome: 'ok',
      })
      .catch(() => undefined);
    if (usage.searches)
      await this.deps.calls
        .record({
          documentId: episodeId,
          task,
          model: `${usage.model.split(':')[0]}:web-search`,
          tokensIn: null,
          tokensOut: null,
          latencyMs: null,
          costUsd: webSearchCost(usage.searches),
          outcome: 'ok',
        })
        .catch(() => undefined);
  }
}

/** The angles, the takeaway and the scope of the angles' answer, made sound. */
function editorOfAngles(
  value: Record<string, unknown>,
): Pick<StudioEditor, 'angles' | 'takeaway' | 'notThis'> {
  return {
    angles: anglesOf(value.angles),
    takeaway: plainText(value.takeaway, 300) || null,
    notThis: (Array.isArray(value.notThis) ? value.notThis : [])
      .map((one) => plainText(one, 200))
      .filter(Boolean)
      .slice(0, 6),
  };
}

/** A message's id made from what it says, so a job tried again says it once. */
function keyedMessageId(showId: string, key: string): string {
  const hex = createHash('sha256').update(`${showId}:${key}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** The plan with one of its episodes given the episode made for it. */
export function withEpisode(
  plan: EditorPlan,
  number: number,
  episodeId: string,
): EditorPlan {
  return {
    ...plan,
    episodes: plan.episodes.map((e) =>
      e.number === number ? { ...e, episodeId } : e,
    ),
  };
}

/**
 * The made (or begun) episodes of the old plan kept exactly as they are,
 * and the new plan's after them: its items after the kept ones', its
 * episodes numbered on from theirs, its plants with them.
 */
export function joinedPlan(old: EditorPlan, fresh: EditorPlan): EditorPlan {
  const kept = old.episodes.filter((e) => e.episodeId);
  const keptItems = [...new Set(kept.flatMap((e) => e.covers))].sort(
    (a, b) => a - b,
  );
  const index = new Map(keptItems.map((old, k) => [old, k]));
  const items = [
    ...keptItems.map((k) => old.items[k]),
    ...fresh.items.map((item) =>
      item.episode === null
        ? item
        : { ...item, episode: item.episode + kept.length },
    ),
  ];
  const shift = keptItems.length;
  return {
    spine: fresh.spine.length ? fresh.spine : old.spine,
    chain: fresh.chain.length ? fresh.chain : old.chain,
    items,
    cast: fresh.cast.length ? fresh.cast : old.cast,
    fairness: fresh.fairness.length ? fresh.fairness : old.fairness,
    episodes: [
      ...kept.map((e, k) => ({
        ...e,
        number: k + 1,
        covers: e.covers.flatMap((c) => (index.has(c) ? [index.get(c)!] : [])),
      })),
      ...fresh.episodes.map((e) => ({
        ...e,
        number: e.number + kept.length,
        covers: e.covers.map((c) => c + shift),
        plants: e.plants.map((p) => ({ ...p, paidIn: p.paidIn + kept.length })),
        episodeId: null,
      })),
    ],
    leftOut: [...new Set([...old.leftOut, ...fresh.leftOut])].slice(0, 12),
    ...(fresh.notes?.length ? { notes: fresh.notes } : {}),
  };
}

/** What code finds in a draft for the editor's read and the revision: its checks, and the promise kept. */
export function codeNotes(
  rows: readonly EditorialRow[],
  ctx: Parameters<typeof scriptProblems>[1],
  question: string,
): string[] {
  const out = scriptProblems(rows, ctx);
  if (question && !promiseReturns(question, rows))
    out.push(
      `The last rows do not answer the episode's question ("${question}"): end on its answer, then the open loop.`,
    );
  return out.slice(0, 30);
}

/**
 * A lesson board's draft held to the written lines: one beat a line, its
 * words the line's, whatever the board said; the board's delivery, music
 * and pause kept where it gave them for that line, a held line's pause
 * long; steps on a line that is not there moved to the last.
 */
export function onTheLines(
  raw: unknown,
  lines: readonly EditorialRow[],
): SceneScriptDraft {
  const draft = (
    raw && typeof raw === 'object' ? raw : {}
  ) as Partial<SceneScriptDraft>;
  const given = Array.isArray(draft.beats) ? draft.beats : [];
  const beats = lines.map((line, k) => {
    const said = given[k];
    return {
      say: line.say,
      pause: line.hold
        ? ('long' as const)
        : said?.pause === 'long'
          ? ('long' as const)
          : ('short' as const),
      delivery: line.delivery ?? said?.delivery ?? 'explain',
      speaker: null,
      music: line.music ?? said?.music ?? null,
      energy: said?.energy ?? null,
      // A row the editor holds: its picture stays while it is said.
      ...(line.hold ? { hold: true } : {}),
    };
  });
  const last = Math.max(0, beats.length - 1);
  return {
    fit: 'good',
    fitReason: null,
    title: typeof draft.title === 'string' ? draft.title : 'A scene',
    mood: draft.mood ?? 'curious',
    // Paced as the playbook paces a film: something new every three to five seconds.
    pace: 'infographic',
    beats,
    cast: Array.isArray(draft.cast) ? draft.cast : [],
    steps: (Array.isArray(draft.steps) ? draft.steps : []).map((step) => ({
      ...step,
      beat: Math.min(last, Math.max(0, Math.round(Number(step.beat) || 0))),
      phrase: Number(step.beat) > last ? '' : step.phrase,
    })),
  };
}

/**
 * A lesson scene's sheet as the shots engine makes it: its beats the
 * lines, one each, word for word (onTheLines), with no things and no
 * steps; the plan of shots, what it may name, and each line's claims.
 */
export function shotsSheet(
  scene: Pick<OutlineScene, 'title'>,
  lines: readonly EditorialRow[],
  plan: ShotPlan,
  registry: readonly RegistryEntry[],
): ExplainerSheet {
  return explainerSheetOf({
    kind: 'explainer',
    title: scene.title,
    transition: 'cut',
    draft: onTheLines({ title: scene.title, cast: [], steps: [] }, lines),
    engine: 'shots',
    shots: plan,
    registry,
    rowClaims: lines.map((line) => [...line.claims]),
  });
}

/** A narration beat of a written line. */
const narrationOf = (say: string): SheetBeat => ({
  kind: 'narration',
  who: null,
  to: null,
  say,
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: null,
  pace: null,
  seconds: null,
});

/**
 * An illustrated scene's sheet held to its written lines: no one speaks
 * (a line is dropped), the narration is the lines exactly, in order, and
 * what the board acted between its narrations stays where it put it
 * (spread across the lines where it put no narration at all); the set the
 * scene's, the people on the stage the world's, on spots of their own.
 */
export function narratedSheet(
  sheet: StorySheet,
  lines: readonly EditorialRow[],
  set: string,
  bible: Pick<StudioBible, 'characters' | 'sets'>,
): StorySheet {
  const acting = sheet.beats
    .map((beat, k) => ({ beat, k }))
    .filter(({ beat }) => beat.kind !== 'narration' && beat.kind !== 'line');
  const told = sheet.beats.filter((b) => b.kind === 'narration').length;
  // Where each acting beat goes: after the narration it followed, or
  // spread over the lines when the board wrote none.
  const after = new Map<number, number>();
  let cursor = -1;
  sheet.beats.forEach((beat, k) => {
    if (beat.kind === 'narration')
      cursor = Math.min(lines.length - 1, cursor + 1);
    else if (beat.kind !== 'line')
      after.set(
        k,
        told
          ? cursor
          : Math.min(
              lines.length - 1,
              Math.floor(
                (acting.findIndex((a) => a.k === k) * lines.length) /
                  Math.max(1, acting.length),
              ),
            ),
      );
  });
  const beats: SheetBeat[] = [];
  const moved = new Map<number, number>();
  const place = (at: number) =>
    acting
      .filter(({ k }) => after.get(k) === at)
      .forEach(({ beat, k }) => {
        moved.set(k, beats.length);
        beats.push(beat);
      });
  place(-1);
  lines.forEach((line, i) => {
    beats.push(narrationOf(line.say));
    place(i);
  });
  const cast = new Set(bible.characters.map((c) => c.id));
  const spots = new Set<string>();
  const onStage = sheet.onStage
    .filter((p) => {
      if (!cast.has(p.who) || spots.has(p.spot)) return false;
      spots.add(p.spot);
      return true;
    })
    .slice(0, 4);
  return {
    ...sheet,
    set: bible.sets.some((s) => s.id === set)
      ? set
      : bible.sets.some((s) => s.id === sheet.set)
        ? sheet.set
        : (bible.sets[0]?.id ?? sheet.set),
    onStage,
    beats,
    camera: sheet.camera.flatMap((shot) =>
      moved.has(shot.beat) ? [{ ...shot, beat: moved.get(shot.beat)! }] : [],
    ),
    ...(sheet.inserts?.length
      ? {
          inserts: sheet.inserts.flatMap((one) =>
            moved.has(one.beat) ? [{ ...one, beat: moved.get(one.beat)! }] : [],
          ),
        }
      : {}),
  };
}

/** A bible for a show that has none yet: no one, nowhere. */
function EMPTY_BIBLE_FOR(show: StudioShowRecord): StudioBible {
  return {
    characters: [],
    sets: [],
    world: null,
    subject: show.editor?.question ?? show.brief.idea,
    maths: false,
    pictures: [],
  };
}

/** A whole number from 1000 to 2100 with nothing after it: a year, never a quantity. */
const YEAR_ALONE = /^(?:1\d{3}|20\d{2}|2100)$/u;

/** Whether a line says a figure itself: its number, as digits, apart from other digits. */
function saysFigure(say: string, figure: string): boolean {
  const read = numberOf(figure);
  if (!read) return false;
  const digits = String(read.value).replace('.', '\\.');
  return new RegExp(`(?:^|[^\\d.,])${digits}(?:[^\\d]|$)`, 'u').test(
    say.replace(/(\d),(?=\d{3})/gu, '$1'),
  );
}

/** What a figure is in, when the words after it run on: its scale. */
const SCALE = /^(?:%|million|billion|thousand|trillion|per ?cent|percent)\b/iu;
/** The words a counter writes before its number: a currency, a hedge. */
const QUALIFIER =
  /^(?:about|around|almost|nearly|over|under|roughly|some|up to|more than|less than|fewer than|at least|us\$|[$£€¥₹₦])$/iu;
/** Little words that are never what a figure counts. */
const LITTLE = new Set(
  'of in on at to the a an and by for from with was were is are had has have than that who which'.split(
    ' ',
  ),
);

/**
 * A figure as a counter reads it: a currency or a hedge before its number
 * ("$", "about"), the number, and what it is in ("million", "%"; a short
 * unit kept whole, "10 days"; else the word that names what it counts,
 * "174 seats"); with what it counts. Null for no number, or a year.
 */
function counterOf(said: string, label: string | null): CounterDraft | null {
  const m = /^(.*?)(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(.*)$/su.exec(
    said.trim(),
  );
  if (!m || !numberOf(m[2])) return null;
  const words = m[1].trim().split(/\s+/u).filter(Boolean);
  const prefix = [words.slice(-2).join(' '), words.slice(-1).join(' ')].find(
    (one) => one && QUALIFIER.test(one),
  );
  const after = m[3].trim().replace(/[.,;:!?]+$/u, '');
  const first = after.split(/\s+/u)[0]?.replace(/[^\p{L}%]/gu, '') ?? '';
  const unit =
    after.length <= 16
      ? after
      : (SCALE.exec(after)?.[0] ??
        (first.length <= 12 && !LITTLE.has(first.toLowerCase()) ? first : ''));
  if (
    YEAR_ALONE.test(m[2]) &&
    (!unit || LITTLE.has(unit.split(/\s+/u)[0].toLowerCase()))
  )
    return null;
  return {
    value: m[2],
    unit: unit || null,
    prefix: prefix ?? null,
    label,
    then: null,
  };
}

/** Where claims come from, written small under what shows them: the first source's title. */
function sourceOf(
  ids: readonly string[],
  research: Pick<EditorResearch, 'claims'>,
): string | null {
  for (const claim of research.claims)
    if (ids.includes(claim.id) && claim.sources[0]?.title)
      return claim.sources[0].title.slice(0, 90);
  return null;
}

/**
 * A line's number from the research, as a counter: a number of its
 * claims (one two sources agree on first, else one the line says itself),
 * else the figure a number claim of it gives, said in the line. With
 * what it counts and its source, so the counter is held to the research,
 * not to the scene's words. Null when its claims give none.
 */
function rowNumber(
  row: EditorialRow,
  research: Pick<EditorResearch, 'claims' | 'numbers'>,
): { counter: CounterDraft; source: string | null } | null {
  const cited = (ids: readonly string[]) =>
    ids.some((id) => row.claims.includes(id));
  const numbers = research.numbers
    .filter(
      (n) => cited(n.claims) && (n.checked || saysFigure(row.say, n.value)),
    )
    .sort((a, b) => Number(b.checked) - Number(a.checked));
  for (const n of numbers) {
    const counter = counterOf(n.value, n.label || null);
    if (counter) return { counter, source: sourceOf(n.claims, research) };
  }
  // A number claim's figures, in its own words: the words before each (a
  // hedge, a currency) and after it (what it counts).
  for (const claim of research.claims) {
    if (claim.kind !== 'number' || !row.claims.includes(claim.id)) continue;
    for (const m of claim.text.matchAll(/\d[\d,]*(?:\.\d+)?/gu)) {
      const at = m.index ?? 0;
      const counter = counterOf(
        `${claim.text.slice(0, at).trim().split(/\s+/u).slice(-2).join(' ')} ${claim.text.slice(at)}`,
        null,
      );
      if (counter && saysFigure(row.say, m[0]))
        return { counter, source: sourceOf([claim.id], research) };
    }
  }
  return null;
}

/**
 * A line's exact words from the research, as a quote: the words of a
 * quote claim of it as the line says them (so they are the scene's own,
 * word for word), else the words the line itself puts in quotes. With who
 * said them, its caption. Null when no quote claim of it is said.
 */
function rowQuote(
  row: EditorialRow,
  research: Pick<EditorResearch, 'claims'>,
): { text: string; who: string } | null {
  const claims = research.claims.filter(
    (c) => c.kind === 'quote' && row.claims.includes(c.id),
  );
  if (!claims.length) return null;
  const said = row.say.toLowerCase();
  for (const claim of claims)
    for (const words of [
      ...quotedSpans(claim.text).map(([a, b]) => claim.text.slice(a, b)),
      claim.text.replace(/[.]+$/u, ''),
    ]) {
      const at = said.indexOf(words.toLowerCase());
      if (at >= 0 && words.split(/\s+/u).length >= 2)
        return {
          text: row.say.slice(at, at + words.length),
          who: claim.who ?? '',
        };
    }
  const own = quotedSpans(row.say).map(([a, b]) => row.say.slice(a, b))[0];
  return own && own.split(/\s+/u).length >= 2
    ? { text: own, who: claims[0].who ?? '' }
    : null;
}

/**
 * What a line can show truthfully when no board could be had, from the
 * research alone (explainer-animation-plan §10): a number of its claims as
 * a counter; a real place it names on the show's map, pinned; its exact
 * words as a quote. Its kind of picture first (a place line's place, a
 * number line's number), then the rest. Nothing for a line with none of
 * them: the picture before it holds.
 */
function plainPicture(
  row: EditorialRow,
  k: number,
  editor: Pick<StudioEditor, 'world' | 'research'> | null,
): SceneScriptDraft['cast'][number] | null {
  const research = editor?.research ?? null;
  const number = () => {
    const found = research ? rowNumber(row, research) : null;
    return found
      ? castThing(`number-${k + 1}`, 'counter', found.counter.label ?? '', {
          counter: found.counter,
          source: found.source,
        })
      : null;
  };
  const place = () => {
    const pinned =
      row.visual === 'place' || row.visual === 'scene'
        ? pinOnShowMap(`${row.show} ${row.say}`, editor?.world)
        : null;
    return pinned
      ? castThing(`map-${k + 1}`, 'map', pinned.place, { map: pinned.map })
      : null;
  };
  const quote = () => {
    const found = research ? rowQuote(row, research) : null;
    return found
      ? castThing(`quote-${k + 1}`, 'quote', found.who, {
          quote: found.text,
          phrases: [],
        })
      : null;
  };
  const order =
    row.visual === 'place' || row.visual === 'scene'
      ? [place, number, quote]
      : row.visual === 'exact-words' || row.visual === 'who'
        ? [quote, number, place]
        : [number, place, quote];
  for (const one of order) {
    const thing = one();
    if (thing) return thing;
  }
  return null;
}

/**
 * A lesson scene boarded by code alone, when its board cannot be had:
 * each line over what the research can show truthfully of it (a number,
 * a real place on the show's map, its exact words), and the picture
 * before it held where it can show nothing; the first line over the
 * show's map, or its title, where it has none of its own. Never a keyword
 * card standing in for a picture (explainer-animation-plan §10).
 */
export function plainLesson(
  scene: Pick<OutlineScene, 'title'>,
  lines: readonly EditorialRow[],
  editor: Pick<StudioEditor, 'world' | 'research'> | null = null,
): ExplainerSheet {
  const draft = onTheLines({ title: scene.title, cast: [], steps: [] }, lines);
  const pictures = lines.map((line, k) => plainPicture(line, k, editor));
  const base = editor?.world?.base;
  if (lines.length && !pictures[0])
    pictures[0] = base
      ? castThing('show-map', 'map', base.region, {
          map: {
            region: base.region,
            highlight: null,
            places: null,
            routes: null,
          },
        })
      : castThing('title', 'words', scene.title, { style: 'title' });
  const shown = pictures.flatMap((thing, k) => (thing ? [{ thing, k }] : []));
  return onShowMap(
    explainerSheetOf({
      kind: 'explainer',
      title: scene.title,
      transition: 'cut',
      draft: {
        ...draft,
        cast: shown.map((one) => one.thing),
        steps: shown.map(({ thing, k }) =>
          onItsLine(k, lines[k].say, thing.id),
        ),
      },
    }),
    editor?.world ?? null,
  );
}

/** An illustrated scene boarded by code alone: its narration in its place, its people there. */
export function plainShots(
  scene: Pick<OutlineScene, 'title' | 'set' | 'cast'>,
  lines: readonly EditorialRow[],
  bible: Pick<StudioBible, 'characters' | 'sets'>,
): StorySheet {
  const spots = ['centre-left', 'centre-right', 'left', 'right'];
  const here = scene.cast
    .filter((id) => bible.characters.some((c) => c.id === id))
    .slice(0, 2);
  return narratedSheet(
    storySheetOf({
      title: scene.title,
      set: scene.set ?? bible.sets[0]?.id ?? '',
      time: 'day',
      crowd: 'few',
      onStage: here.map((who, k) => ({ who, spot: spots[k] })),
      beats: [],
    }),
    lines,
    scene.set ?? '',
    bible,
  );
}

/** A thing of a lesson's cast, every field present: its own given, the rest null. */
function castThing(
  id: string,
  kind: SceneScriptDraft['cast'][number]['kind'],
  name: string,
  own: Partial<SceneScriptDraft['cast'][number]> = {},
): SceneScriptDraft['cast'][number] {
  return {
    id,
    kind,
    name,
    brief: null,
    motion: null,
    parts: null,
    states: null,
    shape: null,
    value: null,
    style: null,
    sound: null,
    lines: null,
    plot: null,
    quote: null,
    phrases: null,
    ref: null,
    state: null,
    figure: null,
    count: null,
    pose: null,
    signs: null,
    holding: null,
    timeline: null,
    chart: null,
    ...own,
  };
}

/** A step bringing one thing on as its line starts (on its first words), alone on the stage. */
const onItsLine = (
  beat: number,
  say: string,
  id: string,
): SceneScriptDraft['steps'][number] => ({
  beat,
  phrase: say.split(/\s+/u).filter(Boolean).slice(0, 3).join(' '),
  layout: 'one',
  show: [id],
  arrows: null,
  effects: null,
});

/**
 * A lesson board's moments of people in a place (rows the script marked
 * "scene", made the lesson's while illustrated scenes are switched off):
 * where its line brings on nothing but words, a moment at a real place on
 * the show's map is that map with the place pinned. Never a drawing of
 * the place or of its people (no invented place, no stock figure, no
 * likeness: explainer-animation-plan §10), and never a word card; a
 * moment at no place on the map brings on nothing, and the picture before
 * it holds.
 */
export function drawnMoments(
  draft: SceneScriptDraft,
  lines: readonly EditorialRow[],
  world: Pick<EditorWorld, 'base'> | null,
): SceneScriptDraft {
  const byId = new Map(draft.cast.map((t) => [t.id, t]));
  const cast = [...draft.cast];
  const steps = [...draft.steps];
  lines.forEach((line, k) => {
    if (line.visual !== 'scene') return;
    const shown = steps
      .filter((st) => st.beat === k && st.layout)
      .flatMap((st) => st.show ?? []);
    if (shown.some((id) => byId.get(id) && byId.get(id)!.kind !== 'words'))
      return;
    const pinned = pinOnShowMap(`${line.show} ${line.say}`, world);
    if (!pinned) return;
    const id = `moment-${k + 1}`;
    cast.push(castThing(id, 'map', pinned.place, { map: pinned.map }));
    steps.push(onItsLine(k, line.say, id));
  });
  return {
    ...draft,
    cast,
    steps: steps.sort((a, b) => a.beat - b.beat),
  };
}

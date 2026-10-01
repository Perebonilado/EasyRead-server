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
  splitLongActs,
  withPalette,
  type EditorPace,
} from '../../business/domain/studio/studio-editor-checks';
import { editorOutline } from '../../business/domain/studio/studio-editor-cut';
import { worldBible } from '../../business/domain/studio/studio-editor-world';
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
  recipeOf,
  stageOf,
} from '../../business/domain/studio/studio-audience';
import { describeScene } from '../../business/domain/studio/studio-words';
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
    const answer = await this.llm.editorSearch({
      step: 'research',
      parts: [
        `The brief:\n${describeEditorBrief(show.brief)}`,
        describeQuestion(editor),
        document?.words ?? '',
      ],
    });
    await this.record(episode.id, answer.usage, 'explainer_research');
    const research = researchOf(
      answer.value.value,
      foundMap(answer.value.found),
      answer.usage.searches ?? 0,
    );
    if (!research.claims.length)
      throw new Error('The research came back empty');
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
    const plan = await this.writePlan(parts, editor.research, episode.id);
    const sound = soundPlan(plan, pace);
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

  /** The plan written, and sent back once with what code found wrong; the better kept. */
  private async writePlan(
    parts: string[],
    research: EditorResearch,
    episodeId: string,
  ): Promise<EditorPlan> {
    const first = await this.llm.editorWrite({ step: 'plan', parts });
    await this.record(episodeId, first.usage, 'explainer_edit');
    let plan = planOf(first.value, research);
    const problems = planProblems(plan);
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
      if (
        second.episodes.length &&
        planProblems(second).length <= problems.length
      )
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
        `The research's look notes and people:\n${describeResearch({
          ...editor.research,
          claims: editor.research.claims.filter((c) =>
            ['name', 'event', 'date'].includes(c.kind),
          ),
          timeline: [],
          numbers: [],
          myths: [],
          perspectives: [],
          open: [],
        })}`,
      ],
    });
    await this.record(episode.id, answer.usage, 'explainer_edit');
    const world = worldOf(answer.value);
    const value = answer.value;
    const subject =
      (typeof value.subject === 'string' && value.subject.trim()) ||
      editor.question ||
      show.brief.idea;
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
    );
    const fresh = soundPlan(plan, pace).plan;
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
      const parts = [...base, describePace(pace)];
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
      await keep({
        beats: budgetBeats(splitLongActs(beats), pace),
        stage: 'beats',
      });
    }
    const beats = editorial.beats!;

    // The hooks: five drafted and judged, the best made one.
    if (!editorial.hook) {
      progressNow({ says: 'Drafting the hooks' });
      const parts = [
        ...base,
        `The beat sheet:\n${describeBeats(beats)}`,
        `The research's claims:\n${describeResearch(research, known)}`,
        earlier.length
          ? `The episodes before (for the "last time" line):\n${describeEarlierScripts(earlier)}`
          : '',
      ];
      const first = await this.llm.editorWrite({ step: 'hooks', parts });
      await this.record(episode.id, first.usage, 'explainer_edit');
      let hooks = hooksOf(first.value, known);
      const problems = hookProblems(hooks.hook ?? '', hooks.claims, research);
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
          hookProblems(second.hook, second.claims, research).length <=
            problems.length
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
    const scriptParts = [
      ...base,
      `The beat sheet:\n${describeBeats(beats)}`,
      `The hook (open with it, as written):\n${hook}`,
      `The research:\n${describeResearch(research)}`,
      world ? `The world:\n${describeWorld(world)}` : '',
      describePace(pace),
      earlier.length
        ? `The episodes before, for exact callbacks and the "last time" line:\n${describeEarlierScripts(earlier)}`
        : '',
    ];
    const ctx = { research, pace, beats };

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
      const rows = rowsOf(first.value.rows, known, beats.acts.length);
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
      const again = await this.llm.editorWrite({
        step: 'script',
        parts: scriptParts,
        previous: { rows: editorial.rows },
        problems: [...notes, ...found],
      });
      await this.record(episode.id, again.usage, 'explainer_edit');
      const revised = rowsOf(again.value.rows, known, beats.acts.length);
      // A revision that lost most of the script is no revision: the draft stands.
      const rows =
        revised.length >= Math.ceil(editorial.rows.length * 0.6)
          ? revised
          : editorial.rows;
      await keep({ rows: mendRows(rows, ctx).rows, notes, stage: 'read' });
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
    let k = 0;
    const lanes = Array.from(
      { length: Math.min(BOARDERS, rows.length) },
      async () => {
        while (k < rows.length) {
          const at = k++;
          const scene = outline.scenes[at];
          progressNow({ says: `Boarding scene ${at + 1}`, scene: at });
          if (isIllustrated(scene))
            await this.illustratedBoard(show, episode, bible, rows[at], at);
          else await this.lessonBoard(show, episode, bible, rows[at], at);
          progressNow({ scene: at, done: true });
        }
      },
    );
    await Promise.all(lanes);
    return rows.length;
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
      describeScene(
        stage,
        scene.seconds,
        recipe ? { recipe, check: false } : null,
      ),
      `This is scene ${k + 1} of ${outline.scenes.length} of "${outline.title}", about ${scene.seconds} seconds.${k === 0 ? ' It opens the episode.' : ''}`,
      `The lines, one beat each, word for word, with what the editor wants seen:\n${lines.map((r, i) => `${i + 1}. SAY: ${r.say}\n   SHOW: ${r.show || '(your choice)'} [${r.visual}]`).join('\n')}`,
      world ? `The show's world and colours:\n${describeWorld(world)}` : '',
      `The page:\n${scene.teach ?? ''}`,
    ];
    const options = {
      teach: scene.teach,
      source: null,
      stage,
      maths: bible.maths,
      planned: scene.seconds,
    };
    const first = await this.llm.editorBoard({ kind: 'lesson', parts });
    await this.record(episode.id, first.usage, 'explainer_board');
    // On its written lines, its things in the show's colours.
    const sheetOf = (draft: unknown) => {
      const lined = onTheLines(draft, lines);
      return explainerSheetOf({
        kind: 'explainer',
        title: scene.title,
        transition: 'cut',
        draft: {
          ...lined,
          cast: withPalette(lined.cast, world?.palette ?? []),
        },
      });
    };
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
    // What the board still got wrong is set in type, never handed back.
    if (errorsIn(problems).length) {
      sheet = repairExplainer(sheet, options);
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
    };
  });
  const last = Math.max(0, beats.length - 1);
  return {
    fit: 'good',
    fitReason: null,
    title: typeof draft.title === 'string' ? draft.title : 'A scene',
    mood: draft.mood ?? 'curious',
    beats,
    cast: Array.isArray(draft.cast) ? draft.cast : [],
    steps: (Array.isArray(draft.steps) ? draft.steps : []).map((step) => ({
      ...step,
      beat: Math.min(last, Math.max(0, Math.round(Number(step.beat) || 0))),
      phrase: Number(step.beat) > last ? '' : step.phrase,
    })),
  };
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

import type { ScreenplayDraft } from '../domain/scene-screenplay';
import type { DocumentProfileDraft } from '../domain/scene-profile';
import type { NotesDraft } from '../domain/lesson-notes';
import type { FigureDraft, StoryDraft } from '../domain/scene-story';
import type {
  LearnQuestion,
  Block,
  RecapBody,
  TopicPreviewBody,
} from '../../contracts';
import type { DrawingThing, SceneScriptDraft } from '../domain/scene-script';
import type { DrawingKind, DrawingVerdict } from '../domain/drawing-score';
import type { WorkedSolution } from '../domain/maths-work';

export type LlmTask =
  | 'ocr_page'
  | 'summarize'
  | 'topics_outline'
  | 'topics_page_tag'
  | 'topics_prereqs'
  | 'simplify_standard'
  // A maths page: a stronger model, keeping every step of its working.
  | 'simplify_maths'
  // A problem the tutor asks to have worked through, every step checked.
  | 'work_through'
  | 'highlight_explain'
  | 'highlight_simplify'
  | 'highlight_define'
  | 'chat_document'
  | 'chat_clarify'
  | 'session_recap'
  | 'learn_interview'
  | 'lecture_outline'
  | 'lecture_segment'
  | 'lecture_verify'
  | 'lecture_board'
  | 'lecture_diagram'
  | 'lecture_sketch'
  | 'sketch_judge'
  // A drawing the model made, judged against its brief by a vision model:
  // the see-and-fix loop's eyes, and the drawing bench's.
  | 'drawing_judge'
  | 'learn_outline'
  | 'learn_write'
  | 'visualize_query'
  | 'diagram'
  | 'sketch'
  // A page as an animated explainer: the writer (narration and storyboard)
  // and the artist (each drawing, as animated SVG).
  | 'scene_write'
  | 'scene_draw'
  // A show's characters and its own things, in the house style of the
  // people code draws; and its places, painted as the scene behind them.
  | 'cast_draw'
  | 'set_paint'
  | 'scene_profile'
  | 'scene_notes'
  | 'scene_story'
  // The Studio: the producer's side of the conversation, and the writers
  // of a show's cast, an episode's outline and each scene's sheet.
  | 'studio_chat'
  | 'studio_write'
  // Whether a scene made again as the maker asked now shows what they asked for.
  | 'studio_check'
  // The editor's desk (infographic-editor-plan): an explainer show planned
  // and an episode written as an editor does; the research and the fact
  // check, with the web; and each scene's board on the written script.
  | 'explainer_edit'
  | 'explainer_research'
  | 'explainer_board'
  // The shots engine's board (explainer-animation-tech §4.1): a lesson
  // scene's plan of shots, named from closed lists and the scene's registry.
  | 'explainer_shots'
  // The picture desk (WP11): where an archive picture's subject is, and
  // what the picture is, so it is cropped to the subject, never past a face.
  | 'picture_focus'
  // The critic (WP13; explainer-animation-plan §9.3): a scene's contact
  // sheet scored on the rules' axes, its worst problems named as fixes.
  | 'explainer_critic'
  | 'topic_quiz'
  | 'item_write'
  | 'item_verify'
  | 'preview'
  | 'recall_grade'
  | 'question_check'
  | 'embed';

export interface GeneratedItem {
  kind: 'mcq' | 'flashcard' | 'cloze' | 'true_false';
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint: string | null;
  topicTitle: string | null;
  sourceQuote: string | null;
}

export interface ItemVerdict {
  /** The verifier's own answer, or -1 for "the passage does not say". */
  answerIndex: number;
  /** Verbatim sentence supporting that answer, when there is one. */
  quote: string | null;
  supported: boolean;
}

export interface LlmUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  /** Of `tokensIn`, those the provider served from its cache, priced lower; absent when it did not say. */
  tokensCached?: number;
  /** Web searches the call made, billed by the search; absent for none. */
  searches?: number;
}

/** A step of the editor's desk the editor model writes (explainer_edit). */
export type EditorWriteStep =
  'plan' | 'world' | 'beats' | 'hooks' | 'script' | 'read' | 'package';

/** A step of the editor's desk that searches the web (explainer_research). */
export type EditorSearchStep = 'angles' | 'research' | 'facts';

/** A page a search found: where a claim may come from. */
export interface EditorFound {
  url: string;
  title: string;
}

export interface LlmResult<T> {
  value: T;
  usage: LlmUsage;
}

/** The producer's turn in the Studio: what to say, and what to do next. */
export interface StudioTurnDraft {
  reply: string;
  choices: string[];
  /** What the maker's latest message says of the brief: null for what it does not. */
  brief: Record<string, unknown>;
  action:
    | 'none'
    | 'outline'
    | 'approve'
    | 'cast'
    | 'redraw'
    | 'choose'
    | 'scene'
    | 'make'
    | 'episode'
    | 'pages'
    /** An explainer's voice played quicker or slower, nothing voiced again. */
    | 'repace';
  /** For "redraw": the one character whose look is to change, by name or id; for "choose", whose new drawing is chosen. */
  character?: string | null;
  /** For "choose": which of the new drawings waiting, from 1; 0 to keep the one they have. */
  pick?: number | null;
  /** A scene's number, from 1, for a change to it. */
  scene: number | null;
  /** For a change to several scenes: each one's number, from 1, the first first. Absent, only `scene`. */
  scenes?: number[];
  /** The change asked for, in the maker's words; for "pages", which part of their document, in their words. */
  request: string | null;
  /**
   * For "outline": the change is to the story itself (the plot, who
   * someone is, the ending, the stakes), so the story is developed again
   * with it; false for a change to the scenes alone. Absent or null, code
   * tells from the request's words (isStoryChange).
   */
  story?: boolean | null;
  /** Of a change to a scene, what the stage cannot show, in a few words: left out of it, and said so. */
  cannot?: string | null;
  /** Asked for what the Studio does not make. */
  refuse: boolean;
}

/**
 * What the Studio's check makes of a scene made again as the maker asked:
 * whether what they asked for now shows in the film, judged by what the
 * film shows and never by the scene's words.
 */
export interface StudioCheckVerdict {
  resolved: boolean;
  /** For the writer and for us: which beat, and what still shows. */
  reason: string;
  /** One plain sentence for the maker. */
  tell: string;
  /** What is still wrong, from the list code sees; "other" for anything else. */
  faults: string[];
}

/** What a Studio writer is asked again with: its answer, and what to change or put right. */
export interface StudioRevision {
  previous?: unknown;
  /** The maker's own words for the change. */
  request?: string;
  /** What the check found wrong. */
  problems?: string[];
}

/** The arc of one topic's lecture, before any of it is written. */
export interface LectureOutlineDraft {
  /** The cold open: why this material is worth the next ten minutes. */
  hook: string;
  /** The shape of the topic, in one or two sentences. */
  arc: string;
  /** The one case or question the chapter follows, page by page. */
  thread: string;
  /** What the listener can now do that they could not before; the last page lands on it. */
  payoff: string;
  /** The words the chapter turns on, each with its plain meaning; spoken first for a slow learner. */
  terms: { term: string; meaning: string }[];
  /** The problem the chapter answers, posed in one line; a quick learner hears it before the principle. */
  problem: string | null;
  /** The three or four things the chapter settles, one sentence each. */
  points: string[];
  beats: {
    pageNumber: number;
    goal: string;
    /** Which point this page serves, by index into points. */
    point: number;
    /** A question the listener can answer from what they have heard, or null. */
    ask: string | null;
    callback: string | null;
    foreshadow: string | null;
    /** The one thing this page adds that the listener has not been taught. */
    newHere: string;
    /** What the page repeats from earlier, to pass in a clause or leave out. */
    skip: string | null;
    /** What the page's idea would be drawn as, if anything. */
    figure: {
      kind: 'process' | 'structure' | 'comparison' | 'none';
      shows: string | null;
    };
    /** Light pages mostly restate, recap or list; they get the small budget. */
    weight: 'full' | 'light';
    /**
     * The two to four steps in which the page's idea is taught, as short
     * labels in order. Every style of the lecture teaches the same moves,
     * which is what lets a learner switch style mid-idea.
     */
    moves: string[];
    /** For each move, the numbered blocks of the note it teaches; null for a move that names none. */
    moveBlocks?: (number[] | null)[] | null;
    /** The paragraphs no move teaches, each with why; every paragraph is in a move or here. */
    skipBlocks?:
      | {
          block: number;
          reason: 'repeat' | 'caption' | 'reference' | 'decoration';
        }[]
      | null;
    /** The mistake a student is most likely to make here, where the page shows it. */
    pitfall: string | null;
    /** True on the one page of the chapter where the listener is asked to predict before hearing. */
    turn: boolean;
    /** The question this page leaves open for the next page's first sentence; null on the last. */
    handoff: string | null;
  }[];
}

/** One page's script, in sections that follow the beat's moves in order. */
export interface LectureSegmentDraft {
  sections: {
    move: number;
    /** The words, with [write n] before the words spoken while line n of the board is written. */
    text: string;
    /** The note sentences the section explains, as the writer addressed them ("2.1", or "5" for a whole block). */
    teaches?: string[];
    /** The words a listener should hear land in this section, copied from its text; null for most sections. */
    catch?: string | null;
  }[];
}

/** The board planned for a page before its speech: a heading and the lines in writing order. */
export interface LectureBoardPlanDraft {
  heading: string;
  lines: {
    /** The move the line is written during, from 0. */
    move: number;
    kind: 'term' | 'point' | 'figure';
    text: string;
    meaning: string | null;
    level: 1 | 2 | null;
    important: boolean | null;
  }[];
}

/** The board writer's draft for one row; see domain/board for the rules. */
export interface LectureBoardDraft {
  heading: string | null;
  items: {
    kind: 'term' | 'point' | 'figure' | 'relation' | 'cue';
    text: string | null;
    meaning: string | null;
    from: string | null;
    to: string | null;
    label: string | null;
    target: string | null;
    shape: 'underline' | 'circle' | 'box' | 'highlight' | null;
    /** 2 for a detail under the item before it. */
    level: 1 | 2 | null;
    /** The one thing to take away from the page. */
    important: boolean | null;
    /** The numbered spoken sentence the item is written during. */
    sentence: number | null;
    /** An exact spoken phrase (the older way of placing an item). */
    anchor: string | null;
  }[];
}

import type { SketchDraft, SketchTemplate } from '../domain/sketch';
export type { SketchDraft, SketchTemplate } from '../domain/sketch';

/** A figure before layout: nodes, edges, groups, each citing the script. */
export interface LectureDiagramDraft {
  title: string;
  nodes: {
    id: string;
    label: string;
    shape: 'box' | 'ellipse' | 'diamond' | 'cylinder' | 'note' | null;
    anchor: string;
  }[];
  edges: { from: string; to: string; label: string | null; anchor: string }[];
  groups: { label: string; memberIds: string[] }[];
}

export interface TopicDraft {
  title: string;
  shortDescription: string | null;
  startPage: number;
  endPage: number;
}

/**
 * Every model call goes through here — that's what makes model choice a config
 * change rather than a code change, and gives one place for rate limiting,
 * retries and the cost ledger (§6.2).
 */
export interface LlmGatewayPort {
  /**
   * Reads one scanned page — printed or handwritten — from its image.
   * Returns the transcription as blocks; empty blocks mean the page holds
   * nothing readable.
   */
  ocrPage(input: {
    png: Buffer;
    pageNumber: number;
  }): Promise<LlmResult<{ blocks: Block[]; handwritten: boolean }>>;

  summarize(input: { title: string; text: string }): Promise<LlmResult<string>>;

  outlineTopics(input: {
    digest: string;
    pageCount: number;
  }): Promise<LlmResult<TopicDraft[]>>;

  /**
   * Plans one topic's lecture: the hook, the arc, and a beat per page.
   *
   * Planned whole and cut into pages afterwards, because a lecture written
   * page by page has no through-line — that is the difference between a
   * teacher and an audiobook.
   */
  lectureOutline(input: {
    title: string;
    topicTitle: string;
    pages: { pageNumber: number; text: string }[];
    priorTopics: string[];
    /** How the chapters before this one began, so this one begins differently. */
    priorOpenings: string[];
    /** The opening shape chosen for this chapter, with an example of it; see HOOK_SHAPES. */
    suggestedShape: { name: string; direction: string; example: string };
    /** What earlier chapters taught, one line per idea, so it is built on rather than repeated. */
    taughtEarlier: string[];
    /** The course the students are on, for one line in the hook of where the idea meets their work; null for a learner's own upload. */
    course: { department: string; level: string | null } | null;
    /** Set when the previous plan was rejected; says exactly why. */
    correction?: string;
  }): Promise<LlmResult<LectureOutlineDraft>>;

  /**
   * How the voice should say a document's hard terms: for each, a
   * respelling a voice actor would read aloud correctly. Proposals only;
   * an admin hears each one before it is used.
   */
  pronunciations(input: {
    subject: string;
    terms: string[];
  }): Promise<LlmResult<{ term: string; spoken: string }[]>>;

  /** Writes one page's spoken segment, inside the topic's plan. */
  lectureSegment(input: {
    topicTitle: string;
    hook: string;
    arc: string;
    beat: {
      goal: string;
      callback: string | null;
      foreshadow: string | null;
      newHere: string | null;
      skip: string | null;
      weight: 'full' | 'light';
      /** The moves this page teaches, in order; one section is written per move. */
      moves: string[];
      /** For each move, the numbered paragraphs of the note it must teach; null when the page came without numbers. */
      moveBlocks?: (number[] | null)[] | null;
      pitfall: string | null;
      /** The page asks the listener to predict, then tells them; marked with [pause]. */
      turn: boolean;
      /** A question to put to the listener before the page answers it; null for none in this style. */
      ask: string | null;
    };
    /** Where the previous chapter landed, for the one line that joins this chapter to it; null for the first. */
    previousPayoff: string | null;
    /** The case the chapter follows, to return to where the page turns; absent on plans from before it existed. */
    thread?: string | null;
    /** The question the last page left open, which this page's first sentence answers; null on a chapter's first page. */
    answers?: string | null;
    /** The question this page leaves open for the next page to answer; null on the last. */
    leaves?: string | null;
    /** The chapter's problem, for the page that opens it; null elsewhere. */
    problem: string | null;
    /** Where this page sits in the chapter, so restating can fade across it. */
    pageIndex: number;
    pageCount: number;
    /** The style being written, and the paragraph of direction that defines it. */
    style: 'gentle' | 'steady' | 'brisk';
    styleDirection: string;
    /** The style's spoken-word budget for this page, as the writer is told it. */
    budget: { min: number; max: number };
    pageText: string;
    /**
     * The note the page is taught from with every block and sentence
     * addressed, so a section can name what it teaches; null when the
     * page itself stands in for a note not yet written.
     */
    noteAddressed: string | null;
    prevTail: string;
    isFirstOfTopic: boolean;
    isLastOfTopic: boolean;
    bridge: boolean;
    /** What the chapter's last page lands on; null for plans written before it existed. */
    payoff: string | null;
    /**
     * The chapter's opening, already spoken word for word; the writer
     * continues from it. Null on every page but the first, and on a first
     * page whose hook was not fit to be spoken.
     */
    opening: string | null;
    /** Ideas already taught, in this chapter or earlier, not to be taught again. */
    taughtSoFar: string[];
    /** Ideas later pages of this chapter teach, not to be pre-empted. */
    comingLater: string[];
    /** The page is built around a list of this many items. */
    list: { items: number } | null;
    /**
     * The board planned for this page, numbered in writing order. The
     * writer writes every line as it teaches, marking where; null for a
     * page with no board.
     */
    board: {
      heading: string;
      lines: {
        number: number;
        move: number;
        kind: 'term' | 'point' | 'figure';
        text: string;
        meaning: string | null;
      }[];
    } | null;
    /** Set when rewriting after a failed grounding check. */
    correction?: string;
    /** Set when rewriting because of how the page read, not what it claimed. */
    styleCorrection?: string;
    /** The last attempt after a grounding failure: no flourishes, only what the page says. */
    strict?: boolean;
  }): Promise<LlmResult<LectureSegmentDraft>>;

  /**
   * One of the short segments around a chapter: the words a slow learner
   * hears before it, the check of what stuck after it, or the review a
   * returning learner hears first. Built from the plan's own lines, so it
   * needs no grounding check against a page.
   */
  lectureExtra(input: {
    kind: 'terms' | 'check' | 'review';
    topicTitle: string;
    style: 'gentle' | 'steady' | 'brisk';
    styleDirection: string;
    /** For terms: the chapter's words with their plain meanings. */
    terms: { term: string; meaning: string }[];
    /** For check and review: the ideas taught, one line each, in order; the chapter's points when the plan has them. */
    taught: string[];
    payoff: string | null;
    /** For review: whole days since the learner last listened. */
    daysAway: number | null;
    budget: { min: number; max: number };
  }): Promise<LlmResult<{ script: string }>>;

  /**
   * The board for a page, planned before its speech is written: the
   * heading and the lines a good teacher would write while teaching the
   * page's moves, in writing order. The speech writer is then given the
   * lines and writes each one as it teaches.
   */
  lectureBoardPlan(input: {
    topicTitle: string;
    pageText: string;
    goal: string;
    newHere: string | null;
    pitfall: string | null;
    moves: string[];
    terms: { term: string; meaning: string }[];
    style: 'gentle' | 'steady' | 'brisk';
    /** A light page mostly restates; it gets a short board. */
    light: boolean;
    /** Set when the first plan broke the rules; says exactly which. */
    correction?: string;
  }): Promise<LlmResult<LectureBoardPlanDraft>>;

  /**
   * What the lecturer writes on the board while a page is spoken: a
   * heading and a few items, each anchored to an exact phrase of the
   * spoken text. The rules that make it a board and not a transcript are
   * enforced in code afterwards; the model is asked for a draft.
   */
  lectureBoard(input: {
    topicTitle: string;
    spoken: string;
    pageText: string;
    moves: string[];
    goal: string;
    newHere: string | null;
    pitfall: string | null;
    terms: { term: string; meaning: string }[];
    style: 'gentle' | 'steady' | 'brisk';
    continues: boolean;
    /** Items per minute the style allows, and the row's minutes. */
    budget: { min: number; max: number };
    /**
     * Lines the rules refused that no draft replaced. When present the
     * writer returns only their replacements, each a claim in the
     * lecturer's words with an anchor copied from the speech.
     */
    repair?: {
      kind: string;
      text: string;
      meaning: string | null;
      reason: string;
    }[];
    /** Set when the first draft broke the rules; says exactly which. */
    correction?: string;
  }): Promise<LlmResult<LectureBoardDraft>>;

  /**
   * The one drawing a page's beat asked for: what it contains and how the
   * parts connect, each citing the phrase of the spoken text it belongs
   * to. Layout is not the model's job.
   */
  lectureDiagram(input: {
    topicTitle: string;
    figure: { kind: 'process' | 'structure' | 'comparison'; shows: string };
    spoken: string;
    pageText: string;
    context: string;
    correction?: string;
  }): Promise<LlmResult<LectureDiagramDraft>>;

  /**
   * The tutor's live sketch mid-conversation: a picture with a shape. The
   * writer picks a template (a graph, a ring, a line, layers, a grid) and
   * fills it from the material; labels must be built from the material,
   * anchors are not needed. Layout is not the model's job.
   */
  /**
   * Whether a rendered sketch shows what was asked: the offline judge the
   * sketch eval runs, never the live board. Says what is wrong when not.
   */
  judgeSketch(input: {
    png: Buffer;
    description: string;
    see: string;
  }): Promise<LlmResult<{ shows: boolean; wrong: string | null }>>;

  /**
   * A drawing judged against its brief by a vision model, on the
   * scorecard (drawing-score): what it shows, each point 0 to 10, and
   * what to change, as instructions to the artist. With `old`, a drawing
   * made again: the one before and the maker's words, for whether the
   * change shows and whether it is still the same character.
   */
  drawingJudge(input: {
    png: Buffer;
    kind: DrawingKind;
    /** What it should be, in words: its name and its look. */
    brief: string;
    old?: { png: Buffer; words: string };
  }): Promise<LlmResult<DrawingVerdict>>;

  /**
   * A made scene's stills looked at beside what its sheet says is there
   * (studio-scenery-plan §8.6), by the drawing judge's vision model: who is
   * on the stage, what each thing of the place is, and what a change the
   * maker asked should show. Whether each still matches, and what is
   * wrong where it does not.
   */
  pictureCheck(input: {
    stills: { png: Buffer; claims: string }[];
  }): Promise<LlmResult<{ stills: { matches: boolean; wrong: string[] }[] }>>;

  /**
   * One page as an animated explainer: the narration, the cast of things
   * it needs drawn, and the storyboard of what stands on the stage and
   * when, written together. With `previous` and `problems`, the same page
   * again with those put right.
   */
  sceneScript(input: {
    documentTitle: string;
    topicTitle: string;
    material: string;
    /** Where the page sits in its chapter, and what came before it. */
    context: string;
    /** What the book is, and the ways its pages may be taught. */
    profile?: string;
    /** A story's characters on the page, and where it happens. */
    story?: string;
    /** The page in plainer words, when the page is the book's own. */
    plain?: string;
    /** The page's part of its chapter's teacher's notes. */
    notes?: string;
    /**
     * A Studio explainer's lesson: its writer is told the explainer's
     * craft (explainerWrite: no card in place of a picture, no one
     * drawn). Absent, a book's page, as always.
     */
    explainer?: boolean;
    previous?: SceneScriptDraft;
    problems?: string[];
  }): Promise<LlmResult<SceneScriptDraft>>;

  /**
   * One page of a story as a screenplay: the lines its characters say to
   * one another, what they do, the narrator's few words, and who is there
   * as it opens; with its cast. With `previous` and `problems`, the same
   * page again with those put right.
   */
  sceneScreenplay(input: {
    documentTitle: string;
    topicTitle: string;
    material: string;
    context: string;
    profile?: string;
    story?: string;
    /** The page in plainer words: how to say it to this reader. */
    plain?: string;
    /** How the page before ends, in the book's own words. */
    before?: string;
    previous?: ScreenplayDraft;
    problems?: string[];
  }): Promise<LlmResult<ScreenplayDraft>>;

  /**
   * What a document is, for teaching it: its subject, kind and tone, and
   * which formats besides the explainer suit its pages. One cheap call a
   * document, from its title, its chapters and a sample of its pages.
   */
  sceneProfile(input: {
    documentTitle: string;
    chapters: string[];
    sample: string;
  }): Promise<LlmResult<DocumentProfileDraft>>;

  /**
   * A chapter's teacher's notes, before any of its videos: its thread,
   * and each page planned as part of one lesson (whether it carries on
   * from the page before, its goal, its small ideas with what to show,
   * what it leaves for the next). A long chapter is read in parts;
   * `before` is how the part before ends.
   */
  sceneNotes(input: {
    documentTitle: string;
    topicTitle: string;
    /** The book in brief, and whom it is for. */
    about: string;
    from: number;
    to: number;
    /** Each page's note, marked "[page N]". */
    text: string;
    before?: string;
  }): Promise<LlmResult<NotesDraft>>;

  /**
   * Who and where one stretch of a story meets: each character's look and
   * what they are like, each place, and on each page who is there, how
   * they feel, and where. `known` names the characters met before it, so
   * it calls them the same.
   */
  sceneStory(input: {
    documentTitle: string;
    /** The pages it covers, and their text, each page marked "[page N]". */
    from: number;
    to: number;
    text: string;
    known: string[];
    /** The places met earlier, to call by the same names and use again. */
    knownPlaces?: string[];
  }): Promise<LlmResult<StoryDraft>>;

  /**
   * What a story's character is, and how a person among them looks, from
   * the look a bible kept before people were drawn by the kit: one small
   * call a character, once, for a book read before it was asked.
   */
  sceneFigure(input: {
    bookTitle: string;
    name: string;
    look: string;
    voice: string | null;
  }): Promise<LlmResult<FigureDraft>>;

  /**
   * How big a thing a story names really is, as it is in the story's
   * world (a kite, a bicycle, a hut): its height as it usually stands, and
   * its length, in centimetres. For drawing a show's own among its people
   * at their scale: an artist draws to fill its canvas, whatever the size.
   */
  sceneSize(input: {
    name: string;
    /** The story's world, in a few words: "a mountain village, today". */
    world: string | null;
  }): Promise<LlmResult<{ heightCm: number; lengthCm: number }>>;

  /**
   * One drawing, as SVG markup with its own animation, from its brief.
   * The value is the artist's whole reply; the gate takes the markup out
   * of it. `notes` say what fell short last time.
   */
  sceneDrawing(input: {
    thing: Pick<
      DrawingThing,
      'name' | 'brief' | 'motion' | 'parts' | 'states' | 'shape'
    >;
    viewBox: { w: number; h: number };
    /** The lesson's subject, for scale and register. */
    topic: string;
    /** The names of what it shares the stage with. */
    neighbours: string[];
    notes?: string[];
    /** Aborts the call: the page failed while it was being drawn. */
    signal?: AbortSignal;
    /** A story's place, painted as the scene behind the stage. */
    backdrop?: boolean;
    /** A character drawn again: how they are drawn now, as SVG, to draw from. */
    reference?: string;
    /**
     * What it is drawn for: 'cast' is a show's character or thing of its
     * own, in the house style of the people code draws (cast_draw);
     * otherwise an explainer's drawing (scene_draw), or with `backdrop` a
     * place (set_paint).
     */
    purpose?: 'cast';
    /** The outline asked for on this canvas, and how small eyes and parts may be: the kit's line on the stage. */
    asked?: { line: number; eyes?: number; least?: number };
    /** How to frame it, when several are drawn side by side: "side view, facing right". */
    hint?: string;
    /** How freely it is drawn: drawings made side by side differ. */
    temperature?: number;
    /** Its own drawing before, as SVG, to revise as the notes say rather than start again. */
    previous?: string;
  }): Promise<LlmResult<string>>;

  /**
   * A place's layout, not its painting: its sky, its ground, what stands
   * behind, and each thing placed, as words code reads leniently and
   * draws (scene-set-layout), on the set painter's task (set_paint).
   * `previous` is its own layout before, as JSON, to revise as the notes
   * say.
   */
  setLayout(input: {
    brief: string;
    notes?: string[];
    previous?: string;
    temperature?: number;
    hint?: string;
  }): Promise<LlmResult<Record<string, unknown>>>;

  lectureSketch(input: {
    topicTitle: string;
    shows: string;
    /** The template the ask's words suggest, if any. */
    hint: SketchTemplate | null;
    material: string;
    pageText: string;
    correction?: string;
  }): Promise<LlmResult<SketchDraft>>;

  /**
   * Checks a segment against the page it claims to teach. Blind to the
   * writer's intent, like the item verifier: a lecturer who embellishes
   * confidently is worse for a student than one who is dull.
   */
  lectureVerify(input: {
    script: string;
    pageText: string;
    /**
     * What the writer legitimately knew beyond this page. A fact taken
     * from the plan or the page before is on one of these far more often
     * than it is invented.
     */
    context: {
      plan: string;
      prevTail: string;
      neighbours: { pageNumber: number; text: string }[];
    };
  }): Promise<LlmResult<{ grounded: boolean; problems: string[] }>>;

  simplifyPage(input: {
    pageText: string;
    summary: string | null;
    pageNumber: number;
    /** A maths page: its working kept as steps, by the maths model. */
    maths?: boolean;
    /** A second try: the blocks the first gave, and what code found wrong in them. */
    previous?: Block[];
    problems?: string[];
  }): Promise<LlmResult<Block[]>>;

  /**
   * One problem worked through, step by step, for the tutor to take a
   * learner through: the same shape as a maths page's working, and checked
   * by code the same way.
   */
  workThrough(input: {
    /** The problem, as the tutor put it, with its numbers. */
    problem: string;
    /** Who the document is for, and what it covers. */
    summary: string | null;
    /** The page the learner is on, for context. */
    context: string | null;
    /** A second try: the working the first gave, and what code found wrong in it. */
    previous?: WorkedSolution;
    problems?: string[];
  }): Promise<LlmResult<WorkedSolution>>;

  /**
   * The producer's turn in the Studio: a reply to the maker, streamed as
   * it is written, with what it learnt of the brief and the step to take.
   */
  studioTurn(input: {
    phase: 'brief' | 'outline' | 'cast' | 'script' | 'made';
    /** What the maker can see now, in words: the brief, the outline, the scenes. */
    state: string;
    /** The conversation: the maker, the producer, and what the Studio did ('studio'), a line each. */
    history: { role: 'user' | 'assistant' | 'studio'; content: string }[];
    message: string;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<StudioTurnDraft>>;

  /** A show's cast and places, or an explainer's subject and pictures, from its brief. */
  studioBible(
    input: { brief: string } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /** An episode's scenes, a line each, before any is written. */
  studioOutline(
    input: {
      brief: string;
      /** The show's cast and places, or its subject. */
      bible: string;
      /** What the episodes before it were. */
      before?: string;
    } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * Story development (studio-story-plan §1, S2), each step with thinking:
   * the premise; each character's personality; the beat sheet for the
   * film's length; and the scene plan the outline is built from. Each is
   * given the brief, the cast and places, and the steps before it.
   */
  studioPremise(
    input: {
      brief: string;
      bible: string;
      before?: string;
    } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;
  studioCharacters(
    input: { brief: string; bible: string; story: string } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;
  studioBeats(
    input: {
      brief: string;
      bible: string;
      story: string;
      /** The structure its length takes, in words. */
      structure: string;
    } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;
  studioScenePlan(
    input: { brief: string; bible: string; story: string } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /** One story scene's sheet: everything the stage will show, in order. */
  studioScene(
    input: {
      brief: string;
      bible: string;
      outline: string;
      /** Which scene, from 1, and what the outline says of it. */
      scene: string;
      /** How the scene before it left the stage. */
      before: string;
      /** A story clip inside an explainer (studio-clip): written without thinking, quick and cheap. */
      quick?: boolean;
    } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * The table read (studio-story-plan §1.6, S4): a critic reads the whole
   * script, the brief, the story and everyone's sheet, and scores it
   * against the rubric, with notes for each scene (studio_check, thinking
   * on). Its answer is made sound by tableReadOf.
   */
  studioTableRead(input: {
    brief: string;
    /** The cast and places, with everyone's sheet. */
    bible: string;
    /** The premise, the beats and the scene plan, in words. */
    story: string;
    /** The narrator's rule, in words. */
    narrator: string;
    /** Every scene as a screenplay, beats numbered. */
    script: string;
    /** What code found across the script, scene by scene. */
    code: string;
    /** What a first-time viewer made of the first scene (the cold read), in words; absent where no one watched. */
    viewer?: string;
  }): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * The cold read (the table read's clarity item): a first-time viewer
   * watches the film's opening as it shows it (only what is seen and
   * heard, no plan, no logline) and says what it is about, who wants what,
   * what is in the way, what is at stake and by when, and what confused
   * them (studio_check, thinking off). Made sound by coldReadOf.
   */
  studioColdRead(input: {
    /** Only what a viewer knows before it starts: the kind of film, and for whom. */
    kind: string;
    /** The opening as seen and heard (filmAsSeen). */
    film: string;
  }): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * The retelling (the table read's T2): a first-time viewer watches the
   * whole film as it shows it and retells it as a story spine, joining
   * each scene to the one before with "therefore", "but" or "and then"
   * (studio_check, thinking off). Made sound by retellOf.
   */
  studioRetell(input: {
    /** Only what a viewer knows before it starts: the kind of film, and for whom. */
    kind: string;
    /** The whole film as seen and heard (filmAsSeen). */
    film: string;
  }): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * Whether a scene made again as the maker asked now shows what they
   * asked for: their words, the producer's reading of them, the film as it
   * was before and as it is now (each in words, from what it plays), and
   * the faults code sees in it.
   */
  studioCheck(input: {
    words: string;
    request: string;
    before: string[];
    after: string[];
    faults: string[];
    /** Which scene the film is, and the others the maker's words asked about at once: checked on their own, never here. */
    scene?: number;
    others?: number[];
  }): Promise<LlmResult<StudioCheckVerdict>>;

  /**
   * The editor's desk (infographic-editor-plan): one step of a show's
   * planning or an episode's editing, by the editor model (explainer_edit),
   * its prompt's parts said by the caller (studio-editor-words). Made sound
   * by the step's own sanitizer (studio-editor, studio-editorial).
   */
  editorWrite(
    input: { step: EditorWriteStep; parts: string[] } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * A step that searches the web (explainer_research): the angles' quick
   * look round, the research, the fact check. With the pages the searches
   * really found, the only ones a claim may cite; none where the model has
   * no search, which then answers from what it knows.
   */
  editorSearch(input: {
    step: EditorSearchStep;
    parts: string[];
    /** The most searches it may make; absent, the setting's. */
    searches?: number;
  }): Promise<
    LlmResult<{ value: Record<string, unknown>; found: EditorFound[] }>
  >;

  /**
   * A scene's board (explainer_board) on the editor's written script: a
   * lesson scene's storyboard (sceneScriptSchema), its narration given;
   * or an illustrated scene's shots (a story's sheet), its narration given.
   */
  editorBoard(
    input: { kind: 'lesson' | 'illustrated'; parts: string[] } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * A lesson scene's plan of shots (explainer_shots; explainer-animation-
   * tech §4.1): each shot's set, information, camera, life and join,
   * every name from the closed lists or the scene's registry (its parts
   * say both), never a coordinate, a time or a colour. Made sound by
   * shot-check's planOf, held to the rules by checkPlan and mendPlan.
   */
  shotsBoard(
    input: {
      parts: string[];
      /** How the show draws its people: its instructions are the look's (characters or silhouettes). */
      look?: 'editorial' | 'illustrated';
    } & StudioRevision,
  ): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * A scene of shots judged from its contact sheet (explainer_critic;
   * explainer-animation-plan §9.3): the sheet as a picture beside the
   * scene's words (its lines, its shots as made with the words said over
   * each, what the code checks measured); each axis scored from 1 to 10
   * with why, and the worst problems named as fixes from the closed list.
   * Made sound by shot-critic's critiqueOf.
   */
  shotsCritic(input: {
    /** The contact sheet. */
    image: Buffer;
    /** Its type: a PNG by default; the reference sheets are JPEGs. */
    mediaType?: 'image/png' | 'image/jpeg';
    parts: string[];
  }): Promise<LlmResult<Record<string, unknown>>>;

  /**
   * Where an archive picture's subject is (picture_focus; WP11), on a grid
   * of six columns (A–F) by six rows (1–6): the cells of the people's
   * faces, the cells of what it is of, how many people show, and what the
   * picture is (a photograph, a photograph of a print, a screen, a statue,
   * a painting…). Names cells only; code makes the box (pictures/focus).
   */
  pictureFocus(input: {
    png: Buffer;
    /** What the desk was told it shows: "Ahmadu Bello, 1960". */
    about: string;
    /** What a picture of an event or a thing should show, for the model to agree it does ("shows"). */
    asked?: string;
  }): Promise<LlmResult<Record<string, unknown>>>;

  /** Whether text asks for what no one should be made: flagged, with the categories. */
  moderate(input: {
    text: string;
  }): Promise<{ flagged: boolean; categories: string[] }>;

  /** Streams tokens for the answer panel; resolves with the full text. */
  answerHighlight(input: {
    task: 'highlight_explain' | 'highlight_simplify' | 'highlight_define';
    selection: string;
    context: string;
    summary: string | null;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>>;

  /**
   * A turn in the document chat. `history` is the thread so far, oldest
   * first; `question` is what the reader just asked, already expanded from a
   * highlight action where there was one.
   */
  chatWithDocument(input: {
    history: { role: 'user' | 'assistant'; content: string }[];
    question: string;
    context: string;
    summary: string | null;
    /** The learner profile as standing instructions, written register. */
    profile: string;
    /**
     * Set when the reader pressed "Still not clear" on the previous answer:
     * the same question, explained a different way and one rung simpler.
     */
    simpler?: boolean;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>>;

  /**
   * What each chapter assumes the reader already knows.
   *
   * Takes the whole outline in order — that context is the only way the
   * model can tell "chapter 7 leans on chapter 3" apart from "chapter 7
   * leans on knowledge the document never provides".
   */
  outlinePrerequisites(input: {
    summary: string | null;
    chapters: { title: string; description: string | null }[];
  }): Promise<
    LlmResult<
      {
        /** 1-based chapter this prerequisite belongs to. */
        chapter: number;
        concept: string;
        why: string;
        /** 1-based earlier chapter that covers it, or 0 when none does. */
        coveredByChapter: number;
      }[]
    >
  >;

  /** Questions worth asking before writing about this particular topic. */
  interviewForTopic(input: {
    topic: string;
  }): Promise<LlmResult<{ topic: string; questions: LearnQuestion[] }>>;

  /** The chapter plan, sized to a page budget. */
  outlineTopic(input: {
    topic: string;
    brief: string;
    targetPages: number;
    /** Topics an expansion must cover, on top of the model's own plan. */
    mustCover?: string[];
  }): Promise<
    LlmResult<{
      title: string;
      chapters: { title: string; summary: string; pages: number }[];
      furtherTopics?: string[];
    }>
  >;

  /** One chapter, written to length and in the document's own voice. */
  writeChapter(input: {
    topic: string;
    brief: string;
    documentTitle: string;
    chapter: { title: string; summary: string; pages: number };
    /** Chapter titles either side, so the prose joins up. */
    outline: string[];
  }): Promise<LlmResult<{ blocks: Block[] }>>;

  rewriteImageQuery(input: {
    selection: string;
    summary: string | null;
  }): Promise<LlmResult<string>>;

  /** A Mermaid diagram of a concept, grounded in passages from the document. */
  drawDiagram(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; mermaid: string }>>;

  /**
   * A free-form labelled sketch as constrained SVG — pictures of things
   * (anatomy, apparatus, spatial layouts) that boxes-and-arrows can't say.
   * The SVG is model-authored and untrusted: the client sanitizes it.
   */
  drawSketch(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; svg: string }>>;

  /** Self-serve checks for solo study: 2-3 grounded MCQs on one topic. */
  generateTopicQuiz(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
    /** Ideas the reader keeps missing; a revisit weights questions here. */
    focus?: string[];
    /** The chapter's points from its lecture plan; every question is about one of them. */
    points?: string[];
    /** Spoken-friendly kinds for a check answered aloud; omitted means multiple choice. */
    kinds?: ('flashcard' | 'true_false' | 'mcq')[];
  }): Promise<
    LlmResult<{
      questions: {
        kind?: 'mcq' | 'flashcard' | 'true_false';
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }[];
    }>
  >;

  /**
   * Writes bankable items from one passage.
   *
   * Unlike `generateTopicQuiz`, these are stored, scheduled and reseen, so
   * they carry a hint, a topic label and the source sentence they rest on.
   * Nothing written here is trusted until `verifyItem` has seen it.
   */
  generateItems(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
    kind: 'mcq' | 'flashcard' | 'cloze' | 'true_false' | 'mixed';
    count: number;
    /** Questions already banked for this document, so it writes new ones. */
    avoidStems?: string[];
    /**
     * A sentence the reader highlighted. When present the item must be
     * built from THIS sentence rather than the passage at large — which is
     * what turns highlighting, otherwise a famously passive habit, into
     * something that comes back.
     */
    fromQuote?: string;
    /** Ideas the reader keeps missing; weights the batch towards them. */
    focus?: string[];
  }): Promise<LlmResult<GeneratedItem[]>>;

  /**
   * Independently answers one item from its source, having NOT been told
   * the intended answer.
   *
   * The blindness is the point: an item is banked only when this pass
   * arrives at the same answer and can quote the sentence that settles it.
   * It is what keeps a hallucinated question away from a student.
   */
  verifyItem(input: {
    stem: string;
    options: string[];
    pagesText: string;
  }): Promise<LlmResult<ItemVerdict>>;

  /**
   * A chapter preview written to aid comprehension (guided reading) — the
   * skim ritual's material: what it's about, the shape of the argument, the
   * terms it turns on, and where it lands.
   */
  generateTopicPreview(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
  }): Promise<LlmResult<TopicPreviewBody>>;

  /**
   * Grades a book-closed recall against the chapter's own text. The reader
   * predicted first; this is the independent measure their prediction is
   * compared with, so it must never see the prediction.
   */
  gradeRecall(input: {
    topicTitle: string;
    pagesText: string;
    recall: string;
    /**
     * Ideas earlier attempts at this chapter failed to produce. The grader
     * answers with the indices it now considers covered, which is what
     * lets the report close them.
     */
    previouslyMissed?: string[];
  }): Promise<
    LlmResult<{
      score: number;
      nailed: string[];
      missed: string[];
      focus: string[];
      /** Indices into `previouslyMissed` this recall covered. */
      nowCovered: number[];
    }>
  >;

  /**
   * Verdict on the reader answering their own pre-reading question, judged
   * against retrieved passages. `page` is 0 when the answer can't be placed.
   */
  checkQuestionAnswer(input: {
    question: string;
    answer: string;
    context: string;
    summary: string | null;
  }): Promise<
    LlmResult<{
      verdict: 'correct' | 'partial' | 'incorrect';
      explanation: string;
      page: number;
    }>
  >;

  /** A diagram with one "?" node — the visual check the student completes. */
  drawDiagramCloze(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<
    LlmResult<{
      title: string;
      mermaid: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>
  >;

  /**
   * A recap of one sitting, written from what the reader did rather than
   * from the document as a whole.
   */
  writeRecap(input: {
    documentTitle: string;
    fromPage: number;
    toPage: number;
    /** The simplified text of the pages in the window. */
    pages: { pageNumber: number; text: string }[];
    /** Chapters the window overlaps. */
    topics: { title: string; startPage: number; endPage: number }[];
    /** What the reader asked, in order. */
    questions: string[];
    /** Checks answered in the window, with how they went. */
    checks: { kind: string; score: number }[];
    /** Concepts the reader admitted to not knowing this session. */
    prerequisitesAsked: string[];
    profile: string;
  }): Promise<LlmResult<RecapBody>>;

  /** Vectors for texts; `dimensions` asks the provider for shortened ones where it can, for callers that compare rather than store. */
  embed(input: {
    texts: string[];
    dimensions?: number;
  }): Promise<LlmResult<number[][]>>;
}

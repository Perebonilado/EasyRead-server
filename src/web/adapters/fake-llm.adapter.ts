/* eslint-disable @typescript-eslint/require-await --
 * Every method implements the async LlmGatewayPort with a synchronous body;
 * that is the whole point of a deterministic offline stand-in. */
import { dialogueOf } from '../../business/domain/scene-dialogue';
import { RUBRIC_KEYS } from '../../business/domain/studio/studio-script';
import type { ScreenplayDraft } from '../../business/domain/scene-screenplay';
import type { WorkedSolution } from '../../business/domain/maths-work';
import { levelIn } from '../../business/domain/scene-stage';
import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { DocumentProfileDraft } from '../../business/domain/scene-profile';
import type { NotesDraft } from '../../business/domain/lesson-notes';
import type {
  DrawingKind,
  DrawingVerdict,
} from '../../business/domain/drawing-score';
import type {
  FigureDraft,
  StoryDraft,
} from '../../business/domain/scene-story';
import type { Block, RecapBody, TopicPreviewBody } from '../../contracts';
import type {
  GeneratedItem,
  ItemVerdict,
  LectureOutlineDraft,
  LectureSegmentDraft,
  LlmGatewayPort,
  LlmResult,
  TopicDraft,
  LectureBoardDraft,
  LectureBoardPlanDraft,
  LectureDiagramDraft,
  SketchDraft,
  SketchTemplate,
  StudioCheckVerdict,
  StudioTurnDraft,
} from '../../business/ports/llm.port';
import type {
  DrawingThing,
  SceneScriptDraft,
} from '../../business/domain/scene-script';

const EMBED_DIMENSIONS = 256;

/**
 * A deterministic stand-in for the model gateway.
 *
 * It does NOT simplify anything — it restructures the page's own text into the
 * same `{type, text}` block contract the real prompts return, so the entire
 * pipeline, SSE stream and reader can be exercised end to end with no API key
 * and no spend. Swap `LLM_DRIVER=openai` once keys land; nothing else changes.
 *
 * Deterministic on purpose: the same input always yields the same output, so
 * tests and repeat runs are stable.
 */
@Injectable()
export class FakeLlmAdapter implements LlmGatewayPort {
  private usage(started: number, tokensIn: number, tokensOut: number) {
    return {
      model: 'fake-local',
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - started,
    };
  }

  async ocrPage({ pageNumber }: { png: Buffer; pageNumber: number }) {
    const started = Date.now();
    return {
      value: {
        blocks: [
          {
            type: 'paragraph' as const,
            text: `Fake OCR of page ${pageNumber}.`,
          },
        ],
        handwritten: false,
      },
      usage: this.usage(started, 1000, 50),
    };
  }

  async summarize({
    title,
    text,
  }: {
    title: string;
    text: string;
  }): Promise<LlmResult<string>> {
    const started = Date.now();
    const sentences = this.sentences(text).slice(0, 4);
    const value =
      `${title} covers the following. ` +
      (sentences.length
        ? sentences.join(' ')
        : 'This document has no extractable text.');
    return {
      value,
      usage: this.usage(started, text.length / 4, value.length / 4),
    };
  }

  async pronunciations(input: {
    subject: string;
    terms: string[];
  }): Promise<LlmResult<{ term: string; spoken: string }[]>> {
    const started = Date.now();
    return {
      value: input.terms.map((term) => ({
        term,
        spoken: term.toLowerCase().split('').join('-'),
      })),
      usage: this.usage(started, input.terms.join(' ').length, 20),
    };
  }

  async outlineTopics({
    digest,
    pageCount,
  }: {
    digest: string;
    pageCount: number;
  }): Promise<LlmResult<TopicDraft[]>> {
    const started = Date.now();

    // Group pages by their heading line, which is what the page-tagging
    // fallback does in the real pipeline (§4.5 step 3).
    const headings = new Map<number, string>();
    for (const line of digest.split('\n')) {
      // Matches the `[p.N] …` prefix `buildDigest` emits.
      const match = /^\[p\.(\d+)]\s*(.*)$/.exec(line);
      if (!match) continue;
      const title = match[2].trim().split('. ')[0].slice(0, 70);
      if (title.length > 2) headings.set(Number(match[1]), title);
    }

    const topics: TopicDraft[] = [];
    for (let page = 1; page <= pageCount; page++) {
      const title = headings.get(page);
      const previous = topics[topics.length - 1];
      if (!title) {
        if (previous) previous.endPage = page;
        continue;
      }
      if (previous && previous.title === title) {
        previous.endPage = page;
        continue;
      }
      topics.push({
        title,
        shortDescription: null,
        startPage: page,
        endPage: page,
      });
    }

    return {
      value: topics,
      usage: this.usage(started, digest.length / 4, topics.length * 12),
    };
  }

  /**
   * A plan whose beats cover exactly the pages given, so the validator
   * passes. Deterministic: specs assert on these strings.
   */
  async lectureOutline(input: {
    title: string;
    topicTitle: string;
    pages: { pageNumber: number; text: string }[];
    priorTopics: string[];
    priorOpenings: string[];
    suggestedShape: { name: string; direction: string; example: string };
    taughtEarlier: string[];
    correction?: string;
  }): Promise<LlmResult<LectureOutlineDraft>> {
    const started = Date.now();
    return {
      value: {
        hook: `Why ${input.topicTitle} matters.`,
        arc: `From the start of ${input.topicTitle} to its consequence.`,
        thread: `A student meeting ${input.topicTitle} for the first time.`,
        payoff: `You can now explain ${input.topicTitle}.`,
        terms: [
          { term: input.topicTitle, meaning: 'the idea this chapter turns on' },
        ],
        problem: `What does ${input.topicTitle} solve?`,
        points: input.pages
          .slice(0, 3)
          .map((page) => `Point of page ${page.pageNumber}`),
        beats: input.pages.map((page, index) => ({
          point: Math.min(index, 2),
          ask: null,
          pageNumber: page.pageNumber,
          goal: `Teach page ${page.pageNumber}.`,
          callback: input.priorTopics[0] ?? null,
          foreshadow: null,
          newHere: `New on page ${page.pageNumber}.`,
          skip: null,
          weight: 'full' as const,
          moves: [`Teach page ${page.pageNumber}`],
          moveBlocks: [[0]],
          skipBlocks: null,
          pitfall: null,
          // The last page: a prediction is only possible once something
          // has been heard, and earlier pages' tails stay plain words.
          turn: index === input.pages.length - 1,
          handoff:
            index < input.pages.length - 1
              ? `What follows from page ${page.pageNumber}?`
              : null,
          figure: { kind: 'none' as const, shows: null },
        })),
      },
      usage: this.usage(started, 500, 120),
    };
  }

  /**
   * Echoes the page so specs can assert the script came from it. A page
   * containing UNGROUNDED produces a script the fake verifier rejects,
   * which is how the retry and fail paths are exercised. The opening of
   * a chapter is NOT written here: the processor speaks the plan's hook
   * itself and hands the writer the words already spoken.
   */
  async lectureSegment(input: {
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
      moves: string[];
      pitfall: string | null;
      turn: boolean;
    };
    problem: string | null;
    pageIndex: number;
    pageCount: number;
    style: 'gentle' | 'steady' | 'brisk';
    styleDirection: string;
    budget: { min: number; max: number };
    pageText: string;
    noteAddressed: string | null;
    prevTail: string;
    isFirstOfTopic: boolean;
    isLastOfTopic: boolean;
    bridge: boolean;
    payoff: string | null;
    opening: string | null;
    taughtSoFar: string[];
    comingLater: string[];
    list: { items: number } | null;
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
    correction?: string;
    styleCorrection?: string;
    strict?: boolean;
  }): Promise<LlmResult<LectureSegmentDraft>> {
    const started = Date.now();
    // A correction means the writer is being asked to try again; the fake
    // complies, so a retry succeeds and only a repeat offender fails.
    const offending =
      input.pageText.includes('UNGROUNDED') && !input.correction
        ? ' UNGROUNDED'
        : '';
    // Mid-chapter, a page joins itself to the last one, as the rule asks.
    const lead = input.isFirstOfTopic ? '' : 'Because of that, ';
    // The chapter's turn: a prediction asked for, a silence, the answer.
    const turn =
      input.beat.turn && !input.bridge
        ? ' What happens next?\n[pause]\nThe page tells you.'
        : '';
    const closing = `${turn}${input.isLastOfTopic ? ' And that is the whole idea.' : ''}`;
    // The page's goal first, then the chapter's term with its meaning in
    // the same breath, the page's own words, and a last sentence the next
    // section can open on: what the real writer is held to.
    const body = input.bridge
      ? 'Nothing to linger on here.'
      : `${input.beat.goal} ${input.topicTitle} is the idea this chapter turns on. ${input.pageText.slice(0, 120)} That is this page.`;
    // One section per move, so a multi-move plan is honoured the way the
    // processor expects; the first carries the page, the rest name their
    // move, and the closing lands on the last.
    const moves = input.beat.moves.length ? input.beat.moves : ['all'];
    const sections = moves.map((move, index) => {
      const last = index === moves.length - 1;
      const text =
        index === 0
          ? `${lead}${body}${last ? closing : ''}${offending}`
          : `Then ${move.toLowerCase()} on this page.${last ? closing : ''}`;
      // The board: every line given for this move is written as the
      // section opens, marked the way the writer marks it.
      const marks = (input.board?.lines ?? [])
        .filter((line) => line.move === index)
        .map((line) => `[write ${line.number}] `)
        .join('');
      // The fake teaches the first sentence of the first block, when the
      // note is addressed, so the tags path is exercised end to end.
      return {
        move: index,
        text: `${marks}${text.trim()}`,
        teaches: index === 0 && input.noteAddressed ? ['0.0'] : [],
        catch: null,
      };
    });
    return {
      value: { sections },
      usage: this.usage(started, input.pageText.length / 4, 60),
    };
  }

  /**
   * A deterministic board plan: the heading from the chapter, one term
   * per move built from the move's own words, which the fake segment
   * writer speaks at the head of that move's section.
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
    light: boolean;
    correction?: string;
  }): Promise<LlmResult<LectureBoardPlanDraft>> {
    const started = Date.now();
    const lines = input.moves.map((move, index) => ({
      move: index,
      kind: 'term' as const,
      text: (index === 0 ? input.goal : move)
        .split(/\s+/)
        .slice(0, 2)
        .join(' ')
        .replace(/[.,;:]+$/, ''),
      meaning: null,
      level: null,
      important: index === 0 ? true : null,
    }));
    return Promise.resolve({
      value: { heading: `${input.topicTitle} in short`, lines },
      usage: this.usage(started, input.pageText.length / 4, 40),
    });
  }

  /** A deterministic extra: its kind and the lines it was built from. */
  async lectureExtra(input: {
    kind: 'terms' | 'check' | 'review';
    topicTitle: string;
    style: 'gentle' | 'steady' | 'brisk';
    styleDirection: string;
    terms: { term: string; meaning: string }[];
    taught: string[];
    payoff: string | null;
    daysAway: number | null;
    budget: { min: number; max: number };
  }): Promise<LlmResult<{ script: string }>> {
    const started = Date.now();
    const script =
      input.kind === 'terms'
        ? `Words you will hear in ${input.topicTitle}. ${input.terms
            .map((entry) => `${entry.term}: ${entry.meaning}.`)
            .join(' ')}`
        : input.kind === 'check'
          ? `That is ${input.topicTitle}. A check of what stuck. ${input.taught
              .slice(0, 3)
              .map(
                (line) =>
                  `What was this: ${line.replace(/\.$/, '')}?\n[pause]\n${line}`,
              )
              .join(' ')}`
          : `It has been ${input.daysAway ?? 'some'} days. Where you were in ${input.topicTitle}: ${input.taught
              .slice(0, 2)
              .map((line) => `${line}\n[pause]\n${line}`)
              .join(' ')} The lecture picks up from here.`;
    return { value: { script }, usage: this.usage(started, 200, 80) };
  }

  /**
   * A board from the page's own words: one term per move and a cue on the
   * first, anchored to phrases that are in the fake script by
   * construction. Test overrides shape the rest.
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
    budget: { min: number; max: number };
    correction?: string;
    repair?: {
      kind: string;
      text: string;
      meaning: string | null;
      reason: string;
    }[];
  }): Promise<LlmResult<LectureBoardDraft>> {
    const started = Date.now();
    const words = input.spoken.split(/\s+/).filter(Boolean);
    const anchorAt = (index: number) =>
      words.slice(index, index + 3).join(' ') || words[0] || 'x';
    const items: LectureBoardDraft['items'] = [];
    if (input.repair?.length) {
      // The fake repairs nothing: it hands the lines back as they were.
      return Promise.resolve({
        value: {
          heading: null,
          items: input.repair.map((line) => ({
            kind: line.kind as LectureBoardDraft['items'][number]['kind'],
            text: line.text,
            meaning: line.meaning,
            from: null,
            to: null,
            label: null,
            target: null,
            shape: null,
            level: null,
            important: null,
            sentence: null,
            anchor: anchorAt(0),
          })),
        },
        usage: this.usage(started, 100, 40),
      });
    }
    items.push({
      kind: 'term',
      text: input.topicTitle.split(/\s+/).slice(0, 2).join(' '),
      meaning: input.style === 'gentle' ? 'the idea this page turns on' : null,
      from: null,
      to: null,
      label: null,
      target: null,
      shape: null,
      level: null,
      important: true,
      sentence: null,
      anchor: anchorAt(0),
    });
    if (words.length > 8) {
      items.push({
        kind: 'cue',
        text: null,
        meaning: null,
        from: null,
        to: null,
        label: null,
        target: input.topicTitle.split(/\s+/).slice(0, 2).join(' '),
        shape: 'underline',
        level: null,
        important: null,
        sentence: null,
        anchor: anchorAt(4),
      });
    }
    return Promise.resolve({
      value: {
        heading: input.continues ? null : `${input.topicTitle} in brief`,
        items,
      },
      usage: this.usage(started, 300, 80),
    });
  }

  /** A three-part process drawn from the page's first words. */
  lectureDiagram(input: {
    topicTitle: string;
    figure: { kind: 'process' | 'structure' | 'comparison'; shows: string };
    spoken: string;
    pageText: string;
    context: string;
    correction?: string;
  }): Promise<LlmResult<LectureDiagramDraft>> {
    const started = Date.now();
    const words = input.spoken.split(/\s+/).filter(Boolean);
    const at = (index: number) =>
      words.slice(index, index + 2).join(' ') || 'x';
    return Promise.resolve({
      value: {
        title: input.figure.shows.split(/\s+/).slice(0, 4).join(' '),
        nodes: [
          { id: 'a', label: words[0] ?? 'start', shape: 'box', anchor: at(0) },
          { id: 'b', label: words[2] ?? 'middle', shape: 'box', anchor: at(2) },
          { id: 'c', label: words[4] ?? 'end', shape: 'box', anchor: at(4) },
        ],
        edges: [
          { from: 'a', to: 'b', label: null, anchor: at(1) },
          { from: 'b', to: 'c', label: null, anchor: at(3) },
        ],
        groups: [],
      },
      usage: this.usage(started, 400, 120),
    });
  }

  judgeSketch(input: {
    png: Buffer;
    description: string;
    see: string;
  }): Promise<LlmResult<{ shows: boolean; wrong: string | null }>> {
    const started = Date.now();
    return Promise.resolve({
      value: { shows: input.png.length > 0, wrong: null },
      usage: this.usage(started, 50, 10),
    });
  }

  /** Every drawing right: the fake artist's disc is judged a pass, so nothing is drawn again. */
  drawingJudge(input: {
    png: Buffer;
    kind: DrawingKind;
    brief: string;
    old?: { png: Buffer; words: string };
  }): Promise<LlmResult<DrawingVerdict>> {
    const started = Date.now();
    const character = input.kind === 'animal' || input.kind === 'creature';
    return Promise.resolve({
      value: {
        sees: 'a drawing',
        recognisable: 9,
        anatomy: 9,
        face: character ? 9 : null,
        change: input.old ? 9 : null,
        same: input.old ? 9 : null,
        place: input.kind === 'place' ? 9 : null,
        problems: [],
      },
      usage: this.usage(started, 800, 60),
    });
  }

  /** Every still as the sheet says: the fake film is never made again. */
  pictureCheck(input: {
    stills: { png: Buffer; claims: string }[];
  }): Promise<LlmResult<{ stills: { matches: boolean; wrong: string[] }[] }>> {
    const started = Date.now();
    return Promise.resolve({
      value: { stills: input.stills.map(() => ({ matches: true, wrong: [] })) },
      usage: this.usage(started, 800 * input.stills.length, 40),
    });
  }

  /**
   * The page's own sentences as the narration, one drawing and one word on
   * the stage: enough for the whole scene pipeline to run with no key.
   */
  sceneNotes(input: {
    documentTitle: string;
    topicTitle: string;
    about: string;
    from: number;
    to: number;
    text: string;
    before?: string;
  }): Promise<LlmResult<NotesDraft>> {
    // Every page fresh, planned as one idea shown: the shape, not a lesson.
    const pages: NotesDraft['pages'] = [];
    for (let page = input.from; page <= input.to; page += 1)
      pages.push({
        page,
        relation: 'fresh',
        evidence: 'a new heading',
        goal: `what page ${page} says`,
        newHere: [],
        callback: null,
        points: [{ say: "The page's idea", show: 'its idea', kind: 'explain' }],
        lists: [],
        pitfall: null,
        check: null,
        handoff: null,
        endsOn: [],
      });
    return Promise.resolve({
      value: {
        thread: input.topicTitle,
        example: null,
        diagram: null,
        pictures: [],
        pages,
      },
      usage: this.usage(Date.now(), input.text.length / 4, pages.length * 60),
    });
  }

  sceneProfile(input: {
    documentTitle: string;
    chapters: string[];
    sample: string;
  }): Promise<LlmResult<DocumentProfileDraft>> {
    // A book with an equals sign in it is taught with maths too; one with
    // verse in it, read closely.
    const text = `${input.documentTitle}\n${input.sample}`;
    // And one where people say things to each other is a story.
    const story = /\bsaid\b/.test(text);
    return Promise.resolve({
      value: {
        subject: input.documentTitle.slice(0, 40),
        kind: story ? 'fiction' : 'textbook',
        tone: 'neutral',
        formats: [
          ...(/=|\\frac/.test(text) ? (['maths'] as const) : []),
          ...(/poem|verse|stanza/i.test(text) ? (['reading'] as const) : []),
        ],
        story,
        // The level the document names, if it names one.
        stage: levelIn(text)?.stage ?? null,
        stageSure: levelIn(text) ? 'sure' : 'unsure',
        stageWhy: levelIn(text)?.words.join(', ') ?? '',
      },
      usage: {
        model: 'fake',
        tokensIn: Math.ceil(text.length / 4),
        tokensOut: 20,
        latencyMs: 1,
      },
    });
  }

  /** Anything is about as big as a drum. */
  sceneSize(input: {
    name: string;
    world: string | null;
  }): Promise<LlmResult<{ heightCm: number; lengthCm: number }>> {
    return Promise.resolve({
      value: { heightCm: 60, lengthCm: 40 },
      usage: {
        model: 'fake',
        tokensIn: Math.ceil(input.name.length / 4),
        tokensOut: 10,
        latencyMs: 0,
      },
    });
  }

  /** Anyone is a person, dressed plainly, a child when their voice is. */
  sceneFigure(input: {
    bookTitle: string;
    name: string;
    look: string;
    voice: string | null;
  }): Promise<LlmResult<FigureDraft>> {
    const creature = input.voice === 'creature';
    return Promise.resolve({
      value: {
        kind: creature ? 'creature' : 'person',
        size: creature ? 'medium' : null,
        figure: creature
          ? null
          : {
              age:
                input.voice === 'girl' || input.voice === 'boy'
                  ? 'child'
                  : 'adult',
              skin: 4,
              hair: 'short',
              hairColour: 'brown',
            },
      },
      usage: {
        model: 'fake',
        tokensIn: Math.ceil(input.look.length / 4),
        tokensOut: 20,
        latencyMs: 1,
      },
    });
  }

  /** Whoever "said" something is a character; each page has whoever it names. */
  sceneStory(input: {
    documentTitle: string;
    from: number;
    to: number;
    text: string;
    known: string[];
  }): Promise<LlmResult<StoryDraft>> {
    const names = [
      ...new Set(
        [...input.text.matchAll(/\b([A-Z][a-z]+) said\b/g)].map((m) => m[1]),
      ),
    ];
    const pages = input.text
      .split(/\[page (\d+)\]/)
      .slice(1)
      .reduce<{ page: number; text: string }[]>((out, part, i, all) => {
        if (i % 2 === 0)
          out.push({ page: Number(part), text: all[i + 1] ?? '' });
        return out;
      }, []);
    return Promise.resolve({
      value: {
        characters: names.map((name) => ({
          name,
          aliases: [],
          role: 'main' as const,
          look: 'a child in plain clothes',
          kind: 'person' as const,
          size: null,
          figure: {
            age: 'child',
            build: 'average',
            skin: 3,
            hair: 'pigtails',
            hairColour: 'brown',
            facialHair: 'none',
            headwear: 'none',
            top: 't-shirt',
            topColour: 'teal',
            bottom: 'shorts',
            bottomColour: 'navy',
            accentColour: 'yellow',
            extras: [],
          },
          traits: ['curious'],
          voice: 'girl' as const,
        })),
        places: [],
        pages: pages.map(({ page, text }) => ({
          page,
          summary:
            text
              .trim()
              .split(/(?<=[.!?])\s/)[0]
              ?.slice(0, 120) ?? '',
          present: names
            .filter((name) => text.includes(name))
            .map((name) => ({ name, mood: 'neutral' as const })),
          place: null,
        })),
      },
      usage: {
        model: 'fake',
        tokensIn: Math.ceil(input.text.length / 4),
        tokensOut: 50,
        latencyMs: 1,
      },
    });
  }

  /**
   * A page's screenplay with no model: each quote in the page a line, by
   * whoever the words say says it; each paragraph with no quote a short
   * narration. The story's characters come from what the writer is told.
   */
  sceneScreenplay(input: {
    documentTitle: string;
    topicTitle: string;
    material: string;
    context: string;
    story?: string;
  }): Promise<LlmResult<ScreenplayDraft>> {
    const started = Date.now();
    const characters = [
      ...(input.story ?? '').matchAll(/^- ([\w-]+): ([^,(.]+)/gm),
    ].map((m) => ({ id: m[1], names: [m[2].trim()] }));
    const paragraphs = input.material
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#'));
    const lines = dialogueOf(paragraphs, characters);
    const blank = {
      to: null,
      from: null,
      do: null,
      state: null,
      show: null,
      pace: null,
      hold: null,
      place: null,
      music: null,
      energy: null,
    };
    const beats = paragraphs.flatMap(
      (paragraph, k): ScreenplayDraft['beats'] => {
        const said = lines.filter((line) => line.beat === k);
        if (!said.length) {
          const sentence = paragraph.split(/(?<=[.!?])\s+/)[0] ?? paragraph;
          return [
            {
              ...blank,
              kind: 'narration' as const,
              who: null,
              say: sentence.split(/\s+/).slice(0, 16).join(' '),
            },
          ];
        }
        return said.map((line) => ({
          ...blank,
          kind: 'line' as const,
          who: line.speaker,
          say: paragraph.slice(line.span[0], line.span[1]),
        }));
      },
    );
    const none = {
      brief: null,
      motion: null,
      parts: null,
      states: null,
      shape: null,
      sound: null,
      state: null,
      figure: null,
      count: null,
      pose: null,
      signs: null,
      holding: null,
    };
    return Promise.resolve({
      value: {
        fit: 'good',
        fitReason: null,
        title: input.topicTitle,
        mood: 'calm',
        opening: characters.map((c) => c.id),
        beats: beats.length
          ? beats
          : [
              {
                ...blank,
                kind: 'narration',
                who: null,
                say: 'The story goes on.',
              },
            ],
        cast: characters.map((c) => ({
          ...none,
          id: c.id,
          kind: 'character' as const,
          name: c.names[0],
          ref: c.id,
        })),
      },
      usage: {
        model: 'fake',
        tokensIn: Math.ceil(input.material.length / 4),
        tokensOut: 200,
        latencyMs: Date.now() - started,
      },
    });
  }

  sceneScript(input: {
    documentTitle: string;
    topicTitle: string;
    material: string;
    context: string;
  }): Promise<LlmResult<SceneScriptDraft>> {
    const started = Date.now();
    const sentences = input.material
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.split(' ').length >= 3)
      .slice(0, 8);
    const says =
      sentences.length >= 3
        ? sentences
        : [
            'This page has a few ideas.',
            'Here is the first of them.',
            'And this is how it ends.',
          ];
    const opening = (say: string) => say.split(/\s+/).slice(0, 2).join(' ');
    const none = {
      brief: null,
      motion: null,
      parts: null,
      states: null,
      shape: null,
      value: null,
      sound: null,
      lines: null,
      plot: null,
      quote: null,
      phrases: null,
      ref: null,
      state: null,
      timeline: null,
      chart: null,
    };
    return Promise.resolve({
      value: {
        fit: 'good',
        fitReason: null,
        title: input.topicTitle.slice(0, 60),
        mood: 'curious',
        beats: says.map((say, i) => ({
          say,
          pause: i === says.length - 1 ? ('long' as const) : ('short' as const),
          delivery:
            i === 0
              ? ('hook' as const)
              : i === says.length - 1
                ? ('recap' as const)
                : ('explain' as const),
        })),
        cast: [
          {
            id: 'main',
            kind: 'drawing',
            name: input.topicTitle.split(/\s+/).slice(0, 3).join(' '),
            brief: `A simple picture for ${input.topicTitle}`,
            motion: 'a gentle sway',
            parts: [{ name: 'core', label: true }],
            states: [],
            shape: 'square',
            value: null,
            style: null,
            sound: null,
            lines: null,
            plot: null,
            quote: null,
            phrases: null,
            ref: null,
            state: null,
            timeline: null,
            chart: null,
          },
          {
            id: 'idea',
            kind: 'words',
            name: 'Key idea',
            ...none,
            style: 'keyword',
          },
        ],
        steps: [
          {
            beat: 0,
            phrase: opening(says[0]),
            layout: 'one',
            show: ['main'],
            arrows: [],
            effects: null,
          },
          {
            beat: 1,
            phrase: opening(says[1]),
            layout: 'row',
            show: ['main', 'idea'],
            arrows: [{ from: 'main', to: 'idea', label: null, flow: true }],
            effects: null,
          },
          {
            beat: 2,
            phrase: opening(says[2]),
            layout: null,
            show: null,
            arrows: null,
            effects: [{ target: 'main.core', do: 'point' }],
          },
        ],
      },
      usage: this.usage(started, 900, 400),
    });
  }

  /** A swaying disc with a labelled core, drawn to the frame asked for. */
  sceneDrawing(input: {
    thing: Pick<
      DrawingThing,
      'name' | 'brief' | 'motion' | 'parts' | 'states' | 'shape'
    >;
    viewBox: { w: number; h: number };
  }): Promise<LlmResult<string>> {
    const started = Date.now();
    const { w, h } = input.viewBox;
    const r = Math.min(w, h) * 0.32;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      `<style>@keyframes sway { 50% { transform: rotate(5deg) } } .body { animation: sway 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }</style>` +
      `<g class="body"><circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="#3FA66B" stroke="#1F2A37" stroke-width="4"/>` +
      `<g id="core"><circle cx="${w / 2}" cy="${h / 2}" r="${r * 0.3}" fill="#F2B33D" stroke="#1F2A37" stroke-width="4"/></g></g>` +
      `<g id="core-label"><line x1="${w / 2}" y1="${h / 2}" x2="${w * 0.8}" y2="${h * 0.14}" stroke="#1F2A37" stroke-width="3"/>` +
      `<text x="${w * 0.8}" y="${h * 0.11}" font-size="${Math.ceil(w * 0.04)}" font-weight="600" text-anchor="middle" fill="#1F2A37">core</text></g>` +
      `</svg>`;
    return Promise.resolve({
      value: svg,
      usage: this.usage(started, 400, 300),
    });
  }

  /** A plain layout: a bed, a window and a rug, or a tree and a bush; code draws it. */
  setLayout(input: {
    brief: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const room = /\ba room\b/iu.test(input.brief);
    return Promise.resolve({
      value: room
        ? {
            ground: 'wood',
            walls: 'cream',
            items: [
              { kind: 'bed', x: 0.2, row: 'back', scale: 1, colour: null },
              {
                kind: 'curtains',
                x: 0.55,
                row: 'back',
                scale: 1,
                colour: 'red',
              },
              { kind: 'rug', x: 0.5, row: 'middle', scale: 1, colour: 'pink' },
            ],
            own: [],
          }
        : {
            sky: 'day',
            weather: 'clear',
            ground: 'grass',
            backdrop: 'hills',
            items: [
              { kind: 'tree', x: 0.1, row: 'middle', scale: 1, colour: null },
              { kind: 'bush', x: 0.8, row: 'back', scale: 1, colour: null },
            ],
            own: [],
          },
      usage: this.usage(started, 300, 120),
    });
  }

  lectureSketch(input: {
    topicTitle: string;
    shows: string;
    hint: SketchTemplate | null;
    material: string;
    pageText: string;
    correction?: string;
  }): Promise<LlmResult<SketchDraft>> {
    const started = Date.now();
    const words = input.material.split(/\s+/).filter(Boolean);
    const title = input.shows.split(/\s+/).slice(0, 4).join(' ');
    const draft: SketchDraft =
      input.hint === 'ring'
        ? {
            template: 'ring',
            title,
            points: [0, 1, 2, 3].map((i) => ({ label: `s${i}`, at: null })),
            markers: [0, 1, 2].map((i) => ({ label: `k${i}`, at: null })),
            arrowsClockwise: true,
            join: null,
          }
        : {
            template: 'graph',
            title,
            nodes: [
              {
                id: 'a',
                label: words[0] ?? 'start',
                shape: 'box',
                anchor: null,
              },
              {
                id: 'b',
                label: words[2] ?? 'middle',
                shape: 'box',
                anchor: null,
              },
              { id: 'c', label: words[4] ?? 'end', shape: 'box', anchor: null },
            ],
            edges: [
              { from: 'a', to: 'b', label: null, anchor: null },
              { from: 'b', to: 'c', label: null, anchor: null },
            ],
            groups: [],
          };
    return Promise.resolve({
      value: draft,
      usage: this.usage(started, 400, 120),
    });
  }

  async lectureVerify(input: {
    script: string;
    pageText: string;
    context: {
      plan: string;
      prevTail: string;
      neighbours: { pageNumber: number; text: string }[];
    };
  }): Promise<LlmResult<{ grounded: boolean; problems: string[] }>> {
    const started = Date.now();
    const grounded = !input.script.includes('UNGROUNDED');
    return {
      value: {
        grounded,
        problems: grounded ? [] : ['Invented a claim the page does not make'],
      },
      usage: this.usage(started, 200, 10),
    };
  }

  async workThrough({
    problem,
  }: {
    problem: string;
    summary: string | null;
    context: string | null;
  }): Promise<LlmResult<WorkedSolution>> {
    const started = Date.now();
    // A sum written in the problem, worked in one step; else a note that
    // there is nothing to work.
    const sum = /(\d+(?:\.\d+)?)\s*([+\-*x×])\s*(\d+(?:\.\d+)?)/.exec(problem);
    const a = sum ? Number(sum[1]) : 1;
    const b = sum ? Number(sum[3]) : 1;
    const sign = sum?.[2] ?? '+';
    const value = sign === '+' ? a + b : sign === '-' ? a - b : a * b;
    const tex = sign === '+' || sign === '-' ? sign : '\\times';
    return {
      value: {
        given: [],
        wanted: problem,
        steps: [
          {
            latex: `${a} ${tex} ${b} = ${value}`,
            does: 'work it out',
            why: null,
            changes: [],
            says: `${a} ${sign === '+' ? 'plus' : sign === '-' ? 'minus' : 'times'} ${b} is ${value}`,
          },
        ],
        answer: String(value),
        check: null,
      },
      usage: this.usage(started, problem.length, 40),
    };
  }

  async simplifyPage({
    pageText,
    pageNumber,
  }: {
    pageText: string;
    summary: string | null;
    pageNumber: number;
  }): Promise<LlmResult<Block[]>> {
    const started = Date.now();
    const lines = pageText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return {
        value: [{ type: 'paragraph', text: 'Nothing to explain here.' }],
        usage: this.usage(started, 0, 6),
      };
    }

    const blocks: Block[] = [];
    const [first, ...rest] = lines;
    if (first.length <= 80) blocks.push({ type: 'headingOne', text: first });

    const body = first.length <= 80 ? rest : lines;
    for (const line of body) {
      const bare = line
        .replace(/^\s*(?:[•▪◦·*-]|\(?\d{1,2}[.)]|\(?[ivx]+[.)])\s*/i, '')
        .trim();
      if (!bare) continue;

      if (line !== bare || bare.length < 90) {
        blocks.push({ type: 'bullet', text: bare });
      } else {
        blocks.push({ type: 'paragraph', text: bare });
      }
    }

    if (!blocks.length) {
      blocks.push({
        type: 'paragraph',
        text: `Page ${pageNumber} has no readable text.`,
      });
    }

    // A page mentioning an equation gets a sample math block, so local dev
    // exercises the KaTeX path without a real model.
    if (/\bequation|formula\b/i.test(pageText)) {
      blocks.push({ type: 'math', text: 'E = mc^2' });
    }

    return {
      value: blocks,
      usage: this.usage(started, pageText.length / 4, blocks.length * 20),
    };
  }

  async answerHighlight({
    task,
    selection,
    context,
    onToken,
  }: {
    task: 'highlight_explain' | 'highlight_simplify' | 'highlight_define';
    selection: string;
    context: string;
    summary: string | null;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>> {
    const started = Date.now();
    const lead = {
      highlight_explain: `Here is what "${selection}" means in this document.`,
      highlight_simplify: `In plainer words: "${selection}".`,
      highlight_define: `"${selection}" — definition from this document.`,
    }[task];

    const supporting = this.sentences(context).slice(0, 2).join(' ');
    const value = supporting
      ? `${lead} ${supporting}`
      : `${lead} The document does not expand on it.`;

    // Emit word by word so the streaming answer panel has something real to
    // consume before the real gateway exists.
    if (onToken) {
      for (const word of value.split(' ')) onToken(`${word} `);
    }

    return {
      value,
      usage: this.usage(started, context.length / 4, value.length / 4),
    };
  }

  async chatWithDocument(input: {
    history: { role: 'user' | 'assistant'; content: string }[];
    question: string;
    context: string;
    summary: string | null;
    profile: string;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>> {
    const started = Date.now();
    const answer = `[fake chat reply to "${input.question.slice(0, 60)}" after ${input.history.length} turns]`;
    input.onToken?.(answer);
    return {
      value: answer,
      usage: this.usage(started, input.question.length, answer.length),
    };
  }

  async writeRecap(input: {
    documentTitle: string;
    fromPage: number;
    toPage: number;
    pages: { pageNumber: number; text: string }[];
    topics: { title: string; startPage: number; endPage: number }[];
    questions: string[];
    checks: { kind: string; score: number }[];
    prerequisitesAsked: string[];
    profile: string;
  }): Promise<LlmResult<RecapBody>> {
    const started = Date.now();
    const body: RecapBody = {
      headline: `[fake recap of pages ${input.fromPage}-${input.toPage} of ${input.documentTitle}]`,
      covered: input.topics.slice(0, 3).map((topic) => ({
        title: topic.title,
        gist: `[fake gist of ${topic.title}]`,
        page: topic.startPage,
      })),
      keyTerms: [],
      shaky: input.prerequisitesAsked.slice(0, 2).map((concept) => ({
        what: concept,
        why: '[you asked for this from scratch]',
        page: 0,
      })),
      nextStep: '[fake next step]',
    };
    return {
      value: body,
      usage: this.usage(started, input.pages.length * 100, 200),
    };
  }

  async outlinePrerequisites(input: {
    summary: string | null;
    chapters: { title: string; description: string | null }[];
  }) {
    const started = Date.now();
    // Chapter 2 onward assumes the previous chapter's subject (internal), and
    // every third chapter also assumes one outside concept (external).
    const value = input.chapters.flatMap((chapter, index) => {
      if (index === 0) return [];
      const rows = [
        {
          chapter: index + 1,
          concept: input.chapters[index - 1].title.toLowerCase(),
          why: `Builds directly on "${input.chapters[index - 1].title}".`,
          coveredByChapter: index,
        },
      ];
      if ((index + 1) % 3 === 0) {
        rows.push({
          chapter: index + 1,
          concept: `outside concept ${index + 1}`,
          why: `Fake external assumption for "${chapter.title}".`,
          coveredByChapter: 0,
        });
      }
      return rows;
    });
    return {
      value,
      usage: this.usage(started, input.chapters.length * 8, value.length * 12),
    };
  }

  async interviewForTopic(input: { topic: string }) {
    const started = Date.now();
    return {
      value: {
        topic: input.topic,
        questions: [
          {
            id: 'level',
            question: `How much ${input.topic} do you already know?`,
            options: ['Nothing at all', 'A little', 'Quite a lot'],
          },
        ],
      },
      usage: this.usage(started, input.topic.length, 40),
    };
  }

  async outlineTopic(input: {
    topic: string;
    brief: string;
    targetPages: number;
    mustCover?: string[];
  }) {
    const started = Date.now();
    const chapters = Array.from(
      { length: Math.max(1, Math.round(input.targetPages / 3)) },
      (_, index) => ({
        title: `${input.topic}: part ${index + 1}`,
        summary: `Fake chapter ${index + 1} about ${input.topic}.`,
        pages: 3,
      }),
    );
    return {
      value: {
        title: `A study of ${input.topic}`,
        chapters,
        furtherTopics: [`Advanced ${input.topic}`],
      },
      usage: this.usage(started, input.brief.length, 60),
    };
  }

  async writeChapter(input: {
    topic: string;
    brief: string;
    documentTitle: string;
    chapter: { title: string; summary: string; pages: number };
    outline: string[];
  }) {
    const started = Date.now();
    return {
      value: {
        blocks: [
          { type: 'headingOne' as const, text: input.chapter.title },
          {
            type: 'paragraph' as const,
            text: `[fake chapter body for "${input.chapter.title}" in ${input.documentTitle}]`,
          },
        ],
      },
      usage: this.usage(started, input.chapter.summary.length, 80),
    };
  }

  async rewriteImageQuery({
    selection,
  }: {
    selection: string;
  }): Promise<LlmResult<string>> {
    const started = Date.now();
    const value = `${selection} diagram`;
    return { value, usage: this.usage(started, selection.length / 4, 4) };
  }

  async drawDiagram({
    description,
  }: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; mermaid: string }>> {
    const started = Date.now();
    // A real chart shape from the description's own words, so the render path
    // can be exercised offline.
    const words = description.split(/\s+/).filter(Boolean).slice(0, 6);
    const nodes = words.length ? words : ['Start', 'Middle', 'End'];
    const lines = ['flowchart TD'];
    for (let i = 0; i < nodes.length - 1; i++) {
      lines.push(`  n${i}["${nodes[i]}"] --> n${i + 1}["${nodes[i + 1]}"]`);
    }
    if (nodes.length === 1) lines.push(`  n0["${nodes[0]}"]`);
    return {
      value: { title: description.slice(0, 60), mermaid: lines.join('\n') },
      usage: {
        model: 'fake',
        tokensIn: description.length,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async generateTopicQuiz({
    topicTitle,
    focus,
    kinds,
  }: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
    focus?: string[];
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
  > {
    const started = Date.now();
    if (kinds?.length) {
      const items = kinds.map((kind, index) =>
        kind === 'true_false'
          ? {
              kind,
              question: `True or false: fake claim ${index + 1} about ${topicTitle}.`,
              options: ['True', 'False'],
              correctIndex: 0,
              explanation: 'The chapter says so.',
            }
          : kind === 'mcq'
            ? {
                kind,
                question: `Which of these is true of ${topicTitle}?`,
                options: ['The right one', 'A wrong one', 'Another wrong one'],
                correctIndex: 0,
                explanation: 'The chapter says so.',
              }
            : {
                kind,
                question: `Fake spoken question ${index + 1} about ${topicTitle}?`,
                options: ['The fake answer'],
                correctIndex: 0,
                explanation: 'The chapter says so.',
              },
      );
      return {
        value: { questions: items },
        usage: {
          model: 'fake',
          tokensIn: topicTitle.length,
          tokensOut: 0,
          latencyMs: Date.now() - started,
        },
      };
    }
    const q = (n: number) => ({
      question: focus?.length
        ? `Fake focus question ${n} on "${focus[0]}"?`
        : `Fake question ${n} about ${topicTitle}?`,
      options: ['Right answer', 'Wrong one', 'Also wrong'],
      correctIndex: 0,
      explanation: 'The first option restates the chapter.',
    });
    return {
      value: { questions: [q(1), q(2)] },
      usage: {
        model: 'fake',
        tokensIn: topicTitle.length,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async generateItems({
    topicTitle,
    kind,
    count,
  }: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
    kind: 'mcq' | 'flashcard' | 'cloze' | 'true_false' | 'mixed';
    count: number;
    avoidStems?: string[];
    focus?: string[];
    fromQuote?: string;
  }): Promise<LlmResult<GeneratedItem[]>> {
    const started = Date.now();
    const resolved = kind === 'mixed' ? 'mcq' : kind;
    const items: GeneratedItem[] = Array.from(
      { length: Math.max(1, count) },
      (_, index) => ({
        kind: resolved,
        stem: `Fake item ${index + 1} about ${topicTitle}?`,
        options:
          resolved === 'flashcard'
            ? ['The answer']
            : ['Right answer', 'Wrong one', 'Also wrong'],
        correctIndex: 0,
        explanation: 'The first option restates the chapter.',
        hint: 'Think about the chapter title.',
        topicTitle,
        sourceQuote: 'A sentence from the fake chapter.',
      }),
    );
    return {
      value: items,
      usage: {
        model: 'fake',
        tokensIn: topicTitle.length,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  /**
   * Agrees with option 0, which is what the fake writer marks correct — so
   * the local pipeline banks items end to end. A stem containing
   * "unverifiable" is refused instead, so the discard path is exercisable
   * without a real model.
   */
  async verifyItem({
    stem,
    options,
  }: {
    stem: string;
    options: string[];
    pagesText: string;
  }): Promise<LlmResult<ItemVerdict>> {
    const started = Date.now();
    const refuse = stem.toLowerCase().includes('unverifiable');
    return {
      value: {
        answerIndex: refuse ? -1 : 0,
        quote: refuse ? null : 'A sentence from the fake chapter.',
        supported: !refuse && options.length > 0,
      },
      usage: {
        model: 'fake',
        tokensIn: stem.length,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async generateTopicPreview({
    topicTitle,
  }: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
  }): Promise<LlmResult<TopicPreviewBody>> {
    const started = Date.now();
    return {
      value: {
        about: `A fake preview of ${topicTitle}: what it covers and why.`,
        outline: ['First movement of the argument', 'Second movement'],
        keyTerms: [{ term: 'Fake term', gloss: 'What the fake term means' }],
        howItEnds: 'It ends by restating the fake conclusion.',
        recallCues: [
          'How does the chapter open?',
          'What gets compared in the middle?',
          'Where does it land?',
        ],
      },
      usage: this.usage(started, topicTitle.length, 40),
    };
  }

  async gradeRecall({
    recall,
    previouslyMissed,
  }: {
    topicTitle: string;
    pagesText: string;
    recall: string;
    previouslyMissed?: string[];
  }): Promise<
    LlmResult<{
      score: number;
      nailed: string[];
      missed: string[];
      focus: string[];
      nowCovered: number[];
    }>
  > {
    const started = Date.now();
    const empty = !recall.trim();
    return {
      value: empty
        ? {
            score: 0,
            nailed: [],
            missed: ["The chapter's main idea"],
            focus: ['Reread the opening section'],
            nowCovered: [],
          }
        : {
            score: 0.5,
            nailed: ['One idea the recall carried'],
            missed: ['One idea the recall did not mention'],
            focus: ['The section the recall skipped'],
            // Deterministically closes the first open idea, so the
            // resolution path is exercisable offline.
            nowCovered: previouslyMissed?.length ? [0] : [],
          },
      usage: this.usage(started, recall.length, 30),
    };
  }

  async checkQuestionAnswer({
    answer,
  }: {
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
  > {
    const started = Date.now();
    return {
      value: {
        verdict: answer.trim() ? 'partial' : 'incorrect',
        explanation: 'A fake verdict: partly right, per the fake document.',
        page: 0,
      },
      usage: this.usage(started, answer.length, 20),
    };
  }

  async drawDiagramCloze({
    description,
  }: {
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
  > {
    const started = Date.now();
    return {
      value: {
        title: description.slice(0, 60),
        mermaid: 'flowchart LR\n  a["Start"] --> b["?"]\n  b --> c["End"]',
        options: ['Middle', 'Edge', 'Corner'],
        correctIndex: 0,
        explanation: 'The middle connects the start to the end.',
      },
      usage: {
        model: 'fake',
        tokensIn: description.length,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  async drawSketch({
    description,
  }: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; svg: string }>> {
    const started = Date.now();
    // A minimal allowlisted sketch so the sanitize-and-render path can be
    // exercised offline.
    const label = description.slice(0, 40) || 'sketch';
    const svg = [
      '<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">',
      `<title>${label}</title>`,
      '<rect x="200" y="150" width="400" height="200" fill="#faf8f2" stroke="#0b0b0c" stroke-width="2"/>',
      `<text x="400" y="120" font-size="18" text-anchor="middle" fill="#0b0b0c">${label}</text>`,
      '<line x1="400" y1="130" x2="400" y2="150" stroke="#6d5ef0" stroke-width="2"/>',
      '</svg>',
    ].join('');
    return {
      value: { title: description.slice(0, 60), svg },
      usage: {
        model: 'fake',
        tokensIn: description.length,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  /**
   * Hashed bag-of-words vectors. Not semantic, but stable and genuinely
   * comparable — similar text scores higher — which is enough to exercise
   * retrieval and the vector-store contract tests.
   */
  async embed({
    texts,
  }: {
    texts: string[];
    dimensions?: number;
  }): Promise<LlmResult<number[][]>> {
    const started = Date.now();
    const value = texts.map((text) => {
      const vector = new Array<number>(EMBED_DIMENSIONS).fill(0);
      for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        const slot =
          createHash('md5').update(word).digest().readUInt32BE(0) %
          EMBED_DIMENSIONS;
        vector[slot] += 1;
      }
      const magnitude = Math.hypot(...vector) || 1;
      return vector.map((component) => component / magnitude);
    });

    return {
      value,
      usage: this.usage(started, texts.join(' ').length / 4, 0),
    };
  }

  // ── The Studio, offline ─────────────────────────────────────────────────

  /**
   * The producer, offline: whatever the message says of the format, the
   * audience, the length and the tone, from plain keywords; the outline
   * written as soon as nothing is missing.
   */
  async studioTurn(input: {
    phase: 'brief' | 'outline' | 'cast' | 'script' | 'made';
    state: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    message: string;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<StudioTurnDraft>> {
    const started = Date.now();
    const said = input.message.toLowerCase();
    const brief: Record<string, unknown> = {
      format: /\b(?:teach|explain|lesson|class|how|why)\b/.test(said)
        ? 'explainer'
        : /\bstory|tale\b/.test(said)
          ? 'story'
          : null,
      idea: input.phase === 'brief' && said.length > 12 ? input.message : null,
      audience: /\bteen/.test(said)
        ? 'teens'
        : /\badult/.test(said)
          ? 'adults'
          : /\bchild|kid/.test(said)
            ? 'children'
            : null,
      minutes: Number(said.match(/(\d+(?:\.\d+)?)\s*min/)?.[1]) || null,
      tone:
        ['funny', 'gentle', 'exciting', 'serious', 'calm'].find((t) =>
          said.includes(t),
        ) ?? null,
      setting: null,
      characters: null,
      include: null,
    };
    const yes = /\b(?:yes|go|ok|okay|sure|write it|looks good|make it)\b/.test(
      said,
    );
    // New drawings waiting, and one chosen in words: which is the Studio's to read.
    const choosing =
      /New drawings waiting/.test(input.state) &&
      /\b(?:use|pick|choose|like|keep|prefer)\b/.test(said);
    const action: StudioTurnDraft['action'] = choosing
      ? 'choose'
      : input.phase === 'brief'
        ? yes
          ? 'outline'
          : 'none'
        : input.phase === 'outline' || input.phase === 'cast'
          ? yes
            ? 'approve'
            : 'outline'
          : /\bmake\b/.test(said)
            ? 'make'
            : 'scene';
    const reply =
      action === 'outline' ? 'Writing the outline now.' : 'Tell me more.';
    input.onToken?.(reply);
    return {
      value: {
        reply,
        choices: [],
        brief,
        action,
        scene: action === 'scene' ? 1 : null,
        request:
          action === 'scene' ||
          (action === 'outline' && input.phase !== 'brief')
            ? input.message
            : null,
        refuse: false,
      },
      usage: this.usage(started, input.message.length / 4, reply.length / 4),
    };
  }

  async studioBible(input: {
    brief: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const explainer = /format: explainer/i.test(input.brief);
    return {
      value: explainer
        ? {
            characters: [],
            sets: [],
            world: null,
            subject: 'a lesson',
            maths: false,
            pictures: [],
          }
        : {
            characters: [
              {
                id: 'ada',
                name: 'Ada',
                kind: 'person',
                role: 'main',
                look: 'a girl in a red dress',
                figure: {
                  age: 'child',
                  hair: 'afro',
                  top: 'dress',
                  topColour: 'red',
                  skin: 7,
                },
                size: null,
                voice: 'girl',
                voicePick: 0,
                traits: ['curious'],
                carries: null,
              },
              {
                id: 'kofi',
                name: 'Kofi',
                kind: 'person',
                role: 'main',
                look: 'a boy in a blue t-shirt',
                figure: {
                  age: 'child',
                  hair: 'short',
                  top: 't-shirt',
                  topColour: 'blue',
                  skin: 8,
                },
                size: null,
                voice: 'boy',
                voicePick: 0,
                traits: ['cheeky'],
                carries: null,
              },
            ],
            sets: [
              {
                id: 'yard',
                name: 'The yard',
                look: 'a sunny yard with a mango tree',
                kind: 'outdoor',
                stand: 'on',
                front: null,
                sound: null,
              },
            ],
            world: {
              era: 'today',
              region: 'Ghana',
              culture: '',
              landscape: '',
              homes: '',
            },
            subject: '',
            maths: false,
            pictures: [],
          },
      usage: this.usage(started, input.brief.length / 4, 200),
    };
  }

  async studioOutline(input: {
    brief: string;
    bible: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const explainer = /format: explainer/i.test(input.brief);
    const scenes = [1, 2].map((n) =>
      explainer
        ? {
            title: `Part ${n}`,
            summary: `The lesson, part ${n}.`,
            set: null,
            cast: [],
            seconds: 30,
            teach:
              'Plants make their own food from sunlight, water and air. The green leaves catch the light, and the plant uses its energy to turn water and carbon dioxide into sugar. This is called photosynthesis.',
            points: ['a leaf in the sun'],
          }
        : {
            title: `Scene ${n}`,
            summary: `Ada and Kofi play, part ${n}.`,
            set: 'yard',
            cast: ['ada', 'kofi'],
            seconds: 30,
            teach: null,
            points: [],
          },
    );
    return {
      value: {
        title: explainer ? 'A lesson' : 'Ada and Kofi',
        logline: 'Two friends play.',
        scenes,
      },
      usage: this.usage(started, input.brief.length / 4, 200),
    };
  }

  /** Story development, faked: Ada and Kofi's kite, in two scenes in the yard. */
  async studioPremise(input: {
    brief: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    return {
      value: {
        title: 'Ada and Kofi',
        logline:
          'Ada wants to fly the kite she built before the wind drops, but Kofi has tied it to the tree as a joke and cannot untie his own knot.',
        theme: 'a joke is only funny if everyone is laughing',
        hook: 'A kite tugs at a string that goes nowhere.',
        genre: 'comedy',
        ending: 'happy',
        stakes: 'the last good wind of the day',
        tools: ['ticking clock: the wind is dropping', 'it gets worse'],
        gag: 'Kofi says every knot is his best knot',
        clues: [],
        hero: 'ada',
        want: 'to fly the kite she built',
        obstacle: "Kofi's knot on the tree",
        clock: 'before the wind drops at sunset',
        normalDay: 'Ada flies a kite in the yard every windy afternoon',
        whyToday: 'today Kofi tied her new kite to the tree as a joke',
        whyCare: 'she built the kite herself from old newspaper',
        oddity: null,
        spine: [
          'Once upon a time there was a girl called Ada who built kites.',
          'Every day she flew one in the yard.',
          'Until one day Kofi tied her new kite to the tree as a joke.',
          'Because of that they pulled, and the knot only got tighter.',
          'Until finally Kofi owned up and Ada untied it with one tug.',
          'Ever since then Kofi asks before he ties anything.',
        ],
      },
      usage: this.usage(started, input.brief.length / 4, 120),
    };
  }

  async studioCharacters(input: {
    brief: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const sheet = (id: string, want: string, flaw: string, other: string) => ({
      id,
      want,
      need: 'to laugh at themselves',
      flaw,
      fear: 'being left out',
      personality: ['counts everything twice', 'hums when thinking'],
      voice: 'short sentences, a pet phrase: "watch this"',
      habits: ['taps a foot'],
      relationships: [
        { with: other, is: 'best friends', tension: 'who is in charge' },
      ],
      arc: { from: 'proud', to: 'laughing along' },
    });
    return {
      value: {
        characters: [
          sheet(
            'ada',
            'to fly her kite',
            'never admits she needs help',
            'kofi',
          ),
          sheet('kofi', 'to make Ada laugh', 'takes jokes too far', 'ada'),
        ],
      },
      usage: this.usage(started, input.brief.length / 4, 160),
    };
  }

  async studioBeats(input: {
    brief: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const beat = (
      role: string,
      what: string,
      intensity: number,
      plants: string[] = [],
      pays: string[] = [],
    ) => ({
      role,
      what,
      wants: 'Ada wants to fly the kite',
      stops: 'the knot',
      changes: 'things get harder',
      intensity,
      plants,
      pays,
      link:
        role === 'setup'
          ? null
          : /problem|twist/u.test(role)
            ? 'but'
            : 'therefore',
    });
    return {
      value: {
        beats: [
          beat('setup', 'Ada shows Kofi her kite.', 2, ['knot']),
          beat('problem', 'The kite is tied to the tree.', 5),
          beat(
            'attempt',
            'They pull, the knot tightens, and Kofi says it is his best knot.',
            6,
          ),
          beat('twist', 'Kofi admits he tied it with his best knot.', 8),
          beat(
            'payoff',
            'Ada unties it with one tug and they fly it.',
            3,
            [],
            ['knot'],
          ),
        ],
      },
      usage: this.usage(started, input.brief.length / 4, 160),
    };
  }

  async studioScenePlan(input: {
    brief: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const scene = (n: number, beats: number[], turn: string) => ({
      title: `Scene ${n}`,
      beats,
      purpose: 'moves the story on',
      conflict: 'Ada wants to fly the kite; the knot will not give',
      turn,
      shift: 'hope to worry',
      moment: 'the kite tugging at the tree',
      set: 'yard',
      cast: ['ada', 'kofi'],
      seconds: 30,
      summary: `Ada and Kofi play, part ${n}.`,
      setup:
        n === 1
          ? [
              {
                part: 'want',
                how: 'line',
                by: 'ada',
                to: 'kofi',
                what: 'my kite is stuck',
              },
              {
                part: 'obstacle',
                how: 'thing',
                by: '',
                to: '',
                what: "Kofi's knot on the tree",
              },
              {
                part: 'stakes',
                how: 'line',
                by: 'ada',
                to: 'kofi',
                what: 'the last wind of the day',
              },
              {
                part: 'clock',
                how: 'line',
                by: 'ada',
                to: 'kofi',
                what: 'before the wind drops',
              },
            ]
          : [],
      value: {
        name: 'flying',
        from: n === 1 ? '+' : '-',
        to: n === 1 ? '-' : '+',
      },
      start:
        n === 1
          ? 'Ada tugs at the kite string tied to the tree'
          : 'Kofi picks at his own knot',
      link: n === 1 ? null : 'but',
    });
    return {
      value: {
        scenes: [
          scene(1, [0, 1, 2], 'the knot is tighter than ever'),
          scene(2, [3, 4], 'the kite flies'),
        ],
      },
      usage: this.usage(started, input.brief.length / 4, 160),
    };
  }

  async studioScene(input: {
    scene: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const line = (
      who: string,
      to: string,
      say: string,
      feeling: string,
      aim: string,
    ) => ({
      kind: 'line',
      who,
      to,
      say,
      aim,
      feeling,
      sign: null,
      do: null,
      prop: null,
      spot: null,
      from: 'here',
      pace: null,
      seconds: null,
    });
    return {
      value: {
        title: input.scene.split('\n')[0].slice(0, 40) || 'A scene',
        set: 'yard',
        time: 'day',
        weather: 'clear',
        crowd: 'none',
        mood: 'playful',
        music: 'playful',
        transition: 'cut',
        onStage: [
          {
            who: 'ada',
            spot: 'centre-left',
            pose: 'standing',
            face: 'happy',
            holding: null,
          },
          {
            who: 'kofi',
            spot: 'centre-right',
            pose: 'standing',
            face: 'neutral',
            holding: null,
          },
        ],
        props: [],
        beats: [
          {
            kind: 'narration',
            who: null,
            to: null,
            say: 'A hot afternoon in the yard.',
            feeling: null,
            sign: null,
            do: null,
            prop: null,
            spot: null,
            from: null,
            pace: null,
            seconds: null,
          },
          line(
            'ada',
            'kofi',
            'Kofi, my kite is stuck in your knot, and the last wind of the day drops at sunset!',
            'angry',
            'accuses',
          ),
          line(
            'kofi',
            'ada',
            'Best knot I ever tied. Want me to untie it?',
            'happy',
            'teases',
          ),
        ],
        camera: [],
      },
      usage: this.usage(started, input.scene.length / 4, 200),
    };
  }

  /**
   * The table read, offline: every scene read and passed, a little over
   * the bar, so nothing is written again without the network.
   */
  async studioTableRead(input: {
    script: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const count = (input.script.match(/^SCENE \d+:/gmu) ?? []).length;
    const scores = Object.fromEntries(RUBRIC_KEYS.map((key) => [key, 7.5]));
    return Promise.resolve({
      value: {
        scores,
        overall: 7.5,
        scenes: Array.from({ length: count }, (_, k) => ({
          scene: k + 1,
          score: 7.5,
          notes: [],
        })),
        voice: [],
        verdict: 'A clear little story that works.',
      },
      usage: this.usage(started, input.script.length / 4, 200),
    });
  }

  /**
   * The cold read, offline: a viewer who followed it, its first spoken
   * line taken for what it is about.
   */
  async studioColdRead(input: {
    kind: string;
    film: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const first =
      /^\s+[^[\n]+?: (.+)$/mu.exec(input.film)?.[1] ?? 'a short story';
    return Promise.resolve({
      value: {
        about: first,
        sentence: `The first one to speak wants ${first}.`,
        who: 'the first one to speak',
        wants: first,
        obstacle: 'what is in their way',
        stakes: 'what they could lose',
        clock: '',
        confused: [],
        wondering: [],
        sure: 8,
        people: [],
        impossible: '',
      },
      usage: this.usage(started, input.film.length / 4, 120),
    });
  }

  /** The retelling, offline: each scene joined to the one before by "therefore". */
  async studioRetell(input: {
    kind: string;
    film: string;
  }): Promise<LlmResult<Record<string, unknown>>> {
    const started = Date.now();
    const count = (input.film.match(/^SCENE \d+\./gmu) ?? []).length;
    return Promise.resolve({
      value: {
        scenes: Array.from({ length: count }, (_, k) => ({
          scene: k + 1,
          link: k ? 'therefore' : '',
          what: `Scene ${k + 1} happens.`,
        })),
        finally: '',
        about: 'a short story',
      },
      usage: this.usage(started, input.film.length / 4, 120),
    });
  }

  /**
   * The check of a scene made again as asked, offline: done when the film
   * reads differently now and code sees nothing wrong in it.
   */
  async studioCheck(input: {
    words: string;
    request: string;
    before: string[];
    after: string[];
    faults: string[];
  }): Promise<LlmResult<StudioCheckVerdict>> {
    const started = Date.now();
    const changed =
      input.before.join('\n') !== input.after.join('\n') ||
      !input.before.length;
    const resolved = changed && !input.faults.length;
    return Promise.resolve({
      value: {
        resolved,
        reason: resolved
          ? ''
          : (input.faults[0] ?? 'the film shows what it did before'),
        tell: resolved
          ? 'it now shows what you asked for'
          : (input.faults[0] ?? 'the film still shows what it did before'),
        faults: resolved ? [] : ['other'],
      },
      usage: this.usage(started, 1000, 60),
    });
  }

  async moderate(input: {
    text: string;
  }): Promise<{ flagged: boolean; categories: string[] }> {
    return /\bnsfw\b/i.test(input.text)
      ? { flagged: true, categories: ['sexual'] }
      : { flagged: false, categories: [] };
  }

  private sentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 8);
  }
}

/* eslint-disable @typescript-eslint/require-await --
 * Every method implements the async LlmGatewayPort with a synchronous body;
 * that is the whole point of a deterministic offline stand-in. */
import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { Block, RecapBody } from '../../contracts';
import type {
  LlmGatewayPort,
  LlmResult,
  TopicDraft,
} from '../../business/ports/llm.port';

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

  async simplifyPage({
    task,
    pageText,
    pageNumber,
  }: {
    task: 'simplify_standard' | 'simplify_easiest';
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

      if (task === 'simplify_easiest') {
        // The Easiest level's defining trait is short sentences, so split.
        for (const sentence of this.sentences(bare)) {
          blocks.push({ type: 'bullet', text: sentence });
        }
      } else if (line !== bare || bare.length < 90) {
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

  /**
   * Hashed bag-of-words vectors. Not semantic, but stable and genuinely
   * comparable — similar text scores higher — which is enough to exercise
   * retrieval and the vector-store contract tests.
   */
  async embed({ texts }: { texts: string[] }): Promise<LlmResult<number[][]>> {
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

  private sentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 8);
  }
}

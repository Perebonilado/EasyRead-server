import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Block, Level, VoiceSessionResponse } from '../../../contracts';
import {
  DocumentNotReadyError,
  NotFoundError,
} from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { REALTIME, SPEECH, STORAGE } from '../../ports/tokens';
import type { RealtimePort, SpeechPort } from '../../ports/voice.port';
import type { StoragePort } from '../../ports/storage.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
} from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type {
  SummaryRepository,
} from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

export type AudioLevel = 'original' | Level;

export interface PageAudioRequest {
  userId: string;
  documentId: string;
  level: AudioLevel;
  pageNumber: number;
}

/**
 * Reads one page aloud (original text or a simplified level).
 *
 * Synthesised once per (document version, level, page, voice, model) and kept
 * in storage — audio costs roughly forty times the model call that wrote the
 * text, so a page must never be voiced twice. The cache key carries the voice
 * and model so changing either in config regenerates rather than serving the
 * old voice forever.
 */
@Injectable()
export class PageAudioHandler extends AbstractRequestHandlerTemplate<
  PageAudioRequest,
  { fileRef: string; mimeType: string }
> {
  constructor(
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(SPEECH) private readonly speech: SpeechPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: PageAudioRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const text = await this.textFor(cmd);
    const voice = this.config.get<string>('AI_TTS_VOICE', 'alloy');
    const model = this.config.get<string>('AI_TTS_MODEL', 'gpt-4o-mini-tts');
    const key =
      `documents/${doc.id}/audio/v${doc.contentVersion}/` +
      `${cmd.level}/${cmd.pageNumber}-${voice}-${model}.mp3`;

    // Cache hit: the file already exists for this exact configuration.
    const cached = await this.storage.size(key).catch(() => null);
    if (cached) {
      return CommandResponse.of({ fileRef: key, mimeType: 'audio/mpeg' });
    }

    const result = await this.speech.synthesize({ text, voice });
    await this.storage.put({
      key,
      body: result.audio,
      mimeType: result.mimeType,
    });

    await this.calls.record({
      documentId: doc.id,
      task: `tts_${cmd.level}`,
      model: `openai:${result.model}`,
      // Speech is priced per character, not per token; recording the input
      // length here keeps the cost ledger answerable for audio too.
      tokensIn: text.length,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
    });

    return CommandResponse.of({ fileRef: key, mimeType: 'audio/mpeg' });
  }

  /** The page's text at the requested level, refusing when there is none. */
  private async textFor(cmd: PageAudioRequest): Promise<string> {
    if (cmd.level === 'original') {
      const page = await this.pages.findOne(cmd.documentId, cmd.pageNumber);
      if (!page) throw new NotFoundError('Page');
      if (page.isEmpty) {
        throw new NotFoundError('Readable text on this page');
      }
      return page.text;
    }

    const page = await this.simplified.find(
      cmd.documentId,
      cmd.level,
      cmd.pageNumber,
    );
    if (!page) throw new NotFoundError('Page');
    if (page.status !== 'done') {
      throw new DocumentNotReadyError(
        "This page hasn't been simplified yet — it can be read aloud once it has",
      );
    }
    if (!page.blocks?.length) {
      // A figure-only page: recorded done with nothing to say.
      throw new NotFoundError('Readable text on this page');
    }
    return blocksToProse(page.blocks);
  }
}

/**
 * Blocks are written for the eye; this rewrites them for the ear. Headings get
 * a beat after them and bullets become plain sentences — reading "bullet"
 * punctuation aloud is what makes TTS sound like a screen reader.
 */
export function blocksToProse(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const text = block.text.trim().replace(/\s+/g, ' ');
      if (!text) return '';
      const ended = /[.!?:]$/.test(text) ? text : `${text}.`;
      return block.type === 'headingOne' || block.type === 'headingTwo'
        ? `${ended}\n`
        : ended;
    })
    .filter(Boolean)
    .join('\n');
}

export interface VoiceSessionRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
}

/**
 * Starts a live voice conversation about the document (§8, spoken).
 *
 * The server's part is deliberately small: check access, spend the allowance,
 * compose the tutor's instructions, and mint a short-lived key. The audio
 * itself flows browser ↔ provider directly over WebRTC, so a conversation
 * costs this server nothing in bandwidth and the real API key never leaves it.
 *
 * The base instructions come back to the client too: page context is appended
 * client-side as the reader moves, and a `session.update` replaces the whole
 * instruction string, so the client must be able to reconstruct it.
 */
@Injectable()
export class StartVoiceSessionHandler extends AbstractRequestHandlerTemplate<
  VoiceSessionRequest,
  VoiceSessionResponse
> {
  constructor(
    @Inject(REALTIME) private readonly realtime: RealtimePort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VoiceSessionRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    // A conversation is a run of highlight-grade model calls, so it draws on
    // the same daily allowance — one unit per session, not per exchange.
    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    const summary = await this.summaries.find(doc.id);
    const baseInstructions = [
      `You are a patient study tutor discussing the document "${doc.props.title}" with a student, out loud.`,
      summary ? `What the document covers:\n${summary}` : null,
      'Ground every answer in this document. If it does not cover something, say so plainly rather than answering from general knowledge.',
      'Keep technical terms, names and numbers exactly as the document uses them — the student is being examined on them — and explain them in plain words alongside.',
      'This is speech: answer in short, plain sentences, a few at a time. No lists, no headings, no markdown. Pause naturally rather than lecturing.',
      'The text of the page the student is currently reading is appended below. When they say "this page" or "here", that is what they mean.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const session = await this.realtime.createSession({
      instructions: baseInstructions,
    });

    await this.calls.record({
      documentId: doc.id,
      task: 'voice_session',
      model: `openai:${session.model}`,
      tokensIn: null,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
    });

    return CommandResponse.of({
      clientSecret: session.clientSecret,
      model: session.model,
      expiresAt: session.expiresAt,
      baseInstructions,
    });
  }
}

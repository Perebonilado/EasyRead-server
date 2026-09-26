import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  SceneDto,
  StudioEpisodeDto,
  StudioMessageDto,
  StudioPlayDto,
  StudioSceneDto,
  StudioShowCardDto,
  StudioShowDto,
} from '../../../contracts';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { characterVoice } from '../../domain/scene-voice';
import {
  EMPTY_BRIEF,
  SOURCE_CHARS,
  bibleOf,
  briefMissing,
  briefOf,
  mendExplainerLines,
  outlineOf,
  secondsOf,
  storySheetOf,
  type SceneSheet,
  type StudioBible,
  type StudioOutline,
} from '../../domain/studio/studio';
import {
  checkExplainer,
  checkSheet,
  endStateOf,
  mendOutline,
  mendSheet,
  type SheetProblem,
} from '../../domain/studio/studio-check';
import { MADE_WITH } from '../../domain/studio/studio-brand';
import { storyBibleFor } from '../../domain/studio/studio-stage';
import { describeForProducer } from '../../domain/studio/studio-words';
import type { ClockPort } from '../../ports/clock.port';
import type { JobQueuePort, StudioJob } from '../../ports/job-queue.port';
import type {
  LlmGatewayPort,
  LlmUsage,
  StudioTurnDraft,
} from '../../ports/llm.port';
import type { StoragePort } from '../../ports/storage.port';
import { CLOCK, JOB_QUEUE, LLM_GATEWAY, STORAGE } from '../../ports/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../repositories/studio.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../../repositories/tokens';
import { SceneVoiceService } from '../admin/scene-voice.service';
import { EntitlementsService } from '../documents/entitlements.service';
import { StudioCastService } from './studio-cast.service';
import {
  bibleDto,
  blockersOf,
  briefDto,
  episodeDto,
  messageDto,
  needsMaking,
  sceneDto,
  sceneFingerprint,
} from './studio-views';

/** A maker's messages to the producer an hour, at most: fair use for a free tool. */
export const MESSAGES_AN_HOUR = 60;
/** The longest message the producer reads. */
const MESSAGE_CHARS = 4000;
/** A message this long, while the brief is being made, is the maker's own text to make it from. */
const SOURCE_AT = 900;
/** What the producer says to what the Studio does not make. */
const REFUSAL =
  "That's not something the Studio can make. It makes stories and lessons that are safe for everyone: try a different idea, and I'll help you shape it.";

/**
 * The Studio, as the app asks it: shows and their conversation with the
 * producer, episodes from outline to film, each scene's sheet read,
 * changed by hand or by asking, and made; and an episode shared by link.
 *
 * Every show belongs to its maker: anything asked for by anyone else is
 * not found, never refused, so no one learns what exists.
 */
@Injectable()
export class StudioService {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly studio: StudioRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly entitlements: EntitlementsService,
    private readonly cast: StudioCastService,
    private readonly voices: SceneVoiceService,
  ) {}

  // ── Whose it is ─────────────────────────────────────────────────────────

  private async requireShow(
    userId: string,
    id: string,
  ): Promise<StudioShowRecord> {
    const show = await this.studio.findShow(id);
    if (!show || show.userId !== userId) throw new NotFoundError('Show');
    return show;
  }

  private async requireEpisode(
    userId: string,
    id: string,
  ): Promise<{ show: StudioShowRecord; episode: StudioEpisodeRecord }> {
    const episode = await this.studio.findEpisode(id);
    if (!episode || episode.userId !== userId)
      throw new NotFoundError('Episode');
    const show = await this.requireShow(userId, episode.showId);
    return { show, episode };
  }

  private async requireScene(
    userId: string,
    id: string,
  ): Promise<{
    show: StudioShowRecord;
    episode: StudioEpisodeRecord;
    scene: StudioSceneRecord;
  }> {
    const scene = await this.studio.findScene(id);
    if (!scene) throw new NotFoundError('Scene');
    const { show, episode } = await this.requireEpisode(
      userId,
      scene.episodeId,
    );
    return { show, episode, scene };
  }

  // ── Views ───────────────────────────────────────────────────────────────

  async shows(userId: string): Promise<StudioShowCardDto[]> {
    const shows = await this.studio.listShows(userId);
    return Promise.all(
      shows.map(async (show) => {
        const episodes = await this.studio.listEpisodes(show.id);
        const latest = episodes[episodes.length - 1];
        return {
          id: show.id,
          title: show.title,
          format: show.format,
          episodes: episodes.length,
          thumbEpisodeId: episodes.find((e) => e.thumbKey)?.id ?? null,
          phase: latest?.phase ?? 'brief',
          updatedAt: show.updatedAt.toISOString(),
        };
      }),
    );
  }

  async show(userId: string, id: string): Promise<StudioShowDto> {
    return this.showDto(await this.requireShow(userId, id));
  }

  private async showDto(show: StudioShowRecord): Promise<StudioShowDto> {
    const [episodes, messages, balance] = await Promise.all([
      this.studio.listEpisodes(show.id),
      this.studio.listMessages(show.id, 80),
      this.entitlements.studioBalance(show.userId),
    ]);
    const bible = show.bible
      ? bibleDto(show.bible, await this.cast.drawings(show.id, show.bible))
      : null;
    return {
      id: show.id,
      title: show.title,
      format: show.format,
      brief: briefDto(show.brief),
      briefMissing: briefMissing(show.brief),
      bible,
      episodes: episodes.map((e) => ({
        id: e.id,
        number: e.number,
        title: e.title,
        phase: e.phase,
        durationMs: e.durationMs,
        hasThumb: Boolean(e.thumbKey),
      })),
      messages: messages.map(messageDto),
      balance,
    };
  }

  async episode(userId: string, id: string): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, id);
    return this.episodeView(show, episode);
  }

  private async episodeView(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<StudioEpisodeDto> {
    const scenes = await this.studio.listScenes(episode.id);
    return episodeDto(episode, scenes, show.bible, show.brief);
  }

  // ── Shows ───────────────────────────────────────────────────────────────

  /** A new show, empty, with its first episode waiting on a brief. */
  async createShow(userId: string): Promise<StudioShowDto> {
    const show = await this.studio.createShow({
      userId,
      title: 'New show',
      brief: EMPTY_BRIEF,
    });
    await this.studio.createEpisode({
      showId: show.id,
      userId,
      number: 1,
      title: 'Episode 1',
      phase: 'brief',
    });
    return this.showDto(show);
  }

  async renameShow(
    userId: string,
    id: string,
    title: string,
  ): Promise<StudioShowDto> {
    const show = await this.requireShow(userId, id);
    const clean = title.trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!clean) throw new ValidationError('Give the show a name');
    await this.studio.updateShow(show.id, { title: clean });
    return this.showDto({ ...show, title: clean });
  }

  async deleteShow(userId: string, id: string): Promise<void> {
    const show = await this.requireShow(userId, id);
    await this.studio.deleteShow(show.id, this.clock.now());
  }

  /** The brief changed by hand, field by field. */
  async updateBrief(
    userId: string,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<StudioShowDto> {
    const show = await this.requireShow(userId, id);
    const brief = briefOf(patch, show.brief);
    // Anything they clear, cleared: a null the form sends is meant.
    for (const key of ['setting', 'characters', 'include', 'source'] as const)
      if (key in patch && (patch[key] === null || patch[key] === ''))
        brief[key] = null;
    await this.studio.updateShow(show.id, { brief, format: brief.format });
    return this.showDto({ ...show, brief, format: brief.format });
  }

  /**
   * The cast and places changed by hand: a look, a voice, a name. Ids
   * are kept, so every scene still names the same people; drawings of
   * anyone whose look changed are drawn again.
   */
  async updateBible(
    userId: string,
    id: string,
    body: unknown,
  ): Promise<StudioShowDto> {
    const show = await this.requireShow(userId, id);
    const before = show.bible;
    const bible = bibleOf(body);
    if (before) {
      // Anyone the maker did not send keeps their place; ids never change.
      const ids = new Set(bible.characters.map((c) => c.id));
      for (const c of before.characters)
        if (!ids.has(c.id)) bible.characters.push(c);
      const sets = new Set(bible.sets.map((s) => s.id));
      for (const s of before.sets) if (!sets.has(s.id)) bible.sets.push(s);
      bible.world ??= before.world;
      bible.subject ||= before.subject;
      bible.pictures = bible.pictures.length ? bible.pictures : before.pictures;
      await this.cast.forgetChanged(show.id, before, bible);
    }
    await this.studio.updateShow(show.id, { bible });
    return this.showDto({ ...show, bible });
  }

  /**
   * A character's voice, a line of it, as the film will speak it: kept, so
   * it is spoken once for each voice.
   */
  async voiceSample(
    userId: string,
    id: string,
    characterId: string,
  ): Promise<{ audio: Buffer; mimeType: string }> {
    const show = await this.requireShow(userId, id);
    const character = show.bible?.characters.find((c) => c.id === characterId);
    if (!show.bible || !character) throw new NotFoundError('Character');
    const { engine, speech, voice } = await this.voices.current();
    const story = storyBibleFor(show.bible, [], show.title);
    const own = story.characters.find((c) => c.id === character.id)!;
    const speaker = characterVoice(
      story,
      own,
      engine === 'openai' ? null : engine,
      voice,
    );
    const name = speaker?.voice ?? voice;
    const key = `studio/${show.id}/voices/${character.id}-${engine}-${name.replace(/[^a-z0-9_]+/gi, '+')}.mp3`;
    try {
      return { audio: await this.storage.get(key), mimeType: 'audio/mpeg' };
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
    const line = `Hello! I'm ${character.name}.${character.traits.length ? ` People say I'm ${character.traits.slice(0, 2).join(' and ')}.` : ''}`;
    const said = await speech.synthesize({
      text: line,
      voice: name,
      speed: speaker?.pace ?? 1,
      pieces: [
        {
          text: line,
          speed: speaker?.pace ?? 1,
          pauseAfter: 0.2,
          ...(speaker ? { style: speaker.style, voice: speaker.voice } : {}),
        },
      ],
    });
    await this.storage.put({ key, body: said.audio, mimeType: said.mimeType });
    return { audio: said.audio, mimeType: said.mimeType };
  }

  // ── The producer ────────────────────────────────────────────────────────

  /**
   * One turn of the conversation: the maker's message, the producer's
   * reply (streamed as it is written), what it learnt of the brief, and
   * the step it takes: an outline written, approved, a cast or a scene
   * changed, the film made, a new episode begun.
   */
  async turn(
    userId: string,
    showId: string,
    input: { episodeId?: string | null; message: string },
    onToken: (chunk: string) => void,
  ): Promise<{
    message: StudioMessageDto;
    show: StudioShowDto;
    episode: StudioEpisodeDto;
  }> {
    const show = await this.requireShow(userId, showId);
    const text = input.message.trim().slice(0, MESSAGE_CHARS + SOURCE_CHARS);
    if (!text) throw new ValidationError('Say what you would like to make');
    const hourAgo = new Date(this.clock.now().getTime() - 3_600_000);
    if (
      (await this.studio.countUserMessagesSince(userId, hourAgo)) >=
      MESSAGES_AN_HOUR
    )
      throw new ValidationError(
        'That is a lot of messages in an hour. Take a short break and carry on in a few minutes.',
      );
    const episodes = await this.studio.listEpisodes(show.id);
    let episode =
      episodes.find((e) => e.id === input.episodeId) ??
      episodes[episodes.length - 1];
    if (!episode) throw new NotFoundError('Episode');

    await this.studio.addMessage({
      showId: show.id,
      episodeId: episode.id,
      role: 'user',
      content: text,
    });
    const flagged = await this.llm.moderate({ text });
    if (flagged.flagged) {
      this.logger.warn(
        `studio ${show.id}: a message was flagged (${flagged.categories.join(', ')})`,
      );
      onToken(REFUSAL);
      const message = await this.studio.addMessage({
        showId: show.id,
        episodeId: episode.id,
        role: 'assistant',
        content: REFUSAL,
        meta: { refused: true },
      });
      return {
        message: messageDto(message),
        show: await this.showDto(show),
        episode: await this.episodeView(show, episode),
      };
    }

    // What the maker gave to make it from, rather than said: kept whole.
    const pasted = episode.phase === 'brief' && text.length >= SOURCE_AT;
    const said = pasted
      ? `${text.slice(0, 600)}… (their own text, ${text.length} characters, kept as the brief's source)`
      : text.slice(0, MESSAGE_CHARS);
    const history = (await this.studio.listMessages(show.id, 17))
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
    const scenes = await this.studio.listScenes(episode.id);
    const state = describeForProducer({
      brief: show.brief,
      bible: show.bible,
      outline: episode.outline,
      sheets: scenes.map((s) => s.sheet),
      phase: episode.phase,
      episode: episode.number,
    });
    let draft: StudioTurnDraft;
    try {
      const result = await this.llm.studioTurn({
        phase: episode.phase,
        state,
        history,
        message: said,
        onToken,
      });
      await this.record(episode.id, 'studio_chat', result.usage);
      draft = result.value;
    } catch (error) {
      // A reply that could not be read is said as one: the thread stays whole.
      this.logger.warn(
        `studio ${show.id}: the producer could not answer: ${(error as Error).message}`,
      );
      draft = {
        reply: "Sorry, I didn't catch that. Could you say it again?",
        choices: [],
        brief: {},
        action: 'none',
        scene: null,
        request: null,
        refuse: false,
      };
      onToken(draft.reply);
    }

    let brief = briefOf(draft.brief, show.brief);
    if (pasted) brief = { ...brief, source: text.slice(0, SOURCE_CHARS) };
    if (JSON.stringify(brief) !== JSON.stringify(show.brief)) {
      await this.studio.updateShow(show.id, { brief, format: brief.format });
      show.brief = brief;
      show.format = brief.format;
    }

    let note: string | null = null;
    try {
      if (!draft.refuse)
        switch (draft.action) {
          case 'outline':
            note = await this.askOutline(show, episode, draft.request);
            break;
          case 'approve':
            note = await this.approveEpisode(show, episode);
            break;
          case 'cast':
            note = await this.askCast(show, episode, draft.request ?? said);
            break;
          case 'scene': {
            const scene = scenes[(draft.scene ?? 0) - 1];
            note = scene
              ? await this.askScene(show, episode, scene, draft.request ?? said)
              : 'Which scene should I change? Tell me its number.';
            break;
          }
          case 'make':
            note = await this.makeEpisode(userId, show, episode);
            break;
          case 'episode':
            episode = await this.newEpisode(show, draft.request ?? said);
            break;
          default:
            break;
        }
    } catch (error) {
      note = (error as Error).message;
    }

    const message = await this.studio.addMessage({
      showId: show.id,
      episodeId: episode.id,
      role: 'assistant',
      content: note ? `${draft.reply}\n\n${note}` : draft.reply,
      meta: {
        choices: draft.choices.slice(0, 5).map((c) => c.slice(0, 40)),
        action: draft.action,
        refused: draft.refuse,
      },
    });
    const fresh = (await this.studio.findShow(show.id)) ?? show;
    const now = (await this.studio.findEpisode(episode.id)) ?? episode;
    return {
      message: messageDto(message),
      show: await this.showDto(fresh),
      episode: await this.episodeView(fresh, now),
    };
  }

  // ── Steps ───────────────────────────────────────────────────────────────

  private async enqueue(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    job: Omit<StudioJob, 'showId' | 'episodeId' | 'userId'>,
  ): Promise<void> {
    await this.queue.enqueueStudio([
      { ...job, showId: show.id, episodeId: episode.id, userId: show.userId },
    ]);
  }

  /** The outline written, or written again as asked. A note when it cannot be yet. */
  private async askOutline(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request: string | null,
  ): Promise<string | null> {
    if (episode.phase === 'script' || episode.phase === 'made')
      return 'The scenes are written now: tell me which scene to change, and how.';
    const missing = briefMissing(show.brief);
    if (missing.length)
      return `Before the outline, I still need: ${missing.join(', ')}.`;
    if (!(await this.studio.claimEpisode(episode.id, 'outline')))
      return 'I am still working on the last change; this comes next once it is done.';
    await this.enqueue(show, episode, {
      kind: 'outline',
      ...(request && episode.outline ? { request } : {}),
    });
    return null;
  }

  private async askCast(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request: string,
  ): Promise<string | null> {
    if (show.brief.format === 'explainer') return null;
    if (!(await this.studio.claimEpisode(episode.id, 'bible')))
      return 'I am still working on the last change; ask again when it is done.';
    await this.enqueue(show, episode, { kind: 'bible', request });
    return null;
  }

  private async askScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    scene: StudioSceneRecord,
    request: string,
  ): Promise<string | null> {
    if (episode.phase !== 'script' && episode.phase !== 'made')
      return 'The scenes are not written yet.';
    if (!(await this.studio.claimEpisode(episode.id, 'scene')))
      return 'I am still working on the last change; ask again when it is done.';
    await this.studio.updateScene(scene.id, { status: 'writing', error: null });
    await this.enqueue(show, episode, {
      kind: 'scene',
      sceneId: scene.id,
      request,
    });
    return null;
  }

  /** The outline, or the cast, approved: on to the cast, or to writing every scene. */
  private async approveEpisode(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<string | null> {
    if (episode.busy) return 'One moment: I am still working on it.';
    const story = show.brief.format !== 'explainer';
    if (episode.phase === 'outline' && story) {
      await this.studio.updateEpisode(episode.id, { phase: 'cast' });
      return null;
    }
    if (episode.phase === 'outline' || episode.phase === 'cast') {
      if (!(await this.studio.claimEpisode(episode.id, 'script')))
        return 'One moment: I am still working on it.';
      await this.studio.updateEpisode(episode.id, { phase: 'script' });
      await this.enqueue(show, episode, { kind: 'script' });
      return null;
    }
    return null;
  }

  async approve(userId: string, episodeId: string): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const note = await this.approveEpisode(show, episode);
    if (note) throw new ValidationError(note);
    return this.episode(userId, episodeId);
  }

  async rewriteOutline(
    userId: string,
    episodeId: string,
    request: string | null,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const note = await this.askOutline(show, episode, request?.trim() || null);
    if (note) throw new ValidationError(note);
    return this.episode(userId, episodeId);
  }

  /** The outline changed by hand: scenes reordered, cut, reworded. */
  async editOutline(
    userId: string,
    episodeId: string,
    body: unknown,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    if (episode.phase !== 'outline' && episode.phase !== 'cast')
      throw new ValidationError(
        'The scenes are written: change them on their cards.',
      );
    if (episode.busy)
      throw new ValidationError('One moment: I am still working on it.');
    const outline: StudioOutline = show.bible
      ? mendOutline(outlineOf(body), show.bible)
      : outlineOf(body);
    if (!outline.scenes.length)
      throw new ValidationError('Keep at least one scene.');
    await this.studio.updateEpisode(episode.id, {
      outline,
      title: outline.title,
      logline: outline.logline,
    });
    return this.episode(userId, episodeId);
  }

  async rewriteCast(
    userId: string,
    showId: string,
    episodeId: string,
    request: string,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    if (show.id !== showId) throw new NotFoundError('Episode');
    const note = await this.askCast(
      show,
      episode,
      request.trim().slice(0, MESSAGE_CHARS),
    );
    if (note) throw new ValidationError(note);
    return this.episode(userId, episodeId);
  }

  async rewriteScene(
    userId: string,
    sceneId: string,
    request: string,
  ): Promise<StudioEpisodeDto> {
    const { show, episode, scene } = await this.requireScene(userId, sceneId);
    const clean = request.trim().slice(0, MESSAGE_CHARS);
    if (!clean) throw new ValidationError('Say what to change');
    const flagged = await this.llm.moderate({ text: clean });
    if (flagged.flagged) throw new ValidationError(REFUSAL);
    const note = await this.askScene(show, episode, scene, clean);
    if (note) throw new ValidationError(note);
    return this.episodeView(show, (await this.studio.findEpisode(episode.id))!);
  }

  /**
   * A scene's sheet changed by hand: mended and checked as a written one
   * is, the sheet before kept for an undo.
   */
  async editScene(
    userId: string,
    sceneId: string,
    body: unknown,
  ): Promise<StudioSceneDto> {
    const { show, episode, scene } = await this.requireScene(userId, sceneId);
    if (!scene.sheet)
      throw new ValidationError('This scene is still being written');
    if (scene.status === 'writing' || scene.status === 'making')
      throw new ValidationError('One moment: this scene is being worked on.');
    const bible = show.bible;
    const planned = episode.outline?.scenes[scene.position] ?? null;
    let next: SceneSheet;
    let problems: SheetProblem[];
    if (scene.sheet.kind === 'story') {
      if (!bible) throw new ValidationError('The show has no cast yet');
      const before = await this.endBefore(episode.id, scene.position);
      const mended = mendSheet(
        storySheetOf({ ...(body as object), kind: 'story' }),
        bible,
      );
      next = mended.sheet;
      problems = checkSheet(next, bible, planned?.seconds ?? null, before);
    } else {
      next = mendExplainerLines(scene.sheet, body);
      problems = checkExplainer(next, {
        teach: planned?.teach ?? null,
        stage: null,
        maths: bible?.maths ?? false,
        planned: planned?.seconds ?? null,
      }).problems;
    }
    await this.studio.updateScene(scene.id, {
      previousSheet: scene.sheet,
      sheet: next,
      sheetHash: sceneFingerprint(next, bible, show.brief),
      problems,
      status: scene.status === 'failed' ? 'ready' : scene.status,
    });
    const now = (await this.studio.findScene(scene.id))!;
    return sceneDto(now, episode, bible, show.brief);
  }

  /** A scene's last change undone. */
  async undoScene(userId: string, sceneId: string): Promise<StudioSceneDto> {
    const { show, episode, scene } = await this.requireScene(userId, sceneId);
    if (!scene.previousSheet) throw new ValidationError('Nothing to undo');
    if (scene.status === 'writing' || scene.status === 'making')
      throw new ValidationError('One moment: this scene is being worked on.');
    const sheet = scene.previousSheet;
    const planned = episode.outline?.scenes[scene.position] ?? null;
    const problems =
      sheet.kind === 'story'
        ? show.bible
          ? checkSheet(
              sheet,
              show.bible,
              planned?.seconds ?? null,
              await this.endBefore(episode.id, scene.position),
            )
          : []
        : checkExplainer(sheet, {
            teach: planned?.teach ?? null,
            stage: null,
            maths: show.bible?.maths ?? false,
            planned: planned?.seconds ?? null,
          }).problems;
    await this.studio.updateScene(scene.id, {
      sheet,
      previousSheet: scene.sheet,
      sheetHash: sceneFingerprint(sheet, show.bible, show.brief),
      problems,
    });
    const now = (await this.studio.findScene(scene.id))!;
    return sceneDto(now, episode, show.bible, show.brief);
  }

  /** How the scene before one left the stage: what it carries on from. */
  private async endBefore(episodeId: string, position: number) {
    if (position <= 0) return null;
    const scenes = await this.studio.listScenes(episodeId);
    const prev = scenes.find((s) => s.position === position - 1)?.sheet;
    return prev?.kind === 'story' ? endStateOf(prev) : null;
  }

  /** A scene added after another, written from what the maker asks it to be. */
  async addScene(
    userId: string,
    episodeId: string,
    after: number,
    request: string,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    if (episode.phase !== 'script' && episode.phase !== 'made')
      throw new ValidationError(
        'Add scenes to the outline until the scenes are written.',
      );
    const clean = request.trim().slice(0, MESSAGE_CHARS);
    if (!clean) throw new ValidationError('Say what happens in the new scene');
    const outline = episode.outline;
    if (!outline) throw new ValidationError('There is no outline');
    const at = Math.max(0, Math.min(outline.scenes.length, after + 1));
    const prev = outline.scenes[at - 1] ?? outline.scenes[0];
    if (!(await this.studio.claimEpisode(episode.id, 'scene')))
      throw new ValidationError('One moment: I am still working on it.');
    outline.scenes.splice(at, 0, {
      title: 'A new scene',
      summary: clean,
      set: prev?.set ?? null,
      cast: prev?.cast ?? [],
      seconds: 25,
      teach: show.brief.format === 'explainer' ? clean : null,
      points: [],
    });
    await this.studio.updateEpisode(episode.id, { outline });
    const row = await this.studio.insertScene(episode.id, at);
    await this.enqueue(
      show,
      { ...episode, outline },
      { kind: 'scene', sceneId: row.id, request: clean },
    );
    return this.episode(userId, episodeId);
  }

  async removeScene(
    userId: string,
    sceneId: string,
  ): Promise<StudioEpisodeDto> {
    const { episode, scene } = await this.requireScene(userId, sceneId);
    if (scene.status === 'making' || episode.busy)
      throw new ValidationError('One moment: I am still working on it.');
    const scenes = await this.studio.listScenes(episode.id);
    if (scenes.length <= 1)
      throw new ValidationError('Keep at least one scene.');
    const outline = episode.outline;
    if (outline) {
      outline.scenes.splice(scene.position, 1);
      await this.studio.updateEpisode(episode.id, { outline });
    }
    await this.studio.removeScene(scene.id);
    for (const key of [scene.sceneKey, scene.audioKey, scene.thumbKey])
      if (key) await this.storage.delete(key).catch(() => undefined);
    return this.episode(userId, episode.id);
  }

  /**
   * The film made: each scene that is new, changed or failed, made on
   * the worker, one at a time for a maker, within the month's allowance.
   * A note, in plain words, when it cannot be.
   */
  private async makeEpisode(
    userId: string,
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<string | null> {
    const scenes = await this.studio.listScenes(episode.id);
    const blockers = blockersOf(episode, scenes, show.bible, show.brief);
    if (blockers.length) return blockers[0];
    if ((await this.studio.makingFor(userId)) > 0)
      return 'Another of your films is being made. This one can be made as soon as it is done.';
    const stale = scenes.filter((s) => needsMaking(s, show.bible, show.brief));
    // What it will run, about, from its words: the allowance is spent as made.
    const seconds = stale.reduce(
      (n, s) => n + (s.sheet ? secondsOf(s.sheet) : 30),
      0,
    );
    (await this.entitlements.forUser(userId)).assertStudioAvailable(seconds);
    if (!(await this.studio.claimEpisode(episode.id, 'make')))
      return 'It is already being made.';
    for (const scene of stale)
      await this.studio.updateScene(scene.id, {
        status: 'making',
        step: null,
        error: null,
      });
    // The cast and the places drawn first, once; then every scene at once.
    await this.enqueue(show, episode, {
      kind: 'prepare',
      sceneIds: stale.map((scene) => scene.id),
    });
    return null;
  }

  async make(userId: string, episodeId: string): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const note = await this.makeEpisode(userId, show, episode);
    if (note) throw new ValidationError(note);
    return this.episode(userId, episodeId);
  }

  /** The next episode of a show: the same cast and places, what it is about as the maker says. */
  private async newEpisode(
    show: StudioShowRecord,
    request: string,
  ): Promise<StudioEpisodeRecord> {
    const episodes = await this.studio.listEpisodes(show.id);
    const number = Math.max(0, ...episodes.map((e) => e.number)) + 1;
    const episode = await this.studio.createEpisode({
      showId: show.id,
      userId: show.userId,
      number,
      title: `Episode ${number}`,
      phase: 'brief',
    });
    if (
      !briefMissing(show.brief).length &&
      (await this.studio.claimEpisode(episode.id, 'outline'))
    )
      await this.enqueue(show, episode, { kind: 'outline', request });
    return episode;
  }

  async addEpisode(
    userId: string,
    showId: string,
    request: string,
  ): Promise<StudioEpisodeDto> {
    const show = await this.requireShow(userId, showId);
    const clean = request.trim().slice(0, MESSAGE_CHARS) || 'What happens next';
    const episode = await this.newEpisode(show, clean);
    return this.episodeView(show, episode);
  }

  // ── Watching ────────────────────────────────────────────────────────────

  private playOf(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    scenes: StudioSceneRecord[],
    watermark: boolean,
  ): StudioPlayDto {
    return {
      episodeId: episode.id,
      title: episode.title,
      showTitle: show.title,
      number: episode.number,
      watermark,
      madeWith: MADE_WITH,
      scenes: scenes
        .filter((s) => s.sceneKey && s.audioKey && s.durationMs)
        .map((s) => ({
          id: s.id,
          title: s.sheet?.title ?? `Scene ${s.position + 1}`,
          durationMs: s.durationMs!,
          transition: s.sheet?.transition ?? 'cut',
        })),
    };
  }

  async play(userId: string, episodeId: string): Promise<StudioPlayDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const scenes = await this.studio.listScenes(episode.id);
    const { watermarked } = await this.entitlements.studioBalance(userId);
    return this.playOf(show, episode, scenes, watermarked);
  }

  /** A made scene, as its player plays it. */
  async sceneFile(
    userId: string,
    sceneId: string,
    what: 'scene' | 'audio' | 'thumb',
  ): Promise<string> {
    const { scene } = await this.requireScene(userId, sceneId);
    return this.fileOf(scene, what);
  }

  private fileOf(
    scene: StudioSceneRecord,
    what: 'scene' | 'audio' | 'thumb',
  ): string {
    const key =
      what === 'scene'
        ? scene.sceneKey
        : what === 'audio'
          ? scene.audioKey
          : scene.thumbKey;
    if (!key) throw new NotFoundError('Scene');
    return key;
  }

  async sceneJson(key: string): Promise<SceneDto> {
    try {
      return JSON.parse(
        (await this.storage.get(key)).toString('utf8'),
      ) as SceneDto;
    } catch {
      throw new NotFoundError('Scene');
    }
  }

  async episodeThumb(userId: string, episodeId: string): Promise<string> {
    const { episode } = await this.requireEpisode(userId, episodeId);
    if (!episode.thumbKey) throw new NotFoundError('Still');
    return episode.thumbKey;
  }

  // ── Sharing ─────────────────────────────────────────────────────────────

  /** A link anyone can watch the episode at, or none. */
  async share(
    userId: string,
    episodeId: string,
    on: boolean,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const shareToken = on
      ? (episode.shareToken ?? randomBytes(18).toString('base64url'))
      : null;
    await this.studio.updateEpisode(episode.id, { shareToken });
    return this.episodeView(show, { ...episode, shareToken });
  }

  private async shared(token: string): Promise<{
    show: StudioShowRecord;
    episode: StudioEpisodeRecord;
  }> {
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw new NotFoundError('Film');
    const episode = await this.studio.findEpisodeByShareToken(token);
    const show = episode ? await this.studio.findShow(episode.showId) : null;
    if (!episode || !show) throw new NotFoundError('Film');
    return { show, episode };
  }

  async playShared(token: string): Promise<StudioPlayDto> {
    const { show, episode } = await this.shared(token);
    const scenes = await this.studio.listScenes(episode.id);
    const { watermarked } = await this.entitlements.studioBalance(show.userId);
    return this.playOf(show, episode, scenes, watermarked);
  }

  async sharedFile(
    token: string,
    sceneId: string,
    what: 'scene' | 'audio',
  ): Promise<string> {
    const { episode } = await this.shared(token);
    const scene = await this.studio.findScene(sceneId);
    if (!scene || scene.episodeId !== episode.id)
      throw new NotFoundError('Scene');
    return this.fileOf(scene, what);
  }

  private async record(
    episodeId: string,
    task: 'studio_chat' | 'studio_write',
    usage: LlmUsage,
  ): Promise<void> {
    await this.calls
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
  }
}

export type { StudioBible };

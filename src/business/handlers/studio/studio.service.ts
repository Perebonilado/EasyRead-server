import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  SceneDto,
  StudioEpisodeDto,
  StudioMessageDto,
  StudioMessagePageDto,
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
import { joinOf } from '../../domain/studio/studio-edit';
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
  EpisodePhase,
  StudioEpisodeRecord,
  StudioEventRecord,
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
import { EVENT_LINES, historyOf, logEvent } from './studio-log';
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
/** The latest of a show's thread sent with it; earlier ones are asked for a page at a time. */
const THREAD = 80;
/** What the maker is looking at, in the producer's words. */
const LOOKING_AT: Partial<Record<EpisodePhase, string>> = {
  outline: 'the outline',
  cast: 'the cast',
  script: 'the scenes',
  made: 'the film',
};
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
    const episodesOf = await Promise.all(
      shows.map((show) => this.studio.listEpisodes(show.id)),
    );
    // Each show's latest made episode stands for it: its still, and its film.
    const thumbs = episodesOf.map((episodes) =>
      episodes.findLast((e) => e.thumbKey),
    );
    // Their scenes in one query, kept as the player plays them, so the
    // length agrees with the film the player cuts.
    const scenes = await this.studio.listScenesOf(
      thumbs.flatMap((e) => (e ? [e.id] : [])),
    );
    const played = scenes.filter(
      (s) => s.sceneKey && s.audioKey && s.durationMs,
    );
    return shows.map((show, k) => {
      const episodes = episodesOf[k];
      const latest = episodes[episodes.length - 1];
      const thumb = thumbs[k];
      const made = thumb ? played.filter((s) => s.episodeId === thumb.id) : [];
      const durationMs = made.reduce((n, s) => n + s.durationMs!, 0);
      return {
        id: show.id,
        title: show.title,
        format: show.format,
        episodes: episodes.length,
        thumbEpisodeId: thumb?.id ?? null,
        phase: latest?.phase ?? 'brief',
        updatedAt: show.updatedAt.toISOString(),
        busy: episodes.find((e) => e.busy)?.busy ?? null,
        durationMs: durationMs || null,
        scenes: thumb ? made.length : null,
      };
    });
  }

  async show(userId: string, id: string): Promise<StudioShowDto> {
    return this.showDto(await this.requireShow(userId, id));
  }

  private async showDto(show: StudioShowRecord): Promise<StudioShowDto> {
    const [episodes, thread, balance] = await Promise.all([
      this.studio.listEpisodes(show.id),
      this.studio.listMessages(show.id, THREAD + 1),
      this.entitlements.studioBalance(show.userId),
    ]);
    const messages = thread.slice(-THREAD);
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
      moreMessages: thread.length > THREAD,
      balance,
    };
  }

  /** Earlier messages of a show's thread: a page of those before one. */
  async messages(
    userId: string,
    id: string,
    before: string,
  ): Promise<StudioMessagePageDto> {
    const show = await this.requireShow(userId, id);
    const page = await this.studio.listMessages(show.id, THREAD + 1, before);
    return {
      messages: page.slice(-THREAD).map(messageDto),
      more: page.length > THREAD,
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

  /** The hour's fair use: a message to the producer, or words for a change, over it is turned away. */
  private async fairUse(userId: string): Promise<void> {
    const hourAgo = new Date(this.clock.now().getTime() - 3_600_000);
    if (
      (await this.studio.countUserMessagesSince(userId, hourAgo)) >=
      MESSAGES_AN_HOUR
    )
      throw new ValidationError(
        'That is a lot of messages in an hour. Take a short break and carry on in a few minutes.',
      );
  }

  /**
   * One turn of the conversation: the maker's message, the producer's
   * reply (streamed as it is written), what it learnt of the brief, and
   * the step it takes: an outline written, approved, a cast or a scene
   * changed, the film made, a new episode begun. With a focus, the
   * producer knows what the maker is looking at in the panel.
   */
  async turn(
    userId: string,
    showId: string,
    input: {
      episodeId?: string | null;
      message: string;
      focus?: { step?: string; sceneId?: string } | null;
    },
    onToken: (chunk: string) => void,
  ): Promise<{
    message: StudioMessageDto;
    show: StudioShowDto;
    episode: StudioEpisodeDto;
  }> {
    const show = await this.requireShow(userId, showId);
    const text = input.message.trim().slice(0, MESSAGE_CHARS + SOURCE_CHARS);
    if (!text) throw new ValidationError('Say what you would like to make');
    await this.fairUse(userId);
    const episodes = await this.studio.listEpisodes(show.id);
    let episode =
      episodes.find((e) => e.id === input.episodeId) ??
      episodes[episodes.length - 1];
    if (!episode) throw new NotFoundError('Episode');

    const mine = await this.studio.addMessage({
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
    // What the buttons did is in it too, a line each from the Studio; the
    // message now is its own, even if work finished just after it came.
    const history = historyOf(
      (await this.studio.listMessages(show.id, 17)).filter(
        (m) => m.id !== mine.id,
      ),
    );
    const scenes = await this.studio.listScenes(episode.id);
    const state = describeForProducer({
      looking: this.lookingAt(input.focus, scenes),
      brief: show.brief,
      bible: show.bible,
      outline: episode.outline,
      sheets: scenes.map((s) => s.sheet),
      // Whether the film shows each scene as it now is.
      states: scenes.map((s) =>
        s.status === 'writing'
          ? 'being written'
          : s.status === 'making'
            ? 'being made now'
            : !s.sceneKey
              ? 'not made yet'
              : needsMaking(s, show.bible, show.brief)
                ? 'changed since it was made: the film shows the old version until it is made again'
                : 'made: the film shows it',
      ),
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
    const briefChanged = JSON.stringify(brief) !== JSON.stringify(show.brief);
    if (briefChanged) {
      await this.studio.updateShow(show.id, { brief, format: brief.format });
      show.brief = brief;
      show.format = brief.format;
    }

    let note: string | null = null;
    try {
      if (!draft.refuse)
        switch (draft.action) {
          case 'outline':
            note = await this.askOutline(
              show,
              episode,
              draft.request,
              briefChanged,
            );
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

    // A step that could not be taken is said plainly, in place of a reply
    // that took it for done.
    const message = await this.studio.addMessage({
      showId: show.id,
      episodeId: episode.id,
      role: 'assistant',
      content: note ?? draft.reply,
      meta: {
        choices: note
          ? []
          : draft.choices.slice(0, 5).map((c) => c.slice(0, 40)),
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

  /** What the maker is looking at in the panel, in words: a scene by its number and title. */
  private lookingAt(
    focus: { step?: string; sceneId?: string } | null | undefined,
    scenes: StudioSceneRecord[],
  ): string | null {
    const scene = focus?.sceneId
      ? scenes.find((s) => s.id === focus.sceneId)
      : undefined;
    if (scene)
      return `scene ${scene.position + 1}${scene.sheet ? ` ("${scene.sheet.title}")` : ''}`;
    return LOOKING_AT[focus?.step as EpisodePhase] ?? null;
  }

  /**
   * Something that happened, recorded in the thread under its episode:
   * the maker sees it, and the producer reads it. Never in the way of
   * what was done.
   */
  private async log(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    event: StudioEventRecord,
  ): Promise<void> {
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: episode.id },
      event,
    ).catch((error: Error) =>
      this.logger.warn(`studio ${show.id}: not recorded: ${error.message}`),
    );
  }

  /**
   * The maker's own words for a change asked on part of the episode,
   * checked as a message to the producer is: within the hour's fair use,
   * and nothing the Studio does not make.
   */
  private async hear(userId: string, words: string): Promise<void> {
    await this.fairUse(userId);
    const flagged = await this.llm.moderate({ text: words });
    if (flagged.flagged) throw new ValidationError(REFUSAL);
  }

  /**
   * The maker's words kept in the thread, named for what they change:
   * "Scene 3: …". Never in the way of the change, which is made by now.
   */
  private async heard(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    about: string,
    words: string,
  ): Promise<void> {
    await this.studio
      .addMessage({
        showId: show.id,
        episodeId: episode.id,
        role: 'user',
        content: `${about}: ${words}`,
      })
      .catch((error: Error) =>
        this.logger.warn(`studio ${show.id}: not kept: ${error.message}`),
      );
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

  /**
   * The outline written, or written again as asked. A note when it cannot
   * be yet: while it is being written, what the brief now says is taken in
   * (the outline is written again with it once done, `briefChanged`), and
   * anything else is asked again after.
   */
  private async askOutline(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request: string | null,
    briefChanged = false,
  ): Promise<string | null> {
    if (episode.phase === 'script' || episode.phase === 'made')
      return 'The scenes are written now: tell me which scene to change, and how.';
    const missing = briefMissing(show.brief);
    if (missing.length)
      return `Before the outline, I still need: ${missing.join(', ')}.`;
    if (!(await this.studio.claimEpisode(episode.id, 'outline')))
      return episode.busy === 'outline' && briefChanged
        ? 'Noted. The outline is being written right now; once it is done I will write it again with that in it.'
        : 'I am still working on the last change; ask me again once it is done.';
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
    if (scene.status === 'writing' || scene.status === 'making')
      return `Scene ${scene.position + 1} is being worked on right now; ask again in a moment.`;
    // Another scene being written again is no reason to wait: each is its own.
    if (
      episode.busy !== 'scene' &&
      !(await this.studio.claimEpisode(episode.id, 'scene'))
    )
      return episode.busy === 'make'
        ? 'The film is being made right now; ask again when it is done.'
        : 'I am still working on the last change; ask again when it is done.';
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
    if (episode.phase === 'outline' || episode.phase === 'cast') {
      const next =
        episode.phase === 'outline' && show.brief.format !== 'explainer'
          ? 'cast'
          : 'script';
      await this.log(show, episode, {
        what: 'approved',
        step: next,
        line: EVENT_LINES.approved(episode.phase, next),
      });
    }
    return this.episode(userId, episodeId);
  }

  async rewriteOutline(
    userId: string,
    episodeId: string,
    request: string | null,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const words = request?.trim().slice(0, MESSAGE_CHARS) || null;
    if (words) await this.hear(userId, words);
    const note = await this.askOutline(show, episode, words);
    if (note) throw new ValidationError(note);
    if (words) await this.heard(show, episode, 'Outline', words);
    await this.log(show, episode, {
      what: 'asked',
      step: 'outline',
      line: episode.outline
        ? 'Writing the outline again'
        : 'Writing the outline',
    });
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
    await this.log(show, episode, {
      what: 'edited',
      step: 'outline',
      line: 'Outline changed by hand',
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
    const words = request.trim().slice(0, MESSAGE_CHARS);
    if (words) await this.hear(userId, words);
    const note = await this.askCast(show, episode, words);
    if (note) throw new ValidationError(note);
    if (show.brief.format !== 'explainer') {
      if (words) await this.heard(show, episode, 'Cast', words);
      await this.log(show, episode, {
        what: 'asked',
        step: 'cast',
        line: 'Changing the cast',
      });
    }
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
    await this.hear(userId, clean);
    const note = await this.askScene(show, episode, scene, clean);
    if (note) throw new ValidationError(note);
    await this.heard(show, episode, `Scene ${scene.position + 1}`, clean);
    await this.log(show, episode, {
      what: 'asked',
      step: 'script',
      sceneId: scene.id,
      line: `Writing scene ${scene.position + 1} again`,
    });
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
        source: show.brief.source,
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
    await this.log(show, episode, {
      what: 'edited',
      step: 'script',
      sceneId: scene.id,
      line: `Scene ${scene.position + 1} changed by hand`,
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
            source: show.brief.source,
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
    await this.log(show, episode, {
      what: 'edited',
      step: 'script',
      sceneId: scene.id,
      line: `Scene ${scene.position + 1}: the last change undone`,
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
    await this.hear(userId, clean);
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
    await this.heard(show, episode, `New scene ${at + 1}`, clean);
    await this.log(show, episode, {
      what: 'asked',
      step: 'script',
      sceneId: row.id,
      line: `Writing the new scene ${at + 1}`,
    });
    return this.episode(userId, episodeId);
  }

  async removeScene(
    userId: string,
    sceneId: string,
  ): Promise<StudioEpisodeDto> {
    const { show, episode, scene } = await this.requireScene(userId, sceneId);
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
    const title =
      scene.sheet?.title ?? episode.outline?.scenes[scene.position]?.title;
    await this.log(show, episode, {
      what: 'edited',
      step: 'script',
      line: `Scene ${scene.position + 1} taken out${title ? `: “${title}”` : ''}`,
    });
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
    const view = await this.episode(userId, episodeId);
    await this.log(show, episode, {
      what: 'make',
      step: 'made',
      line: EVENT_LINES.make(
        view.scenes.filter((s) => s.status === 'making').length,
        view.toMakeSeconds,
      ),
    });
    return view;
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
    const words = request.trim().slice(0, MESSAGE_CHARS);
    if (words) await this.hear(userId, words);
    const created = await this.newEpisode(show, words || 'What happens next');
    const episode = (await this.studio.findEpisode(created.id)) ?? created;
    if (words)
      await this.heard(show, episode, `Episode ${episode.number}`, words);
    const writing = episode.busy === 'outline';
    await this.log(show, episode, {
      what: 'episode',
      step: writing ? 'outline' : 'brief',
      line: `Episode ${episode.number} begun${writing ? ': writing its outline' : ''}`,
    });
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
        .map((s, i, made) => ({
          id: s.id,
          title: s.sheet?.title ?? `Scene ${s.position + 1}`,
          durationMs: s.durationMs!,
          transition: s.sheet?.transition ?? 'cut',
          // From the scene the film shows before it; the first comes up from black.
          join: i ? joinOf(made[i - 1].sheet, s.sheet) : 'dip',
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
    if (Boolean(shareToken) !== Boolean(episode.shareToken))
      await this.log(show, episode, {
        what: 'shared',
        step: 'made',
        line: EVENT_LINES.shared(on),
      });
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

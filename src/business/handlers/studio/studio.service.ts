import { scoreOf } from '../../domain/studio/studio-score';
import {
  isStoryChange,
  keptPersonas,
  storyOf,
} from '../../domain/studio/studio-story';
import { narratorRuleOf } from '../../domain/studio/studio-narrator';
import { heardBrief } from '../../domain/studio/studio-heard';
import { lookHeard, showTheme } from '../../domain/studio/studio-look';
import { audienceChips, whoHeard } from '../../domain/studio/studio-audience';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
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
  BRIEF_CONTROLS,
  briefOf,
  mendExplainerLines,
  outlineOf,
  secondsOf,
  storySheetOf,
  type SceneSheet,
  type StudioBible,
  type StudioBrief,
  type StudioCharacter,
  type StudioOutline,
} from '../../domain/studio/studio';
import {
  carriedWears,
  checkExplainer,
  checkSheet,
  endBefore,
  mendOutline,
  mendSheet,
  keptFeatures,
  withFound,
  pickedBeats,
  type SheetProblem,
} from '../../domain/studio/studio-check';
import { MADE_WITH } from '../../domain/studio/studio-brand';
import {
  anotherWay,
  beingDrawn,
  characterMeant,
  keptKits,
  redrawnToChoose,
  keptDrawn,
  markDrawing,
  isTheirs,
  oneLookRequest,
  oneRedrawn,
  optionMeant,
  pickOf,
  withoutCandidate,
} from '../../domain/studio/studio-drawings';
import {
  failureId,
  noteOf,
  type DrawingFailure,
} from '../../domain/drawing-failures';
import { joinFor } from '../../domain/studio/studio-edit';
import { storyBibleFor } from '../../domain/studio/studio-stage';
import {
  describeForProducer,
  honestReply,
  sceneReply,
} from '../../domain/studio/studio-words';
import type { ClockPort } from '../../ports/clock.port';
import type {
  JobQueuePort,
  StudioAsk,
  StudioJob,
} from '../../ports/job-queue.port';
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
import { StudioCastService, optionPreview } from './studio-cast.service';
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

/** The longest message the producer reads. */
const MESSAGE_CHARS = 4000;
/** A message this long, while the brief is being made, is the maker's own text to make it from. */
const SOURCE_AT = 900;
/** The latest of a show's thread sent with it; earlier ones are asked for a page at a time. */
const THREAD = 80;
/** What the maker is looking at, in the producer's words. */
const LOOKING_AT: Partial<Record<EpisodePhase | 'story', string>> = {
  story: 'the story (its premise, characters and beats)',
  outline: 'the outline',
  cast: 'the cast',
  script: 'the scenes',
  made: 'the film',
};
/**
 * Whether the moderation's verdict on a maker's words shuts the door.
 * Plain "violence" alone does not: a giant felled by a stone, a wolf at
 * the door, a battle in a history lesson are the stories told to every
 * child, and the moderation flags them all. The producer takes those,
 * told without gore (its safety rule). Anything graphic, sexual, hateful
 * or self-harming, or a flag with no category named, does.
 */
export function refusesWords(verdict: {
  flagged: boolean;
  categories: string[];
}): boolean {
  if (!verdict.flagged) return false;
  if (!verdict.categories.length) return true;
  return verdict.categories.some((category) => category !== 'violence');
}

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
/** What a brief still needs, asked in words: the idea may always be left to us. */
const STILL_TO_SAY: Partial<Record<keyof StudioBrief, string>> = {
  format: 'whether it is a story or an explainer',
  idea: 'what it is about (or say "you pick")',
  audience: 'who it is for',
  minutes: 'how long it runs',
  tone: 'how it should feel',
};

/** The look an explainer plays in, for its show and its player; nothing for a story. */
const themeOfShow = (show: StudioShowRecord) => {
  const theme = showTheme(show.brief, show.bible);
  return theme ? { theme } : {};
};

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
      ? bibleDto(
          show.bible,
          await this.cast.drawings(
            show.id,
            show.bible,
            this.clock.now().getTime(),
          ),
        )
      : null;
    return {
      id: show.id,
      title: show.title,
      format: show.format,
      brief: briefDto(show.brief),
      briefMissing: briefMissing(show.brief),
      bible,
      ...themeOfShow(show),
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
    // A control set back to "leave it to us" is chosen by the Studio again.
    for (const key of BRIEF_CONTROLS)
      if (key in patch && (patch[key] === null || patch[key] === ''))
        delete brief[key];
    if (brief.narrator !== 'character') delete brief.narratorCharacter;
    // Whom it is for, taken back: the four words stay.
    if ('who' in patch && patch.who === null) delete brief.who;
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
    // A set's features are the sheets' own: the maker's edit keeps them;
    // and whoever the artist drew is drawn so until the maker chooses one
    // of the kit's.
    const bible = keptPersonas(
      keptKits(keptFeatures(bibleOf(body), before), before),
      before,
    );
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
    const kept = keptDrawn(bible, before);
    await this.studio.updateShow(show.id, { bible: kept });
    // Anyone whose look changed is drawn again now, for their card.
    await this.drawCast({ ...show, bible: kept });
    return this.showDto({ ...show, bible: kept });
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
    const { engine, speech, voice, cast } = await this.voices.current();
    const story = storyBibleFor(show.bible, [], show.title);
    const own = story.characters.find((c) => c.id === character.id)!;
    const speaker = characterVoice(
      story,
      own,
      engine === 'openai' ? null : engine,
      voice,
      cast,
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
    if (refusesWords(flagged)) {
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
    const before = (await this.studio.listMessages(show.id, 17)).filter(
      (m) => m.id !== mine.id,
    );
    const history = historyOf(before);
    const scenes = await this.studio.listScenes(episode.id);
    const carried = carriedWears(scenes, show.bible);
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
              : needsMaking(s, show.bible, show.brief, carried.get(s.position))
                ? 'changed since it was made: the film shows the old version until it is made again'
                : 'made: the film shows it',
      ),
      phase: episode.phase,
      episode: episode.number,
      waiting: await this.waitingFor(show),
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
    // Held to the maker's own words: the tone a chip names, the genre they
    // said, an idea left to us or said loosely taken as the idea.
    brief = briefOf(
      heardBrief({
        said: brief,
        before: show.brief,
        words: pasted ? '' : said,
        gathering: episode.phase === 'brief' && !pasted,
      }),
      brief,
    );
    if (pasted) brief = { ...brief, source: text.slice(0, SOURCE_CHARS) };
    // Whom it is for, heard by code from the maker's own words (a grade, a
    // year, an age, a course, a job; what they know, their English), as
    // the brief is gathered or when the producer took them as a new
    // audience; never from a name or a place.
    // Their own text is not their words: only the level it names counts.
    const makerSaid = [
      ...before
        .filter(
          (m) =>
            m.role === 'user' &&
            m.episodeId === episode.id &&
            m.content.length < SOURCE_AT,
        )
        .map((m) => m.content),
      pasted ? '' : said,
    ].join('\n');
    if (episode.phase === 'brief' || brief.audience !== show.brief.audience)
      brief = briefOf(
        { who: whoHeard(brief, pasted ? '' : said, makerSaid) },
        brief,
      );
    // An explainer's look asked for in words, at any phase: "make it
    // dark" is the dark one of the look it has now.
    const look = pasted
      ? null
      : lookHeard(
          said,
          showTheme({ ...brief, look: show.brief.look }, show.bible) ?? 'paper',
        );
    if (look && brief.format === 'explainer') brief = { ...brief, look };
    const briefChanged = JSON.stringify(brief) !== JSON.stringify(show.brief);
    if (briefChanged) {
      await this.studio.updateShow(show.id, { brief, format: brief.format });
      show.brief = brief;
      show.format = brief.format;
    }

    let note: string | null = null;
    /** What was set going on scenes, said in code's own words. */
    let tried: string | null = null;
    try {
      if (!draft.refuse)
        switch (draft.action) {
          case 'outline':
            // A change to the story itself (the plot, who someone is, the
            // ending) develops the story again, as its card does; one to
            // the scenes alone changes the outline, the story kept.
            note = await this.askOutline(
              show,
              episode,
              draft.request,
              briefChanged,
              draft.story ?? isStoryChange(draft.request),
            );
            break;
          case 'approve':
            note = await this.approveEpisode(show, episode);
            break;
          case 'cast': {
            // A change to one character's look is that character drawn
            // again, never the whole cast written again.
            const request = draft.request ?? said;
            const one = show.bible ? oneRedrawn(request, show.bible) : null;
            if (one) {
              ({ note, tried } = await this.redrawAsked(
                show,
                episode,
                one,
                request,
              ));
              break;
            }
            note = await this.askCast(show, episode, request);
            break;
          }
          case 'redraw': {
            const who = characterMeant(draft.character, show.bible);
            if (!who) {
              note = 'Which character should I draw again? Tell me their name.';
              break;
            }
            ({ note, tried } = await this.redrawAsked(
              show,
              episode,
              who,
              draft.request ?? said,
            ));
            break;
          }
          case 'choose': {
            // "Use the second one": one of the new drawings waiting,
            // chosen here as on the card. Whose, when not said: the one
            // with drawings waiting.
            const work = await this.cast.work(show.id);
            const waitingFor = (show.bible?.characters ?? []).filter(
              (c) => work.candidates[c.id],
            );
            const who =
              characterMeant(draft.character, show.bible) ??
              (waitingFor.length === 1 ? waitingFor[0] : null);
            if (!who || !work.candidates[who.id]) {
              note = waitingFor.length
                ? `Whose drawing should I use: ${waitingFor.map((c) => c.name).join(' or ')}?`
                : 'There are no new drawings waiting to choose from.';
              break;
            }
            const pick = draft.pick ?? pickOf(said);
            const done = await this.choose(
              show,
              episode,
              who,
              pick === 0 ? 'keep' : 'use',
              pick === 0 ? null : (pick ?? null),
            );
            note = done.note;
            // Said as the producer would; the Studio's own line records it.
            const which = ['first', 'second', 'third'][(pick ?? 1) - 1];
            tried = !done.line
              ? null
              : pick === 0
                ? `Keeping ${who.name} as they are.`
                : `Using the ${which ?? 'new'} drawing of ${who.name}.`;
            break;
          }
          case 'scene': {
            // Each scene asked for is its own change, at most three at once;
            // one that was made is made again and checked, as the maker's
            // own words ask.
            const numbers = (
              draft.scenes?.length ? draft.scenes : [draft.scene ?? 0]
            ).slice(0, 3);
            const asked = numbers.map((n) => scenes[n - 1]);
            if (!asked.length || asked.some((one) => !one)) {
              note = 'Which scene should I change? Tell me its number.';
              break;
            }
            const notes: string[] = [];
            const set: Parameters<typeof sceneReply>[0]['scenes'][number][] =
              [];
            // What the stage cannot show is left out of what is written,
            // and said so: never promised.
            const cannot = draft.cannot?.trim() || null;
            const request = draft.request ?? said;
            for (const scene of asked) {
              // As the one before left it: writing a scene already.
              const now =
                (await this.studio.findEpisode(episode.id)) ?? episode;
              const one = await this.askScene(
                show,
                now,
                scene,
                cannot
                  ? `${request.replace(/[.!?\s]*$/u, '.')} Leave out ${cannot.replace(/[.!?\s]*$/u, '')}: the stage cannot show it.`
                  : request,
                {
                  id: mine.id,
                  words: said,
                  ...(asked.length > 1
                    ? { of: asked.map((one) => one.position + 1) }
                    : {}),
                },
              );
              if (one) notes.push(one);
              else
                set.push({
                  number: scene.position + 1,
                  // A made story scene is made again and checked; a made
                  // explainer's shows once made again; the rest once made.
                  next: !scene.sceneKey
                    ? 'film'
                    : scene.sheet?.kind === 'story'
                      ? 'checked'
                      : 'remade',
                });
            }
            if (set.length)
              tried = sceneReply({ scenes: set, request, cannot });
            note = notes.length ? notes.join(' ') : null;
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
      // A change to a scene set going is said in code's own words: a try,
      // checked where it is made again, never done yet. Nothing set going
      // is never said to have changed anything.
      content:
        [tried, note].filter(Boolean).join(' ') ||
        honestReply(
          draft.reply,
          draft.refuse ? 'none' : draft.action,
          scenes.some((s) => s.sceneKey),
        ),
      meta: {
        // An explainer's audience is asked with its own chips: one row,
        // and what they know as a second only when nothing said it yet.
        ...(note || draft.refuse || draft.action !== 'none'
          ? {
              choices: note
                ? []
                : draft.choices.slice(0, 5).map((c) => c.slice(0, 40)),
            }
          : (audienceChips(brief, makerSaid) ?? {
              choices: draft.choices.slice(0, 5).map((c) => c.slice(0, 40)),
            })),
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
    return LOOKING_AT[focus?.step as EpisodePhase | 'story'] ?? null;
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
    const flagged = await this.llm.moderate({ text: words });
    if (refusesWords(flagged)) throw new ValidationError(REFUSAL);
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
    /** The request is for the story itself: developed again, then the outline built from it. */
    story = false,
  ): Promise<string | null> {
    if (episode.phase === 'script' || episode.phase === 'made')
      return 'The scenes are written now: tell me which scene to change, and how.';
    const missing = briefMissing(show.brief);
    if (missing.length)
      return `Before the outline, tell me ${missing.map((m) => STILL_TO_SAY[m] ?? m).join(', and ')}.`;
    if (!(await this.studio.claimEpisode(episode.id, 'outline')))
      return episode.busy === 'outline' && briefChanged
        ? 'Noted. The outline is being written right now; once it is done I will write it again with that in it.'
        : 'I am still working on the last change; ask me again once it is done.';
    await this.enqueue(show, episode, {
      kind: 'outline',
      ...(request && episode.outline ? { request } : {}),
      ...(story && show.brief.format !== 'explainer' ? { story: true } : {}),
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

  /**
   * Every animal and creature of a story's cast with no drawing yet drawn
   * now, off the request path: the maker meets them on their cards before
   * any film is made, and the film then uses them.
   */
  private async drawCast(
    show: StudioShowRecord,
    episode?: StudioEpisodeRecord,
  ): Promise<void> {
    if (show.brief.format === 'explainer' || !show.bible) return;
    try {
      const ids = await this.cast.markToDraw(
        show.id,
        show.bible,
        this.clock.now().getTime(),
      );
      if (!ids.length) return;
      const at =
        episode ?? (await this.studio.listEpisodes(show.id)).at(-1) ?? null;
      if (!at) return;
      await this.enqueue(show, at, { kind: 'draw', characterIds: ids });
    } catch (error) {
      // Never in the way of what was asked: they are drawn with the film.
      this.logger.warn(
        `studio ${show.id}: the cast could not be set drawing: ${(error as Error).message}`,
      );
    }
  }

  /**
   * One character drawn again as the maker asks: a person, an animal or a
   * creature the kits draw as a change to its spec (the writer's reading
   * and up to two others), and any other animal or creature by the artist
   * from the drawing they have (three takes); the new drawings waiting on
   * their card, and in the thread, to be chosen from. A note when it
   * cannot be now.
   */
  private async askRedraw(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    who: StudioCharacter,
    words: string,
  ): Promise<string | null> {
    if (show.brief.format === 'explainer') return null;
    if (!redrawnToChoose(who))
      return this.askCast(show, episode, oneLookRequest(who, words));
    const now = this.clock.now().getTime();
    let busy = false;
    await this.cast.changeWork(show.id, (work) => {
      busy = beingDrawn(work, who.id, now);
      return busy
        ? work
        : withoutCandidate(markDrawing(work, [who.id], now, words), who.id);
    });
    if (busy)
      return `${who.name} is being drawn right now; ask again once they are done.`;
    await this.enqueue(show, episode, {
      kind: 'redraw',
      characterId: who.id,
      request: words,
    });
    return null;
  }

  /** One character drawn again from the chat: what was set going, in code's words, or why not. */
  private async redrawAsked(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    who: StudioCharacter,
    words: string,
  ): Promise<{ note: string | null; tried: string | null }> {
    const note = await this.askRedraw(show, episode, who, words);
    if (note) return { note, tried: null };
    await this.log(show, episode, {
      what: 'asked',
      step: 'cast',
      line: redrawnToChoose(who)
        ? `Drawing ${who.name} again`
        : `Changing ${who.name}'s look`,
    });
    return {
      note: null,
      tried: redrawnToChoose(who)
        ? `I'll draw ${who.name} again as you ask. The new drawings will wait here and on their card beside the one you have: pick one, or keep theirs.`
        : `I'll change ${who.name}'s look as you ask, and only theirs.`,
    };
  }

  private async askScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    scene: StudioSceneRecord,
    request: string,
    /** Where the maker asked it and in what words, and every scene they asked about at once: a made story scene is made again and checked against them. */
    from?: { id: string; words: string; of?: number[] },
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
    // A story scene that was made: made again once written, and checked.
    const ask: StudioAsk | undefined =
      scene.sceneKey && scene.sheet?.kind === 'story'
        ? {
            id: from?.id ?? randomUUID(),
            words: (from?.words ?? request).slice(0, MESSAGE_CHARS),
            request,
            tries: 1,
            ...(from?.of ? { of: from.of } : {}),
          }
        : undefined;
    await this.enqueue(show, episode, {
      kind: 'scene',
      sceneId: scene.id,
      request,
      ...(ask ? { ask } : {}),
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
      // Anyone the artist draws not drawn yet is drawn now, to meet.
      await this.drawCast(show, episode);
      return null;
    }
    if (episode.phase === 'outline' || episode.phase === 'cast') {
      if (!(await this.studio.claimEpisode(episode.id, 'script')))
        return 'One moment: I am still working on it.';
      await this.studio.updateEpisode(episode.id, { phase: 'script' });
      await this.enqueue(show, episode, { kind: 'script' });
      return null;
    }
    // The script's job gave up with scenes left unwritten: asked again
    // (the thread's "Try again"), it is written again.
    if (episode.phase === 'script') {
      const scenes = await this.studio.listScenes(episode.id);
      if (!scenes.some((s) => s.status === 'failed' && !s.sheet)) return null;
      if (!(await this.studio.claimEpisode(episode.id, 'script')))
        return 'One moment: I am still working on it.';
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

  /**
   * The story changed as the maker asks on its card (the Story step): it
   * is developed again, the change made and the rest kept, and the
   * outline built from it again.
   */
  async rewriteStory(
    userId: string,
    episodeId: string,
    request: string | null,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    if (show.brief.format === 'explainer')
      throw new ValidationError('An explainer has no story to change.');
    const words = request?.trim().slice(0, MESSAGE_CHARS) || null;
    if (words) await this.hear(userId, words);
    const note = await this.askOutline(show, episode, words, false, true);
    if (note) throw new ValidationError(note);
    if (words) await this.heard(show, episode, 'Story', words);
    await this.log(show, episode, {
      what: 'asked',
      step: 'story',
      line: 'Developing the story again',
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
    const edited: StudioOutline = show.bible
      ? mendOutline(outlineOf(body), show.bible)
      : outlineOf(body);
    // Its story is its own step's, never the hand edit's: kept as it was.
    const { story: _sent, ...plain } = edited;
    void _sent;
    const outline: StudioOutline = episode.outline?.story
      ? { ...plain, story: episode.outline.story }
      : plain;
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
    // "Redraw Humpty": Humpty drawn again, not the whole cast written again.
    const one = show.bible && words ? oneRedrawn(words, show.bible) : null;
    if (one) {
      const redrawn = await this.askRedraw(show, episode, one, words);
      if (redrawn) throw new ValidationError(redrawn);
      await this.heard(show, episode, 'Cast', words);
      await this.log(show, episode, {
        what: 'asked',
        step: 'cast',
        line: redrawnToChoose(one)
          ? `Drawing ${one.name} again`
          : `Changing ${one.name}'s look`,
      });
      return this.episode(userId, episodeId);
    }
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

  /**
   * One character drawn again as the maker asks, from their card or a
   * change pointed at them: the new drawing waits on the card to be
   * chosen. A person's look is changed at once, as by the look editor.
   */
  async redrawCharacter(
    userId: string,
    episodeId: string,
    characterId: string,
    request: string,
  ): Promise<StudioEpisodeDto> {
    const { show, episode } = await this.requireEpisode(userId, episodeId);
    const who = show.bible?.characters.find((c) => c.id === characterId);
    if (!who) throw new NotFoundError('Character');
    const words = request.trim().slice(0, MESSAGE_CHARS);
    if (!words) throw new ValidationError('Say how they should look');
    await this.hear(userId, words);
    const note = await this.askRedraw(show, episode, who, words);
    if (note) throw new ValidationError(note);
    await this.heard(show, episode, who.name, words);
    await this.log(show, episode, {
      what: 'asked',
      step: 'cast',
      line: redrawnToChoose(who)
        ? `Drawing ${who.name} again`
        : `Changing ${who.name}'s look`,
    });
    return this.episode(userId, episodeId);
  }

  /** New drawings of the cast waiting to be chosen from, for the producer: whose, how many, and for what. */
  private async waitingFor(
    show: StudioShowRecord,
  ): Promise<{ name: string; options: number; words: string }[]> {
    if (!show.bible?.characters.length) return [];
    const work = await this.cast.work(show.id).catch(() => null);
    return show.bible.characters
      .filter((c) => work?.candidates[c.id])
      .map((c) => ({
        name: c.name,
        options: work!.candidates[c.id].options.length,
        words: work!.candidates[c.id].words,
      }));
  }

  /** Every animal and creature of the cast with no drawing yet, drawn now. */
  async drawMissing(userId: string, showId: string): Promise<StudioShowDto> {
    const show = await this.requireShow(userId, showId);
    await this.drawCast(show);
    return this.showDto(show);
  }

  /**
   * The maker's choice between a character's drawing and the new ones
   * waiting beside it: one of them used (the first unless `option` names
   * another, by its id; the scenes that show them, and only those, made
   * again with it), drawn once more from the same words, or let go.
   */
  async chooseDrawing(
    userId: string,
    showId: string,
    characterId: string,
    choice: 'use' | 'again' | 'keep',
    option?: string,
  ): Promise<StudioShowDto> {
    const show = await this.requireShow(userId, showId);
    const who = show.bible?.characters.find((c) => c.id === characterId);
    if (!show.bible || !who) throw new NotFoundError('Character');
    const episodes = await this.studio.listEpisodes(show.id);
    const episode = episodes[episodes.length - 1];
    if (!episode) throw new NotFoundError('Episode');
    const done = await this.choose(show, episode, who, choice, option);
    if (done.note) throw new ValidationError(done.note);
    return this.showDto(
      (await this.studio.findShow(show.id)) ?? { ...show, bible: done.bible },
    );
  }

  /**
   * A choice between a character's drawing and the new ones waiting,
   * from their card, the thread or the chat: what came of it, or why it
   * could not be. Choosing the one they have (a first drawing's first
   * take) keeps it.
   */
  private async choose(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    who: StudioCharacter,
    choice: 'use' | 'again' | 'keep',
    option?: string | number | null,
  ): Promise<{ note: string | null; line: string | null; bible: StudioBible }> {
    const bible = show.bible!;
    const none = `There is no new drawing of ${who.name}.`;
    const work = await this.cast.work(show.id);
    const waiting = work.candidates[who.id];
    if (choice === 'use') {
      const picked = optionMeant(waiting, option);
      if (!picked)
        return {
          note: waiting
            ? `There is no drawing ${option} of ${who.name}.`
            : none,
          line: null,
          bible,
        };
      if (isTheirs(picked, who)) return this.choose(show, episode, who, 'keep');
      const next = await this.cast.choose(show.id, bible, who.id, picked.id);
      if (!next) return { note: none, line: null, bible };
      await this.studio.updateShow(show.id, { bible: next });
      // The made scenes that show them: each made again with the new one.
      const episodes = await this.studio.listEpisodes(show.id);
      const shows = (sheet: SceneSheet | null) =>
        sheet?.kind === 'story' &&
        (sheet.onStage.some((p) => p.who === who.id) ||
          sheet.beats.some((b) => b.who === who.id));
      const scenes = (
        await this.studio.listScenesOf(episodes.map((e) => e.id))
      ).filter((row) => row.sceneKey && shows(row.sheet)).length;
      const line = EVENT_LINES.chosen(who.name, scenes);
      await this.log(show, episode, { what: 'edited', step: 'cast', line });
      return { note: null, line, bible: next };
    }
    if (choice === 'keep') {
      if (!(await this.cast.discard(show.id, who.id)))
        return { note: none, line: null, bible };
      const line = EVENT_LINES.kept(who.name);
      await this.log(show, episode, { what: 'edited', step: 'cast', line });
      return { note: null, line, bible };
    }
    if (!waiting) return { note: none, line: null, bible };
    const words = waiting.words || anotherWay(who);
    const note = await this.askRedraw(show, episode, who, words);
    if (note) return { note, line: null, bible };
    const line = `Drawing ${who.name} again`;
    await this.log(show, episode, { what: 'asked', step: 'cast', line });
    return { note: null, line, bible };
  }

  /**
   * A drawing the maker says is not right: those offered that `options`
   * names by id, or with none named, the one they have. Each is kept with its brief and their note in the failures
   * folder, for the drawing bench, and logged; then they are drawn again,
   * as the note says, or as they were asked for.
   */
  async notRight(
    userId: string,
    showId: string,
    characterId: string,
    input: { options?: string[]; note?: string | null },
  ): Promise<StudioShowDto> {
    const show = await this.requireShow(userId, showId);
    const who = show.bible?.characters.find((c) => c.id === characterId);
    if (!show.bible || !who) throw new NotFoundError('Character');
    const episodes = await this.studio.listEpisodes(show.id);
    const episode = episodes[episodes.length - 1];
    if (!episode) throw new NotFoundError('Episode');
    const note = noteOf(input.note);
    const work = await this.cast.work(show.id);
    const waiting = work.candidates[who.id];
    const asked = input.options ?? [];
    // A first drawing's takes include the one they have: not right either.
    const offered = (waiting?.options ?? []).filter((one) =>
      asked.includes(one.id),
    );
    const at = this.clock.now();
    const kept: string[] = [];
    const keep = async (failure: Omit<DrawingFailure, 'id'>, stamp: string) => {
      const id = failureId({ at, showId: show.id, characterId: who.id, stamp });
      try {
        kept.push(await this.cast.keepFailure({ id, ...failure }));
      } catch (error) {
        this.logger.warn(
          `studio ${show.id}: ${who.name}'s drawing marked not right was not kept: ${(error as Error).message}`,
        );
      }
    };
    const base = {
      at: at.toISOString(),
      showId: show.id,
      book: show.title,
      characterId: who.id,
      name: who.name,
      kind: who.kind,
      size: who.size ?? null,
      look: who.look,
      note,
    } as const;
    if (asked.length)
      for (const one of offered)
        await keep(
          {
            ...base,
            asked: waiting?.words || null,
            which: 'offered',
            drawer:
              one.sheet && !one.sheet.animal && !one.sheet.creature
                ? 'artist'
                : 'kit',
            svg: optionPreview(one, who.id),
            ...(one.sheet ? { sheet: one.sheet } : {}),
            ...(one.sheet?.animal ? { animal: one.sheet.animal } : {}),
            ...(one.sheet?.creature ? { creature: one.sheet.creature } : {}),
            ...(one.figure ? { figure: one.figure } : {}),
          },
          one.id,
        );
    else {
      const theirs = await this.cast.theirs(show.id, who);
      if (theirs)
        await keep(
          {
            ...base,
            asked: null,
            which: 'theirs',
            drawer: theirs.drawer,
            svg: theirs.svg,
            ...(theirs.sheet ? { sheet: theirs.sheet } : {}),
            ...(who.animal ? { animal: who.animal } : {}),
            ...(who.creature ? { creature: who.creature } : {}),
            ...(who.kind === 'person' && who.figure
              ? { figure: who.figure }
              : {}),
          },
          theirs.stamp,
        );
    }
    this.logger.warn(
      `studio ${show.id}: ${who.name}'s drawing${kept.length === 1 ? '' : 's'} marked not right${note ? ` ("${note}")` : ''}: kept as ${kept.join(', ') || 'nothing'}`,
    );
    // Drawn again: as the note says, else as they were asked for.
    const words = note ?? (waiting?.words || anotherWay(who));
    const busy = await this.askRedraw(show, episode, who, words);
    if (busy) throw new ValidationError(busy);
    await this.log(show, episode, {
      what: 'asked',
      step: 'cast',
      line: EVENT_LINES.notRight(who.name, note),
    });
    return this.showDto((await this.studio.findShow(show.id)) ?? show);
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
    const note = await this.askScene(show, episode, scene, clean, {
      id: randomUUID(),
      words: clean,
    });
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
      const before = await this.endBefore(episode.id, scene.position, bible);
      // A move picked by hand becomes its words, which the stage is held
      // to: a beat whose move changed and whose words did not says it now.
      const edited = storySheetOf({ ...(body as object), kind: 'story' });
      edited.beats = pickedBeats(scene.sheet.beats, edited.beats, bible);
      const mended = mendSheet(edited, bible, before);
      next = mended.sheet;
      // A feature the words now name joins its set, and a thing of the
      // show's own the show, as a writer's would.
      const grown = withFound(bible, next.set, mended);
      if (grown !== bible)
        await this.studio.updateShow(show.id, { bible: grown });
      problems = checkSheet(
        next,
        grown,
        planned?.seconds ?? null,
        before,
        narratorRuleOf(show.brief, grown),
        show.brief.audience,
      );
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
    const carried =
      carriedWears(
        (await this.studio.listScenes(episode.id)).map((s) =>
          s.id === scene.id ? { ...s, sheet: next } : s,
        ),
        bible,
      ).get(scene.position) ?? [];
    await this.studio.updateScene(scene.id, {
      previousSheet: scene.sheet,
      sheet: next,
      sheetHash: sceneFingerprint(next, bible, show.brief, carried),
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
    return sceneDto(now, episode, bible, show.brief, carried);
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
              await this.endBefore(episode.id, scene.position, show.bible),
              narratorRuleOf(show.brief, show.bible),
              show.brief.audience,
            )
          : []
        : checkExplainer(sheet, {
            teach: planned?.teach ?? null,
            source: show.brief.source,
            stage: null,
            maths: show.bible?.maths ?? false,
            planned: planned?.seconds ?? null,
          }).problems;
    const carried =
      carriedWears(
        (await this.studio.listScenes(episode.id)).map((s) =>
          s.id === scene.id ? { ...s, sheet } : s,
        ),
        show.bible,
      ).get(scene.position) ?? [];
    await this.studio.updateScene(scene.id, {
      sheet,
      previousSheet: scene.sheet,
      sheetHash: sceneFingerprint(sheet, show.bible, show.brief, carried),
      problems,
    });
    await this.log(show, episode, {
      what: 'edited',
      step: 'script',
      sceneId: scene.id,
      line: `Scene ${scene.position + 1}: the last change undone`,
    });
    const now = (await this.studio.findScene(scene.id))!;
    return sceneDto(now, episode, show.bible, show.brief, carried);
  }

  /** How the scenes before one left the stage: what it carries on from. */
  private async endBefore(
    episodeId: string,
    position: number,
    bible: StudioBible | null,
  ) {
    if (position <= 0 || !bible) return null;
    const scenes = await this.studio.listScenes(episodeId);
    return endBefore(scenes, position, bible);
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
   * the worker. Films are not held back while another is being made: each
   * waits its turn on the worker and starts by itself. A note, in plain
   * words, when it cannot be made at all.
   */
  private async makeEpisode(
    userId: string,
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<string | null> {
    const scenes = await this.studio.listScenes(episode.id);
    const blockers = blockersOf(episode, scenes, show.bible, show.brief);
    if (blockers.length) return blockers[0];
    const carried = carriedWears(scenes, show.bible);
    const stale = scenes.filter((s) =>
      needsMaking(s, show.bible, show.brief, carried.get(s.position)),
    );
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
    const made = scenes.filter((s) => s.sceneKey && s.audioKey && s.durationMs);
    // The film's music is scored from its story: a story's, never an explainer's.
    const story =
      show.brief.format !== 'explainer'
        ? storyOf(episode.outline?.story)
        : null;
    const score = story
      ? scoreOf({
          brief: show.brief,
          story,
          cast: show.bible?.characters ?? [],
          scenes: made,
        })
      : undefined;
    return {
      episodeId: episode.id,
      title: episode.title,
      showTitle: show.title,
      number: episode.number,
      watermark,
      madeWith: MADE_WITH,
      ...themeOfShow(show),
      ...(score ? { score } : {}),
      scenes: made.map((s, i) => {
        // From the scene the film shows before it, by code (an explainer's
        // may carry a thing across, go into a part or push on); the first
        // comes up from black.
        const side = (one: StudioSceneRecord) => ({
          sheet: one.sheet,
          scene: episode.outline?.scenes[one.position] ?? null,
        });
        const joined = i
          ? joinFor(side(made[i - 1]), side(s), show.bible?.pictures ?? [])
          : { join: 'dip' as const };
        return {
          id: s.id,
          title: s.sheet?.title ?? `Scene ${s.position + 1}`,
          durationMs: s.durationMs!,
          transition: s.sheet?.transition ?? 'cut',
          ...joined,
        };
      }),
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

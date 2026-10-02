import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LibraryVoiceDto,
  SceneVoiceStatusDto,
  VoiceOptionDto,
} from '../../../contracts';
import {
  CARTESIA_NARRATOR,
  CHARACTER_VOICES,
  ELEVENLABS_DEFAULT_MODEL,
  ELEVENLABS_MODELS,
  ELEVENLABS_NARRATOR,
  SCENE_VOICE_ENGINES,
  VOICE_ROLES,
  deploymentEngine,
  elevenLabsLibraryName,
  elevenLabsStandIn,
  isElevenLabsModel,
  isListedEngine,
  isVoiceIdOf,
  sceneEngine,
  type ElevenLabsModel,
  type ListedEngine,
  type SceneVoiceEngine,
  type VoiceCast,
  type VoiceRole,
} from '../../domain/scene-voice';
import { elevenLabsRate } from '../../domain/cost';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import {
  voiceRate,
  type VoiceRate,
  type VoiceRates,
} from '../../domain/scene-pace';
import { ValidationError } from '../../domain/errors/errors';
import type { ClockPort } from '../../ports/clock.port';
import { CLOCK, SCENE_VOICES } from '../../ports/tokens';
import type { SpeechPort } from '../../ports/voice.port';
import type {
  AppSettingsRecord,
  AppSettingsRepository,
  WorkerVoices,
} from '../../repositories/settings.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  APP_SETTINGS_REPOSITORY,
} from '../../repositories/tokens';

/** Each engine's voice; null for one not set up in this deployment. */
export type SceneVoices = Record<SceneVoiceEngine, SpeechPort | null>;

/** How long the worker trusts what it last read: a switch lands within this. */
export const SETTINGS_CACHE_MS = 10_000;

const LABEL: Record<SceneVoiceEngine, string> = {
  gemini: 'Gemini (Google)',
  kokoro: 'Our server (Kokoro)',
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  cartesia: 'Cartesia',
};

/** Each listed engine's narrator when the deployment names none. */
const NARRATOR: Record<ListedEngine, string> = {
  elevenlabs: ELEVENLABS_NARRATOR,
  cartesia: CARTESIA_NARRATOR,
};

/** Each listed engine's key, as the admin is told it is missing. */
const KEY: Record<ListedEngine, string> = {
  elevenlabs: 'ELEVENLABS_API_KEY',
  cartesia: 'CARTESIA_API_KEY',
};

/** The ledger's task for a Studio page's voice: what the spending caps sum. */
const VOICE_TASK = 'tts_visual';

/**
 * A spending cap in dollars from a setting: its default when unset, none
 * (null) when set to 0 or "off".
 */
export function capOf(
  set: string | undefined,
  fallback: number,
): number | null {
  const said = set?.trim().toLowerCase();
  if (said === undefined || said === '') return fallback;
  if (said === 'off' || said === 'none') return null;
  const usd = Number(said);
  return Number.isFinite(usd) && usd > 0 ? usd : null;
}

/** ElevenLabs' caps when a deployment names none: a film is about $0.30 at list price. */
export const ELEVENLABS_FILM_CAP_USD = 1;
export const ELEVENLABS_DAY_CAP_USD = 5;

/** Each role as the admin page names it. */
const ROLE_LABEL: Record<VoiceRole, string> = {
  narrator: 'Narrator',
  girl: 'Girl',
  boy: 'Boy',
  woman: 'Woman',
  man: 'Man',
  'old woman': 'Old woman',
  'old man': 'Old man',
  creature: 'Creature',
  divine: 'Voice from above',
  crowd: 'Crowd',
};

/**
 * Visualize's voice, as the admin chose it on the admin page: read by the
 * worker for every page it voices, cached for seconds, so a switch lands
 * on the next page without a redeploy. An engine not set up here (no key,
 * no server) cannot be chosen; one chosen and later unset falls back to
 * the deployment's own.
 */
@Injectable()
export class SceneVoiceService {
  private readonly logger = new Logger(SceneVoiceService.name);
  private cached: { record: AppSettingsRecord; at: number } | null = null;

  constructor(
    @Inject(SCENE_VOICES) private readonly voices: SceneVoices,
    @Inject(APP_SETTINGS_REPOSITORY)
    private readonly settings: AppSettingsRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly config: ConfigService,
    /** The cost ledger, for ElevenLabs' spending caps; without it there are none. */
    @Optional()
    @Inject(AI_CALL_LOG_REPOSITORY)
    private readonly ledger?: AiCallLogRepository,
  ) {}

  /** Which engines can speak here: a key or a server for each. */
  ready(): Record<SceneVoiceEngine, boolean> {
    const set = (key: string) => Boolean(this.config.get<string>(key)?.trim());
    return {
      gemini:
        Boolean(this.voices.gemini) &&
        (set('GEMINI_API_KEY') || set('GOOGLE_GENERATIVE_AI_API_KEY')),
      kokoro: Boolean(this.voices.kokoro),
      openai: Boolean(this.voices.openai) && set('OPENAI_API_KEY'),
      elevenlabs: Boolean(this.voices.elevenlabs) && set('ELEVENLABS_API_KEY'),
      cartesia: Boolean(this.voices.cartesia) && set('CARTESIA_API_KEY'),
    };
  }

  /**
   * The voice a page is spoken in now: its engine, its adapter, and the
   * voice by name. SCENE_VOICE names a voice in the deployment's own
   * engine, so it holds only there; another engine speaks in its own.
   */
  async current(
    /**
     * The page about to be voiced: its film (document) and about how many
     * characters it says, for ElevenLabs' spending caps. Without it (a
     * character's sample line) no cap is looked at.
     */
    page?: { documentId?: string | null; characters?: number },
  ): Promise<{
    engine: SceneVoiceEngine;
    speech: SpeechPort;
    voice: string;
    /** The admin's voices for the narrator and each kind of character, on this engine. */
    cast: VoiceCast;
    /** Every voice's measured rate (voice:calibrate), for the pace step. */
    rates: VoiceRates;
  }> {
    const ready = this.ready();
    const named = this.config.get<string>('SCENE_VOICE_ENGINE');
    const record = await this.record();
    let engine = sceneEngine(record.sceneVoice, named, ready);
    if (engine === 'elevenlabs' && page?.characters) {
      const over = await this.overCap(page, this.modelOf(record));
      if (over) {
        const instead = this.fallback(ready, named);
        if (!instead)
          throw new ValidationError(
            `${over}, and no other voice is set up to take its place`,
          );
        this.logger.warn(
          `${over}: this page is voiced by ${LABEL[instead]} instead`,
        );
        engine = instead;
      }
    }
    let speech = this.voices[engine] ?? this.voices.openai;
    if (!speech) throw new Error('No voice is set up for Visualize');
    // ElevenLabs on the admin's model: its label names it, so a page made
    // on v3 is never taken for one made on v4.
    const model =
      engine === 'elevenlabs' ? record.voiceModels?.elevenlabs : null;
    if (model && speech.withModel) speech = speech.withModel(model);
    const own = engine === deploymentEngine(named, ready);
    const cast = isListedEngine(engine) ? (record.voiceCast[engine] ?? {}) : {};
    return {
      engine,
      speech,
      voice:
        cast.narrator ||
        (own && this.config.get<string>('SCENE_VOICE')?.trim()) ||
        speech.label().voice,
      cast,
      rates: record.voiceRates ?? {},
    };
  }

  /** ElevenLabs' model now: the admin's, else ELEVENLABS_SCENE_MODEL's, else v4. */
  private modelOf(record: AppSettingsRecord): string {
    return (
      record.voiceModels?.elevenlabs ??
      this.voices.elevenlabs?.label().model ??
      ELEVENLABS_DEFAULT_MODEL
    );
  }

  /** ElevenLabs' spending caps, a film's and a day's: null for none. */
  caps(): { filmUsd: number | null; dayUsd: number | null } {
    return {
      filmUsd: capOf(
        this.config.get<string>('ELEVENLABS_MAX_USD_PER_FILM'),
        ELEVENLABS_FILM_CAP_USD,
      ),
      dayUsd: capOf(
        this.config.get<string>('ELEVENLABS_MAX_USD_PER_DAY'),
        ELEVENLABS_DAY_CAP_USD,
      ),
    };
  }

  /** Dollars spent on ElevenLabs' Studio voice today (UTC), by the ledger; null when it cannot say. */
  private async spentToday(): Promise<number | null> {
    if (!this.ledger?.spentUsd) return null;
    const now = this.clock.now();
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return this.ledger.spentUsd({
      task: VOICE_TASK,
      modelPrefix: 'elevenlabs:',
      since,
    });
  }

  /**
   * Why a page would take ElevenLabs past a spending cap, in words: what
   * its film has spent, or the day, and about what the page would add
   * (its characters at the model's price today). Null within both, or
   * with no ledger to ask.
   */
  private async overCap(
    page: { documentId?: string | null; characters?: number },
    model: string,
  ): Promise<string | null> {
    if (!this.ledger?.spentUsd) return null;
    const { filmUsd, dayUsd } = this.caps();
    const pageUsd =
      ((page.characters ?? 0) / 1000) * elevenLabsRate(model, this.clock.now());
    const usd = (n: number) => `$${n.toFixed(2)}`;
    try {
      if (filmUsd !== null && page.documentId) {
        const film = await this.ledger.spentUsd({
          task: VOICE_TASK,
          modelPrefix: 'elevenlabs:',
          documentId: page.documentId,
        });
        if (film + pageUsd > filmUsd)
          return `ElevenLabs' spending cap for a film is reached (${usd(film)} spent of ${usd(filmUsd)}, this page about ${usd(pageUsd)}: ELEVENLABS_MAX_USD_PER_FILM)`;
      }
      if (dayUsd !== null) {
        const day = (await this.spentToday()) ?? 0;
        if (day + pageUsd > dayUsd)
          return `ElevenLabs' spending cap for today is reached (${usd(day)} spent of ${usd(dayUsd)}, this page about ${usd(pageUsd)}: ELEVENLABS_MAX_USD_PER_DAY)`;
      }
    } catch (error) {
      this.logger.warn(
        `could not read ElevenLabs' spending from the ledger, so no cap is kept for this page: ${(error as Error).message}`,
      );
    }
    return null;
  }

  /** The voice that takes ElevenLabs' place past a cap: Gemini, else the deployment's own, else any other set up. */
  private fallback(
    ready: Record<SceneVoiceEngine, boolean>,
    named: string | undefined,
  ): SceneVoiceEngine | null {
    const order: SceneVoiceEngine[] = [
      'gemini',
      deploymentEngine(named, ready),
      'kokoro',
      'cartesia',
      'openai',
    ];
    return (
      order.find(
        (engine) =>
          engine !== 'elevenlabs' && ready[engine] && this.voices[engine],
      ) ?? null
    );
  }

  /** A voice's own rate: as measured for it, else its engine's guess. */
  async rateOf(engine: string, voice: string): Promise<VoiceRate> {
    return voiceRate((await this.record()).voiceRates, engine, voice);
  }

  /** A voice's rate as voice:calibrate measured it, kept beside the rest. */
  async saveRate(
    engine: string,
    voice: string,
    rate: VoiceRate,
  ): Promise<VoiceRates> {
    const record = await this.settings.set(
      { voiceRates: { [engine]: { [voice]: rate } } },
      // A rate measured is no one's switch: the repository keeps who last switched.
      'voice:calibrate',
      this.clock.now(),
    );
    this.cached = { record, at: this.clock.now().getTime() };
    return record.voiceRates ?? {};
  }

  /** What this process can speak with: said by the worker as it starts. */
  here(): WorkerVoices {
    const ready = this.ready();
    const labels = {} as WorkerVoices['labels'];
    for (const engine of SCENE_VOICE_ENGINES) {
      const label = ready[engine] ? this.voices[engine]?.label() : null;
      labels[engine] = label
        ? { model: label.model, voice: label.voice }
        : null;
    }
    return {
      ready,
      deployment: deploymentEngine(
        this.config.get<string>('SCENE_VOICE_ENGINE'),
        ready,
      ),
      labels,
      at: this.clock.now().toISOString(),
    };
  }

  /**
   * The worker says what it can speak with, as it starts: the API serves
   * the admin page and may lack the worker's voice server, so the page
   * offers what the worker has.
   */
  async announce(): Promise<void> {
    await this.settings.announce(this.here());
    this.cached = null;
  }

  /** The voices the worker has, when it has said; this process's own until then. */
  private async worker(): Promise<WorkerVoices> {
    return (await this.record()).worker ?? this.here();
  }

  async status(): Promise<SceneVoiceStatusDto> {
    const record = await this.record();
    const { ready, deployment, labels } = await this.worker();
    const current =
      record.sceneVoice && ready[record.sceneVoice]
        ? record.sceneVoice
        : deployment;
    // The voices of the engine speaking, when it has a list; else of the
    // first with a list that is set up.
    const listed: ListedEngine | null =
      isListedEngine(current) && ready[current] === true
        ? current
        : ready.elevenlabs === true
          ? 'elevenlabs'
          : ready.cartesia === true
            ? 'cartesia'
            : null;
    const elevenlabs = ready.elevenlabs === true;
    const model = this.modelOf(record);
    const { filmUsd, dayUsd } = this.caps();
    return {
      chosen: record.sceneVoice,
      current,
      deployment,
      models: elevenlabs
        ? {
            engine: 'elevenlabs',
            chosen: record.voiceModels?.elevenlabs ?? null,
            current: model,
            // The worker's own model when the admin has chosen none.
            default: labels.elevenlabs?.model || ELEVENLABS_DEFAULT_MODEL,
            options: ELEVENLABS_MODELS.map((one) => ({ ...one })),
            caps: {
              filmUsd,
              dayUsd,
              todayUsd: await this.spentToday().catch(() => null),
            },
          }
        : null,
      options: SCENE_VOICE_ENGINES.map((engine) => {
        const label = labels[engine];
        return {
          value: engine,
          label: LABEL[engine],
          // A worker that said before an engine was one has not said it.
          ready: Boolean(ready[engine]),
          model: label?.model ?? '',
          voice: label?.voice ?? '',
        };
      }),
      cast: listed
        ? {
            engine: listed,
            roles: this.cast(
              listed,
              record.voiceCast[listed] ?? {},
              labels[listed]?.voice || NARRATOR[listed],
            ),
          }
        : null,
      changedAt: record.changedAt?.toISOString() ?? null,
    };
  }

  /** Each role's voice on an engine with a list: the admin's, and the default under it (the narrator's own, or the first of the kind's). */
  private cast(
    engine: ListedEngine,
    chosen: VoiceCast,
    narrator: string,
  ): NonNullable<SceneVoiceStatusDto['cast']>['roles'] {
    const speaks = chosen.narrator ?? narrator;
    return VOICE_ROLES.map((role) => {
      const fallback =
        role === 'narrator'
          ? narrator
          : (CHARACTER_VOICES[engine][role].find((voice) => voice !== speaks) ??
            CHARACTER_VOICES[engine][role][0]);
      // A Voice Library voice (ElevenLabs'): its name, and the premade
      // voice that says its lines until it is added to the account.
      const library =
        engine === 'elevenlabs' ? elevenLabsLibraryName(fallback) : null;
      return {
        value: role,
        label: ROLE_LABEL[role],
        chosen: chosen[role] ?? null,
        default: fallback,
        ...(library
          ? {
              defaultName: library,
              standIn: elevenLabsStandIn(fallback),
            }
          : {}),
      };
    });
  }

  /** An engine with a list, set up here, and its voice. */
  private listed(engine: ListedEngine): SpeechPort {
    const speech = this.voices[engine];
    if (!this.ready()[engine] || !speech)
      throw new ValidationError(
        `${LABEL[engine]} is not set up on this server (${KEY[engine]})`,
      );
    return speech;
  }

  /** The voices an engine offers this account (ElevenLabs', Cartesia's), for the admin to choose from. */
  async voiceOptions(
    engine: ListedEngine = 'elevenlabs',
  ): Promise<VoiceOptionDto[]> {
    let speech = this.listed(engine);
    // ElevenLabs' voices as its model now hears them: a voice made for an
    // earlier model is flagged while v4 speaks.
    const model =
      engine === 'elevenlabs' ? this.modelOf(await this.record()) : null;
    if (model && speech.withModel) speech = speech.withModel(model);
    if (!speech.catalogue)
      throw new ValidationError(`${LABEL[engine]} has no list of voices`);
    return speech.catalogue();
  }

  /** A voice's sample, fetched here for an engine whose samples ask for the key (Cartesia). */
  async voicePreview(
    engine: ListedEngine,
    voice: string,
  ): Promise<{ audio: Buffer; mimeType: string }> {
    if (!isVoiceIdOf(engine, voice))
      throw new ValidationError(`That is not a ${LABEL[engine]} voice`);
    const speech = this.listed(engine);
    if (!speech.preview)
      throw new ValidationError(`${LABEL[engine]} has no samples to fetch`);
    return speech.preview(voice);
  }

  /**
   * The admin's voice for the narrator or a kind of character on an
   * engine with a list (ElevenLabs, Cartesia); null goes back to the
   * default. A character keeps the voice of their kind they have (the
   * first, or the one chosen for them) from episode to episode while this
   * stays as it is. Each engine's voices are kept apart.
   */
  async chooseCast(
    role: VoiceRole,
    voice: string | null,
    changedBy: string,
    engine: ListedEngine = 'elevenlabs',
  ): Promise<SceneVoiceStatusDto> {
    if (voice !== null && !isVoiceIdOf(engine, voice))
      throw new ValidationError(`That is not a ${LABEL[engine]} voice`);
    const cast: VoiceCast = {
      ...((await this.record()).voiceCast[engine] ?? {}),
    };
    if (voice) cast[role] = voice;
    else delete cast[role];
    const record = await this.settings.set(
      { voiceCast: { [engine]: cast } },
      changedBy,
      this.clock.now(),
    );
    this.cached = { record, at: this.clock.now().getTime() };
    return this.status();
  }

  /** ElevenLabs' model, as the admin chose it (v4 or v3); null goes back to the deployment's own. */
  async chooseModel(
    model: ElevenLabsModel | null,
    changedBy: string,
  ): Promise<SceneVoiceStatusDto> {
    if (model !== null && !isElevenLabsModel(model))
      throw new ValidationError('That is not an ElevenLabs model');
    const record = await this.settings.set(
      { voiceModels: { elevenlabs: model } },
      changedBy,
      this.clock.now(),
    );
    this.cached = { record, at: this.clock.now().getTime() };
    return this.status();
  }

  /** ElevenLabs' Voice Library searched, for a voice the account lacks. */
  async library(search: string): Promise<LibraryVoiceDto[]> {
    const speech = this.listed('elevenlabs');
    if (!speech.library)
      throw new ValidationError('ElevenLabs has no library to search');
    return speech.library(search);
  }

  /** A Voice Library voice added to the ElevenLabs account, as the admin asked: a voice slot of the account's. */
  async addLibraryVoice(
    ownerId: string,
    voiceId: string,
    name: string,
  ): Promise<{ voices: VoiceOptionDto[] }> {
    if (!isVoiceIdOf('elevenlabs', voiceId))
      throw new ValidationError('That is not an ElevenLabs voice');
    const speech = this.listed('elevenlabs');
    if (!speech.addVoice || !speech.catalogue)
      throw new ValidationError('ElevenLabs cannot add voices here');
    await speech.addVoice(ownerId, voiceId, name);
    return { voices: await speech.catalogue() };
  }

  /** The admin's choice; null goes back to the deployment's own. */
  async choose(
    engine: SceneVoiceEngine | null,
    changedBy: string,
  ): Promise<SceneVoiceStatusDto> {
    if (engine && !(await this.worker()).ready[engine])
      throw new ValidationError(
        `${LABEL[engine]} is not set up on this server, so it cannot voice pages`,
      );
    const record = await this.settings.set(
      { sceneVoice: engine },
      changedBy,
      this.clock.now(),
    );
    this.cached = { record, at: this.clock.now().getTime() };
    return this.status();
  }

  private async record(): Promise<AppSettingsRecord> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.at < SETTINGS_CACHE_MS)
      return this.cached.record;
    const record = await this.settings.get();
    this.cached = { record, at: now };
    return record;
  }
}

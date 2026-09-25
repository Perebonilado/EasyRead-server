import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SceneVoiceStatusDto } from '../../../contracts';
import {
  SCENE_VOICE_ENGINES,
  deploymentEngine,
  sceneEngine,
  type SceneVoiceEngine,
} from '../../domain/scene-voice';
import { ValidationError } from '../../domain/errors/errors';
import type { ClockPort } from '../../ports/clock.port';
import { CLOCK, SCENE_VOICES } from '../../ports/tokens';
import type { SpeechPort } from '../../ports/voice.port';
import type {
  AppSettingsRecord,
  AppSettingsRepository,
  WorkerVoices,
} from '../../repositories/settings.repository';
import { APP_SETTINGS_REPOSITORY } from '../../repositories/tokens';

/** Each engine's voice; null for one not set up in this deployment. */
export type SceneVoices = Record<SceneVoiceEngine, SpeechPort | null>;

/** How long the worker trusts what it last read: a switch lands within this. */
export const SETTINGS_CACHE_MS = 10_000;

const LABEL: Record<SceneVoiceEngine, string> = {
  gemini: 'Gemini (Google)',
  kokoro: 'Our server (Kokoro)',
  openai: 'OpenAI',
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
  private cached: { record: AppSettingsRecord; at: number } | null = null;

  constructor(
    @Inject(SCENE_VOICES) private readonly voices: SceneVoices,
    @Inject(APP_SETTINGS_REPOSITORY)
    private readonly settings: AppSettingsRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly config: ConfigService,
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
    };
  }

  /**
   * The voice a page is spoken in now: its engine, its adapter, and the
   * voice by name. SCENE_VOICE names a voice in the deployment's own
   * engine, so it holds only there; another engine speaks in its own.
   */
  async current(): Promise<{
    engine: SceneVoiceEngine;
    speech: SpeechPort;
    voice: string;
  }> {
    const ready = this.ready();
    const named = this.config.get<string>('SCENE_VOICE_ENGINE');
    const engine = sceneEngine((await this.record()).sceneVoice, named, ready);
    const speech = this.voices[engine] ?? this.voices.openai;
    if (!speech) throw new Error('No voice is set up for Visualize');
    const own = engine === deploymentEngine(named, ready);
    return {
      engine,
      speech,
      voice:
        (own && this.config.get<string>('SCENE_VOICE')?.trim()) ||
        speech.label().voice,
    };
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
    return {
      chosen: record.sceneVoice,
      current:
        record.sceneVoice && ready[record.sceneVoice]
          ? record.sceneVoice
          : deployment,
      deployment,
      options: SCENE_VOICE_ENGINES.map((engine) => {
        const label = labels[engine];
        return {
          value: engine,
          label: LABEL[engine],
          ready: ready[engine],
          model: label?.model ?? '',
          voice: label?.voice ?? '',
        };
      }),
      changedAt: record.changedAt?.toISOString() ?? null,
    };
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

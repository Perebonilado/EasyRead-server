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

  async status(): Promise<SceneVoiceStatusDto> {
    const record = await this.record();
    const ready = this.ready();
    const named = this.config.get<string>('SCENE_VOICE_ENGINE');
    return {
      chosen: record.sceneVoice,
      current: sceneEngine(record.sceneVoice, named, ready),
      deployment: deploymentEngine(named, ready),
      options: SCENE_VOICE_ENGINES.map((engine) => {
        const label = this.voices[engine]?.label();
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
    if (engine && !this.ready()[engine])
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

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  RealtimeAudioOptions,
  RealtimeSession,
  RealtimeTool,
  SpeechPort,
} from '../../business/ports/voice.port';

const API = 'https://api.elevenlabs.io';

/**
 * Text-to-speech through ElevenLabs — used for the intros (and any other
 * synthesis) of tutors whose voice lives there.
 *
 * `isConfigured()` gates every caller: on a deployment without an
 * ElevenLabs key the tutor falls back to their OpenAI voice rather than
 * failing, so the roster never breaks in dev.
 */
@Injectable()
export class ElevenLabsSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(ElevenLabsSpeechAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('ELEVENLABS_API_KEY'));
  }

  async synthesize({
    text,
    voice,
  }: {
    text: string;
    voice?: string;
  }): Promise<{ audio: Buffer; mimeType: string; model: string }> {
    const apiKey = this.config.getOrThrow<string>('ELEVENLABS_API_KEY');
    const model = this.config.get<string>(
      'ELEVENLABS_TTS_MODEL',
      'eleven_multilingual_v2',
    );
    if (!voice) throw new Error('An ElevenLabs voice id is required');

    const response = await fetch(
      `${API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, model_id: model }),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `ElevenLabs TTS failed (${response.status}): ${detail.slice(0, 300)}`,
      );
      throw new Error('Speech synthesis failed');
    }

    const audio = Buffer.from(await response.arrayBuffer());
    this.logger.log(
      `Synthesised ${text.length} chars via elevenlabs:${model}/${voice}`,
    );
    return { audio, mimeType: 'audio/mpeg', model };
  }
}

/**
 * Conversation credentials for an ElevenLabs Agents session.
 *
 * ElevenLabs keys a conversation to a pre-provisioned *agent* rather than a
 * per-session config, so this adapter lazily ensures one shared EasiRead
 * agent exists — carrying the client-tool definitions and permission for
 * per-session overrides — then mints a short-lived conversation token for
 * it. The per-session pieces (instructions, the tutor's voice) travel back
 * to the browser, which applies them as overrides when it connects.
 *
 * The agent's name embeds a hash of the tool definitions: change the tools
 * and a fresh agent is provisioned instead of drifting from the old one.
 * Superseded agents linger in the ElevenLabs dashboard; they cost nothing.
 */
@Injectable()
export class ElevenLabsRealtimeAdapter {
  private readonly logger = new Logger(ElevenLabsRealtimeAdapter.name);
  /** The ensured agent id, per process. */
  private agentId: string | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('ELEVENLABS_API_KEY'));
  }

  async createSession({
    tools,
    voice,
  }: {
    instructions: string;
    tools?: RealtimeTool[];
    voice?: string;
    /** Turn detection and speed are the agent's own settings there; not applied per session. */
    audio?: RealtimeAudioOptions;
  }): Promise<RealtimeSession> {
    if (!voice) throw new Error('An ElevenLabs voice id is required');
    const agentId = await this.ensureAgent(tools ?? []);

    const response = await fetch(
      `${API}/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { 'xi-api-key': this.apiKey() } },
    );
    const body = (await response.json().catch(() => ({}))) as {
      token?: string;
      detail?: unknown;
    };
    if (!response.ok || !body.token) {
      this.logger.error(
        `Conversation token mint failed (${response.status}): ${JSON.stringify(body).slice(0, 300)}`,
      );
      throw new Error('Could not start a voice session just now');
    }

    return {
      provider: 'elevenlabs',
      conversationToken: body.token,
      agentId,
      voiceId: voice,
    };
  }

  private apiKey(): string {
    return this.config.getOrThrow<string>('ELEVENLABS_API_KEY');
  }

  /** Find-or-create the shared agent for this tool set. */
  private async ensureAgent(tools: RealtimeTool[]): Promise<string> {
    if (this.agentId) return this.agentId;

    const name = `easyread-tutor-${hashOf(JSON.stringify(tools.map((t) => [t.name, t.description, t.parameters])))}`;

    const found = await this.findAgent(name);
    this.agentId = found ?? (await this.createAgent(name, tools));
    return this.agentId;
  }

  private async findAgent(name: string): Promise<string | null> {
    const response = await fetch(
      `${API}/v1/convai/agents?search=${encodeURIComponent(name)}&page_size=30`,
      { headers: { 'xi-api-key': this.apiKey() } },
    );
    if (!response.ok) return null;
    const body = (await response.json().catch(() => ({}))) as {
      agents?: { agent_id?: string; name?: string }[];
    };
    const match = body.agents?.find((agent) => agent.name === name);
    return match?.agent_id ?? null;
  }

  private async createAgent(
    name: string,
    tools: RealtimeTool[],
  ): Promise<string> {
    const llm = this.config.get<string>('ELEVENLABS_AGENT_LLM', 'gpt-4o');
    const ttsModel = this.config.get<string>(
      'ELEVENLABS_AGENT_TTS_MODEL',
      'eleven_turbo_v2',
    );

    const response = await fetch(`${API}/v1/convai/agents/create`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        conversation_config: {
          agent: {
            prompt: {
              // Overridden per session with the real lesson instructions.
              prompt: 'You are an EasiRead tutor.',
              llm,
              tools: tools.map((tool) => ({
                type: 'client',
                name: tool.name,
                description: tool.description,
                parameters: sanitizeParameters(tool.parameters),
                expects_response: true,
              })),
            },
            first_message: '',
            language: 'en',
          },
          tts: { model_id: ttsModel },
        },
        platform_settings: {
          overrides: {
            conversation_config_override: {
              agent: {
                prompt: { prompt: true },
                first_message: true,
                language: true,
              },
              tts: { voice_id: true },
            },
          },
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      agent_id?: string;
      detail?: unknown;
    };
    if (!response.ok || !body.agent_id) {
      this.logger.error(
        `Agent provisioning failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`,
      );
      throw new Error('Could not start a voice session just now');
    }
    this.logger.log(`Provisioned ElevenLabs agent ${name} (${body.agent_id})`);
    return body.agent_id;
  }
}

/**
 * ElevenLabs's tool-parameter dialect is stricter than JSON Schema: every
 * property must carry a description and the keywords below are rejected
 * outright (learned from their 422s, not the docs). The shared tool
 * definitions stay full JSON Schema for OpenAI; this trims them per agent.
 */
export function sanitizeParameters(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const FORBIDDEN = new Set(['additionalProperties', 'minItems', 'maxItems']);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => !FORBIDDEN.has(key))
          .map(([key, value]) => [key, walk(value)]),
      );
    }
    return node;
  };
  return walk(schema) as Record<string, unknown>;
}

/** Tiny stable content hash (djb2) — cache-key material, nothing more. */
function hashOf(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

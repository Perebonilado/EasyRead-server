/**
 * Text-to-speech: turns a page's text into playable audio.
 *
 * One call per page, cached by the caller — audio is ~40× the cost of the
 * simplification that produced the text, so nothing here should ever be
 * synthesised twice.
 */
export interface SpeechPort {
  synthesize(input: {
    text: string;
    /** Provider voice name; the adapter falls back to its configured default. */
    voice?: string;
  }): Promise<{ audio: Buffer; mimeType: string; model: string }>;
}

/** A function the model may call during the conversation. */
export interface RealtimeTool {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

/**
 * Provider-shaped credentials for the browser's own realtime connection.
 * OpenAI hands out a per-session secret with everything baked in; ElevenLabs
 * hands out a conversation token for a pre-provisioned agent, with the
 * per-session pieces (prompt, voice) applied as overrides at connect time.
 */
export type RealtimeSession =
  | {
      provider: 'openai';
      /** Short-lived secret the browser uses to open its WebRTC connection. */
      clientSecret: string;
      model: string;
      expiresAt: string | null;
    }
  | {
      provider: 'elevenlabs';
      conversationToken: string;
      agentId: string;
      /** The tutor's ElevenLabs voice, applied as a TTS override. */
      voiceId: string;
    };

/**
 * Mints ephemeral credentials for a browser ↔ model voice conversation.
 *
 * The server never proxies the audio itself — the browser talks to the
 * provider directly over WebRTC, and this port only hands out a scoped,
 * expiring key with the session's instructions baked in. The long-lived API
 * key stays on the server.
 */
export interface RealtimePort {
  createSession(input: {
    instructions: string;
    tools?: RealtimeTool[];
    /** Overrides the configured default — this is how tutors sound different. */
    voice?: string;
  }): Promise<RealtimeSession>;
}

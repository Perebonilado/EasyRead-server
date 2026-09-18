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
    /**
     * How to deliver it: pace, warmth, where to pause. Honoured by models
     * that steer on instructions (gpt-4o-mini-tts); ignored by the rest.
     */
    instructions?: string;
    /** Playback rate for models that take a number instead (tts-1); 1 is natural. */
    speed?: number;
    /**
     * The same words as pieces, each at its own pace with a silence after
     * it, for a voice that answers to pace and silence and not to a note
     * (Kokoro). Ignored by the rest, which say `text`.
     */
    pieces?: { text: string; speed: number; pauseAfter: number }[];
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    /** Provider and model, as the ledger names them: `openai:gpt-4o-mini-tts`, `modal:qwen3-tts-0.6b`. */
    model: string;
    /** Seconds of GPU the call took, for providers billed by the second; absent otherwise. */
    gpuSeconds?: number;
    /** The audio's true length as the service measured it; absent when it did not say. */
    durationMs?: number;
    /** Where each piece starts in the audio, in order, when the voice spoke pieces and measured them. */
    pieceStartsMs?: number[];
  }>;
  /** What goes into a file's name so audio from one voice never overwrites another's. */
  label(): { model: string; voice: string };
  /**
   * Whether the voice would answer right now. A rented service that sleeps
   * between runs says no while it is asleep or down; asking wakes it. A
   * voice that is always on need not answer at all.
   */
  ready?(): Promise<boolean>;
}

/**
 * Speech-to-text for guided reading's voice input.
 *
 * One finished recording in, one transcript out — never a stream. The reader
 * reviews and edits the transcript before anything grades it, so latency
 * matters less than fidelity, and the text is the only thing kept.
 */
export interface TranscriptionPort {
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
  }): Promise<{ text: string; model: string }>;
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
/**
 * How the session hears and speaks. Turn detection off means the model
 * never decides a turn ended: the client commits turns itself, which is
 * what hold-to-talk needs. Speed is the output rate; 1 is natural.
 */
export interface RealtimeAudioOptions {
  /**
   * 'auto' is the provider's default; 'off' means the client commits every
   * turn; 'semantic' has the model listen for the end of a thought rather
   * than a fixed silence, and never interrupt itself on its own.
   */
  turnDetection?: 'auto' | 'off' | 'semantic';
  /** How quickly semantic detection decides the learner has finished. */
  eagerness?: 'low' | 'medium' | 'high';
  noiseReduction?: 'near_field' | 'far_field';
  speed?: number;
}

export interface RealtimePort {
  createSession(input: {
    instructions: string;
    tools?: RealtimeTool[];
    /** Overrides the configured default — this is how tutors sound different. */
    voice?: string;
    audio?: RealtimeAudioOptions;
  }): Promise<RealtimeSession>;
}

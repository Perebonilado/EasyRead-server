import type { Pcm } from '../domain/wav';

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
     * it, for a voice that answers to pace and silence (Kokoro), or to a
     * few words of direction a piece (Gemini, which takes `style`). Ignored
     * by the rest, which say `text`.
     */
    pieces?: {
      text: string;
      speed: number;
      pauseAfter: number;
      style?: string;
      /** Another voice for this piece than the page's: a story's character. Ignored by a voice that has one only. */
      voice?: string;
      /** How loud a line is said, for a voice that takes it as a tag (ElevenLabs) or a volume (Cartesia); the rest go by speed and style. */
      tone?: 'whisper' | 'shout';
      /**
       * How it is acted, as the script names it, for a voice that takes
       * direction as tags (ElevenLabs): a lesson sentence's delivery, a
       * line's aim and the faces it is said and felt with. The rest go by
       * `style`.
       */
      direction?: {
        delivery?: string;
        aim?: string;
        said?: string;
        felt?: string;
      };
    }[];
    /** Seconds of silence before the first word; the times it reports count from the true start. */
    lead?: number;
    /**
     * Ask the voice when it spoke each word. Kokoro knows, from the
     * durations it renders; a voice that does not simply leaves `words`
     * out of the answer.
     */
    timestamps?: boolean;
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
    /** Where the audio is silent, [from, to] in ms, when the voice made the silences itself: no word starts in one. */
    silencesMs?: [number, number][];
    /** Each word as the voice spoke it, in order, when timestamps were asked for and the voice knows them. */
    words?: { text: string; startMs: number; endMs: number }[];
    /** Tokens in and out, for a voice billed by the token (Gemini); absent otherwise. */
    usage?: { tokensIn: number; tokensOut: number };
    /** Characters billed, for a voice billed by the character (ElevenLabs, Cartesia); absent otherwise. */
    characters?: number;
    /** The same audio as samples, when the voice had them before encoding (Gemini, ElevenLabs, Cartesia): the pace step need not decode it. */
    pcm?: Pcm;
  }>;
  /** What goes into a file's name so audio from one voice never overwrites another's. */
  label(): { model: string; voice: string };
  /**
   * The same voice on another of its models (ElevenLabs' v4 or v3, as the
   * admin chose): its label names that model, so the two never share audio.
   */
  withModel?(model: string): SpeechPort;
  /**
   * Whether the voice would answer right now. A rented service that sleeps
   * between runs says no while it is asleep or down; asking wakes it. A
   * voice that is always on need not answer at all.
   */
  ready?(): Promise<boolean>;
  /**
   * The voices there are to choose from, for a voice with a list of its
   * own (ElevenLabs): the admin page sets the narrator's and each kind of
   * character's from it.
   */
  catalogue?(): Promise<VoiceOption[]>;
  /**
   * A voice's sample, fetched by the server, for a voice whose samples ask
   * for the key (Cartesia): the admin page plays it from here.
   */
  preview?(voiceId: string): Promise<{ audio: Buffer; mimeType: string }>;
  /** The service's public library searched (ElevenLabs'), for the admin to find a voice to add. */
  library?(search: string): Promise<LibraryVoice[]>;
  /** A library voice added to the account, as the admin asked: it takes one of the account's voice slots. */
  addVoice?(ownerId: string, voiceId: string, name: string): Promise<void>;
}

/** A voice a service offers, as the admin page lists it. */
export interface VoiceOption {
  id: string;
  name: string;
  /** Its own words for itself, and its labels: gender, age, accent. */
  description: string;
  /** A sample of it, where the service has one to play. */
  previewUrl: string | null;
  /** How it was made, where the service says: premade, cloned, designed ("generated"), professional. */
  category?: string;
  /** Something the admin should know before casting it: "Made for an earlier model: may sound different on v4". */
  note?: string;
}

/** A voice in a service's public library (ElevenLabs' Voice Library), not yet in the account. */
export interface LibraryVoice extends VoiceOption {
  /** Its owner's public id: with its id, what adding it to the account takes. */
  ownerId: string;
  /** Whether it is in the account already. */
  added: boolean;
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
    }
  | {
      /** Our own line: a LiveKit room the tutor agent is dispatched into. */
      provider: 'livekit';
      url: string;
      token: string;
      room: string;
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

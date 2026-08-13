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

export interface RealtimeSession {
  /** Short-lived secret the browser uses to open its own WebRTC connection. */
  clientSecret: string;
  model: string;
  expiresAt: string | null;
}

/**
 * Mints ephemeral credentials for a browser ↔ model voice conversation.
 *
 * The server never proxies the audio itself — the browser talks to the
 * provider directly over WebRTC, and this port only hands out a scoped,
 * expiring key with the session's instructions baked in. The long-lived API
 * key stays on the server.
 */
export interface RealtimePort {
  createSession(input: { instructions: string }): Promise<RealtimeSession>;
}

/**
 * What is known about the speech a page comes back as, so a fragment is
 * never taken for the whole: the provider's MP3 rate, the pace words are
 * spoken at, and the test that tells a few seconds from a page.
 */

/** The MP3 the voice provider returns is 128 kbps: sixteen bytes a millisecond. */
export const MP3_BYTES_PER_MS = 16;

/** Speech runs at about fifteen characters a second; a slow voice is slower still. */
export const SPEECH_CHARS_PER_SECOND = 15;

/** The playing time of an MP3 of this many bytes at the provider's rate. */
export function mp3DurationMs(bytes: number): number {
  return bytes / MP3_BYTES_PER_MS;
}

/**
 * Whether speech for this many characters is too short to be all of them:
 * under half the time the words take at a normal pace. A fragment is a
 * fragment however slowly it is read; a line of a few words is never one.
 */
export function speechTooShort(bytes: number, chars: number): boolean {
  if (chars < 40) return false;
  const expectedMs = (chars / SPEECH_CHARS_PER_SECOND) * 1000;
  return mp3DurationMs(bytes) < expectedMs * 0.5;
}

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

// ── MP3 frames ──────────────────────────────────────────────────────────────
//
// A voice that speaks a page as pieces is joined here, with real silence
// between the pieces and the start of each piece measured to the frame,
// so a card can land in the pause before its sentence on any voice.

/** What every frame of a stream shares: the header fields a silent frame must copy. */
export interface Mp3Shape {
  version: 1 | 2 | 2.5;
  sampleRate: number;
  channels: 1 | 2;
  bitrateIndex: number;
  sampleRateIndex: number;
  channelMode: number;
}

const BITRATES_V1 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_V2 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<string, number[]> = {
  '1': [44100, 48000, 32000],
  '2': [22050, 24000, 16000],
  '2.5': [11025, 12000, 8000],
};

interface FrameHeader {
  shape: Mp3Shape;
  length: number;
  samples: number;
  sideInfo: number;
}

/** The frame at an offset, when a Layer III header stands there. */
function frameAt(bytes: Buffer, i: number): FrameHeader | null {
  if (i + 4 > bytes.length) return null;
  if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) return null;
  const versionBits = (bytes[i + 1] >> 3) & 3;
  const layerBits = (bytes[i + 1] >> 1) & 3;
  if (versionBits === 1 || layerBits !== 1) return null;
  const version: 1 | 2 | 2.5 =
    versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const bitrateIndex = (bytes[i + 2] >> 4) & 15;
  const sampleRateIndex = (bytes[i + 2] >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3)
    return null;
  const padding = (bytes[i + 2] >> 1) & 1;
  const channelMode = (bytes[i + 3] >> 6) & 3;
  const bitrate =
    (version === 1 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[String(version)][sampleRateIndex];
  const samples = version === 1 ? 1152 : 576;
  const length =
    Math.floor(((version === 1 ? 144 : 72) * bitrate) / sampleRate) + padding;
  const channels: 1 | 2 = channelMode === 3 ? 1 : 2;
  const sideInfo =
    version === 1 ? (channels === 1 ? 17 : 32) : channels === 1 ? 9 : 17;
  return {
    shape: {
      version,
      sampleRate,
      channels,
      bitrateIndex,
      sampleRateIndex,
      channelMode,
    },
    length,
    samples,
    sideInfo,
  };
}

/**
 * A stream read frame by frame: its shape, its true length, and its
 * audio frames alone, without an ID3 tag in front or an encoder's
 * information frame, which decoders skip and a join must not keep.
 */
export function mp3Frames(bytes: Buffer): {
  shape: Mp3Shape | null;
  durationMs: number;
  frames: number;
  audio: Buffer;
} {
  let i = 0;
  if (bytes.length > 10 && bytes.toString('latin1', 0, 3) === 'ID3') {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    i = 10 + size;
  }
  const kept: Buffer[] = [];
  let shape: Mp3Shape | null = null;
  let samples = 0;
  let frames = 0;
  while (i < bytes.length) {
    const frame = frameAt(bytes, i);
    if (!frame || i + frame.length > bytes.length) {
      i += 1;
      continue;
    }
    const tag = bytes.toString(
      'latin1',
      i + 4 + frame.sideInfo,
      i + 8 + frame.sideInfo,
    );
    if (!shape && (tag === 'Xing' || tag === 'Info')) {
      i += frame.length;
      continue;
    }
    shape ??= frame.shape;
    kept.push(bytes.subarray(i, i + frame.length));
    samples += frame.samples;
    frames += 1;
    i += frame.length;
  }
  const durationMs = shape
    ? Math.round((samples / shape.sampleRate) * 1000)
    : mp3DurationMs(bytes.length);
  return {
    shape,
    durationMs,
    frames,
    audio: kept.length ? Buffer.concat(kept) : bytes,
  };
}

/** Whole frames of silence in a stream's own shape, at least the length asked. */
export function silentMp3(shape: Mp3Shape, ms: number): Buffer {
  const header = Buffer.alloc(4);
  const versionBits = shape.version === 1 ? 3 : shape.version === 2 ? 2 : 0;
  header[0] = 0xff;
  header[1] = 0xe0 | (versionBits << 3) | (1 << 1) | 1;
  header[2] = (shape.bitrateIndex << 4) | (shape.sampleRateIndex << 2);
  header[3] = (shape.channelMode << 6) | (1 << 2);
  const frame = frameAt(header, 0);
  if (!frame) return Buffer.alloc(0);
  const one = Buffer.alloc(frame.length);
  header.copy(one, 0);
  const count = Math.ceil(((ms / 1000) * shape.sampleRate) / frame.samples);
  return Buffer.concat(Array.from({ length: Math.max(0, count) }, () => one));
}

/**
 * Pieces of one voice joined into one stream with the silence asked for
 * after each, and where each piece starts, to the frame. A piece whose
 * shape differs from the first is joined without silence before it,
 * since a silent frame must match its neighbours.
 */
export function joinMp3Pieces(
  pieces: { audio: Buffer; pauseAfterS: number }[],
): { audio: Buffer; startsMs: number[]; durationMs: number } {
  const parts: Buffer[] = [];
  const startsMs: number[] = [];
  let at = 0;
  let shape: Mp3Shape | null = null;
  pieces.forEach((piece) => {
    const read = mp3Frames(piece.audio);
    shape ??= read.shape;
    startsMs.push(Math.round(at));
    parts.push(read.audio);
    at += read.durationMs;
    const same =
      shape &&
      read.shape &&
      read.shape.sampleRate === shape.sampleRate &&
      read.shape.version === shape.version &&
      read.shape.channels === shape.channels;
    if (piece.pauseAfterS > 0 && same && read.shape) {
      const silence = silentMp3(read.shape, piece.pauseAfterS * 1000);
      parts.push(silence);
      at += mp3Frames(silence).durationMs;
    }
  });
  return { audio: Buffer.concat(parts), startsMs, durationMs: Math.round(at) };
}

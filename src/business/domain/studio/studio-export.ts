/**
 * A Studio film made into a video file to post (infographic-editor-plan,
 * stage 9): one episode, or a whole show end to end with chapters.
 *
 * The player is a pure function of the film's time, so the worker opens
 * the film in a headless browser at the platform's own size, steps it
 * frame by frame and hands each frame to ffmpeg; the sound is built
 * apart, each voice laid where the film plays it, under the music and the
 * stage's sounds, then made as loud as the platforms play everything.
 *
 * Everything here is pure: the keys that let the render page and a
 * download link in without an account, the ffmpeg arguments, the chapters,
 * the file's name, and what tells two requests for the same film apart.
 * The browser and ffmpeg themselves are the worker's (pipeline/export).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FilmShape, StudioExportDto } from '../../../contracts';

export type ExportScope = 'episode' | 'show';
export type ExportStatus = 'queued' | 'rendering' | 'done' | 'failed';
export const EXPORT_SCOPES: readonly ExportScope[] = ['episode', 'show'];

/** The frame each shape is made at: the platforms' own 1080p, 16:9 for YouTube, 9:16 for Reels, TikTok and Shorts. */
export const EXPORT_SIZE: Readonly<
  Record<FilmShape, { width: number; height: number }>
> = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 },
};

/** Frames a second, unless the worker is told otherwise (EXPORT_FPS). */
export const EXPORT_FPS = 30;

/** The frame rate asked for, made sound: a whole number from 12 to 60, else 30. */
export function exportFps(asked: string | number | undefined | null): number {
  const n = Math.round(Number(asked));
  return Number.isFinite(n) && n >= 12 && n <= 60 ? n : EXPORT_FPS;
}

/**
 * The renderer's own version: a video made by an older one is never handed
 * out again as if it were what the film looks like now.
 */
export const RENDER_VERSION = 1;

// ── Keys ────────────────────────────────────────────────────────────────────

/**
 * What a key lets its holder do without an account: draw one episode (the
 * render page, for the worker's browser), draw any episode of one show, or
 * download one video file (a link the maker's browser follows).
 */
export type KeyScope = 'episode' | 'show' | 'file';

export interface KeyClaim {
  scope: KeyScope;
  /** The episode's, the show's or the video's id. */
  id: string;
  /** When it stops working, in milliseconds since 1970. */
  expiresAt: number;
}

/** A render key lasts two hours: longer than any film takes to make, short enough to be worthless once it is. */
export const RENDER_KEY_MS = 2 * 60 * 60 * 1000;
/** A download link lasts six hours; the maker's next look at the film hands out a fresh one. */
export const FILE_KEY_MS = 6 * 60 * 60 * 1000;

const SCOPE_CODE: Record<KeyScope, string> = {
  episode: 'e',
  show: 's',
  file: 'f',
};
const CODE_SCOPE: Record<string, KeyScope> = {
  e: 'episode',
  s: 'show',
  f: 'file',
};

/** The signature of a key's body, labelled so no other signature made with the secret can stand for one. */
const signatureOf = (body: string, secret: string) =>
  createHmac('sha256', secret)
    .update(`studio-export:${body}`)
    .digest('base64url')
    .slice(0, 32);

/** A key: what it allows, until when, and the server's signature over both. Safe in a URL as it is. */
export function signKey(claim: KeyClaim, secret: string): string {
  const body = `${SCOPE_CODE[claim.scope]}.${claim.id}.${Math.ceil(claim.expiresAt / 1000).toString(36)}`;
  return `${body}.${signatureOf(body, secret)}`;
}

const KEY_SHAPE =
  /^([esf])\.([A-Za-z0-9-]{1,64})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{32})$/;

/** What a key allows, or null for one that is not the server's, is for something else, or has run out. */
export function readKey(
  key: string | null | undefined,
  secret: string,
  now: number,
): KeyClaim | null {
  const found = KEY_SHAPE.exec(key ?? '');
  if (!found) return null;
  const [, code, id, expires, given] = found;
  const mine = Buffer.from(signatureOf(`${code}.${id}.${expires}`, secret));
  const theirs = Buffer.from(given);
  if (mine.length !== theirs.length || !timingSafeEqual(mine, theirs))
    return null;
  const expiresAt = parseInt(expires, 36) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { scope: CODE_SCOPE[code], id, expiresAt };
}

/**
 * The secret keys are signed with: the server's own for them when it has
 * one (STUDIO_EXPORT_SECRET), else one made from its access-token secret,
 * which the API and the worker already share, kept apart by its label.
 */
export function keySecret(env: {
  own?: string | null;
  access?: string | null;
}): string {
  if (env.own?.trim()) return env.own.trim();
  return createHmac('sha256', env.access?.trim() || 'easyread-development')
    .update('studio-export-keys')
    .digest('hex');
}

// ── The sound ───────────────────────────────────────────────────────────────

/** One voice as the film plays it: its file, where in the video it starts, and the part of it heard. */
export interface VoicePiece {
  file: string;
  /** Where in the video its first heard moment plays. */
  startsAtMs: number;
  /** The part of the file heard: from here… */
  inMs: number;
  /** …to here. */
  outMs: number;
}

export interface SoundPlan {
  voices: VoicePiece[];
  /** Whole-film sound laid from the video's start: the music, the stage's sounds. */
  beds: string[];
  /** How long the video runs: the sound is made exactly as long. */
  durationMs: number;
}

/** How loud the platforms play everything (integrated LUFS), the most a peak may reach, and the spread allowed. */
export const LOUDNESS = { I: -14, TP: -1.5, LRA: 11 } as const;

/** What ffmpeg's loudnorm measured of the mix, for the second pass. */
export interface Loudness {
  I: number;
  TP: number;
  LRA: number;
  thresh: number;
  offset: number;
}

const seconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(3);

/** Every stream made the same: 48 kHz stereo, so they mix as one. */
const EVEN = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';

/**
 * The filter graph that lays each voice at its place and mixes it with
 * the beds, padded or cut to the video's length, then `finish`ed (the
 * loudness pass), ending in [out]. Inputs are numbered from `first` (the
 * video is input 0 when it is muxed in the same run): the voices, then
 * the beds. The mix is a plain sum, as the player's speakers hear it: the
 * music and the stage's sounds were rendered at their own levels under the
 * voice, so nothing is scaled down for being one of several.
 */
export function soundGraph(
  plan: SoundPlan,
  first: number,
  finish: string,
): string {
  const length = seconds(plan.durationMs);
  const parts: string[] = [];
  const labels: string[] = [];
  plan.voices.forEach((voice, k) => {
    const from = Math.max(0, voice.inMs);
    const to = Math.max(from, voice.outMs);
    const delay = Math.max(0, Math.round(voice.startsAtMs));
    parts.push(
      `[${first + k}:a]atrim=start=${seconds(from)}:end=${seconds(to)},asetpts=PTS-STARTPTS,${EVEN},adelay=delays=${delay}:all=1[v${k}]`,
    );
    labels.push(`[v${k}]`);
  });
  plan.beds.forEach((_, k) => {
    parts.push(`[${first + plan.voices.length + k}:a]${EVEN}[b${k}]`);
    labels.push(`[b${k}]`);
  });
  const tail = `apad=whole_dur=${length},atrim=end=${length}${finish ? `,${finish}` : ''}[out]`;
  if (!labels.length)
    // A film with nothing to hear still has a sound track, silent.
    parts.push(`anullsrc=r=48000:cl=stereo,atrim=end=${length},${tail}`);
  else if (labels.length === 1) parts.push(`${labels[0]}${tail}`);
  else
    parts.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0:duration=longest,${tail}`,
    );
  return parts.join(';');
}

const inputsOf = (plan: SoundPlan) => [
  ...plan.voices.flatMap((voice) => ['-i', voice.file]),
  ...plan.beds.flatMap((bed) => ['-i', bed]),
];

const target = `I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}`;

/** The first pass: the mix measured, nothing written. */
export function measureArgs(plan: SoundPlan): string[] {
  return [
    '-hide_banner',
    '-nostats',
    ...inputsOf(plan),
    '-filter_complex',
    soundGraph(plan, 0, `loudnorm=${target}:print_format=json`),
    '-map',
    '[out]',
    '-f',
    'null',
    '-',
  ];
}

/** What the first pass measured, from ffmpeg's report; null where it measured nothing usable (a silent film). */
export function loudnessOf(report: string): Loudness | null {
  const start = report.lastIndexOf('{');
  const end = report.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const found = JSON.parse(report.slice(start, end + 1)) as Record<
      string,
      string
    >;
    const out: Loudness = {
      I: Number(found.input_i),
      TP: Number(found.input_tp),
      LRA: Number(found.input_lra),
      thresh: Number(found.input_thresh),
      offset: Number(found.target_offset),
    };
    return Object.values(out).every(Number.isFinite) && out.I > -70
      ? out
      : null;
  } catch {
    return null;
  }
}

/**
 * The second pass, muxed with the silent video: the mix brought to the
 * platforms' loudness by what the first pass measured (linear, so the
 * voice keeps its own rise and fall), as AAC, the video copied as it is.
 */
export function muxArgs(
  plan: SoundPlan,
  video: string,
  measured: Loudness | null,
  out: string,
): string[] {
  const finish = measured
    ? `loudnorm=${target}:measured_I=${measured.I}:measured_TP=${measured.TP}:measured_LRA=${measured.LRA}:measured_thresh=${measured.thresh}:offset=${measured.offset}:linear=true:print_format=summary,aresample=48000`
    : '';
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i',
    video,
    ...inputsOf(plan),
    '-filter_complex',
    soundGraph(plan, 1, finish),
    '-map',
    '0:v',
    '-map',
    '[out]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    out,
  ];
}

/**
 * The video encoder's arguments: JPEG frames on its input, H.264 out,
 * as every platform takes it. The frames are full-range BT.601 (a JPEG's);
 * the film is tagged and converted to broadcast BT.709, so its colours
 * are the stage's on any phone.
 */
export function encodeArgs(fps: number, out: string): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-c:v',
    'mjpeg',
    '-i',
    '-',
    '-vf',
    'scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=full:out_range=limited,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '20',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    '-r',
    String(fps),
    '-movflags',
    '+faststart',
    '-an',
    out,
  ];
}

// ── Chapters ────────────────────────────────────────────────────────────────

export interface Chapter {
  atMs: number;
  title: string;
}

/** Acts closer than this to the chapter before are folded into it. */
export const CHAPTER_GAP_MS = 5000;

/** A value as ffmpeg's metadata file needs it: its own marks escaped, on one line. */
const metaValue = (text: string) =>
  text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\=;#]/g, (mark) => `\\${mark}`)
    .trim();

/**
 * Chapters made sound: inside the film, in order, each a while after the
 * last, the first at the start (a film's chapters cover it whole).
 */
export function soundChapters(
  chapters: readonly Chapter[],
  durationMs: number,
  first: string,
): Chapter[] {
  const sorted = chapters
    .filter((one) => one.title.trim() && Number.isFinite(one.atMs))
    .map((one) => ({
      atMs: Math.max(0, Math.round(one.atMs)),
      title: one.title.trim().slice(0, 120),
    }))
    .filter((one) => one.atMs < durationMs)
    .sort((a, b) => a.atMs - b.atMs);
  const out: Chapter[] = [];
  for (const one of sorted) {
    const last = out[out.length - 1];
    if (!last && one.atMs >= CHAPTER_GAP_MS)
      out.push({ atMs: 0, title: first });
    const before = out[out.length - 1];
    if (before && one.atMs - before.atMs < CHAPTER_GAP_MS) continue;
    out.push(out.length ? one : { ...one, atMs: 0 });
  }
  return out;
}

/**
 * The file ffmpeg reads chapters and the title from (FFMETADATA1), each
 * chapter running to the next one's start, the last to the film's end.
 */
export function ffmetadata(input: {
  title: string;
  chapters: readonly Chapter[];
  durationMs: number;
}): string {
  const lines = [';FFMETADATA1', `title=${metaValue(input.title)}`];
  input.chapters.forEach((chapter, k) => {
    const end = input.chapters[k + 1]?.atMs ?? input.durationMs;
    if (end <= chapter.atMs) return;
    lines.push(
      '[CHAPTER]',
      'TIMEBASE=1/1000',
      `START=${Math.round(chapter.atMs)}`,
      `END=${Math.round(end)}`,
      `title=${metaValue(chapter.title)}`,
    );
  });
  return `${lines.join('\n')}\n`;
}

/** One episode of a show's film, as it plays end to end with the rest. */
export interface ShowPart {
  number: number;
  title: string;
  durationMs: number;
  /** Its own chapters (its acts), on its own clock. */
  chapters: readonly Chapter[];
}

/** An episode's chapter title in a whole show's film. */
export const episodeChapter = (number: number, title: string) =>
  `Episode ${number}: ${title}`;

/**
 * A whole show's chapters: each episode where it starts, named by its
 * title, and its acts inside it on the show's clock; an act at an
 * episode's very start is the episode's chapter.
 */
export function showChapters(parts: readonly ShowPart[]): Chapter[] {
  const out: Chapter[] = [];
  let at = 0;
  for (const part of parts) {
    out.push({ atMs: at, title: episodeChapter(part.number, part.title) });
    for (const act of part.chapters)
      if (act.atMs >= CHAPTER_GAP_MS && act.atMs < part.durationMs)
        out.push({ atMs: at + act.atMs, title: act.title });
    at += part.durationMs;
  }
  return soundChapters(out, at, out[0]?.title ?? '');
}

/** The concat demuxer's list: each file on a line, quoted as it asks. */
export function concatList(files: readonly string[]): string {
  return `${files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n')}\n`;
}

/** Joins the parts end to end (the same encoding, so copied), with the title and chapters. */
export function concatArgs(
  list: string,
  metadata: string,
  out: string,
): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-i',
    metadata,
    '-map',
    '0',
    '-map_metadata',
    '1',
    '-map_chapters',
    '1',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    out,
  ];
}

/** One film given its title and chapters, its streams copied. */
export function metadataArgs(
  video: string,
  metadata: string,
  out: string,
): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i',
    video,
    '-i',
    metadata,
    '-map',
    '0',
    '-map_metadata',
    '1',
    '-map_chapters',
    '1',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    out,
  ];
}

// ── The file ────────────────────────────────────────────────────────────────

/** Where a video is kept: beside the episode's scenes. */
export const exportKey = (showId: string, episodeId: string, id: string) =>
  `studio/${showId}/${episodeId}/export-${id}.mp4`;

/** A title as a file name: nothing a file system or a browser refuses, not too long. */
function fileWords(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 90)
    .trim();
}

/**
 * The name a downloaded video is saved under: the episode's title (the
 * show's, for the whole show), and "vertical" for a tall film, so the two
 * shapes of one film sit side by side.
 */
export function downloadName(input: {
  showTitle: string;
  episodeTitle: string;
  scope: ExportScope;
  shape: FilmShape;
}): string {
  const title =
    fileWords(input.scope === 'show' ? input.showTitle : input.episodeTitle) ||
    fileWords(input.showTitle) ||
    'Film';
  return `${title}${input.shape === 'tall' ? ' (vertical)' : ''}.mp4`;
}

/** The Content-Disposition a download is sent with: the name as it is, and a plain one for old browsers. */
export function contentDisposition(name: string): string {
  const plain = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// ── What a video is made of ─────────────────────────────────────────────────

/** A scene that can be played: made, with its voice. */
export const madeScene = (scene: {
  sceneKey: string | null;
  audioKey: string | null;
  durationMs: number | null;
}): boolean => Boolean(scene.sceneKey && scene.audioKey && scene.durationMs);

/** An episode as a video needs it: its place in the show, its shape, and whose twin it is. */
export interface FilmEpisode {
  id: string;
  number: number;
  shape: FilmShape;
  twinOf: string | null;
}

/**
 * The films a video is made of, in order: the episode asked for, in the
 * shape asked for (its twin, for the other shape); or, for the whole show,
 * every episode in that shape, by its number. Only films that are made
 * (`made`) count: an episode not yet made, or with no twin in the shape,
 * is left out.
 */
export function filmsFor<E extends FilmEpisode>(input: {
  scope: ExportScope;
  shape: FilmShape;
  /** The episode asked from: a lead, never a twin. */
  lead: E;
  episodes: readonly E[];
  made: (episode: E) => boolean;
}): E[] {
  const inShape = (lead: E): E | null =>
    lead.shape === input.shape
      ? lead
      : (input.episodes.find(
          (one) => one.twinOf === lead.id && one.shape === input.shape,
        ) ?? null);
  const leads =
    input.scope === 'show'
      ? input.episodes
          .filter((one) => !one.twinOf)
          .sort((a, b) => a.number - b.number)
      : [input.lead];
  return leads.flatMap((lead) => {
    const film = inShape(lead);
    return film && input.made(film) ? [film] : [];
  });
}

// ── Asking twice ────────────────────────────────────────────────────────────

/** A film as a video is made of it: what the viewer would see and hear. */
export interface FilmPrintPart {
  episodeId: string;
  number: number;
  title: string;
  scenes: readonly {
    id: string;
    sceneKey: string | null;
    audioKey: string | null;
    durationMs: number | null;
  }[];
}

/**
 * What a video is made from, as one short hash: the films' titles and
 * their made scenes' files, the shape, the captions, the watermark and the
 * renderer's version. The same print, the same video: a request for it is
 * handed the one already made.
 */
export function filmPrint(input: {
  scope: ExportScope;
  shape: FilmShape;
  captions: boolean;
  showTitle: string;
  watermark: boolean;
  films: readonly FilmPrintPart[];
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        v: RENDER_VERSION,
        scope: input.scope,
        shape: input.shape,
        captions: input.captions,
        show: input.showTitle,
        watermark: input.watermark,
        films: input.films.map((film) => ({
          id: film.episodeId,
          n: film.number,
          t: film.title,
          s: film.scenes.map((scene) => [
            scene.id,
            scene.sceneKey,
            scene.audioKey,
            scene.durationMs,
          ]),
        })),
      }),
    )
    .digest('hex')
    .slice(0, 32);
}

/** A video still being made but untouched for this long was lost with its worker: it is let go, and a new one made. */
export const STALE_EXPORT_MS = 20 * 60 * 1000;

// ── Progress ────────────────────────────────────────────────────────────────

/** How much of the work each part is: the frames most of it, then the sound and the joining, then keeping the file. */
export const PROGRESS_SHARE = {
  frames: 0.9,
  sound: 0.07,
  store: 0.03,
} as const;

/**
 * How far a video is, 0 to 1, from the frames drawn of all its films and
 * the parts after them; never 1 until it is kept.
 */
export function progressOf(input: {
  framesDone: number;
  framesTotal: number;
  /** The sound and the joining done, of the films. */
  soundDone?: number;
  soundTotal?: number;
}): number {
  const frames =
    input.framesTotal > 0
      ? Math.min(1, Math.max(0, input.framesDone / input.framesTotal))
      : 0;
  const sound =
    input.soundTotal && input.soundTotal > 0
      ? Math.min(1, Math.max(0, (input.soundDone ?? 0) / input.soundTotal))
      : 0;
  const value = frames * PROGRESS_SHARE.frames + sound * PROGRESS_SHARE.sound;
  return Math.min(0.99, Math.round(value * 1000) / 1000);
}

// ── As the maker sees it ────────────────────────────────────────────────────

/** A video's record, as kept. */
export interface ExportRecordLike {
  id: string;
  episodeId: string;
  scope: ExportScope;
  shape: FilmShape;
  status: ExportStatus;
  progress: number;
  fileKey: string | null;
  bytes: number | null;
  error: string | null;
  createdAt: Date;
}

/** A video as the maker sees it: where to download it once it is done. */
export function exportDtoOf(
  record: ExportRecordLike,
  url: string | null,
): StudioExportDto {
  const done = record.status === 'done' && Boolean(record.fileKey);
  return {
    id: record.id,
    episodeId: record.episodeId,
    scope: record.scope,
    shape: record.shape,
    status: record.status,
    progress: done ? 1 : Math.min(1, Math.max(0, record.progress)),
    url: done ? url : null,
    bytes: done ? record.bytes : null,
    error: record.status === 'failed' ? record.error : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/** What the maker is told when a video could not be made: plain, never the machine's words. */
export const EXPORT_FAILED =
  'The video could not be made. Try again in a moment.';

/** The thread's line when a video is ready. */
export function readyLine(input: {
  scope: ExportScope;
  shape: FilmShape;
  title: string;
  durationMs: number;
}): string {
  const s = Math.max(0, Math.round(input.durationMs / 1000));
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const what =
    input.scope === 'show'
      ? 'the whole show'
      : input.shape === 'tall'
        ? 'vertical'
        : 'wide';
  return `Your video is ready: “${input.title}” (${what}, ${clock})`;
}

/**
 * The thread as the record of the production. Besides what the maker and
 * the producer say, the Studio keeps a line for each thing that happens:
 * a result come (the outline, the cast, the scenes, a scene, the film), a
 * step taken with a button, work that did not go through. The maker sees
 * each as a card or a note; the producer reads them as lines from the
 * Studio, so it knows what the buttons did.
 */
import { createHash } from 'node:crypto';
import type { StudioOutline } from '../../domain/studio/studio';
import type {
  StudioEventRecord,
  StudioMessageRecord,
  StudioRepository,
} from '../../repositories/studio.repository';

/** How far back the outline's earlier writings are counted. */
const COUNTED_BACK = 200;

/** Seconds as a clock reads them: 1:05. */
export const clockOf = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const scenesOf = (n: number) => `${n} scene${n === 1 ? '' : 's'}`;

/**
 * A message's id made from what it records: the same work recorded twice
 * (a job taken up again, two scenes finished at once) is the same message,
 * kept once.
 */
export function keyedId(showId: string, key: string): string {
  const hex = createHash('sha256').update(`${showId}:${key}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** Whether a message is an event the Studio recorded, not something said. */
export const isEvent = (message: StudioMessageRecord) =>
  message.meta?.kind === 'event';

/** Which writing of an episode's outline this is: one more than those recorded before. */
export function outlineVersion(
  earlier: readonly StudioMessageRecord[],
  episodeId: string,
): number {
  return (
    earlier.filter(
      (m) =>
        isEvent(m) &&
        m.episodeId === episodeId &&
        m.meta?.event?.what === 'outline',
    ).length + 1
  );
}

/**
 * The conversation as the producer reads it: what was said, and what
 * happened as a line from the Studio.
 */
export function historyOf(
  messages: readonly StudioMessageRecord[],
): { role: 'user' | 'assistant' | 'studio'; content: string }[] {
  return messages.map((m) =>
    isEvent(m)
      ? { role: 'studio' as const, content: m.content.slice(0, 300) }
      : { role: m.role, content: m.content.slice(0, 1500) },
  );
}

/**
 * An event recorded in a show's thread, under its episode. With a key, it
 * is recorded once however often it is asked to be.
 */
export async function logEvent(
  studio: StudioRepository,
  at: { showId: string; episodeId: string },
  event: StudioEventRecord,
  key?: string,
  /** What we keep with it besides, never the maker's to see: a check that could not show what was asked. */
  check?: NonNullable<StudioMessageRecord['meta']>['check'],
): Promise<StudioMessageRecord> {
  const version =
    event.what === 'outline' && event.version === undefined
      ? outlineVersion(
          await studio.listMessages(at.showId, COUNTED_BACK),
          at.episodeId,
        )
      : event.version;
  return studio.addMessage({
    ...(key ? { id: keyedId(at.showId, key) } : {}),
    showId: at.showId,
    episodeId: at.episodeId,
    role: 'assistant',
    content: event.line,
    meta: {
      kind: 'event',
      event: { ...event, ...(version ? { version } : {}) },
      ...(check ? { check } : {}),
    },
  });
}

/** How many ways something was drawn, in words. */
const WAYS: Record<number, string> = { 2: 'two ways', 3: 'three ways' };

/** The lines events say, in the maker's words. */
export const EVENT_LINES = {
  outline: (outline: StudioOutline, again: boolean) =>
    `${again ? 'Outline written again' : 'Outline written'}: “${outline.title}”, ${scenesOf(outline.scenes.length)}, about ${clockOf(outline.scenes.reduce((n, s) => n + s.seconds, 0))}`,
  /** Characters the artist drew at the cast step, before any film. */
  drawn: (names: readonly string[]) =>
    `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? 'The cast')} drawn — have a look`,
  /** One character drawn again as the maker asked: waiting beside the one they have. */
  redrawn: (name: string, ways = 1) =>
    ways > 1
      ? `${name} redrawn ${WAYS[ways] ?? `${ways} ways`} — pick one`
      : `${name} redrawn — have a look`,
  /** A character the artist drew for the first time, in takes side by side: the best in use, the others to choose instead. */
  takes: (name: string, ways: number) =>
    `${name} drawn ${WAYS[ways] ?? `${ways} ways`} — the first is in use, or pick another`,
  /** A drawing the maker said was not right: kept for the bench, and drawn again. */
  notRight: (name: string, note: string | null) =>
    `Not right: drawing ${name} again${note ? ` — “${note.length > 80 ? `${note.slice(0, 79)}…` : note}”` : ''}`,
  /** The new drawing chosen: the scenes that show them, to make again. */
  chosen: (name: string, scenes: number) =>
    `${name}'s new drawing is in${scenes ? `: ${scenes} made scene${scenes === 1 ? '' : 's'} with ${name} to make again` : ''}`,
  /** The new drawing let go: as they were. */
  kept: (name: string) => `${name} kept as before`,
  drawFailed: (name: string, again: boolean) =>
    `${name} could not be drawn${again ? ' again' : ''}. Try again in a moment.`,
  /** An animal the kit draws, whose new look could not be read from what was asked. */
  unchanged: (name: string) =>
    `${name}'s new look could not be worked out from that. Say it another way, or try again.`,
  scenes: (count: number) =>
    count === 1 ? 'The scene is written' : `All ${count} scenes written`,
  scene: (position: number, title: string, again: boolean) =>
    `Scene ${position + 1} ${again ? 'written again' : 'written'}: “${title}”`,
  made: (
    title: string,
    seconds: number,
    scenes?: { made: number; of: number },
  ) =>
    `Film made${scenes && scenes.made < scenes.of ? ` with ${scenes.made} of ${scenesOf(scenes.of)}` : ''}: “${title}”, ${clockOf(seconds)}`,
  approved: (step: 'outline' | 'cast', next: 'cast' | 'script') =>
    `${step === 'outline' ? 'Outline' : 'Cast'} approved: ${next === 'cast' ? 'meet the cast' : 'writing the scenes'}`,
  make: (count: number, seconds: number) =>
    `Making the film: ${scenesOf(count)}, about ${clockOf(seconds)}`,
  shared: (on: boolean) =>
    on ? 'Link on: anyone with it can watch' : 'Link off: only you can watch',
  /** Making a scene again after changing it as asked, to check it. */
  remake: (position: number) =>
    `Making scene ${position + 1} again to check it`,
  /**
   * A scene made again as asked, and looked at: shown as asked, not yet
   * (never "done" when it is not), or not looked at this time.
   */
  checked: (
    position: number,
    came: 'shown' | 'not yet' | 'unchecked',
    tell = '',
  ) => {
    const told = tell.trim().replace(/[.!\s]+$/u, '');
    return came === 'shown'
      ? `Scene ${position + 1} made again and checked${told ? `: ${told}` : ''}.`
      : came === 'not yet'
        ? `Scene ${position + 1} made again, but I couldn't change this yet${told ? `: ${told}` : ''}. I've passed it on to be fixed.`
        : `Scene ${position + 1} made again. I couldn't check it this time: have a look.`;
  },
} as const;

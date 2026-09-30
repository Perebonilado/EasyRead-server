import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../contracts';
import { withFaces, FACE_STRENGTH } from './scene-face-direct';
import { faceInScene } from './scene-face-draw';
import { recipeFace } from './scene-face-rig';
import {
  faceChanges,
  faceRhythm,
  faceRhythmLine,
  faceSpans,
  reactionFits,
} from './scene-face-rhythm';

/** "The Star and the Manger" (a Nativity for young children), as it was made: its five scenes, drawings left out. */
const nativity = [0, 1, 2, 3, 4].map(
  (n) =>
    JSON.parse(
      readFileSync(
        join(__dirname, 'studio/__fixtures__/nativity', `made-s${n}.json`),
        'utf8',
      ),
    ) as SceneDto,
);
/** Each scene's mood, as its sheet gave it. */
const moods = ['serious', 'calm', 'serious', 'calm', 'calm'];
const directed = nativity.map((scene, n) =>
  withFaces(scene, { mood: moods[n] }),
);
const sum = (reports: ReturnType<typeof faceRhythm>[], k: string) =>
  reports.reduce((n, r) => n + (r.counts as Record<string, number>)[k], 0);

describe('the face rhythm check', () => {
  it('finds what made the Nativity’s faces restless: changes every second or two, between opposites, and reactions that do not fit', () => {
    const made = nativity.map(faceRhythm);
    expect(sum(made, 'changes')).toBeGreaterThan(100);
    expect(sum(made, 'short-hold')).toBeGreaterThan(30);
    expect(sum(made, 'swing')).toBeGreaterThan(15);
    expect(sum(made, 'mismatch')).toBeGreaterThan(10);
    // Joseph comforts Mary ("Mary, my dear, keep close"), determined: the
    // kit wears it as angry, and she takes it with fear.
    expect(made[0].issues).toContainEqual(
      expect.objectContaining({ id: 'mary', kind: 'mismatch', atMs: 8687 }),
    );
    for (const report of made)
      for (const one of report.people)
        if (one.id !== 'jesus') expect(one.perMinute).toBeGreaterThan(7);
    expect(faceRhythmLine(made[0])).toMatch(/swings/);
  });

  it('reads a face with the rest under it: strength alone is no change', () => {
    const scene = {
      durationMs: 10000,
      effects: [],
      acting: {
        ada: {
          rest: [[0, 'worried', 0.3]],
          face: [
            [1000, 'worried', 0.6, null, 'ease', 2000],
            [5000, 'tender', 0.5, null, 'ease', 2000],
          ],
        },
      },
    } as unknown as SceneDto;
    const changes = faceChanges(faceSpans(scene, 'ada'));
    expect(changes.map((c) => [c.atMs, c.to.said])).toEqual([
      [5000, 'tender'],
      [7000, 'worried'],
    ]);
  });

  it('knows a reaction that fits the line from one that does not', () => {
    expect(reactionFits('tender', 'relieved')).toBe(true);
    expect(reactionFits('tender', 'fear')).toBe(false);
    expect(reactionFits('determined', 'fear')).toBe(false);
    expect(reactionFits('worried', 'annoyed')).toBe(false);
    expect(reactionFits('pleading', 'tender')).toBe(true);
    expect(reactionFits('angry', 'fear')).toBe(true);
  });
});

describe('faces directed', () => {
  it('gives the Nativity faces that rest, change for a reason, and hold', () => {
    const before = nativity.map(faceRhythm);
    const after = directed.map(faceRhythm);
    expect(sum(after, 'changes')).toBeLessThan(sum(before, 'changes') / 2);
    expect(sum(after, 'swing')).toBe(0);
    expect(sum(after, 'short-hold')).toBe(0);
    expect(sum(after, 'mismatch')).toBe(0);
    // A crowded change is only ever a story moment and a line of theirs.
    expect(sum(after, 'crowded')).toBeLessThanOrEqual(5);
    for (const report of after)
      for (const one of report.people) {
        expect(one.perMinute).toBeLessThanOrEqual(14);
        if (one.medianHoldMs !== null)
          expect(one.medianHoldMs).toBeGreaterThanOrEqual(4000);
        // Mostly subtle: never at full strength for young children.
        expect(one.fullShare).toBe(0);
      }
  });

  it('rests each one at their mood in the scene, and turns it only at a turn', () => {
    const [s0, s1, , s3, s4] = directed;
    // The doors shut on them: Mary rests worried, Joseph a little worried.
    expect(s0.acting?.mary?.rest).toEqual([
      [0, 'worried', FACE_STRENGTH.young.rest],
    ]);
    expect(s0.acting?.joseph?.rest?.[0][1]).toBe('worried');
    // The stable found: Mary's sadness turns to gladness.
    expect(s1.acting?.mary?.rest?.map(([, r]) => r)).toEqual(['sad', 'joy']);
    // The shepherd afraid of the angel, then glad of the news.
    expect(s3.acting?.shepherd?.rest?.map(([, r]) => r)).toEqual([
      'neutral',
      'worried',
      'joy',
    ]);
    // The baby sleeps through it all, and reacts to nothing.
    expect(s4.acting?.jesus?.rest).toEqual([[0, 'eyes closed', 1]]);
    expect(s4.acting?.jesus?.face).toBeUndefined();
  });

  it('never makes Mary afraid of a comfort, nor Joseph angry at a tender line', () => {
    const [s0] = directed;
    const mary = faceSpans(s0, 'mary');
    const joseph = faceSpans(s0, 'joseph');
    for (const span of [...mary, ...joseph]) {
      expect(['fear', 'angry', 'furious', 'terror']).not.toContain(span.said);
    }
    // "Do not worry for me, Joseph": tender over worry, and no flash of it
    // first for young children.
    const line = s0.acting?.mary?.face?.find(([at]) => at > 25000);
    expect(line?.slice(1, 5)).toEqual([
      'tender',
      expect.any(Number),
      'worried',
      'ease',
    ]);
    expect(
      s0.acting?.mary?.face?.some(([, , , , how]) => how === 'flash'),
    ).toBe(false);
  });

  it('keeps a lie’s flash for older viewers only', () => {
    const scene = {
      durationMs: 10000,
      effects: [
        {
          atMs: 1000,
          target: 'sam',
          part: null,
          do: 'say',
          say: { id: 's', text: 'It was not me.', untilMs: 3000 },
        },
      ],
      acting: {
        sam: {
          face: [
            [670, 'fear', 1, null, 'flash', 180],
            [800, 'amused', 1, 'fear', 'ease', 3000],
          ],
        },
      },
    } as unknown as SceneDto;
    const older = withFaces(scene, { young: false, mood: null });
    const young = withFaces(scene, { young: true, mood: null });
    expect(older.acting?.sam?.face?.[0][4]).toBe('flash');
    expect(
      young.acting?.sam?.face?.some(([, , , , how]) => how === 'flash'),
    ).toBe(false);
  });

  it('is the same made again', () => {
    for (const [n, scene] of nativity.entries()) {
      expect(withFaces(scene, { mood: moods[n] })).toEqual(directed[n]);
    }
  });

  it('shows the rest in a still: Mary worried as the scene opens', () => {
    const [s0] = directed;
    const at = faceInScene(s0, 'mary', 500);
    const worried = recipeFace('worried', FACE_STRENGTH.young.rest);
    expect(at.browInL).toBeCloseTo(worried.browInL, 5);
    expect(at.smile).toBeCloseTo(worried.smile, 5);
  });
});

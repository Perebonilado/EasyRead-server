import {
  BEFORE_KEY_S,
  DELIVERY,
  IDEA_CHANGE_S,
  PAUSE_RANGE,
  SPEED_RANGE,
  deliveryPieces,
  voiceSlug,
  voiceStyle,
} from './scene-voice';
import { SCENE_DELIVERIES, SCENE_MOODS } from './scene-script';

describe('how the voice says each sentence', () => {
  it('gives every tag a pace and a silence inside the bounds', () => {
    for (const delivery of SCENE_DELIVERIES) {
      const [piece] = deliveryPieces([{ delivery, pause: 'short' }]);
      expect(piece.speed).toBeGreaterThanOrEqual(SPEED_RANGE[0]);
      expect(piece.speed).toBeLessThanOrEqual(SPEED_RANGE[1]);
      expect(piece.pauseAfter).toBeGreaterThanOrEqual(PAUSE_RANGE[0]);
      expect(piece.pauseAfter).toBeLessThanOrEqual(PAUSE_RANGE[1]);
    }
  });

  it('slows on the point, quickens on an aside, and waits after a question', () => {
    const [hook, key, aside, question] = deliveryPieces([
      { delivery: 'hook', pause: 'short' },
      { delivery: 'key', pause: 'short' },
      { delivery: 'aside', pause: 'short' },
      { delivery: 'question', pause: 'short' },
    ]);
    expect(key.speed).toBeLessThan(1);
    expect(aside.speed).toBeGreaterThan(1);
    expect(hook.speed).toBeGreaterThan(key.speed);
    expect(question.pauseAfter).toBeGreaterThan(DELIVERY.explain.pause);
  });

  it('leaves a beat of silence before a key point, and more where the idea changes', () => {
    const [before, , changing] = deliveryPieces([
      { delivery: 'explain', pause: 'short' },
      { delivery: 'key', pause: 'short' },
      { delivery: 'explain', pause: 'long' },
    ]);
    expect(before.pauseAfter).toBeGreaterThanOrEqual(BEFORE_KEY_S);
    expect(changing.pauseAfter).toBeCloseTo(
      DELIVERY.explain.pause + IDEA_CHANGE_S,
    );
  });

  it('keeps a long question within the longest silence', () => {
    const [piece] = deliveryPieces([{ delivery: 'question', pause: 'long' }]);
    expect(piece.pauseAfter).toBeLessThanOrEqual(PAUSE_RANGE[1]);
  });

  it('directs a voice that takes direction in a few words, for every mood and tag', () => {
    for (const mood of SCENE_MOODS)
      for (const delivery of SCENE_DELIVERIES) {
        const style = voiceStyle(mood, delivery);
        expect(style.split(';')).toHaveLength(3);
        expect(style.length).toBeLessThan(140);
      }
    expect(voiceStyle('serious', 'key')).toMatch(/sober.*landing the point/);
  });

  it('names a blend of voices so it can go in a file name', () => {
    expect(voiceSlug('af_heart,af_bella')).toBe('af_heart+af_bella');
    expect(voiceSlug('Kore')).toBe('kore');
  });
});

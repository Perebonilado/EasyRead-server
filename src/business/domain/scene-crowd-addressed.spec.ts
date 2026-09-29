/**
 * The crowd before the camera only in a scene about them: a class its
 * teacher addresses, a congregation, a crowd watching a match; and then
 * only in the wide shot, never in a close shot on someone. People talking
 * among themselves in a market or a classroom have no one before the
 * camera.
 */
import type { SceneDto } from '../../contracts';
import { crowdAddressed, withoutAudience } from './scene-set-audience';
import { fadeAt, stillPlan } from './scene-still';
import { classroomScene } from './studio/__fixtures__/classroom';
import { marketSet } from './studio/__fixtures__/market';

jest.setTimeout(60_000);

const foregroundOf = (scene: SceneDto) => {
  const set = scene.things[0];
  return set.kind === 'drawing'
    ? (set.layers?.find((layer) => layer.id === 'foreground')?.svg ?? '')
    : '';
};
const rowIds = (svg: string) =>
  [...svg.matchAll(/id="(fg-au-\d+)"/g)].map((m) => m[1]);

describe('whether a scene is about the crowd', () => {
  it('is, when someone speaks to them or they watch the main action', () => {
    for (const beats of [
      [{ kind: 'line' as const, say: 'Good morning, class!' }],
      [{ kind: 'line' as const, say: 'Everyone, listen to me.' }],
      [{ kind: 'narration' as const, say: 'Mrs Ade addresses the class.' }],
      [{ kind: 'narration' as const, say: 'The pastor begins his sermon.' }],
      [{ kind: 'narration' as const, say: 'The crowd cheers as Tobi scores.' }],
      [{ kind: 'narration' as const, say: 'The guests watch as they dance.' }],
      [{ kind: 'line' as const, say: 'We will win!', toCrowd: true }],
    ])
      expect({ beats, about: crowdAddressed(beats) }).toEqual({
        beats,
        about: true,
      });
  });

  it('is not, when people talk among themselves, in a market or a classroom', () => {
    expect(
      crowdAddressed([
        { kind: 'line', say: 'Maya, look at the mangoes!' },
        { kind: 'narration', say: 'Maya walks to the stall with Mama.' },
        { kind: 'line', say: 'Tobi, have you finished your sums?' },
        {
          kind: 'narration',
          say: 'The class is quiet. Tobi whispers to Kemi.',
        },
      ]),
    ).toBe(false);
  });
});

describe('the crowd before the camera', () => {
  it('is not drawn in a market any more: its shoppers are about the story', () => {
    expect(marketSet().layered.fore.some((f) => f.id.startsWith('fg-au'))).toBe(
      false,
    );
  });

  it('is gone, in every shot, from a classroom scene not about the class', () => {
    const scene = classroomScene(false);
    expect(foregroundOf(scene)).not.toContain('data-audience');
    for (const t of [0, 1000, 3000, 6000]) {
      const plan = stillPlan(scene, t, 960);
      const layer = plan.parts.find((p) => p.key === 'layer:foreground');
      expect(layer?.svg ?? '').not.toContain('fg-au');
    }
  });

  it('shows the class in the wide shot of a scene its teacher addresses, and not in her close shot, eased out and back', () => {
    const scene = classroomScene(true);
    const rows = rowIds(foregroundOf(scene));
    expect(rows.length).toBeGreaterThan(8);
    for (const id of rows) {
      // The wide shot, before and after the close one.
      expect(fadeAt(scene, id, 1000)).toBe(1);
      expect(fadeAt(scene, id, 6200)).toBe(1);
      // Her close shot: gone.
      expect(fadeAt(scene, id, 3000)).toBe(0);
      // Never a pop.
      let last = fadeAt(scene, id, 0);
      for (let t = 10; t <= 6400; t += 10) {
        const now = fadeAt(scene, id, t);
        expect(Math.abs(now - last)).toBeLessThan(0.05);
        last = now;
      }
    }
    // As a still shows it.
    const close = stillPlan(scene, 3000, 960).parts.find(
      (p) => p.key === 'layer:foreground',
    )!;
    expect(close.svg).toContain(`[id="${rows[0]}"]{opacity:0}`);
    const wide = stillPlan(scene, 1000, 960).parts.find(
      (p) => p.key === 'layer:foreground',
    )!;
    expect(wide.svg).toContain(`id="${rows[0]}"`);
    expect(wide.svg).not.toContain('{opacity:0}');
  });

  it('is taken out of a layer whole, and the rest of it kept', () => {
    const svg =
      '<svg><g id="fg-1"/><g data-audience="rows"><style>.au{}</style><g id="fg-au-1"><g><path d="M0 0"/></g></g></g><g id="fg-2"></g></svg>';
    expect(withoutAudience(svg)).toBe(
      '<svg><g id="fg-1"/><g id="fg-2"></g></svg>',
    );
  });
});

import { buildFigure } from './living.generated/figures';
import { buildMechanism } from './living.generated/mechanisms';
import { STAGES, repairVisual } from './visual';
import {
  layoutTutorial,
  tidyTutorial,
  type VisualTutorial,
} from './visual-cards';
import { FIGURE_OUTLINES } from './visual-figures';
import { MECHANISMS, MECHANISM_KINDS } from './visual-mechanisms';
import { renderSheet, renderStill, shownAfterEach } from './visual-render';

const tutorial: VisualTutorial = {
  title: 'A fly and a bucket',
  sentences: [
    'The tsetse fly bites people and cattle to feed on blood, and that is the start of it.',
    'Its proboscis pushes through the skin, and its wings fold flat over its back at rest.',
    'A token bucket holds tokens that drip in at a rate, and each request takes one.',
    'When the bucket is empty the request waits, and that is how a burst is held back.',
    'Those are the two pictures of this page, one alive and one a machine.',
  ],
  moments: [
    {
      from: 0,
      to: 1,
      card: 'picture',
      picture: 'tsetse fly',
      name: 'tsetse fly',
      callouts: [{ part: 'proboscis', text: 'pushes through skin' }],
    },
    {
      from: 2,
      to: 3,
      card: 'mechanism',
      heading: 'A token bucket',
      mechanism: {
        kind: 'bucket',
        phases: [
          { stage: 'fill', text: 'tokens drip in' },
          { stage: 'serve', text: 'requests take one' },
        ],
      },
      callouts: [{ part: 'tap', text: 'tokens in' }],
      reveals: [
        { part: 0, sentence: 2 },
        { part: 1, sentence: 3 },
      ],
    },
    { from: 4, to: 4, card: 'statement', text: 'One alive, one a machine.' },
  ],
};

describe('a still of the stage', () => {
  it('draws every moment of a page as SVG, both stagings, with its figures and callouts', () => {
    const tidy = tidyTutorial(tutorial);
    for (const stage of [STAGES.box, STAGES.wide]) {
      const script = repairVisual(layoutTutorial(tidy, stage), stage);
      const shown = shownAfterEach(script);
      const still = renderStill(script.elements, shown[1], {
        w: stage.W,
        h: stage.H,
      });
      expect(still).toContain('<svg');
      expect(still).toContain('pushes through skin');
      const sheet = renderSheet(script, tidy.moments, {
        w: stage.W,
        h: stage.H,
      });
      expect(sheet).toContain('tokens in');
      expect(
        (sheet.match(/<g transform="translate\(/g) ?? []).length,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('has a recipe for every outline and every mechanism stage, still and moving', () => {
    for (const outline of FIGURE_OUTLINES) {
      for (const ms of [0, 1700, 9000]) {
        const { ops, anchors } = buildFigure(
          {
            x: 100,
            y: 100,
            w: 120,
            h: 90,
            outline,
            parts: ['wings', 'legs', 'leaves', 'core', 'hairs', 'tail'],
            manner: 'walk',
            seed: 3,
          },
          ms,
        );
        expect(ops.length).toBeGreaterThan(0);
        expect(anchors.centre).toBeDefined();
      }
    }
    for (const kind of MECHANISM_KINDS) {
      const spec = MECHANISMS[kind];
      spec.stages.forEach((stage, index) => {
        const params = Object.fromEntries(
          spec.params.map((p) => [p.name, p.default]),
        );
        const { ops, anchors } = buildMechanism(
          {
            x: 200,
            y: 120,
            w: 300,
            h: 160,
            kind,
            params,
            stages: spec.stages.map((s) => s.name),
            seed: 5,
          },
          index,
          4200,
        );
        expect(ops.length).toBeGreaterThan(0);
        for (const anchor of spec.anchors)
          if (!/\d$/.test(anchor)) expect(anchors[anchor]).toBeDefined();
      });
    }
  });
});

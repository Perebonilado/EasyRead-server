import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import {
  FIGURE_FACES,
  HAIR_STYLES,
  HEADWEAR,
  PLAIN_FIGURE,
  drawFigure,
  type FigureSpec,
} from './scene-figure';
import {
  FIGURE_VIEWS,
  VIEW_RIG,
  viewGroupId,
  viewOnly,
  viewSuffix,
} from './scene-figure-views';

const as = (spec: Partial<FigureSpec>): FigureSpec => ({
  ...PLAIN_FIGURE,
  ...spec,
});

/** The markup of one view's group, and what is in it. */
function groupOf(svg: string, id: string): string {
  const open = svg.indexOf(`<g id="${id}"`);
  if (open < 0) return '';
  const tags = /<g\b[^>]*?(\/?)>|<\/g>/g;
  tags.lastIndex = open;
  let depth = 0;
  for (;;) {
    const tag = tags.exec(svg);
    if (!tag) return '';
    if (tag[0] === '</g>') depth -= 1;
    else if (!tag[1]) depth += 1;
    if (depth === 0) return svg.slice(open, tag.index + tag[0].length);
  }
}

describe('rig 1 and rig 2, unchanged by rig 3', () => {
  it('draws rig 2 byte for byte as before', () => {
    // Every hair style and hat, what swings, a pose, a prop, signs, a
    // group and one lying down, on rig 2: the hash is rig 2's before rig 3.
    const all: string[] = [];
    for (const hair of HAIR_STYLES)
      all.push(
        JSON.stringify(
          drawFigure(as({ hair, extras: ['cape', 'scarf'] }), `h-${hair}`, {
            rig: 2,
          }),
        ),
      );
    for (const headwear of HEADWEAR)
      all.push(
        JSON.stringify(
          drawFigure(
            as({
              headwear,
              hair: 'ponytail',
              extras: ['ribbon', 'headscarf tail'],
            }),
            `w-${headwear}`,
            {
              rig: 2,
              pose: 'waving',
              holding: 'staff',
              signs: ['walking', 'tears'],
            },
          ),
        ),
      );
    all.push(
      JSON.stringify(
        drawFigure(as({ extras: ['wings', 'cloak'] }), 'group', {
          rig: 2,
          count: 3,
        }),
      ),
    );
    all.push(
      JSON.stringify(
        drawFigure(as({ hair: 'long' }), 'lying', { rig: 2, pose: 'lying' }),
      ),
    );
    expect(createHash('sha256').update(all.join('\n')).digest('hex')).toBe(
      'f73568717b972248c4acc3809add9ccde4e2697eff05e7b75a6d8eee4d83d641',
    );
  });
});

describe('a person drawn from every side (rig 3)', () => {
  const people: [string, FigureSpec][] = [
    [
      'maya',
      as({ age: 'child', hair: 'braids', top: 'dress', extras: ['ribbon'] }),
    ],
    ['ada', as({ hair: 'ponytail', extras: ['cape', 'glasses'] })],
    [
      'joe',
      as({
        age: 'elder',
        hair: 'balding',
        facialHair: 'beard',
        extras: ['walking stick'],
      }),
    ],
    ['mary', as({ headwear: 'mantle', top: 'robe', extras: ['sandals'] })],
  ];

  it('draws each view as its own group, the front as rig 2 draws it', () => {
    for (const [seed, spec] of people) {
      const rig2 = drawFigure(spec, seed, { rig: 2 });
      const rig3 = drawFigure(spec, seed, { rig: VIEW_RIG });
      expect(rig3.rig).toBe(3);
      expect(rig3.views).toEqual(FIGURE_VIEWS.map(viewGroupId));
      expect(rig3.viewBox).toEqual(rig2.viewBox);
      expect(rig3.joints).toEqual(rig2.joints);
      expect(rig3.stride).toEqual(rig2.stride);
      // Take away the other views, the style and clips they add, and the
      // group round the front: rig 2's drawing, byte for byte.
      let svg = rig3.svg;
      for (const view of FIGURE_VIEWS.slice(1))
        svg = svg.replace(groupOf(svg, viewGroupId(view)), '');
      const front = groupOf(svg, viewGroupId('front'));
      svg = svg.replace(
        front,
        front
          .replace(/^<g id="view-front" class="view vq-front">/, '')
          .replace(/<\/g>$/, ''),
      );
      svg = svg
        .replace(
          /<defs>(?:(?!<defs>).)*?<\/defs>(?=<ellipse cx="0" cy="0")/,
          '',
        )
        .replace(/\.vw-3q #view-front.*?(?=<\/style>)/, '');
      expect(svg).toBe(rig2.svg);
    }
  });

  it('gives every view the whole rig, its ids its own', () => {
    for (const [seed, spec] of people) {
      const drawn = drawFigure(spec, seed, {
        rig: VIEW_RIG,
        signs: ['walking', 'tears', 'idea'],
        faces: ['eyes closed'],
      });
      const ids = [...drawn.svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const view of FIGURE_VIEWS) {
        const group = groupOf(drawn.svg, viewGroupId(view));
        const sfx = viewSuffix(view);
        for (const part of [
          'legs',
          'behind',
          'body',
          'arms',
          'head',
          'reach',
          'over',
        ])
          expect(group).toContain(`id="${part}${sfx}"`);
        for (const state of Object.values(drawn.states))
          expect(group).toContain(`id="${state}${sfx}"`);
        expect(group).toContain('class="breathe"');
        expect(group).toContain('class="blink b0"');
        expect(group).toMatch(/class="arm ar"/);
        expect(group).toMatch(/class="arm al"/);
        expect(group).toMatch(/class="leg l0"/);
        expect(group).toMatch(/class="leg l1"/);
      }
    }
  });

  it('speaks with the six mouth shapes from the front, three-quarter and profile, none from behind', () => {
    const drawn = drawFigure(PLAIN_FIGURE, 'talker', { rig: VIEW_RIG });
    for (const view of FIGURE_VIEWS) {
      const group = groupOf(drawn.svg, viewGroupId(view));
      const shapes = [...group.matchAll(/class="vm v(\d)"/g)].map((m) => m[1]);
      if (view === 'back' || view === 'back3q') {
        expect(shapes).toEqual([]);
        // No face at all: no eyes, no mouth.
        for (const face of FIGURE_FACES)
          expect(groupOf(group, `${face}${viewSuffix(view)}`)).toBe(
            `<g id="${face}${viewSuffix(view)}"></g>`,
          );
      } else expect(shapes).toEqual(['0', '1', '2', '3', '4', '5']);
    }
  });

  it('shows the front alone until the stage turns them', () => {
    const drawn = drawFigure(as({ hair: 'long' }), 'still', { rig: VIEW_RIG });
    for (const view of FIGURE_VIEWS.slice(1)) {
      expect(drawn.svg).toContain(
        `<g id="${viewGroupId(view)}" class="view vq-${view}" display="none">`,
      );
      expect(drawn.svg).toContain(`.vw-${view} #view-${view}`);
    }
    // A still of it, drawn by a renderer with no stage, is rig 2's.
    const render = (svg: string) =>
      new Resvg(svg, { fitTo: { mode: 'width', value: 160 } }).render().asPng();
    const rig2 = drawFigure(as({ hair: 'long' }), 'still', { rig: 2 });
    expect(Buffer.compare(render(drawn.svg), render(rig2.svg))).toBe(0);
    // And each view, shown, is drawn.
    for (const view of FIGURE_VIEWS.slice(1))
      expect(
        Buffer.compare(render(viewOnly(drawn.svg, view)), render(rig2.svg)),
      ).not.toBe(0);
  });

  it('keeps the far arm and leg behind the body in profile', () => {
    const drawn = drawFigure(PLAIN_FIGURE, 'side', { rig: VIEW_RIG });
    const profile = groupOf(drawn.svg, viewGroupId('profile'));
    expect(groupOf(profile, 'behind--profile')).toContain('class="arm ar"');
    expect(groupOf(profile, 'arms--profile')).toContain('class="arm al"');
    expect(groupOf(profile, 'arms--profile')).not.toContain('class="arm ar"');
    // The far leg first, the near over it.
    const legs = groupOf(profile, 'legs--profile');
    expect(legs.indexOf('leg l1')).toBeLessThan(legs.indexOf('leg l0'));
  });

  it('swings the same parts in every view, each with its own root', () => {
    const drawn = drawFigure(
      as({ hair: 'ponytail', extras: ['cape'] }),
      'swing',
      { rig: VIEW_RIG },
    );
    const ids = (drawn.dangles ?? []).map((d) => d.id).sort();
    expect(ids).toEqual(['cape', 'pony']);
    for (const one of drawn.dangles ?? []) {
      expect(Object.keys(one.views ?? {}).sort()).toEqual(
        [...FIGURE_VIEWS].sort(),
      );
      expect(one.views?.front?.root).toEqual(one.root);
    }
    const pony = drawn.dangles!.find((d) => d.id === 'pony')!;
    // From the front it hangs at the right of the head; in profile behind it, at the left.
    expect(pony.views!.front.root[0]).toBeGreaterThan(0);
    expect(pony.views!.profile.root[0]).toBeLessThan(0);
    for (const view of FIGURE_VIEWS)
      expect(groupOf(drawn.svg, viewGroupId(view))).toContain('dg-pony-0');
  });

  it('draws a group, someone lying and someone in bed as rig 2 does', () => {
    for (const how of [
      { count: 3 },
      { pose: 'lying' as const },
      { pose: 'in bed' as const },
    ])
      expect(drawFigure(PLAIN_FIGURE, 'x', { ...how, rig: VIEW_RIG })).toEqual(
        drawFigure(PLAIN_FIGURE, 'x', { ...how, rig: 2 }),
      );
  });

  it('draws every hair style and hat from every side', () => {
    for (const hair of HAIR_STYLES)
      for (const headwear of [
        'none',
        hair === 'bob' ? 'nemes' : hair === 'long' ? 'mantle' : 'cap',
      ] as const) {
        const drawn = drawFigure(
          as({ hair, headwear }),
          `${hair}-${headwear}`,
          {
            rig: VIEW_RIG,
          },
        );
        for (const view of FIGURE_VIEWS)
          expect(() =>
            new Resvg(viewOnly(drawn.svg, view), {
              fitTo: { mode: 'width', value: 40 },
            }).render(),
          ).not.toThrow();
      }
  });
});

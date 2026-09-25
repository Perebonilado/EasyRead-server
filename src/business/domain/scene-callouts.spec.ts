import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import {
  anchorOf,
  isolate,
  leaderEnds,
  liftCallouts,
  parseTransform,
  pathEnds,
} from './scene-callouts';
import { byId } from './scene-dom';

const rootOf = (svg: string) =>
  parseDocument(svg, { xmlMode: true }).children.find(
    (n) => (n as Element).name === 'svg',
  ) as Element;

describe('labels lifted out of a drawing', () => {
  it('follows a path through its commands to its last point', () => {
    expect(pathEnds('M10 20 L30 40')).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(pathEnds('m10 20 l5 5 h10 v-3')).toEqual([
      [10, 20],
      [25, 22],
    ]);
    expect(pathEnds('M0 0 C10 10 20 10 30 0 Z')).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(pathEnds('not a path')).toEqual([]);
  });

  it('reads the transforms a drawing is written with, and refuses what it cannot read', () => {
    expect(parseTransform('translate(10 20)')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform('translate(10) scale(2)')).toEqual([
      2, 0, 0, 2, 10, 0,
    ]);
    const turned = parseTransform('rotate(90)')!;
    expect(turned.map((v) => Math.round(v))).toEqual([0, 1, -1, 0, 0, 0]);
    expect(parseTransform('perspective(3)')).toBeNull();
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('finds a leader line wherever its group has moved it', () => {
    const root = rootOf(
      `<svg viewBox="0 0 100 100"><g id="a-label" transform="translate(10 5)"><path d="M0 0 l20 20"/><text x="0" y="0">A</text></g></svg>`,
    );
    expect(leaderEnds(byId(root, 'a-label')!, root)).toEqual([
      [10, 5],
      [30, 25],
    ]);
  });

  it('points from the end of the leader away from the words, unless that end is nowhere near the part', () => {
    const words = { x: 0, y: 0, width: 20, height: 10 };
    const part = { x: 60, y: 60, width: 20, height: 20 };
    expect(
      anchorOf({
        ends: [
          [15, 8],
          [65, 65],
        ],
        words,
        part,
        slack: 5,
      }),
    ).toEqual([65, 65]);
    // A leader that stops short of the part: the part itself, on its near side.
    const [x, y] = anchorOf({
      ends: [
        [15, 8],
        [30, 30],
      ],
      words,
      part,
      slack: 5,
    })!;
    expect(x).toBeGreaterThanOrEqual(60);
    expect(y).toBeGreaterThanOrEqual(60);
    expect(x).toBeLessThan(70);
    expect(
      anchorOf({ ends: [], words: null, part: null, slack: 5 }),
    ).toBeNull();
  });

  it('cuts a drawing down to one group and what it needs to draw', () => {
    const root = rootOf(
      `<svg viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><style>.x{}</style><g id="outer"><rect id="other"/><g id="part"><circle r="1"/></g></g><g id="label"><line x1="0" y1="0" x2="1" y2="1"/><text>hi</text></g></svg>`,
    );
    const part = isolate(root, 'part')!;
    expect(part).toContain('linearGradient');
    expect(part).toContain('<circle');
    expect(part).not.toContain('id="other"');
    expect(part).not.toContain('<text');
    const words = isolate(root, 'label', true)!;
    expect(words).toContain('<text>hi</text>');
    expect(words).not.toMatch(/<line[\s/>]/);
    // The drawing itself is untouched.
    expect(byId(root, 'other')).not.toBeNull();
  });

  it('lifts what it can read and leaves what it cannot', async () => {
    const root = rootOf(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
        <g id="cell"><circle cx="200" cy="150" r="80" fill="#6c6"/></g>
        <g id="cell-label"><line x1="330" y1="60" x2="250" y2="110" stroke="#000"/><text x="335" y="60" font-size="20">cell</text></g>
        <g id="wall"><circle cx="200" cy="150" r="90" fill="none" stroke="#000" stroke-width="4"/></g>
        <g id="wall-label"></g>
      </svg>`,
    );
    const { callouts, lifted, ink, field } = await liftCallouts(
      root,
      {
        parts: { cell: 'cell', wall: 'wall' },
        labels: { cell: 'cell-label', wall: 'wall-label' },
      },
      [0, 0, 400, 300],
    );
    // The part's own box kept too, for the leader to end at its edge.
    expect(callouts).toEqual([
      {
        part: 'cell',
        text: 'cell',
        anchor: [250, 110],
        box: [120, 70, 160, 160],
      },
    ]);
    expect(lifted).toEqual(['cell-label']);
    // Gone from the drawing; the one with no words stays.
    expect(byId(root, 'cell-label')).toBeNull();
    expect(byId(root, 'wall-label')).not.toBeNull();
    // Measured without its label: the ink is the circles alone.
    expect(ink!.x).toBeGreaterThan(100);
    expect(ink!.x + ink!.width).toBeLessThan(300);
    expect(field!.map.cols).toBe(48);
  });
});

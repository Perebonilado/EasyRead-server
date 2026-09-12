import type { Block } from '../../contracts';
import {
  contentBlocks,
  coverageDetail,
  repeatVerified,
  taughtBlocksOf,
  uncoveredBlocks,
} from './coverage';

const page: Block[] = [
  { type: 'headingOne', text: 'Transmission and Vectors' },
  {
    type: 'paragraph',
    text: 'Male and female tsetse flies are obligate bloodsuckers that transmit trypanosomes, which undergo cyclical development in infected flies.',
  },
  {
    type: 'paragraph',
    text: 'With gambiense the main reservoir host is people; pigs and some other animals are also important reservoirs.',
  },
  {
    type: 'paragraph',
    text: 'With rhodesiense the main reservoir hosts are cattle and related animals; transmission is mainly from animals to humans.',
  },
  {
    type: 'paragraph',
    text: 'Mechanical, sexual, and transplacental transmission are also possible.',
  },
  { type: 'paragraph', text: 'Fig. 3' },
  { type: 'paragraph', text: 'Copyright © 2006 Nature Publishing Group' },
  { type: 'paragraph', text: 'Nature Reviews | Microbiology' },
];

describe('the paragraphs of a page', () => {
  it('counts the paragraphs that carry content and leaves the heading, a caption, a copyright and a journal mark out', () => {
    expect(contentBlocks(page).map((block) => block.index)).toEqual([
      1, 2, 3, 4,
    ]);
  });
});

describe('what a script leaves untaught', () => {
  const script =
    'Male and female tsetse flies are obligate bloodsuckers: they transmit trypanosomes, which undergo cyclical development inside infected flies. ' +
    'For gambiense the main reservoir host is people, with pigs and other animals as further reservoirs. ' +
    'For rhodesiense the reservoir hosts are cattle and related animals, and transmission is mainly from animals to humans.';

  it('names the paragraph the script never reaches, quoted', () => {
    const uncovered = uncoveredBlocks({
      blocks: page,
      script,
      taught: new Set(),
    });
    expect(uncovered.map((block) => block.index)).toEqual([4]);
    expect(coverageDetail(uncovered)).toBe(
      'Paragraph 4 is not taught: "Mechanical, sexual, and transplacental transmission are also possible."',
    );
  });

  it("trusts the writer's tag on a paragraph it taught in other words", () => {
    const short =
      'Bites are not the only route: it can also pass in other ways, from mother to child and between partners.';
    expect(
      uncoveredBlocks({ blocks: page, script: short, taught: new Set() }).map(
        (b) => b.index,
      ),
    ).toEqual([1, 2, 3, 4]);
    expect(
      uncoveredBlocks({
        blocks: page,
        script: short,
        taught: taughtBlocksOf([
          { teaches: ['4.0'] },
          { teaches: ['1', '2.1', '3.0'] },
        ]),
      }),
    ).toEqual([]);
  });

  it('exempts a paragraph the plan skipped for a checked reason', () => {
    expect(
      uncoveredBlocks({
        blocks: page,
        script,
        taught: new Set(),
        exempt: new Set([4]),
      }),
    ).toEqual([]);
  });
});

describe('a skip claimed as a repeat', () => {
  const all = contentBlocks(page);
  it('is verified when what came earlier said it, and refused when nothing did', () => {
    const fourth = all.find((block) => block.index === 4)!;
    expect(
      repeatVerified(fourth, all, [
        'The routes other than the bite: mechanical, sexual and transplacental transmission.',
      ]),
    ).toBe(true);
    expect(
      repeatVerified(fourth, all, [
        'The tsetse fly is the vector of sleeping sickness.',
      ]),
    ).toBe(false);
  });
});

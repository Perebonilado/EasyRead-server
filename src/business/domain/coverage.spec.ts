import type { Block } from '../../contracts';
import {
  contentBlocks,
  coverageDetail,
  isFrontMatterPage,
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
      'Paragraph 4 is not taught, the one beginning "Mechanical, sexual, and transplacental transmission are..."',
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

describe('a list item taught in other endings', () => {
  const list: Block[] = [
    { type: 'headingOne', text: 'Major functions' },
    {
      type: 'bullet',
      text: 'Regulation of water and electrolyte balance, with aldosterone.',
    },
    {
      type: 'bullet',
      text: 'Excretion of metabolic waste products (urea, creatinine, uric acid).',
    },
    {
      type: 'bullet',
      text: 'Production of erythropoietin for red blood cell formation.',
    },
  ];
  it('is taught when its first words are said, whatever their endings', () => {
    const script =
      'Its functions include regulating water and electrolyte balance with aldosterone, excreting metabolic waste, and producing erythropoietin.';
    expect(
      uncoveredBlocks({ blocks: list, script, taught: new Set() }),
    ).toEqual([]);
  });
  it('is untaught when only its subject is named', () => {
    const script =
      'Water matters, and so does the blood, but that is another page.';
    expect(
      uncoveredBlocks({ blocks: list, script, taught: new Set() }).map(
        (b) => b.index,
      ),
    ).toEqual([1, 2, 3]);
  });
});

describe('front matter', () => {
  const title: Block[] = [
    { type: 'headingOne', text: 'ADOLESCENT HEALTH MEDICINE' },
    {
      type: 'paragraph',
      text: 'This document is written by Dr. Marcus Sorgwe. It focuses on the health of young people.',
    },
    {
      type: 'paragraph',
      text: 'Adolescents are people aged 10 to 19. Their health needs are unique.',
    },
    {
      type: 'paragraph',
      text: 'The document is for students and health workers who deal with families and young people.',
    },
    {
      type: 'bullet',
      text: 'It describes the different stages of development that adolescents go through.',
    },
    { type: 'paragraph', text: 'The document was published in June 2025.' },
    {
      type: 'paragraph',
      text: 'Dr. Marcus Sorgwe is a consultant family physician at the Department of Family Medicine, NDUTH Okolobiri.',
    },
  ];
  const outline: Block[] = [
    { type: 'headingTwo', text: 'OUTLINE' },
    { type: 'bullet', text: 'BASIC CONCEPTS IN ADOLESCENT HEALTH' },
    { type: 'bullet', text: 'LAWS AND POLICIES IN ADOLESCENT HEALTH' },
    {
      type: 'paragraph',
      text: 'Adolescents are people aged 10 to 19. Their health needs are unique.',
    },
  ];

  it('holds a title slide only to what it teaches, not to its byline or what it says about the document', () => {
    expect(
      contentBlocks(title, { frontMatter: true }).map((block) => block.index),
    ).toEqual([2]);
    expect(isFrontMatterPage(1, title)).toBe(true);
    expect(isFrontMatterPage(7, outline)).toBe(true);
    expect(isFrontMatterPage(7, title)).toBe(false);
  });

  it('never asks for an outline item or a byline, on any page', () => {
    expect(contentBlocks(outline).map((block) => block.index)).toEqual([3]);
    expect(contentBlocks(title).map((block) => block.index)).toEqual([2, 3, 4]);
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

import { NOTES_RULE, readingOrder, type TextRun } from './reading-order';

/** A line of text as runs: one run a line, at a left edge and a baseline. */
const run = (
  x: number,
  y: number,
  str: string,
  width = str.length * 5,
  height = 10,
): TextRun => ({
  x,
  y,
  width,
  height,
  str,
});

describe('a page in reading order', () => {
  it('reads a single column line by line', () => {
    expect(
      readingOrder([
        run(50, 700, 'The first line of the page.'),
        run(50, 686, 'And the second one.'),
      ]),
    ).toBe('The first line of the page.\nAnd the second one.');
  });

  it('reads two columns down the left, then the right, joining broken words', () => {
    // Two columns of four lines, side by side on the same baselines.
    const left = [
      'approached, and bowed low',
      'before him, saying, “Lord,',
      'if you are willing, you can',
      'make me clean.”',
    ];
    const right = [
      'man under authority, with sol-',
      'diers under me. I say to this',
      'one, ‘Go’ and he goes, and',
      'to another ‘Come.’',
    ];
    const runs = [
      ...left.map((line, i) => run(40, 700 - i * 14, line, 250)),
      ...right.map((line, i) => run(320, 700 - i * 14, line, 250)),
    ];
    expect(readingOrder(runs)).toBe(
      [
        'approached, and bowed low',
        'before him, saying, “Lord,',
        'if you are willing, you can',
        'make me clean.”',
        'man under authority, with soldiers under me. I say to this',
        'one, ‘Go’ and he goes, and',
        'to another ‘Come.’',
      ].join('\n'),
    );
  });

  it('keeps a heading across both columns where it stands, a band on each side', () => {
    const runs = [
      run(40, 720, 'Left above one.', 250),
      run(320, 720, 'Right above one.', 250),
      run(40, 706, 'Left above two.', 250),
      run(320, 706, 'Right above two.', 250),
      run(
        40,
        690,
        'A heading that runs across the whole width of the page',
        530,
      ),
      run(40, 674, 'Left below one.', 250),
      run(320, 674, 'Right below one.', 250),
      run(40, 660, 'Left below two.', 250),
      run(320, 660, 'Right below two.', 250),
    ];
    expect(readingOrder(runs).split('\n')).toEqual([
      'Left above one.',
      'Left above two.',
      'Right above one.',
      'Right above two.',
      'A heading that runs across the whole width of the page',
      'Left below one.',
      'Left below two.',
      'Right below one.',
      'Right below two.',
    ]);
  });

  it('puts the notes set smaller under the body after it, behind a rule', () => {
    const runs = [
      run(40, 700, 'Body left one.', 250),
      run(320, 700, 'Body right one.', 250),
      run(40, 686, 'Body left two.', 250),
      run(320, 686, 'Body right two.', 250),
      run(40, 672, 'Body left three.', 250),
      run(320, 672, 'Body right three.', 250),
      run(40, 658, 'Body left four.', 250),
      run(320, 658, 'Body right four.', 250),
      run(40, 300, 'tn A note on the left.', 250, 7),
      run(320, 300, 'sn A note on the right.', 250, 7),
      run(40, 290, 'tn Its second line.', 250, 7),
      run(320, 290, 'sn Its second line too.', 250, 7),
    ];
    const text = readingOrder(runs);
    const [body, notes] = text.split(`\n\n${NOTES_RULE}\n`);
    expect(body.split('\n')).toEqual([
      'Body left one.',
      'Body left two.',
      'Body left three.',
      'Body left four.',
      'Body right one.',
      'Body right two.',
      'Body right three.',
      'Body right four.',
    ]);
    expect(notes).toContain('tn A note on the left.');
  });

  it('leaves a table of short cells as rows', () => {
    const runs = [0, 1, 2, 3, 4].flatMap((i) => [
      run(40, 700 - i * 14, `Item ${i}`, 40),
      run(320, 700 - i * 14, `${i * 10}`, 15),
    ]);
    expect(readingOrder(runs).split('\n')[0]).toBe('Item 0 0');
  });
});

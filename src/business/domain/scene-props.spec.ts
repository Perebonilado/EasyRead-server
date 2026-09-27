import {
  PAGE_PROPS,
  PROP_KIND,
  PROP_LOOSE,
  PROP_WORDS,
  STAGE_PROPS,
  drawProp,
  propsIn,
} from './scene-props';
import { FIGURE_GEAR } from './scene-figure';
import { THINGS, THING_WORDS } from './scene-doings';

describe('the one list of things', () => {
  it('draws every thing in the kit’s hand, standing on its base, held and bitten inside it', () => {
    for (const prop of STAGE_PROPS) {
      const drawn = drawProp(prop);
      const [x, y, w, h] = drawn.viewBox;
      expect(drawn.svg).toContain(`viewBox="${drawn.viewBox.join(' ')}"`);
      // Its base rests on the ground at y = 0, with room for its outline.
      expect(y + h).toBeGreaterThanOrEqual(0);
      expect(y + h).toBeLessThanOrEqual(6);
      for (const point of [drawn.grip, drawn.mouth, drawn.bite]) {
        expect(point[0]).toBeGreaterThanOrEqual(x);
        expect(point[0]).toBeLessThanOrEqual(x + w);
        expect(point[1]).toBeGreaterThanOrEqual(y);
        expect(point[1]).toBeLessThanOrEqual(y + h);
      }
      expect(PROP_KIND[prop]).toBeDefined();
      expect(PROP_LOOSE[prop].bounce).toBeGreaterThanOrEqual(0);
    }
  });

  it('knows each by its words, and keeps only gear drawn in a hand', () => {
    const said: [string, string][] = [
      ['Maya throws the ball for Pip.', 'ball'],
      ['Pip chews on a bone.', 'bone'],
      ["Pip chews Maya's shoe.", 'shoe'],
      ['Tobi finds a stick.', 'stick'],
      ['A tuft of white fur!', 'fur'],
      ['Tobi picks up the chewed red pepper.', 'pepper'],
      ['She drops her keys.', 'key'],
      ['A parcel on the step.', 'box'],
      ['He hugs his teddy.', 'toy'],
      ['A ripe tomato rolls away.', 'tomato'],
    ];
    for (const [words, thing] of said)
      expect([
        words,
        PROP_WORDS[thing as keyof typeof PROP_WORDS].test(words),
      ]).toEqual([words, true]);
    // A walking stick is a staff, drawn in the hand for good.
    expect(PROP_WORDS.stick.test('He leans on his walking stick.')).toBe(false);
    expect(THING_WORDS.staff.test('He leans on his walking stick.')).toBe(true);
    expect(THINGS).toEqual([...STAGE_PROPS, ...FIGURE_GEAR]);
    expect(STAGE_PROPS).toEqual(
      expect.arrayContaining(['ball', 'book', 'bag', 'magnifier', 'lantern']),
    );
  });

  it('sets on a book’s page only the table’s things, as it always did', () => {
    expect(
      propsIn([
        'He took the bread and the cup, and read from a book by the ball court.',
      ]),
    ).toEqual(['bread', 'cup']);
    expect(PAGE_PROPS.every((p) => STAGE_PROPS.includes(p))).toBe(true);
    // A Studio scene may ask for any.
    expect(propsIn(['She threw the ball.'], STAGE_PROPS)).toEqual(['ball']);
  });

  it('bounces a ball and rolls it, and lets a bag hang', () => {
    expect(PROP_LOOSE.ball).toEqual({ bounce: 2, rolls: true, spins: true });
    expect(PROP_LOOSE.cup.bounce).toBe(0);
    expect(PROP_LOOSE.bag.hangs).toBe(true);
  });
});

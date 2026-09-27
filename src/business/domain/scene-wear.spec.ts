import { PLAIN_FIGURE, type FigureSpec } from './scene-figure';
import { noTallerThan, CARRIED_CLOTHES } from './scene-props';
import {
  colourIn,
  isWearable,
  outfitWords,
  putOn,
  sameOutfit,
  takeOff,
  undressedFor,
  wearableOf,
} from './scene-wear';

/** Tobi as the cast has him: a blue school uniform, grey trousers, a backpack. */
const tobi: FigureSpec = {
  ...PLAIN_FIGURE,
  age: 'child',
  top: 'uniform',
  topColour: 'blue',
  bottom: 'trousers',
  bottomColour: 'grey',
  accentColour: 'red',
  extras: ['backpack'],
};

describe('what people wear', () => {
  it('knows each thing worn by its last word, and where the kit draws it', () => {
    expect(wearableOf('uniform')).toEqual({ slot: 'top', kit: 'uniform' });
    expect(wearableOf('his new school uniform')).toEqual({
      slot: 'top',
      kit: 'uniform',
    });
    expect(wearableOf('lab coat')).toEqual({ slot: 'top', kit: 'lab coat' });
    expect(wearableOf('raincoat')).toEqual({ slot: 'top', kit: 'coat' });
    expect(wearableOf('woolly hat')).toEqual({
      slot: 'headwear',
      kit: 'beanie',
    });
    expect(wearableOf('scarf')).toEqual({ slot: 'extras', kit: 'scarf' });
    // Wrapped round someone, a blanket is worn as a cloak.
    expect(wearableOf('blanket')).toEqual({ slot: 'extras', kit: 'cloak' });
    expect(wearableOf('school clothes')).toEqual({ slot: 'outfit', kit: null });
    expect(wearableOf('shoes')).toEqual({ slot: 'none', kit: null });
    expect(wearableOf('cup')).toBeNull();
    expect(wearableOf('bag')).toBeNull();
    expect(isWearable('uniform')).toBe(true);
    expect(isWearable('kite')).toBe(false);
  });

  it('dresses someone in what they put on, back in their usual clothes when it is theirs', () => {
    const pyjamas = undressedFor(tobi, true);
    expect(pyjamas).toMatchObject({
      top: 'pyjamas',
      topColour: 'red',
      bottom: 'trousers',
      bottomColour: 'red',
      extras: [],
    });
    // Putting on his own uniform: dressed as he always is, backpack and all.
    expect(putOn(pyjamas, tobi, wearableOf('uniform')!)).toEqual(tobi);
    expect(putOn(pyjamas, tobi, wearableOf('clothes')!)).toEqual(tobi);
    // Something new, in the colour its look says.
    expect(putOn(tobi, tobi, wearableOf('coat')!, 'yellow')).toMatchObject({
      top: 'coat',
      topColour: 'yellow',
      bottom: 'trousers',
    });
    expect(putOn(tobi, tobi, wearableOf('hat')!, 'green')).toMatchObject({
      headwear: 'sun hat',
      accentColour: 'green',
    });
    // Shoes change nothing the kit draws.
    expect(putOn(tobi, tobi, wearableOf('shoes')!)).toEqual(tobi);
  });

  it('takes off only what they have on', () => {
    const hatted = { ...tobi, headwear: 'cap' as const };
    expect(takeOff(hatted, wearableOf('cap')!)).toMatchObject({
      headwear: 'none',
    });
    expect(takeOff(tobi, wearableOf('uniform')!)).toMatchObject({
      top: 't-shirt',
    });
    expect(takeOff(tobi, wearableOf('backpack')!).extras).toEqual([]);
    expect(takeOff(tobi, wearableOf('hat')!)).toEqual(tobi);
  });

  it('says what someone wears, and whether two are dressed alike', () => {
    expect(outfitWords(tobi)).toBe(
      'a blue uniform and grey trousers, with backpack',
    );
    expect(outfitWords(undressedFor(tobi, true))).toBe('red pyjamas');
    expect(sameOutfit(tobi, { ...tobi, extras: ['backpack'] })).toBe(true);
    expect(sameOutfit(tobi, undressedFor(tobi, false))).toBe(false);
    expect(colourIn('his bright red coat')).toBe('red');
    expect(colourIn('a gray hat')).toBe('grey');
  });

  it('draws clothes carried no taller than a hand carries them', () => {
    const uniform = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-83.5 -223 166.9 226"><rect x="-80" y="-220" width="160" height="220"/></svg>',
      viewBox: [-83.5, -223, 166.9, 226] as [number, number, number, number],
      grip: [0, -120] as [number, number],
      mouth: [0, -200] as [number, number],
      bite: [0, -120] as [number, number],
    };
    const carried = noTallerThan(uniform, CARRIED_CLOTHES);
    expect(Math.max(carried.viewBox[2], carried.viewBox[3])).toBeCloseTo(
      CARRIED_CLOTHES,
      0,
    );
    expect(carried.svg).toMatch(/viewBox="-26\.6 -71 53\.2 72"/);
    expect(carried.svg).toMatch(/<g transform="scale\(0\.319\)"><rect/);
    expect(carried.grip).toEqual([0, -38.2]);
    // Small already: as it was.
    expect(noTallerThan(uniform, 300)).toBe(uniform);
  });
});

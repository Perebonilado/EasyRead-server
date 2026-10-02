import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import {
  ICON_NAMES,
  iconInline,
  iconOf,
  iconPaths,
  iconSymbol,
  iconUse,
  isIconName,
} from './scene-icon-set';
import { sanitizeTree } from './scene-svg';

describe('the infographic icons', () => {
  it('reads what a unit chart counts as its icon, or nothing', () => {
    expect(iconOf('soldier')).toBe('soldier');
    expect(iconOf('troops')).toBe('soldier');
    expect(iconOf('Votes')).toBe('ballot');
    expect(iconOf('school pupils')).toBe('child');
    expect(iconOf('oil barrels')).toBe('barrel');
    expect(iconOf('money')).toBe('coin');
    expect(iconOf('newspapers')).toBe('paper');
    expect(iconOf('kingdoms')).toBe('crown');
    expect(iconOf('unicorns')).toBeNull();
    expect(iconOf('')).toBeNull();
    expect(isIconName('ship')).toBe(true);
    expect(isIconName('gun')).toBe(false);
  });

  it('holds nothing that is a weapon or a faith', () => {
    for (const name of ICON_NAMES)
      expect(name).not.toMatch(
        /gun|rifle|sword|bomb|church|mosque|temple|cross$/,
      );
  });

  it('draws each icon as paths in a box of 100, and nothing the sanitiser removes', () => {
    for (const name of ICON_NAMES) {
      const paths = iconPaths(name);
      expect(paths).toMatch(/^(<path d="[^"]+"( fill-rule="evenodd")?\/>)+$/);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${iconSymbol(name)}</defs>${iconUse(name, 0, 0, 100, '#0050BE')}${iconInline(name, 0, 0, 50, '#BB7907')}</svg>`;
      const root = parseDocument(svg, { xmlMode: true }).children[0] as Element;
      expect(sanitizeTree(root)).toEqual([]);
    }
  });

  it('uses an icon by reference, coloured where it is used', () => {
    expect(iconUse('coin', 10, 20, 50, '#BB7907')).toBe(
      '<use href="#i-coin" x="10" y="20" width="50" height="50" fill="#BB7907"/>',
    );
  });
});

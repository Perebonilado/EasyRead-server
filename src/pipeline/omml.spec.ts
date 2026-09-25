import { equationsIn } from './omml';
import { slideText } from './slides';

const M =
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;

describe("Office's maths, as LaTeX", () => {
  it('reads powers, fractions, roots, brackets and big operators', () => {
    const xml = `<root ${M}>
      <m:oMath>
        <m:sSup><m:e>${run('x')}</m:e><m:sup>${run('2')}</m:sup></m:sSup>${run('+3x=10')}
      </m:oMath>
      <m:oMath>
        <m:f><m:num>${run('a')}</m:num><m:den>${run('b')}</m:den></m:f>${run('×')}
        <m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run('16')}</m:e></m:rad>
      </m:oMath>
      <m:oMath>
        <m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run('i=1')}</m:sub><m:sup>${run('n')}</m:sup><m:e>${run('i')}</m:e></m:nary>
        <m:d><m:e>${run('x+1')}</m:e></m:d>
      </m:oMath>
    </root>`;
    expect(equationsIn(xml)).toEqual([
      '{x}^{2}+3x=10',
      '\\frac{a}{b}\\times \\sqrt{16}',
      '\\sum_{i=1}^{n}{i}\\left(x+1\\right)',
    ]);
  });

  it("puts a slide's equation where it stands in its paragraph, and passes over the picture kept for older readers", () => {
    const xml = `<p:sld xmlns:a="a" xmlns:p="p" xmlns:mc="mc" xmlns:a14="a14" ${M}>
      <a:p><a:r><a:t>Solve </a:t></a:r>
        <mc:AlternateContent>
          <mc:Choice Requires="a14"><a14:m><m:oMath><m:sSup><m:e>${run('x')}</m:e><m:sup>${run('2')}</m:sup></m:sSup>${run('=9')}</m:oMath></a14:m></mc:Choice>
          <mc:Fallback><a:r><a:t>x2=9</a:t></a:r></mc:Fallback>
        </mc:AlternateContent>
        <a:r><a:t> for x.</a:t></a:r></a:p>
      <a:p><a:r><a:t>Next &amp; last</a:t></a:r></a:p>
    </p:sld>`;
    expect(slideText(xml)).toBe('Solve ${x}^{2}=9$ for x.\nNext & last');
  });
});

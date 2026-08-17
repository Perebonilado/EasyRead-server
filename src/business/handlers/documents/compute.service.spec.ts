import { ComputeService } from './compute.service';

/**
 * The security cases matter most: the expression comes from a model, so the
 * functions that can extend or escape the evaluator must throw *inside an
 * expression*, not just when called from JS.
 */
describe('ComputeService', () => {
  const service = new ComputeService();

  it('does plain arithmetic', () => {
    expect(service.evaluate('2^10')).toEqual({ ok: true, result: '1024' });
  });

  it('handles units', () => {
    // mathjs spells micrograms `ug` (or `microgram`), not `mcg`, and
    // auto-simplifies the product.
    const result = service.evaluate('150 ug/kg * 70 kg');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result).toBe('10.5 mg');
  });

  it('applies a scope', () => {
    expect(service.evaluate('a * b + 2', { a: 3, b: 4 })).toEqual({
      ok: true,
      result: '14',
    });
  });

  it('rejects division by zero as non-finite', () => {
    const result = service.evaluate('1/0');
    expect(result.ok).toBe(false);
  });

  it('rejects syntax errors', () => {
    const result = service.evaluate('2 +* 3');
    expect(result.ok).toBe(false);
  });

  it('rejects import() inside an expression', () => {
    const result = service.evaluate(
      'import({ hack: f(x) = x }, { override: true })',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('disabled');
  });

  it('rejects createUnit() inside an expression', () => {
    const result = service.evaluate('createUnit("gadget", "5 cm")');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('disabled');
  });

  it('rejects reflective evaluate/parse inside an expression', () => {
    for (const expression of [
      'evaluate("2+3")',
      'parse("2+3")',
      'compile("2+3")',
    ]) {
      const result = service.evaluate(expression);
      expect(result.ok).toBe(false);
    }
  });

  it('still evaluates normally after a rejected attempt', () => {
    service.evaluate('createUnit("x", "1 cm")');
    expect(service.evaluate('6 * 7')).toEqual({ ok: true, result: '42' });
  });
});

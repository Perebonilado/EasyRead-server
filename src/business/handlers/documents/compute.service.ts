import { Injectable } from '@nestjs/common';
import { create, all, type MathJsInstance } from 'mathjs';

export type ComputeResult =
  { ok: true; result: string } | { ok: false; error: string };

/**
 * Verified arithmetic for the tutor: the model requests a computation and
 * narrates the result — it never does arithmetic itself.
 *
 * The expression comes from a model, so the instance is locked down using
 * the pattern from mathjs's own security documentation: capture a reference
 * to `evaluate`, then override the functions that can extend or escape the
 * evaluator (`import`, `createUnit`, and the reflective evaluate/parse
 * family) so an *expression* that calls them throws, while the captured
 * outer reference keeps working. Everything numeric — units, constants,
 * ordinary functions — stays available.
 */
@Injectable()
export class ComputeService {
  private readonly math: MathJsInstance;
  private readonly locked: (
    expression: string,
    scope: Record<string, number>,
  ) => unknown;
  private readonly parseTex: (expression: string) => string;

  constructor() {
    this.math = create(all);
    const evaluate = this.math.evaluate.bind(this.math) as (
      expression: string,
      scope: Record<string, number>,
    ) => unknown;
    this.locked = (expression, scope) => evaluate(expression, scope);
    // parse without evaluating is safe; captured for LaTeX conversion only.
    const parse = this.math.parse.bind(this.math) as (expression: string) => {
      toTex(): string;
    };
    this.parseTex = (expression) => parse(expression).toTex();

    const disabled = (name: string) => () => {
      throw new Error(`Function ${name} is disabled`);
    };
    this.math.import(
      {
        import: disabled('import'),
        createUnit: disabled('createUnit'),
        evaluate: disabled('evaluate'),
        parse: disabled('parse'),
        simplify: disabled('simplify'),
        derivative: disabled('derivative'),
        compile: disabled('compile'),
        reviver: disabled('reviver'),
        resolve: disabled('resolve'),
      },
      { override: true },
    );
  }

  evaluate(expression: string, scope?: Record<string, number>): ComputeResult {
    try {
      const value = this.locked(expression, { ...scope });
      // mathjs answers 1/0 with Infinity rather than throwing; for a tutor
      // about to say a number aloud, "not a finite number" is the honest
      // reply.
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return { ok: false, error: 'The result is not a finite number' };
      }
      return {
        ok: true,
        result: this.math.format(value, { precision: 14 }),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * `expression = result` as display LaTeX for the board, or null when
   * either side won't parse — the board item is optional decoration on top
   * of the spoken result, never worth failing over.
   */
  toTex(expression: string, result: string): string | null {
    try {
      return `${this.parseTex(expression)} = ${this.parseTex(result)}`;
    } catch {
      return null;
    }
  }
}

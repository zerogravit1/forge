import { describe, expect, it } from 'vitest';
import { discoverImports, resolveTestDependencies } from './vitest-dependencies.js';

describe('discoverImports', () => {
  it('returns the imports declared in a source file', () => {
    const source = `
    import { calculatorOrder } from './order-service.js';
    import { validateOrder } from './order-validator.js';
    `;

    expect(discoverImports(source)).toEqual([
      './order-service.js',
      './order-validator.js'
    ]);
  });
});
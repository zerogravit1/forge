import { describe, expect, it } from 'vitest';
import { discoverImports, resolveImportPath, resolveTestDependencies, type ModuleImports } from './vitest-dependencies.js';

const testFiles = ['src/orders/order-service.test.ts'];

const modules: ModuleImports[] = [
  {
    file: 'src/orders/order-service.test.ts',
    imports: ['src/orders/order-service.ts'],
  },
  {
    file: 'src/orders/order-service.ts',
    imports: ['src/orders/order-validator.ts'],
  },
  {
    file: 'src/orders/order-validator.ts',
    imports: [],
  },
];

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

describe('resolveTestDependencies', () => {
  it('returns a test file and dependencies', () => {
    expect(resolveTestDependencies(testFiles, modules)).toEqual(
      [{
        dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
        testFile: 'src/orders/order-service.test.ts'
      }]
    );
  });

  it('resolves circular dependencies without duplicate files', () => {
    const modules: ModuleImports[] = [
      {
        file: 'src/orders/order-service.test.ts',
        imports: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-service.ts',
        imports: ['src/orders/order-validator.ts'],
      },
      {
        file: 'src/orders/order-validator.ts',
        imports: ['src/orders/order-service.ts'],
      },
    ];

    expect(resolveTestDependencies(testFiles, modules)).toEqual(
      [{
        dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
        testFile: 'src/orders/order-service.test.ts'
      }]
    );
  });
});

describe('resolveImportPath', () => {
  it('resolves a JavaScript import to its TypeScript source file', () => {
    const result = resolveImportPath(
      'src/cli.test.ts',
      './cli.js'
    );

    expect(result).toBeDefined();
    expect(result).toMatch(/src[/\\]cli\.ts$/);
  });

  it('returns undefined when an imported module cannot be resolved', () => {
    const result = resolveImportPath(
      'src/cli.test.ts',
      './does-not-exist.js'
    );

    expect(result).toBeUndefined();
  });
});
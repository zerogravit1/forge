import { describe, expect, it } from 'vitest';

import { resolveTestDependencies } from './resolve-test-dependencies.js';
import type { ModuleImports } from '../analyzers/typescript/typescript-dependencies.js';

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

describe('resolveTestDependencies', () => {
  it('returns a test file and dependencies', () => {
    expect(resolveTestDependencies(testFiles, modules)).toEqual([
      {
        dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
        testFile: 'src/orders/order-service.test.ts',
      },
    ]);
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

    expect(resolveTestDependencies(testFiles, modules)).toEqual([
      {
        dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
        testFile: 'src/orders/order-service.test.ts',
      },
    ]);
  });

  it('returns dependencies for multiple tests importing the same module', () => {
    const testFiles = ['src/orders/order-service.test.ts', 'src/orders/order-controller.test.ts'];

    const modules: ModuleImports[] = [
      {
        file: 'src/orders/order-service.test.ts',
        imports: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-controller.test.ts',
        imports: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-service.ts',
        imports: [],
      },
    ];

    expect(resolveTestDependencies(testFiles, modules)).toEqual([
      {
        testFile: 'src/orders/order-service.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
      {
        testFile: 'src/orders/order-controller.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
    ]);
  });

  it('propagates unresolved imports from indirect dependencies', () => {
    const modules = [
      {
        file: 'src/example.test.ts',
        imports: ['src/service.ts'],
      },
      {
        file: 'src/service.ts',
        imports: [],
        unresolvedImports: ['./missing.js'],
      },
    ];

    const result = resolveTestDependencies(['src/example.test.ts'], modules);

    expect(result[0]).toMatchObject({
      testFile: 'src/example.test.ts',
      unresolvedImports: [
        {
          file: 'src/service.ts',
          specifier: './missing.js',
        },
      ],
    });
  });
});
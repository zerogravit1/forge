import { describe, expect, it } from 'vitest';

import { resolveTestDependencies } from './resolve-test-dependencies.js';
import type { ModuleDependency } from '../models/module-dependency.js';

const testFiles = ['src/orders/order-service.test.ts'];

const modules: ModuleDependency[] = [
  {
    file: 'src/orders/order-service.test.ts',
    dependencies: ['src/orders/order-service.ts'],
  },
  {
    file: 'src/orders/order-service.ts',
    dependencies: ['src/orders/order-validator.ts'],
  },
  {
    file: 'src/orders/order-validator.ts',
    dependencies: [],
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
    const modules: ModuleDependency[] = [
      {
        file: 'src/orders/order-service.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-service.ts',
        dependencies: ['src/orders/order-validator.ts'],
      },
      {
        file: 'src/orders/order-validator.ts',
        dependencies: ['src/orders/order-service.ts'],
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

    const modules: ModuleDependency[] = [
      {
        file: 'src/orders/order-service.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-controller.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-service.ts',
        dependencies: [],
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
        dependencies: ['src/service.ts'],
      },
      {
        file: 'src/service.ts',
        dependencies: [],
        unresolvedDependencies: ['./missing.js'],
      },
    ];

    const result = resolveTestDependencies(['src/example.test.ts'], modules);

    expect(result[0]).toMatchObject({
      testFile: 'src/example.test.ts',
      unresolvedDependencies: [
        {
          file: 'src/service.ts',
          specifier: './missing.js',
        },
      ],
    });
  });

  it('isolates shared module dependencies by test root', () => {
    const projectA = 'src/project-a/ui/service.test.ts';
    const projectB = 'src/project-b/ui/service.test.ts';
    const shared = 'src/shared/service.ts';

    const valueA = 'src/project-a/ui/value.ts';
    const valueB = 'src/project-b/ui/value.ts';

    const modules = [
      // Project A dependency graph
      {
        file: projectA,
        testRoot: projectA,
        dependencies: [shared],
      },
      {
        file: shared,
        testRoot: projectA,
        dependencies: [valueA],
      },
      {
        file: valueA,
        testRoot: projectA,
        dependencies: [],
      },

      // Project B dependency graph
      {
        file: projectB,
        testRoot: projectB,
        dependencies: [shared],
      },
      {
        file: shared,
        testRoot: projectB,
        dependencies: [valueB],
      },
      {
        file: valueB,
        testRoot: projectB,
        dependencies: [],
      },
    ];

    const result = resolveTestDependencies([projectA, projectB], modules);

    expect(result).toEqual([
      {
        testFile: projectA,
        dependencies: [shared, valueA],
      },
      {
        testFile: projectB,
        dependencies: [shared, valueB],
      },
    ]);
  });
});

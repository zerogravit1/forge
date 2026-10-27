import { describe, expect, it } from 'vitest';
import { selectTests } from './select-tests.js';
import type { TestDependency } from '../models/test-dependency.js';
import type { GitChange } from '../changes/git-changes.js';

const changedFiles: GitChange[] = [{ status: 'modified', path: 'src/orders/order-service.ts' }];

const testDependencies: TestDependency[] = [
  {
    testFile: 'src/orders/order-service.test.ts',
    dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
  },
  {
    testFile: 'src/users/user-service.test.ts',
    dependencies: ['src/users/user-service.ts'],
  },
];

describe('selectTests', () => {
  it('selects the test file to execute', () => {
    expect(selectTests(changedFiles, testDependencies)).toEqual({
      selectedTests: ['src/orders/order-service.test.ts'],
      unmappedChanges: [],
    });
  });

  it('selects a test only once when multiple dependencies change', () => {
    const changes: GitChange[] = [
      { status: 'modified', path: 'src/orders/order-service.ts' },
      { status: 'modified', path: 'src/orders/order-validator.ts' },
    ];

    expect(selectTests(changes, testDependencies)).toEqual({
      selectedTests: ['src/orders/order-service.test.ts'],
      unmappedChanges: [],
    });
  });

  it('selects a test when the test file itself changes', () => {
    const changes: GitChange[] = [
      {
        status: 'modified',
        path: 'src/orders/order-service.test.ts',
      },
    ];

    expect(selectTests(changes, testDependencies)).toEqual({
      selectedTests: ['src/orders/order-service.test.ts'],
      unmappedChanges: [],
    });
  });

  it('returns a changed file with no known dependency mapping', () => {
    const changes: GitChange[] = [
      {
        status: 'modified',
        path: 'src/orders/untested-service.ts',
      },
    ];

    expect(selectTests(changes, testDependencies)).toEqual({
      selectedTests: [],
      unmappedChanges: [
        {
          status: 'modified',
          path: 'src/orders/untested-service.ts',
        },
      ],
    });
  });

  it('reports unmapped changes alongside selected tests', () => {
    const changes: GitChange[] = [
      { status: 'modified', path: 'src/orders/order-service.ts' },
      { status: 'added', path: 'src/orders/inventory-service.ts' },
    ];

    expect(selectTests(changes, testDependencies)).toEqual({
      selectedTests: ['src/orders/order-service.test.ts'],
      unmappedChanges: [{ status: 'added', path: 'src/orders/inventory-service.ts' }],
    });
  });

  it('selects test with unresolved dependencies as a precaution', () => {
    const changes: GitChange[] = [
      { status: 'modified', path: 'src/orders/another-service.ts' },
    ];

    const dependencies: TestDependency[] = [
      {
        testFile: 'src/orders/order-service.test.ts',
        dependencies: ['src/orders/order-service.ts'],
        unresolvedImports: [
          {
            file: 'src/orders/order-service.ts',
            specifier: './missing.js',
          },
        ],
      },
    ];

    expect(selectTests(changes, dependencies)).toEqual({
      selectedTests: ['src/orders/order-service.test.ts'],
      unmappedChanges: [{ status: 'modified', path: 'src/orders/another-service.ts' }],
    });
  });
});

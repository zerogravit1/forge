import { describe, expect, it } from 'vitest';
import { selectTests, type TestDependency } from './select-tests.js';
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
});

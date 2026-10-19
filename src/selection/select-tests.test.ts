import { describe, expect, it } from 'vitest';
import { selectTests, type TestDependency } from './select-tests.js';
import type { GitChange } from '../changes/git-changes.js';

const changedFiles: GitChange[] = [
  { status: 'modified', path: 'src/orders/order-service.ts'}
];

const testDependencies: TestDependency[] = [
  {
    testFile: 'src/orders/order-service.test.ts',
    dependencies: [
      'src/orders/order-service.ts',
      'src/orders/order-validator.ts',
    ],
  },
  {
    testFile: 'src/users/user-service.test.ts',
    dependencies: ['src/users/user-service.ts'],
  },
];

describe('selectTests', () => {
  it('returns the test file to execute', () => {
    expect(selectTests(changedFiles, testDependencies)).toEqual(['src/orders/order-service.test.ts']);
  });
});
import { describe, expect, it } from 'vitest';

import { reconcileSpecifications } from './vitest-results.js';

describe('reconcileSpecifications', () => {
  it('reconciles completed runtime and typecheck specifications for the same file', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [
      { taskId: 'runtime-id', moduleId: file },
      { taskId: 'typecheck-id', moduleId: file },
    ];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'passed',
      },
      {
        id: 'typecheck-id',
        moduleId: file,
        state: () => 'passed',
      }
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: [],
      duplicates: [],
      incomplete: [],
    });
  });

  it('detects a missing typecheck specificiation', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [
      { taskId: 'runtime-id', moduleId: file },
      { taskId: 'typecheck-id', moduleId: file },
    ];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'passed',
      },
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result.missing).toEqual(['typecheck-id']);
  });

  it('returns an expected specification id', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [
      { taskId: 'runtime-id', moduleId: file },
    ];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'passed',
      },
      {
        id: 'typecheck-id',
        moduleId: file,
        state: () => 'passed',
      }
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result.unexpected).toEqual(['typecheck-id']);
  });

  it('detects duplicate expected specifications IDs', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [
      { taskId: 'runtime-id', moduleId: file },
      { taskId: 'runtime-id', moduleId: file },
    ];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'passed',
      }
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result.duplicates).toEqual(['runtime-id']);
  });

  it('returns a incomplete specification id', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [
      { taskId: 'runtime-id' },
    ];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'pending',
      }
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result.incomplete).toEqual(['runtime-id']);
  });
});
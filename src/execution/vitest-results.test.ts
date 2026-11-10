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
      },
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: [],
      duplicates: [],
      incomplete: [],
    });
  });

  it('detects a missing typecheck specification', () => {
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

    expect(result).toEqual({
      missing: ['typecheck-id'],
      unexpected: [],
      duplicates: [],
      incomplete: [],
    });
  });

  it('returns an expected specification id', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [{ taskId: 'runtime-id', moduleId: file }];

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
      },
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: ['typecheck-id'],
      duplicates: [],
      incomplete: [],
    });
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
      },
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: [],
      duplicates: ['runtime-id'],
      incomplete: [],
    });
  });

  it('detects duplicate actual specifications IDs', () => {
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
        id: 'runtime-id',
        moduleId: file,
        state: () => 'passed'
      }
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: [],
      duplicates: ['runtime-id'],
      incomplete: [],
    });
  });

  it('returns an incomplete specification id', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [{ taskId: 'runtime-id' }];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'pending',
      },
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: [],
      duplicates: [],
      incomplete: ['runtime-id'],
    });
  });

  it('detects a queued specification id as incomplete', () => {
    const file = '/repo/tests/Types.test.ts';

    const expected = [{ taskId: 'runtime-id', moduleId: file }];

    const actual = [
      {
        id: 'runtime-id',
        moduleId: file,
        state: () => 'queued',
      },
    ];

    const result = reconcileSpecifications(expected, actual);

    expect(result).toEqual({
      missing: [],
      unexpected: [],
      duplicates: [],
      incomplete: ['runtime-id'],
    });
  });
});

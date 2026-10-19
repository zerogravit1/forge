import { describe, expect, it } from 'vitest';
import { readCliOptions } from './cli-options.js';

describe('readCliOptions', () => {
  it('uses default revisions', () => {
    expect(readCliOptions(['plan'])).toEqual({
      command: 'plan',
      from: 'HEAD~1',
      to: 'HEAD',
      mergeBase: false,
    });
  });

  it('accepts explicit revisions', () => {
    expect(readCliOptions(['plan', '--from', 'main', '--to', 'develop'])).toMatchObject({
      from: 'main',
      to: 'develop',
    });
  });

  it('enables merge-base comparison', () => {
    expect(readCliOptions(['plan', '--merge-base']).mergeBase).toBe(true);
  });

  it('accepts the run command', () => {
    expect(readCliOptions(['run']).command).toBe('run');
  });

  it('rejects unknown command', () => {
    expect(() => readCliOptions(['invalid'])).toThrow('Unknown command: invalid');
  });

  it('rejects missing commands', () => {
    expect(() => readCliOptions([])).toThrow('Missing command');
  });

  it('rejects unsupported flags', () => {
    expect(() => readCliOptions(['plan', '--unknown'])).toThrow();
  });

  it('rejects empty references', () => {
    expect(() => readCliOptions(['plan', '--from', ''])).toThrow('Git references cannot be empty');
  });
});

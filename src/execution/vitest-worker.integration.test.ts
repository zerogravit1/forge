import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('Vitest worker integration', () => {
  it('returns a nonzero exit code for malformed JSON manifests', () => {
    const workerPath = fileURLToPath(
      new URL('./vitest-worker.ts', import.meta.url),
    );

    const result = spawnSync(
      process.execPath,
      [workerPath],
      {
        cwd: process.cwd(),
        input: '{"testFiles":[',
        encoding: 'utf8',
        timeout: 20_000,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe('');
  });

  it.each([
    ['missing testFiles', '{}'],
    ['empty testFiles', '{"testFiles":[]}'],
    ['non-array testFiles', '{"testFiles":"App.test.ts"}'],
    ['invalid file entry', '{"testFiles":[42]}'],
  ])('rejects a manifest with %s', (_description, input) => {
    const workerPath = fileURLToPath(
      new URL('./vitest-worker.ts', import.meta.url),
    );

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: process.cwd(),
      input,
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid Vitest execution manifest');
  })
});
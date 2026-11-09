import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createVitestRunner } from './vitest-runner.js';

describe('Vitest worker integration', () => {
  it('returns a nonzero exit code for malformed JSON manifests', () => {
    const workerPath = fileURLToPath(new URL('./vitest-worker.ts', import.meta.url));

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: process.cwd(),
      input: '{"testFiles":[',
      encoding: 'utf8',
      timeout: 20_000,
    });

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
    const workerPath = fileURLToPath(new URL('./vitest-worker.ts', import.meta.url));

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: process.cwd(),
      input,
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid Vitest execution manifest');
  });

  it('returns a nonzero exit code when a selected test file does not exist', () => {
    const workerPath = fileURLToPath(new URL('./vitest-worker.ts', import.meta.url));

    const result = spawnSync(process.execPath, [workerPath], {
      cwd: process.cwd(),
      input: JSON.stringify({
        testFiles: ['src/execution/DefinitelyMissing.test.ts'],
      }),
      encoding: 'utf8',
      timeout: 20_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOENT');
  });

  it('rejects a test file excluded by Vitest configuration', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-unmatched-'));
    const workerPath = fileURLToPath(new URL('./vitest-worker.ts', import.meta.url));

    try {
      await symlink(resolve('node_modules'), join(projectRoot, 'node_modules'), 'dir');

      await writeFile(
        join(projectRoot, 'vitest.config.mjs'),
        `export default {
          test: {
            include: ['tests/**/*.test.ts']
          }
        };`,
      );

      await mkdir(join(projectRoot, 'src'), { recursive: true });

      await writeFile(
        join(projectRoot, 'src/Excluded.test.ts'),
        `import { test } from 'vitest';
         test('excluded test', () => {});`,
      );

      const result = spawnSync(process.execPath, [workerPath], {
        cwd: projectRoot,
        input: JSON.stringify({
          testFiles: ['src/Excluded.test.ts'],
        }),
        encoding: 'utf8',
        timeout: 20_000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('No Vitest project matches');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }, 30_000);
});

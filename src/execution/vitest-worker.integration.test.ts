import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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

  it('terminates within the configured teardown timeout', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-shutdown-'));
    const workerPath = fileURLToPath(new URL('./vitest-worker.ts', import.meta.url));

    try {
      await symlink(resolve('node_modules'), join(projectRoot, 'node_modules'), 'dir');
      await mkdir(join(projectRoot, 'tests'), { recursive: true });

      await writeFile(
        join(projectRoot, 'vitest.config.mjs'),
        `export default {
          test: {
            include: ['tests/**/*.test.ts'],
            globalSetup: ['./global-setup.mjs'],
            teardownTimeout: 300,
            maxWorkers: 1
          }
        };`,
      );

      await writeFile(
        join(projectRoot, 'global-setup.mjs'),
        `export default function setup() {
          setInterval(() => {}, 1000);
        }`,
      );

      await writeFile(
        join(projectRoot, 'tests/App.test.ts'),
        `import { test, expect } from 'vitest';
         test('passes', () => expect(true).toBe(true));`,
      );

      // Establish direct Vitest behavior
      const direct = spawnSync(
        process.execPath,
        [resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/App.test.ts'],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          timeout: 5000,
          killSignal: 'SIGKILL',
        },
      );

      expect(direct.error).toBeUndefined();
      expect(direct.status).not.toBeNull();
      expect(`${direct.stdout}\n${direct.stderr}`).toMatch(/1 passed/);

      // Forge must also complete and exit without external termination.
      const worker = spawnSync(process.execPath, [workerPath], {
        cwd: projectRoot,
        input: JSON.stringify({ testFiles: ['tests/App.test.ts'] }),
        encoding: 'utf8',
        timeout: 5000,
        killSignal: 'SIGKILL',
      });

      expect(worker.error).toBeUndefined();
      expect(worker.status).toBe(0);
      expect(`${worker.stdout}\n${worker.stderr}`).toMatch(/1 passed/);
    } finally {
      await rm(projectRoot, { recursive: true });
    }
  }, 20_000);
});

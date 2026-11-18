import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';

import { withTempRepository } from '../../helpers/temp-repo.js';
import { discoverRepositoryModules } from './typescript-dependencies.js';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();

  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
  };
});

describe('discoverRepositoryModules caching', () => {
  it('analyzes a shared module once per compilation context', async () => {
    await withTempRepository('forge-cache-reuse-', async (repo) => {
      const tests = ['src/first.test.ts', 'src/second.test.ts'];

      await repo.write('src/shared/consumer.ts', 'export const value = 42;');

      for (const test of tests) {
        await repo.write(test, "import { value } from './shared/consumer.js';");
      }

      const readFileMock = vi.mocked(readFile);
      readFileMock.mockClear();

      const modules = await discoverRepositoryModules(tests, repo.root);

      const sharedPath = repo.path('src/shared/consumer.ts');

      const sharedReads = readFileMock.mock.calls.filter(([path]) => String(path) === sharedPath);

      // The expansive module analysis should happen once.
      expect(sharedReads).toHaveLength(1);

      // Both tests must retain their own dependency records.
      const sharedRecords = modules.filter((module) => module.file === 'src/shared/consumer.ts');

      expect(sharedRecords.map((module) => module.testRoot)).toEqual(tests);
    });
  });
});

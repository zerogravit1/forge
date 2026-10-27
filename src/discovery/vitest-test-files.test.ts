import { describe, expect, it } from 'vitest';
import { discoverVitestTestFiles } from './vitest-test-files.js';

describe('discoverVitestTestFiles', () => {
  it('discovers test files configured for Vitest', async () => {
    const testFiles = await discoverVitestTestFiles(process.cwd());

    expect(testFiles).toContain('src/cli.test.ts');
    expect(testFiles).toContain('src/selection/test-selection.integration.test.ts');
    expect(testFiles).not.toContain('src/cli.ts');
  });

  it('rejects when the Vitest discovery process cannot start', async () => {
    await expect(discoverVitestTestFiles('/this/directory/does/not/exist')).rejects.toThrow(
      'Failed to start Vitest discovery',
    );
  });
});

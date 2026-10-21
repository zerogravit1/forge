import { describe, expect, it } from 'vitest';
import type { GitChange } from '../changes/git-changes.js';
import { planTestSelection } from './plan-test-selection.js';

describe('test selection integration', () => {
  it('selects a test when an indirect dependency changes', async () => {
    const testFiles = ['src/cli.test.ts'];
    const repoRoot = process.cwd();

    const changes: GitChange[] = [
      {
        status: 'modified',
        path: 'src/config/cli-options.ts',
      },
    ];

    const result = await planTestSelection(changes, testFiles, repoRoot);

    expect(result).toEqual({
      selectedTests: ['src/cli.test.ts'],
      unmappedChanges: [],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getGitChanges } from './git-changes.js';

describe('getGitChanges integration', () => {
  it('detects changes between real Git commits', async () => {
    // Create a disposable directory outside Forge.
    const repo = await mkdtemp(join(tmpdir(), 'forge-test-'));

    // Execute Git in that directory.
    const git = (args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
      }).trim();

    try {
      // Initialize the temporary repository.
      git(['init', '-q']);
      git(['config', 'user.name', 'Forge Test']);
      git(['config', 'user.email', 'forge@example.invalid']);
      git(['config', 'commit.gpgsign', 'false']);

      // Create the initial files.
      await writeFile(join(repo, 'existing.ts'), 'version 1\n');
      await writeFile(join(repo, 'deleted.ts'), 'delete me\n');
      await writeFile(join(repo, 'old.ts'), 'rename me\n');

      // First commit.
      git(['add', '-A']);
      git(['commit', '-qm', 'Initial commit']);

      const from = git(['rev-parse', 'HEAD']);

      // Modify the repository.
      await writeFile(join(repo, 'existing.ts'), 'version 2\n');
      await writeFile(join(repo, 'added.ts'), 'new file\n');
      await rm(join(repo, 'deleted.ts'));
      await rename(join(repo, 'old.ts'), join(repo, 'renamed.ts'));

      // Second commit.
      git(['add', '-A']);
      git(['commit', '-qm', 'Change files']);

      const to = git(['rev-parse', 'HEAD']);

      // Ask Forge to detect the actual changes.
      const changes = await getGitChanges({
        from,
        to,
        cwd: repo,
      });

      // Verify all four changes were detected.
      expect(changes).toHaveLength(4);

      expect(changes).toEqual(
        expect.arrayContaining([
          { status: 'added', path: 'added.ts' },
          { status: 'modified', path: 'existing.ts' },
          { status: 'deleted', path: 'deleted.ts' },
          {
            status: 'renamed',
            path: 'renamed.ts',
            previousPath: 'old.ts',
          },
        ]),
      );
    } finally {
      // Always remove the temporary repository.
      await rm(repo, { recursive: true, force: true });
    }
  });
});

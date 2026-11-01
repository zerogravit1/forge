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

  it('detects staged, unstaged, and untracked working-tree changes', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'force-worktree-test-'));

    const git = (args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
      }).trim();

    try {
      // Initialize a disposable Git repository
      git(['init', '-q']);
      git(['config', 'user.name', 'Forge Test']);
      git(['config', 'user.email', 'forge@example.invalid']);
      git(['config', 'commit.gpgsign', 'false']);

      // Create the initial committed state.
      await writeFile(join(repo, 'staged.ts'), 'version 1\n');
      await writeFile(join(repo, 'unstaged.ts'), 'version 1\n');
      await writeFile(join(repo, '.gitignore'), 'ignored.ts\n');

      git(['add', '-A']);
      git(['commit', '-qm', 'Initial commit']);

      // Modify and stage one tracked file.
      await writeFile(join(repo, 'staged.ts'), 'version 2\n');
      git(['add', 'staged.ts']);

      // Modify another tracked file without staging it.
      await writeFile(join(repo, 'unstaged.ts'), 'version 2\n');

      // Create an untracked file.
      await writeFile(join(repo, 'untracked.ts'), 'new file\n');

      // Create an ignored file.
      await writeFile(join(repo, 'ignored.ts'), 'ignored file\n');

      const changes = await getGitChanges({
        from: 'HEAD',
        to: 'worktree',
        cwd: repo,
      });

      expect(changes).toEqual(
        expect.arrayContaining([
          { status: 'modified', path: 'staged.ts' },
          { status: 'modified', path: 'unstaged.ts' },
          { status: 'added', path: 'untracked.ts' },
        ]),
      );

      expect(changes).toHaveLength(3);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it('detects deleted files', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'force-worktree-test-'));

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

      await writeFile(join(repo, 'staged.ts'), 'version 1\n');
      await writeFile(join(repo, 'unstaged.ts'), 'version 1\n');
      await writeFile(join(repo, 'deleted.ts'), 'delete me\n');
      await writeFile(join(repo, '.gitignore'), 'ignored.ts\n');

      git(['add', '-A']);
      git(['commit', '-qm', 'Initial commit']);

      // Delete the file without staging or commiting.
      await rm(join(repo, 'deleted.ts'));

      const changes = await getGitChanges({
        from: 'HEAD',
        to: 'worktree',
        cwd: repo,
      });

      expect(changes).toEqual(expect.arrayContaining([{ status: 'deleted', path: 'deleted.ts' }]));
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});

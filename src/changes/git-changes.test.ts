import { describe, expect, it, vi } from 'vitest';
import { getGitChanges, parseGitChanges } from './git-changes.js';

describe('parseGitChanges', () => {
  it('parses added, modified and deleted files', () => {
    const output = 'A\0src/new.ts\0' + 'M\0src/cli.ts\0' + 'D\0src/old.ts\0';

    expect(parseGitChanges(output)).toEqual([
      { status: 'added', path: 'src/new.ts' },
      { status: 'modified', path: 'src/cli.ts' },
      { status: 'deleted', path: 'src/old.ts' },
    ]);
  });

  it('parses renamed files', () => {
    const output = 'R100\0src/old.ts\0src/new.ts\0';

    expect(parseGitChanges(output)).toEqual([
      {
        status: 'renamed',
        path: 'src/new.ts',
        previousPath: 'src/old.ts',
      },
    ]);
  });

  it('returns no changes for an empty diff', () => {
    expect(parseGitChanges('')).toEqual([]);
  });

  it('preserves filesnames containing tabs', () => {
    const output = 'A\0src/a\tb.ts\0';

    expect(parseGitChanges(output)).toEqual([{ status: 'added', path: 'src/a\tb.ts' }]);
  });

  it('rejects unsupported Git statuses', () => {
    expect(() => parseGitChanges('T\0src/file.ts\0')).toThrow('Unsupported Git change status: T');
  });

  it('rejects incomplete output', () => {
    expect(() => parseGitChanges('R100\0src/old.ts\0')).toThrow('Malformed Git diff output');
  });
});

describe('getGitChanges', () => {
  it('compares two revisions', async () => {
    const execute = vi.fn(async () => 'M\0src/cli.ts\0');

    const changes = await getGitChanges(
      {
        from: 'develop',
        to: 'feature/forge_cli',
      },
      execute,
    );

    expect(execute).toHaveBeenCalledWith(
      ['diff', '--name-status', '-z', '--find-renames', 'develop', 'feature/forge_cli', '--'],
      undefined,
    );

    expect(changes).toEqual([
      {
        status: 'modified',
        path: 'src/cli.ts',
      },
    ]);
  });

  it('uses three-dot comparison with mergeBase', async () => {
    const execute = vi.fn(async () => '');

    await getGitChanges(
      {
        from: 'develop',
        to: 'feature/forge_cli',
        mergeBase: true,
      },
      execute,
    );

    expect(execute).toHaveBeenCalledWith(expect.arrayContaining(['develop...feature/forge_cli']), undefined);
  });

  it('includes tracked and untracked files in a worktree comparison', async () => {
    const execute = vi.fn(async (args: string[]) => {
      if (args[0] === 'diff') {
        return 'M\0src/exising.ts\0';
      }

      if (args[0] === 'ls-files') {
        return 'src/new.ts\0';
      }

      throw new Error('Unexpected Git command');
    });

    const changes = await getGitChanges(
      {
        from: 'HEAD',
        to: 'worktree',
      },
      execute,
    );

    expect(changes).toEqual([
      { status: 'modified', path: 'src/existing.ts' },
      { status: 'added', path: 'src/new.ts' },
    ]);

    expect(execute).toHaveBeenCalledTimes(2);
  });
});

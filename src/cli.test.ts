import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from './cli.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('main', () => {
  it('reports when no changes are detected', async () => {
    const getChanges = vi.fn(async () => []);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan', '--from', 'develop', '--to', 'feature/forge_cli'], getChanges);

    expect(exitCode).toBe(0);

    expect(getChanges).toHaveBeenCalledWith({
      command: 'plan',
      from: 'develop',
      to: 'feature/forge_cli',
      mergeBase: false,
    });

    expect(stdout).toHaveBeenCalledWith('No changes detected.\n');
  });

  it('reports detected changes', async () => {
    const getChanges = vi.fn(async () => [
      {
        status: 'added' as const,
        path: 'src/new-file.ts',
      },
      {
        status: 'modified' as const,
        path: 'src/cli.ts',
      },
    ]);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges);

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('Detected 2 changed files:\n');

    expect(stdout).toHaveBeenCalledWith('added\tsrc/new-file.ts\n');

    expect(stdout).toHaveBeenCalledWith('modified\tsrc/cli.ts\n');
  });

  it('reports 1 detected change for a renamed file', async () => {
    const getChanges = vi.fn(async () => [
      {
        status: 'renamed' as const,
        path: 'src/new-file.ts',
        previousPath: 'src/old-file.ts',
      },
    ]);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges);

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('Detected 1 changed file:\n');

    expect(stdout).toHaveBeenCalledWith('renamed\tsrc/old-file.ts -> src/new-file.ts\n');
  });

  it('returns an error when no command is provided', async () => {
    const getChanges = vi.fn(async () => []);

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main([], getChanges);

    expect(exitCode).toBe(1);

    expect(getChanges).not.toHaveBeenCalled();

    expect(stderr).toHaveBeenCalledWith('Missing command. Expected: plan or run');
  });

  it('returns an error when unknown command is provided', async () => {
    const getChanges = vi.fn(async () => []);

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['unknown'], getChanges);

    expect(exitCode).toBe(1);

    expect(getChanges).not.toHaveBeenCalled();

    expect(stderr).toHaveBeenCalledWith('Unknown command: unknown');
  });

  it('returns an error when change detection fails', async () => {
    const getChanges = vi.fn().mockRejectedValue(new Error('Git comparison failed'));

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['plan'], getChanges);

    expect(getChanges).toHaveBeenCalledOnce();
    expect(stderr).toHaveBeenCalledWith('Git comparison failed');

    expect(exitCode).toBe(1);
  });

  it('returns an error when the run command is provided', async () => {
    const getChanges = vi.fn(async () => []);

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['run'], getChanges);

    expect(exitCode).toBe(2);

    expect(getChanges).not.toHaveBeenCalled();

    expect(stderr).toHaveBeenCalledWith('Run is not implemented yet');
  });  
});

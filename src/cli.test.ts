import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from './cli.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const discoverTestFiles = vi.fn(async () => ['src/cli.test.ts']);

const planSelection = vi.fn(async () => ({
  selectedTests: ['src/cli.test.ts'],
  unmappedChanges: [{ status: 'added' as const, path: 'src/new-file.ts' }],
}));

describe('main', () => {
  it('reports when no changes are detected', async () => {
    const getChanges = vi.fn(async () => []);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan', '--from', 'develop', '--to', 'feature/forge_cli'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(0);

    expect(getChanges).toHaveBeenCalledWith({
      command: 'plan',
      from: 'develop',
      to: 'feature/forge_cli',
      mergeBase: false,
    });

    expect(stdout).toHaveBeenCalledWith('No changes detected.\n');

    expect(discoverTestFiles).not.toHaveBeenCalled();
    expect(planSelection).not.toHaveBeenCalled();
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

    const exitCode = await main(['plan'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('Detected 2 changed files:\n');
    expect(stdout).toHaveBeenCalledWith('added\tsrc/new-file.ts\n');
    expect(stdout).toHaveBeenCalledWith('modified\tsrc/cli.ts\n');
    expect(stdout).toHaveBeenCalledWith('\nSelected tests:\n');
    expect(stdout).toHaveBeenCalledWith('  src/cli.test.ts\n');

    expect(stdout).toHaveBeenCalledWith('\nUnmapped changes:\n');
    expect(stdout).toHaveBeenCalledWith('  added\tsrc/new-file.ts\n');

    expect(discoverTestFiles).toHaveBeenCalledWith(process.cwd());

    expect(planSelection).toHaveBeenCalledWith(
      expect.arrayContaining([{ status: 'modified', path: 'src/cli.ts' }]),
      ['src/cli.test.ts'],
      process.cwd(),
    );
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

    const exitCode = await main(['plan'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('Detected 1 changed file:\n');

    expect(stdout).toHaveBeenCalledWith('renamed\tsrc/old-file.ts -> src/new-file.ts\n');
  });

  it('reports an incomplete selection when a changed file has no mapping', async () => {
    const getChanges = vi.fn(async () => [
      {
        status: 'modified' as const,
        path: 'src/unknown-service.ts',
      },
    ]);

    const planSelection = vi.fn(async () => ({
      selectedTests: [],
      unmappedChanges: [
        {
          status: 'modified' as const,
          path: 'src/unknown-service.ts',
        },
      ],
    }));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('\nSelected tests:\n');
    expect(stdout).toHaveBeenCalledWith('  None\n');

    expect(stdout).toHaveBeenCalledWith('\nUnmapped changes:\n');
    expect(stdout).toHaveBeenCalledWith('  modified\tsrc/unknown-service.ts\n');

    expect(stdout).toHaveBeenCalledWith('\nSelection incomplete: 1 change has no known test mapping.\n');
  });

  it('reports an incomplete selection when some tests are selected but other changes are unmapped', async () => {
    const orderTest = 'src/orders/order-service.test.ts';
    const inventoryFile = 'src/inventory/inventory-service.ts';

    const getChanges = vi.fn(async () => [
      {
        status: 'modified' as const,
        path: orderTest,
      },
      {
        status: 'modified' as const,
        path: inventoryFile,
      },
    ]);

    const discoverTestFiles = vi.fn(async () => [orderTest]);

    const planSelection = vi.fn(async () => ({
      selectedTests: [orderTest],
      unmappedChanges: [
        {
          status: 'modified' as const,
          path: inventoryFile,
        },
      ],
    }));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('\nSelected tests:\n');
    expect(stdout).toHaveBeenCalledWith(`  ${orderTest}\n`);

    expect(stdout).toHaveBeenCalledWith('\nUnmapped changes:\n');
    expect(stdout).toHaveBeenCalledWith(`  modified\t${inventoryFile}\n`);

    expect(stdout).toHaveBeenCalledWith('\nSelection incomplete: 1 change has no known test mapping.\n');
  });

  it('reports an incomplete selection when 2 changed files have no mapping', async () => {
    const getChanges = vi.fn(async () => [
      {
        status: 'modified' as const,
        path: 'src/unknown-service.ts',
      },
      {
        status: 'modified' as const,
        path: 'src/unknown-collection.ts',
      },
    ]);

    const planSelection = vi.fn(async () => ({
      selectedTests: [],
      unmappedChanges: [
        {
          status: 'modified' as const,
          path: 'src/unknown-service.ts',
        },
        {
        status: 'modified' as const,
        path: 'src/unknown-collection.ts',
      },
      ],
    }));

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(0);

    expect(stdout).toHaveBeenCalledWith('\nSelected tests:\n');
    expect(stdout).toHaveBeenCalledWith('  None\n');

    expect(stdout).toHaveBeenCalledWith('\nUnmapped changes:\n');
    expect(stdout).toHaveBeenCalledWith('  modified\tsrc/unknown-service.ts\n');
    expect(stdout).toHaveBeenCalledWith('  modified\tsrc/unknown-collection.ts\n');

    expect(stdout).toHaveBeenCalledWith('\nSelection incomplete: 2 changes have no known test mapping.\n');
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

  it('returns an error when discoverTestFiles fail', async () => {
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

    const discoverTestFiles = vi.fn().mockRejectedValue(new Error('Vitest discovery failed'));

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['plan'], getChanges, {
      discoverTestFiles,
      planSelection,
    });

    expect(exitCode).toBe(1);

    expect(stderr).toHaveBeenCalledWith('Vitest discovery failed');

    expect(planSelection).not.toHaveBeenCalled();
  });
});

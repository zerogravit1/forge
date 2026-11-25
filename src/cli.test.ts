import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from './cli.js';
import type { GitChange } from './changes/git-changes.js';
import type { TestRunner } from './execution/test-runner.js';
import type { VitestExecutionEvidence } from './execution/vitest-evidence.js';
import type { SelectionResult } from './selection/select-tests.js';
import type { ValidationTarget } from './validation/validation-target.js';

import * as configLoader from './config/load-forge-config.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const discoverTestFiles = vi.fn(async () => ['src/cli.test.ts']);

const planSelection = vi.fn(async () => ({
  selectedTests: ['src/cli.test.ts'],
  unmappedChanges: [{ status: 'added' as const, path: 'src/new-file.ts' }],
}));

const javaTest = 'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java';

const mavenRunner = {
  id: 'maven',
  run: vi.fn(async () => ({ exitCode: 0 })),
};

const javaTarget: ValidationTarget = {
  id: 'java-orders',

  includesChange: (change) => change.path.startsWith('examples/java-orders/'),

  discoverTestFiles: vi.fn(async () => [javaTest]),

  planSelection: vi.fn(async () => ({
    selectedTests: [javaTest],
    unmappedChanges: [],
  })),

  runner: mavenRunner,
};

const vitestRunner = {
  id: 'vitest',
  run: vi.fn(async () => ({ exitCode: 0 })),
};

const vitestTarget: ValidationTarget = {
  id: 'vitest',

  includesChange: (change) => change.path.startsWith('src/'),

  discoverTestFiles: vi.fn(async () => ['src/cli.test.ts']),

  planSelection: vi.fn(async () => ({
    selectedTests: ['src/cli.test.ts'],
    unmappedChanges: [],
  })),

  runner: vitestRunner,
};

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

  it('does not execute tests when no changes are detected', async () => {
    const getChanges = vi.fn(async () => []);
    const runner = {
      id: 'vitest',
      run: vi.fn(async () => ({ exitCode: 0 })),
    };

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['run'], getChanges, {
      discoverTestFiles,
      planSelection,
      runner,
    });

    expect(exitCode).toBe(0);
    expect(getChanges).toHaveBeenCalledOnce();
    expect(discoverTestFiles).not.toHaveBeenCalled();
    expect(planSelection).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();

    expect(stdout).toHaveBeenCalledWith('No changes detected.\n');
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

  it('executes selected tests when the selection is complete', async () => {
    const testFile = 'src/cli.test.ts';

    const getChanges = vi.fn(async () => [
      {
        status: 'modified' as const,
        path: 'src/cli.ts',
      },
    ]);

    const discoverTestFiles = vi.fn(async () => [testFile]);

    const planSelection = vi.fn(async () => ({
      selectedTests: [testFile],
      unmappedChanges: [],
    }));

    const runner = {
      id: 'vitest',
      run: vi.fn(async () => ({ exitCode: 0 })),
    };

    const exitCode = await main(['run'], getChanges, {
      discoverTestFiles,
      planSelection,
      runner,
    });

    expect(discoverTestFiles).toHaveBeenCalledWith(process.cwd());
    expect(planSelection).toHaveBeenCalledWith([{ status: 'modified', path: 'src/cli.ts' }], [testFile], process.cwd());
    expect(runner.run).toHaveBeenCalledExactlyOnceWith([testFile], process.cwd());
    expect(exitCode).toBe(0);
  });

  it('propagates the test runner exit code', async () => {
    const getChanges = vi.fn(async () => [
      {
        status: 'modified' as const,
        path: 'src/cli.ts',
      },
    ]);

    const discoverTestFiles = vi.fn(async () => ['src/cli.test.ts']);

    const planSelection = vi.fn(async () => ({
      selectedTests: ['src/cli.test.ts'],
      unmappedChanges: [],
    }));

    const runner = {
      id: 'vitest',
      run: vi.fn(async () => ({ exitCode: 1 })),
    };

    const exitCode = await main(['run'], getChanges, {
      discoverTestFiles,
      planSelection,
      runner,
    });

    expect(runner.run).toHaveBeenCalledOnce();
    expect(exitCode).toBe(1);
  });

  it('does not execute tests when selection is incomplete', async () => {
    const getChanges = vi.fn(async () => [
      { status: 'modified' as const, path: 'src/cli.ts' },
      { status: 'modified' as const, path: 'src/unknown.ts' },
    ]);

    const testFiles = ['src/cli.test.ts', 'src/selection/select-tests.test.ts'];

    const discoverTestFiles = vi.fn(async () => testFiles);

    const planSelection = vi.fn(async () => ({
      selectedTests: ['src/cli.test.ts'],
      unmappedChanges: [{ status: 'modified' as const, path: 'src/unknown.ts' }],
    }));

    const runner = {
      id: 'vitest',
      run: vi.fn(async () => ({ exitCode: 0 })),
    };

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['run'], getChanges, {
      discoverTestFiles,
      planSelection,
      runner,
    });

    expect(runner.run).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);

    expect(stderr).toHaveBeenCalledWith('Selection incomplete. Execution requires a fallback policy.');
  });

  it('executes Java tests through the matching validation target', async () => {
    const change = {
      status: 'modified' as const,
      path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
    };

    const getChanges = vi.fn(async () => [change]);

    const exitCode = await main(['run'], getChanges, {
      targets: [vitestTarget, javaTarget],
    });

    expect(javaTarget.discoverTestFiles).toHaveBeenCalledExactlyOnceWith(process.cwd());

    expect(javaTarget.planSelection).toHaveBeenCalledExactlyOnceWith([change], [javaTest], process.cwd());

    expect(mavenRunner.run).toHaveBeenCalledExactlyOnceWith([javaTest], process.cwd());

    expect(vitestTarget.discoverTestFiles).not.toHaveBeenCalled();
    expect(vitestRunner.run).not.toHaveBeenCalled();

    expect(exitCode).toBe(0);
  });

  it('executes tests for multiple matching validation targets', async () => {
    const javaChange = {
      status: 'modified' as const,
      path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
    };

    const typescriptChange = {
      status: 'modified' as const,
      path: 'src/cli.ts',
    };

    const changes = [javaChange, typescriptChange];
    const getChanges = vi.fn(async () => changes);

    const exitCode = await main(['run'], getChanges, {
      targets: [vitestTarget, javaTarget],
    });

    expect(javaTarget.planSelection).toHaveBeenCalledExactlyOnceWith([javaChange], [javaTest], process.cwd());

    expect(vitestTarget.planSelection).toHaveBeenCalledExactlyOnceWith(
      [typescriptChange],
      ['src/cli.test.ts'],
      process.cwd(),
    );

    expect(mavenRunner.run).toHaveBeenCalledExactlyOnceWith([javaTest], process.cwd());

    expect(vitestRunner.run).toHaveBeenCalledExactlyOnceWith(['src/cli.test.ts'], process.cwd());

    expect(exitCode).toBe(0);
  });

  it('returns a nonzero exit code when one validation target fails', async () => {
    const changes = [
      {
        status: 'modified' as const,
        path: 'src/cli.ts',
      },
      {
        status: 'modified' as const,
        path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      },
    ];

    const getChanges = vi.fn(async () => changes);

    const failingVitestRunner = {
      id: 'vitest',
      run: vi.fn(async () => ({ exitCode: 1 })),
    };

    const failingVitestTarget: ValidationTarget = {
      ...vitestTarget,
      runner: failingVitestRunner,
    };

    const exitCode = await main(['run'], getChanges, {
      targets: [failingVitestTarget, javaTarget],
    });

    expect(failingVitestRunner.run).toHaveBeenCalledExactlyOnceWith(['src/cli.test.ts'], process.cwd());

    expect(mavenRunner.run).toHaveBeenCalledExactlyOnceWith([javaTest], process.cwd());

    expect(exitCode).toBe(1);
  });

  it('plans Java tests through the matching validation target', async () => {
    const change = {
      status: 'modified' as const,
      path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
    };

    const getChanges = vi.fn(async () => [change]);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges, {
      targets: [vitestTarget, javaTarget],
    });

    expect(javaTarget.discoverTestFiles).toHaveBeenCalledExactlyOnceWith(process.cwd());
    expect(javaTarget.planSelection).toHaveBeenCalledExactlyOnceWith([change], [javaTest], process.cwd());

    expect(vitestTarget.discoverTestFiles).not.toHaveBeenCalled();

    expect(stdout).toHaveBeenCalledWith('  ' + javaTest + '\n');

    expect(mavenRunner.run).not.toHaveBeenCalled();
    expect(vitestRunner.run).not.toHaveBeenCalled();

    expect(exitCode).toBe(0);
  });

  it('plans Java test using the default CLI services', async () => {
    const change = {
      status: 'modified' as const,
      path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
    };

    const getChanges = vi.fn(async () => [change]);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges);

    expect(stdout).toHaveBeenCalledWith('  ' + javaTest + '\n');

    expect(exitCode).toBe(0);
  });

  it('reports selections and unmapped changes across multiple targets', async () => {
    const changes = [
      {
        status: 'modified' as const,
        path: 'src/cli.ts',
      },
      {
        status: 'modified' as const,
        path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      },
      {
        status: 'added' as const,
        path: 'unmapped/unknown-file.txt',
      },
    ];

    const getChanges = vi.fn(async () => changes);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = await main(['plan'], getChanges, {
      targets: [vitestTarget, javaTarget],
    });

    expect(vitestTarget.planSelection).toHaveBeenCalledOnce();
    expect(javaTarget.planSelection).toHaveBeenCalledOnce();

    expect(stdout).toHaveBeenCalledWith('  src/cli.test.ts\n');
    expect(stdout).toHaveBeenCalledWith(`  ${javaTest}\n`);
    expect(stdout).toHaveBeenCalledWith('  added\tunmapped/unknown-file.txt\n');
    expect(stdout).toHaveBeenCalledWith('\nSelection incomplete: 1 change has no known test mapping.\n');

    expect(vitestRunner.run).not.toHaveBeenCalled();
    expect(mavenRunner.run).not.toHaveBeenCalled();

    expect(exitCode).toBe(0);
  });

  it('does not execute Java tests when another change has no validation target', async () => {
    const getChanges = vi.fn(async () => [
      {
        status: 'modified' as const,
        path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      },
      {
        status: 'modified' as const,
        path: 'unmapped/unknown-file.txt',
      },
    ]);

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['run'], getChanges, {
      targets: [vitestTarget, javaTarget],
    });

    expect(exitCode).toBe(1);
    expect(mavenRunner.run).not.toHaveBeenCalled();
    expect(vitestRunner.run).not.toHaveBeenCalled();

    expect(stderr).toHaveBeenCalledWith('Selection incomplete. Some changes have no validation target.');
  });

  it('does not execute any target when another target has unmapped changes', async () => {
    const typescriptChange = {
      status: 'modified' as const,
      path: 'src/cli.ts',
    };

    const javaChange = {
      status: 'modified' as const,
      path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
    };

    const getChanges = vi.fn(async () => [typescriptChange, javaChange]);

    const incompleteJavaTarget: ValidationTarget = {
      ...javaTarget,
      planSelection: vi.fn(async () => ({
        selectedTests: [javaTest],
        unmappedChanges: [javaChange],
      })),
    };

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['run'], getChanges, {
      targets: [vitestTarget, incompleteJavaTarget],
    });

    expect(vitestTarget.planSelection).toHaveBeenCalledOnce();
    expect(incompleteJavaTarget.planSelection).toHaveBeenCalledOnce();

    expect(vitestRunner.run).not.toHaveBeenCalled();
    expect(mavenRunner.run).not.toHaveBeenCalled();

    expect(exitCode).toBe(1);

    expect(stderr).toHaveBeenCalledWith('Selection incomplete. Execution requires a fallback policy.');
  });

  it('returns an error when Forge configuraiton cannot be loaded', async () => {
    const getChanges = vi.fn(async () => []);

    vi.spyOn(configLoader, 'loadForgeConfig').mockRejectedValueOnce(new Error('Invalid Forge configuration'));

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitCode = await main(['plan'], getChanges);

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith('Invalid Forge configuration');
    expect(getChanges).not.toHaveBeenCalled();
  });
});

describe('configured full-target fallback', () => {
  const knownTest = 'src/known.test.ts';
  const additionalTest = 'src/additional.test.ts';
  const inventory = [knownTest, additionalTest];
  const workerChange: GitChange = { status: 'modified', path: 'src/worker.ts' };

  function createTarget(
    onUnmappedChanges: ValidationTarget['onUnmappedChanges'],
    {
      id = 'internal.forge-tests',
      root = 'src/',
      runnerId = 'vitest',
      files = inventory,
      selection = { selectedTests: [knownTest], unmappedChanges: [workerChange] },
    }: { id?: string; root?: string; runnerId?: string; files?: string[]; selection?: SelectionResult } = {},
  ) {
    const run = vi.fn<TestRunner['run']>().mockResolvedValue({ exitCode: 0 });
    return {
      id,
      ...(onUnmappedChanges === undefined ? {} : { onUnmappedChanges }),
      includesChange: (change: GitChange) => change.path.startsWith(root),
      discoverTestFiles: vi.fn(async () => files),
      planSelection: vi.fn(async () => selection),
      runner: { id: runnerId, run },
    } satisfies ValidationTarget;
  }

  function captureOutput() {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    return () => [...stdout.mock.calls, ...stderr.mock.calls].map(([message]) => String(message)).join('\n');
  }

  it.each([undefined, 'strict'] as const)('preserves strict refusal with policy %s', async (policy) => {
    const output = captureOutput();
    const target = createTarget(policy);

    const status = await main(['run'], async () => [workerChange], { targets: [target] });

    expect(status).toBe(1);
    expect(target.runner.run).not.toHaveBeenCalled();
    expect(output()).toContain('Selection incomplete. Execution requires a fallback policy.');
  });

  it('retains the original selection and exit 1 when the sole affected target has verified passing observations', async () => {
    const output = captureOutput();
    const target = createTarget('full-target');
    const unrelatedTarget = createTarget(undefined, { id: 'examples.java', root: 'examples/', runnerId: 'maven' });
    const expected = inventory.map((file, index) => ({ id: `spec-${index}`, file, project: 'internal' }));
    const evidence: VitestExecutionEvidence = {
      status: 'complete',
      expected: expected.map((spec) => ({ ...spec, kind: 'runtime' })),
      observed: expected.map((spec) => ({
        ...spec,
        state: 'passed',
        cases: { passed: 1, failed: 0, skipped: 0, pending: 0 },
      })),
      unhandledErrorCount: 0,
      reconciliation: { missing: [], unexpected: [], duplicates: [], incomplete: [] },
      unverifiedSpecifications: [],
    };
    const observed = { exitCode: 0, evidence, shutdown: 'completed' };
    target.runner.run.mockResolvedValue(observed);

    const status = await main(['run'], async () => [workerChange], { targets: [target, unrelatedTarget] });

    expect(target.discoverTestFiles).toHaveBeenCalledExactlyOnceWith(process.cwd());
    expect(target.runner.run).toHaveBeenCalledExactlyOnceWith(inventory, process.cwd());
    expect(unrelatedTarget.discoverTestFiles).not.toHaveBeenCalled();
    expect(unrelatedTarget.runner.run).not.toHaveBeenCalled();
    expect(status).toBe(1);
    expect(output()).toContain('Full-target fallback: internal.forge-tests');
    expect(output()).toContain('Selection incomplete: original test mapping remains incomplete.');
    expect(output()).toMatch(/Unmapped changes:\s+.*src\/worker\.ts/);
    expect(output()).toMatch(/Originally selected test files:\s+src\/known\.test\.ts\s+Fallback test files:/);
    expect(output()).toMatch(/Fallback test files:\s+src\/known\.test\.ts\s+src\/additional\.test\.ts/);
    expect(output()).toContain('Vitest execution evidence: complete');
    expect(output()).toContain(
      'src/additional.test.ts [internal, spec-1]: passed (1 passed, 0 failed, 0 skipped, 0 pending)',
    );
    expect(output()).toContain('Vitest shutdown: completed');
    expect(output()).toContain('Vitest subprocess exit: 0');
  });

  it('keeps unavailable evidence and shutdown unverified even when the subprocess exits zero', async () => {
    const output = captureOutput();
    const target = createTarget('full-target');

    const status = await main(['run'], async () => [workerChange], { targets: [target] });

    expect(status).toBe(1);
    expect(target.runner.run).toHaveBeenCalledExactlyOnceWith(inventory, process.cwd());
    expect(output()).toContain('Vitest execution evidence: incomplete (unavailable)');
    expect(output()).toContain('Vitest shutdown: unverified');
    expect(output()).toContain('Vitest subprocess exit: 0');
  });

  it('uses ordinary selection when the opted-in target has no detected mapping gap', async () => {
    const output = captureOutput();
    const target = createTarget('full-target', { selection: { selectedTests: [knownTest], unmappedChanges: [] } });

    const status = await main(['run'], async () => [workerChange], { targets: [target] });

    expect(status).toBe(0);
    expect(target.runner.run).toHaveBeenCalledExactlyOnceWith([knownTest], process.cwd());
    expect(output()).not.toContain('Full-target fallback');
  });

  it('preserves the ordinary config-change run without claiming fallback', async () => {
    const output = captureOutput();
    const target = createTarget('full-target');
    const configChange: GitChange = { status: 'modified', path: 'forge.config.json' };

    const status = await main(['run'], async () => [configChange], { targets: [target] });

    expect(status).toBe(0);
    expect(target.planSelection).not.toHaveBeenCalled();
    expect(target.runner.run).toHaveBeenCalledExactlyOnceWith(inventory, process.cwd());
    expect(output()).not.toContain('Full-target fallback');
  });

  it('refuses an unmatched change before executing an eligible target', async () => {
    const output = captureOutput();
    const target = createTarget('full-target');
    const unmatched: GitChange = { status: 'modified', path: 'outside.ts' };

    const status = await main(['run'], async () => [workerChange, unmatched], { targets: [target] });

    expect(status).toBe(1);
    expect(target.runner.run).not.toHaveBeenCalled();
    expect(output()).toContain('Selection incomplete. Some changes have no validation target.');
  });

  it('refuses fallback before executing either affected target', async () => {
    const output = captureOutput();
    const target = createTarget('full-target');
    const secondTarget = createTarget(undefined, {
      id: 'internal.sibling',
      root: 'sibling/',
      selection: { selectedTests: ['sibling/known.test.ts'], unmappedChanges: [] },
    });
    const siblingChange: GitChange = { status: 'modified', path: 'sibling/source.ts' };

    const status = await main(['run'], async () => [workerChange, siblingChange], { targets: [target, secondTarget] });

    expect(status).toBe(1);
    expect(target.runner.run).not.toHaveBeenCalled();
    expect(secondTarget.runner.run).not.toHaveBeenCalled();
    expect(output()).toContain('Full-target fallback refused: exactly one affected validation target is required.');
  });

  it('refuses a rename because fallback cannot establish the scope of both paths', async () => {
    const output = captureOutput();
    const renamed: GitChange = { status: 'renamed', previousPath: 'outside.ts', path: workerChange.path };
    const target = createTarget('full-target', { selection: { selectedTests: [], unmappedChanges: [renamed] } });

    const status = await main(['run'], async () => [renamed], { targets: [target] });

    expect(status).toBe(1);
    expect(target.runner.run).not.toHaveBeenCalled();
    expect(output()).toContain('Full-target fallback refused: renames require a known scope for both paths.');
  });

  it('refuses an unsupported runner even if the target opted in', async () => {
    const output = captureOutput();
    const target = createTarget('full-target', { runnerId: 'maven' });

    const status = await main(['run'], async () => [workerChange], { targets: [target] });

    expect(status).toBe(1);
    expect(target.runner.run).not.toHaveBeenCalled();
    expect(output()).toContain('Full-target fallback refused: internal.forge-tests does not support fallback.');
  });

  it.each(['empty', 'unavailable'])('refuses a target with %s discovery', async (reason) => {
    const output = captureOutput();
    const target = createTarget('full-target', {
      files: [],
      selection: { selectedTests: [], unmappedChanges: [workerChange] },
    });
    if (reason === 'unavailable') target.discoverTestFiles.mockRejectedValue(new Error('Vitest discovery failed'));

    const status = await main(['run'], async () => [workerChange], { targets: [target] });

    expect(status).toBe(1);
    expect(target.runner.run).not.toHaveBeenCalled();
    expect(output()).toContain(
      reason === 'empty'
        ? 'Full-target fallback refused: internal.forge-tests has no discovered test files.'
        : 'Vitest discovery failed',
    );
  });
});

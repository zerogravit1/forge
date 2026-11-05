import { readCliOptions } from './config/cli-options.js';
import { getGitChanges } from './changes/git-changes.js';
import { discoverVitestTestFiles } from './discovery/vitest-test-files.js';
import { planTestSelection } from './selection/plan-test-selection.js';
import { createVitestRunner } from './execution/vitest-runner.js';

import type { TestRunner } from './execution/test-runner.js';
import type { ValidationTarget } from './validation/validation-target.js';
import type { SelectionResult } from './selection/select-tests.js';

import { planValidationTargets } from './validation/plan-validation-targets.js';
import { loadForgeConfig } from './config/load-forge-config.js';
import { resolveTargetConfigs } from './config/resolve-target-configs.js';
import { createValidationTargets } from './validation/create-validation-targets.js';

interface LegacyCliServices {
  discoverTestFiles: typeof discoverVitestTestFiles;
  planSelection: typeof planTestSelection;
  runner?: TestRunner;
}

interface TargetCliServices {
  targets: ValidationTarget[];
}

type CliServices = LegacyCliServices | TargetCliServices;

// const javaProject = 'examples/java-orders';

// const javaAnalyzer = createJavaAnalyzer([`${javaProject}/src/main/java`, `${javaProject}/src/test/java`]);

// const defaultServices: CliServices = {
//   discoverTestFiles: discoverVitestTestFiles,
//   planSelection: planTestSelection,
//   runner: createVitestRunner(),
// };

const defaultServices: CliServices = {
  targets: [
    {
      id: 'vitest',
      includesChange: (change) => change.path.startsWith('src/'),
      discoverTestFiles: discoverVitestTestFiles,
      planSelection: planTestSelection,
      runner: createVitestRunner(),
    },
    {
      id: 'java-orders',
      includesChange: (change) => change.path.startsWith(`${javaProject}/`),
      discoverTestFiles: (repoRoot) => discoverJavaTestFiles(repoRoot, javaProject),
      planSelection: (changes, testFiles, repoRoot) => planTestSelection(changes, testFiles, repoRoot, javaAnalyzer),
      runner: createMavenRunner(javaProject),
    },
  ],
};

export async function main(
  args = process.argv.slice(2),
  getChanges = getGitChanges,
  services?: CliServices,
): Promise<number> {
  try {
    const options = readCliOptions(args);

    if (!services) {
      const repoRoot = process.cwd();

      const config = await loadForgeConfig(repoRoot);
      const resolved = resolveTargetConfigs(config);

      services = {
        targets: createValidationTargets(config, resolved),
      };
    }

    switch (options.command) {
      case 'plan': {
        const changes = await getChanges(options);

        if (changes.length === 0) {
          process.stdout.write('No changes detected.\n');
          return 0;
        }

        const repoRoot = process.cwd();

        let selection: SelectionResult;

        if ('targets' in services) {
          const result = await planValidationTargets(changes, services.targets, repoRoot);

          selection = {
            selectedTests: result.plans.flatMap((plan) => plan.selection.selectedTests),
            unmappedChanges: [
              ...result.unmatchedChanges,
              ...result.plans.flatMap((plan) => plan.selection.unmappedChanges),
            ],
          };
        } else {
          const testFiles = await services.discoverTestFiles(repoRoot);
          selection = await services.planSelection(changes, testFiles, repoRoot);
        }

        const fileLabel = changes.length === 1 ? 'file' : 'files';

        process.stdout.write(`Detected ${changes.length} changed ${fileLabel}:\n`);

        for (const change of changes) {
          const path = change.previousPath ? `${change.previousPath} -> ${change.path}` : change.path;

          process.stdout.write(`${change.status}\t${path}\n`);
        }

        process.stdout.write('\nSelected tests:\n');

        if (selection.selectedTests.length === 0) {
          process.stdout.write('  None\n');
        } else {
          for (const testFile of selection.selectedTests) {
            process.stdout.write(`  ${testFile}\n`);
          }
        }

        process.stdout.write('\nUnmapped changes:\n');

        if (selection.unmappedChanges.length === 0) {
          process.stdout.write('  None\n');
        } else {
          for (const change of selection.unmappedChanges) {
            process.stdout.write(`  ${change.status}\t${change.path}\n`);
          }
        }

        const unmappedCount = selection.unmappedChanges.length;

        if (unmappedCount > 0) {
          const changeLabel = unmappedCount === 1 ? 'change has' : 'changes have';

          process.stdout.write(`\nSelection incomplete: ${unmappedCount} ${changeLabel} no known test mapping.\n`);
        }

        return 0;
      }

      case 'run': {
        const changes = await getChanges(options);

        if (changes.length === 0) {
          process.stdout.write('No changes detected.\n');
          return 0;
        }

        const repoRoot = process.cwd();

        if ('targets' in services) {
          const { plans, unmatchedChanges } = await planValidationTargets(changes, services.targets, repoRoot);

          if (unmatchedChanges.length > 0) {
            console.error('Selection incomplete. Some changes have no validation target.');
            return 1;
          }

          if (plans.some((plan) => plan.selection.unmappedChanges.length > 0)) {
            console.error('Selection incomplete. Execution requires a fallback policy.');
            return 1;
          }

          let exitCode = 0;
          let executed = false;

          for (const plan of plans) {
            if (plan.selection.selectedTests.length === 0) {
              continue;
            }

            executed = true;

            const result = await plan.target.runner.run(plan.selection.selectedTests, repoRoot);

            if (result.exitCode !== 0) {
              exitCode = 1;
            }
          }

          if (!executed) {
            process.stdout.write('No tests selected.\n');
          }

          return exitCode;
        }

        const testFiles = await services.discoverTestFiles(repoRoot);
        const selection = await services.planSelection(changes, testFiles, repoRoot);

        if (selection.unmappedChanges.length > 0) {
          console.error('Selection incomplete. Execution requires a fallback policy.');
          return 1;
        }

        if (selection.selectedTests.length === 0) {
          process.stdout.write('No tests selected.\n');
          return 0;
        }

        const runner = services.runner ?? createVitestRunner();
        const result = await runner.run(selection.selectedTests, repoRoot);

        return result.exitCode;
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

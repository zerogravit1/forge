import { readCliOptions } from './config/cli-options.js';
import { getGitChanges } from './changes/git-changes.js';
import { discoverVitestTestFiles } from './discovery/vitest-test-files.js';
import { planTestSelection } from './selection/plan-test-selection.js';

interface CliServices {
  discoverTestFiles: typeof discoverVitestTestFiles;
  planSelection: typeof planTestSelection;
}

const defaultServices: CliServices = {
  discoverTestFiles: discoverVitestTestFiles,
  planSelection: planTestSelection,
};

export async function main(
  args = process.argv.slice(2),
  getChanges = getGitChanges,
  services: CliServices = defaultServices,
): Promise<number> {
  try {
    const options = readCliOptions(args);

    switch (options.command) {
      case 'plan': {
        const changes = await getChanges(options);

        if (changes.length === 0) {
          process.stdout.write('No changes detected.\n');
          return 0;
        }

        const repoRoot = process.cwd();

        const testFiles = await services.discoverTestFiles(repoRoot);

        const selection = await services.planSelection(changes, testFiles, repoRoot);

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

        return 0;
      }

      case 'run':
        console.error('Run is not implemented yet');
        return 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

import { readCliOptions } from './config/cli-options.js';
import { getGitChanges } from './changes/git-changes.js';

export async function main(
  args = process.argv.slice(2),
  getChanges = getGitChanges,
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

        process.stdout.write(
          `Detected ${changes.length} changed files:\n`,
        );

        for (const change of changes) {
          const path = change.previousPath
            ? `${change.previousPath} -> ${change.path}`
            : change.path;

          process.stdout.write(
            `${change.status}\t${path}\n`,
          );
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

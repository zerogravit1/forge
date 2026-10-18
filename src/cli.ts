import { runCommand } from './execution/command-runner.js';
import { readCliOptions } from './config/cli-options.js';

export async function main(args = process.argv.slice(2), execute = runCommand): Promise<number> {
  try {
    const options = readCliOptions(args);

    switch (options.command) {
      case 'plan': {
        const revisions = options.mergeBase ? [`${options.from}...${options.to}`] : [options.from, options.to];

        return await execute('git', ['diff', '--name-status', '--find-renames', ...revisions]);
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

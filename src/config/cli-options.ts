import { parseArgs } from 'node:util';

export type ForgeCommand = 'plan' | 'run';

export interface CliOptions {
  command: ForgeCommand;
  from: string;
  to: string;
  mergeBase: boolean;
}

export function readCliOptions(args: string[]): CliOptions {
  const [command, ...rest] = args;

  if (command !== 'plan' && command !== 'run') {
    throw new Error(command ? `Unknown command: ${command}` : 'Missing command. Expected: plan or run');
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      from: { type: 'string', default: 'HEAD~1' },
      to: { type: 'string', default: 'HEAD' },
      'merge-base': { type: 'boolean', default: false },
    },
    strict: true,
  });

  const from = values.from ?? 'HEAD~1';
  const to = values.to ?? 'HEAD';

  if (!from.trim() || !to.trim()) {
    throw new Error('Git references cannot be empty');
  }

  return {
    command,
    from,
    to,
    mergeBase: values['merge-base'] ?? false,
  };
}

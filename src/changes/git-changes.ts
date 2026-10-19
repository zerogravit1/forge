import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed';
  
export interface GitChange {
  status: ChangeStatus;
  path: string;
  previousPath?: string;
}

export interface GitComparisonOptions {
  from: string;
  to: string;
  mergeBase?: boolean;
  cwd?: string;
}

export type GitExecutor = (
  args: string[],
  cwd?: string,
) => Promise<string>;

async function captureGit(
  args: string[],
  cwd?: string,
): Promise<string> {
  const {stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  return stdout;
}

export async function getGitChanges(
  options: GitComparisonOptions,
  execute: GitExecutor = captureGit,
): Promise<GitChange[]> {
  const { from, to, mergeBase = false, cwd } = options;

  if (
    !from.trim() ||
    !to.trim() ||
    from.startsWith('-') ||
    to.startsWith('-')
  ) {
    throw new Error('Invalid Git revision');
  }

  const revisions = mergeBase
    ? [`${from}...${to}`]
    : [from, to];

  const output = await execute(
    [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      ...revisions,
      '--',
    ],
    cwd,
  );

  return parseGitChanges(output);
}

export function parseGitChanges(
  output: string,
): GitChange[] {
  if (!output) {
    return [];
  }

  if (!output.endsWith('\0')) {
    throw new Error('Malformed Git diff output');
  }

  const fields = output.slice(0, -1).split('\0');
  const changes: GitChange[] = [];
  let index = 0;

  function nextField(): string {
    const value = fields[index++];

    if (!value) {
      throw new Error('Malformed Git diff output');
    }

    return value;
  }

  while (index < fields.length) {
    const rawStatus = nextField();
    const status = rawStatus[0];

    switch (status) {
      case 'A':
        changes.push({
          status: 'added',
          path: nextField(),
        });
        break;

      case 'M':
        changes.push({
          status: 'modified',
          path: nextField(),
        });
        break;

      case 'D':
        changes.push({
          status: 'deleted',
          path: nextField(),
        });
        break;

      case 'R': {
        const previousPath = nextField();
        const path = nextField();

        changes.push({
          status: 'renamed',
          path,
          previousPath
        });
        break;
      }

      default:
        throw new Error(
          `Unsupported Git change status: ${rawStatus}`,
        );
    }
  }

  return changes;
}
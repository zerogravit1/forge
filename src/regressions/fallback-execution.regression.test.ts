import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type TempRepository, withTempRepository } from '../helpers/temp-repo.js';

const project = 'packages/app';
const reportFile = 'app-results.json';
const intendedFiles = ['tests/App.test.ts', 'tests/Extra.test.ts', 'tests/Skipped.test.ts'];

interface FixtureOptions {
  fullTarget: boolean;
  failExtra: boolean;
  skipCase: boolean;
}

async function writeFixture(repo: TempRepository, options: FixtureOptions) {
  await repo.linkNodeModules();
  const target = {
    root: 'apps.app',
    adapter: ['ts'],
    runner: ['vitest'],
    ...(options.fullTarget ? { execution: { onUnmappedChanges: 'full-target' } } : {}),
  };

  await repo.write(
    'forge.config.json',
    JSON.stringify({
      version: '1.0.0',
      roots: { apps: { app: { path: project, sources: ['src'], tests: ['tests'] } } },
      adapters: { ts: { type: 'typescript' } },
      runners: { vitest: { type: 'vitest' } },
      targets: { apps: { tests: target } },
    }),
  );
  await repo.write(
    `${project}/vitest.config.mjs`,
    `export default {
      test: {
        name: 'app',
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        maxWorkers: 1,
        reporters: ['json'],
        outputFile: '${reportFile}'
      }
    };`,
  );
  await repo.write(`${project}/src/mapped.ts`, 'export const mapped = 1;');
  await repo.write(`${project}/src/unmapped.ts`, 'export const unmapped = 1;');
  await repo.write(
    `${project}/tests/App.test.ts`,
    `import { expect, test } from 'vitest';
     import { mapped } from '../src/mapped.js';
     test('mapped consumer', () => expect(mapped).toBe(2));`,
  );
  await repo.write(
    `${project}/tests/Extra.test.ts`,
    `import { expect, test } from 'vitest';
     test('otherwise unselected test', () => expect(true).toBe(${!options.failExtra}));`,
  );
  await repo.write(
    `${project}/tests/Skipped.test.ts`,
    `import { expect, test } from 'vitest';
     ${options.skipCase ? 'test.skip' : 'test'}('native skip control', () => expect(true).toBe(${!options.skipCase}));`,
  );
  // Vitest can discover this same-basename file, but Forge's configured test root excludes it.
  await repo.write(
    `${project}/src/App.test.ts`,
    `import { expect, test } from 'vitest';
     test('out-of-scope sentinel', () => expect(true).toBe(false));`,
  );
}

async function changeSources(repo: TempRepository) {
  await repo.write(`${project}/src/mapped.ts`, 'export const mapped = 2;');
  await repo.write(`${project}/src/unmapped.ts`, 'export const unmapped = 2;');
}

async function makeComparison(repo: TempRepository) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo.root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Forge Test');
  git('config', 'user.email', 'forge@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  // Keep the policy fixed across the comparison to avoid the config-change path.
  git('add', '--', 'forge.config.json', project);
  git('commit', '-qm', 'Configure and seed target');
  await changeSources(repo);
  git('add', '--', project);
  git('commit', '-qm', 'Modify mapped and unmapped sources');
}

function runForge(repo: TempRepository, command: 'plan' | 'run') {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('src/index.ts'), command, '--from', 'HEAD~1', '--to', 'HEAD'],
    { cwd: repo.root, encoding: 'utf8', timeout: 20_000 },
  );
  expect(result.error).toBeUndefined();
  return result;
}

async function readObservedCases(repo: TempRepository) {
  const report = JSON.parse(await readFile(repo.path(project, reportFile), 'utf8')) as {
    testResults: { name: string; assertionResults: { title: string; status: string }[] }[];
  };
  const projectRoot = repo.path(project);
  const files = report.testResults.map(({ name }) => relative(projectRoot, name).split(sep).join('/'));
  expect(files.sort()).toEqual(intendedFiles);

  return report.testResults
    .flatMap(({ name, assertionResults }) =>
      assertionResults.map(({ title, status }) => ({
        file: relative(projectRoot, name).split(sep).join('/'),
        title,
        status,
      })),
    )
    .sort((left, right) => left.file.localeCompare(right.file));
}

describe('Configured fallback execution', () => {
  it('refuses detected unmapped changes with the default policy', async () => {
    await withTempRepository('forge-fallback-strict-', async (repo) => {
      await writeFixture(repo, { fullTarget: false, failExtra: true, skipCase: true });
      await makeComparison(repo);

      const result = runForge(repo, 'run');
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain('Selection incomplete. Execution requires a fallback policy.');
      await expect(readFile(repo.path(project, reportFile), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  }, 60_000);

  it.each([
    {
      name: 'executes the extra failure, preserves a native skip, and excludes the sentinel',
      failExtra: true,
      skipCase: true,
    },
    { name: 'keeps exit 1 when the observed fallback tests all pass', failExtra: false, skipCase: false },
  ])(
    '$name',
    async ({ failExtra, skipCase }) => {
      const options = { fullTarget: true, failExtra, skipCase };
      const expected = [
        { file: 'tests/App.test.ts', title: 'mapped consumer', status: 'passed' },
        { file: 'tests/Extra.test.ts', title: 'otherwise unselected test', status: failExtra ? 'failed' : 'passed' },
        { file: 'tests/Skipped.test.ts', title: 'native skip control', status: skipCase ? 'skipped' : 'passed' },
      ];

      // A separate native run uses the fixture's declared scope as an independent oracle.
      await withTempRepository('forge-fallback-native-', async (repo) => {
        await writeFixture(repo, options);
        await changeSources(repo);
        const native = spawnSync(
          process.execPath,
          [resolve('node_modules/vitest/vitest.mjs'), 'run', ...intendedFiles],
          { cwd: repo.path(project), encoding: 'utf8', timeout: 20_000 },
        );
        expect(native.error).toBeUndefined();
        expect(native.status, native.stdout + native.stderr).toBe(failExtra ? 1 : 0);
        expect(await readObservedCases(repo)).toEqual(expected);
      });

      await withTempRepository('forge-fallback-run-', async (repo) => {
        await writeFixture(repo, options);
        await makeComparison(repo);

        const plan = runForge(repo, 'plan');
        expect(plan.status, plan.stderr).toBe(0);
        expect(plan.stdout).toContain(`Selected tests:\n  ${project}/tests/App.test.ts\n\nUnmapped changes:\n`);
        expect(plan.stdout).toContain(`Unmapped changes:\n  modified\t${project}/src/unmapped.ts\n`);

        const result = runForge(repo, 'run');
        const output = result.stdout + result.stderr;
        expect(result.status, output).toBe(1);
        expect(output).toContain('Full-target fallback: apps.tests');
        expect(output).toContain('Selection incomplete: original test mapping remains incomplete.');
        expect(output).toContain('Originally selected test files:');
        expect(output).toContain('Fallback test files:');
        expect(output).toContain(`Vitest execution evidence: ${skipCase ? 'incomplete' : 'complete'}`);
        expect(output).toContain('Observed Vitest specifications (project-relative):');
        expect(output).toContain('Vitest shutdown: completed');
        expect(output).toContain(`Vitest subprocess exit: ${failExtra ? 1 : 0}`);
        if (skipCase) expect(output).toContain('0 passed, 0 failed, 1 skipped, 0 pending');
        expect(await readObservedCases(repo)).toEqual(expected);
      });
    },
    60_000,
  );
});

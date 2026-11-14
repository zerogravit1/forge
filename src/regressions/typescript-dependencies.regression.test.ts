import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

import { planTestSelection } from '../selection/plan-test-selection.js';
import { createVitestRunner } from '../execution/vitest-runner.js';

type VitestReport = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: Array<{
    name: string;
    status?: string;
    message?: string;
    assertionResults: Array<{
      status: string;
      failureMessages: string[];
    }>;
  }>;
};

describe('TypeScript regression baseline', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'forge-typescript-regression-'));
    await mkdir(join(repoRoot, 'src'));
    await writeFile(join(repoRoot, 'src/value.ts'), 'export const value = 2;');
    await writeFile(join(repoRoot, 'src/other.ts'), 'export const other = 1;');
    await writeFile(
      join(repoRoot, 'src/static.test.ts'),
      `import { it, expect } from 'vitest';
import { value } from './value.js';
it('accepts integer values', () => expect(Number.isInteger(value)).toBe(true));`,
    );
    await writeFile(
      join(repoRoot, 'src/unrelated.test.ts'),
      `import { it, expect } from 'vitest';
import { other } from './other.js';
it('reads another module', () => expect(other).toBe(1));`,
    );
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('#13 selects and executes literal dynamic-import consumers', async () => {
    await writeFile(
      join(repoRoot, 'src/dynamic.test.ts'),
      `import { it, expect } from 'vitest';
it('expects the original value', async () => {
  const { value } = await import('./value.js');
  expect(value).toBe(1);
});`,
    );
    const testFiles = ['src/static.test.ts', 'src/dynamic.test.ts', 'src/unrelated.test.ts'];

    const affected = await planTestSelection([{ status: 'modified', path: 'src/value.ts' }], testFiles, repoRoot);

    expect.soft([...affected.selectedTests].sort()).toEqual(['src/dynamic.test.ts', 'src/static.test.ts']);
    expect.soft(affected.selectedTests).not.toContain('src/unrelated.test.ts');
    expect.soft(affected.unmappedChanges).toEqual([]);

    const unrelated = await planTestSelection([{ status: 'modified', path: 'src/other.ts' }], testFiles, repoRoot);
    expect.soft(unrelated.selectedTests).toEqual(['src/unrelated.test.ts']);

    await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

    await writeFile(
      join(repoRoot, 'vitest.config.mjs'),
      `export default {
        test: {
          include: ['src/**/*.test.ts'],
          maxWorkers: 1,
          reporters: ['json'],
          outputFile: 'results.json'
        },
      };`,
    );

    const runner = createVitestRunner();
    const result = await runner.run(affected.selectedTests, repoRoot);

    expect(result.exitCode).toBe(1);

    const report = JSON.parse(await readFile(join(repoRoot, 'results.json'), 'utf8')) as VitestReport;

    expect(report).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
    });

    expect(report.testResults.map(({ name }) => relative(repoRoot, name).replaceAll('\\', '/')).sort()).toEqual([
      'src/dynamic.test.ts',
      'src/static.test.ts',
    ]);
  });

  it('#14 resolves project-local aliases without selecting unrelated tests', async () => {
    const config = {
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        paths: { '@app/*': ['./src/*'] },
      },
    };
    await writeFile(join(repoRoot, 'tsconfig.json'), JSON.stringify(config));

    await writeFile(
      join(repoRoot, 'src/alias.test.ts'),
      `import { it, expect } from 'vitest';
import { value } from '@app/value.js';
it('expects the original value', () => expect(value).toBe(1));`,
    );

    // Confirm the fixture's alias is valid independently of Forge's resolver.
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, repoRoot);
    const resolved = ts.resolveModuleName('@app/value.js', join(repoRoot, 'src/alias.test.ts'), parsed.options, ts.sys);
    expect(resolved.resolvedModule?.resolvedFileName).toBe(join(repoRoot, 'src/value.ts'));

    const testFiles = ['src/static.test.ts', 'src/alias.test.ts', 'src/unrelated.test.ts'];
    const affected = await planTestSelection([{ status: 'modified', path: 'src/value.ts' }], testFiles, repoRoot);

    expect.soft([...affected.selectedTests].sort()).toEqual(['src/alias.test.ts', 'src/static.test.ts']);
    expect.soft(affected.selectedTests).not.toContain('src/unrelated.test.ts');
    expect.soft(affected.unmappedChanges).toEqual([]);

    const unrelated = await planTestSelection([{ status: 'modified', path: 'src/other.ts' }], testFiles, repoRoot);
    expect.soft(unrelated.selectedTests).toEqual(['src/unrelated.test.ts']);

    await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

    await writeFile(
      join(repoRoot, 'vitest.config.mjs'),
      `export default {
        resolve: {
          alias: {
            '@app': new URL('./src', import.meta.url).pathname,
          },
        },
        test: {
          include: ['src/**/*.test.ts'],
          maxWorkers: 1,
          reporters: ['json'],
          outputFile: 'results.json'
        },
      };`,
    );

    const runner = createVitestRunner();
    const result = await runner.run(affected.selectedTests, repoRoot);

    expect(result.exitCode).toBe(1);

    const report = JSON.parse(await readFile(join(repoRoot, 'results.json'), 'utf8')) as VitestReport;

    expect(report).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
    });

    expect(report.testResults.map(({ name }) => relative(repoRoot, name).replaceAll('\\', '/')).sort()).toEqual([
      'src/alias.test.ts',
      'src/static.test.ts',
    ]);

    const aliasResult = report.testResults.find(({ name }) => name.endsWith('alias.test.ts'));

    expect(aliasResult?.status).toBe('failed');

    expect(aliasResult?.assertionResults).toEqual([
      expect.objectContaining({
        status: 'failed',
        failureMessages: expect.arrayContaining([expect.stringContaining('expected 2 to be 1')]),
      }),
    ]);
  });

  it('#13 conservatively selects tests with nonliteral dynamic imports', async () => {
    await writeFile(
      join(repoRoot, 'src/runtime.test.ts'),
      `
      function getModuleName(): string {
        return process.env.MODULE_PATH ?? './value.js';
      }
      
      export async function load() {
        const moduleName = getModuleName();
        return import(moduleName);
      }
      `,
    );

    const testFiles = ['src/static.test.ts', 'src/runtime.test.ts', 'src/unrelated.test.ts'];
    const affected = await planTestSelection([{ status: 'modified', path: 'src/value.ts' }], testFiles, repoRoot);

    expect([...affected.selectedTests].sort()).toEqual(['src/runtime.test.ts', 'src/static.test.ts']);
    expect(affected.unmappedChanges).toEqual([]);

    const unrelated = await planTestSelection([{ status: 'modified', path: 'src/other.ts' }], testFiles, repoRoot);

    expect([...unrelated.selectedTests].sort()).toEqual(['src/runtime.test.ts', 'src/unrelated.test.ts']);
    expect(unrelated.unmappedChanges).toEqual([]);
  });

  it('#13 selects and executes JSX-nested dynamic imports', async () => {
    await writeFile(
      join(repoRoot, 'src/dynamic-tsx.test.tsx'),
      `/** @jsxRuntime classic */
      /** @jsx h */
      import { it, expect} from 'vitest';

      // Minimal JSX factory so React isn't required.
      function h(_tag: string, _props: unknown, child: unknown) {
        return child;
      }

      it('detects a changed value through a JSX-nested import', async () => {
        const module = await (
          <div>{import('./value.js')}</div> as unknown as
            Promise<{ value: number }>
        );

        expect(module.value).toBe(1);
      });`,
    );

    const testFiles = ['src/static.test.ts', 'src/dynamic-tsx.test.tsx', 'src/unrelated.test.ts'];

    const affected = await planTestSelection([{ status: 'modified', path: 'src/value.ts' }], testFiles, repoRoot);

    expect([...affected.selectedTests].sort()).toEqual(['src/dynamic-tsx.test.tsx', 'src/static.test.ts']);

    expect(affected.unmappedChanges).toEqual([]);
    expect(affected.selectedTests).not.toContain('src/unrelated.test.ts');

    await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

    await writeFile(
      join(repoRoot, 'vitest.config.mjs'),
      `export default {
        test: {
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          maxWorkers: 1,
          reporters: ['json'],
          outputFile: 'results.json'
        }
      };`,
    );

    const runner = createVitestRunner();
    const result = await runner.run(affected.selectedTests, repoRoot);

    expect(result.exitCode).toBe(1);

    const report = JSON.parse(await readFile(join(repoRoot, 'results.json'), 'utf8')) as VitestReport;

    expect(report).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
    });

    expect(report.testResults.map(({ name }) => relative(repoRoot, name).replaceAll('\\', '/')).sort()).toEqual([
      'src/dynamic-tsx.test.tsx',
      'src/static.test.ts',
    ]);

    const tsxResult = report.testResults.find(({ name }) => name.endsWith('dynamic-tsx.test.tsx'));

    expect(tsxResult?.assertionResults).toEqual([
      expect.objectContaining({
        status: 'failed',
        failureMessages: expect.arrayContaining([expect.stringContaining('expected 2 to be 1')]),
      }),
    ]);
  });

  it('#14 propagates unresolved aliases through indirect dependencies', async () => {
    await writeFile(
      join(repoRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          paths: {
            '@app/*': ['./src/*'],
          },
        },
      }),
    );

    await writeFile(
      join(repoRoot, 'src/service.ts'),
      "import { missing } from '@app/missing.js'; export const service = 1;",
    );

    await writeFile(join(repoRoot, 'src/indirect.test.ts'), "import { service } from './service.js';");

    const testFiles = ['src/static.test.ts', 'src/indirect.test.ts', 'src/unrelated.test.ts'];

    const changedValue = await planTestSelection([{ status: 'modified', path: 'src/value.ts' }], testFiles, repoRoot);

    expect([...changedValue.selectedTests].sort()).toEqual(['src/indirect.test.ts', 'src/static.test.ts']);

    expect(changedValue.unmappedChanges).toEqual([]);

    const changedOther = await planTestSelection([{ status: 'modified', path: 'src/other.ts' }], testFiles, repoRoot);

    expect([...changedOther.selectedTests].sort()).toEqual(['src/indirect.test.ts', 'src/unrelated.test.ts']);

    expect(changedOther.unmappedChanges).toEqual([]);
  });

  it('#14 preserves project configuration for shared source dependencies', async () => {
    await mkdir(join(repoRoot, 'src/shared'), { recursive: true });
    await mkdir(join(repoRoot, 'src/project/ui'), { recursive: true });

    await writeFile(
      join(repoRoot, 'src/project/tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          paths: {
            '@app/*': ['./ui/*'],
          },
        },
        include: ['ui', '../shared'],
      }),
    );

    await writeFile(
      join(repoRoot, 'src/project/ui/value.ts'),
      'export const value = 2;',
    );

    await writeFile(
      join(repoRoot, 'src/shared/service.ts'),
      "export { value } from '@app/value.js';",
    );

    await writeFile(
      join(repoRoot, 'src/project/ui/service.test.ts'),
      `import { it, expect } from 'vitest';
      import { value } from '../../shared/service.js';

      it('expects the original shared value', () => {
        expect(value).toBe(1);
      });`
    );

    await writeFile(
      join(repoRoot, 'src/project/ui/static.test.ts'),
      `import { it, expect } from 'vitest';
      import { value } from './value.js';

      it('accepts integer values', () => {
        expect(Number.isInteger(value)).toBe(true);
      });`,
    );

    await writeFile(
      join(repoRoot, 'src/project/ui/unrelated.test.ts'),
      `import { it, expect} from 'vitest';
      import { other } from '../../other.js';

      it('reads an unrelated value', () => {
        expect(other).toBe(1);
      });`
    );

    const testFiles = [
      'src/project/ui/service.test.ts',
      'src/project/ui/static.test.ts',
      'src/project/ui/unrelated.test.ts',
    ];

    const affected = await planTestSelection(
      [{ status: 'modified', path: 'src/project/ui/value.ts' }],
      testFiles,
      repoRoot,
    );

    expect([...affected.selectedTests].sort()).toEqual([
      'src/project/ui/service.test.ts',
      'src/project/ui/static.test.ts',
    ]);

    expect(affected.selectedTests).not.toContain(
      'src/project/ui/unrelated.test.ts',
    );

    expect(affected.unmappedChanges).toEqual([]);

    await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

    await writeFile(
      join(repoRoot, 'vitest.config.mjs'),
      `export default {
        resolve: {
          alias: {
            '@app': new URL('./src/project/ui', import.meta.url).pathname,
          },
        },
        test: {
          include: ['src/**/*.test.ts'],
          maxWorkers: 1,
          reporters: ['json'],
          outputFile: 'results.json',
        },
      };`,
    );

    const runner = createVitestRunner();
    const result = await runner.run(affected.selectedTests, repoRoot);

    expect(result.exitCode).toBe(1);

    const report = JSON.parse(
      await readFile(join(repoRoot, 'results.json'), 'utf8'),
    ) as VitestReport;

    expect(report).toMatchObject({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
    });

    expect(
      report.testResults
        .map(({ name }) => relative(repoRoot, name).replaceAll('\\', '/'))
        .sort(),
    ).toEqual([
      'src/project/ui/service.test.ts',
      'src/project/ui/static.test.ts',
    ]);

    const serviceResult = report.testResults.find(({ name }) =>
      name.endsWith('service.test.ts'),
    );

    expect(serviceResult?.status).toBe('failed');

    expect(serviceResult?.assertionResults).toEqual([
      expect.objectContaining({
        status: 'failed',
        failureMessages: expect.arrayContaining([
          expect.stringContaining('expected 2 to be 1'),
        ]),
      }),
    ]);

    const fullResult = await runner.run(testFiles, repoRoot);

    expect(fullResult.exitCode).toBe(1);

    const fullReport = JSON.parse(
      await readFile(join(repoRoot, 'results.json'), 'utf8'),
    ) as VitestReport;

    expect(fullReport).toMatchObject({
      numTotalTests: 3,
      numPassedTests: 2,
      numFailedTests: 1,
    });
  });

  it('#14 preserves multi-project configuration for shared source dependencies', async () => {
    await mkdir(join(repoRoot, 'src/shared'), { recursive: true });
    await mkdir(join(repoRoot, 'src/project-a/ui'), { recursive: true });
    await mkdir(join(repoRoot, 'src/project-b/ui'), { recursive: true });

    for (const project of ['project-a', 'project-b']) {
      await writeFile(
        join(repoRoot, `src/${project}/tsconfig.json`),
        JSON.stringify({
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '@app/*': ['./ui/*'],
            },
          },
          include: ['ui', '../shared'],
        }),
      );

      await writeFile(
        join(repoRoot, `src/${project}/ui/service.test.ts`),
        `import { it, expect } from 'vitest';
        import { value } from '../../shared/service.js';

        it('expects the original shared value', () => {
          expect(value).toBe(1);
        });`
      );

      await writeFile(
        join(repoRoot, `src/${project}/ui/static.test.ts`),
        `import { it, expect } from 'vitest';
        import { value } from './value.js';

        it('accepts integer values', () => {
          expect(Number.isInteger(value)).toBe(true);
        });`,
      );

      await writeFile(
        join(repoRoot, `src/${project}/ui/unrelated.test.ts`),
        `import { it, expect} from 'vitest';
        import { other } from '../../other.js';

        it('reads an unrelated value', () => {
          expect(other).toBe(1);
        });`
      );
    }

    await writeFile(
      join(repoRoot, 'src/project-a/ui/value.ts'),
      'export const value = 2;',
    );

    await writeFile(
      join(repoRoot, 'src/project-b/ui/value.ts'),
      'export const value = 4;',
    );

    await writeFile(
      join(repoRoot, 'src/shared/service.ts'),
      "export { value } from '@app/value.js';",
    );

    // await writeFile(
    //   join(repoRoot, 'src/project/ui/service.test.ts'),
    //   `import { it, expect } from 'vitest';
    //   import { value } from '../../shared/service.js';

    //   it('expects the original shared value', () => {
    //     expect(value).toBe(1);
    //   });`
    // );

    // await writeFile(
    //   join(repoRoot, 'src/project/ui/static.test.ts'),
    //   `import { it, expect } from 'vitest';
    //   import { value } from './value.js';

    //   it('accepts integer values', () => {
    //     expect(Number.isInteger(value)).toBe(true);
    //   });`,
    // );

    // await writeFile(
    //   join(repoRoot, 'src/project/ui/unrelated.test.ts'),
    //   `import { it, expect} from 'vitest';
    //   import { other } from '../../other.js';

    //   it('reads an unrelated value', () => {
    //     expect(other).toBe(1);
    //   });`
    // );

    const testFiles = [
      'src/project-a/ui/service.test.ts',
      'src/project-a/ui/static.test.ts',
      'src/project-a/ui/unrelated.test.ts',
      'src/project-b/ui/service.test.ts',
      'src/project-b/ui/static.test.ts',
      'src/project-b/ui/unrelated.test.ts',
    ];

    const changedA = await planTestSelection(
      [{ status: 'modified', path: 'src/project-a/ui/value.ts' }],
      testFiles,
      repoRoot
    )

    expect([...changedA.selectedTests].sort()).toEqual([
      'src/project-a/ui/service.test.ts',
      'src/project-a/ui/static.test.ts',
    ]);

    expect(changedA.unmappedChanges).toEqual([]);

    const changedB = await planTestSelection(
      [{ status: 'modified', path: 'src/project-b/ui/value.ts' }],
      testFiles,
      repoRoot
    )

    expect([...changedB.selectedTests].sort()).toEqual([
      'src/project-b/ui/service.test.ts',
      'src/project-b/ui/static.test.ts',
    ]);

    expect(changedB.unmappedChanges).toEqual([]);

    const changedShared = await planTestSelection(
      [{ status: 'modified', path: 'src/shared/service.ts' }],
      testFiles,
      repoRoot,
    );

    expect([...changedShared.selectedTests].sort()).toEqual([
      'src/project-a/ui/service.test.ts',
      'src/project-b/ui/service.test.ts',
    ]);

    expect(changedShared.unmappedChanges).toEqual([]);
  });
});

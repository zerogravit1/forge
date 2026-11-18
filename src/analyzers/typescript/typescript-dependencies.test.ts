import { describe, expect, it } from 'vitest';

import {
  discoverImports,
  resolveImportPath,
  discoverModuleImports,
  discoverRepositoryModules,
} from './typescript-dependencies.js';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withTempRepository } from '../../helpers/temp-repo.js';
import { resolveTestDependencies } from '../../graph/resolve-test-dependencies.js';
import { selectTests } from '../../selection/select-tests.js';

describe('discoverImports', () => {
  it('returns the imports declared in a source file', () => {
    const source = `
      import { calculatorOrder } from './order-service.js';
      import { validateOrder } from './order-validator.js';
    `;

    expect(discoverImports(source)).toEqual(['./order-service.js', './order-validator.js']);
  });

  it('returns no dependencies when the source contains no imports', () => {
    const source = `
      export function calculateOrder(quantity: number, price: number) {
        return quantity * price;
      }
    `;

    expect(discoverImports(source)).toEqual([]);
  });

  it('discovers modules referenced by re-exports', () => {
    const source = `
      export { calculateOrder } from './order-service.js';
      export * from './order-validator.js';
    `;

    expect(discoverImports(source)).toEqual(['./order-service.js', './order-validator.js']);
  });

  it('discovers literal dynamic imports inside functions', () => {
    const source = `
      import { helper } from './helper.js';

      async function loadValue() {
        const { value } = await import('./value.js');
        return value;
      }
    `;

    expect(discoverImports(source)).toEqual(['./helper.js', './value.js']);
  });
});

describe('resolveImportPath', () => {
  it('resolves a JavaScript import to its TypeScript source file', () => {
    const result = resolveImportPath('src/cli.test.ts', './cli.js');

    expect(result).toBeDefined();
    expect(result).toMatch(/src[/\\]cli\.ts$/);
  });

  it('returns undefined when an imported module cannot be resolved', () => {
    const result = resolveImportPath('src/cli.test.ts', './does-not-exist.js');

    expect(result).toBeUndefined();
  });

  it('resolves path aliases using the project tsconfig', async () => {
    await withTempRepository('forge-tsconfig-alias-', async (repo) => {
      await repo.write(
        'tsconfig.json',
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

      await repo.write('src/value.ts', 'export const value = 2;');

      await repo.write('src/alias.test.ts', "import { value } from '@app/value.js';");

      const result = resolveImportPath(repo.path('src/alias.test.ts'), '@app/value.js');

      expect(result).toBe(repo.path('src/value.ts'));
    });
  });

  it('uses the nearest child tsconfig for each source file', async () => {
    await withTempRepository('forge-tsconfig-children-', async (repo) => {
      await repo.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
          },
        }),
      );

      for (const project of ['server', 'web']) {
        await repo.write(
          `apps/${project}/tsconfig.json`,
          JSON.stringify({
            extends: '../../tsconfig.base.json',
            compilerOptions: {
              paths: {
                '@app/*': ['./src/*'],
              },
            },
          }),
        );

        await repo.write(`apps/${project}/src/value.ts`, `export const value = '${project}';`);
        await repo.write(`apps/${project}/src/consumer.test.ts`, "import { value } from '@app/value.js';");

        const result = resolveImportPath(repo.path(`apps/${project}/src/consumer.test.ts`), '@app/value.js');

        expect(result).toBe(repo.path(`apps/${project}/src/value.ts`));
      }
    });
  });

  it('resolves inherited path aliases relative to the base tsconfig', async () => {
    await withTempRepository('forge-tsconfig-inherited-', async (repo) => {
      await repo.write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '@shared/*': ['./shared/*'],
            },
          },
        }),
      );

      await repo.write(
        'apps/server/tsconfig.json',
        JSON.stringify({
          extends: '../../tsconfig.base.json',
        }),
      );

      await repo.write('shared/value.ts', 'export const value = 2;');

      await repo.write('apps/server/src/consumer.test.ts', "import { value } from '@shared/value.js';");

      const result = resolveImportPath(repo.path('apps/server/src/consumer.test.ts'), '@shared/value.js');

      expect(result).toBe(repo.path('shared/value.ts'));
    });
  });
});

describe('discoverModuleImports', () => {
  it('discovers module imports from an actual source file', async () => {
    const result = await discoverModuleImports('src/cli.test.ts', process.cwd());

    expect(result.file).toBe('src/cli.test.ts');
    expect(result.dependencies).toContain('src/cli.ts');
  });

  it('excludes dependencies from node_modules', async () => {
    const result = await discoverModuleImports('src/cli.test.ts', process.cwd());

    expect(result.dependencies).not.toEqual(expect.arrayContaining([expect.stringContaining('node_modules')]));
  });

  it('reports unresolved local imports', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-test-'));

    try {
      await mkdir(join(repoRoot, 'src'));

      await writeFile(join(repoRoot, 'src/example.test.ts'), `import { missingFunction } from './missing.js';`);

      const result = await discoverModuleImports('src/example.test.ts', repoRoot);

      expect(result).toEqual({
        file: 'src/example.test.ts',
        dependencies: [],
        unresolvedDependencies: ['./missing.js'],
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('reports nonliteral dynamic imports as unresolved dependencies', async () => {
    await withTempRepository('forge-dynamic-unresolved-', async (repo) => {
      await repo.write(
        'src/consumer.test.ts',
        `
        const moduleName = './value.js';

        export async function load() {
          return import(moduleName);
        }
        `,
      );

      const result = await discoverModuleImports('src/consumer.test.ts', repo.root);

      expect(result).toEqual({
        file: 'src/consumer.test.ts',
        dependencies: [],
        unresolvedDependencies: ['import(moduleName)'],
      });
    });
  });

  it('reports computed template imports as unresolved dependencies', async () => {
    await withTempRepository('forge-dynamic-template-', async (repo) => {
      await repo.write(
        'src/consumer.test.ts',
        ['export async function load(name: string) {', '  return import(`./modules/${name}.js`);', '}'].join('\n'),
      );

      const result = await discoverModuleImports('src/consumer.test.ts', repo.root);

      expect(result).toEqual({
        file: 'src/consumer.test.ts',
        dependencies: [],
        unresolvedDependencies: ['import(`./modules/${name}.js`)'],
      });
    });
  });

  it('discovers dynamic imports nested in TSX expressions', async () => {
    await withTempRepository('forge-tsx-dynamic-', async (repo) => {
      await repo.write('src/value.ts', 'export const value = 2;');

      await repo.write(
        'src/consumer.test.tsx',
        `
        export function load() {
          return <div>{import('./value.js')}</div>;
        }
        `,
      );

      const result = await discoverModuleImports('src/consumer.test.tsx', repo.root);

      expect(result).toEqual({
        file: 'src/consumer.test.tsx',
        dependencies: ['src/value.ts'],
      });
    });
  });

  it('reports unresolved path aliases without flagging external packages', async () => {
    await withTempRepository('forge-tsconfig-unresolved-', async (repo) => {
      await repo.write(
        'tsconfig.json',
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

      await repo.write(
        'src/consumer.test.ts',
        ["import { missing } from '@app/missing.js';", "import { external } from 'external-packages';"].join('\n'),
      );

      const result = await discoverModuleImports('src/consumer.test.ts', repo.root);

      expect(result).toEqual({
        file: 'src/consumer.test.ts',
        dependencies: [],
        unresolvedDependencies: ['@app/missing.js'],
      });
    });
  });

  it('excludes Node builtins while preserving wildcard alias resolution', async () => {
    await withTempRepository('forge-tsconfig-wildcard-', async (repo) => {
      await repo.write(
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            paths: {
              '*': ['./src/*'],
            },
          },
        }),
      );

      await repo.write('src/value.ts', 'export const value = 1;');

      await repo.write(
        'src/consumer.test.ts',
        [
          "import { join } from 'node:path';",
          "import { value } from 'value.js';",
          "import { missing } from '@app/missing.js';",
        ].join('\n'),
      );

      const result = await discoverModuleImports('src/consumer.test.ts', repo.root);

      expect(result).toEqual({
        file: 'src/consumer.test.ts',
        dependencies: ['src/value.ts'],
        unresolvedDependencies: ['@app/missing.js'],
      });
    });
  });
});

describe('discoverRepositoryModules', () => {
  it('discovers indirect dependencies from source files', async () => {
    const modules = await discoverRepositoryModules(['src/cli.test.ts'], process.cwd());

    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/cli.test.ts',
          testRoot: 'src/cli.test.ts',
          dependencies: expect.arrayContaining(['src/cli.ts']),
        }),
        expect.objectContaining({
          file: 'src/cli.ts',
          testRoot: 'src/cli.test.ts',
          dependencies: expect.arrayContaining(['src/config/cli-options.ts', 'src/changes/git-changes.ts']),
        }),
      ]),
    );
  });

  it('isolates cached modules by Typescript configuration', async () => {
    await withTempRepository('forge-cache-context-', async (repo) => {
      await repo.write('shared/consumer.ts', "import { value } from '@app/value.js';");

      for (const project of ['server', 'web']) {
        await repo.write(
          `apps/${project}/tsconfig.json`,
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

        await repo.write(`apps/${project}/src/value.ts`, `export const value = '${project}';`);

        await repo.write(`apps/${project}/src/consumer.test.ts`, "import '../../../shared/consumer.js';");
      }

      const tests = ['apps/server/src/consumer.test.ts', 'apps/web/src/consumer.test.ts'];

      const modules = await discoverRepositoryModules(tests, repo.root);

      for (const project of ['server', 'web']) {
        const testRoot = `apps/${project}/src/consumer.test.ts`;

        const sharedModule = modules.find(
          (module) => module.testRoot === testRoot && module.file === 'shared/consumer.ts',
        );

        expect(sharedModule?.dependencies).toContain(`apps/${project}/src/value.ts`);

        expect(sharedModule?.dependencies).not.toContain(
          `apps/${project === 'server' ? 'web' : 'server'}/src/value.ts`,
        );
      }
    });
  });

  it('preserves shared dependencies for each test root', async () => {
    await withTempRepository('forge-cache-shared-', async (repo) => {
      const tests = ['src/first.test.ts', 'src/second.test.ts'];

      await repo.write('src/shared/value.ts', 'export const value = 42;');

      await repo.write('src/shared/consumer.ts', "import { value } from './value.js'; export { value };");

      for (const test of tests) {
        await repo.write(test, "import { value } from './shared/consumer.js';");
      }

      const modules = await discoverRepositoryModules(tests, repo.root);

      for (const testRoot of tests) {
        const sharedModule = modules.find(
          (module) => module.testRoot === testRoot && module.file === 'src/shared/consumer.ts',
        );

        expect(sharedModule?.dependencies).toContain('src/shared/value.ts');

        expect(modules).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              file: 'src/shared/value.ts',
              testRoot,
              dependencies: [],
            }),
          ]),
        );
      }
    });
  });

  it('preserves unresolved dependencies across cached test graphs', async () => {
    await withTempRepository('forge-cache-unresolved-', async (repo) => {
      const tests = ['src/first.test.ts', 'src/second.test.ts'];

      await repo.write('src/shared/consumer.ts', "import './missing.js'; export const value = 42;");

      for (const test of tests) {
        await repo.write(test, "import { value } from './shared/consumer.js';");
      }

      const modules = await discoverRepositoryModules(tests, repo.root);

      const dependencies = resolveTestDependencies(tests, modules);

      for (const test of dependencies) {
        expect(test.dependencies).toContain('src/shared/consumer.ts');

        expect(test.unresolvedDependencies).toEqual(
          expect.arrayContaining([
            {
              file: 'src/shared/consumer.ts',
              specifier: './missing.js',
            },
          ]),
        );
      }

      // Only the first test file changed.
      // The second should still be selected conservatively
      // because its dependency graph contains uncertainty.
      const selection = selectTests(
        [
          {
            status: 'modified',
            path: 'src/first.test.ts',
          },
        ],
        dependencies,
      );

      expect(selection.selectedTests).toEqual(tests);
      expect(selection.unmappedChanges).toEqual([]);
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  discoverImports,
  discoverModuleImports,
  discoverRepositoryModules,
  resolveImportPath,
  resolveTestDependencies,
  type ModuleImports,
} from './vitest-dependencies.js';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testFiles = ['src/orders/order-service.test.ts'];

const modules: ModuleImports[] = [
  {
    file: 'src/orders/order-service.test.ts',
    imports: ['src/orders/order-service.ts'],
  },
  {
    file: 'src/orders/order-service.ts',
    imports: ['src/orders/order-validator.ts'],
  },
  {
    file: 'src/orders/order-validator.ts',
    imports: [],
  },
];

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
});

describe('resolveTestDependencies', () => {
  it('returns a test file and dependencies', () => {
    expect(resolveTestDependencies(testFiles, modules)).toEqual([
      {
        dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
        testFile: 'src/orders/order-service.test.ts',
      },
    ]);
  });

  it('resolves circular dependencies without duplicate files', () => {
    const modules: ModuleImports[] = [
      {
        file: 'src/orders/order-service.test.ts',
        imports: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-service.ts',
        imports: ['src/orders/order-validator.ts'],
      },
      {
        file: 'src/orders/order-validator.ts',
        imports: ['src/orders/order-service.ts'],
      },
    ];

    expect(resolveTestDependencies(testFiles, modules)).toEqual([
      {
        dependencies: ['src/orders/order-service.ts', 'src/orders/order-validator.ts'],
        testFile: 'src/orders/order-service.test.ts',
      },
    ]);
  });

  it('returns dependencies for multiple tests importing the same module', () => {
    const testFiles = ['src/orders/order-service.test.ts', 'src/orders/order-controller.test.ts'];

    const modules: ModuleImports[] = [
      {
        file: 'src/orders/order-service.test.ts',
        imports: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-controller.test.ts',
        imports: ['src/orders/order-service.ts'],
      },
      {
        file: 'src/orders/order-service.ts',
        imports: [],
      },
    ];

    expect(resolveTestDependencies(testFiles, modules)).toEqual([
      {
        testFile: 'src/orders/order-service.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
      {
        testFile: 'src/orders/order-controller.test.ts',
        dependencies: ['src/orders/order-service.ts'],
      },
    ]);
  });

  it('propagates unresolved imports from indirect dependencies', () => {
    const modules = [
      {
        file: 'src/example.test.ts',
        imports: ['src/service.ts'],
      },
      {
        file: 'src/service.ts',
        imports: [],
        unresolvedImports: ['./missing.js'],
      },
    ];

    const result = resolveTestDependencies(['src/example.test.ts'], modules);

    expect(result[0]).toMatchObject({
      testFile: 'src/example.test.ts',
      unresolvedImports: [
        {
          file: 'src/service.ts',
          specifier: './missing.js',
        },
      ],
    });
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
});

describe('discoverModuleImports', () => {
  it('discovers module imports from an actual source file', async () => {
    const result = await discoverModuleImports('src/cli.test.ts', process.cwd());

    expect(result.file).toBe('src/cli.test.ts');
    expect(result.imports).toContain('src/cli.ts');
  });

  it('excludes dependencies from node_modules', async () => {
    const result = await discoverModuleImports('src/cli.test.ts', process.cwd());

    expect(result.imports).not.toEqual(expect.arrayContaining([expect.stringContaining('node_modules')]));
  });

  it('reports unresolved local imports', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-test-'));

    try {
      await mkdir(join(repoRoot, 'src'));

      await writeFile(join(repoRoot, 'src/example.test.ts'), `import { missingFunction } from './missing.js';`);

      const result = await discoverModuleImports('src/example.test.ts', repoRoot);

      expect(result).toEqual({
        file: 'src/example.test.ts',
        imports: [],
        unresolvedImports: ['./missing.js'],
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('discoverRepositoryModules', () => {
  it('discovers indirect dependencies from source files', async () => {
    const modules = await discoverRepositoryModules(['src/cli.test.ts'], process.cwd());

    expect(modules).toEqual(
      expect.arrayContaining([
        {
          file: 'src/cli.test.ts',
          imports: expect.arrayContaining(['src/cli.ts']),
        },
        {
          file: 'src/cli.ts',
          imports: expect.arrayContaining(['src/config/cli-options.ts', 'src/changes/git-changes.ts']),
        },
      ]),
    );
  });
});

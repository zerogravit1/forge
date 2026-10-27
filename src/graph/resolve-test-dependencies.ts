import type { TestDependency } from '../models/test-dependency.js';
import type { ModuleDependency } from '../models/module-dependency.js';

export function resolveTestDependencies(testFiles: string[], modules: ModuleDependency[]): TestDependency[] {
  const modulesByFile = new Map(modules.map((module) => [module.file, module]));

  return testFiles.map((testFile) => {
    const visited = new Set<string>();
    const unresolvedImports: { file: string; specifier: string }[] = [];

    function visit(file: string): void {
      const module = modulesByFile.get(file);
      const imports = module?.imports ?? [];

      for (const dependency of imports) {
        if (dependency === testFile || visited.has(dependency)) {
          continue;
        }

        visited.add(dependency);
        visit(dependency);
      }

      for (const specifier of module?.unresolvedImports ?? []) {
        unresolvedImports.push({
          file,
          specifier,
        });
      }
    }

    visit(testFile);

    return {
      testFile,
      dependencies: [...visited],
      ...(unresolvedImports.length > 0 ? { unresolvedImports } : {}),
    };
  });
}

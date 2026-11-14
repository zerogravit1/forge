import type { TestDependency } from '../models/test-dependency.js';
import type { ModuleDependency } from '../models/module-dependency.js';

export function resolveTestDependencies(testFiles: string[], modules: ModuleDependency[]): TestDependency[] {
  const unscopedModules = new Map(
    modules.filter((module) => module.testRoot === undefined).map((module) => [module.file, module] as const),
  );

  // Modules grouped by their originating test root
  const scopedModules = new Map<string, Map<string, ModuleDependency>>();

  for (const module of modules) {
    if (module.testRoot === undefined) {
      continue;
    }

    let graph = scopedModules.get(module.testRoot);

    if (!graph) {
      graph = new Map<string, ModuleDependency>();
      scopedModules.set(module.testRoot, graph);
    }

    graph.set(module.file, module);
  }

  return testFiles.map((testFile) => {
    // Select the graph belonging to this test
    const modulesByFile = scopedModules.get(testFile) ?? unscopedModules;

    const visited = new Set<string>();
    const unresolvedDependencies: {
      file: string;
      specifier: string;
    }[] = [];

    function visit(file: string): void {
      const module = modulesByFile.get(file);
      const imports = module?.dependencies ?? [];

      for (const dependency of imports) {
        if (dependency === testFile || visited.has(dependency)) {
          continue;
        }

        visited.add(dependency);
        visit(dependency);
      }

      for (const specifier of module?.unresolvedDependencies ?? []) {
        unresolvedDependencies.push({
          file,
          specifier,
        });
      }
    }

    visit(testFile);

    return {
      testFile,
      dependencies: [...visited],
      ...(unresolvedDependencies.length > 0 ? { unresolvedDependencies } : {}),
    };
  });
}

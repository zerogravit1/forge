import ts from 'typescript';
import type { TestDependency } from '../models/test-dependency.js';

export interface ModuleImports {
  file: string;
  imports: string[];
}

export function discoverImports(source: string): string[] {
  const parsed = ts.createSourceFile(
    'example.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );

  const statements = parsed.statements;

  const imports = statements.filter(ts.isImportDeclaration)
  
  const dependencies = imports
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);

  return dependencies;
}

export function resolveImportPath(importingFile: string, importSpecifier: string): string | undefined {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022
  }

  const result = ts.resolveModuleName(
    importSpecifier,
    importingFile,
    compilerOptions,
    ts.sys,
  );

  return result.resolvedModule?.resolvedFileName;
}

export function resolveTestDependencies(
  testFiles: string[],
  modules: ModuleImports[]
): TestDependency[] {
  const importsByFile = new Map(
    modules.map((module) => [module.file, module.imports]),
  );

  return testFiles.map((testFile) => {
    const visited = new Set<string>();

    function visit(file: string): void {
      const imports = importsByFile.get(file) ?? [];

      for (const dependency of imports) {
        if (dependency === testFile || visited.has(dependency)) {
          continue;
        }

        visited.add(dependency);
        visit(dependency);
      }
    }

    visit(testFile);

    return {
      testFile,
      dependencies: [...visited],
    };
  });
}
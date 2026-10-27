import ts from 'typescript';
import { readFile } from 'fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { ModuleDependency } from '../../models/module-dependency.js';

export function discoverImports(source: string): string[] {
  const parsed = ts.createSourceFile('example.ts', source, ts.ScriptTarget.Latest, true);

  const statements = parsed.statements;

  const imports = statements.filter(ts.isImportDeclaration);
  const exports = statements.filter(ts.isExportDeclaration);

  const dependencies = imports
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);

  const exportDependencies = exports
    .map((statement) => statement.moduleSpecifier)
    .filter((specifier) => specifier !== undefined)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);

  return [...dependencies, ...exportDependencies];
}

export async function discoverModuleImports(file: string, repoRoot: string): Promise<ModuleDependency> {
  const absolutePath = resolve(repoRoot, file);
  const source = await readFile(absolutePath, 'utf8');

  const importStatements = discoverImports(source);

  const resolvedImportPaths: string[] = [];

  const unresolvedDependencies: string[] = [];

  for (const statement of importStatements) {
    const resolvedPath = resolveImportPath(absolutePath, statement);

    if (!resolvedPath) {
      if (statement.startsWith('./') || statement.startsWith('../')) {
        unresolvedDependencies.push(statement);
      }

      continue;
    }

    const relativePath = relative(repoRoot, resolvedPath);

    const outsideRepo = relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);

    const externalDependency = relativePath.split(sep).includes('node_modules');

    if (outsideRepo || externalDependency) {
      continue;
    }

    resolvedImportPaths.push(resolvedPath);
  }

  const relativeImportPaths = resolvedImportPaths.map((path) => relative(repoRoot, path));

  const relativeFilePath = relative(repoRoot, absolutePath);

  return {
    file: relativeFilePath,
    dependencies: relativeImportPaths,
    ...(unresolvedDependencies.length > 0 ? { unresolvedDependencies } : {}),
  };
}

export async function discoverRepositoryModules(testFiles: string[], repoRoot: string): Promise<ModuleDependency[]> {
  const visited = new Set<string>();
  const modules: ModuleDependency[] = [];

  async function visit(file: string): Promise<void> {
    if (visited.has(file)) {
      return;
    }

    visited.add(file);

    const moduleImports = await discoverModuleImports(file, repoRoot);

    modules.push(moduleImports);

    for (const dependency of moduleImports.dependencies) {
      await visit(dependency);
    }
  }

  for (const testFile of testFiles) {
    await visit(testFile);
  }

  return modules;
}

export function resolveImportPath(importingFile: string, importSpecifier: string): string | undefined {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
  };

  const result = ts.resolveModuleName(importSpecifier, importingFile, compilerOptions, ts.sys);

  return result.resolvedModule?.resolvedFileName;
}

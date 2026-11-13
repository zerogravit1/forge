import ts from 'typescript';
import { readFile } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { ModuleDependency } from '../../models/module-dependency.js';

interface ImportAnalysis {
  imports: string[];
  unresolvedDynamicImports: string[];
}

function analyzeImports(source: string, fileName = 'examples.ts'): ImportAnalysis {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const imports = parsed.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);

  const exports = parsed.statements
    .filter(ts.isExportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter((specifier) => specifier !== undefined)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);

  const dynamicImports: string[] = [];
  const unresolvedDynamicImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;

      if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier))) {
        dynamicImports.push(specifier.text);
      } else {
        unresolvedDynamicImports.push(`import(${specifier?.getText(parsed) ?? ''})`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(parsed);

  return {
    imports: [...imports, ...exports, ...dynamicImports],
    unresolvedDynamicImports,
  };
}

function loadCompilerOptions(importingFile: string): ts.CompilerOptions {
  const absoluteFile = resolve(importingFile);

  const configPath = ts.findConfigFile(dirname(absoluteFile), ts.sys.fileExists, 'tsconfig.json');

  let compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
  };

  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);

    if (config.error) {
      throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    }

    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath), undefined, configPath);

    if (parsed.errors.length > 0) {
      throw new Error(
        parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
      );
    }

    compilerOptions = parsed.options;
  }

  return compilerOptions;
}

function matchesPathAlias(importSpecifier: string, compilerOptions: ts.CompilerOptions): boolean {
  return Object.keys(compilerOptions.paths ?? {}).some((pattern) => {
    const wildcard = pattern.indexOf('*');

    if (wildcard === -1) {
      return importSpecifier === pattern;
    }

    const prefix = pattern.slice(0, wildcard);
    const suffix = pattern.slice(wildcard + 1);

    return (
      importSpecifier.startsWith(prefix) &&
      importSpecifier.endsWith(suffix) &&
      importSpecifier.length >= prefix.length + suffix.length
    );
  });
}

export function discoverImports(source: string): string[] {
  return analyzeImports(source).imports;
}

export async function discoverModuleImports(file: string, repoRoot: string): Promise<ModuleDependency> {
  const absolutePath = resolve(repoRoot, file);
  const source = await readFile(absolutePath, 'utf8');

  const { imports: importStatements, unresolvedDynamicImports } = analyzeImports(source, absolutePath);

  const resolvedImportPaths: string[] = [];

  const unresolvedDependencies: string[] = [...unresolvedDynamicImports];

  const compilerOptions = loadCompilerOptions(absolutePath);

  for (const statement of importStatements) {
    const resolvedPath = resolveImportPath(absolutePath, statement, compilerOptions);

    if (!resolvedPath) {
      const isRelative = statement.startsWith('./') || statement.startsWith('../');

      if (isRelative || matchesPathAlias(statement, compilerOptions)) {
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

export function resolveImportPath(
  importingFile: string,
  importSpecifier: string,
  compilerOptions = loadCompilerOptions(importingFile),
): string | undefined {
  // const absoluteFile = resolve(importingFile);

  // const configPath = ts.findConfigFile(dirname(absoluteFile), ts.sys.fileExists, 'tsconfig.json');

  // let compilerOptions: ts.CompilerOptions = {
  //   module: ts.ModuleKind.NodeNext,
  //   moduleResolution: ts.ModuleResolutionKind.NodeNext,
  //   target: ts.ScriptTarget.ES2022,
  // };

  // if (configPath) {
  //   const config = ts.readConfigFile(configPath, ts.sys.readFile);

  //   if (config.error) {
  //     throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  //   }

  //   const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath), undefined, configPath);

  //   if (parsed.errors.length > 0) {
  //     throw new Error(
  //       parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
  //     );
  //   }

  //   compilerOptions = parsed.options;
  // }

  const result = ts.resolveModuleName(importSpecifier, resolve(importingFile), compilerOptions, ts.sys);

  return result.resolvedModule?.resolvedFileName;
}

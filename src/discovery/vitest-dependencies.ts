import ts from 'typescript';

export interface TestDependency {
  testFile: string;
  dependencies: string[];
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

export async function resolveTestDependencies() {}
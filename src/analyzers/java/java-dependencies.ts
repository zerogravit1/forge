import { relative, resolve, sep } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

import type { ModuleDependency } from '../../models/module-dependency.js';


export async function discoverJavaModuleDependencies (
  file: string,
  repoRoot: string,
  sourceRoots: readonly string[],
): Promise<ModuleDependency> {
  const absolutePath = resolve(repoRoot, file);
  const source = await readFile(absolutePath, 'utf8');

  const imports = [...source.matchAll(/^\s*import\s+([\w.]+)\s*;/gm)].map(
    (match) => match[1],
  );

  const dependencies: string[] = [];
  const unresolvedDependencies: string[] = [];

  for (const importName of imports) {
    if (!importName) continue;

    const resolvedPath = resolvePackagePath(repoRoot, sourceRoots, importName);

    if (resolvedPath) {
      dependencies.push(resolvedPath);
    } else {
    }
  }

  return {
    file,
    dependencies,
    ...(unresolvedDependencies.length > 0 && { unresolvedDependencies }),
  }
}

export async function resolvePackagePath(
  repoRoot: string,
  sourceRoots: readonly string[],
  importName: string,
): Promise<string | undefined> {
  const classPath = `${importName.replaceAll('.', '/')}.java`;

  for (const sourceRoot of sourceRoots) {
    const candidate = resolve(repoRoot, sourceRoot, classPath);

    try {
      const fileStat = await stat(candidate);

      if (fileStat.isFile()) {
        return relative(repoRoot, candidate).split(sep).join('/');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return undefined;
}
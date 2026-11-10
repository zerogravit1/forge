import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

async function readManifest(): Promise<string[]> {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk.toString();
  }

  const parsed: unknown = JSON.parse(input);

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('testFiles' in parsed) ||
    !Array.isArray(parsed.testFiles) ||
    parsed.testFiles.length === 0 ||
    parsed.testFiles.some((file: unknown) => typeof file !== 'string' || file.length === 0)
  ) {
    throw new Error('Invalid Vitest execution manifest');
  }

  return parsed.testFiles as string[];
}

function resolveTestPath(projectRoot: string, file: string): string {
  if (isAbsolute(file)) {
    throw new Error(`Expected project-relative test path: ${file}`);
  }

  const absolutePath = resolve(projectRoot, file);
  const relativePath = relative(projectRoot, absolutePath);

  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Test file outside configured project: ${file}`);
  }

  return absolutePath;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const testFiles = await readManifest();

  // Resolve Vitest from the target project, not from Forge.
  const projectRequire = createRequire(resolve(projectRoot, '__forge_vitest_resolver__.cjs'));

  const vitestModule = projectRequire.resolve('vitest/node');

  const { createVitest } = (await import(pathToFileURL(vitestModule).href)) as typeof import('vitest/node');

  // Added 'test' to support Vitest 4 & 5, IDE shows a deprecation warning
  const vitest = await createVitest('test', { watch: false });

  try {
    await vitest.standalone();

    // Match the helper extension to the runner worker.
    const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

    const { reconcileSpecifications } = (await import(
      new URL(`./vitest-results${extension}`, import.meta.url).href
    )) as typeof import('./vitest-results.js');

    // Let Vitest discover and classify its own specifications.
    await vitest.globTestSpecifications();

    const specifications = [];
    const expectedFiles = new Set<string>();

    for (const file of testFiles) {
      const absolutePath = resolveTestPath(projectRoot, file);

      if (!(await stat(absolutePath)).isFile()) {
        throw new Error(`Not a test file: ${file}`);
      }

      expectedFiles.add(absolutePath);

      // A file can belong to more than one Vitest project.
      const matchingSpecifications = vitest.getModuleSpecifications(absolutePath);

      if (matchingSpecifications.length === 0) {
        throw new Error(`No Vitest project matches: ${file}`);
      }

      specifications.push(...matchingSpecifications);
    }

    const result = await vitest.runTestSpecifications(specifications, true);

    const reconciliation = reconcileSpecifications(specifications, result.testModules);

    const hasMismatch = Object.values(reconciliation).some((ids) => ids.length > 0);

    if (hasMismatch) {
      console.error('Vitest specification mismatch', reconciliation);
    }

    const executedFiles = new Set(result.testModules.map((module) => resolve(module.moduleId)));

    const missingFiles = [...expectedFiles].filter((file) => !executedFiles.has(file));

    const unexpectedFiles = [...executedFiles].filter((file) => !expectedFiles.has(file));

    const failed =
      result.unhandledErrors.length > 0 ||
      result.testModules.some((module) => !module.ok()) ||
      hasMismatch ||
      missingFiles.length > 0 ||
      unexpectedFiles.length > 0;

    if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
      console.error('Vitest execution mismatch', {
        missingFiles,
        unexpectedFiles,
      });
    }

    if (failed) {
      process.exitCode = process.exitCode || 1;
    }
  } finally {
    await vitest.exit();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import { glob } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export async function discoverJavaTestFiles(
  repoRoot: string,
  projectPath: string,
): Promise<string[]> {
  const testRoot = join(repoRoot, projectPath, 'src/test/java');
  const testFiles: string[] = [];

  for await (const file of glob('**/*Test.java', { cwd: testRoot })) {
    const absolutePath = resolve(testRoot, file);
    const relativePath = relative(repoRoot, absolutePath);

    testFiles.push(relativePath.split(sep).join('/'));
  }

  return testFiles.sort();
}
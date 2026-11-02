import { glob } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const testPatterns = [
  '**/Test*.java',
  '**/*Test.java',
  '**/*Tests.java',
  '**/*TestCase.java'
]

export async function discoverJavaTestFiles(repoRoot: string, projectPath: string): Promise<string[]> {
  const testRoot = join(repoRoot, projectPath, 'src/test/java');
  const testFiles = new Set<string>();

  for (const pattern of testPatterns) {
    for await (const file of glob(pattern, { cwd: testRoot })) {
      const absolutePath = resolve(testRoot, file);
      const relativePath = relative(repoRoot, absolutePath);
    
      testFiles.add(relativePath.split(sep).join('/'));
    }
  }

  return [...testFiles].sort();
}

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface TempRepository {
  root: string;
  path: (...segments: string[]) => string;
  write: (relativePath: string, content: string) => Promise<void>;
  linkNodeModules: () => Promise<void>;
}

export async function withTempRepository<T>(prefix: string, run: (repo: TempRepository) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const path = (...segments: string[]): string => join(root, ...segments);

  try {
    return await run({
      root,
      path,

      async write(relativePath, content) {
        const destination = path(relativePath);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content);
      },

      async linkNodeModules() {
        await symlink(resolve('nod_modules'), path('node_modules'), 'dir');
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

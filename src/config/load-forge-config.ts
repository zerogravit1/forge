import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ForgeConfig } from './forge-config.js';

export async function loadForgeConfig(repoRoot: string): Promise<ForgeConfig> {
  const configPath = resolve(repoRoot, 'forge.config.json');
  const contents = await readFile(configPath, 'utf8');

  const parsed: ForgeConfig = JSON.parse(contents);

  return validateForgeConfig(parsed);
}

export function validateForgeConfig(parsedConfig: ForgeConfig) {
  return parsedConfig;
}

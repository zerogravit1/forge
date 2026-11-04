import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ForgeConfig } from './forge-config.js';

export async function loadForgeConfig(repoRoot: string): Promise<ForgeConfig> {
  const configPath = resolve(repoRoot, 'forge.config.json');
  const contents = await readFile(configPath, 'utf8');

  const parsed: unknown = JSON.parse(contents);

  return validateForgeConfig(parsed);
}

export function validateForgeConfig(parsedConfig: unknown): ForgeConfig {
  if (!isRecord(parsedConfig)) {
    throw new Error('Invalid Forge configuration');
  }

  objectValidator('roots', parsedConfig);
  objectValidator('adapters', parsedConfig);
  objectValidator('runners', parsedConfig);
  objectValidator('targets', parsedConfig);

  if (!('version' in parsedConfig) || typeof parsedConfig.version !== 'string') {
    throw new Error('Invalid Forge configuration');
  }

  if (parsedConfig.version !== '1.0.0') {
    throw new Error('Unsupported Forge configuration version');
  }

  return {
    version: parsedConfig.version,
    roots: validateRoots(parsedConfig.roots),
    adapters: validateAdapters(parsedConfig.adapters),
    runners: validateRunners(parsedConfig.runners),
    targets: validateTargets(parsedConfig.targets),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectValidator(objectName: string, config: Record<string, unknown>): void {
  if (!isRecord(config[objectName])) {
    throw new Error(`Invalid Forge configuration: ${objectName} must be an object`);
  }
}

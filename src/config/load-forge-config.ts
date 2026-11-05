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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateRoots(value: unknown): ForgeConfig['roots'] {
  if (!isRecord(value)) {
    throw new Error('Invalid Forge configuration: roots must be an object');
  }

  const roots: ForgeConfig['roots'] = {};

  for (const [namespace, entries] of Object.entries(value)) {
    if (!isRecord(entries)) {
      throw new Error(`Invalid Forge configuration: roots.${namespace}`);
    }

    roots[namespace] = {};

    for (const [name, root] of Object.entries(entries)) {
      if (
        !isRecord(root) ||
        typeof root.path !== 'string' ||
        !isStringArray(root.sources) ||
        !isStringArray(root.tests)
      ) {
        throw new Error(`Invalid Forge configuration: roots.${namespace}.${name}`);
      }

      roots[namespace][name] = {
        path: root.path,
        sources: root.sources,
        tests: root.tests,
      };
    }
  }

  return roots;
}

function validateAdapters(value: unknown): ForgeConfig['adapters'] {
  if (!isRecord(value)) {
    throw new Error('Invalid Forge configuration: adapters must be an object');
  }

  const adapters: ForgeConfig['adapters'] = {};

  for (const [name, adapter] of Object.entries(value)) {
    if (!isRecord(adapter) || typeof adapter.type !== 'string') {
      throw new Error(`Invalid Forge configuration: adapters.${name}`);
    }

    adapters[name] = {
      type: adapter.type,
    };
  }

  return adapters;
}

function validateRunners(value: unknown): ForgeConfig['runners'] {
  if (!isRecord(value)) {
    throw new Error('Invalid Forge configuration: runners must be an object');
  }

  const runners: ForgeConfig['runners'] = {};

  for (const [name, runner] of Object.entries(value)) {
    if (!isRecord(runner) || typeof runner.type !== 'string') {
      throw new Error(`Invalid Forge configuration: runners.${name}`);
    }

    runners[name] = {
      type: runner.type,
    };
  }

  return runners;
}

function validateTargets(value: unknown): ForgeConfig['targets'] {
  if (!isRecord(value)) {
    throw new Error('Invalid Forge configuration: targets must be an object');
  }

  const targets: ForgeConfig['targets'] = {};

  for (const [namespace, entries] of Object.entries(value)) {
    if (!isRecord(entries)) {
      throw new Error(`Invalid Forge configuration: targets.${namespace}`);
    }

    targets[namespace] = {};

    for (const [name, target] of Object.entries(entries)) {
      if (
        !isRecord(target) ||
        typeof target.root !== 'string' ||
        !isStringArray(target.adapter) ||
        !isStringArray(target.runner)
      ) {
        throw new Error(`Invalid Forge configuration: targets.${namespace}.${name}`);
      }

      targets[namespace][name] = {
        root: target.root,
        adapter: target.adapter,
        runner: target.runner,
      };
    }
  }

  return targets;
}

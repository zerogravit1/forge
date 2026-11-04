import type { ForgeConfig, ResolvedTargetConfig } from './forge-config.js';

export function resolveTargetConfigs(config: ForgeConfig): ResolvedTargetConfig[] {
  const resolved: ResolvedTargetConfig[] = [];

  for (const [namespace, targets] of Object.entries(config.targets)) {
    for (const [name, target] of Object.entries(targets)) {
      const id = `${namespace}.${name}`;
    }
  }

  return resolved;
}

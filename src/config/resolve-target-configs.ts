import type { ForgeConfig, ResolvedTargetConfig } from './forge-config.js';

export function resolveTargetConfigs(config: ForgeConfig): ResolvedTargetConfig[] {
  const resolved: ResolvedTargetConfig[] = [];

  for (const [namespace, targets] of Object.entries(config.targets)) {
    for (const [name, target] of Object.entries(targets)) {
      const id = `${namespace}.${name}`;

      const parts = target.root.split('.');

      if (parts.length !== 2 || parts.some((part) => !part)) {
        throw new Error(`Unknown root: ${target.root}`);
      }

      const [rootNamespace, rootName] = parts;

      const root = config.roots[rootNamespace]?.[rootName];

      if (!root) {
        throw new Error(`Unknown root: ${target.root}`);
      }

      for (const adapter of target.adapter) {
        if (!Object.hasOwn(config.adapters, adapter)) {
          throw new Error(`Unknown adapter: ${adapter}`);
        }
      }

      for (const runner of target.runner) {
        if (!Object.hasOwn(config.runners, runner)) {
          throw new Error(`Unknown runner: ${runner}`);
        }
      }

      resolved.push({
        id,
        projectRoot: root.path,
        sourceRoots: root.sources,
        testRoots: root.tests,
        adapters: target.adapter,
        runners: target.runner,
      });
    }
  }

  return resolved;
}

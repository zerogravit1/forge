import type { ForgeConfig, ResolvedTargetConfig } from '../config/forge-config.js';
import { loadForgeConfig } from '../config/load-forge-config.js';
import { resolveTargetConfigs } from '../config/resolve-target-configs.js';
import { createMavenRunner } from '../execution/maven-runner.js';
import type { TestRunner } from '../execution/test-runner.js';
import { createVitestRunner } from '../execution/vitest-runner.js';
import type { ValidationTarget } from './validation-target.js';

export async function createValidationTargets(
  config: ForgeConfig,
  resolved: ResolvedTargetConfig[],
): ValidationTarget[] {
  const targets: ValidationTarget[] = [];

  for (const targetConfig of resolved) {
    if (targetConfig.runners.length !== 1) {
      throw new Error(`Unsupported runner configuration: ${targetConfig.id}`);
    }

    const [runnerName] = targetConfig.runners;

    if (!runnerName) {
      throw new Error(`Missing runner: ${targetConfig.id}`);
    }

    const runnerDefinition = config.runners[runnerName];

    if (!runnerDefinition) {
      throw new Error(`Unknown runner: ${runnerName}`);
    }

    const runnerType = runnerDefinition.type;

    let runner: TestRunner;

    switch (runnerType) {
      case 'maven':
        runner = createMavenRunner(targetConfig.projectRoot);
        break;

      case 'vitest':
        runner = createVitestRunner();
        break;

      default:
        throw new Error(`Unsupport runner type: ${runnerType}`);
    }

    if (targetConfig.adapters.length !== 1) {
      throw new Error(`Unsupported adapter configuration: ${targetConfig.id}`);
    }

    const [adapterName] = targetConfig.adapters;

    if (!adapterName) {
      throw new Error (`Missing adapter: ${targetConfig.id}`);
    }

    const adapterDefinition = config.adapters[adapterName];

    if (!adapterDefinition) {
      throw new Error(`Unknown adapter: ${adapterName}`);
    }

    const adapterType = adapterDefinition.type;

    let adapter;

    switch (adapterType) {
      case 'java':
        break;

      case 'typescript':
        break;

      default:
        throw new Error(`Unsupported adapter type: ${adapterType}`);
    }
  }

  return targets;
}
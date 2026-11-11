import type { ForgeConfig, ResolvedTargetConfig } from '../config/forge-config.js';
import type { TestRunner } from '../execution/test-runner.js';
import type { ValidationTarget } from './validation-target.js';

import { createVitestRunner } from '../execution/vitest-runner.js';
import { createMavenRunner } from '../execution/maven-runner.js';
import { posix } from 'node:path';
import { createJavaAnalyzer } from '../analyzers/java/java-analyzer.js';
import { discoverJavaTestFiles } from '../discovery/java-test-files.js';
import { planTestSelection } from '../selection/plan-test-selection.js';
import { discoverVitestTestFiles } from '../discovery/vitest-test-files.js';

export function createValidationTargets(config: ForgeConfig, resolved: ResolvedTargetConfig[]): ValidationTarget[] {
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
        runner = createVitestRunner(targetConfig.projectRoot);
        break;

      default:
        throw new Error(`Unsupported runner type: ${runnerType}`);
    }

    if (targetConfig.adapters.length !== 1) {
      throw new Error(`Unsupported adapter configuration: ${targetConfig.id}`);
    }

    const [adapterName] = targetConfig.adapters;

    if (!adapterName) {
      throw new Error(`Missing adapter: ${targetConfig.id}`);
    }

    const adapterDefinition = config.adapters[adapterName];

    if (!adapterDefinition) {
      throw new Error(`Unknown adapter: ${adapterName}`);
    }

    const adapterType = adapterDefinition.type;

    const supported =
      (adapterType === 'java' && runnerType === 'maven') || (adapterType === 'typescript' && runnerType === 'vitest');

    if (!supported) {
      throw new Error(`Unsupported adapter/runner combination: ${adapterType} + ${runnerType}`);
    }

    switch (adapterType) {
      case 'java': {
        const javaRoots = [...targetConfig.sourceRoots, ...targetConfig.testRoots].map((path) =>
          posix.join(targetConfig.projectRoot, path),
        );

        const javaAnalyzer = createJavaAnalyzer(javaRoots);

        targets.push({
          id: targetConfig.id,

          includesChange: (change) => change.path.startsWith(`${targetConfig.projectRoot}/`),

          discoverTestFiles: (repoRoot) => discoverJavaTestFiles(repoRoot, targetConfig.projectRoot),

          planSelection: (changes, testFiles, repoRoot) =>
            planTestSelection(changes, testFiles, repoRoot, javaAnalyzer),

          runner,
        });

        break;
      }

      case 'typescript': {
        const sourceRoots = [...targetConfig.sourceRoots, ...targetConfig.testRoots].map((path) =>
          posix.join(targetConfig.projectRoot, path),
        );

        targets.push({
          id: targetConfig.id,

          includesChange: (change) =>
            sourceRoots.some((root) => change.path === root || change.path.startsWith(`${root}/`)),

          discoverTestFiles: (repoRoot) =>
            discoverVitestTestFiles(repoRoot, targetConfig.projectRoot, targetConfig.testRoots),

          planSelection: planTestSelection,

          runner,
        });

        break;
      }

      default:
        throw new Error(`Unsupported adapter type: ${adapterType}`);
    }
  }

  return targets;
}

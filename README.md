# Forge

**Evidence-driven test selection and orchestration.**

Forge helps engineering teams determine which tests are relevant to a software change, execute those tests, and understand the evidence behind the resulting validation decision.

Rather than running every test for every change—or relying on test selection that cannot explain its decisions—Forge aims to connect code changes, dependency relationships, test execution, and validation outcomes.

The objective is not simply to run fewer tests. It is to make software validation more efficient, explainable, and trustworthy.

## How Forge works

Forge is being developed around five capabilities:

1. **Change detection:** Identify changed files through Git.
2. **Test discovery:** Discover tests through supported frameworks and configured project boundaries.
3. **Dependency analysis:** Map source changes to potentially affected tests.
4. **Test execution:** Execute selected tests through their native runners while preserving test identities and failure semantics.
5. **Validation evidence:** Identify what was selected, what executed, and where dependency information or validation coverage may be incomplete.

**Core principle:** Forge must not claim successful validation based on unrelated passing tests, incomplete dependency analysis, or missing execution evidence.

## Current development status

Forge is an early-stage open-source project focused on establishing a reliable TypeScript and Vitest workflow.

The current implementation includes a CLI with `plan` and `run` commands, configurable validation targets, TypeScript dependency analysis, Vitest discovery, and selected-test execution.

Java and Maven integrations also exist but have known limitations.

Some TypeScript dependency patterns, including dynamic imports and project path aliases, are not yet handled correctly. These limitations are tracked in GitHub issues.

Forge is not yet packaged for general installation. The current workflow is intended for repository development and validation while the TypeScript MVP is completed.

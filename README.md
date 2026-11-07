# Forge — Implementation Status & Next Steps

**Updated:** November 7, 2026  
**Repository:** [zerogravit1/forge](https://github.com/zerogravit1/forge)  
**Working branch:** `fix/typescript-target-isolation`  
**Target branch:** `develop`  
**Pull request:** [#19](https://github.com/zerogravit1/forge/pull/19)  
**Latest verified commit:** `8f701b0`

## 1. Project objective

Forge is an evidence-driven test selection and orchestration platform.

Its purpose is to connect source-code changes with the tests required to validate those changes, while making validation decisions explainable.

The current MVP focuses on:

- Detecting changed files through Git.
- Discovering available tests using configured project runners.
- Mapping changes to potentially affected tests.
- Planning and executing selected tests.
- Identifying changes without known validation coverage.
- Preserving correct validation boundaries across projects.

**Core principle:** A successful validation result must mean that the intended tests actually executed successfully. Unrelated passing tests must not substitute for required validation.

## 2. Current implementation

Forge currently supports TypeScript/Vitest and Java/Maven validation targets.

The CLI provides `plan` and `run` commands. Target configuration identifies project roots, source directories, test directories, adapters, and runners.

Current work is concentrated on ensuring that TypeScript targets execute tests in the correct project and respect configured boundaries.

export interface ForgeConfig {
  version: string;

  roots: Record<string, Record<string, {
    path: string;
    sources: string[];
    tests: string[];
  }>>;

  adapters: Record<string, {
    type: string;
  }>;

  runners: Record<string, {
    type: string;
  }>;

  targets: Record<string, Record<string, {
    root: string;
    adapter: string[];
    runner: string[];
  }>>;
}

export interface ResovledTargetConfig {
  id: string;
  projectRoot: string;
  sourceRoots: string[];
  testRoots: string[];
  adapters: string[];
  runners: string[];
}
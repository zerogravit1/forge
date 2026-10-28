export interface TestDependency {
  testFile: string;
  dependencies: string[];
  unresolvedDependencies?: {
    file: string;
    specifier: string;
  }[];
}

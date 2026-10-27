export interface TestDependency {
  testFile: string;
  dependencies: string[];
  unresolvedImports?: {
    file: string;
    specifier: string;
  }[];
}

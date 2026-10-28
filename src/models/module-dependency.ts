export interface ModuleDependency {
  file: string;
  dependencies: string[];
  unresolvedDependencies?: string[];
}

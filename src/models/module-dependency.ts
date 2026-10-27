export interface ModuleDependency {
  file: string;
  imports: string[];
  unresolvedImports?: string[];
}

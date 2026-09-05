import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const allowedWorkspaceDependencies = {
  "adapter-memory": ["contract", "core"],
  "adapter-node": ["contract", "core"],
  client: ["contract", "core"],
  cloudflare: ["contract", "core"],
  conformance: ["contract", "core"],
  contract: [],
  core: ["contract"],
  effect: ["contract", "core", "client"],
  react: ["contract", "core", "client"],
  rivet: ["contract", "core"],
} as const satisfies Readonly<Record<string, readonly string[]>>;

const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const computedModule = "<computed module>";
const dependencySections = ["dependencies", "optionalDependencies", "peerDependencies"] as const;

type DependencySection = (typeof dependencySections)[number];
type WorkspaceOwner = keyof typeof allowedWorkspaceDependencies;

interface PackageManifest {
  readonly name: string | undefined;
  readonly dependencies: Readonly<Record<string, string>> | undefined;
  readonly optionalDependencies: Readonly<Record<string, string>> | undefined;
  readonly peerDependencies: Readonly<Record<string, string>> | undefined;
}

interface ManifestContainer {
  readonly __manifestContainer?: never;
}

/** A module edge and whether TypeScript erases it from emitted JavaScript. */
export interface ImportReference {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

interface ManifestDependency {
  readonly name: string;
  readonly version: string;
}

function importIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  if (clause?.name !== undefined || !clause?.namedBindings) return false;
  if (!ts.isNamedImports(clause.namedBindings)) return false;
  return (
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return false;
  return (
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

function moduleArgument(node: ts.CallExpression): ts.Expression | undefined {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return node.arguments[0];
  if (ts.isIdentifier(node.expression) && node.expression.text === "require")
    return node.arguments[0];
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;

  const { expression, name } = node.expression;
  if (ts.isIdentifier(expression) && expression.text === "module" && name.text === "require") {
    return node.arguments[0];
  }
  if (ts.isIdentifier(expression) && expression.text === "require" && name.text === "resolve") {
    return node.arguments[0];
  }
  if (
    ts.isMetaProperty(expression) &&
    expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    name.text === "resolve"
  ) {
    return node.arguments[0];
  }
  return undefined;
}

function moduleSpecifier(argument: ts.Expression | undefined): string {
  return argument !== undefined && ts.isStringLiteralLike(argument)
    ? argument.text
    : computedModule;
}

function importFromNode(node: ts.Node): ImportReference | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return { specifier: node.moduleSpecifier.text, typeOnly: importIsTypeOnly(node) };
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return { specifier: node.moduleSpecifier.text, typeOnly: exportIsTypeOnly(node) };
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return { specifier: node.argument.literal.text, typeOnly: true };
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const expression = node.moduleReference.expression;
    return {
      specifier: ts.isStringLiteral(expression) ? expression.text : computedModule,
      typeOnly: node.isTypeOnly,
    };
  }
  if (ts.isCallExpression(node)) {
    const argument = moduleArgument(node);
    if (argument !== undefined || node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return { specifier: moduleSpecifier(argument), typeOnly: false };
    }
  }
  return undefined;
}

/** Extract static and computed module edges from TypeScript source. */
export function imports(source: string): ImportReference[] {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true);
  const found: ImportReference[] = [];

  function visit(node: ts.Node): void {
    const edge = importFromNode(node);
    if (edge !== undefined) found.push(edge);
    ts.forEachChild(node, visit);
  }

  visit(file);
  return found;
}

function workspaceDependency(specifier: string): string | undefined {
  if (!specifier.startsWith("@cable/")) return undefined;
  const segments = specifier.split("/");
  return segments.length === 2 ? segments[1] : computedModule;
}

function isWorkspaceOwner(value: string): value is WorkspaceOwner {
  return Object.hasOwn(allowedWorkspaceDependencies, value);
}

function permitsWorkspaceDependency(owner: string, dependency: string): boolean {
  if (!isWorkspaceOwner(owner)) return false;
  return allowedWorkspaceDependencies[owner].some((allowed) => allowed === dependency);
}

function platformOwner(specifier: string): string | undefined {
  if (
    nodeBuiltins.has(specifier) ||
    specifier.startsWith("node:") ||
    specifier === "ws" ||
    specifier.startsWith("ws/")
  ) {
    return "adapter-node";
  }
  if (
    specifier.startsWith("cloudflare:") ||
    specifier.startsWith("workerd:") ||
    specifier.startsWith("@cloudflare/")
  ) {
    return "cloudflare";
  }
  if (
    specifier.startsWith("bun:") ||
    specifier === "rivetkit" ||
    specifier.startsWith("rivetkit/") ||
    specifier === "@rivet" ||
    specifier.startsWith("@rivet/")
  ) {
    return "rivet";
  }
  if (
    specifier === "effect" ||
    specifier.startsWith("effect/") ||
    specifier.startsWith("@effect/")
  ) {
    return "effect";
  }
  return undefined;
}

function leavesPackage(owner: string, file: string, specifier: string, root: string): boolean {
  const packageRoot = resolve(root, "packages", owner);
  const target = resolve(dirname(file), specifier);
  const pathFromPackage = relative(packageRoot, target);
  return (
    pathFromPackage === ".." ||
    pathFromPackage.startsWith(`..${sep}`) ||
    isAbsolute(pathFromPackage)
  );
}

function bypassesPackageResolution(specifier: string): boolean {
  return (
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier === "references" ||
    specifier.startsWith("references/") ||
    /^[a-z][a-z\d+.-]*:\/\//iu.test(specifier)
  );
}

/** Return the reason an import violates the package graph. */
export function violation(
  owner: string,
  file: string,
  edge: ImportReference,
  root: string,
): string | undefined {
  const { specifier, typeOnly } = edge;
  if (specifier === computedModule) return "computed module loading hides dependency boundaries";
  if (specifier.startsWith(".")) {
    return leavesPackage(owner, file, specifier, root)
      ? "relative imports must stay inside their package"
      : undefined;
  }
  if (bypassesPackageResolution(specifier)) {
    return "absolute paths, private aliases, URLs, and reference imports bypass package boundaries";
  }
  if (owner === "contract" && !(specifier === "@standard-schema/spec" && typeOnly)) {
    return "contract permits only type-only @standard-schema/spec imports";
  }

  const requiredOwner = platformOwner(specifier);
  if (requiredOwner !== undefined && owner !== requiredOwner) {
    return `platform module belongs in ${requiredOwner}: ${specifier}`;
  }

  const dependency = workspaceDependency(specifier);
  if (dependency === computedModule)
    return "cross-package imports must use the declared public entry point";
  if (dependency !== undefined && !permitsWorkspaceDependency(owner, dependency)) {
    return `unsupported package dependency: ${specifier}`;
  }
  return undefined;
}

function parseManifest(source: string): PackageManifest {
  const parsed: unknown = JSON.parse(source);
  if (!isManifestContainer(parsed)) throw new Error("package.json must contain an object");

  const name: unknown = Object.getOwnPropertyDescriptor(parsed, "name")?.value;
  if (name !== undefined && !isString(name)) {
    throw new Error("package.json name must be a string");
  }

  const sections = new Map<DependencySection, Readonly<Record<string, string>>>();
  for (const section of dependencySections) {
    const candidate: unknown = Object.getOwnPropertyDescriptor(parsed, section)?.value;
    if (candidate === undefined) continue;
    if (!isManifestContainer(candidate))
      throw new Error(`package.json ${section} must contain an object`);

    const entries: Record<string, string> = {};
    for (const dependency of Object.keys(candidate)) {
      const version: unknown = Object.getOwnPropertyDescriptor(candidate, dependency)?.value;
      if (!isString(version)) {
        throw new Error(`package.json ${section}.${dependency} must be a string`);
      }
      entries[dependency] = version;
    }
    sections.set(section, entries);
  }

  return {
    name,
    dependencies: sections.get("dependencies"),
    optionalDependencies: sections.get("optionalDependencies"),
    peerDependencies: sections.get("peerDependencies"),
  };
}

function isManifestContainer(value: unknown): value is ManifestContainer {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function manifestDependencies(manifest: PackageManifest): ManifestDependency[] {
  const dependencies: ManifestDependency[] = [];
  for (const section of dependencySections) {
    const entries = manifest[section];
    if (entries === undefined) continue;
    for (const [name, version] of Object.entries(entries)) {
      dependencies.push({ name, version });
    }
  }
  return dependencies;
}

/** Check a package manifest's runtime dependency edges. */
export function manifestViolations(owner: string, source: string, root: string): string[] {
  const manifest = parseManifest(source);
  const file = resolve(root, "packages", owner, "package.json");
  const errors: string[] = [];
  const expectedName = `@cable/${owner}`;
  if (manifest.name !== expectedName) {
    errors.push(`${owner}/package.json: expected package name ${expectedName}`);
  }
  for (const dependency of manifestDependencies(manifest)) {
    const reason = violation(owner, file, { specifier: dependency.name, typeOnly: false }, root);
    if (reason !== undefined) errors.push(`${owner}/package.json: ${dependency.name}: ${reason}`);
    if (dependency.name.startsWith("@cable/") && !dependency.version.startsWith("workspace:")) {
      errors.push(
        `${owner}/package.json: ${dependency.name}: internal dependencies must use the workspace protocol`,
      );
    }
  }
  return errors;
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.[cm]?tsx?$/u.test(entry.name) && !/\.(?:test|spec)\./u.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return groups.flat();
}

async function sourceViolations(owner: string, file: string, root: string): Promise<string[]> {
  const source = await readFile(file, "utf8");
  return imports(source).flatMap((edge) => {
    const reason = violation(owner, file, edge, root);
    return reason === undefined ? [] : [`${relative(root, file)}: ${edge.specifier}: ${reason}`];
  });
}

async function packageViolations(owner: string, root: string): Promise<string[]> {
  const directory = resolve(root, "packages", owner);
  const [manifestSource, files] = await Promise.all([
    readFile(resolve(directory, "package.json"), "utf8"),
    sourceFiles(resolve(directory, "src")),
  ]);
  const sourceErrors = await Promise.all(files.map((file) => sourceViolations(owner, file, root)));
  return [...manifestViolations(owner, manifestSource, root), ...sourceErrors.flat()];
}

/** Check source imports and runtime manifest edges across the workspace. */
export async function checkBoundaries(root: string): Promise<string[]> {
  const packages = await readdir(resolve(root, "packages"), { withFileTypes: true });
  const directories = packages.filter((entry) => entry.isDirectory());
  const checks = directories.map((entry) => {
    if (isWorkspaceOwner(entry.name)) {
      return packageViolations(entry.name, root);
    }
    return Promise.resolve([
      `${entry.name}: add an explicit dependency policy before adding a package`,
    ]);
  });
  return (await Promise.all(checks)).flat();
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = await checkBoundaries(fileURLToPath(new URL("../", import.meta.url)));
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Package boundaries passed.");
  }
}

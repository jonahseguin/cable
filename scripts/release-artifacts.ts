import { execFileSync } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { z } from "zod";

import {
  artifactCandidates,
  publishablePackages,
  withheldPackages,
  workerdPackages,
} from "./release-config.js";

const packageManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  exports: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
});

type PackageManifest = z.infer<typeof packageManifestSchema>;

interface WorkspacePackage {
  readonly directory: string;
  readonly manifest: PackageManifest;
}

const root = resolve(import.meta.dirname, "..");

function packageManifest(text: string): PackageManifest {
  return packageManifestSchema.parse(JSON.parse(text));
}

function run(command: string, args: readonly string[], cwd = root): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function workspacePackages(): Promise<readonly WorkspacePackage[]> {
  const packagesDirectory = join(root, "packages");
  const entries = await readdir(packagesDirectory, { withFileTypes: true });
  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const directory = join(packagesDirectory, entry.name);
        const manifest = packageManifest(await readFile(join(directory, "package.json"), "utf8"));
        return { directory, manifest };
      }),
  );
  const ordered = [...packages];
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const earlier = ordered[left];
      const later = ordered[right];
      if (
        earlier !== undefined &&
        later !== undefined &&
        earlier.manifest.name.localeCompare(later.manifest.name) > 0
      ) {
        ordered[left] = later;
        ordered[right] = earlier;
      }
    }
  }
  return ordered;
}

function internalDependencies(manifest: PackageManifest): readonly string[] {
  return Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).filter(
    (name) => name.startsWith("@cablejs/"),
  );
}

function sortedPackages(
  packages: readonly WorkspacePackage[],
  selectedNames: readonly string[],
): readonly WorkspacePackage[] {
  const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
  const selected = new Set(selectedNames);
  const order: WorkspacePackage[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular release dependency at ${name}.`);
    const pkg = byName.get(name);
    if (pkg === undefined) throw new Error(`Unknown package ${name}.`);
    visiting.add(name);
    for (const dependency of internalDependencies(pkg.manifest)) {
      if (!selected.has(dependency)) {
        throw new Error(
          `${name} requires ${dependency}, which is absent from the selected release set.`,
        );
      }
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
    order.push(pkg);
  }

  for (const name of selectedNames) visit(name);
  return order;
}

function exportFiles(manifest: PackageManifest): readonly string[] {
  const targets: string[] = [];
  for (const target of Object.values(manifest.exports ?? {})) {
    const direct = z.string().safeParse(target);
    if (direct.success) {
      targets.push(direct.data);
      continue;
    }
    targets.push(...Object.values(z.record(z.string(), z.string()).parse(target)));
  }
  return targets;
}

function archiveFiles(archive: string): ReadonlySet<string> {
  return new Set(
    run("tar", ["-tzf", archive])
      .trim()
      .split("\n")
      .map((path) => path.replace(/^package\//, "")),
  );
}

function archiveManifest(archive: string): PackageManifest {
  return packageManifest(run("tar", ["-xOzf", archive, "package/package.json"]));
}

function auditPackedFiles(
  pkg: WorkspacePackage,
  archive: string,
  selected: ReadonlyMap<string, WorkspacePackage>,
): void {
  const packed = archiveFiles(archive);
  const forbidden = [...packed].filter(
    (path) =>
      path.startsWith("references/") || path.includes("/references/") || path.startsWith("vendor/"),
  );
  if (forbidden.length > 0)
    throw new Error(`${pkg.manifest.name} includes forbidden files: ${forbidden.join(", ")}`);
  if (!packed.has("LICENSE"))
    throw new Error(`${pkg.manifest.name} omits the MIT license from its tarball.`);

  for (const target of exportFiles(pkg.manifest)) {
    const normalized = target.replace(/^\.\//, "");
    if (!packed.has(normalized))
      throw new Error(`${pkg.manifest.name} omits export target ${target} from its tarball.`);
  }

  const declarations = [...packed].filter((path) => path.endsWith(".d.mts"));
  if (declarations.length === 0)
    throw new Error(`${pkg.manifest.name} ships no declaration files.`);

  const manifest = archiveManifest(archive);
  if (manifest.name !== pkg.manifest.name || manifest.version !== pkg.manifest.version) {
    throw new Error(`${pkg.manifest.name} archive metadata does not match its release manifest.`);
  }
  for (const [name, version] of Object.entries({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  })) {
    if (version.startsWith("workspace:"))
      throw new Error(`${manifest.name} archive retains workspace protocol for ${name}.`);
    const dependency = selected.get(name);
    if (dependency !== undefined && version !== dependency.manifest.version) {
      throw new Error(
        `${manifest.name} archive depends on ${name}@${version}, not packed ${dependency.manifest.version}.`,
      );
    }
  }
}

async function importPackedCloudflare(
  pkg: WorkspacePackage,
  aliases: Readonly<Record<string, string>>,
): Promise<void> {
  const config = join(pkg.directory, ".cable-release-workerd.config.mjs");
  const test = join(pkg.directory, "workerd", "conformance.spec.ts");
  const wrangler = join(pkg.directory, "wrangler.test.jsonc");
  const source = [
    'import { cloudflareTest } from "@cloudflare/vitest-plugin";',
    'import { defineConfig } from "vitest/config";',
    `export default defineConfig({ resolve: { alias: ${JSON.stringify(aliases)} }, plugins: [cloudflareTest({ wrangler: { configPath: ${JSON.stringify(wrangler)} } })], test: { include: [${JSON.stringify(test)}] } });`,
  ].join("\n");
  await writeFile(config, source);
  try {
    run(
      "bunx",
      ["vitest", "run", "--config", config, "--max-workers=1", "--no-isolate"],
      pkg.directory,
    );
  } finally {
    await rm(config, { force: true });
  }
}

async function runtimeImports(
  packages: readonly WorkspacePackage[],
  tarballs: ReadonlyMap<string, string>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "cable-release-audit-"));
  try {
    const modules = join(directory, "node_modules");
    await Promise.all(
      packages.map(async (pkg) => {
        const archive = tarballs.get(pkg.manifest.name);
        if (archive === undefined) throw new Error(`Missing archive for ${pkg.manifest.name}.`);
        const extracted = join(directory, basename(archive, ".tgz"));
        await mkdir(extracted);
        run("tar", ["-xzf", archive, "-C", extracted]);
        const license = await readFile(join(extracted, "package", "LICENSE"), "utf8");
        if (
          !license.includes("MIT License") ||
          !license.includes("Copyright (c) 2026 Jonah Seguin")
        ) {
          throw new Error(`${pkg.manifest.name} has an incomplete packaged license.`);
        }
        const scopedDirectory = join(modules, "@cablejs");
        await mkdir(scopedDirectory, { recursive: true });
        await symlink(
          join(extracted, "package"),
          join(scopedDirectory, pkg.manifest.name.slice("@cablejs/".length)),
        );
      }),
    );

    const dependencies = packages.flatMap((pkg) =>
      [
        ...Object.keys(pkg.manifest.dependencies ?? {}),
        ...Object.keys(pkg.manifest.peerDependencies ?? {}),
      ]
        .filter((name) => !name.startsWith("@cablejs/"))
        .map((name) => ({ directory: pkg.directory, name })),
    );
    const dependencyNames = new Set(dependencies.map(({ name }) => name));
    await Promise.all(
      [...dependencyNames].map(async (dependency) => {
        const destination = join(modules, dependency);
        await mkdir(dirname(destination), { recursive: true });
        const candidates = dependencies
          .filter(({ name }) => name === dependency)
          .flatMap(({ directory: packageDirectory }) => [
            join(packageDirectory, "node_modules", dependency),
            join(root, "node_modules", dependency),
          ]);
        const source = await Promise.any(
          candidates.map(async (candidate) => {
            await access(candidate);
            return candidate;
          }),
        ).catch(() => {
          throw new Error(`Cannot find installed runtime dependency ${dependency}.`);
        });
        try {
          await symlink(source, destination);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("EEXIST")) throw error;
        }
      }),
    );

    packages
      .filter((pkg) => !workerdPackages.has(pkg.manifest.name))
      .forEach((pkg) => {
        run(
          process.execPath,
          ["--input-type=module", "--eval", `await import(${JSON.stringify(pkg.manifest.name)})`],
          directory,
        );
      });
    const aliases = Object.fromEntries(
      packages.map((pkg) => {
        const archive = tarballs.get(pkg.manifest.name);
        if (archive === undefined) throw new Error(`Missing archive for ${pkg.manifest.name}.`);
        return [
          pkg.manifest.name,
          join(directory, basename(archive, ".tgz"), "package", "dist", "index.mjs"),
        ];
      }),
    );
    await Promise.all(
      packages
        .filter((pkg) => workerdPackages.has(pkg.manifest.name))
        .map((pkg) => importPackedCloudflare(pkg, aliases)),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

interface Arguments {
  readonly selection: "--configured" | "--all-eligible";
  readonly outputDirectory?: string;
}

function argumentsFor(argv: readonly string[]): Arguments {
  const [selection, flag, directory] = argv;
  if (selection !== "--configured" && selection !== "--all-eligible") {
    throw new Error(
      "Usage: bun scripts/release-artifacts.ts --configured|--all-eligible [--output <directory>]",
    );
  }
  if (flag === undefined) return { selection };
  if (flag !== "--output" || directory === undefined || argv.length !== 3) {
    throw new Error(
      "Usage: bun scripts/release-artifacts.ts --configured|--all-eligible [--output <directory>]",
    );
  }
  return { outputDirectory: resolve(directory), selection };
}

function selectedPackageNames(selection: Arguments["selection"]): readonly string[] {
  return selection === "--configured" ? publishablePackages : artifactCandidates;
}

async function emptyOutputDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length > 0)
    throw new Error(`Artifact output directory is not empty: ${directory}`);
}

async function packArchive(
  pkg: WorkspacePackage,
  destination: string,
  selected: ReadonlyMap<string, WorkspacePackage>,
): Promise<string> {
  const staging = await mkdtemp(join(tmpdir(), "cable-release-pack-"));
  await cp(pkg.directory, staging, {
    recursive: true,
    filter(source) {
      return !source.includes("/node_modules/");
    },
  });
  const stagedManifestPath = join(staging, "package.json");
  const stagedManifest = JSON.parse(await readFile(stagedManifestPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const) {
    for (const [name, version] of Object.entries(stagedManifest[field] ?? {})) {
      const dependency = selected.get(name);
      if (dependency !== undefined && version.startsWith("workspace:")) {
        stagedManifest[field]![name] = dependency.manifest.version;
      }
    }
  }
  delete stagedManifest.devDependencies;
  await writeFile(stagedManifestPath, `${JSON.stringify(stagedManifest, undefined, 2)}\n`);
  const before = new Set(await readdir(destination));
  try {
    run(
      "bun",
      ["pm", "pack", "--ignore-scripts", "--quiet", "--destination", destination],
      staging,
    );
    const archives = (await readdir(destination))
      .filter((name) => !before.has(name) && name.endsWith(".tgz"))
      .map((name) => join(destination, name));
    const [archive] = archives;
    if (archive === undefined || archives.length !== 1)
      throw new Error(`${pkg.manifest.name} did not produce exactly one archive.`);
    return archive;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function verifyReproducibleArchive(
  pkg: WorkspacePackage,
  archive: string,
  selected: ReadonlyMap<string, WorkspacePackage>,
): Promise<void> {
  const destination = await mkdtemp(join(tmpdir(), "cable-release-reproducibility-"));
  try {
    run("bun", ["run", "build"], pkg.directory);
    const repeated = await packArchive(pkg, destination, selected);
    const [first, second] = await Promise.all([readFile(archive), readFile(repeated)]);
    if (!first.equals(second))
      throw new Error(`${pkg.manifest.name} Bun archive is not reproducible.`);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
}

const packages = await workspacePackages();
const options = argumentsFor(process.argv.slice(2));
const names = selectedPackageNames(options.selection);
if (names.length === 0)
  throw new Error(
    "No packages are approved for publication. Update scripts/release-config.ts deliberately.",
  );
for (const name of names) {
  const reason = withheldPackages.get(name);
  if (reason !== undefined) throw new Error(`${name} is withheld from publication: ${reason}`);
}

const ordered = sortedPackages(packages, names);
const selected = new Map(ordered.map((pkg) => [pkg.manifest.name, pkg]));
const temporary = options.outputDirectory === undefined;
const destination =
  options.outputDirectory ?? (await mkdtemp(join(tmpdir(), "cable-release-tarballs-")));
try {
  if (!temporary) await emptyOutputDirectory(destination);
  const tarballs = new Map<string, string>();
  async function pack(index: number): Promise<void> {
    const pkg = ordered[index];
    if (pkg === undefined) return;
    if (pkg.manifest.scripts?.["build"] === undefined)
      throw new Error(`${pkg.manifest.name} has no build script.`);
    run("bun", ["run", "build"], pkg.directory);
    const archive = await packArchive(pkg, destination, selected);
    await verifyReproducibleArchive(pkg, archive, selected);
    auditPackedFiles(pkg, archive, selected);
    tarballs.set(pkg.manifest.name, archive);
    await pack(index + 1);
  }
  await pack(0);
  await runtimeImports(ordered, tarballs);
  if (!temporary) {
    const artifacts = ordered.map((pkg) => {
      const archive = tarballs.get(pkg.manifest.name);
      if (archive === undefined) throw new Error(`Missing archive for ${pkg.manifest.name}.`);
      return { archive: basename(archive), name: pkg.manifest.name, version: pkg.manifest.version };
    });
    await writeFile(
      join(destination, "release-plan.json"),
      `${JSON.stringify({ artifacts }, undefined, 2)}\n`,
    );
  }
  console.log(`Audited ${ordered.map((pkg) => pkg.manifest.name).join(", ")}.`);
} finally {
  if (temporary) await rm(destination, { recursive: true, force: true });
}

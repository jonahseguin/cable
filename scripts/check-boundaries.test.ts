import { describe, expect, it } from "vitest";

import { imports, manifestViolations, violation } from "./check-boundaries.js";

const root = "/workspace";

function check(owner: string, source: string): (string | undefined)[] {
  const file = `${root}/packages/${owner}/src/index.ts`;
  return imports(source).map((edge) => violation(owner, file, edge, root));
}

function expectRejected(owner: string, source: string): void {
  expect(check(owner, source).every((reason) => reason !== undefined)).toBe(true);
}

describe("source dependency discovery", () => {
  it("preserves type-only evidence across supported TypeScript forms", () => {
    const edges = imports(`
      import type { StandardSchemaV1 } from "@standard-schema/spec";
      import { type Result } from "@standard-schema/spec";
      export type { StandardSchemaV1 } from "@standard-schema/spec";
      type Schema = import("@standard-schema/spec").StandardSchemaV1;
    `);

    expect(edges).toHaveLength(4);
    expect(edges.every((edge) => edge.typeOnly)).toBe(true);
  });

  it("finds CommonJS and dynamic module loading, including computed targets", () => {
    expect(
      imports(`
        import("literal");
        import(target);
        require("direct");
        require.resolve("resolved");
        module.require("module-require");
        import.meta.resolve("meta-resolve");
      `).map((edge) => edge.specifier),
    ).toEqual([
      "literal",
      "<computed module>",
      "direct",
      "resolved",
      "module-require",
      "meta-resolve",
    ]);
  });
});

describe("source package boundaries", () => {
  it("allows only type-only Standard Schema imports in contract", () => {
    expect(
      check("contract", `import type { StandardSchemaV1 } from "@standard-schema/spec";`),
    ).toEqual([undefined]);
    expectRejected(
      "contract",
      `import { type StandardSchemaV1, vendor } from "@standard-schema/spec";`,
    );
    expectRejected("contract", `export * from "@standard-schema/spec";`);
    expectRejected("contract", `import "another-package";`);
  });

  it("enforces public workspace entry points and dependency direction", () => {
    expect(check("client", `import "@cable/core"; export * from "./socket.js";`)).toEqual([
      undefined,
      undefined,
    ]);
    expectRejected("core", `export * from "@cable/client";`);
    expectRejected("client", `import "@cable/core/src/private";`);
    expectRejected("client", `import "../../core/src/index.js";`);
    expectRejected("client", `import(target);`);
  });

  it("rejects references, aliases, absolute paths, and URLs", () => {
    const reasons = check(
      "adapter-memory",
      `
        import "../../../references/trpc/index.js";
        import "references/orpc";
        import "#private";
        import "/workspace/shared.js";
        import "https://example.com/module.js";
      `,
    );
    expect(reasons.every((reason) => reason !== undefined)).toBe(true);
  });

  it("keeps platform modules in their matching adapter", () => {
    expect(check("adapter-node", `import "node:fs"; import "ws";`)).toEqual([undefined, undefined]);
    expect(
      check("cloudflare", `import "cloudflare:workers"; import "@cloudflare/workers-types";`),
    ).toEqual([undefined, undefined]);
    expect(check("rivet", `import "rivetkit"; import "bun:sqlite";`)).toEqual([
      undefined,
      undefined,
    ]);

    expectRejected("core", `import type { DurableObject } from "cloudflare:workers";`);
    expectRejected("client", `import "node:fs/promises";`);
    expectRejected("cloudflare", `import "ws";`);
    expectRejected("adapter-node", `import "@rivet/client";`);
    expectRejected("core", `import "effect";`);
    expectRejected("react", `import type { Schema } from "@effect/schema";`);
    expect(check("effect", `import "effect"; import "@effect/platform";`)).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe("manifest package boundaries", () => {
  it("checks every runtime dependency section and the workspace protocol", () => {
    const errors = manifestViolations(
      "core",
      JSON.stringify({
        name: "@cable/core",
        dependencies: { "@cable/client": "workspace:*" },
        optionalDependencies: { "node:fs": "1.0.0" },
        peerDependencies: { "@cable/contract": "^0.1.0" },
      }),
      root,
    );

    expect(errors).toEqual([
      "core/package.json: @cable/client: unsupported package dependency: @cable/client",
      "core/package.json: node:fs: platform module belongs in adapter-node: node:fs",
      "core/package.json: @cable/contract: internal dependencies must use the workspace protocol",
    ]);
  });

  it("rejects runtime dependencies from the zero-runtime contract package", () => {
    const errors = manifestViolations(
      "contract",
      JSON.stringify({
        name: "@cable/contract",
        dependencies: { "@standard-schema/spec": "1.0.0" },
      }),
      root,
    );

    expect(errors).toEqual([
      "contract/package.json: @standard-schema/spec: contract permits only type-only @standard-schema/spec imports",
    ]);
  });

  it("requires a package name that matches its workspace directory", () => {
    expect(manifestViolations("client", JSON.stringify({ name: "@cable/wrong" }), root)).toEqual([
      "client/package.json: expected package name @cable/client",
    ]);
  });

  it("fails closed on malformed manifests", () => {
    expect(() => manifestViolations("client", "[]", root)).toThrow(
      "package.json must contain an object",
    );
    expect(() =>
      manifestViolations(
        "client",
        JSON.stringify({ name: "@cable/client", dependencies: { invalid: 1 } }),
        root,
      ),
    ).toThrow("package.json dependencies.invalid must be a string");
  });
});

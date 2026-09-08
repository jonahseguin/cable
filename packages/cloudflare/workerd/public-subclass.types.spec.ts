import { conformanceChannel, createConformanceImplementation } from "@cablejs/conformance";
import { describe, expect, it } from "vitest";

import { cloudflareHost } from "../src/index.js";

interface FixtureEnv {
  readonly FEATURE_FLAG: string;
}

interface CustomRpcResult {
  readonly id: string;
  readonly feature: string;
}

const Base = cloudflareHost(conformanceChannel, createConformanceImplementation(), {
  grantSecret: (_env: FixtureEnv) => "cloudflare-subclass-fixture-secret-32-chars",
  peer: (_env: FixtureEnv, _key) => {
    throw new Error("The type fixture never opens a peer.");
  },
});

class PublicSubclass extends Base {
  public customRpc(): CustomRpcResult {
    return { feature: this.env.FEATURE_FLAG, id: this.ctx.id.toString() };
  }
}

describe("public Cloudflare host subclass type", () => {
  it("exposes the native Durable Object context to subclasses", () => {
    expect(PublicSubclass).toBeTypeOf("function");
  });
});

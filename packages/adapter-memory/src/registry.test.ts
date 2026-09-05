import type { HostKey } from "@cable/core";
import { describe, expect, it } from "vitest";

import { MemoryHostRegistry } from "./registry.js";

function key(value: string): HostKey {
  // SAFETY: Tests use the same non-empty, colon-delimited format as adapter-derived Host keys.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- HostKey is a string brand.
  return value as HostKey;
}

describe("MemoryHostRegistry", () => {
  it("clones peer calls and their responses", async () => {
    const registry = new MemoryHostRegistry();
    let receivedPayload: unknown;
    registry.register(key("chat:lobby"), {
      onPeer: async (message) => {
        receivedPayload = message["payload"];
        return { count: 2 };
      },
    });
    const peers = registry.createPeers();
    const message = { payload: { count: 1 }, t: "increment" };

    const response = await peers.call<{ count: number }>(key("chat:lobby"), message);

    expect(response).toEqual({ count: 2 });
    expect(receivedPayload).toEqual(message.payload);
    expect(receivedPayload).not.toBe(message.payload);
  });

  it("rejects duplicate and missing Host keys", async () => {
    const registry = new MemoryHostRegistry();
    const host = { onPeer: async () => undefined };
    registry.register(key("chat:lobby"), host);

    expect(() => registry.register(key("chat:lobby"), host)).toThrow("already registered");
    await expect(registry.createPeers().send(key("chat:missing"), { t: "ping" })).rejects.toThrow(
      "No memory Host",
    );
  });
});

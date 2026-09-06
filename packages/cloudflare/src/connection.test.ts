/* oxlint-disable anti-slop/no-chained-type-assertions,
anti-slop/require-safety-comment-for-type-assertion,
typescript/no-unsafe-type-assertion -- These test doubles provide only the
Cloudflare APIs exercised by connection reconstruction. */
import { describe, expect, it } from "vitest";

import { CloudflareConnection, connectionIdFromTags, parseAttachment } from "./connection.js";
import type { CloudflareSocketState, HibernatableSocket } from "./runtime.js";

describe("Cloudflare connection reconstruction", () => {
  it("parses only the exact persisted attachment for its immutable cid tag", () => {
    const attachment = {
      cid: "connection-1",
      grantId: "grant-1",
      phase: "resuming",
      since: 12,
      v: 1,
    };

    expect(parseAttachment(attachment, "connection-1")).toEqual(attachment);
    expect(parseAttachment(attachment, "connection-2")).toBeUndefined();
    expect(parseAttachment({ ...attachment, extra: true }, "connection-1")).toBeUndefined();
    expect(parseAttachment({ ...attachment, phase: "unknown" }, "connection-1")).toBeUndefined();
    expect(parseAttachment({ ...attachment, since: -1 }, "connection-1")).toBeUndefined();
  });

  it("requires exactly one non-empty cid tag", () => {
    expect(connectionIdFromTags(["cid:connection-1", "uid:user-1"])).toBe("connection-1");
    expect(() => connectionIdFromTags([])).toThrow("exactly one non-empty cid tag");
    expect(() => connectionIdFromTags(["cid:"])).toThrow("exactly one non-empty cid tag");
    expect(() => connectionIdFromTags(["cid:first", "cid:second"])).toThrow(
      "exactly one non-empty cid tag",
    );
  });

  it("uses the Host-configured attachment byte limit", () => {
    const attachment = {
      cid: "connection-1",
      grantId: "grant-1",
      phase: "pending" as const,
      v: 1 as const,
    };
    const socket = {
      deserializeAttachment: () => attachment,
      serializeAttachment() {},
    } as unknown as HibernatableSocket;
    const state = {
      getTags: () => ["cid:connection-1"],
    } as unknown as CloudflareSocketState;
    const connection = new CloudflareConnection(socket, state, 100);

    expect(() => {
      connection.attachment.set({ ...attachment, grantId: "x".repeat(100) });
    }).toThrow(/attachment.*100.*bytes/iu);
  });

  it("recovers only from workerd's closed-socket tag lookup error", () => {
    const attachment = {
      cid: "connection-1",
      grantId: "grant-1",
      phase: "ready" as const,
      v: 1 as const,
    };
    const socket = {
      deserializeAttachment: () => attachment,
      serializeAttachment() {},
    } as unknown as HibernatableSocket;
    const closed = {
      getTags: () => {
        throw new Error(
          "you must call 'acceptWebSocket()' before attempting to access the tags of a WebSocket.",
        );
      },
    } as unknown as CloudflareSocketState;
    expect(new CloudflareConnection(socket, closed).id).toBe("connection-1");
    const broken = {
      getTags: () => {
        throw new Error("unexpected tag failure");
      },
    } as unknown as CloudflareSocketState;
    expect(() => new CloudflareConnection(socket, broken)).toThrow("unexpected tag failure");
  });
});

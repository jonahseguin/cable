import type { Attachment, ConnectionId, GrantId } from "@cable/core";
import { describe, expect, it } from "vitest";

import { NodeConnection } from "./connection.js";

function connectionId(value: string): ConnectionId {
  // SAFETY: Test fixtures use host-generated non-empty connection ids.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The fixture establishes the opaque id invariant.
  return value as ConnectionId;
}

function grantId(value: string): GrantId {
  // SAFETY: Test fixtures use engine-generated non-empty grant ids.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The fixture establishes the opaque id invariant.
  return value as GrantId;
}

function attachment(): Attachment {
  return { cid: connectionId("connection-1"), grantId: grantId("grant-1"), phase: "pending", v: 1 };
}

describe("NodeConnection", () => {
  it("keeps attachment metadata separate from the live WebSocket", () => {
    const sent: Array<string | ArrayBuffer> = [];
    const closed: Array<[number | undefined, string | undefined]> = [];
    const connection = new NodeConnection(
      {
        bufferedAmount: 12,
        close: (code, reason) => closed.push([code, reason]),
        send: (frame) => sent.push(frame),
      },
      ["cid:connection-1"],
      attachment(),
      1_000,
    );

    connection.send("hello");
    connection.close(1_001, "done");
    connection.attachment.set({ ...attachment(), phase: "ready", since: 5 });

    expect(sent).toEqual(["hello"]);
    expect(closed).toEqual([[1_001, "done"]]);
    expect(connection.bufferedAmount).toBe(12);
    expect(connection.attachment.get()).toEqual({
      cid: "connection-1",
      grantId: "grant-1",
      phase: "ready",
      since: 5,
      v: 1,
    });
  });
});

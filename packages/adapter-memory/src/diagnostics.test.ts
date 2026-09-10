import { c } from "@cablejs/contract";
import {
  CableError,
  channelKey,
  encodeClientFrame,
  signGrant,
  type CableDiagnosticEvent,
  type GrantClaims,
} from "@cablejs/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ManualClock } from "./clock.js";
import { createMemoryHost } from "./host.js";

const channel = c.channel("room.{roomId}", {
  client: { reject: { errors: { REJECTED: z.void() }, input: z.void() } },
  server: {},
});

describe("memory host diagnostics", () => {
  it("completes a rejected client event once without recording its payload or a duplicate fault", async () => {
    const events: CableDiagnosticEvent[] = [];
    const clock = new ManualClock(1_000);
    const key = channelKey(channel, { roomId: "lobby" });
    const host = createMemoryHost(
      channel,
      {
        onClient: {
          reject: () => {
            throw new CableError("REJECTED", { data: undefined });
          },
        },
        procedures: {},
      },
      {
        clock,
        diagnostics: {
          observe: (event) => {
            events.push(event);
          },
        },
        grantSecret: "diagnostics-memory-secret-material",
        key,
      },
    );
    const grant = await signGrant(
      {
        exp: clock.now() + 60_000,
        grants: [],
        hostKey: key,
        identity: { userId: "secret-user" },
        params: { roomId: "lobby" },
        v: 1,
      } satisfies GrantClaims,
      "diagnostics-memory-secret-material",
    );
    const socket = host.connect(new Request("https://memory.invalid/_cable/ws"), grant);
    await host.flush();
    socket.send(encodeClientFrame({ t: "hello", v: 1 }));
    await host.flush();
    socket.send(encodeClientFrame({ d: undefined, ev: "reject", id: "1", t: "emit" }));
    await host.flush();
    socket.send(
      encodeClientFrame({
        d: "private-event-secret",
        ev: "private-event-secret",
        id: "2",
        t: "emit",
      }),
    );
    await host.flush();
    socket.send(
      encodeClientFrame({
        d: "private-procedure-secret",
        id: "3",
        p: "private-procedure-secret",
        t: "call",
      }),
    );
    await host.flush();

    const operations = events.filter((event) => event.type === "operation");
    expect(operations).toEqual([
      expect.objectContaining({
        durationMs: 0,
        failure: { code: "REJECTED", kind: "cable" },
        name: "room.{roomId}.event.reject",
        outcome: "error",
        runtime: "server",
        transport: "channel-socket",
      }),
      expect.objectContaining({ name: "channel event", outcome: "error", type: "operation" }),
      expect.objectContaining({ name: "channel procedure", outcome: "error", type: "operation" }),
    ]);
    expect(events.filter((event) => event.type === "fault")).toEqual([]);
    expect(JSON.stringify(events)).not.toContain("private-event-secret");
    expect(JSON.stringify(events)).not.toContain("private-procedure-secret");
    expect(events.some((event) => Object.hasOwn(event, "identity"))).toBe(false);
    expect(events.some((event) => Object.hasOwn(event, "input"))).toBe(false);
    expect(events.some((event) => Object.hasOwn(event, "params"))).toBe(false);
  });
});

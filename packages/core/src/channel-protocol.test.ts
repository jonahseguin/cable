import { describe, expect, it } from "vitest";

import {
  decodeClientFrame,
  decodeHostFrame,
  encodeClientFrame,
  encodeHostFrame,
} from "./channel-protocol.js";
import type { HostWireFrame } from "./channel-protocol.js";
import type { ConnectionId } from "./host.js";

function connectionId(value: string): ConnectionId {
  // SAFETY: Protocol fixtures use non-empty connection identifiers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ConnectionId is an opaque validated-string brand.
  return value as ConnectionId;
}

describe("channel protocol codec", () => {
  it("roundtrips client frames and ping without changing data", () => {
    expect(decodeClientFrame(encodeClientFrame("ping"))).toBe("ping");
    expect(
      decodeClientFrame(encodeClientFrame({ enc: "json", since: 8, t: "hello", v: 1 })),
    ).toEqual({ enc: "json", since: 8, t: "hello", v: 1 });
    expect(
      decodeClientFrame(encodeClientFrame({ d: { text: "hi" }, ev: "send", id: "1", t: "emit" })),
    ).toEqual({ d: { text: "hi" }, ev: "send", id: "1", t: "emit" });
    expect(
      decodeClientFrame(encodeClientFrame({ d: null, id: "2", p: "kick", t: "call" })),
    ).toEqual({ d: null, id: "2", p: "kick", t: "call" });
    expect(decodeClientFrame(encodeClientFrame({ d: { typing: true }, t: "presence" }))).toEqual({
      d: { typing: true },
      t: "presence",
    });
  });

  it("roundtrips welcome chunks and every independent host frame", () => {
    const cid = connectionId("cid-1");
    const frames: readonly HostWireFrame[] = [
      "pong",
      {
        cid,
        more: true,
        presence: [{ cid, d: { typing: true }, uid: "user-1" }],
        replay: [{ d: { text: "hello" }, ev: "message", seq: 3, t: "ev" }],
        seq: 4,
        t: "welcome",
        v: 1,
      },
      { d: { text: "live" }, ev: "message", seq: 5, t: "ev" },
      { d: { text: "private" }, ev: "message", t: "evt" },
      { d: { ok: true }, id: "1", ok: true, t: "res" },
      { e: { code: "MUTED", data: { until: 4 }, message: "Muted" }, id: "2", ok: false, t: "res" },
      { join: [{ cid, d: null }], t: "presence" },
      { code: "PARSE_ERROR", message: "Bad frame", t: "err" },
      { code: 4003, reason: "Kicked", t: "bye" },
    ];

    for (const frame of frames) {
      expect(decodeHostFrame(encodeHostFrame(frame))).toEqual(frame);
    }
  });

  it("enforces UTF-8 byte limits and rejects binary protocol v1 frames", () => {
    const encoded = JSON.stringify({ d: "é", ev: "send", t: "emit" });
    const byteLength = new TextEncoder().encode(encoded).byteLength;

    expect(() => decodeClientFrame(encoded, byteLength - 1)).toThrow("maxFrameBytes");
    expect(decodeClientFrame(encoded, byteLength)).toEqual({ d: "é", ev: "send", t: "emit" });
    expect(() => decodeClientFrame(new TextEncoder().encode("ping").buffer)).toThrow(
      "Binary frames are not supported",
    );
  });

  it.each([
    ['{"t":"hello","v":1,"cid":"client-owned"}', "unknown key 'cid'"],
    ['{"t":"hello","v":2}', "hello.v must be 1"],
    ['{"t":"unknown"}', "Unknown client frame type"],
    ['{"t":"emit","ev":""}', "emit.ev must not be empty"],
    ['{"t":"call","id":"1","p":"x","extra":true}', "unknown key 'extra'"],
    ["not json", "Invalid channel JSON"],
  ])("rejects an invalid client frame: %s", (frame, message) => {
    expect(() => decodeClientFrame(frame)).toThrow(message);
  });

  it("rejects invalid welcome and presence invariants", () => {
    expect(() =>
      decodeHostFrame(
        JSON.stringify({
          cid: "cid-1",
          presence: [],
          replay: [{ ev: "message", seq: 1, t: "ev" }],
          reset: true,
          seq: 1,
          t: "welcome",
          v: 1,
        }),
      ),
    ).toThrow("reset welcome cannot contain replay");
    expect(() =>
      decodeHostFrame(
        JSON.stringify({
          cid: "cid-1",
          presence: [],
          replay: [
            { ev: "message", seq: 2, t: "ev" },
            { ev: "message", seq: 2, t: "ev" },
          ],
          seq: 2,
          t: "welcome",
          v: 1,
        }),
      ),
    ).toThrow("strictly ascending");
    expect(() =>
      decodeHostFrame(
        JSON.stringify({
          cid: "cid-1",
          presence: [],
          replay: [{ ev: "message", seq: 3, t: "ev" }],
          seq: 2,
          t: "welcome",
          v: 1,
        }),
      ),
    ).toThrow("cannot advance beyond welcome.seq");
    expect(() =>
      decodeHostFrame(
        JSON.stringify({
          cid: "cid-1",
          presence: [
            { cid: "same", d: null },
            { cid: "same", d: null },
          ],
          replay: [],
          seq: 2,
          t: "welcome",
          v: 1,
        }),
      ),
    ).toThrow("repeats connection");
    expect(() =>
      decodeHostFrame(
        JSON.stringify({
          join: [{ cid: "same", d: null }],
          leave: ["same"],
          t: "presence",
        }),
      ),
    ).toThrow("repeats connection");
    expect(() => decodeHostFrame('{"t":"presence"}')).toThrow("at least one change");
  });

  it("omits void payloads and rejects values that JSON would transform", () => {
    expect(decodeClientFrame(encodeClientFrame({ d: undefined, ev: "send", t: "emit" }))).toEqual({
      ev: "send",
      t: "emit",
    });
    expect(() => encodeClientFrame({ d: new Date(0), ev: "send", t: "emit" })).toThrow(
      expect.objectContaining({ code: "BAD_REQUEST" }),
    );
  });
});

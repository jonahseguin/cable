import { c } from "@cablejs/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  channelKey,
  encodeHostKeySegment,
  parseChannelKey,
  resolveChannel,
} from "./channel-key.js";

describe("channel host keys", () => {
  const channel = c.channel("chat.{roomId}.{threadId}", {
    client: {},
    params: z.object({
      roomId: z.number().transform(String),
      threadId: z.string(),
    }),
    server: {},
  });

  it("validates transformed inputs and encodes every segment canonically", async () => {
    const resolved = await resolveChannel(channel, {
      roomId: 42,
      threadId: "a:b/c !'()*é",
    });

    expect(resolved).toEqual({
      key: "chat:42:a%3Ab%2Fc%20%21%27%28%29%2A%C3%A9",
      params: { roomId: "42", threadId: "a:b/c !'()*é" },
    });
    expect(Object.isFrozen(resolved.params)).toBe(true);
    expect(parseChannelKey(channel, resolved.key)).toEqual(resolved.params);
    expect(channelKey(channel, { threadId: "a:b/c !'()*é", roomId: "42" })).toBe(resolved.key);
    expect(encodeHostKeySegment("-._~")).toBe("-._~");
  });

  it("rejects malformed and non-canonical host keys", () => {
    expect(() => parseChannelKey(channel, "chat:42")).toThrow("segment count");
    expect(() => parseChannelKey(channel, "other:42:value")).toThrow("literal");
    expect(() => parseChannelKey(channel, "chat:%34%32:value")).toThrow("canonically encoded");
    expect(() => parseChannelKey(channel, "chat:42:%zz")).toThrow("percent encoding");
    expect(() => parseChannelKey(channel, "chat:42:a:b")).toThrow("segment count");
  });

  it("requires the parsed schema output to be the exact string route map", async () => {
    const extraOutput = c.channel("chat.{roomId}", {
      client: {},
      params: z.unknown().transform(() => ({ extra: "no", roomId: "room" })),
      server: {},
    });
    const nonStringOutput = c.channel("chat.{roomId}", {
      client: {},
      params: z.unknown().transform(() => ({ roomId: 1 })),
      server: {},
    });

    await expect(resolveChannel(extraOutput, null)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(resolveChannel(nonStringOutput, null)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      resolveChannel(channel, { roomId: "wrong", threadId: "ok" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("does not rerun a transforming parameter schema while decoding a key", async () => {
    let validations = 0;
    const counted = c.channel("room.{id}", {
      client: {},
      params: z.string().transform((value) => {
        validations += 1;
        return { id: value.toUpperCase() };
      }),
      server: {},
    });

    const resolved = await resolveChannel(counted, "lobby");
    expect(parseChannelKey(counted, resolved.key)).toEqual({ id: "LOBBY" });
    expect(validations).toBe(1);
  });
});

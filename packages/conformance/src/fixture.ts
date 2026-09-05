import { c } from "@cable/contract";
import { CableError } from "@cable/core";
import type { ChannelImplementation } from "@cable/core";
import { z } from "zod";

/** Identity used by the shared Host behavior fixture. */
export interface ConformanceIdentity {
  readonly userId: string;
}

/** Timer payloads used to verify durable alarm ordering. */
export interface ConformanceTimers {
  readonly announce: { readonly text: string };
}

/** Short deterministic policy values used by every conformance driver. */
export const CONFORMANCE_POLICY = Object.freeze({
  handshakeTimeoutMs: 100,
  replayChunkBytes: 2_048,
  timerRetryMs: 100,
});

/** Small limits that make byte-boundary scenarios fast and deterministic. */
export const CONFORMANCE_LIMITS = Object.freeze({
  attachmentBytes: 2_048,
  maxFrameBytes: 2_048,
});

/** Fixed channel contract implemented by every Host conformance driver. */
export const conformanceChannel = c.channel("conformance.{roomId}", {
  client: {
    publish: {
      errors: { REJECTED: z.object({ reason: z.string() }) },
      input: z.object({ text: z.string().trim().min(1) }),
    },
    schedule: z.object({
      at: z.number().int().nonnegative(),
      text: z.string(),
    }),
  },
  history: { max: 3, retain: "1s" },
  presence: z.object({ name: z.string(), online: z.boolean() }),
  procedures: {
    announce: c.mutation({
      input: z.object({ text: z.string() }),
      output: z.number().int().positive(),
    }),
    inspect: c.query({
      input: z.object({ value: z.string().transform((value) => value.toUpperCase()) }),
      output: z.object({
        userId: z.string(),
        value: z.string().transform((value) => `out:${value}`),
        via: z.enum(["peer", "socket"]),
      }),
    }),
    oversized: c.mutation({ input: z.void(), output: z.void() }),
    target: c.mutation({
      input: z.object({ text: z.string(), uid: z.string() }),
      output: z.void(),
    }),
  },
  server: {
    message: z.object({
      source: z.enum(["client", "procedure", "timer"]),
      text: z.string(),
    }),
  },
});

/** Build fresh application hooks; durable state remains owned by the Host. */
export function createConformanceImplementation(): ChannelImplementation<
  typeof conformanceChannel,
  ConformanceIdentity,
  ConformanceTimers
> {
  return {
    authorize(context) {
      if (!context.grants.includes("connect")) throw new CableError("FORBIDDEN");
    },
    onClient: {
      async publish(context, input) {
        if (input.text === "reject") {
          throw new CableError("REJECTED", {
            data: { reason: "fixture rejection" },
          });
        }
        await context.emit("message", { source: "client", text: input.text });
      },
      async schedule(context, input) {
        await context.schedule("announce", input.at, { text: input.text });
      },
    },
    procedures: {
      async announce(context, input) {
        return context.emit("message", {
          source: "procedure",
          text: input.text,
        });
      },
      inspect(context, input) {
        return {
          userId: context.identity.userId,
          value: input.value,
          via: context.connection === undefined ? "peer" : "socket",
        };
      },
      async oversized(context) {
        await context.emit("message", { source: "procedure", text: "x".repeat(1_600) });
      },
      async target(context, input) {
        await context.emitTo(
          { uid: input.uid },
          "message",
          { source: "procedure", text: input.text },
          { log: true },
        );
      },
    },
    timers: {
      async announce(context, input) {
        if (input.text === "retry" && (await context.storage.get("retried")) !== true) {
          await context.storage.put("retried", true);
          throw new Error("Retry the conformance timer once.");
        }
        await context.emit("message", { source: "timer", text: input.text });
      },
    },
  };
}

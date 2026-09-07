import type {
  AnyChannelContract,
  AnyProcedureContract,
  InferSchemaInput,
  InferSchemaOutput,
} from "@cablejs/contract";
import {
  CableError,
  createEngine,
  type ChannelAuthorizeContext,
  type ChannelConnectionContext,
  type ChannelContext,
  type ChannelDisconnectContext,
  type ChannelErrorContext,
  type ChannelProcedureContext,
  type ChannelImplementation,
  type EngineOptions,
  type EventTarget,
  type Host as CoreHost,
  type HostHandlers,
  type TimerPayloads,
} from "@cablejs/core";
import { Context, Effect, Layer } from "effect";

import { runEffect } from "./server.js";

/** The underlying cable Host available to Effect channel handlers. */
export const Host = Context.Service<CoreHost>("@cablejs/effect/Host");

/** Build the Host Layer supplied while a channel handler runs. */
export function hostLayer(host: CoreHost): Layer.Layer<CoreHost> {
  return Layer.succeed(Host)(host);
}

/** An Effect version of the common channel context with effectful output operations. */
export type EffectChannelContext<
  TChannel extends AnyChannelContract,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = Omit<ChannelContext<TChannel, TTimerPayloads>, "emit" | "emitTo" | "schedule"> & {
  emit<TName extends keyof TChannel["server"] & string>(
    event: TName,
    data: InferSchemaInput<TChannel["server"][TName]>,
  ): Effect.Effect<number, CableError<"INTERNAL">>;
  emitTo<TName extends keyof TChannel["server"] & string>(
    target: EventTarget,
    event: TName,
    data: InferSchemaInput<TChannel["server"][TName]>,
    options?: { readonly log?: boolean },
  ): Effect.Effect<void, CableError<"INTERNAL">>;
  schedule<TKind extends keyof TTimerPayloads & string>(
    kind: TKind,
    at: number,
    args: TTimerPayloads[TKind],
  ): Effect.Effect<string, CableError<"INTERNAL">>;
};

/** An Effect context for a client event. */
export type EffectChannelConnectionContext<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = Omit<
  ChannelConnectionContext<TChannel, TIdentity, TTimerPayloads>,
  keyof ChannelContext<TChannel, TTimerPayloads>
> &
  EffectChannelContext<TChannel, TTimerPayloads>;

/** An Effect context for a channel procedure. */
export type EffectChannelProcedureContext<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = Omit<
  ChannelProcedureContext<TChannel, TIdentity, TTimerPayloads>,
  keyof ChannelContext<TChannel, TTimerPayloads>
> &
  EffectChannelContext<TChannel, TTimerPayloads>;

/** An Effect context for a durable timer. */
export type EffectChannelTimerContext<
  TChannel extends AnyChannelContract,
  TTimerPayloads extends TimerPayloads = Record<never, never>,
> = EffectChannelContext<TChannel, TTimerPayloads>;

/** Effect handlers for one channel family. */
export interface EffectChannelImplementation<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads,
  TEnvironment,
> {
  readonly authorize?: (
    context: ChannelAuthorizeContext<TChannel, TIdentity>,
  ) => Effect.Effect<void, unknown, TEnvironment>;
  readonly onClient: {
    readonly [TName in keyof TChannel["client"] & string]: (
      context: EffectChannelConnectionContext<TChannel, TIdentity, TTimerPayloads>,
      input: InferSchemaOutput<TChannel["client"][TName]["input"]>,
    ) => Effect.Effect<
      void,
      {
        readonly [TCode in keyof TChannel["client"][TName]["errors"] & string]: CableError<
          TCode,
          InferSchemaInput<TChannel["client"][TName]["errors"][TCode]>
        >;
      }[keyof TChannel["client"][TName]["errors"] & string],
      TEnvironment
    >;
  };
  readonly onConnect?: (
    context: EffectChannelConnectionContext<TChannel, TIdentity, TTimerPayloads>,
  ) => Effect.Effect<void, unknown, TEnvironment>;
  readonly onDisconnect?: (
    context: Omit<
      ChannelDisconnectContext<TChannel, TIdentity, TTimerPayloads>,
      keyof ChannelContext<TChannel, TTimerPayloads>
    > &
      EffectChannelContext<TChannel, TTimerPayloads>,
  ) => Effect.Effect<void, unknown, TEnvironment>;
  readonly onError?: (context: ChannelErrorContext) => Effect.Effect<void, never, TEnvironment>;
  readonly procedures: {
    readonly [
      TName in keyof TChannel["procedures"] & string
    ]: TChannel["procedures"][TName] extends infer TProcedure extends AnyProcedureContract
      ? (
          context: EffectChannelProcedureContext<TChannel, TIdentity, TTimerPayloads>,
          input: InferSchemaOutput<TProcedure["input"]>,
        ) => Effect.Effect<
          InferSchemaInput<TProcedure["output"]>,
          {
            readonly [TCode in keyof TProcedure["errors"] & string]: CableError<
              TCode,
              InferSchemaInput<TProcedure["errors"][TCode]>
            >;
          }[keyof TProcedure["errors"] & string],
          TEnvironment
        >
      : never;
  };
  readonly timers?: {
    readonly [TKind in keyof TTimerPayloads & string]: (
      context: EffectChannelTimerContext<TChannel, TTimerPayloads>,
      args: TTimerPayloads[TKind],
    ) => Effect.Effect<void, unknown, TEnvironment>;
  };
}

/**
 * Create core Host handlers from Effect channel behavior.
 *
 * Each callback receives a fresh Layer scope. `Host` is supplied for that callback
 * only, and durable state remains in the adapter-owned core Host.
 */
export function createEffectEngine<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads,
  TEnvironment,
  TLayerError,
>(
  channel: TChannel,
  implementation: EffectChannelImplementation<TChannel, TIdentity, TTimerPayloads, TEnvironment>,
  host: CoreHost,
  options: EngineOptions,
  layer: Layer.Layer<TEnvironment, TLayerError>,
): HostHandlers {
  return createEngine(channel, toCoreImplementation(implementation, host, layer), host, options);
}

function toCoreImplementation<
  TChannel extends AnyChannelContract,
  TIdentity,
  TTimerPayloads extends TimerPayloads,
  TEnvironment,
  TLayerError,
>(
  implementation: EffectChannelImplementation<TChannel, TIdentity, TTimerPayloads, TEnvironment>,
  host: CoreHost,
  layer: Layer.Layer<TEnvironment, TLayerError>,
): ChannelImplementation<TChannel, TIdentity, TTimerPayloads> {
  const authorize = implementation.authorize;
  const onConnect = implementation.onConnect;
  const onDisconnect = implementation.onDisconnect;
  const onError = implementation.onError;
  const timers = implementation.timers;
  /* oxlint-disable anti-slop/no-conditional-empty-object-spread -- Exact optional
  properties require omission rather than `undefined`; each branch preserves the
  optional callback's presence exactly. */
  return {
    // SAFETY: `mapHandlers` preserves each contract event key and adapts only the
    // callback boundary from Promise context to Effect context.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- channel implementation maps have the same keys before and after adaptation.
    onClient: mapHandlers(
      implementation.onClient,
      host,
      layer,
      effectfulContext,
    ) as ChannelImplementation<TChannel, TIdentity, TTimerPayloads>["onClient"],
    // SAFETY: `mapHandlers` preserves each contract procedure key and output.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- channel implementation maps have the same keys before and after adaptation.
    procedures: mapHandlers(
      implementation.procedures,
      host,
      layer,
      effectfulContext,
    ) as ChannelImplementation<TChannel, TIdentity, TTimerPayloads>["procedures"],
    ...(authorize === undefined
      ? {}
      : {
          authorize: (context: ChannelAuthorizeContext<TChannel, TIdentity>) =>
            run(authorize(context), host, layer),
        }),
    ...(onConnect === undefined
      ? {}
      : {
          onConnect: (context: ChannelConnectionContext<TChannel, TIdentity, TTimerPayloads>) =>
            run(onConnect(effectfulContext(context)), host, layer),
        }),
    ...(onDisconnect === undefined
      ? {}
      : {
          onDisconnect: (context: ChannelDisconnectContext<TChannel, TIdentity, TTimerPayloads>) =>
            run(onDisconnect(effectfulContext(context)), host, layer),
        }),
    ...(onError === undefined
      ? {}
      : { onError: (context: ChannelErrorContext) => run(onError(context), host, layer) }),
    ...(timers === undefined
      ? {}
      : {
          timers: (() => {
            // SAFETY: timer keys are application-owned and are preserved by `mapHandlers`.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- adaptation only changes callback execution from Effect to Promise.
            return mapHandlers(timers, host, layer, effectfulContext) as NonNullable<
              ChannelImplementation<TChannel, TIdentity, TTimerPayloads>["timers"]
            >;
          })(),
        }),
  };
  /* oxlint-enable anti-slop/no-conditional-empty-object-spread */
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns,
anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening -- These
maps are complete, contract-derived callback maps. The adapter replaces only
their callback execution boundary and never accepts external data. */
function mapHandlers<TEnvironment, TLayerError>(
  handlers: Readonly<Record<string, unknown>>,
  host: CoreHost,
  layer: Layer.Layer<TEnvironment, TLayerError>,
  transformContext: (context: never) => unknown,
): object {
  const result: Record<string, unknown> = {};
  for (const [key, handler] of Object.entries(handlers)) {
    if (isEffectHandler<TEnvironment>(handler)) {
      result[key] = (context: never, input: unknown) =>
        run(handler(transformContext(context), input), host, layer);
    }
  }
  return result;
}
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns,
anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening */

function run<TOutput, TError, TEnvironment, TLayerError>(
  effect: Effect.Effect<TOutput, TError, TEnvironment>,
  host: CoreHost,
  layer: Layer.Layer<TEnvironment, TLayerError>,
): Promise<TOutput> {
  return runEffect(Effect.provideService(effect, Host, host), layer);
}

function effectfulContext<
  TChannel extends AnyChannelContract,
  TTimerPayloads extends TimerPayloads,
  TContext extends ChannelContext<TChannel, TTimerPayloads>,
>(
  context: TContext,
): Omit<TContext, "emit" | "emitTo" | "schedule"> & EffectChannelContext<TChannel, TTimerPayloads> {
  return {
    ...context,
    emit: (event, data) => fromPromise(() => context.emit(event, data)),
    emitTo: (target, event, data, options) =>
      fromPromise(() => context.emitTo(target, event, data, options)),
    schedule: (kind, at, args) => fromPromise(() => context.schedule(kind, at, args)),
  };
}

function fromPromise<TValue>(
  operation: () => Promise<TValue>,
): Effect.Effect<TValue, CableError<"INTERNAL">> {
  return Effect.tryPromise({
    catch: (cause) => new CableError("INTERNAL", { cause, message: "Host operation failed" }),
    try: operation,
  });
}

/* oxlint-disable anti-slop/no-unknown-parameters -- The predicate establishes
the internal callback-map function boundary; application data was parsed by core. */
function isEffectHandler<TEnvironment>(
  value: unknown,
): value is (context: unknown, input: unknown) => Effect.Effect<unknown, unknown, TEnvironment> {
  return typeof value === "function";
}
/* oxlint-enable anti-slop/no-unknown-parameters */

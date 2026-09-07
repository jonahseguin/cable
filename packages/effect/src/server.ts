/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- The complete handler tree is built from a
branded contract and handed to core's existing dispatcher. This module replaces
only known handler leaves at that internal boundary. */
import type {
  AnyChannelContract,
  AnyProcedureContract,
  AnyStandardSchema,
  Contract,
  ContractTree,
  InferSchemaInput,
} from "@cablejs/contract";
import {
  implement,
  type CableError,
  type ImplementedProcedures,
  type ProcedureHandlerOptions,
  type ProcedureImplementations,
} from "@cablejs/core";
import { Cause, Effect, Exit } from "effect";
import type { Layer } from "effect";

/** Failures a procedure may expose from its declared contract error map. */
export type DeclaredEffectError<TProcedure extends AnyProcedureContract> = {
  readonly [TCode in keyof TProcedure["errors"] & string]: CableError<
    TCode,
    TProcedure["errors"][TCode] extends AnyStandardSchema
      ? InferSchemaInput<TProcedure["errors"][TCode]>
      : never
  >;
}[keyof TProcedure["errors"] & string];

/** An Effect-backed implementation for one global procedure. */
export type EffectProcedureHandler<
  TProcedure extends AnyProcedureContract,
  TContext extends object,
  TEnvironment,
> = (
  options: ProcedureHandlerOptions<TProcedure, TContext>,
) => Effect.Effect<
  InferSchemaInput<TProcedure["output"]>,
  DeclaredEffectError<TProcedure>,
  TEnvironment
>;

/** Preserve the output, declared-error, and environment inference of an Effect. */
export function typedEffect<TOutput, TDeclaredErrors, TEnvironment>(
  effect: Effect.Effect<TOutput, TDeclaredErrors, TEnvironment>,
): Effect.Effect<TOutput, TDeclaredErrors, TEnvironment> {
  return effect;
}

/** A contract-shaped tree of Effect procedure handlers. */
export type EffectProcedureImplementations<TTree, TContext extends object, TEnvironment> = {
  readonly [
    TKey in keyof TTree as TTree[TKey] extends AnyChannelContract ? never : TKey
  ]: TTree[TKey] extends AnyProcedureContract
    ? EffectProcedureHandler<TTree[TKey], TContext, TEnvironment>
    : TTree[TKey] extends object
      ? EffectProcedureImplementations<TTree[TKey], TContext, TEnvironment>
      : never;
};

/** An Effect implementation awaiting the adapter request-context type. */
export interface EffectImplementBuilder<TTree> {
  /** Set the context supplied by the adapter for each request. */
  context<TContext extends object>(): EffectProcedureBuilder<TTree, TContext>;
}

/** Build an Effect implementation over cable's existing procedure dispatcher. */
export interface EffectProcedureBuilder<TTree, TContext extends object> {
  /** Supply every global procedure handler. */
  procedures<TEnvironment>(
    handlers: EffectProcedureImplementations<TTree, TContext, TEnvironment>,
  ): EffectImplementedProcedures<TTree, TContext, TEnvironment>;
}

/** An Effect procedure tree that becomes a core runtime once a Layer is supplied. */
export interface EffectImplementedProcedures<TTree, TContext extends object, TEnvironment> {
  /**
   * Build a Promise-based core runtime with a fresh Layer scope for each procedure call.
   *
   * The caller owns the Layer. Its resources release when the invocation ends; cable
   * does not retain an ambient runtime or a fiber after the request finishes.
   */
  toCore<TLayerError>(
    layer: Layer.Layer<TEnvironment, TLayerError>,
  ): ImplementedProcedures<TTree, TContext>;
}

/** Begin implementing global procedures whose handlers return Effect values. */
export function implementEffect<TTree extends ContractTree>(
  contract: Contract<TTree>,
): EffectImplementBuilder<TTree> {
  return {
    context<TContext extends object>(): EffectProcedureBuilder<TTree, TContext> {
      return {
        procedures<TEnvironment>(
          handlers: EffectProcedureImplementations<TTree, TContext, TEnvironment>,
        ): EffectImplementedProcedures<TTree, TContext, TEnvironment> {
          return {
            toCore<TLayerError>(
              layer: Layer.Layer<TEnvironment, TLayerError>,
            ): ImplementedProcedures<TTree, TContext> {
              const coreHandlers = toPromiseHandlers<TTree, TContext, TEnvironment, TLayerError>(
                handlers,
                layer,
              );
              return implement(contract).context<TContext>().procedures(coreHandlers);
            },
          };
        },
      };
    },
  };
}

function toPromiseHandlers<
  TTree extends ContractTree,
  TContext extends object,
  TEnvironment,
  TLayerError,
>(
  handlers: EffectProcedureImplementations<TTree, TContext, TEnvironment>,
  layer: Layer.Layer<TEnvironment, TLayerError>,
): ProcedureImplementations<TTree, TContext, TContext> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(handlers)) {
    if (isEffectHandler<TEnvironment>(value)) {
      result[key] = async (options: unknown) => runEffect(value(options), layer);
      continue;
    }
    if (isRecord(value)) result[key] = toPromiseHandlerRecord(value, layer);
  }
  // SAFETY: the branded contract defines every key in `handlers`; recursion retains
  // object paths and converts only Effect handler leaves into Promise handlers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot express the key-preserving Object.entries traversal.
  return result as ProcedureImplementations<TTree, TContext, TContext>;
}

function toPromiseHandlerRecord<TEnvironment, TLayerError>(
  handlers: Readonly<Record<string, unknown>>,
  layer: Layer.Layer<TEnvironment, TLayerError>,
) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(handlers)) {
    if (isEffectHandler<TEnvironment>(value))
      result[key] = async (options: unknown) => runEffect(value(options), layer);
    else if (isRecord(value)) result[key] = toPromiseHandlerRecord(value, layer);
  }
  return result;
}

export async function runEffect<TOutput, TError, TEnvironment, TLayerError>(
  effect: Effect.Effect<TOutput, TError, TEnvironment>,
  layer: Layer.Layer<TEnvironment, TLayerError>,
): Promise<TOutput> {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer, { local: true }));
  if (Exit.isSuccess(exit)) return exit.value;

  const failure = exit.cause.reasons.find(Cause.isFailReason);
  if (failure?.error instanceof Error) throw failure.error;
  const cause = Cause.squash(exit.cause);
  throw cause instanceof Error
    ? cause
    : new Error("Effect failed without an Error cause", { cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEffectHandler<TEnvironment>(
  value: unknown,
): value is (options: unknown) => Effect.Effect<unknown, unknown, TEnvironment> {
  return typeof value === "function";
}

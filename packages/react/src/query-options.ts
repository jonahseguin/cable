import type {
  AnyChannelContract,
  AnyContract,
  AnyProcedureContract,
  ChannelFactory,
  Client,
  InferInput,
  InferOutput,
  ProcedureArguments,
  ProcedureError,
} from "@cable/client";
import { queryOptions } from "@tanstack/react-query";
import type {
  MutationOptions,
  QueryKeyWithDataTag,
  UndefinedInitialDataOptions,
} from "@tanstack/react-query";

/** A stable TanStack Query key for one Cable query and its input. */
export type CableQueryKey<TProcedure extends AnyProcedureContract> = readonly [
  "cable",
  string,
  InferInput<TProcedure>,
];

/** Native options for fetching one Cable query through TanStack Query. */
export type CableQueryOptions<TProcedure extends AnyProcedureContract> =
  UndefinedInitialDataOptions<
    InferOutput<TProcedure>,
    ProcedureError<TProcedure>,
    InferOutput<TProcedure>,
    CableQueryKey<TProcedure>
  > &
    QueryKeyWithDataTag<
      CableQueryKey<TProcedure>,
      InferOutput<TProcedure>,
      ProcedureError<TProcedure>
    >;

/** Native options for executing one Cable mutation through TanStack Query. */
export type CableMutationOptions<TProcedure extends AnyProcedureContract> = MutationOptions<
  InferOutput<TProcedure>,
  ProcedureError<TProcedure>,
  InferInput<TProcedure>
>;

/** TanStack Query helpers available at one query procedure leaf. */
export interface QueryOptionsLeaf<TProcedure extends AnyProcedureContract> {
  /** Return the stable key used for this query input. */
  readonly queryKey: (...args: ProcedureArguments<TProcedure>) => CableQueryKey<TProcedure>;
  /** Return native TanStack Query options that execute this procedure. */
  readonly queryOptions: (...args: ProcedureArguments<TProcedure>) => CableQueryOptions<TProcedure>;
}

/** TanStack Query helpers available at one mutation procedure leaf. */
export interface MutationOptionsLeaf<TProcedure extends AnyProcedureContract> {
  /** Return native TanStack mutation options that execute this procedure. */
  readonly mutationOptions: () => CableMutationOptions<TProcedure>;
}

/** A contract-shaped facade combining channel factories with procedure query options. */
export type CableQuery<TTree> = {
  readonly [TKey in keyof TTree & string]: CableQueryNode<TTree[TKey]>;
};

/** Map one contract node to its Cable query facade member. */
export type CableQueryNode<TNode> = TNode extends AnyChannelContract
  ? ChannelFactory<TNode>
  : TNode extends AnyProcedureContract
    ? TNode["kind"] extends "query"
      ? QueryOptionsLeaf<TNode>
      : MutationOptionsLeaf<TNode>
    : TNode extends object
      ? CableQuery<TNode>
      : never;

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get, anti-slop/no-reflect-apply, anti-slop/no-runtime-typeof, anti-slop/no-known-value-widening, typescript/no-unsafe-type-assertion -- SAFETY: c.contract validates router keys, and the Cable client exposes a lazy Proxy whose apply trap accepts only query or mutate. This checked traversal follows only contract-typed paths, verifies every receiver and operation before invocation, and keeps the dynamic boundary in one implementation. */
type UnknownCallable = (...args: readonly unknown[]) => unknown;

function isReference(value: unknown): value is object | UnknownCallable {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function resolve(client: unknown, path: readonly string[], member?: string): unknown {
  let value = client;
  for (const key of path) {
    if (!isReference(value)) {
      throw new TypeError(`Cable client path ${path.join(".")} is not callable.`);
    }
    value = Reflect.get(value, key);
  }
  if (member === undefined) return value;
  if (!isReference(value)) {
    throw new TypeError(`Cable client path ${path.join(".")} is not callable.`);
  }
  return Reflect.get(value, member);
}

async function invoke(
  client: unknown,
  path: readonly string[],
  member: string,
  input: unknown,
): Promise<unknown> {
  const owner = resolve(client, path);
  const candidate = resolve(client, path, member);
  if (typeof candidate !== "function") {
    throw new TypeError(`Cable client path ${path.join(".")} does not expose ${member}.`);
  }
  // SAFETY: `candidate` is checked callable and `owner` is the procedure proxy that owns it.
  return await Reflect.apply(candidate as UnknownCallable, owner, [input]);
}

function invokeChannel(
  client: unknown,
  path: readonly string[],
  args: readonly unknown[],
): unknown {
  const candidate = resolve(client, path);
  if (typeof candidate !== "function") {
    throw new TypeError(`Cable client path ${path.join(".")} is not callable.`);
  }
  // SAFETY: `candidate` is checked callable and is invoked with its original Cable client proxy receiver.
  return Reflect.apply(candidate as UnknownCallable, client, Array.from(args));
}

/**
 * Create a cached contract-shaped facade for native TanStack Query options.
 *
 * Queries use the stable `['cable', path, input]` key. The facade delegates
 * procedure execution to the supplied client and passes channel factories through.
 */
export function createCableQuery<TTree extends AnyContract>(
  client: Client<TTree>,
): CableQuery<TTree> {
  const cache = new Map<string, object>();

  function proxy(path: readonly string[]): object {
    const cached = cache.get(path.join("."));
    if (cached !== undefined) return cached;
    const value = new Proxy(() => undefined, {
      apply(_target, _receiver, args: readonly unknown[]) {
        return invokeChannel(client, path, args);
      },
      get(_target, property) {
        if (typeof property !== "string" || property === "then") return undefined;
        if (property === "queryKey") {
          return (input: unknown) => ["cable", path.join("."), input] as const;
        }
        if (property === "queryOptions") {
          return (input: unknown) =>
            queryOptions({
              queryKey: ["cable", path.join("."), input] as const,
              queryFn: () => invoke(client, path, "query", input),
            });
        }
        if (property === "mutationOptions") {
          return () => ({
            mutationFn: (input: unknown) => invoke(client, path, "mutate", input),
          });
        }
        return proxy([...path, property]);
      },
    });
    cache.set(path.join("."), value);
    return value;
  }

  // SAFETY: every property access returns the cached facade described by `CableQuery`; procedure methods validate their runtime client operation before invocation.
  return proxy([]) as CableQuery<TTree>;
}
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-reflect-get, anti-slop/no-reflect-apply, anti-slop/no-runtime-typeof, anti-slop/no-known-value-widening, typescript/no-unsafe-type-assertion */

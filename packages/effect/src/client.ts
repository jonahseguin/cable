import type { ChannelHandle, Client, ProcedureArguments } from "@cable/client";
import type {
  AnyChannelContract,
  AnyContract,
  AnyProcedureContract,
  ContractNode,
  ContractTree,
  InferClientEventErrors,
  InferClientEventInput,
  InferErrors,
  InferInput,
  InferOutput,
  InferSchemaInput,
  InferServerEvent,
} from "@cable/contract";
import { isChannelContract, isProcedureContract } from "@cable/contract";
import {
  CableError,
  isCableError,
  type BuiltinProcedureError,
  type CableErrorForDeclaration,
  type RpcCall,
  type RpcSuccess,
} from "@cable/core";
import { Cause, Effect, Queue, Stream } from "effect";

/** Every transport and declared failure returned by an Effect client operation. */
export type EffectProcedureError<TProcedure extends AnyProcedureContract> =
  | BuiltinProcedureError
  | CableErrorForDeclaration<InferErrors<TProcedure>>;

/** An Effect-wrapped query or mutation operation. */
export type EffectProcedureClient<TProcedure extends AnyProcedureContract> =
  TProcedure["kind"] extends "query"
    ? {
        readonly query: (
          ...args: ProcedureArguments<TProcedure>
        ) => Effect.Effect<InferOutput<TProcedure>, EffectProcedureError<TProcedure>>;
      }
    : {
        readonly mutate: (
          ...args: ProcedureArguments<TProcedure>
        ) => Effect.Effect<InferOutput<TProcedure>, EffectProcedureError<TProcedure>>;
      };

/** An Effect-wrapped client event acknowledgement. */
export type EffectChannelSender<
  TChannel extends AnyChannelContract,
  TEvent extends keyof TChannel["client"] & string,
> = (
  input: InferClientEventInput<TChannel, TEvent>,
) => Effect.Effect<
  void,
  BuiltinProcedureError | CableErrorForDeclaration<InferClientEventErrors<TChannel, TEvent>>
>;

/** Effect-wrapped client events keyed by their declared names. */
export type EffectChannelSenders<TChannel extends AnyChannelContract> = {
  readonly [TEvent in keyof TChannel["client"] & string]: EffectChannelSender<TChannel, TEvent>;
};

/** Effect-wrapped host procedures keyed by their declared names. */
export type EffectChannelProcedures<TChannel extends AnyChannelContract> = {
  readonly [TName in keyof TChannel["procedures"] & string]: (
    ...args: ProcedureArguments<TChannel["procedures"][TName]>
  ) => Effect.Effect<
    InferOutput<TChannel["procedures"][TName]>,
    EffectProcedureError<TChannel["procedures"][TName]>
  >;
};

/** A channel whose event subscriptions belong to the consuming Stream scope. */
export type EffectChannel<TChannel extends AnyChannelContract> = EffectChannelSenders<TChannel> &
  EffectChannelProcedures<TChannel> & {
    stream<TEvent extends keyof TChannel["server"] & string>(
      event: TEvent,
    ): Stream.Stream<InferServerEvent<TChannel, TEvent>, CableError<string>>;
  };

/** A contract-shaped client whose operations return Effects and channels expose Streams. */
export type EffectClient<TTree> = {
  readonly [TKey in keyof TTree & string]: TTree[TKey] extends AnyChannelContract
    ? (params: InferSchemaInput<TTree[TKey]["params"]>) => EffectChannel<TTree[TKey]>
    : TTree[TKey] extends AnyProcedureContract
      ? EffectProcedureClient<TTree[TKey]>
      : EffectClient<TTree[TKey]>;
};

type ClientCursorValue = {
  readonly [key: string]: ClientCursorValue | undefined;
  (input?: RpcCall["input"]): Promise<RpcSuccess["data"]> | ChannelHandle<AnyChannelContract>;
};

class ClientCursor {
  private readonly value: ClientCursorValue;

  constructor(value: ClientCursorValue) {
    this.value = value;
  }

  child(key: string): ClientCursor {
    const child = this.value[key];
    if (child === undefined) throw new TypeError(`Client does not expose contract member ${key}.`);
    return new ClientCursor(child);
  }

  channel<TChannel extends AnyChannelContract>(
    input: InferSchemaInput<TChannel["params"]>,
  ): ChannelHandle<TChannel> {
    const result = this.value(input);
    // SAFETY: effectTree invokes this only after the matching branded contract node is classified as a channel.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- The matching Client<TTree> factory returns ChannelHandle<TChannel>.
    return result as unknown as ChannelHandle<TChannel>;
  }

  procedure<TProcedure extends AnyProcedureContract>(
    operation: "query" | "mutate",
    input: InferInput<TProcedure>,
  ): Promise<InferOutput<TProcedure>> {
    const method = this.child(operation).value;
    const result = method(input);
    // SAFETY: effectTree selects query or mutate from the matching branded procedure node; Client<TTree> validates its output at the transport boundary.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The selected Client<TTree> procedure resolves InferOutput<TProcedure>.
    return result as Promise<InferOutput<TProcedure>>;
  }
}

class ChannelCursor<TChannel extends AnyChannelContract> {
  private readonly channel: ChannelHandle<TChannel>;

  constructor(channel: ChannelHandle<TChannel>) {
    this.channel = channel;
  }

  sender<TEvent extends keyof TChannel["client"] & string>(
    event: TEvent,
    input: InferClientEventInput<TChannel, TEvent>,
  ): Promise<void> {
    return this.channel[event](input, { ack: true });
  }

  procedure<TName extends keyof TChannel["procedures"] & string>(
    name: TName,
    args: ProcedureArguments<TChannel["procedures"][TName]>,
  ): Promise<InferOutput<TChannel["procedures"][TName]>> {
    const procedure = this.channel[name];
    // SAFETY: name and args originate from the same branded channel procedure entry.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Indexed mapped types lose this key relationship.
    const invoke = procedure as (
      ...values: ProcedureArguments<TChannel["procedures"][TName]>
    ) => Promise<InferOutput<TChannel["procedures"][TName]>>;
    return invoke(...args);
  }

  stream<TEvent extends keyof TChannel["server"] & string>(
    event: TEvent,
  ): Stream.Stream<InferServerEvent<TChannel, TEvent>, CableError<string>> {
    return Stream.callback((queue) =>
      Effect.sync(() => {
        const unsubscribe = this.channel.on(event, (value) => {
          Queue.offerUnsafe(queue, value);
        });
        const unsubscribeError = this.channel.onError((error) => {
          Queue.failCauseUnsafe(queue, Cause.fail(cableFailure(error)));
        });
        return { unsubscribe, unsubscribeError };
      }).pipe(
        Effect.tap(({ unsubscribe, unsubscribeError }) =>
          Effect.addFinalizer(() =>
            Effect.sync(() => {
              unsubscribe();
              unsubscribeError();
            }),
          ),
        ),
      ),
    );
  }
}

function cableFailure(cause: unknown): CableError<string> {
  return isCableError(cause) ? cause : new CableError("UNAVAILABLE", { cause });
}

function effectFrom<Result>(
  operation: () => Result | PromiseLike<Result>,
): Effect.Effect<Result, CableError<string>> {
  return Effect.tryPromise({
    try: () => Promise.resolve().then(operation),
    catch: cableFailure,
  });
}

function isContractBranch(node: ContractNode | ContractTree): node is ContractTree {
  return !isProcedureContract(node) && !isChannelContract(node);
}

interface EffectOwner {
  readonly effectOwner?: never;
}

function defineEffectMember(
  target: EffectOwner,
  name: string,
  value: EffectOwner | CallableFunction,
): void {
  Object.defineProperty(target, name, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  });
}

function effectChannel<TChannel extends AnyChannelContract>(
  contract: TChannel,
  channel: ChannelHandle<TChannel>,
): EffectChannel<TChannel> {
  const result: EffectOwner = {};
  const cursor = new ChannelCursor(channel);
  defineEffectMember(result, "stream", cursor.stream.bind(cursor));
  for (const name of Object.keys(contract.client)) {
    // SAFETY: Object.keys returns only own client event names from this branded channel contract.
    const event = name as keyof TChannel["client"] & string;
    defineEffectMember(result, name, (input: InferClientEventInput<TChannel, typeof event>) =>
      effectFrom(() => cursor.sender(event, input)),
    );
  }
  for (const name of Object.keys(contract.procedures)) {
    // SAFETY: Object.keys returns only own host procedure names from this branded channel contract.
    const procedure = name as keyof TChannel["procedures"] & string;
    defineEffectMember(
      result,
      name,
      (...args: ProcedureArguments<TChannel["procedures"][typeof procedure]>) =>
        effectFrom(() => cursor.procedure(procedure, args)),
    );
  }
  // SAFETY: this construction uses only event and procedure names from the branded channel contract, plus its scoped stream method.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Every generated member has the matching EffectChannel<TChannel> signature.
  return result as EffectChannel<TChannel>;
}

function effectTree(contract: ContractTree, client: ClientCursor): EffectOwner {
  const result: EffectOwner = {};
  for (const [name, node] of Object.entries(contract)) {
    const member = client.child(name);
    if (isChannelContract(node)) {
      defineEffectMember(result, name, (params: InferSchemaInput<(typeof node)["params"]>) =>
        effectChannel(node, member.channel<typeof node>(params)),
      );
      continue;
    }
    if (isProcedureContract(node)) {
      const operation = node.kind === "query" ? "query" : "mutate";
      defineEffectMember(result, name, {
        [operation]: (...args: ProcedureArguments<typeof node>) =>
          effectFrom(() => member.procedure<typeof node>(operation, args[0])),
      });
      continue;
    }
    if (isContractBranch(node)) defineEffectMember(result, name, effectTree(node, member));
  }
  return result;
}

/** Wrap a Promise-based cable client with its branded contract as the runtime map. */
export function effectClient<TTree extends AnyContract>(
  contract: TTree,
  client: Client<TTree>,
): EffectClient<TTree> {
  // SAFETY: Client<TTree> is the contract-shaped proxy for this exact branded TTree, and effectTree only traverses keys from TTree.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- Client's dynamic proxy is callable at each contract path.
  const cursor = new ClientCursor(client as unknown as ClientCursorValue);
  // SAFETY: c.contract validates the full recursive tree before installing the contract brand carried by AnyContract.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- ContractTree is the runtime form guaranteed by the contract brand.
  const result = effectTree(contract as unknown as ContractTree, cursor);
  // SAFETY: effectTree classifies every branded node and creates its matching procedure, channel, or nested-client member.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The runtime tree has the contract-guided EffectClient<TTree> shape.
  return result as EffectClient<TTree>;
}

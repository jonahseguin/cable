import type {
  AnyChannelContract,
  AnyProcedureContract,
  Contract,
  ContractTree,
  InferInput,
  InferOutput,
  InferSchemaInput,
} from "@cable/contract";

import type { GrantSecret } from "../grant.js";
import type { HostKey, PeerMessage, SignedGrant } from "../host.js";
import type { ImplementedProcedures, MaybePromise } from "../implementation.js";

/** Runtime bounds imposed by one adapter's host-routing mechanism. */
export interface EdgeHostTransportLimits {
  /** Maximum UTF-8 bytes in the canonical host key. */
  readonly maxHostKeyBytes: number;
  /** Maximum characters in the user id, excluding an adapter-owned tag prefix. */
  readonly maxUidCharacters: number;
}

/** Adapter operations needed by the portable edge router. */
export interface EdgeHostTransport {
  readonly limits: EdgeHostTransportLimits;
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Adapter peer RPC is parsed by the operation-specific core caller.
  peer(key: HostKey, message: PeerMessage): Promise<unknown>;
  upgrade(key: HostKey, request: Request, grant: SignedGrant): Promise<Response>;
}

/** One channel family paired with its runtime-specific host transport. */
export interface EdgeHostRegistration<TChannel extends AnyChannelContract = AnyChannelContract> {
  readonly channel: TChannel;
  readonly transport: EdgeHostTransport;
}

/** Call arguments for one host procedure. */
export type EdgeHostCallArguments<TProcedure extends AnyProcedureContract> =
  undefined extends InferInput<TProcedure>
    ? [input?: InferInput<TProcedure>]
    : [input: InferInput<TProcedure>];

/** Typed peer operations for one resolved channel host. */
export interface EdgeChannelHost<TChannel extends AnyChannelContract> {
  call<TName extends keyof TChannel["procedures"] & string>(
    name: TName,
    ...args: EdgeHostCallArguments<TChannel["procedures"][TName]>
  ): Promise<InferOutput<TChannel["procedures"][TName]>>;
  emit<TName extends keyof TChannel["server"] & string>(
    name: TName,
    data: InferSchemaInput<TChannel["server"][TName]>,
  ): Promise<number>;
}

/** A channel family resolved from its raw Standard Schema parameter input. */
export type EdgeChannelFactory<TChannel extends AnyChannelContract> = (
  params: InferSchemaInput<TChannel["params"]>,
) => EdgeChannelHost<TChannel>;

/** Contract-shaped access to edge-to-host event and procedure delivery. */
export type EdgeHosts<TTree> = {
  readonly [
    TKey in keyof TTree & string as TTree[TKey] extends AnyProcedureContract ? never : TKey
  ]: TTree[TKey] extends AnyChannelContract
    ? EdgeChannelFactory<TTree[TKey]>
    : TTree[TKey] extends object
      ? EdgeHosts<TTree[TKey]>
      : never;
};

/** Principal attached to edge-to-host calls after request authentication. */
export interface EdgePrincipal<TIdentity> {
  readonly identity: TIdentity | null;
  readonly uid?: string;
}

/** Resolve grants for one authenticated principal and parsed channel target. */
export type EdgeGrants<TIdentity> = (
  identity: TIdentity,
  key: HostKey,
  params: Readonly<Record<string, string>>,
) => MaybePromise<readonly string[]>;

/** Inputs used to create a lazy typed host facade. */
export interface CreateEdgeHostsOptions<TIdentity> {
  readonly grants?: EdgeGrants<TIdentity>;
  readonly principal: EdgePrincipal<TIdentity>;
  readonly registrations: readonly EdgeHostRegistration[];
}

/** Credential rules enforced before authentication or host routing. */
export type EdgeCredentials =
  | { readonly mode: "bearer" }
  | { readonly mode: "cookie"; readonly origins: readonly string[] };

/** Values available while an adapter builds a global procedure context. */
export interface EdgeContextInput<TTree, TEnv, TExecution, TIdentity> {
  readonly env: TEnv;
  readonly execution: TExecution;
  readonly hosts: EdgeHosts<TTree>;
  readonly identity: TIdentity | null;
  readonly request: Request;
}

/** A portable handler method with adapter-owned environment and execution values. */
export interface EdgeHandler<TEnv, TExecution> {
  fetch(request: Request, env: TEnv, execution: TExecution): Promise<Response>;
}

/** Details supplied to the best-effort edge error observer. */
export interface EdgeErrorContext {
  readonly operation: string;
  readonly request: Request;
}

/** Authentication, routing, and resource policy for the portable edge handler. */
export interface EdgeHandlerOptions<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
> {
  readonly authenticate: (request: Request, env: TEnv) => MaybePromise<TIdentity | null>;
  readonly basePath?: string;
  readonly context: (
    input: EdgeContextInput<TTree, TEnv, TExecution, TIdentity>,
  ) => MaybePromise<TContext>;
  readonly credentials: EdgeCredentials;
  readonly grantSecret: (env: TEnv) => MaybePromise<GrantSecret>;
  readonly grantTtlMs?: number;
  readonly grants?: EdgeGrants<TIdentity>;
  readonly hosts: (env: TEnv) => readonly EdgeHostRegistration[];
  readonly maxBatchSize?: number;
  readonly maxBodyBytes?: number;
  readonly now?: () => number;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Edge handlers report arbitrary thrown values without changing the response path.
  readonly onError?: (error: unknown, context: EdgeErrorContext) => MaybePromise<void>;
  readonly uid?: (identity: TIdentity) => MaybePromise<string>;
}

/** Runtime accepted by `createEdgeHandler`; exported for adapter factories. */
export type EdgeProcedures<
  TTree extends ContractTree,
  TContext extends object,
> = ImplementedProcedures<TTree, TContext>;

/** Contract accepted by `createEdgeHandler`; exported for adapter factories. */
export type EdgeContract<TTree extends ContractTree> = Contract<TTree>;

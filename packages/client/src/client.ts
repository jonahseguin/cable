import { isChannelContract, isProcedureContract, isContract } from "@cable/contract";
import type {
  InferInput,
  InferOutput,
  AnyProcedureContract,
  AnyContract,
  ContractNode,
  ContractTree,
  QueryTransport,
} from "@cable/contract";
import { CableError } from "@cable/core";
import type { RpcCall, RpcSuccess } from "@cable/core";

import { batchLink } from "./batch-link.js";
import type { Link, NextLink } from "./link.js";

/** Raw schema inputs accepted by a client operation; void inputs may be omitted. */
export type ProcedureArguments<Node extends AnyProcedureContract> =
  undefined extends InferInput<Node> ? [input?: InferInput<Node>] : [input: InferInput<Node>];

/** The callable operation exposed by one contract procedure. */
export type ProcedureClient<Node extends AnyProcedureContract> = Node["kind"] extends "query"
  ? { readonly query: (...args: ProcedureArguments<Node>) => Promise<InferOutput<Node>> }
  : { readonly mutate: (...args: ProcedureArguments<Node>) => Promise<InferOutput<Node>> };

/** A client proxy only contains procedures, never server implementations or contexts. */
export type Client<Tree> = {
  readonly [
    Key in keyof Tree & string as Tree[Key] extends { readonly kind: "channel" } ? never : Key
  ]: Tree[Key] extends AnyProcedureContract ? ProcedureClient<Tree[Key]> : Client<Tree[Key]>;
};

/** Authentication is evaluated for each HTTP batch so refreshed credentials take effect. */
export interface ClientAuth {
  readonly token: () => string | undefined | Promise<string | undefined>;
}

/** Configure the base endpoint and optional middleware or in-process transport links. */
export interface ClientOptions<Tree extends AnyContract = AnyContract> {
  /** Supply the shared contract to honor runtime transport metadata such as GET. */
  readonly contract?: Tree;
  readonly url?: string;
  readonly links?: readonly Link[];
  readonly fetch?: typeof globalThis.fetch;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly auth?: ClientAuth;
  readonly onError?: (error: Error, call: RpcCall) => void;
}

function isStringKey(key: string | symbol): key is string {
  return typeof key === "string";
}

function isHeadersFactory(
  headers: ClientOptions["headers"],
): headers is () => HeadersInit | Promise<HeadersInit> {
  return typeof headers === "function";
}

function isBranch(node: ContractTree | ContractNode): node is ContractTree {
  // Contract construction validates every leaf; the remaining nodes are router branches.
  return !isProcedureContract(node) && !isChannelContract(node);
}

function findTransport(contract: ContractTree, path: string): QueryTransport | undefined {
  let node: ContractTree | ContractNode = contract;
  for (const segment of path.split(".")) {
    if (!isBranch(node)) return undefined;
    const child: ContractNode | ContractTree | undefined = node[segment];
    if (child === undefined) return undefined;
    node = child;
  }
  return isProcedureContract(node) && node.kind === "query" ? node.transport : undefined;
}

function reportError(options: ClientOptions, error: Error, call: RpcCall): void {
  try {
    options.onError?.(error, call);
  } catch {
    // An observer cannot replace the original request failure.
  }
}

const unavailable: NextLink = () =>
  Promise.reject(
    new CableError("UNAVAILABLE", { message: "No transport link handled the request." }),
  );

type ProxyCall = (input?: RpcCall["input"]) => Promise<RpcSuccess["data"]>;

/** Create a lazy, contract-shaped client. No request is made until an operation is called. */
export function createClient<Tree extends AnyContract>(options: ClientOptions<Tree>): Client<Tree> {
  const contract = options.contract;
  if (contract !== undefined && !isContract(contract)) {
    throw new TypeError("Client metadata must come from c.contract().");
  }
  let nextId = 0;
  const context = {
    url: options.url ?? "/_cable",
    transport(path: string): QueryTransport | undefined {
      return contract === undefined ? undefined : findTransport(contract, path);
    },
    fetch: options.fetch ?? globalThis.fetch,
    async headers(): Promise<Headers> {
      const headers = new Headers(
        isHeadersFactory(options.headers) ? await options.headers() : options.headers,
      );
      const token = await options.auth?.token();
      if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
      return headers;
    },
  };
  const links = (options.links ?? [batchLink()]).map((link) => link(context));
  const execute = links.reduceRight<NextLink>(
    (next, link) => (call) => link(call, next),
    unavailable,
  );

  function proxy(path: readonly string[]): ProxyCall {
    return new Proxy(async () => undefined, {
      get(_target, key) {
        if (!isStringKey(key) || key === "then") return undefined;
        return proxy([...path, key]);
      },
      async apply(_target, _receiver, args: RpcCall["input"][]) {
        const operation = path.at(-1);
        if (operation !== "query" && operation !== "mutate") {
          throw new TypeError("Call a procedure's query or mutate operation.");
        }
        const call: RpcCall = {
          id: String(++nextId),
          path: path.slice(0, -1).join("."),
          input: args[0],
        };
        try {
          const result = await execute(call);
          if (result.id !== call.id)
            throw new CableError("PARSE_ERROR", {
              message: "RPC response ID does not match its request.",
            });
          if (!result.ok) throw new CableError(result.error.code, result.error);
          return result.data;
        } catch (cause) {
          const error =
            cause instanceof CableError ? cause : new CableError("UNAVAILABLE", { cause });
          reportError(options, error, call);
          throw error;
        }
      },
    });
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: the proxy checks operation names and maps contract-typed calls to the schema-validated server boundary.
  return proxy([]) as ProxyCall & Client<Tree>;
}

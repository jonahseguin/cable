import type { AnyChannelContract, ContractTree } from "@cable/contract";
import {
  createEdgeHandler,
  type EdgeHandler,
  type EdgeHandlerOptions,
  type EdgeContract,
  type EdgeHostRegistration,
  type EdgeHostTransport,
  type ImplementedProcedures,
} from "@cable/core";

import { encodeGrantHeader } from "./grant-header.js";
import type { CableDurableObjectNamespace } from "./runtime.js";

const GRANT_HEADER = "x-cable-grant";
const CLOUDFLARE_EDGE_LIMITS = Object.freeze({
  maxHostKeyBytes: 1_024,
  maxUidCharacters: 252,
});

/** A Durable Object namespace registered for one contract channel. */
export interface CloudflareHandlerHost<TChannel extends AnyChannelContract = AnyChannelContract> {
  readonly channel: TChannel;
  readonly namespace: CableDurableObjectNamespace;
}

/** Cloudflare-specific routing options layered over the portable edge policy. */
export type CloudflareHandlerOptions<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
> = Omit<EdgeHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity>, "hosts"> & {
  readonly hosts: (env: TEnv) => readonly CloudflareHandlerHost[];
};

/**
 * Create a Worker handler for Cable RPC, host calls, and authenticated upgrades.
 *
 * The Worker authenticates before it obtains a Durable Object stub. It then
 * removes caller credentials and forwards a signed, private grant to the host.
 */
export function createHandler<
  TTree extends ContractTree,
  TContext extends object,
  TEnv,
  TExecution,
  TIdentity,
>(
  contract: EdgeContract<TTree>,
  procedures: ImplementedProcedures<TTree, TContext>,
  options: CloudflareHandlerOptions<TTree, TContext, TEnv, TExecution, TIdentity>,
): EdgeHandler<TEnv, TExecution> {
  return createEdgeHandler(contract, procedures, {
    ...options,
    hosts: (env): readonly EdgeHostRegistration<TExecution>[] =>
      options.hosts(env).map((host) => ({
        channel: host.channel,
        transport: cloudflareTransport<TExecution>(host.namespace),
      })),
  });
}

function cloudflareTransport<TExecution>(
  namespace: CableDurableObjectNamespace,
): EdgeHostTransport<TExecution> {
  return {
    limits: CLOUDFLARE_EDGE_LIMITS,
    async peer(key, message) {
      // oxlint-disable-next-line eslint/no-underscore-dangle -- The Durable Object RPC name is a reserved Cable wire boundary.
      return namespace.getByName(key).__cable_peer(message);
    },
    async upgrade(key, request, grant) {
      const headers = new Headers(request.headers);
      headers.set(GRANT_HEADER, encodeGrantHeader(grant));
      return namespace.getByName(key).fetch(new Request(request, { headers }));
    },
  };
}

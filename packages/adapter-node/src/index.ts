import type { ContractTree } from "@cablejs/contract";
import type { EdgeContract, ImplementedProcedures } from "@cablejs/core";

import {
  createNodeHandlerWithRuntime,
  type NodeHandler,
  type NodeHandlerOptions,
} from "./handler.internal.js";
import { NodeRuntime, nodeHost, type NodeHandlerHost } from "./runtime.js";

export { nodeHost, type NodeHandlerHost };
export type { NodeHandler, NodeHandlerOptions };

/** Create one isolated Node HTTP and WebSocket Cable handler. */
export function createHandler<TTree extends ContractTree, TContext extends object, TIdentity>(
  contract: EdgeContract<TTree>,
  procedures: ImplementedProcedures<TTree, TContext>,
  options: NodeHandlerOptions<TTree, TContext, TIdentity>,
): NodeHandler {
  const configuredSecret = options.grantSecret;
  // SAFETY: `grantSecret` is the documented direct-value or zero-argument factory union.
  const grantSecret =
    typeof configuredSecret === "function" ? configuredSecret() : configuredSecret; // oxlint-disable-line anti-slop/no-runtime-typeof -- This discriminates the public secret factory contract once per handler.
  const runtime = new NodeRuntime(options.hosts, { grantSecret });
  return createNodeHandlerWithRuntime(contract, procedures, options, runtime, grantSecret);
}

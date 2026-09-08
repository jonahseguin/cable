import { isChannelContract, type AnyChannelContract, type ContractTree } from "@cablejs/contract";

import { resolveChannel, type ResolvedChannel } from "../channel-key.js";
import { CableError, isCableError } from "../errors.js";
import type { HostKey, PeerMessage } from "../host.js";
import { assertJsonData, type RpcCall } from "../rpc.js";
import { assertRecordKeys, requireRecord } from "./records.js";
import { EdgeRegistry, edgeContractTree, type RegisteredChannel } from "./registry.js";
import type {
  CreateEdgeHostsOptions,
  EdgeChannelHost,
  EdgeContract,
  EdgeGrants,
  EdgeHosts,
  EdgePrincipal,
  EdgeUpgrade,
} from "./types.js";

/** @internal Authenticated identity retained while preparing a host operation. */
export interface AuthenticatedEdgePrincipal<TIdentity> {
  readonly identity: TIdentity;
  readonly uid?: string;
}

/** An unparsed response returned by one adapter peer-RPC invocation. */
interface PeerResponse {
  readonly value: unknown;
}

export interface HostOperationContext<
  TIdentity,
  TExecution = undefined,
  TUpgrade extends EdgeUpgrade = Response,
> {
  readonly principal: AuthenticatedEdgePrincipal<TIdentity>;
  readonly grants?: EdgeGrants<TIdentity>;
  readonly registered: RegisteredChannel<TExecution, TUpgrade>;
  readonly resolved: ResolvedChannel;
}

type HostFactory = (params?: RpcCall["input"]) => EdgeChannelHost<AnyChannelContract>;

const proxyTarget: HostFactory = () => {
  throw new TypeError("Channel host factories must be called through their edge proxy");
};

/** Create a lazy, contract-shaped facade for edge-to-host operations. */
export function createEdgeHosts<
  TTree extends ContractTree,
  TIdentity,
  TExecution,
  TUpgrade extends EdgeUpgrade,
>(
  contract: EdgeContract<TTree>,
  options: CreateEdgeHostsOptions<TIdentity, TExecution, TUpgrade>,
): EdgeHosts<TTree> {
  const tree = edgeContractTree(contract);
  const registry = new EdgeRegistry<TExecution, TUpgrade>(tree, options.registrations);

  function proxy(path: readonly string[]): HostFactory {
    return new Proxy(proxyTarget, {
      apply(_target, _receiver, args: RpcCall["input"][]) {
        const registered = registry.channel(path);
        if (registered === undefined || !isChannelContract(registered.registration.channel)) {
          throw new TypeError(`'${path.join(".")}' is not a registered channel`);
        }
        return channelHost(registered, args[0], options.principal, options.grants);
      },
      get(_target, key) {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Proxy property keys are runtime values, narrowed before path traversal.
        if (typeof key !== "string" || key === "then") return undefined;
        return proxy([...path, key]);
      },
    });
  }

  // SAFETY: EdgeRegistry proves that each runtime channel leaf belongs to this
  // contract. The proxy resolves only the accessed leaf before creating a host.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Proxy traversal implements the mapped EdgeHosts type.
  return proxy([]) as HostFactory & EdgeHosts<TTree>;
}

function channelHost<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  registered: RegisteredChannel<TExecution, TUpgrade>,
  rawParams: RpcCall["input"],
  principal: EdgePrincipal<TIdentity>,
  grants?: EdgeGrants<TIdentity>,
): EdgeChannelHost<AnyChannelContract> {
  return {
    async call(name, input) {
      const context = await operationContext(registered, rawParams, principal, grants);
      return callEdgeHost(context, name, input);
    },
    async emit(name, data) {
      const context = await operationContext(registered, rawParams, principal, grants);
      if (context.registered.registration.channel.server[name] === undefined) {
        throw new CableError("NOT_FOUND", { message: `Server event '${name}' is not declared` });
      }
      const resolvedGrants = context.grants?.(
        context.principal.identity,
        context.resolved.key,
        context.resolved.params,
      );
      const message = buildPeerEmitMessage(
        context,
        name,
        data,
        resolvedGrants === undefined ? [] : await resolvedGrants,
      );
      assertJsonData(message, "BAD_REQUEST");
      return parsePeerEmit((await invokePeer(context, message)).value);
    },
  };
}

function buildPeerEmitMessage<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  context: HostOperationContext<TIdentity, TExecution, TUpgrade>,
  event: string,
  data: RpcCall["input"],
  grants: readonly string[],
): PeerMessage {
  const base = {
    ev: event,
    grants: normalizeGrants(grants),
    identity: context.principal.identity,
    t: "emit",
  };
  const withData = data === undefined ? base : { ...base, d: data };
  const message =
    context.principal.uid === undefined ? withData : { ...withData, uid: context.principal.uid };
  return message;
}

export async function callEdgeHost<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  context: HostOperationContext<TIdentity, TExecution, TUpgrade>,
  name: string,
  input: RpcCall["input"],
): Promise<RpcCall["input"]> {
  const procedure = context.registered.registration.channel.procedures[name];
  if (procedure === undefined) {
    throw new CableError("NOT_FOUND", { message: `Host procedure '${name}' is not declared` });
  }
  const message = peerCallMessage(context, name, input);
  const response = await invokePeer(context, message);
  return parsePeerCall(response.value);
}

export function edgeOperationContext<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  registered: RegisteredChannel<TExecution, TUpgrade>,
  resolved: ResolvedChannel,
  principal: EdgePrincipal<TIdentity>,
  grants?: EdgeGrants<TIdentity>,
): HostOperationContext<TIdentity, TExecution, TUpgrade> {
  if (principal.identity === null) {
    throw new CableError("UNAUTHORIZED", { message: "Host access requires authentication" });
  }
  assertTargetBounds(registered, resolved.key, principal.uid);
  const authenticated =
    principal.uid === undefined
      ? { identity: principal.identity }
      : { identity: principal.identity, uid: principal.uid };
  const context = { principal: authenticated, registered, resolved };
  return grants === undefined ? context : { ...context, grants };
}

async function operationContext<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  registered: RegisteredChannel<TExecution, TUpgrade>,
  rawParams: RpcCall["input"],
  principal: EdgePrincipal<TIdentity>,
  grants?: EdgeGrants<TIdentity>,
): Promise<HostOperationContext<TIdentity, TExecution, TUpgrade>> {
  if (principal.identity === null) {
    throw new CableError("UNAUTHORIZED", { message: "Host access requires authentication" });
  }
  const resolved = await resolveChannel(registered.registration.channel, rawParams);
  return edgeOperationContext(registered, resolved, principal, grants);
}

function peerCallMessage<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  context: HostOperationContext<TIdentity, TExecution, TUpgrade>,
  procedure: string,
  input: RpcCall["input"],
): Promise<PeerMessage> | PeerMessage {
  const build = (grants: readonly string[]): PeerMessage => {
    const base = {
      grants: normalizeGrants(grants),
      identity: context.principal.identity,
      p: procedure,
      t: "call",
    };
    const withInput = input === undefined ? base : { ...base, d: input };
    const message =
      context.principal.uid === undefined
        ? withInput
        : { ...withInput, uid: context.principal.uid };
    assertJsonData(message, "BAD_REQUEST");
    return message;
  };
  const grants = context.grants?.(
    context.principal.identity,
    context.resolved.key,
    context.resolved.params,
  );
  return grants instanceof Promise ? grants.then(build) : build(grants ?? []);
}

async function invokePeer<TIdentity, TExecution, TUpgrade extends EdgeUpgrade>(
  context: HostOperationContext<TIdentity, TExecution, TUpgrade>,
  message: Promise<PeerMessage> | PeerMessage,
): Promise<PeerResponse> {
  try {
    return {
      value: await context.registered.registration.transport.peer(
        context.resolved.key,
        await message,
      ),
    };
  } catch (cause) {
    if (isCableError(cause)) throw cause;
    throw new CableError("UNAVAILABLE", { cause, message: "Host peer request failed" });
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parses the raw adapter RPC value at its boundary.
function parsePeerEmit(value: unknown): number {
  const result = requireRecord(value, "Peer emit response", invalidPeerResponse);
  if (result["ok"] === false) {
    assertRecordKeys(result, ["e", "ok"], "Peer emit response", invalidPeerResponse);
    throw peerError(result["e"]);
  }
  assertRecordKeys(result, ["seq"], "Peer emit response", invalidPeerResponse);
  const sequence = result["seq"];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The peer response parser narrows the sequence field before use.
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw invalidPeerResponse("Peer emit response seq must be a positive integer");
  }
  return sequence;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parses the raw adapter RPC value at its boundary.
function parsePeerCall(value: unknown): RpcCall["input"] {
  const result = requireRecord(value, "Peer call response", invalidPeerResponse);
  if (result["ok"] === true) {
    assertRecordKeys(result, ["d", "ok"], "Peer call response", invalidPeerResponse);
    assertJsonData(result["d"], "INTERNAL");
    return result["d"];
  }
  if (result["ok"] !== false) {
    throw invalidPeerResponse("Peer call response ok must be a boolean");
  }
  assertRecordKeys(result, ["e", "ok"], "Peer call response", invalidPeerResponse);
  throw peerError(result["e"]);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parses the peer error envelope before creating CableError.
function peerError(value: unknown): CableError<string> {
  const error = requireRecord(value, "Peer call error", invalidPeerResponse);
  assertRecordKeys(error, ["code", "data", "message"], "Peer call error", invalidPeerResponse);
  const code = error["code"];
  const message = error["message"];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The peer error parser narrows code before creating a typed error.
  if (typeof code !== "string" || code.length === 0) {
    throw invalidPeerResponse("Peer call error code must be a non-empty string");
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The peer error parser narrows an optional message before use.
  if (message !== undefined && typeof message !== "string") {
    throw invalidPeerResponse("Peer call error message must be a string");
  }
  assertJsonData(error["data"], "INTERNAL");
  return message === undefined
    ? new CableError(code, { data: error["data"] })
    : new CableError(code, { data: error["data"], message });
}

export function normalizeGrants(grants: readonly string[]): readonly string[] {
  const unique = new Set<string>();
  for (const grant of grants) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Grants enter from an adapter boundary and must be non-empty strings.
    if (typeof grant !== "string" || grant.length === 0) {
      throw new CableError("BAD_REQUEST", { message: "Host grants must be non-empty strings" });
    }
    if (unique.has(grant)) {
      throw new CableError("BAD_REQUEST", { message: "Host grants must not contain duplicates" });
    }
    unique.add(grant);
  }
  return [...unique];
}

export function assertTargetBounds<TExecution, TUpgrade extends EdgeUpgrade>(
  registered: RegisteredChannel<TExecution, TUpgrade>,
  key: HostKey,
  uid: string | undefined,
): void {
  const limits = registered.registration.transport.limits;
  if (new TextEncoder().encode(key).byteLength > limits.maxHostKeyBytes) {
    throw new CableError("PAYLOAD_TOO_LARGE", { message: "Host key exceeds adapter limit" });
  }
  if (uid === undefined) return;
  if (uid.length === 0 || Array.from(uid).length > limits.maxUidCharacters) {
    throw new CableError("PAYLOAD_TOO_LARGE", { message: "User id exceeds adapter limit" });
  }
}

function invalidPeerResponse(message: string): CableError<"UNAVAILABLE"> {
  return new CableError("UNAVAILABLE", { message });
}

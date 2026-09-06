import {
  isChannelContract,
  isContract,
  isProcedureContract,
  type AnyChannelContract,
  type ContractTree,
} from "@cable/contract";

import { parseChannelKey } from "../channel-key.js";
import { CableError, isCableError } from "../errors.js";
import type { HostKey } from "../host.js";
import type { EdgeContract, EdgeHostRegistration } from "./types.js";

export interface RegisteredChannel {
  readonly path: readonly string[];
  readonly registration: EdgeHostRegistration;
}

export class EdgeRegistry {
  private readonly byChannel = new Map<AnyChannelContract, RegisteredChannel>();
  private readonly byPath = new Map<string, RegisteredChannel>();

  public constructor(contract: ContractTree, registrations: readonly EdgeHostRegistration[]) {
    const channels = collectChannels(contract);
    if (registrations.length !== channels.size) {
      throw new TypeError("Edge hosts must register every channel exactly once");
    }
    for (const registration of registrations) {
      const path = channels.get(registration.channel);
      if (path === undefined) {
        throw new TypeError("Edge host registration channel does not belong to this contract");
      }
      if (this.byChannel.has(registration.channel)) {
        throw new TypeError(`Channel '${path.join(".")}' is registered more than once`);
      }
      assertTransport(registration);
      const registered = { path, registration };
      this.byChannel.set(registration.channel, registered);
      this.byPath.set(path.join("."), registered);
    }
  }

  public channel(path: readonly string[]): RegisteredChannel | undefined {
    return this.byPath.get(path.join("."));
  }

  public select(key: HostKey): RegisteredChannel {
    let selected: RegisteredChannel | undefined;
    for (const registered of this.byChannel.values()) {
      try {
        parseChannelKey(registered.registration.channel, key);
        if (selected !== undefined) {
          throw new CableError("CONFLICT", { message: "Host key matches multiple channels" });
        }
        selected = registered;
      } catch (error) {
        if (!isCableError(error, "BAD_REQUEST")) throw error;
      }
    }
    if (selected === undefined) {
      throw new CableError("NOT_FOUND", { message: "Host channel not found" });
    }
    return selected;
  }
}

export function edgeContractTree<TTree extends ContractTree>(
  contract: EdgeContract<TTree>,
): ContractTree {
  if (!isContract(contract)) {
    throw new TypeError("edge contract must come from c.contract()");
  }
  return contract;
}

function collectChannels(contract: ContractTree): Map<AnyChannelContract, readonly string[]> {
  const channels = new Map<AnyChannelContract, readonly string[]>();
  visitChannels(contract, [], channels);
  return channels;
}

function visitChannels(
  branch: ContractTree,
  path: readonly string[],
  channels: Map<AnyChannelContract, readonly string[]>,
): void {
  for (const [name, node] of Object.entries(branch)) {
    const nextPath = [...path, name];
    if (isChannelContract(node)) {
      channels.set(node, nextPath);
      continue;
    }
    if (!isProcedureContract(node)) {
      // SAFETY: c.contract validates that every non-node value is another
      // contract branch before it installs the contract brand.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The branded contract establishes this recursive runtime invariant.
      visitChannels(node as ContractTree, nextPath, channels);
    }
  }
}

function assertTransport(registration: EdgeHostRegistration): void {
  const { maxHostKeyBytes, maxUidCharacters } = registration.transport.limits;
  if (!Number.isSafeInteger(maxHostKeyBytes) || maxHostKeyBytes <= 0) {
    throw new TypeError("maxHostKeyBytes must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxUidCharacters) || maxUidCharacters <= 0) {
    throw new TypeError("maxUidCharacters must be a positive safe integer");
  }
}

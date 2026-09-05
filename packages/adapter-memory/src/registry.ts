import type { HostHandlers, HostKey, PeerMessage, Peers } from "@cable/core";

/** A registered in-memory Host that can receive peer messages. */
export interface MemoryPeerTarget {
  readonly onPeer: HostHandlers["onPeer"];
}

/** Routes peer traffic between in-memory Hosts without process-global state. */
export class MemoryHostRegistry {
  private readonly hosts = new Map<HostKey, MemoryPeerTarget>();

  /** Register the sole Host responsible for a channel key. */
  register(key: HostKey, host: MemoryPeerTarget): void {
    if (this.hosts.has(key)) throw new Error(`A memory Host is already registered for '${key}'.`);
    this.hosts.set(key, host);
  }

  /** Create the peer capability exposed to one Host. */
  createPeers(): Peers {
    return {
      send: async (key, message): Promise<void> => {
        await this.target(key).onPeer(structuredClone(message));
      },
      call: async <T>(key: HostKey, message: PeerMessage): Promise<T> => {
        const result = await this.target(key).onPeer(structuredClone(message));
        // SAFETY: Peers.call's caller selects T from the target's documented response.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The in-memory boundary preserves the target response after cloning.
        return structuredClone(result) as T;
      },
    };
  }

  private target(key: HostKey): MemoryPeerTarget {
    const target = this.hosts.get(key);
    if (target === undefined) throw new Error(`No memory Host is registered for '${key}'.`);
    return target;
  }
}

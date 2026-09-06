/**
 * Consistent Hashing Implementation
 *
 * Implements a consistent hash ring for distributing connections across multiple nodes
 * with minimal redistribution when nodes are added or removed.
 *
 * Features:
 * - Virtual nodes for better distribution
 * - Fast binary search for lookups
 * - FNV-1a hash function for consistent distribution
 */
import { DEFAULT_VIRTUAL_NODES } from '../constants';

/**
 * Represents a node on the hash ring
 */
interface RingNode {
  readonly hash: number; // Hash position on the ring
  readonly node: string; // Real node identifier
}

/**
 * ConsistentHash distributes keys across nodes while minimizing
 * reassignments when the node set changes.
 */
export class ConsistentHash {
  #ring: RingNode[] = [];
  readonly #virtualNodes: number;

  /**
   * Creates a new consistent hash ring
   *
   * @param nodes Initial nodes to add to the ring
   * @param virtualNodes Number of virtual nodes per real node for better distribution
   */
  constructor(nodes: readonly string[] = [], virtualNodes = DEFAULT_VIRTUAL_NODES) {
    this.#virtualNodes = virtualNodes;

    if (nodes.length > 0) {
      // Initialize ring with all nodes at once for better performance
      this.#ring = nodes
        .flatMap((node) =>
          Array.from({ length: this.#virtualNodes }, (_, i) => {
            const virtualNodeKey = `${node}:${i}`;
            return {
              hash: this.#hash(virtualNodeKey),
              node,
            };
          }),
        )
        .sort((a, b) => a.hash - b.hash);
    }
  }

  /**
   * FNV-1a hash function for consistent distribution
   *
   * @param key String key to hash
   * @returns 32-bit unsigned integer hash
   */
  #hash = (key: string): number => {
    let h = 2166136261; // 32-bit FNV offset basis
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0; // Convert to unsigned 32-bit integer
  };

  /**
   * Add a node to the hash ring
   *
   * @param node Node identifier to add
   */
  addNode(node: string): void {
    // Generate virtual nodes for better distribution
    const virtualNodes = Array.from(
      { length: this.#virtualNodes },
      (_, i): RingNode => ({
        hash: this.#hash(`${node}:${i}`),
        node,
      }),
    );

    // Add new nodes and re-sort the ring
    this.#ring = [...this.#ring, ...virtualNodes].sort((a, b) => a.hash - b.hash);
  }

  /**
   * Remove a node from the hash ring
   *
   * @param node Node identifier to remove
   */
  removeNode(node: string): void {
    // Filter out all virtual nodes for the specified node
    this.#ring = this.#ring.filter((item) => item.node !== node);
  }

  /**
   * Get the node responsible for the given key
   *
   * @param key Key to look up
   * @returns Node identifier or null if the ring is empty
   */
  getNode(key: string): string | null {
    if (this.#ring.length === 0) return null;

    const hash = this.#hash(key);
    return this.#findNodeForHash(hash);
  }

  /**
   * Find the appropriate node for a given hash using binary search
   *
   * @param hash Hash value to look up
   * @returns Node identifier responsible for the hash
   */
  #findNodeForHash(hash: number): string {
    // Binary search to find the first node with a hash >= the key hash
    let low = 0;
    let high = this.#ring.length - 1;
    let position = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);

      if (this.#ring[mid].hash >= hash) {
        high = mid - 1;
        position = mid;
      } else {
        low = mid + 1;
        position = low;
      }
    }

    // If we went past the end, wrap around to the first node
    if (position >= this.#ring.length) {
      position = 0;
    }

    return this.#ring[position].node;
  }

  /**
   * Get all unique nodes in the ring
   *
   * @returns Array of unique node identifiers
   */
  getNodes(): string[] {
    return [...new Set(this.#ring.map((item) => item.node))];
  }
}

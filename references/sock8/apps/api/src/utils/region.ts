/**
 * Region Management
 *
 * Provides utilities for managing geographical regions:
 * - Mapping Cloudflare edge locations to geographical regions
 * - Tracking active regions for accounts
 * - Managing region state in KV storage
 */
import {
  ACTIVE_REGION_TTL_SECONDS,
  DEFAULT_REGION,
  GLOBAL_REGION,
  KV_PREFIXES,
} from '../constants';
import { REGION_MAP } from '../constants/regions';

/**
 * Maps a Cloudflare data center location to a geographical region
 *
 * Uses a predefined mapping from Cloudflare's colocations (3-letter codes)
 * to more user-friendly geographical regions.
 *
 * @param colo - The Cloudflare data center code (e.g., SFO, LHR, AMS)
 * @returns The mapped region or default region if unknown
 */
export function mapColoToRegion(colo: string | undefined): string {
  if (!colo) return DEFAULT_REGION;
  return REGION_MAP[colo] ?? GLOBAL_REGION;
}

/**
 * Marks a region as active for an account
 *
 * When a connection is established in a region, we track it as active
 * to enable cross-region message distribution.
 *
 * @param env - Environment bindings containing KV access
 * @param account - Account identifier
 * @param region - Region identifier
 */
export async function markRegionActive(env: Env, account: string, region: string): Promise<void> {
  try {
    const key = `${KV_PREFIXES.ACTIVE_REGION}${account}:${region}`;
    await env.SOCKET_KV.put(key, Date.now().toString(), {
      expirationTtl: ACTIVE_REGION_TTL_SECONDS,
    });
  } catch (err) {
    console.error('[RegionUtils] Failed to mark region active:', { account, region, error: err });
    // Continue execution - marking regions is non-critical
  }
}

/**
 * Marks a region as inactive for an account
 *
 * When all connections in a region are closed, we stop tracking it
 * to prevent unnecessary message distribution.
 *
 * @param env - Environment bindings containing KV access
 * @param account - Account identifier
 * @param region - Region identifier
 */
export async function markRegionInactive(env: Env, account: string, region: string): Promise<void> {
  try {
    const key = `${KV_PREFIXES.ACTIVE_REGION}${account}:${region}`;
    await env.SOCKET_KV.delete(key);
  } catch (err) {
    console.error('[RegionUtils] Failed to mark region inactive:', { account, region, error: err });
    // Continue execution - marking regions is non-critical
  }
}

/**
 * Gets all active regions for an account
 *
 * Retrieves the list of regions where an account currently has active connections.
 * Used for determining where to distribute published messages.
 *
 * @param env - Environment bindings containing KV access
 * @param account - Account identifier
 * @returns Array of active region identifiers
 */
export async function getActiveRegions(env: Env, account: string): Promise<string[]> {
  try {
    const prefix = `${KV_PREFIXES.ACTIVE_REGION}${account}:`;
    const list = await env.SOCKET_KV.list({ prefix });

    return list.keys.map((key) => {
      const parts = key.name.split(':');
      return parts[parts.length - 1]; // Extract region from key
    });
  } catch (err) {
    console.error('[RegionUtils] Failed to list active regions:', { account, error: err });
    return []; // Return empty list for safety
  }
}

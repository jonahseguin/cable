import { interpolatePath } from './channels';
import type { ChannelTree, ChannelTreeDefinition } from '@/common';

// Symbol for the flat resolution map
const resolutionMapSymbol = Symbol.for('__sock8ResolutionMap__');

// Map entry type definition (align with channels.ts)
type ParamMap = Map<string, string>; // Map<ParamSignature, TemplateKey>

// *** Export Type ***
export type ResolutionMapEntry =
  | { type: 'static'; key: string }
  | { type: 'paramNode'; paramMap: ParamMap };

// *** Export Type ***
export type ResolutionMap = Map<string, ResolutionMapEntry>; // Map<StaticPathPrefix, Entry>

// Helper to find best matching signature key from paramMap
function findBestParamSignatureMatch(
  paramMapKeys: IterableIterator<string>,
  providedKeysSet: Set<string>,
): string | null {
  let bestMatch: string | null = null;
  let maxMatchCount = -1;

  for (const signatureKey of paramMapKeys) {
    const expectedParams = signatureKey === '' ? [] : signatureKey.split(',');
    const requiredPresent = expectedParams.every((p) => providedKeysSet.has(p));

    if (requiredPresent) {
      // Prioritize exact match (same number of params)
      if (expectedParams.length === providedKeysSet.size) {
        return signatureKey; // Exact match is always best
      }
      // If not exact, track the one that matches the most required params
      if (expectedParams.length > maxMatchCount) {
        maxMatchCount = expectedParams.length;
        bestMatch = signatureKey;
      }
    }
  }
  // Handle ambiguity if multiple signatures match same max number? Could warn.
  return bestMatch;
}

/**
 * Resolves a channel endpoint string from a StructuredChannelTree using a static path
 * and a parameters object. Uses the pre-computed resolution map.
 */
export function resolveEndpointFromTree<ConfigType extends ChannelTreeDefinition>(
  tree: ChannelTree<ConfigType, 'server'>,
  staticPath: string, // e.g., "", "prefix", "admin.settings", "members"
  params: Record<string, string> = {},
): string {
  const map = (tree as any)[resolutionMapSymbol] as ResolutionMap | undefined;

  if (!map) {
    throw new Error('Internal Error: Resolution map not found on the provided channel tree.');
  }

  const providedParamKeys = Object.keys(params);
  const providedKeysSet = new Set(providedParamKeys);

  // Lookup the static path prefix
  const entry = map.get(staticPath);

  // 1. Handle Static Path Case (no parameters provided)
  if (providedParamKeys.length === 0) {
    if (entry?.type === 'static') {
      return entry.key; // Key is the full static path - NO SUFFIX
    }
    if (entry?.type === 'paramNode') {
      // Check if a zero-param definition exists (signature key = "")
      const templateKey = entry.paramMap.get('');
      if (templateKey !== undefined) {
        try {
          // Interpolate for zero-param - NO SUFFIX
          return interpolatePath(templateKey, {});
        } catch (e: any) {
          throw new Error(
            `Internal interpolation error for zero-param def at "${staticPath}": ${e.message}`,
          );
        }
      }
      throw new Error(`Path "${staticPath}" requires parameters, but none were provided.`);
    }
    throw new Error(`Channel path "${staticPath}" not found.`);
  }

  // 2. Handle Parameterized Path Case (parameters provided)
  if (entry?.type === 'paramNode') {
    // Find the best matching parameter signature defined for this node
    const bestSignature = findBestParamSignatureMatch(entry.paramMap.keys(), providedKeysSet);

    if (bestSignature !== null) {
      const templateKey = entry.paramMap.get(bestSignature)!;
      try {
        // Found the template key, interpolate directly
        // Note: findBestParamSignatureMatch allows extra parameters
        if (providedKeysSet.size > bestSignature.split(',').filter((p) => p !== '').length) {
          console.warn(
            `Resolver Warning: Extra parameters provided for path "${staticPath}". Expected {${bestSignature}}, Got ${JSON.stringify(params)}. Proceeding.`,
          );
        }
        // Interpolate path using the correct template
        const baseInterpolatedPath = interpolatePath(templateKey, params);

        // Now just return the result from the modified interpolatePath
        return baseInterpolatedPath;
      } catch (interpolationError: any) {
        throw new Error(
          `Error resolving parameters for def "${templateKey}" at "${staticPath}": ${interpolationError.message}`,
        );
      }
    } else {
      // Found paramNode, but no defined signature matched the required provided params
      const availableSignatures = Array.from(entry.paramMap.keys())
        .sort()
        .map((s) => (s ? `{${s}}` : '{}'))
        .join(' or ');
      throw new Error(
        `Invalid parameters provided for path "${staticPath}". Provided: ${JSON.stringify(params)}. Expected signatures like: ${availableSignatures}`,
      );
    }
  }

  // 3. Handle cases where params were provided but the exact path resolves to static
  if (entry?.type === 'static') {
    throw new Error(
      `Path "${staticPath}" resolves to a static endpoint, but parameters were provided: ${JSON.stringify(params)}`,
    );
  }

  // 4. Fallback: staticPath not found in map or is wrong type for the given params
  throw new Error(
    `Channel path "${staticPath}" with parameters ${JSON.stringify(params)} could not be resolved.`,
  );
}

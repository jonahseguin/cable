import { z, type ZodTypeAny } from 'zod';
import {
  type ChannelSchemaDefinition,
  type ChannelHandler,
  type Unsubscribe,
  type ChannelTreeDefinition,
  type ChannelTree,
  type ChannelSchemaObject,
  type ChannelMethods,
  type ApplyChannelMethodBuilder,
  type KnownBuilderKeys,
  type DefaultBuilderKey,
  type ExtractPresenceSchema,
  type ChannelConfig,
} from '@/common';

// Type for the emit logic function passed from create()
type EmitLogicFn = (
  channelPath: string,
  payload: any,
  options?: { persist?: boolean },
) => Promise<void> | void;

// Symbol for runtime identification of processed channel trees
const isSock8ChannelTree = Symbol.for('__isSock8ChannelTree__');
// Symbol used internally to collect parameterized definitions before finalization
const pendingForDefinitions = Symbol.for('__pendingForDefinitions__');
// Symbol for the flat resolution map
const resolutionMapSymbol = Symbol.for('__sock8ResolutionMap__');

// Symbols & Types for the resolver
const nodeTypeSymbol = Symbol.for('__sock8NodeType__');
const paramDefSymbol = Symbol.for('__sock8ParamDef__');

const NodeType = {
  STATIC_ENDPOINT: 'static_endpoint',
  PARAM_NODE: 'param_node',
} as const;

interface ParamDefinition {
  key: string; // The original template string key
  paramNames: string[];
  schema: ZodTypeAny; // Actual schema for endpoints, placeholder for nested trees
  config: Record<string, any> | undefined; // Includes __sock8NestedTree for nested trees
  transform?: ((payload: any) => Promise<any>) | undefined; // Add optional transform
  onEmit?: ((payload: any) => Promise<void>) | undefined; // Add optional onEmit
}

// Helper to create consistent registry keys from params
const getParamRegistryKey = (params: string[]) => params.slice().sort().join(',');

// Helper to filter out parameter segments
const getStaticSegments = (allSegments: string[]) =>
  allSegments.filter((s) => !(s.startsWith('{') && s.endsWith('}')));

// Runtime Helper: Check if a value is a Zod schema object { schema: ... }
function isChannelSchemaObject(value: any): value is ChannelSchemaObject<ZodTypeAny> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    value.schema instanceof z.ZodType
  );
}

// Runtime Helper: Check if a value is a schema tuple [schema] or [schema, config]
function isChannelSchemaTuple(
  value: any,
): value is [ZodTypeAny] | [ZodTypeAny, Record<string, any>] {
  return (
    Array.isArray(value) &&
    (value.length === 1 || value.length === 2) &&
    value[0] instanceof z.ZodType
  );
}

// Runtime Helper: Check if a value is a pre-defined channel tree
function isDefinedChannelsObject(value: any): value is ChannelTree<any> {
  return typeof value === 'object' && value !== null && value[isSock8ChannelTree] === true;
}

// Parses a ChannelSchemaDefinition (tuple or object) into a consistent format.
// Returns: [schema, config, transformFn]
function parseSchemaDefinition(
  definition: ChannelSchemaDefinition,
): [
  ZodTypeAny,
  Record<string, any> | undefined,
  ((payload: any) => Promise<any>) | undefined,
  ((payload: any) => Promise<void>) | undefined,
] {
  if (isChannelSchemaTuple(definition)) {
    // Tuples don't have transform
    if (definition.length === 1) {
      // Case: [Schema]
      return [definition[0], undefined, undefined, undefined];
    } else {
      // Case: [Schema, Config] (length must be 2 here)
      return [
        definition[0],
        definition[1] as Record<string, any> | undefined,
        undefined,
        undefined,
      ];
    }
  }
  if (isChannelSchemaObject(definition)) {
    // Extract transform if it exists on the runtime object
    const transformFn = (definition as any).transform as
      | ((payload: any) => Promise<any>)
      | undefined;
    const onEmit = (definition as any).onEmit as ((payload: any) => Promise<void>) | undefined;
    // @ts-ignore
    return [definition.schema, definition.capabilities, transformFn, onEmit];
  }
  // Fallback
  console.warn('Invalid ChannelSchemaDefinition encountered at runtime:', definition);
  return [z.never(), undefined, undefined, undefined];
}

// Placeholder removed - emit logic will be passed in

// Placeholder for the actual backend/server-side subscribe implementation.
function subscribeLogic(channelPath: string, handler: ChannelHandler<any>): Unsubscribe {
  // In a real implementation: Register handler per connection/session, manage subscription state.
  console.log(`[Subscribe] Channel: "${channelPath}"`);
  const unsubscribe = () => {
    // Cleanup logic for the specific subscription.
    console.log(`[Unsubscribe] Channel: "${channelPath}"`);
  };
  return unsubscribe;
}

// Constructs the { emit, config } channel methods object specifically for the server.
// Add transformFn parameter
function createChannelMethods<
  Schema extends ZodTypeAny,
  O, // OutputType generic (though not directly used in server emit/config)
  C extends ChannelConfig, // Config generic
>(
  schema: Schema,
  resolvedChannelPath: string,
  config: C, // Use specific config type
  transformFn: ((input: z.infer<Schema>) => O) | undefined, // Add transformFn parameter
  emitCallback: ((payload: O) => Promise<void>) | undefined,
  emitLogic?: EmitLogicFn,
): ServerChannelMethods<Schema, O, C> {
  // Return type uses generics
  return {
    emit: async (payload: z.infer<Schema>) => {
      try {
        // 1. Validate payload against input schema
        const validatedPayload = schema.parse(payload);

        // 2. Apply transform function if it exists
        let finalPayload: O | z.infer<Schema>;
        if (transformFn) {
          try {
            finalPayload = await transformFn(validatedPayload);
          } catch (transformError) {
            console.error(
              `[Transform Error] Channel "${resolvedChannelPath}": Failed to transform payload.`,
              transformError,
            );
            // Decide how to handle transform errors - skip emit?
            return; // Skip emit on transform error for now
          }
        } else {
          // Type assertion needed if OutputType isn't strictly z.infer<Schema>
          finalPayload = validatedPayload as O;
        }

        // 3. Call underlying emit logic with the final (potentially transformed) payload
        await emitLogic?.(resolvedChannelPath, finalPayload, { persist: config?.history });

        if (emitCallback) {
          await emitCallback(finalPayload);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          console.error(`[Validation Error] Channel "${resolvedChannelPath}":`, error.errors);
        } else {
          console.error(`[Emit Error] Channel "${resolvedChannelPath}":`, error);
        }
      }
    },
    config: config, // Assign the config
  } as ServerChannelMethods<Schema, O, C>; // Cast needed because emit returns Promise<void>, not ServerChannelMethods
}

/**
 * Interpolates parameters into a path template.
 * Example: interpolatePath('user.{userId}.posts.{postId}', { userId: '123', postId: '456' }) -> 'user.123.posts.456'
 *
 * @param template The path template string (e.g., 'user.{userId}.posts')
 * @param params An object containing parameter values (e.g., { userId: '123' })
 * @returns The interpolated path string.
 */
export function interpolatePath(template: string, params: Record<string, string>): string {
  let result = template;
  const paramNames = extractParamNames(template);
  const providedKeys = Object.keys(params);

  // Track used keys to potentially warn about missing ones later (optional)
  const usedKeys = new Set<string>();

  // Sort keys by length descending to handle nested placeholders correctly
  // e.g., if you had {userId} and {userId_details}, replace {userId_details} first.
  const sortedParamNames = paramNames.sort((a, b) => b.length - a.length);

  for (const name of sortedParamNames) {
    const placeholder = `{${name}}`;
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      // value should not contain dots which would break the static path lookup
      // we will replace dots in name with a (dot) placeholder
      const value = params[name]?.replaceAll('.', '(dot)');

      // Perform replacement with the new value##name format
      result = result.replaceAll(placeholder, `${value}##${name}`);

      usedKeys.add(name);
    } else {
      // This should ideally not happen if called after findBestParamSignatureMatch
      // but keeping a check here is defensive.
      console.warn(`interpolatePath: Missing parameter "${name}" for template "${template}"`);
      // Leaving placeholder for now, but might indicate upstream issues.
      // throw new Error(`Missing required parameter "${name}" for template "${template}"`);
    }
  }

  // Optional: Check for extra parameters provided but not used in this template
  // (This is already handled with a warning in resolveEndpointFromTree)
  /*
  for (const providedKey of providedKeys) {
    if (!usedKeys.has(providedKey) && !paramNames.includes(providedKey)) { // Check paramNames as well
      console.warn(
        `interpolatePath: Extra parameter "${providedKey}" provided for template "${template}"`,
      );
    }
  }
  */

  return result;
}

// Checks if a path template contains any parameter placeholders like {param}.
function pathHasParameters(pathTemplate: string): boolean {
  return /\{([^}]+)\}/.test(pathTemplate);
}

// Extracts parameter names (e.g., ["userId"]) from a path template string.
function extractParamNames(pathTemplate: string): string[] {
  return (pathTemplate.match(/\{([^}]+)\}/g) || []).map((p) => p.slice(1, -1));
}

// Helper function to determine the absolute template key
function resolveAbsoluteTemplateKey(originalKey: string, nodePathPrefix: string): string {
  // If originalKey already contains '.', assume it's root-relative or already correct
  // e.g., 'admin.{teamId}.settings' or '{orgId}.members'
  if (originalKey.includes('.')) {
    return originalKey;
  }
  // If originalKey starts with '{' but has no '.', it's a simple parameter
  // e.g., '{itemId}' or '{userId}'
  if (originalKey.startsWith('{')) {
    // If defined inside a node (prefix exists), prepend the prefix.
    // e.g., '{itemId}' inside 'prefix' becomes 'prefix.{itemId}'
    // If defined at root (prefix is ''), return as is (e.g., '{userId}')
    return nodePathPrefix ? `${nodePathPrefix}.${originalKey}` : originalKey;
  }
  // Fallback for unexpected cases (shouldn't happen with valid configs)
  console.warn(
    `Unexpected format in resolveAbsoluteTemplateKey: key=${originalKey}, prefix=${nodePathPrefix}`,
  );
  return nodePathPrefix ? `${nodePathPrefix}.${originalKey}` : originalKey; // Best guess
}

// --- Core Runtime Implementation ---

// Traverses/creates a nested object structure based on static path segments.
// Returns the immediate parent node and the final segment key.
// Skips over parameter segments during traversal.
function findOrCreateTargetNode(
  root: any,
  segments: string[],
): { parentNode: any; finalKey: string } | null {
  let currentLevel = root;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (typeof segment !== 'string' || segment === '') return null; // Invalid segment

    // Skip parameter segments for structure creation
    if (segment.startsWith('{') && segment.endsWith('}')) {
      continue;
    }

    // Ensure static intermediate node exists
    if (typeof currentLevel[segment] !== 'object' || currentLevel[segment] === null) {
      if (currentLevel[segment] !== undefined) {
        // Conflict with non-object
        console.error(
          `Path conflict: Intermediate segment "${segment}" conflicts with non-object.`,
        );
        return null;
      }
      currentLevel[segment] = {};
    }
    currentLevel = currentLevel[segment];
  }

  const finalKey = segments[segments.length - 1];
  if (typeof finalKey !== 'string' || finalKey === '') return null; // Invalid final segment

  return { parentNode: currentLevel, finalKey: finalKey };
}

// Map<ParamSignature, TemplateKey>
type ParamMap = Map<string, string>;
type ResolutionMapEntry =
  | { type: 'static'; key: string }
  | { type: 'paramNode'; paramMap: ParamMap };
// Map<StaticPathPrefix, Entry>
type ResolutionMap = Map<string, ResolutionMapEntry>;

// Function to generate the map after the tree is built
function populateResolutionMap(node: any, map: ResolutionMap, currentPath: string = '') {
  if (typeof node !== 'object' || node === null) return;

  const nodeType = node[nodeTypeSymbol];
  const definitions: ParamDefinition[] | undefined = node[paramDefSymbol];

  if (nodeType === NodeType.STATIC_ENDPOINT) {
    // Use currentPath (full static path) as key
    if (!map.has(currentPath)) {
      map.set(currentPath, { type: 'static', key: currentPath });
    }
  } else if (nodeType === NodeType.PARAM_NODE && Array.isArray(definitions)) {
    // Use currentPath (static path to this node) as key
    const mapKey = currentPath;
    let entry = map.get(mapKey);

    // Ensure entry exists and is paramNode
    if (!entry) {
      entry = { type: 'paramNode', paramMap: new Map<string, string>() };
      map.set(mapKey, entry);
    } else if (entry.type !== 'paramNode') {
      console.error(`Map Conflict: Path "${mapKey}" is static but also has params.`);
      return; // Don't add params to a static entry
    }

    // Add definitions to the inner paramMap
    for (const def of definitions) {
      if (def.config?.__sock8NestedTree) continue; // Skip nested tree placeholders

      const paramSignature = def.paramNames.slice().sort().join(',');
      if (entry.paramMap.has(paramSignature)) {
        console.warn(
          `Duplicate param signature "${paramSignature}" for key "${mapKey}". Overwriting.`,
        );
      }
      entry.paramMap.set(paramSignature, def.key);
    }
  }

  // 2. Recurse into children properties (STATIC resolution)
  for (const key in node) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      // Skip internal props
      if (
        key === 'for' ||
        key === pendingForDefinitions.toString() ||
        key === resolutionMapSymbol.toString() ||
        key === isSock8ChannelTree.toString() ||
        key === nodeTypeSymbol.toString() ||
        key === paramDefSymbol.toString()
      )
        continue;

      const childNode = node[key];

      // Adjust path for recursive call
      // If current key is a parameter, don't append it to the path for map keys
      const pathForRecursion = key.startsWith('{')
        ? currentPath // Pass the same path down
        : currentPath
          ? `${currentPath}.${key}` // Append static key
          : key; // Start new path with static key

      // Ensure we only recurse into actual objects/subtrees
      if (typeof childNode === 'object' && childNode !== null && !Array.isArray(childNode)) {
        populateResolutionMap(childNode, map, pathForRecursion);
      }
    }
  }
}

// Define the server-specific structure
export type ServerChannelMethods<
  Schema extends z.ZodType,
  OutputType,
  Config extends ChannelConfig,
> = {
  emit: (payload: z.infer<Schema>) => Promise<void>;
  output: OutputType;
  config: Config;
};

// Augment common types
declare module '@/common' {
  // Add mapping for the server key to the interface
  interface ApplyChannelMethodBuilder<
    // Constraint MUST MATCH original definition: extends string
    BuilderKey extends string,
    Schema extends z.ZodType,
    OutputType,
    Config extends ChannelConfig,
  > {
    server: ServerChannelMethods<Schema, OutputType, Config>;
  }
}

/**
 * Defines and builds a structured, type-safe channel tree from a configuration object.
 * This is the main entry point for defining channels on the server-side.
 *
 * @param config The channel definition configuration.
 * @returns A structured channel tree with methods for interacting with channels.
 */
export function defineChannels<ConfigType extends ChannelTreeDefinition>(
  config: ConfigType,
  emitLogic?: EmitLogicFn,
): ChannelTree<ConfigType, 'server'> {
  // Registries to detect specific parameter-aware conflicts during build
  const paramNestedTreeRegistry = new Set<string>(); // Stores "staticPrefix|sortedParamKeys"
  const paramEndpointRegistry = new Set<string>(); // Stores "staticPath|sortedParamKeys"

  // Helper to create consistent registry keys from params
  const getParamRegistryKey = (params: string[]) => params.slice().sort().join(',');

  // Phase 1: Build the basic structure and collect parameterized definitions.
  // Pass the map down so it can be populated
  function buildNode(currentConfig: ChannelTreeDefinition, currentMapPath: string = ''): any {
    const result: any = {};

    for (const key in currentConfig) {
      if (!Object.prototype.hasOwnProperty.call(currentConfig, key)) continue;
      const definition = currentConfig[key];
      // Skip undefined or internal symbol keys
      if (definition === undefined || key === isSock8ChannelTree.toString()) continue;

      const segments = key.split('.');

      // --- Root Parameter Handling ---
      if (segments.length === 1 && segments[0]!.startsWith('{') && segments[0]!.endsWith('}')) {
        const [schema, configData, transformFn] = parseSchemaDefinition(
          definition as ChannelSchemaDefinition,
        );
        if (schema._def.typeName === 'ZodNever') {
          console.warn(`Skipping root parameter channel "${key}" due to invalid schema.`);
          continue;
        }
        const paramNames = extractParamNames(key);
        // Attach pending definition directly to the root result object
        let rootPending = result[pendingForDefinitions];
        if (!Array.isArray(rootPending)) {
          rootPending = [];
          result[pendingForDefinitions] = rootPending;
        }
        const defToAdd = { key, schema, config: configData, paramNames, transform: transformFn };
        rootPending.push(defToAdd);
        continue; // Skip normal processing for root parameters
      }
      // --- End Root Parameter Handling ---

      if (!pathHasParameters(key)) {
        // --- Case 1: Static Path (No Parameters) ---
        const targetInfo = findOrCreateTargetNode(result, segments);
        if (!targetInfo) {
          console.warn(`Skipping key "${key}" due to invalid static path structure.`);
          continue;
        }
        const { parentNode, finalKey } = targetInfo!;

        if (isDefinedChannelsObject(definition)) {
          // Nested Tree Assignment
          if (parentNode[finalKey] !== undefined) {
            console.warn(
              `Static path conflict: Key "${key}" would overwrite existing value at "${finalKey}". Skipping.`,
            );
            continue;
          }
          parentNode[finalKey] = definition; // Assign the pre-built tree object
        } else if (isChannelSchemaTuple(definition) || isChannelSchemaObject(definition)) {
          // Static Endpoint Assignment
          if (parentNode[finalKey] !== undefined) {
            console.warn(
              `Static path conflict: Key "${key}" would overwrite existing value at "${finalKey}". Skipping.`,
            );
            continue;
          }
          const [schema, configData, transformFn, onEmit] = parseSchemaDefinition(definition);
          if (schema._def.typeName !== 'ZodNever') {
            const methods = createChannelMethods(
              schema,
              key,
              configData,
              transformFn,
              onEmit,
              emitLogic ?? (() => console.warn('no emit logic provided')),
            );
            // Mark static endpoints and attach ID
            Object.defineProperty(methods, '__channelId__', { value: key, enumerable: false });
            (methods as any)[nodeTypeSymbol] = NodeType.STATIC_ENDPOINT;
            parentNode[finalKey] = methods;
          } else {
            console.warn(`Skipping static channel "${key}" due to invalid (ZodNever) schema.`);
          }
        } else {
          console.warn(`Invalid definition type for static key "${key}". Skipping.`);
        }
      } else {
        // --- Case 2: Parameterized Path ---
        const paramNames = extractParamNames(key);

        // Check for duplicate parameter names within the key
        const uniqueParamNames = new Set(paramNames);
        if (uniqueParamNames.size !== paramNames.length) {
          throw new Error(
            `Invalid channel definition key "${key}": Duplicate parameter names found. Parameter names within a single key must be unique.`,
          );
        }
        // --- End Check ---

        const sortedParamKey = getParamRegistryKey(paramNames);
        const staticSegments = getStaticSegments(segments);
        const staticPrefix = staticSegments.join('.');

        if (isDefinedChannelsObject(definition)) {
          // --- Handle Parameterized Path with NESTED TREE value ---
          const registryKey = `${staticPrefix}|${sortedParamKey}`;

          // Conflict Check: Does an endpoint already exist within this parameterized prefix?
          const conflictingEndpointKey = Array.from(paramEndpointRegistry.keys()).find(
            (k) => k.startsWith(`${staticPrefix}.`) && k.endsWith(`|${sortedParamKey}`),
          );
          if (conflictingEndpointKey) {
            throw new Error(
              `Configuration conflict: Parameterized nested tree "${key}" conflicts with endpoint definition for "${conflictingEndpointKey.split('|')[0]}" which uses the same parameters ({${paramNames.join(',')}}).`,
            );
          }

          // Check for duplicate parameterized nested tree definition (less likely, but good practice)
          if (paramNestedTreeRegistry.has(registryKey)) {
            console.warn(
              `Duplicate definition ignored for parameterized nested tree at "${staticPrefix}" with params {${paramNames.join(',')}}`,
            );
            continue; // Skip adding pending def
          }
          paramNestedTreeRegistry.add(registryKey);

          // Find/create the static node to attach the *actual* pending definition
          const targetInfo = findOrCreateTargetNode(result, staticSegments);
          if (!targetInfo) {
            // Should be caught by findOrCreateTargetNode error handling, but defensive check
            console.error(
              `[Internal Error] Failed find/create static path for already validated key "${key}". Skipping.`,
            );
            continue;
          }
          let staticNode = targetInfo.parentNode[targetInfo.finalKey];
          if (typeof staticNode !== 'object' || staticNode === null) {
            staticNode = {};
            targetInfo.parentNode[targetInfo.finalKey] = staticNode;
          }

          // Add the pending definition (no change here, validation done via registry)
          staticNode[pendingForDefinitions] = staticNode[pendingForDefinitions] || [];
          const defToAdd = {
            type: 'parameterizedNestedTree',
            key: key,
            paramNames: paramNames,
            nestedTree: definition,
          };
          staticNode[pendingForDefinitions].push(defToAdd);
        } else if (isChannelSchemaTuple(definition) || isChannelSchemaObject(definition)) {
          // --- Handle Parameterized Path with SCHEMA value (endpoint) ---
          const [schema, configData, transformFn] = parseSchemaDefinition(
            definition as ChannelSchemaDefinition,
          );
          if (schema._def.typeName === 'ZodNever') {
            console.warn(
              `Skipping parameterized channel "${key}" due to invalid (ZodNever) schema.`,
            );
            continue;
          }

          const fullStaticPath = staticPrefix; // e.g., user.directMessages
          const registryKey = `${fullStaticPath}|${sortedParamKey}`;
          const parentStaticPrefix = staticSegments.slice(0, -1).join('.'); // e.g., user
          const parentRegistryKey = `${parentStaticPrefix}|${sortedParamKey}`;

          // Conflict Check: Does the parent prefix already resolve to a nested tree via the same parameters?
          if (paramNestedTreeRegistry.has(parentRegistryKey)) {
            throw new Error(
              `Configuration conflict: Parameterized endpoint "${key}" conflicts with a nested tree definition for the parent path "${parentStaticPrefix}" which uses the same parameters ({${paramNames.join(',')}}).`,
            );
          }

          // Check for duplicate endpoint definition (less likely, but good practice)
          if (paramEndpointRegistry.has(registryKey)) {
            console.warn(
              `Duplicate definition ignored for parameterized endpoint "${fullStaticPath}" with params {${paramNames.join(',')}}`,
            );
            continue; // Skip adding pending def
          }
          paramEndpointRegistry.add(registryKey);

          // Find/create the static node to attach the *actual* pending definition
          const targetInfo = findOrCreateTargetNode(result, staticSegments);
          if (!targetInfo) {
            console.error(
              `Failed find/create static path for parameterized key "${key}". Skipping.`,
            );
            continue;
          }
          let targetNode = targetInfo.parentNode[targetInfo.finalKey];
          // Create node if it doesn't exist
          if (typeof targetNode !== 'object' || targetNode === null) {
            if (targetNode !== undefined) {
              console.error(`Static path node conflict for "${key}" at "${targetInfo.finalKey}".`);
              continue;
            }
            targetNode = {};
            targetInfo.parentNode[targetInfo.finalKey] = targetNode;
          }

          // Add the 'endpoint' pending definition (no change here, validation via registry)
          targetNode[pendingForDefinitions] = targetNode[pendingForDefinitions] || [];
          const defToAdd = {
            type: 'endpoint',
            key,
            schema,
            config: configData,
            paramNames,
            transform: transformFn,
          };
          targetNode[pendingForDefinitions].push(defToAdd);
        } else {
          // Invalid definition type for a parameterized key
          console.warn(`Invalid definition type for parameterized key "${key}". Skipping.`);
        }
      }
    } // End config loop
    return result;
  } // End buildNode

  // Phase 2: Finalize .for methods.
  // This phase recursively traverses the structure built in Phase 1.
  // For each node containing pending parameterized definitions (collected via the symbol),
  // it creates a single `.for` method. This method uses exact parameter matching
  // to dispatch calls to the correct underlying channel definition.
  function finalizeForMethods(node: any, pathPrefix: string = '') {
    if (typeof node !== 'object' || node === null) return;

    const pendingDefs = node[pendingForDefinitions];
    if (Array.isArray(pendingDefs) && pendingDefs.length > 0) {
      // Create final definitions using ABSOLUTE keys
      const finalDefinitions: ParamDefinition[] = [];
      for (const def of pendingDefs) {
        const absoluteTemplateKey = resolveAbsoluteTemplateKey(def.key, pathPrefix);

        if (def.type === 'parameterizedNestedTree') {
          // Finalize nested tree first (needed for its map entries)
          const staticSegmentsOfKey = getStaticSegments(def.key.split('.'));
          const nestedAbsolutePathPrefix = pathPrefix
            ? `${pathPrefix}.${staticSegmentsOfKey.join('.')}`
            : staticSegmentsOfKey.join('.');
          finalizeForMethods(def.nestedTree, nestedAbsolutePathPrefix);

          finalDefinitions.push({
            key: absoluteTemplateKey,
            paramNames: def.paramNames,
            schema: z.any().describe('__sock8NestedTreePlaceholder__'),
            config: { __sock8NestedTree: def.nestedTree },
          });
        } else {
          finalDefinitions.push({
            key: absoluteTemplateKey,
            paramNames: def.paramNames,
            schema: def.schema,
            config: def.config,
            transform: def.transform,
            onEmit: def.onEmit,
          });
        }
      }
      node[paramDefSymbol] = finalDefinitions;
      node[nodeTypeSymbol] = NodeType.PARAM_NODE;

      // Create the consolidated .for method for this node (uses finalDefinitions closure)
      const consolidatedForFunction = (params: Record<string, string>) => {
        // Revert to exact match logic
        const providedKeys = Object.keys(params).sort();
        const providedKeysSet = new Set(providedKeys);

        let matchedEndpointDef: ParamDefinition | null = null;
        let matchedNestedTreeDef: ParamDefinition | null = null;

        // Find the single definition whose parameters exactly match the provided params
        for (const def of finalDefinitions) {
          // Check for exact parameter match (same number of keys, all keys match)
          if (providedKeys.length === def.paramNames.length) {
            const requiredParamsSet = new Set(def.paramNames);
            let isExactMatch = true;
            for (const p of providedKeys) {
              if (!requiredParamsSet.has(p)) {
                isExactMatch = false;
                break;
              }
            }

            if (isExactMatch) {
              // Check definition type and store appropriately
              const isNestedTree = def.config?.__sock8NestedTree !== undefined;
              if (isNestedTree) {
                if (matchedNestedTreeDef || matchedEndpointDef) {
                  // Ambiguity detection
                  console.error(
                    `[.for @ ${pathPrefix}] Ambiguous parameter match: Multiple definitions match provided params ${JSON.stringify(params)}`,
                    def.key,
                    matchedNestedTreeDef?.key || matchedEndpointDef?.key,
                  );
                  throw new Error(
                    `Internal error: Ambiguous parameter match for: ${JSON.stringify(params)} at path prefix "${pathPrefix}"`,
                  );
                }
                matchedNestedTreeDef = def;
              } else {
                // Endpoint definition
                if (matchedNestedTreeDef || matchedEndpointDef) {
                  // Ambiguity detection
                  console.error(
                    `[.for @ ${pathPrefix}] Ambiguous parameter match: Multiple definitions match provided params ${JSON.stringify(params)}`,
                    def.key,
                    matchedNestedTreeDef?.key || matchedEndpointDef?.key,
                  );
                  throw new Error(
                    `Internal error: Ambiguous parameter match for: ${JSON.stringify(params)} at path prefix "${pathPrefix}"`,
                  );
                }
                matchedEndpointDef = def;
              }
              // Don't break; check all defs to ensure no ambiguity
            }
          }
        }

        // Prioritize returning the nested tree if matched
        if (matchedNestedTreeDef) {
          // Return the NESTED TREE OBJECT associated with the definition
          return matchedNestedTreeDef.config!.__sock8NestedTree;
        } else if (matchedEndpointDef) {
          // Return the endpoint methods object
          const resolvedPath = interpolatePath(matchedEndpointDef.key, params);
          const methods = createChannelMethods(
            matchedEndpointDef.schema,
            resolvedPath,
            matchedEndpointDef.config,
            matchedEndpointDef.transform,
            matchedEndpointDef.onEmit,
            emitLogic,
          );
          Object.defineProperty(methods, '__channelId__', {
            value: resolvedPath,
            enumerable: false,
          });
          return methods;
        } else {
          // No exact match found, throw a helpful error
          const expectedSignatures = finalDefinitions
            .map((d) => (d.paramNames.length > 0 ? `{${d.paramNames.join(',')}}` : 'no parameters'))
            .filter((v, i, a) => a.indexOf(v) === i) // Get unique signatures
            .sort() // Sort for consistent error messages
            .join(' or ');
          throw new Error(
            `Invalid parameters for .for call. Provided: ${JSON.stringify(params)}. Expected one of: ${expectedSignatures}`,
          );
        }
      };
      // Assign the method
      node.for = consolidatedForFunction;
      // Clean up internal symbol only if not the root (to allow nested usage)
      if (pathPrefix !== '') {
        delete node[pendingForDefinitions];
      }
    }

    // Recurse into child nodes AND handle static endpoints
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        // Skip internal properties, .for method, etc.
        if (
          key === 'for' ||
          key === pendingForDefinitions.toString() ||
          key === nodeTypeSymbol.toString() ||
          key === paramDefSymbol.toString()
        ) {
          continue;
        }

        const childNode = node[key];
        const childNodeType = childNode?.[nodeTypeSymbol];
        const nextPathPrefix = pathPrefix ? `${pathPrefix}.${key}` : key;

        if (typeof childNode === 'object' && childNode !== null) {
          // Recursively call for nested objects/nodes
          finalizeForMethods(childNode, nextPathPrefix);
        }
      }
    }
  } // End finalizeForMethods

  // --- Execution ---
  const builtTree = buildNode(config);
  finalizeForMethods(builtTree);

  // Create and populate the resolution map
  const resolutionMap: ResolutionMap = new Map();
  populateResolutionMap(builtTree, resolutionMap);
  (builtTree as any)[resolutionMapSymbol] = resolutionMap;

  (builtTree as any)[isSock8ChannelTree] = true;
  // Cast the final result to the correct type with the specific builder key
  return builtTree as ChannelTree<ConfigType, 'server'>;
} // End defineChannels

// Re-export common types (already defined in @sock8/common)
// Ensures users importing from @sock8/server get necessary types
// without needing a separate import from @sock8/common.
export type {
  ChannelParams,
  ChannelSchemaDefinition,
  ChannelHandler,
  Unsubscribe,
  ChannelTreeDefinition,
  ChannelDefinitionValue,
  ChannelTree as StructuredChannelTree,
  ChannelMethods,
} from '@/common';

/**
 * Retrieves the unique internal channel identifier string from a resolved channel methods object.
 *
 * @param channelNode The channel methods object obtained from navigating the channel tree (e.g., tree.path.to.channel or tree.path.for({..})).
 * @returns The unique channel identifier string.
 * @throws Error if the provided object is not a valid resolved channel endpoint node.
 */
export function getChannelIdentifier(channelNode: any): string {
  const channelId = channelNode?.__channelId__;
  if (typeof channelId === 'string') {
    return channelId;
  }
  throw new Error(
    'Invalid input: Provided object is not a resolved channel endpoint node. Ensure you pass the result of accessing a static channel or calling .for() on a parameterized node.',
  );
}

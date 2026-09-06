import { z } from 'zod';

// --- Nominal Marker Symbols ---
declare const SchemaMarker: unique symbol;
declare const OutputTypeMarker: unique symbol;
declare const ConfigMarker: unique symbol;

// --- Base Types ---
export type ChannelHandler<OutputType> = (payload: OutputType) => void;
export type Unsubscribe = () => void;

export type ChannelConfig =
  | {
      presence?: z.ZodType;
      history?: boolean;
    }
  | undefined;

export type ChannelSchemaObject<
  SchemaType extends z.ZodType = z.ZodType,
  OutputType = z.infer<SchemaType>,
  ConfigType extends ChannelConfig = undefined,
> = {
  schema: SchemaType;
  config?: ConfigType;
};

export type ChannelSchemaTuple<SchemaType extends z.ZodType = z.ZodType> =
  | [SchemaType]
  | [SchemaType, ChannelConfig];

export type ChannelSchemaDefinition<
  SchemaType extends z.ZodType = z.ZodType,
  OutputType = z.infer<SchemaType>,
  ConfigType extends ChannelConfig = undefined,
> = ChannelSchemaTuple<SchemaType> | ChannelSchemaObject<SchemaType, OutputType, ConfigType>;

export type ExtractSchema<Def extends ChannelSchemaDefinition> = Def extends [
  infer S extends z.ZodType,
  ...any[],
]
  ? S
  : Def extends { schema: infer S extends z.ZodType }
    ? S
    : never;

export type ExtractOutputType<Def extends ChannelSchemaDefinition> =
  Def extends ChannelSchemaDefinition<any, infer O, any> ? O : z.infer<ExtractSchema<Def>>;

export type ExtractConfig<Def extends ChannelSchemaDefinition> =
  Def extends ChannelSchemaDefinition<any, any, infer C extends ChannelConfig> ? C : undefined;

// --- Presence Schema Extraction ---
export type ExtractPresenceSchema<Config> = Config extends { presence: infer P }
  ? P extends z.ZodType
    ? P
    : undefined
  : undefined;

// --- HKT for Channel Methods ---

// --- Builder Key Literals ---
export type DefaultBuilderKey = 'default';
// --- End Key Literals ---

// 1. Define the concrete structure for standard channel methods (empty by default)
export type StandardChannelMethods<
  Schema extends z.ZodType,
  OutputType = z.infer<Schema>,
  Config extends ChannelConfig = undefined,
> = {
  // No properties needed here, structure defined by builder
};

// Interface for Augmentation - Update generics
export interface ApplyChannelMethodBuilder<
  BuilderKey extends string,
  Schema extends z.ZodType,
  OutputType,
  Config extends ChannelConfig,
> {
  default: StandardChannelMethods<Schema, OutputType, Config>;
}

// Type alias for the keys of the (potentially augmented) mapping interface
// Update generic placeholders to match ApplyChannelMethodBuilder
// Use more specific placeholders instead of 'any'
export type KnownBuilderKeys = keyof ApplyChannelMethodBuilder<
  string,
  z.ZodAny,
  any,
  ChannelConfig
>;

// Updated ChannelMethods HKT - Add nominal markers
export type ChannelMethods<
  Schema extends z.ZodType,
  OutputType = z.infer<Schema>,
  Config extends ChannelConfig = undefined,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = ApplyChannelMethodBuilder<
  BuilderKey,
  Schema,
  OutputType,
  Config
>[BuilderKey] extends infer MethodStructure
  ? MethodStructure & {
      // Add nominal markers with generic types
      [SchemaMarker]?: Schema;
      [OutputTypeMarker]?: OutputType;
      [ConfigMarker]?: Config;
    }
  : never;

// --- Parameter Utilities ---
export type ExtractParams<Path extends string> =
  Path extends `${string}{${infer Param}}${infer Rest}` ? [Param, ...ExtractParams<Rest>] : [];
export type ParamsToObject<Params extends string[]> = Params extends []
  ? undefined
  : { [K in Params[number]]: string };
export type ChannelParams<Path extends string> = ParamsToObject<ExtractParams<Path>>;

// --- Type-level Duplicate Parameter Checker ---
type CheckDuplicates<Tuple extends readonly string[], Seen = never> = Tuple extends [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? Head extends Seen // Have we seen this element before?
    ? true // Yes, duplicate found
    : CheckDuplicates<Tail, Seen | Head> // No, recurse and add Head to Seen
  : false; // Base case: no duplicates in the remaining tuple

// --- UnionToIntersection Utility ---
export type UnionToIntersection<Union> = (Union extends any ? (k: Union) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

// --- NEW Structure Building Logic ---
// (Replacing the SIMPLIFIED version with one that handles .for)

// Nominal type for pre-built trees
declare const StructuredChannelTreeSymbol: unique symbol;
export interface ChannelTreeDefinition {
  [key: string]: ChannelDefinitionValue<KnownBuilderKeys>;
}

// Forward declaration for recursive use - use KnownBuilderKeys
type BuildTree<
  Definition extends ChannelTreeDefinition,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = BuildTreeInternal<Definition, BuilderKey>;

// Make StructuredChannelTree generic over BuilderKey - use KnownBuilderKeys
export type ChannelTree<
  T extends ChannelTreeDefinition,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = BuildTree<T, BuilderKey> & {
  [StructuredChannelTreeSymbol]: true;
};

// Base config value types - use KnownBuilderKeys
export type ChannelDefinitionValue<BuilderKey extends KnownBuilderKeys = DefaultBuilderKey> =
  | ChannelSchemaDefinition<any, any, any>
  | ChannelTree<ChannelTreeDefinition, BuilderKey>;

// Helper: Split path into segments
type PathSegments<Path extends string> = Path extends `${infer Head}.${infer Rest}`
  ? [Head, ...PathSegments<Rest>]
  : [Path];

// Helper: Build nested structure from segments
type BuildPath<Segments extends string[], LeafType> = Segments extends [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? { [K in Head]: BuildPath<Tail, LeafType> }
  : LeafType;

// Helper: Get the type of the .for method itself - use ExtractSchema
type ForMethodType<
  FullPath extends string,
  Def extends ChannelSchemaDefinition,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = {
  for: (
    params: ChannelParams<FullPath>,
    // Pass all extracted generics to ChannelMethods
  ) => ChannelMethods<ExtractSchema<Def>, ExtractOutputType<Def>, ExtractConfig<Def>, BuilderKey>;
};

// Helper: Type for a .for method that returns a nested tree structure - use KnownBuilderKeys
type ForMethodTypeNested<
  FullPath extends string,
  NestedTreeType,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = {
  for: (params: ChannelParams<FullPath>) => NestedTreeType;
};

// Helper: Get all static segments from a path, skipping parameters
type GetFullStaticSegments<Segments extends string[]> = Segments extends [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? Head extends `{${string}}`
    ? GetFullStaticSegments<Tail>
    : [Head, ...GetFullStaticSegments<Tail>]
  : [];

// Main BuildTreeInternal - use ExtractSchema
type BuildTreeInternal<
  Config extends ChannelTreeDefinition,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = UnionToIntersection<
  {
    [K in keyof Config]: K extends string
      ? PathSegments<K> extends infer Segments extends string[]
        ? ExtractParams<K> extends infer Params extends string[]
          ? CheckDuplicates<Params> extends true
            ? never
            : Params extends []
              ? Config[K] extends ChannelSchemaObject<any, any, any>
                ? BuildPath<
                    Segments,
                    ChannelMethods<
                      ExtractSchema<Config[K]>,
                      ExtractOutputType<Config[K]>,
                      ExtractConfig<Config[K]>,
                      BuilderKey
                    >
                  >
                : Config[K] extends ChannelTree<infer N, any> // Check structure, ignore inferred key
                  ? BuildPath<Segments, BuildTree<N, BuilderKey>>
                  : never
              : Config[K] extends ChannelSchemaObject<any, any, any>
                ? BuildPath<
                    GetFullStaticSegments<Segments>,
                    ForMethodType<K, Config[K], BuilderKey>
                  >
                : Config[K] extends ChannelTree<infer N, any>
                  ? BuildPath<
                      GetFullStaticSegments<Segments>,
                      ForMethodTypeNested<K, BuildTree<N, BuilderKey>, BuilderKey>
                    >
                  : never
          : never
        : never
      : never;
  }[keyof Config]
>;

/**
 * Extract all static endpoints from a channel tree (those with 'on' method)
 */
type StaticChannelEndpoints<T> = {
  [K in keyof T]: T[K] extends { on: (...args: any[]) => any } ? T[K] : never;
}[keyof T];

/**
 * Extract all the return types of 'for' methods in a channel tree (parameterized endpoints)
 */
type ParameterizedChannelEndpoints<T> = {
  [K in keyof T]: T[K] extends { for: (...args: any[]) => infer R } ? R : never;
}[keyof T];

/**
 * Recursively get all nested static and parameterized endpoints
 */
type RecursiveChannelEndpoints<T> = {
  [K in keyof T]: T[K] extends object
    ? T[K] extends { on: (...args: any[]) => any }
      ? T[K]
      : T[K] extends { for: (...args: any[]) => any }
        ? never
        : RecursiveChannelEndpoints<T[K]>
    : never;
}[keyof T];

/**
 * All possible channel endpoints with proper recursion
 * This handles nested for() methods in a more structural way
 */
type NestedForEndpoints<T> = {
  [K in keyof T]: T[K] extends { for: (...args: any[]) => any }
    ? ReturnType<T[K]['for']>
    : T[K] extends object
      ? NestedForEndpoints<T[K]>
      : never;
}[keyof T];

/**
 * All possible channel endpoints in a channel tree
 */
export type ChannelEndpoint<
  T extends ChannelTree<ChannelTreeDefinition, BuilderKey>,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> =
  | StaticChannelEndpoints<T>
  | ParameterizedChannelEndpoints<T>
  | RecursiveChannelEndpoints<T>
  | NestedForEndpoints<T>
  | unknown;

// Update GetSchemaFromEndpoint to use SchemaMarker
export type GetSchemaFromEndpoint<Endpoint> = Endpoint extends {
  [SchemaMarker]?: infer S extends z.ZodType;
}
  ? S
  : never;

// Update GetOutputTypeFromEndpoint to include BuilderKey generic again
export type GetOutputTypeFromEndpoint<
  Endpoint,
  BuilderKey extends KnownBuilderKeys = DefaultBuilderKey,
> = Endpoint extends { [OutputTypeMarker]?: infer O } ? O : never;

// Update GetConfigFromEndpoint to use ConfigMarker
export type GetConfigFromEndpoint<Endpoint> = Endpoint extends {
  [ConfigMarker]?: infer C extends ChannelConfig;
}
  ? C
  : undefined;

/**
 * Retrieves the inferred TypeScript type (from the OUTPUT schema) from a ChannelEndpoint type,
 * if the endpoint resolves to a structure containing StandardChannelMethods with a Zod schema.
 * Returns `never` if the inferred type cannot be determined.
 */
export type GetPresenceSchemaFromEndpoint<Endpoint> = ExtractPresenceSchema<
  GetConfigFromEndpoint<Endpoint>
>;

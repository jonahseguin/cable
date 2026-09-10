import type { StandardSchemaV1 } from "@standard-schema/spec";

const contractBrand: unique symbol = Symbol("cable.contract");
const contractNodeBrand: unique symbol = Symbol("cable.contract-node");
const emptyErrors: EmptyErrorMap = Object.freeze({});
const emptyProcedures: EmptyProcedureMap = Object.freeze({});
const reservedPropertyNames = new Set(["__proto__", "constructor", "prototype", "then"]);
const reservedChannelMembers = new Set([
  ...reservedPropertyNames,
  "dispose",
  "history",
  "on",
  "onError",
  "onStatus",
  "presence",
  "status",
  "stream",
]);

/** A Standard Schema v1 validator accepted by cable. */
export type AnyStandardSchema = StandardSchemaV1<unknown, unknown>;

/** A map from an application error code to the schema for its data. */
export type ErrorMap = Readonly<Record<string, AnyStandardSchema>>;

/** The error map used when a procedure or client event declares no errors. */
export type EmptyErrorMap = Readonly<Record<never, never>>;

/** The two procedure execution modes supported by the contract. */
export type ProcedureKind = "mutation" | "query";

/** HTTP methods available to an optional REST procedure route. */
export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

/** Successful JSON response statuses supported by REST procedure routes. */
export type HttpSuccessStatus = 200 | 201 | 202;

/** An OpenAPI-compatible security requirement used for documentation only. */
export type HttpSecurityRequirement = Readonly<Record<string, readonly string[]>>;

/** Data-only REST route and OpenAPI metadata for one global procedure. */
export interface HttpProcedureOptions<TKind extends ProcedureKind = ProcedureKind> {
  readonly method: TKind extends "query" ? "GET" : Exclude<HttpMethod, "GET">;
  readonly operationId?: string;
  readonly path: string;
  readonly security?: readonly HttpSecurityRequirement[];
  readonly successStatus?: HttpSuccessStatus;
  readonly summary?: string;
  readonly tags?: readonly string[];
}

/** The shallow marker shared by every procedure and channel built by cable. */
export interface ContractNode {
  readonly [contractNodeBrand]: true;
}

/** Settings for a query served with an HTTP GET request. */
export interface QueryTransport {
  readonly cache?: string;
  readonly method: "GET";
}

/** A query or mutation declaration and the schemas needed to execute it. */
export interface ProcedureContract<
  TKind extends ProcedureKind = ProcedureKind,
  TInput extends AnyStandardSchema = AnyStandardSchema,
  TOutput extends AnyStandardSchema = AnyStandardSchema,
  TErrors extends ErrorMap = ErrorMap,
> extends ContractNode {
  readonly errors: TErrors;
  readonly http?: HttpProcedureOptions<TKind>;
  readonly input: TInput;
  readonly kind: TKind;
  readonly output: TOutput;
  readonly transport?: TKind extends "query" ? QueryTransport : never;
}

/** A query contract with schemas for its input, output, and declared errors. */
export type QueryContract<
  TInput extends AnyStandardSchema = AnyStandardSchema,
  TOutput extends AnyStandardSchema = AnyStandardSchema,
  TErrors extends ErrorMap = ErrorMap,
> = ProcedureContract<"query", TInput, TOutput, TErrors>;

/** A mutation contract with schemas for its input, output, and declared errors. */
export type MutationContract<
  TInput extends AnyStandardSchema = AnyStandardSchema,
  TOutput extends AnyStandardSchema = AnyStandardSchema,
  TErrors extends ErrorMap = ErrorMap,
> = ProcedureContract<"mutation", TInput, TOutput, TErrors>;

/** A procedure contract when its exact schemas are not known. */
export type AnyProcedureContract = ProcedureContract;

/** A map of named server events to their payload schemas. */
export type ServerEventMap = Readonly<Record<string, AnyStandardSchema>>;

/** A normalized client event with an input schema and declared errors. */
export interface ClientEventContract<
  TInput extends AnyStandardSchema = AnyStandardSchema,
  TErrors extends ErrorMap = ErrorMap,
> {
  readonly errors: TErrors;
  readonly input: TInput;
}

/** The expanded or schema-only form accepted for a client event. */
export type ClientEventDefinition =
  | AnyStandardSchema
  | {
      readonly errors?: ErrorMap;
      readonly input: AnyStandardSchema;
    };

/** A map of named client events before cable normalizes shorthand schemas. */
export type ClientEventDefinitionMap = Readonly<Record<string, ClientEventDefinition>>;

/** A map of named, normalized client events. */
export type ClientEventMap = Readonly<Record<string, ClientEventContract>>;

/** Host-scoped procedures declared by a channel. */
export type ProcedureMap = Readonly<Record<string, AnyProcedureContract>>;

/** The empty procedure map used by channels without host-scoped procedures. */
export type EmptyProcedureMap = Readonly<Record<never, never>>;

/** A duration string used to retain channel history. */
export type RetentionDuration = `${number}${"d" | "h" | "m" | "s"}`;

/** Retention limits for a channel's durable history. */
export interface HistoryOptions {
  readonly max: number;
  readonly retain: RetentionDuration;
}

/** Extracts parameter names from a dot-separated channel pattern. */
export type PatternParamNames<TPattern extends string> =
  TPattern extends `${infer THead}.${infer TTail}`
    ? SegmentParamName<THead> | PatternParamNames<TTail>
    : SegmentParamName<TPattern>;

/** The default string parameter object inferred from a channel pattern. */
export type PatternParams<TPattern extends string> = Readonly<{
  [TName in PatternParamNames<TPattern>]: string;
}>;

/** Extracts a parameter name from one complete `{name}` pattern segment. */
export type SegmentParamName<TSegment extends string> = TSegment extends `{${infer TName}}`
  ? TName
  : never;

/** The generated Standard Schema type for default string pattern parameters. */
export type PatternParamsSchema<TPattern extends string> = StandardSchemaV1<
  PatternParams<TPattern>,
  PatternParams<TPattern>
>;

/** Expands one schema-only client event into its normalized contract form. */
export type NormalizeClientEvent<TDefinition extends ClientEventDefinition> =
  TDefinition extends AnyStandardSchema
    ? ClientEventContract<TDefinition, EmptyErrorMap>
    : TDefinition extends {
          readonly errors: infer TErrors extends ErrorMap;
          readonly input: infer TInput extends AnyStandardSchema;
        }
      ? ClientEventContract<TInput, TErrors>
      : TDefinition extends { readonly input: infer TInput extends AnyStandardSchema }
        ? ClientEventContract<TInput, EmptyErrorMap>
        : never;

/** Expands every schema-only client event while retaining its event names. */
export type NormalizeClientEvents<TDefinitions extends ClientEventDefinitionMap> = Readonly<{
  [TName in keyof TDefinitions]: NormalizeClientEvent<TDefinitions[TName]>;
}>;

/** The object accepted by `c.channel` before defaults are applied. */
export interface ChannelDefinition {
  readonly client: ClientEventDefinitionMap;
  readonly history?: HistoryOptions;
  readonly params?: AnyStandardSchema;
  readonly presence?: AnyStandardSchema;
  readonly procedures?: ProcedureMap;
  readonly server: ServerEventMap;
}

/** Resolves an explicit parameter schema or the schema generated from a pattern. */
export type ChannelParamsSchema<
  TPattern extends string,
  TDefinition extends ChannelDefinition,
> = TDefinition extends { readonly params: infer TParams extends AnyStandardSchema }
  ? TParams
  : PatternParamsSchema<TPattern>;

/** Resolves a channel's procedures to its declared map or an empty map. */
export type ChannelProcedures<TDefinition extends ChannelDefinition> = TDefinition extends {
  readonly procedures: infer TProcedures extends ProcedureMap;
}
  ? TProcedures
  : EmptyProcedureMap;

/** Resolves a channel's optional presence schema. */
export type ChannelPresence<TDefinition extends ChannelDefinition> = TDefinition extends {
  readonly presence: infer TPresence extends AnyStandardSchema;
}
  ? TPresence
  : undefined;

/** Resolves a channel's optional history policy. */
export type ChannelHistory<TDefinition extends ChannelDefinition> = TDefinition extends {
  readonly history: infer THistory extends HistoryOptions;
}
  ? THistory
  : undefined;

/** A channel family with normalized events and a schema for its pattern parameters. */
export interface ChannelContract<
  TPattern extends string = string,
  TParams extends AnyStandardSchema = AnyStandardSchema,
  TServer extends ServerEventMap = ServerEventMap,
  TClient extends ClientEventMap = ClientEventMap,
  TProcedures extends ProcedureMap = ProcedureMap,
  TPresence extends AnyStandardSchema | undefined = AnyStandardSchema | undefined,
  THistory extends HistoryOptions | undefined = HistoryOptions | undefined,
> extends ContractNode {
  readonly client: TClient;
  readonly history?: THistory;
  readonly kind: "channel";
  readonly paramNames: readonly string[];
  readonly params: TParams;
  readonly pattern: TPattern;
  readonly presence?: TPresence;
  readonly procedures: TProcedures;
  readonly server: TServer;
}

/** A channel contract when its exact schemas and event names are not known. */
export type AnyChannelContract = ChannelContract;

/** A nested object containing procedure and channel contracts. */
export interface ContractTree {
  readonly [name: string]: ContractNode | ContractTree;
}

/** A branded contract tree returned by `c.contract`. */
export interface AnyContract {
  readonly [contractBrand]: true;
}

/** A validated contract that retains the exact shape supplied to `c.contract`. */
export type Contract<TTree extends ContractTree = ContractTree> = TTree & AnyContract;

/** Infers the caller input accepted by one procedure contract. */
export type InferInput<TProcedure extends AnyProcedureContract> = InferSchemaInput<
  TProcedure["input"]
>;

/** Infers the validated result returned by one procedure contract. */
export type InferOutput<TProcedure extends AnyProcedureContract> = InferSchemaOutput<
  TProcedure["output"]
>;

/** Infers the input accepted by one Standard Schema validator. */
export type InferSchemaInput<TSchema extends AnyStandardSchema> =
  StandardSchemaV1.InferInput<TSchema>;

/** Infers the validated output returned by one Standard Schema validator. */
export type InferSchemaOutput<TSchema extends AnyStandardSchema> =
  StandardSchemaV1.InferOutput<TSchema>;

/** A declared application error with its code and validated data. */
export type DeclaredError<TCode extends string = string, TData = unknown> = {
  readonly code: TCode;
  readonly data: TData;
};

/** Infers the discriminated union of errors declared by one procedure. */
export type InferErrors<TProcedure extends AnyProcedureContract> = InferErrorMap<
  TProcedure["errors"]
>;

/** Infers a discriminated error union from an error schema map. */
export type InferErrorMap<TErrors extends ErrorMap> = {
  [TCode in keyof TErrors & string]: DeclaredError<TCode, InferSchemaOutput<TErrors[TCode]>>;
}[keyof TErrors & string];

/** Infers the validated parameter object for one channel contract. */
export type InferChannelParams<TChannel extends AnyChannelContract> = InferSchemaOutput<
  TChannel["params"]
>;

/** Infers one server event payload by its name. */
export type InferServerEvent<
  TChannel extends AnyChannelContract,
  TName extends keyof TChannel["server"],
> = InferSchemaOutput<TChannel["server"][TName]>;

/** Infers one client event's caller input by its name. */
export type InferClientEventInput<
  TChannel extends AnyChannelContract,
  TName extends keyof TChannel["client"],
> = InferSchemaInput<TChannel["client"][TName]["input"]>;

/** Infers one client event's declared error union by its name. */
export type InferClientEventErrors<
  TChannel extends AnyChannelContract,
  TName extends keyof TChannel["client"],
> = InferErrorMap<TChannel["client"][TName]["errors"]>;

/** Infers the validated presence state, or `never` when presence is absent. */
export type InferPresence<TChannel extends AnyChannelContract> =
  NonNullable<TChannel["presence"]> extends AnyStandardSchema
    ? InferSchemaOutput<NonNullable<TChannel["presence"]>>
    : never;

/** Fields shared by query definitions with and without declared errors. */
export interface QueryDefinitionBase<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
> {
  readonly http?: HttpProcedureOptions<"query">;
  readonly input: TInput;
  readonly output: TOutput;
  readonly transport?: QueryTransport;
}

/** A query definition with no application error codes. */
export interface QueryDefinitionWithoutErrors<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
> extends QueryDefinitionBase<TInput, TOutput> {
  readonly errors?: never;
}

/** A query definition with per-code Standard Schema error data. */
export interface QueryDefinitionWithErrors<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
  TErrors extends ErrorMap,
> extends QueryDefinitionBase<TInput, TOutput> {
  readonly errors: TErrors;
}

/** Fields shared by mutation definitions with and without declared errors. */
export interface MutationDefinitionBase<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
> {
  readonly http?: HttpProcedureOptions<"mutation">;
  readonly input: TInput;
  readonly output: TOutput;
  readonly transport?: never;
}

/** A mutation definition with no application error codes. */
export interface MutationDefinitionWithoutErrors<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
> extends MutationDefinitionBase<TInput, TOutput> {
  readonly errors?: never;
}

/** A mutation definition with per-code Standard Schema error data. */
export interface MutationDefinitionWithErrors<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
  TErrors extends ErrorMap,
> extends MutationDefinitionBase<TInput, TOutput> {
  readonly errors: TErrors;
}

interface RuntimeQueryContract {
  errors: ErrorMap;
  http?: HttpProcedureOptions<"query">;
  input: AnyStandardSchema;
  kind: "query";
  output: AnyStandardSchema;
  transport?: QueryTransport;
}

interface RuntimeMutationContract {
  errors: ErrorMap;
  http?: HttpProcedureOptions<"mutation">;
  input: AnyStandardSchema;
  kind: "mutation";
  output: AnyStandardSchema;
}

interface RuntimeChannelContract {
  client: ClientEventMap;
  history?: HistoryOptions;
  kind: "channel";
  paramNames: readonly string[];
  params: AnyStandardSchema;
  pattern: string;
  presence?: AnyStandardSchema;
  procedures: ProcedureMap;
  server: ServerEventMap;
}

/** The contract DSL exposed as `c`. */
export interface CableContractBuilder {
  /** Brands a nested tree after checking that every leaf is a cable node. */
  contract<const TTree extends ContractTree>(definition: TTree): Contract<TTree>;

  /** Declares a mutation procedure. Mutations always use batched POST transport. */
  mutation<
    TInput extends AnyStandardSchema,
    TOutput extends AnyStandardSchema,
    TErrors extends ErrorMap,
  >(
    definition: MutationDefinitionWithErrors<TInput, TOutput, TErrors>,
  ): MutationContract<TInput, TOutput, TErrors>;
  mutation<TInput extends AnyStandardSchema, TOutput extends AnyStandardSchema>(
    definition: MutationDefinitionWithoutErrors<TInput, TOutput>,
  ): MutationContract<TInput, TOutput, EmptyErrorMap>;

  /** Declares a query procedure, with optional cacheable GET transport. */
  query<
    TInput extends AnyStandardSchema,
    TOutput extends AnyStandardSchema,
    TErrors extends ErrorMap,
  >(
    definition: QueryDefinitionWithErrors<TInput, TOutput, TErrors>,
  ): QueryContract<TInput, TOutput, TErrors>;
  query<TInput extends AnyStandardSchema, TOutput extends AnyStandardSchema>(
    definition: QueryDefinitionWithoutErrors<TInput, TOutput>,
  ): QueryContract<TInput, TOutput, EmptyErrorMap>;

  /** Declares a parameterized channel and normalizes its client event forms. */
  channel<const TPattern extends string, const TDefinition extends ChannelDefinition>(
    pattern: TPattern,
    definition: TDefinition,
  ): ChannelContract<
    TPattern,
    ChannelParamsSchema<TPattern, TDefinition>,
    TDefinition["server"],
    NormalizeClientEvents<TDefinition["client"]>,
    ChannelProcedures<TDefinition>,
    ChannelPresence<TDefinition>,
    ChannelHistory<TDefinition>
  >;
}

/** Checks whether a value is a Standard Schema v1 validator. */
export function isStandardSchema(value: unknown): value is AnyStandardSchema {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  if (!("~standard" in value)) {
    return false;
  }
  const properties = value["~standard"];
  return (
    properties !== null &&
    typeof properties === "object" &&
    "version" in properties &&
    properties.version === 1 &&
    "vendor" in properties &&
    typeof properties.vendor === "string" &&
    "validate" in properties &&
    typeof properties.validate === "function"
  );
}

/** Checks whether a value is a query or mutation contract. */
export function isProcedureContract(value: unknown): value is AnyProcedureContract {
  if (!isPlainRecord(value)) {
    return false;
  }
  if (value["kind"] !== "query" && value["kind"] !== "mutation") {
    return false;
  }
  if (!(contractNodeBrand in value)) {
    return false;
  }
  if (!isStandardSchema(value["input"]) || !isStandardSchema(value["output"])) {
    return false;
  }
  if (!isErrorMap(value["errors"])) {
    return false;
  }
  if (value["kind"] === "mutation") {
    return (
      value["transport"] === undefined &&
      (value["http"] === undefined || isHttpProcedureOptions(value["http"], "mutation"))
    );
  }
  return (
    (value["transport"] === undefined || isQueryTransport(value["transport"])) &&
    (value["http"] === undefined || isHttpProcedureOptions(value["http"], "query"))
  );
}

/** Checks whether a value is a normalized channel contract. */
export function isChannelContract(value: unknown): value is AnyChannelContract {
  return (
    isPlainRecord(value) &&
    contractNodeBrand in value &&
    value["kind"] === "channel" &&
    typeof value["pattern"] === "string" &&
    isStringArray(value["paramNames"]) &&
    isStandardSchema(value["params"]) &&
    isSchemaMap(value["server"]) &&
    isClientEventMap(value["client"]) &&
    isProcedureMap(value["procedures"]) &&
    (value["presence"] === undefined || isStandardSchema(value["presence"])) &&
    (value["history"] === undefined || isHistoryOptions(value["history"]))
  );
}

/** Checks whether a value was returned by `c.contract`. */
export function isContract(value: unknown): value is AnyContract & ContractTree {
  return isPlainRecord(value) && contractBrand in value;
}

function contract<const TTree extends ContractTree>(definition: TTree): Contract<TTree> {
  assertDefinitionRecord(definition, "Contract root");
  assertContractTree(definition, new WeakSet(), [], []);
  Object.defineProperty(definition, contractBrand, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  freezeContractBranches(definition, new WeakSet());
  // SAFETY: The complete tree was checked above and the hidden brand was just installed.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The unique property now exists on this object.
  return definition as Contract<TTree>;
}

function freezeContractBranches(tree: UnparsedRecord, visited: WeakSet<object>): void {
  if (visited.has(tree)) {
    return;
  }
  visited.add(tree);
  for (const value of Object.values(tree)) {
    if (isPlainRecord(value) && !isProcedureContract(value) && !isChannelContract(value)) {
      freezeContractBranches(value, visited);
    }
  }
  Object.freeze(tree);
}

function query<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
  TErrors extends ErrorMap,
>(
  definition: QueryDefinitionWithErrors<TInput, TOutput, TErrors>,
): QueryContract<TInput, TOutput, TErrors>;
function query<TInput extends AnyStandardSchema, TOutput extends AnyStandardSchema>(
  definition: QueryDefinitionWithoutErrors<TInput, TOutput>,
): QueryContract<TInput, TOutput, EmptyErrorMap>;
function query(
  definition: QueryDefinitionBase<AnyStandardSchema, AnyStandardSchema> & {
    readonly errors?: ErrorMap;
  },
): QueryContract {
  assertDefinitionRecord(definition, "Query definition");
  assertAllowedKeys(
    definition,
    ["errors", "http", "input", "output", "transport"],
    "Query definition",
  );
  assertSchema(definition.input, "Query input");
  assertSchema(definition.output, "Query output");
  const errors = definition.errors ?? emptyErrors;
  assertErrorMap(errors, "Query errors");
  if (definition.transport !== undefined && !isQueryTransport(definition.transport)) {
    throw new TypeError("Query transport must use method 'GET' and an optional string cache value");
  }
  const result: RuntimeQueryContract = {
    errors,
    input: definition.input,
    kind: "query",
    output: definition.output,
  };
  if (definition.transport !== undefined) {
    result.transport = Object.freeze({ ...definition.transport });
  }
  if (definition.http !== undefined) {
    result.http = freezeHttpOptions(definition.http, "query");
  }
  return Object.freeze(brandContractNode(result));
}

function mutation<
  TInput extends AnyStandardSchema,
  TOutput extends AnyStandardSchema,
  TErrors extends ErrorMap,
>(
  definition: MutationDefinitionWithErrors<TInput, TOutput, TErrors>,
): MutationContract<TInput, TOutput, TErrors>;
function mutation<TInput extends AnyStandardSchema, TOutput extends AnyStandardSchema>(
  definition: MutationDefinitionWithoutErrors<TInput, TOutput>,
): MutationContract<TInput, TOutput, EmptyErrorMap>;
function mutation(
  definition: MutationDefinitionBase<AnyStandardSchema, AnyStandardSchema> & {
    readonly errors?: ErrorMap;
  },
): MutationContract {
  assertDefinitionRecord(definition, "Mutation definition");
  assertAllowedKeys(definition, ["errors", "http", "input", "output"], "Mutation definition");
  assertSchema(definition.input, "Mutation input");
  assertSchema(definition.output, "Mutation output");
  const errors = definition.errors ?? emptyErrors;
  assertErrorMap(errors, "Mutation errors");
  const result: RuntimeMutationContract = {
    errors,
    input: definition.input,
    kind: "mutation",
    output: definition.output,
  };
  if (definition.http !== undefined) {
    result.http = freezeHttpOptions(definition.http, "mutation");
  }
  return Object.freeze(brandContractNode(result));
}

function channel<const TPattern extends string, const TDefinition extends ChannelDefinition>(
  pattern: TPattern,
  definition: TDefinition,
): ChannelContract<
  TPattern,
  ChannelParamsSchema<TPattern, TDefinition>,
  TDefinition["server"],
  NormalizeClientEvents<TDefinition["client"]>,
  ChannelProcedures<TDefinition>,
  ChannelPresence<TDefinition>,
  ChannelHistory<TDefinition>
>;
function channel(pattern: string, definition: ChannelDefinition): AnyChannelContract {
  assertDefinitionRecord(definition, "Channel definition");
  assertAllowedKeys(
    definition,
    ["client", "history", "params", "presence", "procedures", "server"],
    "Channel definition",
  );
  const paramNames = parsePattern(pattern);
  const params = definition.params ?? createPatternParamsSchema(pattern, paramNames);
  assertSchema(params, "Channel params");
  assertSchemaMap(definition.server, "Channel server events");
  const client = normalizeClientEvents(definition.client);
  const procedures = definition.procedures ?? emptyProcedures;
  assertProcedureMap(procedures, "Channel procedures");
  assertChannelMemberNames(definition.server, "server event", new Set(["reset"]));
  assertChannelMemberNames(client, "client event", reservedChannelMembers);
  assertChannelMemberNames(procedures, "procedure", reservedChannelMembers);
  const duplicateMember = Object.keys(client).find((name) => Object.hasOwn(procedures, name));
  if (duplicateMember !== undefined) {
    throw new TypeError(
      `Channel member '${duplicateMember}' cannot be both a client event and a procedure`,
    );
  }
  if (definition.presence !== undefined) {
    assertSchema(definition.presence, "Channel presence");
  }
  if (definition.history !== undefined && !isHistoryOptions(definition.history)) {
    throw new TypeError("Channel history requires a positive integer max and retain duration");
  }
  const result: RuntimeChannelContract = {
    client,
    kind: "channel",
    paramNames,
    params,
    pattern,
    procedures,
    server: definition.server,
  };
  if (definition.history !== undefined) {
    result.history = Object.freeze({ ...definition.history });
  }
  if (definition.presence !== undefined) {
    result.presence = definition.presence;
  }
  return Object.freeze(brandContractNode(result));
}

/** The contract builder for procedures, channels, and nested contract trees. */
export const c: CableContractBuilder = Object.freeze({ channel, contract, mutation, query });

function brandContractNode<TNode extends object>(node: TNode): TNode & ContractNode {
  Object.defineProperty(node, contractNodeBrand, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  // SAFETY: The hidden node brand was installed immediately above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The unique property now exists on this object.
  return node as TNode & ContractNode;
}

interface UnparsedRecord {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Guards parse every value before domain use.
  readonly [key: string]: unknown;
}

function isPlainRecord(value: unknown): value is UnparsedRecord {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}

function isStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every(isString);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// oxlint-disable-next-line anti-slop/no-object-parameters -- This definition guard only checks the prototype.
function assertDefinitionRecord(value: object, label: string): void {
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function assertAllowedKeys(
  // oxlint-disable-next-line anti-slop/no-object-parameters -- This definition guard only checks own key names.
  value: object,
  allowed: readonly string[],
  label: string,
): void {
  const invalid = Object.keys(value).find((key) => !allowed.includes(key));
  if (invalid !== undefined) {
    throw new TypeError(`${label} has unknown key '${invalid}'`);
  }
}

function assertSchema(value: unknown, label: string): asserts value is AnyStandardSchema {
  if (!isStandardSchema(value)) {
    throw new TypeError(`${label} must implement Standard Schema v1`);
  }
}

function isSchemaMap(value: unknown): value is ServerEventMap {
  if (!isPlainRecord(value)) {
    return false;
  }
  return Object.values(value).every(isStandardSchema);
}

function assertSchemaMap(value: unknown, label: string): asserts value is ServerEventMap {
  if (!isSchemaMap(value)) {
    throw new TypeError(`${label} must map event names to Standard Schema v1 validators`);
  }
}

function isErrorMap(value: unknown): value is ErrorMap {
  return isSchemaMap(value);
}

function assertErrorMap(value: unknown, label: string): asserts value is ErrorMap {
  assertSchemaMap(value, label);
}

function isQueryTransport(value: unknown): value is QueryTransport {
  if (!isPlainRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.every((key) => key === "cache" || key === "method") &&
    value["method"] === "GET" &&
    (value["cache"] === undefined || typeof value["cache"] === "string")
  );
}

function isHttpProcedureOptions(
  value: unknown,
  kind: ProcedureKind,
): value is HttpProcedureOptions {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    !keys.every((key) =>
      ["method", "operationId", "path", "security", "successStatus", "summary", "tags"].includes(
        key,
      ),
    )
  ) {
    return false;
  }
  if (typeof value["path"] !== "string" || !isHttpPath(value["path"])) return false;
  if (kind === "query" ? value["method"] !== "GET" : !isMutationHttpMethod(value["method"])) {
    return false;
  }
  if (value["operationId"] !== undefined && !isNonEmptyString(value["operationId"])) return false;
  if (value["summary"] !== undefined && !isNonEmptyString(value["summary"])) return false;
  if (value["successStatus"] !== undefined && !isHttpSuccessStatus(value["successStatus"])) {
    return false;
  }
  if (value["tags"] !== undefined && !isStringArray(value["tags"])) return false;
  return value["security"] === undefined || isHttpSecurityRequirements(value["security"]);
}

function freezeHttpOptions<TKind extends ProcedureKind>(
  value: HttpProcedureOptions<TKind>,
  kind: TKind,
): HttpProcedureOptions<TKind> {
  assertHttpProcedureOptions(value, kind);
  const result: MutableHttpProcedureOptions<TKind> = { method: value.method, path: value.path };
  if (value.operationId !== undefined) result.operationId = value.operationId;
  if (value.summary !== undefined) result.summary = value.summary;
  if (value.successStatus !== undefined) result.successStatus = value.successStatus;
  if (value.tags !== undefined) result.tags = Object.freeze([...value.tags]);
  if (value.security !== undefined) {
    result.security = Object.freeze(
      value.security.map((requirement) => Object.freeze({ ...requirement })),
    );
  }
  return Object.freeze(result);
}

function assertHttpProcedureOptions<TKind extends ProcedureKind>(
  value: HttpProcedureOptions<TKind>,
  kind: TKind,
): void {
  assertDefinitionRecord(value, "Procedure HTTP metadata");
  assertAllowedKeys(
    value,
    ["method", "operationId", "path", "security", "successStatus", "summary", "tags"],
    "Procedure HTTP metadata",
  );
  if (!isHttpPath(value.path)) {
    throw new TypeError("Procedure HTTP path must be an absolute path with valid segments");
  }
  if (kind === "query" && value.method !== "GET") {
    throw new TypeError("Query HTTP method must be GET");
  }
  if (kind === "mutation" && !isMutationHttpMethod(value.method)) {
    throw new TypeError("Mutation HTTP method must be POST, PUT, PATCH, or DELETE");
  }
  if (value.successStatus !== undefined && !isHttpSuccessStatus(value.successStatus)) {
    throw new TypeError("HTTP successStatus must be 200, 201, or 202");
  }
  if (value.operationId !== undefined && !isNonEmptyString(value.operationId)) {
    throw new TypeError("HTTP operationId must be a non-empty string");
  }
  if (value.summary !== undefined && !isNonEmptyString(value.summary)) {
    throw new TypeError("HTTP summary must be a non-empty string");
  }
  if (value.tags !== undefined && !isStringArray(value.tags)) {
    throw new TypeError("HTTP tags must be strings");
  }
  if (value.security !== undefined && !isHttpSecurityRequirements(value.security)) {
    throw new TypeError("HTTP security requirements must map scheme names to string arrays");
  }
}

interface MutableHttpProcedureOptions<TKind extends ProcedureKind> {
  method: HttpProcedureOptions<TKind>["method"];
  operationId?: string;
  path: string;
  security?: readonly HttpSecurityRequirement[];
  successStatus?: HttpSuccessStatus;
  summary?: string;
  tags?: readonly string[];
}

function isHttpPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) return false;
  return value.split("/").every((segment, index) => {
    if (index === 0) return true;
    return (
      segment.length > 0 &&
      ((!segment.includes("{") && !segment.includes("}")) ||
        /^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(segment))
    );
  });
}

function isMutationHttpMethod(value: unknown): value is Exclude<HttpMethod, "GET"> {
  return value === "DELETE" || value === "PATCH" || value === "POST" || value === "PUT";
}

function isHttpSuccessStatus(value: unknown): value is HttpSuccessStatus {
  return value === 200 || value === 201 || value === 202;
}

function isHttpSecurityRequirements(value: unknown): value is readonly HttpSecurityRequirement[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (requirement) =>
      isPlainRecord(requirement) &&
      Object.keys(requirement).length > 0 &&
      Object.values(requirement).every(isStringArray),
  );
}

function isHistoryOptions(value: unknown): value is HistoryOptions {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    Object.keys(value).every((key) => key === "max" || key === "retain") &&
    typeof value["max"] === "number" &&
    Number.isSafeInteger(value["max"]) &&
    value["max"] > 0 &&
    typeof value["retain"] === "string" &&
    /^[1-9]\d*[dhms]$/.test(value["retain"])
  );
}

function isClientEventMap(value: unknown): value is ClientEventMap {
  if (!isPlainRecord(value)) {
    return false;
  }
  return Object.values(value).every(
    (event) =>
      isPlainRecord(event) &&
      Object.keys(event).every((key) => key === "errors" || key === "input") &&
      isStandardSchema(event["input"]) &&
      isErrorMap(event["errors"]),
  );
}

function normalizeClientEvents(events: ClientEventDefinitionMap): ClientEventMap {
  assertDefinitionRecord(events, "Channel client events");
  const normalized: Record<string, ClientEventContract> = {};
  for (const [name, definition] of Object.entries(events)) {
    if (isStandardSchema(definition)) {
      normalized[name] = Object.freeze({ errors: emptyErrors, input: definition });
      continue;
    }
    assertDefinitionRecord(definition, `Client event '${name}'`);
    assertAllowedKeys(definition, ["errors", "input"], `Client event '${name}'`);
    assertSchema(definition.input, `Client event '${name}' input`);
    const errors = definition.errors ?? emptyErrors;
    assertErrorMap(errors, `Client event '${name}' errors`);
    normalized[name] = Object.freeze({ errors, input: definition.input });
  }
  return Object.freeze(normalized);
}

function isProcedureMap(value: unknown): value is ProcedureMap {
  if (!isPlainRecord(value)) {
    return false;
  }
  return Object.values(value).every(isProcedureContract);
}

function assertProcedureMap(value: unknown, label: string): asserts value is ProcedureMap {
  if (!isProcedureMap(value)) {
    throw new TypeError(`${label} must contain only query or mutation contracts`);
  }
}

function parsePattern(pattern: string): readonly string[] {
  if (pattern.length === 0) {
    throw new TypeError("Channel pattern must not be empty");
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const segment of pattern.split(".")) {
    const name = parsePatternSegment(segment);
    if (name === undefined) continue;
    if (seen.has(name)) {
      throw new TypeError(`Duplicate parameter '${name}' in channel pattern`);
    }
    seen.add(name);
    names.push(name);
  }
  return Object.freeze(names);
}

function parsePatternSegment(segment: string): string | undefined {
  if (segment.length === 0) {
    throw new TypeError("Channel pattern must not contain empty segments");
  }
  const match = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(segment);
  if (match === null) {
    if (segment.includes("{") || segment.includes("}")) {
      throw new TypeError(`Invalid parameter segment '${segment}' in channel pattern`);
    }
    return undefined;
  }
  const name = match[1];
  if (name === undefined) {
    throw new TypeError(`Invalid parameter segment '${segment}' in channel pattern`);
  }
  if (reservedPropertyNames.has(name)) {
    throw new TypeError(`Channel parameter '${name}' is reserved`);
  }
  return name;
}

function createPatternParamsSchema(
  pattern: string,
  paramNames: readonly string[],
): PatternParamsSchema<string> {
  return Object.freeze({
    "~standard": Object.freeze({
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Standard Schema requires unknown boundary input.
      validate(value: unknown): StandardSchemaV1.Result<PatternParams<string>> {
        if (!isPlainRecord(value)) {
          return { issues: [{ message: `Parameters for '${pattern}' must be a plain object` }] };
        }
        const keys = Object.keys(value);
        if (keys.length !== paramNames.length || keys.some((key) => !paramNames.includes(key))) {
          return {
            issues: [{ message: `Parameters for '${pattern}' must match its pattern names` }],
          };
        }
        for (const name of paramNames) {
          if (!isString(value[name])) {
            return { issues: [{ message: `Parameter '${name}' must be a string`, path: [name] }] };
          }
        }
        return { value };
      },
      vendor: "cable",
      version: 1,
    }),
  });
}

function assertContractTree(
  tree: UnparsedRecord,
  ancestors: WeakSet<object>,
  path: readonly string[],
  channels: ChannelTreeEntry[],
): void {
  if (ancestors.has(tree)) {
    throw new TypeError(`Contract contains a cycle at '${path.join(".") || "<root>"}'`);
  }
  ancestors.add(tree);
  for (const name of Object.keys(tree)) {
    const descriptor = Object.getOwnPropertyDescriptor(tree, name);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(
        `Contract property '${[...path, name].join(".")}' must be a data property`,
      );
    }
    const value: unknown = descriptor.value;
    assertContractKey(name, path);
    if (isProcedureContract(value)) {
      continue;
    }
    if (isChannelContract(value)) {
      assertChannelPatternUnique(value.pattern, [...path, name], channels);
      channels.push({ path: [...path, name], pattern: value.pattern });
      continue;
    }
    if (!isPlainRecord(value)) {
      throw new TypeError(`Contract leaf '${[...path, name].join(".")}' is not a cable node`);
    }
    assertContractTree(value, ancestors, [...path, name], channels);
  }
  ancestors.delete(tree);
}

interface ChannelTreeEntry {
  readonly path: readonly string[];
  readonly pattern: string;
}

function assertChannelPatternUnique(
  pattern: string,
  path: readonly string[],
  channels: readonly ChannelTreeEntry[],
): void {
  const conflict = channels.find((candidate) => channelPatternsOverlap(candidate.pattern, pattern));
  if (conflict !== undefined) {
    throw new TypeError(
      `Channel pattern '${pattern}' at '${path.join(".")}' overlaps '${conflict.pattern}' at '${conflict.path.join(".")}'`,
    );
  }
}

function channelPatternsOverlap(left: string, right: string): boolean {
  const leftSegments = left.split(".");
  const rightSegments = right.split(".");
  if (leftSegments.length !== rightSegments.length) {
    return false;
  }
  return leftSegments.every((leftSegment, index) => {
    const rightSegment = rightSegments[index];
    if (rightSegment === undefined) {
      return false;
    }
    return (
      isParameterSegment(leftSegment) ||
      isParameterSegment(rightSegment) ||
      leftSegment === rightSegment
    );
  });
}

function isParameterSegment(segment: string): boolean {
  return /^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(segment);
}

type ChannelMembers = ClientEventMap | ProcedureMap | ServerEventMap;

function assertChannelMemberNames(
  members: ChannelMembers,
  kind: string,
  reserved: ReadonlySet<string>,
): void {
  const invalid = Object.keys(members).find((name) => reserved.has(name));
  if (invalid !== undefined) {
    throw new TypeError(`Channel ${kind} name '${invalid}' is reserved`);
  }
}

function assertContractKey(name: string, path: readonly string[]): void {
  if (name.length === 0 || name.includes(".") || name.includes("/")) {
    throw new TypeError(`Contract key '${[...path, name].join(".")}' contains a path separator`);
  }
  if (reservedPropertyNames.has(name)) {
    throw new TypeError(`Contract key '${[...path, name].join(".")}' is reserved`);
  }
}

import {
  isChannelContract,
  isProcedureContract,
  type AnyChannelContract,
  type AnyProcedureContract,
  type AnyStandardSchema,
  type Contract,
  type ContractTree,
  type InferErrors,
  type InferInput,
  type InferOutput,
  type InferSchemaInput,
  type InferSchemaOutput,
} from "@cable/contract";

import { BUILTIN_CODES, CableError, isCableError, type BuiltinCode } from "./errors.js";
import {
  assertJsonData,
  type RpcCall,
  type RpcResult,
  type RpcRuntime,
  type RpcSuccess,
  type WireError,
} from "./rpc.js";
import { validate } from "./validation.js";

/** A value returned directly or after asynchronous work. */
export type MaybePromise<TValue> = Promise<TValue> | TValue;

/** Convert one declared error descriptor into its throwable Cable error. */
export type CableErrorForDeclaration<TError> = TError extends {
  readonly code: infer TCode extends string;
  readonly data: infer TData;
}
  ? CableError<TCode, TData> & { readonly data: TData }
  : never;

/** The union of built-in failures observable from every procedure. */
export type BuiltinProcedureError = {
  readonly [TCode in BuiltinCode]: CableError<TCode>;
}[BuiltinCode];

/** The declared and transport failures observable for one procedure. */
export type ProcedureError<TProcedure extends AnyProcedureContract> =
  | BuiltinProcedureError
  | CableErrorForDeclaration<InferErrors<TProcedure>>;

/** Options passed to one implemented procedure. */
export interface ProcedureHandlerOptions<
  TProcedure extends AnyProcedureContract,
  TContext extends object,
> {
  readonly ctx: TContext;
  readonly input: InferSchemaOutput<TProcedure["input"]>;
}

/** A server implementation for one contract procedure. */
export type ProcedureHandler<
  TProcedure extends AnyProcedureContract,
  TContext extends object,
  TValidateOutput extends boolean = true,
> = (
  options: ProcedureHandlerOptions<TProcedure, TContext>,
) => MaybePromise<
  TValidateOutput extends true
    ? InferSchemaInput<TProcedure["output"]>
    : InferSchemaOutput<TProcedure["output"]>
>;

declare const resolvedProcedureBrand: unique symbol;

/** One handler resolved through a context-specific procedure resolver. */
export interface ResolvedProcedure<
  TProcedure extends AnyProcedureContract,
  TInitialContext extends object,
  TValidateOutput extends boolean = true,
> {
  readonly [resolvedProcedureBrand]: (
    context: TInitialContext,
  ) => readonly [TProcedure, TValidateOutput];
}

/** Resolve one explicit global procedure leaf with a captured middleware chain. */
export interface ProcedureResolver<
  TInitialContext extends object,
  TContext extends object,
  TValidateOutput extends boolean = true,
> {
  <TProcedure extends AnyProcedureContract>(
    contract: TProcedure,
    handler: ProcedureHandler<TProcedure, TContext, TValidateOutput>,
  ): ResolvedProcedure<TProcedure, TInitialContext, TValidateOutput>;
  use<TMiddleware extends Middleware<TContext>>(
    middleware: TMiddleware,
  ): ProcedureResolver<TInitialContext, MiddlewareContext<TMiddleware>, TValidateOutput>;
}

/** The complete global-procedure implementation corresponding to a contract tree. */
export type ProcedureImplementations<
  TTree,
  TInitialContext extends object,
  TContext extends object,
  TValidateOutput extends boolean = true,
> = {
  readonly [
    TKey in keyof TTree as TTree[TKey] extends AnyChannelContract ? never : TKey
  ]: TTree[TKey] extends AnyProcedureContract
    ?
        | ProcedureHandler<TTree[TKey], TContext, TValidateOutput>
        | ResolvedProcedure<TTree[TKey], TInitialContext, TValidateOutput>
    : TTree[TKey] extends object
      ? ProcedureImplementations<TTree[TKey], TInitialContext, TContext, TValidateOutput>
      : never;
};

/** The server caller function for one procedure node. */
export type ProcedureCallerFunction<TProcedure extends AnyProcedureContract> = [undefined] extends [
  InferInput<TProcedure>,
]
  ? (input?: InferInput<TProcedure>) => Promise<InferOutput<TProcedure>>
  : (input: InferInput<TProcedure>) => Promise<InferOutput<TProcedure>>;

/** A server-side caller corresponding to the global procedures in a contract. */
export type ProcedureCaller<TTree> = {
  readonly [
    TKey in keyof TTree as TTree[TKey] extends AnyChannelContract ? never : TKey
  ]: TTree[TKey] extends AnyProcedureContract
    ? ProcedureCallerFunction<TTree[TKey]>
    : TTree[TKey] extends object
      ? ProcedureCaller<TTree[TKey]>
      : never;
};

/** The result threaded through middleware after `next` is called. */
declare const middlewareContext: unique symbol;

/** The handler result threaded through middleware after `next` is called. */
export interface MiddlewareResult<TContext extends object> {
  readonly data: RpcSuccess["data"];
  readonly [middlewareContext]?: TContext;
}

/** Middleware that replaces or extends the context available downstream. */
export interface MiddlewareNext {
  <TNextContext extends object>(options: {
    readonly ctx: TNextContext;
  }): Promise<MiddlewareResult<TNextContext>>;
}

/** A procedure middleware that can replace or extend the downstream context. */
export type Middleware<TContextIn extends object> = (options: {
  readonly ctx: TContextIn;
  readonly next: MiddlewareNext;
}) => Promise<MiddlewareResult<object>>;

/** Infer the context a middleware passes to its downstream `next` call. */
export type MiddlewareContext<TMiddleware> = TMiddleware extends (
  options: never,
) => Promise<MiddlewareResult<infer TContext>>
  ? TContext
  : never;

/** Details supplied to a procedure runtime error hook. */
export interface ProcedureErrorContext<TContext extends object> {
  readonly context: TContext;
  readonly error: unknown;
  readonly input: RpcCall["input"];
  readonly path: string;
}

/** Runtime behavior for procedure validation and failures. */
export interface ProcedureOptions<TContext extends object> {
  /** Observe procedure failures on the server. Hook failures are ignored. */
  readonly onError?: (details: ProcedureErrorContext<TContext>) => Promise<void> | void;
}

/** Validation options fixed when a contract implementation begins. */
export interface ImplementOptions<TValidateOutput extends boolean = boolean> {
  /** Validate handler output before returning it. Defaults to `true`. */
  readonly validateOutput?: TValidateOutput;
}

/** An executable, transport-independent set of global procedures. */
export interface ImplementedProcedures<
  TTree,
  TInitialContext extends object,
> extends RpcRuntime<TInitialContext> {
  /** Create a typed server-side caller bound to one request context. */
  caller(context: TInitialContext): ProcedureCaller<TTree>;
}

/** A contract implementation awaiting its request context type. */
export interface ImplementBuilder<TTree, TValidateOutput extends boolean = true> {
  /** Set the context supplied by an adapter for each request. */
  context<TContext extends object>(): ProcedureBuilder<TTree, TContext, TContext, TValidateOutput>;
}

/** A contract implementation with middleware and handler context types. */
export interface ProcedureBuilder<
  TTree,
  TInitialContext extends object,
  TContext extends object,
  TValidateOutput extends boolean = true,
> {
  /** Resolve one explicit contract leaf with this builder's middleware chain. */
  readonly procedure: ProcedureResolver<TInitialContext, TContext, TValidateOutput>;
  /** Add middleware and use the context it passes to `next` downstream. */
  use<TMiddleware extends Middleware<TContext>>(
    middleware: TMiddleware,
  ): ProcedureBuilder<TTree, TInitialContext, MiddlewareContext<TMiddleware>, TValidateOutput>;

  /** Supply every global procedure handler and create an executable runtime. */
  procedures(
    handlers: ProcedureImplementations<TTree, TInitialContext, TContext, TValidateOutput>,
    options?: ProcedureOptions<TInitialContext>,
  ): ImplementedProcedures<TTree, TInitialContext>;
}

interface RuntimeMiddleware {
  run(options: {
    readonly ctx: RuntimeContext;
    readonly next: (options: {
      readonly ctx: RuntimeContext;
    }) => Promise<MiddlewareResult<RuntimeContext>>;
  }): Promise<MiddlewareResult<RuntimeContext>>;
}

interface RuntimeProcedure {
  readonly contract: AnyProcedureContract;
  readonly handler: ProcedureHandler<AnyProcedureContract, RuntimeContext>;
  readonly middleware: readonly RuntimeMiddleware[];
}

interface ResolvedProcedureData {
  readonly contract: AnyProcedureContract;
  readonly handler: ProcedureHandler<AnyProcedureContract, RuntimeContext>;
  readonly middleware: readonly RuntimeMiddleware[];
}

interface RuntimeContext {
  readonly __runtimeContext?: never;
}

interface MutableWireError {
  code: string;
  data?: unknown;
  message?: string;
  status: number;
}

interface MutableCableErrorOptions {
  data?: RpcCall["input"];
  message?: string;
  status: number;
}

type RuntimeCaller = (input?: RpcCall["input"]) => Promise<RpcSuccess["data"]>;

interface CallerTree {
  [key: string]: CallerTree | RuntimeCaller;
}

const BUILTIN_CODE_SET: ReadonlySet<string> = new Set(BUILTIN_CODES);
const resolvedProcedureData = new WeakMap<object, ResolvedProcedureData>();

/** Begin implementing the global procedures with output validation enabled. */
export function implement<TTree extends ContractTree>(
  contract: Contract<TTree>,
): ImplementBuilder<TTree>;
/** Begin implementing procedures and configure whether handlers return raw or parsed output. */
export function implement<TTree extends ContractTree>(
  contract: Contract<TTree>,
  options: ImplementOptions<true>,
): ImplementBuilder<TTree>;
export function implement<TTree extends ContractTree>(
  contract: Contract<TTree>,
  options: ImplementOptions<false>,
): ImplementBuilder<TTree, false>;
export function implement<TTree extends ContractTree>(
  contract: Contract<TTree>,
  options: ImplementOptions = {},
): ImplementBuilder<TTree, boolean> {
  return {
    context<TContext extends object>(): ProcedureBuilder<TTree, TContext, TContext, boolean> {
      return createBuilder(contract, options, []);
    },
  };
}

function createBuilder<
  TTree extends ContractTree,
  TInitialContext extends object,
  TContext extends object,
  TValidateOutput extends boolean,
>(
  contract: Contract<TTree>,
  implementOptions: ImplementOptions<TValidateOutput>,
  middleware: readonly RuntimeMiddleware[],
): ProcedureBuilder<TTree, TInitialContext, TContext, TValidateOutput> {
  return {
    procedure: createResolver(middleware),
    procedures(
      handlers: ProcedureImplementations<TTree, TInitialContext, TContext, TValidateOutput>,
      options: ProcedureOptions<TInitialContext> = {},
    ): ImplementedProcedures<TTree, TInitialContext> {
      return createProcedures(
        contract,
        handlers,
        middleware,
        implementOptions.validateOutput ?? true,
        options,
      );
    },
    use<TMiddleware extends Middleware<TContext>>(
      nextMiddleware: TMiddleware,
    ): ProcedureBuilder<TTree, TInitialContext, MiddlewareContext<TMiddleware>, TValidateOutput> {
      const erasedMiddleware = eraseMiddleware(nextMiddleware);
      return createBuilder(contract, implementOptions, [...middleware, erasedMiddleware]);
    },
  };
}

function createProcedures<
  TTree extends ContractTree,
  TInitialContext extends object,
  THandlerContext extends object,
  TValidateOutput extends boolean,
>(
  contract: Contract<TTree>,
  handlers: ProcedureImplementations<TTree, TInitialContext, THandlerContext, TValidateOutput>,
  middleware: readonly RuntimeMiddleware[],
  validateOutput: boolean,
  options: ProcedureOptions<TInitialContext>,
): ImplementedProcedures<TTree, TInitialContext> {
  const registry = new Map<string, RuntimeProcedure>();
  collectProcedures(contract, handlers, [], registry, middleware);

  const runtime: ImplementedProcedures<TTree, TInitialContext> = {
    caller(context: TInitialContext): ProcedureCaller<TTree> {
      const caller = createCallerTree(contract, [], context, runtime);
      // SAFETY: createCallerTree walks the same branded contract and omits channel
      // nodes, so its functions have the exact paths represented by ProcedureCaller.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated tree construction establishes every caller key and function.
      return caller as ProcedureCaller<TTree>;
    },
    async execute(call: RpcCall, context: TInitialContext): Promise<RpcResult> {
      const procedure = registry.get(call.path);
      if (procedure === undefined) {
        return failure(call.id, {
          code: "NOT_FOUND",
          message: "Procedure not found",
          status: 404,
        });
      }

      let input: RpcCall["input"];
      try {
        assertJsonData(call.input, "BAD_REQUEST");
        input = await validate(procedure.contract.input, call.input);
      } catch (error) {
        await reportError(options.onError, { context, error, input: call.input, path: call.path });
        return failure(call.id, errorToWire(error));
      }

      try {
        const result = await invokeMiddleware(procedure.middleware, 0, context, procedure, input);
        if (!validateOutput) {
          assertJsonData(result.data, "INTERNAL");
          return { data: result.data, id: call.id, ok: true };
        }

        try {
          const output = await validate(procedure.contract.output, result.data);
          assertJsonData(output, "INTERNAL");
          return { data: output, id: call.id, ok: true };
        } catch (error) {
          await reportError(options.onError, {
            context,
            error,
            input: call.input,
            path: call.path,
          });
          return failure(call.id, internalWireError());
        }
      } catch (error) {
        await reportError(options.onError, { context, error, input: call.input, path: call.path });
        return failure(call.id, await handlerErrorToWire(error, procedure.contract.errors));
      }
    },
    transport(path: string): { readonly cache?: string; readonly method: "GET" } | undefined {
      return registry.get(path)?.contract.transport;
    },
  };
  return runtime;
}

function createResolver<
  TInitialContext extends object,
  TContext extends object,
  TValidateOutput extends boolean,
>(
  middleware: readonly RuntimeMiddleware[],
): ProcedureResolver<TInitialContext, TContext, TValidateOutput> {
  const resolve = <TProcedure extends AnyProcedureContract>(
    contract: TProcedure,
    handler: ProcedureHandler<TProcedure, TContext, TValidateOutput>,
  ): ResolvedProcedure<TProcedure, TInitialContext, TValidateOutput> => {
    // SAFETY: Resolver construction fixes this wrapper's initial context type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The opaque wrapper carries only its context brand in public declarations.
    const resolved = {} as ResolvedProcedure<TProcedure, TInitialContext, TValidateOutput>;
    resolvedProcedureData.set(resolved, {
      contract,
      handler: eraseResolvedHandler(handler),
      middleware,
    });
    return resolved;
  };
  return Object.assign(resolve, {
    use<TMiddleware extends Middleware<TContext>>(
      nextMiddleware: TMiddleware,
    ): ProcedureResolver<TInitialContext, MiddlewareContext<TMiddleware>, TValidateOutput> {
      return createResolver([...middleware, eraseMiddleware(nextMiddleware)]);
    },
  });
}

async function invokeMiddleware(
  middleware: readonly RuntimeMiddleware[],
  index: number,
  context: RuntimeContext,
  procedure: RuntimeProcedure,
  input: RpcCall["input"],
): Promise<MiddlewareResult<RuntimeContext>> {
  const current = middleware[index];
  if (current === undefined) {
    const data = await procedure.handler({ ctx: context, input });
    return { data };
  }
  let calledNext = false;
  return current.run({
    ctx: context,
    next: async ({ ctx }): Promise<MiddlewareResult<RuntimeContext>> => {
      if (calledNext) {
        throw new CableError("INTERNAL", { message: "Middleware called next more than once" });
      }
      calledNext = true;
      return invokeMiddleware(middleware, index + 1, ctx, procedure, input);
    },
  });
}

function collectProcedures(
  contractNode: ContractTree,
  // oxlint-disable-next-line anti-slop/no-object-parameters -- Handler keys are validated against the owning ContractTree before use.
  handlerNode: object,
  path: readonly string[],
  registry: Map<string, RuntimeProcedure>,
  middleware: readonly RuntimeMiddleware[],
): void {
  for (const [key, node] of Object.entries(contractNode)) {
    if (isChannelContract(node)) continue;
    const nextPath = [...path, key];
    const handler = readProperty(handlerNode, key);
    if (isProcedureContract(node)) {
      collectProcedure(node, handler, nextPath, registry, middleware);
      continue;
    }
    if (isRecordNode(node)) collectProcedureGroup(node, handler, nextPath, registry, middleware);
  }
}

function collectProcedure(
  contract: AnyProcedureContract,
  handler: RpcCall["input"],
  path: readonly string[],
  registry: Map<string, RuntimeProcedure>,
  middleware: readonly RuntimeMiddleware[],
): void {
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- readProperty is the dynamic handler-tree boundary and this guard establishes the procedure domain.
  if (!isProcedureHandler(handler) && !isResolvedProcedure(handler)) {
    throw new CableError("INTERNAL", {
      message: `Missing procedure implementation: ${path.join(".")}`,
    });
  }
  const resolved = resolvedProcedureData.get(handler);
  if (resolved !== undefined && resolved.contract !== contract) {
    throw new CableError("INTERNAL", {
      message: `Procedure resolver contract does not match ${path.join(".")}`,
    });
  }
  registry.set(path.join("."), {
    contract,
    handler: resolvedProcedureHandler(handler, resolved, path),
    middleware: resolved === undefined ? middleware : resolved.middleware,
  });
}

function resolvedProcedureHandler(
  handler: RpcCall["input"],
  resolved: ResolvedProcedureData | undefined,
  path: readonly string[],
): ProcedureHandler<AnyProcedureContract, RuntimeContext> {
  if (resolved !== undefined) return resolved.handler;
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- collectProcedure validates this dynamic handler-tree boundary before execution.
  if (isProcedureHandler(handler)) return handler;
  throw new CableError("INTERNAL", { message: `Invalid resolved procedure ${path.join(".")}` });
}

function collectProcedureGroup(
  contract: ContractTree,
  handler: RpcCall["input"],
  path: readonly string[],
  registry: Map<string, RuntimeProcedure>,
  middleware: readonly RuntimeMiddleware[],
): void {
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- readProperty is the dynamic handler-tree boundary and this guard establishes the branch domain.
  if (!isRecordNode(handler)) {
    throw new CableError("INTERNAL", { message: `Missing procedure group: ${path.join(".")}` });
  }
  collectProcedures(contract, handler, path, registry, middleware);
}

function eraseResolvedHandler<
  TProcedure extends AnyProcedureContract,
  TContext extends object,
  TValidateOutput extends boolean,
>(
  handler: ProcedureHandler<TProcedure, TContext, TValidateOutput>,
): ProcedureHandler<AnyProcedureContract, RuntimeContext> {
  // SAFETY: `collectProcedures` checks the captured contract identity before this
  // erased handler is invoked, and its resolver middleware reconstructs TContext.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- The shared executor erases leaf-specific handler evidence only after identity validation.
  return handler as unknown as ProcedureHandler<AnyProcedureContract, RuntimeContext>;
}

function createCallerTree<TContext extends object>(
  contractNode: ContractTree,
  path: readonly string[],
  context: TContext,
  runtime: RpcRuntime<TContext>,
): CallerTree {
  // SAFETY: This null-prototype record receives only checked contract keys and
  // caller functions or recursively constructed caller records below.
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- Object.create returns any in the TypeScript standard library.
  const caller: CallerTree = Object.create(null);
  for (const [key, node] of Object.entries(contractNode)) {
    if (isChannelContract(node)) {
      continue;
    }
    const nextPath = [...path, key];
    if (isProcedureContract(node)) {
      caller[key] = async (input?: RpcCall["input"]): Promise<RpcSuccess["data"]> => {
        const result = await runtime.execute(
          { id: `caller:${nextPath.join(".")}`, input, path: nextPath.join(".") },
          context,
        );
        if (result.ok) {
          return result.data;
        }
        throw cableErrorFromWire(result.error);
      };
      continue;
    }
    if (isRecordNode(node)) {
      caller[key] = createCallerTree(node, nextPath, context, runtime);
    }
  }
  return caller;
}

async function handlerErrorToWire(
  error: ProcedureErrorContext<RuntimeContext>["error"],
  declared: Readonly<Record<string, AnyStandardSchema>>,
): Promise<WireError> {
  if (!isCableError(error)) {
    return internalWireError();
  }
  if (BUILTIN_CODE_SET.has(error.code)) {
    return error.code === "INTERNAL" ? internalWireError() : errorToWire(error);
  }
  if (!Object.hasOwn(declared, error.code)) {
    return internalWireError();
  }

  const schema = declared[error.code];
  if (schema === undefined) {
    return internalWireError();
  }
  try {
    const data = await validate(schema, error.data);
    assertJsonData(data, "INTERNAL");
    const declaredError = new CableError(error.code, {
      data,
      message: error.message,
      status: error.status,
    });
    return errorToWire(declaredError);
  } catch {
    return internalWireError();
  }
}

function errorToWire(error: ProcedureErrorContext<RuntimeContext>["error"]): WireError {
  if (!isCableError(error)) {
    return internalWireError();
  }
  const wire: MutableWireError = {
    code: error.code,
    message: error.code === "INTERNAL" ? "Internal server error" : error.message,
    status: error.status,
  };
  if (error.data !== undefined) {
    wire.data = error.data;
  }
  return wire;
}

function internalWireError(): WireError {
  return { code: "INTERNAL", message: "Internal server error", status: 500 };
}

function failure(id: string, error: WireError): RpcResult {
  return { error, id, ok: false };
}

function cableErrorFromWire(error: WireError): CableError<string> {
  const options: MutableCableErrorOptions = { status: error.status };
  if (error.data !== undefined) {
    options.data = error.data;
  }
  if (error.message !== undefined) {
    options.message = error.message;
  }
  return new CableError(error.code, options);
}

function eraseMiddleware<TContext extends object>(
  middleware: Middleware<TContext>,
): RuntimeMiddleware {
  return {
    async run({ ctx, next }): Promise<MiddlewareResult<RuntimeContext>> {
      // SAFETY: Builder order guarantees this is the output context type of the
      // preceding middleware, or the initial adapter context for the first one.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- middleware composition establishes this context transition.
      const typedContext = ctx as TContext;
      return middleware({
        ctx: typedContext,
        next: async <TNextContext extends object>({
          ctx: nextContext,
        }: {
          readonly ctx: TNextContext;
        }): Promise<MiddlewareResult<TNextContext>> => {
          const result = await next({ ctx: nextContext });
          return { data: result.data };
        },
      });
    },
  };
}

async function reportError<TContext extends object>(
  hook: ProcedureOptions<TContext>["onError"],
  details: ProcedureErrorContext<TContext>,
): Promise<void> {
  if (hook === undefined) {
    return;
  }
  try {
    await hook(details);
  } catch {
    return;
  }
}

// oxlint-disable-next-line anti-slop/no-object-parameters -- This is the handler-tree trust boundary; the caller checks the returned domain kind.
function readProperty(value: object, key: string): RpcCall["input"] {
  // SAFETY: This reads one own property from a handler tree supplied by the user;
  // collectProcedures validates the property's domain shape before using it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Own-property access is followed by a procedure or branch guard.
  const record = value as { readonly [property: string]: RpcCall["input"] };
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function isRecordNode(value: unknown): value is ContractTree & RuntimeContext {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProcedureHandler(
  value: unknown,
): value is ProcedureHandler<AnyProcedureContract, object> {
  return typeof value === "function";
}

function isResolvedProcedure(
  value: RpcCall["input"],
): value is ResolvedProcedure<AnyProcedureContract, object> {
  return (
    // oxlint-disable-next-line anti-slop/no-known-value-widening -- RPC data is the shared dynamic procedure-tree boundary.
    isRecordNode(value) && resolvedProcedureData.has(value)
  );
}

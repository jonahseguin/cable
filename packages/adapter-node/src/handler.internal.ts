import type { IncomingMessage, ServerResponse } from "node:http";
import { STATUS_CODES } from "node:http";
import { Readable, type Duplex } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { ContractTree } from "@cablejs/contract";
import {
  createEdgeHandler,
  type EdgeContract,
  type EdgeHosts,
  type EdgeHandlerOptions,
  type EdgePrincipal,
  type EdgeHostTransport,
  type GrantSecret,
  type ImplementedProcedures,
} from "@cablejs/core";
import { WebSocketServer } from "ws";

import type { NodeRuntime, NodeHandlerHost, NodePreparedUpgrade } from "./runtime.js";

const nodeRequestCleanup = new WeakMap<Request, () => void>();

/** Node values retained only for one native WebSocket upgrade. */
export interface NodeUpgradeExecution {
  readonly head: Buffer;
  readonly request: IncomingMessage;
  readonly socket: Duplex;
}

export type NodeExecution = NodeUpgradeExecution | undefined;
// oxlint-disable-next-line typescript/no-invalid-void-type -- Native Node WebSocket acceptance has no fetch response.
export type NodeUpgrade = void;

/** Public HTTP and WebSocket callbacks owned by one Node Cable handler. */
export interface NodeHandler<TTree extends ContractTree = ContractTree, TIdentity = unknown> {
  /** Create a trusted server-side facade for channel procedures and events. */
  hosts(input: {
    readonly env: undefined;
    readonly principal: EdgePrincipal<TIdentity>;
  }): EdgeHosts<TTree>;
  request(request: IncomingMessage, response: ServerResponse): Promise<void>;
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void>;
  shutdown(): Promise<void>;
}

/** Handler policy specialized to one environment-free Node process. */
export type NodeHandlerOptions<
  TTree extends ContractTree,
  TContext extends object,
  TIdentity,
> = Omit<
  EdgeHandlerOptions<TTree, TContext, undefined, NodeExecution, TIdentity, NodeUpgrade>,
  "grantSecret" | "hosts"
> & {
  readonly grantSecret: GrantSecret | (() => GrantSecret);
  readonly hosts: readonly NodeHandlerHost[];
};

/**
 * Build a Node handler around an existing runtime.
 *
 * Package tests use this construction seam to inspect real host capabilities.
 * It is intentionally absent from the package export map.
 */
export function createNodeHandlerWithRuntime<
  TTree extends ContractTree,
  TContext extends object,
  TIdentity,
>(
  contract: EdgeContract<TTree>,
  procedures: ImplementedProcedures<TTree, TContext>,
  options: NodeHandlerOptions<TTree, TContext, TIdentity>,
  runtime: NodeRuntime,
  grantSecret: GrantSecret,
): NodeHandler<TTree, TIdentity> {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const edge = createEdgeHandler(contract, procedures, {
    ...options,
    grantSecret: () => grantSecret,
    hosts: () =>
      options.hosts.map((host) => ({
        channel: host.channel,
        transport: createNodeHostTransport(host, runtime, webSocketServer),
      })),
  });

  return {
    hosts(input) {
      return edge.hosts(input);
    },
    async request(request, response) {
      const webRequest = nodeRequest(request, response);
      try {
        const result = await edge.fetch(webRequest, undefined, undefined);
        if (result === undefined)
          throw new Error("A Node HTTP request completed without a Response.");
        await writeResponse(response, result);
      } finally {
        nodeRequestCleanup.get(webRequest)?.();
      }
    },
    async upgrade(request, socket, head) {
      const webRequest = nodeRequest(request);
      try {
        const result = await edge.fetch(webRequest, undefined, {
          head,
          request,
          socket,
        });
        if (result !== undefined) await writeUpgradeResponse(socket, result);
      } finally {
        nodeRequestCleanup.get(webRequest)?.();
      }
    },
    async shutdown() {
      await runtime.shutdown();
      await closeWebSocketServer(webSocketServer);
    },
  };
}

/** Package-internal native transport shared by handler and conformance tests. */
export function createNodeHostTransport(
  host: NodeHandlerHost,
  runtime: NodeRuntime,
  webSocketServer: WebSocketServer,
): EdgeHostTransport<NodeExecution, NodeUpgrade> {
  return {
    limits: { maxHostKeyBytes: 1_024, maxUidCharacters: 252 },
    peer: (key, message) => runtime.peer(key, message),
    async upgrade(key, request, grant, execution) {
      if (execution === undefined) {
        throw new TypeError("Node WebSocket upgrades require request-local execution.");
      }
      const prepared = await runtime.prepareUpgrade(host, key, request, grant);
      if (isAcceptedUpgrade(prepared)) {
        await acceptWebSocket(webSocketServer, execution, runtime, prepared);
        return;
      }
      await writeUpgradeResponse(execution.socket, prepared.result.response);
    },
  };
}

function isAcceptedUpgrade(
  prepared: NodePreparedUpgrade,
): prepared is Extract<NodePreparedUpgrade, { readonly result: { readonly accept: true } }> {
  return prepared.result.accept;
}

function acceptWebSocket(
  webSocketServer: WebSocketServer,
  execution: NodeUpgradeExecution,
  runtime: NodeRuntime,
  prepared: Extract<NodePreparedUpgrade, { readonly result: { readonly accept: true } }>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      webSocketServer.handleUpgrade(
        execution.request,
        execution.socket,
        execution.head,
        (socket) => {
          try {
            runtime.attachUpgrade(prepared, socket);
            resolve();
          } catch (error) {
            socket.close(1011, "Socket setup failed");
            reject(error);
          }
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

/** Convert one Node request at the package's HTTP boundary. */
export function nodeRequest(request: IncomingMessage, response?: ServerResponse): Request {
  const abort = new AbortController();
  const onAborted = (): void => {
    abort.abort();
  };
  const onSocketClose = (): void => {
    if (response?.writableFinished === true) return;
    abort.abort();
  };
  const cleanup = (): void => {
    request.off("aborted", onAborted);
    request.socket.off("close", onSocketClose);
    if (response !== undefined) response.off("finish", cleanup);
  };
  if (request.destroyed && !request.complete) abort.abort();
  else request.once("aborted", onAborted);
  request.socket.once("close", onSocketClose);
  if (response !== undefined) response.once("finish", cleanup);
  const rememberCleanup = (webRequest: Request): Request => {
    nodeRequestCleanup.set(webRequest, cleanup);
    return webRequest;
  };
  const host = request.headers.host ?? "localhost";
  const url = new URL(request.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const method = request.method ?? "GET";
  if (method === "GET" || method === "HEAD")
    return rememberCleanup(new Request(url, { headers, method, signal: abort.signal }));
  // SAFETY: Node's `Readable.toWeb()` produces the runtime ReadableStream that
  // Node's global Request consumes. Its declaration uses Node's duplicate stream types.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Node's runtime stream matches the Request body contract.
  const body = Readable.toWeb(request) as BodyInit;
  // SAFETY: Node requires `duplex: "half"` for a streamed request body, which is omitted
  // from the DOM RequestInit declaration used by this package.
  return rememberCleanup(
    new Request(url, {
      body,
      headers,
      method,
      duplex: "half",
      signal: abort.signal,
    } as RequestInit),
  );
}

async function writeResponse(response: ServerResponse, result: Response): Promise<void> {
  response.statusCode = result.status;
  for (const [name, value] of result.headers) response.setHeader(name, value);
  if (result.body === null) {
    response.end();
    return;
  }
  // SAFETY: Node's global Response exposes the runtime stream accepted by
  // `Readable.fromWeb()`. The declarations use separate DOM and Node stream symbols.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The response body is a Node-compatible web stream.
  await pipeline(Readable.fromWeb(result.body as NodeReadableStream), response);
}

async function writeUpgradeResponse(socket: Duplex, response: Response): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  const headers = new Headers(response.headers);
  if (!headers.has("content-length")) headers.set("content-length", String(body.byteLength));
  headers.set("connection", "close");
  const reason =
    response.statusText === "" ? (STATUS_CODES[response.status] ?? "Unknown") : response.statusText;
  const lines = [`HTTP/1.1 ${response.status} ${reason}`];
  for (const [name, value] of headers) lines.push(`${name}: ${value}`);
  socket.end(Buffer.concat([Buffer.from(`${lines.join("\r\n")}\r\n\r\n`), body]));
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
  if (server.clients.size === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error: Error | undefined) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
}

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const procedureCount = 200;
const channelCount = 40;
const workload = {
  status: "active",
  procedures: Array.from({ length: procedureCount }, (_, index) => ({
    path: [
      `group${Math.floor(index / 40)}`,
      `section${Math.floor(index / 10) % 4}`,
      `procedure${index}`,
    ],
    kind: index % 2 === 0 ? "query" : "mutation",
    input: "object",
    output: "object",
    errors: ["FORBIDDEN", "RATE_LIMITED"],
  })),
  channels: Array.from({ length: channelCount }, (_, index) => ({
    pattern: `channel${index}.{roomId}`,
    serverEvents: ["created", "updated", "deleted", "typing"],
    clientEvents: ["send", "edit", "remove"],
    procedures: ["load", "moderate"],
    presence: true,
  })),
};

function indent(source: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return source
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function inlineArray(items: readonly string[]): string {
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

function procedure(index: number): string {
  const kind = index % 2 === 0 ? "query" : "mutation";
  return `procedure${index}: c.${kind}({
  input: z.object({ id: z.string(), cursor: z.number().int().optional(), marker: z.literal(${index}) }),
  output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(${index}) }),
  errors: {
    FORBIDDEN: forbiddenError,
    RATE_LIMITED: rateLimitedError,
  },
})`;
}

function procedureTree(): string {
  const groups: string[] = [];
  for (let group = 0; group < 5; group += 1) {
    const sections: string[] = [];
    for (let section = 0; section < 4; section += 1) {
      const procedures: string[] = [];
      const first = group * 40 + section * 10;
      for (let offset = 0; offset < 10; offset += 1) {
        procedures.push(`${indent(procedure(first + offset), 4)},`);
      }
      sections.push(`  section${section}: {\n${procedures.join("\n")}\n  },`);
    }
    groups.push(`group${group}: {\n${sections.join("\n")}\n},`);
  }
  return groups.join("\n");
}

function channel(index: number): string {
  return `channel${index}: c.channel("channel${index}.{roomId}", {
  server: {
    created: z.object({ channel: z.literal(${index}), id: z.string() }),
    updated: z.object({ channel: z.literal(${index}), version: z.number().int() }),
    deleted: z.object({ channel: z.literal(${index}), id: z.string() }),
    typing: z.object({ channel: z.literal(${index}), userId: z.string() }),
  },
  client: {
    send: {
      input: z.object({ text: z.string(), nonce: z.literal(${index}) }),
      errors: { MUTED: mutedError },
    },
    edit: {
      input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(${index}) }),
      errors: { CONFLICT: conflictError },
    },
    remove: {
      input: z.object({ id: z.string(), nonce: z.literal(${index}) }),
      errors: { FORBIDDEN: channelForbiddenError },
    },
  },
  procedures: {
    load: c.query({
      input: z.object({ cursor: z.number().int().optional(), channel: z.literal(${index}) }),
      output: z.object({ items: z.array(z.string()), channel: z.literal(${index}) }),
      errors: { FORBIDDEN: channelForbiddenError },
    }),
    moderate: c.mutation({
      input: z.object({ userId: z.string(), channel: z.literal(${index}) }),
      output: z.object({ removed: z.boolean(), channel: z.literal(${index}) }),
      errors: { FORBIDDEN: channelForbiddenError },
    }),
  },
  presence: z.object({ typing: z.boolean(), channel: z.literal(${index}) }),
})`;
}

function contractSource(): string {
  const channels = Array.from(
    { length: channelCount },
    (_, index) => `${indent(channel(index), 2)},`,
  ).join("\n");
  return `import { c } from "@cable/contract";
import { z } from "zod";

const forbiddenError = z.object({ resource: z.string() });
const rateLimitedError = z.object({ retryAfter: z.number().positive() });
const mutedError = z.object({ until: z.number() });
const conflictError = z.object({ version: z.number().int() });
const channelForbiddenError = z.object({ reason: z.string() });

export const api = c.contract({
${indent(procedureTree(), 2)}
  channels: {
${channels}
  },
});

export type Api = typeof api;
`;
}

function procedureExercise(index: number): string {
  const path = `api.group${Math.floor(index / 40)}.section${Math.floor(index / 10) % 4}.procedure${index}`;
  const clientPath = `client.group${Math.floor(index / 40)}.section${Math.floor(index / 10) % 4}.procedure${index}`;
  const operation = index % 2 === 0 ? "query" : "mutate";
  const options =
    index % 2 === 0
      ? `const queryKey${index} = cable.group${Math.floor(index / 40)}.section${Math.floor(index / 10) % 4}.procedure${index}.queryKey(input${index});
const queryOptions${index} = cable.group${Math.floor(index / 40)}.section${Math.floor(index / 10) % 4}.procedure${index}.queryOptions(input${index});`
      : `const mutationOptions${index} = cable.group${Math.floor(index / 40)}.section${Math.floor(index / 10) % 4}.procedure${index}.mutationOptions();`;
  return `const input${index}: InferInput<typeof ${path}> = {
  id: "item-${index}",
  cursor: ${index},
  marker: ${index},
};
const call${index}: Promise<InferOutput<typeof ${path}>> = ${clientPath}.${operation}(input${index});
const error${index}: InferErrors<typeof ${path}> = {
  code: "${index % 2 === 0 ? "FORBIDDEN" : "RATE_LIMITED"}",
  data: ${index % 2 === 0 ? `{ resource: "procedure${index}" }` : `{ retryAfter: ${index + 1} }`},
};
${options}`;
}

function channelExercise(index: number): string {
  const path = `typeof api.channels.channel${index}`;
  return `const channel${index}Params: InferChannelParams<${path}> = { roomId: "room-${index}" };
const channel${index} = client.channels.channel${index}(channel${index}Params);
export const channel${index}Status: ChannelStatus = channel${index}.status;
export const channel${index}Created = channel${index}.on("created", (event) => {
  const value: InferServerEvent<${path}, "created"> = event;
  void value;
});
export const channel${index}Updated = channel${index}.on("updated", (event) => {
  const value: InferServerEvent<${path}, "updated"> = event;
  void value;
});
export const channel${index}Deleted = channel${index}.on("deleted", (event) => {
  const value: InferServerEvent<${path}, "deleted"> = event;
  void value;
});
export const channel${index}Typing = channel${index}.on("typing", (event) => {
  const value: InferServerEvent<${path}, "typing"> = event;
  void value;
});
export const channel${index}Send: Promise<void> = channel${index}.send(
  { text: "message-${index}", nonce: ${index} },
  { ack: true },
);
channel${index}.edit({ id: "item-${index}", text: "edited-${index}", nonce: ${index} });
channel${index}.remove({ id: "item-${index}", nonce: ${index} });
export const channel${index}SendError: InferClientEventErrors<${path}, "send"> = {
  code: "MUTED",
  data: { until: ${index} },
};
export const channel${index}EditError: InferClientEventErrors<${path}, "edit"> = {
  code: "CONFLICT",
  data: { version: ${index} },
};
export const channel${index}RemoveError: InferClientEventErrors<${path}, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-${index}" },
};
export const channel${index}Load: Promise<InferOutput<${path}["procedures"]["load"]>> =
  channel${index}.load({ cursor: ${index}, channel: ${index} });
export const channel${index}LoadError: InferErrors<${path}["procedures"]["load"]> = {
  code: "FORBIDDEN",
  data: { reason: "channel-${index}" },
};
export const channel${index}Moderate: Promise<InferOutput<${path}["procedures"]["moderate"]>> =
  channel${index}.moderate({ userId: "user-${index}", channel: ${index} });
export const channel${index}ModerateError: InferErrors<${path}["procedures"]["moderate"]> = {
  code: "FORBIDDEN",
  data: { reason: "channel-${index}" },
};
channel${index}.presence.update({ typing: true, channel: ${index} });
export const channel${index}Presence: InferPresence<${path}> | undefined =
  channel${index}.presence.self;
export const channel${index}Others: readonly PresenceMember<InferPresence<${path}>>[] =
  channel${index}.presence.others;
export const channel${index}PresenceOff = channel${index}.presence.on(() => undefined);
export const channel${index}Dispose = (): void => {
  channel${index}.dispose();
};
`;
}

function edgeChannelExercise(index: number): string {
  const path = `typeof api.channels.channel${index}`;
  return `const edgeChannel${index}Params: InferChannelParams<${path}> = { roomId: "room-${index}" };
const edgeChannel${index} = hosts.channels.channel${index}(edgeChannel${index}Params);
export const edgeChannel${index}Created: Promise<number> = edgeChannel${index}.emit("created", {
  channel: ${index},
  id: "item-${index}",
});
export const edgeChannel${index}Updated: Promise<number> = edgeChannel${index}.emit("updated", {
  channel: ${index},
  version: ${index},
});
export const edgeChannel${index}Deleted: Promise<number> = edgeChannel${index}.emit("deleted", {
  channel: ${index},
  id: "item-${index}",
});
export const edgeChannel${index}Typing: Promise<number> = edgeChannel${index}.emit("typing", {
  channel: ${index},
  userId: "user-${index}",
});
export const edgeChannel${index}Load: Promise<InferOutput<${path}["procedures"]["load"]>> =
  edgeChannel${index}.call("load", { cursor: ${index}, channel: ${index} });
export const edgeChannel${index}Moderate: Promise<InferOutput<${path}["procedures"]["moderate"]>> =
  edgeChannel${index}.call("moderate", { userId: "user-${index}", channel: ${index} });
`;
}

function workloadSource(): string {
  const procedures = workload.procedures
    .map(
      (item) => `    {
      "path": ${inlineArray(item.path)},
      "kind": "${item.kind}",
      "input": "${item.input}",
      "output": "${item.output}",
      "errors": ${inlineArray(item.errors)}
    }`,
    )
    .join(",\n");
  const channels = workload.channels
    .map(
      (item) => `    {
      "pattern": "${item.pattern}",
      "serverEvents": ${inlineArray(item.serverEvents)},
      "clientEvents": ${inlineArray(item.clientEvents)},
      "procedures": ${inlineArray(item.procedures)},
      "presence": ${String(item.presence)}
    }`,
    )
    .join(",\n");
  return `{
  "status": "${workload.status}",
  "procedures": [
${procedures}
  ],
  "channels": [
${channels}
  ]
}
`;
}

function clientSource(): string {
  const exercises = Array.from({ length: procedureCount }, (_, index) =>
    procedureExercise(index),
  ).join("\n\n");
  const inputs = Array.from({ length: procedureCount }, (_, index) => `input${index}`).join(", ");
  const calls = Array.from({ length: procedureCount }, (_, index) => `call${index}`).join(", ");
  const errors = Array.from({ length: procedureCount }, (_, index) => `error${index}`).join(", ");
  const queryKeys = Array.from(
    { length: procedureCount / 2 },
    (_, index) => `queryKey${index * 2}`,
  ).join(", ");
  const queryOptions = Array.from(
    { length: procedureCount / 2 },
    (_, index) => `queryOptions${index * 2}`,
  ).join(", ");
  const mutationOptions = Array.from(
    { length: procedureCount / 2 },
    (_, index) => `mutationOptions${index * 2 + 1}`,
  ).join(", ");
  const channels = Array.from({ length: channelCount }, (_, index) => channelExercise(index)).join(
    "\n\n",
  );
  return `import type {
  InferChannelParams,
  InferClientEventErrors,
  InferErrors,
  InferInput,
  InferOutput,
  InferPresence,
  InferServerEvent,
} from "@cable/contract";
import { createClient } from "@cable/client";
import type { ChannelStatus, Link, PresenceMember } from "@cable/client";
import { createCableQuery } from "@cable/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api, type Api } from "./contract.js";

const memoryLink: Link = () => async (call) => ({ id: call.id, ok: true, data: undefined });
const client = createClient<Api>({ contract: api, links: [memoryLink] });
const cable = createCableQuery(client);

${exercises}

export const procedureInputs = [${inputs}] as const;
export const procedureCalls = [${calls}] as const;
export const procedureErrors = [${errors}] as const;
export const cableQueryKeys = [${queryKeys}] as const;
export const cableQueryOptions = [${queryOptions}] as const;
export const cableMutationOptions = [${mutationOptions}] as const;
export const nativeQuery = useQuery(queryOptions0);
export const nativeMutation = useMutation(mutationOptions1);

${channels}
`;
}

function backendSource(): string {
  return `import type { Api } from "./contract.js";

export interface BackendOnlyContext {
  readonly secret: string;
}

export type BackendContract = Api;
`;
}

function edgeSource(): string {
  const channels = Array.from({ length: channelCount }, (_, index) =>
    edgeChannelExercise(index),
  ).join("\n\n");
  return `import type { InferChannelParams, InferOutput } from "@cable/contract";
import type { EdgeHosts } from "@cable/core";

import type { api, Api } from "./contract.js";

declare const hosts: EdgeHosts<Api>;

${channels}
`;
}

const directory = new URL("../fixtures/big-contract/", import.meta.url);
await mkdir(directory, { recursive: true });
await Promise.all([
  writeFile(new URL("workload.json", directory), workloadSource()),
  writeFile(new URL("contract.ts", directory), contractSource()),
  writeFile(new URL("client.ts", directory), clientSource()),
  writeFile(new URL("backend.ts", directory), backendSource()),
  writeFile(new URL("edge.ts", directory), edgeSource()),
]);

const fixturePath = fileURLToPath(directory);
const format = spawnSync(
  "bun",
  [
    "x",
    "--no-install",
    "oxfmt",
    "--disable-nested-config",
    "--write",
    `${fixturePath}contract.ts`,
    `${fixturePath}client.ts`,
    `${fixturePath}backend.ts`,
    `${fixturePath}edge.ts`,
  ],
  { encoding: "utf8" },
);
if (format.error) throw format.error;
if (format.status !== 0) throw new Error(format.stderr || "Could not format performance fixture.");

console.log("Generated real 200-procedure / 40-channel client and edge workloads.");

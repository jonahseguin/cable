import { mkdir, writeFile } from "node:fs/promises";

// M0 fixes the workload; M1 renders it through the actual contract and client APIs.
const workload = {
  status: "scaffold",
  procedures: Array.from({ length: 200 }, (_, index) => ({
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
  channels: Array.from({ length: 40 }, (_, index) => ({
    pattern: `channel${index}.{roomId}`,
    serverEvents: ["created", "updated", "deleted", "typing"],
    clientEvents: ["send", "edit", "remove"],
    procedures: ["load", "moderate"],
    presence: true,
  })),
};
const directory = new URL("../fixtures/big-contract/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("workload.json", directory), `${JSON.stringify(workload, null, 2)}\n`);
console.log("Generated 200 procedure / 40 channel workload. API rendering begins in M1.");

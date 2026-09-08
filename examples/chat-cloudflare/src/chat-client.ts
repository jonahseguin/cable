import { createClient } from "@cablejs/client";
import type { Client } from "@cablejs/client";

import { api } from "./api.js";

export const identityKey = "cable-chat-name";

const browserStorage = typeof window === "undefined" ? undefined : window.sessionStorage;

export function createCable(name: string): Client<typeof api> {
  return createClient({
    auth: { token: () => name },
    contract: api,
    url: "/_cable",
    ws: { cursors: browserStorage, idleClose: 1_000 },
  });
}

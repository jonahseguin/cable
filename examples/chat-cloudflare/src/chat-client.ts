import { createClient } from "@cablejs/client";

import { api } from "./api.js";

export const identityKey = "cable-chat-name";

const browserStorage = typeof window === "undefined" ? undefined : window.sessionStorage;

export const cable = createClient({
  auth: {
    token: () => browserStorage?.getItem(identityKey) ?? undefined,
  },
  contract: api,
  url: "/_cable",
  ws: { cursors: browserStorage, idleClose: 1_000 },
});

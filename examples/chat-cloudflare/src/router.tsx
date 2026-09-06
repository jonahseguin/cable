import { createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen.js";

export function getRouter(): ReturnType<typeof createRouter<typeof routeTree>> {
  return createRouter({ routeTree, scrollRestoration: true });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

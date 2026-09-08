import { createCableQuery } from "@cablejs/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { identityKey } from "./chat-client.js";
import type { createCable } from "./chat-client.js";

/** Keeps the browser's local identity token and session label in sync. */
export function ChatSession({
  cable,
  name,
  reportError,
}: {
  readonly cable: ReturnType<typeof createCable>;
  readonly name: string;
  readonly reportError: (message: string) => void;
}): ReactNode {
  const cableQuery = createCableQuery(cable);
  const identity = useQuery({
    ...cableQuery.session.whoami.queryOptions({}),
    enabled: typeof window !== "undefined",
  });

  useEffect(() => {
    window.sessionStorage.setItem(identityKey, name);
    void identity.refetch();
  }, [identity.refetch, name]);

  useEffect(() => {
    if (identity.error instanceof Error) reportError(identity.error.message);
  }, [identity.error, reportError]);

  return <p className="identity">Signed in locally as {identity.data?.name ?? name}</p>;
}

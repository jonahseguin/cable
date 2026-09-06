import { createCableQuery } from "@cable/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { cable, identityKey } from "./chat-client.js";

const cableQuery = createCableQuery(cable);

/** Keeps the browser's local identity token and session label in sync. */
export function ChatSession({
  name,
  reportError,
}: {
  readonly name: string;
  readonly reportError: (message: string) => void;
}): ReactNode {
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

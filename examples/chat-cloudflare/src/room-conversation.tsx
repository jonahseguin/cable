import { useChannel, useChannelStatus, useEvent, usePresence } from "@cable/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { cable } from "./chat-client.js";

/** Shows the current transport state for one room. */
export function RoomStatus({ roomId }: { readonly roomId: string }): ReactNode {
  const room = useChannel(cable.chat, { roomId });
  const status = useChannelStatus(room);
  return <span className={`status status-${status}`}>{status}</span>;
}

/** Displays one channel instance and owns its history, presence, and send flow. */
export function RoomConversation({
  name,
  reportError,
  roomId,
}: {
  readonly name: string;
  readonly reportError: (message: string) => void;
  readonly roomId: string;
}): ReactNode {
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const room = useChannel(cable.chat, { roomId });
  const status = useChannelStatus(room);
  const presence = usePresence(room);
  const historyKey = useMemo(() => ["cable", "chat.history", roomId] as const, [roomId]);
  const history = useQuery({
    enabled: typeof window !== "undefined",
    queryFn: () => room.history.load({ limit: 100 }),
    queryKey: historyKey,
  });

  useEffect(() => {
    presence.update({ name });
  }, [name, presence]);

  useEvent(room, "message", (message) => {
    queryClient.setQueryData(historyKey, (page: typeof history.data) => {
      if (page === undefined) return page;
      const next = {
        at: Date.now(),
        d: message,
        ev: "message" as const,
        seq: page.events.at(-1)?.seq ?? 0,
      };
      return { ...page, events: [...page.events, next] };
    });
  });

  useEffect(
    () =>
      room.onError((cause) => {
        reportError(cause.message);
      }),
    [reportError, room],
  );

  useEffect(() => {
    if (history.error instanceof Error) reportError(history.error.message);
  }, [history.error, reportError]);

  const messages =
    history.data?.events.map((event) => ({
      id: event.seq,
      text: event.d.text,
      user: event.d.user,
    })) ?? [];
  const members = presence.others.map((member) => member.d.name);

  function send(event: { preventDefault(): void }): void {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    void room.send({ text }, { ack: true }).then(
      () => {
        setDraft("");
        return undefined;
      },
      (cause: unknown) => {
        reportError(cause instanceof Error ? cause.message : "Message failed to send.");
        return undefined;
      },
    );
  }

  return (
    <>
      <ol className="messages" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id}>
            <strong>{message.user}</strong>
            <span>{message.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={send}>
        <input
          aria-label="Message"
          value={draft}
          maxLength={2_000}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Write a message"
        />
        <button type="submit" disabled={status !== "open"}>
          Send
        </button>
      </form>
      <footer>
        {members.length === 0 ? "Nobody else is here." : `${members.join(", ")} online`}
      </footer>
    </>
  );
}

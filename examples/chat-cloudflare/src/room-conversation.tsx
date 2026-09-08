import { useChannel, useChannelStatus, useEvent, usePresence } from "@cablejs/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { createCable } from "./chat-client.js";

type ChatRoom = ReturnType<ReturnType<typeof createCable>["chat"]>;

type ChatHistoryEvent = {
  readonly at: number;
  readonly d: { readonly text: string; readonly user: string };
  readonly ev: "message";
  readonly seq: number;
};

type ChatHistoryPage = {
  readonly events: readonly ChatHistoryEvent[];
  readonly nextCursor?: number;
};

function mergeHistory(
  page: ChatHistoryPage,
  additions: readonly ChatHistoryEvent[],
): ChatHistoryPage {
  const events = new Map(page.events.map((event) => [event.seq, event]));
  for (const event of additions) events.set(event.seq, event);
  return {
    ...page,
    // oxlint-disable-next-line unicorn/no-array-sort -- History order is a new array built above.
    events: Array.from(events.values()).sort((left, right) => left.seq - right.seq),
  };
}

/** Shows the current transport state for one room. */
export function RoomStatus({
  cable,
  roomId,
}: {
  readonly cable: ReturnType<typeof createCable>;
  readonly roomId: string;
}): ReactNode {
  const room = useChannel(cable.chat, { roomId });
  const status = useChannelStatus(room);
  return <span className={`status status-${status}`}>{status}</span>;
}

function useRoomHistory(
  room: ChatRoom,
  historyKey: readonly [string, string, string],
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const pendingLive = useRef(new Map<number, ChatHistoryEvent>());
  const history = useQuery({
    enabled: typeof window !== "undefined",
    queryFn: () => room.history.load({ limit: 100 }),
    queryKey: historyKey,
  });

  useEvent(room, "message", (message, metadata) => {
    if (metadata.seq === undefined) return;
    const next = {
      at: Date.now(),
      d: message,
      ev: "message" as const,
      seq: metadata.seq,
    };
    pendingLive.current.set(next.seq, next);
    while (pendingLive.current.size > 100) {
      const oldest = Math.min(...Array.from(pendingLive.current.keys()));
      pendingLive.current.delete(oldest);
    }
    queryClient.setQueryData(historyKey, (page: typeof history.data) => {
      if (page === undefined) return page;
      pendingLive.current.delete(next.seq);
      return mergeHistory(page, [next]);
    });
  });

  useEffect(() => {
    if (history.data === undefined || pendingLive.current.size === 0) return;
    const pending = Array.from(pendingLive.current.values());
    queryClient.setQueryData(historyKey, (page: typeof history.data) => {
      for (const event of pending) pendingLive.current.delete(event.seq);
      return mergeHistory(page, pending);
    });
  }, [history.data, historyKey, queryClient]);

  return history;
}

/** Displays one channel instance and owns its history, presence, and send flow. */
export function RoomConversation({
  cable,
  clearError,
  name,
  reportError,
  reportSendError,
  roomId,
}: {
  readonly cable: ReturnType<typeof createCable>;
  readonly clearError: (source: "identity" | "room" | "send") => void;
  readonly name: string;
  readonly reportError: (message: string) => void;
  readonly reportSendError: (message: string) => void;
  readonly roomId: string;
}): ReactNode {
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();
  const room = useChannel(cable.chat, { roomId });
  const status = useChannelStatus(room);
  // oxlint-disable-next-line typescript/unbound-method -- The hook owns the channel methods and returns a stable updater.
  const { others, update: updatePresence } = usePresence(room);
  const historyKey = useMemo(() => ["cable", "chat.history", roomId] as const, [roomId]);
  const history = useRoomHistory(room, historyKey, queryClient);

  useEffect(() => {
    updatePresence({ name });
  }, [name, updatePresence]);

  useEffect(() => {
    if (status === "open") clearError("room");
  }, [clearError, status]);

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
  const members = others.map((member) => member.d.name);

  function send(event: { preventDefault(): void }): void {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    void room.send({ text }, { ack: true }).then(
      () => {
        setDraft("");
        clearError("send");
        return undefined;
      },
      (cause: unknown) => {
        reportSendError(cause instanceof Error ? cause.message : "Message failed to send.");
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

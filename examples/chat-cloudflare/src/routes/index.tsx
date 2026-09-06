import { createClient } from "@cable/client";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { api } from "../api.js";

const identityKey = "cable-chat-name";
const browserStorage = typeof window === "undefined" ? undefined : window.sessionStorage;
const cable = createClient({
  auth: {
    token: () => browserStorage?.getItem(identityKey) ?? undefined,
  },
  contract: api,
  url: "/_cable",
  ws: { cursors: browserStorage, idleClose: 1_000 },
});

interface Message {
  readonly id: number;
  readonly text: string;
  readonly user: string;
}

export const Route = createFileRoute("/")({ component: Chat });

function Chat() {
  const [name, setName] = useState("Guest");
  const [roomId, setRoomId] = useState("lobby");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [status, setStatus] = useState("closed");
  const [members, setMembers] = useState<readonly string[]>([]);
  const [error, setError] = useState<string>();
  const [identity, setIdentity] = useState<string>();
  const room = useMemo(() => cable.chat({ roomId }), [roomId, name]);

  useEffect(() => {
    browserStorage?.setItem(identityKey, name);
  }, [name]);

  useEffect(() => {
    let live = true;
    setMessages([]);
    setError(undefined);
    const sync = () => {
      if (!live) return;
      setStatus(room.status);
      setMembers(room.presence.others.map((member) => member.d.name));
    };
    const append = (message: { readonly text: string; readonly user: string }, id: number) => {
      if (live) setMessages((current) => [...current, { ...message, id }]);
    };
    const offMessage = room.on("message", (message) => {
      append(message, Date.now());
    });
    const offStatus = room.onStatus(sync);
    const offPresence = room.presence.on(sync);
    const offError = room.onError((cause) => {
      setError(cause.message);
    });
    room.presence.update({ name });
    void room.history
      .load({ limit: 100 })
      .then((page) => {
        if (!live) return undefined;
        setMessages(page.events.map((event) => ({ ...event.d, id: event.seq })));
        return undefined;
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : "Could not load history.");
        return undefined;
      });
    void cable.session.whoami
      .query({})
      .then((session) => {
        if (live) setIdentity(session.name);
        return undefined;
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : "Could not authenticate.");
        return undefined;
      });
    return () => {
      live = false;
      offMessage();
      offStatus();
      offPresence();
      offError();
      room.dispose();
    };
  }, [name, room]);

  function send(event: { preventDefault(): void }): void {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    void room
      .send({ text }, { ack: true })
      .then(() => {
        setDraft("");
        return undefined;
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Message failed to send.");
        return undefined;
      });
  }

  return (
    <main className="shell">
      <section className="chat" aria-label="Cable chat">
        <header>
          <div>
            <p className="eyebrow">Cable on Cloudflare</p>
            <h1>Room {roomId}</h1>
          </div>
          <span className={`status status-${status}`}>{status}</span>
        </header>
        <div className="controls">
          <label>
            Name
            <input
              value={name}
              maxLength={48}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <label>
            Room
            <input
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value || "lobby");
              }}
            />
          </label>
        </div>
        <p className="identity">Signed in locally as {identity ?? name}</p>
        {error === undefined ? undefined : <p className="error">{error}</p>}
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
      </section>
      <style>{styles}</style>
    </main>
  );
}

const styles = `
  :root { color: #e9ecf2; background: #101218; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .shell { display: grid; min-height: 100vh; place-items: center; padding: 24px; }
  .chat { width: min(100%, 720px); min-height: 620px; display: grid; grid-template-rows: auto auto auto auto 1fr auto auto; gap: 16px; padding: 28px; background: #191d27; border: 1px solid #303747; border-radius: 20px; box-shadow: 0 24px 72px #0006; }
  header, .controls, form { display: flex; gap: 12px; align-items: end; justify-content: space-between; }
  h1, p { margin: 0; } .eyebrow { color: #aab5d5; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .status { border-radius: 999px; padding: 6px 10px; background: #323847; font-size: 13px; } .status-open { background: #185c45; } .status-connecting, .status-resuming { background: #72591c; }
  .controls label { flex: 1; color: #aab5d5; font-size: 13px; } input { width: 100%; margin-top: 6px; border: 1px solid #3a4254; border-radius: 9px; padding: 10px; color: inherit; background: #11141b; font: inherit; }
  .identity, footer { color: #aab5d5; font-size: 14px; } .error { color: #ffb4ab; font-size: 14px; }
  .messages { min-height: 220px; margin: 0; padding: 0; list-style: none; overflow-y: auto; } .messages li { display: grid; gap: 3px; padding: 10px 0; border-bottom: 1px solid #2b3140; } .messages strong { color: #a9c6ff; }
  form input { flex: 1; margin: 0; } button { border: 0; border-radius: 9px; padding: 11px 18px; color: #0c1421; background: #a9c6ff; font: inherit; font-weight: 700; } button:disabled { opacity: .5; }
  @media (max-width: 560px) { .chat { padding: 20px; } header, .controls { align-items: stretch; flex-direction: column; } }
`;

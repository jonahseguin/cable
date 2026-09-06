import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

import { ChatSession } from "../chat-session.js";
import { RoomConversation, RoomStatus } from "../room-conversation.js";

export const Route = createFileRoute("/")({ component: Chat });

function Chat(): ReactNode {
  const [name, setName] = useState("Guest");
  const [roomId, setRoomId] = useState("lobby");
  const [error, setError] = useState<string>();
  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  return (
    <main className="shell">
      <section className="chat" aria-label="Cable chat">
        <header>
          <div>
            <p className="eyebrow">Cable chat</p>
            <h1>Room {roomId}</h1>
          </div>
          <RoomStatus roomId={roomId} />
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
        <ChatSession name={name} reportError={reportError} />
        {error === undefined ? undefined : <p className="error">{error}</p>}
        <RoomConversation name={name} reportError={reportError} roomId={roomId} />
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

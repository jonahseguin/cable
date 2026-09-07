import { c } from "@cablejs/contract";
import { z } from "zod";

export const api = c.contract({
  session: {
    whoami: c.query({
      input: z.object({}),
      output: z.object({ name: z.string(), userId: z.string() }),
    }),
  },
  chat: c.channel("chat.{roomId}", {
    client: { send: z.object({ text: z.string().trim().min(1).max(2_000) }) },
    history: { max: 100, retain: "1h" },
    presence: z.object({ name: z.string().min(1).max(48) }),
    procedures: {
      info: c.query({
        input: z.object({}),
        output: z.object({ roomId: z.string() }),
      }),
    },
    server: { message: z.object({ text: z.string(), user: z.string() }) },
  }),
});

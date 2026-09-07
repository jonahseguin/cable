import { c } from "@cablejs/contract";
import { expectTypeOf, it } from "vitest";
import { z } from "zod";

import type { EdgeHosts } from "./types.js";

const contract = c.contract({
  nested: {
    room: c.channel("room.{roomId}", {
      client: {},
      params: z.object({ roomId: z.string() }),
      procedures: {
        inspect: c.query({
          input: z.string().transform(Number),
          output: z.number().transform(String),
        }),
      },
      server: { changed: z.number().transform(String) },
    }),
  },
});

function compileAssertions(hosts: EdgeHosts<typeof contract>): void {
  const room = hosts.nested.room({ roomId: "lobby" });
  expectTypeOf(room.emit("changed", 1)).toEqualTypeOf<Promise<number>>();
  expectTypeOf(room.call("inspect", "1")).toEqualTypeOf<Promise<string>>();
  // @ts-expect-error Channel parameter input must include roomId.
  hosts.nested.room({});
  // @ts-expect-error Server events retain their schema input type.
  void room.emit("changed", "1");
  // @ts-expect-error Host procedures retain their schema input type.
  void room.call("inspect", 1);
  // @ts-expect-error Only declared server events may be emitted.
  void room.emit("missing", 1);
}

it("preserves typed edge host access at one contract leaf", () => {
  expectTypeOf(compileAssertions).toBeFunction();
});

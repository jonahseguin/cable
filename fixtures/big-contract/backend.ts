import { implement } from "@cable/core";

import { api, type Api } from "./contract.js";

export interface BackendOnlyContext {
  readonly secret: string;
}

export type BackendContract = Api;

const builder = implement(api).context<BackendOnlyContext>();
const protectedProcedure = builder.procedure.use(async ({ ctx, next }) =>
  next({ ctx: { secret: ctx.secret } }),
);
export const protectedPerfProcedure = protectedProcedure(
  api.group0.section0.procedure0,
  ({ ctx, input }) => ({ accepted: ctx.secret.length > 0, id: input.id, marker: input.marker }),
);

import type { InferChannelParams, InferOutput } from "@cable/contract";
import { implement, type EdgeHosts } from "@cable/core";

import { api, type Api } from "./contract.js";

declare const hosts: EdgeHosts<Api>;

const procedureBuilder = implement(api).context<{
  readonly identity: { readonly role: "admin" | "member" } | null;
}>();
const protectedProcedure = procedureBuilder.procedure.use(async ({ ctx, next }) => {
  if (ctx.identity === null) throw new Error("unauthorized");
  return next({ ctx: { identity: ctx.identity } });
});
export const protectedPerfProcedure = protectedProcedure(
  api.group0.section0.procedure0,
  ({ ctx, input }) => ({
    accepted: ctx.identity.role === "admin",
    id: input.id,
    marker: input.marker,
  }),
);

const edgeChannel0Params: InferChannelParams<typeof api.channels.channel0> = { roomId: "room-0" };
const edgeChannel0 = hosts.channels.channel0(edgeChannel0Params);
export const edgeChannel0Created: Promise<number> = edgeChannel0.emit("created", {
  channel: 0,
  id: "item-0",
});
export const edgeChannel0Updated: Promise<number> = edgeChannel0.emit("updated", {
  channel: 0,
  version: 0,
});
export const edgeChannel0Deleted: Promise<number> = edgeChannel0.emit("deleted", {
  channel: 0,
  id: "item-0",
});
export const edgeChannel0Typing: Promise<number> = edgeChannel0.emit("typing", {
  channel: 0,
  userId: "user-0",
});
export const edgeChannel0Load: Promise<
  InferOutput<(typeof api.channels.channel0)["procedures"]["load"]>
> = edgeChannel0.call("load", { cursor: 0, channel: 0 });
export const edgeChannel0Moderate: Promise<
  InferOutput<(typeof api.channels.channel0)["procedures"]["moderate"]>
> = edgeChannel0.call("moderate", { userId: "user-0", channel: 0 });

const edgeChannel1Params: InferChannelParams<typeof api.channels.channel1> = { roomId: "room-1" };
const edgeChannel1 = hosts.channels.channel1(edgeChannel1Params);
export const edgeChannel1Created: Promise<number> = edgeChannel1.emit("created", {
  channel: 1,
  id: "item-1",
});
export const edgeChannel1Updated: Promise<number> = edgeChannel1.emit("updated", {
  channel: 1,
  version: 1,
});
export const edgeChannel1Deleted: Promise<number> = edgeChannel1.emit("deleted", {
  channel: 1,
  id: "item-1",
});
export const edgeChannel1Typing: Promise<number> = edgeChannel1.emit("typing", {
  channel: 1,
  userId: "user-1",
});
export const edgeChannel1Load: Promise<
  InferOutput<(typeof api.channels.channel1)["procedures"]["load"]>
> = edgeChannel1.call("load", { cursor: 1, channel: 1 });
export const edgeChannel1Moderate: Promise<
  InferOutput<(typeof api.channels.channel1)["procedures"]["moderate"]>
> = edgeChannel1.call("moderate", { userId: "user-1", channel: 1 });

const edgeChannel2Params: InferChannelParams<typeof api.channels.channel2> = { roomId: "room-2" };
const edgeChannel2 = hosts.channels.channel2(edgeChannel2Params);
export const edgeChannel2Created: Promise<number> = edgeChannel2.emit("created", {
  channel: 2,
  id: "item-2",
});
export const edgeChannel2Updated: Promise<number> = edgeChannel2.emit("updated", {
  channel: 2,
  version: 2,
});
export const edgeChannel2Deleted: Promise<number> = edgeChannel2.emit("deleted", {
  channel: 2,
  id: "item-2",
});
export const edgeChannel2Typing: Promise<number> = edgeChannel2.emit("typing", {
  channel: 2,
  userId: "user-2",
});
export const edgeChannel2Load: Promise<
  InferOutput<(typeof api.channels.channel2)["procedures"]["load"]>
> = edgeChannel2.call("load", { cursor: 2, channel: 2 });
export const edgeChannel2Moderate: Promise<
  InferOutput<(typeof api.channels.channel2)["procedures"]["moderate"]>
> = edgeChannel2.call("moderate", { userId: "user-2", channel: 2 });

const edgeChannel3Params: InferChannelParams<typeof api.channels.channel3> = { roomId: "room-3" };
const edgeChannel3 = hosts.channels.channel3(edgeChannel3Params);
export const edgeChannel3Created: Promise<number> = edgeChannel3.emit("created", {
  channel: 3,
  id: "item-3",
});
export const edgeChannel3Updated: Promise<number> = edgeChannel3.emit("updated", {
  channel: 3,
  version: 3,
});
export const edgeChannel3Deleted: Promise<number> = edgeChannel3.emit("deleted", {
  channel: 3,
  id: "item-3",
});
export const edgeChannel3Typing: Promise<number> = edgeChannel3.emit("typing", {
  channel: 3,
  userId: "user-3",
});
export const edgeChannel3Load: Promise<
  InferOutput<(typeof api.channels.channel3)["procedures"]["load"]>
> = edgeChannel3.call("load", { cursor: 3, channel: 3 });
export const edgeChannel3Moderate: Promise<
  InferOutput<(typeof api.channels.channel3)["procedures"]["moderate"]>
> = edgeChannel3.call("moderate", { userId: "user-3", channel: 3 });

const edgeChannel4Params: InferChannelParams<typeof api.channels.channel4> = { roomId: "room-4" };
const edgeChannel4 = hosts.channels.channel4(edgeChannel4Params);
export const edgeChannel4Created: Promise<number> = edgeChannel4.emit("created", {
  channel: 4,
  id: "item-4",
});
export const edgeChannel4Updated: Promise<number> = edgeChannel4.emit("updated", {
  channel: 4,
  version: 4,
});
export const edgeChannel4Deleted: Promise<number> = edgeChannel4.emit("deleted", {
  channel: 4,
  id: "item-4",
});
export const edgeChannel4Typing: Promise<number> = edgeChannel4.emit("typing", {
  channel: 4,
  userId: "user-4",
});
export const edgeChannel4Load: Promise<
  InferOutput<(typeof api.channels.channel4)["procedures"]["load"]>
> = edgeChannel4.call("load", { cursor: 4, channel: 4 });
export const edgeChannel4Moderate: Promise<
  InferOutput<(typeof api.channels.channel4)["procedures"]["moderate"]>
> = edgeChannel4.call("moderate", { userId: "user-4", channel: 4 });

const edgeChannel5Params: InferChannelParams<typeof api.channels.channel5> = { roomId: "room-5" };
const edgeChannel5 = hosts.channels.channel5(edgeChannel5Params);
export const edgeChannel5Created: Promise<number> = edgeChannel5.emit("created", {
  channel: 5,
  id: "item-5",
});
export const edgeChannel5Updated: Promise<number> = edgeChannel5.emit("updated", {
  channel: 5,
  version: 5,
});
export const edgeChannel5Deleted: Promise<number> = edgeChannel5.emit("deleted", {
  channel: 5,
  id: "item-5",
});
export const edgeChannel5Typing: Promise<number> = edgeChannel5.emit("typing", {
  channel: 5,
  userId: "user-5",
});
export const edgeChannel5Load: Promise<
  InferOutput<(typeof api.channels.channel5)["procedures"]["load"]>
> = edgeChannel5.call("load", { cursor: 5, channel: 5 });
export const edgeChannel5Moderate: Promise<
  InferOutput<(typeof api.channels.channel5)["procedures"]["moderate"]>
> = edgeChannel5.call("moderate", { userId: "user-5", channel: 5 });

const edgeChannel6Params: InferChannelParams<typeof api.channels.channel6> = { roomId: "room-6" };
const edgeChannel6 = hosts.channels.channel6(edgeChannel6Params);
export const edgeChannel6Created: Promise<number> = edgeChannel6.emit("created", {
  channel: 6,
  id: "item-6",
});
export const edgeChannel6Updated: Promise<number> = edgeChannel6.emit("updated", {
  channel: 6,
  version: 6,
});
export const edgeChannel6Deleted: Promise<number> = edgeChannel6.emit("deleted", {
  channel: 6,
  id: "item-6",
});
export const edgeChannel6Typing: Promise<number> = edgeChannel6.emit("typing", {
  channel: 6,
  userId: "user-6",
});
export const edgeChannel6Load: Promise<
  InferOutput<(typeof api.channels.channel6)["procedures"]["load"]>
> = edgeChannel6.call("load", { cursor: 6, channel: 6 });
export const edgeChannel6Moderate: Promise<
  InferOutput<(typeof api.channels.channel6)["procedures"]["moderate"]>
> = edgeChannel6.call("moderate", { userId: "user-6", channel: 6 });

const edgeChannel7Params: InferChannelParams<typeof api.channels.channel7> = { roomId: "room-7" };
const edgeChannel7 = hosts.channels.channel7(edgeChannel7Params);
export const edgeChannel7Created: Promise<number> = edgeChannel7.emit("created", {
  channel: 7,
  id: "item-7",
});
export const edgeChannel7Updated: Promise<number> = edgeChannel7.emit("updated", {
  channel: 7,
  version: 7,
});
export const edgeChannel7Deleted: Promise<number> = edgeChannel7.emit("deleted", {
  channel: 7,
  id: "item-7",
});
export const edgeChannel7Typing: Promise<number> = edgeChannel7.emit("typing", {
  channel: 7,
  userId: "user-7",
});
export const edgeChannel7Load: Promise<
  InferOutput<(typeof api.channels.channel7)["procedures"]["load"]>
> = edgeChannel7.call("load", { cursor: 7, channel: 7 });
export const edgeChannel7Moderate: Promise<
  InferOutput<(typeof api.channels.channel7)["procedures"]["moderate"]>
> = edgeChannel7.call("moderate", { userId: "user-7", channel: 7 });

const edgeChannel8Params: InferChannelParams<typeof api.channels.channel8> = { roomId: "room-8" };
const edgeChannel8 = hosts.channels.channel8(edgeChannel8Params);
export const edgeChannel8Created: Promise<number> = edgeChannel8.emit("created", {
  channel: 8,
  id: "item-8",
});
export const edgeChannel8Updated: Promise<number> = edgeChannel8.emit("updated", {
  channel: 8,
  version: 8,
});
export const edgeChannel8Deleted: Promise<number> = edgeChannel8.emit("deleted", {
  channel: 8,
  id: "item-8",
});
export const edgeChannel8Typing: Promise<number> = edgeChannel8.emit("typing", {
  channel: 8,
  userId: "user-8",
});
export const edgeChannel8Load: Promise<
  InferOutput<(typeof api.channels.channel8)["procedures"]["load"]>
> = edgeChannel8.call("load", { cursor: 8, channel: 8 });
export const edgeChannel8Moderate: Promise<
  InferOutput<(typeof api.channels.channel8)["procedures"]["moderate"]>
> = edgeChannel8.call("moderate", { userId: "user-8", channel: 8 });

const edgeChannel9Params: InferChannelParams<typeof api.channels.channel9> = { roomId: "room-9" };
const edgeChannel9 = hosts.channels.channel9(edgeChannel9Params);
export const edgeChannel9Created: Promise<number> = edgeChannel9.emit("created", {
  channel: 9,
  id: "item-9",
});
export const edgeChannel9Updated: Promise<number> = edgeChannel9.emit("updated", {
  channel: 9,
  version: 9,
});
export const edgeChannel9Deleted: Promise<number> = edgeChannel9.emit("deleted", {
  channel: 9,
  id: "item-9",
});
export const edgeChannel9Typing: Promise<number> = edgeChannel9.emit("typing", {
  channel: 9,
  userId: "user-9",
});
export const edgeChannel9Load: Promise<
  InferOutput<(typeof api.channels.channel9)["procedures"]["load"]>
> = edgeChannel9.call("load", { cursor: 9, channel: 9 });
export const edgeChannel9Moderate: Promise<
  InferOutput<(typeof api.channels.channel9)["procedures"]["moderate"]>
> = edgeChannel9.call("moderate", { userId: "user-9", channel: 9 });

const edgeChannel10Params: InferChannelParams<typeof api.channels.channel10> = {
  roomId: "room-10",
};
const edgeChannel10 = hosts.channels.channel10(edgeChannel10Params);
export const edgeChannel10Created: Promise<number> = edgeChannel10.emit("created", {
  channel: 10,
  id: "item-10",
});
export const edgeChannel10Updated: Promise<number> = edgeChannel10.emit("updated", {
  channel: 10,
  version: 10,
});
export const edgeChannel10Deleted: Promise<number> = edgeChannel10.emit("deleted", {
  channel: 10,
  id: "item-10",
});
export const edgeChannel10Typing: Promise<number> = edgeChannel10.emit("typing", {
  channel: 10,
  userId: "user-10",
});
export const edgeChannel10Load: Promise<
  InferOutput<(typeof api.channels.channel10)["procedures"]["load"]>
> = edgeChannel10.call("load", { cursor: 10, channel: 10 });
export const edgeChannel10Moderate: Promise<
  InferOutput<(typeof api.channels.channel10)["procedures"]["moderate"]>
> = edgeChannel10.call("moderate", { userId: "user-10", channel: 10 });

const edgeChannel11Params: InferChannelParams<typeof api.channels.channel11> = {
  roomId: "room-11",
};
const edgeChannel11 = hosts.channels.channel11(edgeChannel11Params);
export const edgeChannel11Created: Promise<number> = edgeChannel11.emit("created", {
  channel: 11,
  id: "item-11",
});
export const edgeChannel11Updated: Promise<number> = edgeChannel11.emit("updated", {
  channel: 11,
  version: 11,
});
export const edgeChannel11Deleted: Promise<number> = edgeChannel11.emit("deleted", {
  channel: 11,
  id: "item-11",
});
export const edgeChannel11Typing: Promise<number> = edgeChannel11.emit("typing", {
  channel: 11,
  userId: "user-11",
});
export const edgeChannel11Load: Promise<
  InferOutput<(typeof api.channels.channel11)["procedures"]["load"]>
> = edgeChannel11.call("load", { cursor: 11, channel: 11 });
export const edgeChannel11Moderate: Promise<
  InferOutput<(typeof api.channels.channel11)["procedures"]["moderate"]>
> = edgeChannel11.call("moderate", { userId: "user-11", channel: 11 });

const edgeChannel12Params: InferChannelParams<typeof api.channels.channel12> = {
  roomId: "room-12",
};
const edgeChannel12 = hosts.channels.channel12(edgeChannel12Params);
export const edgeChannel12Created: Promise<number> = edgeChannel12.emit("created", {
  channel: 12,
  id: "item-12",
});
export const edgeChannel12Updated: Promise<number> = edgeChannel12.emit("updated", {
  channel: 12,
  version: 12,
});
export const edgeChannel12Deleted: Promise<number> = edgeChannel12.emit("deleted", {
  channel: 12,
  id: "item-12",
});
export const edgeChannel12Typing: Promise<number> = edgeChannel12.emit("typing", {
  channel: 12,
  userId: "user-12",
});
export const edgeChannel12Load: Promise<
  InferOutput<(typeof api.channels.channel12)["procedures"]["load"]>
> = edgeChannel12.call("load", { cursor: 12, channel: 12 });
export const edgeChannel12Moderate: Promise<
  InferOutput<(typeof api.channels.channel12)["procedures"]["moderate"]>
> = edgeChannel12.call("moderate", { userId: "user-12", channel: 12 });

const edgeChannel13Params: InferChannelParams<typeof api.channels.channel13> = {
  roomId: "room-13",
};
const edgeChannel13 = hosts.channels.channel13(edgeChannel13Params);
export const edgeChannel13Created: Promise<number> = edgeChannel13.emit("created", {
  channel: 13,
  id: "item-13",
});
export const edgeChannel13Updated: Promise<number> = edgeChannel13.emit("updated", {
  channel: 13,
  version: 13,
});
export const edgeChannel13Deleted: Promise<number> = edgeChannel13.emit("deleted", {
  channel: 13,
  id: "item-13",
});
export const edgeChannel13Typing: Promise<number> = edgeChannel13.emit("typing", {
  channel: 13,
  userId: "user-13",
});
export const edgeChannel13Load: Promise<
  InferOutput<(typeof api.channels.channel13)["procedures"]["load"]>
> = edgeChannel13.call("load", { cursor: 13, channel: 13 });
export const edgeChannel13Moderate: Promise<
  InferOutput<(typeof api.channels.channel13)["procedures"]["moderate"]>
> = edgeChannel13.call("moderate", { userId: "user-13", channel: 13 });

const edgeChannel14Params: InferChannelParams<typeof api.channels.channel14> = {
  roomId: "room-14",
};
const edgeChannel14 = hosts.channels.channel14(edgeChannel14Params);
export const edgeChannel14Created: Promise<number> = edgeChannel14.emit("created", {
  channel: 14,
  id: "item-14",
});
export const edgeChannel14Updated: Promise<number> = edgeChannel14.emit("updated", {
  channel: 14,
  version: 14,
});
export const edgeChannel14Deleted: Promise<number> = edgeChannel14.emit("deleted", {
  channel: 14,
  id: "item-14",
});
export const edgeChannel14Typing: Promise<number> = edgeChannel14.emit("typing", {
  channel: 14,
  userId: "user-14",
});
export const edgeChannel14Load: Promise<
  InferOutput<(typeof api.channels.channel14)["procedures"]["load"]>
> = edgeChannel14.call("load", { cursor: 14, channel: 14 });
export const edgeChannel14Moderate: Promise<
  InferOutput<(typeof api.channels.channel14)["procedures"]["moderate"]>
> = edgeChannel14.call("moderate", { userId: "user-14", channel: 14 });

const edgeChannel15Params: InferChannelParams<typeof api.channels.channel15> = {
  roomId: "room-15",
};
const edgeChannel15 = hosts.channels.channel15(edgeChannel15Params);
export const edgeChannel15Created: Promise<number> = edgeChannel15.emit("created", {
  channel: 15,
  id: "item-15",
});
export const edgeChannel15Updated: Promise<number> = edgeChannel15.emit("updated", {
  channel: 15,
  version: 15,
});
export const edgeChannel15Deleted: Promise<number> = edgeChannel15.emit("deleted", {
  channel: 15,
  id: "item-15",
});
export const edgeChannel15Typing: Promise<number> = edgeChannel15.emit("typing", {
  channel: 15,
  userId: "user-15",
});
export const edgeChannel15Load: Promise<
  InferOutput<(typeof api.channels.channel15)["procedures"]["load"]>
> = edgeChannel15.call("load", { cursor: 15, channel: 15 });
export const edgeChannel15Moderate: Promise<
  InferOutput<(typeof api.channels.channel15)["procedures"]["moderate"]>
> = edgeChannel15.call("moderate", { userId: "user-15", channel: 15 });

const edgeChannel16Params: InferChannelParams<typeof api.channels.channel16> = {
  roomId: "room-16",
};
const edgeChannel16 = hosts.channels.channel16(edgeChannel16Params);
export const edgeChannel16Created: Promise<number> = edgeChannel16.emit("created", {
  channel: 16,
  id: "item-16",
});
export const edgeChannel16Updated: Promise<number> = edgeChannel16.emit("updated", {
  channel: 16,
  version: 16,
});
export const edgeChannel16Deleted: Promise<number> = edgeChannel16.emit("deleted", {
  channel: 16,
  id: "item-16",
});
export const edgeChannel16Typing: Promise<number> = edgeChannel16.emit("typing", {
  channel: 16,
  userId: "user-16",
});
export const edgeChannel16Load: Promise<
  InferOutput<(typeof api.channels.channel16)["procedures"]["load"]>
> = edgeChannel16.call("load", { cursor: 16, channel: 16 });
export const edgeChannel16Moderate: Promise<
  InferOutput<(typeof api.channels.channel16)["procedures"]["moderate"]>
> = edgeChannel16.call("moderate", { userId: "user-16", channel: 16 });

const edgeChannel17Params: InferChannelParams<typeof api.channels.channel17> = {
  roomId: "room-17",
};
const edgeChannel17 = hosts.channels.channel17(edgeChannel17Params);
export const edgeChannel17Created: Promise<number> = edgeChannel17.emit("created", {
  channel: 17,
  id: "item-17",
});
export const edgeChannel17Updated: Promise<number> = edgeChannel17.emit("updated", {
  channel: 17,
  version: 17,
});
export const edgeChannel17Deleted: Promise<number> = edgeChannel17.emit("deleted", {
  channel: 17,
  id: "item-17",
});
export const edgeChannel17Typing: Promise<number> = edgeChannel17.emit("typing", {
  channel: 17,
  userId: "user-17",
});
export const edgeChannel17Load: Promise<
  InferOutput<(typeof api.channels.channel17)["procedures"]["load"]>
> = edgeChannel17.call("load", { cursor: 17, channel: 17 });
export const edgeChannel17Moderate: Promise<
  InferOutput<(typeof api.channels.channel17)["procedures"]["moderate"]>
> = edgeChannel17.call("moderate", { userId: "user-17", channel: 17 });

const edgeChannel18Params: InferChannelParams<typeof api.channels.channel18> = {
  roomId: "room-18",
};
const edgeChannel18 = hosts.channels.channel18(edgeChannel18Params);
export const edgeChannel18Created: Promise<number> = edgeChannel18.emit("created", {
  channel: 18,
  id: "item-18",
});
export const edgeChannel18Updated: Promise<number> = edgeChannel18.emit("updated", {
  channel: 18,
  version: 18,
});
export const edgeChannel18Deleted: Promise<number> = edgeChannel18.emit("deleted", {
  channel: 18,
  id: "item-18",
});
export const edgeChannel18Typing: Promise<number> = edgeChannel18.emit("typing", {
  channel: 18,
  userId: "user-18",
});
export const edgeChannel18Load: Promise<
  InferOutput<(typeof api.channels.channel18)["procedures"]["load"]>
> = edgeChannel18.call("load", { cursor: 18, channel: 18 });
export const edgeChannel18Moderate: Promise<
  InferOutput<(typeof api.channels.channel18)["procedures"]["moderate"]>
> = edgeChannel18.call("moderate", { userId: "user-18", channel: 18 });

const edgeChannel19Params: InferChannelParams<typeof api.channels.channel19> = {
  roomId: "room-19",
};
const edgeChannel19 = hosts.channels.channel19(edgeChannel19Params);
export const edgeChannel19Created: Promise<number> = edgeChannel19.emit("created", {
  channel: 19,
  id: "item-19",
});
export const edgeChannel19Updated: Promise<number> = edgeChannel19.emit("updated", {
  channel: 19,
  version: 19,
});
export const edgeChannel19Deleted: Promise<number> = edgeChannel19.emit("deleted", {
  channel: 19,
  id: "item-19",
});
export const edgeChannel19Typing: Promise<number> = edgeChannel19.emit("typing", {
  channel: 19,
  userId: "user-19",
});
export const edgeChannel19Load: Promise<
  InferOutput<(typeof api.channels.channel19)["procedures"]["load"]>
> = edgeChannel19.call("load", { cursor: 19, channel: 19 });
export const edgeChannel19Moderate: Promise<
  InferOutput<(typeof api.channels.channel19)["procedures"]["moderate"]>
> = edgeChannel19.call("moderate", { userId: "user-19", channel: 19 });

const edgeChannel20Params: InferChannelParams<typeof api.channels.channel20> = {
  roomId: "room-20",
};
const edgeChannel20 = hosts.channels.channel20(edgeChannel20Params);
export const edgeChannel20Created: Promise<number> = edgeChannel20.emit("created", {
  channel: 20,
  id: "item-20",
});
export const edgeChannel20Updated: Promise<number> = edgeChannel20.emit("updated", {
  channel: 20,
  version: 20,
});
export const edgeChannel20Deleted: Promise<number> = edgeChannel20.emit("deleted", {
  channel: 20,
  id: "item-20",
});
export const edgeChannel20Typing: Promise<number> = edgeChannel20.emit("typing", {
  channel: 20,
  userId: "user-20",
});
export const edgeChannel20Load: Promise<
  InferOutput<(typeof api.channels.channel20)["procedures"]["load"]>
> = edgeChannel20.call("load", { cursor: 20, channel: 20 });
export const edgeChannel20Moderate: Promise<
  InferOutput<(typeof api.channels.channel20)["procedures"]["moderate"]>
> = edgeChannel20.call("moderate", { userId: "user-20", channel: 20 });

const edgeChannel21Params: InferChannelParams<typeof api.channels.channel21> = {
  roomId: "room-21",
};
const edgeChannel21 = hosts.channels.channel21(edgeChannel21Params);
export const edgeChannel21Created: Promise<number> = edgeChannel21.emit("created", {
  channel: 21,
  id: "item-21",
});
export const edgeChannel21Updated: Promise<number> = edgeChannel21.emit("updated", {
  channel: 21,
  version: 21,
});
export const edgeChannel21Deleted: Promise<number> = edgeChannel21.emit("deleted", {
  channel: 21,
  id: "item-21",
});
export const edgeChannel21Typing: Promise<number> = edgeChannel21.emit("typing", {
  channel: 21,
  userId: "user-21",
});
export const edgeChannel21Load: Promise<
  InferOutput<(typeof api.channels.channel21)["procedures"]["load"]>
> = edgeChannel21.call("load", { cursor: 21, channel: 21 });
export const edgeChannel21Moderate: Promise<
  InferOutput<(typeof api.channels.channel21)["procedures"]["moderate"]>
> = edgeChannel21.call("moderate", { userId: "user-21", channel: 21 });

const edgeChannel22Params: InferChannelParams<typeof api.channels.channel22> = {
  roomId: "room-22",
};
const edgeChannel22 = hosts.channels.channel22(edgeChannel22Params);
export const edgeChannel22Created: Promise<number> = edgeChannel22.emit("created", {
  channel: 22,
  id: "item-22",
});
export const edgeChannel22Updated: Promise<number> = edgeChannel22.emit("updated", {
  channel: 22,
  version: 22,
});
export const edgeChannel22Deleted: Promise<number> = edgeChannel22.emit("deleted", {
  channel: 22,
  id: "item-22",
});
export const edgeChannel22Typing: Promise<number> = edgeChannel22.emit("typing", {
  channel: 22,
  userId: "user-22",
});
export const edgeChannel22Load: Promise<
  InferOutput<(typeof api.channels.channel22)["procedures"]["load"]>
> = edgeChannel22.call("load", { cursor: 22, channel: 22 });
export const edgeChannel22Moderate: Promise<
  InferOutput<(typeof api.channels.channel22)["procedures"]["moderate"]>
> = edgeChannel22.call("moderate", { userId: "user-22", channel: 22 });

const edgeChannel23Params: InferChannelParams<typeof api.channels.channel23> = {
  roomId: "room-23",
};
const edgeChannel23 = hosts.channels.channel23(edgeChannel23Params);
export const edgeChannel23Created: Promise<number> = edgeChannel23.emit("created", {
  channel: 23,
  id: "item-23",
});
export const edgeChannel23Updated: Promise<number> = edgeChannel23.emit("updated", {
  channel: 23,
  version: 23,
});
export const edgeChannel23Deleted: Promise<number> = edgeChannel23.emit("deleted", {
  channel: 23,
  id: "item-23",
});
export const edgeChannel23Typing: Promise<number> = edgeChannel23.emit("typing", {
  channel: 23,
  userId: "user-23",
});
export const edgeChannel23Load: Promise<
  InferOutput<(typeof api.channels.channel23)["procedures"]["load"]>
> = edgeChannel23.call("load", { cursor: 23, channel: 23 });
export const edgeChannel23Moderate: Promise<
  InferOutput<(typeof api.channels.channel23)["procedures"]["moderate"]>
> = edgeChannel23.call("moderate", { userId: "user-23", channel: 23 });

const edgeChannel24Params: InferChannelParams<typeof api.channels.channel24> = {
  roomId: "room-24",
};
const edgeChannel24 = hosts.channels.channel24(edgeChannel24Params);
export const edgeChannel24Created: Promise<number> = edgeChannel24.emit("created", {
  channel: 24,
  id: "item-24",
});
export const edgeChannel24Updated: Promise<number> = edgeChannel24.emit("updated", {
  channel: 24,
  version: 24,
});
export const edgeChannel24Deleted: Promise<number> = edgeChannel24.emit("deleted", {
  channel: 24,
  id: "item-24",
});
export const edgeChannel24Typing: Promise<number> = edgeChannel24.emit("typing", {
  channel: 24,
  userId: "user-24",
});
export const edgeChannel24Load: Promise<
  InferOutput<(typeof api.channels.channel24)["procedures"]["load"]>
> = edgeChannel24.call("load", { cursor: 24, channel: 24 });
export const edgeChannel24Moderate: Promise<
  InferOutput<(typeof api.channels.channel24)["procedures"]["moderate"]>
> = edgeChannel24.call("moderate", { userId: "user-24", channel: 24 });

const edgeChannel25Params: InferChannelParams<typeof api.channels.channel25> = {
  roomId: "room-25",
};
const edgeChannel25 = hosts.channels.channel25(edgeChannel25Params);
export const edgeChannel25Created: Promise<number> = edgeChannel25.emit("created", {
  channel: 25,
  id: "item-25",
});
export const edgeChannel25Updated: Promise<number> = edgeChannel25.emit("updated", {
  channel: 25,
  version: 25,
});
export const edgeChannel25Deleted: Promise<number> = edgeChannel25.emit("deleted", {
  channel: 25,
  id: "item-25",
});
export const edgeChannel25Typing: Promise<number> = edgeChannel25.emit("typing", {
  channel: 25,
  userId: "user-25",
});
export const edgeChannel25Load: Promise<
  InferOutput<(typeof api.channels.channel25)["procedures"]["load"]>
> = edgeChannel25.call("load", { cursor: 25, channel: 25 });
export const edgeChannel25Moderate: Promise<
  InferOutput<(typeof api.channels.channel25)["procedures"]["moderate"]>
> = edgeChannel25.call("moderate", { userId: "user-25", channel: 25 });

const edgeChannel26Params: InferChannelParams<typeof api.channels.channel26> = {
  roomId: "room-26",
};
const edgeChannel26 = hosts.channels.channel26(edgeChannel26Params);
export const edgeChannel26Created: Promise<number> = edgeChannel26.emit("created", {
  channel: 26,
  id: "item-26",
});
export const edgeChannel26Updated: Promise<number> = edgeChannel26.emit("updated", {
  channel: 26,
  version: 26,
});
export const edgeChannel26Deleted: Promise<number> = edgeChannel26.emit("deleted", {
  channel: 26,
  id: "item-26",
});
export const edgeChannel26Typing: Promise<number> = edgeChannel26.emit("typing", {
  channel: 26,
  userId: "user-26",
});
export const edgeChannel26Load: Promise<
  InferOutput<(typeof api.channels.channel26)["procedures"]["load"]>
> = edgeChannel26.call("load", { cursor: 26, channel: 26 });
export const edgeChannel26Moderate: Promise<
  InferOutput<(typeof api.channels.channel26)["procedures"]["moderate"]>
> = edgeChannel26.call("moderate", { userId: "user-26", channel: 26 });

const edgeChannel27Params: InferChannelParams<typeof api.channels.channel27> = {
  roomId: "room-27",
};
const edgeChannel27 = hosts.channels.channel27(edgeChannel27Params);
export const edgeChannel27Created: Promise<number> = edgeChannel27.emit("created", {
  channel: 27,
  id: "item-27",
});
export const edgeChannel27Updated: Promise<number> = edgeChannel27.emit("updated", {
  channel: 27,
  version: 27,
});
export const edgeChannel27Deleted: Promise<number> = edgeChannel27.emit("deleted", {
  channel: 27,
  id: "item-27",
});
export const edgeChannel27Typing: Promise<number> = edgeChannel27.emit("typing", {
  channel: 27,
  userId: "user-27",
});
export const edgeChannel27Load: Promise<
  InferOutput<(typeof api.channels.channel27)["procedures"]["load"]>
> = edgeChannel27.call("load", { cursor: 27, channel: 27 });
export const edgeChannel27Moderate: Promise<
  InferOutput<(typeof api.channels.channel27)["procedures"]["moderate"]>
> = edgeChannel27.call("moderate", { userId: "user-27", channel: 27 });

const edgeChannel28Params: InferChannelParams<typeof api.channels.channel28> = {
  roomId: "room-28",
};
const edgeChannel28 = hosts.channels.channel28(edgeChannel28Params);
export const edgeChannel28Created: Promise<number> = edgeChannel28.emit("created", {
  channel: 28,
  id: "item-28",
});
export const edgeChannel28Updated: Promise<number> = edgeChannel28.emit("updated", {
  channel: 28,
  version: 28,
});
export const edgeChannel28Deleted: Promise<number> = edgeChannel28.emit("deleted", {
  channel: 28,
  id: "item-28",
});
export const edgeChannel28Typing: Promise<number> = edgeChannel28.emit("typing", {
  channel: 28,
  userId: "user-28",
});
export const edgeChannel28Load: Promise<
  InferOutput<(typeof api.channels.channel28)["procedures"]["load"]>
> = edgeChannel28.call("load", { cursor: 28, channel: 28 });
export const edgeChannel28Moderate: Promise<
  InferOutput<(typeof api.channels.channel28)["procedures"]["moderate"]>
> = edgeChannel28.call("moderate", { userId: "user-28", channel: 28 });

const edgeChannel29Params: InferChannelParams<typeof api.channels.channel29> = {
  roomId: "room-29",
};
const edgeChannel29 = hosts.channels.channel29(edgeChannel29Params);
export const edgeChannel29Created: Promise<number> = edgeChannel29.emit("created", {
  channel: 29,
  id: "item-29",
});
export const edgeChannel29Updated: Promise<number> = edgeChannel29.emit("updated", {
  channel: 29,
  version: 29,
});
export const edgeChannel29Deleted: Promise<number> = edgeChannel29.emit("deleted", {
  channel: 29,
  id: "item-29",
});
export const edgeChannel29Typing: Promise<number> = edgeChannel29.emit("typing", {
  channel: 29,
  userId: "user-29",
});
export const edgeChannel29Load: Promise<
  InferOutput<(typeof api.channels.channel29)["procedures"]["load"]>
> = edgeChannel29.call("load", { cursor: 29, channel: 29 });
export const edgeChannel29Moderate: Promise<
  InferOutput<(typeof api.channels.channel29)["procedures"]["moderate"]>
> = edgeChannel29.call("moderate", { userId: "user-29", channel: 29 });

const edgeChannel30Params: InferChannelParams<typeof api.channels.channel30> = {
  roomId: "room-30",
};
const edgeChannel30 = hosts.channels.channel30(edgeChannel30Params);
export const edgeChannel30Created: Promise<number> = edgeChannel30.emit("created", {
  channel: 30,
  id: "item-30",
});
export const edgeChannel30Updated: Promise<number> = edgeChannel30.emit("updated", {
  channel: 30,
  version: 30,
});
export const edgeChannel30Deleted: Promise<number> = edgeChannel30.emit("deleted", {
  channel: 30,
  id: "item-30",
});
export const edgeChannel30Typing: Promise<number> = edgeChannel30.emit("typing", {
  channel: 30,
  userId: "user-30",
});
export const edgeChannel30Load: Promise<
  InferOutput<(typeof api.channels.channel30)["procedures"]["load"]>
> = edgeChannel30.call("load", { cursor: 30, channel: 30 });
export const edgeChannel30Moderate: Promise<
  InferOutput<(typeof api.channels.channel30)["procedures"]["moderate"]>
> = edgeChannel30.call("moderate", { userId: "user-30", channel: 30 });

const edgeChannel31Params: InferChannelParams<typeof api.channels.channel31> = {
  roomId: "room-31",
};
const edgeChannel31 = hosts.channels.channel31(edgeChannel31Params);
export const edgeChannel31Created: Promise<number> = edgeChannel31.emit("created", {
  channel: 31,
  id: "item-31",
});
export const edgeChannel31Updated: Promise<number> = edgeChannel31.emit("updated", {
  channel: 31,
  version: 31,
});
export const edgeChannel31Deleted: Promise<number> = edgeChannel31.emit("deleted", {
  channel: 31,
  id: "item-31",
});
export const edgeChannel31Typing: Promise<number> = edgeChannel31.emit("typing", {
  channel: 31,
  userId: "user-31",
});
export const edgeChannel31Load: Promise<
  InferOutput<(typeof api.channels.channel31)["procedures"]["load"]>
> = edgeChannel31.call("load", { cursor: 31, channel: 31 });
export const edgeChannel31Moderate: Promise<
  InferOutput<(typeof api.channels.channel31)["procedures"]["moderate"]>
> = edgeChannel31.call("moderate", { userId: "user-31", channel: 31 });

const edgeChannel32Params: InferChannelParams<typeof api.channels.channel32> = {
  roomId: "room-32",
};
const edgeChannel32 = hosts.channels.channel32(edgeChannel32Params);
export const edgeChannel32Created: Promise<number> = edgeChannel32.emit("created", {
  channel: 32,
  id: "item-32",
});
export const edgeChannel32Updated: Promise<number> = edgeChannel32.emit("updated", {
  channel: 32,
  version: 32,
});
export const edgeChannel32Deleted: Promise<number> = edgeChannel32.emit("deleted", {
  channel: 32,
  id: "item-32",
});
export const edgeChannel32Typing: Promise<number> = edgeChannel32.emit("typing", {
  channel: 32,
  userId: "user-32",
});
export const edgeChannel32Load: Promise<
  InferOutput<(typeof api.channels.channel32)["procedures"]["load"]>
> = edgeChannel32.call("load", { cursor: 32, channel: 32 });
export const edgeChannel32Moderate: Promise<
  InferOutput<(typeof api.channels.channel32)["procedures"]["moderate"]>
> = edgeChannel32.call("moderate", { userId: "user-32", channel: 32 });

const edgeChannel33Params: InferChannelParams<typeof api.channels.channel33> = {
  roomId: "room-33",
};
const edgeChannel33 = hosts.channels.channel33(edgeChannel33Params);
export const edgeChannel33Created: Promise<number> = edgeChannel33.emit("created", {
  channel: 33,
  id: "item-33",
});
export const edgeChannel33Updated: Promise<number> = edgeChannel33.emit("updated", {
  channel: 33,
  version: 33,
});
export const edgeChannel33Deleted: Promise<number> = edgeChannel33.emit("deleted", {
  channel: 33,
  id: "item-33",
});
export const edgeChannel33Typing: Promise<number> = edgeChannel33.emit("typing", {
  channel: 33,
  userId: "user-33",
});
export const edgeChannel33Load: Promise<
  InferOutput<(typeof api.channels.channel33)["procedures"]["load"]>
> = edgeChannel33.call("load", { cursor: 33, channel: 33 });
export const edgeChannel33Moderate: Promise<
  InferOutput<(typeof api.channels.channel33)["procedures"]["moderate"]>
> = edgeChannel33.call("moderate", { userId: "user-33", channel: 33 });

const edgeChannel34Params: InferChannelParams<typeof api.channels.channel34> = {
  roomId: "room-34",
};
const edgeChannel34 = hosts.channels.channel34(edgeChannel34Params);
export const edgeChannel34Created: Promise<number> = edgeChannel34.emit("created", {
  channel: 34,
  id: "item-34",
});
export const edgeChannel34Updated: Promise<number> = edgeChannel34.emit("updated", {
  channel: 34,
  version: 34,
});
export const edgeChannel34Deleted: Promise<number> = edgeChannel34.emit("deleted", {
  channel: 34,
  id: "item-34",
});
export const edgeChannel34Typing: Promise<number> = edgeChannel34.emit("typing", {
  channel: 34,
  userId: "user-34",
});
export const edgeChannel34Load: Promise<
  InferOutput<(typeof api.channels.channel34)["procedures"]["load"]>
> = edgeChannel34.call("load", { cursor: 34, channel: 34 });
export const edgeChannel34Moderate: Promise<
  InferOutput<(typeof api.channels.channel34)["procedures"]["moderate"]>
> = edgeChannel34.call("moderate", { userId: "user-34", channel: 34 });

const edgeChannel35Params: InferChannelParams<typeof api.channels.channel35> = {
  roomId: "room-35",
};
const edgeChannel35 = hosts.channels.channel35(edgeChannel35Params);
export const edgeChannel35Created: Promise<number> = edgeChannel35.emit("created", {
  channel: 35,
  id: "item-35",
});
export const edgeChannel35Updated: Promise<number> = edgeChannel35.emit("updated", {
  channel: 35,
  version: 35,
});
export const edgeChannel35Deleted: Promise<number> = edgeChannel35.emit("deleted", {
  channel: 35,
  id: "item-35",
});
export const edgeChannel35Typing: Promise<number> = edgeChannel35.emit("typing", {
  channel: 35,
  userId: "user-35",
});
export const edgeChannel35Load: Promise<
  InferOutput<(typeof api.channels.channel35)["procedures"]["load"]>
> = edgeChannel35.call("load", { cursor: 35, channel: 35 });
export const edgeChannel35Moderate: Promise<
  InferOutput<(typeof api.channels.channel35)["procedures"]["moderate"]>
> = edgeChannel35.call("moderate", { userId: "user-35", channel: 35 });

const edgeChannel36Params: InferChannelParams<typeof api.channels.channel36> = {
  roomId: "room-36",
};
const edgeChannel36 = hosts.channels.channel36(edgeChannel36Params);
export const edgeChannel36Created: Promise<number> = edgeChannel36.emit("created", {
  channel: 36,
  id: "item-36",
});
export const edgeChannel36Updated: Promise<number> = edgeChannel36.emit("updated", {
  channel: 36,
  version: 36,
});
export const edgeChannel36Deleted: Promise<number> = edgeChannel36.emit("deleted", {
  channel: 36,
  id: "item-36",
});
export const edgeChannel36Typing: Promise<number> = edgeChannel36.emit("typing", {
  channel: 36,
  userId: "user-36",
});
export const edgeChannel36Load: Promise<
  InferOutput<(typeof api.channels.channel36)["procedures"]["load"]>
> = edgeChannel36.call("load", { cursor: 36, channel: 36 });
export const edgeChannel36Moderate: Promise<
  InferOutput<(typeof api.channels.channel36)["procedures"]["moderate"]>
> = edgeChannel36.call("moderate", { userId: "user-36", channel: 36 });

const edgeChannel37Params: InferChannelParams<typeof api.channels.channel37> = {
  roomId: "room-37",
};
const edgeChannel37 = hosts.channels.channel37(edgeChannel37Params);
export const edgeChannel37Created: Promise<number> = edgeChannel37.emit("created", {
  channel: 37,
  id: "item-37",
});
export const edgeChannel37Updated: Promise<number> = edgeChannel37.emit("updated", {
  channel: 37,
  version: 37,
});
export const edgeChannel37Deleted: Promise<number> = edgeChannel37.emit("deleted", {
  channel: 37,
  id: "item-37",
});
export const edgeChannel37Typing: Promise<number> = edgeChannel37.emit("typing", {
  channel: 37,
  userId: "user-37",
});
export const edgeChannel37Load: Promise<
  InferOutput<(typeof api.channels.channel37)["procedures"]["load"]>
> = edgeChannel37.call("load", { cursor: 37, channel: 37 });
export const edgeChannel37Moderate: Promise<
  InferOutput<(typeof api.channels.channel37)["procedures"]["moderate"]>
> = edgeChannel37.call("moderate", { userId: "user-37", channel: 37 });

const edgeChannel38Params: InferChannelParams<typeof api.channels.channel38> = {
  roomId: "room-38",
};
const edgeChannel38 = hosts.channels.channel38(edgeChannel38Params);
export const edgeChannel38Created: Promise<number> = edgeChannel38.emit("created", {
  channel: 38,
  id: "item-38",
});
export const edgeChannel38Updated: Promise<number> = edgeChannel38.emit("updated", {
  channel: 38,
  version: 38,
});
export const edgeChannel38Deleted: Promise<number> = edgeChannel38.emit("deleted", {
  channel: 38,
  id: "item-38",
});
export const edgeChannel38Typing: Promise<number> = edgeChannel38.emit("typing", {
  channel: 38,
  userId: "user-38",
});
export const edgeChannel38Load: Promise<
  InferOutput<(typeof api.channels.channel38)["procedures"]["load"]>
> = edgeChannel38.call("load", { cursor: 38, channel: 38 });
export const edgeChannel38Moderate: Promise<
  InferOutput<(typeof api.channels.channel38)["procedures"]["moderate"]>
> = edgeChannel38.call("moderate", { userId: "user-38", channel: 38 });

const edgeChannel39Params: InferChannelParams<typeof api.channels.channel39> = {
  roomId: "room-39",
};
const edgeChannel39 = hosts.channels.channel39(edgeChannel39Params);
export const edgeChannel39Created: Promise<number> = edgeChannel39.emit("created", {
  channel: 39,
  id: "item-39",
});
export const edgeChannel39Updated: Promise<number> = edgeChannel39.emit("updated", {
  channel: 39,
  version: 39,
});
export const edgeChannel39Deleted: Promise<number> = edgeChannel39.emit("deleted", {
  channel: 39,
  id: "item-39",
});
export const edgeChannel39Typing: Promise<number> = edgeChannel39.emit("typing", {
  channel: 39,
  userId: "user-39",
});
export const edgeChannel39Load: Promise<
  InferOutput<(typeof api.channels.channel39)["procedures"]["load"]>
> = edgeChannel39.call("load", { cursor: 39, channel: 39 });
export const edgeChannel39Moderate: Promise<
  InferOutput<(typeof api.channels.channel39)["procedures"]["moderate"]>
> = edgeChannel39.call("moderate", { userId: "user-39", channel: 39 });

export { batchLink } from "./batch-link.js";
export type { BatchLinkOptions } from "./batch-link.js";
export { createClient } from "./client.js";
export type {
  Client,
  ChannelFactory,
  ClientAuth,
  ClientOptions,
  ProcedureArguments,
  ProcedureClient,
  ProcedureError,
} from "./client.js";
export type {
  AnyChannelContract,
  AnyContract,
  AnyProcedureContract,
  InferInput,
  InferOutput,
} from "@cable/contract";
export type { Link, LinkContext, LinkHandler, NextLink } from "./link.js";
export type {
  ChannelHandle,
  ChannelHistoryEvent,
  ChannelHistoryPage,
  InferChannel,
  ChannelPresence,
  ChannelProcedures,
  ChannelSenders,
  ChannelSocket,
  ChannelStatus,
  ChannelSubscription,
  HistoryInput,
  PresenceMember,
  SocketOptions,
  Unsubscribe,
} from "./channel-types.js";

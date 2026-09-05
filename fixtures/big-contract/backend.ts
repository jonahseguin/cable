import type { Api } from "./contract.js";

export interface BackendOnlyContext {
  readonly secret: string;
}

export type BackendContract = Api;

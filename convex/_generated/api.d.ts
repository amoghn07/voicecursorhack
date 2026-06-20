/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agent_fallback from "../agent/fallback.js";
import type * as crons from "../crons.js";
import type * as dispatch from "../dispatch.js";
import type * as http from "../http.js";
import type * as lib_format from "../lib/format.js";
import type * as maintenance from "../maintenance.js";
import type * as messages from "../messages.js";
import type * as orders from "../orders.js";
import type * as photon from "../photon.js";
import type * as seed from "../seed.js";
import type * as services_index from "../services/index.js";
import type * as services_types from "../services/types.js";
import type * as services_uber from "../services/uber.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  "agent/fallback": typeof agent_fallback;
  crons: typeof crons;
  dispatch: typeof dispatch;
  http: typeof http;
  "lib/format": typeof lib_format;
  maintenance: typeof maintenance;
  messages: typeof messages;
  orders: typeof orders;
  photon: typeof photon;
  seed: typeof seed;
  "services/index": typeof services_index;
  "services/types": typeof services_types;
  "services/uber": typeof services_uber;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

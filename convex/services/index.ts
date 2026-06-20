// ─── Service registry ──────────────────────────────────────────────────────
// Adding a new service = implement ServiceConnector, import it here, add a row
// to the `services` table (see seed.ts). Nothing else changes.

import type { ServiceConnector } from "./types.js";
import { uberConnector } from "./uber.js";

const registry: Record<string, ServiceConnector> = {
  [uberConnector.key]: uberConnector,
  // [starbucksConnector.key]: starbucksConnector,   // future
  // [doordashConnector.key]: doordashConnector,     // future
};

export function getConnector(key: string): ServiceConnector | undefined {
  return registry[key];
}

export function allConnectors(): ServiceConnector[] {
  return Object.values(registry);
}

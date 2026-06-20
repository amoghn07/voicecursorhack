// ─── Service-connector abstraction ──────────────────────────────────────────
// The "any service" core. Uber today; Starbucks / DoorDash tomorrow are pure
// additions — implement this interface, drop the file in services/, add a row.

/** A price/ETA preview with NO commitment. */
export interface Quote {
  priceUsd: number;
  etaMinutes: number;
  /** Human-readable product, e.g. "UberX". */
  productName: string;
  /** Free-form details the brain / formatter can surface. */
  details?: Record<string, unknown>;
}

/** Normalized live status of a placed order. */
export interface OrderStatus {
  /** Maps onto the order state machine. */
  state: "placed" | "in_progress" | "completed" | "cancelled" | "failed";
  /** Short human-readable status line, e.g. "Driver 2 min away". */
  note: string;
  etaMinutes?: number;
}

/** Context handed to connectors (saved prefs, etc.). Kept minimal + serializable. */
export interface ConnectorContext {
  prefs: {
    home?: string;
    work?: string;
    paymentHint?: string;
  };
}

/** JSON-schema-ish description of what a connector can do, surfaced to the brain. */
export interface ToolSchema {
  service: string;
  description: string;
  actions: Record<
    string,
    { description: string; params: Record<string, { type: string; description: string; required?: boolean }> }
  >;
}

/**
 * Uniform interface every service implements. `quote` previews, `place`
 * commits (spends money), `status` polls, `cancel` aborts.
 */
export interface ServiceConnector {
  key: string;
  displayName: string;
  toolSchema: ToolSchema;
  quote(params: Record<string, unknown>, ctx: ConnectorContext): Promise<Quote>;
  place(params: Record<string, unknown>, ctx: ConnectorContext): Promise<{ externalId: string }>;
  status(externalId: string, ctx: ConnectorContext): Promise<OrderStatus>;
  cancel(externalId: string, ctx: ConnectorContext): Promise<void>;
}

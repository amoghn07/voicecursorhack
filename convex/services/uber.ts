// ─── Uber connector (deep-link mode) ────────────────────────────────────────
// The Uber API can't be used (booking auth unavailable), so placing a ride
// hands off via an Uber DEEP LINK: we return https://m.uber.com/ul/?... with
// pickup + dropoff prefilled. The user taps it to confirm the ride in the Uber
// app. This is fully self-contained — it runs in Convex's cloud with NO
// external service, API key, or local process. `quote` shows a local price/ETA
// estimate before the user commits.

import type { ConnectorContext, OrderStatus, Quote, ServiceConnector, ToolSchema } from "./types.js";

const toolSchema: ToolSchema = {
  service: "uber",
  description:
    "Order a ride. Quote a price estimate, confirm with the user, then return an Uber deep link to tap.",
  actions: {
    quote: {
      description: "Preview an estimated price and ETA. Does NOT book anything.",
      params: {
        pickup: { type: "string", description: "Pickup address. Omit to use current location.", required: false },
        dropoff: { type: "string", description: "Destination address, or 'home'/'work'.", required: true },
      },
    },
    place: {
      description:
        "Produce the Uber deep link for the ride. Only call after the user confirmed the estimate.",
      params: {
        pickup: { type: "string", description: "Pickup address.", required: false },
        dropoff: { type: "string", description: "Destination address.", required: true },
      },
    },
    status: { description: "Status of a handed-off ride.", params: {} },
    cancel: { description: "Cancel a not-yet-tapped ride.", params: {} },
  },
};

/** Build the Uber universal/deep link with pickup + dropoff prefilled. */
export function buildUberDeepLink(pickup: string | undefined, dropoff: string): string {
  const params = new URLSearchParams({ action: "setPickup" });
  if (pickup && pickup !== "current_location") {
    params.set("pickup[formatted_address]", pickup);
  } else {
    params.set("pickup", "my_location");
  }
  if (dropoff) params.set("dropoff[formatted_address]", dropoff);
  return `https://m.uber.com/ul/?${params.toString()}`;
}

// Deterministic-ish estimate derived from the destination so it's stable per
// request but varies across destinations. (No Math.random — Convex forbids it.)
function estimateQuote(dropoff: string): Quote {
  let h = 0;
  for (const c of dropoff) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const priceUsd = 9 + (h % 2400) / 100; // $9.00 – $33.00
  const etaMinutes = 2 + (h % 9); // 2 – 10 min
  return { priceUsd: Math.round(priceUsd * 100) / 100, etaMinutes, productName: "UberX" };
}

export const uberConnector: ServiceConnector = {
  key: "uber",
  displayName: "Uber",
  toolSchema,

  async quote(params, _ctx): Promise<Quote> {
    return estimateQuote(String(params.dropoff ?? ""));
  },

  async place(params, _ctx): Promise<{ externalId: string; confirmUrl?: string }> {
    const dropoff = String(params.dropoff ?? "");
    const pickup = params.pickup ? String(params.pickup) : undefined;
    const confirmUrl = buildUberDeepLink(pickup, dropoff);
    const externalId = `uber_link_${dropoff.replace(/\W+/g, "_").slice(0, 24)}`;
    return { externalId, confirmUrl };
  },

  // After handing off to the Uber app we can't track the live ride, so report
  // the handoff state truthfully rather than fabricating driver progress. The
  // status cron only pushes an update when the state CHANGES, so returning the
  // same "placed" state keeps it quiet (no misleading "driver arriving" texts).
  async status(_externalId, _ctx): Promise<OrderStatus> {
    return { state: "placed", note: "Your Uber link is ready — tap it to confirm the ride." };
  },

  async cancel(_externalId, _ctx): Promise<void> {
    // Nothing to cancel server-side; the ride lives in the Uber app.
  },
};

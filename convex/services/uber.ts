// ─── Uber connector ──────────────────────────────────────────────────────
// THIS IS WHERE THE UBER API CONNECTS (teammate's work).
// When UBER_API_BASE_URL is set, every method proxies to that HTTP service.
// When it is unset, the connector returns realistic FAKE data so the whole
// demo runs end-to-end with zero credentials (the QuoteAgent mock-fallback
// pattern). The interface the brain sees is identical either way.

import type { ConnectorContext, OrderStatus, Quote, ServiceConnector, ToolSchema } from "./types.js";

const toolSchema: ToolSchema = {
  service: "uber",
  description: "Order a ride. Always quote and confirm the price before placing.",
  actions: {
    quote: {
      description: "Preview price and ETA for a ride. Does NOT book anything.",
      params: {
        pickup: { type: "string", description: "Pickup address. Omit to use current/home.", required: false },
        dropoff: { type: "string", description: "Destination address, or 'home'/'work'.", required: true },
      },
    },
    place: {
      description: "Book the ride. Only call after the user confirmed the quoted price.",
      params: {
        pickup: { type: "string", description: "Pickup address.", required: false },
        dropoff: { type: "string", description: "Destination address.", required: true },
      },
    },
    status: { description: "Get live status of a booked ride.", params: {} },
    cancel: { description: "Cancel a booked ride.", params: {} },
  },
};

function baseUrl(): string | undefined {
  return process.env.UBER_API_BASE_URL?.replace(/\/$/, "");
}

async function proxy<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Uber API ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// Deterministic-ish fake numbers derived from the destination string so the
// demo is stable per request but varies across destinations. (No Math.random.)
function fakeQuote(dropoff: string): Quote {
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
    const dropoff = String(params.dropoff ?? "");
    if (baseUrl()) return proxy<Quote>("/quote", params);
    return fakeQuote(dropoff);
  },

  async place(params, _ctx): Promise<{ externalId: string; confirmUrl?: string }> {
    if (baseUrl()) return proxy<{ externalId: string; confirmUrl?: string }>("/place", params);
    // Fake a stable-looking external id from the destination.
    const dropoff = String(params.dropoff ?? "ride");
    return { externalId: `uber_fake_${dropoff.replace(/\W+/g, "_").slice(0, 16)}` };
  },

  async status(externalId, _ctx): Promise<OrderStatus> {
    if (baseUrl()) return proxy<OrderStatus>("/status", { externalId });
    return { state: "in_progress", note: "Driver is on the way", etaMinutes: 3 };
  },

  async cancel(externalId, _ctx): Promise<void> {
    if (baseUrl()) {
      await proxy("/cancel", { externalId });
      return;
    }
    // No-op in fake mode.
  },
};

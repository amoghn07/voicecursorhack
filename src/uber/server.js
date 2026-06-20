// Standalone HTTP service for the Convex Uber connector (convex/services/uber.ts).
// Run this and point Convex at it via: npx convex env set UBER_API_BASE_URL <this-url>
//
// Real ride-booking via Uber's Ride Request API requires a user-scoped OAuth
// token, and Uber does not issue those for sandbox apps — so /place can't
// actually book a ride server-side. Instead it returns a real Uber Universal
// Deep Link (no API key needed) that the user taps to confirm in the Uber app,
// which is the PRD's intended demo path.
import http from "node:http";
import { buildUberDeepLink } from "./deepLink.js";

const PORT = process.env.UBER_SERVICE_PORT || 4001;

// In-memory order store, keyed by externalId. Fine for a hackathon demo process.
const orders = new Map();

function fakeQuote(dropoff) {
  let h = 0;
  for (const c of dropoff) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const priceUsd = 9 + (h % 2400) / 100; // $9.00 - $33.00
  const etaMinutes = 2 + (h % 9); // 2 - 10 min
  return { priceUsd: Math.round(priceUsd * 100) / 100, etaMinutes, productName: "UberX" };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }

  if (req.url === "/quote") {
    const dropoff = String(body.dropoff ?? "");
    const quote = fakeQuote(dropoff);
    sendJson(res, 200, quote);
    return;
  }

  if (req.url === "/place") {
    const pickup = body.pickup;
    const dropoff = String(body.dropoff ?? "");
    const confirmUrl = buildUberDeepLink({ pickup, dropoff });
    const externalId = `uber_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    orders.set(externalId, { pickup, dropoff, confirmUrl, state: "placed" });
    sendJson(res, 200, { externalId, confirmUrl });
    return;
  }

  if (req.url === "/status") {
    const order = orders.get(body.externalId);
    if (!order) {
      sendJson(res, 404, { error: "unknown externalId" });
      return;
    }
    sendJson(res, 200, {
      state: order.state,
      note: `Tap the confirmation link to finish booking in the Uber app: ${order.confirmUrl}`,
    });
    return;
  }

  if (req.url === "/cancel") {
    const order = orders.get(body.externalId);
    if (order) order.state = "cancelled";
    sendJson(res, 200, {});
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`Uber connector service listening on http://localhost:${PORT}`);
});

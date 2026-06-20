// Standalone HTTP service for the Convex Uber connector (convex/services/uber.ts).
// Run this and point Convex at it via: npx convex env set UBER_API_BASE_URL <this-url>
//
// Two ride-placement paths:
//   1. Real Uber sandbox OAuth (preferred when authorized) — see /auth/uber/start.
//   2. Uber Universal Deep Link fallback (no API key needed) — used automatically
//      if no user has authorized the app yet, or if the real request fails.
import http from "node:http";
import "dotenv/config";
import { buildUberDeepLink } from "./deepLink.js";
import { buildAuthorizeUrl, exchangeCodeForToken } from "./auth.js";
import { requestRide } from "./rideRequest.js";

// Defaults to 3000 to match the redirect URI (localhost:3000/auth/uber/callback)
// registered in the Uber developer dashboard. Override only if you also update
// UBER_REDIRECT_URI and the dashboard's registered redirect URI to match.
const PORT = process.env.UBER_SERVICE_PORT || 3000;

// In-memory order + token store. Fine for a hackathon demo process.
const orders = new Map();
let userAccessToken = null;

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

function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html" });
  res.end(html);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- OAuth: kick off the sandbox authorization flow ---
  if (req.method === "GET" && url.pathname === "/auth/uber/start") {
    res.writeHead(302, { Location: buildAuthorizeUrl() });
    res.end();
    return;
  }

  // --- OAuth: Uber redirects here with ?code= after the user authorizes ---
  if (req.method === "GET" && url.pathname === "/auth/uber/callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");
      console.error("Uber callback missing code. Full query:", url.search);
      sendHtml(
        res,
        400,
        `Missing ?code in callback.<br>error: ${error}<br>error_description: ${errorDescription}`,
      );
      return;
    }
    try {
      const token = await exchangeCodeForToken(code);
      userAccessToken = token.access_token;
      console.log("Uber access token acquired, expires_in:", token.expires_in);
      sendHtml(res, 200, "<h1>Uber account linked.</h1> You can close this tab.");
    } catch (err) {
      console.error(err);
      sendHtml(res, 500, `Token exchange failed: ${err.message}`);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/uber/status") {
    sendJson(res, 200, { authorized: Boolean(userAccessToken) });
    return;
  }

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

  if (url.pathname === "/quote") {
    const dropoff = String(body.dropoff ?? "");
    const quote = fakeQuote(dropoff);
    sendJson(res, 200, quote);
    return;
  }

  if (url.pathname === "/place") {
    const pickup = body.pickup;
    const dropoff = String(body.dropoff ?? "");

    if (userAccessToken) {
      try {
        const result = await requestRide({
          accessToken: userAccessToken,
          startAddress: pickup,
          endAddress: dropoff,
        });
        const externalId = result.request_id ?? `uber_${Date.now()}`;
        orders.set(externalId, { pickup, dropoff, state: "placed", real: true });
        sendJson(res, 200, { externalId });
        return;
      } catch (err) {
        console.error("Real ride request failed, falling back to deep link:", err.message);
      }
    }

    const confirmUrl = buildUberDeepLink({ pickup, dropoff });
    const externalId = `uber_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    orders.set(externalId, { pickup, dropoff, confirmUrl, state: "placed" });
    sendJson(res, 200, { externalId, confirmUrl });
    return;
  }

  if (url.pathname === "/status") {
    const order = orders.get(body.externalId);
    if (!order) {
      sendJson(res, 404, { error: "unknown externalId" });
      return;
    }
    sendJson(res, 200, {
      state: order.state,
      note: order.confirmUrl
        ? `Tap the confirmation link to finish booking in the Uber app: ${order.confirmUrl}`
        : "Driver is on the way",
    });
    return;
  }

  if (url.pathname === "/cancel") {
    const order = orders.get(body.externalId);
    if (order) order.state = "cancelled";
    sendJson(res, 200, {});
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`Uber connector service listening on http://localhost:${PORT}`);
  console.log(`Authorize a user via: http://localhost:${PORT}/auth/uber/start`);
});

// ─── HTTP contract (served on …convex.site) ─────────────────────────────────
//   Photon → Convex (RPC):  /photon/message · /photon/context · /photon/tools · /photon/action
//   Demo / device-free:     /mock/incoming
//   Service callbacks:      /events/uber
// All routes require the X-Api-Key header to match the API_KEY env var.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";

const http = httpRouter();

function authed(request: Request): boolean {
  const expected = process.env.API_KEY;
  if (!expected) return true; // unset → open (local/dev convenience)
  return request.headers.get("X-Api-Key") === expected;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauthorized = () => json({ error: "unauthorized" }, 401);

// POST /mock/incoming  { handle, text }  → run the rule-based agent end-to-end.
http.route({
  path: "/mock/incoming",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authed(request)) return unauthorized();
    const { handle, text } = await request.json();
    if (!handle || !text) return json({ error: "handle and text required" }, 400);
    const result = await ctx.runAction(api.agent.handleInbound, {
      handle,
      text,
      source: "mock",
    });
    return json(result);
  }),
});

// POST /photon/message  { handle, direction, text, source?, speak? }  → log only.
http.route({
  path: "/photon/message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authed(request)) return unauthorized();
    const body = await request.json();
    const conversationId = await ctx.runMutation(api.messages.logMessage, {
      handle: body.handle,
      direction: body.direction,
      text: body.text,
      source: body.source ?? "imessage",
      speak: body.speak,
    });
    return json({ conversationId });
  }),
});

// GET /photon/context?conversationId=...
http.route({
  path: "/photon/context",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authed(request)) return unauthorized();
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (!conversationId) return json({ error: "conversationId required" }, 400);
    const context = await ctx.runQuery(api.messages.getContext, {
      conversationId: conversationId as any,
    });
    const tools = await ctx.runQuery(api.photon.getTools, {});
    return json({ ...context, tools });
  }),
});

// GET /photon/tools  → enabled service tool schemas.
http.route({
  path: "/photon/tools",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authed(request)) return unauthorized();
    const tools = await ctx.runQuery(api.photon.getTools, {});
    return json({ tools });
  }),
});

// POST /photon/action  { conversationId, serviceKey, action, params }
http.route({
  path: "/photon/action",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authed(request)) return unauthorized();
    const body = await request.json();
    try {
      const result = await ctx.runAction(api.dispatch.executeServiceAction, {
        conversationId: body.conversationId,
        serviceKey: body.serviceKey,
        action: body.action,
        params: body.params,
      });
      return json(result);
    } catch (e) {
      return json({ error: String(e) }, 400);
    }
  }),
});

// POST /events/uber  { externalId, state, note? }  → record a status callback.
http.route({
  path: "/events/uber",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authed(request)) return unauthorized();
    const body = await request.json();
    await ctx.runMutation(internal.orders.recordExternalEvent, {
      externalId: body.externalId,
      state: body.state,
      note: body.note,
    });
    return json({ ok: true });
  }),
});

export default http;

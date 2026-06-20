// ─── Photon integration helpers ─────────────────────────────────────────────
// Photon owns iMessage + the LLM brain. Convex exposes tool schemas it reads,
// and pushes proactive outbound (status updates) to its webhook.
import { v } from "convex/values";
import { internalAction, query } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { allConnectors } from "./services/index.js";

/** Tool schemas for the brain's system prompt — surfaced via GET /photon/tools. */
export const getTools = query({
  args: {},
  handler: async (ctx) => {
    const services = await ctx.db
      .query("services")
      .collect();
    const enabled = new Set(services.filter((s) => s.enabled).map((s) => s.key));
    return allConnectors()
      .filter((c) => enabled.size === 0 || enabled.has(c.key))
      .map((c) => c.toolSchema);
  },
});

/**
 * Proactive outbound: queue the message AND push it to Photon for delivery
 * over iMessage. Used by the status-poll cron. No-ops the push if no webhook
 * is configured (demo mode) — the message still lands in the transcript.
 */
export const pushOutbound = internalAction({
  args: {
    conversationId: v.id("conversations"),
    handle: v.string(),
    text: v.string(),
    speak: v.union(v.literal("none"), v.literal("normal"), v.literal("emphatic")),
  },
  handler: async (ctx, { conversationId, handle, text, speak }) => {
    await ctx.runMutation(internal.messages.queueOutbound, { conversationId, text, speak });
    const webhook = process.env.PHOTON_WEBHOOK_URL;
    if (!webhook) return { delivered: false, reason: "no PHOTON_WEBHOOK_URL (demo mode)" };
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": process.env.API_KEY ?? "",
        },
        body: JSON.stringify({ handle, text }),
      });
      return { delivered: res.ok, status: res.status };
    } catch (e) {
      return { delivered: false, reason: String(e) };
    }
  },
});

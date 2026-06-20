// ─── Order lifecycle ─────────────────────────────────────────────────────
// draft → quoted → awaiting_confirmation → placed → in_progress → completed
//                                                  (+ cancelled, failed)
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server.js";
import { orderStatusValidator } from "./schema.js";
import type { Doc } from "./_generated/dataModel.js";

const OPEN = ["draft", "quoted", "awaiting_confirmation", "placed", "in_progress"];

export const createOrder = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    serviceKey: v.string(),
    params: v.any(),
    quote: v.optional(v.any()),
    status: orderStatusValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("orders", {
      conversationId: args.conversationId,
      serviceKey: args.serviceKey,
      params: args.params,
      quote: args.quote,
      status: args.status,
      events: [{ at: Date.now(), status: args.status }],
    });
  },
});

export const transitionOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    status: orderStatusValidator,
    externalId: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("order not found");
    await ctx.db.patch(args.orderId, {
      status: args.status,
      ...(args.externalId ? { externalId: args.externalId } : {}),
      events: [...order.events, { at: Date.now(), status: args.status, note: args.note }],
    });
  },
});

/** Most recent open order for a conversation (used by confirm/cancel). */
export const latestOpenOrder = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .collect();
    return orders.find((o: Doc<"orders">) => OPEN.includes(o.status)) ?? null;
  },
});

/** Orders the status-poll cron should advance, each tagged with its handle. */
export const inFlightOrders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const placed = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "placed"))
      .collect();
    const inProgress = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();
    const out = [];
    for (const order of [...placed, ...inProgress]) {
      const convo = await ctx.db.get(order.conversationId);
      const contact = convo ? await ctx.db.get(convo.contactId) : null;
      out.push({
        _id: order._id,
        conversationId: order.conversationId,
        serviceKey: order.serviceKey,
        status: order.status,
        externalId: order.externalId,
        handle: contact?.handle ?? "",
      });
    }
    return out;
  },
});

/** Map a service-callback state onto the order state machine. */
export const recordExternalEvent = internalMutation({
  args: {
    externalId: v.string(),
    state: v.union(
      v.literal("placed"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("orders").collect();
    const order = all.find((o: Doc<"orders">) => o.externalId === args.externalId);
    if (!order) return { matched: false };
    await ctx.db.patch(order._id, {
      status: args.state,
      events: [...order.events, { at: Date.now(), status: args.state, note: args.note }],
    });
    return { matched: true, orderId: order._id, conversationId: order.conversationId };
  },
});

/** Public read for /admin-style inspection. */
export const listForConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
  },
});

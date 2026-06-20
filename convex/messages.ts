// ─── Conversation + message helpers ─────────────────────────────────────────
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server.js";
import { speakValidator } from "./schema.js";
import type { Doc, Id } from "./_generated/dataModel.js";

const MAX_CONTEXT_MESSAGES = 20;

/** Find or create the contact + conversation for a Photon sender handle. */
async function resolveConversation(
  ctx: { db: any },
  handle: string,
): Promise<Id<"conversations">> {
  let contact = await ctx.db
    .query("contacts")
    .withIndex("by_handle", (q: any) => q.eq("handle", handle))
    .unique();
  if (!contact) {
    const contactId = await ctx.db.insert("contacts", { handle, prefs: {} });
    contact = await ctx.db.get(contactId);
  }
  let convo = await ctx.db
    .query("conversations")
    .withIndex("by_contact", (q: any) => q.eq("contactId", contact!._id))
    .first();
  if (!convo) {
    const convoId = await ctx.db.insert("conversations", {
      contactId: contact!._id,
      status: "active",
      lastMessageAt: Date.now(),
    });
    return convoId;
  }
  return convo._id;
}

/** Log an inbound or outbound message. Returns conversationId. */
export const logMessage = mutation({
  args: {
    handle: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    text: v.string(),
    source: v.union(v.literal("imessage"), v.literal("mock"), v.literal("system")),
    speak: v.optional(speakValidator),
  },
  handler: async (ctx, args) => {
    const conversationId = await resolveConversation(ctx, args.handle);
    await ctx.db.insert("messages", {
      conversationId,
      direction: args.direction,
      text: args.text,
      source: args.source,
      speak: args.speak ?? (args.direction === "out" ? "normal" : "none"),
      spoken: false,
    });
    await ctx.db.patch(conversationId, { lastMessageAt: Date.now() });
    return conversationId;
  },
});

/** Internal variant used by the agent / actions. */
export const queueOutbound = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    text: v.string(),
    speak: speakValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      direction: "out",
      text: args.text,
      source: "system",
      speak: args.speak,
      spoken: false,
    });
    await ctx.db.patch(args.conversationId, { lastMessageAt: Date.now() });
  },
});

/** Full conversation context for the brain: transcript + prefs + open orders. */
export const getContext = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const convo = await ctx.db.get(conversationId);
    if (!convo) return null;
    const contact = await ctx.db.get(convo.contactId);
    const messages = (
      await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
        .order("desc")
        .take(MAX_CONTEXT_MESSAGES)
    ).reverse();
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    const openOrders = orders.filter(
      (o) => !["completed", "cancelled", "failed"].includes(o.status),
    );
    return {
      handle: contact?.handle,
      prefs: contact?.prefs ?? {},
      messages: messages.map((m: Doc<"messages">) => ({
        direction: m.direction,
        text: m.text,
        at: m._creationTime,
      })),
      openOrders,
    };
  },
});

/** Outbound messages not yet spoken — read by the local TTS helper. */
export const getUnspoken = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_unspoken", (q) => q.eq("direction", "out").eq("spoken", false))
      .collect();
    return rows
      .filter((m) => m.speak !== "none")
      .map((m) => ({ id: m._id, text: m.text, speak: m.speak }));
  },
});

export const markSpoken = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { spoken: true });
  },
});

/** Helper for actions to read a conversation's contact prefs. */
export const getPrefs = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const convo = await ctx.db.get(conversationId);
    if (!convo) return {};
    const contact = await ctx.db.get(convo.contactId);
    return contact?.prefs ?? {};
  },
});

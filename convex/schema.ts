import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Data model ────────────────────────────────────────────────────────────
// The backend is the system-of-record + tool-execution service. iMessage
// transport and the LLM brain live in Photon (a teammate). Convex stores
// identity/state, runs the pluggable service-connector layer, and owns the
// order lifecycle. See the plan for the full architecture.

/** TTS hint read by the local `say` helper for eyes-free output. */
export const speakValidator = v.union(
  v.literal("none"),
  v.literal("normal"),
  v.literal("emphatic"),
);

/** Order lifecycle — explicit confirm-before-commit for money-spending actions. */
export const orderStatusValidator = v.union(
  v.literal("draft"),
  v.literal("quoted"),
  v.literal("awaiting_confirmation"),
  v.literal("placed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("failed"),
);

export default defineSchema({
  // Who the user is + saved preferences so "take me home" resolves.
  contacts: defineTable({
    handle: v.string(), // phone (E.164) or email — the Photon sender id
    displayName: v.optional(v.string()),
    prefs: v.object({
      home: v.optional(v.string()),
      work: v.optional(v.string()),
      paymentHint: v.optional(v.string()),
      // Accessibility prefs (e.g. speak everything, verbosity).
      speakEverything: v.optional(v.boolean()),
    }),
  }).index("by_handle", ["handle"]),

  // One thread per user.
  conversations: defineTable({
    contactId: v.id("contacts"),
    status: v.union(v.literal("active"), v.literal("idle")),
    lastMessageAt: v.number(),
  }).index("by_contact", ["contactId"]),

  // Full transcript + the TTS hint for outbound.
  messages: defineTable({
    conversationId: v.id("conversations"),
    direction: v.union(v.literal("in"), v.literal("out")),
    text: v.string(),
    source: v.union(v.literal("imessage"), v.literal("mock"), v.literal("system")),
    speak: speakValidator,
    // Set true once the local TTS helper has spoken this outbound message.
    spoken: v.optional(v.boolean()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_unspoken", ["direction", "spoken"]),

  // Registry of pluggable services + the tool schema surfaced to the brain.
  services: defineTable({
    key: v.string(), // "uber"
    displayName: v.string(),
    enabled: v.boolean(),
    toolSchema: v.any(), // JSON schema describing the connector's actions
    connectorConfig: v.optional(v.any()),
  }).index("by_key", ["key"]),

  // Service-agnostic order lifecycle.
  orders: defineTable({
    conversationId: v.id("conversations"),
    serviceKey: v.string(),
    status: orderStatusValidator,
    params: v.any(), // e.g. { pickup, dropoff } — service-specific
    quote: v.optional(v.any()), // e.g. { priceUsd, etaMinutes, productName }
    externalId: v.optional(v.string()), // id from the underlying service
    events: v.array(
      v.object({ at: v.number(), status: orderStatusValidator, note: v.optional(v.string()) }),
    ),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_status", ["status"]),
});

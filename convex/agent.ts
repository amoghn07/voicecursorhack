// ─── Inbound orchestrator ────────────────────────────────────────────────
// Drives an inbound user message through the rule-based fallback agent:
// parse → quote → confirm → place, using the pluggable service connectors and
// the order state machine. Used by /mock/incoming and (optionally) by Photon
// when DEMO_MODE routes inbound through the fallback rather than the LLM brain.
import { v } from "convex/values";
import { action } from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";
import { getConnector } from "./services/index.js";
import { parseIntent, resolveDestination } from "./agent/fallback.js";
import * as fmt from "./lib/format.js";

const UBER = "uber";

export const handleInbound = action({
  args: {
    handle: v.string(),
    text: v.string(),
    source: v.union(v.literal("imessage"), v.literal("mock")),
  },
  handler: async (ctx, { handle, text, source }) => {
    // 1. Log the inbound message; get the conversation.
    const conversationId = await ctx.runMutation(api.messages.logMessage, {
      handle,
      direction: "in",
      text,
      source,
      speak: "none",
    });

    // 2. Load context.
    const context = await ctx.runQuery(api.messages.getContext, { conversationId });
    const prefs = (context?.prefs ?? {}) as { home?: string; work?: string };
    const pending = (context?.openOrders ?? []).find(
      (o: any) => o.status === "awaiting_confirmation",
    );

    // Did our previous reply ask for a home/work address? If so, the next
    // message is the answer to capture. (Inferred from the transcript so no
    // extra state is needed.)
    const lastOut = [...(context?.messages ?? [])]
      .reverse()
      .find((m: any) => m.direction === "out");
    const awaitingAddressFor = lastOut?.text
      ?.match(/don'?t have your (home|work) address saved/i)?.[1]
      ?.toLowerCase() as "home" | "work" | undefined;

    // 3. Parse intent.
    const intent = parseIntent(text, { awaitingConfirmation: Boolean(pending) });

    // 4. Act. Each branch produces a Reply we queue (and return).
    let reply: fmt.Reply;

    if (
      awaitingAddressFor &&
      intent.kind !== "order" &&
      intent.kind !== "confirm" &&
      intent.kind !== "cancel"
    ) {
      // User is answering "what's your <label> address?" — save it, then quote
      // a ride to it so the flow continues without re-asking.
      const address = text.trim();
      await ctx.runMutation(internal.messages.savePref, {
        conversationId,
        key: awaitingAddressFor,
        value: address,
      });
      const connector = getConnector(UBER)!;
      const quote = await connector.quote(
        { dropoff: address },
        { prefs: { ...prefs, [awaitingAddressFor]: address } },
      );
      await ctx.runMutation(internal.orders.createOrder, {
        conversationId,
        serviceKey: UBER,
        params: { dropoff: address, dropoffLabel: awaitingAddressFor },
        quote,
        status: "awaiting_confirmation",
      });
      reply = fmt.addressSavedQuote(quote, awaitingAddressFor);
    } else if (intent.kind === "confirm" && pending) {
      const connector = getConnector(pending.serviceKey)!;
      const { externalId, confirmUrl } = await connector.place(pending.params, { prefs });
      await ctx.runMutation(internal.orders.transitionOrder, {
        orderId: pending._id,
        status: "placed",
        externalId,
        note: "user confirmed",
      });
      reply = fmt.orderPlaced(pending.params?.dropoffLabel ?? "your destination", confirmUrl);
    } else if (intent.kind === "cancel" && pending) {
      await ctx.runMutation(internal.orders.transitionOrder, {
        orderId: pending._id,
        status: "cancelled",
        note: "user declined",
      });
      reply = fmt.orderCancelled();
    } else if (intent.kind === "order") {
      const { resolved, label } = resolveDestination(intent.dropoff, prefs);
      if (!resolved) {
        reply = {
          text: `I don't have your ${label} address saved yet. What's the full address?`,
          speak: "normal",
        };
      } else {
        const connector = getConnector(UBER)!;
        const quote = await connector.quote({ dropoff: resolved, pickup: intent.pickup }, { prefs });
        await ctx.runMutation(internal.orders.createOrder, {
          conversationId,
          serviceKey: UBER,
          params: { dropoff: resolved, dropoffLabel: label, pickup: intent.pickup },
          quote,
          status: "awaiting_confirmation",
        });
        reply = fmt.quoteConfirmation(quote, label);
      }
    } else if (intent.kind === "need_destination") {
      reply = fmt.needDestination();
    } else if ((intent.kind === "confirm" || intent.kind === "cancel") && !pending) {
      reply = fmt.nothingToConfirm();
    } else {
      reply = fmt.didNotUnderstand();
    }

    // 5. Queue the outbound reply.
    await ctx.runMutation(internal.messages.queueOutbound, {
      conversationId,
      text: reply.text,
      speak: reply.speak,
    });

    return { conversationId, reply };
  },
});

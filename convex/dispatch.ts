// ─── Service-action dispatch (Photon /photon/action) ────────────────────────
// The thin RPC the real Photon brain calls to execute a connector method.
// Returns structured data PLUS a `suggestedReply` (accessible text + speak
// hint) the brain can send verbatim, so the confirm-before-commit UX and
// eyes-free formatting stay consistent regardless of who's driving.
import { v } from "convex/values";
import { action } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { getConnector } from "./services/index.js";
import * as fmt from "./lib/format.js";

export const executeServiceAction = action({
  args: {
    conversationId: v.id("conversations"),
    serviceKey: v.string(),
    action: v.union(
      v.literal("quote"),
      v.literal("place"),
      v.literal("status"),
      v.literal("cancel"),
    ),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const connector = getConnector(args.serviceKey);
    if (!connector) throw new Error(`unknown service: ${args.serviceKey}`);
    const prefs = await ctx.runQuery(internal.messages.getPrefs, {
      conversationId: args.conversationId,
    });
    const params = args.params ?? {};
    const label = params.dropoffLabel ?? params.dropoff ?? "your destination";

    switch (args.action) {
      case "quote": {
        const quote = await connector.quote(params, { prefs });
        const orderId = await ctx.runMutation(internal.orders.createOrder, {
          conversationId: args.conversationId,
          serviceKey: args.serviceKey,
          params,
          quote,
          status: "awaiting_confirmation",
        });
        return { orderId, quote, suggestedReply: fmt.quoteConfirmation(quote, label) };
      }
      case "place": {
        const pending = await ctx.runQuery(internal.orders.latestOpenOrder, {
          conversationId: args.conversationId,
        });
        if (!pending) throw new Error("no open order to place");
        const { externalId, confirmUrl } = await connector.place(pending.params, { prefs });
        await ctx.runMutation(internal.orders.transitionOrder, {
          orderId: pending._id,
          status: "placed",
          externalId,
        });
        return {
          orderId: pending._id,
          externalId,
          suggestedReply: fmt.orderPlaced(pending.params?.dropoffLabel ?? "your destination", confirmUrl),
        };
      }
      case "cancel": {
        const pending = await ctx.runQuery(internal.orders.latestOpenOrder, {
          conversationId: args.conversationId,
        });
        if (pending) {
          if (pending.externalId) await connector.cancel(pending.externalId, { prefs });
          await ctx.runMutation(internal.orders.transitionOrder, {
            orderId: pending._id,
            status: "cancelled",
          });
        }
        return { suggestedReply: fmt.orderCancelled() };
      }
      case "status": {
        const pending = await ctx.runQuery(internal.orders.latestOpenOrder, {
          conversationId: args.conversationId,
        });
        if (!pending?.externalId) {
          return { suggestedReply: fmt.statusUpdate("You don't have an active ride right now.") };
        }
        const status = await connector.status(pending.externalId, { prefs });
        return { status, suggestedReply: fmt.statusUpdate(status.note) };
      }
      default:
        throw new Error(`unsupported action: ${args.action}`);
    }
  },
});

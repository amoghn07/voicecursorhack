// ─── Background maintenance: proactive order status ─────────────────────────
// Polls in-flight orders, advances the state machine, and pushes a status
// update to the user over iMessage (via Photon) when the live status changes.
// Important for eyes-free use — the user shouldn't have to ask "where's my ride".
import { internalAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { getConnector } from "./services/index.js";

export const pollOrders = internalAction({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.runQuery(internal.orders.inFlightOrders, {});
    for (const order of orders) {
      if (!order.externalId) continue;
      const connector = getConnector(order.serviceKey);
      if (!connector) continue;
      let status;
      try {
        status = await connector.status(order.externalId, { prefs: {} });
      } catch {
        continue; // transient; try again next tick
      }
      // Only act when the machine state actually advances.
      if (status.state !== order.status) {
        await ctx.runMutation(internal.orders.transitionOrder, {
          orderId: order._id,
          status: status.state,
          note: status.note,
        });
        await ctx.runAction(internal.photon.pushOutbound, {
          conversationId: order.conversationId,
          handle: order.handle,
          text: status.note,
          speak: status.state === "completed" ? "emphatic" : "normal",
        });
      }
    }
    return { polled: orders.length };
  },
});

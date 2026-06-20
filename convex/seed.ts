// ─── Seed: service registry + a demo contact ───────────────────────────────
// Run with:  npx convex run seed:run
import { mutation } from "./_generated/server.js";
import { allConnectors } from "./services/index.js";

// Demo user so "home"/"work" resolve in the device-free walkthrough.
const DEMO_HANDLE = "+15551234567";
const DEMO_HOME = "742 Evergreen Terrace, Springfield";
const DEMO_WORK = "1 Market Street, San Francisco";

export const run = mutation({
  args: {},
  handler: async (ctx) => {
    // Register / refresh each service row from its connector's tool schema.
    for (const c of allConnectors()) {
      const existing = await ctx.db
        .query("services")
        .withIndex("by_key", (q) => q.eq("key", c.key))
        .unique();
      const row = {
        key: c.key,
        displayName: c.displayName,
        enabled: true,
        toolSchema: c.toolSchema,
      };
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("services", row);
    }

    // Demo contact with saved addresses.
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_handle", (q) => q.eq("handle", DEMO_HANDLE))
      .unique();
    const prefs = { home: DEMO_HOME, work: DEMO_WORK };
    if (contact) await ctx.db.patch(contact._id, { prefs });
    else await ctx.db.insert("contacts", { handle: DEMO_HANDLE, displayName: "Demo User", prefs });

    return { services: allConnectors().map((c) => c.key), demoHandle: DEMO_HANDLE };
  },
});

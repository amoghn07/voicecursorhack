import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

// Advance in-flight orders and push proactive status updates to the user.
crons.interval("poll order status", { seconds: 30 }, internal.maintenance.pollOrders, {});

export default crons;

// ─── Photon iMessage listener ───────────────────────────────────────────────
// Bridges inbound iMessage (via spectrum-ts) to the Convex concierge backend.
// Each inbound text is forwarded to the /mock/incoming HTTP contract (the
// rule-based agent the device-free demo exercises) and the agent's reply is
// sent back over iMessage — so texting the number drives the full
// quote → confirm → place flow instead of echoing.
//
// Run on a Mac (iMessage is macOS-only):  npm run photon
// Requires in .env: PROJECT_ID, PROJECT_SECRET, CONVEX_SITE_URL, API_KEY
import "dotenv/config";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const SITE = process.env.CONVEX_SITE_URL;
if (!SITE) throw new Error("Set CONVEX_SITE_URL (https://<deployment>.convex.site)");
const API_KEY = process.env.API_KEY ?? "";

/** Forward one inbound text to Convex and return the agent's reply text. */
async function ask(handle: string, text: string): Promise<string> {
  const res = await fetch(`${SITE}/mock/incoming`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
    body: JSON.stringify({ handle, text }),
  });
  if (!res.ok) {
    console.error(`Convex /mock/incoming ${res.status}: ${await res.text()}`);
    return "Sorry, I couldn't reach the concierge just now. Please try again.";
  }
  const body = await res.json();
  return body?.reply?.text ?? "Sorry, something went wrong.";
}

const app = await Spectrum({
  projectId: process.env.PROJECT_ID!,
  projectSecret: process.env.PROJECT_SECRET!,
  providers: [imessage.config()],
});

// Narrow to the iMessage provider so `space.phone` (the contact's handle) is typed.
for await (const [space, message] of imessage(app).messages) {
  if (message.content.type !== "text") continue;
  // A transient relay drop on send (gRPC "Connection dropped") must not kill the
  // whole agent — log it and keep listening so the next message still works.
  try {
    const reply = await ask(space.phone, message.content.text);
    await space.send(reply);
  } catch (err) {
    console.error(`Failed to handle/send message from ${space.phone}:`, err);
  }
}

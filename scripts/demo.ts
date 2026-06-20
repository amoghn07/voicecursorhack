// ─── Device-free end-to-end demo ────────────────────────────────────────────
// Hits the live HTTP contract on …convex.site exactly as Voice Cursor + Photon
// would, but without any device. Walks the full quote → confirm → place flow.
//
//   npm run demo        (reads CONVEX_SITE_URL / API_KEY from .env)
import "dotenv/config";
const site = process.env.CONVEX_SITE_URL;
if (!site) throw new Error("Set CONVEX_SITE_URL (https://<deployment>.convex.site)");
const apiKey = process.env.API_KEY ?? "";
const handle = process.env.DEMO_HANDLE ?? "+15551234567";

async function incoming(text: string) {
  const res = await fetch(`${site}/mock/incoming`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
    body: JSON.stringify({ handle, text }),
  });
  const body = await res.json();
  console.log(`\n👤 user: ${text}`);
  console.log(`🤖 agent [${body?.reply?.speak}]: ${body?.reply?.text}`);
  return body;
}

async function main() {
  console.log("=== VoiceCursor Concierge — device-free demo ===");
  await incoming("get me an uber home");
  await incoming("yes");
  console.log("\n✅ Flow complete. Inspect the `orders` table in the Convex dashboard for the state trail.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

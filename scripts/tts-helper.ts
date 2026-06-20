// ─── Local TTS helper (eyes-free output) ────────────────────────────────────
// Runs on the Mac. Polls Convex for unspoken outbound messages and reads them
// aloud with macOS `say`. `emphatic` messages (price confirmations, order
// placed/cancelled) use a slower, clearer voice. Complements VoiceOver.
//
//   CONVEX_URL=… API_KEY=… npx tsx scripts/tts-helper.ts
import { execFile } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const url = process.env.CONVEX_URL;
if (!url) throw new Error("Set CONVEX_URL (https://<deployment>.convex.cloud)");
const client = new ConvexHttpClient(url);

function say(text: string, emphatic: boolean): Promise<void> {
  // Siri-quality voice if present; slower rate for emphatic confirmations.
  const args = ["-v", "Samantha", "-r", emphatic ? "165" : "190", text];
  return new Promise((resolve) => execFile("say", args, () => resolve()));
}

async function tick() {
  const pending = await client.query(api.messages.getUnspoken, {});
  for (const m of pending) {
    console.log(`🔊 [${m.speak}] ${m.text}`);
    await say(m.text, m.speak === "emphatic");
    await client.mutation(api.messages.markSpoken, { id: m.id });
  }
}

console.log("🔊 Voice Cursor TTS helper running — speaking agent replies aloud.\n");
setInterval(() => {
  tick().catch((e) => console.error("tts tick error:", e));
}, 1500);

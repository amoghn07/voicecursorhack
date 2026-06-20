// Offline unit check of the rule-based agent (no Convex backend needed).
import { parseIntent, extractDestination, resolveDestination } from "../convex/agent/fallback.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// Intent parsing — fresh conversation (nothing pending).
const fresh = { awaitingConfirmation: false };
check("uber home", parseIntent("get me an uber home", fresh), { kind: "order", dropoff: "home" });
check("ride to work", parseIntent("I need a ride to work", fresh), { kind: "order", dropoff: "work" });
check("take me to the airport", parseIntent("take me to the airport", fresh), {
  kind: "order",
  dropoff: "Airport",
});
check("uber, no dest", parseIntent("call me an uber", fresh), { kind: "need_destination" });
check("gibberish", parseIntent("what's the weather", fresh), { kind: "unknown" });

// Confirmation handling — order awaiting yes/no.
const pending = { awaitingConfirmation: true };
check("yes", parseIntent("yes", pending), { kind: "confirm" });
check("book it", parseIntent("book it please", pending), { kind: "confirm" });
check("no", parseIntent("no thanks", pending), { kind: "cancel" });
check("cancel", parseIntent("cancel", pending), { kind: "cancel" });

// Destination extraction + resolution.
check("extract home", extractDestination("get me an uber home"), "home");
check("extract office", extractDestination("ride to the office"), "work");
check(
  "resolve home",
  resolveDestination("home", { home: "742 Evergreen Terrace" }),
  { resolved: "742 Evergreen Terrace", label: "home" },
);
check("resolve unset work", resolveDestination("work", {}), { resolved: null, label: "work" });
check(
  "resolve raw address",
  resolveDestination("Airport", {}),
  { resolved: "Airport", label: "Airport" },
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

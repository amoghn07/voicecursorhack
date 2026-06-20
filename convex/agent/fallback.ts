// ─── Rule-based fallback agent ──────────────────────────────────────────────
// Pure intent parsing — no Convex deps, easy to unit-test. Lets the FULL
// Uber flow demo with zero external services (no Photon, no LLM, no Uber key).
// When Photon's real brain is driving, it calls /photon/action directly and
// this fallback is bypassed.

export type Intent =
  | { kind: "order"; dropoff: string; pickup?: string }
  | { kind: "need_destination" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "unknown" };

const AFFIRMATIVE = /^(yes|yep|yeah|yup|sure|ok|okay|confirm|book it|do it|go|please do)\b/i;
const NEGATIVE = /^(no|nope|nah|cancel|stop|don'?t|nevermind|never mind)\b/i;

interface ParseOpts {
  /** True when an order is awaiting the user's yes/no. */
  awaitingConfirmation: boolean;
}

/**
 * Resolve the spoken request into an intent. `awaitingConfirmation` lets a bare
 * "yes"/"no" act on the pending quote.
 */
export function parseIntent(raw: string, opts: ParseOpts): Intent {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (opts.awaitingConfirmation) {
    if (AFFIRMATIVE.test(lower)) return { kind: "confirm" };
    if (NEGATIVE.test(lower)) return { kind: "cancel" };
  }

  // Ride intent: "uber", "ride", "lyft", "car", "pick me up", "take me".
  const wantsRide = /\b(uber|ride|lyft|car|taxi|pick me up|take me|drive me|get me a)\b/i.test(lower);
  if (wantsRide) {
    const dropoff = extractDestination(lower);
    if (dropoff) return { kind: "order", dropoff };
    return { kind: "need_destination" };
  }

  // A lone destination phrase right after we asked "where to?".
  if (opts.awaitingConfirmation === false) {
    const dropoff = extractDestination(lower);
    if (dropoff && /^(home|work|to |the )/i.test(lower)) return { kind: "order", dropoff };
  }

  return { kind: "unknown" };
}

/** Pull a destination out of free text. Returns 'home'/'work' or a raw address. */
export function extractDestination(lower: string): string | null {
  if (/\bhome\b/.test(lower)) return "home";
  if (/\b(work|office)\b/.test(lower)) return "work";
  // "to <place>" / "to the <place>"
  const m = lower.match(/\bto\s+(the\s+)?(.+?)(?:\s+(please|now|asap))?$/);
  if (m && m[2] && m[2].length > 1) return titleCase(m[2]);
  return null;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Resolve 'home'/'work' against saved prefs; otherwise pass the address through. */
export function resolveDestination(
  dropoff: string,
  prefs: { home?: string; work?: string },
): { resolved: string | null; label: string } {
  if (dropoff === "home") return { resolved: prefs.home ?? null, label: "home" };
  if (dropoff === "work") return { resolved: prefs.work ?? null, label: "work" };
  return { resolved: dropoff, label: dropoff };
}

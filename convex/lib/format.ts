// ─── Accessible response formatting ─────────────────────────────────────────
// Replies are read aloud (VoiceOver + the local `say` helper), so: short,
// front-loaded sentences; key facts (price, ETA, destination) stated early;
// no reliance on emoji/links/visual layout for meaning.

import type { Quote } from "../services/types.js";

export type Speak = "none" | "normal" | "emphatic";

export interface Reply {
  text: string;
  speak: Speak;
}

export function quoteConfirmation(quote: Quote, dropoff: string): Reply {
  // Lead with the spend, then the wait, then how to commit.
  const price = `$${quote.priceUsd.toFixed(2)}`;
  return {
    text: `${quote.productName} to ${dropoff} is ${price}, about ${quote.etaMinutes} minutes away. Reply YES to book, or NO to cancel.`,
    speak: "emphatic", // money-spending decision → always spoken clearly
  };
}

export function addressSavedQuote(quote: Quote, label: string): Reply {
  const base = quoteConfirmation(quote, label);
  return { text: `Saved your ${label} address. ${base.text}`, speak: base.speak };
}

export function orderPlaced(dropoff: string, confirmUrl?: string): Reply {
  if (confirmUrl) {
    return {
      text: `Your Uber to ${dropoff} is ready. Click here to confirm: ${confirmUrl}`,
      speak: "emphatic",
    };
  }
  return {
    text: `Booked. Your Uber to ${dropoff} is confirmed and on its way. I'll let you know when the driver is close.`,
    speak: "emphatic",
  };
}

export function orderCancelled(): Reply {
  return { text: "Okay, I cancelled that. Nothing was booked.", speak: "emphatic" };
}

export function statusUpdate(note: string): Reply {
  return { text: note, speak: "normal" };
}

export function needDestination(): Reply {
  return {
    text: "Sure — where would you like to go? You can say an address, or say home or work.",
    speak: "normal",
  };
}

export function didNotUnderstand(): Reply {
  return {
    text: "I can order you an Uber. Try saying: get me an Uber home.",
    speak: "normal",
  };
}

export function nothingToConfirm(): Reply {
  return {
    text: "There's nothing waiting to confirm right now. Say where you'd like to go and I'll get a price.",
    speak: "normal",
  };
}

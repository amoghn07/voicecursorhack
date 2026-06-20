function buildUberDeepLink({ pickup, dropoff }) {
  const params = new URLSearchParams({ action: "setPickup" });

  if (pickup && pickup !== "current_location") {
    params.set("pickup[formatted_address]", pickup);
  } else {
    params.set("pickup", "my_location");
  }

  if (dropoff) {
    params.set("dropoff[formatted_address]", dropoff);
  }

  return `https://m.uber.com/ul/?${params.toString()}`;
}

module.exports = { buildUberDeepLink };

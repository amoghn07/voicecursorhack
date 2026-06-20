// Places a real ride request using a user's OAuth access_token (from auth.js).
// Sandbox API host can be overridden via UBER_API_HOST if Uber's docs specify
// a different sandbox base than assumed here.
const API_HOST = process.env.UBER_API_HOST || "https://sandbox-api.uber.com";

export async function requestRide({ accessToken, startAddress, endAddress }) {
  const res = await fetch(`${API_HOST}/v1.2/requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start_address: startAddress,
      end_address: endAddress,
    }),
  });

  if (!res.ok) {
    throw new Error(`Uber ride request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

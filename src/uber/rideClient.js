const UBER_OAUTH_TOKEN_URL = "https://login.uber.com/oauth/v2/token";
const UBER_REQUESTS_URL = "https://api.uber.com/v1.2/requests";

async function getAccessToken(authorizationCode) {
  const { UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_REDIRECT_URI } = process.env;

  if (!UBER_CLIENT_ID || !UBER_CLIENT_SECRET) {
    throw new Error("Missing UBER_CLIENT_ID or UBER_CLIENT_SECRET in environment");
  }

  const body = new URLSearchParams({
    client_id: UBER_CLIENT_ID,
    client_secret: UBER_CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: UBER_REDIRECT_URI,
    code: authorizationCode,
  });

  const response = await fetch(UBER_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Uber OAuth token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function requestRide({ pickup, dropoff, userAccessToken }) {
  if (!userAccessToken) {
    throw new Error("Missing userAccessToken: real ride requests require a user-scoped OAuth token");
  }

  const response = await fetch(UBER_REQUESTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start_address: pickup,
      end_address: dropoff,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Uber ride request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

module.exports = { getAccessToken, requestRide };

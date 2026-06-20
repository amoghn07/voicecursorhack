// Sandbox OAuth (authorization-code) flow for the Uber Ride Request API.
const AUTHORIZE_URL = "https://sandbox-login.uber.com/oauth/v2/authorize";
const TOKEN_URL = "https://sandbox-login.uber.com/oauth/v2/token";

// This app's sandbox only has the Partner Loyalty Link Account scope granted —
// NOT the Ride Request "request" scope, which Uber no longer issues to new/
// sandbox third-party apps. This OAuth flow can authenticate a user and link
// their account, but cannot place real ride requests on their behalf.
const DEFAULT_SCOPES = ["partner-loyalty.link-account"];

export function buildAuthorizeUrl(scopes = DEFAULT_SCOPES) {
  const { UBER_CLIENT_ID, UBER_REDIRECT_URI } = process.env;
  if (!UBER_CLIENT_ID) throw new Error("Missing UBER_CLIENT_ID in environment");

  const params = new URLSearchParams({
    client_id: UBER_CLIENT_ID,
    redirect_uri: UBER_REDIRECT_URI,
    scope: scopes.join(" "),
    response_type: "code",
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code) {
  const { UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_REDIRECT_URI } = process.env;
  if (!UBER_CLIENT_ID || !UBER_CLIENT_SECRET) {
    throw new Error("Missing UBER_CLIENT_ID or UBER_CLIENT_SECRET in environment");
  }

  const form = new URLSearchParams({
    client_secret: UBER_CLIENT_SECRET,
    client_id: UBER_CLIENT_ID,
    grant_type: "authorization_code",
    redirect_uri: UBER_REDIRECT_URI,
    code,
  });

  const res = await fetch(TOKEN_URL, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`Uber token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, token_type, expires_in, refresh_token, scope }
}

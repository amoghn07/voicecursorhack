const { buildUberDeepLink } = require("./deepLink");
const { requestRide } = require("./rideClient");

async function orderRide({ pickup, dropoff, mode = "link", userAccessToken }) {
  if (mode === "api") {
    try {
      await requestRide({ pickup, dropoff, userAccessToken });
      return {
        success: true,
        message: `Your Uber ride to ${dropoff} has been requested. The driver will be on the way shortly.`,
      };
    } catch (error) {
      // Fall through to the deep link path on any API/auth failure.
    }
  }

  const url = buildUberDeepLink({ pickup, dropoff });
  return {
    success: true,
    message: `Click here to confirm your Uber ride to ${dropoff}: ${url}`,
    url,
  };
}

module.exports = { orderRide };

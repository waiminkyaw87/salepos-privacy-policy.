const { google } = require("googleapis");
const { config } = require("./config");

function createServiceAccountCredentials() {
  if (config.googleServiceAccountJson) {
    return JSON.parse(config.googleServiceAccountJson);
  }

  if (config.googleServiceAccountEmail && config.googleServiceAccountPrivateKey) {
    return {
      client_email: config.googleServiceAccountEmail,
      private_key: String(config.googleServiceAccountPrivateKey).replace(/\\n/g, "\n")
    };
  }

  throw new Error("Google Play service account credentials are not configured.");
}

function createAndroidPublisherClient() {
  const credentials = createServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"]
  });

  return google.androidpublisher({ version: "v3", auth });
}

async function verifyInAppPurchase({ packageName, productId, purchaseToken }) {
  if (!config.playValidationEnabled) {
    return {
      orderId: null,
      acknowledged: true,
      purchaseState: 0,
      consumptionState: 0,
      purchaseTimeMillis: null,
      testBypass: true
    };
  }

  const publisher = createAndroidPublisherClient();
  const response = await publisher.purchases.products.get({
    packageName,
    productId,
    token: purchaseToken
  });

  const payload = response?.data || {};
  return {
    orderId: payload.orderId || null,
    acknowledged: payload.acknowledgementState === 1,
    purchaseState: Number.isFinite(payload.purchaseState) ? payload.purchaseState : -1,
    consumptionState: Number.isFinite(payload.consumptionState) ? payload.consumptionState : -1,
    purchaseTimeMillis: payload.purchaseTimeMillis ? Number.parseInt(payload.purchaseTimeMillis, 10) : null,
    testBypass: false
  };
}

module.exports = {
  verifyInAppPurchase
};


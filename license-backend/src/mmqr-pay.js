const { config } = require("./config");

let cachedClient = null;

function normalize(value) {
  return String(value || "").trim();
}

function isMmqrConfigured() {
  if (!config.mmqrEnabled) {
    return false;
  }

  return Boolean(
    normalize(config.mmqrAppId) &&
      normalize(config.mmqrPublishableKey) &&
      normalize(config.mmqrSecretKey)
  );
}

function getClient() {
  if (!isMmqrConfigured()) {
    throw new Error("MMQR is not configured. Set MMQR_* environment variables.");
  }
  if (cachedClient) {
    return cachedClient;
  }

  const { MMPaySDK } = require("mmpay-node-sdk");
  cachedClient = new MMPaySDK({
    appId: config.mmqrAppId,
    publishableKey: config.mmqrPublishableKey,
    secretKey: config.mmqrSecretKey,
    apiBaseUrl: normalize(config.mmqrApiBaseUrl) || undefined
  });
  return cachedClient;
}

async function createMmqrPayment({ orderId, amount, callbackUrl, customMessage, items }) {
  const client = getClient();
  const payload = {
    orderId: normalize(orderId),
    amount: Number(amount),
    items: Array.isArray(items) ? items : [],
    customMessage: normalize(customMessage),
    callbackUrl: normalize(callbackUrl) || undefined
  };

  if (config.mmqrSandboxEnabled) {
    return client.sandboxPay(payload);
  }
  return client.pay(payload);
}

async function verifyMmqrCallback(payloadString, nonce, signature) {
  const client = getClient();
  const normalizedPayload = normalize(payloadString);
  const normalizedNonce = normalize(nonce);
  const normalizedSignature = normalize(signature);
  if (!normalizedPayload || !normalizedNonce || !normalizedSignature) {
    return false;
  }

  return client.verifyCb(normalizedPayload, normalizedNonce, normalizedSignature);
}

module.exports = {
  isMmqrConfigured,
  createMmqrPayment,
  verifyMmqrCallback
};


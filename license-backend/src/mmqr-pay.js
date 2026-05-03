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

  try {
    if (config.mmqrSandboxEnabled) {
      return await client.sandboxPay(payload);
    }
    return await client.pay(payload);
  } catch (error) {
    const url = error.config?.url || "unknown url";
    const method = error.config?.method || "unknown method";
    console.error(`[MMQR] API Error: ${method} ${url} -> ${error.message}`);

    if (error.response) {
      console.error(`[MMQR] Response Data: ${JSON.stringify(error.response.data)}`);
      const apiMessage = error.response.data?.message || "";
      return {
        status: error.response.status,
        message: `Gateway Error (${error.response.status}): ${apiMessage || error.message}. Check backend URL configuration.`
      };
    }
    return {
      status: "ERROR",
      message: `Network Error: ${error.message}. Ensure backend can reach ${config.mmqrApiBaseUrl}`
    };
  }
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


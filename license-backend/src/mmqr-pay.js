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

  // Normalize API Base URL: Remove trailing slash.
  // Do NOT force /v1 for ezapi.myanmyanpay.com as it seems to cause 404.
  let baseUrl = normalize(config.mmqrApiBaseUrl).replace(/\/+$/, "");

  console.log(`[MMQR] Initializing SDK with Base URL: ${baseUrl || "default"}`);

  cachedClient = new MMPaySDK({
    appId: config.mmqrAppId,
    publishableKey: config.mmqrPublishableKey,
    secretKey: config.mmqrSecretKey,
    apiBaseUrl: baseUrl || undefined
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

  const mode = config.mmqrSandboxEnabled ? "SANDBOX" : "PRODUCTION";
  console.log(`[MMQR] Initiating ${mode} payment: orderId=${payload.orderId}, amount=${payload.amount}`);
  console.log(`[MMQR] Payload: ${JSON.stringify(payload)}`);

  try {
    let response;
    if (config.mmqrSandboxEnabled) {
      response = await client.sandboxPay(payload);
    } else {
      response = await client.pay(payload);
    }

    // Some SDK versions return an error object instead of throwing
    if (response?.error || response?.statusCode >= 400) {
      console.error(`[MMQR] API returned error:`, JSON.stringify(response, null, 2));
      return {
        status: response.statusCode || "ERROR",
        message: response.message || "MMQR Gateway Error"
      };
    }

    console.log(`[MMQR] API Success: orderId=${payload.orderId}`);
    console.log(`[MMQR] API Response Body:`, JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    // If the method above fails, we can try a fallback if it makes sense.
    const url = error.config?.url || "unknown url";
    const method = error.config?.method || "unknown method";
    console.error(`[MMQR] API Error: ${method} ${url} -> ${error.message}`);

    if (error.response) {
      console.error(`[MMQR] Response Status: ${error.response.status}`);
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

  console.log(`[MMQR] Verifying callback signature: nonce=${normalizedNonce}`);

  if (!normalizedPayload || !normalizedNonce || !normalizedSignature) {
    console.warn("[MMQR] Callback verification failed: Missing payload, nonce, or signature.");
    return false;
  }

  try {
    const isVerified = await client.verifyCb(normalizedPayload, normalizedNonce, normalizedSignature);
    console.log(`[MMQR] Callback signature verification result: ${isVerified}`);
    return isVerified;
  } catch (error) {
    console.error(`[MMQR] Callback verification error: ${error.message}`);
    return false;
  }
}

module.exports = {
  isMmqrConfigured,
  createMmqrPayment,
  verifyMmqrCallback
};


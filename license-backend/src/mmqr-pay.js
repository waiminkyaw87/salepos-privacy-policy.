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

  // Normalize API Base URL: Remove trailing slash and ensure /v1 suffix
  let baseUrl = normalize(config.mmqrApiBaseUrl);
  if (baseUrl) {
    baseUrl = baseUrl.replace(/\/+$/, ""); // Remove trailing slashes
    if (!baseUrl.endsWith("/v1")) {
      baseUrl += "/v1";
    }
  }

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
    // Use .pay() for both sandbox and production as it's more stable.
    response = await client.pay(payload);

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
    // If .pay() fails and we are in sandbox, we can try .sandboxPay() as a last resort
    if (config.mmqrSandboxEnabled && error.response?.status === 404) {
      console.log(`[MMQR] .pay() returned 404, attempting .sandboxPay() fallback...`);
      try {
        return await client.sandboxPay(payload);
      } catch (innerError) {
        console.error(`[MMQR] Sandbox fallback also failed: ${innerError.message}`);
      }
    }
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


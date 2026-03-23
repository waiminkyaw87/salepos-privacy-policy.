process.env.ENFORCE_FIREBASE_TOKEN = "false";
process.env.TRIAL_DAYS = "5";

const http = require("http");
const { app } = require("../src/app");

async function requestJson(baseUrl, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer smoke-user-001"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: response.status, payload };
}

async function main() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const entitlement = await requestJson(baseUrl, "POST", "/v1/license/entitlement", {
      deviceId: "device-A",
      deviceLabel: "POS Tablet A"
    });
    if (entitlement.status !== 200 || entitlement.payload.status !== "trial_active") {
      throw new Error(`Expected trial_active, got ${JSON.stringify(entitlement)}`);
    }

    const devices = await requestJson(baseUrl, "GET", "/v1/license/devices");
    if (devices.status !== 200 || !Array.isArray(devices.payload) || devices.payload.length !== 1) {
      throw new Error(`Expected one active device, got ${JSON.stringify(devices)}`);
    }

    const deactivate = await fetch(`${baseUrl}/v1/license/devices/device-A/deactivate`, {
      method: "POST",
      headers: { Authorization: "Bearer smoke-user-001" }
    });
    if (deactivate.status !== 204) {
      throw new Error(`Expected 204 deactivate, got ${deactivate.status}`);
    }

    const devicesAfter = await requestJson(baseUrl, "GET", "/v1/license/devices");
    if (!Array.isArray(devicesAfter.payload) || devicesAfter.payload.length !== 0) {
      throw new Error(`Expected zero active devices after deactivate, got ${JSON.stringify(devicesAfter)}`);
    }

    const purchase = await requestJson(baseUrl, "POST", "/v1/license/verify-purchase", {
      productId: "salepos_pro",
      purchaseToken: "tok_demo_001",
      deviceId: "device-A",
      deviceLabel: "POS Tablet A"
    });
    if (purchase.status !== 200 || purchase.payload.status !== "active") {
      throw new Error(`Expected active after purchase verify, got ${JSON.stringify(purchase)}`);
    }

    console.log("Smoke test passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});


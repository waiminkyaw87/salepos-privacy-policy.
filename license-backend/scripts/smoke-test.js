process.env.ENFORCE_FIREBASE_TOKEN = "false";
process.env.TRIAL_DAYS = "5";
process.env.MAX_DEVICES = "3";
process.env.STORAGE_BACKEND = "json";

const os = require("os");
const path = require("path");
process.env.DATA_FILE = path.join(os.tmpdir(), `salepos-license-smoke-${Date.now()}.json`);

const http = require("http");
const { app } = require("../src/app");

async function requestJson(baseUrl, method, path, body, token = "smoke-user-001") {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
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
    }, "smoke-basic-user");
    if (entitlement.status !== 200 || entitlement.payload.status !== "trial_active") {
      throw new Error(`Expected trial_active, got ${JSON.stringify(entitlement)}`);
    }

    const devices = await requestJson(baseUrl, "GET", "/v1/license/devices", null, "smoke-basic-user");
    if (devices.status !== 200 || !Array.isArray(devices.payload) || devices.payload.length !== 1) {
      throw new Error(`Expected one active device, got ${JSON.stringify(devices)}`);
    }

    const deactivate = await fetch(`${baseUrl}/v1/license/devices/device-A/deactivate`, {
      method: "POST",
      headers: { Authorization: "Bearer smoke-basic-user" }
    });
    if (deactivate.status !== 204) {
      throw new Error(`Expected 204 deactivate, got ${deactivate.status}`);
    }

    const devicesAfter = await requestJson(baseUrl, "GET", "/v1/license/devices", null, "smoke-basic-user");
    if (!Array.isArray(devicesAfter.payload) || devicesAfter.payload.length !== 0) {
      throw new Error(`Expected zero active devices after deactivate, got ${JSON.stringify(devicesAfter)}`);
    }

    const purchase = await requestJson(baseUrl, "POST", "/v1/license/verify-purchase", {
      productId: "salepos_pro",
      purchaseToken: "tok_demo_001",
      deviceId: "device-A",
      deviceLabel: "POS Tablet A"
    }, "smoke-pro-user");
    if (purchase.status !== 200 || purchase.payload.status !== "active" || purchase.payload.maxDevices !== 10) {
      throw new Error(`Expected active after purchase verify, got ${JSON.stringify(purchase)}`);
    }

    for (let i = 2; i <= 10; i += 1) {
      const proEntitlement = await requestJson(baseUrl, "POST", "/v1/license/entitlement", {
        deviceId: `pro-device-${i}`,
        deviceLabel: `POS Pro ${i}`
      }, "smoke-pro-user");
      if (proEntitlement.status !== 200 || proEntitlement.payload.status !== "active") {
        throw new Error(`Expected active for pro user device ${i}, got ${JSON.stringify(proEntitlement)}`);
      }
    }

    const proBlocked = await requestJson(baseUrl, "POST", "/v1/license/entitlement", {
      deviceId: "pro-device-11",
      deviceLabel: "POS Pro 11"
    }, "smoke-pro-user");
    if (proBlocked.status !== 200 || proBlocked.payload.status !== "device_limit_reached") {
      throw new Error(`Expected device_limit_reached at 11th pro device, got ${JSON.stringify(proBlocked)}`);
    }

    const fallbackPurchase = await requestJson(baseUrl, "POST", "/v1/license/verify-purchase", {
      productId: "salepos_custom_unknown",
      purchaseToken: "tok_demo_fallback",
      deviceId: "fb-device-1",
      deviceLabel: "Fallback 1"
    }, "smoke-fallback-user");
    if (fallbackPurchase.status !== 200 || fallbackPurchase.payload.maxDevices !== 3) {
      throw new Error(`Expected fallback maxDevices=3, got ${JSON.stringify(fallbackPurchase)}`);
    }

    for (let i = 2; i <= 3; i += 1) {
      const fallbackEntitlement = await requestJson(baseUrl, "POST", "/v1/license/entitlement", {
        deviceId: `fb-device-${i}`,
        deviceLabel: `Fallback ${i}`
      }, "smoke-fallback-user");
      if (fallbackEntitlement.status !== 200 || fallbackEntitlement.payload.status !== "active") {
        throw new Error(`Expected active for fallback user device ${i}, got ${JSON.stringify(fallbackEntitlement)}`);
      }
    }

    const fallbackBlocked = await requestJson(baseUrl, "POST", "/v1/license/entitlement", {
      deviceId: "fb-device-4",
      deviceLabel: "Fallback 4"
    }, "smoke-fallback-user");
    if (fallbackBlocked.status !== 200 || fallbackBlocked.payload.status !== "device_limit_reached") {
      throw new Error(`Expected fallback user to hit device limit at 4th device, got ${JSON.stringify(fallbackBlocked)}`);
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


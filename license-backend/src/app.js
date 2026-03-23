const express = require("express");
const cors = require("cors");
const { requireAuth } = require("./auth");
const { JsonStore } = require("./store");
const { config } = require("./config");
const {
  ensureUserRecord,
  upsertActiveDevice,
  deactivateDevice,
  buildEntitlement,
  activeDevices
} = require("./license-core");

const store = new JsonStore(config.dataFile);
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, project: config.firebaseProjectId || "dev", trialDays: config.trialDays });
});

app.post("/v1/license/entitlement", requireAuth, (req, res) => {
  const { deviceId, deviceLabel } = req.body || {};
  if (!deviceId || !deviceLabel) {
    return res.status(400).json({ error: "deviceId and deviceLabel are required" });
  }

  const user = req.user;
  const existing = store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);
  const registration = upsertActiveDevice(record, String(deviceId), String(deviceLabel));

  store.saveUser(user.uid, registration.record);
  const entitlement = buildEntitlement(registration.record, registration.blocked);
  return res.json(entitlement);
});

app.get("/v1/license/devices", requireAuth, (req, res) => {
  const user = req.user;
  const existing = store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);
  store.saveUser(user.uid, record);

  const devices = activeDevices(record).map((d) => ({
    deviceId: d.deviceId,
    deviceLabel: d.deviceLabel,
    lastSeenAtMillis: d.lastSeenAtMillis
  }));
  return res.json(devices);
});

app.post("/v1/license/devices/:deviceId/deactivate", requireAuth, (req, res) => {
  const user = req.user;
  const existing = store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);

  deactivateDevice(record, req.params.deviceId);
  store.saveUser(user.uid, record);
  return res.status(204).send();
});

app.post("/v1/license/verify-purchase", requireAuth, (req, res) => {
  const { productId, purchaseToken, deviceId, deviceLabel } = req.body || {};
  if (!productId || !purchaseToken || !deviceId || !deviceLabel) {
    return res.status(400).json({ error: "productId, purchaseToken, deviceId, and deviceLabel are required" });
  }

  const user = req.user;
  const existing = store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);

  record.purchased = true;
  record.purchase = {
    productId: String(productId),
    purchaseToken: String(purchaseToken),
    verifiedAtMillis: Date.now()
  };

  const registration = upsertActiveDevice(record, String(deviceId), String(deviceLabel));
  store.saveUser(user.uid, registration.record);

  const entitlement = buildEntitlement(registration.record, registration.blocked);
  return res.json(entitlement);
});

module.exports = { app };


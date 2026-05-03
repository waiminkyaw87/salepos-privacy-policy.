const express = require("express");
const cors = require("cors");
const { requireAuth } = require("./auth");
const { JsonStore, FirestoreStore } = require("./store");
const { config } = require("./config");
const {
  ensureUserRecord,
  upsertActiveDevice,
  deactivateDevice,
  buildEntitlement,
  activeDevices,
  resolvePlanFromProductId,
  setVerifiedPurchase,
  clearVerifiedPurchase
} = require("./license-core");
const { verifyInAppPurchase } = require("./google-play");
const { isMmqrConfigured, createMmqrPayment, verifyMmqrCallback } = require("./mmqr-pay");

const store = config.storageBackend === "firestore"
  ? new FirestoreStore(config.firestoreCollection, config.mmqrOrdersCollection)
  : new JsonStore(config.dataFile);
const app = express();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function normalize(value) {
  return String(value || "").trim();
}

function isMmqrSuccess(orderStatus, condition) {
  const status = normalize(orderStatus).toUpperCase();
  if (status !== "SUCCESS") {
    return false;
  }
  return true;
}

function extractProviderReference(payload) {
  return normalize(
    payload.providerRef ||
    payload.providerReference ||
    payload.referenceId ||
    payload.transactionId ||
    payload.trxId
  );
}

function extractOrderId(payload) {
  return normalize(payload.orderId || payload.orderID || payload.order_id);
}

function amountForProduct(productId) {
  const plan = resolvePlanFromProductId(productId);
  switch (plan) {
    case "STARTER_3":
      return config.starterAmountMmk;
    case "GROWTH_5":
      return config.businessAmountMmk;
    case "PRO_10":
      return config.proAmountMmk;
    default:
      return null;
  }
}

function generateMmqrOrderId(uid) {
  const entropy = Math.random().toString(36).slice(2, 6).toUpperCase();
  const timestamp = Date.now().toString().slice(-8);
  const userPart = normalize(uid).slice(-4).toUpperCase();
  return `SP${timestamp}${userPart}${entropy}`;
}

function isFirestoreError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return (
    message.includes("firestore") ||
    message.includes("database") ||
    message.includes("failed_precondition") ||
    message.includes("permission denied") ||
    message.includes("insufficient permissions") ||
    code.includes("firestore") ||
    code.includes("permission") ||
    code.includes("failed-precondition")
  );
}

app.use(cors());
app.use(express.json());

app.get("/health", asyncHandler(async (_req, res) => {
  let storageReady = true;
  let storageError = null;

  try {
    await store.healthCheck();
  } catch (error) {
    storageReady = false;
    storageError = error?.message || "Unknown storage error";
  }

  res.json({
    ok: storageReady,
    project: config.firebaseProjectId || "dev",
    trialDays: config.trialDays,
    mmqrEnabled: config.mmqrEnabled,
    mmqrConfigured: isMmqrConfigured(),
    storageBackend: config.storageBackend,
    storageReady,
    storageError
  });
}));

app.post("/v1/license/entitlement", requireAuth, asyncHandler(async (req, res) => {
  const { deviceId, deviceLabel } = req.body || {};
  if (!deviceId || !deviceLabel) {
    return res.status(400).json({ error: "deviceId and deviceLabel are required" });
  }

  const user = req.user;
  const existing = await store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);
  const registration = upsertActiveDevice(record, String(deviceId), String(deviceLabel));

  await store.saveUser(user.uid, registration.record);
  const entitlement = buildEntitlement(registration.record, registration.blocked);
  return res.json(entitlement);
}));

app.get("/v1/license/devices", requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const existing = await store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);
  await store.saveUser(user.uid, record);

  const devices = activeDevices(record).map((d) => ({
    deviceId: d.deviceId,
    deviceLabel: d.deviceLabel,
    lastSeenAtMillis: d.lastSeenAtMillis
  }));
  return res.json(devices);
}));

app.post("/v1/license/devices/:deviceId/deactivate", requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const existing = await store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);

  deactivateDevice(record, req.params.deviceId);
  await store.saveUser(user.uid, record);
  return res.status(204).send();
}));

app.post("/v1/license/verify-purchase", requireAuth, asyncHandler(async (req, res) => {
  const { productId, purchaseToken, deviceId, deviceLabel } = req.body || {};
  if (!productId || !purchaseToken || !deviceId || !deviceLabel) {
    return res.status(400).json({ error: "productId, purchaseToken, deviceId, and deviceLabel are required" });
  }

  const normalizedProductId = String(productId).trim();
  const normalizedToken = String(purchaseToken).trim();
  if (!resolvePlanFromProductId(normalizedProductId)) {
    return res.status(400).json({ error: "Unknown or unsupported productId." });
  }

  const playResult = await verifyInAppPurchase({
    packageName: config.playPackageName,
    productId: normalizedProductId,
    purchaseToken: normalizedToken
  });

  if (!playResult.testBypass && playResult.purchaseState !== 0) {
    return res.status(409).json({ error: "Purchase is not completed yet on Google Play." });
  }

  const reusedTokenOwner = await store.findUserByPurchaseToken(normalizedToken);
  const user = req.user;
  const existing = await store.getUser(user.uid);
  const record = ensureUserRecord(existing, user);

  if (reusedTokenOwner && reusedTokenOwner.uid !== user.uid) {
    const previousOwnerRecord = ensureUserRecord(reusedTokenOwner, reusedTokenOwner);
    clearVerifiedPurchase(previousOwnerRecord);
    await store.saveUser(reusedTokenOwner.uid, previousOwnerRecord);
  }

  setVerifiedPurchase(record, {
    productId: normalizedProductId,
    purchaseToken: normalizedToken,
    verifiedAtMillis: Date.now()
  });

  const registration = upsertActiveDevice(record, String(deviceId), String(deviceLabel));
  await store.saveUser(user.uid, registration.record);

  const entitlement = buildEntitlement(registration.record, registration.blocked);
  return res.json(entitlement);
}));

app.post("/v1/license/mmqr/create-order", requireAuth, asyncHandler(async (req, res) => {
  const { productId, deviceId, deviceLabel } = req.body || {};
  if (!productId || !deviceId || !deviceLabel) {
    return res.status(400).json({ error: "productId, deviceId, and deviceLabel are required" });
  }
  if (!isMmqrConfigured()) {
    return res.status(503).json({ error: "MMQR is not configured on backend." });
  }

  const normalizedProductId = normalize(productId);
  if (!resolvePlanFromProductId(normalizedProductId)) {
    return res.status(400).json({ error: "Unknown or unsupported productId." });
  }

  const amount = amountForProduct(normalizedProductId);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(500).json({ error: "MMQR amount mapping is not configured for this product." });
  }

  const user = req.user;
  const orderId = generateMmqrOrderId(user.uid);
  const callbackUrl = normalize(config.mmqrCallbackUrl);

  const paymentResponse = await createMmqrPayment({
    orderId,
    amount,
    callbackUrl,
    customMessage: `SalePOS ${normalizedProductId}`,
    items: [{ name: normalizedProductId, amount, quantity: 1 }]
  });

  const createdOrderId = normalize(paymentResponse?.orderId) || orderId;
  const status = normalize(paymentResponse?.status || "PENDING").toUpperCase();
  const record = {
    orderId: createdOrderId,
    uid: user.uid,
    productId: normalizedProductId,
    deviceId: normalize(deviceId),
    deviceLabel: normalize(deviceLabel),
    amount,
    currency: normalize(paymentResponse?.currency || "MMK") || "MMK",
    status,
    qr: normalize(paymentResponse?.qr),
    providerRef: extractProviderReference(paymentResponse),
    condition: normalize(paymentResponse?.condition),
    message: normalize(paymentResponse?.message),
    createdAtMillis: Date.now(),
    updatedAtMillis: Date.now()
  };

  console.log(`[MMQR] Creating order: orderId=${createdOrderId}, uid=${user.uid}, productId=${normalizedProductId}, deviceId=${deviceId}`);
  await store.saveMmqrOrder(createdOrderId, record);
  console.log(`[MMQR] Order saved: orderId=${createdOrderId}`);
  return res.status(201).json(record);
}));

app.get("/v1/license/mmqr/order/:orderId", requireAuth, asyncHandler(async (req, res) => {
  const orderId = normalize(req.params.orderId);
  if (!orderId) {
    return res.status(400).json({ error: "orderId is required." });
  }
  console.log(`[MMQR] Fetching order: orderId=${orderId}, requested by uid=${req.user.uid}`);
  const order = await store.getMmqrOrder(orderId);
  if (!order) {
    console.warn(`[MMQR] Order not found: orderId=${orderId}, requested by uid=${req.user.uid}`);
    return res.status(404).json({
      error: "QR code is not available yet. Please wait a few seconds and try again. If the problem persists, ensure your payment order was created successfully and that you have redeployed the latest backend changes."
    });
  }
  if (normalize(order.uid) !== normalize(req.user.uid)) {
    return res.status(403).json({ error: "This MMQR order belongs to another account." });
  }

  return res.json(order);
}));

app.post("/v1/license/mmqr/callback", asyncHandler(async (req, res) => {
  if (!isMmqrConfigured()) {
    return res.status(503).json({ error: "MMQR is not configured on backend." });
  }

  const signature = req.header("x-mmpay-signature") || req.header("sppay-x-signature");
  const nonce = req.header("x-mmpay-nonce") || req.header("sppay-x-nonce");
  const payloadString = typeof req.body?.payloadString === "string"
    ? req.body.payloadString
    : JSON.stringify(req.body || {});

  const verified = await verifyMmqrCallback(payloadString, nonce, signature);
  if (!verified) {
    return res.status(401).json({ error: "MMQR callback signature verification failed." });
  }

  const payload = JSON.parse(payloadString || "{}");
  const orderId = extractOrderId(payload);
  if (!orderId) {
    return res.status(400).json({ error: "MMQR callback does not include orderId." });
  }

  const existingOrder = await store.getMmqrOrder(orderId);
  if (!existingOrder) {
    return res.status(404).json({ error: "MMQR order not found." });
  }

  const status = normalize(payload.status).toUpperCase();
  const condition = normalize(payload.condition).toUpperCase();
  const providerRef = extractProviderReference(payload);

  const updatedOrder = {
    ...existingOrder,
    status: status || existingOrder.status,
    condition: condition || existingOrder.condition,
    providerRef: providerRef || existingOrder.providerRef,
    message: normalize(payload.message) || existingOrder.message,
    updatedAtMillis: Date.now()
  };
  await store.saveMmqrOrder(orderId, updatedOrder);

  if (isMmqrSuccess(updatedOrder.status, updatedOrder.condition)) {
    const ownerUid = normalize(existingOrder.uid);
    const existingRecord = await store.getUser(ownerUid);
    const user = {
      uid: ownerUid,
      email: existingRecord?.email || null
    };
    const record = ensureUserRecord(existingRecord, user);

    const paymentRef = providerRef || orderId;
    const purchaseToken = `mmqr:${orderId}:${paymentRef}`;
    const reusedTokenOwner = await store.findUserByPurchaseToken(purchaseToken);
    if (reusedTokenOwner && normalize(reusedTokenOwner.uid) !== ownerUid) {
      const previousOwnerRecord = ensureUserRecord(reusedTokenOwner, reusedTokenOwner);
      clearVerifiedPurchase(previousOwnerRecord);
      await store.saveUser(reusedTokenOwner.uid, previousOwnerRecord);
    }

    setVerifiedPurchase(record, {
      productId: normalize(existingOrder.productId),
      purchaseToken,
      verifiedAtMillis: Date.now()
    });

    const registration = upsertActiveDevice(
      record,
      normalize(existingOrder.deviceId),
      normalize(existingOrder.deviceLabel) || "MMQR device"
    );
    await store.saveUser(ownerUid, registration.record);
  }

  return res.status(200).json({ ok: true });
}));

app.use((error, _req, res, _next) => {
  console.error(error);

  if (isFirestoreError(error)) {
    return res.status(503).json({
      error: "Firestore storage is not ready. Open Firebase Console > Firestore Database, create the database if needed, then try again.",
      detail: error.message || null
    });
  }

  return res.status(500).json({ error: error?.message || "Internal server error" });
});

module.exports = { app };


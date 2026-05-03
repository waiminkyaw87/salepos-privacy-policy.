const { config } = require("./config");

function nowMillis() {
  return Date.now();
}

function startTrialWindow() {
  const start = nowMillis();
  const end = start + config.trialDays * 24 * 60 * 60 * 1000;
  return { start, end };
}

function isValidMillis(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizeDevices(devices) {
  if (!Array.isArray(devices)) return [];
  return devices
    .filter((device) => device && typeof device === "object")
    .map((device) => ({
      deviceId: String(device.deviceId || "").trim(),
      deviceLabel: String(device.deviceLabel || "Unknown device").trim() || "Unknown device",
      lastSeenAtMillis: isValidMillis(device.lastSeenAtMillis) ? device.lastSeenAtMillis : nowMillis(),
      active: device.active !== false
    }))
    .filter((device) => device.deviceId);
}

function normalizePurchase(purchase) {
  if (!purchase || typeof purchase !== "object") return null;
  return {
    productId: String(purchase.productId || "").trim(),
    purchaseToken: String(purchase.purchaseToken || "").trim(),
    verifiedAtMillis: isValidMillis(purchase.verifiedAtMillis) ? purchase.verifiedAtMillis : nowMillis()
  };
}

function ensureUserRecord(existing, user) {
  if (existing) {
    const fallbackTrial = startTrialWindow();
    const trialEndsAtMillis = isValidMillis(existing.trialEndsAtMillis)
      ? existing.trialEndsAtMillis
      : (isValidMillis(existing.trialStartedAtMillis)
        ? existing.trialStartedAtMillis + config.trialDays * 24 * 60 * 60 * 1000
        : fallbackTrial.end);
    const trialStartedAtMillis = isValidMillis(existing.trialStartedAtMillis)
      ? existing.trialStartedAtMillis
      : trialEndsAtMillis - config.trialDays * 24 * 60 * 60 * 1000;

    return {
      uid: existing.uid || user.uid,
      email: existing.email || user.email || null,
      trialStartedAtMillis,
      trialEndsAtMillis,
      purchased: existing.purchased === true,
      purchase: normalizePurchase(existing.purchase),
      devices: normalizeDevices(existing.devices)
    };
  }

  const trial = startTrialWindow();
  return {
    uid: user.uid,
    email: user.email,
    trialStartedAtMillis: trial.start,
    trialEndsAtMillis: trial.end,
    purchased: false,
    purchase: null,
    devices: []
  };
}

function activeDevices(record) {
  return record.devices.filter((d) => d.active !== false);
}

function normalizeProductId(productId) {
  return String(productId || "").trim().toLowerCase();
}

function resolvePlanFromProductId(productId) {
  const normalized = normalizeProductId(productId);
  if (!normalized) return null;

  if (config.starterProductIds.includes(normalized) || normalized.includes("starter")) {
    return "STARTER_2";
  }
  if (
    config.businessProductIds.includes(normalized) ||
    normalized.includes("business") ||
    normalized.includes("growth")
  ) {
    return "GROWTH_5";
  }
  if (config.proProductIds.includes(normalized) || normalized.includes("pro")) {
    return "PRO_10";
  }

  return null;
}

function resolvePlan(record) {
  if (!record.purchased) return "NONE";

  const purchasedPlan = resolvePlanFromProductId(record.purchase?.productId);
  return purchasedPlan || "NONE";
}

function planRank(plan) {
  switch (plan) {
    case "STARTER_2":
      return 1;
    case "GROWTH_5":
      return 2;
    case "PRO_10":
      return 3;
    default:
      return 0;
  }
}

function setVerifiedPurchase(record, purchase) {
  const normalized = normalizePurchase(purchase);
  if (!normalized || !normalized.productId || !normalized.purchaseToken) {
    throw new Error("Verified purchase payload is incomplete.");
  }

  const incomingPlan = resolvePlanFromProductId(normalized.productId);
  if (!incomingPlan) {
    throw new Error("Unsupported productId for SalePOS plan mapping.");
  }

  const currentPlan = resolvePlan(record);
  const keepCurrentPlan = planRank(currentPlan) > planRank(incomingPlan);
  const sameToken = record.purchase?.purchaseToken && record.purchase.purchaseToken === normalized.purchaseToken;

  if (keepCurrentPlan && !sameToken) {
    return record;
  }

  record.purchased = true;
  record.purchase = normalized;
  return record;
}

function clearVerifiedPurchase(record) {
  if (!record || typeof record !== "object") {
    return record;
  }

  record.purchased = false;
  record.purchase = null;
  return record;
}

function resolveMaxDevices(record) {
  const plan = resolvePlan(record);
  switch (plan) {
    case "STARTER_2":
      return config.starterMaxDevices;
    case "GROWTH_5":
      return config.businessMaxDevices;
    case "PRO_10":
      return config.proMaxDevices;
    default:
      return config.maxDevices;
  }
}

function upsertActiveDevice(record, deviceId, deviceLabel) {
  const timestamp = nowMillis();
  const existing = record.devices.find((d) => d.deviceId === deviceId);
  if (existing) {
    existing.deviceLabel = deviceLabel;
    existing.lastSeenAtMillis = timestamp;
    existing.active = true;
    return { record, blocked: false };
  }

  const maxDevices = resolveMaxDevices(record);
  if (activeDevices(record).length >= maxDevices) {
    return { record, blocked: true };
  }

  record.devices.push({
    deviceId,
    deviceLabel,
    lastSeenAtMillis: timestamp,
    active: true
  });
  return { record, blocked: false };
}

function deactivateDevice(record, deviceId) {
  const device = record.devices.find((d) => d.deviceId === deviceId);
  if (device) {
    device.active = false;
    device.lastSeenAtMillis = nowMillis();
  }
  return record;
}

function daysRemaining(trialEndsAtMillis) {
  const remaining = trialEndsAtMillis - nowMillis();
  if (remaining <= 0) return 0;
  return Math.max(1, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

function buildEntitlement(record, blockedByDeviceLimit = false) {
  const plan = resolvePlan(record);
  const maxDevices = resolveMaxDevices(record);

  if (blockedByDeviceLimit) {
    return {
      status: "device_limit_reached",
      plan,
      maxDevices,
      expiresAtMillis: null,
      trialEndsAtMillis: record.trialEndsAtMillis,
      trialDaysRemaining: daysRemaining(record.trialEndsAtMillis),
      sourceProductId: record.purchase?.productId || null,
      message: `Device limit reached (${maxDevices}). Deactivate an old device first.`
    };
  }

  if (record.purchased) {
    return {
      status: "active",
      plan,
      maxDevices,
      expiresAtMillis: null,
      trialEndsAtMillis: record.trialEndsAtMillis,
      trialDaysRemaining: daysRemaining(record.trialEndsAtMillis),
      sourceProductId: record.purchase?.productId || null,
      message: "Purchase active."
    };
  }

  const remaining = daysRemaining(record.trialEndsAtMillis);
  if (remaining > 0) {
    return {
      status: "trial_active",
      plan: "NONE",
      maxDevices,
      expiresAtMillis: null,
      trialEndsAtMillis: record.trialEndsAtMillis,
      trialDaysRemaining: remaining,
      sourceProductId: null,
      message: `${remaining} day(s) left in your ${config.trialDays}-day trial.`
    };
  }

  return {
    status: "trial_expired",
    plan: "NONE",
    maxDevices,
    expiresAtMillis: null,
    trialEndsAtMillis: record.trialEndsAtMillis,
    trialDaysRemaining: 0,
    sourceProductId: null,
    message: "Trial expired. Purchase required."
  };
}

module.exports = {
  ensureUserRecord,
  upsertActiveDevice,
  deactivateDevice,
  buildEntitlement,
  activeDevices,
  resolvePlanFromProductId,
  setVerifiedPurchase,
  clearVerifiedPurchase
};


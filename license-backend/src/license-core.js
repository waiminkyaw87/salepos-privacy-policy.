const { config } = require("./config");

function nowMillis() {
  return Date.now();
}

function startTrialWindow() {
  const start = nowMillis();
  const end = start + config.trialDays * 24 * 60 * 60 * 1000;
  return { start, end };
}

function ensureUserRecord(existing, user) {
  if (existing) return existing;

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

function upsertActiveDevice(record, deviceId, deviceLabel) {
  const timestamp = nowMillis();
  const existing = record.devices.find((d) => d.deviceId === deviceId);
  if (existing) {
    existing.deviceLabel = deviceLabel;
    existing.lastSeenAtMillis = timestamp;
    existing.active = true;
    return { record, blocked: false };
  }

  if (activeDevices(record).length >= config.maxDevices) {
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
  if (blockedByDeviceLimit) {
    return {
      status: "device_limit_reached",
      plan: record.purchased ? "GROWTH_5" : "NONE",
      maxDevices: config.maxDevices,
      expiresAtMillis: null,
      trialEndsAtMillis: record.trialEndsAtMillis,
      trialDaysRemaining: daysRemaining(record.trialEndsAtMillis),
      sourceProductId: record.purchase?.productId || null,
      message: `Device limit reached (${config.maxDevices}). Deactivate an old device first.`
    };
  }

  if (record.purchased) {
    return {
      status: "active",
      plan: "GROWTH_5",
      maxDevices: config.maxDevices,
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
      maxDevices: config.maxDevices,
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
    maxDevices: config.maxDevices,
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
  activeDevices
};


const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function toBool(value, fallback) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === "true";
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toList(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function toOneOf(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

const config = {
  port: toInt(process.env.PORT, 8080),
  trialDays: toInt(process.env.TRIAL_DAYS, 5),
  maxDevices: toInt(process.env.MAX_DEVICES, 3),
  starterMaxDevices: toInt(process.env.STARTER_MAX_DEVICES, 3),
  businessMaxDevices: toInt(process.env.BUSINESS_MAX_DEVICES, 5),
  proMaxDevices: toInt(process.env.PRO_MAX_DEVICES, 10),
  starterProductIds: toList(process.env.STARTER_PRODUCT_IDS, ["salepos_starter"]),
  businessProductIds: toList(process.env.BUSINESS_PRODUCT_IDS, ["salepos_business", "salepos_growth"]),
  proProductIds: toList(process.env.PRO_PRODUCT_IDS, ["salepos_pro"]),
  enforceFirebaseToken: toBool(process.env.ENFORCE_FIREBASE_TOKEN, false),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  storageBackend: toOneOf(process.env.STORAGE_BACKEND, ["json", "firestore"], "json"),
  firestoreCollection: process.env.FIRESTORE_COLLECTION || "licenseUsers",
  mmqrOrdersCollection: process.env.MMQR_ORDERS_COLLECTION || "mmqrOrders",
  dataFile: process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json"),
  mmqrEnabled: toBool(process.env.MMQR_ENABLED, true),
  mmqrSandboxEnabled: toBool(process.env.MMQR_SANDBOX_ENABLED, false),
  mmqrAppId: process.env.MMQR_APP_ID || "MM59914447",
  mmqrPublishableKey: process.env.MMQR_PUBLISHABLE_KEY || "pk_test_67affc22d3fb09ef31fd01854d3efb2b72696ee06463eb1ebaf00733dba9bdce",
  mmqrSecretKey: process.env.MMQR_SECRET_KEY || "sk_test_bbdc4b6cfe25257813375d94e968dcabb5e363ad22ebe9a26a1b192ba3222c0f",
  mmqrApiBaseUrl: process.env.MMQR_API_BASE_URL || "https://ezapi.myanmyanpay.com",
  mmqrCallbackUrl: process.env.MMQR_CALLBACK_URL || "https://salepos-license-backend.onrender.com/v1/license/mmqr/callback",
  starterAmountMmk: toInt(process.env.STARTER_AMOUNT_MMK, 30000),
  businessAmountMmk: toInt(process.env.BUSINESS_AMOUNT_MMK, 50000),
  proAmountMmk: toInt(process.env.PRO_AMOUNT_MMK, 100000),
  playPackageName: process.env.PLAY_PACKAGE_NAME || "com.waiminkyaw.salepos",
  playValidationEnabled: toBool(process.env.PLAY_VALIDATION_ENABLED, true),
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
  googleServiceAccountPrivateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
};

module.exports = { config };


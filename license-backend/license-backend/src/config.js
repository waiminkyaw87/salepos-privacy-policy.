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
  dataFile: process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json")
};

module.exports = { config };


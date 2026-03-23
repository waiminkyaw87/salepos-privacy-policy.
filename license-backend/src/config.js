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

const config = {
  port: toInt(process.env.PORT, 8080),
  trialDays: toInt(process.env.TRIAL_DAYS, 5),
  maxDevices: toInt(process.env.MAX_DEVICES, 5),
  enforceFirebaseToken: toBool(process.env.ENFORCE_FIREBASE_TOKEN, false),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  dataFile: process.env.DATA_FILE || path.join(process.cwd(), "data", "db.json")
};

module.exports = { config };


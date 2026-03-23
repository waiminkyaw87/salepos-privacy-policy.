const admin = require("firebase-admin");
const { config } = require("./config");

let initialized = false;

function tryInitFirebaseAdmin() {
  if (initialized) return;
  if (admin.apps.length > 0) {
    initialized = true;
    return;
  }

  const options = {};
  if (config.firebaseProjectId) {
    options.projectId = config.firebaseProjectId;
  }

  if (config.firebaseServiceAccountJson) {
    try {
      const serviceAccount = JSON.parse(config.firebaseServiceAccountJson);
      options.credential = admin.credential.cert(serviceAccount);
    } catch (error) {
      throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error.message}`);
    }
  }

  admin.initializeApp(options);
  initialized = true;
}

async function resolveUserFromToken(rawToken) {
  if (!config.enforceFirebaseToken) {
    const token = String(rawToken || "").trim();
    if (!token) {
      throw new Error("Missing bearer token");
    }
    return {
      uid: `dev_${token.slice(0, 24)}`,
      email: null
    };
  }

  tryInitFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(rawToken);
  return {
    uid: decoded.uid,
    email: decoded.email || null
  };
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.header("authorization") || "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return res.status(401).json({ error: "Missing Authorization bearer token" });
    }

    const user = await resolveUserFromToken(token);
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: `Unauthorized: ${error.message}` });
  }
}

module.exports = { requireAuth };


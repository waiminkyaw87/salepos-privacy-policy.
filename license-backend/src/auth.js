const { admin, getFirebaseAdminApp } = require("./firebase-admin");
const { config } = require("./config");

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

  const app = getFirebaseAdminApp();
  const decoded = await admin.auth(app).verifyIdToken(rawToken);
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


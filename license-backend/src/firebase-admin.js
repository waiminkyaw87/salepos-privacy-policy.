const admin = require("firebase-admin");
const { config } = require("./config");

let appInstance = null;

function getFirebaseAdminApp() {
  if (appInstance) return appInstance;
  if (admin.apps.length > 0) {
    appInstance = admin.app();
    return appInstance;
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

  appInstance = admin.initializeApp(options);
  return appInstance;
}

function getFirestore() {
  const app = getFirebaseAdminApp();
  return admin.firestore(app);
}

module.exports = { admin, getFirebaseAdminApp, getFirestore };


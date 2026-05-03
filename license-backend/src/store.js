const fs = require("fs");
const path = require("path");
const { getFirestore } = require("./firebase-admin");

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { users: {}, mmqrOrders: {} };
    this.ensureLoaded();
  }

  ensureLoaded() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      this.flush();
      return;
    }

    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = {
        users: parsed && parsed.users ? parsed.users : {},
        mmqrOrders: parsed && parsed.mmqrOrders ? parsed.mmqrOrders : {}
      };
    } catch {
      this.state = { users: {}, mmqrOrders: {} };
      this.flush();
    }
  }

  flush() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  async getUser(uid) {
    return this.state.users[uid] || null;
  }

  async saveUser(uid, userRecord) {
    this.state.users[uid] = userRecord;
    this.flush();
    return userRecord;
  }

  async findUserByPurchaseToken(purchaseToken) {
    const normalizedToken = String(purchaseToken || "").trim();
    if (!normalizedToken) {
      return null;
    }

    const entry = Object.entries(this.state.users).find(([, userRecord]) => (
      String(userRecord?.purchase?.purchaseToken || "").trim() === normalizedToken
    ));
    if (!entry) {
      return null;
    }

    const [uid, userRecord] = entry;
    return {
      uid,
      ...(userRecord || {})
    };
  }

  async healthCheck() {
    return { ok: true };
  }

  async getMmqrOrder(orderId) {
    return this.state.mmqrOrders[String(orderId || "").trim()] || null;
  }

  async saveMmqrOrder(orderId, orderRecord) {
    this.state.mmqrOrders[String(orderId || "").trim()] = orderRecord;
    this.flush();
    return orderRecord;
  }
}

class FirestoreStore {
  constructor(collectionName = "licenseUsers", mmqrOrdersCollection = "mmqrOrders") {
    this.collectionName = collectionName;
    this.mmqrOrdersCollection = mmqrOrdersCollection;
  }

  collection() {
    return getFirestore().collection(this.collectionName);
  }

  mmqrCollection() {
    return getFirestore().collection(this.mmqrOrdersCollection);
  }

  async getUser(uid) {
    const snapshot = await this.collection().doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() || null;
  }

  async saveUser(uid, userRecord) {
    await this.collection().doc(uid).set(userRecord, { merge: true });
    return userRecord;
  }

  async findUserByPurchaseToken(purchaseToken) {
    const normalizedToken = String(purchaseToken || "").trim();
    if (!normalizedToken) {
      return null;
    }

    const snapshot = await this.collection()
      .where("purchase.purchaseToken", "==", normalizedToken)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const document = snapshot.docs[0];
    return {
      uid: document.id,
      ...(document.data() || {})
    };
  }

  async healthCheck() {
    await this.collection().limit(1).get();
    return { ok: true };
  }

  async getMmqrOrder(orderId) {
    const snapshot = await this.mmqrCollection().doc(String(orderId || "").trim()).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() || null;
  }

  async saveMmqrOrder(orderId, orderRecord) {
    await this.mmqrCollection().doc(String(orderId || "").trim()).set(orderRecord, { merge: true });
    return orderRecord;
  }
}

module.exports = { JsonStore, FirestoreStore };


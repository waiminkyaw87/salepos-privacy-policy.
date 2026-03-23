const fs = require("fs");
const path = require("path");

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { users: {} };
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
        users: parsed && parsed.users ? parsed.users : {}
      };
    } catch {
      this.state = { users: {} };
      this.flush();
    }
  }

  flush() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  getUser(uid) {
    return this.state.users[uid] || null;
  }

  saveUser(uid, userRecord) {
    this.state.users[uid] = userRecord;
    this.flush();
    return userRecord;
  }
}

module.exports = { JsonStore };


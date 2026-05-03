const { app } = require("./app");
const { config } = require("./config");

app.listen(config.port, () => {
  // Keep this startup line simple for easy log parsing in hosting platforms.
  console.log(`License backend listening on http://localhost:${config.port}`);
});


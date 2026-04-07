const server = require("../HealthQueue/server/server");
module.exports = server;

// Disable Vercel's default body parser to let Express handle it
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

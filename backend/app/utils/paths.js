const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

function getPublicPath(...segments) {
  return path.join(PUBLIC_DIR, ...segments);
}

module.exports = { getPublicPath };

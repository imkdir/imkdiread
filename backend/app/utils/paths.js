const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public.noindex");

function getPublicPath(...segments) {
  return path.join(PUBLIC_DIR, ...segments);
}

module.exports = { getPublicPath };

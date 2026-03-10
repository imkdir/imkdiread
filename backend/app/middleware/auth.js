const jwt = require("jsonwebtoken");
const { jsonError } = require("../utils/errorHelpers");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return jsonError(res, 401, "Access denied. Please log in.");

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return jsonError(res, 403, "Invalid or expired token.");
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user) return jsonError(res, 401, "Access denied. Please log in.");
  if (req.user.role !== "admin") {
    return jsonError(res, 403, "Admin privileges required.");
  }
  next();
}

module.exports = { authenticateToken, requireAdmin };

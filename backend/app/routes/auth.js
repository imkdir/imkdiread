const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { jsonError } = require("../utils/errorHelpers");
const { asNonEmptyString } = require("../utils/validators");

function createAuthRouter({ db }) {
  const router = express.Router();

  router.post("/api/auth/register", async (req, res) => {
    try {
      const username = asNonEmptyString(req.body?.username);
      const password = asNonEmptyString(req.body?.password);
      const inviteCode = asNonEmptyString(req.body?.inviteCode);

      if (!username || !password || !inviteCode) {
        return jsonError(res, 400, "username, password, and inviteCode are required.");
      }

      if (inviteCode !== process.env.GUEST_INVITE_CODE) {
        return jsonError(res, 403, "Invalid invitation code.");
      }

      const existingUser = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username);
      if (existingUser) {
        return jsonError(res, 400, "Username is already taken.");
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const userId = uuidv4();

      db.prepare(
        "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
      ).run(userId, username, passwordHash, "guest");

      res.json({
        success: true,
        message: "Guest account created successfully!",
      });
    } catch (error) {
      jsonError(res, 500, "Failed to register user.");
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    try {
      const username = asNonEmptyString(req.body?.username);
      const password = asNonEmptyString(req.body?.password);
      if (!username || !password) {
        return jsonError(res, 400, "username and password are required.");
      }

      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
      if (!user) {
        return jsonError(res, 400, "Invalid username or password.");
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return jsonError(res, 400, "Invalid username or password.");
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role },
      });
    } catch (error) {
      jsonError(res, 500, "Failed to log in.");
    }
  });

  return router;
}

module.exports = { createAuthRouter };

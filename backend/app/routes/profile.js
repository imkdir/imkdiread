const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { authenticateToken } = require("../middleware/auth");
const { jsonError } = require("../utils/errorHelpers");
const { asOptionalString } = require("../utils/validators");
const { getPublicPath } = require("../utils/paths");

const userAvatarDir = getPublicPath("imgs", "users", "avatars");
if (!fs.existsSync(userAvatarDir)) {
  fs.mkdirSync(userAvatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, userAvatarDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, req.user.id + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function createProfileRouter({ db, workService }) {
  const router = express.Router();

  router.get("/api/profile/me", authenticateToken, (req, res) => {
    try {
      const userId = req.user.id;

      const userInfo = db
        .prepare(
          `
      SELECT username, role, email, avatar_url, is_email_public
      FROM users WHERE id = ?
    `,
        )
        .get(userId);

      const interactedBookRows = db
        .prepare(
          `
      SELECT DISTINCT p.* FROM works p
      LEFT JOIN user_work_interactions i ON p.id = i.work_id AND i.user_id = ?
      LEFT JOIN work_quotes q ON p.id = q.work_id AND q.user_id = ?
      WHERE i.user_id IS NOT NULL OR q.user_id IS NOT NULL
    `,
        )
        .all(userId, userId);

      const processedBooks = interactedBookRows
        .map((row) => workService.getWorkWithRelations(row, userId))
        .map(workService.processWork);

      const reading = processedBooks.filter((b) => b.current_page > 0 && !b.read);
      const shelved = processedBooks.filter((b) => b.shelved);
      const favorites = processedBooks.filter((b) => b.liked);

      const rawQuotes = db
        .prepare(
          `
      SELECT * FROM work_quotes
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
        )
        .all(userId);

      const richQuotes = rawQuotes
        .filter((r) => r.quote.length && !r.quote.startsWith("@notes:"))
        .map((quote) => {
          const matchingBook = processedBooks.find((b) => b.id === quote.work_id);
          return {
            ...quote,
            work: matchingBook || null,
          };
        });

      res.json({
        userInfo,
        reading,
        shelved,
        favorites,
        quotes: richQuotes,
      });
    } catch (error) {
      console.error("Profile Fetch Error:", error);
      res.status(500).json({ error: "Failed to load profile data." });
    }
  });

  router.put("/api/profile/me", authenticateToken, (req, res) => {
    try {
      const userId = req.user.id;
      const { email, is_email_public } = req.body;
      const normalizedEmail = asOptionalString(email);

      if (email !== undefined && email !== null && typeof email !== "string") {
        return jsonError(res, 400, "email must be a string when provided.");
      }
      if (
        is_email_public !== undefined &&
        is_email_public !== null &&
        typeof is_email_public !== "boolean"
      ) {
        return jsonError(res, 400, "is_email_public must be a boolean when provided.");
      }

      const isPublic = is_email_public ? 1 : 0;

      db.prepare(
        `
      UPDATE users
      SET email = ?, is_email_public = ?
      WHERE id = ?
    `,
      ).run(normalizedEmail, isPublic, userId);

      const updatedUser = db
        .prepare(
          "SELECT id, username, email, avatar_url, role, is_email_public FROM users WHERE id = ?",
        )
        .get(userId);

      res.json({
        success: true,
        user: {
          ...updatedUser,
          is_email_public: Boolean(updatedUser?.is_email_public),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile settings" });
    }
  });

  router.post(
    "/api/profile/avatar",
    authenticateToken,
    upload.single("avatar"),
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No image provided" });
        }

        const avatarUrl = `/imgs/users/avatars/${req.file.filename}`;
        db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(
          avatarUrl,
          req.user.id,
        );

        res.json({ success: true, avatar_url: avatarUrl });
      } catch (error) {
        console.error("Avatar upload failed:", error);
        res.status(500).json({ error: "Failed to set avatar" });
      }
    },
  );

  return router;
}

module.exports = { createProfileRouter };

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

  const loadProfileData = (userId, options = {}) => {
    const includeQuotes = options.includeQuotes !== false;
    const includeActivities = options.includeActivities !== false;
    const publicView = !!options.publicView;

    const userInfo = db
      .prepare(
        `
      SELECT id, username, role, email, avatar_url, is_email_public
      FROM users WHERE id = ?
    `,
      )
      .get(userId);

    if (!userInfo) return null;

    const interactedBookRows = db
      .prepare(
        `
      SELECT DISTINCT p.* FROM works p
      LEFT JOIN user_work_interactions i ON p.id = i.work_id AND i.user_id = ?
      LEFT JOIN work_quotes q ON p.id = q.work_id AND q.user_id = ?
      LEFT JOIN user_reading_activities a ON p.id = a.work_id AND a.user_id = ?
      WHERE i.user_id IS NOT NULL OR q.user_id IS NOT NULL OR a.user_id IS NOT NULL
    `,
      )
      .all(userId, userId, userId);

    const processedBooks = interactedBookRows
      .map((row) => workService.getWorkWithRelations(row, userId))
      .map(workService.processWork);

    const reading = processedBooks.filter(
      (b) => b.current_page > 0 && !b.read && !b.shelved,
    );
    const shelved = processedBooks.filter((b) => b.shelved);
    const favorites = processedBooks.filter((b) => b.liked);

    let quotes = [];
    if (includeQuotes) {
      const rawQuotes = db
        .prepare(
          `
      SELECT * FROM work_quotes
      WHERE user_id = ?
      ORDER BY created_at DESC
    `,
        )
        .all(userId);

      quotes = rawQuotes
        .filter((r) => r.quote.length)
        .map((quote) => {
          const matchingBook = processedBooks.find(
            (b) => b.id === quote.work_id,
          );
          return {
            ...quote,
            work: matchingBook || null,
          };
        });
    }

    let activities = [];
    if (includeActivities) {
      const rawActivities = db
        .prepare(
          `
      SELECT *
      FROM user_reading_activities
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC, rowid DESC
    `,
        )
        .all(userId);

      activities = rawActivities.map((activity) => {
        const matchingBook = processedBooks.find(
          (book) => book.id === activity.work_id,
        );

        return {
          ...activity,
          work: matchingBook || null,
        };
      });
    }

    return {
      userInfo: publicView
        ? {
            ...userInfo,
            email:
              userInfo.email && userInfo.is_email_public ? userInfo.email : null,
          }
        : userInfo,
      reading,
      shelved,
      favorites,
      quotes,
      activities,
    };
  };

  router.get("/api/profile/me", authenticateToken, (req, res) => {
    try {
      const data = loadProfileData(req.user.id, {
        includeQuotes: true,
        includeActivities: true,
      });
      res.json(data);
    } catch (error) {
      console.error("Profile Fetch Error:", error);
      res.status(500).json({ error: "Failed to load profile data." });
    }
  });

  router.get("/api/profiles/:username", authenticateToken, (req, res) => {
    try {
      const targetUser = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(req.params.username);

      if (!targetUser) {
        return res.status(404).json({ error: "Profile not found." });
      }

      const data = loadProfileData(targetUser.id, {
        includeQuotes: true,
        includeActivities: true,
        publicView: true,
      });

      res.json({
        userInfo: data.userInfo,
        reading: data.reading,
        shelved: data.shelved,
        favorites: data.favorites,
        quotes: data.quotes,
        activities: data.activities,
      });
    } catch (error) {
      console.error("Public Profile Fetch Error:", error);
      res.status(500).json({ error: "Failed to load public profile data." });
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
        return jsonError(
          res,
          400,
          "is_email_public must be a boolean when provided.",
        );
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

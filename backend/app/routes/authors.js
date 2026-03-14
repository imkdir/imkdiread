const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { jsonError } = require("../utils/errorHelpers");
const { asNonEmptyString, asOptionalString } = require("../utils/validators");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { getPublicPath } = require("../utils/paths");

const authorAvatarsDir = getPublicPath("imgs", "avatars");
if (!fs.existsSync(authorAvatarsDir)) {
  fs.mkdirSync(authorAvatarsDir, { recursive: true });
}

function createAuthorsRouter({ db, workService }) {
  const router = express.Router();

  const parseAuthorId = (value) => {
    const authorId = Number(value);
    if (!Number.isInteger(authorId) || authorId <= 0) return null;
    return authorId;
  };

  const getAuthorById = (value) => {
    const authorId = parseAuthorId(value);
    if (!authorId) return null;
    return db.prepare("SELECT * FROM authors WHERE id = ?").get(authorId) || null;
  };

  const getAvatarPath = (goodreadsId) => {
    if (!goodreadsId) return null;
    return path.join(authorAvatarsDir, `${goodreadsId}.png`);
  };

  const renameAuthorAvatarIfNeeded = (previousGoodreadsId, nextGoodreadsId) => {
    if (
      !previousGoodreadsId ||
      !nextGoodreadsId ||
      previousGoodreadsId === nextGoodreadsId
    ) {
      return;
    }

    const previousPath = getAvatarPath(previousGoodreadsId);
    const nextPath = getAvatarPath(nextGoodreadsId);
    if (!previousPath || !nextPath) return;

    if (fs.existsSync(previousPath) && !fs.existsSync(nextPath)) {
      fs.renameSync(previousPath, nextPath);
    }
  };

  const removeAuthorAvatarIfItExists = (goodreadsId) => {
    const avatarPath = getAvatarPath(goodreadsId);
    if (avatarPath && fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  };

  const authorAvatarUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, authorAvatarsDir),
      filename: (req, _file, cb) => {
        const author = getAuthorById(req.params?.id);

        if (!author?.goodreads_id) {
          cb(new Error("Author Goodreads ID is required."));
          return;
        }

        cb(null, `${author.goodreads_id}.png`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const isPng =
        file.mimetype === "image/png" ||
        path.extname(file.originalname).toLowerCase() === ".png";

      cb(null, isPng);
    },
  });

  router.get("/api/authors", authenticateToken, requireAdmin, (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM authors ORDER BY name").all();
      res.json(
        rows
          .map((row) => workService.getAuthorWithRelations(row, req.user?.id))
          .map(workService.processAuthor),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load authors" });
    }
  });

  router.post("/api/authors", authenticateToken, requireAdmin, (req, res) => {
    try {
      const authorName = asNonEmptyString(req.body?.name);
      const bio = asOptionalString(req.body?.bio);
      const goodreadsId = asOptionalString(req.body?.goodreads_id) || "";
      if (!authorName) return jsonError(res, 400, "Author name is required.");

      if (
        db
          .prepare("SELECT id FROM authors WHERE name = ? COLLATE NOCASE")
          .get(authorName)
      ) {
        return jsonError(res, 400, "Author already exists.");
      }

      let authorId = null;
      db.transaction(() => {
        db.prepare(
          "INSERT INTO authors (name, bio, goodreads_id) VALUES (?, ?, ?)",
        ).run(authorName, bio, goodreadsId);
        authorId = db.prepare("SELECT last_insert_rowid() as id").get().id;
      })();

      const author = workService.processAuthor(
        workService.getAuthorWithRelations(
          db.prepare("SELECT * FROM authors WHERE id = ?").get(authorId),
          req.user?.id,
        ),
      );
      res.json({ success: true, author });
    } catch (error) {
      jsonError(res, 500, "Failed to add author");
    }
  });

  router.post(
    "/api/authors/:id/avatar",
    authenticateToken,
    requireAdmin,
    authorAvatarUpload.single("file"),
    (req, res) => {
      try {
        const author = getAuthorById(req.params.id);

        if (!author) {
          return jsonError(res, 404, "Author not found.");
        }

        if (!author.goodreads_id) {
          return jsonError(res, 400, "Author Goodreads ID is required.");
        }

        if (!req.file) {
          return jsonError(res, 400, "A PNG avatar image is required.");
        }

        res.json({
          success: true,
          avatar_img_url: `/imgs/avatars/${req.file.filename}`,
        });
      } catch (error) {
        console.error("Failed to upload author avatar:", error);
        jsonError(res, 500, "Failed to upload author avatar.");
      }
    },
  );

  router.post(
    "/api/authors/:id/follow",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const author = getAuthorById(req.params.id);
        const userId = req.user.id;
        if (typeof req.body?.followed !== "boolean") {
          return jsonError(res, 400, "followed must be a boolean.");
        }
        const followed = req.body.followed ? 1 : 0;

        if (!author) {
          return res.status(404).json({ error: "Author not found." });
        }

        db.prepare(
          `INSERT INTO user_author_interactions (user_id, author_id, followed)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, author_id)
          DO UPDATE SET followed = excluded.followed`,
        ).run(userId, author.id, followed);

        res.json({ success: true, followed: !!followed });
      } catch (error) {
        console.error("Failed to update author follow:", error);
        res.status(500).json({ error: "Failed to update follow status." });
      }
    },
  );

  router.put(
    "/api/authors/:id",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const existingAuthor = getAuthorById(req.params.id);
        if (!existingAuthor) {
          return res.status(404).json({ error: "Author not found." });
        }

        const nextName = asNonEmptyString(req.body?.name);
        const nextBio = asOptionalString(req.body?.bio);
        const nextGoodreadsId = asOptionalString(req.body?.goodreads_id) || "";

        if (!nextName) {
          return jsonError(res, 400, "Author name is required.");
        }
        if (
          req.body?.bio !== undefined &&
          req.body?.bio !== null &&
          typeof req.body?.bio !== "string"
        ) {
          return jsonError(res, 400, "bio must be a string when provided.");
        }
        if (
          req.body?.goodreads_id !== undefined &&
          req.body?.goodreads_id !== null &&
          typeof req.body?.goodreads_id !== "string"
        ) {
          return jsonError(res, 400, "goodreads_id must be a string when provided.");
        }

        const nameConflict = db
          .prepare(
            "SELECT id FROM authors WHERE name = ? COLLATE NOCASE AND id != ?",
          )
          .get(nextName, existingAuthor.id);
        if (nameConflict) {
          return jsonError(res, 400, "Another author already uses that name.");
        }

        db.transaction(() => {
          db.prepare(
            "UPDATE authors SET name = ?, bio = ?, goodreads_id = ? WHERE id = ?",
          ).run(nextName, nextBio, nextGoodreadsId, existingAuthor.id);
        })();

        renameAuthorAvatarIfNeeded(
          existingAuthor.goodreads_id,
          nextGoodreadsId || null,
        );

        const author = workService.processAuthor(
          workService.getAuthorWithRelations(
            db.prepare("SELECT * FROM authors WHERE id = ?").get(existingAuthor.id),
            req.user?.id,
          ),
        );
        res.json({ success: true, author });
      } catch (error) {
        jsonError(res, 500, "Failed to update author");
      }
    },
  );

  router.delete("/api/authors/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
      const author = getAuthorById(req.params.id);
      if (!author) {
        return res.status(404).json({ error: "Author not found." });
      }

      db.transaction(() => {
        db.prepare("DELETE FROM authors WHERE id = ?").run(author.id);
      })();

      removeAuthorAvatarIfItExists(author.goodreads_id);

      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to delete author");
    }
  });

  return router;
}

module.exports = { createAuthorsRouter };

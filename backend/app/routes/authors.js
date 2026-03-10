const express = require("express");
const { jsonError } = require("../utils/errorHelpers");
const { asNonEmptyString, asOptionalString } = require("../utils/validators");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

function createAuthorsRouter({ db, workService }) {
  const router = express.Router();

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
      const goodreadsId = asOptionalString(req.body?.goodreads_id) || "";
      if (!authorName) return jsonError(res, 400, "Author name is required.");

      if (db.prepare("SELECT name FROM authors WHERE name = ?").get(authorName)) {
        return jsonError(res, 400, "Author already exists.");
      }

      db.transaction(() => {
        db.prepare(
          "INSERT INTO authors (name, goodreads_id) VALUES (?, ?)",
        ).run(authorName, goodreadsId);
      })();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to add author");
    }
  });

  router.post(
    "/api/authors/:name/follow",
    authenticateToken,
    requireAdmin,
    (req, res) => {
    try {
      const authorName = req.params.name;
      const userId = req.user.id;
      if (typeof req.body?.followed !== "boolean") {
        return jsonError(res, 400, "followed must be a boolean.");
      }
      const followed = req.body.followed ? 1 : 0;

      const exists = db
        .prepare("SELECT name FROM authors WHERE name = ?")
        .get(authorName);
      if (!exists) return res.status(404).json({ error: "Author not found." });

      db.prepare(
        `INSERT INTO user_author_interactions (user_id, author_name, followed)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, author_name)
          DO UPDATE SET followed = excluded.followed`,
      ).run(userId, authorName, followed);

      res.json({ success: true, followed: !!followed });
    } catch (error) {
      console.error("Failed to update author follow:", error);
      res.status(500).json({ error: "Failed to update follow status." });
    }
  });

  router.put(
    "/api/authors/:name",
    authenticateToken,
    requireAdmin,
    (req, res) => {
    try {
      const targetName = req.params.name;
      const exists = db
        .prepare("SELECT * FROM authors WHERE name = ?")
        .get(targetName);
      if (!exists) return res.status(404).json({ error: "Author not found." });

      const nextGoodreadsId = asOptionalString(req.body?.goodreads_id);
      if (
        req.body?.goodreads_id !== undefined &&
        req.body?.goodreads_id !== null &&
        typeof req.body?.goodreads_id !== "string"
      ) {
        return jsonError(res, 400, "goodreads_id must be a string when provided.");
      }

      db.transaction(() => {
        db.prepare("UPDATE authors SET goodreads_id = ? WHERE name = ?").run(
          nextGoodreadsId || exists.goodreads_id || "",
          targetName,
        );
      })();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to update author");
    }
  });

  return router;
}

module.exports = { createAuthorsRouter };

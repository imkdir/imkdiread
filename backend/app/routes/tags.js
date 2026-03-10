const express = require("express");
const { jsonError } = require("../utils/errorHelpers");
const { asNonEmptyString } = require("../utils/validators");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

function createTagsRouter({ db, workService }) {
  const router = express.Router();

  router.get("/api/tags", authenticateToken, requireAdmin, (req, res) => {
    try {
      const tags = db
        .prepare("SELECT name FROM tags")
        .all()
        .map((r) => r.name);
      res.json(tags);
    } catch (error) {
      console.error("fetch tags failed,", error);
      res.status(500).json({ error: "Failed to load tags" });
    }
  });

  router.post("/api/tags", authenticateToken, requireAdmin, (req, res) => {
    try {
      const newTag = asNonEmptyString(req.body?.newTag);
      if (!newTag) return jsonError(res, 400, "Tag name required.");

      const existing = db
        .prepare("SELECT id FROM tags WHERE name = ?")
        .get(newTag);
      if (existing) return jsonError(res, 400, "Tag already exists.");

      db.prepare("INSERT INTO tags (name) VALUES (?)").run(newTag);
      const tags = db
        .prepare("SELECT name FROM tags ORDER BY name")
        .all()
        .map((r) => r.name);
      res.json({ success: true, tags });
    } catch (error) {
      jsonError(res, 500, "Failed to add tag.");
    }
  });

  router.put(
    "/api/tags/:oldName",
    authenticateToken,
    requireAdmin,
    (req, res) => {
    try {
      const oldName = req.params.oldName;
      const newName = asNonEmptyString(req.body?.newName);
      if (!newName) return jsonError(res, 400, "New tag name required.");

      db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(newName);
      const newTagId = db
        .prepare("SELECT id FROM tags WHERE name = ?")
        .get(newName).id;
      const oldTag = db
        .prepare("SELECT id FROM tags WHERE name = ?")
        .get(oldName);
      if (!oldTag) return jsonError(res, 404, "Tag not found.");

      db.transaction(() => {
        for (const w of db
          .prepare("SELECT work_id FROM work_tags WHERE tag_id = ?")
          .all(oldTag.id)) {
          db.prepare(
            "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
          ).run(w.work_id, newTagId);
        }
        db.prepare("DELETE FROM work_tags WHERE tag_id = ?").run(oldTag.id);
        db.prepare("DELETE FROM tags WHERE id = ?").run(oldTag.id);
      })();

      res.json({ success: true, message: `Renamed ${oldName} to ${newName}.` });
    } catch (error) {
      jsonError(res, 500, "Failed to rename tag.");
    }
  });

  router.delete(
    "/api/tags/:name",
    authenticateToken,
    requireAdmin,
    (req, res) => {
    try {
      db.transaction(() => {
        const tag = db
          .prepare("SELECT id FROM tags WHERE name = ?")
          .get(req.params.name);
        if (tag) {
          db.prepare("DELETE FROM tags WHERE id = ?").run(tag.id);
        }
      })();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to delete tag.");
    }
  });

  router.get("/api/series", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM series ORDER BY count DESC").all();
      res.json(
        rows.map((s) => ({
          ...s,
          img_url: workService.getStaticUrlIfItExists(["imgs", "series"], `${s.text}.png`),
        })),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to read series data" });
    }
  });

  return router;
}

module.exports = { createTagsRouter };

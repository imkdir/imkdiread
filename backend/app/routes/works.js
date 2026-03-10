const express = require("express");
const { jsonError } = require("../utils/errorHelpers");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const {
  asNonEmptyString,
  asOptionalString,
  asStringArray,
} = require("../utils/validators");

function createWorksRouter({ db, workService }) {
  const router = express.Router();

  function parseWorkPayload(rawWork) {
    if (!rawWork || typeof rawWork !== "object") {
      return { error: "Invalid work payload." };
    }

    const id = asNonEmptyString(rawWork.id);
    const title = asNonEmptyString(rawWork.title);
    if (!id) return { error: "Work ID is required." };
    if (!title) return { error: "Work title is required." };

    const pageCountNum = Number(rawWork.page_count ?? 0);
    if (!Number.isFinite(pageCountNum) || pageCountNum < 0) {
      return { error: "page_count must be a non-negative number." };
    }

    const authors =
      rawWork.authors === undefined ? [] : asStringArray(rawWork.authors);
    if (authors === null)
      return { error: "authors must be an array of strings." };

    const tags = rawWork.tags === undefined ? [] : asStringArray(rawWork.tags);
    if (tags === null) return { error: "tags must be an array of strings." };

    if (
      (rawWork.goodreads_id !== undefined &&
        rawWork.goodreads_id !== null &&
        typeof rawWork.goodreads_id !== "string") ||
      (rawWork.dropbox_link !== undefined &&
        rawWork.dropbox_link !== null &&
        typeof rawWork.dropbox_link !== "string") ||
      (rawWork.amazon_asin !== undefined &&
        rawWork.amazon_asin !== null &&
        typeof rawWork.amazon_asin !== "string")
    ) {
      return { error: "Optional work fields must be strings when provided." };
    }

    return {
      work: {
        id,
        title,
        goodreads_id: asOptionalString(rawWork.goodreads_id),
        page_count: Math.floor(pageCountNum),
        dropbox_link: asOptionalString(rawWork.dropbox_link),
        amazon_asin: asOptionalString(rawWork.amazon_asin),
        authors,
        tags,
      },
    };
  }

  router.get("/api/explore", authenticateToken, (req, res) => {
    try {
      const works = db
        .prepare("SELECT * FROM works ORDER BY RANDOM() LIMIT 12")
        .all()
        .map((row) => workService.getWorkWithRelations(row, req.user?.id))
        .map(workService.processWork);
      const authors = db
        .prepare(
          `
      SELECT authors.*, COUNT(work_authors.work_id) as works_count
      FROM authors LEFT JOIN work_authors ON authors.name = work_authors.author_name
      GROUP BY authors.name ORDER BY RANDOM() LIMIT 6
    `,
        )
        .all()
        .map((row) => workService.getAuthorWithRelations(row, req.user?.id))
        .map(workService.processAuthor);

      res.json({ works, authors });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate explore feed" });
    }
  });

  router.get("/api/search", authenticateToken, (req, res) => {
    try {
      const term = `%${(req.query.q || "").trim()}%`;
      if (term === "%%") return res.json({ results: [] });

      const works = db
        .prepare(
          `
      SELECT DISTINCT works.* FROM works
      LEFT JOIN work_tags ON works.id = work_tags.work_id
      LEFT JOIN tags ON work_tags.tag_id = tags.id
      LEFT JOIN work_authors ON works.id = work_authors.work_id
      WHERE works.id LIKE ? COLLATE NOCASE OR works.title LIKE ? COLLATE NOCASE OR tags.name LIKE ? COLLATE NOCASE OR work_authors.author_name LIKE ? COLLATE NOCASE
      ORDER BY works.id ASC LIMIT 100
    `,
        )
        .all(term, term, term, term)
        .map((row) => workService.getWorkWithRelations(row, req.user?.id))
        .map(workService.processWork);

      res.json({ results: works });
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  router.get("/api/collection/:keyword", authenticateToken, (req, res) => {
    try {
      const keyword = req.params.keyword;
      const authorRow = db
        .prepare("SELECT * FROM authors WHERE name = ?")
        .get(keyword);

      let matchedRows = [];
      let profile = null;

      if (authorRow) {
        profile = workService.processAuthor(
          workService.getAuthorWithRelations(authorRow, req.user?.id),
        );
        matchedRows = db
          .prepare(
            `
        SELECT works.* FROM works JOIN work_authors ON works.id = work_authors.work_id WHERE work_authors.author_name = ?
      `,
          )
          .all(keyword);
      } else {
        matchedRows = db
          .prepare(
            `
        SELECT works.* FROM works JOIN work_tags ON works.id = work_tags.work_id JOIN tags ON work_tags.tag_id = tags.id WHERE tags.name = ?
      `,
          )
          .all(keyword);
      }

      res.json({
        works: matchedRows
          .map((row) => workService.getWorkWithRelations(row, req.user?.id))
          .map(workService.processWork),
        profile,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load collection" });
    }
  });

  router.get("/api/works", authenticateToken, (req, res) => {
    try {
      res.json(
        db
          .prepare("SELECT * FROM works")
          .all()
          .map((row) => workService.getWorkWithRelations(row, req.user?.id))
          .map(workService.processWork),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load works" });
    }
  });

  router.get("/api/works/:id", authenticateToken, (req, res) => {
    try {
      const workRow = db
        .prepare("SELECT * FROM works WHERE id = ?")
        .get(req.params.id);
      if (!workRow) return res.status(404).json({ error: "Work not found" });

      res.json(
        workService.processWork(
          workService.getWorkWithRelations(workRow, req.user?.id),
        ),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load work" });
    }
  });

  router.post("/api/works", authenticateToken, requireAdmin, (req, res) => {
    try {
      const parsed = parseWorkPayload(req.body);
      if (parsed.error) return jsonError(res, 400, parsed.error);
      const work = parsed.work;

      db.transaction(() => {
        db.prepare(
          `
        INSERT INTO works (id, title, goodreads_id, page_count, dropbox_link, amazon_asin)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        ).run(
          work.id,
          work.title,
          work.goodreads_id || null,
          work.page_count,
          work.dropbox_link || null,
          work.amazon_asin || null,
        );

        workService.syncAuthors(work.id, work.authors);
        workService.syncTags(work.id, work.tags, "work_tags", "work_id");
      })();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to add work");
    }
  });

  router.put("/api/works/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
      const id = req.params.id;
      const parsed = parseWorkPayload(req.body);
      if (parsed.error) return jsonError(res, 400, parsed.error);
      const work = parsed.work;

      const executeWorkUpdate = () => {
        if (work.id !== id) {
          db.prepare(
            `UPDATE works SET id = ?, title = ?, goodreads_id = ?, page_count = ?, dropbox_link = ?, amazon_asin = ? WHERE id = ?`,
          ).run(
            work.id,
            work.title || null,
            work.goodreads_id || null,
            work.page_count,
            work.dropbox_link || null,
            work.amazon_asin || null,
            id,
          );

          db.prepare(
            "UPDATE work_authors SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
          db.prepare("UPDATE work_tags SET work_id = ? WHERE work_id = ?").run(
            work.id,
            id,
          );
          db.prepare(
            "UPDATE work_quotes SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
          db.prepare(
            "UPDATE user_work_interactions SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
        } else {
          db.prepare(
            `UPDATE works SET title = ?, goodreads_id = ?, page_count = ?, dropbox_link = ?, amazon_asin = ? WHERE id = ?`,
          ).run(
            work.title || null,
            work.goodreads_id || null,
            work.page_count,
            work.dropbox_link || null,
            work.amazon_asin || null,
            id,
          );
        }

        workService.syncAuthors(work.id, work.authors);
        workService.syncTags(work.id, work.tags, "work_tags", "work_id");
      };

      if (work.id !== id) {
        db.prepare("PRAGMA foreign_keys=OFF;").run();
        try {
          db.transaction(executeWorkUpdate)();
        } finally {
          db.prepare("PRAGMA foreign_keys=ON;").run();
        }
      } else {
        db.transaction(executeWorkUpdate)();
      }
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      jsonError(res, 500, "Failed to update work");
    }
  });

  router.post(
    "/api/works/bulk-import",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const works = req.body;
        if (!Array.isArray(works))
          return jsonError(res, 400, "Expected an array");

        const parsedWorks = [];
        for (const rawWork of works) {
          const parsed = parseWorkPayload(rawWork);
          if (parsed.error) return jsonError(res, 400, parsed.error);
          parsedWorks.push(parsed.work);
        }

        db.transaction(() => {
          for (const work of parsedWorks) {
            if (!db.prepare("SELECT id FROM works WHERE id = ?").get(work.id)) {
              db.prepare(
                "INSERT INTO works (id, title, goodreads_id, page_count) VALUES (?, ?, ?, ?)",
              ).run(
                work.id,
                work.title,
                work.goodreads_id || null,
                work.page_count,
              );
            } else {
              db.prepare(
                "UPDATE works SET title = ?, goodreads_id = ?, page_count = ? WHERE id = ?",
              ).run(
                work.title || null,
                work.goodreads_id || null,
                work.page_count,
                work.id,
              );
            }
            workService.syncAuthors(work.id, work.authors);
            workService.syncTags(work.id, work.tags, "work_tags", "work_id");
          }
        })();
        res.json({
          success: true,
          message: `Imported ${parsedWorks.length} works successfully`,
        });
      } catch (error) {
        console.error(error);
        jsonError(res, 500, "Failed to bulk import works");
      }
    },
  );

  router.post(
    "/api/works/bulk-tags",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const { workIds, tags } = req.body;
        const normalizedWorkIds = asStringArray(workIds);
        const normalizedTags = asStringArray(tags);
        if (
          !normalizedWorkIds ||
          !normalizedTags ||
          !normalizedWorkIds.length ||
          !normalizedTags.length
        ) {
          return jsonError(res, 400, "Invalid payload.");
        }

        db.transaction(() => {
          for (const workId of normalizedWorkIds) {
            if (db.prepare("SELECT id FROM works WHERE id = ?").get(workId)) {
              for (const tag of normalizedTags) {
                db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(
                  tag,
                );
                const tagId = db
                  .prepare("SELECT id FROM tags WHERE name = ?")
                  .get(tag).id;
                db.prepare(
                  "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
                ).run(workId, tagId);
              }
            }
          }
        })();
        res.json({ success: true });
      } catch (error) {
        jsonError(res, 500, "Failed to bulk update tags.");
      }
    },
  );

  router.post("/api/works/:id", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id;
      const { action, value } = req.body;

      if (!["read", "liked", "shelved", "rating"].includes(action)) {
        return jsonError(res, 400, "Invalid action");
      }
      let safeValue = value;
      if (action === "rating") {
        const numericValue = Number(value);
        if (
          !Number.isInteger(numericValue) ||
          numericValue < 0 ||
          numericValue > 10
        ) {
          return jsonError(
            res,
            400,
            "rating must be an integer between 0 and 10.",
          );
        }
        safeValue = numericValue;
      } else {
        if (typeof value !== "boolean") {
          return jsonError(res, 400, `${action} must be a boolean.`);
        }
        safeValue = value ? 1 : 0;
      }

      db.prepare(
        `
      INSERT INTO user_work_interactions (user_id, work_id, ${action})
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, work_id) DO UPDATE SET ${action} = excluded.${action}
    `,
      ).run(userId, workId, safeValue);

      res.json({ success: true });
    } catch (error) {
      console.error("Interaction error:", error);
      jsonError(res, 500, "Failed to update interaction");
    }
  });

  router.delete(
    "/api/works/:id",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const id = req.params.id;
        db.transaction(() => {
          db.prepare("DELETE FROM work_authors WHERE work_id = ?").run(id);
          db.prepare("DELETE FROM work_tags WHERE work_id = ?").run(id);
          db.prepare("DELETE FROM work_quotes WHERE work_id = ?").run(id);
          db.prepare("DELETE FROM works WHERE id = ?").run(id);
        })();
        res.json({ success: true });
      } catch (error) {
        jsonError(res, 500, "Failed to delete work");
      }
    },
  );

  router.post("/api/works/:id/quotes", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id;
      const quote =
        typeof req.body.quote === "string" ? req.body.quote.trim() : "";
      const pageNumber = workService.normalizePageNumber(req.body.pageNumber);
      const hasExplicitPageNumber =
        req.body.pageNumber !== undefined &&
        req.body.pageNumber !== null &&
        `${req.body.pageNumber}`.trim() !== "";

      if (!quote) {
        return jsonError(res, 400, "Quote text is required.");
      }
      if (hasExplicitPageNumber && pageNumber === null) {
        return jsonError(res, 400, "pageNumber must be a positive integer.");
      }

      db.prepare(
        "INSERT INTO work_quotes (work_id, user_id, quote, page_number) VALUES (?, ?, ?, ?)",
      ).run(workId, userId, quote, pageNumber);

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to add quote:", error);
      res
        .status(error.statusCode || 500)
        .json({ error: error.message || "Failed to add quote" });
    }
  });

  router.post("/api/works/:id/progress", authenticateToken, (req, res) => {
    try {
      const result = workService.recordProgressUpdate(
        req.params.id,
        req.user.id,
        workService.normalizePageNumber(req.body.pageNumber),
        req.body.note || "",
      );
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Failed to save progress:", error);
      res.status(error.statusCode || 500).json({
        error: error.message || "Failed to save progress update",
      });
    }
  });

  router.post(
    "/api/works/:id/progress/finish",
    authenticateToken,
    (req, res) => {
      try {
        const result = workService.recordProgressUpdate(
          req.params.id,
          req.user.id,
          null,
          req.body.note || "",
          { markFinished: true },
        );
        res.json({ success: true, ...result });
      } catch (error) {
        console.error("Failed to finish work:", error);
        res.status(error.statusCode || 500).json({
          error: error.message || "Failed to finish work",
        });
      }
    },
  );

  router.put("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      const quote = asOptionalString(req.body?.quote);
      const pageNumberRaw = req.body?.pageNumber;
      const pageNumber =
        pageNumberRaw === null ||
        pageNumberRaw === undefined ||
        `${pageNumberRaw}`.trim() === ""
          ? null
          : workService.normalizePageNumber(pageNumberRaw);
      const userId = req.user.id;
      const quoteId = req.params.id;
      if (!quote) return jsonError(res, 400, "Quote text is required.");
      if (
        pageNumberRaw !== undefined &&
        pageNumberRaw !== null &&
        pageNumber === null
      ) {
        return jsonError(res, 400, "pageNumber must be a positive integer.");
      }

      const isAdmin = req.user.role === "admin";
      const result = isAdmin
        ? db
            .prepare(
              "UPDATE work_quotes SET quote = ?, page_number = ? WHERE id = ?",
            )
            .run(quote, pageNumber, quoteId)
        : db
            .prepare(
              "UPDATE work_quotes SET quote = ?, page_number = ? WHERE id = ? AND user_id = ?",
            )
            .run(quote, pageNumber, quoteId, userId);

      if (result.changes === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or quote not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update quote" });
    }
  });

  router.delete("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      const userId = req.user.id;
      const quoteId = req.params.id;
      const isAdmin = req.user.role === "admin";

      const result = isAdmin
        ? db.prepare("DELETE FROM work_quotes WHERE id = ?").run(quoteId)
        : db
            .prepare("DELETE FROM work_quotes WHERE id = ? AND user_id = ?")
            .run(quoteId, userId);

      if (result.changes === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or quote not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete quote" });
    }
  });

  return router;
}

module.exports = { createWorksRouter };

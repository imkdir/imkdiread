const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { jsonError } = require("../utils/errorHelpers");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getPublicPath } = require("../utils/paths");
const {
  asNonEmptyString,
  asOptionalString,
  asStringArray,
} = require("../utils/validators");

const workFilesDir = getPublicPath("files");
if (!fs.existsSync(workFilesDir)) {
  fs.mkdirSync(workFilesDir, { recursive: true });
}

const workCoversDir = getPublicPath("imgs", "covers");
if (!fs.existsSync(workCoversDir)) {
  fs.mkdirSync(workCoversDir, { recursive: true });
}

const workFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, workFilesDir),
  filename: (req, file, cb) => {
    const rawId = req.params?.id;
    const extension = path.extname(file.originalname);

    if (!rawId || extension !== ".pdf") return;

    cb(null, `${rawId}${extension}`);
  },
});

const workFileUpload = multer({
  storage: workFileStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

const workCoverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, workCoversDir),
  filename: (req, _file, cb) => {
    const rawId = req.params?.id;

    if (!rawId) {
      cb(new Error("Work ID is required."));
      return;
    }

    cb(null, `${rawId}.png`);
  },
});

const workCoverUpload = multer({
  storage: workCoverStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPng =
      file.mimetype === "image/png" ||
      path.extname(file.originalname).toLowerCase() === ".png";

    cb(null, isPng);
  },
});

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
        // .prepare("SELECT * FROM works ORDER BY RANDOM() LIMIT 12")
        .prepare("SELECT * FROM works")
        .all()
        .map((row) => workService.getWorkWithRelations(row, req.user?.id))
        .map(workService.processWork);
      const authors = db
        .prepare("SELECT authors.* FROM authors ORDER BY RANDOM() LIMIT 6")
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
      LEFT JOIN authors ON work_authors.author_id = authors.id
      WHERE works.id LIKE ? COLLATE NOCASE
         OR works.title LIKE ? COLLATE NOCASE
         OR tags.name LIKE ? COLLATE NOCASE
         OR REPLACE(REPLACE(tags.name, 'genre:', ''), '-', ' ') LIKE ? COLLATE NOCASE
         OR authors.name LIKE ? COLLATE NOCASE
      ORDER BY works.id ASC LIMIT 100
    `,
        )
        .all(term, term, term, term, term)
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
        SELECT works.*
        FROM works
        JOIN work_authors ON works.id = work_authors.work_id
        WHERE work_authors.author_id = ?
      `,
          )
          .all(authorRow.id);
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
            "UPDATE user_reading_activities SET work_id = ? WHERE work_id = ?",
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
    "/api/works/:id/dropbox-link",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const workId = req.params.id;
        const link = asOptionalString(req.body?.link);
        if (!link) {
          return jsonError(res, 400, "Dropbox link is required.");
        }

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        db.prepare("UPDATE works SET dropbox_link = ? WHERE id = ?").run(
          link,
          workId,
        );

        res.json({ success: true, dropbox_link: link });
      } catch (error) {
        console.error("Failed to save Dropbox link:", error);
        jsonError(res, 500, "Failed to save Dropbox link.");
      }
    },
  );

  router.put(
    "/api/works/:id/goodreads-id",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const workId = req.params.id;
        const goodreadsId = asNonEmptyString(req.body?.goodreads_id);
        if (!goodreadsId) {
          return jsonError(res, 400, "goodreads_id is required.");
        }

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        db.prepare("UPDATE works SET goodreads_id = ? WHERE id = ?").run(
          goodreadsId,
          workId,
        );

        res.json({ success: true, goodreads_id: goodreadsId });
      } catch (error) {
        console.error("Failed to save Goodreads ID:", error);
        jsonError(res, 500, "Failed to save Goodreads ID.");
      }
    },
  );

  router.post(
    "/api/works/:id/cover",
    authenticateToken,
    requireAdmin,
    workCoverUpload.single("file"),
    (req, res) => {
      try {
        const workId = req.params.id;

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        if (!req.file) {
          return jsonError(res, 400, "A PNG cover image is required.");
        }

        const fileUrl = `/imgs/covers/${req.file.filename}`;
        res.json({ success: true, url: fileUrl });
      } catch (error) {
        console.error("Failed to upload work cover:", error);
        jsonError(res, 500, "Failed to upload cover.");
      }
    },
  );

  router.post(
    "/api/works/:id/files",
    authenticateToken,
    requireAdmin,
    workFileUpload.single("file"),
    (req, res) => {
      try {
        const workId = req.params.id;

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        if (!req.file) {
          return jsonError(res, 400, "File is required.");
        }

        const fileUrl = `/files/${req.file.filename}`;
        res.json({ success: true, url: fileUrl });
      } catch (error) {
        console.error("Failed to upload work file:", error);
        jsonError(res, 500, "Failed to upload file.");
      }
    },
  );

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
          db.prepare("DELETE FROM user_reading_activities WHERE work_id = ?").run(id);
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
      const { quote: rawQuote, page_number, explanation } = req.body;
      const workId = req.params.id;
      const userId = req.user.id;
      const quote = typeof rawQuote === "string" ? rawQuote.trim() : "";
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

      // Update the INSERT statement
      const result = db
        .prepare(
          "INSERT INTO work_quotes (work_id, user_id, quote, page_number, explanation) VALUES (?, ?, ?, ?, ?)",
        )
        .run(workId, userId, quote, pageNumber, explanation || null);

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
      const result = workService.recordReadingActivity(
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
        const result = workService.recordReadingActivity(
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
      const explanation = asOptionalString(req.body?.explanation);
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
              "UPDATE work_quotes SET quote = ?, page_number = ?, explanation = ? WHERE id = ?",
            )
            .run(quote, pageNumber, explanation || null, quoteId)
        : db
            .prepare(
              "UPDATE work_quotes SET quote = ?, page_number = ?, explanation = ? WHERE id = ? AND user_id = ?",
            )
            .run(quote, pageNumber, explanation || null, quoteId, userId);

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

  // ============================================================================
  // DOMAIN: VOCABULARIES
  // ============================================================================

  // NEW: Smart Contextual Dictionary Lookup (Gemini)
  router.post(
    "/api/works/:id/dictionary/lookup",
    authenticateToken,
    async (req, res) => {
      try {
        const workId = req.params.id;
        const { word } = req.body;

        if (!word) return res.status(400).json({ error: "Word is required" });

        // 1. Get the book context from your database
        const work = db
          .prepare("SELECT title FROM works WHERE id = ?")
          .get(workId);
        if (!work) return res.status(404).json({ error: "Work not found" });

        // 2. Initialize Gemini (Using the current active 2.5 Flash model)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          // Modern models support strict JSON output natively!
          generationConfig: { responseMimeType: "application/json" },
        });

        const prompt = `
                You are an expert literary companion. The user is reading the book "${work.title}".
                They are looking up: "${word}".

                If this is a character, place, historical event, or specific lore from the book, provide a brief encyclopedic explanation of who or what it is in the "lore_note" field.
                If it is a standard vocabulary word, provide its standard definition.

                You MUST respond with a valid JSON object matching this exact structure:
                {
                  "word": "${word}",
                  "lore_note": "Your encyclopedic explanation of the character/place/lore within the context of the book. (Leave as null if it's just a normal dictionary word).",
                  "phonetic": "the phonetic spelling (optional)",
                  "meanings": [
                    {
                      "partOfSpeech": "noun/verb/adjective/etc",
                      "definitions": [
                        { "definition": "The precise definition of the word." }
                      ]
                    }
                  ]
                }
              `;

        // 4. Fetch and Parse
        const result = await model.generateContent(prompt);

        // Because we used responseMimeType, we can parse it instantly without regex!
        const dictionaryData = JSON.parse(result.response.text());

        res.json({ success: true, result: dictionaryData });
      } catch (error) {
        console.error("Gemini Dictionary Error:", error);
        res.status(500).json({ error: "Failed to look up word contextually." });
      }
    },
  );

  // NEW: Smart Contextual Passage Explanation (Gemini)
  router.post(
    "/api/works/:id/dictionary/explain",
    authenticateToken,
    async (req, res) => {
      try {
        const workId = req.params.id;
        const { text } = req.body;

        if (!text) return res.status(400).json({ error: "Text is required" });

        const work = db
          .prepare("SELECT title FROM works WHERE id = ?")
          .get(workId);
        if (!work) return res.status(404).json({ error: "Work not found" });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" },
        });

        const prompt = `
                You are an expert literary analyst. The user is reading "${work.title}".
                They copied the following passage from a PDF, which likely contains broken formatting, hyphenated line-breaks, or awkward spacing:

                "${text}"

                Task 1: Clean up the text. Remove broken PDF line breaks, fix hyphenated words, and restore the proper paragraph flow. Do NOT alter the author's actual words or punctuation, just fix the extraction errors.
                Task 2: Provide a concise, insightful explanation of this passage. Decode any complex metaphors, subtext, historical context, or relevance to the broader themes of the book. Keep it under 3 paragraphs.

                You MUST respond with ONLY a valid JSON object matching this strict structure:
                {
                  "cleaned_quote": "The perfectly formatted original text.",
                  "explanation": "Your detailed analysis here."
                }
              `;

        const result = await model.generateContent(prompt);
        const analysisData = JSON.parse(result.response.text());

        res.json({ success: true, result: analysisData });
      } catch (error) {
        console.error("Gemini Explain Error:", error);
        res.status(500).json({ error: "Failed to explain passage." });
      }
    },
  );

  // 1. GET all vocabularies for a specific work (Community + Personal)
  router.get("/api/works/:id/vocabularies", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;

      const vocabs = db
        .prepare(
          `
          SELECT v.*, u.username, u.avatar_url
          FROM vocabularies v
          JOIN users u ON v.user_id = u.id
          WHERE v.work_id = ?
          ORDER BY v.created_at DESC
        `,
        )
        .all(workId);

      // Parse the JSON string back into an object before sending to React
      const parsedVocabs = vocabs.map((v) => ({
        ...v,
        word_data: v.word_data ? JSON.parse(v.word_data) : null,
      }));

      res.json({ vocabularies: parsedVocabs });
    } catch (error) {
      console.error("Failed to fetch vocabularies:", error);
      res.status(500).json({ error: "Failed to fetch vocabularies" });
    }
  });

  // 2. POST (Save) a new vocabulary word
  router.post("/api/works/:id/vocabularies", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id;
      const { word, word_data } = req.body;

      if (!word) return res.status(400).json({ error: "Word is required" });

      const wordDataStr =
        typeof word_data === "object" ? JSON.stringify(word_data) : word_data;

      // ON CONFLICT DO UPDATE allows a user to "overwrite" or re-save a word without crashing
      db.prepare(
        `
          INSERT INTO vocabularies (user_id, work_id, word, word_data)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, work_id, word) DO UPDATE SET word_data = excluded.word_data
        `,
      ).run(userId, workId, word.toLowerCase(), wordDataStr);

      // Fetch the full record back out to return to the frontend
      const savedVocab = db
        .prepare(
          `
          SELECT v.*, u.username, u.avatar_url
          FROM vocabularies v
          JOIN users u ON v.user_id = u.id
          WHERE v.user_id = ? AND v.work_id = ? AND v.word = ?
        `,
        )
        .get(userId, workId, word.toLowerCase());

      savedVocab.word_data = JSON.parse(savedVocab.word_data);

      res.json({ success: true, vocabulary: savedVocab });
    } catch (error) {
      console.error("Failed to save vocabulary:", error);
      res.status(500).json({ error: "Failed to save vocabulary" });
    }
  });

  // 3. DELETE a vocabulary word
  router.delete(
    "/api/works/:workId/vocabularies/:wordId",
    authenticateToken,
    (req, res) => {
      try {
        const { wordId } = req.params;
        const userId = req.user.id;

        const result = db
          .prepare("DELETE FROM vocabularies WHERE id = ? AND user_id = ?")
          .run(wordId, userId);

        if (result.changes === 0) {
          return res
            .status(403)
            .json({ error: "Unauthorized or word not found" });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Failed to delete vocabulary:", error);
        res.status(500).json({ error: "Failed to delete vocabulary" });
      }
    },
  );

  return router;
}

module.exports = { createWorksRouter };

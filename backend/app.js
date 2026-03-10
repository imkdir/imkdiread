require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");

const multer = require("multer");

// 1. Ensure the avatars directory exists
const userAvatarDir = path.join(
  __dirname,
  "public.noindex",
  "imgs",
  "users",
  "avatars",
);
if (!fs.existsSync(userAvatarDir)) {
  fs.mkdirSync(userAvatarDir, { recursive: true });
}

// 2. Configure Multer Storage (Where and how to save the file)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, userAvatarDir);
  },
  filename: function (req, file, cb) {
    // Rename the file to ensure it's unique (e.g., "user123-162349123.jpg")
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, req.user.id + "-" + uniqueSuffix + ext);
  },
});

// 3. Create the upload middleware (Limit to 5MB to save disk space)
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function createApp(options = {}) {
  const app = express();
  const staticDir = options.staticDir || path.join(__dirname, "public.noindex");
  const dbPath =
    options.dbPath ||
    process.env.DB_PATH ||
    path.join(__dirname, "db", "database.sqlite");

  // ============================================================================
  // MIDDLEWARE & SETUP
  // ============================================================================
  app.use(cors());
  app.use(express.static(staticDir));
  app.use(express.json());

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const BACKEND_URL = options.backendUrl ?? process.env.BACKEND_URL ?? "";
  // ============================================================================
  // HELPER FUNCTIONS: FILE SYSTEM & URLS
  // ============================================================================

  /**
   * Checks if a file exists on disk. If so, returns the formatted URL.
   * @param {string[]} subDirs - Array of subdirectories inside 'public.noindex'
   * @param {string} filename - The name of the file
   */
  const getStaticUrlIfItExists = (subDirs, filename) => {
    if (!filename) return null;
    const filepath = path.join(
      __dirname,
      "public.noindex",
      ...subDirs,
      filename,
    );
    return fs.existsSync(filepath)
      ? `${BACKEND_URL}/${subDirs.join("/")}/${filename}`
      : null;
  };

  // ============================================================================
  // HELPER FUNCTIONS: DATABASE RELATIONS (DRY)
  // ============================================================================

  const syncTags = (entityId, tags, pivotTable, entityColumn) => {
    if (!tags || !Array.isArray(tags)) return;
    db.prepare(`DELETE FROM ${pivotTable} WHERE ${entityColumn} = ?`).run(
      entityId,
    );

    for (const tag of tags) {
      db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(tag);

      const tagId = db
        .prepare("SELECT id FROM tags WHERE name = ?")
        .get(tag).id;
      db.prepare(
        `INSERT OR IGNORE INTO ${pivotTable} (${entityColumn}, tag_id) VALUES (?, ?)`,
      ).run(entityId, tagId);
    }
  };

  const syncAuthors = (workId, authors) => {
    if (!authors || !Array.isArray(authors)) return;
    db.prepare("DELETE FROM work_authors WHERE work_id = ?").run(workId);
    for (const author of authors) {
      db.prepare("INSERT OR IGNORE INTO authors (name) VALUES (?)").run(author);
      db.prepare(
        "INSERT OR IGNORE INTO work_authors (work_id, author_name) VALUES (?, ?)",
      ).run(workId, author);
    }
  };

  // ============================================================================
  // HELPER FUNCTIONS: DATA PROCESSING
  // ============================================================================

  function getProgressWithWork(work) {
    const quotes = work.quotes || [];
    let current_page = 0;

    if (quotes.length) {
      let maxPageOverall = 0;
      let latestProgressTs = -1;

      // We only loop through the array EXACTLY once
      for (const q of quotes) {
        const pageNum = q.page_number || 0;

        // 1. Track the highest page number overall (This replaces your Math.max fallback)
        if (pageNum > maxPageOverall) {
          maxPageOverall = pageNum;
        }

        // 2. Check if it's a valid "progress update" quote
        if (pageNum && (!q.quote.length || q.quote.startsWith("@notes:"))) {
          // Parse the date EXACTLY once per valid quote, not hundreds of times
          const ts = Date.parse(q.created_at) || 0;

          // If this is the newest timestamp we've seen, save this page number
          if (ts > latestProgressTs) {
            latestProgressTs = ts;
            current_page = pageNum;
          }
        }
      }

      // If we never found a valid progress timestamp, fallback to the highest page seen
      if (latestProgressTs === -1) {
        return maxPageOverall;
      }
    }
    return current_page;
  }

  const processWork = (work) => {
    const coverFilename = work.goodreads_id ? `${work.goodreads_id}.png` : null;
    const fileFilename = `${work.id}.pdf`;

    return {
      ...work,
      current_page: getProgressWithWork(work),
      cover_img_url: getStaticUrlIfItExists(["imgs", "covers"], coverFilename),
      file_url: getStaticUrlIfItExists(["files"], fileFilename),
    };
  };

  const processAuthor = (author) => {
    const filename = author.goodreads_id ? `${author.goodreads_id}.png` : null;
    return {
      ...author,
      avatar_img_url: getStaticUrlIfItExists(["imgs", "avatars"], filename),
    };
  };

  // ============================================================================
  // HELPER FUNCTIONS: DATABASE FETCHERS
  // ============================================================================

  function getWorkWithRelations(workRow, userId = null) {
    const authors = db
      .prepare("SELECT author_name FROM work_authors WHERE work_id = ?")
      .all(workRow.id)
      .map((r) => r.author_name);

    const tags = db
      .prepare(
        "SELECT tags.name FROM work_tags JOIN tags ON work_tags.tag_id = tags.id WHERE work_id = ?",
      )
      .all(workRow.id)
      .map((r) => r.name);

    // Filter quotes so they only see THEIR OWN quotes
    const quotes = userId
      ? db
          .prepare(
            "SELECT * FROM work_quotes WHERE work_id = ? AND user_id = ? ORDER BY created_at DESC",
          )
          .all(workRow.id, userId)
      : db
          .prepare(
            "SELECT * FROM work_quotes WHERE work_id = ? ORDER BY created_at DESC",
          )
          .all(workRow.id);

    // Grab their personal interaction stats (If they aren't logged in, default to 0)
    let userStats = { read: 0, liked: 0, shelved: 0, rating: 0 };
    if (userId) {
      const stats = db
        .prepare(
          "SELECT read, liked, shelved, rating FROM user_work_interactions WHERE user_id = ? AND work_id = ?",
        )
        .get(userId, workRow.id);
      if (stats) userStats = stats;
    }

    // Merge the book data, relations, and user stats together
    return { ...workRow, authors, tags, quotes, ...userStats };
  }

  function getAuthorWithRelations(authorRow, userId = null) {
    if (!authorRow) return null;

    const count = db
      .prepare(
        "SELECT COUNT(*) as count FROM work_authors WHERE author_name = ?",
      )
      .get(authorRow.name).count;

    let followed = false;
    if (userId) {
      const row = db
        .prepare(
          "SELECT followed FROM user_author_interactions WHERE user_id = ? AND author_name = ?",
        )
        .get(userId, authorRow.name);
      followed = !!row?.followed;
    }

    return { ...authorRow, works_count: count, followed };
  }

  function normalizePageNumber(value) {
    const pageNumber = Number(value);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;
    return Math.floor(pageNumber);
  }

  function normalizeProgressQuote(note) {
    const trimmed = typeof note === "string" ? note.trim() : "";
    return trimmed ? `@notes:${trimmed}` : "";
  }

  function ensureUserWorkInteraction(userId, workId) {
    db.prepare(
      `INSERT OR IGNORE INTO user_work_interactions (user_id, work_id) VALUES (?, ?)`,
    ).run(userId, workId);
  }

  function recordProgressUpdate(
    workId,
    userId,
    pageNumber,
    note = "",
    options = {},
  ) {
    const work = db
      .prepare("SELECT page_count FROM works WHERE id = ?")
      .get(workId);
    if (!work) {
      const error = new Error("Work not found");
      error.statusCode = 404;
      throw error;
    }

    const totalPages = Number(work.page_count) || 0;
    const markFinished = !!options.markFinished;
    const safePageNumber = markFinished ? totalPages || pageNumber : pageNumber;

    if (!safePageNumber) {
      const error = new Error("A valid page number is required.");
      error.statusCode = 400;
      throw error;
    }

    const progressQuote = normalizeProgressQuote(note);

    db.transaction(() => {
      db.prepare(
        "INSERT INTO work_quotes (work_id, user_id, quote, page_number) VALUES (?, ?, ?, ?)",
      ).run(workId, userId, progressQuote, safePageNumber);

      ensureUserWorkInteraction(userId, workId);

      const isFinished =
        markFinished || (totalPages > 0 && safePageNumber >= totalPages);

      db.prepare(
        `UPDATE user_work_interactions
       SET shelved = 0, read = ?
       WHERE user_id = ? AND work_id = ?`,
      ).run(isFinished ? 1 : 0, userId, workId);
    })();

    return {
      page_number: safePageNumber,
      page_count: totalPages,
      read: markFinished || (totalPages > 0 && safePageNumber >= totalPages),
    };
  }

  // ============================================================================
  // HELPER FUNCTIONS: AUTH MIDDLEWARES
  // ============================================================================

  const jwt = require("jsonwebtoken");
  const bcrypt = require("bcryptjs");
  const { v4: uuidv4 } = require("uuid");

  const jsonError = (res, statusCode, message) =>
    res.status(statusCode).json({ error: message });

  const asNonEmptyString = (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const asOptionalString = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const asStringArray = (value) => {
    if (!Array.isArray(value)) return null;
    const normalized = value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return normalized;
  };

  const parseWorkPayload = (rawWork) => {
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
  };

  // Middleware 1: Are you logged in?
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer <token>"

    if (!token) return jsonError(res, 401, "Access denied. Please log in.");

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return jsonError(res, 403, "Invalid or expired token.");
      req.user = user; // Attach the user payload (id, username, role) to the request
      next();
    });
  };

  // Middleware 2: Are you the boss?
  const requireAdmin = (req, res, next) => {
    if (!req.user) {
      return jsonError(res, 401, "Access denied. Please log in.");
    }
    if (req.user.role !== "admin") {
      return jsonError(res, 403, "Admin privileges required.");
    }
    next();
  };

  // ============================================================================
  // DOMAIN: AUTH
  // ============================================================================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const username = asNonEmptyString(req.body?.username);
      const password = asNonEmptyString(req.body?.password);
      const inviteCode = asNonEmptyString(req.body?.inviteCode);

      if (!username || !password || !inviteCode) {
        return jsonError(
          res,
          400,
          "username, password, and inviteCode are required.",
        );
      }

      // 1. Check the invitation code
      if (inviteCode !== process.env.GUEST_INVITE_CODE) {
        return jsonError(res, 403, "Invalid invitation code.");
      }

      // 2. Check if username exists
      const existingUser = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username);
      if (existingUser) {
        return jsonError(res, 400, "Username is already taken.");
      }

      // 3. Hash the password and save the guest
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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const username = asNonEmptyString(req.body?.username);
      const password = asNonEmptyString(req.body?.password);

      if (!username || !password) {
        return jsonError(res, 400, "username and password are required.");
      }

      // 1. Find the user
      const user = db
        .prepare("SELECT * FROM users WHERE username = ?")
        .get(username);
      if (!user) {
        return jsonError(res, 400, "Invalid username or password.");
      }

      // 2. Check the password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return jsonError(res, 400, "Invalid username or password.");
      }

      // 3. Generate the JWT token (expires in 7 days)
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" },
      );

      // Send the token and user data back to React
      res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role },
      });
    } catch (error) {
      jsonError(res, 500, "Failed to log in.");
    }
  });

  // ============================================================================
  // DOMAIN: TAGS & SERIES
  // ============================================================================

  app.get("/api/tags", authenticateToken, requireAdmin, (req, res) => {
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

  app.post("/api/tags", authenticateToken, requireAdmin, (req, res) => {
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

  app.put("/api/tags/:oldName", authenticateToken, requireAdmin, (req, res) => {
    try {
      const oldName = req.params.oldName;
      const newName = asNonEmptyString(req.body?.newName);
      if (!newName) return jsonError(res, 400, "New tag name required.");

      db.transaction(() => {
        db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(newName);
        const newTagId = db
          .prepare("SELECT id FROM tags WHERE name = ?")
          .get(newName).id;
        const oldTag = db
          .prepare("SELECT id FROM tags WHERE name = ?")
          .get(oldName);
        if (!oldTag) return;

        // Migrate relationships to the new ID, then delete the old one
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

  app.delete("/api/tags/:name", authenticateToken, requireAdmin, (req, res) => {
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

  app.get("/api/series", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM series ORDER BY count DESC").all();
      res.json(
        rows.map((s) => ({
          ...s,
          img_url: getStaticUrlIfItExists(["imgs", "series"], `${s.text}.png`),
        })),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to read series data" });
    }
  });

  // ============================================================================
  // DOMAIN: AUTHORS
  // ============================================================================

  app.get("/api/authors", authenticateToken, (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM authors ORDER BY name").all();
      res.json(
        rows
          .map((row) => getAuthorWithRelations(row, req.user?.id))
          .map(processAuthor),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load authors" });
    }
  });

  app.post("/api/authors", authenticateToken, requireAdmin, (req, res) => {
    try {
      const authorName = asNonEmptyString(req.body?.name);
      const goodreadsId = asOptionalString(req.body?.goodreads_id) || "";
      if (!authorName) return jsonError(res, 400, "Author name is required.");

      if (
        db.prepare("SELECT name FROM authors WHERE name = ?").get(authorName)
      ) {
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

  app.post("/api/authors/:name/follow", authenticateToken, (req, res) => {
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
        `
      INSERT INTO user_author_interactions (user_id, author_name, followed)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, author_name)
      DO UPDATE SET followed = excluded.followed
    `,
      ).run(userId, authorName, followed);

      res.json({ success: true, followed: !!followed });
    } catch (error) {
      console.error("Failed to update author follow:", error);
      res.status(500).json({ error: "Failed to update follow status." });
    }
  });

  app.put("/api/authors/:name", authenticateToken, requireAdmin, (req, res) => {
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
        return jsonError(
          res,
          400,
          "goodreads_id must be a string when provided.",
        );
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

  // ============================================================================
  // DOMAIN: WORKS
  // ============================================================================

  app.get("/api/explore", authenticateToken, (req, res) => {
    try {
      const works = db
        .prepare("SELECT * FROM works ORDER BY RANDOM() LIMIT 12")
        .all()
        .map((row) => getWorkWithRelations(row, req.user?.id))
        .map(processWork);
      const authors = db
        .prepare(
          `
      SELECT authors.*, COUNT(work_authors.work_id) as works_count
      FROM authors LEFT JOIN work_authors ON authors.name = work_authors.author_name
      GROUP BY authors.name ORDER BY RANDOM() LIMIT 6
    `,
        )
        .all()
        .map((row) => getAuthorWithRelations(row, req.user?.id))
        .map(processAuthor);

      res.json({ works, authors });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate explore feed" });
    }
  });

  app.get("/api/search", authenticateToken, (req, res) => {
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
        .map((row) => getWorkWithRelations(row, req.user?.id))
        .map(processWork);

      res.json({ results: works });
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/collection/:keyword", authenticateToken, (req, res) => {
    try {
      const keyword = req.params.keyword;
      const authorRow = db
        .prepare("SELECT * FROM authors WHERE name = ?")
        .get(keyword);

      let matchedRows = [];
      let profile = null;

      if (authorRow) {
        profile = processAuthor(
          getAuthorWithRelations(authorRow, req.user?.id),
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
          .map((row) => getWorkWithRelations(row, req.user?.id))
          .map(processWork),
        profile,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load collection" });
    }
  });

  app.get("/api/works", authenticateToken, (req, res) => {
    try {
      res.json(
        db
          .prepare("SELECT * FROM works")
          .all()
          .map((row) => getWorkWithRelations(row, req.user?.id))
          .map(processWork),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load works" });
    }
  });

  app.get("/api/works/:id", authenticateToken, (req, res) => {
    try {
      const workRow = db
        .prepare("SELECT * FROM works WHERE id = ?")
        .get(req.params.id);
      if (!workRow) return res.status(404).json({ error: "Work not found" });

      // Pass req.user.id so it grabs their specific likes/reads!
      res.json(processWork(getWorkWithRelations(workRow, req.user?.id)));
    } catch (error) {
      res.status(500).json({ error: "Failed to load work" });
    }
  });

  app.post("/api/works", authenticateToken, requireAdmin, (req, res) => {
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

        syncAuthors(work.id, work.authors);
        syncTags(work.id, work.tags, "work_tags", "work_id");
      })();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to add work");
    }
  });

  app.put("/api/works/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
      const id = req.params.id;
      const parsed = parseWorkPayload(req.body);
      if (parsed.error) return jsonError(res, 400, parsed.error);
      const work = parsed.work;

      db.transaction(() => {
        if (work.id !== id) {
          db.prepare("PRAGMA foreign_keys=OFF;").run();
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

          db.prepare("UPDATE work_authors SET work_id = ? WHERE work_id = ?").run(
            work.id,
            id,
          );
          db.prepare("UPDATE work_tags SET work_id = ? WHERE work_id = ?").run(
            work.id,
            id,
          );
          db.prepare("UPDATE work_quotes SET work_id = ? WHERE work_id = ?").run(
            work.id,
            id,
          );
          db.prepare("PRAGMA foreign_keys=ON;").run();
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

        syncAuthors(work.id, work.authors);
        syncTags(work.id, work.tags, "work_tags", "work_id");
      })();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to update work");
    }
  });

  // Handle User Interactions (Like, Read, Shelve, Rating)
  app.post("/api/works/:id", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id; // Guaranteed to exist because of authenticateToken middleware
      const { action, value } = req.body;

      // Make sure they are only sending valid actions
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

  app.delete("/api/works/:id", authenticateToken, requireAdmin, (req, res) => {
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
  });

  app.post(
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
            syncAuthors(work.id, work.authors);
            syncTags(work.id, work.tags, "work_tags", "work_id");
          }
        })();
        res.json({
          success: true,
          message: `Imported ${parsedWorks.length} works successfully`,
        });
      } catch (error) {
        jsonError(res, 500, "Failed to bulk import works");
      }
    },
  );

  app.post(
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
              // Instead of overriding existing tags, bulk-tagging usually appends.
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

  app.post("/api/works/:id/quotes", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id;
      const quote =
        typeof req.body.quote === "string" ? req.body.quote.trim() : "";
      const pageNumber = normalizePageNumber(req.body.pageNumber);
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

  app.post("/api/works/:id/progress", authenticateToken, (req, res) => {
    try {
      const result = recordProgressUpdate(
        req.params.id,
        req.user.id,
        normalizePageNumber(req.body.pageNumber),
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

  app.post("/api/works/:id/progress/finish", authenticateToken, (req, res) => {
    try {
      const result = recordProgressUpdate(
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
  });

  // EDIT A QUOTE (Ownership Guarded)
  app.put("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      const quote = asNonEmptyString(req.body?.quote);
      const pageNumberRaw = req.body?.pageNumber;
      const pageNumber =
        pageNumberRaw === null ||
        pageNumberRaw === undefined ||
        `${pageNumberRaw}`.trim() === ""
          ? null
          : normalizePageNumber(pageNumberRaw);
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

      // 1. Check if the user is an admin
      const isAdmin = req.user.role === "admin";

      // 2. Build the query: Admins can edit anything, Guests can only edit their own
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

  // DELETE A QUOTE (Ownership Guarded)
  app.delete("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      const userId = req.user.id;
      const quoteId = req.params.id;
      const isAdmin = req.user.role === "admin";

      // Admins delete anything, Guests delete only their own
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
  // DOMAIN: SCREENSAVERS
  // ============================================================================

  app.get("/api/screensavers", (req, res) => {
    try {
      const folder = path.join(
        __dirname,
        "public.noindex",
        "imgs",
        "screensavers",
      );
      const files = fs.readdirSync(folder).filter((f) => !f.startsWith("."));
      const index = Math.floor(Math.random() * files.length);
      res.json({
        images: files.map((img) => `${BACKEND_URL}/imgs/screensavers/${img}`),
        index,
      });
    } catch (error) {
      console.error("Screensaver API crashed:", error.message);
      res.status(500).json({ error: "Failed to load screensavers" });
    }
  });

  // ============================================================================
  // DOMAIN: USER PROFILE
  // ============================================================================

  app.get("/api/profile/me", authenticateToken, (req, res) => {
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
        .map((row) => getWorkWithRelations(row, userId))
        .map(processWork);

      const reading = processedBooks.filter(
        (b) => b.current_page > 0 && !b.read,
      );
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
          const matchingBook = processedBooks.find(
            (b) => b.id === quote.work_id,
          );
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

  app.put("/api/profile/me", authenticateToken, (req, res) => {
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

      res.json({ success: true });
    } catch (error) {
      console.error("Profile Update Error:", error);
      res.status(500).json({ error: "Failed to update profile settings" });
    }
  });

  app.post(
    "/api/profile/avatar",
    authenticateToken,
    upload.single("avatar"),
    (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No image provided" });
        }

        // The file is already saved by Multer into public.noindex/imgs/users/avatars/
        const avatarUrl = `/imgs/users/avatars/${req.file.filename}`;

        db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(
          avatarUrl,
          req.user.id,
        );

        res.json({ success: true, avatar_url: avatarUrl });
      } catch (error) {
        console.error("Avatar Upload Error:", error);
        res.status(500).json({ error: "Failed to upload avatar" });
      }
    },
  );

  app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") {
      return jsonError(res, 400, "Invalid JSON payload.");
    }
    console.error("Unhandled API error:", err);
    return jsonError(res, 500, "Internal server error.");
  });

  // ============================================================================
  // CATCH-ALL ROUTE (MUST BE LAST)
  // ============================================================================

  // app.get(/.*/, (req, res) => {
  //   res.sendFile(path.join(__dirname, "public.noindex", "index.html"));
  // });

  return { app, db };
}

function startServer(options = {}) {
  const { app } = createApp(options);
  const port = options.port || process.env.PORT || 3001;
  const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  return { app, server };
}

module.exports = { createApp, startServer };

if (require.main === module) {
  startServer();
}

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// MIDDLEWARE & SETUP
// ============================================================================
app.use(cors());
app.use(express.static(path.join(__dirname, "public.noindex")));
app.use(express.json());

const dbPath = path.join(__dirname, "db", "database.sqlite");
const db = new Database(dbPath);

const BACKEND_URL = "";

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
  const filepath = path.join(__dirname, "public.noindex", ...subDirs, filename);
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

    const tagId = db.prepare("SELECT id FROM tags WHERE name = ?").get(tag).id;
    db.prepare(
      `INSERT OR IGNORE INTO ${pivotTable} (${entityColumn}, tag_id) VALUES (?, ?)`,
    ).run(entityId, tagId);
  }
};

const syncAuthors = (workId, authors) => {
  if (!authors || !Array.isArray(authors)) return;
  db.prepare("DELETE FROM pdf_authors WHERE pdf_id = ?").run(workId);
  for (const author of authors) {
    db.prepare("INSERT OR IGNORE INTO authors (name) VALUES (?)").run(author);
    db.prepare(
      "INSERT OR IGNORE INTO pdf_authors (pdf_id, author_name) VALUES (?, ?)",
    ).run(workId, author);
  }
};

// ============================================================================
// HELPER FUNCTIONS: DATA PROCESSING
// ============================================================================

const processWork = (work) => {
  const quotes = work.quotes || [];
  let current_page = 0;

  if (quotes.length) {
    const sortedEmptyQuotes = quotes
      .filter((q) => !q.quote)
      .sort(
        (a, b) =>
          (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0),
      );

    if (sortedEmptyQuotes.length) {
      current_page =
        sortedEmptyQuotes[sortedEmptyQuotes.length - 1].page_number || 0;
    } else {
      current_page = Math.max(...quotes.map((q) => q.page_number || 0));
    }
  }

  const coverFilename = work.goodreads_id ? `${work.goodreads_id}.png` : null;
  const fileFilename = `${work.id}.pdf`;

  return {
    ...work,
    current_page,
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

function getWorkWithRelations(workRow) {
  const authors = db
    .prepare("SELECT author_name FROM pdf_authors WHERE pdf_id = ?")
    .all(workRow.id)
    .map((r) => r.author_name);
  const tags = db
    .prepare(
      "SELECT tags.name FROM pdf_tags JOIN tags ON pdf_tags.tag_id = tags.id WHERE pdf_id = ?",
    )
    .all(workRow.id)
    .map((r) => r.name);
  const quotes = db
    .prepare(
      "SELECT * FROM pdf_quotes WHERE pdf_id = ? ORDER BY created_at DESC",
    )
    .all(workRow.id);
  return { ...workRow, authors, tags, quotes };
}

function getAuthorWithRelations(authorRow) {
  if (!authorRow) return null;
  const count = db
    .prepare("SELECT COUNT(*) as count FROM pdf_authors WHERE author_name = ?")
    .get(authorRow.name).count;
  return { ...authorRow, works_count: count };
}

// ============================================================================
// HELPER FUNCTIONS: AUTH MIDDLEWARES
// ============================================================================

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

// Middleware 1: Are you logged in?
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer <token>"

  if (!token)
    return res.status(401).json({ error: "Access denied. Please log in." });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user; // Attach the user payload (id, username, role) to the request
    next();
  });
};

// Middleware 2: Are you the boss?
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required." });
  }
  next();
};

// ============================================================================
// DOMAIN: AUTH
// ============================================================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;

    // 1. Check the invitation code
    if (inviteCode !== process.env.GUEST_INVITE_CODE) {
      return res.status(403).json({ error: "Invalid invitation code." });
    }

    // 2. Check if username exists
    const existingUser = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(username);
    if (existingUser) {
      return res.status(400).json({ error: "Username is already taken." });
    }

    // 3. Hash the password and save the guest
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = uuidv4();

    db.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
    ).run(userId, username, passwordHash, "guest");

    res.json({ success: true, message: "Guest account created successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Failed to register user." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Find the user
    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);
    if (!user) {
      return res.status(400).json({ error: "Invalid username or password." });
    }

    // 2. Check the password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid username or password." });
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
    res.status(500).json({ error: "Failed to log in." });
  }
});

// ============================================================================
// DOMAIN: TAGS & SERIES
// ============================================================================

app.get("/api/tags", (req, res) => {
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

app.post("/api/tags", (req, res) => {
  try {
    const { newTag } = req.body;
    if (!newTag) return res.status(400).json({ error: "Tag name required." });

    const existing = db
      .prepare("SELECT id FROM tags WHERE name = ?")
      .get(newTag);
    if (existing) return res.status(400).json({ error: "Tag already exists." });

    db.prepare("INSERT INTO tags (name) VALUES (?)").run(newTag);
    const tags = db
      .prepare("SELECT name FROM tags ORDER BY name")
      .all()
      .map((r) => r.name);
    res.json({ success: true, tags });
  } catch (error) {
    res.status(500).json({ error: "Failed to add tag." });
  }
});

app.put("/api/tags/:oldName", (req, res) => {
  try {
    const oldName = req.params.oldName;
    const { newName } = req.body;
    if (!newName)
      return res.status(400).json({ error: "New tag name required." });

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
        .prepare("SELECT pdf_id FROM pdf_tags WHERE tag_id = ?")
        .all(oldTag.id)) {
        db.prepare(
          "INSERT OR IGNORE INTO pdf_tags (pdf_id, tag_id) VALUES (?, ?)",
        ).run(w.pdf_id, newTagId);
      }
      db.prepare("DELETE FROM pdf_tags WHERE tag_id = ?").run(oldTag.id);

      db.prepare("DELETE FROM tags WHERE id = ?").run(oldTag.id);
    })();
    res.json({ success: true, message: `Renamed ${oldName} to ${newName}.` });
  } catch (error) {
    res.status(500).json({ error: "Failed to rename tag." });
  }
});

app.delete("/api/tags/:name", (req, res) => {
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
    res.status(500).json({ error: "Failed to delete tag." });
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

app.get("/api/authors", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM authors ORDER BY name").all();
    res.json(rows.map(getAuthorWithRelations).map(processAuthor));
  } catch (error) {
    res.status(500).json({ error: "Failed to load authors" });
  }
});

app.post("/api/authors", (req, res) => {
  try {
    const newAuthor = req.body;
    if (!newAuthor || !newAuthor.name)
      return res.status(400).json({ error: "Author name is required." });

    if (
      db.prepare("SELECT name FROM authors WHERE name = ?").get(newAuthor.name)
    ) {
      return res.status(400).json({ error: "Author already exists." });
    }

    db.transaction(() => {
      db.prepare(
        "INSERT INTO authors (name, goodreads_id, followed) VALUES (?, ?, ?)",
      ).run(
        newAuthor.name,
        newAuthor.goodreads_id || "",
        newAuthor.followed ? 1 : 0,
      );
      syncTags(newAuthor.name, newAuthor.tags, "author_tags", "author_name");
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add author" });
  }
});

app.put("/api/authors/:name", (req, res) => {
  try {
    const targetName = req.params.name;
    const exists = db
      .prepare("SELECT * FROM authors WHERE name = ?")
      .get(targetName);
    if (!exists) return res.status(404).json({ error: "Author not found." });

    db.transaction(() => {
      db.prepare(
        "UPDATE authors SET goodreads_id = ?, followed = ? WHERE name = ?",
      ).run(
        req.body.goodreads_id || exists.goodreads_id || "",
        req.body.followed ? 1 : 0,
        targetName,
      );
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update author" });
  }
});

// ============================================================================
// DOMAIN: WORKS
// ============================================================================

app.get("/api/explore", (req, res) => {
  try {
    const works = db
      .prepare("SELECT * FROM pdfs ORDER BY RANDOM() LIMIT 12")
      .all()
      .map(getWorkWithRelations)
      .map(processWork);
    const authors = db
      .prepare(
        `
      SELECT authors.*, COUNT(pdf_authors.pdf_id) as works_count
      FROM authors LEFT JOIN pdf_authors ON authors.name = pdf_authors.author_name
      GROUP BY authors.name ORDER BY RANDOM() LIMIT 6
    `,
      )
      .all()
      .map((r) => processAuthor({ ...r, followed: !!r.followed }));

    res.json({ works, authors });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate explore feed" });
  }
});

app.get("/api/search", (req, res) => {
  try {
    const term = `%${(req.query.q || "").trim()}%`;
    if (term === "%%") return res.json({ results: [] });

    const works = db
      .prepare(
        `
      SELECT DISTINCT pdfs.* FROM pdfs
      LEFT JOIN pdf_tags ON pdfs.id = pdf_tags.pdf_id
      LEFT JOIN tags ON pdf_tags.tag_id = tags.id
      LEFT JOIN pdf_authors ON pdfs.id = pdf_authors.pdf_id
      WHERE pdfs.id LIKE ? COLLATE NOCASE OR pdfs.title LIKE ? COLLATE NOCASE OR tags.name LIKE ? COLLATE NOCASE OR pdf_authors.author_name LIKE ? COLLATE NOCASE
      ORDER BY pdfs.id ASC LIMIT 100
    `,
      )
      .all(term, term, term, term)
      .map(getWorkWithRelations)
      .map(processWork);

    res.json({ results: works });
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/collection/:keyword", (req, res) => {
  try {
    const keyword = req.params.keyword;
    const authorRow = db
      .prepare("SELECT * FROM authors WHERE name = ?")
      .get(keyword);

    let matchedRows = [];
    let profile = null;

    if (authorRow) {
      profile = processAuthor(getAuthorWithRelations(authorRow));
      matchedRows = db
        .prepare(
          `
        SELECT pdfs.* FROM pdfs JOIN pdf_authors ON pdfs.id = pdf_authors.pdf_id WHERE pdf_authors.author_name = ?
      `,
        )
        .all(keyword);
    } else {
      matchedRows = db
        .prepare(
          `
        SELECT pdfs.* FROM pdfs JOIN pdf_tags ON pdfs.id = pdf_tags.pdf_id JOIN tags ON pdf_tags.tag_id = tags.id WHERE tags.name = ?
      `,
        )
        .all(keyword);
    }

    res.json({
      works: matchedRows.map(getWorkWithRelations).map(processWork),
      profile,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load collection" });
  }
});

app.get("/api/works", (req, res) => {
  try {
    res.json(
      db
        .prepare("SELECT * FROM pdfs")
        .all()
        .map(getWorkWithRelations)
        .map(processWork),
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to load works" });
  }
});

app.get("/api/works/:id", (req, res) => {
  try {
    const workRow = db
      .prepare("SELECT * FROM pdfs WHERE id = ?")
      .get(req.params.id);
    if (!workRow) return res.status(404).json({ error: "Work not found" });
    res.json(processWork(getWorkWithRelations(workRow)));
  } catch (error) {
    res.status(500).json({ error: "Failed to load work" });
  }
});

app.post("/api/works", (req, res) => {
  try {
    const work = req.body;
    if (!work || !work.id)
      return res.status(400).json({ error: "Work ID is required." });

    db.transaction(() => {
      db.prepare(
        `
        INSERT INTO pdfs (id, title, goodreads_id, page_count, dropbox_link, amazon_asin)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(
        work.id,
        work.title,
        work.goodreads_id || null,
        work.page_count || 0,
        work.dropbox_link || null,
        work.amazon_asin || null,
      );

      syncAuthors(work.id, work.authors);
      syncTags(work.id, work.tags, "pdf_tags", "pdf_id");
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add work" });
  }
});

app.put("/api/works/:id", (req, res) => {
  try {
    const id = req.params.id;
    const work = req.body;

    db.transaction(() => {
      if (work.id !== id) {
        db.prepare("PRAGMA foreign_keys=OFF;").run();
        db.prepare(
          `UPDATE pdfs SET id = ?, title = ?, goodreads_id = ?, page_count = ?, dropbox_link = ?, amazon_asin = ? WHERE id = ?`,
        ).run(
          work.id,
          work.title || null,
          work.goodreads_id || null,
          work.page_count || 0,
          work.dropbox_link || null,
          work.amazon_asin || null,
          id,
        );

        db.prepare("UPDATE pdf_authors SET pdf_id = ? WHERE pdf_id = ?").run(
          work.id,
          id,
        );
        db.prepare("UPDATE pdf_tags SET pdf_id = ? WHERE pdf_id = ?").run(
          work.id,
          id,
        );
        db.prepare("UPDATE pdf_quotes SET pdf_id = ? WHERE pdf_id = ?").run(
          work.id,
          id,
        );
        db.prepare("PRAGMA foreign_keys=ON;").run();
      } else {
        db.prepare(
          `UPDATE pdfs SET title = ?, goodreads_id = ?, page_count = ?, dropbox_link = ?, amazon_asin = ? WHERE id = ?`,
        ).run(
          work.title || null,
          work.goodreads_id || null,
          work.page_count || 0,
          work.dropbox_link || null,
          work.amazon_asin || null,
          id,
        );
      }

      syncAuthors(work.id, work.authors);
      syncTags(work.id, work.tags, "pdf_tags", "pdf_id");
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update work" });
  }
});

app.patch("/api/works/:id", (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;

    // Support partial body spread OR the old action/value pair
    const updates = [];
    const values = [];

    if (body.action !== undefined && body.value !== undefined) {
      updates.push(`${body.action} = ?`);
      values.push(
        body.value === true ? 1 : body.value === false ? 0 : body.value,
      );
    } else {
      for (const [key, val] of Object.entries(body)) {
        updates.push(`${key} = ?`);
        values.push(val === true ? 1 : val === false ? 0 : val);
      }
    }

    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE pdfs SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
      );
    }

    res.json(
      processWork(
        getWorkWithRelations(
          db.prepare("SELECT * FROM pdfs WHERE id = ?").get(id),
        ),
      ),
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to update work data" });
  }
});

app.delete("/api/works/:id", (req, res) => {
  try {
    const id = req.params.id;
    db.transaction(() => {
      db.prepare("DELETE FROM pdf_authors WHERE pdf_id = ?").run(id);
      db.prepare("DELETE FROM pdf_tags WHERE pdf_id = ?").run(id);
      db.prepare("DELETE FROM pdf_quotes WHERE pdf_id = ?").run(id);
      db.prepare("DELETE FROM pdfs WHERE id = ?").run(id);
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete work" });
  }
});

app.post("/api/works/bulk-import", (req, res) => {
  try {
    const works = req.body;
    if (!Array.isArray(works))
      return res.status(400).json({ error: "Expected an array" });

    db.transaction(() => {
      for (const work of works) {
        if (!db.prepare("SELECT id FROM pdfs WHERE id = ?").get(work.id)) {
          db.prepare(
            "INSERT INTO pdfs (id, title, goodreads_id, page_count) VALUES (?, ?, ?, ?)",
          ).run(
            work.id,
            work.title,
            work.goodreads_id || null,
            work.page_count || 0,
          );
        } else {
          db.prepare(
            "UPDATE pdfs SET title = ?, goodreads_id = ?, page_count = ? WHERE id = ?",
          ).run(
            work.title || null,
            work.goodreads_id || null,
            work.page_count || 0,
            work.id,
          );
        }
        syncAuthors(work.id, work.authors);
        syncTags(work.id, work.tags, "pdf_tags", "pdf_id");
      }
    })();
    res.json({
      success: true,
      message: `Imported ${works.length} works successfully`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to bulk import works" });
  }
});

app.post("/api/works/bulk-tags", (req, res) => {
  try {
    const { workIds, tags } = req.body;
    if (!Array.isArray(workIds) || !Array.isArray(tags))
      return res.status(400).json({ error: "Invalid payload." });

    db.transaction(() => {
      for (const workId of workIds) {
        if (db.prepare("SELECT id FROM pdfs WHERE id = ?").get(workId)) {
          // Instead of overriding existing tags, bulk-tagging usually appends.
          for (const tag of tags) {
            db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(tag);
            const tagId = db
              .prepare("SELECT id FROM tags WHERE name = ?")
              .get(tag).id;
            db.prepare(
              "INSERT OR IGNORE INTO pdf_tags (pdf_id, tag_id) VALUES (?, ?)",
            ).run(workId, tagId);
          }
        }
      }
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to bulk update tags." });
  }
});

app.post("/api/works/:id/quotes", (req, res) => {
  try {
    db.prepare(
      "INSERT INTO pdf_quotes (pdf_id, quote, page_number) VALUES (?, ?, ?)",
    ).run(req.params.id, req.body.quote, req.body.pageNumber || null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add quote" });
  }
});

app.put("/api/quotes/:id", (req, res) => {
  try {
    db.prepare(
      "UPDATE pdf_quotes SET quote = ?, page_number = ? WHERE id = ?",
    ).run(req.body.quote, req.body.pageNumber || null, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update quote" });
  }
});

app.delete("/api/quotes/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM pdf_quotes WHERE id = ?").run(req.params.id);
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
// CATCH-ALL ROUTE (MUST BE LAST)
// ============================================================================

// app.get(/.*/, (req, res) => {
//   res.sendFile(path.join(__dirname, "public.noindex", "index.html"));
// });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

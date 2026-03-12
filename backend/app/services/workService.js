const fs = require("fs");
const { getPublicPath } = require("../utils/paths");
const path = require("path");

function createWorkService({ db, BACKEND_URL }) {
  const getStaticUrlIfItExists = (subDirs, filename) => {
    if (!filename) return null;
    const filepath = getPublicPath(...subDirs, filename);
    return fs.existsSync(filepath)
      ? `${BACKEND_URL}/${subDirs.join("/")}/${filename}`
      : null;
  };

  function getProgressWithWork(work) {
    const quotes = work.quotes || [];
    let current_page = 0;

    if (quotes.length) {
      let maxPageOverall = 0;
      let latestProgressTs = -1;

      for (const q of quotes) {
        const pageNum = q.page_number || 0;
        if (pageNum > maxPageOverall) {
          maxPageOverall = pageNum;
        }
        if (pageNum && (!q.quote.length || q.quote.startsWith("@notes:"))) {
          const ts = Date.parse(q.created_at) || 0;
          if (ts > latestProgressTs) {
            latestProgressTs = ts;
            current_page = pageNum;
          }
        }
      }
    }

    return current_page;
  }

  function getWorkFileNames(workId) {
    const filesDir = getPublicPath("files");
    if (!fs.existsSync(filesDir)) return [];
    return fs
      .readdirSync(filesDir)
      .filter((name) => name.startsWith(workId))
      .filter((name) => {
        try {
          return fs.statSync(path.join(filesDir, name)).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  }

  function getWorkFileUrls(workId) {
    return getWorkFileNames(workId).map(
      (filename) => `${BACKEND_URL}/files/${filename}`,
    );
  }

  function processWork(work) {
    const fileUrls = getWorkFileUrls(work.id);
    return {
      ...work,
      current_page: getProgressWithWork(work),
      cover_img_url: getStaticUrlIfItExists(
        ["imgs", "covers"],
        `${work.id}.png`,
      ),
      file_urls: fileUrls,
    };
  }

  function processAuthor(author) {
    const filename = author.goodreads_id ? `${author.goodreads_id}.png` : null;
    return {
      ...author,
      avatar_img_url: getStaticUrlIfItExists(["imgs", "avatars"], filename),
    };
  }

  function syncTags(entityId, tags, pivotTable, entityColumn) {
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
  }

  function syncAuthors(workId, authors) {
    if (!authors || !Array.isArray(authors)) return;
    db.prepare("DELETE FROM work_authors WHERE work_id = ?").run(workId);
    for (const author of authors) {
      db.prepare("INSERT OR IGNORE INTO authors (name) VALUES (?)").run(author);
      db.prepare(
        "INSERT OR IGNORE INTO work_authors (work_id, author_name) VALUES (?, ?)",
      ).run(workId, author);
    }
  }

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

    let userStats = { read: 0, liked: 0, shelved: 0, rating: 0 };
    if (userId) {
      const stats = db
        .prepare(
          "SELECT read, liked, shelved, rating FROM user_work_interactions WHERE user_id = ? AND work_id = ?",
        )
        .get(userId, workRow.id);
      if (stats) userStats = stats;
    }

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

  return {
    getStaticUrlIfItExists,
    processWork,
    processAuthor,
    getWorkWithRelations,
    getAuthorWithRelations,
    syncTags,
    syncAuthors,
    normalizePageNumber,
    normalizeProgressQuote,
    ensureUserWorkInteraction,
    recordProgressUpdate,
  };
}

module.exports = { createWorkService };

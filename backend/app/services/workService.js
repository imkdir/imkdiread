const fs = require("fs");
const { getPublicPath } = require("../utils/paths");
const path = require("path");

let PUBLISHER_LABELS = {};
try {
  PUBLISHER_LABELS = require("../../public/data/publishers");
} catch {
  PUBLISHER_LABELS = {};
}

function createWorkService({ db, BACKEND_URL }) {
  const GENRE_TAG_PREFIX = "genre:";
  const workFilesDir = getPublicPath("files");
  let workFileNamesById = new Map();

  const getStaticUrlIfItExists = (subDirs, filename) => {
    if (!filename) return null;
    const filepath = getPublicPath(...subDirs, filename);
    return fs.existsSync(filepath)
      ? `${BACKEND_URL}/${subDirs.join("/")}/${filename}`
      : null;
  };

  function listWorkFilesFromDisk() {
    if (!fs.existsSync(workFilesDir)) return [];

    return fs
      .readdirSync(workFilesDir)
      .filter((name) => {
        try {
          return fs.statSync(path.join(workFilesDir, name)).isFile();
        } catch {
          return false;
        }
      })
      .sort();
  }

  function refreshWorkFileCache() {
    const filenames = listWorkFilesFromDisk();
    const cache = new Map();
    const workRows = db.prepare("SELECT id FROM works").all();

    workRows.forEach(({ id }) => {
      cache.set(
        id,
        filenames.filter((name) => name.startsWith(id)),
      );
    });

    workFileNamesById = cache;

    return {
      total_work_count: workRows.length,
      total_file_count: filenames.length,
      works_with_files_count: Array.from(cache.values()).filter(
        (workFiles) => workFiles.length > 0,
      ).length,
    };
  }

  function getGenreBackgroundUrl(tags = []) {
    const genreTags = Array.isArray(tags)
      ? tags
          .filter(
            (tag) =>
              typeof tag === "string" && tag.startsWith(GENRE_TAG_PREFIX),
          )
          .map((tag) => tag.slice(GENRE_TAG_PREFIX.length))
      : [];

    for (const genreTag of genreTags) {
      const match = getStaticUrlIfItExists(
        ["imgs", "genres"],
        `${genreTag}.png`,
      );
      if (match) return match;
    }

    return getStaticUrlIfItExists(["imgs", "genres"], "default.png");
  }

  function getWorkFileNames(workId) {
    return workFileNamesById.get(workId) || [];
  }

  function stripWorkIdFromFilename(filename, workId) {
    let label = filename.replace(/\.[^/.]+$/, "");
    const lowerLabel = label.toLowerCase();
    const lowerPrefix = workId.toLowerCase();

    if (lowerLabel.startsWith(`${lowerPrefix}_`)) {
      label = label.slice(workId.length + 1);
    } else if (lowerLabel.startsWith(lowerPrefix)) {
      label = label.slice(workId.length);
    }

    return label.replace(/^_+/, "");
  }

  function toRomanNumeral(value) {
    const number = Number.parseInt(value, 10);
    if (!Number.isInteger(number) || number <= 0) return value;

    const romanPairs = [
      ["M", 1000],
      ["CM", 900],
      ["D", 500],
      ["CD", 400],
      ["C", 100],
      ["XC", 90],
      ["L", 50],
      ["XL", 40],
      ["X", 10],
      ["IX", 9],
      ["V", 5],
      ["IV", 4],
      ["I", 1],
    ];

    let remainder = number;
    let result = "";

    romanPairs.forEach(([symbol, amount]) => {
      while (remainder >= amount) {
        result += symbol;
        remainder -= amount;
      }
    });

    return result || value;
  }

  function getWorkFileSortKey(filename, workId) {
    const label = stripWorkIdFromFilename(filename, workId);
    if (!label) {
      return {
        isBaseFile: true,
        hasVersion: false,
        number: Number.NEGATIVE_INFINITY,
        suffix: "",
        label: workId,
      };
    }

    const segments = label.split(/[_\s-]+/).filter(Boolean);
    const versionSegment = segments.find((segment) =>
      /^(\d+)([a-z]+)?$/i.test(segment),
    );

    if (!versionSegment) {
      return {
        isBaseFile: false,
        hasVersion: false,
        number: Number.POSITIVE_INFINITY,
        suffix: "",
        label,
      };
    }

    const match = versionSegment.match(/^(\d+)([a-z]+)?$/i);
    const number = Number.parseInt(match?.[1] || "", 10);

    return {
      isBaseFile: false,
      hasVersion: Number.isInteger(number),
      number: Number.isInteger(number) ? number : Number.POSITIVE_INFINITY,
      suffix: (match?.[2] || "").toUpperCase(),
      label,
    };
  }

  function compareWorkFilenames(leftFilename, rightFilename, workId) {
    const left = getWorkFileSortKey(leftFilename, workId);
    const right = getWorkFileSortKey(rightFilename, workId);

    if (left.isBaseFile !== right.isBaseFile) {
      return left.isBaseFile ? -1 : 1;
    }

    if (left.hasVersion && right.hasVersion) {
      if (left.number !== right.number) {
        return left.number - right.number;
      }

      if (left.suffix !== right.suffix) {
        if (!left.suffix) return -1;
        if (!right.suffix) return 1;
        return left.suffix.localeCompare(right.suffix, undefined, {
          sensitivity: "base",
        });
      }
    } else if (left.hasVersion !== right.hasVersion) {
      return left.hasVersion ? -1 : 1;
    }

    return left.label.localeCompare(right.label, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function buildWorkFileLabel(filename, workId) {
    const label = stripWorkIdFromFilename(filename, workId);
    const segments = label.split(/[_\s-]+/).filter(Boolean);
    const mapped = segments.map((segment) => {
      const lower = segment.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(PUBLISHER_LABELS, lower)) {
        return PUBLISHER_LABELS[lower];
      }

      const numberedSuffixMatch = lower.match(/^(\d+)([a-z]+)$/);
      if (numberedSuffixMatch) {
        const [, numericPart, suffix] = numberedSuffixMatch;
        return `${toRomanNumeral(numericPart)}-${suffix.toUpperCase()}`;
      }

      if (/^\d+$/.test(lower)) return toRomanNumeral(segment);

      return segment;
    });

    return mapped.join(" ") || workId || "Edition";
  }

  function getWorkFiles(workId) {
    const filenames = [...getWorkFileNames(workId)].sort((left, right) =>
      compareWorkFilenames(left, right, workId),
    );
    const files = {};

    filenames.forEach((filename) => {
      const baseLabel =
        filenames.length === 1 ? workId : buildWorkFileLabel(filename, workId);
      let label = baseLabel;
      let duplicateIndex = 2;

      while (files[label]) {
        label = `${baseLabel} (${duplicateIndex})`;
        duplicateIndex += 1;
      }

      files[label] = `${BACKEND_URL}/files/${filename}`;
    });

    return files;
  }

  function isWorkAvailable(workOrId) {
    if (!workOrId) return false;

    const workId = typeof workOrId === "string" ? workOrId : workOrId.id;
    const dropboxLink =
      typeof workOrId === "string" ? null : workOrId.dropbox_link;

    return Boolean(dropboxLink) || getWorkFileNames(workId).length > 0;
  }

  function processWork(work) {
    return {
      ...work,
      cover_img_url: getStaticUrlIfItExists(
        ["imgs", "covers"],
        `${work.id}.png`,
      ),
      background_img_url: getGenreBackgroundUrl(work.tags),
      files: getWorkFiles(work.id),
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
    for (const authorName of authors) {
      db.prepare("INSERT OR IGNORE INTO authors (name) VALUES (?)").run(
        authorName,
      );
      const author = db
        .prepare("SELECT id FROM authors WHERE name = ?")
        .get(authorName);
      if (!author) continue;
      db.prepare(
        "INSERT OR IGNORE INTO work_authors (work_id, author_id) VALUES (?, ?)",
      ).run(workId, author.id);
    }
  }

  function getWorkWithRelations(workRow, userId = null) {
    const authors = db
      .prepare(
        `SELECT authors.name
         FROM work_authors
         JOIN authors ON work_authors.author_id = authors.id
         WHERE work_authors.work_id = ?
         ORDER BY authors.name ASC`,
      )
      .all(workRow.id)
      .map((r) => r.name);

    const tags = db
      .prepare(
        `SELECT tags.name
         FROM work_tags
         JOIN tags ON work_tags.tag_id = tags.id
         WHERE work_id = ?
         ORDER BY work_tags.rowid ASC`,
      )
      .all(workRow.id)
      .map((r) => r.name);

    const quoteRows = userId
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
    const selectQuoteTags = db.prepare(
      `SELECT name
       FROM quote_tags
       WHERE quote_id = ?
       ORDER BY rowid ASC`,
    );
    const quotes = quoteRows.map((quoteRow) => ({
      ...quoteRow,
      tags: selectQuoteTags.all(quoteRow.id).map((row) => row.name),
    }));

    let userStats = { read: 0, liked: 0, shelved: 0, rating: 0 };
    let latestReadingActivity = null;
    if (userId) {
      const stats = db
        .prepare(
          "SELECT read, liked, shelved, rating FROM user_work_interactions WHERE user_id = ? AND work_id = ?",
        )
        .get(userId, workRow.id);
      if (stats) userStats = stats;

      latestReadingActivity = db
        .prepare(
          `SELECT user_id, work_id, notes, current_page, page_count, created_at
           FROM user_reading_activities
           WHERE user_id = ? AND work_id = ?
           ORDER BY datetime(created_at) DESC, rowid DESC
           LIMIT 1`,
        )
        .get(userId, workRow.id);
    }

    return {
      ...workRow,
      authors,
      tags,
      quotes,
      current_page: latestReadingActivity?.current_page || 0,
      latest_reading_activity: latestReadingActivity,
      ...userStats,
    };
  }

  function getAuthorWithRelations(authorRow, userId = null) {
    if (!authorRow) return null;

    const count = db
      .prepare("SELECT COUNT(*) as count FROM work_authors WHERE author_id = ?")
      .get(authorRow.id).count;

    let followed = false;
    if (userId) {
      const row = db
        .prepare(
          "SELECT followed FROM user_author_interactions WHERE user_id = ? AND author_id = ?",
        )
        .get(userId, authorRow.id);
      followed = !!row?.followed;
    }

    return { ...authorRow, works_count: count, followed };
  }

  function normalizePageNumber(value) {
    const pageNumber = Number(value);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;
    return Math.floor(pageNumber);
  }

  function normalizeProgressNotes(note) {
    const trimmed = typeof note === "string" ? note.trim() : "";
    return trimmed;
  }

  refreshWorkFileCache();

  function ensureUserWorkInteraction(userId, workId) {
    db.prepare(
      `INSERT OR IGNORE INTO user_work_interactions (user_id, work_id) VALUES (?, ?)`,
    ).run(userId, workId);
  }

  function recordReadingActivity(
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

    const notes = normalizeProgressNotes(note);

    db.transaction(() => {
      db.prepare(
        `INSERT INTO user_reading_activities
         (user_id, work_id, notes, current_page, page_count)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(userId, workId, notes, safePageNumber, totalPages);

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
    normalizeProgressNotes,
    ensureUserWorkInteraction,
    recordReadingActivity,
    getGenreBackgroundUrl,
    getWorkFileNames,
    getWorkFiles,
    isWorkAvailable,
    refreshWorkFileCache,
  };
}

module.exports = { createWorkService };

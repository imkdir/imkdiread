const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "..", "..", "db", "scheme.sql");
const baseSchemaSql = fs.readFileSync(schemaPath, "utf8");

function tableExists(db, tableName) {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
}

function getColumns(db, tableName) {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function columnExists(db, tableName, columnName) {
  return getColumns(db, tableName).some((column) => column.name === columnName);
}

function ensureColumn(db, tableName, columnName, definition) {
  if (!tableExists(db, tableName) || columnExists(db, tableName, columnName)) {
    return false;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  return true;
}

function applyBaseSchema(db) {
  db.exec(baseSchemaSql);
}

function dropSeriesTable(db) {
  if (!tableExists(db, "series")) {
    return false;
  }

  db.exec("DROP TABLE IF EXISTS series;");
  return true;
}

function migrateLegacyPdfSchema(db) {
  const tablePairs = [
    ["pdfs", "works"],
    ["pdf_tags", "work_tags"],
    ["pdf_authors", "work_authors"],
    ["pdf_quotes", "work_quotes"],
    ["user_pdf_interactions", "user_work_interactions"],
  ];

  const hasLegacy = tablePairs.some(([legacy]) => tableExists(db, legacy));
  if (!hasLegacy) {
    return false;
  }

  for (const [legacy, modern] of tablePairs) {
    if (tableExists(db, legacy) && tableExists(db, modern)) {
      throw new Error(`Mixed schema detected: both ${legacy} and ${modern} exist.`);
    }
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    if (tableExists(db, "pdfs")) db.exec("ALTER TABLE pdfs RENAME TO works;");
    if (tableExists(db, "pdf_tags")) {
      db.exec("ALTER TABLE pdf_tags RENAME TO work_tags;");
    }
    if (tableExists(db, "pdf_authors")) {
      db.exec("ALTER TABLE pdf_authors RENAME TO work_authors;");
    }
    if (tableExists(db, "pdf_quotes")) {
      db.exec("ALTER TABLE pdf_quotes RENAME TO work_quotes;");
    }
    if (tableExists(db, "user_pdf_interactions")) {
      db.exec(
        "ALTER TABLE user_pdf_interactions RENAME TO user_work_interactions;",
      );
    }

    if (columnExists(db, "work_tags", "pdf_id")) {
      db.exec("ALTER TABLE work_tags RENAME COLUMN pdf_id TO work_id;");
    }
    if (columnExists(db, "work_authors", "pdf_id")) {
      db.exec("ALTER TABLE work_authors RENAME COLUMN pdf_id TO work_id;");
    }
    if (columnExists(db, "work_quotes", "pdf_id")) {
      db.exec("ALTER TABLE work_quotes RENAME COLUMN pdf_id TO work_id;");
    }
    if (columnExists(db, "user_work_interactions", "pdf_id")) {
      db.exec(
        "ALTER TABLE user_work_interactions RENAME COLUMN pdf_id TO work_id;",
      );
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  return true;
}

function isAuthorSchemaMigrated(db) {
  return (
    columnExists(db, "authors", "id") &&
    columnExists(db, "authors", "bio") &&
    columnExists(db, "work_authors", "author_id") &&
    columnExists(db, "user_author_interactions", "author_id")
  );
}

function hasLegacyAuthorSchema(db) {
  return (
    columnExists(db, "authors", "name") &&
    !columnExists(db, "authors", "id") &&
    columnExists(db, "work_authors", "author_name") &&
    columnExists(db, "user_author_interactions", "author_name")
  );
}

function migrateAuthorsToIdSchema(db) {
  if (isAuthorSchemaMigrated(db)) {
    return false;
  }

  if (
    !tableExists(db, "authors") ||
    !tableExists(db, "work_authors") ||
    !tableExists(db, "user_author_interactions")
  ) {
    return false;
  }

  if (!hasLegacyAuthorSchema(db)) {
    return false;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN TRANSACTION;");

    db.exec(`
      CREATE TABLE authors_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        bio TEXT,
        goodreads_id TEXT
      );

      INSERT INTO authors_new (name, bio, goodreads_id)
      SELECT name, NULL, goodreads_id
      FROM authors
      ORDER BY rowid;

      CREATE TABLE work_authors_new (
        work_id TEXT,
        author_id INTEGER,
        FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
        FOREIGN KEY(author_id) REFERENCES authors_new(id) ON DELETE CASCADE,
        UNIQUE(work_id, author_id)
      );

      INSERT INTO work_authors_new (work_id, author_id)
      SELECT work_authors.work_id, authors_new.id
      FROM work_authors
      JOIN authors_new ON authors_new.name = work_authors.author_name;

      CREATE TABLE user_author_interactions_new (
        user_id TEXT,
        author_id INTEGER,
        followed BOOLEAN DEFAULT 0,
        PRIMARY KEY (user_id, author_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES authors_new(id) ON DELETE CASCADE
      );

      INSERT INTO user_author_interactions_new (user_id, author_id, followed)
      SELECT user_author_interactions.user_id, authors_new.id, user_author_interactions.followed
      FROM user_author_interactions
      JOIN authors_new ON authors_new.name = user_author_interactions.author_name;

      DROP TABLE work_authors;
      DROP TABLE user_author_interactions;
      DROP TABLE authors;

      ALTER TABLE authors_new RENAME TO authors;
      ALTER TABLE work_authors_new RENAME TO work_authors;
      ALTER TABLE user_author_interactions_new RENAME TO user_author_interactions;
    `);

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  return true;
}

function migrateReadingProgressToActivities(db) {
  if (!tableExists(db, "work_quotes")) {
    throw new Error("work_quotes table not found.");
  }

  applyBaseSchema(db);

  const legacyProgressCount = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM work_quotes
       WHERE quote = '' OR quote LIKE '@notes:%'`,
    )
    .get().count;

  if (!legacyProgressCount) {
    return false;
  }

  db.exec("PRAGMA foreign_keys = OFF;");

  try {
    db.exec("BEGIN TRANSACTION;");

    db.exec(`
      INSERT INTO user_reading_activities (
        user_id,
        work_id,
        notes,
        current_page,
        page_count,
        created_at
      )
      SELECT
        work_quotes.user_id,
        work_quotes.work_id,
        CASE
          WHEN work_quotes.quote LIKE '@notes:%' THEN substr(work_quotes.quote, 8)
          ELSE ''
        END AS notes,
        work_quotes.page_number AS current_page,
        works.page_count,
        work_quotes.created_at
      FROM work_quotes
      JOIN works ON works.id = work_quotes.work_id
      WHERE work_quotes.quote = '' OR work_quotes.quote LIKE '@notes:%';

      DELETE FROM work_quotes
      WHERE quote = '' OR quote LIKE '@notes:%';
    `);

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  return true;
}

function ensureDatabaseSchema(db) {
  migrateLegacyPdfSchema(db);
  migrateAuthorsToIdSchema(db);
  applyBaseSchema(db);
  dropSeriesTable(db);

  ensureColumn(db, "authors", "bio", "TEXT");
  ensureColumn(db, "authors", "goodreads_id", "TEXT");
  ensureColumn(db, "work_quotes", "user_id", "TEXT REFERENCES users(id) ON DELETE CASCADE");
  ensureColumn(db, "work_quotes", "explanation", "TEXT");
  ensureColumn(db, "users", "email", "TEXT");
  ensureColumn(db, "users", "avatar_url", "TEXT");
  ensureColumn(db, "users", "is_email_public", "BOOLEAN DEFAULT 0");
  ensureColumn(db, "works", "goodreads_id", "TEXT");
  ensureColumn(db, "works", "dropbox_link", "TEXT");
  ensureColumn(db, "works", "amazon_asin", "TEXT");

  migrateReadingProgressToActivities(db);
}

module.exports = {
  applyBaseSchema,
  columnExists,
  ensureColumn,
  ensureDatabaseSchema,
  migrateAuthorsToIdSchema,
  migrateLegacyPdfSchema,
  migrateReadingProgressToActivities,
  dropSeriesTable,
  tableExists,
};

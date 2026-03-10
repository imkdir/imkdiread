const path = require("path");
const Database = require("better-sqlite3");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

const tableExists = (tableName) =>
  !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

const columnExists = (tableName, columnName) => {
  if (!tableExists(tableName)) return false;
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((col) => col.name === columnName);
};

const migrateLegacyPdfSchema = () => {
  const tablePairs = [
    ["pdfs", "works"],
    ["pdf_tags", "work_tags"],
    ["pdf_authors", "work_authors"],
    ["pdf_quotes", "work_quotes"],
    ["user_pdf_interactions", "user_work_interactions"],
  ];

  const hasLegacy = tablePairs.some(([legacy]) => tableExists(legacy));
  if (!hasLegacy) {
    console.log("No legacy pdf* schema detected. Nothing to migrate.");
    return;
  }

  for (const [legacy, modern] of tablePairs) {
    if (tableExists(legacy) && tableExists(modern)) {
      throw new Error(`Mixed schema detected: both ${legacy} and ${modern} exist.`);
    }
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    if (tableExists("pdfs")) db.exec("ALTER TABLE pdfs RENAME TO works;");
    if (tableExists("pdf_tags"))
      db.exec("ALTER TABLE pdf_tags RENAME TO work_tags;");
    if (tableExists("pdf_authors"))
      db.exec("ALTER TABLE pdf_authors RENAME TO work_authors;");
    if (tableExists("pdf_quotes"))
      db.exec("ALTER TABLE pdf_quotes RENAME TO work_quotes;");
    if (tableExists("user_pdf_interactions")) {
      db.exec(
        "ALTER TABLE user_pdf_interactions RENAME TO user_work_interactions;",
      );
    }

    if (columnExists("work_tags", "pdf_id")) {
      db.exec("ALTER TABLE work_tags RENAME COLUMN pdf_id TO work_id;");
    }
    if (columnExists("work_authors", "pdf_id")) {
      db.exec("ALTER TABLE work_authors RENAME COLUMN pdf_id TO work_id;");
    }
    if (columnExists("work_quotes", "pdf_id")) {
      db.exec("ALTER TABLE work_quotes RENAME COLUMN pdf_id TO work_id;");
    }
    if (columnExists("user_work_interactions", "pdf_id")) {
      db.exec(
        "ALTER TABLE user_work_interactions RENAME COLUMN pdf_id TO work_id;",
      );
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
};

try {
  migrateLegacyPdfSchema();
  console.log("Legacy schema migration completed.");
} catch (error) {
  console.error("Legacy schema migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

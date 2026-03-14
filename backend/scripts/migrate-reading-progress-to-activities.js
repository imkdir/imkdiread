const path = require("path");
const Database = require("better-sqlite3");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

const tableExists = (tableName) =>
  !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

function ensureReadingActivitiesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_reading_activities (
      user_id TEXT,
      work_id TEXT,
      notes TEXT,
      current_page INTEGER,
      page_count INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
    );
  `);
}

function migrateReadingProgressToActivities() {
  if (!tableExists("work_quotes")) {
    throw new Error("work_quotes table not found.");
  }

  ensureReadingActivitiesTable();

  const legacyProgressCount = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM work_quotes
       WHERE quote = '' OR quote LIKE '@notes:%'`,
    )
    .get().count;

  if (!legacyProgressCount) {
    console.log("No quote-backed reading progress found. Nothing to migrate.");
    return;
  }

  console.log(`Migrating ${legacyProgressCount} quote-backed progress entries...`);

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
    console.log("Reading progress migration completed.");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

try {
  migrateReadingProgressToActivities();
} catch (error) {
  console.error("Reading progress migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

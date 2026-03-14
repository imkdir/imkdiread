const path = require("path");
const Database = require("better-sqlite3");
const { migrateLegacyPdfSchema } = require("../app/utils/databaseSchema");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

try {
  const changed = migrateLegacyPdfSchema(db);
  console.log(
    changed
      ? "Legacy schema migration completed."
      : "No legacy pdf* schema detected. Nothing to migrate.",
  );
} catch (error) {
  console.error("Legacy schema migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

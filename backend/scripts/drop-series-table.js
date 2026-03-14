const path = require("path");
const Database = require("better-sqlite3");
const {
  ensureDatabaseSchema,
  dropSeriesTable,
} = require("../app/utils/databaseSchema");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

try {
  const removed = dropSeriesTable(db);
  ensureDatabaseSchema(db);
  console.log(
    removed
      ? "Series table removed."
      : "Series table was already absent.",
  );
} catch (error) {
  console.error("Failed to drop series table:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

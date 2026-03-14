const path = require("path");
const Database = require("better-sqlite3");
const { migrateAuthorsToIdSchema } = require("../app/utils/databaseSchema");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

try {
  const changed = migrateAuthorsToIdSchema(db);
  console.log(
    changed
      ? "Author schema migration completed."
      : "Author schema already uses integer IDs or does not require migration.",
  );
} catch (error) {
  console.error("Author schema migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

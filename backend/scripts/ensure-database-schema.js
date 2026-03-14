const path = require("path");
const Database = require("better-sqlite3");
const { ensureDatabaseSchema } = require("../app/utils/databaseSchema");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

try {
  ensureDatabaseSchema(db);
  console.log(`Database schema is ready at ${dbPath}.`);
} catch (error) {
  console.error("Failed to ensure database schema:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

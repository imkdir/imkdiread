const Database = require("better-sqlite3");
const path = require("path");
const { ensureDatabaseSchema } = require("../app/utils/databaseSchema");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

try {
  ensureDatabaseSchema(db);
  console.log("Inbox notification schema is ready.");
} catch (error) {
  console.error("Failed to migrate inbox notification schema:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

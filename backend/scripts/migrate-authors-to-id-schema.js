const path = require("path");
const Database = require("better-sqlite3");

const dbPath =
  process.env.DB_PATH || path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

const tableExists = (tableName) =>
  !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);

const getColumns = (tableName) => {
  if (!tableExists(tableName)) return [];
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
};

const hasColumn = (tableName, columnName) =>
  getColumns(tableName).some((column) => column.name === columnName);

const isAlreadyMigrated = () =>
  hasColumn("authors", "id") &&
  hasColumn("authors", "bio") &&
  hasColumn("work_authors", "author_id") &&
  hasColumn("user_author_interactions", "author_id");

const hasLegacyAuthorSchema = () =>
  hasColumn("authors", "name") &&
  !hasColumn("authors", "id") &&
  hasColumn("work_authors", "author_name") &&
  hasColumn("user_author_interactions", "author_name");

function migrateAuthorsToIdSchema() {
  if (isAlreadyMigrated()) {
    console.log("Author schema already uses integer IDs. Nothing to migrate.");
    return;
  }

  if (!hasLegacyAuthorSchema()) {
    throw new Error(
      "Unsupported author schema. Expected legacy name-based author tables.",
    );
  }

  console.log("Migrating author tables to integer primary keys...");
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
    console.log("Author schema migration completed.");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

try {
  migrateAuthorsToIdSchema();
} catch (error) {
  console.error("Author schema migration failed:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}

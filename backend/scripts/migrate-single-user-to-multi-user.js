const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "db", "database.sqlite");
const db = new Database(dbPath);

const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (!adminUser) {
  console.error(
    "No admin user found! Please run your create-admin.js script first.",
  );
  process.exit(1);
}
const adminId = adminUser.id;

console.log("Starting safe database migration...");

try {
  // 1. DISABLE FOREIGN KEYS to prevent ON DELETE CASCADE from wiping your tags/quotes/authors!
  db.exec("PRAGMA foreign_keys = OFF;");

  // 2. Create the new interactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_work_interactions (
      user_id TEXT,
      work_id TEXT,
      read BOOLEAN DEFAULT 0,
      liked BOOLEAN DEFAULT 0,
      shelved BOOLEAN DEFAULT 0,
      rating INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, work_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );
  `);

  // 3. Move existing Work stats into the interactions table for the Admin
  console.log("Moving book statuses to Admin account...");
  const oldWorks = db.prepare("SELECT * FROM works").all();

  const insertInteraction = db.prepare(`
    INSERT OR IGNORE INTO user_work_interactions
    (user_id, work_id, read, liked, shelved, rating)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const work of oldWorks) {
    if (work.read || work.liked || work.shelved || work.rating > 0) {
      insertInteraction.run(
        adminId,
        work.id,
        work.read || 0,
        work.liked || 0,
        work.shelved || 0,
        work.rating || 0,
      );
    }
  }

  // 4. Add user_id to quotes and assign existing quotes to Admin
  console.log("Updating quotes...");
  try {
    db.exec(
      `ALTER TABLE work_quotes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`,
    );
  } catch (e) {
    // Column might already exist
  }
  db.prepare(`UPDATE work_quotes SET user_id = ? WHERE user_id IS NULL`).run(
    adminId,
  );

  // 5. Safely rebuild the Works table without triggering cascades
  console.log("Cleaning up Works table...");

  // Begin a transaction so it's all or nothing
  db.exec("BEGIN TRANSACTION;");

  db.exec(`
    CREATE TABLE works_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        page_count INTEGER DEFAULT 0,
        goodreads_id TEXT,
        dropbox_link TEXT,
        amazon_asin TEXT
    );
    INSERT INTO works_new (id, title, page_count, goodreads_id, dropbox_link, amazon_asin)
    SELECT id, title, page_count, goodreads_id, dropbox_link, amazon_asin FROM works;

    DROP TABLE works; -- Because PRAGMA foreign_keys = OFF, this is now safe!
    ALTER TABLE works_new RENAME TO works;
  `);

  db.exec("COMMIT;");

  // 6. TURN FOREIGN KEYS BACK ON
  db.exec("PRAGMA foreign_keys = ON;");

  console.log("✅ Migration complete! Data preserved and Multi-User ready.");
} catch (err) {
  db.exec("ROLLBACK;"); // Undo the table swap if something fails
  db.exec("PRAGMA foreign_keys = ON;");
  console.error("Migration failed:", err);
}

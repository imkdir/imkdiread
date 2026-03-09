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
    CREATE TABLE IF NOT EXISTS user_pdf_interactions (
      user_id TEXT,
      pdf_id TEXT,
      read BOOLEAN DEFAULT 0,
      liked BOOLEAN DEFAULT 0,
      shelved BOOLEAN DEFAULT 0,
      rating INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, pdf_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
    );
  `);

  // 3. Move existing PDF stats into the interactions table for the Admin
  console.log("Moving book statuses to Admin account...");
  const oldPdfs = db.prepare("SELECT * FROM pdfs").all();

  const insertInteraction = db.prepare(`
    INSERT OR IGNORE INTO user_pdf_interactions
    (user_id, pdf_id, read, liked, shelved, rating)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const pdf of oldPdfs) {
    if (pdf.read || pdf.liked || pdf.shelved || pdf.rating > 0) {
      insertInteraction.run(
        adminId,
        pdf.id,
        pdf.read || 0,
        pdf.liked || 0,
        pdf.shelved || 0,
        pdf.rating || 0,
      );
    }
  }

  // 4. Add user_id to quotes and assign existing quotes to Admin
  console.log("Updating quotes...");
  try {
    db.exec(
      `ALTER TABLE pdf_quotes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`,
    );
  } catch (e) {
    // Column might already exist
  }
  db.prepare(`UPDATE pdf_quotes SET user_id = ? WHERE user_id IS NULL`).run(
    adminId,
  );

  // 5. Safely rebuild the PDFs table without triggering cascades
  console.log("Cleaning up PDFs table...");

  // Begin a transaction so it's all or nothing
  db.exec("BEGIN TRANSACTION;");

  db.exec(`
    CREATE TABLE pdfs_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        page_count INTEGER DEFAULT 0,
        goodreads_id TEXT,
        dropbox_link TEXT,
        amazon_asin TEXT
    );
    INSERT INTO pdfs_new (id, title, page_count, goodreads_id, dropbox_link, amazon_asin)
    SELECT id, title, page_count, goodreads_id, dropbox_link, amazon_asin FROM pdfs;

    DROP TABLE pdfs; -- Because PRAGMA foreign_keys = OFF, this is now safe!
    ALTER TABLE pdfs_new RENAME TO pdfs;
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

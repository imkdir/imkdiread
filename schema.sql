CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT UNIQUE NOT NULL,
    count INTEGER DEFAULT 0
  );
CREATE TABLE authors (
    name TEXT PRIMARY KEY,
    goodreads_id TEXT);
CREATE TABLE IF NOT EXISTS "pdf_tags" (
        pdf_id TEXT,
        tag_id INTEGER,
        FOREIGN KEY(pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(pdf_id, tag_id)
    );
CREATE TABLE IF NOT EXISTS "pdf_quotes" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdf_id TEXT NOT NULL,
        quote TEXT NOT NULL,
        page_number INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
    );
CREATE TABLE IF NOT EXISTS "pdf_authors" (
        pdf_id TEXT,
        author_name TEXT,
        FOREIGN KEY(pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE,
        FOREIGN KEY(author_name) REFERENCES authors(name) ON DELETE CASCADE,
        UNIQUE(pdf_id, author_name)
    );
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'guest'
  , email TEXT, avatar_url TEXT, is_email_public BOOLEAN DEFAULT 0);
CREATE TABLE user_pdf_interactions (
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
CREATE TABLE IF NOT EXISTS "pdfs" (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        page_count INTEGER DEFAULT 0,
        goodreads_id TEXT,
        dropbox_link TEXT,
        amazon_asin TEXT
    );
CREATE TABLE user_author_interactions (
      user_id TEXT,
      author_name TEXT,
      followed BOOLEAN DEFAULT 0,
      PRIMARY KEY (user_id, author_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (author_name) REFERENCES authors(name) ON DELETE CASCADE
    );

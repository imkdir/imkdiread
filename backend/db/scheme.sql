CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  bio TEXT,
  goodreads_id TEXT
);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  page_count INTEGER DEFAULT 0,
  goodreads_id TEXT,
  dropbox_link TEXT,
  amazon_asin TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'guest',
  email TEXT,
  avatar_url TEXT,
  is_email_public BOOLEAN DEFAULT 0
);

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

CREATE TABLE IF NOT EXISTS user_author_interactions (
  user_id TEXT,
  author_id INTEGER,
  followed BOOLEAN DEFAULT 0,
  PRIMARY KEY (user_id, author_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_tags (
  work_id TEXT,
  tag_id INTEGER,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE (work_id, tag_id)
);

CREATE TABLE IF NOT EXISTS work_authors (
  work_id TEXT,
  author_id INTEGER,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE,
  UNIQUE (work_id, author_id)
);

CREATE TABLE IF NOT EXISTS work_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id TEXT NOT NULL,
  quote TEXT NOT NULL,
  page_number INTEGER,
  explanation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_reading_activities (
  user_id TEXT,
  work_id TEXT,
  notes TEXT,
  current_page INTEGER,
  page_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vocabularies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  word TEXT NOT NULL,
  word_data TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  UNIQUE (user_id, work_id, word)
);

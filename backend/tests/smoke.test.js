const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { once } = require("events");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const { createApp } = require("../app");

let server;
let appDb;
let baseUrl;
let tempDir;
let dbPath;
let originalEnv;

function seedTestDb(targetDbPath) {
  const db = new Database(targetDbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT UNIQUE NOT NULL,
      count INTEGER DEFAULT 0
    );
    CREATE TABLE authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      bio TEXT,
      goodreads_id TEXT
    );
    CREATE TABLE works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      page_count INTEGER DEFAULT 0,
      goodreads_id TEXT,
      dropbox_link TEXT,
      amazon_asin TEXT
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'guest',
      email TEXT,
      avatar_url TEXT,
      is_email_public BOOLEAN DEFAULT 0
    );
    CREATE TABLE user_work_interactions (
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
    CREATE TABLE user_author_interactions (
      user_id TEXT,
      author_id INTEGER,
      followed BOOLEAN DEFAULT 0,
      PRIMARY KEY (user_id, author_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
    );
    CREATE TABLE work_tags (
      work_id TEXT,
      tag_id INTEGER,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(work_id, tag_id)
    );
    CREATE TABLE work_authors (
      work_id TEXT,
      author_id INTEGER,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
      FOREIGN KEY(author_id) REFERENCES authors(id) ON DELETE CASCADE,
      UNIQUE(work_id, author_id)
    );
    CREATE TABLE work_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id TEXT NOT NULL,
      quote TEXT NOT NULL,
      page_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
    );
    CREATE TABLE user_reading_activities (
      user_id TEXT,
      work_id TEXT,
      notes TEXT,
      current_page INTEGER,
      page_count INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
    );
  `);

  db.prepare("INSERT INTO tags (name) VALUES (?)").run("philosophy");
  const authorInsert = db
    .prepare("INSERT INTO authors (name, bio, goodreads_id) VALUES (?, ?, ?)")
    .run("Aristotle", "Ancient Greek philosopher", "author-1");
  const authorId = Number(authorInsert.lastInsertRowid);
  db.prepare(
    "INSERT INTO works (id, title, page_count, goodreads_id, dropbox_link, amazon_asin) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("W1", "Nicomachean Ethics", 100, "book-1", null, null);

  const tagId = db.prepare("SELECT id FROM tags WHERE name = ?").get("philosophy").id;
  db.prepare("INSERT INTO work_tags (work_id, tag_id) VALUES (?, ?)").run("W1", tagId);
  db.prepare("INSERT INTO work_authors (work_id, author_id) VALUES (?, ?)").run(
    "W1",
    authorId,
  );

  const adminHash = bcrypt.hashSync("admin-pass", 10);
  const guestHash = bcrypt.hashSync("guest-pass", 10);
  db.prepare(
    `INSERT INTO users
      (id, username, password_hash, role, email, is_email_public)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("admin-1", "admin", adminHash, "admin", "admin@example.com", 0);
  db.prepare(
    `INSERT INTO users
      (id, username, password_hash, role, email, is_email_public)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("guest-1", "guest", guestHash, "guest", "guest@example.com", 1);

  db.close();
}

function seedLegacyAuthorSchemaDb(targetDbPath) {
  const db = new Database(targetDbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE authors (
      name TEXT PRIMARY KEY,
      goodreads_id TEXT
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE works (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE user_author_interactions (
      user_id TEXT,
      author_name TEXT,
      followed BOOLEAN DEFAULT 0,
      PRIMARY KEY (user_id, author_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (author_name) REFERENCES authors(name) ON DELETE CASCADE
    );
    CREATE TABLE work_authors (
      work_id TEXT,
      author_name TEXT,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
      FOREIGN KEY(author_name) REFERENCES authors(name) ON DELETE CASCADE,
      UNIQUE(work_id, author_name)
    );
  `);

  db.prepare("INSERT INTO authors (name, goodreads_id) VALUES (?, ?)").run(
    "Aristotle",
    "author-1",
  );
  db.prepare("INSERT INTO users (id) VALUES (?)").run("user-1");
  db.prepare("INSERT INTO works (id) VALUES (?)").run("W1");
  db.prepare("INSERT INTO work_authors (work_id, author_name) VALUES (?, ?)").run(
    "W1",
    "Aristotle",
  );
  db.prepare(
    "INSERT INTO user_author_interactions (user_id, author_name, followed) VALUES (?, ?, ?)",
  ).run("user-1", "Aristotle", 1);

  db.close();
}

function seedLegacyProgressSchemaDb(targetDbPath) {
  const db = new Database(targetDbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE users (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE works (
      id TEXT PRIMARY KEY,
      page_count INTEGER DEFAULT 0
    );
    CREATE TABLE work_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id TEXT NOT NULL,
      quote TEXT NOT NULL,
      page_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
    );
  `);

  db.prepare("INSERT INTO users (id) VALUES (?)").run("user-1");
  db.prepare("INSERT INTO works (id, page_count) VALUES (?, ?)").run("W1", 321);
  db.prepare(
    `INSERT INTO work_quotes (work_id, quote, page_number, created_at, user_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("W1", "@notes:Reached the midpoint", 123, "2026-03-14 09:00:00", "user-1");
  db.prepare(
    `INSERT INTO work_quotes (work_id, quote, page_number, created_at, user_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("W1", "A real quote", 124, "2026-03-14 10:00:00", "user-1");

  db.close();
}

async function requestJson(method, routePath, body, token) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

test.before(async () => {
  originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    GUEST_INVITE_CODE: process.env.GUEST_INVITE_CODE,
  };
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.GUEST_INVITE_CODE = "test-invite-code";

  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "imkdiread-smoke-"));
  dbPath = path.join(tempDir, "test.sqlite");
  seedTestDb(dbPath);

  const { app, db } = createApp({ dbPath });
  appDb = db;
  server = app.listen(0);
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server to a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (appDb) {
    appDb.close();
  }
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  if (originalEnv) {
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    process.env.GUEST_INVITE_CODE = originalEnv.GUEST_INVITE_CODE;
  }
});

test("auth login failure returns 400 with { error }", async () => {
  const response = await requestJson("POST", "/api/auth/login", {
    username: "admin",
    password: "wrong-password",
  });

  assert.equal(response.status, 400);
  assert.equal(typeof response.json?.error, "string");
});

test("auth login success returns token + user payload", async () => {
  const response = await requestJson("POST", "/api/auth/login", {
    username: "admin",
    password: "admin-pass",
  });

  assert.equal(response.status, 200);
  assert.equal(typeof response.json?.token, "string");
  assert.equal(response.json?.user?.role, "admin");
});

test("admin routes enforce 401/403 and allow admin", async () => {
  const unauth = await requestJson("GET", "/api/tags");
  assert.equal(unauth.status, 401);
  assert.equal(typeof unauth.json?.error, "string");

  const guestLogin = await requestJson("POST", "/api/auth/login", {
    username: "guest",
    password: "guest-pass",
  });
  assert.equal(guestLogin.status, 200);
  const guestToken = guestLogin.json?.token;
  assert.equal(typeof guestToken, "string");

  const forbidden = await requestJson("GET", "/api/tags", undefined, guestToken);
  assert.equal(forbidden.status, 403);
  assert.equal(typeof forbidden.json?.error, "string");

  const adminLogin = await requestJson("POST", "/api/auth/login", {
    username: "admin",
    password: "admin-pass",
  });
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.json?.token;
  assert.equal(typeof adminToken, "string");

  const ok = await requestJson("GET", "/api/tags", undefined, adminToken);
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.json));
  assert.ok(ok.json.includes("philosophy"));
});

test("read flow smoke: /api/search returns results for authenticated user", async () => {
  const login = await requestJson("POST", "/api/auth/login", {
    username: "guest",
    password: "guest-pass",
  });
  assert.equal(login.status, 200);
  const token = login.json?.token;
  assert.equal(typeof token, "string");

  const search = await requestJson(
    "GET",
    `/api/search?q=${encodeURIComponent("Nicomachean")}`,
    undefined,
    token,
  );

  assert.equal(search.status, 200);
  assert.ok(Array.isArray(search.json?.results));
  assert.ok(search.json.results.length >= 1);
  assert.equal(search.json.results[0].id, "W1");
});

test("reading progress is stored separately from quotes", async () => {
  const login = await requestJson("POST", "/api/auth/login", {
    username: "guest",
    password: "guest-pass",
  });
  assert.equal(login.status, 200);
  const token = login.json?.token;
  assert.equal(typeof token, "string");

  const progress = await requestJson(
    "POST",
    "/api/works/W1/progress",
    {
      note: "Reached the midpoint",
      pageNumber: 42,
    },
    token,
  );
  assert.equal(progress.status, 200);
  assert.equal(progress.json?.success, true);
  assert.equal(progress.json?.page_number, 42);
  assert.equal(progress.json?.page_count, 100);

  const quoteCount = appDb
    .prepare("SELECT COUNT(*) AS count FROM work_quotes WHERE work_id = ?")
    .get("W1").count;
  const activity = appDb
    .prepare(
      `SELECT user_id, work_id, notes, current_page, page_count
       FROM user_reading_activities
       WHERE user_id = ? AND work_id = ?`,
    )
    .get("guest-1", "W1");

  assert.equal(quoteCount, 0);
  assert.equal(activity.user_id, "guest-1");
  assert.equal(activity.work_id, "W1");
  assert.equal(activity.notes, "Reached the midpoint");
  assert.equal(activity.current_page, 42);
  assert.equal(activity.page_count, 100);

  const work = await requestJson("GET", "/api/works/W1", undefined, token);
  assert.equal(work.status, 200);
  assert.equal(work.json?.current_page, 42);
  assert.equal(work.json?.quotes?.length, 0);
});

test("public profile endpoint exposes shelves and only public email", async () => {
  const login = await requestJson("POST", "/api/auth/login", {
    username: "guest",
    password: "guest-pass",
  });
  assert.equal(login.status, 200);
  const token = login.json?.token;
  assert.equal(typeof token, "string");

  await requestJson(
    "POST",
    "/api/works/W1/progress",
    {
      note: "Continuing",
      pageNumber: 12,
    },
    token,
  );

  const guestProfile = await requestJson(
    "GET",
    "/api/profiles/guest",
    undefined,
    token,
  );
  assert.equal(guestProfile.status, 200);
  assert.equal(guestProfile.json?.userInfo?.username, "guest");
  assert.equal(guestProfile.json?.userInfo?.email, "guest@example.com");
  assert.ok(Array.isArray(guestProfile.json?.reading));
  assert.ok(Array.isArray(guestProfile.json?.favorites));
  assert.ok(Array.isArray(guestProfile.json?.shelved));
  assert.equal("quotes" in guestProfile.json, false);

  const adminProfile = await requestJson(
    "GET",
    "/api/profiles/admin",
    undefined,
    token,
  );
  assert.equal(adminProfile.status, 200);
  assert.equal(adminProfile.json?.userInfo?.username, "admin");
  assert.equal(adminProfile.json?.userInfo?.email, null);
});

test("admin can update work and author goodreads ids via dedicated endpoints", async () => {
  const login = await requestJson("POST", "/api/auth/login", {
    username: "admin",
    password: "admin-pass",
  });
  assert.equal(login.status, 200);
  const token = login.json?.token;
  assert.equal(typeof token, "string");

  const authors = await requestJson("GET", "/api/authors", undefined, token);
  assert.equal(authors.status, 200);
  const author = authors.json.find((entry) => entry.name === "Aristotle");
  assert.equal(typeof author?.id, "number");

  const authorUpdate = await requestJson(
    "PUT",
    `/api/authors/${author.id}/goodreads-id`,
    { goodreads_id: "author-updated" },
    token,
  );
  assert.equal(authorUpdate.status, 200);
  assert.equal(authorUpdate.json?.success, true);
  assert.equal(authorUpdate.json?.goodreads_id, "author-updated");

  const workUpdate = await requestJson(
    "PUT",
    "/api/works/W1/goodreads-id",
    { goodreads_id: "work-updated" },
    token,
  );
  assert.equal(workUpdate.status, 200);
  assert.equal(workUpdate.json?.success, true);
  assert.equal(workUpdate.json?.goodreads_id, "work-updated");

  const work = await requestJson("GET", "/api/works/W1", undefined, token);
  assert.equal(work.status, 200);
  assert.equal(work.json?.goodreads_id, "work-updated");

  const refreshedAuthors = await requestJson(
    "GET",
    "/api/authors",
    undefined,
    token,
  );
  const refreshedAuthor = refreshedAuthors.json.find(
    (entry) => entry.id === author.id,
  );
  assert.equal(refreshedAuthor?.goodreads_id, "author-updated");
});

test("author admin flow supports update and delete by numeric id", async () => {
  const login = await requestJson("POST", "/api/auth/login", {
    username: "admin",
    password: "admin-pass",
  });
  assert.equal(login.status, 200);
  const token = login.json?.token;
  assert.equal(typeof token, "string");

  const listBefore = await requestJson("GET", "/api/authors", undefined, token);
  assert.equal(listBefore.status, 200);
  assert.ok(Array.isArray(listBefore.json));
  const author = listBefore.json.find((entry) => entry.name === "Aristotle");
  assert.equal(typeof author?.id, "number");
  assert.equal(author?.bio, "Ancient Greek philosopher");

  const update = await requestJson(
    "PUT",
    `/api/authors/${author.id}`,
    {
      name: "Aristotle Revised",
      bio: "Updated biography",
      goodreads_id: "author-42",
    },
    token,
  );
  assert.equal(update.status, 200);
  assert.equal(update.json?.success, true);
  assert.equal(update.json?.author?.name, "Aristotle Revised");
  assert.equal(update.json?.author?.bio, "Updated biography");
  assert.equal(update.json?.author?.goodreads_id, "author-42");

  const collection = await requestJson(
    "GET",
    `/api/collection/${encodeURIComponent("Aristotle Revised")}`,
    undefined,
    token,
  );
  assert.equal(collection.status, 200);
  assert.equal(collection.json?.profile?.name, "Aristotle Revised");
  assert.equal(collection.json?.works?.[0]?.authors?.[0], "Aristotle Revised");

  const remove = await requestJson(
    "DELETE",
    `/api/authors/${author.id}`,
    undefined,
    token,
  );
  assert.equal(remove.status, 200);
  assert.equal(remove.json?.success, true);

  const listAfter = await requestJson("GET", "/api/authors", undefined, token);
  assert.equal(listAfter.status, 200);
  assert.equal(listAfter.json.length, 0);
});

test("author migration script upgrades legacy name-based tables", () => {
  const tempMigrationDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "imkdiread-author-migration-"),
  );
  const legacyDbPath = path.join(tempMigrationDir, "legacy.sqlite");

  try {
    seedLegacyAuthorSchemaDb(legacyDbPath);

    execFileSync("node", ["scripts/migrate-authors-to-id-schema.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DB_PATH: legacyDbPath },
      stdio: "pipe",
    });

    const migratedDb = new Database(legacyDbPath, { readonly: true });
    const authorColumns = migratedDb.prepare("PRAGMA table_info(authors)").all();
    const workAuthorColumns = migratedDb
      .prepare("PRAGMA table_info(work_authors)")
      .all();
    const userAuthorColumns = migratedDb
      .prepare("PRAGMA table_info(user_author_interactions)")
      .all();

    assert.ok(authorColumns.some((column) => column.name === "id"));
    assert.ok(authorColumns.some((column) => column.name === "bio"));
    assert.ok(workAuthorColumns.some((column) => column.name === "author_id"));
    assert.ok(
      userAuthorColumns.some((column) => column.name === "author_id"),
    );

    const migratedAuthor = migratedDb
      .prepare("SELECT id, name, bio, goodreads_id FROM authors")
      .get();
    assert.equal(migratedAuthor.name, "Aristotle");
    assert.equal(migratedAuthor.bio, null);
    assert.equal(migratedAuthor.goodreads_id, "author-1");

    const workAuthor = migratedDb
      .prepare("SELECT work_id, author_id FROM work_authors")
      .get();
    const followedAuthor = migratedDb
      .prepare("SELECT user_id, author_id, followed FROM user_author_interactions")
      .get();

    assert.equal(workAuthor.work_id, "W1");
    assert.equal(workAuthor.author_id, migratedAuthor.id);
    assert.equal(followedAuthor.user_id, "user-1");
    assert.equal(followedAuthor.author_id, migratedAuthor.id);
    assert.equal(followedAuthor.followed, 1);

    migratedDb.close();
  } finally {
    fs.rmSync(tempMigrationDir, { recursive: true, force: true });
  }
});

test("reading progress migration script moves legacy progress rows out of work_quotes", () => {
  const tempMigrationDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "imkdiread-progress-migration-"),
  );
  const legacyDbPath = path.join(tempMigrationDir, "legacy.sqlite");

  try {
    seedLegacyProgressSchemaDb(legacyDbPath);

    execFileSync("node", ["scripts/migrate-reading-progress-to-activities.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DB_PATH: legacyDbPath },
      stdio: "pipe",
    });

    const migratedDb = new Database(legacyDbPath, { readonly: true });
    const activityColumns = migratedDb
      .prepare("PRAGMA table_info(user_reading_activities)")
      .all();
    assert.ok(
      activityColumns.some((column) => column.name === "current_page"),
    );
    assert.ok(activityColumns.some((column) => column.name === "notes"));

    const activity = migratedDb
      .prepare(
        `SELECT user_id, work_id, notes, current_page, page_count, created_at
         FROM user_reading_activities`,
      )
      .get();
    assert.equal(activity.user_id, "user-1");
    assert.equal(activity.work_id, "W1");
    assert.equal(activity.notes, "Reached the midpoint");
    assert.equal(activity.current_page, 123);
    assert.equal(activity.page_count, 321);
    assert.equal(activity.created_at, "2026-03-14 09:00:00");

    const remainingQuotes = migratedDb
      .prepare("SELECT quote, page_number FROM work_quotes ORDER BY id")
      .all();
    assert.deepEqual(remainingQuotes, [
      {
        quote: "A real quote",
        page_number: 124,
      },
    ]);

    migratedDb.close();
  } finally {
    fs.rmSync(tempMigrationDir, { recursive: true, force: true });
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { once } = require("events");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createApp } = require("../app");
const { getPublicPath } = require("../app/utils/paths");

let server;
let appDb;
let baseUrl;
let tempDir;
let dbPath;
let originalEnv;
let originalGetGenerativeModel;
let originalFetch;
const tempPublicPaths = new Set();

function seedTestDb(targetDbPath) {
  const db = new Database(targetDbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
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
      explanation TEXT,
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
    CREATE TABLE user_work_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      work_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fulfilled_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
      UNIQUE (user_id, work_id, kind)
    );
    CREATE TABLE user_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      work_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload TEXT,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );
    CREATE TABLE vocabularies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      work_id TEXT NOT NULL,
      word TEXT NOT NULL,
      word_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE,
      UNIQUE(user_id, work_id, word)
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
  db.prepare(
    `INSERT INTO work_quotes (work_id, quote, page_number, explanation, user_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run("W1", "We are what we repeatedly do.", 10, "Classic line", "guest-1");

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

function seedDriftedModernSchemaDb(targetDbPath) {
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
      role TEXT NOT NULL DEFAULT 'guest'
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
  `);

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

async function requestMultipart(method, routePath, fields, token) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const formData = new FormData();
  for (const field of fields) {
    formData.append(
      field.name,
      new Blob([field.content], { type: field.type }),
      field.filename,
    );
  }

  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: formData,
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

async function login(username, password) {
  const response = await requestJson("POST", "/api/auth/login", {
    username,
    password,
  });
  assert.equal(response.status, 200);
  assert.equal(typeof response.json?.token, "string");
  return response.json.token;
}

function trackPublicArtifact(...segments) {
  const filePath = getPublicPath(...segments);
  tempPublicPaths.add(filePath);
  return filePath;
}

test.before(async () => {
  originalEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    GUEST_INVITE_CODE: process.env.GUEST_INVITE_CODE,
  };
  process.env.JWT_SECRET = "test-jwt-secret";
  process.env.GUEST_INVITE_CODE = "test-invite-code";

  originalGetGenerativeModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  originalFetch = global.fetch;
  GoogleGenerativeAI.prototype.getGenerativeModel = function getModel() {
    return {
      generateContent: async (prompt) => {
        const text = String(prompt);
        if (text.includes("cleaned_quote")) {
          return {
            response: {
              text: () =>
                JSON.stringify({
                  cleaned_quote: "A cleaned passage.",
                  explanation: "A concise explanation.",
                }),
            },
          };
        }

        return {
          response: {
            text: () =>
              JSON.stringify({
                word: "virtue",
                lore_note: "A contextual note.",
                phonetic: "/vur-choo/",
                meanings: [
                  {
                    partOfSpeech: "noun",
                    definitions: [{ definition: "Moral excellence." }],
                  },
                ],
              }),
          },
        };
      },
    };
  };
  global.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (url?.startsWith("https://api.dictionaryapi.dev/api/v2/entries/en/")) {
      const word = decodeURIComponent(url.split("/").at(-1) || "word");
      return new Response(
        JSON.stringify([
          {
            word,
            phonetic: "/fallback/",
            meanings: [
              {
                partOfSpeech: "noun",
                definitions: [{ definition: `Fallback definition for ${word}.` }],
              },
            ],
          },
        ]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return originalFetch(input, init);
  };

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

  for (const filePath of tempPublicPaths) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }

  if (originalGetGenerativeModel) {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetGenerativeModel;
  }
  if (originalFetch) {
    global.fetch = originalFetch;
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
  const token = await login("guest", "guest-pass");
  const quoteCountBefore = appDb
    .prepare("SELECT COUNT(*) AS count FROM work_quotes WHERE work_id = ?")
    .get("W1").count;

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

  assert.equal(quoteCount, quoteCountBefore);
  assert.equal(activity.user_id, "guest-1");
  assert.equal(activity.work_id, "W1");
  assert.equal(activity.notes, "Reached the midpoint");
  assert.equal(activity.current_page, 42);
  assert.equal(activity.page_count, 100);

  const work = await requestJson("GET", "/api/works/W1", undefined, token);
  assert.equal(work.status, 200);
  assert.equal(work.json?.current_page, 42);
  assert.equal(work.json?.quotes?.length, quoteCountBefore);
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
  const token = await login("admin", "admin-pass");
  const suffix = Date.now();
  const create = await requestJson(
    "POST",
    "/api/authors",
    {
      name: `Numeric Author ${suffix}`,
      bio: "Ancient Greek philosopher",
      goodreads_id: `numeric-author-${suffix}`,
    },
    token,
  );
  assert.equal(create.status, 200);
  assert.equal(create.json?.success, true);
  const author = create.json?.author;
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
  assert.equal(
    listAfter.json.some((entry) => entry.id === author.id),
    false,
  );
});

test("auth register creates a guest account with the invite code", async () => {
  const username = `guest-${Date.now()}`;
  const register = await requestJson("POST", "/api/auth/register", {
    username,
    password: "fresh-pass",
    inviteCode: "test-invite-code",
  });

  assert.equal(register.status, 200);
  assert.equal(register.json?.success, true);

  const loginResponse = await requestJson("POST", "/api/auth/login", {
    username,
    password: "fresh-pass",
  });
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.json?.user?.role, "guest");
});

test("profile routes support current user settings and avatar upload", async () => {
  const token = await login("guest", "guest-pass");

  const me = await requestJson("GET", "/api/profile/me", undefined, token);
  assert.equal(me.status, 200);
  assert.equal(me.json?.userInfo?.username, "guest");
  assert.ok(Array.isArray(me.json?.quotes));

  const update = await requestJson(
    "PUT",
    "/api/profile/me",
    {
      email: "guest+updated@example.com",
      is_email_public: false,
    },
    token,
  );
  assert.equal(update.status, 200);
  assert.equal(update.json?.success, true);
  assert.equal(update.json?.user?.email, "guest+updated@example.com");
  assert.equal(update.json?.user?.is_email_public, false);

  const avatarUpload = await requestMultipart(
    "POST",
    "/api/profile/avatar",
    [
      {
        name: "avatar",
        filename: "avatar.png",
        type: "image/png",
        content: "fake-png-avatar",
      },
    ],
    token,
  );
  assert.equal(avatarUpload.status, 200);
  assert.equal(avatarUpload.json?.success, true);
  assert.equal(typeof avatarUpload.json?.avatar_url, "string");
  trackPublicArtifact(
    ...avatarUpload.json.avatar_url.replace(/^\//, "").split("/"),
  );

  const refreshed = await requestJson("GET", "/api/profile/me", undefined, token);
  assert.equal(refreshed.status, 200);
  assert.equal(
    refreshed.json?.userInfo?.avatar_url,
    avatarUpload.json?.avatar_url,
  );
});

test("utility discovery routes return screensavers, explore, works, and collection data", async () => {
  const adminToken = await login("admin", "admin-pass");
  const token = await login("guest", "guest-pass");

  const health = await requestJson("GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.json?.ok, true);
  assert.equal(health.json?.status, "healthy");
  assert.equal(typeof health.json?.uptime, "number");
  assert.equal(typeof health.json?.timestamp, "string");

  const screensaverFilename = `smoke-screen-${Date.now()}.png`;
  const screensaverPath = trackPublicArtifact(
    "imgs",
    "screensavers",
    screensaverFilename,
  );
  fs.mkdirSync(path.dirname(screensaverPath), { recursive: true });
  fs.writeFileSync(screensaverPath, "screensaver");

  const screensavers = await requestJson("GET", "/api/screensavers");
  assert.equal(screensavers.status, 200);
  assert.ok(Array.isArray(screensavers.json?.images));
  assert.ok(
    screensavers.json.images.some((image) => image.endsWith(screensaverFilename)),
  );
  assert.ok(screensavers.json.index >= 0);
  assert.ok(screensavers.json.index < screensavers.json.images.length);

  const uploadedFilenamePrefix = `upload-screen-${Date.now()}`;
  const uploadScreensaver = await requestMultipart(
    "POST",
    "/api/screensavers",
    [
      {
        name: "file",
        filename: `${uploadedFilenamePrefix}.png`,
        type: "image/png",
        content: "new-screensaver",
      },
    ],
    adminToken,
  );
  assert.equal(uploadScreensaver.status, 200);
  assert.equal(uploadScreensaver.json?.success, true);
  assert.match(
    uploadScreensaver.json?.filename,
    new RegExp(`^${uploadedFilenamePrefix}`),
  );
  trackPublicArtifact(
    "imgs",
    "screensavers",
    uploadScreensaver.json.filename,
  );

  const explore = await requestJson("GET", "/api/explore", undefined, token);
  assert.equal(explore.status, 200);
  assert.ok(Array.isArray(explore.json?.works));
  assert.ok(Array.isArray(explore.json?.authors));

  const works = await requestJson("GET", "/api/works", undefined, token);
  assert.equal(works.status, 200);
  assert.ok(Array.isArray(works.json));
  assert.ok(works.json.some((entry) => entry.id === "W1"));

  const authorCollection = await requestJson(
    "GET",
    `/api/collection/${encodeURIComponent("Aristotle")}`,
    undefined,
    token,
  );
  assert.equal(authorCollection.status, 200);
  assert.equal(authorCollection.json?.profile?.name, "Aristotle");
  assert.ok(Array.isArray(authorCollection.json?.works));

  const tagCollection = await requestJson(
    "GET",
    `/api/collection/${encodeURIComponent("philosophy")}`,
    undefined,
    token,
  );
  assert.equal(tagCollection.status, 200);
  assert.equal(tagCollection.json?.profile, null);
  assert.ok(Array.isArray(tagCollection.json?.works));
});

test("tag and author admin routes support create, mutate, upload, follow, and cleanup", async () => {
  const token = await login("admin", "admin-pass");
  const suffix = Date.now();
  const tagName = `stoic-${suffix}`;
  const renamedTag = `stoic-renamed-${suffix}`;
  const authorName = `Author ${suffix}`;
  const renamedAuthorName = `Author Revised ${suffix}`;
  const authorGoodreadsId = `author-smoke-${suffix}`;
  const renamedAuthorGoodreadsId = `author-smoke-renamed-${suffix}`;

  const createTag = await requestJson(
    "POST",
    "/api/tags",
    { newTag: tagName },
    token,
  );
  assert.equal(createTag.status, 200);
  assert.equal(createTag.json?.success, true);
  assert.ok(createTag.json?.tags.includes(tagName));

  const renameTagResponse = await requestJson(
    "PUT",
    `/api/tags/${encodeURIComponent(tagName)}`,
    { newName: renamedTag },
    token,
  );
  assert.equal(renameTagResponse.status, 200);
  assert.equal(renameTagResponse.json?.success, true);

  const createAuthor = await requestJson(
    "POST",
    "/api/authors",
    {
      name: authorName,
      bio: "Newly added author",
      goodreads_id: authorGoodreadsId,
    },
    token,
  );
  assert.equal(createAuthor.status, 200);
  assert.equal(createAuthor.json?.success, true);
  assert.equal(createAuthor.json?.author?.name, authorName);
  const authorId = createAuthor.json?.author?.id;
  assert.equal(typeof authorId, "number");

  const avatarUpload = await requestMultipart(
    "POST",
    `/api/authors/${authorId}/avatar`,
    [
      {
        name: "file",
        filename: "author.png",
        type: "image/png",
        content: "fake-author-avatar",
      },
    ],
    token,
  );
  assert.equal(avatarUpload.status, 200);
  assert.equal(avatarUpload.json?.success, true);
  trackPublicArtifact("imgs", "avatars", `${authorGoodreadsId}.png`);

  const follow = await requestJson(
    "POST",
    `/api/authors/${authorId}/follow`,
    { followed: true },
    token,
  );
  assert.equal(follow.status, 200);
  assert.equal(follow.json?.followed, true);

  const updateAuthor = await requestJson(
    "PUT",
    `/api/authors/${authorId}`,
    {
      name: renamedAuthorName,
      bio: "Updated author bio",
      goodreads_id: renamedAuthorGoodreadsId,
    },
    token,
  );
  assert.equal(updateAuthor.status, 200);
  assert.equal(updateAuthor.json?.success, true);
  assert.equal(updateAuthor.json?.author?.name, renamedAuthorName);
  trackPublicArtifact("imgs", "avatars", `${renamedAuthorGoodreadsId}.png`);

  const authorGoodreadsUpdate = await requestJson(
    "PUT",
    `/api/authors/${authorId}/goodreads-id`,
    { goodreads_id: `${renamedAuthorGoodreadsId}-2` },
    token,
  );
  assert.equal(authorGoodreadsUpdate.status, 200);
  assert.equal(authorGoodreadsUpdate.json?.success, true);
  trackPublicArtifact(
    "imgs",
    "avatars",
    `${renamedAuthorGoodreadsId}-2.png`,
  );

  const authorList = await requestJson("GET", "/api/authors", undefined, token);
  assert.equal(authorList.status, 200);
  assert.ok(authorList.json.some((entry) => entry.id === authorId));

  const removeTag = await requestJson(
    "DELETE",
    `/api/tags/${encodeURIComponent(renamedTag)}`,
    undefined,
    token,
  );
  assert.equal(removeTag.status, 200);
  assert.equal(removeTag.json?.success, true);

  const deleteAuthor = await requestJson(
    "DELETE",
    `/api/authors/${authorId}`,
    undefined,
    token,
  );
  assert.equal(deleteAuthor.status, 200);
  assert.equal(deleteAuthor.json?.success, true);
});

test("work admin and reader routes cover CRUD, uploads, interactions, quotes, progress, dictionary, and vocabulary", async () => {
  const adminToken = await login("admin", "admin-pass");
  const guestToken = await login("guest", "guest-pass");
  const suffix = Date.now();
  const workId = `SMOKE-${suffix}`;
  const importedWorkId = `SMOKE-IMPORT-${suffix}`;
  const notifyWorkId = `SMOKE-INBOX-${suffix}`;

  const createWork = await requestJson(
    "POST",
    "/api/works",
    {
      id: workId,
      title: "Smoke Work",
      page_count: 220,
      goodreads_id: "",
      dropbox_link: "",
      amazon_asin: "",
      authors: ["Aristotle"],
      tags: ["philosophy"],
    },
    adminToken,
  );
  assert.equal(createWork.status, 200);
  assert.equal(createWork.json?.success, true);

  const updateWork = await requestJson(
    "PUT",
    `/api/works/${encodeURIComponent(workId)}`,
    {
      id: workId,
      title: "Smoke Work Updated",
      page_count: 240,
      goodreads_id: "smoke-book-id",
      dropbox_link: "",
      amazon_asin: "B000TEST",
      authors: ["Aristotle"],
      tags: ["logic"],
    },
    adminToken,
  );
  assert.equal(updateWork.status, 200);
  assert.equal(updateWork.json?.success, true);

  const setDropbox = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/dropbox-link`,
    { link: "https://www.dropbox.com/s/test/file.pdf?dl=0" },
    adminToken,
  );
  assert.equal(setDropbox.status, 200);
  assert.equal(setDropbox.json?.success, true);

  const setGoodreads = await requestJson(
    "PUT",
    `/api/works/${encodeURIComponent(workId)}/goodreads-id`,
    { goodreads_id: "smoke-goodreads-updated" },
    adminToken,
  );
  assert.equal(setGoodreads.status, 200);
  assert.equal(setGoodreads.json?.success, true);

  const coverUpload = await requestMultipart(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/cover`,
    [
      {
        name: "file",
        filename: "cover.png",
        type: "image/png",
        content: "fake-cover",
      },
    ],
    adminToken,
  );
  assert.equal(coverUpload.status, 200);
  assert.equal(coverUpload.json?.success, true);
  trackPublicArtifact("imgs", "covers", `${workId}.png`);

  const fileUpload = await requestMultipart(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/files`,
    [
      {
        name: "file",
        filename: `${workId}.pdf`,
        type: "application/pdf",
        content: "%PDF-1.4 smoke pdf",
      },
    ],
    adminToken,
  );
  assert.equal(fileUpload.status, 200);
  assert.equal(fileUpload.json?.success, true);
  trackPublicArtifact("files", `${workId}.pdf`);

  const bulkImport = await requestJson(
    "POST",
    "/api/works/bulk-import",
    [
      {
        id: importedWorkId,
        title: "Bulk Imported Work",
        goodreads_id: "bulk-goodreads",
        page_count: 88,
        authors: ["Bulk Author"],
        tags: ["bulk-tag"],
      },
    ],
    adminToken,
  );
  assert.equal(bulkImport.status, 200);
  assert.equal(bulkImport.json?.success, true);

  const createNotifyWork = await requestJson(
    "POST",
    "/api/works",
    {
      id: notifyWorkId,
      title: "Inbox Notification Work",
      page_count: 120,
      goodreads_id: "",
      dropbox_link: "",
      amazon_asin: "",
      authors: ["Aristotle"],
      tags: ["stoicism"],
    },
    adminToken,
  );
  assert.equal(createNotifyWork.status, 200);
  assert.equal(createNotifyWork.json?.success, true);

  const bulkTags = await requestJson(
    "POST",
    "/api/works/bulk-tags",
    {
      workIds: [importedWorkId],
      tags: ["bulk-extra"],
    },
    adminToken,
  );
  assert.equal(bulkTags.status, 200);
  assert.equal(bulkTags.json?.success, true);

  const toggleLiked = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}`,
    { action: "liked", value: true },
    guestToken,
  );
  assert.equal(toggleLiked.status, 200);
  assert.equal(toggleLiked.json?.success, true);

  const toggleRead = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}`,
    { action: "read", value: true },
    guestToken,
  );
  assert.equal(toggleRead.status, 200);

  const toggleShelved = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}`,
    { action: "shelved", value: true },
    guestToken,
  );
  assert.equal(toggleShelved.status, 200);

  const toggleShelvedImported = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(importedWorkId)}`,
    { action: "shelved", value: true },
    guestToken,
  );
  assert.equal(toggleShelvedImported.status, 200);

  const toggleShelvedNotify = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(notifyWorkId)}`,
    { action: "shelved", value: true },
    guestToken,
  );
  assert.equal(toggleShelvedNotify.status, 200);

  const importedAlertCount = appDb
    .prepare(
      `SELECT COUNT(*) AS count
       FROM user_work_alerts
       WHERE user_id = ? AND work_id = ? AND kind = ? AND active = 1 AND fulfilled_at IS NULL`,
    )
    .get("guest-1", importedWorkId, "work_available").count;
  assert.equal(importedAlertCount, 1);

  const inboxUnreadBefore = await requestJson(
    "GET",
    "/api/inbox/unread-count",
    undefined,
    guestToken,
  );
  assert.equal(inboxUnreadBefore.status, 200);
  assert.equal(inboxUnreadBefore.json?.unread_count, 0);

  const importedFileUpload = await requestMultipart(
    "POST",
    `/api/works/${encodeURIComponent(importedWorkId)}/files`,
    [
      {
        name: "file",
        filename: `${importedWorkId}.pdf`,
        type: "application/pdf",
        content: "%PDF-1.4 inbox pdf",
      },
    ],
    adminToken,
  );
  assert.equal(importedFileUpload.status, 200);
  assert.equal(importedFileUpload.json?.success, true);
  trackPublicArtifact("files", `${importedWorkId}.pdf`);

  const importedWorkDetail = await requestJson(
    "GET",
    `/api/works/${encodeURIComponent(importedWorkId)}`,
    undefined,
    guestToken,
  );
  assert.equal(importedWorkDetail.status, 200);
  assert.ok(
    Array.isArray(importedWorkDetail.json?.file_urls) &&
      importedWorkDetail.json.file_urls.some((url) =>
        url.endsWith(`${importedWorkId}.pdf`),
      ),
  );

  const importedNotificationCount = appDb
    .prepare(
      `SELECT COUNT(*) AS count
       FROM user_notifications
       WHERE user_id = ? AND work_id = ? AND type = ?`,
    )
    .get("guest-1", importedWorkId, "work_available").count;
  assert.equal(importedNotificationCount, 1);

  const inboxAfterFile = await requestJson(
    "GET",
    "/api/inbox",
    undefined,
    guestToken,
  );
  assert.equal(inboxAfterFile.status, 200);
  assert.equal(inboxAfterFile.json?.unread_count, 1);
  assert.ok(Array.isArray(inboxAfterFile.json?.items));
  const importedNotification = inboxAfterFile.json.items.find(
    (item) => item.work_id === importedWorkId,
  );
  assert.equal(importedNotification?.type, "work_available");

  const importedDropbox = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(importedWorkId)}/dropbox-link`,
    { link: "https://www.dropbox.com/s/test/imported.pdf?dl=0" },
    adminToken,
  );
  assert.equal(importedDropbox.status, 200);
  assert.equal(importedDropbox.json?.success, true);

  const inboxAfterDuplicateSource = await requestJson(
    "GET",
    "/api/inbox",
    undefined,
    guestToken,
  );
  const importedNotifications = (
    inboxAfterDuplicateSource.json?.items || []
  ).filter((item) => item.work_id === importedWorkId);
  assert.equal(importedNotifications.length, 1);

  const notifyDropbox = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(notifyWorkId)}/dropbox-link`,
    { link: "https://www.dropbox.com/s/test/inbox.pdf?dl=0" },
    adminToken,
  );
  assert.equal(notifyDropbox.status, 200);
  assert.equal(notifyDropbox.json?.success, true);

  const inboxAfterDropbox = await requestJson(
    "GET",
    "/api/inbox",
    undefined,
    guestToken,
  );
  assert.equal(inboxAfterDropbox.status, 200);
  assert.equal(inboxAfterDropbox.json?.unread_count, 2);

  const markImportedRead = await requestJson(
    "POST",
    `/api/inbox/${importedNotification.id}/read`,
    {},
    guestToken,
  );
  assert.equal(markImportedRead.status, 200);
  assert.equal(markImportedRead.json?.success, true);
  assert.equal(markImportedRead.json?.unread_count, 1);

  const markAllRead = await requestJson(
    "POST",
    "/api/inbox/read-all",
    {},
    guestToken,
  );
  assert.equal(markAllRead.status, 200);
  assert.equal(markAllRead.json?.success, true);
  assert.equal(markAllRead.json?.unread_count, 0);

  const setRating = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}`,
    { action: "rating", value: 7 },
    guestToken,
  );
  assert.equal(setRating.status, 200);

  const quoteCreate = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/quotes`,
    {
      quote: "A temporary quote",
      pageNumber: 21,
      explanation: "A temporary explanation",
    },
    guestToken,
  );
  assert.equal(quoteCreate.status, 200);
  assert.equal(quoteCreate.json?.success, true);

  const createdQuote = appDb
    .prepare(
      "SELECT id FROM work_quotes WHERE work_id = ? AND user_id = ? AND quote = ?",
    )
    .get(workId, "guest-1", "A temporary quote");
  assert.equal(typeof createdQuote?.id, "number");

  const quoteUpdate = await requestJson(
    "PUT",
    `/api/quotes/${createdQuote.id}`,
    {
      quote: "A temporary quote updated",
      pageNumber: 22,
      explanation: "Updated explanation",
    },
    guestToken,
  );
  assert.equal(quoteUpdate.status, 200);
  assert.equal(quoteUpdate.json?.success, true);

  const progress = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/progress`,
    {
      note: "Reached page 30",
      pageNumber: 30,
    },
    guestToken,
  );
  assert.equal(progress.status, 200);
  assert.equal(progress.json?.success, true);

  const finish = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/progress/finish`,
    { note: "Finished it" },
    guestToken,
  );
  assert.equal(finish.status, 200);
  assert.equal(finish.json?.success, true);
  assert.equal(finish.json?.read, true);

  const lookup = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/context/lookup`,
    { word: "virtue", mode: "context" },
    guestToken,
  );
  assert.equal(lookup.status, 200);
  assert.equal(lookup.json?.success, true);
  assert.equal(lookup.json?.mode, "context");
  assert.equal(lookup.json?.provider, "gemini");
  assert.equal(lookup.json?.result?.word, "virtue");

  const wordLookup = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/context/lookup`,
    { word: "temperance", mode: "word" },
    guestToken,
  );
  assert.equal(wordLookup.status, 200);
  assert.equal(wordLookup.json?.success, true);
  assert.equal(wordLookup.json?.mode, "word");
  assert.equal(wordLookup.json?.provider, "free-dictionary");
  assert.equal(wordLookup.json?.result?.word, "temperance");
  assert.equal(wordLookup.json?.result?.lore_note, null);

  const explain = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/dictionary/explain`,
    { text: "Broken-\nline passage" },
    guestToken,
  );
  assert.equal(explain.status, 200);
  assert.equal(explain.json?.success, true);
  assert.equal(explain.json?.result?.cleaned_quote, "A cleaned passage.");

  const vocabCreate = await requestJson(
    "POST",
    `/api/works/${encodeURIComponent(workId)}/vocabularies`,
    {
      word: "virtue",
      word_data: {
        word: "virtue",
        meanings: [
          {
            partOfSpeech: "noun",
            definitions: [{ definition: "Moral excellence." }],
          },
        ],
      },
    },
    guestToken,
  );
  assert.equal(vocabCreate.status, 200);
  assert.equal(vocabCreate.json?.success, true);
  const vocabId = vocabCreate.json?.vocabulary?.id;
  assert.equal(typeof vocabId, "number");

  const vocabList = await requestJson(
    "GET",
    `/api/works/${encodeURIComponent(workId)}/vocabularies`,
    undefined,
    guestToken,
  );
  assert.equal(vocabList.status, 200);
  assert.ok(Array.isArray(vocabList.json?.vocabularies));
  assert.ok(vocabList.json.vocabularies.some((entry) => entry.id === vocabId));

  const vocabDelete = await requestJson(
    "DELETE",
    `/api/works/${encodeURIComponent(workId)}/vocabularies/${vocabId}`,
    undefined,
    guestToken,
  );
  assert.equal(vocabDelete.status, 200);
  assert.equal(vocabDelete.json?.success, true);

  const quoteDelete = await requestJson(
    "DELETE",
    `/api/quotes/${createdQuote.id}`,
    undefined,
    guestToken,
  );
  assert.equal(quoteDelete.status, 200);
  assert.equal(quoteDelete.json?.success, true);

  const workDetail = await requestJson(
    "GET",
    `/api/works/${encodeURIComponent(workId)}`,
    undefined,
    guestToken,
  );
  assert.equal(workDetail.status, 200);
  assert.equal(workDetail.json?.title, "Smoke Work Updated");
  assert.equal(Boolean(workDetail.json?.read), true);
  assert.equal(Boolean(workDetail.json?.liked), true);
  assert.equal(workDetail.json?.rating, 7);
  assert.ok(Array.isArray(workDetail.json?.file_urls));
  assert.ok(workDetail.json.file_urls.some((url) => url.endsWith(`${workId}.pdf`)));
  assert.ok(workDetail.json?.cover_img_url?.endsWith(`${workId}.png`));

  const deleteImported = await requestJson(
    "DELETE",
    `/api/works/${encodeURIComponent(importedWorkId)}`,
    undefined,
    adminToken,
  );
  assert.equal(deleteImported.status, 200);
  assert.equal(deleteImported.json?.success, true);

  const deleteNotifyWork = await requestJson(
    "DELETE",
    `/api/works/${encodeURIComponent(notifyWorkId)}`,
    undefined,
    adminToken,
  );
  assert.equal(deleteNotifyWork.status, 200);
  assert.equal(deleteNotifyWork.json?.success, true);

  const deleteWork = await requestJson(
    "DELETE",
    `/api/works/${encodeURIComponent(workId)}`,
    undefined,
    adminToken,
  );
  assert.equal(deleteWork.status, 200);
  assert.equal(deleteWork.json?.success, true);
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

test("ensure database schema script bootstraps missing tables and columns", () => {
  const tempSchemaDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "imkdiread-schema-ensure-"),
  );
  const driftedDbPath = path.join(tempSchemaDir, "drifted.sqlite");

  try {
    seedDriftedModernSchemaDb(driftedDbPath);

    execFileSync("node", ["scripts/ensure-database-schema.js"], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, DB_PATH: driftedDbPath },
      stdio: "pipe",
    });

    const ensuredDb = new Database(driftedDbPath, { readonly: true });
    const userColumns = ensuredDb.prepare("PRAGMA table_info(users)").all();
    const quoteColumns = ensuredDb.prepare("PRAGMA table_info(work_quotes)").all();
    const vocabTable = ensuredDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vocabularies'",
      )
      .get();
    const activityTable = ensuredDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_reading_activities'",
      )
      .get();
    const inboxAlertsTable = ensuredDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_work_alerts'",
      )
      .get();
    const inboxNotificationsTable = ensuredDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_notifications'",
      )
      .get();

    const seriesTable = ensuredDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'series'",
      )
      .get();

    assert.ok(userColumns.some((column) => column.name === "email"));
    assert.ok(userColumns.some((column) => column.name === "avatar_url"));
    assert.ok(userColumns.some((column) => column.name === "is_email_public"));
    assert.ok(quoteColumns.some((column) => column.name === "explanation"));
    assert.ok(vocabTable);
    assert.ok(activityTable);
    assert.ok(inboxAlertsTable);
    assert.ok(inboxNotificationsTable);
    assert.equal(seriesTable, undefined);

    ensuredDb.close();
  } finally {
    fs.rmSync(tempSchemaDir, { recursive: true, force: true });
  }
});

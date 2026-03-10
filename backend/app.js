require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");

const { createWorkService } = require("./app/services/workService");
const { createAuthRouter } = require("./app/routes/auth");
const { createTagsRouter } = require("./app/routes/tags");
const { createAuthorsRouter } = require("./app/routes/authors");
const { createWorksRouter } = require("./app/routes/works");
const { createProfileRouter } = require("./app/routes/profile");
const { createScreensaverRouter } = require("./app/routes/screensavers");
const { jsonError } = require("./app/utils/errorHelpers");

function createApp(options = {}) {
  const app = express();
  const staticDir = options.staticDir || path.join(__dirname, "public.noindex");
  const dbPath =
    options.dbPath ||
    process.env.DB_PATH ||
    path.join(__dirname, "db", "database.sqlite");

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const BACKEND_URL = options.backendUrl ?? process.env.BACKEND_URL ?? "";
  const workService = createWorkService({ db, BACKEND_URL });

  app.use(cors());
  app.use(express.static(staticDir));
  app.use(express.json());

  app.use(createAuthRouter({ db }));
  app.use(createTagsRouter({ db, workService }));
  app.use(createAuthorsRouter({ db, workService }));
  app.use(createWorksRouter({ db, workService }));
  app.use(createProfileRouter({ db, workService }));
  app.use(createScreensaverRouter({ backendUrl: BACKEND_URL }));

  app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed") {
      return jsonError(res, 400, "Invalid JSON payload.");
    }
    console.error("Unhandled API error:", err);
    return jsonError(res, 500, "Internal server error.");
  });

  return { app, db };
}

function startServer(options = {}) {
  const { app } = createApp(options);
  const port = options.port || process.env.PORT || 3001;
  const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  return { app, server };
}

module.exports = { createApp, startServer };

if (require.main === module) {
  startServer();
}

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { jsonError } = require("../utils/errorHelpers");
const { fetchWithTimeout } = require("../utils/fetchWithTimeout");
const { LookupError, lookupContext } = require("../utils/contextLookup");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getPublicPath } = require("../utils/paths");
const {
  asNonEmptyString,
  asOptionalString,
  asStringArray,
} = require("../utils/validators");

const workFilesDir = getPublicPath("files");
if (!fs.existsSync(workFilesDir)) {
  fs.mkdirSync(workFilesDir, { recursive: true });
}

const workCoversDir = getPublicPath("imgs", "covers");
if (!fs.existsSync(workCoversDir)) {
  fs.mkdirSync(workCoversDir, { recursive: true });
}

const workFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, workFilesDir),
  filename: (req, file, cb) => {
    const rawId = req.params?.id;
    const extension = path.extname(file.originalname);

    if (!rawId || extension !== ".pdf") return;

    cb(null, `${rawId}${extension}`);
  },
});

const workFileUpload = multer({
  storage: workFileStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

const workCoverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, workCoversDir),
  filename: (req, _file, cb) => {
    const rawId = req.params?.id;

    if (!rawId) {
      cb(new Error("Work ID is required."));
      return;
    }

    cb(null, `${rawId}.png`);
  },
});

const workCoverUpload = multer({
  storage: workCoverStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPng =
      file.mimetype === "image/png" ||
      path.extname(file.originalname).toLowerCase() === ".png";

    cb(null, isPng);
  },
});

function createWorksRouter({ db, workService, inboxService }) {
  const router = express.Router();
  const supportedQuoteChatTools = new Set(["chat", "analyze", "translate"]);
  const GEMINI_QUOTE_CHAT_MODELS = [
    {
      id: "gemini:gemini-2.5-flash",
      provider: "gemini",
      provider_label: "Gemini",
      name: "gemini-2.5-flash",
      label: "Gemini Flash",
      short_label: "Flash",
    },
    {
      id: "gemini:gemini-2.5-pro",
      provider: "gemini",
      provider_label: "Gemini",
      name: "gemini-2.5-pro",
      label: "Gemini Pro",
      short_label: "Pro",
    },
  ];
  const supportedGeminiQuoteChatModels = new Set(
    GEMINI_QUOTE_CHAT_MODELS.map((model) => model.name),
  );
  const defaultQuoteChatModelId = GEMINI_QUOTE_CHAT_MODELS[0].id;
  const ollamaHost = String(
    process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
  ).replace(/\/+$/, "");
  const ollamaProviderLabel = "Ollama";
  const configuredOllamaModel = asOptionalString(process.env.OLLAMA_MODEL);
  const AI_REQUEST_TIMEOUT_MS = 60_000;

  function isFeatureEnabled(rawValue, fallback = true) {
    const normalized = asOptionalString(rawValue);
    if (normalized === null) {
      return fallback;
    }

    return !["0", "false", "no", "off", "disabled"].includes(
      normalized.toLowerCase(),
    );
  }

  const isOllamaEnabled = isFeatureEnabled(process.env.OLLAMA_ENABLED, true);

  function getAIProviders() {
    return {
      gemini: {
        enabled: true,
        label: "Gemini",
      },
      ollama: {
        enabled: isOllamaEnabled,
        label: ollamaProviderLabel,
      },
    };
  }

  function getGeminiQuoteChatModels() {
    return GEMINI_QUOTE_CHAT_MODELS.map((model) => ({ ...model }));
  }

  function buildQuoteChatModelId(provider, modelName) {
    return `${provider}:${modelName}`;
  }

  function parseRequestedQuoteChatModel(requestedModelId) {
    const normalizedModelId =
      asOptionalString(requestedModelId) || defaultQuoteChatModelId;

    const legacyGeminiModel = GEMINI_QUOTE_CHAT_MODELS.find(
      (model) =>
        model.name === normalizedModelId || model.id === normalizedModelId,
    );
    if (legacyGeminiModel) {
      return { ...legacyGeminiModel };
    }

    const separatorIndex = normalizedModelId.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex >= normalizedModelId.length - 1) {
      return null;
    }

    const provider = normalizedModelId.slice(0, separatorIndex);
    const modelName = normalizedModelId.slice(separatorIndex + 1).trim();
    if (!modelName) {
      return null;
    }

    if (provider === "gemini") {
      if (!supportedGeminiQuoteChatModels.has(modelName)) {
        return null;
      }

      return (
        GEMINI_QUOTE_CHAT_MODELS.find((model) => model.name === modelName) ||
        null
      );
    }

    if (provider === "ollama") {
      if (!isOllamaEnabled) {
        return null;
      }

      return {
        id: buildQuoteChatModelId(provider, modelName),
        provider,
        provider_label: ollamaProviderLabel,
        name: modelName,
        label: modelName,
        short_label: modelName,
      };
    }

    return null;
  }

  async function fetchOllamaQuoteChatModels() {
    const fallbackModels = configuredOllamaModel
      ? [
          {
            id: buildQuoteChatModelId("ollama", configuredOllamaModel),
            provider: "ollama",
            provider_label: ollamaProviderLabel,
            name: configuredOllamaModel,
            label: `${ollamaProviderLabel} ${configuredOllamaModel}`,
            short_label: configuredOllamaModel,
            disabled: !isOllamaEnabled,
          },
        ]
      : [];

    if (!isOllamaEnabled) {
      return { models: fallbackModels, warnings: [] };
    }

    if (!ollamaHost) {
      return { models: fallbackModels, warnings: [] };
    }

    try {
      const response = await fetchWithTimeout(`${ollamaHost}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}.`);
      }

      const data = await response.json();
      const seenModelIds = new Set();
      const models = Array.isArray(data?.models)
        ? data.models
            .map((entry) => {
              const modelName = asOptionalString(entry?.model || entry?.name);
              if (!modelName) {
                return null;
              }

              const modelId = buildQuoteChatModelId("ollama", modelName);
              if (seenModelIds.has(modelId)) {
                return null;
              }
              seenModelIds.add(modelId);

              const displayLabel = asOptionalString(entry?.name) || modelName;
              return {
                id: modelId,
                provider: "ollama",
                provider_label: ollamaProviderLabel,
                name: modelName,
                label: `${ollamaProviderLabel} ${displayLabel}`,
                short_label: displayLabel,
                disabled: false,
              };
            })
            .filter(Boolean)
            .sort((left, right) =>
              String(left?.label || "").localeCompare(
                String(right?.label || ""),
                undefined,
                { sensitivity: "base" },
              ),
            )
        : [];

      const mergedModels = [...models];
      if (
        configuredOllamaModel &&
        !mergedModels.some((model) => model.name === configuredOllamaModel)
      ) {
        mergedModels.unshift(fallbackModels[0]);
      }

      return { models: mergedModels, warnings: [] };
    } catch (error) {
      return {
        models: fallbackModels,
        warnings: [
          {
            provider: "ollama",
            message:
              error instanceof Error
                ? error.message
                : `${ollamaProviderLabel} is unavailable.`,
          },
        ],
      };
    }
  }

  async function listQuoteChatModels() {
    const geminiModels = getGeminiQuoteChatModels();
    const ollamaModelsResult = await fetchOllamaQuoteChatModels();

    return {
      models: [...geminiModels, ...ollamaModelsResult.models],
      default_model: defaultQuoteChatModelId,
      warnings: ollamaModelsResult.warnings,
      providers: getAIProviders(),
    };
  }

  function sortWorksById(works) {
    return [...works].sort((left, right) =>
      String(left?.id || "").localeCompare(String(right?.id || ""), undefined, {
        sensitivity: "base",
      }),
    );
  }

  function pickRandomWorks(works, limit) {
    const shuffled = [...works];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }

    return shuffled.slice(0, limit);
  }

  function parseWorkPayload(rawWork) {
    if (!rawWork || typeof rawWork !== "object") {
      return { error: "Invalid work payload." };
    }

    const id = asNonEmptyString(rawWork.id);
    const title = asNonEmptyString(rawWork.title);
    if (!id) return { error: "Work ID is required." };
    if (!title) return { error: "Work title is required." };

    const pageCountNum = Number(rawWork.page_count ?? 0);
    if (!Number.isFinite(pageCountNum) || pageCountNum < 0) {
      return { error: "page_count must be a non-negative number." };
    }

    const authors =
      rawWork.authors === undefined ? [] : asStringArray(rawWork.authors);
    if (authors === null)
      return { error: "authors must be an array of strings." };

    const tags = rawWork.tags === undefined ? [] : asStringArray(rawWork.tags);
    if (tags === null) return { error: "tags must be an array of strings." };

    if (
      (rawWork.goodreads_id !== undefined &&
        rawWork.goodreads_id !== null &&
        typeof rawWork.goodreads_id !== "string") ||
      (rawWork.dropbox_link !== undefined &&
        rawWork.dropbox_link !== null &&
        typeof rawWork.dropbox_link !== "string") ||
      (rawWork.amazon_asin !== undefined &&
        rawWork.amazon_asin !== null &&
        typeof rawWork.amazon_asin !== "string")
    ) {
      return { error: "Optional work fields must be strings when provided." };
    }

    return {
      work: {
        id,
        title,
        goodreads_id: asOptionalString(rawWork.goodreads_id),
        page_count: Math.floor(pageCountNum),
        dropbox_link: asOptionalString(rawWork.dropbox_link),
        amazon_asin: asOptionalString(rawWork.amazon_asin),
        authors,
        tags,
      },
    };
  }

  function getAccessibleQuote({ quoteId, userId, isAdmin }) {
    return isAdmin
      ? db.prepare("SELECT * FROM work_quotes WHERE id = ?").get(quoteId)
      : db
          .prepare("SELECT * FROM work_quotes WHERE id = ? AND user_id = ?")
          .get(quoteId, userId);
  }

  function getQuoteConversations(quoteId) {
    return db
      .prepare(
        `SELECT id, role, content, created_at, quote_id
         FROM conversations
         WHERE quote_id = ?
         ORDER BY datetime(created_at) ASC, id ASC`,
      )
      .all(quoteId);
  }

  function ensureLegacyExplanationConversation(quoteRow) {
    if (!quoteRow?.id) {
      return [];
    }

    const existingConversations = getQuoteConversations(quoteRow.id);
    const hasUserConversation = existingConversations.some(
      (entry) => entry.role === "user",
    );
    const hasAssistantConversation = existingConversations.some(
      (entry) => entry.role === "assistant",
    );

    if (!existingConversations.length && quoteRow.explanation) {
      db.transaction(() => {
        db.prepare(
          `INSERT INTO conversations (role, content, created_at, quote_id)
           VALUES (?, ?, ?, ?)`,
        ).run("user", quoteRow.quote, quoteRow.created_at, quoteRow.id);
        db.prepare(
          `INSERT INTO conversations (role, content, created_at, quote_id)
           VALUES (?, ?, ?, ?)`,
        ).run(
          "assistant",
          quoteRow.explanation,
          quoteRow.created_at,
          quoteRow.id,
        );
      })();

      return getQuoteConversations(quoteRow.id);
    }

    if (!hasUserConversation && hasAssistantConversation) {
      const createdAt =
        quoteRow.created_at || existingConversations[0]?.created_at;

      db.prepare(
        `INSERT INTO conversations (role, content, created_at, quote_id)
         VALUES (?, ?, ?, ?)`,
      ).run("user", quoteRow.quote, createdAt, quoteRow.id);

      return getQuoteConversations(quoteRow.id);
    }

    return existingConversations;
  }

  function getLatestReplaceableQuoteTurn(conversations) {
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return { userEntry: null, assistantEntry: null, remaining: [] };
    }

    let assistantIndex = -1;
    for (let index = conversations.length - 1; index >= 0; index -= 1) {
      if (conversations[index]?.role === "assistant") {
        assistantIndex = index;
        break;
      }
    }

    let userIndex = -1;
    const searchStart =
      assistantIndex >= 0 ? assistantIndex - 1 : conversations.length - 1;
    for (let index = searchStart; index >= 0; index -= 1) {
      if (conversations[index]?.role === "user") {
        userIndex = index;
        break;
      }
    }

    if (userIndex < 0) {
      return {
        userEntry: null,
        assistantEntry: null,
        remaining: conversations,
      };
    }

    const removableIds = new Set([conversations[userIndex].id]);
    if (assistantIndex > userIndex) {
      removableIds.add(conversations[assistantIndex].id);
    }

    return {
      userEntry: conversations[userIndex],
      assistantEntry:
        assistantIndex > userIndex ? conversations[assistantIndex] : null,
      remaining: conversations.filter((entry) => !removableIds.has(entry.id)),
    };
  }

  function buildQuoteChatSystemInstruction({
    workTitle,
    quoteText,
    tool,
    targetLanguage,
  }) {
    const sharedContext = `You are an insightful literary reading companion helping someone read "${workTitle}".
The canonical quoted passage for this conversation is:
"${quoteText}"

Ground every reply in the quoted passage and the immediate scene around it.
Do not repeat generic plot summaries or broad character bios unless the user explicitly asks.
Keep replies clear, specific, and helpful.`;

    if (tool === "translate") {
      return `${sharedContext}

The user has selected the translate tool.
Translate the latest user message into ${targetLanguage || "English"} with literary sensitivity.
If the latest user message is just the original passage, translate that passage.
Respond with the translated passage first.
If useful, add a separate explanatory note after a line containing exactly "---".
Do not add any headings like "Translator note:" or any preamble before the translation.`;
    }

    if (tool === "analyze") {
      return `${sharedContext}

The user has selected the analyze tool.
Explain the passage's tone, imagery, syntax, subtext, or references with specificity.
If the latest user message is only the passage text, treat it as a request to analyze that passage directly.`;
    }

    return `${sharedContext}

The user is in a running chat about this quote.
Answer conversationally, continue the thread naturally, and stay focused on the text.`;
  }

  async function generateGeminiQuoteChatReply({
    workTitle,
    quoteText,
    conversations,
    userMessage,
    tool,
    modelName,
    targetLanguage,
  }) {
    const history = conversations.map((entry) => ({
      role: entry.role === "assistant" ? "model" : "user",
      parts: [{ text: entry.content }],
    }));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: buildQuoteChatSystemInstruction({
        workTitle,
        quoteText,
        tool,
        targetLanguage,
      }),
    }, { timeout: AI_REQUEST_TIMEOUT_MS });

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(userMessage);

    return String(result.response.text() || "").trim();
  }

  async function generateOllamaQuoteChatReply({
    workTitle,
    quoteText,
    conversations,
    userMessage,
    tool,
    modelName,
    targetLanguage,
  }) {
    const messages = [
      {
        role: "system",
        content: buildQuoteChatSystemInstruction({
          workTitle,
          quoteText,
          tool,
          targetLanguage,
        }),
      },
      ...conversations.map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content,
      })),
      { role: "user", content: userMessage },
    ];

    const response = await fetchWithTimeout(`${ollamaHost}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        stream: false,
      }),
      timeoutMs: AI_REQUEST_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to reach ${ollamaProviderLabel}. (${response.status})`,
      );
    }

    const data = await response.json();
    const assistantContent =
      asOptionalString(data?.message?.content) ||
      asOptionalString(data?.response);

    return String(assistantContent || "").trim();
  }

  async function generateQuoteChatReply({
    workTitle,
    quoteText,
    conversations,
    userMessage,
    tool,
    model,
    targetLanguage,
  }) {
    if (model.provider === "ollama") {
      return generateOllamaQuoteChatReply({
        workTitle,
        quoteText,
        conversations,
        userMessage,
        tool,
        modelName: model.name,
        targetLanguage,
      });
    }

    return generateGeminiQuoteChatReply({
      workTitle,
      quoteText,
      conversations,
      userMessage,
      tool,
      modelName: model.name,
      targetLanguage,
    });
  }

  router.get("/api/explore", authenticateToken, (req, res) => {
    try {
      const works = db
        .prepare("SELECT * FROM works")
        .all()
        .map((row) => workService.getWorkWithRelations(row, req.user?.id))
        .map(workService.processWork);
      const isAdmin = req.user?.role === "admin";
      const worksWithCover = [];
      const worksWithoutCover = [];

      works.forEach((work) => {
        if (work.cover_img_url) {
          worksWithCover.push(work);
          return;
        }

        worksWithoutCover.push(work);
      });

      const showcaseCandidates = worksWithCover.filter(
        (work) => Object.keys(work.files || {}).length > 0,
      );

      res.json({
        showcase: pickRandomWorks(showcaseCandidates, 8),
        catalogue: {
          with_cover: sortWorksById(worksWithCover),
          without_cover: isAdmin ? sortWorksById(worksWithoutCover) : [],
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate explore feed" });
    }
  });

  router.get("/api/search", authenticateToken, (req, res) => {
    try {
      const term = `%${(req.query.q || "").trim()}%`;
      if (term === "%%") return res.json({ results: [] });

      const works = db
        .prepare(
          `
      SELECT DISTINCT works.* FROM works
      LEFT JOIN work_tags ON works.id = work_tags.work_id
      LEFT JOIN tags ON work_tags.tag_id = tags.id
      LEFT JOIN work_authors ON works.id = work_authors.work_id
      LEFT JOIN authors ON work_authors.author_id = authors.id
      WHERE works.id LIKE ? COLLATE NOCASE
         OR works.title LIKE ? COLLATE NOCASE
         OR tags.name LIKE ? COLLATE NOCASE
         OR REPLACE(REPLACE(tags.name, 'genre:', ''), '-', ' ') LIKE ? COLLATE NOCASE
         OR authors.name LIKE ? COLLATE NOCASE
      ORDER BY works.id ASC LIMIT 100
    `,
        )
        .all(term, term, term, term, term)
        .map((row) => workService.getWorkWithRelations(row, req.user?.id))
        .map(workService.processWork);

      res.json({ results: works });
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  router.get("/api/collection/:keyword", authenticateToken, (req, res) => {
    try {
      const keyword = req.params.keyword;
      const authorRow = db
        .prepare("SELECT * FROM authors WHERE name = ?")
        .get(keyword);

      let matchedRows = [];
      let profile = null;

      if (authorRow) {
        profile = workService.processAuthor(
          workService.getAuthorWithRelations(authorRow, req.user?.id),
        );
        matchedRows = db
          .prepare(
            `
        SELECT works.*
        FROM works
        JOIN work_authors ON works.id = work_authors.work_id
        WHERE work_authors.author_id = ?
      `,
          )
          .all(authorRow.id);
      } else {
        matchedRows = db
          .prepare(
            `
        SELECT works.* FROM works JOIN work_tags ON works.id = work_tags.work_id JOIN tags ON work_tags.tag_id = tags.id WHERE tags.name = ?
      `,
          )
          .all(keyword);
      }

      res.json({
        works: matchedRows
          .map((row) => workService.getWorkWithRelations(row, req.user?.id))
          .map(workService.processWork),
        profile,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to load collection" });
    }
  });

  router.get("/api/works", authenticateToken, (req, res) => {
    try {
      res.json(
        db
          .prepare("SELECT * FROM works")
          .all()
          .map((row) => workService.getWorkWithRelations(row, req.user?.id))
          .map(workService.processWork),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load works" });
    }
  });

  router.get("/api/works/:id", authenticateToken, (req, res) => {
    try {
      const workRow = db
        .prepare("SELECT * FROM works WHERE id = ?")
        .get(req.params.id);
      if (!workRow) return res.status(404).json({ error: "Work not found" });

      res.json(
        workService.processWork(
          workService.getWorkWithRelations(workRow, req.user?.id),
        ),
      );
    } catch (error) {
      res.status(500).json({ error: "Failed to load work" });
    }
  });

  router.post("/api/works", authenticateToken, requireAdmin, (req, res) => {
    try {
      const parsed = parseWorkPayload(req.body);
      if (parsed.error) return jsonError(res, 400, parsed.error);
      const work = parsed.work;

      db.transaction(() => {
        db.prepare(
          `
        INSERT INTO works (id, title, goodreads_id, page_count, dropbox_link, amazon_asin)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        ).run(
          work.id,
          work.title,
          work.goodreads_id || null,
          work.page_count,
          work.dropbox_link || null,
          work.amazon_asin || null,
        );

        workService.syncAuthors(work.id, work.authors);
        workService.syncTags(work.id, work.tags, "work_tags", "work_id");
      })();
      workService.refreshWorkFileCache();
      res.json({ success: true });
    } catch (error) {
      jsonError(res, 500, "Failed to add work");
    }
  });

  router.post(
    "/api/works/rescan",
    authenticateToken,
    requireAdmin,
    (_req, res) => {
      try {
        const stats = workService.refreshWorkFileCache();
        res.json({ success: true, ...stats });
      } catch (error) {
        console.error("Failed to rescan work files:", error);
        jsonError(res, 500, "Failed to rescan work files.");
      }
    },
  );

  router.put("/api/works/:id", authenticateToken, requireAdmin, (req, res) => {
    try {
      const id = req.params.id;
      const parsed = parseWorkPayload(req.body);
      if (parsed.error) return jsonError(res, 400, parsed.error);
      const work = parsed.work;
      const existingWork = db
        .prepare("SELECT * FROM works WHERE id = ?")
        .get(id);
      if (!existingWork) {
        return jsonError(res, 404, "Work not found");
      }
      const wasAvailable = workService.isWorkAvailable(existingWork);

      const executeWorkUpdate = () => {
        if (work.id !== id) {
          db.prepare(
            `UPDATE works SET id = ?, title = ?, goodreads_id = ?, page_count = ?, dropbox_link = ?, amazon_asin = ? WHERE id = ?`,
          ).run(
            work.id,
            work.title || null,
            work.goodreads_id || null,
            work.page_count,
            work.dropbox_link || null,
            work.amazon_asin || null,
            id,
          );

          db.prepare(
            "UPDATE work_authors SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
          db.prepare("UPDATE work_tags SET work_id = ? WHERE work_id = ?").run(
            work.id,
            id,
          );
          db.prepare(
            "UPDATE work_quotes SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
          db.prepare(
            "UPDATE user_reading_activities SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
          db.prepare(
            "UPDATE user_work_interactions SET work_id = ? WHERE work_id = ?",
          ).run(work.id, id);
        } else {
          db.prepare(
            `UPDATE works SET title = ?, goodreads_id = ?, page_count = ?, dropbox_link = ?, amazon_asin = ? WHERE id = ?`,
          ).run(
            work.title || null,
            work.goodreads_id || null,
            work.page_count,
            work.dropbox_link || null,
            work.amazon_asin || null,
            id,
          );
        }

        workService.syncAuthors(work.id, work.authors);
        workService.syncTags(work.id, work.tags, "work_tags", "work_id");
      };

      if (work.id !== id) {
        db.prepare("PRAGMA foreign_keys=OFF;").run();
        try {
          db.transaction(executeWorkUpdate)();
        } finally {
          db.prepare("PRAGMA foreign_keys=ON;").run();
        }
      } else {
        db.transaction(executeWorkUpdate)();
      }

      workService.refreshWorkFileCache();
      inboxService.notifyWorkAvailabilityIfNeeded(work.id, wasAvailable);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      jsonError(res, 500, "Failed to update work");
    }
  });

  router.post(
    "/api/works/:id/dropbox-link",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const workId = req.params.id;
        const link = asOptionalString(req.body?.link);
        if (!link) {
          return jsonError(res, 400, "Dropbox link is required.");
        }

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        const wasAvailable = workService.isWorkAvailable(workRow);

        db.prepare("UPDATE works SET dropbox_link = ? WHERE id = ?").run(
          link,
          workId,
        );

        inboxService.notifyWorkAvailabilityIfNeeded(workId, wasAvailable);

        res.json({ success: true, dropbox_link: link });
      } catch (error) {
        console.error("Failed to save Dropbox link:", error);
        jsonError(res, 500, "Failed to save Dropbox link.");
      }
    },
  );

  router.put(
    "/api/works/:id/goodreads-id",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const workId = req.params.id;
        const goodreadsId = asNonEmptyString(req.body?.goodreads_id);
        if (!goodreadsId) {
          return jsonError(res, 400, "goodreads_id is required.");
        }

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        db.prepare("UPDATE works SET goodreads_id = ? WHERE id = ?").run(
          goodreadsId,
          workId,
        );

        res.json({ success: true, goodreads_id: goodreadsId });
      } catch (error) {
        console.error("Failed to save Goodreads ID:", error);
        jsonError(res, 500, "Failed to save Goodreads ID.");
      }
    },
  );

  router.post(
    "/api/works/:id/cover",
    authenticateToken,
    requireAdmin,
    workCoverUpload.single("file"),
    (req, res) => {
      try {
        const workId = req.params.id;

        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        if (!req.file) {
          return jsonError(res, 400, "A PNG cover image is required.");
        }

        const fileUrl = `/imgs/covers/${req.file.filename}`;
        res.json({ success: true, url: fileUrl });
      } catch (error) {
        console.error("Failed to upload work cover:", error);
        jsonError(res, 500, "Failed to upload cover.");
      }
    },
  );

  router.post(
    "/api/works/:id/files",
    authenticateToken,
    requireAdmin,
    workFileUpload.single("file"),
    (req, res) => {
      try {
        const workId = req.params.id;

        const workRow = db
          .prepare("SELECT * FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        if (!req.file) {
          return jsonError(res, 400, "File is required.");
        }

        workService.refreshWorkFileCache();
        const hadOtherFiles = workService
          .getWorkFileNames(workId)
          .some((filename) => filename !== req.file.filename);
        const wasAvailable = Boolean(workRow.dropbox_link) || hadOtherFiles;

        const fileUrl = `/files/${req.file.filename}`;
        inboxService.notifyWorkAvailabilityIfNeeded(workId, wasAvailable);
        res.json({ success: true, url: fileUrl });
      } catch (error) {
        console.error("Failed to upload work file:", error);
        jsonError(res, 500, "Failed to upload file.");
      }
    },
  );

  router.post(
    "/api/works/bulk-import",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const works = req.body;
        if (!Array.isArray(works))
          return jsonError(res, 400, "Expected an array");

        const parsedWorks = [];
        for (const rawWork of works) {
          const parsed = parseWorkPayload(rawWork);
          if (parsed.error) return jsonError(res, 400, parsed.error);
          parsedWorks.push(parsed.work);
        }

        db.transaction(() => {
          for (const work of parsedWorks) {
            if (!db.prepare("SELECT id FROM works WHERE id = ?").get(work.id)) {
              db.prepare(
                "INSERT INTO works (id, title, goodreads_id, page_count) VALUES (?, ?, ?, ?)",
              ).run(
                work.id,
                work.title,
                work.goodreads_id || null,
                work.page_count,
              );
            } else {
              db.prepare(
                "UPDATE works SET title = ?, goodreads_id = ?, page_count = ? WHERE id = ?",
              ).run(
                work.title || null,
                work.goodreads_id || null,
                work.page_count,
                work.id,
              );
            }
            workService.syncAuthors(work.id, work.authors);
            workService.syncTags(work.id, work.tags, "work_tags", "work_id");
          }
        })();
        workService.refreshWorkFileCache();
        res.json({
          success: true,
          message: `Imported ${parsedWorks.length} works successfully`,
        });
      } catch (error) {
        console.error(error);
        jsonError(res, 500, "Failed to bulk import works");
      }
    },
  );

  router.post(
    "/api/works/bulk-tags",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const { workIds, tags } = req.body;
        const normalizedWorkIds = asStringArray(workIds);
        const normalizedTags = asStringArray(tags);
        if (
          !normalizedWorkIds ||
          !normalizedTags ||
          !normalizedWorkIds.length ||
          !normalizedTags.length
        ) {
          return jsonError(res, 400, "Invalid payload.");
        }

        db.transaction(() => {
          for (const workId of normalizedWorkIds) {
            if (db.prepare("SELECT id FROM works WHERE id = ?").get(workId)) {
              for (const tag of normalizedTags) {
                db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(
                  tag,
                );
                const tagId = db
                  .prepare("SELECT id FROM tags WHERE name = ?")
                  .get(tag).id;
                db.prepare(
                  "INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)",
                ).run(workId, tagId);
              }
            }
          }
        })();
        res.json({ success: true });
      } catch (error) {
        jsonError(res, 500, "Failed to bulk update tags.");
      }
    },
  );

  router.post("/api/works/:id", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id;
      const { action, value } = req.body;

      if (!["read", "liked", "shelved", "rating"].includes(action)) {
        return jsonError(res, 400, "Invalid action");
      }
      let safeValue = value;
      if (action === "rating") {
        const numericValue = Number(value);
        if (
          !Number.isInteger(numericValue) ||
          numericValue < 0 ||
          numericValue > 10
        ) {
          return jsonError(
            res,
            400,
            "rating must be an integer between 0 and 10.",
          );
        }
        safeValue = numericValue;
      } else {
        if (typeof value !== "boolean") {
          return jsonError(res, 400, `${action} must be a boolean.`);
        }
        safeValue = value ? 1 : 0;
      }

      db.prepare(
        `
      INSERT INTO user_work_interactions (user_id, work_id, ${action})
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, work_id) DO UPDATE SET ${action} = excluded.${action}
    `,
      ).run(userId, workId, safeValue);

      if (action === "shelved") {
        inboxService.syncAvailabilityAlert(userId, workId, Boolean(safeValue));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Interaction error:", error);
      jsonError(res, 500, "Failed to update interaction");
    }
  });

  router.post(
    "/api/works/:id/report-file-issue",
    authenticateToken,
    (req, res) => {
      try {
        const workId = req.params.id;
        const workRow = db
          .prepare("SELECT id FROM works WHERE id = ?")
          .get(workId);
        if (!workRow) {
          return jsonError(res, 404, "Work not found.");
        }

        const issueType = asOptionalString(req.body?.issue_type);
        const normalizedIssueType =
          issueType === "other_issue"
            ? "other_issue"
            : "blank_or_missing_pages";
        const details = asOptionalString(req.body?.details);
        const pageNumber =
          normalizedIssueType === "blank_or_missing_pages"
            ? Number(req.body?.page_number)
            : null;

        if (
          normalizedIssueType === "blank_or_missing_pages" &&
          (!Number.isInteger(pageNumber) || pageNumber <= 0)
        ) {
          return jsonError(res, 400, "A valid PDF page number is required.");
        }

        if (normalizedIssueType === "other_issue" && !details) {
          return jsonError(res, 400, "Please describe the issue.");
        }

        const result = inboxService.notifyAdminsOfWorkFileIssue({
          workId,
          reporterUserId: req.user.id,
          reporterUsername: req.user.username,
          issueType: normalizedIssueType,
          pageNumber,
          details,
        });

        res.json({
          success: true,
          notified_admins: result.created,
        });
      } catch (error) {
        if (error?.statusCode) {
          return jsonError(res, error.statusCode, error.message);
        }
        console.error("Failed to report work file issue:", error);
        return jsonError(res, 500, "Failed to report PDF issue.");
      }
    },
  );

  router.delete(
    "/api/works/:id",
    authenticateToken,
    requireAdmin,
    (req, res) => {
      try {
        const id = req.params.id;
        db.transaction(() => {
          db.prepare("DELETE FROM work_authors WHERE work_id = ?").run(id);
          db.prepare("DELETE FROM work_tags WHERE work_id = ?").run(id);
          db.prepare("DELETE FROM work_quotes WHERE work_id = ?").run(id);
          db.prepare(
            "DELETE FROM user_reading_activities WHERE work_id = ?",
          ).run(id);
          db.prepare("DELETE FROM works WHERE id = ?").run(id);
        })();
        workService.refreshWorkFileCache();
        res.json({ success: true });
      } catch (error) {
        jsonError(res, 500, "Failed to delete work");
      }
    },
  );

  router.post("/api/works/:id/quotes", authenticateToken, (req, res) => {
    try {
      const { quote: rawQuote, page_number, explanation } = req.body;
      const workId = req.params.id;
      const userId = req.user.id;
      const quote = typeof rawQuote === "string" ? rawQuote.trim() : "";
      const pageNumber = workService.normalizePageNumber(req.body.pageNumber);
      const hasExplicitPageNumber =
        req.body.pageNumber !== undefined &&
        req.body.pageNumber !== null &&
        `${req.body.pageNumber}`.trim() !== "";

      if (!quote) {
        return jsonError(res, 400, "Quote text is required.");
      }
      if (hasExplicitPageNumber && pageNumber === null) {
        return jsonError(res, 400, "pageNumber must be a positive integer.");
      }

      // Update the INSERT statement
      const result = db
        .prepare(
          "INSERT INTO work_quotes (work_id, user_id, quote, page_number, explanation) VALUES (?, ?, ?, ?, ?)",
        )
        .run(workId, userId, quote, pageNumber, explanation || null);

      const savedQuote = db
        .prepare("SELECT * FROM work_quotes WHERE id = ?")
        .get(result.lastInsertRowid);

      res.json({ success: true, quote: savedQuote });
    } catch (error) {
      console.error("Failed to add quote:", error);
      res
        .status(error.statusCode || 500)
        .json({ error: error.message || "Failed to add quote" });
    }
  });

  router.post("/api/works/:id/progress", authenticateToken, (req, res) => {
    try {
      const result = workService.recordReadingActivity(
        req.params.id,
        req.user.id,
        workService.normalizePageNumber(req.body.pageNumber),
        req.body.note || "",
      );
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Failed to save progress:", error);
      res.status(error.statusCode || 500).json({
        error: error.message || "Failed to save progress update",
      });
    }
  });

  router.post(
    "/api/works/:id/progress/finish",
    authenticateToken,
    (req, res) => {
      try {
        const result = workService.recordReadingActivity(
          req.params.id,
          req.user.id,
          null,
          req.body.note || "",
          { markFinished: true },
        );
        res.json({ success: true, ...result });
      } catch (error) {
        console.error("Failed to finish work:", error);
        res.status(error.statusCode || 500).json({
          error: error.message || "Failed to finish work",
        });
      }
    },
  );

  router.put("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      const quote = asOptionalString(req.body?.quote);
      const explanation = asOptionalString(req.body?.explanation);
      const pageNumberRaw = req.body?.pageNumber;
      const pageNumber =
        pageNumberRaw === null ||
        pageNumberRaw === undefined ||
        `${pageNumberRaw}`.trim() === ""
          ? null
          : workService.normalizePageNumber(pageNumberRaw);
      const userId = req.user.id;
      const quoteId = req.params.id;
      if (!quote) return jsonError(res, 400, "Quote text is required.");
      if (
        pageNumberRaw !== undefined &&
        pageNumberRaw !== null &&
        pageNumber === null
      ) {
        return jsonError(res, 400, "pageNumber must be a positive integer.");
      }

      const isAdmin = req.user.role === "admin";
      const result = isAdmin
        ? db
            .prepare(
              "UPDATE work_quotes SET quote = ?, page_number = ?, explanation = ? WHERE id = ?",
            )
            .run(quote, pageNumber, explanation || null, quoteId)
        : db
            .prepare(
              "UPDATE work_quotes SET quote = ?, page_number = ?, explanation = ? WHERE id = ? AND user_id = ?",
            )
            .run(quote, pageNumber, explanation || null, quoteId, userId);

      if (result.changes === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or quote not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update quote" });
    }
  });

  router.delete("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      const userId = req.user.id;
      const quoteId = req.params.id;
      const isAdmin = req.user.role === "admin";

      const result = isAdmin
        ? db.prepare("DELETE FROM work_quotes WHERE id = ?").run(quoteId)
        : db
            .prepare("DELETE FROM work_quotes WHERE id = ? AND user_id = ?")
            .run(quoteId, userId);

      if (result.changes === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or quote not found" });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete quote" });
    }
  });

  router.get("/api/quotes/:id/chat", authenticateToken, (req, res) => {
    try {
      const quoteId = Number(req.params.id);
      const quote = getAccessibleQuote({
        quoteId,
        userId: req.user.id,
        isAdmin: req.user.role === "admin",
      });

      if (!quote) {
        return jsonError(res, 404, "Quote not found.");
      }

      const conversations = ensureLegacyExplanationConversation(quote);
      res.json({ success: true, quote, conversations });
    } catch (error) {
      console.error("Failed to load quote chat:", error);
      res.status(500).json({ error: "Failed to load quote chat." });
    }
  });

  router.delete("/api/quotes/:id/chat", authenticateToken, (req, res) => {
    try {
      const quoteId = Number(req.params.id);
      const quote = getAccessibleQuote({
        quoteId,
        userId: req.user.id,
        isAdmin: req.user.role === "admin",
      });

      if (!quote) {
        return jsonError(res, 404, "Quote not found.");
      }

      db.prepare("DELETE FROM conversations WHERE quote_id = ?").run(quoteId);
      db.prepare("UPDATE work_quotes SET explanation = NULL WHERE id = ?").run(
        quoteId,
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to clear quote chat:", error);
      res.status(500).json({ error: "Failed to clear quote chat." });
    }
  });

  router.get("/api/quote-chat/models", authenticateToken, async (_req, res) => {
    try {
      const modelCatalog = await listQuoteChatModels();
      res.json({ success: true, ...modelCatalog });
    } catch (error) {
      console.error("Failed to load quote chat models:", error);
      res.status(500).json({ error: "Failed to load quote chat models." });
    }
  });

  router.post(
    "/api/works/:id/quotes/chat",
    authenticateToken,
    async (req, res) => {
      try {
        const workId = req.params.id;
        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";
        const quoteIdRaw = req.body?.quoteId;
        const quoteId = quoteIdRaw ? Number(quoteIdRaw) : null;
        const quoteText = asOptionalString(req.body?.quote);
        const message = asOptionalString(req.body?.message);
        const tool = asOptionalString(req.body?.tool) || "chat";
        const requestedModelId =
          asOptionalString(req.body?.model) || defaultQuoteChatModelId;
        const model = parseRequestedQuoteChatModel(requestedModelId);
        const targetLanguage =
          asOptionalString(req.body?.targetLanguage) || "English";
        const replaceLatestTurn = req.body?.replaceLatestTurn === true;
        const pageNumberRaw = req.body?.pageNumber;
        const pageNumber =
          pageNumberRaw === null ||
          pageNumberRaw === undefined ||
          `${pageNumberRaw}`.trim() === ""
            ? null
            : workService.normalizePageNumber(pageNumberRaw);
        const hasExplicitPageNumber =
          pageNumberRaw !== undefined &&
          pageNumberRaw !== null &&
          `${pageNumberRaw}`.trim() !== "";

        if (!supportedQuoteChatTools.has(tool)) {
          return jsonError(res, 400, "Invalid chat tool.");
        }
        if (!model) {
          return jsonError(res, 400, "Invalid chat model.");
        }
        if (quoteIdRaw !== undefined && quoteIdRaw !== null && !quoteId) {
          return jsonError(res, 400, "Invalid quoteId.");
        }
        if (hasExplicitPageNumber && pageNumber === null) {
          return jsonError(res, 400, "pageNumber must be a positive integer.");
        }

        const work = db
          .prepare("SELECT id, title FROM works WHERE id = ?")
          .get(workId);
        if (!work) {
          return jsonError(res, 404, "Work not found.");
        }

        let quote = quoteId
          ? getAccessibleQuote({ quoteId, userId, isAdmin })
          : null;

        if (quote && quote.work_id !== workId) {
          return jsonError(res, 400, "Quote does not belong to this work.");
        }

        if (!quote && !quoteText) {
          return jsonError(res, 400, "Quote text is required.");
        }
        if (replaceLatestTurn && !quote?.id) {
          return jsonError(
            res,
            400,
            "A saved quote is required to replace the latest turn.",
          );
        }

        const userMessage = message || quoteText;
        if (!userMessage) {
          return jsonError(res, 400, "Message is required.");
        }

        if (!quote) {
          const insertResult = db
            .prepare(
              `INSERT INTO work_quotes (work_id, user_id, quote, page_number, explanation)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(workId, userId, quoteText, pageNumber, null);
          quote = db
            .prepare("SELECT * FROM work_quotes WHERE id = ?")
            .get(insertResult.lastInsertRowid);
        }

        const existingConversations =
          ensureLegacyExplanationConversation(quote);
        const latestTurn = replaceLatestTurn
          ? getLatestReplaceableQuoteTurn(existingConversations)
          : null;

        if (replaceLatestTurn && !latestTurn?.userEntry) {
          return jsonError(
            res,
            400,
            "There is no recent user turn to replace.",
          );
        }

        const promptHistory =
          replaceLatestTurn && latestTurn
            ? latestTurn.remaining
            : existingConversations;
        const assistantContent = await generateQuoteChatReply({
          workTitle: work.title,
          quoteText: quote.quote,
          conversations: promptHistory,
          userMessage,
          tool,
          model,
          targetLanguage,
        });

        if (!assistantContent) {
          return jsonError(res, 502, "The model returned an empty reply.");
        }

        const persistEntries = db.transaction(() => {
          const insertConversation = db.prepare(
            `INSERT INTO conversations (role, content, quote_id)
             VALUES (?, ?, ?)`,
          );

          if (replaceLatestTurn && latestTurn?.userEntry?.id) {
            const removableIds = [latestTurn.userEntry.id];
            if (latestTurn.assistantEntry?.id) {
              removableIds.push(latestTurn.assistantEntry.id);
            }

            const placeholders = removableIds.map(() => "?").join(", ");
            db.prepare(
              `DELETE FROM conversations
               WHERE quote_id = ? AND id IN (${placeholders})`,
            ).run(quote.id, ...removableIds);

            if (
              quote.explanation &&
              latestTurn.assistantEntry?.content === quote.explanation
            ) {
              db.prepare(
                "UPDATE work_quotes SET explanation = NULL WHERE id = ?",
              ).run(quote.id);
            }
          }

          const userResult = insertConversation.run(
            "user",
            userMessage,
            quote.id,
          );
          const assistantResult = insertConversation.run(
            "assistant",
            assistantContent,
            quote.id,
          );

          if (tool === "analyze") {
            db.prepare(
              "UPDATE work_quotes SET explanation = ? WHERE id = ?",
            ).run(assistantContent, quote.id);
          }

          return db
            .prepare(
              `SELECT id, role, content, created_at, quote_id
               FROM conversations
               WHERE id IN (?, ?)
               ORDER BY id ASC`,
            )
            .all(userResult.lastInsertRowid, assistantResult.lastInsertRowid);
        });

        const entries = persistEntries();
        const freshQuote = db
          .prepare("SELECT * FROM work_quotes WHERE id = ?")
          .get(quote.id);

        res.json({
          success: true,
          quote: freshQuote,
          conversations: entries,
          model: model.id,
          tool,
        });
      } catch (error) {
        console.error("Quote chat failed:", error);
        res.status(500).json({ error: "Failed to continue quote chat." });
      }
    },
  );

  // ============================================================================
  // DOMAIN: VOCABULARIES
  // ============================================================================

  // ============================================================================
  // DOMAIN: CONTEXT LOOKUP
  // ============================================================================
  router.post(
    "/api/works/:id/quotes/translate",
    authenticateToken,
    async (req, res) => {
      try {
        const workId = req.params.id;
        const userId = req.user.id;
        const text = asNonEmptyString(req.body?.text);
        const targetLanguage =
          asOptionalString(req.body?.targetLanguage) || "modern English";

        if (!text) return res.status(400).json({ error: "Text is required" });

        const work = db
          .prepare("SELECT title FROM works WHERE id = ?")
          .get(workId);
        if (!work) return res.status(404).json({ error: "Work not found" });

        const pastQuotes = db
          .prepare(
            `
            SELECT quote, explanation
            FROM work_quotes
            WHERE user_id = ? AND work_id = ?
            ORDER BY created_at DESC
            LIMIT 4
          `,
          )
          .all(userId, workId)
          .reverse();

        const chatHistory = pastQuotes.flatMap((row) => [
          {
            role: "user",
            parts: [{ text: `Context passage: "${row.quote}"` }],
          },
          {
            role: "model",
            parts: [
              {
                text: row.explanation
                  ? `Noted. This passage sits in the reading context as: ${row.explanation}`
                  : "Noted. I will retain this as nearby reading context.",
              },
            ],
          },
        ]);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" },
          systemInstruction: `You are an expert literary translator and cultural historian. The user is currently reading the book "${work.title}".
              They will provide a passage, phrase, or idiom that they need translated into ${targetLanguage}.

              Your tasks:
              1. Identify the original language of the passage.
              2. Provide a highly accurate, beautifully written literary translation in ${targetLanguage}.
              3. Explain difficult idioms, historical references, or unusual syntax in "translator_note" when needed.
              4. If the text is archaic English and the target language is English, translate it into modern, readable English.

              CRITICAL RULE: You are part of a continuous reading session. Use the provided recent quote context only to understand the immediate scene and tone.

              You must respond with only a valid JSON object matching this schema:
              {
                "detected_language": "The language of the original text",
                "original_text": "The perfectly formatted original text.",
                "translation": "Your literary translation in ${targetLanguage}.",
                "translator_note": "Helpful context in ${targetLanguage}, or null if the passage is straightforward."
              }`,
        }, { timeout: AI_REQUEST_TIMEOUT_MS });

        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(
          `Translate this passage: "${text}"`,
        );
        const responseText = result.response.text();

        try {
          const data = JSON.parse(responseText);
          return res.json({ success: true, result: data });
        } catch (parseError) {
          console.error("Gemini Translation JSON Error:", responseText);
          return res
            .status(500)
            .json({ error: "Failed to parse translation." });
        }
      } catch (error) {
        console.error("Translation Error:", error);
        res.status(500).json({ error: "Failed to translate passage." });
      }
    },
  );

  router.post(
    "/api/works/:id/context/lookup",
    authenticateToken,
    async (req, res) => {
      try {
        const workId = req.params.id;
        const { word } = req.body;
        const rawProvider =
          asOptionalString(req.body?.provider) ||
          asOptionalString(req.body?.mode) ||
          "gemini";
        const provider =
          rawProvider === "context"
            ? "gemini"
            : rawProvider === "word"
              ? "ollama"
              : rawProvider;

        if (!word) return res.status(400).json({ error: "Word is required" });
        if (!["gemini", "ollama"].includes(provider)) {
          return res.status(400).json({ error: "Invalid lookup provider." });
        }

        const work = db
          .prepare("SELECT title FROM works WHERE id = ?")
          .get(workId);
        if (!work) return res.status(404).json({ error: "Work not found" });

        const lookup = await lookupContext({
          word,
          workTitle: work.title,
          provider,
          apiKey: process.env.GEMINI_API_KEY,
        });

        return res.json({
          success: true,
          provider,
          result: lookup.result,
        });
      } catch (error) {
        console.error("Context lookup failed:", error);

        if (error instanceof LookupError) {
          return res.status(error.status).json({ error: error.message });
        }

        res.status(500).json({
          error: "Failed to look up the selected term.",
        });
      }
    },
  );

  router.post(
    "/api/works/:id/quotes/analyze",
    authenticateToken,
    async (req, res) => {
      try {
        const workId = req.params.id;
        const userId = req.user.id;
        const { text } = req.body;

        if (!text) return res.status(400).json({ error: "Text is required" });

        const work = db
          .prepare("SELECT title FROM works WHERE id = ?")
          .get(workId);
        if (!work) return res.status(404).json({ error: "Work not found" });

        const pastQuotes = db
          .prepare(
            `
            SELECT quote, explanation
            FROM work_quotes
            WHERE user_id = ? AND work_id = ? AND explanation IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 3
          `,
          )
          .all(userId, workId)
          .reverse();

        const chatHistory = pastQuotes.flatMap((row) => [
          {
            role: "user",
            parts: [{ text: `Analyze this passage: "${row.quote}"` }],
          },
          {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  cleaned_quote: row.quote,
                  explanation: row.explanation,
                }),
              },
            ],
          },
        ]);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" },
          systemInstruction: `You are an expert literary analyst helping a user read "${work.title}".
              Task 1: Clean up the user's copied PDF text (fix broken line breaks and hyphenations) without changing the author's words.
              Task 2: Provide an insightful explanation of the passage.

              CRITICAL RULE: You are in a continuous session. DO NOT repeat the overarching themes, basic plot summaries, or general character bios of the book. Assume the user already knows the premise. Focus strictly on the unique subtext, metaphors, and specific word choices of the immediate passage provided.

              Always output valid JSON matching this schema:
              {
                "cleaned_quote": "The perfectly formatted original text.",
                "explanation": "Your highly specific, non-repetitive analysis here."
              }`,
        }, { timeout: AI_REQUEST_TIMEOUT_MS });

        const chat = model.startChat({
          history: chatHistory,
        });

        const result = await chat.sendMessage(
          `Analyze this passage: "${text}"`,
        );
        const responseText = result.response.text();

        try {
          const data = JSON.parse(responseText);
          res.json({ success: true, result: data });
        } catch (parseError) {
          console.error("Gemini Explanation JSON Error:", responseText);
          res.status(500).json({ error: "Failed to parse explanation." });
        }
      } catch (error) {
        console.error("Explain Passage Error:", error);
        res.status(500).json({ error: "Failed to analyze passage." });
      }
    },
  );

  // 1. GET all vocabularies for a specific work (Community + Personal)
  router.get("/api/works/:id/vocabularies", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;

      const vocabs = db
        .prepare(
          `
          SELECT v.*, u.username, u.avatar_url
          FROM vocabularies v
          JOIN users u ON v.user_id = u.id
          WHERE v.work_id = ?
          ORDER BY v.created_at DESC
        `,
        )
        .all(workId);

      // Parse the JSON string back into an object before sending to React
      const parsedVocabs = vocabs.map((v) => ({
        ...v,
        word_data: v.word_data ? JSON.parse(v.word_data) : null,
      }));

      res.json({ vocabularies: parsedVocabs });
    } catch (error) {
      console.error("Failed to fetch vocabularies:", error);
      res.status(500).json({ error: "Failed to fetch vocabularies" });
    }
  });

  // 2. POST (Save) a new vocabulary word
  router.post("/api/works/:id/vocabularies", authenticateToken, (req, res) => {
    try {
      const workId = req.params.id;
      const userId = req.user.id;
      const { word, word_data } = req.body;

      if (!word) return res.status(400).json({ error: "Word is required" });

      const wordDataStr =
        typeof word_data === "object" ? JSON.stringify(word_data) : word_data;

      // ON CONFLICT DO UPDATE allows a user to "overwrite" or re-save a word without crashing
      db.prepare(
        `
          INSERT INTO vocabularies (user_id, work_id, word, word_data)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, work_id, word) DO UPDATE SET word_data = excluded.word_data
        `,
      ).run(userId, workId, word.toLowerCase(), wordDataStr);

      // Fetch the full record back out to return to the frontend
      const savedVocab = db
        .prepare(
          `
          SELECT v.*, u.username, u.avatar_url
          FROM vocabularies v
          JOIN users u ON v.user_id = u.id
          WHERE v.user_id = ? AND v.work_id = ? AND v.word = ?
        `,
        )
        .get(userId, workId, word.toLowerCase());

      savedVocab.word_data = JSON.parse(savedVocab.word_data);

      res.json({ success: true, vocabulary: savedVocab });
    } catch (error) {
      console.error("Failed to save vocabulary:", error);
      res.status(500).json({ error: "Failed to save vocabulary" });
    }
  });

  // 3. DELETE a vocabulary word
  router.delete(
    "/api/works/:workId/vocabularies/:wordId",
    authenticateToken,
    (req, res) => {
      try {
        const { wordId } = req.params;
        const userId = req.user.id;

        const result = db
          .prepare("DELETE FROM vocabularies WHERE id = ? AND user_id = ?")
          .run(wordId, userId);

        if (result.changes === 0) {
          return res
            .status(403)
            .json({ error: "Unauthorized or word not found" });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Failed to delete vocabulary:", error);
        res.status(500).json({ error: "Failed to delete vocabulary" });
      }
    },
  );

  return router;
}

module.exports = { createWorksRouter };

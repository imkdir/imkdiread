const { GoogleGenerativeAI } = require("@google/generative-ai");
const { authenticateToken } = require("../middleware/auth");
const { jsonError } = require("../utils/errorHelpers");
const { fetchWithTimeout } = require("../utils/fetchWithTimeout");
const { asOptionalString } = require("../utils/validators");

function registerWorkQuoteRoutes({ router, db, workService }) {
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
  CRITICAL RULES FOR TRANSLATION:
  1. Translate the latest user message into ${targetLanguage || "English"} with literary sensitivity.
  2. COMMAND OVERRIDE: If the user's message is a short command like "Translate again", "Try again", "Another version", or "Explain", DO NOT translate the command itself. Instead, treat it as an instruction to provide a new/alternate translation of the canonical quoted passage.
  3. If the latest user message is just the original passage, translate that passage.
  4. Respond with the translated text first.
  5. If useful, add a separate explanatory note after a line containing exactly "---".
  6. Do not add any headings like "Translator note:" or any preamble before the translation.`;
    }

    if (tool === "analyze") {
      return `${sharedContext}

  The user has selected the analyze tool.
  Explain the passage's tone, imagery, syntax, subtext, or references with specificity.
  If the latest user message is only the passage text, treat it as a request to analyze that passage directly.

  CRITICAL RULE FOR MISSING CONTEXT & CORRECTIONS:
  1. If the text is too short, vague, or ambiguous to analyze accurately, do not guess or invent lore. State plainly that you lack context.
  2. If the user says your previous analysis was wrong, do not be defensive and do not loop on apologies.
  3. Immediately acknowledge that you were making an educated guess because surrounding context was missing.
  4. Ask targeted follow-up questions to gather context, such as: "Could you paste the preceding paragraph?", "Which character is speaking here?", or "Are they indoors or outdoors?"`;
    }

    return `${sharedContext}

  The user is in a running chat about this quote.
  Answer conversationally, continue the thread naturally, and stay focused on the text.
  If the user says "Try again" or "Rephrase", apply that command to the canonical quoted passage.`;
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
    const model = genAI.getGenerativeModel(
      {
        model: modelName,
        systemInstruction: buildQuoteChatSystemInstruction({
          workTitle,
          quoteText,
          tool,
          targetLanguage,
        }),
      },
      { timeout: AI_REQUEST_TIMEOUT_MS },
    );

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

  router.post("/api/works/:id/quotes", authenticateToken, (req, res) => {
    try {
      const { quote: rawQuote, explanation } = req.body;
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
      if (!quoteId) {
        return jsonError(res, 400, "Invalid quote id.");
      }

      const quote = db
        .prepare("SELECT * FROM work_quotes WHERE id = ?")
        .get(quoteId);

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
        const firstUserConversationEntry =
          existingConversations.find((entry) => entry.role === "user") || null;
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
          let persistedUserId = null;
          let persistedAssistantId = null;

          if (
            replaceLatestTurn &&
            quote.explanation &&
            latestTurn?.assistantEntry?.content === quote.explanation &&
            tool !== "analyze"
          ) {
            db.prepare(
              "UPDATE work_quotes SET explanation = NULL WHERE id = ?",
            ).run(quote.id);
          }

          if (replaceLatestTurn && latestTurn?.userEntry?.id) {
            const updatedUser = db
              .prepare(
                `UPDATE conversations
                 SET content = ?
                 WHERE id = ? AND quote_id = ?`,
              )
              .run(userMessage, latestTurn.userEntry.id, quote.id);
            if (updatedUser.changes === 0) {
              throw new Error("Failed to update the latest user conversation.");
            }

            persistedUserId = latestTurn.userEntry.id;

            if (firstUserConversationEntry?.id === latestTurn.userEntry.id) {
              db.prepare("UPDATE work_quotes SET quote = ? WHERE id = ?").run(
                userMessage,
                quote.id,
              );
            }

            if (latestTurn.assistantEntry?.id) {
              const updatedAssistant = db
                .prepare(
                  `UPDATE conversations
                   SET content = ?
                   WHERE id = ? AND quote_id = ?`,
                )
                .run(assistantContent, latestTurn.assistantEntry.id, quote.id);
              if (updatedAssistant.changes === 0) {
                throw new Error(
                  "Failed to update the latest assistant conversation.",
                );
              }
              persistedAssistantId = latestTurn.assistantEntry.id;
            } else {
              const assistantResult = insertConversation.run(
                "assistant",
                assistantContent,
                quote.id,
              );
              persistedAssistantId = assistantResult.lastInsertRowid;
            }
          } else {
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
            persistedUserId = userResult.lastInsertRowid;
            persistedAssistantId = assistantResult.lastInsertRowid;
          }

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
            .all(persistedUserId, persistedAssistantId);
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
}

module.exports = { registerWorkQuoteRoutes };

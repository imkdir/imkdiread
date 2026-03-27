const { GoogleGenerativeAI } = require("@google/generative-ai");
const { fetchWithTimeout } = require("../utils/fetchWithTimeout");
const { asOptionalString } = require("../utils/validators");
const {
  createQuoteCrudService,
  QuoteServiceError,
  asQuoteServiceError,
} = require("./quoteCrudService");

function createQuoteChatService({ db, workService, quoteCrudService }) {
  const quoteCrud =
    quoteCrudService ||
    createQuoteCrudService({
      db,
      workService,
    });

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

  async function sendQuoteChat({ workId, userId, isAdmin, payload }) {
    const quoteIdRaw = payload?.quoteId;
    const quoteId = quoteIdRaw ? Number(quoteIdRaw) : null;
    const quoteText = asOptionalString(payload?.quote);
    const message = asOptionalString(payload?.message);
    const tool = asOptionalString(payload?.tool) || "chat";
    const requestedModelId =
      asOptionalString(payload?.model) || defaultQuoteChatModelId;
    const model = parseRequestedQuoteChatModel(requestedModelId);
    const targetLanguage = asOptionalString(payload?.targetLanguage) || "English";
    const replaceLatestTurn = payload?.replaceLatestTurn === true;
    const { pageNumber, hasExplicitPageNumber } =
      quoteCrud.normalizePageNumberInput(payload?.pageNumber);

    if (!supportedQuoteChatTools.has(tool)) {
      throw asQuoteServiceError(400, "Invalid chat tool.");
    }
    if (!model) {
      throw asQuoteServiceError(400, "Invalid chat model.");
    }
    if (quoteIdRaw !== undefined && quoteIdRaw !== null && !quoteId) {
      throw asQuoteServiceError(400, "Invalid quoteId.");
    }
    if (hasExplicitPageNumber && pageNumber === null) {
      throw asQuoteServiceError(400, "pageNumber must be a positive integer.");
    }

    const work = db.prepare("SELECT id, title FROM works WHERE id = ?").get(workId);
    if (!work) {
      throw asQuoteServiceError(404, "Work not found.");
    }

    let quote = quoteId
      ? quoteCrud.getAccessibleQuote({ quoteId, userId, isAdmin })
      : null;

    if (quote && quote.work_id !== workId) {
      throw asQuoteServiceError(400, "Quote does not belong to this work.");
    }

    if (!quote && !quoteText && !message) {
      throw asQuoteServiceError(400, "Quote text is required.");
    }
    if (replaceLatestTurn && !quote?.id) {
      throw asQuoteServiceError(
        400,
        "A saved quote is required to replace the latest turn.",
      );
    }

    const userMessage = message || quoteText;
    if (!userMessage) {
      throw asQuoteServiceError(400, "Message is required.");
    }

    if (!quote) {
      quote = quoteCrud.createQuote({
        workId,
        userId,
        rawQuote: userMessage,
        pageNumberRaw: payload?.pageNumber,
        explanation: null,
        tags: payload?.tags,
      });
    }

    let existingConversations = quoteCrud.ensureLegacyExplanationConversation(quote);
    const firstUserConversationEntry =
      existingConversations.find((entry) => entry.role === "user") || null;

    if (!firstUserConversationEntry && quote.quote !== userMessage) {
      db.prepare("UPDATE work_quotes SET quote = ? WHERE id = ?").run(
        userMessage,
        quote.id,
      );
      quote = {
        ...quote,
        quote: userMessage,
      };
      existingConversations = quoteCrud.ensureLegacyExplanationConversation(quote);
    }

    const latestTurn = replaceLatestTurn
      ? quoteCrud.getLatestReplaceableQuoteTurn(existingConversations)
      : null;

    if (replaceLatestTurn && !latestTurn?.userEntry) {
      throw asQuoteServiceError(400, "There is no recent user turn to replace.");
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
      throw asQuoteServiceError(502, "The model returned an empty reply.");
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
        db.prepare("UPDATE work_quotes SET explanation = NULL WHERE id = ?").run(
          quote.id,
        );
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
            throw new Error("Failed to update the latest assistant conversation.");
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
        const userResult = insertConversation.run("user", userMessage, quote.id);
        const assistantResult = insertConversation.run(
          "assistant",
          assistantContent,
          quote.id,
        );
        persistedUserId = userResult.lastInsertRowid;
        persistedAssistantId = assistantResult.lastInsertRowid;
      }

      if (tool === "analyze") {
        db.prepare("UPDATE work_quotes SET explanation = ? WHERE id = ?").run(
          assistantContent,
          quote.id,
        );
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
    const freshQuote = quoteCrud.getQuoteById(quote.id);

    return {
      quote: freshQuote,
      conversations: entries,
      model: model.id,
      tool,
    };
  }

  return {
    listQuoteChatModels,
    sendQuoteChat,
  };
}

module.exports = { createQuoteChatService, QuoteServiceError };

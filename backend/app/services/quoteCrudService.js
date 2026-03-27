const { asOptionalString } = require("../utils/validators");

class QuoteServiceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "QuoteServiceError";
    this.statusCode = statusCode;
  }
}

function asQuoteServiceError(statusCode, message) {
  return new QuoteServiceError(statusCode, message);
}

function createQuoteCrudService({ db, workService }) {
  function normalizePageNumberInput(pageNumberRaw) {
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

    return { pageNumber, hasExplicitPageNumber };
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

  function createQuote({ workId, userId, rawQuote, pageNumberRaw, explanation }) {
    const quote = typeof rawQuote === "string" ? rawQuote.trim() : "";
    const { pageNumber, hasExplicitPageNumber } =
      normalizePageNumberInput(pageNumberRaw);

    if (!quote) {
      throw asQuoteServiceError(400, "Quote text is required.");
    }
    if (hasExplicitPageNumber && pageNumber === null) {
      throw asQuoteServiceError(400, "pageNumber must be a positive integer.");
    }

    const result = db
      .prepare(
        "INSERT INTO work_quotes (work_id, user_id, quote, page_number, explanation) VALUES (?, ?, ?, ?, ?)",
      )
      .run(workId, userId, quote, pageNumber, explanation || null);

    return db
      .prepare("SELECT * FROM work_quotes WHERE id = ?")
      .get(result.lastInsertRowid);
  }

  function updateQuote({
    quoteId,
    userId,
    isAdmin,
    quote,
    explanation,
    pageNumberRaw,
  }) {
    const normalizedQuote = asOptionalString(quote);
    const normalizedExplanation = asOptionalString(explanation);
    const { pageNumber } = normalizePageNumberInput(pageNumberRaw);

    if (!normalizedQuote) {
      throw asQuoteServiceError(400, "Quote text is required.");
    }
    if (
      pageNumberRaw !== undefined &&
      pageNumberRaw !== null &&
      pageNumber === null
    ) {
      throw asQuoteServiceError(400, "pageNumber must be a positive integer.");
    }

    const result = isAdmin
      ? db
          .prepare(
            "UPDATE work_quotes SET quote = ?, page_number = ?, explanation = ? WHERE id = ?",
          )
          .run(normalizedQuote, pageNumber, normalizedExplanation || null, quoteId)
      : db
          .prepare(
            "UPDATE work_quotes SET quote = ?, page_number = ?, explanation = ? WHERE id = ? AND user_id = ?",
          )
          .run(
            normalizedQuote,
            pageNumber,
            normalizedExplanation || null,
            quoteId,
            userId,
          );

    if (result.changes === 0) {
      throw asQuoteServiceError(403, "Unauthorized or quote not found");
    }
  }

  function deleteQuote({ quoteId, userId, isAdmin }) {
    const result = isAdmin
      ? db.prepare("DELETE FROM work_quotes WHERE id = ?").run(quoteId)
      : db
          .prepare("DELETE FROM work_quotes WHERE id = ? AND user_id = ?")
          .run(quoteId, userId);

    if (result.changes === 0) {
      throw asQuoteServiceError(403, "Unauthorized or quote not found");
    }
  }

  function getQuoteChat({ quoteId }) {
    const parsedQuoteId = Number(quoteId);
    if (!parsedQuoteId) {
      throw asQuoteServiceError(400, "Invalid quote id.");
    }

    const quote = db
      .prepare("SELECT * FROM work_quotes WHERE id = ?")
      .get(parsedQuoteId);

    if (!quote) {
      throw asQuoteServiceError(404, "Quote not found.");
    }

    const conversations = ensureLegacyExplanationConversation(quote);
    return { quote, conversations };
  }

  function clearQuoteChat({ quoteId, userId, isAdmin }) {
    const parsedQuoteId = Number(quoteId);
    const quote = getAccessibleQuote({
      quoteId: parsedQuoteId,
      userId,
      isAdmin,
    });

    if (!quote) {
      throw asQuoteServiceError(404, "Quote not found.");
    }

    db.prepare("DELETE FROM conversations WHERE quote_id = ?").run(parsedQuoteId);
    db.prepare("UPDATE work_quotes SET explanation = NULL WHERE id = ?").run(
      parsedQuoteId,
    );
  }

  return {
    normalizePageNumberInput,
    getAccessibleQuote,
    ensureLegacyExplanationConversation,
    getLatestReplaceableQuoteTurn,
    createQuote,
    updateQuote,
    deleteQuote,
    getQuoteChat,
    clearQuoteChat,
  };
}

module.exports = {
  QuoteServiceError,
  asQuoteServiceError,
  createQuoteCrudService,
};

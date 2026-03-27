const { authenticateToken } = require("../middleware/auth");
const { jsonError } = require("../utils/errorHelpers");
const {
  createQuoteCrudService,
  QuoteServiceError,
} = require("../services/quoteCrudService");
const {
  createQuoteChatService,
} = require("../services/quoteChatService");

function registerWorkQuoteRoutes({ router, db, workService }) {
  const quoteCrudService = createQuoteCrudService({ db, workService });
  const quoteChatService = createQuoteChatService({
    db,
    workService,
    quoteCrudService,
  });

  router.post("/api/works/:id/quotes", authenticateToken, (req, res) => {
    try {
      const savedQuote = quoteCrudService.createQuote({
        workId: req.params.id,
        userId: req.user.id,
        rawQuote: req.body?.quote,
        pageNumberRaw: req.body?.pageNumber,
        explanation: req.body?.explanation,
      });

      res.json({ success: true, quote: savedQuote });
    } catch (error) {
      if (error instanceof QuoteServiceError || error?.statusCode) {
        return jsonError(res, error.statusCode, error.message);
      }
      console.error("Failed to add quote:", error);
      res
        .status(500)
        .json({ error: error?.message || "Failed to add quote" });
    }
  });

  router.put("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      quoteCrudService.updateQuote({
        quoteId: req.params.id,
        userId: req.user.id,
        isAdmin: req.user.role === "admin",
        quote: req.body?.quote,
        explanation: req.body?.explanation,
        pageNumberRaw: req.body?.pageNumber,
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof QuoteServiceError || error?.statusCode) {
        return jsonError(res, error.statusCode, error.message);
      }
      res.status(500).json({ error: "Failed to update quote" });
    }
  });

  router.delete("/api/quotes/:id", authenticateToken, (req, res) => {
    try {
      quoteCrudService.deleteQuote({
        quoteId: req.params.id,
        userId: req.user.id,
        isAdmin: req.user.role === "admin",
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof QuoteServiceError || error?.statusCode) {
        return jsonError(res, error.statusCode, error.message);
      }
      res.status(500).json({ error: "Failed to delete quote" });
    }
  });

  router.get("/api/quotes/:id/chat", authenticateToken, (req, res) => {
    try {
      const quoteChat = quoteCrudService.getQuoteChat({ quoteId: req.params.id });
      res.json({ success: true, ...quoteChat });
    } catch (error) {
      if (error instanceof QuoteServiceError || error?.statusCode) {
        return jsonError(res, error.statusCode, error.message);
      }
      console.error("Failed to load quote chat:", error);
      res.status(500).json({ error: "Failed to load quote chat." });
    }
  });

  router.delete("/api/quotes/:id/chat", authenticateToken, (req, res) => {
    try {
      quoteCrudService.clearQuoteChat({
        quoteId: req.params.id,
        userId: req.user.id,
        isAdmin: req.user.role === "admin",
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof QuoteServiceError || error?.statusCode) {
        return jsonError(res, error.statusCode, error.message);
      }
      console.error("Failed to clear quote chat:", error);
      res.status(500).json({ error: "Failed to clear quote chat." });
    }
  });

  router.get("/api/quote-chat/models", authenticateToken, async (_req, res) => {
    try {
      const modelCatalog = await quoteChatService.listQuoteChatModels();
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
        const result = await quoteChatService.sendQuoteChat({
          workId: req.params.id,
          userId: req.user.id,
          isAdmin: req.user.role === "admin",
          payload: req.body,
        });

        res.json({ success: true, ...result });
      } catch (error) {
        if (error instanceof QuoteServiceError || error?.statusCode) {
          return jsonError(res, error.statusCode, error.message);
        }
        console.error("Quote chat failed:", error);
        res.status(500).json({ error: "Failed to continue quote chat." });
      }
    },
  );
}

module.exports = { registerWorkQuoteRoutes };

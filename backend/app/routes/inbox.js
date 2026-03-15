const express = require("express");
const { authenticateToken } = require("../middleware/auth");
const { jsonError } = require("../utils/errorHelpers");

function createInboxRouter({ inboxService }) {
  const router = express.Router();

  router.get("/api/inbox", authenticateToken, (req, res) => {
    try {
      const items = inboxService.listNotifications(req.user.id);
      const unread_count = inboxService.getUnreadCount(req.user.id);
      res.json({ items, unread_count });
    } catch (error) {
      console.error("Failed to load inbox:", error);
      jsonError(res, 500, "Failed to load inbox.");
    }
  });

  router.get("/api/inbox/unread-count", authenticateToken, (req, res) => {
    try {
      res.json({ unread_count: inboxService.getUnreadCount(req.user.id) });
    } catch (error) {
      console.error("Failed to load unread inbox count:", error);
      jsonError(res, 500, "Failed to load unread inbox count.");
    }
  });

  router.post("/api/inbox/:id/read", authenticateToken, (req, res) => {
    try {
      const notificationId = Number(req.params.id);
      if (!Number.isInteger(notificationId) || notificationId <= 0) {
        return jsonError(res, 400, "Invalid notification id.");
      }

      const changes = inboxService.markNotificationRead(
        req.user.id,
        notificationId,
      );
      if (changes === 0) {
        return jsonError(res, 404, "Notification not found.");
      }

      res.json({
        success: true,
        unread_count: inboxService.getUnreadCount(req.user.id),
      });
    } catch (error) {
      console.error("Failed to mark inbox notification as read:", error);
      jsonError(res, 500, "Failed to update notification.");
    }
  });

  router.post("/api/inbox/read-all", authenticateToken, (req, res) => {
    try {
      const marked = inboxService.markAllNotificationsRead(req.user.id);
      res.json({ success: true, marked, unread_count: 0 });
    } catch (error) {
      console.error("Failed to mark all inbox notifications as read:", error);
      jsonError(res, 500, "Failed to update inbox.");
    }
  });

  return router;
}

module.exports = { createInboxRouter };

const WORK_AVAILABLE_ALERT_KIND = "work_available";
const WORK_AVAILABLE_NOTIFICATION_TYPE = "work_available";

function createInboxService({ db, workService }) {
  function getWorkRow(workId) {
    return db.prepare("SELECT * FROM works WHERE id = ?").get(workId);
  }

  function syncAvailabilityAlert(userId, workId, shouldWatch) {
    const workRow = getWorkRow(workId);
    if (!workRow) {
      const error = new Error("Work not found.");
      error.statusCode = 404;
      throw error;
    }

    const isAvailable = workService.isWorkAvailable(workRow);

    if (shouldWatch && !isAvailable) {
      db.prepare(
        `INSERT INTO user_work_alerts (user_id, work_id, kind, active, fulfilled_at)
         VALUES (?, ?, ?, 1, NULL)
         ON CONFLICT(user_id, work_id, kind) DO UPDATE SET
           active = 1,
           fulfilled_at = NULL`,
      ).run(userId, workId, WORK_AVAILABLE_ALERT_KIND);
      return true;
    }

    db.prepare(
      `UPDATE user_work_alerts
       SET active = 0
       WHERE user_id = ? AND work_id = ? AND kind = ?`,
    ).run(userId, workId, WORK_AVAILABLE_ALERT_KIND);
    return false;
  }

  function notifyWorkAvailabilityIfNeeded(workId, previouslyAvailable = null) {
    const workRow = getWorkRow(workId);
    if (!workRow) return { created: 0, work: null };

    const wasAvailable =
      previouslyAvailable === null
        ? false
        : Boolean(previouslyAvailable);
    const isAvailableNow = workService.isWorkAvailable(workRow);

    if (wasAvailable || !isAvailableNow) {
      return { created: 0, work: workRow };
    }

    const pendingAlerts = db
      .prepare(
        `SELECT id, user_id
         FROM user_work_alerts
         WHERE work_id = ? AND kind = ? AND active = 1 AND fulfilled_at IS NULL`,
      )
      .all(workId, WORK_AVAILABLE_ALERT_KIND);

    if (!pendingAlerts.length) {
      return { created: 0, work: workRow };
    }

    const title = "Now available";
    const body = `${workRow.title} now has a file available.`;
    const payload = JSON.stringify({
      work_id: workId,
      kind: WORK_AVAILABLE_NOTIFICATION_TYPE,
    });

    db.transaction(() => {
      const insertNotification = db.prepare(
        `INSERT INTO user_notifications
         (user_id, type, work_id, title, body, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      for (const alert of pendingAlerts) {
        insertNotification.run(
          alert.user_id,
          WORK_AVAILABLE_NOTIFICATION_TYPE,
          workId,
          title,
          body,
          payload,
        );
      }

      db.prepare(
        `UPDATE user_work_alerts
         SET active = 0, fulfilled_at = CURRENT_TIMESTAMP
         WHERE work_id = ? AND kind = ? AND active = 1 AND fulfilled_at IS NULL`,
      ).run(workId, WORK_AVAILABLE_ALERT_KIND);
    })();

    return { created: pendingAlerts.length, work: workRow };
  }

  function listNotifications(userId) {
    const rows = db
      .prepare(
        `SELECT id, user_id, type, work_id, title, body, payload, read_at, created_at
         FROM user_notifications
         WHERE user_id = ?
         ORDER BY read_at IS NULL DESC, datetime(created_at) DESC, id DESC`,
      )
      .all(userId);

    return rows.map((row) => ({
      ...row,
      payload: row.payload ? JSON.parse(row.payload) : null,
    }));
  }

  function getUnreadCount(userId) {
    return (
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND read_at IS NULL",
        )
        .get(userId)?.count || 0
    );
  }

  function markNotificationRead(userId, notificationId) {
    return db
      .prepare(
        `UPDATE user_notifications
         SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE id = ? AND user_id = ?`,
      )
      .run(notificationId, userId).changes;
  }

  function markAllNotificationsRead(userId) {
    return db
      .prepare(
        `UPDATE user_notifications
         SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE user_id = ? AND read_at IS NULL`,
      )
      .run(userId).changes;
  }

  return {
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    notifyWorkAvailabilityIfNeeded,
    syncAvailabilityAlert,
  };
}

module.exports = {
  WORK_AVAILABLE_ALERT_KIND,
  WORK_AVAILABLE_NOTIFICATION_TYPE,
  createInboxService,
};

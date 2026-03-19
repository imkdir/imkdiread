import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InboxNotification } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";
import { AppIcon } from "./AppIcon";
import { FloatingDrawer } from "./FloatingDrawer";
import "./InboxDrawer.css";

interface InboxResponse {
  items?: InboxNotification[];
  unread_count?: number;
  error?: string;
}

interface InboxActionResponse {
  success?: boolean;
  unread_count?: number;
  error?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  anchorRect?: DOMRect | null;
  onUnreadCountChange?: (count: number) => void;
  refreshKey?: number;
}

function formatNotificationTime(timestamp: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

export function InboxDrawer({
  isOpen,
  onClose,
  anchorRect,
  onUnreadCountChange,
  refreshKey = 0,
}: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  );

  const fetchInbox = useCallback(async () => {
    setIsLoading(true);

    try {
      const res = await request("/api/inbox");
      const data = await readJsonSafe<InboxResponse>(res);

      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, "Failed to load inbox."));
      }

      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);
      onUnreadCountChange?.(
        data?.unread_count ??
          nextItems.filter((item) => !item.read_at).length,
      );
    } catch (error) {
      console.error("Failed to load inbox", error);
      showToast(
        error instanceof Error ? error.message : "Failed to load inbox.",
        { tone: "error" },
      );
    } finally {
      setIsLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      void fetchInbox();
    }
  }, [fetchInbox, isOpen, refreshKey]);

  const handleOpenNotification = async (item: InboxNotification) => {
    try {
      if (!item.read_at) {
        const res = await request(`/api/inbox/${item.id}/read`, {
          method: "POST",
        });
        const data = await readJsonSafe<InboxActionResponse>(res);

        if (!res.ok || !data?.success) {
          throw new Error(
            getApiErrorMessage(data, "Failed to update notification."),
          );
        }

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, read_at: new Date().toISOString() }
              : entry,
          ),
        );
        onUnreadCountChange?.(
          data.unread_count ?? Math.max(0, unreadCount - 1),
        );
      }

      if (item.work_id) {
        navigate(`/work/${encodeURIComponent(item.work_id)}`);
      }
      onClose();
    } catch (error) {
      console.error("Failed to open inbox notification", error);
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to update notification.",
        { tone: "error" },
      );
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);

    try {
      const res = await request("/api/inbox/read-all", {
        method: "POST",
      });
      const data = await readJsonSafe<InboxActionResponse>(res);

      if (!res.ok || !data?.success) {
        throw new Error(getApiErrorMessage(data, "Failed to update inbox."));
      }

      setItems((current) =>
        current.map((item) => ({
          ...item,
          read_at: item.read_at || new Date().toISOString(),
        })),
      );
      onUnreadCountChange?.(0);
    } catch (error) {
      console.error("Failed to mark inbox as read", error);
      showToast(
        error instanceof Error ? error.message : "Failed to update inbox.",
        { tone: "error" },
      );
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  return (
    <FloatingDrawer
      isOpen={isOpen}
      title="Inbox"
      onClose={onClose}
      variant="paper"
      anchorRect={anchorRect}
      defaultSize={{ width: 400, height: 520 }}
      minSize={{ width: 340, height: 320 }}
      bodyStyle={{ padding: "18px 20px 20px" }}
    >
      <div className="inbox-drawer">
        <div className="inbox-drawer__toolbar">
          <p className="inbox-drawer__summary">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : "All caught up for now."}
          </p>
        </div>

        <div className="inbox-drawer__list">
          {isLoading ? (
            <div className="inbox-drawer__empty">Loading inbox...</div>
          ) : items.length === 0 ? (
            <div className="inbox-drawer__empty">
              No notifications yet.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inbox-drawer__item ${item.read_at ? "inbox-drawer__item--read" : ""}`}
                onClick={() => {
                  void handleOpenNotification(item);
                }}
              >
                <div className="inbox-drawer__item-icon">
                  <AppIcon name="inbox" title="Notification" size={16} />
                </div>
                <div className="inbox-drawer__item-copy">
                  <div className="inbox-drawer__item-header">
                    <span className="inbox-drawer__item-title">
                      {item.title}
                    </span>
                    {!item.read_at && (
                      <span
                        className="inbox-drawer__item-dot"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p className="inbox-drawer__item-body">{item.body}</p>
                  <span className="inbox-drawer__item-time">
                    {formatNotificationTime(item.created_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {items.length > 0 && (
          <button
            type="button"
            className="inbox-drawer__clear-all"
            onClick={() => {
              void handleMarkAllRead();
            }}
            disabled={isMarkingAllRead || unreadCount === 0}
          >
            {isMarkingAllRead ? "Updating..." : "Clear all"}
          </button>
        )}
      </div>
    </FloatingDrawer>
  );
}

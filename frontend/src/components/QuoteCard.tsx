import React, { useState } from "react";
import { Link } from "react-router-dom";

import type { Quote, User } from "../types";
import { AppIcon } from "./AppIcon";
import { useAuth } from "./AuthContext";
import { QuoteConversationModal } from "./QuoteConversationModal";
import "./Modal.css";
import "./QuoteCard.css";

export interface QuoteConversationOpenOptions {
  openDrawer?: boolean;
}

interface Props {
  quote: Quote;
  displaySource?: boolean;
  onRefresh: () => void;
  onOpenConversation?: (
    quote: Quote,
    options?: QuoteConversationOpenOptions,
  ) => void;
  user: User | null;
}

function QuoteCardClass({
  quote,
  displaySource,
  onRefresh,
  onOpenConversation,
  user,
}: Props) {
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [openConversationDrawer, setOpenConversationDrawer] = useState(false);

  const canEditOrDelete = () => {
    if (!user) {
      return false;
    }

    return user.id === quote.user_id || user.role === "admin";
  };

  const openConversation = (
    openDrawer = false,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (event) {
      event.stopPropagation();
    }

    if (onOpenConversation) {
      onOpenConversation(quote, { openDrawer });
      return;
    }

    setOpenConversationDrawer(openDrawer);
    setIsConversationOpen(true);
  };

  const closeConversation = () => {
    setIsConversationOpen(false);
    setOpenConversationDrawer(false);
  };

  const hasPermission = canEditOrDelete();
  const showQuoteMeta = true;

  return (
    <>
      <div className="quote-card-container">
        <div className="quote-face-front quote-face-front--visible">
          <blockquote className="quote-text">{quote.quote}</blockquote>

          {showQuoteMeta && (
            <div className="quote-meta quote-meta--card">
              {quote.page_number && <span className="quote-number">P{quote.page_number}</span>}
              {displaySource && quote.work && (
                <Link
                  to={`/work/${quote.work.id}`}
                  className="quote-source"
                  onClick={(event) => event.stopPropagation()}
                >
                  {quote.work.title}
                </Link>
              )}
              <button
                type="button"
                onClick={(event) => openConversation(false, event)}
                className="quote-explain-button"
              >
                <AppIcon name="gemini" className="quote-explain-icon" title="Gemini" />
              </button>
            </div>
          )}

          {hasPermission ? (
            <button
              type="button"
              className="quote-edit-hint"
              onClick={(event) => openConversation(true, event)}
            >
              <AppIcon name="edit" size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {!onOpenConversation ? (
        <QuoteConversationModal
          isOpen={isConversationOpen}
          workId={quote.work_id}
          quote={quote}
          initialDrawerOpen={openConversationDrawer}
          onClose={closeConversation}
          onRefresh={onRefresh}
        />
      ) : null}
    </>
  );
}

const QuoteCardWithUser = (props: Omit<Props, "user">) => {
  const { user } = useAuth();
  return <QuoteCardClass {...props} user={user} />;
};

export const QuoteCard = React.memo(QuoteCardWithUser);

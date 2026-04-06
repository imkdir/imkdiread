import React, { useState } from "react";

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
  onRefresh: () => void;
  onOpenConversation?: (
    quote: Quote,
    options?: QuoteConversationOpenOptions,
  ) => void;
  user: User | null;
}

function QuoteCardClass({ quote, onRefresh, onOpenConversation, user }: Props) {
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [openConversationDrawer, setOpenConversationDrawer] = useState(false);

  const isQuoteOwner = () => {
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

  const hasPermission = isQuoteOwner();

  return (
    <>
      <div className="quote-card-container">
        <div className="quote-face-front quote-face-front--visible">
          <blockquote className="quote-text">{quote.quote}</blockquote>

          {hasPermission ? (
            <button
              type="button"
              onClick={(event) => openConversation(false, event)}
              className="quote-explain-button"
            >
              <AppIcon
                name="gemini"
                className="quote-explain-icon"
                title="Gemini"
              />
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

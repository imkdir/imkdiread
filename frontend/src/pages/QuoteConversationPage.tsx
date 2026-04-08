import { useMemo } from "react";
import { useParams } from "react-router-dom";
import type { Quote } from "../types";
import { QuoteConversation } from "../components/QuoteConversation";
import "./QuoteConversationPage.css";

function buildQuoteStub(workId: string, quoteId: number): Quote {
  return {
    id: quoteId,
    work_id: workId,
    user_id: "__shared_view__",
    quote: "",
    page_number: null,
    created_at: new Date().toISOString(),
  };
}

export function QuoteConversationPageWrapper() {
  const { id, quoteId } = useParams<{ id: string; quoteId: string }>();
  const workId = id || "";
  const parsedQuoteId = Number.parseInt(quoteId || "", 10);
  const isValidQuoteId = Number.isInteger(parsedQuoteId) && parsedQuoteId > 0;
  const quoteStub = useMemo(
    () => (isValidQuoteId ? buildQuoteStub(workId, parsedQuoteId) : null),
    [isValidQuoteId, parsedQuoteId, workId],
  );

  if (!workId || !quoteStub) {
    return (
      <div className="quote-conversation-page quote-conversation-page--empty">
        <p className="quote-conversation-page__empty-text">
          Conversation link is invalid.
        </p>
      </div>
    );
  }

  return (
    <div className="quote-conversation-page">
      <div className="quote-conversation-page__content">
        <QuoteConversation
          workId={workId}
          quote={quoteStub}
          readOnly={true}
          theme="dark"
        />
      </div>
    </div>
  );
}

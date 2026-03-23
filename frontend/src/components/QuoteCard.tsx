import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { AnimatePresence, motion } from "framer-motion";
import type { Quote, User } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { AppIcon } from "./AppIcon";
import { useAuth } from "./AuthContext";
import { QuoteConversationModal } from "./QuoteConversationModal";
import { showToast } from "../utils/toast";
import "./Modal.css";
import "./QuoteCard.css";

interface Props {
  quote: Quote;
  displaySource?: boolean;
  onRefresh: () => void;
  onOpenConversation?: (quote: Quote) => void;
  user: User | null;
}

interface State {
  activeDrawer: "edit" | null;
  isConversationOpen: boolean;
  editQuote: string;
  editPageNum: string;
  isSaving: boolean;
}

const activeQuoteDrawerClosers = new Set<() => void>();
let isQuoteDrawerEscapeListenerAttached = false;

function handleQuoteDrawerEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") {
    return;
  }

  activeQuoteDrawerClosers.forEach((closeDrawer) => closeDrawer());
}

function registerQuoteDrawerCloser(closeDrawer: () => void) {
  activeQuoteDrawerClosers.add(closeDrawer);

  if (
    !isQuoteDrawerEscapeListenerAttached &&
    typeof window !== "undefined"
  ) {
    window.addEventListener("keydown", handleQuoteDrawerEscape);
    isQuoteDrawerEscapeListenerAttached = true;
  }
}

function unregisterQuoteDrawerCloser(closeDrawer: () => void) {
  activeQuoteDrawerClosers.delete(closeDrawer);

  if (
    isQuoteDrawerEscapeListenerAttached &&
    activeQuoteDrawerClosers.size === 0 &&
    typeof window !== "undefined"
  ) {
    window.removeEventListener("keydown", handleQuoteDrawerEscape);
    isQuoteDrawerEscapeListenerAttached = false;
  }
}

class QuoteCardClass extends React.PureComponent<Props, State> {
  private textareaRef = React.createRef<HTMLTextAreaElement>();

  constructor(props: Props) {
    super(props);
    this.state = {
      activeDrawer: null,
      isConversationOpen: false,
      editQuote: props.quote.quote,
      editPageNum: props.quote.page_number
        ? props.quote.page_number.toString()
        : "",
      isSaving: false,
    };
  }

  componentDidMount() {
    registerQuoteDrawerCloser(this.closeDrawerOnEscape);
  }

  componentWillUnmount() {
    unregisterQuoteDrawerCloser(this.closeDrawerOnEscape);
  }

  // --- OWNERSHIP GUARD ---
  canEditOrDelete = () => {
    const { quote, user } = this.props;
    if (!user) return false;
    return user.id === quote.user_id || user.role === "admin";
  };

  adjustTextareaHeight = () => {
    const el = this.textareaRef.current;
    if (el) {
      el.style.height = "";
    }
  };

  toggleFlip = (mode: "edit" = "edit", e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (mode === "edit" && !this.canEditOrDelete()) return;

    this.setState(
      {
        activeDrawer: this.state.activeDrawer === mode ? null : mode,
        editQuote: this.props.quote.quote,
        editPageNum: this.props.quote.page_number
          ? this.props.quote.page_number.toString()
          : "",
      },
      this.adjustTextareaHeight,
    );
  };

  closeDrawer = () => {
    this.setState({ activeDrawer: null });
  };

  closeDrawerOnEscape = () => {
    if (this.state.activeDrawer) {
      this.closeDrawer();
    }
  };

  openConversation = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (this.props.onOpenConversation) {
      this.props.onOpenConversation(this.props.quote);
      return;
    }

    this.setState({ isConversationOpen: true });
  };

  closeConversation = () => {
    this.setState({ isConversationOpen: false });
  };

  handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "editQuote") {
      this.setState({ editQuote: value }, this.adjustTextareaHeight);
      return;
    }
    if (name === "editPageNum") {
      this.setState({ editPageNum: value });
    }
  };

  handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    this.setState({ isSaving: true });

    request(`/api/quotes/${this.props.quote.id}`, {
      method: "PUT",
      body: JSON.stringify({
        quote: this.state.editQuote.trim(),
        pageNumber: Number(this.state.editPageNum) || null,
        explanation: this.props.quote.explanation || null,
      }),
    })
      .then(async (res) => {
        const data = await readJsonSafe<{ success?: boolean; error?: string }>(
          res,
        );
        if (!res.ok || !data?.success) {
          throw new Error(getApiErrorMessage(data, "Failed to save quote."));
        }
        return data;
      })
      .then((data) => {
        void data;
        this.setState({ activeDrawer: null, isSaving: false });
        this.props.onRefresh();
        showToast("Quote updated.", { tone: "success" });
      })
      .catch((error) => {
        this.setState({ isSaving: false });
        showToast(
          error instanceof Error ? error.message : "Failed to save quote.",
          { tone: "error" },
        );
      });
  };

  handleDelete = () => {
    showToast("Permanently delete this quote?", {
      tone: "error",
      variant: "destructive-confirm",
      persistent: true,
      actionLabel: "Delete",
      onAction: () => {
        request(`/api/quotes/${this.props.quote.id}`, { method: "DELETE" })
          .then(async (res) => {
            const data = await readJsonSafe<{
              success?: boolean;
              error?: string;
            }>(res);
            if (!res.ok || !data?.success) {
              throw new Error(
                getApiErrorMessage(data, "Failed to delete quote."),
              );
            }
          })
          .then((data) => {
            void data;
            this.setState({ activeDrawer: null });
            this.props.onRefresh();
            showToast("Quote deleted.", { tone: "success" });
          })
          .catch((error) =>
            showToast(
              error instanceof Error
                ? error.message
                : "Failed to delete quote.",
              { tone: "error" },
            ),
          );
      },
    });
  };

  renderEditForm = () => {
    const { editQuote, editPageNum, isSaving } = this.state;

    return (
      <form
        onSubmit={this.handleSave}
        className="quote-card-form quote-card-form--drawer"
      >
        <textarea
          ref={this.textareaRef}
          name="editQuote"
          value={editQuote}
          onChange={this.handleInputChange}
          className="quote-card-input quote-card-input--quote"
          rows={4}
        />

        <div className="quote-card-row">
          <div className="quote-card-page-group">
            <label className="quote-card-label">Pg.</label>
            <input
              name="editPageNum"
              value={editPageNum}
              onChange={this.handleInputChange}
              className="quote-card-input quote-card-input--page"
            />
          </div>

          <button
            type="button"
            onClick={this.handleDelete}
            className="quote-card-delete-button"
          >
            Delete
          </button>
        </div>

        <div className="quote-card-actions">
          <button
            type="button"
            onClick={this.closeDrawer}
            className="quote-card-action-button quote-card-action-button--cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="quote-card-action-button quote-card-action-button--save"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    );
  };

  renderDrawer = () => {
    const { activeDrawer } = this.state;

    if (typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <AnimatePresence>
        {activeDrawer && (
            <motion.div
              className="modal-overlay quote-card-modal-overlay"
              onClick={this.closeDrawer}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="quote-card-modal-shell quote-card-modal-shell--edit"
                onClick={(event) => event.stopPropagation()}
                initial={{ scale: 0.92, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, y: 12, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 180,
                  damping: 22,
                  mass: 0.9,
                }}
              >
                <div className="quote-card-modal-panel">
                  <div className="quote-card-modal-header">
                    <h3 className="quote-card-modal-title">Edit Quote</h3>
                    <button
                      type="button"
                      className="quote-card-modal-close"
                      onClick={this.closeDrawer}
                      aria-label="Close"
                    >
                      <AppIcon name="close" size={18} />
                    </button>
                  </div>
                  <div className="quote-card-modal-face">
                    <div className="quote-card-drawer-theme">
                      {this.renderEditForm()}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>,
      document.body,
    );
  };

  render() {
    const { quote, displaySource } = this.props;

    const hasPermission = this.canEditOrDelete();
    const showQuoteMeta = true;

    return (
      <>
        <div className="quote-card-container">
          <div className="quote-face-front quote-face-front--visible">
            <blockquote className="quote-text">{quote.quote}</blockquote>

            {showQuoteMeta && (
              <div className="quote-meta quote-meta--card">
                {quote.page_number && (
                  <span className="quote-number">P{quote.page_number}</span>
                )}
                {displaySource && quote.work && (
                  <Link
                    to={`/work/${quote.work.id}`}
                    className="quote-source"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {quote.work.title}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={(e) => this.openConversation(e)}
                  className="quote-explain-button"
                >
                  <AppIcon
                    name="gemini"
                    className="quote-explain-icon"
                    title="Gemini"
                  />
                </button>
              </div>
            )}

            {hasPermission && (
              <button
                type="button"
                className="quote-edit-hint"
                onClick={(e) => this.toggleFlip("edit", e)}
              >
                <AppIcon name="edit" size={16} />
              </button>
            )}
          </div>
        </div>

        {this.renderDrawer()}
        {!this.props.onOpenConversation && (
          <QuoteConversationModal
            isOpen={this.state.isConversationOpen}
            workId={quote.work_id}
            quote={quote}
            onClose={this.closeConversation}
            onRefresh={this.props.onRefresh}
          />
        )}
      </>
    );
  }
}

// --- FUNCTIONAL WRAPPER ---
const QuoteCardWithUser = (props: Omit<Props, "user">) => {
  const { user } = useAuth();
  return <QuoteCardClass {...props} user={user} />;
};

export const QuoteCard = React.memo(QuoteCardWithUser);

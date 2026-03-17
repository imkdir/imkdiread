import React from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { AnimatePresence, motion } from "framer-motion";
import type { Quote, User } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { AppIcon } from "./AppIcon";
import { useAuth } from "./AuthContext";
import { FloatingDrawer } from "./FloatingDrawer";
import { showToast } from "../utils/toast";
import "./QuoteCard.css";

interface Props {
  quote: Quote;
  displaySource?: boolean;
  onRefresh: () => void;
  user: User | null;
}

interface State {
  activeDrawer: "edit" | "explain" | null;
  editQuote: string;
  editPageNum: string;
  isSaving: boolean;
}

class QuoteCardClass extends React.Component<Props, State> {
  private textareaRef = React.createRef<HTMLTextAreaElement>();

  constructor(props: Props) {
    super(props);
    this.state = {
      activeDrawer: null,
      editQuote: props.quote.quote,
      editPageNum: props.quote.page_number
        ? props.quote.page_number.toString()
        : "",
      isSaving: false,
    };
  }

  componentDidMount() {
    window.addEventListener("keydown", this.handleWindowKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleWindowKeyDown);
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

  toggleFlip = (mode: "edit" | "explain" = "edit", e?: React.MouseEvent) => {
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

  handleWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && this.state.activeDrawer) {
      this.closeDrawer();
    }
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

  renderExplanation = () => {
    const { quote } = this.props;

    return (
      <div className="quote-card-explanation quote-card-explanation--drawer">
        <div className="quote-card-explanation-scroll">
          <p className="quote-card-explanation-text">{quote.explanation}</p>
        </div>
      </div>
    );
  };

  renderDrawer = () => {
    const { quote } = this.props;
    const { activeDrawer } = this.state;

    if (typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <AnimatePresence>
        {activeDrawer &&
          !(activeDrawer === "explain" && !quote.explanation) && (
            <>
              <motion.div
                className="quote-card-drawer-backdrop"
                onClick={this.closeDrawer}
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              />
              <FloatingDrawer
                isOpen
                title={activeDrawer === "edit" ? "Edit Quote" : "Gemini"}
                onClose={this.closeDrawer}
                variant="classic"
                defaultPlacement="center"
                defaultViewportRatio={{
                  width: activeDrawer === "edit" ? 0.23 : 0.3,
                  height: activeDrawer === "edit" ? 0.54 : 0.54,
                }}
                minSize={{ width: 280, height: 280 }}
                bodyStyle={{
                  display: "flex",
                  minHeight: 0,
                  padding: "10px 12px 14px",
                }}
                motionProps={{
                  initial: { opacity: 0, scale: 0.94, y: 18 },
                  animate: { opacity: 1, scale: 1, y: 0 },
                  exit: { opacity: 0, scale: 0.97, y: 10 },
                  transition: {
                    type: "spring",
                    stiffness: 260,
                    damping: 24,
                    mass: 0.9,
                  },
                }}
              >
                <div className="quote-card-explanation-drawer-theme">
                  {activeDrawer === "edit"
                    ? this.renderEditForm()
                    : this.renderExplanation()}
                </div>
              </FloatingDrawer>
            </>
          )}
      </AnimatePresence>,
      document.body,
    );
  };

  render() {
    const { quote, displaySource } = this.props;

    const hasPermission = this.canEditOrDelete();
    const showQuoteMeta =
      quote.page_number || (displaySource && quote.work) || quote.explanation;

    return (
      <>
        <motion.div layout className="quote-card-container">
          <div className="quote-face-front quote-face-front--visible">
            <blockquote className="quote-text">{quote.quote}</blockquote>

            {showQuoteMeta && (
              <div className="quote-meta quote-meta--card">
                {quote.page_number && (
                  <span className="quote-number">P{quote.page_number}</span>
                )}
                {displaySource && quote.work ? (
                  <Link
                    to={`/work/${quote.work.id}`}
                    className="quote-source"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {quote.work.title}
                  </Link>
                ) : (
                  !!quote.explanation && (
                    <button
                      type="button"
                      onClick={(e) => this.toggleFlip("explain", e)}
                      className="quote-explain-button"
                    >
                      <AppIcon
                        name="gemini"
                        className="quote-explain-icon"
                        title="Gemini"
                      />
                    </button>
                  )
                )}
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
        </motion.div>

        {this.renderDrawer()}
      </>
    );
  }
}

// --- FUNCTIONAL WRAPPER ---
export const QuoteCard = (props: Omit<Props, "user">) => {
  const { user } = useAuth();
  return <QuoteCardClass {...props} user={user} />;
};

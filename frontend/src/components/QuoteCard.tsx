import React from "react";
import { Link } from "react-router-dom";

import { motion, type Transition } from "framer-motion";
import type { Quote, User } from "../types";
import { request } from "../utils/APIClient";
import { AppIcon } from "./AppIcon";
import { useAuth } from "./AuthContext";
import "./QuoteCard.css";

interface Props {
  quote: Quote;
  displaySource?: boolean;
  onRefresh: () => void;
  user: User | null;
  theme?: QuoteCardTheme;
}

export interface QuoteCardTheme {
  explainButtonBorderColor?: string;
  explainButtonTextColor?: string;
  inputBorderColor?: string;
  inputBackgroundColor?: string;
  inputTextColor?: string;
  labelColor?: string;
  deleteBorderColor?: string;
  deleteTextColor?: string;
  cancelBorderColor?: string;
  cancelTextColor?: string;
  saveBackgroundColor?: string;
  saveTextColor?: string;
  explanationLabelColor?: string;
  explanationCloseColor?: string;
  explanationTextColor?: string;
}

interface State {
  isFlipped: boolean;
  flipMode: "edit" | "explain" | null;
  editQuote: string;
  editPageNum: string;
  isSaving: boolean;
}

const TEXTAREA_RESIZE_DELAY_MS = 10;
const FLIP_TRANSITION: Transition = {
  type: "spring",
  stiffness: 90,
  damping: 15,
  mass: 1.2,
};

type QuoteCardThemeVars = React.CSSProperties & Record<`--${string}`, string>;

function getQuoteCardThemeVars(theme?: QuoteCardTheme): QuoteCardThemeVars {
  const vars = {} as QuoteCardThemeVars;

  if (!theme) {
    return vars;
  }

  if (theme.explainButtonBorderColor) {
    vars["--quote-card-explain-border"] = theme.explainButtonBorderColor;
  }
  if (theme.explainButtonTextColor) {
    vars["--quote-card-explain-text"] = theme.explainButtonTextColor;
  }
  if (theme.inputBorderColor) {
    vars["--quote-card-input-border"] = theme.inputBorderColor;
  }
  if (theme.inputBackgroundColor) {
    vars["--quote-card-input-bg"] = theme.inputBackgroundColor;
  }
  if (theme.inputTextColor) {
    vars["--quote-card-input-text"] = theme.inputTextColor;
  }
  if (theme.labelColor) {
    vars["--quote-card-label"] = theme.labelColor;
  }
  if (theme.deleteBorderColor) {
    vars["--quote-card-delete-border"] = theme.deleteBorderColor;
  }
  if (theme.deleteTextColor) {
    vars["--quote-card-delete-text"] = theme.deleteTextColor;
  }
  if (theme.cancelBorderColor) {
    vars["--quote-card-cancel-border"] = theme.cancelBorderColor;
  }
  if (theme.cancelTextColor) {
    vars["--quote-card-cancel-text"] = theme.cancelTextColor;
  }
  if (theme.saveBackgroundColor) {
    vars["--quote-card-save-bg"] = theme.saveBackgroundColor;
  }
  if (theme.saveTextColor) {
    vars["--quote-card-save-text"] = theme.saveTextColor;
  }
  if (theme.explanationLabelColor) {
    vars["--quote-card-explanation-label"] = theme.explanationLabelColor;
  }
  if (theme.explanationCloseColor) {
    vars["--quote-card-explanation-close"] = theme.explanationCloseColor;
  }
  if (theme.explanationTextColor) {
    vars["--quote-card-explanation-text"] = theme.explanationTextColor;
  }

  return vars;
}

class QuoteCardClass extends React.Component<Props, State> {
  private textareaRef = React.createRef<HTMLTextAreaElement>();

  constructor(props: Props) {
    super(props);
    this.state = {
      isFlipped: false,
      flipMode: null,
      editQuote: props.quote.quote,
      editPageNum: props.quote.page_number
        ? props.quote.page_number.toString()
        : "",
      isSaving: false,
    };
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
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  toggleFlip = (mode: "edit" | "explain" = "edit", e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (mode === "edit" && !this.canEditOrDelete()) return;

    this.setState(
      (prevState) => ({
        isFlipped: !prevState.isFlipped,
        // Preserve the mode while flipping back so the UI doesn't switch mid-animation
        flipMode: !prevState.isFlipped ? mode : prevState.flipMode,
        editQuote: this.props.quote.quote,
        editPageNum: this.props.quote.page_number
          ? this.props.quote.page_number.toString()
          : "",
      }),
      () => {
        if (this.state.isFlipped && mode === "edit") {
          setTimeout(this.adjustTextareaHeight, TEXTAREA_RESIZE_DELAY_MS);
        }
      },
    );
  };

  handleFlipAnimationComplete = () => {
    if (!this.state.isFlipped && this.state.flipMode !== null) {
      this.setState({ flipMode: null });
    }
  };

  handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "editQuote") {
      this.setState({ editQuote: value }, () => {
        setTimeout(this.adjustTextareaHeight, TEXTAREA_RESIZE_DELAY_MS);
      });
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
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState({ isFlipped: false, isSaving: false });
          this.props.onRefresh();
        }
      });
  };

  handleDelete = () => {
    if (!window.confirm("Permanently delete this quote?")) return;

    request(`/api/quotes/${this.props.quote.id}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) this.props.onRefresh();
      });
  };

  getFaceClassName = (
    baseClassName: "quote-face-front" | "quote-face-back",
    isVisible: boolean,
  ) =>
    `${baseClassName} ${isVisible ? `${baseClassName}--visible` : `${baseClassName}--hidden`}`;

  renderEditForm = () => {
    const { editQuote, editPageNum, isSaving } = this.state;

    return (
      <form onSubmit={this.handleSave} className="quote-card-form">
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
            onClick={(e) => this.toggleFlip("edit", e)}
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
      <div className="quote-card-explanation">
        <div className="quote-card-explanation-header">
          <label className="quote-card-label quote-card-explanation-label">
            Gemini says:
          </label>

          <button
            type="button"
            onClick={(e) => this.toggleFlip("explain", e)}
            className="quote-card-explanation-close"
            aria-label="Close explanation"
          >
            <AppIcon name="close" className="quote-card-explanation-close-icon" />
          </button>
        </div>

        <div className="quote-card-explanation-scroll">
          <p className="quote-card-explanation-text">{quote.explanation}</p>
        </div>
      </div>
    );
  };

  render() {
    const { quote, displaySource, theme } = this.props;
    const { isFlipped, flipMode } = this.state;

    const hasPermission = this.canEditOrDelete();
    const showQuoteMeta =
      quote.page_number || (displaySource && quote.work) || quote.explanation;

    return (
      <motion.div
        layout
        className="quote-card-container"
        style={getQuoteCardThemeVars(theme)}
      >
        <motion.div
          className="quote-card-flipper"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={FLIP_TRANSITION}
          onAnimationComplete={this.handleFlipAnimationComplete}
        >
          <div
            className={this.getFaceClassName("quote-face-front", !isFlipped)}
          >
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
                      Gemini
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
                Tap to edit
              </button>
            )}
          </div>

          {(hasPermission || quote.explanation) && flipMode && (
            <div
              className={this.getFaceClassName("quote-face-back", isFlipped)}
            >
              {flipMode === "edit" ? this.renderEditForm() : this.renderExplanation()}
            </div>
          )}
        </motion.div>
      </motion.div>
    );
  }
}

// --- FUNCTIONAL WRAPPER ---
export const QuoteCard = (props: Omit<Props, "user">) => {
  const { user } = useAuth();
  return <QuoteCardClass {...props} user={user} />;
};

import React from "react";
import { Link } from "react-router-dom";

import { motion } from "framer-motion";
import type { Quote, User } from "../types";
import { request } from "../utils/APIClient";
import { useAuth } from "./AuthContext";

interface Props {
  quote: Quote;
  meta: "date" | "source";
  onRefresh: () => void;
  user: User | null;
}

interface State {
  isFlipped: boolean;
  editQuote: string;
  editPageNum: string;
  isSaving: boolean;
}

class QuoteCardClass extends React.Component<Props, State> {
  private textareaRef = React.createRef<HTMLTextAreaElement>();

  constructor(props: Props) {
    super(props);
    this.state = {
      isFlipped: false,
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

  toggleFlip = () => {
    if (!this.canEditOrDelete()) return;

    this.setState(
      {
        isFlipped: !this.state.isFlipped,
        editQuote: this.props.quote.quote,
        editPageNum: this.props.quote.page_number
          ? this.props.quote.page_number.toString()
          : "",
      },
      () => {
        if (this.state.isFlipped) {
          setTimeout(this.adjustTextareaHeight, 10);
        }
      },
    );
  };

  handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "editQuote") {
      this.setState({ editQuote: value }, () => {
        setTimeout(this.adjustTextareaHeight, 10);
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

  render() {
    const { quote, meta } = this.props;
    const { isFlipped, editQuote, editPageNum, isSaving } = this.state;

    const hasPermission = this.canEditOrDelete();
    const showQuoteMeta =
      quote.page_number ||
      (meta === "source" && quote.work) ||
      (meta === "date" && Date.parse(quote.created_at));

    return (
      <motion.div
        layout
        className="quote-card-container"
        style={{ position: "relative" }}
      >
        <motion.div
          className="quote-card-flipper"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 90, damping: 15, mass: 1.2 }}
          style={{ position: "relative", width: "100%" }}
        >
          <div
            className="quote-face-front"
            onClick={hasPermission ? this.toggleFlip : undefined}
            style={{
              position: isFlipped ? "absolute" : "relative",
              top: 0,
              left: 0,
              width: "100%",
              pointerEvents: isFlipped ? "none" : "auto",
              cursor: hasPermission ? "pointer" : "text",
            }}
          >
            <blockquote className="quote-text">{quote.quote}</blockquote>
            {showQuoteMeta && (
              <div className="quote-meta">
                {quote.page_number && (
                  <span className="quote-number">P{quote.page_number}</span>
                )}
                {meta === "source" && quote.work && (
                  <Link to={`/work/${quote.work.id}`} className="quote-source">
                    {quote.work.title}
                  </Link>
                )}
                {meta === "date" && Date.parse(quote.created_at) && (
                  <span className="quote-date">
                    {new Date(quote.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            )}

            {/* Only show the edit hint if they actually have permission to edit it */}
            {hasPermission && (
              <div className="quote-edit-hint">Click to edit</div>
            )}
          </div>

          {/* Only render the back face form if they have permission to prevent DOM bloat */}
          {hasPermission && (
            <div
              className="quote-face-back"
              style={{
                position: isFlipped ? "relative" : "absolute",
                top: 0,
                left: 0,
                width: "100%",
                pointerEvents: !isFlipped ? "none" : "auto",
              }}
            >
              <form
                onSubmit={this.handleSave}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  gap: "12px",
                }}
              >
                <textarea
                  ref={this.textareaRef}
                  name="editQuote"
                  value={editQuote}
                  onChange={this.handleInputChange}
                  style={{ ...styles.input, overflow: "hidden" }}
                  rows={4}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <label style={styles.label}>Pg.</label>
                    <input
                      name="editPageNum"
                      value={editPageNum}
                      onChange={this.handleInputChange}
                      style={{ ...styles.input, width: "60px", padding: "6px" }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={this.handleDelete}
                    style={styles.deleteBtn}
                  >
                    Delete
                  </button>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={this.toggleFlip}
                    style={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    style={styles.saveBtn}
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </motion.div>
      </motion.div>
    );
  }
}

// --- FUNCTIONAL WRAPPER ---
// Grabs the Auth hook and feeds the user into the Class Component
export const QuoteCard = (props: Omit<Props, "user">) => {
  const { user } = useAuth();
  return <QuoteCardClass {...props} user={user} />;
};

// Local styles tailored for the light, coarse paper background
const styles: { [key: string]: React.CSSProperties } = {
  input: {
    width: "100%",
    padding: "10px",
    borderRadius: "2px",
    border: "1px solid rgba(44, 40, 37, 0.3)",
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    color: "#2c2825",
    fontFamily: "inherit",
    fontSize: "14px",
    resize: "none",
    outline: "none",
    boxShadow: "inset 0 1px 4px rgba(0,0,0,0.05)",
  },
  label: {
    color: "rgba(44, 40, 37, 0.7)",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  deleteBtn: {
    backgroundColor: "transparent",
    border: "1px solid #d32f2f",
    color: "#d32f2f",
    padding: "6px 12px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "bold",
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "transparent",
    border: "1px solid rgba(44, 40, 37, 0.4)",
    color: "#2c2825",
    padding: "8px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#2c2825",
    border: "none",
    color: "#fdfbf7",
    padding: "8px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};

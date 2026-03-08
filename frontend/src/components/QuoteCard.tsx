import React from "react";
import { motion } from "framer-motion";
import type { Quote } from "../types";

interface Props {
  quote: Quote;
  workId: string;
  onRefresh: () => void;
}

interface State {
  isFlipped: boolean;
  editQuote: string;
  editPageNum: string;
  isSaving: boolean;
}

export class QuoteCard extends React.Component<Props, State> {
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

  adjustTextareaHeight = () => {
    const el = this.textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  toggleFlip = () => {
    // Reset state if they flip back without saving
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
    this.setState({ ...this.state, [e.target.name]: e.target.value }, () => {
      if (this.state.isFlipped && e.target.name === "editQuote") {
        setTimeout(this.adjustTextareaHeight, 10);
      }
    });
  };

  handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    this.setState({ isSaving: true });

    fetch(`/api/quotes/${this.props.quote.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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

    fetch(`/api/quotes/${this.props.quote.id}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) this.props.onRefresh();
      });
  };

  render() {
    const { quote } = this.props;
    const { isFlipped, editQuote, editPageNum, isSaving } = this.state;

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
            className="quote-face-front quote-card"
            onClick={this.toggleFlip}
            style={{
              position: isFlipped ? "absolute" : "relative",
              top: 0, // Pin to the top-left of the flipper
              left: 0, // Pin to the top-left of the flipper
              width: "100%",
              pointerEvents: isFlipped ? "none" : "auto",
            }}
          >
            <blockquote className="quote-text">{quote.quote}</blockquote>
            {quote.page_number && (
              <div className="quote-meta">
                <span className="quote-author">Page {quote.page_number}</span>
              </div>
            )}
            <div className="quote-edit-hint">Click to edit</div>
          </div>

          <div
            className="quote-face-back quote-card"
            style={{
              position: isFlipped ? "relative" : "absolute",
              top: 0, // Pin to the top-left of the flipper
              left: 0, // Pin to the top-left of the flipper
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
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
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
        </motion.div>
      </motion.div>
    );
  }
}

// Local styles tailored for the light, coarse paper background
const styles: { [key: string]: React.CSSProperties } = {
  input: {
    width: "100%",
    padding: "10px",
    borderRadius: "2px", // Match paper corners
    border: "1px solid rgba(44, 40, 37, 0.3)", // Pencil-like border
    backgroundColor: "rgba(255, 255, 255, 0.5)", // Translucent white over the coarse paper
    color: "#2c2825", // Ink color
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
    backgroundColor: "#2c2825", // Solid ink block
    border: "none",
    color: "#fdfbf7", // Paper-colored text inside the button
    padding: "8px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};

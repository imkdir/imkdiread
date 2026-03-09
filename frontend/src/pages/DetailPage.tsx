import React from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Masonry from "react-masonry-css";
import type { Work, Quote } from "../types";
import { request } from "../utils/APIClient";

import eyeIcon from "../assets/imgs/eye.svg";
import eyeFilledIcon from "../assets/imgs/eye-filled.svg";

import heartIcon from "../assets/imgs/heart.svg";
import heartFilledIcon from "../assets/imgs/heart-filled.svg";

import clockIcon from "../assets/imgs/clock.svg";
import clockFilledIcon from "../assets/imgs/clock-filled.svg";

import starIcon from "../assets/imgs/star.svg";
import starHalfIcon from "../assets/imgs/star-half.svg";
import starFilledIcon from "../assets/imgs/star-filled.svg";

import { GoodreadsButton } from "../components/GoodreadsButton";
import { DropboxButton } from "../components/DropboxButton";
import { ProgressBar } from "../components/ProgressBar";
import { KindleButton } from "../components/KindleButton";
import { QuoteCard } from "../components/QuoteCard";
import { FinderButton } from "../components/FinderButton";

interface Props {
  workId: string;
  initialWork?: Work;
}

interface State {
  work: Work | null;
  loading: boolean;
  read: boolean;
  liked: boolean;
  shelved: boolean;
  rating: number;
  hoverRating: number;
  isAddQuoteModalOpen: boolean;
  editingForm: {
    target: "quote" | "progress";
    quote: string;
    pageNumber: string;
  };
  isSavingQuote: boolean;
  isPDFViewerOpen: boolean;
  viewerInitialUrl: string | null;
  isActionDrawerOpen: boolean;
}

export function DetailPageWrapper() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialWork = location.state?.work as Work | undefined;

  return <DetailPage workId={id || ""} initialWork={initialWork} />;
}

class DetailPage extends React.Component<Props, State> {
  state: State = {
    work: this.props.initialWork || null,
    loading: !this.props.initialWork,
    read: !!this.props.initialWork?.read,
    liked: !!this.props.initialWork?.liked,
    shelved: !!this.props.initialWork?.shelved,
    rating: this.props.initialWork?.rating || 0,
    hoverRating: 0,
    isAddQuoteModalOpen: false,
    editingForm: {
      target: "quote",
      quote: "",
      pageNumber: "",
    },
    isSavingQuote: false,
    isPDFViewerOpen: false,
    viewerInitialUrl: null,
    isActionDrawerOpen: false,
  };

  componentDidMount() {
    this.fetchData();
    window.addEventListener("paste", this.handleGlobalPaste);
  }

  componentWillUnmount(): void {
    window.removeEventListener("paste", this.handleGlobalPaste);
  }

  handleGlobalPaste = (e: ClipboardEvent) => {
    // 1. If they are already typing in an input or textarea, let them paste normally!
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return;
    }

    // 2. Prevent the browser's default paste behavior
    e.preventDefault();

    // 3. Grab the raw text from the clipboard
    const pastedText = e.clipboardData?.getData("text/plain");

    if (pastedText && pastedText.trim().length > 0) {
      // 4. Pop open the quote modal and pre-fill the text!
      this.setState({
        ...this.state,
        isAddQuoteModalOpen: true,
        isSavingQuote: false,
        editingForm: {
          target: "quote",
          quote: pastedText.trim(),
          pageNumber: "", // They can type the page number themselves
        },
      });
    }
  };

  fetchData = () => {
    const { workId } = this.props;
    if (!workId) return;

    if (!this.state.work) {
      this.setState({ loading: true });
    }

    request(`/api/works/${encodeURIComponent(workId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          this.setState({ work: null, loading: false });
        } else {
          this.setState({
            ...this.state,
            work: data,
            loading: false,
            read: !!data.read,
            liked: !!data.liked,
            shelved: !!data.shelved,
            rating: data.rating || 0,
          });
        }
      })
      .catch((err) => {
        console.error("Failed to fetch work:", err);
        this.setState({ loading: false });
      });
  };

  toggleActionDrawer = () => {
    this.setState({
      ...this.state,
      isActionDrawerOpen: !this.state.isActionDrawerOpen,
    });
  };

  toggleAction = (action: "read" | "liked" | "shelved") => {
    const newValue = !this.state[action];
    this.setState(
      (prevState) => ({ ...prevState, [action]: newValue }) as State,
    );

    request(`/api/works/${encodeURIComponent(this.props.workId)}`, {
      method: "POST",
      body: JSON.stringify({ action, value: newValue }),
    }).catch((err) => console.error("Failed to update action:", err));
  };

  handleStarMouseMove = (
    e: React.MouseEvent<HTMLImageElement>,
    starIndex: number,
  ) => {
    // Get the cursor's exact X position inside the 24px star
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // If cursor is on the left half (< 12px), it's a half rating. Otherwise, full rating.
    const newHoverRating = x < 12 ? starIndex * 2 - 1 : starIndex * 2;

    if (this.state.hoverRating !== newHoverRating) {
      this.setState({ hoverRating: newHoverRating });
    }
  };

  handleStarClick = () => {
    const newRating = this.state.hoverRating;
    this.setState({ rating: newRating });

    request(`/api/works/${encodeURIComponent(this.props.workId)}`, {
      method: "POST",
      body: JSON.stringify({ action: "rating", value: newRating }),
    }).catch((err) => console.error("Failed to update rating:", err));
  };

  getEditEmptyForm = (target: "quote" | "progress") => {
    let pageNumber = "";
    if (target === "progress") {
      const current_page = this.state.work?.current_page || 0;
      pageNumber = current_page ? String(current_page) : "";
    }
    return {
      target,
      quote: "",
      pageNumber,
    };
  };

  openEditFormModal = (target: "quote" | "progress") => {
    this.setState({
      ...this.state,
      isAddQuoteModalOpen: true,
      editingForm: this.getEditEmptyForm(target),
      isSavingQuote: false,
    });
  };

  handleQuoteInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    this.setState((prevState) => ({
      ...this.state,
      editingForm: {
        ...prevState.editingForm,
        [name]: value,
      },
    }));
  };

  handleAddQuote = (e: React.FormEvent) => {
    e.preventDefault();

    if (this.state.editingForm.target === "quote") {
      this.setState({ isSavingQuote: true });

      setTimeout(() => {
        this.submitQuoteToDB();
      }, 1200);
    } else {
      this.submitProgressToDB();
    }
  };

  handleProgressFinished = () => {
    const note = this.state.editingForm.quote.trim();

    request(
      `/api/works/${encodeURIComponent(this.props.workId)}/progress/finish`,
      {
        method: "POST",
        body: JSON.stringify({ note }),
      },
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState({
            ...this.state,
            read: true,
            shelved: false,
            editingForm: this.getEditEmptyForm("quote"),
            isAddQuoteModalOpen: false,
          });
          this.fetchData();
        }
      })
      .catch((err) => {
        console.error("Failed to finish work:", err);
      });
  };

  submitQuoteToDB = () => {
    const { quote: rawQuote, pageNumber } = this.state.editingForm;
    const quote = rawQuote.trim();
    const parsedPageNumber = pageNumber.trim().length
      ? Number(pageNumber)
      : null;

    request(`/api/works/${encodeURIComponent(this.props.workId)}/quotes`, {
      method: "POST",
      body: JSON.stringify({
        quote,
        pageNumber: parsedPageNumber,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState({
            ...this.state,
            editingForm: this.getEditEmptyForm("quote"),
            isAddQuoteModalOpen: false,
            isSavingQuote: false,
          });
          this.fetchData();
        }
      })
      .catch((err) => {
        console.error("Failed to save quote:", err);
        this.setState({ isSavingQuote: false });
      });
  };

  submitProgressToDB = () => {
    const { quote, pageNumber } = this.state.editingForm;
    const parsedPageNumber = Number(pageNumber);

    request(`/api/works/${encodeURIComponent(this.props.workId)}/progress`, {
      method: "POST",
      body: JSON.stringify({
        note: quote.trim(),
        pageNumber: parsedPageNumber,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState({
            ...this.state,
            read: !!data.read,
            shelved: false,
            editingForm: this.getEditEmptyForm("quote"),
            isAddQuoteModalOpen: false,
          });
          this.fetchData();
        }
      })
      .catch((err) => {
        console.error("Failed to save progress:", err);
      });
  };

  closeaddQuoteModal = () => {
    this.setState({
      ...this.state,
      isAddQuoteModalOpen: false,
      editingForm: this.getEditEmptyForm("quote"),
    });
  };

  togglePDFViewer = (source: "local" | "dropbox") => {
    const { work, isPDFViewerOpen } = this.state;

    if (isPDFViewerOpen || !work) return;

    let initialUrl = null;

    if (source === "local") {
      const pdfParams = ["view=FitH"];

      if (work.current_page) {
        pdfParams.unshift(`page=${work.current_page}`); // unshift puts it at the front!
      }

      initialUrl = `${work.file_url}#${pdfParams.join("&")}`;
    } else if (source === "dropbox" && work.dropbox_link) {
      initialUrl = work.dropbox_link;
    }

    this.setState({
      ...this.state,
      isPDFViewerOpen: true,
      viewerInitialUrl: initialUrl,
    });
  };

  render() {
    const {
      work,
      loading,
      read,
      liked,
      shelved,
      rating,
      hoverRating,
      isAddQuoteModalOpen,
      editingForm,
      isPDFViewerOpen,
      viewerInitialUrl,
    } = this.state;

    if (loading || !work) return <div />;

    const displayRating = hoverRating > 0 ? hoverRating : rating;
    const isEditProgress = editingForm.target === "progress";

    const quotes = work.quotes || [];
    const displayQuotes = quotes.filter(
      (q) => q.quote.trim().length > 0 && !q.quote.startsWith("@notes:"),
    );

    return (
      <div style={styles.page}>
        <motion.div
          className="detail-backdrop-gradient"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        />

        <div style={styles.splitViewContainer}>
          {/* --- MAIN CONTENT --- */}
          <div style={styles.mainContentPane}>
            <div
              className={`detail-content-wrapper ${isPDFViewerOpen ? "pdf-open-wrap" : ""}`}
            >
              {/* LEFT COLUMN */}
              <aside className="detail-left-col">
                <motion.img
                  layoutId={`work-cover-${work.id}`}
                  src={work.cover_img_url as string}
                  alt={work.id}
                  className="work-cover-img"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              </aside>

              {/* MIDDLE COLUMN */}
              <motion.main
                className="detail-middle-col"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <div>
                  {/* Title */}
                  <h1 className="detail-title">
                    {work.title || "Untitled Work"}
                  </h1>

                  {/* Goodreads, Authors, Tags */}
                  <div style={styles.metadata}>
                    {!work.goodreads_id || (
                      <GoodreadsButton
                        category="book"
                        goodreadsId={work.goodreads_id}
                      />
                    )}

                    {work.authors.map((author) => (
                      <Link
                        key={author}
                        to={`/collection/${encodeURIComponent(author)}`}
                        className="pill-button"
                        style={styles.author}
                      >
                        {author}
                      </Link>
                    ))}

                    {work.tags.map((tag) => (
                      <Link
                        key={tag}
                        to={`/search?q=${encodeURIComponent(tag)}`}
                        className="pill-button"
                        style={styles.tag}
                      >
                        {tag}
                      </Link>
                    ))}

                    {!work.file_url || (
                      <FinderButton
                        onClick={() => this.togglePDFViewer("local")}
                      />
                    )}

                    {!work.dropbox_link || (
                      <DropboxButton
                        onClick={() => this.togglePDFViewer("dropbox")}
                      />
                    )}

                    {!work.amazon_asin || (
                      <KindleButton asin={work.amazon_asin} />
                    )}
                  </div>
                </div>
              </motion.main>

              {/* RIGHT COLUMN: Action Panel (Letterboxd Style) */}

              {/* RIGHT COLUMN (The Hybrid Drawer) */}
              <aside
                className={`detail-right-col ${this.state.isActionDrawerOpen ? "drawer-open" : "drawer-closed"}`}
              >
                {/* The Handle (Hidden by default, shown via CSS in overlay mode) */}
                <button
                  className="drawer-handle"
                  onClick={this.toggleActionDrawer}
                >
                  <span style={{ fontSize: "12px", marginBottom: "4px" }}>
                    {this.state.isActionDrawerOpen ? "▶" : "◀"}
                  </span>
                  <span>Menu</span>
                </button>

                <div style={styles.actionPanel}>
                  {/* Action Icons Row */}
                  <div style={styles.actionIconsRow}>
                    <div
                      style={styles.actionIconCol}
                      onClick={() => this.toggleAction("read")}
                    >
                      <img
                        src={read ? eyeFilledIcon : eyeIcon}
                        alt="Read"
                        style={styles.icon}
                      />
                      <span style={styles.actionLabel}>Read</span>
                    </div>
                    <div
                      style={styles.actionIconCol}
                      onClick={() => this.toggleAction("liked")}
                    >
                      <img
                        src={liked ? heartFilledIcon : heartIcon}
                        alt="Like"
                        style={styles.icon}
                      />
                      <span style={styles.actionLabel}>
                        {liked ? "Liked" : "Like"}
                      </span>
                    </div>
                    <div
                      style={styles.actionIconCol}
                      onClick={() => this.toggleAction("shelved")}
                    >
                      <img
                        src={shelved ? clockFilledIcon : clockIcon}
                        alt="Shelve"
                        style={styles.icon}
                      />
                      <span style={styles.actionLabel}>
                        {shelved ? "Shelved" : "Shelve"}
                      </span>
                    </div>
                  </div>

                  <hr style={styles.divider} />

                  {/* Rating Row */}
                  <div style={styles.ratingSection}>
                    <span style={styles.actionLabel}>Rate</span>
                    <div
                      style={styles.starsRow}
                      onMouseLeave={() => this.setState({ hoverRating: 0 })}
                    >
                      {[1, 2, 3, 4, 5].map((starIndex) => {
                        // Determine which SVG to render based on the 10-point scale
                        let iconSrc = starIcon;
                        if (displayRating >= starIndex * 2)
                          iconSrc = starFilledIcon;
                        else if (displayRating === starIndex * 2 - 1)
                          iconSrc = starHalfIcon;

                        // Is it active at all? (If yes, color it blue)
                        const isActive = displayRating >= starIndex * 2 - 1;

                        return (
                          <img
                            key={starIndex}
                            src={iconSrc}
                            alt={`${starIndex} Star`}
                            style={{
                              ...styles.starIcon,
                              filter: isActive
                                ? "invert(58%) sepia(87%) saturate(1512%) hue-rotate(167deg) brightness(101%) contrast(92%)" // Blue
                                : "none",
                              opacity: isActive ? 1 : 0.3,
                            }}
                            onMouseMove={(e) =>
                              this.handleStarMouseMove(e, starIndex)
                            }
                            onClick={() => this.handleStarClick()}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <hr style={styles.divider} />

                  <div style={styles.actionRow}>
                    <button
                      onClick={() => this.openEditFormModal("quote")}
                      style={styles.actionButton}
                    >
                      <span style={styles.actionLabel}>{"Add quotes..."}</span>
                    </button>
                  </div>

                  <hr style={styles.divider} />

                  <div style={styles.actionRow}>
                    <ProgressBar work={work} />
                    <button
                      onClick={() => this.openEditFormModal("progress")}
                      style={styles.actionButton}
                    >
                      <span style={styles.actionLabel}>
                        {"Update progress"}
                      </span>
                    </button>
                  </div>

                  {!isPDFViewerOpen || <hr style={styles.divider} />}
                  {!isPDFViewerOpen || (
                    <div style={styles.actionRow}>
                      <button
                        onClick={() =>
                          this.setState({
                            ...this.state,
                            isPDFViewerOpen: false,
                          })
                        }
                        style={styles.actionButton}
                      >
                        <span style={styles.actionLabel}>
                          {"Exit PDF Viewer"}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </div>

            {/* Quotes Grid (Now using Masonry!) */}
            {!displayQuotes.length || (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                style={{ marginTop: isPDFViewerOpen ? "32px" : "48px" }}
              >
                <Masonry
                  // THE MAGIC: If PDF is open, force 1 column.
                  // Otherwise, natively adapt to the screen size!
                  breakpointCols={
                    isPDFViewerOpen
                      ? { default: 1 }
                      : { default: 3, 1400: 2, 900: 1 }
                  }
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
                >
                  {displayQuotes.map((quote) => (
                    <QuoteCard
                      key={quote.id}
                      quote={quote as Quote}
                      workId={this.props.workId}
                      onRefresh={this.fetchData}
                    />
                  ))}
                </Masonry>
              </motion.div>
            )}
          </div>

          {/* 3. THE PDF VIEWER PANE (Right Side / Wraps to Bottom) */}
          {isPDFViewerOpen && (
            <div className="pdf-viewer-pane">
              {/* The PDF iframe */}
              <div style={{ flex: 1 }}>
                <iframe
                  src={viewerInitialUrl as string}
                  width="100%"
                  height="100%"
                  style={{ border: "none" }}
                />
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {isAddQuoteModalOpen && (
            <motion.div
              style={styles.modalOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                style={{
                  perspective: "1200px",
                  width: "100%",
                  maxWidth: "400px",
                }}
              >
                <motion.div
                  className="quote-card-flipper"
                  initial={{ scale: 0.8, rotateY: 180, y: 50 }}
                  animate={{
                    scale: 1,
                    rotateY: this.state.isSavingQuote ? 0 : 180,
                    y: 0,
                  }}
                  exit={
                    this.state.isSavingQuote
                      ? { scale: 0.3, y: 400, opacity: 0 }
                      : {
                          scale: 0.9,
                          opacity: 0,
                          transition: { duration: 0.2 },
                        }
                  }
                  transition={{
                    type: "spring",
                    stiffness: 90,
                    damping: 15,
                    mass: 1.2,
                  }}
                  /* FIX 1: Removed minHeight: "250px" so it can shrink/grow natively */
                  style={{ position: "relative", width: "100%" }}
                >
                  {/* --- FRONT FACE (Quote Preview) --- */}
                  <div
                    className="quote-face-front quote-card"
                    style={{
                      /* FIX 2: Dynamic position */
                      position: this.state.isSavingQuote
                        ? "relative"
                        : "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      /* Removed height: "100%" */
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <blockquote className="quote-text">
                      {editingForm.quote}
                    </blockquote>
                    {editingForm.pageNumber && (
                      <div className="quote-meta">
                        <span className="quote-author">
                          Page {editingForm.pageNumber}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* --- BACK FACE (The Edit Form) --- */}
                  <div
                    className="quote-face-back quote-card"
                    style={{
                      /* FIX 3: Dynamic position */
                      position: !this.state.isSavingQuote
                        ? "relative"
                        : "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      /* Removed height: "100%" */
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <form
                      onSubmit={this.handleAddQuote}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        /* FIX 4: Removed height: "100%" */
                        gap: "12px",
                      }}
                    >
                      {isEditProgress ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <label style={styles.secondaryLabel}>
                              {"Currently on"}
                            </label>

                            <input
                              name="pageNumber"
                              required
                              value={editingForm.pageNumber}
                              placeholder={"p."}
                              onChange={this.handleQuoteInputChange}
                              style={{
                                ...styles.input,
                                width: "36px",
                                padding: "2px 4px",
                              }}
                              autoFocus
                            />

                            <label style={styles.secondaryLabel}>
                              {`of ${work.page_count}`}
                            </label>
                          </div>
                          <button
                            type="button"
                            style={styles.finishedBtn}
                            onClick={this.handleProgressFinished}
                          >
                            I'm finished!
                          </button>
                        </div>
                      ) : (
                        <h3
                          style={{
                            margin: "0 0 8px 0",
                            color: "#2c2825",
                            fontSize: "16px",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {"Add Quote"}
                        </h3>
                      )}

                      <textarea
                        name="quote"
                        value={editingForm.quote}
                        onChange={this.handleQuoteInputChange}
                        style={{
                          ...styles.input,
                          flex: 1,
                          minHeight: "120px",
                          resize: "none",
                        }}
                        placeholder={
                          isEditProgress
                            ? "Type your notes here..."
                            : "Paste your quote here..."
                        }
                        autoFocus={!isEditProgress}
                        required={!isEditProgress}
                      />

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        {!isEditProgress && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <label style={styles.label}>Pg.</label>
                            <input
                              name="pageNumber"
                              value={editingForm.pageNumber}
                              onChange={this.handleQuoteInputChange}
                              style={{
                                ...styles.input,
                                width: "60px",
                                padding: "6px",
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          marginTop: "auto",
                        }}
                      >
                        <button
                          type="button"
                          onClick={this.closeaddQuoteModal}
                          style={styles.cancelBtn}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={this.state.isSavingQuote}
                          style={styles.saveBtn}
                        >
                          {this.state.isSavingQuote
                            ? "Saving..."
                            : isEditProgress
                              ? "Update"
                              : "Add"}
                        </button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--goodreads-dark)",
    color: "var(--goodreads-light)",
    fontFamily: "-apple-system, system-ui, sans-serif",
    position: "relative",
    padding: "0 28px",
  },

  splitViewContainer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start", // Crucial: allows the sticky PDF to work
    gap: "40px",
    maxWidth: "1800px", // Wider to accommodate the side-by-side layout
    margin: "0 auto",
    padding: "80px 0",
  },

  // The Left Side
  mainContentPane: {
    // flex-grow: 1, flex-shrink: 1, flex-basis: 500px
    // Means: Try to be 500px wide. Grow if there's extra space.
    // If the screen is smaller than 500px + PDF width, trigger the wrap.
    flex: "1 1 500px",
    minWidth: "320px",
    maxWidth: "1080px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
  },

  metadata: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    maxWidth: "800px",
  },

  author: {
    backgroundColor: "var(--goodreads-light)",
    color: "var(--goodreads-dark)",
  },
  tag: {
    backgroundColor: "transparent",
    color: "var(--goodreads-light)",
    border: "1px solid var(--goodreads-light)",
  },

  // --- RIGHT COLUMN (Action Panel) ---
  actionPanel: {
    backgroundColor: "var(--goodreads-dark)",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden",
    boxShadow: "0 5px 15px rgba(0,0,0,0.5)",
  },
  actionIconsRow: {
    display: "flex",
    gap: "24px",
    padding: "24px",
  },
  actionIconCol: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    cursor: "pointer",
    gap: "6px",
  },
  icon: {
    width: "26px",
    height: "26px",
  },
  actionRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px",
  },
  actionButton: {
    border: "none",
    backgroundColor: "transparent",
  },
  actionLabel: {
    fontSize: "13px",
    fontFamily: "-apple-system, system-ui",
    color: "var(--goodreads-light)",
    fontWeight: "500",
  },

  divider: {
    margin: 0,
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
  },

  ratingSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px",
  },
  starsRow: {
    display: "flex",
    gap: "4px",
    cursor: "pointer",
    marginTop: "8px",
  },
  starIcon: { width: "24px", height: "24px", transition: "all 0.1s" },

  /* --- BOTTOM --- */
  quotesGrid: {
    marginTop: "48px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "16px",
  },

  quoteCard: {
    position: "relative",
    padding: "16px 24px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: "8px",
  },

  /* --- OVERLAYS --- */
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 6000,
  },

  input: {
    width: "100%",
    padding: "10px",
    borderRadius: "2px",
    border: "1px solid rgba(44, 40, 37, 0.3)",
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    color: "#2c2825",
    fontFamily: "inherit",
    fontSize: "14px",
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
  secondaryLabel: {
    fontSize: "14px",
    fontFamily: "inherit",
    color: "var(--goodreads-dark)",
  },
  finishedBtn: {
    border: "none",
    backgroundColor: "transparent",
    textDecorationLine: "underline",
    fontSize: "14px",
    fontFamily: "Fredoka",
    color: "#01635d",
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

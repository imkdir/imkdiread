import React, { Component } from "react";
import { Link } from "react-router-dom";
import Masonry from "react-masonry-css";
import { request } from "../utils/APIClient";
import type { Work, Quote, User } from "../types";

import photoIcon from "../assets/imgs/instagram.svg";

interface RichQuote extends Quote {
  work?: Work;
}

interface PageState {
  user: User | null;
  reading: Work[];
  favorites: Work[];
  shelved: Work[];
  quotes: RichQuote[];
  isLoading: boolean;
  email: string;
  isEmailPublic: boolean;
  isEditing: boolean;
}

export class ProfilePage extends Component<Record<string, never>, PageState> {
  private fileInputRef = React.createRef<HTMLInputElement>();
  private emailInputRef = React.createRef<HTMLInputElement>();

  constructor(props: Record<string, never>) {
    super(props);
    this.state = {
      user: null,
      reading: [],
      favorites: [],
      shelved: [],
      quotes: [],
      isLoading: true,
      email: "",
      isEmailPublic: false,
      isEditing: false,
    };
  }

  componentDidMount() {
    this.fetchProfileData();
  }

  fetchProfileData = async () => {
    try {
      const res = await request("/api/profile/me");
      const data = await res.json();

      this.setState(
        {
          user: data.userInfo,
          reading: data.reading || [],
          favorites: data.favorites || [],
          shelved: data.shelved || [],
          quotes: data.quotes || [],
          email: data.userInfo?.email || "",
          isEmailPublic: Boolean(data.userInfo?.is_email_public),
          isLoading: false,
        },
        this.adjustTextInputWidth,
      );
    } catch (err: unknown) {
      console.error("Failed to load profile", err);
      this.setState({ isLoading: false });
    }
  };

  handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await request("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        this.setState((prevState) => ({
          user: prevState.user
            ? { ...prevState.user, avatar_url: data.avatar_url }
            : null,
        }));
      }
    } catch {
      alert("Failed to upload avatar, reason");
    }
  };

  checkEditingState = () => {
    const { user, email, isEmailPublic } = this.state;
    const isEditing =
      (user?.email || "") != email ||
      Boolean(user?.is_email_public) != isEmailPublic;
    this.setState({ isEditing });
  };

  adjustTextInputWidth = () => {
    const el = this.emailInputRef.current;
    if (el) {
      el.style.width = "auto";
      el.style.width = `${el.scrollWidth}px`;
    }
  };

  handleSaveSettings = async () => {
    const { email, isEmailPublic: is_email_public } = this.state;

    try {
      const res = await request("/api/profile/me", {
        method: "PUT",
        body: JSON.stringify({
          email,
          is_email_public,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save settings.");
      }

      alert("Settings saved successfully.");
      this.setState((prevState) => ({
        user: data.user || prevState.user,
        isEditing: false,
        email: data.user?.email ?? email,
        isEmailPublic: data.user?.is_email_public ?? is_email_public,
      }));
    } catch {
      alert("Failed to save settings.");
    }
  };

  render() {
    const {
      user,
      reading,
      favorites,
      shelved,
      quotes,
      isLoading,
      email,
      isEmailPublic,
      isEditing,
    } = this.state;

    if (isLoading) return <div style={styles.loading} />;

    return (
      <div style={styles.page}>
        {/* --- HEADER & AVATAR --- */}
        <div style={styles.headerContainer}>
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            style={{ display: "none" }}
            ref={this.fileInputRef}
            onChange={this.handleAvatarUpload}
          />

          <div
            onClick={() => this.fileInputRef.current?.click()}
            style={styles.avatarWrapper}
            title="Click to change avatar"
          >
            <img
              src={user?.avatar_url ?? photoIcon}
              alt="Avatar"
              style={{
                ...styles.avatarImg,
                padding: user?.avatar_url ? "0" : "20px",
              }}
            />
          </div>

          <div>
            <h1 style={styles.username}>{user?.username ?? ""}</h1>
            <div style={styles.inputWrapper}>
              <input
                ref={this.emailInputRef}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  this.setState(
                    { email: e.target.value },
                    this.checkEditingState,
                  );
                  this.adjustTextInputWidth();
                }}
                style={styles.input}
              />
              <input
                type="checkbox"
                checked={isEmailPublic}
                onChange={(e) =>
                  this.setState(
                    {
                      isEmailPublic: e.target.checked,
                    },
                    this.checkEditingState,
                  )
                }
                style={styles.checkbox}
                title="Check for public email"
              />
            </div>
            {isEditing && (
              <button
                type="button"
                style={styles.saveBtn}
                onClick={this.handleSaveSettings}
              >
                Save changes
              </button>
            )}
          </div>
        </div>

        <div style={styles.shelvesSection}>
          {/* --- CURRENTLY READING --- */}
          <section style={styles.shelf}>
            <h2 style={styles.sectionHeader}>Reading ({reading.length})</h2>
            {reading.length === 0 ? (
              <p style={styles.emptyText}>Not reading anything right now.</p>
            ) : (
              <div>
                {reading.map((work) => (
                  <Link
                    key={work.id}
                    to={`/work/${work.id}`}
                    style={styles.title}
                  >
                    <span>{work.title}</span>
                    <div style={styles.progressTrack}>
                      <div
                        style={{
                          ...styles.progressBar,
                          width: `${((work.current_page || 0) / work.page_count) * 100}%`,
                        }}
                      />
                    </div>
                    <p style={styles.progressText}>
                      Pg. {work.current_page || 0} / {work.page_count}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* --- FAVORITES --- */}
          <section style={styles.shelf}>
            <h2 style={styles.sectionHeader}>Favorites ({favorites.length})</h2>
            {favorites.length === 0 ? (
              <p style={styles.emptyText}>No favorites yet.</p>
            ) : (
              <ul>
                {favorites.map((work) => (
                  <li key={work.id}>
                    <Link to={`/work/${work.id}`} style={styles.title}>
                      {work.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* --- SHELVED --- */}
          <section style={styles.shelf}>
            <h2 style={styles.sectionHeader}>Shelved ({shelved.length})</h2>
            {shelved.length === 0 ? (
              <p style={styles.emptyText}>Nothing shelved yet.</p>
            ) : (
              <ul>
                {shelved.map((work) => (
                  <li key={work.id}>
                    <Link to={`/work/${work.id}`} style={styles.title}>
                      {work.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        {/* --- MY QUOTES --- */}
        <section>
          <h2 style={styles.sectionHeader}>
            My Highlights & Quotes ({quotes.length})
          </h2>
          {quotes.length === 0 ? (
            <p style={styles.emptyText}>No quotes saved yet.</p>
          ) : (
            <Masonry
              breakpointCols={{ default: 3, 900: 2, 600: 1 }}
              className="my-masonry-grid"
              columnClassName="my-masonry-grid_column"
            >
              {quotes.map((quote) => (
                <div key={quote.id} style={styles.quoteCard}>
                  <p style={styles.quoteText}>{quote.quote}</p>
                  <div style={styles.quoteMeta}>
                    <span style={styles.quoteDate}>
                      {new Date(quote.created_at).toLocaleDateString()}
                    </span>
                    {quote.work && (
                      <Link
                        to={`/work/${quote.work.id}`}
                        style={styles.quoteSource}
                      >
                        {quote.work.title}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </Masonry>
          )}
        </section>
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    padding: "40px",
    maxWidth: "1200px",
    margin: "0 auto",
    color: "var(--text-main)",
  },
  loading: {
    textAlign: "center",
    marginTop: "100px",
    color: "var(--link-blue)",
  },
  headerContainer: {
    display: "flex",
    alignItems: "flex-start",
    marginBottom: "40px",
    gap: "24px",
  },
  avatarWrapper: {
    width: "120px",
    height: "120px",
    borderRadius: "50%",
    cursor: "pointer",
    overflow: "hidden",
    position: "relative",
    border: "2px solid var(--border-subtle)",
    flexShrink: 0,
  },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  username: {
    margin: "12px 0",
    fontSize: "30px",
  },
  inputWrapper: {
    position: "relative",
    margin: "12px 0",
    borderRadius: "6px",
    border: "1px solid var(--border-main)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  input: {
    padding: "6px",
    color: "var(--text-main)",
    background: "transparent",
    outline: "none",
    border: "none",
  },
  checkbox: {
    position: "absolute",
    top: "4px",
    right: "4px",
  },
  saveBtn: {
    border: "none",
    backgroundColor: "transparent",
    textDecorationLine: "underline",
    fontSize: "14px",
    fontFamily: "Fredoka",
    color: "var(--goodreads-light)",
    cursor: "pointer",
  },
  shelvesSection: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: "60px",
    marginBottom: "64px",
  },
  shelf: {
    flex: 1,
    minWidth: "300px",
  },
  title: {
    textDecoration: "none",
    fontFamily: "Fredoka",
    color: "var(--goodreads-light)",
  },
  sectionHeader: {
    marginBottom: "24px",
    fontSize: "20px",
    fontFamily: "Fredoka",
  },
  emptyText: { color: "var(--text-muted)" },
  progressTrack: {
    width: "100%",
    backgroundColor: "var(--bg-elevated)",
    height: "6px",
    borderRadius: "3px",
    marginTop: "8px",
    overflow: "hidden",
  },
  progressBar: {
    backgroundColor: "var(--logo-green)",
    height: "100%",
    borderRadius: "3px",
  },
  progressText: {
    fontSize: "12px",
    color: "var(--text-muted)",
    marginTop: "4px",
    textAlign: "right",
  },
  quoteCard: {
    border: "1px solid var(--border-subtle)",
    borderRadius: "16px",
    padding: "18px",
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    maxWidth: "500px",
  },
  quoteMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    alignItems: "flex-end",
    borderTop: "1px solid var(--border-subtle)",
    paddingTop: "12px",
  },
  quoteText: {
    margin: 0,
    lineHeight: 1.6,
    color: "var(--goodreads-light)",
  },
  quoteDate: {
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    fontSize: "13px",
  },
  quoteSource: {
    color: "var(--logo-green)",
    fontFamily: "Fredoka",
    textDecoration: "none",
    fontSize: "16px",
    fontWeight: 600,
  },
};

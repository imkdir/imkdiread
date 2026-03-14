import React, { Component } from "react";
import { Link } from "react-router-dom";
import Masonry from "react-masonry-css";
import { AppIcon } from "../components/AppIcon";
import { request } from "../utils/APIClient";
import type { Work, Quote, User } from "../types";
import { profilePageStyles as styles } from "./profilePageStyles";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./ProfilePage.css";

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
      const data = await readJsonSafe<{
        error?: string;
        userInfo?: User | null;
        reading?: Work[];
        favorites?: Work[];
        shelved?: Work[];
        quotes?: RichQuote[];
      }>(res);
      if (!res.ok || !data?.userInfo) {
        throw new Error(getApiErrorMessage(data, "Failed to load profile."));
      }

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
      showToast("Failed to load profile.", { tone: "error" });
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

      const data = await readJsonSafe<{
        success?: boolean;
        error?: string;
        avatar_url?: string;
      }>(res);
      if (!res.ok || !data?.success || !data.avatar_url) {
        throw new Error(getApiErrorMessage(data, "Failed to upload avatar."));
      }
      this.setState((prevState) => ({
        user: prevState.user
          ? { ...prevState.user, avatar_url: data.avatar_url }
          : null,
      }));
      showToast("Avatar updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to upload avatar.",
        { tone: "error" },
      );
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

      const data = await readJsonSafe<{
        error?: string;
        user?: User;
      }>(res);
      if (!res.ok || !data?.user) {
        throw new Error(getApiErrorMessage(data, "Failed to save settings."));
      }

      showToast("Settings saved successfully.", { tone: "success" });
      this.setState((prevState) => ({
        user: data.user || prevState.user,
        isEditing: false,
        email: data.user?.email ?? email,
        isEmailPublic: data.user?.is_email_public ?? is_email_public,
      }));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save settings.",
        { tone: "error" },
      );
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

    if (isLoading) return <div className="profile-page" style={styles.loading} />;

    return (
      <div className="profile-page" style={styles.page}>
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
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" style={styles.avatarImg} />
            ) : (
              <AppIcon
                name="instagram"
                title="Avatar"
                size={60}
                style={{ ...styles.avatarImg, padding: "20px" }}
              />
            )}
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

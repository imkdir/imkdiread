import { Component } from "react";
import { Link, useParams } from "react-router-dom";
import { AppIcon } from "../components/AppIcon";
import { request } from "../utils/APIClient";
import type { Work, User } from "../types";
import { profilePageStyles as styles } from "./profilePageStyles";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./ProfilePage.css";

interface PageState {
  user: User | null;
  reading: Work[];
  favorites: Work[];
  shelved: Work[];
  isLoading: boolean;
  notFound: boolean;
}

export function PublicProfilePageWrapper() {
  const { username } = useParams<{ username: string }>();
  return <PublicProfilePage username={username || ""} />;
}

export class PublicProfilePage extends Component<
  { username: string },
  PageState
> {
  state: PageState = {
    user: null,
    reading: [],
    favorites: [],
    shelved: [],
    isLoading: true,
    notFound: false,
  };

  componentDidMount() {
    this.fetchProfileData();
  }

  componentDidUpdate(prevProps: { username: string }) {
    if (prevProps.username !== this.props.username) {
      this.setState(
        {
          user: null,
          reading: [],
          favorites: [],
          shelved: [],
          isLoading: true,
          notFound: false,
        },
        this.fetchProfileData,
      );
    }
  }

  fetchProfileData = async () => {
    try {
      const res = await request(
        `/api/profiles/${encodeURIComponent(this.props.username)}`,
      );

      const data = await readJsonSafe<{
        error?: string;
        userInfo?: User | null;
        reading?: Work[];
        favorites?: Work[];
        shelved?: Work[];
      }>(res);

      if (res.status === 404) {
        this.setState({ isLoading: false, notFound: true });
        return;
      }
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(data, "Failed to load public profile."),
        );
      }

      this.setState({
        user: data?.userInfo || null,
        reading: data?.reading || [],
        favorites: data?.favorites || [],
        shelved: data?.shelved || [],
        isLoading: false,
        notFound: false,
      });
    } catch (err: unknown) {
      console.error("Failed to load public profile", err);
      this.setState({ isLoading: false, notFound: true });
      showToast("Failed to load public profile.", { tone: "error" });
    }
  };

  render() {
    const { user, reading, favorites, shelved, isLoading, notFound } =
      this.state;

    if (isLoading) return <div className="profile-page" style={styles.loading} />;

    if (notFound || !user) {
      return (
        <div className="profile-page" style={styles.page}>
          <section style={styles.shelf}>
            <h1 style={styles.username}>Profile not found</h1>
            <p style={styles.emptyText}>
              We could not find a public profile for this user.
            </p>
          </section>
        </div>
      );
    }

    return (
      <div className="profile-page" style={styles.page}>
        <div style={styles.headerContainer}>
          <div style={{ ...styles.avatarWrapper, cursor: "default" }}>
            {user.avatar_url ? (
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
            <h1 style={styles.username}>{user.username}</h1>
            {!user.email || <p style={styles.publicMeta}>{user.email}</p>}
          </div>
        </div>

        <div style={styles.shelvesSection}>
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
      </div>
    );
  }
}

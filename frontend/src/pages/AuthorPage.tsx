import React from "react";
import { useParams } from "react-router-dom";
import { type Work, type Author, type Quote } from "../types";
import {
  GoodreadsAuthorAvatar,
  GoodreadsCover,
} from "../components/GoodreadsImages";
import { GoodreadsButton } from "../components/GoodreadsButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { request } from "../utils/APIClient";

interface AuthorQuote extends Quote {
  work: Work;
}

interface State {
  works: Work[];
  profile: Author | null;
  loading: boolean;
  optimisticFollow: boolean | null;
  activeTab: "works" | "quotes";
}

export function AuthorPageWrapper() {
  const { keyword } = useParams<{ keyword: string }>();
  return <AuthorPage keyword={keyword || ""} />;
}

export class AuthorPage extends React.Component<{ keyword: string }, State> {
  state: State = {
    works: [],
    profile: null,
    loading: true,
    optimisticFollow: null,
    activeTab: "works",
  };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps: { keyword: string }) {
    if (prevProps.keyword !== this.props.keyword) {
      this.setState(
        {
          loading: true,
          optimisticFollow: null,
          activeTab: "works",
          works: [],
          profile: null,
        },
        this.fetchData,
      );
    }
  }

  fetchData = () => {
    const keyword = encodeURIComponent(this.props.keyword);

    request(`/api/collection/${keyword}`)
      .then((res) => res.json())
      .then((data: { works: Work[]; profile: Author | null }) => {
        this.setState({
          works: data.works || [],
          profile: data.profile,
          loading: false,
          optimisticFollow: null,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch data", err);
        this.setState({ loading: false });
      });
  };

  getAuthorQuotes = (): AuthorQuote[] => {
    const quotes = this.state.works.flatMap((work) =>
      (work.quotes || [])
        .filter((quote) => quote.quote && !quote.quote.startsWith("@notes:"))
        .map((quote) => ({
          ...quote,
          work,
        })),
    );

    return quotes.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  };

  toggleFollow = () => {
    const { profile, optimisticFollow } = this.state;
    if (!profile) return;

    const isCurrentlyFollowing =
      optimisticFollow !== null ? optimisticFollow : !!profile.followed;
    const newFollowState = !isCurrentlyFollowing;

    this.setState({ optimisticFollow: newFollowState });

    request(`/api/authors/${encodeURIComponent(profile.name)}/follow`, {
      method: "POST",
      body: JSON.stringify({ followed: newFollowState }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Failed to update follow status.");
        }

        this.setState((prev) => ({
          profile: prev.profile
            ? { ...prev.profile, followed: !!data.followed }
            : null,
          optimisticFollow: null,
        }));
      })
      .catch((err) => {
        console.error("Failed to update follow status", err);
        this.setState({ optimisticFollow: null });
      });
  };

  renderQuoteCard = (entry: AuthorQuote) => {
    return (
      <div key={`${entry.work.id}-${entry.id}`} style={styles.quoteCard}>
        <p style={styles.quoteText}>{entry.quote}</p>
        <div style={styles.quoteMetaBottom}>
          {typeof entry.page_number === "number" && (
            <span style={styles.quotePage}>p. {entry.page_number}</span>
          )}
          <span style={styles.quoteWorkTitle}>{entry.work.title}</span>
        </div>
      </div>
    );
  };

  render() {
    const { works, profile, loading, optimisticFollow, activeTab } = this.state;
    const authorQuotes = this.getAuthorQuotes();

    if (loading) {
      return <div style={styles.loading}>Loading author…</div>;
    }

    if (!profile) {
      return (
        <div style={styles.emptyState}>
          <h2 style={styles.emptyTitle}>Author not found</h2>
          <p style={styles.emptyText}>
            We could not find a matching author profile for this collection.
          </p>
        </div>
      );
    }

    const isFollowing =
      optimisticFollow !== null ? optimisticFollow : !!profile.followed;

    return (
      <div style={styles.page}>
        <div className="collection-container">
          <div className="profile-header">
            <div className="avatar-container">
              <GoodreadsAuthorAvatar author={profile} style={styles.avatar} />
              {!profile.goodreads_id || (
                <GoodreadsButton
                  category="author"
                  goodreadsId={profile.goodreads_id}
                  style={styles.badge}
                />
              )}
            </div>

            <div className="info-container">
              <span style={styles.name}>{profile.name}</span>
              <div style={styles.metaLine}>
                <span>{profile.works_count} works</span>
                <span>•</span>
                <span>{authorQuotes.length} quotes</span>
              </div>

              <SegmentedControl
                style={styles.segment}
                value={activeTab}
                onChange={(val) =>
                  this.setState({
                    activeTab: val as "works" | "quotes",
                  })
                }
                options={[
                  {
                    label: "Works",
                    value: "works",
                    count: works.length,
                  },
                  {
                    label: "Quotes",
                    value: "quotes",
                    count: authorQuotes.length,
                  },
                ]}
              />

              <div className="action-row">
                <button
                  className="follow-button"
                  style={isFollowing ? styles.following : styles.follow}
                  onClick={this.toggleFollow}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
              </div>
            </div>
          </div>

          <div style={styles.gridContainer}>
            {activeTab === "works" ? (
              works.length ? (
                <div style={styles.worksGrid}>
                  {works.map((work) => (
                    <GoodreadsCover
                      key={work.id}
                      work={work}
                      in_transition={true}
                      style={styles.workCover}
                    />
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>📚</div>
                  <h2 style={styles.emptyTitle}>No Works Yet</h2>
                  <p style={styles.emptyText}>
                    This author does not have any works in your library yet.
                  </p>
                </div>
              )
            ) : authorQuotes.length ? (
              <div style={styles.quotesList}>
                {authorQuotes.map(this.renderQuoteCard)}
              </div>
            ) : (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>✍️</div>
                <h2 style={styles.emptyTitle}>No Quotes Yet</h2>
                <p style={styles.emptyText}>
                  When you add quotes from {profile.name}'s works, they will
                  appear here.
                </p>
              </div>
            )}
          </div>
        </div>
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
  },
  loading: {
    textAlign: "center",
    marginTop: "100px",
    color: "#8ab4f8",
    fontSize: "14px",
  },
  avatar: {
    width: "150px",
    height: "150px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid var(--border-subtle)",
  },
  badge: {
    position: "absolute",
    bottom: "4px",
    right: "-8px",
  },
  name: {
    fontSize: "2em",
    fontWeight: "bold",
    fontFamily: "Libre Baskerville",
    color: "#f5f5f5",
    marginBottom: "10px",
  },
  metaLine: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    color: "#c7c7c7",
    fontSize: "14px",
    marginBottom: "14px",
  },
  segment: {
    marginBottom: "20px",
    flex: 1,
  },
  follow: {
    backgroundColor: "var(--goodreads-light)",
    color: "var(--goodreads-dark)",
  },
  following: {
    backgroundColor: "#ffffff30",
    color: "#f5f5f5",
  },
  gridContainer: {
    paddingBottom: "50px",
    paddingTop: "20px",
  },
  worksGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "40px",
  },
  workCover: {
    width: "100%",
    aspectRatio: "0.66",
    objectFit: "cover",
  },
  quotesList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "18px",
  },
  quoteCard: {
    border: "1px solid var(--border-subtle)",
    borderRadius: "16px",
    padding: "18px",
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  quoteWorkTitle: {
    fontWeight: 700,
    color: "#f3f3f3",
  },
  quotePage: {
    whiteSpace: "nowrap",
  },
  quoteText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#f7f7f7",
  },
  quoteMetaBottom: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    fontSize: "12px",
    color: "#9f9f9f",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "60px 20px",
    textAlign: "center",
  },
  emptyIcon: { fontSize: "48px", marginBottom: "20px" },
  emptyTitle: { fontSize: "24px", fontWeight: "bold", margin: "0 0 10px 0" },
  emptyText: { color: "#a8a8a8", fontSize: "14px", maxWidth: "350px" },
};

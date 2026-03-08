import React from "react";
import { type Work, type Author } from "../types";
import {
  GoodreadsAuthorAvatar,
  GoodreadsCover,
} from "../components/GoodreadsImages";
import { GoodreadsButton } from "../components/GoodreadsButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { useParams } from "react-router-dom";

interface CollectionData {
  Work: Work[];
  profile: Author | null;
}

interface State {
  data: CollectionData | null;
  loading: boolean;
  optimisticFollow: boolean | null; // For instant UI toggling
  activeTab: "works" | "quotes";
}

export function AuthorPageWrapper() {
  const { keyword } = useParams<{ keyword: string }>();
  return <AuthorPage keyword={keyword || ""} />;
}

export class AuthorPage extends React.Component<{ keyword: string }, State> {
  state: State = {
    data: null,
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
          ...this.state,
          loading: true,
          optimisticFollow: null,
          activeTab: "works",
        },
        this.fetchData,
      );
    }
  }

  fetchData = () => {
    const keyword = encodeURIComponent(this.props.keyword);

    fetch(`/api/collection/${keyword}`)
      .then((res) => res.json())
      .then((data) => {
        this.setState({
          ...this.state,
          data,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch data", err);
        this.setState({ ...this.state, loading: false });
      });
  };

  toggleFollow = () => {
    const { data, optimisticFollow } = this.state;
    if (!data || !data.profile) return;

    // Determine current visual state, then flip it
    const isCurrentlyFollowing =
      optimisticFollow !== null ? optimisticFollow : data.profile.followed;
    const newFollowState = !isCurrentlyFollowing;

    // Instantly update UI
    this.setState({ ...this.state, optimisticFollow: newFollowState });

    fetch(`/api/authors/${encodeURIComponent(data.profile.name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data.profile, followed: newFollowState }),
    }).catch((err) => console.error("Failed to update follow status", err));
  };

  render() {
    const { data, loading, optimisticFollow, activeTab } = this.state;

    if (loading || !data) {
      return <div style={styles.loading} />;
    }

    const profile = data.profile;
    const isFollowing = profile
      ? optimisticFollow !== null
        ? optimisticFollow
        : profile.followed
      : false;

    return (
      <div style={styles.page}>
        <div className="collection-container">
          {/* --- PROFILE HEADER --- */}
          {!profile || (
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
                {/* Row 1: Username & Actions */}
                <span style={styles.name}>{profile.name}</span>

                {/* Row 2: Stats / Tabs */}
                <SegmentedControl
                  style={styles.segment}
                  value={activeTab}
                  onChange={(val) =>
                    this.setState({
                      ...this.state,
                      activeTab: val as "works" | "quotes",
                    })
                  }
                  options={[
                    {
                      label: "Works",
                      value: "works",
                      count: data.works.length,
                    },
                    { label: "Quotes", value: "quotes", count: 0 },
                  ]}
                />
                {/* Row 3: Action */}
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
          )}
          <div style={styles.gridContainer}>
            {activeTab === "works" ? (
              <div style={styles.worksGrid}>
                {data.works.map((work) => (
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
                <div style={styles.emptyIcon}>📷</div>
                <h2 style={styles.emptyTitle}>No Quotes Yet</h2>
                <p style={styles.emptyText}>
                  When you add quotes from {profile?.name}'s works, they will
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
    marginBottom: "16px",
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

  // --- Grid ---
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

  // --- Empty State ---
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

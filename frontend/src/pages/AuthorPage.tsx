import React from "react";
import Masonry from "react-masonry-css";

import { useParams } from "react-router-dom";
import { type Work, type Author, type Quote } from "../types";
import { GoodreadsAuthorAvatar } from "../components/GoodreadsAuthorAvatar";
import { GoodreadsCover } from "../components/GoodreadsCover";
import { GoodreadsButton } from "../components/GoodreadsButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { request } from "../utils/APIClient";
import { QuoteCard } from "../components/QuoteCard";

import "./AuthorPage.css";

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
        .filter((quote) => quote.quote)
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

    request(`/api/authors/${profile.id}/follow`, {
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

  renderQuoteCard = (entry: Quote) => {
    return <QuoteCard quote={entry} displaySource onRefresh={() => {}} />;
  };

  render() {
    const { works, profile, loading, optimisticFollow, activeTab } = this.state;
    const authorQuotes = this.getAuthorQuotes();

    if (loading) {
      return <div className="author-page__loading">Loading author…</div>;
    }

    if (!profile) {
      return (
        <div className="author-page__empty-state">
          <h2 className="author-page__empty-title">Author not found</h2>
          <p className="author-page__empty-text">
            We could not find a matching author profile for this collection.
          </p>
        </div>
      );
    }

    const isFollowing =
      optimisticFollow !== null ? optimisticFollow : !!profile.followed;

    return (
      <div className="author-page">
        <div className="collection-container">
          <div className="profile-header">
            <div className="avatar-container">
              <GoodreadsAuthorAvatar
                author={profile}
                className="author-page__avatar"
              />
              {!profile.goodreads_id || (
                <GoodreadsButton
                  category="author"
                  goodreadsId={profile.goodreads_id}
                  style={{
                    backgroundColor: "var(--author-page-goodreads-button-bg)",
                  }}
                  className="author-page__goodreads-button"
                />
              )}
            </div>

            <div className="info-container">
              <span className="author-page__name">{profile.name}</span>
              <div className="author-page__meta-line">
                <span>{profile.works_count} works</span>
                <span>•</span>
                <span>{authorQuotes.length} quotes</span>
              </div>

              <SegmentedControl
                style={styles.segmentedControl}
                theme={{
                  backgroundColor: "var(--author-page-segment-bg)",
                  activeBackgroundColor: "var(--author-page-segment-active-bg)",
                  activeTextColor: "var(--author-page-segment-active-text)",
                  inactiveTextColor: "var(--author-page-segment-inactive-text)",
                }}
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
                  className={`follow-button ${isFollowing ? "author-page__follow-button--following" : "author-page__follow-button--default"}`}
                  onClick={this.toggleFollow}
                >
                  {isFollowing ? "Following" : "Follow"}
                </button>
              </div>
            </div>
          </div>

          <div className="author-page__grid-container">
            {activeTab === "works" ? (
              works.length ? (
                <div className="author-page__works-grid">
                  {works.map((work) => (
                    <GoodreadsCover key={work.id} work={work} />
                  ))}
                </div>
              ) : (
                <div className="author-page__empty-state">
                  <div className="author-page__empty-icon">📚</div>
                  <h2 className="author-page__empty-title">No Works Yet</h2>
                  <p className="author-page__empty-text">
                    This author does not have any works in your library yet.
                  </p>
                </div>
              )
            ) : authorQuotes.length ? (
              <Masonry
                breakpointCols={{ default: 3, 900: 2, 600: 1 }}
                className="my-masonry-grid"
                columnClassName="my-masonry-grid_column"
              >
                {authorQuotes.map(this.renderQuoteCard)}
              </Masonry>
            ) : (
              <div className="author-page__empty-state">
                <div className="author-page__empty-icon">✍️</div>
                <h2 className="author-page__empty-title">No Quotes Yet</h2>
                <p className="author-page__empty-text">
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
  segmentedControl: {
    marginBottom: "20px",
    flex: 1,
  },
};

import React from "react";
import { Link } from "react-router-dom";
import Masonry from "react-masonry-css";
import { request } from "../utils/APIClient";

import { type Author, type Work } from "../types";
import {
  GoodreadsAuthorAvatar,
  GoodreadsCover,
} from "../components/GoodreadsImages";

interface PageState {
  authors: Author[];
  works: Work[];
  loading: boolean;
}

export class ExplorePage extends React.Component<Record<string, never>, PageState> {
  state: PageState = {
    authors: [],
    works: [],
    loading: true,
  };

  componentDidMount() {
    request("/api/explore")
      .then((res) => res.json())
      .then((data: { works: Work[]; authors: Author[] }) => {
        this.setState({
          ...data,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch explore data", err);
        this.setState({ loading: false });
      });
  }

  render() {
    const { authors, works, loading } = this.state;

    return (
      <div style={styles.page}>
        <div className="explore-container">
          {/* --- LEFT: MAIN FEED --- */}
          <div className="explore-feeds">
            <Masonry
              breakpointCols={{ default: 4, 1100: 4, 800: 3, 500: 2 }}
              className="my-masonry-grid"
              columnClassName="my-masonry-grid_column"
            >
              {works.map((work) => (
                <GoodreadsCover
                  key={work.id}
                  work={work}
                  in_transition={true}
                />
              ))}
            </Masonry>
          </div>

          {/* --- RIGHT: SIDEBAR (Authors) --- */}
          <div className="explore-sidebar" style={styles.sidebar}>
            <div style={styles.header}>
              <h1 style={styles.title}>Suggested for you</h1>
              <p style={styles.subtitle}>Based on your digital library</p>
            </div>

            {loading || (
              <div className="explore-sidebar-content">
                {authors.map((author, index) => (
                  <div key={index} className="explore-sidebar-item">
                    {/* Left: Avatar */}
                    <GoodreadsAuthorAvatar
                      author={author}
                      style={styles.avatar}
                    />
                    {/* Middle: Text Stack */}
                    <Link
                      to={`/collection/${encodeURIComponent(author.name)}`}
                      style={styles.linkWrapper}
                    >
                      <div style={styles.infoStack}>
                        <span style={styles.username}>{author.name}</span>
                        <span style={styles.bioText}>
                          {author.goodreads_id
                            ? `@${author.goodreads_id}`
                            : "Author"}
                        </span>
                        <span style={styles.contextText}>
                          Featured in {author.works_count} works
                        </span>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {/* Standard Instagram-style subtle footer links */}
            {!loading && (
              <div style={styles.footerLinks}>
                <p>About • Help • Press • API • Jobs • Privacy • Terms</p>
                <p>© 2026 D CHENG</p>
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
    padding: "40px 20px",
  },
  header: {
    marginBottom: "24px",
    paddingLeft: "16px",
  },
  title: {
    fontSize: "18px",
    fontWeight: "bold",
    color: "#ffffff",
    margin: "0 0 4px 0",
  },
  subtitle: {
    color: "#a8a8a8",
    fontSize: "13px",
    margin: 0,
  },
  loading: {
    textAlign: "center",
    marginTop: "50px",
    color: "#ff4d94",
    fontWeight: "bold",
  },

  sidebar: {
    backgroundColor: "rgba(235, 226, 215, 0.1)",
  },

  // Avatar
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    objectFit: "cover",
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    marginRight: "14px",
    textDecoration: "none",
  },

  // Text Stack
  infoStack: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    overflow: "hidden",
  },
  linkWrapper: {
    flexGrow: 1,
    textDecoration: "none",
  },
  username: {
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  bioText: {
    color: "#a8a8a8",
    fontSize: "13px",
    marginTop: "2px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  contextText: {
    color: "#a8a8a8",
    fontSize: "12px",
    marginTop: "4px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  // Button
  buttonWrapper: {
    textDecoration: "none",
    marginLeft: "12px",
  },

  // Footer Links
  footerLinks: {
    marginTop: "30px",
    paddingLeft: "16px",
    fontSize: "12px",
    color: "#737373",
    lineHeight: "1.6",
  },
};

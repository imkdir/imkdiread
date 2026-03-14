import React from "react";
import { Link } from "react-router-dom";
import Masonry from "react-masonry-css";
import { request } from "../utils/APIClient";

import { type Author, type Work } from "../types";
import { GoodreadsAuthorAvatar } from "../components/GoodreadsAuthorAvatar";
import { GoodreadsCover } from "../components/GoodreadsCover";

import "./ExplorePage.css";

interface PageState {
  authors: Author[];
  works: Work[];
  loading: boolean;
}

export class ExplorePage extends React.Component<
  Record<string, never>,
  PageState
> {
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
      <div className="explore-page">
        <div className="explore-page__container">
          {/* --- LEFT: MAIN FEED --- */}
          <div className="explore-page__feeds">
            <Masonry
              breakpointCols={{ default: 4, 1100: 4, 800: 3, 500: 2 }}
              className="my-masonry-grid"
              columnClassName="my-masonry-grid_column"
            >
              {works.map((work) => (
                <GoodreadsCover key={work.id} work={work} />
              ))}
            </Masonry>
          </div>

          {/* --- RIGHT: SIDEBAR (Authors) --- */}
          <div className="explore-page__sidebar">
            <div className="explore-page__header">
              <h1 className="explore-page__title">Suggested for you</h1>
              <p className="explore-page__subtitle">
                Based on your digital library
              </p>
            </div>

            {loading || (
              <div className="explore-page__sidebar-content">
                {authors.map((author) => (
                  <div key={author.id} className="explore-page__sidebar-item">
                    {/* Left: Avatar */}
                    <GoodreadsAuthorAvatar
                      author={author}
                      className="explore-page__avatar"
                    />
                    {/* Middle: Text Stack */}
                    <Link
                      to={`/collection/${encodeURIComponent(author.name)}`}
                      className="explore-page__link-wrapper"
                    >
                      <div className="explore-page__info-stack">
                        <span className="explore-page__username">
                          {author.name}
                        </span>
                        <span className="explore-page__bio-text">
                          {author.goodreads_id
                            ? `@${author.goodreads_id}`
                            : "Author"}
                        </span>
                        <span className="explore-page__context-text">
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
              <div className="explore-page__footer-links">
                <p>About • Help • Jobs • Privacy • Terms</p>
                <p>© 2026 D CHENG</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

import React from "react";
import { type Author } from "../types";
import { AuthorCard } from "../components/AuthorCard";
import { request } from "../utils/APIClient";

import "./AuthorsPage.css";

interface PageState {
  authors: Author[];
  loading: boolean;
}

export class AuthorsPage extends React.Component<
  Record<string, never>,
  PageState
> {
  state: PageState = {
    authors: [],
    loading: true,
  };

  componentDidMount() {
    request("/api/authors")
      .then((res) => res.json())
      .then((data: Author[]) => {
        this.setState({
          authors: data,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch explore data", err);
        this.setState({ loading: false });
      });
  }

  render() {
    const { authors } = this.state;

    return (
      <div className="authors-page">
        <div className="authors-page__container">
          {authors.map((author) => (
            <AuthorCard
              key={author.name}
              author={author}
              theme={{
                cardBackgroundColor: "var(--authors-page-card-bg)",
                cardBorderColor: "var(--authors-page-card-border)",
                avatarBackgroundColor: "var(--authors-page-card-avatar-bg)",
                avatarTextColor: "var(--authors-page-card-avatar-text)",
                avatarPlaceholderBackgroundColor:
                  "var(--authors-page-card-avatar-placeholder-bg)",
                nameColor: "var(--authors-page-card-name)",
              }}
            />
          ))}
        </div>
      </div>
    );
  }
}

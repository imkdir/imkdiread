import React from "react";
import { type Author } from "../types";
import { AuthorCard } from "../components/AuthorCard";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

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
      .then(async (res) => {
        const data = await readJsonSafe<Author[] | { error?: string }>(res);
        if (!res.ok || !Array.isArray(data)) {
          throw new Error(getApiErrorMessage(data, "Failed to load authors."));
        }
        return data;
      })
      .then((data) => {
        this.setState({
          authors: data,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch explore data", err);
        this.setState({ loading: false });
        showToast("Failed to load authors.", { tone: "error" });
      });
  }

  render() {
    const { authors } = this.state;

    return (
      <div className="authors-page">
        <div className="authors-page__container">
          {authors.map((author) => (
            <AuthorCard
              key={author.id}
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

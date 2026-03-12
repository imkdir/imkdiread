import React from "react";
import { type Author } from "../types";
import { AuthorCard } from "../components/AuthorCard";
import { request } from "../utils/APIClient";

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
      <div style={styles.page}>
        <div style={styles.container}>
          {authors.map((author) => (
            <AuthorCard key={author.name} author={author} />
          ))}
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
    marginTop: "50px",
    color: "#ff4d94",
    fontWeight: "bold",
  },

  container: {
    padding: "40px 20px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "20px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
};

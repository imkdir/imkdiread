import React from "react";
import { Link } from "react-router-dom";
import { type Author } from "../types";
import { GoodreadsAuthorAvatar } from "./GoodreadsImages";

export const AuthorCard: React.FC<{
  author: Author;
  style?: React.CSSProperties;
}> = ({ author, style }) => (
  <Link
    to={`/collection/${encodeURIComponent(author.name)}`}
    style={{ ...styles.card, ...style }}
  >
    <GoodreadsAuthorAvatar author={author} style={styles.avatar} />
    <span style={styles.name}>{author.name}</span>
  </Link>
);

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#ffffff20",
    border: "1px solid var(--border-subtle)",
    borderRadius: "12px",
    padding: "24px 0",
    textDecoration: "none",
    flex: "1 0 160px",
  },
  avatar: {
    width: "90px",
    height: "90px",
    borderRadius: "50%",
    backgroundColor: "var(--bg-elevated)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    color: "#888",
    marginBottom: "12px",
  },
  name: {
    color: "#f5f5f5",
    fontSize: "13px",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "80%",
  },
};

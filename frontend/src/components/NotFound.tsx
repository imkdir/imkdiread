import React from "react";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div style={styles.container}>
      <h1 style={styles.errorCode}>404</h1>
      <h2 style={styles.title}>Page Not Found</h2>
      <p style={styles.description}>
        The page you are looking for has been archived, deleted, or never
        existed in the first place.
      </p>
      <Link to="/" style={styles.homeButton}>
        Return to Library
      </Link>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "var(--page-background)",
    color: "var(--text-main)",
    fontFamily: "-apple-system, system-ui, sans-serif",
    textAlign: "center",
    padding: "20px",
  },
  errorCode: {
    fontSize: "120px",
    margin: "0",
    color: "var(--color-bg-input-ghost)", // Faint watermark look
    fontWeight: "900",
  },
  title: {
    fontSize: "24px",
    marginTop: "-40px",
    marginBottom: "16px",
    zIndex: 1,
  },
  description: {
    color: "var(--color-text-muted-soft)",
    maxWidth: "400px",
    lineHeight: "1.6",
    marginBottom: "32px",
  },
  homeButton: {
    padding: "12px 24px",
    backgroundColor: "var(--color-text-page-inverse)",
    color: "var(--color-text-page-inverse-strong)",
    textDecoration: "none",
    borderRadius: "6px",
    fontWeight: "bold",
    transition: "opacity 0.2s",
  },
};

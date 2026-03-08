import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import usersIcon from "../assets/users.svg";
import tagIcon from "../assets/tag.svg";
import arrowLeftIcon from "../assets/arrow-left.svg";
import pdfIcon from "../assets/pdf.svg";

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <div style={styles.header}>
          <h2 style={styles.logoText}>Dashboard</h2>
        </div>

        <div style={styles.navSection}>
          <Link
            to="/admin/works"
            style={{
              ...styles.navLink,
              ...(isActive("/admin/works") ? styles.activeLink : {}),
            }}
          >
            <img src={pdfIcon} style={styles.icon} alt="Works" /> Works
          </Link>

          <Link
            to="/admin/authors"
            style={{
              ...styles.navLink,
              ...(isActive("/admin/authors") ? styles.activeLink : {}),
            }}
          >
            <img src={usersIcon} style={styles.icon} alt="Authors" /> Authors
          </Link>

          <Link
            to="/admin/tags"
            style={{
              ...styles.navLink,
              ...(isActive("/admin/tags") ? styles.activeLink : {}),
            }}
          >
            <img src={tagIcon} style={styles.icon} alt="Tags" /> Tags
          </Link>
        </div>

        <div style={{ flexGrow: 1 }} />

        <div style={styles.navSection}>
          <Link to="/" style={styles.exitLink}>
            <img src={arrowLeftIcon} style={styles.icon} alt="Exit" /> Back
          </Link>
        </div>
      </aside>

      <main style={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  layout: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#121212",
    color: "var(--text-main)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  sidebar: {
    width: "260px",
    backgroundColor: "#1e1e1e",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    padding: "20px 0",
    position: "fixed",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
  },
  header: {
    padding: "0 24px 20px 24px",
    borderBottom: "1px solid var(--border-subtle)",
    marginBottom: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoText: { margin: 0, fontSize: "18px", fontWeight: "bold" },
  badge: {
    backgroundColor: "#b31826",
    color: "white",
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: "bold",
  },
  navSection: { padding: "0 16px", marginBottom: "30px" },
  sectionTitle: {
    color: "#888",
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "1px",
    marginBottom: "12px",
    paddingLeft: "8px",
  },

  // Updated Link styles to support flexbox alignment for icons
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    borderRadius: "6px",
    color: "#ccc",
    textDecoration: "none",
    fontSize: "14px",
    marginBottom: "4px",
    transition: "background-color 0.2s, color 0.2s",
  },
  activeLink: {
    backgroundColor: "#2a2a2a",
    color: "#fff",
    fontWeight: "bold" as const,
  },
  exitLink: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    color: "#888",
    textDecoration: "none",
    fontSize: "14px",
    transition: "color 0.2s",
  },

  // Icon sizing
  icon: { width: "18px", height: "18px", opacity: 0.8 },
  mainContent: {
    flexGrow: 1,
    marginLeft: "260px",
    padding: "40px",
    boxSizing: "border-box",
  },
};

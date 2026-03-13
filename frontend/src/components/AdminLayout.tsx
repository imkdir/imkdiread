import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AppIcon } from "./AppIcon";

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
            <AppIcon name="pdf" title="Works" style={styles.icon} /> Works
          </Link>

          <Link
            to="/admin/authors"
            style={{
              ...styles.navLink,
              ...(isActive("/admin/authors") ? styles.activeLink : {}),
            }}
          >
            <AppIcon name="users" title="Authors" style={styles.icon} /> Authors
          </Link>

          <Link
            to="/admin/tags"
            style={{
              ...styles.navLink,
              ...(isActive("/admin/tags") ? styles.activeLink : {}),
            }}
          >
            <AppIcon name="tag" title="Tags" style={styles.icon} /> Tags
          </Link>
        </div>

        <div style={{ flexGrow: 1 }} />

        <div style={styles.navSection}>
          <Link to="/" style={styles.exitLink}>
            <AppIcon name="arrow-left" title="Back" style={styles.icon} /> Back
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
    backgroundColor: "var(--color-bg-page-admin)",
    color: "var(--text-main)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  sidebar: {
    width: "260px",
    backgroundColor: "var(--color-bg-panel-admin)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    padding: "20px 0",
    position: "fixed",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: "var(--z-shell-sidebar)",
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
    backgroundColor: "var(--color-bg-danger)",
    color: "white",
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: "bold",
  },
  navSection: { padding: "0 16px", marginBottom: "30px" },
  sectionTitle: {
    color: "var(--color-text-page-secondary)",
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
    color: "var(--color-text-page-tertiary)",
    textDecoration: "none",
    fontSize: "14px",
    marginBottom: "4px",
    transition: "background-color 0.2s, color 0.2s",
  },
  activeLink: {
    backgroundColor: "var(--color-bg-panel-admin-alt)",
    color: "var(--color-text-page-inverse)",
    fontWeight: "bold" as const,
  },
  exitLink: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 12px",
    color: "var(--color-text-page-secondary)",
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

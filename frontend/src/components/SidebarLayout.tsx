import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../components/AuthContext";

import homeIcon from "../assets/imgs/home.svg";
import userIcon from "../assets/imgs/users.svg";
import searchIcon from "../assets/imgs/search.svg";
import exploreIcon from "../assets/imgs/compass.svg";
import settingsIcon from "../assets/imgs/settings.svg";
import dictionaryIcon from "../assets/imgs/dictionary.svg";
import { DictionaryDrawer } from "./DictionaryDrawer";

export const SidebarLayout: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();

  // 1. Contextual Routing Check: Are we reading a specific work?
  const workMatch = location.pathname.match(/^\/work\/([^/]+)/);
  const workId = workMatch ? workMatch[1] : null;

  // 2. Drawer State
  const [isDictOpen, setIsDictOpen] = useState(false);

  // 3. Auto-close if user navigates away from the book
  useEffect(() => {
    if (!workId) setIsDictOpen(false);
  }, [workId]);

  return (
    <div
      className="layout-container"
      style={styles.layoutContainer}
    >
      {/* --- THE SIDEBAR --- */}
      <nav className="sidebar" style={{ zIndex: 6002 }}>
        <Link to={"/"} className="logo-link">
          <img src={homeIcon} alt={"home"} />
        </Link>

        <div className="nav-menu">
          <Link to={"/search"} title="Search Library" className="sidebar-link">
            <img src={searchIcon} alt={"search"} />
          </Link>
          <Link to={"/explore"} title="Explore" className="sidebar-link">
            <img src={exploreIcon} alt={"explore"} />
          </Link>

          {/* THE CONTEXTUAL DICTIONARY TRIGGER */}
          {workId && (
            <div
              onClick={() => setIsDictOpen(!isDictOpen)}
              title="Dictionary"
              className="sidebar-link"
              style={{ cursor: "pointer" }}
            >
              <img src={dictionaryIcon} alt={"dictionary"} />
            </div>
          )}
        </div>

        <div className="bottom-menu">
          {auth.user && (
            <Link to="/profile" className="sidebar-link" title="Profile">
              <img src={userIcon} alt={"profile"} />
            </Link>
          )}
          {auth.user && auth.user.role === "admin" && (
            <Link
              to="/admin/works"
              className="sidebar-link"
              title="Admin Dashboard"
            >
              <img src={settingsIcon} alt={"admin"} />
            </Link>
          )}
        </div>
      </nav>

      {/* --- THE GLASSMORPHIC DICTIONARY DRAWER --- */}
      <DictionaryDrawer
        workId={workId || ""}
        isOpen={isDictOpen && Boolean(workId)}
        onClose={() => setIsDictOpen(false)}
      />

      {/* --- THE MAIN PAGE CONTENT --- */}
      <main
        className="content"
        style={styles.mainContent}
      >
        <Outlet />
      </main>
    </div>
  );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  layoutContainer: {
    position: "relative",
    display: "flex",
    width: "100%",
    height: "100vh",
    overflow: "hidden",
  },
  mainContent: {
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
    overscrollBehaviorY: "contain",
    WebkitOverflowScrolling: "touch",
  },
};

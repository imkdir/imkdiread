import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";

import homeIcon from "../assets/imgs/home.svg";
import userIcon from "../assets/imgs/users.svg";
import searchIcon from "../assets/imgs/search.svg";
import exploreIcon from "../assets/imgs/compass.svg";
import settingsIcon from "../assets/imgs/settings.svg";
import dictionaryIcon from "../assets/imgs/dictionary.svg";
import { DictionaryDrawer } from "./DictionaryDrawer";
import { ThemeEditorDrawer } from "./ThemeEditorDrawer"; // <-- Import the new component

export const SidebarLayout: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Contextual Routing Check
  const workMatch = location.pathname.match(/^\/work\/([^/]+)/);
  const workId = workMatch ? workMatch[1] : null;

  // 2. Drawer States
  const [openDictionaryForWorkId, setOpenDictionaryForWorkId] = useState<
    string | null
  >(null);
  const [isThemeOpen, setIsThemeOpen] = useState(false); // <-- Theme Drawer State

  const isDictOpen = Boolean(workId) && openDictionaryForWorkId === workId;

  // 3. Global Shortcuts (Escape to close modals / Cmd+K to search)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K -> Global Search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/search");
        setTimeout(
          () => document.getElementById("global-search-input")?.focus(),
          100,
        );
        return;
      }

      // Escape -> Smart Back / Close UI
      if (e.key === "Escape") {
        if (isDictOpen) {
          setOpenDictionaryForWorkId(null);
          return;
        }
        if (isThemeOpen) {
          setIsThemeOpen(false);
          return;
        }

        if (
          ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")
        ) {
          (document.activeElement as HTMLElement).blur();
          return;
        }

        if (document.fullscreenElement) return;
        if (document.querySelector(".video-modal-wrap")) return;

        navigate(-1);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [navigate, isDictOpen, isThemeOpen]);

  return (
    <div className="layout-container" style={styles.layoutContainer}>
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
              onClick={() => {
                setOpenDictionaryForWorkId((current) =>
                  current === workId ? null : workId,
                );
                setIsThemeOpen(false); // Close theme if opening dictionary
              }}
              title="Dictionary"
              className="sidebar-link"
              style={{ cursor: "pointer" }}
            >
              <img src={dictionaryIcon} alt={"dictionary"} />
            </div>
          )}

          {/* THE THEME EDITOR TRIGGER */}
          <div
            className="sidebar-link"
            style={{ cursor: "pointer", fontSize: "20px" }}
            onClick={() => {
              setIsThemeOpen(!isThemeOpen);
              setOpenDictionaryForWorkId(null); // Close dictionary if opening theme
            }}
            title="Theme Editor"
          >
            🎨
          </div>
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

      {/* --- THE GLASSMORPHIC DRAWERS --- */}
      <DictionaryDrawer
        workId={workId || ""}
        isOpen={isDictOpen}
        onClose={() => setOpenDictionaryForWorkId(null)}
      />

      <ThemeEditorDrawer
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
      />

      {/* --- THE MAIN PAGE CONTENT --- */}
      <main className="content" style={styles.mainContent}>
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

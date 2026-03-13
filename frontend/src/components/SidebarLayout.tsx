import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";

import { AppIcon } from "./AppIcon";
import { DictionaryDrawer } from "./DictionaryDrawer";
import { ThemeEditorDrawer } from "./ThemeEditorDrawer";
import { SearchDrawer } from "../pages/SearchPage";

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [dictionaryAnchorRect, setDictionaryAnchorRect] =
    useState<DOMRect | null>(null);
  const [themeAnchorRect, setThemeAnchorRect] = useState<DOMRect | null>(null);

  const isDictOpen = Boolean(workId) && openDictionaryForWorkId === workId;

  // 3. Global Shortcuts (Escape to close modals / Cmd+K to search)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K -> Global Search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
        setIsThemeOpen(false);
        setOpenDictionaryForWorkId(null);
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
        if (isSearchOpen) {
          setIsSearchOpen(false);
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
  }, [navigate, isDictOpen, isSearchOpen, isThemeOpen]);

  return (
    <div className="layout-container" style={styles.layoutContainer}>
      {/* --- THE MENU BAR --- */}
      <nav className="sidebar">
        <Link to={"/"} className="logo-link">
          <AppIcon name="home" title="Home" />
        </Link>

        <div className="nav-menu">
          <div
            title="Search Library"
            className="sidebar-link"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setIsSearchOpen(true);
              setIsThemeOpen(false);
              setOpenDictionaryForWorkId(null);
              setTimeout(
                () => document.getElementById("global-search-input")?.focus(),
                100,
              );
            }}
          >
            <AppIcon name="search" title="Search" />
          </div>
          <Link to={"/explore"} title="Explore" className="sidebar-link">
            <AppIcon name="compass" title="Explore" />
          </Link>

          {/* THE CONTEXTUAL DICTIONARY TRIGGER */}
          {workId && (
            <div
              onClick={(event) => {
                setDictionaryAnchorRect(
                  event.currentTarget.getBoundingClientRect(),
                );
                setOpenDictionaryForWorkId((current) =>
                  current === workId ? null : workId,
                );
                setIsThemeOpen(false); // Close theme if opening dictionary
              }}
              title="Dictionary"
              className="sidebar-link"
              style={{ cursor: "pointer" }}
            >
              <AppIcon name="dictionary" title="Dictionary" />
            </div>
          )}

          {/* THE THEME EDITOR TRIGGER */}
          <div
            className="sidebar-link"
            style={{ cursor: "pointer" }}
            onClick={(event) => {
              setThemeAnchorRect(event.currentTarget.getBoundingClientRect());
              setIsThemeOpen(!isThemeOpen);
              setOpenDictionaryForWorkId(null); // Close dictionary if opening theme
            }}
            title="Theme Editor"
          >
            <AppIcon name="brush" title="Theme Editor" size={20} />
          </div>

          {auth.user && (
            <Link to="/profile" className="sidebar-link" title="Profile">
              <AppIcon name="users" title="Profile" />
            </Link>
          )}
          {auth.user && auth.user.role === "admin" && (
            <Link
              to="/admin/works"
              className="sidebar-link"
              title="Admin Dashboard"
            >
              <AppIcon name="settings" title="Admin Dashboard" />
            </Link>
          )}
        </div>
      </nav>

      {/* --- THE GLASSMORPHIC DRAWERS --- */}
      <DictionaryDrawer
        workId={workId || ""}
        isOpen={isDictOpen}
        onClose={() => setOpenDictionaryForWorkId(null)}
        anchorRect={dictionaryAnchorRect}
      />

      <SearchDrawer
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      <ThemeEditorDrawer
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        routePath={location.pathname}
        anchorRect={themeAnchorRect}
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
    height: "calc(100vh - 60px)",
    marginTop: "60px",
    overflowY: "auto",
    boxSizing: "border-box",
    overscrollBehaviorY: "contain",
    WebkitOverflowScrolling: "touch",
  },
};

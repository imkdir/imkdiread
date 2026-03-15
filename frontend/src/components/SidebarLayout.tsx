import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import type { Quote, Work } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import { AppIcon } from "./AppIcon";
import { DictionaryDrawer } from "./DictionaryDrawer";
import { Modal } from "./Modal";
import { ThemeEditorDrawer } from "./ThemeEditorDrawer";
import { SearchDrawer } from "../pages/SearchPage";

interface ProfileResponse {
  quotes?: Quote[];
}

interface CSVWorkRow {
  id?: string;
  goodreads_id?: string;
  page_count?: string;
  title?: string;
  authors?: string;
  tags?: string;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

interface SidebarInteractiveItemProps {
  to?: string;
  title: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}

function SidebarInteractiveItem({
  to,
  title,
  onClick,
  children,
}: SidebarInteractiveItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 240, damping: 22 });
  const mouseYSpring = useSpring(y, { stiffness: 240, damping: 22 });

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["9deg", "-9deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-9deg", "9deg"]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${mouseX}px ${mouseY}px, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 18%, rgba(255,255,255,0) 58%)`;

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextMouseX = event.clientX - rect.left;
    const nextMouseY = event.clientY - rect.top;

    mouseX.set(nextMouseX);
    mouseY.set(nextMouseY);
    x.set(nextMouseX / rect.width - 0.5);
    y.set(nextMouseY / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  const content = (
    <>
      <span className="sidebar-link__content">{children}</span>
      <motion.span
        className="sidebar-link__glare"
        style={{
          background: glareBackground,
          opacity: isHovered ? 1 : 0,
        }}
      />
    </>
  );

  return (
    <motion.div
      className="sidebar-link"
      title={title}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1200,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.03, y: -2 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
    >
      {to ? (
        <Link to={to} className="sidebar-link__inner">
          {content}
        </Link>
      ) : (
        <div
          className="sidebar-link__inner"
          style={{ cursor: "pointer" }}
          onClick={onClick}
          role="button"
          aria-label={title}
        >
          {content}
        </div>
      )}
    </motion.div>
  );
}

export const SidebarLayout: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const workImportInputRef = useRef<HTMLInputElement>(null);

  // 1. Contextual Routing Check
  const workMatch = location.pathname.match(/^\/work\/([^/]+)/);
  const workId = workMatch ? workMatch[1] : null;
  const isOwnProfileRoute = /^\/profile(?:\/|$)/.test(location.pathname);
  const isAdmin = auth.user?.role === "admin";
  const isExplore = location.pathname === "/explore";

  // 2. Drawer States
  const [openDictionaryForWorkId, setOpenDictionaryForWorkId] = useState<
    string | null
  >(null);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInitialQuery, setSearchInitialQuery] = useState("");
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [dictionaryAnchorRect, setDictionaryAnchorRect] =
    useState<DOMRect | null>(null);
  const [themeAnchorRect, setThemeAnchorRect] = useState<DOMRect | null>(null);

  const isDictOpen = Boolean(workId) && openDictionaryForWorkId === workId;

  const handleLogout = () => {
    auth.logout();
    navigate("/login");
  };

  const handleExportQuotes = async () => {
    try {
      const res = await request("/api/profile/me");
      const data = await readJsonSafe<ProfileResponse & { error?: string }>(
        res,
      );

      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, "Failed to load quotes."));
      }

      const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
      if (!quotes.length) {
        showToast("No quotes to export yet.");
        return;
      }

      downloadCsv(
        `quotes_export_${new Date().toISOString().split("T")[0]}.csv`,
        quotes.map((quote) => ({
          id: quote.id,
          work_id: quote.work_id,
          work_title: quote.work?.title || "",
          page_number: quote.page_number ?? "",
          quote: quote.quote,
          created_at: quote.created_at,
        })),
      );
    } catch (error) {
      console.error("Failed to export quotes", error);
      showToast(
        error instanceof Error ? error.message : "Failed to export quotes.",
        { tone: "error" },
      );
    }
  };

  const handleExportWorks = async () => {
    if (!isAdmin) return;

    try {
      const res = await request("/api/works");
      const works = await readJsonSafe<Work[] | { error?: string }>(res);

      if (!res.ok || !Array.isArray(works)) {
        throw new Error(getApiErrorMessage(works, "Failed to load works."));
      }

      if (!works.length) {
        showToast("No works to export yet.");
        return;
      }

      downloadCsv(
        `works_export_${new Date().toISOString().split("T")[0]}.csv`,
        works.map((work) => ({
          id: work.id,
          goodreads_id: work.goodreads_id || "",
          page_count: work.page_count ?? "",
          title: work.title || "",
          authors: (work.authors || []).join(" | "),
          tags: (work.tags || []).join(" | "),
          dropbox_link: work.dropbox_link || "",
          amazon_asin: work.amazon_asin || "",
        })),
      );
    } catch (error) {
      console.error("Failed to export works", error);
      showToast(
        error instanceof Error ? error.message : "Failed to export works.",
        { tone: "error" },
      );
    }
  };

  const handleImportWorksCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;

    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse<CSVWorkRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedWorks = results.data.map((row) => ({
          id: (row.id || "").trim(),
          goodreads_id: row.goodreads_id?.trim() || "",
          page_count: row.page_count ? parseInt(row.page_count.trim(), 10) : 42,
          title: row.title?.trim() || "",
          authors: row.authors
            ? row.authors
                .split("|")
                .map((author) => author.trim())
                .filter(Boolean)
            : [],
          tags: row.tags
            ? row.tags
                .split("|")
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [],
        }));

        request("/api/works/bulk-import", {
          method: "POST",
          body: JSON.stringify(importedWorks),
        })
          .then(async (res) => {
            const data = await readJsonSafe<{
              success?: boolean;
              error?: string;
              message?: string;
            }>(res);
            if (!res.ok || !data?.success) {
              throw new Error(getApiErrorMessage(data, "Import failed."));
            }
            return data;
          })
          .then((data) => {
            showToast(data.message || "Imported works successfully.", {
              tone: "success",
            });
          })
          .catch((error) => {
            console.error("Failed to import works", error);
            showToast(
              error instanceof Error
                ? error.message
                : "Failed to import works.",
              { tone: "error" },
            );
          });
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        showToast("Failed to read the CSV file.", { tone: "error" });
      },
    });

    event.target.value = "";
  };

  useEffect(() => {
    setIsAdminMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOpenSearchDrawer = (event: Event) => {
      const customEvent = event as CustomEvent<{ query?: string }>;
      setSearchInitialQuery(customEvent.detail?.query || "");
      setIsSearchOpen(true);
      setIsThemeOpen(false);
      setOpenDictionaryForWorkId(null);
      setTimeout(
        () => document.getElementById("global-search-input")?.focus(),
        100,
      );
    };

    window.addEventListener("open-search-drawer", handleOpenSearchDrawer);
    return () =>
      window.removeEventListener("open-search-drawer", handleOpenSearchDrawer);
  }, []);

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
        <SidebarInteractiveItem to="/" title="Home">
          <AppIcon name="home" title="Home" />
        </SidebarInteractiveItem>

        <div className="nav-menu">
          {isAdmin && (
            <input
              ref={workImportInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportWorksCSV}
              style={{ display: "none" }}
            />
          )}

          <SidebarInteractiveItem
            title="Search Library"
            onClick={() => {
              setSearchInitialQuery("");
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
          </SidebarInteractiveItem>

          {isExplore || (
            <SidebarInteractiveItem to="/explore" title="Explore">
              <AppIcon name="compass" title="Explore" />
            </SidebarInteractiveItem>
          )}

          {/* THE CONTEXTUAL DICTIONARY TRIGGER */}
          {workId && (
            <SidebarInteractiveItem
              title="Dictionary"
              onClick={(event) => {
                setDictionaryAnchorRect(
                  event.currentTarget.getBoundingClientRect(),
                );
                setOpenDictionaryForWorkId((current) =>
                  current === workId ? null : workId,
                );
                setIsThemeOpen(false);
              }}
            >
              <AppIcon name="dictionary" title="Dictionary" />
            </SidebarInteractiveItem>
          )}

          <SidebarInteractiveItem
            title="Quote Theme"
            onClick={(event) => {
              setThemeAnchorRect(event.currentTarget.getBoundingClientRect());
              setIsThemeOpen((current) => !current);
              setOpenDictionaryForWorkId(null);
              setIsSearchOpen(false);
            }}
          >
            <AppIcon name="brush" title="Quote Theme" />
          </SidebarInteractiveItem>

          {auth.user &&
            (isOwnProfileRoute ? (
              <>
                {!isAdmin && (
                  <SidebarInteractiveItem
                    title="Export Quotes"
                    onClick={() => {
                      void handleExportQuotes();
                    }}
                  >
                    <AppIcon name="download" title="Export Quotes" />
                  </SidebarInteractiveItem>
                )}
                <SidebarInteractiveItem title="Log Out" onClick={handleLogout}>
                  <AppIcon name="logout" title="Log Out" />
                </SidebarInteractiveItem>
              </>
            ) : (
              <SidebarInteractiveItem to="/profile" title="Profile">
                <AppIcon name="users" title="Profile" />
              </SidebarInteractiveItem>
            ))}

          {auth.user && isAdmin && isOwnProfileRoute && (
            <SidebarInteractiveItem
              title="Settings"
              onClick={() => setIsAdminMenuOpen(true)}
            >
              <AppIcon name="settings" title="Settings" />
            </SidebarInteractiveItem>
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
        initialQuery={searchInitialQuery}
      />

      <ThemeEditorDrawer
        isOpen={isThemeOpen}
        onClose={() => setIsThemeOpen(false)}
        anchorRect={themeAnchorRect}
      />

      <Modal isOpen={isAdminMenuOpen} onClose={() => setIsAdminMenuOpen(false)}>
        <div className="modal-header">
          <AppIcon name="settings" title="Settings" size={18} />
          <p className="modal-subtitle">Library admin actions</p>
        </div>
        <div className="modal-menu">
          <button
            type="button"
            className="modal-menu__item"
            onClick={() => {
              setIsAdminMenuOpen(false);
              void handleExportWorks();
            }}
          >
            <span className="modal-menu__icon">
              <AppIcon name="download" title="Export Works" size={18} />
            </span>
            <span className="modal-menu__text">Export works</span>
          </button>
          <button
            type="button"
            className="modal-menu__item"
            onClick={() => {
              setIsAdminMenuOpen(false);
              void handleExportQuotes();
            }}
          >
            <span className="modal-menu__icon">
              <AppIcon name="download" title="Export Quotes" size={18} />
            </span>
            <span className="modal-menu__text">Export quotes</span>
          </button>
          <button
            type="button"
            className="modal-menu__item"
            onClick={() => {
              setIsAdminMenuOpen(false);
              workImportInputRef.current?.click();
            }}
          >
            <span className="modal-menu__icon">
              <AppIcon name="upload" title="Import Works CSV" size={18} />
            </span>
            <span className="modal-menu__text">Import works CSV</span>
          </button>
        </div>
      </Modal>

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

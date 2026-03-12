import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { request } from "../utils/APIClient";

import homeIcon from "../assets/imgs/home.svg";
import userIcon from "../assets/imgs/users.svg";
import searchIcon from "../assets/imgs/search.svg";
import exploreIcon from "../assets/imgs/compass.svg";
import settingsIcon from "../assets/imgs/settings.svg";
import dictionaryIcon from "../assets/imgs/dictionary.svg";
import closeIcon from "../assets/imgs/close.svg";

// Dictionary specific UI types matching our Gemini JSON schema
interface DictResult {
  word: string;
  phonetic?: string;
  lore_note?: string;
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string }[];
  }[];
}

interface SavedVocab {
  id: number;
  word: string;
  word_data: DictResult;
  username: string;
}

export const SidebarLayout: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();

  // 1. Contextual Routing Check: Are we reading a specific work?
  const workMatch = location.pathname.match(/^\/work\/([^/]+)/);
  const workId = workMatch ? workMatch[1] : null;

  // 2. Drawer State
  const [isDictOpen, setIsDictOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [dictResult, setDictResult] = useState<DictResult | null>(null);
  const [savedVocabs, setSavedVocabs] = useState<SavedVocab[]>([]);

  // 3. Auto-close if user navigates away from the book
  useEffect(() => {
    if (!workId) setIsDictOpen(false);
  }, [workId]);

  // 4. Fetch existing vocabularies when drawer opens
  useEffect(() => {
    if (isDictOpen && workId) {
      fetchVocabularies();
    }
  }, [isDictOpen, workId]);

  const fetchVocabularies = async () => {
    try {
      const res = await request(`/api/works/${workId}/vocabularies`);
      const data = await res.json();
      if (data.vocabularies) {
        setSavedVocabs(data.vocabularies);
      }
    } catch (err) {
      console.error("Failed to load vocabularies", err);
    }
  };

  // 5. Look up word via your Custom Gemini Backend!
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !workId) return;

    setIsSearching(true);
    setDictResult(null);

    try {
      const res = await request(`/api/works/${workId}/dictionary/lookup`, {
        method: "POST",
        body: JSON.stringify({ word: searchQuery.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Word not found");
      }

      setDictResult(data.result);
    } catch (err: any) {
      alert(err.message || "Word not found in dictionary.");
    } finally {
      setIsSearching(false);
    }
  };

  // 6. Save word to your SQLite Backend
  const handleSaveVocab = async () => {
    if (!dictResult || !workId) return;

    try {
      const res = await request(`/api/works/${workId}/vocabularies`, {
        method: "POST",
        body: JSON.stringify({
          word: dictResult.word,
          word_data: dictResult, // Saving the rich Gemini JSON payload
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Optimistically add to top of local list
        setSavedVocabs((prev) => [
          data.vocabulary,
          ...prev.filter((v) => v.word !== data.vocabulary.word),
        ]);
        setDictResult(null); // Clear search after saving
        setSearchQuery("");
      }
    } catch (err) {
      alert("Failed to save vocabulary.");
    }
  };

  return (
    <div
      className="layout-container"
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
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
      {isDictOpen && workId && (
        <div className="sidebar-drawer-panel">
          <div style={styles.drawerHeader}>
            <h2 style={styles.drawerTitle}>Gemini</h2>
            <button
              onClick={() => setIsDictOpen(false)}
              style={styles.closeBtn}
            >
              <img src={closeIcon} alt={"close"} />
            </button>
          </div>

          {/* Search Input */}
          <form
            onSubmit={handleSearch}
            style={{ display: "flex", gap: "8px", marginBottom: "24px" }}
          >
            <input
              type="text"
              placeholder="Look up a word..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            <button
              type="submit"
              disabled={isSearching}
              style={{ ...styles.searchBtn, opacity: isSearching ? 0.7 : 1 }}
            >
              {isSearching ? "Thinking..." : "Search"}
            </button>
          </form>

          {/* Gemini Result Card */}
          {dictResult && (
            <div style={styles.glassPanel}>
              <div style={styles.dictHeader}>
                <h3 style={styles.dictWord}>{dictResult.word}</h3>
                {dictResult.phonetic && (
                  <span style={styles.dictPhonetic}>{dictResult.phonetic}</span>
                )}
              </div>

              {/* NEW: Contextual Lore Box */}
              {dictResult.lore_note && (
                <div
                  style={{
                    backgroundColor: "rgba(255, 215, 0, 0.1)",
                    borderLeft: "3px solid var(--logo-green)",
                    padding: "12px",
                    marginBottom: "16px",
                    borderRadius: "0 4px 4px 0",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      color: "var(--logo-green)",
                      fontWeight: "bold",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Lore & Context
                  </span>
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: "16px",
                      lineHeight: "1.5",
                      color: "var(--text-main)",
                      fontFamily: "Libre Baskerville",
                    }}
                  >
                    {dictResult.lore_note}
                  </p>
                </div>
              )}

              <div style={styles.dictBody}>
                {dictResult.meanings.slice(0, 2).map((meaning, idx) => (
                  <div key={idx} style={{ marginBottom: "12px" }}>
                    <span style={styles.partOfSpeech}>
                      {meaning.partOfSpeech}
                    </span>
                    <p style={styles.definition}>
                      1. {meaning.definitions[0].definition}
                    </p>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "16px",
                  gap: "12px",
                }}
              >
                <button onClick={handleSaveVocab} style={styles.saveBtn}>
                  Save to Vocabulary
                </button>
                <button
                  onClick={() => setDictResult(null)}
                  style={styles.saveBtn}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Community Saved Words List */}
          {!savedVocabs.length || (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                flex: 1,
                overflowY: "auto",
              }}
            >
              <h3 style={styles.listTitle}>Did you know?</h3>
              {savedVocabs.map((vocab) => (
                <div
                  key={vocab.id}
                  style={styles.localTagCard}
                  onClick={() => setDictResult(vocab.word_data)}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <span style={styles.tagName}>{vocab.word}</span>
                    <span
                      style={{ fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      by {vocab.username}
                    </span>
                  </div>
                  {/* Render the context-aware definition natively from the saved JSON payload! */}
                  {vocab.word_data?.meanings?.[0]?.definitions?.[0]
                    ?.definition && (
                    <p style={styles.tagLabel}>
                      {vocab.word_data.meanings[0].definitions[0].definition}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- THE MAIN PAGE CONTENT --- */}
      <main
        className="content"
        style={{
          flexGrow: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          overscrollBehaviorY: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    margin: "12px 0 36px 0",
  },
  drawerTitle: {
    margin: 0,
    fontSize: "24px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 0,
    display: "flex",
  },
  searchInput: {
    flexGrow: 1,
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "rgba(0,0,0,0.3)",
    color: "var(--text-main)",
    outline: "none",
    fontFamily: "Fredoka",
    fontSize: "16px",
  },
  searchBtn: {
    padding: "0 16px",
    margin: "1px 0",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "var(--goodreads-light)",
    cursor: "pointer",
    fontFamily: "Fredoka",
  },
  glassPanel: {
    backgroundColor: "rgba(255,255,255, 0.05)",
    border: "1px solid rgba(255,255,255, 0.1)",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "24px",
  },
  dictHeader: {
    marginBottom: "16px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: "12px",
  },
  dictWord: {
    margin: "0 0 4px 0",
    fontSize: "28px",
    fontFamily: "Libre Baskerville",
    color: "var(--text-main)",
  },
  dictPhonetic: {
    fontSize: "14px",
    color: "var(--logo-green)",
    fontFamily: "monospace",
  },
  partOfSpeech: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    fontWeight: "bold",
  },
  definition: {
    margin: "4px 0 0 0",
    fontSize: "14px",
    lineHeight: "1.5",
    color: "var(--text-dim)",
    fontFamily: "Libre Baskerville",
  },
  saveBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "13px",
    fontFamily: "Fredoka",
  },
  listTitle: {
    margin: "0 0 8px 4px",
    color: "var(--text-muted)",
    fontFamily: "Fredoka",
  },
  localTagCard: {
    padding: "12px",
    borderRadius: "8px",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  tagName: {
    fontSize: "20px",
    color: "var(--goodreads-light)",
    fontFamily: "Libre Baskerville",
  },
  tagLabel: {
    fontSize: "13px",
    lineHeight: "1.4",
    color: "var(--text-dim)",
    marginTop: "6px",
    marginBottom: 0,
  },
};

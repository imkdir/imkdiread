import React, { useCallback, useEffect, useState } from "react";
import { request } from "../utils/APIClient";
import closeIcon from "../assets/imgs/close.svg";

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

interface Props {
  workId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DictionaryDrawer: React.FC<Props> = ({
  workId,
  isOpen,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [dictResult, setDictResult] = useState<DictResult | null>(null);
  const [savedVocabs, setSavedVocabs] = useState<SavedVocab[]>([]);

  const fetchVocabularies = useCallback(async () => {
    try {
      const res = await request(`/api/works/${workId}/vocabularies`);
      const data = await res.json();
      if (data.vocabularies) {
        setSavedVocabs(data.vocabularies);
      }
    } catch (err) {
      console.error("Failed to load vocabularies", err);
    }
  }, [workId]);

  useEffect(() => {
    if (isOpen && workId) {
      void fetchVocabularies();
    }
  }, [fetchVocabularies, isOpen, workId]);

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
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Word not found in dictionary.";
      alert(message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveVocab = async () => {
    if (!dictResult || !workId) return;

    try {
      const res = await request(`/api/works/${workId}/vocabularies`, {
        method: "POST",
        body: JSON.stringify({
          word: dictResult.word,
          word_data: dictResult,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSavedVocabs((prev) => [
          data.vocabulary,
          ...prev.filter((v) => v.word !== data.vocabulary.word),
        ]);
        setDictResult(null);
        setSearchQuery("");
      }
    } catch {
      alert("Failed to save vocabulary.");
    }
  };

  if (!isOpen || !workId) return null;

  return (
    <div className="sidebar-drawer-panel">
      <div style={styles.drawerHeader}>
        <h2 style={styles.drawerTitle}>Ask Gemini</h2>
        <button onClick={onClose} style={styles.closeBtn}>
          <img src={closeIcon} alt={"close"} />
        </button>
      </div>

      <form onSubmit={handleSearch} style={styles.searchForm}>
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

      {dictResult && (
        <div style={styles.glassPanel}>
          <div style={styles.dictHeader}>
            <h3 style={styles.dictWord}>{dictResult.word}</h3>
            {dictResult.phonetic && (
              <span style={styles.dictPhonetic}>{dictResult.phonetic}</span>
            )}
          </div>

          {dictResult.lore_note && (
            <div style={styles.loreBox}>
              <span style={styles.loreLabel}>Lore & Context</span>
              <p style={styles.loreBody}>{dictResult.lore_note}</p>
            </div>
          )}

          <div style={styles.dictBody}>
            {dictResult.meanings.slice(0, 2).map((meaning, idx) => (
              <div key={idx} style={{ marginBottom: "12px" }}>
                <span style={styles.partOfSpeech}>{meaning.partOfSpeech}</span>
                <p style={styles.definition}>
                  1. {meaning.definitions[0].definition}
                </p>
              </div>
            ))}
          </div>

          <div style={styles.saveActions}>
            <button onClick={handleSaveVocab} style={styles.saveBtn}>
              Save to Vocabulary
            </button>
            <button onClick={() => setDictResult(null)} style={styles.saveBtn}>
              Clear
            </button>
          </div>
        </div>
      )}

      {!!savedVocabs.length && (
        <div style={styles.savedVocabList}>
          <h3 style={styles.listTitle}>Did you know?</h3>
          {savedVocabs.map((vocab) => (
            <div
              key={vocab.id}
              style={styles.localTagCard}
              onClick={() => setDictResult(vocab.word_data)}
            >
              <div style={styles.tagRow}>
                <span style={styles.tagName}>{vocab.word}</span>
                <span style={styles.tagAuthor}>by {vocab.username}</span>
              </div>
              {vocab.word_data?.meanings?.[0]?.definitions?.[0]?.definition && (
                <p style={styles.tagLabel}>
                  {vocab.word_data.meanings[0].definitions[0].definition}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    margin: "12px 0 36px 0",
  },
  drawerTitle: {
    margin: 0,
    fontSize: "28px",
    fontFamily: "Fredoka",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 0,
    display: "flex",
  },
  searchForm: {
    display: "flex",
    gap: "8px",
    marginBottom: "24px",
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
  loreBox: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderLeft: "3px solid var(--logo-green)",
    padding: "12px",
    marginBottom: "16px",
    borderRadius: "0 4px 4px 0",
  },
  loreLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    color: "var(--logo-green)",
    fontWeight: "bold",
    letterSpacing: "0.05em",
  },
  loreBody: {
    margin: "4px 0 0 0",
    fontSize: "16px",
    lineHeight: "1.5",
    color: "var(--text-main)",
    fontFamily: "Libre Baskerville",
  },
  dictBody: {
    marginBottom: "16px",
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
  saveActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "16px",
    gap: "12px",
  },
  savedVocabList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    overflowY: "auto",
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
    cursor: "pointer",
  },
  tagRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  tagName: {
    fontSize: "20px",
    color: "var(--goodreads-light)",
    fontFamily: "Libre Baskerville",
  },
  tagAuthor: {
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  tagLabel: {
    fontSize: "13px",
    lineHeight: "1.4",
    color: "var(--text-dim)",
    marginTop: "6px",
    marginBottom: 0,
  },
};

import React, { useCallback, useEffect, useState } from "react";
import { request } from "../utils/APIClient";
import { FloatingDrawer } from "./FloatingDrawer";

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
  anchorRect?: DOMRect | null;
}

export const DictionaryDrawer: React.FC<Props> = ({
  workId,
  isOpen,
  onClose,
  anchorRect,
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
    <FloatingDrawer
      isOpen={isOpen}
      title="Ask Gemini"
      onClose={onClose}
      anchorRect={anchorRect}
      defaultSize={{ width: 440, height: 1200 }}
      minSize={{ width: 340, height: 320 }}
      bodyStyle={styles.drawerBody}
    >
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

      <div style={styles.scrollArea}>
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
                <div key={idx} style={styles.meaningBlock}>
                  <span style={styles.partOfSpeech}>
                    {meaning.partOfSpeech}
                  </span>
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
              <button
                onClick={() => setDictResult(null)}
                style={styles.saveBtn}
              >
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
    </FloatingDrawer>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  drawerBody: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    padding: "10px 20px 20px",
  },
  searchForm: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
    flexShrink: 0,
  },
  searchInput: {
    flexGrow: 1,
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--theme-dictionary-input-border)",
    backgroundColor: "var(--theme-dictionary-input-bg)",
    color: "var(--theme-dictionary-input-text)",
    outline: "none",
    fontFamily: "Fredoka",
    fontSize: "16px",
  },
  searchBtn: {
    padding: "0 16px",
    margin: "1px 0",
    borderRadius: "10px",
    border: "none",
    backgroundColor: "var(--color-bg-input-ghost-soft)",
    color: "var(--theme-dictionary-input-text)",
    cursor: "pointer",
    fontFamily: "Fredoka",
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    paddingRight: "4px",
  },
  glassPanel: {
    backgroundColor: "var(--theme-dictionary-panel-bg)",
    border: "1px solid var(--theme-dictionary-panel-border)",
    borderRadius: "16px",
    padding: "22px",
    marginBottom: "24px",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
  },
  dictHeader: {
    marginBottom: "18px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    paddingBottom: "14px",
  },
  dictWord: {
    margin: "0 0 4px 0",
    fontSize: "28px",
    fontFamily: "Libre Baskerville",
    color: "var(--theme-dictionary-title)",
  },
  dictPhonetic: {
    fontSize: "14px",
    color: "var(--theme-dictionary-accent)",
    fontFamily: "monospace",
  },
  loreBox: {
    backgroundColor: "var(--theme-dictionary-panel-bg)",
    border: "1px solid var(--theme-dictionary-panel-border)",
    borderLeft: "4px solid var(--theme-dictionary-accent)",
    padding: "16px 18px",
    marginBottom: "20px",
    borderRadius: "0 14px 14px 0",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  },
  loreLabel: {
    display: "inline-block",
    marginBottom: "8px",
    fontSize: "11px",
    textTransform: "uppercase",
    color: "var(--theme-dictionary-accent)",
    fontWeight: "bold",
    letterSpacing: "0.08em",
  },
  loreBody: {
    margin: 0,
    fontSize: "17px",
    lineHeight: "1.8",
    color: "var(--theme-dictionary-body)",
    fontFamily: "Libre Baskerville",
    textWrap: "pretty",
  },
  dictBody: {
    marginBottom: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  meaningBlock: {
    paddingBottom: "14px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  },
  partOfSpeech: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    fontWeight: "bold",
  },
  definition: {
    margin: "8px 0 0 0",
    fontSize: "15px",
    lineHeight: "1.7",
    color: "var(--theme-dictionary-card-text)",
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
  },
  saveBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "var(--color-bg-input-ghost)",
    color: "var(--theme-dictionary-input-text)",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "13px",
    fontFamily: "Fredoka",
  },
  listTitle: {
    margin: "0 0 10px 4px",
    color: "var(--text-muted)",
    fontFamily: "Fredoka",
  },
  localTagCard: {
    padding: "14px",
    borderRadius: "12px",
    backgroundColor: "var(--theme-dictionary-card-bg)",
    border: "1px solid var(--theme-dictionary-panel-border)",
    cursor: "pointer",
  },
  tagRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  tagName: {
    fontSize: "20px",
    color: "var(--theme-dictionary-title)",
    fontFamily: "Libre Baskerville",
  },
  tagAuthor: {
    fontSize: "12px",
    color: "var(--text-muted)",
  },
  tagLabel: {
    fontSize: "13px",
    lineHeight: "1.55",
    color: "var(--theme-dictionary-card-text)",
    marginTop: "8px",
    marginBottom: 0,
  },
};

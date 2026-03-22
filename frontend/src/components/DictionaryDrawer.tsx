import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";
import { AppIcon } from "./AppIcon";
import { FloatingDrawer } from "./FloatingDrawer";

const DICTIONARY_DRAWER_SETTINGS_KEY = "dictionary-drawer-settings";

interface DictionaryDrawerSettings {
  autoClearOnOpen: boolean;
  autoPasteOnOpen: boolean;
}

interface DictResult {
  word: string;
  phonetic?: string;
  lore_note?: string | null;
  is_visualizable?: boolean;
  image_url?: string | null;
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
  avatar_url?: string | null;
}

interface UserPreviewData {
  username: string;
  avatar_url?: string | null;
  readingCount: number;
  favoritesCount: number;
  shelvedCount: number;
}

interface UserPreviewResponse {
  userInfo?: {
    username: string;
    avatar_url?: string | null;
  } | null;
  reading?: unknown[];
  favorites?: unknown[];
  shelved?: unknown[];
}

interface UserPreviewPosition {
  top: number;
  left: number;
}

function loadDictionaryDrawerSettings(): DictionaryDrawerSettings {
  if (typeof window === "undefined") {
    return {
      autoClearOnOpen: false,
      autoPasteOnOpen: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(DICTIONARY_DRAWER_SETTINGS_KEY);
    if (!raw) {
      return {
        autoClearOnOpen: false,
        autoPasteOnOpen: false,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      autoClearOnOpen: Boolean(parsed?.autoClearOnOpen),
      autoPasteOnOpen: Boolean(parsed?.autoPasteOnOpen),
    };
  } catch {
    return {
      autoClearOnOpen: false,
      autoPasteOnOpen: false,
    };
  }
}

function normalizeClipboardText(rawText: string) {
  let cleanedText = rawText.trim().replace(/-\r?\n/g, "");
  cleanedText = cleanedText
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\r?\n/g, " "))
    .join("\n\n");
  cleanedText = cleanedText.replace(/ {2,}/g, " ");
  return cleanedText.replace(/\s+/g, " ").trim();
}

function inferLookupMode(): LookupMode {
  return "gemini";
}

export type LookupMode = "gemini" | "ollama";

interface Props {
  workId: string;
  isOpen: boolean;
  onClose: () => void;
  anchorRect?: DOMRect | null;
  initialQuery?: string;
  initialLookupMode?: LookupMode;
  initialRequestKey?: number;
}

export const DictionaryDrawer: React.FC<Props> = ({
  workId,
  isOpen,
  onClose,
  anchorRect,
  initialQuery = "",
  initialLookupMode = "gemini",
  initialRequestKey = 0,
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupMode, setLookupMode] = useState<LookupMode>("gemini");
  const [isSearching, setIsSearching] = useState(false);
  const [dictResult, setDictResult] = useState<DictResult | null>(null);
  const [savedVocabs, setSavedVocabs] = useState<SavedVocab[]>([]);
  const [hoveredUsername, setHoveredUsername] = useState<string | null>(null);
  const [hoveredUserPreview, setHoveredUserPreview] =
    useState<UserPreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<DictionaryDrawerSettings>(
    loadDictionaryDrawerSettings,
  );
  const [userPreviewPosition, setUserPreviewPosition] =
    useState<UserPreviewPosition | null>(null);
  const previewCacheRef = useRef<Record<string, UserPreviewData>>({});
  const settingsRef = useRef(settings);
  const wasOpenRef = useRef(false);
  const showPreviewTimerRef = useRef<number | null>(null);
  const hidePreviewTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !initialRequestKey || !initialQuery.trim()) return;

    setSearchQuery(initialQuery);
    setLookupMode(initialLookupMode);

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [initialLookupMode, initialQuery, initialRequestKey, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DICTIONARY_DRAWER_SETTINGS_KEY,
      JSON.stringify(settings),
    );
  }, [settings]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setIsSettingsOpen(false);
      return;
    }

    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;

    if (initialQuery.trim()) {
      return;
    }

    let cancelled = false;

    const syncOpenState = async () => {
      if (settingsRef.current.autoClearOnOpen) {
        setSearchQuery("");
        setDictResult(null);
      }

      if (
        settingsRef.current.autoPasteOnOpen &&
        typeof navigator !== "undefined" &&
        navigator.clipboard?.readText
      ) {
        try {
          const clipboardText = await navigator.clipboard.readText();
          if (cancelled) return;
          const normalizedText = normalizeClipboardText(clipboardText);
          if (normalizedText) {
            setSearchQuery(normalizedText);
            setLookupMode(inferLookupMode());
            setDictResult(null);
          }
        } catch {
          // Ignore clipboard permission failures and keep the drawer usable.
        }
      }

      if (!cancelled) {
        const frameId = window.requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });

        if (cancelled) {
          window.cancelAnimationFrame(frameId);
        }
      }
    };

    void syncOpenState();

    return () => {
      cancelled = true;
    };
  }, [
    initialQuery,
    isOpen,
  ]);

  const fetchVocabularies = useCallback(async () => {
    try {
      const res = await request(`/api/works/${workId}/vocabularies`);
      const data = await readJsonSafe<{
        error?: string;
        vocabularies?: SavedVocab[];
      }>(res);
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(data, "Failed to load vocabularies."),
        );
      }
      if (data?.vocabularies) {
        setSavedVocabs(data.vocabularies);
      }
    } catch (err) {
      console.error("Failed to load vocabularies", err);
      showToast("Failed to load vocabularies.", { tone: "error" });
    }
  }, [workId]);

  useEffect(() => {
    if (isOpen && workId) {
      void fetchVocabularies();
    }
  }, [fetchVocabularies, isOpen, workId]);

  const clearShowPreviewTimer = () => {
    if (showPreviewTimerRef.current !== null) {
      window.clearTimeout(showPreviewTimerRef.current);
      showPreviewTimerRef.current = null;
    }
  };

  const clearHidePreviewTimer = () => {
    if (hidePreviewTimerRef.current !== null) {
      window.clearTimeout(hidePreviewTimerRef.current);
      hidePreviewTimerRef.current = null;
    }
  };

  const closeUserPreview = useCallback(() => {
    clearShowPreviewTimer();
    clearHidePreviewTimer();
    setHoveredUsername(null);
    setHoveredUserPreview(null);
    setUserPreviewPosition(null);
    setIsPreviewLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      closeUserPreview();
    }
  }, [closeUserPreview, isOpen]);

  useEffect(() => {
    return () => {
      clearShowPreviewTimer();
      clearHidePreviewTimer();
    };
  }, []);

  const positionUserPreview = (rect: DOMRect) => {
    const cardWidth = 280;
    const cardHeight = 168;
    const padding = 16;
    const nextLeft = Math.min(
      Math.max(padding, rect.left),
      window.innerWidth - cardWidth - padding,
    );
    const nextTop =
      rect.bottom + 12 + cardHeight < window.innerHeight - padding
        ? rect.bottom + 12
        : Math.max(padding, rect.top - cardHeight - 12);

    setUserPreviewPosition({ top: nextTop, left: nextLeft });
  };

  const openUserPreview = useCallback(
    async (username: string, rect: DOMRect) => {
      positionUserPreview(rect);
      setHoveredUsername(username);

      const cachedPreview = previewCacheRef.current[username];
      if (cachedPreview) {
        setHoveredUserPreview(cachedPreview);
        setIsPreviewLoading(false);
        return;
      }

      setHoveredUserPreview(null);
      setIsPreviewLoading(true);

      try {
        const res = await request(
          `/api/profiles/${encodeURIComponent(username)}`,
        );
        const data = await readJsonSafe<
          UserPreviewResponse & { error?: string }
        >(res);

        if (!res.ok) {
          throw new Error(
            getApiErrorMessage(data, "Failed to load profile preview."),
          );
        }
        const preview = data?.userInfo
          ? {
              username: data.userInfo.username,
              avatar_url: data.userInfo.avatar_url || null,
              readingCount: data.reading?.length || 0,
              favoritesCount: data.favorites?.length || 0,
              shelvedCount: data.shelved?.length || 0,
            }
          : null;

        if (!preview) {
          throw new Error("Profile preview not found.");
        }

        previewCacheRef.current[username] = preview;
        setHoveredUserPreview(preview);
      } catch (error) {
        console.error("Failed to load user preview", error);
        showToast("Failed to load profile preview.", { tone: "error" });
        setHoveredUsername(null);
        setHoveredUserPreview(null);
        setUserPreviewPosition(null);
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [],
  );

  const scheduleUserPreview = (username: string, element: HTMLElement) => {
    clearShowPreviewTimer();
    clearHidePreviewTimer();
    const rect = element.getBoundingClientRect();

    showPreviewTimerRef.current = window.setTimeout(() => {
      void openUserPreview(username, rect);
    }, 2000);
  };

  const scheduleUserPreviewHide = () => {
    clearShowPreviewTimer();
    clearHidePreviewTimer();
    hidePreviewTimerRef.current = window.setTimeout(() => {
      closeUserPreview();
    }, 140);
  };

  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!searchQuery.trim() || !workId) return;

      setIsSearching(true);
      setDictResult(null);

      try {
        const res = await request(`/api/works/${workId}/context/lookup`, {
          method: "POST",
          body: JSON.stringify({
            word: searchQuery.trim(),
            provider: lookupMode,
          }),
        });

        const data = await readJsonSafe<{
          success?: boolean;
          error?: string;
          provider?: string;
          result?: DictResult;
        }>(res);

        if (!res.ok || !data?.success || !data.result) {
          throw new Error(getApiErrorMessage(data, "Word not found."));
        }

        setDictResult(data.result);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Word not found in dictionary.";
        showToast(message, { tone: "error" });
      } finally {
        setIsSearching(false);
      }
    },
    [lookupMode, searchQuery, workId],
  );

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

      const data = await readJsonSafe<{
        success?: boolean;
        error?: string;
        vocabulary?: SavedVocab;
      }>(res);
      if (!res.ok || !data?.success || !data.vocabulary) {
        throw new Error(getApiErrorMessage(data, "Failed to save vocabulary."));
      }
      setSavedVocabs((prev) => [
        data.vocabulary as SavedVocab,
        ...prev.filter((v) => v.word !== data.vocabulary!.word),
      ]);
      setDictResult(null);
      setSearchQuery("");
      showToast("Saved to vocabulary.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save vocabulary.",
        { tone: "error" },
      );
    }
  };

  if (!isOpen || !workId) return null;

  return (
    <FloatingDrawer
      isOpen={isOpen}
      title="Vocabulary"
      onClose={onClose}
      variant="paper"
      anchorRect={anchorRect}
      defaultSize={{ width: 440, height: 1200 }}
      minSize={{ width: 340, height: 320 }}
      bodyStyle={styles.drawerBody}
    >
      <form onSubmit={handleSearch} style={styles.searchForm}>
        <input
          ref={searchInputRef}
          id="dictionary-search-input"
          type="text"
          placeholder="Look up a term in this book..."
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

      <div style={styles.lookupModeRow}>
        <button
          type="button"
          style={{
            ...styles.lookupModeButton,
            ...(lookupMode === "ollama"
              ? styles.lookupModeButtonActive
              : undefined),
          }}
          onClick={() => setLookupMode("ollama")}
        >
          Ollama
        </button>
        <button
          type="button"
          style={{
            ...styles.lookupModeButton,
            ...(lookupMode === "gemini"
              ? styles.lookupModeButtonActive
              : undefined),
          }}
          onClick={() => setLookupMode("gemini")}
        >
          Gemini
        </button>
      </div>

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

            {dictResult.image_url && (
              <div style={styles.dictionaryImageFrame}>
                <img
                  src={dictResult.image_url}
                  alt={`Illustration of ${dictResult.word}`}
                  style={styles.dictionaryImage}
                  loading="lazy"
                />
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
                  <button
                    type="button"
                    style={styles.tagAuthor}
                    onClick={(event) => event.stopPropagation()}
                    onMouseEnter={(event) =>
                      scheduleUserPreview(vocab.username, event.currentTarget)
                    }
                    onMouseLeave={scheduleUserPreviewHide}
                    onFocus={(event) =>
                      scheduleUserPreview(vocab.username, event.currentTarget)
                    }
                    onBlur={scheduleUserPreviewHide}
                  >
                    by {vocab.username}
                  </button>
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

      {isSettingsOpen && (
        <div style={styles.settingsPanel}>
          <button
            type="button"
            style={styles.settingsToggleRow}
            onClick={() =>
              setSettings((current) => ({
                ...current,
                autoClearOnOpen: !current.autoClearOnOpen,
              }))
            }
          >
            <span style={styles.settingsCopy}>
              <span style={styles.settingsLabel}>Auto clear on open</span>
              <span style={styles.settingsHint}>
                Start with an empty input whenever the drawer opens.
              </span>
            </span>
            <span
              style={{
                ...styles.settingsSwitch,
                ...(settings.autoClearOnOpen
                  ? styles.settingsSwitchActive
                  : undefined),
              }}
            >
              <span
                style={{
                  ...styles.settingsSwitchThumb,
                  ...(settings.autoClearOnOpen
                    ? styles.settingsSwitchThumbActive
                    : undefined),
                }}
              />
            </span>
          </button>

          <button
            type="button"
            style={styles.settingsToggleRow}
            onClick={() =>
              setSettings((current) => ({
                ...current,
                autoPasteOnOpen: !current.autoPasteOnOpen,
              }))
            }
          >
            <span style={styles.settingsCopy}>
              <span style={styles.settingsLabel}>Auto paste on open</span>
              <span style={styles.settingsHint}>
                Read clipboard text into the input when the drawer opens.
              </span>
            </span>
            <span
              style={{
                ...styles.settingsSwitch,
                ...(settings.autoPasteOnOpen
                  ? styles.settingsSwitchActive
                  : undefined),
              }}
            >
              <span
                style={{
                  ...styles.settingsSwitchThumb,
                  ...(settings.autoPasteOnOpen
                    ? styles.settingsSwitchThumbActive
                    : undefined),
                }}
              />
            </span>
          </button>
        </div>
      )}

      <div style={styles.footerRow}>
        <button
          type="button"
          style={{
            ...styles.settingsButton,
            ...(isSettingsOpen ? styles.settingsButtonActive : undefined),
          }}
          onClick={() => setIsSettingsOpen((current) => !current)}
        >
          <AppIcon name="settings" size={16} />
          <span>{isSettingsOpen ? "Close settings" : "Settings"}</span>
        </button>
      </div>

      {!hoveredUsername ||
        !userPreviewPosition ||
        typeof document === "undefined" ||
        createPortal(
          <div
            style={{
              ...styles.userPreviewCard,
              top: `${userPreviewPosition.top}px`,
              left: `${userPreviewPosition.left}px`,
            }}
            onMouseEnter={() => {
              clearHidePreviewTimer();
              clearShowPreviewTimer();
            }}
            onMouseLeave={scheduleUserPreviewHide}
          >
            <div style={styles.userPreviewHeader}>
              {hoveredUserPreview?.avatar_url ? (
                <img
                  src={hoveredUserPreview.avatar_url}
                  alt={hoveredUserPreview.username}
                  style={styles.userPreviewAvatar}
                />
              ) : (
                <div style={styles.userPreviewAvatarFallback}>
                  {(hoveredUserPreview?.username || hoveredUsername)
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
              )}
              <div style={styles.userPreviewText}>
                <strong style={styles.userPreviewName}>
                  {hoveredUserPreview?.username || hoveredUsername}
                </strong>
                <p style={styles.userPreviewMeta}>
                  {isPreviewLoading
                    ? "Loading activity..."
                    : `${hoveredUserPreview?.readingCount || 0} · ${hoveredUserPreview?.favoritesCount || 0} · ${hoveredUserPreview?.shelvedCount || 0}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              style={styles.userPreviewAction}
              onClick={(event) => {
                event.stopPropagation();
                closeUserPreview();
                onClose();
                navigate(
                  `/users/${encodeURIComponent(hoveredUserPreview?.username || hoveredUsername)}`,
                );
              }}
            >
              Go to profile
            </button>
          </div>,
          document.body,
        )}
    </FloatingDrawer>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  drawerBody: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
    padding: "18px 20px 20px",
  },
  searchForm: {
    display: "flex",
    gap: "8px",
    marginBottom: "12px",
    flexShrink: 0,
  },
  lookupModeRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px",
    marginBottom: "14px",
    borderRadius: "999px",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.44), rgba(238, 227, 208, 0.92)), rgba(247, 241, 230, 0.92)",
    border: "1px solid rgba(122, 91, 57, 0.16)",
    flexShrink: 0,
    alignSelf: "flex-start",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.46), 0 3px 10px rgba(89, 62, 34, 0.06)",
  },
  lookupModeButton: {
    padding: "7px 12px",
    borderRadius: "999px",
    border: "none",
    background: "transparent",
    color: "#6b5238",
    cursor: "pointer",
    fontFamily: "Fredoka",
    fontSize: "13px",
    fontWeight: 600,
  },
  lookupModeButtonActive: {
    background:
      "linear-gradient(180deg, rgba(142, 93, 48, 0.96), rgba(98, 63, 32, 0.96)), rgba(94, 60, 31, 0.94)",
    color: "#fbf4ea",
    boxShadow:
      "0 10px 18px rgba(63, 38, 17, 0.18), inset 0 1px 0 rgba(255, 238, 219, 0.24)",
  },
  searchInput: {
    flexGrow: 1,
    padding: "14px 15px",
    borderRadius: "12px",
    border: "1px solid rgba(123, 92, 58, 0.22)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(241, 231, 214, 0.92)), rgba(255, 250, 243, 0.9)",
    color: "#2f241a",
    outline: "none",
    fontFamily: "var(--font-primary-stack)",
    fontSize: "14px",
    boxSizing: "border-box",
    boxShadow:
      "inset 0 1px 3px rgba(121, 89, 53, 0.08), 0 1px 0 rgba(255, 255, 255, 0.4)",
  },
  searchBtn: {
    padding: "0 18px",
    margin: "1px 0",
    borderRadius: "12px",
    border: "1px solid rgba(92, 59, 31, 0.45)",
    background:
      "linear-gradient(180deg, rgba(142, 93, 48, 0.96), rgba(98, 63, 32, 0.96)), rgba(94, 60, 31, 0.94)",
    color: "#fbf4ea",
    cursor: "pointer",
    fontFamily: "Fredoka",
    fontWeight: 700,
    boxShadow:
      "0 14px 28px rgba(63, 38, 17, 0.18), 0 6px 16px rgba(101, 61, 28, 0.12), inset 0 1px 0 rgba(255, 238, 219, 0.24)",
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
    background:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.42), transparent 32%), linear-gradient(180deg, rgba(252, 248, 240, 0.98), rgba(243, 232, 212, 0.96)), repeating-linear-gradient(0deg, rgba(120, 90, 54, 0.015) 0, rgba(120, 90, 54, 0.015) 1px, transparent 1px, transparent 4px)",
    border: "1px solid rgba(109, 80, 47, 0.18)",
    borderRadius: "18px",
    padding: "22px",
    marginBottom: "24px",
  },
  dictHeader: {
    marginBottom: "18px",
    borderBottom: "1px solid rgba(122, 91, 57, 0.14)",
    paddingBottom: "14px",
  },
  dictWord: {
    margin: "0 0 4px 0",
    fontSize: "28px",
    fontFamily: "Libre Baskerville",
    color: "#312419",
  },
  dictPhonetic: {
    fontSize: "14px",
    color: "#8b6034",
    fontFamily: "monospace",
  },
  loreBox: {
    background:
      "radial-gradient(circle at left center, rgba(212, 187, 122, 0.18), transparent 24%), radial-gradient(circle at right center, rgba(214, 196, 146, 0.14), transparent 26%), linear-gradient(180deg, rgba(247, 240, 222, 0.98), rgba(241, 233, 214, 0.96))",
    border: "1px solid rgba(114, 91, 54, 0.24)",
    borderLeft: "3px solid rgba(127, 97, 48, 0.42)",
    padding: "18px 20px",
    marginBottom: "20px",
    borderRadius: "2px 14px 14px 2px",
  },
  loreLabel: {
    display: "inline-block",
    marginBottom: "10px",
    fontSize: "10px",
    textTransform: "uppercase",
    color: "rgba(106, 74, 28, 0.82)",
    fontWeight: "bold",
    letterSpacing: "0.14em",
    fontFamily: "Fredoka",
  },
  loreBody: {
    margin: 0,
    fontSize: "17px",
    lineHeight: "1.82",
    color: "rgba(41, 29, 18, 0.92)",
    fontFamily: "Libre Baskerville",
    textWrap: "pretty",
    textShadow: "0 1px 0 rgba(255, 250, 240, 0.45)",
  },
  dictionaryImageFrame: {
    marginBottom: "20px",
    borderRadius: "16px",
    overflow: "hidden",
    border: "1px solid rgba(114, 91, 54, 0.18)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(239, 229, 210, 0.92)), rgba(250, 244, 234, 0.96)",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.56), 0 12px 22px rgba(86, 58, 28, 0.08)",
  },
  dictionaryImage: {
    display: "block",
    width: "100%",
    maxHeight: "220px",
    objectFit: "cover",
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
    color: "#765b41",
    fontWeight: "bold",
  },
  definition: {
    margin: "8px 0 0 0",
    fontSize: "15px",
    lineHeight: "1.7",
    color: "#433224",
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
  settingsPanel: {
    marginTop: "14px",
    marginBottom: "10px",
    padding: "12px",
    borderRadius: "16px",
    border: "1px solid rgba(122, 91, 57, 0.16)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.46), rgba(240, 229, 211, 0.9)), rgba(248, 242, 232, 0.9)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.46), 0 8px 20px rgba(89, 62, 34, 0.06)",
  },
  settingsToggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    width: "100%",
    padding: "10px 12px",
    border: "1px solid rgba(122, 91, 57, 0.12)",
    borderRadius: "14px",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.52), rgba(241, 231, 214, 0.94)), rgba(255, 250, 243, 0.9)",
    color: "#312419",
    cursor: "pointer",
    textAlign: "left",
  },
  settingsCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  settingsLabel: {
    color: "#4b3827",
    fontFamily: "Fredoka",
    fontSize: "13px",
    fontWeight: 600,
  },
  settingsHint: {
    color: "#765b41",
    fontSize: "12px",
    lineHeight: 1.45,
  },
  settingsSwitch: {
    position: "relative",
    width: "44px",
    height: "24px",
    borderRadius: "999px",
    border: "1px solid rgba(122, 91, 57, 0.16)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.4), rgba(231, 220, 200, 0.92)), rgba(237, 229, 216, 0.95)",
    flexShrink: 0,
    transition: "background-color 0.18s ease, border-color 0.18s ease",
  },
  settingsSwitchActive: {
    border: "1px solid rgba(92, 59, 31, 0.45)",
    background:
      "linear-gradient(180deg, rgba(142, 93, 48, 0.96), rgba(98, 63, 32, 0.96)), rgba(94, 60, 31, 0.94)",
  },
  settingsSwitchThumb: {
    position: "absolute",
    top: "2px",
    left: "2px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#fffaf2",
    boxShadow: "0 4px 10px rgba(63, 38, 17, 0.18)",
    transition: "transform 0.18s ease",
  },
  settingsSwitchThumbActive: {
    transform: "translateX(20px)",
  },
  footerRow: {
    marginTop: "auto",
    display: "flex",
    justifyContent: "flex-start",
    paddingTop: "12px",
  },
  settingsButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(122, 91, 57, 0.16)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(240, 229, 211, 0.94)), rgba(248, 242, 232, 0.92)",
    color: "#5a4632",
    cursor: "pointer",
    fontFamily: "Fredoka",
    fontSize: "13px",
    fontWeight: 600,
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.46), 0 8px 18px rgba(89, 62, 34, 0.06)",
  },
  settingsButtonActive: {
    border: "1px solid rgba(92, 59, 31, 0.3)",
    color: "#4a3524",
    background:
      "linear-gradient(180deg, rgba(255, 248, 236, 0.96), rgba(235, 221, 198, 0.96)), rgba(247, 241, 230, 0.94)",
  },
  saveBtn: {
    padding: "11px 14px",
    borderRadius: "12px",
    border: "1px solid rgba(122, 91, 57, 0.18)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(236, 225, 207, 0.95)), rgba(247, 241, 230, 0.92)",
    color: "#4d3b29",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "13px",
    fontFamily: "Fredoka",
  },
  listTitle: {
    margin: "0 0 10px 4px",
    color: "#765b41",
    fontFamily: "Fredoka",
  },
  localTagCard: {
    padding: "14px",
    borderRadius: "14px",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.46), rgba(240, 229, 211, 0.9)), rgba(248, 242, 232, 0.9)",
    border: "1px solid rgba(122, 91, 57, 0.16)",
    cursor: "pointer",
  },
  tagRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  tagName: {
    fontSize: "20px",
    color: "#312419",
    fontFamily: "Libre Baskerville",
  },
  tagAuthor: {
    padding: 0,
    border: "none",
    background: "transparent",
    fontSize: "12px",
    color: "#765b41",
    cursor: "pointer",
    fontFamily: "Fredoka",
  },
  tagLabel: {
    fontSize: "13px",
    lineHeight: "1.55",
    color: "#433224",
    marginTop: "8px",
    marginBottom: 0,
  },
  userPreviewCard: {
    position: "fixed",
    zIndex: 7050,
    width: "280px",
    padding: "16px",
    borderRadius: "18px",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)), rgba(30, 25, 20, 0.96)",
    boxShadow:
      "0 24px 50px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  },
  userPreviewHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  userPreviewAvatar: {
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    flexShrink: 0,
  },
  userPreviewAvatarFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "52px",
    height: "52px",
    borderRadius: "50%",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "var(--dictionary-title)",
    fontFamily: "Fredoka",
    fontSize: "18px",
    fontWeight: 700,
    flexShrink: 0,
  },
  userPreviewText: {
    minWidth: 0,
  },
  userPreviewName: {
    display: "block",
    marginBottom: "4px",
    color: "var(--dictionary-title)",
    fontFamily: "Fredoka",
    fontSize: "16px",
  },
  userPreviewMeta: {
    margin: 0,
    color: "var(--dictionary-card-text)",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  userPreviewAction: {
    marginTop: "14px",
    width: "100%",
    padding: "11px 14px",
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)), rgba(255, 255, 255, 0.02)",
    color: "var(--dictionary-title)",
    cursor: "pointer",
    fontFamily: "Fredoka",
    fontSize: "13px",
    fontWeight: 600,
  },
};

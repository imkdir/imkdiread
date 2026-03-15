import React, { useEffect, useMemo, useState } from "react";
import { FloatingDrawer } from "./FloatingDrawer";

interface ThemeEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  routePath: string;
  anchorRect?: DOMRect | null;
}

interface ThemeTokenDefinition {
  ids: string[];
  label: string;
  defaultHex: string;
}

interface ThemeSection {
  title: string;
  items: ThemeTokenDefinition[];
}

interface ThemeRouteConfig {
  label: string;
  sections: ThemeSection[];
}

type ThemeTokens = Record<string, string>;

const CUSTOM_STYLES_STORAGE_KEY = "app-custom-styles";
const REMOVED_THEME_TOKENS = new Set([
  "--theme-action-panel-tint",
  "--theme-detail-action-color",
  "--theme-detail-progress-fill",
  "--theme-detail-progress-fill-hover",
  "--theme-detail-progress-text",
  "--theme-detail-progress-text-hover",
]);

const GOODREADS_DARK_THEME: ThemeTokens = {
  "--theme-page-background": "#19120d",
  "--theme-page-text": "#f1e7d6",
  "--theme-border": "#403024",
  "--theme-detail-secondary-label": "rgba(241, 231, 214, 0.76)",
  "--theme-pill-background": "rgba(43, 30, 20, 0.88)",
  "--theme-pill-text": "#f1e7d6",
  "--theme-pill-border": "rgba(241, 231, 214, 0.1)",
  "--theme-detail-handle-bg": "#2a1d15",
  "--theme-detail-handle-text": "#f1e7d6",
  "--theme-detail-handle-bg-hover": "#3a2a1f",
  "--theme-detail-handle-text-hover": "#fff7eb",
  "--theme-detail-action-color": "var(--theme-detail-secondary-label)",
  "--theme-detail-divider": "rgba(241, 231, 214, 0.12)",
  "--theme-detail-progress-track": "rgba(212, 180, 138, 0.18)",
  "--theme-detail-progress-track-hover": "rgba(212, 180, 138, 0.26)",
  "--theme-detail-progress-fill": "var(--theme-detail-secondary-label)",
  "--theme-detail-progress-fill-hover": "var(--theme-detail-secondary-label)",
  "--theme-detail-progress-text": "var(--theme-detail-secondary-label)",
  "--theme-detail-progress-text-hover": "var(--theme-detail-secondary-label)",
  "--theme-dictionary-input-bg": "rgba(28, 20, 14, 0.76)",
  "--theme-dictionary-input-border": "rgba(241, 231, 214, 0.12)",
  "--theme-dictionary-input-text": "#f6ecdc",
  "--theme-dictionary-panel-bg": "rgba(31, 22, 16, 0.94)",
  "--theme-dictionary-panel-border": "rgba(241, 231, 214, 0.14)",
  "--theme-dictionary-title": "#f1e7d6",
  "--theme-dictionary-accent": "#d4a35f",
  "--theme-dictionary-body": "rgba(246, 236, 220, 0.92)",
  "--theme-dictionary-card-bg": "rgba(51, 37, 27, 0.82)",
  "--theme-dictionary-card-text": "rgba(246, 236, 220, 0.84)",
  "--theme-explore-sidebar-title": "#f1e7d6",
  "--theme-explore-sidebar-muted": "#d1b691",
  "--theme-explore-sidebar-footer": "#a88a66",
  "--theme-explore-sidebar-avatar-bg": "#36281d",
  "--theme-explore-sidebar-avatar-border": "rgba(241, 231, 214, 0.12)",
};

const SITE_SECTION: ThemeSection = {
  title: "Site",
  items: [
    {
      ids: ["--theme-page-background"],
      label: "Page Background",
      defaultHex: "#1e1914",
    },
    {
      ids: ["--theme-page-text"],
      label: "Page Text",
      defaultHex: "#faf8f6",
    },
    {
      ids: ["--theme-border"],
      label: "Border",
      defaultHex: "#262626",
    },
  ],
};

const QUOTE_CARD_SECTION: ThemeSection = {
  title: "Quote Card",
  items: [
    {
      ids: ["--theme-quote-card-front-bg"],
      label: "Front Background",
      defaultHex: "#fdfbf7",
    },
    {
      ids: ["--theme-quote-card-back-bg"],
      label: "Back Background",
      defaultHex: "#e6e1d6",
    },
    {
      ids: [
        "--theme-quote-card-front-border",
        "--theme-quote-card-back-border",
      ],
      label: "Border",
      defaultHex: "#ccc5b3",
    },
    {
      ids: [
        "--theme-quote-card-front-text",
        "--theme-quote-card-explanation-text",
      ],
      label: "Text",
      defaultHex: "#2c2825",
    },
    {
      ids: ["--theme-quote-card-input-bg"],
      label: "Input Background",
      defaultHex: "#ffffff",
    },
    {
      ids: ["--theme-quote-card-input-text"],
      label: "Input Text",
      defaultHex: "#2c2825",
    },
    {
      ids: ["--theme-quote-card-accent", "--quote-card-explain-border"],
      label: "Accent",
      defaultHex: "#2c2825",
    },
    {
      ids: ["--theme-quote-card-danger"],
      label: "Delete Accent",
      defaultHex: "#d32f2f",
    },
    {
      ids: ["--theme-quote-card-primary-action-bg"],
      label: "Primary Action Background",
      defaultHex: "#2c2825",
    },
    {
      ids: ["--theme-quote-card-primary-action-text"],
      label: "Primary Action Text",
      defaultHex: "#e5d9c3",
    },
  ],
};

const DETAIL_ACTION_SECTION: ThemeSection = {
  title: "Detail Actions",
  items: [
    {
      ids: ["--theme-detail-handle-bg"],
      label: "Handle Background",
      defaultHex: "#161616",
    },
    {
      ids: ["--theme-detail-handle-text"],
      label: "Handle Text",
      defaultHex: "#faf8f6",
    },
    {
      ids: ["--theme-detail-handle-bg-hover"],
      label: "Handle Hover Background",
      defaultHex: "#444444",
    },
    {
      ids: ["--theme-detail-handle-text-hover"],
      label: "Handle Hover Text",
      defaultHex: "#ffffff",
    },
    {
      ids: ["--theme-detail-divider"],
      label: "Divider",
      defaultHex: "#262626",
    },
    {
      ids: ["--theme-detail-progress-track"],
      label: "Progress Track",
      defaultHex: "#ebe2d7",
    },
    {
      ids: ["--theme-detail-progress-track-hover"],
      label: "Progress Track Hover",
      defaultHex: "#f3ede4",
    },
  ],
};

const PILL_BUTTON_SECTION: ThemeSection = {
  title: "Pill Button",
  items: [
    {
      ids: ["--theme-pill-background"],
      label: "Background",
      defaultHex: "#000000",
    },
    {
      ids: ["--theme-pill-text"],
      label: "Text",
      defaultHex: "#faf8f6",
    },
    {
      ids: ["--theme-pill-border"],
      label: "Border",
      defaultHex: "#faf8f6",
    },
  ],
};

const DICTIONARY_SECTION: ThemeSection = {
  title: "Dictionary",
  items: [
    {
      ids: ["--theme-dictionary-panel-bg"],
      label: "Panel Background",
      defaultHex: "#1b1b1b",
    },
    {
      ids: ["--theme-dictionary-panel-border"],
      label: "Panel Border",
      defaultHex: "#5f6368",
    },
    {
      ids: ["--theme-dictionary-title"],
      label: "Title",
      defaultHex: "#faf8f6",
    },
    {
      ids: ["--theme-dictionary-accent"],
      label: "Accent",
      defaultHex: "#fbbc05",
    },
    {
      ids: ["--theme-dictionary-input-bg"],
      label: "Input Background",
      defaultHex: "#1f1f1f",
    },
    {
      ids: ["--theme-dictionary-input-border"],
      label: "Input Border",
      defaultHex: "#262626",
    },
    {
      ids: ["--theme-dictionary-input-text"],
      label: "Input Text",
      defaultHex: "#faf8f6",
    },
    {
      ids: ["--theme-dictionary-body"],
      label: "Body Text",
      defaultHex: "#fffaf0",
    },
    {
      ids: ["--theme-dictionary-card-bg"],
      label: "Saved Card Background",
      defaultHex: "#202020",
    },
    {
      ids: ["--theme-dictionary-card-text"],
      label: "Saved Card Text",
      defaultHex: "#d9d9d9",
    },
  ],
};

const EXPLORE_SIDEBAR_SECTION: ThemeSection = {
  title: "Explore Sidebar",
  items: [
    {
      ids: ["--theme-explore-sidebar-title"],
      label: "Heading Text",
      defaultHex: "#faf8f6",
    },
    {
      ids: ["--theme-explore-sidebar-muted"],
      label: "Secondary Text",
      defaultHex: "#c6b9ab",
    },
    {
      ids: ["--theme-explore-sidebar-footer"],
      label: "Footer Text",
      defaultHex: "#8b7e70",
    },
  ],
};

function normalizeHexForInput(value: string, fallback: string): string {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    const chars = normalized.slice(1).split("");
    return `#${chars.map((char) => char + char).join("")}`;
  }
  return fallback;
}

function getStoredCustomStyles(): Record<string, string> {
  const saved = localStorage.getItem(CUSTOM_STYLES_STORAGE_KEY);
  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return {};

    const sanitized = { ...(parsed as Record<string, string>) };
    REMOVED_THEME_TOKENS.forEach((token) => {
      delete sanitized[token];
    });
    return sanitized;
  } catch {
    return {};
  }
}

function resolveThemeRoute(pathname: string): ThemeRouteConfig {
  const sections: ThemeSection[] = [SITE_SECTION];

  if (/^\/work\/[^/]+/.test(pathname)) {
    sections.push(
      DETAIL_ACTION_SECTION,
      QUOTE_CARD_SECTION,
      PILL_BUTTON_SECTION,
      DICTIONARY_SECTION,
    );
    return { label: "Detail", sections };
  }

  if (/^\/collection\/[^/]+/.test(pathname)) {
    sections.push(QUOTE_CARD_SECTION);
    return { label: "Author", sections };
  }

  if (/^\/profile(?:\/|$)/.test(pathname)) {
    return { label: "Profile", sections };
  }

  if (/^\/explore(?:\/|$)/.test(pathname)) {
    sections.push(EXPLORE_SIDEBAR_SECTION);
    return { label: "Explore", sections };
  }

  if (/^\/authors(?:\/|$)/.test(pathname)) {
    return { label: "Authors", sections };
  }

  if (/^\/search(?:\/|$)/.test(pathname)) {
    return { label: "Search", sections };
  }

  if (/^\/login(?:\/|$)/.test(pathname)) {
    return { label: "Login", sections };
  }

  return { label: "Website", sections };
}

export const ThemeEditorDrawer: React.FC<ThemeEditorDrawerProps> = ({
  isOpen,
  onClose,
  routePath,
  anchorRect,
}) => {
  const [customStyles, setCustomStyles] = useState<Record<string, string>>(
    getStoredCustomStyles,
  );

  useEffect(() => {
    localStorage.setItem(CUSTOM_STYLES_STORAGE_KEY, JSON.stringify(customStyles));
  }, [customStyles]);

  const routeConfig = useMemo(() => resolveThemeRoute(routePath), [routePath]);

  const handleColorChange = (tokenIds: string[], color: string) => {
    setCustomStyles((prev) => {
      const next = { ...prev };
      tokenIds.forEach((tokenId) => {
        next[tokenId] = color;
      });
      return next;
    });
  };

  const resetColor = (tokenIds: string[]) => {
    setCustomStyles((prev) => {
      const next = { ...prev };
      tokenIds.forEach((tokenId) => {
        delete next[tokenId];
      });
      return next;
    });
  };

  const dynamicStyles = (
    <style>
      {`
        :root {
          color-scheme: dark;
          ${Object.entries(GOODREADS_DARK_THEME)
            .map(([key, color]) => `${key}: ${color};`)
            .join("\n          ")}
          ${Object.entries(customStyles)
            .map(([key, color]) => `${key}: ${color} !important;`)
            .join("\n          ")}
        }
      `}
    </style>
  );

  if (!isOpen) {
    return dynamicStyles;
  }

  return (
    <>
      {dynamicStyles}
      <FloatingDrawer
        isOpen={isOpen}
        title="Theme Editor"
        onClose={onClose}
        anchorRect={anchorRect}
        defaultSize={{ width: 420, height: 620 }}
        minSize={{ width: 360, height: 360 }}
        bodyStyle={styles.drawerBody}
      >
        <div style={styles.routeLabel}>Route: {routeConfig.label}</div>

        <div style={styles.listContainer}>
          <div style={styles.sectionWrap}>
            <div style={styles.sectionTitle}>Advanced</div>
            <div style={styles.sectionDescription}>
              Fine-tune route-specific tokens on top of the Goodreads dark
              preset.
            </div>
          </div>

          {routeConfig.sections.length ? (
            routeConfig.sections.map((section) => (
              <div key={section.title} style={styles.sectionWrap}>
                <div style={styles.sectionTitle}>{section.title}</div>

                {section.items.map((item) => {
                  const storedColor = item.ids
                    .map((id) => customStyles[id])
                    .find(Boolean);
                  const isCustomized = item.ids.some(
                    (id) => id in customStyles,
                  );
                  const currentColor = normalizeHexForInput(
                    storedColor || item.defaultHex,
                    item.defaultHex,
                  );

                  return (
                    <div key={item.label} style={styles.varRow}>
                      <div style={styles.varInfo}>
                        <div style={styles.varLabel}>{item.label}</div>
                        <div style={styles.varCode}>{item.ids.join(", ")}</div>
                      </div>

                      <div style={styles.varControls}>
                        <div style={styles.pickerWrapper}>
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) =>
                              handleColorChange(item.ids, e.target.value)
                            }
                            style={styles.colorPicker}
                            title={`Change ${item.label}`}
                          />
                        </div>

                        {isCustomized ? (
                          <button
                            onClick={() => resetColor(item.ids)}
                            style={styles.resetBtn}
                            title="Reset to default"
                          >
                            ↺
                          </button>
                        ) : (
                          <div style={{ width: "24px" }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div style={styles.emptyState}>
              Theme editing is intentionally disabled on this route.
            </div>
          )}
        </div>

        {Object.keys(customStyles).length > 0 && (
          <button
            onClick={() => setCustomStyles({})}
            style={styles.resetAllBtn}
          >
            Reset Advanced Overrides
          </button>
        )}
      </FloatingDrawer>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  drawerBody: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    padding: "0 20px 20px",
  },
  routeLabel: {
    fontSize: "12px",
    color: "var(--color-text-page-secondary)",
    textTransform: "capitalize",
    marginBottom: "14px",
  },
  listContainer: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    paddingRight: "8px",
  },
  sectionWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sectionTitle: {
    color: "var(--color-text-page-tertiary)",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  sectionDescription: {
    color: "var(--color-text-page-secondary)",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  varRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    backgroundColor: "var(--color-bg-overlay-card)",
    border: "1px solid var(--color-border-card-soft)",
  },
  varInfo: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  varLabel: {
    fontSize: "13px",
    color: "var(--color-text-page-primary)",
    fontWeight: 600,
  },
  varCode: {
    fontSize: "11px",
    color: "var(--color-text-page-secondary)",
    wordBreak: "break-all",
  },
  varControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  pickerWrapper: {
    width: "28px",
    height: "28px",
    borderRadius: "999px",
    overflow: "hidden",
    border: "1px solid var(--color-border-card-soft)",
  },
  colorPicker: {
    width: "40px",
    height: "40px",
    padding: 0,
    margin: "-6px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
  },
  resetBtn: {
    width: "24px",
    height: "24px",
    border: "none",
    borderRadius: "999px",
    backgroundColor: "var(--color-bg-overlay-subtle)",
    color: "var(--color-text-page-secondary)",
    cursor: "pointer",
  },
  resetAllBtn: {
    marginTop: "16px",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    backgroundColor: "var(--color-bg-danger)",
    color: "var(--color-text-page-primary)",
    cursor: "pointer",
    fontWeight: 600,
  },
  emptyState: {
    color: "var(--color-text-page-secondary)",
    fontSize: "13px",
    lineHeight: 1.6,
  },
};

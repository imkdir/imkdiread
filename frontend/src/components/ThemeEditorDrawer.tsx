import React, { useEffect, useState } from "react";
import { FloatingDrawer } from "./FloatingDrawer";

interface ThemeEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

interface ThemeTokenDefinition {
  ids: string[];
  label: string;
  defaultHex: string;
}

type ThemeTokens = Record<string, string>;

const CUSTOM_STYLES_STORAGE_KEY = "app-custom-styles";

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

const QUOTE_THEME_ITEMS: ThemeTokenDefinition[] = [
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
    ids: ["--theme-quote-card-front-border", "--theme-quote-card-back-border"],
    label: "Border",
    defaultHex: "#ccc5b3",
  },
  {
    ids: ["--theme-quote-card-front-text", "--theme-quote-card-explanation-text"],
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
];

const EDITABLE_THEME_TOKEN_IDS = new Set(
  QUOTE_THEME_ITEMS.flatMap((item) => item.ids),
);

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

    return Object.fromEntries(
      Object.entries(parsed as Record<string, string>).filter(([tokenId]) =>
        EDITABLE_THEME_TOKEN_IDS.has(tokenId),
      ),
    );
  } catch {
    return {};
  }
}

export const ThemeEditorDrawer: React.FC<ThemeEditorDrawerProps> = ({
  isOpen,
  onClose,
  anchorRect,
}) => {
  const [customStyles, setCustomStyles] = useState<Record<string, string>>(
    getStoredCustomStyles,
  );

  useEffect(() => {
    localStorage.setItem(
      CUSTOM_STYLES_STORAGE_KEY,
      JSON.stringify(customStyles),
    );
  }, [customStyles]);

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
        title="Quote Theme"
        onClose={onClose}
        variant="paper"
        anchorRect={anchorRect}
        defaultSize={{ width: 420, height: 620 }}
        minSize={{ width: 360, height: 360 }}
        bodyStyle={styles.drawerBody}
      >
        <div style={styles.listContainer}>
          <div style={styles.sectionWrap}>
            {QUOTE_THEME_ITEMS.map((item) => {
              const storedColor = item.ids
                .map((id) => customStyles[id])
                .find(Boolean);
              const isCustomized = item.ids.some((id) => id in customStyles);
              const currentColor = normalizeHexForInput(
                storedColor || item.defaultHex,
                item.defaultHex,
              );

              return (
                <div key={item.label} style={styles.varRow}>
                  <div style={styles.varInfo}>
                    <div style={styles.varLabel}>{item.label}</div>
                  </div>

                  <div style={styles.varControls}>
                    <div style={styles.pickerWrapper}>
                      <div
                        style={{
                          ...styles.colorSwatch,
                          backgroundColor: currentColor,
                        }}
                      />
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
                      <div style={{ width: "28px" }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
    padding: "18px 20px 20px",
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
  varRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 14px",
    borderRadius: "14px",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.46), rgba(240, 229, 211, 0.9)), rgba(248, 242, 232, 0.9)",
    border: "1px solid rgba(122, 91, 57, 0.16)",
  },
  varInfo: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
  },
  varLabel: {
    fontSize: "13px",
    color: "#312419",
    fontWeight: 600,
  },
  varControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  pickerWrapper: {
    width: "34px",
    height: "34px",
    position: "relative",
    borderRadius: "999px",
    overflow: "hidden",
    border: "1px solid rgba(122, 91, 57, 0.16)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(237, 226, 209, 0.92)), rgba(247, 241, 230, 0.94)",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 4px 10px rgba(89, 62, 34, 0.08)",
  },
  colorSwatch: {
    position: "absolute",
    inset: "3px",
    borderRadius: "999px",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.22)",
    pointerEvents: "none",
  },
  colorPicker: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    padding: 0,
    margin: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    opacity: 0,
  },
  resetBtn: {
    width: "28px",
    height: "28px",
    border: "1px solid rgba(122, 91, 57, 0.14)",
    borderRadius: "999px",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(236, 225, 207, 0.95)), rgba(247, 241, 230, 0.92)",
    color: "#6a5139",
    cursor: "pointer",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 2px 8px rgba(89, 62, 34, 0.08)",
  },
  resetAllBtn: {
    marginTop: "16px",
    border: "1px solid rgba(152, 66, 49, 0.24)",
    borderRadius: "12px",
    padding: "11px 14px",
    background:
      "linear-gradient(180deg, rgba(177, 86, 67, 0.96), rgba(135, 57, 42, 0.96)), rgba(123, 54, 40, 0.94)",
    color: "#fbf4ea",
    cursor: "pointer",
    fontWeight: 600,
    boxShadow:
      "0 14px 28px rgba(92, 38, 25, 0.16), inset 0 1px 0 rgba(255, 221, 213, 0.2)",
  },
};

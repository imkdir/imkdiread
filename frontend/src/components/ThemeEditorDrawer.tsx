import React, { useState, useEffect } from "react";

interface ThemeEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// 1. Define all the theme variables used across your CSS here
const THEME_VARIABLES = [
  { id: "--bg-main", label: "Main Background", defaultHex: "#121212" },
  { id: "--bg-elevated", label: "Card Background", defaultHex: "#1e1e1e" },
  { id: "--text-main", label: "Primary Text", defaultHex: "#f5f5f5" },
  { id: "--text-muted", label: "Muted Text", defaultHex: "#888888" },
  { id: "--border-subtle", label: "Subtle Borders", defaultHex: "#333333" },
  { id: "--fanza-dark", label: "Brand Accent", defaultHex: "#0095f6" },
  { id: "--fanza-red", label: "Danger & Highlights", defaultHex: "#e53935" },
  { id: "--goodreads-dark", label: "Reader Background", defaultHex: "#1a1a1a" },
  { id: "--goodreads-light", label: "Reader Text", defaultHex: "#f4f1ea" },
];

export const ThemeEditorDrawer: React.FC<ThemeEditorDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  // Load saved styles from localStorage on boot
  const [customStyles, setCustomStyles] = useState<Record<string, string>>(
    () => {
      const saved = localStorage.getItem("app-custom-styles");
      return saved ? JSON.parse(saved) : {};
    },
  );

  // Save to localStorage whenever styles change
  useEffect(() => {
    localStorage.setItem("app-custom-styles", JSON.stringify(customStyles));
  }, [customStyles]);

  // Handle instant color changes
  const handleColorChange = (cssVar: string, color: string) => {
    setCustomStyles((prev) => ({
      ...prev,
      [cssVar]: color,
    }));
  };

  // Reset a specific color back to default
  const resetColor = (cssVar: string) => {
    setCustomStyles((prev) => {
      const next = { ...prev };
      delete next[cssVar];
      return next;
    });
  };

  // MAGIC: We always render this <style> block so the theme persists globally
  const dynamicStyles = (
    <style>
      {`
        :root {
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
      <div style={styles.drawer}>
        <div style={styles.drawerHeader}>
          <h3 style={{ margin: 0, color: "#fff" }}>Theme Editor</h3>
          <span style={{ cursor: "pointer", color: "#888" }} onClick={onClose}>
            ✕
          </span>
        </div>

        {/* The Scrollable List of Pre-defined Theme Colors */}
        <div style={styles.listContainer}>
          {THEME_VARIABLES.map((themeVar) => {
            const isCustomized = !!customStyles[themeVar.id];
            const currentColor =
              customStyles[themeVar.id] || themeVar.defaultHex;

            return (
              <div key={themeVar.id} style={styles.varRow}>
                <div style={styles.varInfo}>
                  <div style={styles.varLabel}>{themeVar.label}</div>
                  <div style={styles.varCode}>{themeVar.id}</div>
                </div>

                <div style={styles.varControls}>
                  <div style={styles.pickerWrapper}>
                    <input
                      type="color"
                      value={currentColor}
                      onChange={(e) =>
                        handleColorChange(themeVar.id, e.target.value)
                      }
                      style={styles.colorPicker}
                      title={`Change ${themeVar.label}`}
                    />
                  </div>

                  {isCustomized ? (
                    <button
                      onClick={() => resetColor(themeVar.id)}
                      style={styles.resetBtn}
                      title="Reset to default"
                    >
                      ↺
                    </button>
                  ) : (
                    <div style={{ width: "24px" }} /> // Invisible spacer to keep alignment
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Show a global reset button only if there are active customizations */}
        {Object.keys(customStyles).length > 0 && (
          <button
            onClick={() => setCustomStyles({})}
            style={styles.resetAllBtn}
          >
            Reset All Defaults
          </button>
        )}
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  drawer: {
    position: "fixed",
    top: 0,
    left: "72px",
    bottom: 0,
    width: "340px",
    borderRight: "1px solid var(--border-subtle)",
    zIndex: 900,
    display: "flex",
    flexDirection: "column",
    padding: "20px",
    backgroundColor: "rgba(0,0,0, 0.7)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.5)",
  },
  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  listContainer: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingRight: "8px", // Space for scrollbar
  },
  varRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    backgroundColor: "rgba(255,255,255, 0.05)",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255, 0.05)",
  },
  varInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  varLabel: {
    color: "#fff",
    fontSize: "14px",
    fontWeight: "bold",
  },
  varCode: {
    color: "#888",
    fontSize: "11px",
    fontFamily: "monospace",
  },
  varControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  pickerWrapper: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    overflow: "hidden", // Makes the square color picker look circular!
    border: "2px solid rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  colorPicker: {
    cursor: "pointer",
    width: "200%",
    height: "200%",
    border: "none",
    padding: 0,
    backgroundColor: "transparent",
  },
  resetBtn: {
    backgroundColor: "transparent",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.6,
  },
  resetAllBtn: {
    marginTop: "20px",
    padding: "12px",
    backgroundColor: "var(--fanza-red, #e53935)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    textTransform: "uppercase",
    fontSize: "12px",
    letterSpacing: "0.5px",
  },
};

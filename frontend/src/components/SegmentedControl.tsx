import React from "react";
import { motion } from "framer-motion";

export interface SegmentOption {
  label: string;
  value: string;
  count?: number;
}

interface Props {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

export class SegmentedControl extends React.Component<Props> {
  render() {
    const { options, value, onChange, style } = this.props;

    return (
      <div style={{ ...styles.container, ...style }}>
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              style={styles.button}
              type="button"
            >
              {isActive && (
                <motion.div
                  layoutId="segmentedControlIndicator"
                  style={styles.activeIndicator}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 30,
                  }}
                />
              )}
              <span
                style={{
                  ...styles.text,
                  color: isActive ? "#000000" : "#ffffff",
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                {option.count !== undefined ? (
                  <span style={styles.count}>{option.count} </span>
                ) : null}
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "inline-flex",
    backgroundColor: "#ffffff30",
    borderRadius: "9px",
    padding: "2px",
    position: "relative",
    zIndex: 0,
  },
  button: {
    flex: 1,
    position: "relative",
    border: "none",
    background: "transparent",
    padding: "4px 16px",
    cursor: "pointer",
    borderRadius: "8px",
    outline: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#eee",
    borderRadius: "8px",
    boxShadow: "0 3px 8px 0 rgba(0,0,0,0.12), 0 3px 1px 0 rgba(0,0,0,0.04)",
    zIndex: -1,
  },
  text: {
    fontSize: "13px",
    fontWeight: 500,
    lineHeight: "20px",
    transition: "color 0.2s ease, opacity 0.2s ease",
    zIndex: 1,
    whiteSpace: "nowrap",
    fontFamily: "-apple-system, system-ui",
  },
  count: {
    fontWeight: 700,
    marginRight: "2px",
  },
};

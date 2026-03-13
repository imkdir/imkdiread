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
  theme?: {
    backgroundColor?: string;
    activeBackgroundColor?: string;
    activeTextColor?: string;
    inactiveTextColor?: string;
  };
}

export class SegmentedControl extends React.Component<Props> {
  render() {
    const { options, value, onChange, style, theme } = this.props;

    return (
      <div
        style={{
          ...styles.container,
          ...(theme?.backgroundColor
            ? { backgroundColor: theme.backgroundColor }
            : {}),
          ...style,
        }}
      >
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
                  style={{
                    ...styles.activeIndicator,
                    ...(theme?.activeBackgroundColor
                      ? { backgroundColor: theme.activeBackgroundColor }
                      : {}),
                  }}
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
                  color: isActive
                    ? (theme?.activeTextColor ?? styles.text.color)
                    : (theme?.inactiveTextColor ?? styles.textInactive.color),
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
    borderRadius: "8px",
    boxShadow:
      "0 3px 8px 0 var(--color-shadow-soft), 0 3px 1px 0 var(--color-shadow-subtle)",
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
    color: "var(--color-text-page-inverse-strong)",
  },
  textInactive: {
    color: "var(--color-text-page-inverse)",
  },
  count: {
    fontWeight: 700,
    marginRight: "2px",
  },
};

import React, { PureComponent } from "react";
import type { Work } from "../types";

interface Props {
  work: Work;
  style?: React.CSSProperties;
}

export class ProgressBar extends PureComponent<Props> {
  render() {
    const { page_count, current_page } = this.props.work;

    if (!page_count || !current_page) return null;

    const progress = page_count
      ? Math.max(0, Math.min(100, (current_page / page_count) * 100))
      : 0;

    return (
      <div style={{ ...styles.root, ...this.props.style }}>
        <div style={styles.bar}>
          <div style={{ ...styles.fill, width: `${progress}%` }} />
        </div>
        <span style={styles.label}>{`${current_page} / ${page_count}`}</span>
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
  },
  bar: {
    flex: 1,
    position: "relative",
    minWidth: "80px",
    height: "12px",
    backgroundColor: "rgba(235, 226, 215, 0.4)",
  },
  fill: {
    position: "absolute",
    left: 0.5,
    top: 0.5,
    bottom: 0.5,
    backgroundColor: "var(--goodreads-light)",
  },
  label: {
    fontSize: "13px",
    fontFamily: "-apple-system, system-ui",
    color: "var(--goodreads-light)",
  },
};

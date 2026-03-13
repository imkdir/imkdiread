import React, { PureComponent } from "react";
import type { Work } from "../types";
import "./ProgressBar.css";

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
      <div className="progress-bar" style={this.props.style}>
        <div className="progress-bar__track">
          <div
            className="progress-bar__fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="progress-bar__label">{`${current_page} / ${page_count}`}</span>
      </div>
    );
  }
}

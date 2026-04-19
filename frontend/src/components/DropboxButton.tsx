import React, { PureComponent } from "react";
import { AppIcon } from "./AppIcon";

interface Props {
  style?: React.CSSProperties;
  onClick?: () => void;
}

export class DropboxButton extends PureComponent<Props> {
  render() {
    return (
      <button
        style={{ ...styles.root, ...this.props.style }}
        onClick={this.props.onClick}
      >
        <AppIcon name="dropbox" width={28} height={26} />
      </button>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
};

import React, { PureComponent } from "react";
import logo from "../assets/imgs/dropbox.svg";

interface Props {
  style?: React.CSSProperties;
  onClick?: () => void;
}

export class DropboxButton extends PureComponent<Props, {}> {
  render() {
    return (
      <button
        style={{ ...styles.root, ...this.props.style }}
        onClick={this.props.onClick}
      >
        <img src={logo} style={styles.icon} alt={"dropbox-logo"} />
      </button>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    border: "none",
    borderRadius: "8px",
    backgroundColor: "#fff",
  },
  icon: {
    display: "block",
    height: "26px",
    width: "28px",
    transform: "translateY(1px)",
  },
};

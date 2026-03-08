import React, { PureComponent } from "react";
import logo from "../assets/imgs/finder.png";

interface Props {
  style?: React.CSSProperties;
  onClick: () => void;
}

export class FinderButton extends PureComponent<Props, {}> {
  render() {
    return (
      <button
        style={{ ...styles.root, ...this.props.style }}
        onClick={this.props.onClick}
      >
        <img src={logo} style={styles.logo} alt={"finder-logo"} />
      </button>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    border: "none",
    backgroundColor: "transparent",
  },
  logo: {
    display: "block",
    height: "26px",
  },
};

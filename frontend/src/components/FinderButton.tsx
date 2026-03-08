import React, { PureComponent } from "react";

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
        <img src={"/finder.png"} style={styles.logo} alt={"finder-logo"} />
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

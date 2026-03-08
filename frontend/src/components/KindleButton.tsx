import React, { PureComponent } from "react";
import { Link } from "react-router-dom";

interface Props {
  asin: string;
  style?: React.CSSProperties;
}

export class KindleButton extends PureComponent<Props, {}> {
  render() {
    return (
      <Link
        to={`https://read.amazon.com/?asin=${this.props.asin}`}
        title="Right Click then Select Open Link in Split View"
        style={{ ...styles.root, ...this.props.style }}
      >
        <img src={"/kindle.png"} style={styles.icon} alt={"kindle-logo"} />
      </Link>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    display: "inline",
    borderRadius: "8px",
  },
  icon: {
    display: "block",
    height: "26px",
  },
};

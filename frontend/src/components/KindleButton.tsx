import React, { PureComponent } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/imgs/kindle.png";

interface Props {
  asin: string;
  style?: React.CSSProperties;
}

export class KindleButton extends PureComponent<Props> {
  render() {
    return (
      <Link
        to={`https://read.amazon.com/?asin=${this.props.asin}`}
        title="Right Click then Select Open Link in Split View"
        style={{ ...styles.root, ...this.props.style }}
      >
        <img src={logo} style={styles.icon} alt={"kindle-logo"} />
      </Link>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    display: "inline",
    borderRadius: "8px",
    cursor: "pointer",
  },
  icon: {
    display: "block",
    height: "26px",
  },
};

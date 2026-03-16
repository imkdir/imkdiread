import React, { PureComponent } from "react";
import logo from "../assets/imgs/finder.png";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement>;

export class FinderButton extends PureComponent<Props> {
  render() {
    const { style, type = "button", ...props } = this.props;

    return (
      <button
        type={type}
        style={{ ...styles.root, ...style }}
        {...props}
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
    cursor: "pointer",
  },
  logo: {
    display: "block",
    height: "26px",
  },
};

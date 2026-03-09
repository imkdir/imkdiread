import React, { PureComponent } from "react";
import logo from "../assets/imgs/goodreads.svg";

interface Props {
  category: "book" | "author";
  goodreadsId: string;
  style?: React.CSSProperties;
}

export class GoodreadsButton extends PureComponent<Props> {
  render() {
    return (
      <div
        style={{ ...styles.root, ...this.props.style }}
        onClick={this.openGoodreadsPage}
      >
        <img src={logo} style={styles.icon} alt={"goodreads-logo"} />
      </div>
    );
  }

  openGoodreadsPage = () => {
    const { category, goodreadsId } = this.props;

    window.open(
      `https://www.goodreads.com/${category}/show/${goodreadsId}`,
      "_blank",
    );
  };
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    height: "24px",
    border: "none",
    padding: "4px 8px 0px 8px",
    borderRadius: "8px",
    backgroundColor: "var(--goodreads-light)",
  },
  icon: {
    height: "16px",
    transform: "translateY(1px)",
  },
};

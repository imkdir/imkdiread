import React, { PureComponent } from "react";
import { AppIcon } from "./AppIcon";

interface Props {
  category: "book" | "author";
  goodreadsId: string;
  style?: React.CSSProperties;
  className?: string;
}

export class GoodreadsButton extends PureComponent<Props> {
  render() {
    return (
      <div
        className={this.props.className}
        style={{ ...styles.root, ...this.props.style }}
        onClick={this.openGoodreadsPage}
      >
        <AppIcon
          name="goodreads"
          width={64}
          height={16}
          title="Goodreads"
          style={styles.icon}
        />
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
    cursor: "pointer",
  },
  icon: {
    height: "16px",
    transform: "translateY(1px)",
  },
};

import React from "react";
import { Link } from "react-router-dom";
import { type Author } from "../types";
import { GoodreadsAuthorAvatar } from "./GoodreadsAuthorAvatar";

export const AuthorCard: React.FC<{
  author: Author;
  style?: React.CSSProperties;
  theme?: {
    cardBackgroundColor?: string;
    cardBorderColor?: string;
    avatarBackgroundColor?: string;
    avatarTextColor?: string;
    nameColor?: string;
    avatarPlaceholderBackgroundColor?: string;
  };
  disableAvatarUpload?: boolean;
}> = ({ author, style, theme, disableAvatarUpload }) => (
  <Link
    to={`/collection/${encodeURIComponent(author.name)}`}
    style={{
      ...styles.card,
      ...(theme?.cardBackgroundColor
        ? { backgroundColor: theme.cardBackgroundColor }
        : {}),
      ...(theme?.cardBorderColor ? { borderColor: theme.cardBorderColor } : {}),
      ...style,
    }}
  >
    <GoodreadsAuthorAvatar
      author={author}
      style={{
        ...styles.avatar,
        ...(theme?.avatarBackgroundColor
          ? { backgroundColor: theme.avatarBackgroundColor }
          : {}),
        ...(theme?.avatarTextColor ? { color: theme.avatarTextColor } : {}),
      }}
      placeholderStyle={
        theme?.avatarPlaceholderBackgroundColor
          ? { backgroundColor: theme.avatarPlaceholderBackgroundColor }
          : undefined
      }
      disableAdminUpload={disableAvatarUpload}
    />
    <span
      style={{
        ...styles.name,
        ...(theme?.nameColor ? { color: theme.nameColor } : {}),
      }}
    >
      {author.name}
    </span>
  </Link>
);

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "1px solid",
    borderRadius: "12px",
    padding: "24px 0",
    textDecoration: "none",
    flex: "1 0 160px",
  },
  avatar: {
    width: "90px",
    height: "90px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    marginBottom: "12px",
  },
  name: {
    fontSize: "13px",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "80%",
  },
};

import React from "react";
import type { Author } from "../types";

import "./GoodreadsImages.css";

interface AvatarProps {
  author: Author;
  className?: string;
  style?: React.CSSProperties;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  placeholderClassName?: string;
  placeholderStyle?: React.CSSProperties;
}

interface ImgState {
  hasError: boolean;
}

function joinClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export class GoodreadsAuthorAvatar extends React.Component<AvatarProps, ImgState> {
  state: ImgState = { hasError: false };

  componentDidUpdate(prevProps: AvatarProps) {
    if (prevProps.author.avatar_img_url !== this.props.author.avatar_img_url) {
      this.setState({ hasError: false });
    }
  }

  handleError = () => this.setState({ hasError: true });

  render() {
    const {
      author,
      className,
      style,
      imageClassName,
      imageStyle,
      placeholderClassName,
      placeholderStyle,
    } = this.props;
    const { hasError } = this.state;

    const src = author.avatar_img_url;
    const alt = author.name;
    const isFallback = !src || hasError;

    return (
      <div
        className={joinClasses("goodreads-author-avatar", className)}
        style={style}
      >
        {isFallback ? (
          <div
            className={joinClasses(
              "goodreads-author-avatar__placeholder",
              placeholderClassName,
            )}
            style={placeholderStyle}
          >
            {alt.charAt(0)}
          </div>
        ) : (
          <img
            src={src as string}
            alt={alt}
            className={joinClasses(
              "goodreads-author-avatar__image",
              imageClassName,
            )}
            style={imageStyle}
            onError={this.handleError}
          />
        )}
      </div>
    );
  }
}

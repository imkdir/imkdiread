import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { Author, Work } from "../types";

// --- COMPONENT PROPS ---
interface AvatarProps {
  author: Author;
  style?: React.CSSProperties;
}

interface CoverProps {
  work: Work;
  disabled?: boolean;
  style?: React.CSSProperties;
  in_transition?: boolean;
}

interface ImgState {
  hasError: boolean;
  isLoaded?: boolean;
}

// ==========================================
// 1. GOODREADS AUTHOR AVATAR
// ==========================================
export class GoodreadsAuthorAvatar extends React.Component<
  AvatarProps,
  ImgState
> {
  state: ImgState = { hasError: false };

  componentDidUpdate(prevProps: AvatarProps) {
    if (prevProps.author.avatar_img_url !== this.props.author.avatar_img_url) {
      this.setState({
        hasError: false,
      });
    }
  }

  handleError = () => this.setState({ hasError: true });

  render() {
    const { author, style } = this.props;
    const { hasError } = this.state;

    const src = author.avatar_img_url;
    const alt = author.name;

    const isFallback = !src || hasError;

    return (
      <div style={{ position: "relative", display: "inline-block", ...style }}>
        {isFallback ? (
          <div style={styles.placeholder}>{alt.charAt(0)}</div>
        ) : (
          <img
            src={src as string}
            alt={alt}
            style={styles.image}
            onError={isFallback ? undefined : this.handleError}
          />
        )}
      </div>
    );
  }
}

// ==========================================
// 2. GOODREADS COVER
// ==========================================
export class GoodreadsCover extends React.Component<CoverProps, ImgState> {
  state: ImgState = {
    hasError: false,
    isLoaded: false,
  };

  componentDidUpdate(prevProps: CoverProps) {
    if (prevProps.work.cover_img_url !== this.props.work.cover_img_url) {
      this.setState({ hasError: false, isLoaded: false });
    }
  }

  handleLoad = () => this.setState({ isLoaded: true });

  render() {
    const { work, disabled, style, in_transition } = this.props;
    const { isLoaded } = this.state;

    return (
      <div
        style={{ position: "relative", display: "inline-block", ...style }}
        className={"work-cover-img"}
      >
        <Link
          to={disabled ? "#" : `/work/${work.id}`}
          state={{ work }}
          style={{ display: "block", height: "100%", borderRadius: "inherit" }}
        >
          {isLoaded || (
            <div
              className="skeleton-card"
              style={{
                ...styles.image,
                position: "absolute",
                top: 0,
                left: 0,
                zIndex: 0,
              }}
            />
          )}
          <motion.img
            layoutId={in_transition ? `work-cover-${work.id}` : undefined}
            src={work.cover_img_url as string}
            alt={work.title}
            style={{
              ...styles.image,
              position: "relative",
              zIndex: 1,
              opacity: isLoaded ? 1 : 0,
              transition: "opacity 0.5s ease-in-out",
            }}
            onLoad={this.handleLoad}
          />
        </Link>
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "inherit",
    display: "block",
  },
  placeholder: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "#333",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "2em",
  },
};

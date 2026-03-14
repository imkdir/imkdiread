import React from "react";
import type { Author } from "../types";
import noAvatar from "../assets/imgs/no_avatar.png";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./GoodreadsImages.css";

interface AvatarProps {
  author: Author;
  className?: string;
  style?: React.CSSProperties;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  placeholderStyle?: React.CSSProperties;
}

interface ImgState {
  hasError: boolean;
  isUploading: boolean;
  uploadError: string | null;
  uploadedAvatarUrl: string | null;
}

function joinClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export class GoodreadsAuthorAvatar extends React.Component<
  AvatarProps,
  ImgState
> {
  fileInputRef = React.createRef<HTMLInputElement>();

  state: ImgState = {
    hasError: false,
    isUploading: false,
    uploadError: null,
    uploadedAvatarUrl: null,
  };

  componentDidUpdate(prevProps: AvatarProps) {
    if (
      prevProps.author.avatar_img_url !== this.props.author.avatar_img_url ||
      prevProps.author.id !== this.props.author.id ||
      prevProps.author.name !== this.props.author.name ||
      prevProps.author.goodreads_id !== this.props.author.goodreads_id
    ) {
      this.setState({
        hasError: false,
        uploadError: null,
        uploadedAvatarUrl: null,
      });
    }
  }

  handleError = () => this.setState({ hasError: true });

  getIsAdmin = () => {
    try {
      const rawUser = localStorage.getItem("user");
      if (!rawUser) return false;

      const user = JSON.parse(rawUser) as { role?: string };
      return user.role === "admin";
    } catch {
      return false;
    }
  };

  handleUploadButtonClick = () => {};

  handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { author } = this.props;
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!author.goodreads_id) {
      this.setState({
        uploadError: "Set a Goodreads ID before uploading an author avatar.",
      });
      return;
    }

    this.setState({ isUploading: true, uploadError: null });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await request(
        `/api/authors/${author.id}/avatar`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await readJsonSafe<{
        success?: boolean;
        error?: string;
        avatar_img_url?: string;
      }>(res);

      if (!res.ok || !data?.success || !data.avatar_img_url) {
        this.setState({
          uploadError: getApiErrorMessage(
            data,
            "Failed to upload author avatar.",
          ),
        });
        showToast(
          getApiErrorMessage(data, "Failed to upload author avatar."),
          { tone: "error" },
        );
        return;
      }

      this.setState({
        hasError: false,
        uploadError: null,
        uploadedAvatarUrl: `${data.avatar_img_url}?t=${Date.now()}`,
      });
      showToast("Author avatar uploaded.", { tone: "success" });
    } catch (error) {
      console.error("Failed to upload author avatar:", error);
      this.setState({
        isUploading: false,
        uploadError: "Failed to upload author avatar.",
      });
      showToast("Failed to upload author avatar.", { tone: "error" });
      return;
    }

    this.setState({ isUploading: false });
  };

  render() {
    const {
      author,
      className,
      style,
      imageClassName,
      imageStyle,
      placeholderStyle,
    } = this.props;
    const { hasError, uploadError, uploadedAvatarUrl } = this.state;
    const isAdmin = this.getIsAdmin();

    const src = uploadedAvatarUrl || author.avatar_img_url;
    const alt = author.name;
    const isFallback = !src || hasError;

    return (
      <div
        className={joinClasses("goodreads-author-avatar", className)}
        style={{
          ...style,
          cursor: isAdmin ? "pointer" : style?.cursor,
        }}
        onClick={isAdmin ? () => this.fileInputRef.current?.click() : undefined}
      >
        {isFallback && (
          <>
            <div
              className="goodreads-author-avatar__placeholder"
              style={placeholderStyle}
              onClick={this.handleUploadButtonClick}
            />
            {isAdmin && (
              <input
                ref={this.fileInputRef}
                type="file"
                accept="image/png"
                hidden
                onChange={this.handleFileChange}
              />
            )}
          </>
        )}
        <img
          src={isFallback ? noAvatar : (src as string)}
          alt={alt}
          className={joinClasses(
            "goodreads-author-avatar__image",
            imageClassName,
          )}
          style={imageStyle}
          onError={this.handleError}
        />
        {uploadError && (
          <span className="goodreads-author-avatar__upload-error">
            {uploadError}
          </span>
        )}
      </div>
    );
  }
}

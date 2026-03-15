import React from "react";
import { type Author } from "../types";
import { AuthorCard } from "../components/AuthorCard";
import { AppIcon } from "../components/AppIcon";
import { Modal } from "../components/Modal";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./AuthorsPage.css";

interface PageState {
  authors: Author[];
  loading: boolean;
  editingAuthor: Author | null;
  goodreadsIdDraft: string;
  selectedAvatarFile: File | null;
  isSaving: boolean;
  deletingAuthorId: number | null;
}

export class AuthorsPage extends React.Component<
  Record<string, never>,
  PageState
> {
  fileInputRef = React.createRef<HTMLInputElement>();

  state: PageState = {
    authors: [],
    loading: true,
    editingAuthor: null,
    goodreadsIdDraft: "",
    selectedAvatarFile: null,
    isSaving: false,
    deletingAuthorId: null,
  };

  componentDidMount() {
    void this.loadAuthors();
  }

  loadAuthors = () => {
    return request("/api/authors")
      .then(async (res) => {
        const data = await readJsonSafe<Author[] | { error?: string }>(res);
        if (!res.ok || !Array.isArray(data)) {
          throw new Error(getApiErrorMessage(data, "Failed to load authors."));
        }
        return data;
      })
      .then((data) => {
        this.setState({
          authors: data,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch explore data", err);
        this.setState({ loading: false });
        showToast("Failed to load authors.", { tone: "error" });
      });
  };

  openEditor = (author: Author) => {
    this.setState({
      editingAuthor: author,
      goodreadsIdDraft: author.goodreads_id || "",
      selectedAvatarFile: null,
    });
  };

  closeEditor = () => {
    if (this.state.isSaving) return;
    this.setState({
      editingAuthor: null,
      goodreadsIdDraft: "",
      selectedAvatarFile: null,
    });
  };

  handleGoodreadsIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ goodreadsIdDraft: event.target.value });
  };

  handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ selectedAvatarFile: event.target.files?.[0] || null });
  };

  handleSave = async () => {
    const { editingAuthor, goodreadsIdDraft, selectedAvatarFile } = this.state;
    if (!editingAuthor) return;

    const nextGoodreadsId = goodreadsIdDraft.trim();

    if (selectedAvatarFile && !nextGoodreadsId) {
      showToast("Goodreads ID is required before uploading an avatar.", {
        tone: "error",
      });
      return;
    }

    this.setState({ isSaving: true });

    try {
      const updateRes = await request(`/api/authors/${editingAuthor.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editingAuthor.name,
          bio: editingAuthor.bio || "",
          goodreads_id: nextGoodreadsId,
        }),
      });
      const updateData = await readJsonSafe<{
        success?: boolean;
        error?: string;
      }>(updateRes);

      if (!updateRes.ok || !updateData?.success) {
        throw new Error(getApiErrorMessage(updateData, "Failed to update author."));
      }

      if (selectedAvatarFile) {
        const formData = new FormData();
        formData.append("file", selectedAvatarFile);

        const uploadRes = await request(
          `/api/authors/${editingAuthor.id}/avatar`,
          {
            method: "POST",
            body: formData,
          },
        );
        const uploadData = await readJsonSafe<{
          success?: boolean;
          error?: string;
        }>(uploadRes);

        if (!uploadRes.ok || !uploadData?.success) {
          throw new Error(
            getApiErrorMessage(uploadData, "Failed to upload author avatar."),
          );
        }
      }

      await this.loadAuthors();
      this.setState({
        editingAuthor: null,
        goodreadsIdDraft: "",
        selectedAvatarFile: null,
      });
      showToast("Author updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to update author.",
        { tone: "error" },
      );
    } finally {
      this.setState({ isSaving: false });
    }
  };

  handleDelete = async (author: Author) => {
    if (!window.confirm(`Delete ${author.name}?`)) {
      return;
    }

    this.setState({ deletingAuthorId: author.id });

    try {
      const res = await request(`/api/authors/${author.id}`, {
        method: "DELETE",
      });
      const data = await readJsonSafe<{ success?: boolean; error?: string }>(res);

      if (!res.ok || !data?.success) {
        throw new Error(getApiErrorMessage(data, "Failed to delete author."));
      }

      await this.loadAuthors();
      if (this.state.editingAuthor?.id === author.id) {
        this.setState({
          editingAuthor: null,
          goodreadsIdDraft: "",
          selectedAvatarFile: null,
        });
      }
      showToast("Author deleted.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to delete author.",
        { tone: "error" },
      );
    } finally {
      this.setState({ deletingAuthorId: null });
    }
  };

  render() {
    const {
      authors,
      editingAuthor,
      goodreadsIdDraft,
      selectedAvatarFile,
      isSaving,
      deletingAuthorId,
    } = this.state;

    return (
      <div className="authors-page">
        <div className="authors-page__container">
          {authors.map((author) => (
            <div key={author.id} className="authors-page__card-wrap">
              <AuthorCard
                author={author}
                disableAvatarUpload={true}
                theme={{
                  cardBackgroundColor: "var(--authors-page-card-bg)",
                  cardBorderColor: "var(--authors-page-card-border)",
                  avatarBackgroundColor: "var(--authors-page-card-avatar-bg)",
                  avatarTextColor: "var(--authors-page-card-avatar-text)",
                  avatarPlaceholderBackgroundColor:
                    "var(--authors-page-card-avatar-placeholder-bg)",
                  nameColor: "var(--authors-page-card-name)",
                }}
              />
              <div className="authors-page__card-actions">
                <button
                  type="button"
                  className="authors-page__icon-trigger authors-page__icon-trigger--edit"
                  onClick={() => this.openEditor(author)}
                  disabled={deletingAuthorId === author.id}
                  title="Edit author"
                  aria-label="Edit author"
                >
                  <AppIcon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  className="authors-page__icon-trigger authors-page__icon-trigger--delete"
                  onClick={() => this.handleDelete(author)}
                  disabled={deletingAuthorId === author.id}
                  title={
                    deletingAuthorId === author.id ? "Deleting..." : "Delete author"
                  }
                  aria-label="Delete author"
                >
                  <AppIcon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <Modal isOpen={!!editingAuthor} onClose={this.closeEditor}>
          <div className="modal-header">
            <p className="modal-subtitle">
              {editingAuthor
                ? `Update Goodreads metadata for ${editingAuthor.name}.`
                : "Update author metadata."}
            </p>
          </div>

          <div className="authors-page__editor-fields">
            <label className="authors-page__editor-label" htmlFor="author-goodreads-id">
              Goodreads ID
            </label>
            <input
              id="author-goodreads-id"
              className="modal-input"
              value={goodreadsIdDraft}
              onChange={this.handleGoodreadsIdChange}
              placeholder="e.g. 3389"
              disabled={isSaving}
            />

            <label className="authors-page__editor-label" htmlFor="author-avatar-file">
              Avatar PNG
            </label>
            <button
              type="button"
              className="authors-page__file-trigger"
              onClick={() => this.fileInputRef.current?.click()}
              disabled={isSaving}
            >
              {selectedAvatarFile ? "Change PNG" : "Choose PNG"}
            </button>
            <input
              ref={this.fileInputRef}
              id="author-avatar-file"
              type="file"
              accept="image/png"
              className="authors-page__file-input"
              onChange={this.handleAvatarFileChange}
              disabled={isSaving}
            />
            <span
              className="authors-page__file-hint"
              title={selectedAvatarFile?.name || ""}
            >
              {selectedAvatarFile?.name || "Upload a PNG avatar file."}
            </span>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn modal-btn--cancel"
              onClick={this.closeEditor}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="modal-btn modal-btn--save"
              onClick={this.handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </Modal>
      </div>
    );
  }
}

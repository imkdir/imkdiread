import React from "react";
import { AppIcon } from "../../components/AppIcon";
import type { Author } from "../../types";
import { request } from "../../utils/APIClient";

import "./AdminAuthorsPage.css";

interface EditFormState {
  name: string;
  bio: string;
  goodreads_id: string;
}

interface State {
  authors: Author[];
  loading: boolean;
  isModalOpen: boolean;
  isAddingNew: boolean;
  editingAuthorId: number | null;
  editForm: EditFormState;
  filterText: string;
}

export class AdminAuthorsPage extends React.Component<Record<string, never>, State> {
  state: State = {
    authors: [],
    loading: true,
    isModalOpen: false,
    isAddingNew: false,
    editingAuthorId: null,
    editForm: this.getEmptyForm(),
    filterText: "",
  };

  componentDidMount() {
    this.fetchAuthors();
  }

  fetchAuthors = () => {
    request("/api/authors")
      .then((res) => res.json())
      .then((data: Author[]) => {
        this.setState({ authors: data, loading: false });
      })
      .catch((err) => {
        console.error("Failed to fetch authors", err);
        this.setState({ loading: false });
      });
  };

  getEmptyForm(): EditFormState {
    return {
      name: "",
      bio: "",
      goodreads_id: "",
    };
  }

  openAddModal = () => {
    this.setState({
      isModalOpen: true,
      isAddingNew: true,
      editingAuthorId: null,
      editForm: this.getEmptyForm(),
    });
  };

  openEditModal = (author: Author) => {
    this.setState({
      isModalOpen: true,
      isAddingNew: false,
      editingAuthorId: author.id,
      editForm: {
        name: author.name,
        bio: author.bio || "",
        goodreads_id: author.goodreads_id || "",
      },
    });
  };

  closeModal = () => {
    this.setState({
      isModalOpen: false,
      isAddingNew: false,
      editingAuthorId: null,
      editForm: this.getEmptyForm(),
    });
  };

  handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    this.setState((prevState) => ({
      editForm: {
        ...prevState.editForm,
        [name]: value,
      },
    }));
  };

  handleDelete = async (author: Author) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${author.name}"? This will remove the author from all linked works.`,
      )
    ) {
      return;
    }

    try {
      const res = await request(`/api/authors/${author.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete author.");
      }

      this.setState((prev) => ({
        authors: prev.authors.filter((entry) => entry.id !== author.id),
      }));
    } catch (error) {
      console.error("Failed to delete author", error);
      alert("Failed to delete author.");
    }
  };

  saveAuthor = async (e: React.FormEvent) => {
    e.preventDefault();
    const { editForm, isAddingNew, editingAuthorId, authors } = this.state;

    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      alert("Author name is required.");
      return;
    }

    const hasDuplicateName = authors.some(
      (author) =>
        author.name.toLowerCase() === trimmedName.toLowerCase() &&
        (isAddingNew || author.id !== editingAuthorId),
    );
    if (hasDuplicateName) {
      alert("This author already exists in your database.");
      return;
    }

    const payload = {
      name: trimmedName,
      bio: editForm.bio.trim(),
      goodreads_id: editForm.goodreads_id.trim(),
    };

    try {
      const res = await request(
        isAddingNew ? "/api/authors" : `/api/authors/${editingAuthorId}`,
        {
          method: isAddingNew ? "POST" : "PUT",
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();

      if (!res.ok || !data.success || !data.author) {
        throw new Error(data.error || "Failed to save author.");
      }

      this.setState((prev) => ({
        authors: isAddingNew
          ? [data.author, ...prev.authors]
          : prev.authors.map((author) =>
              author.id === data.author.id ? data.author : author,
            ),
      }));
      this.closeModal();
    } catch (error) {
      console.error("Failed to save author", error);
      alert("Failed to save author.");
    }
  };

  render() {
    const { authors, loading, isModalOpen, isAddingNew, editForm, filterText } =
      this.state;

    const lowerFilter = filterText.trim().toLowerCase();
    const filteredAuthors = authors.filter((author) => {
      if (!lowerFilter) return true;

      return (
        author.name.toLowerCase().includes(lowerFilter) ||
        (author.bio || "").toLowerCase().includes(lowerFilter) ||
        (author.goodreads_id || "").toLowerCase().includes(lowerFilter)
      );
    });

    return (
      <div className="admin-authors-page">
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Manage Authors</h1>
          <div style={styles.toolbar}>
            <div style={styles.searchWrapper}>
              <AppIcon name="search" title="Search" style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Filter by name, bio, or ID..."
                value={filterText}
                onChange={(e) => this.setState({ filterText: e.target.value })}
                style={styles.searchInput}
              />
              {filterText && (
                <span
                  style={styles.clearSearch}
                  onClick={() => this.setState({ filterText: "" })}
                >
                  ✕
                </span>
              )}
            </div>
            <button onClick={this.openAddModal} style={styles.addBtn}>
              + Add Author
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--color-text-page-secondary)" }}>
            Loading database...
          </p>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Bio</th>
                  <th style={styles.th}>Goodreads ID</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuthors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "30px",
                        textAlign: "center",
                        color: "var(--color-text-page-secondary)",
                      }}
                    >
                      No authors found matching "{filterText}"
                    </td>
                  </tr>
                ) : (
                  filteredAuthors.map((author) => (
                    <tr key={author.id} style={styles.tr}>
                      <td style={styles.td}>
                        <b>{author.name}</b>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.bioCell}>
                          {author.bio || (
                            <span style={{ color: "var(--color-text-muted-strong)" }}>
                              No bio
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={styles.td}>
                        {author.goodreads_id || (
                          <span style={{ color: "var(--color-text-muted-strong)" }}>
                            None
                          </span>
                        )}
                      </td>
                      <td style={styles.actionTd}>
                        <button
                          onClick={() => this.openEditModal(author)}
                          style={styles.iconBtn}
                        >
                          <AppIcon name="edit" title="Edit" style={styles.icon} />
                        </button>
                        <button
                          onClick={() => this.handleDelete(author)}
                          style={styles.iconBtn}
                        >
                          <AppIcon name="trash" title="Delete" style={styles.icon} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {isModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
                {isAddingNew ? "Add New Author" : `Edit: ${editForm.name}`}
              </h2>

              <form onSubmit={this.saveAuthor} style={styles.form}>
                <div style={styles.grid2}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Name</label>
                    <input
                      name="name"
                      value={editForm.name}
                      onChange={this.handleInputChange}
                      style={styles.input}
                      autoFocus
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Goodreads ID</label>
                    <input
                      name="goodreads_id"
                      value={editForm.goodreads_id}
                      onChange={this.handleInputChange}
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Bio</label>
                  <textarea
                    name="bio"
                    value={editForm.bio}
                    onChange={this.handleInputChange}
                    style={styles.textarea}
                    rows={5}
                  />
                </div>

                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    onClick={this.closeModal}
                    style={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button type="submit" style={styles.saveBtn}>
                    {isAddingNew ? "Add Author" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  toolbar: { display: "flex", gap: "16px", alignItems: "center" },
  title: { margin: 0, fontSize: "24px" },
  searchWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    width: "16px",
    height: "16px",
    color: "var(--color-text-page-secondary)",
    pointerEvents: "none",
  },
  searchInput: {
    width: "280px",
    padding: "10px 32px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--color-bg-panel-admin)",
    color: "var(--color-text-page-inverse)",
    fontSize: "14px",
    outline: "none",
  },
  clearSearch: {
    position: "absolute",
    right: "12px",
    color: "var(--color-text-page-secondary)",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
  },
  addBtn: {
    backgroundColor: "var(--text-main)",
    color: "var(--color-text-page-inverse-strong)",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  tableContainer: {
    backgroundColor: "var(--color-bg-panel-admin)",
    borderRadius: "8px",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  th: {
    padding: "16px",
    borderBottom: "1px solid var(--border-subtle)",
    color: "var(--color-text-page-secondary)",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  tr: {
    transition: "background-color 0.2s",
    borderBottom: "1px solid var(--border-subtle)",
  },
  td: { padding: "16px", fontSize: "14px", verticalAlign: "top" },
  bioCell: {
    maxWidth: "360px",
    whiteSpace: "pre-wrap",
    color: "var(--color-text-page-secondary)",
  },
  actionTd: {
    padding: "16px",
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  iconBtn: {
    backgroundColor: "transparent",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    borderRadius: "4px",
  },
  icon: { width: "16px", height: "16px", color: "var(--text-main)" },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "var(--color-bg-overlay-medium)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: "var(--z-overlay-admin-modal)",
  },
  modalContent: {
    backgroundColor: "var(--color-bg-panel-admin)",
    padding: "30px",
    borderRadius: "12px",
    border: "1px solid var(--border-subtle)",
    width: "100%",
    maxWidth: "640px",
    boxShadow: "0 10px 40px var(--color-bg-overlay-soft)",
  },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  label: {
    color: "var(--color-text-page-secondary)",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--color-bg-page-admin)",
    color: "var(--color-text-page-inverse)",
    fontSize: "14px",
    outline: "none",
  },
  textarea: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--color-bg-page-admin)",
    color: "var(--color-text-page-inverse)",
    fontSize: "14px",
    outline: "none",
    resize: "vertical",
    minHeight: "120px",
    fontFamily: "inherit",
  },
  buttonRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "20px",
  },
  cancelBtn: {
    padding: "10px 20px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-subtle)",
    color: "var(--color-text-page-tertiary)",
    borderRadius: "6px",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "10px 20px",
    backgroundColor: "var(--text-main)",
    border: "none",
    color: "var(--color-text-page-inverse-strong)",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};

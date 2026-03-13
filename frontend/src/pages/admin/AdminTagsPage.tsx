import React from "react";
import { AppIcon } from "../../components/AppIcon";
import { request } from "../../utils/APIClient";

import "./AdminTagsPage.css";

interface State {
  tags: string[];
  loading: boolean;
  newTagInput: string;
  editingTag: { oldName: string; newName: string } | null;
}

export class AdminTagsPage extends React.Component<Record<string, never>, State> {
  state: State = {
    tags: [],
    loading: true,
    newTagInput: "",
    editingTag: null,
  };

  componentDidMount() {
    this.fetchTags();
  }

  fetchTags = () => {
    request(`/api/tags`)
      .then((res) => res.json())
      .then((data) => {
        this.setState({ tags: data, loading: false });
      })
      .catch((err) => {
        console.error("Failed to fetch tags", err);
        this.setState({ loading: false });
      });
  };

  handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const { newTagInput } = this.state;
    if (!newTagInput.trim()) return;

    request("/api/tags", {
      method: "POST",
      body: JSON.stringify({
        newTag: newTagInput.trim().toLowerCase(),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState({ tags: data.tags, newTagInput: "" });
        }
      });
  };

  handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const { editingTag } = this.state;
    if (!editingTag || !editingTag.newName.trim()) return;

    request(`/api/tags/${encodeURIComponent(editingTag.oldName)}`, {
      method: "PUT",
      body: JSON.stringify({
        newName: editingTag.newName.trim().toLowerCase(),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.fetchTags(); // Re-fetch to guarantee sync
          this.setState({ editingTag: null });
        }
      });
  };

  handleDelete = (tagName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to globally delete "${tagName}"? This will remove it from all works.`,
      )
    )
      return;

    request(`/api/tags/${encodeURIComponent(tagName)}`, {
      method: "DELETE",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState((prev) => ({
            tags: prev.tags.filter((t) => t !== tagName),
          }));
        }
      });
  };

  render() {
    const { tags, loading, newTagInput, editingTag } = this.state;

    return (
      <div className="admin-tags-page">
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Manage Tags</h1>
        </div>

        {/* Add New Tag Form */}
        <form onSubmit={this.handleAddTag} style={styles.addForm}>
          <input
            type="text"
            placeholder={`Add a new tag...`}
            value={newTagInput}
            onChange={(e) => this.setState({ newTagInput: e.target.value })}
            style={styles.input}
          />
          <button type="submit" style={styles.addBtn}>
            Add Tag
          </button>
        </form>

        {loading ? (
          <p style={{ color: "var(--color-text-page-secondary)" }}>Loading tags...</p>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Tag Name</th>
                  <th
                    style={{
                      ...styles.th,
                      width: "120px",
                      textAlign: "right",
                      paddingRight: "24px",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.tagPill}>{tag}</span>
                    </td>
                    <td style={styles.actionTd}>
                      <button
                        onClick={() =>
                          this.setState({
                            editingTag: { oldName: tag, newName: tag },
                          })
                        }
                        style={styles.iconBtn}
                      >
                        <AppIcon name="edit" title="Edit" style={styles.icon} />
                      </button>
                      <button
                        onClick={() => this.handleDelete(tag)}
                        style={styles.iconBtn}
                      >
                        <AppIcon name="trash" title="Delete" style={styles.icon} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Modal Overlay */}
        {!editingTag || (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <h2 style={{ marginTop: 0, fontSize: "18px" }}>
                Global Rename Tag
              </h2>
              <p
                style={{
                  color: "var(--color-text-page-secondary)",
                  fontSize: "13px",
                  marginBottom: "20px",
                }}
              >
                Renaming this tag will update all works associated with it.
              </p>

              <form onSubmit={this.handleSaveEdit} style={styles.form}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>New Name</label>
                  <input
                    type="text"
                    value={editingTag.newName}
                    onChange={(e) =>
                      this.setState({
                        editingTag: {
                          oldName: editingTag?.oldName || "",
                          newName: e.target.value,
                        },
                      })
                    }
                    style={styles.input}
                    autoFocus
                  />
                </div>

                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    onClick={() => this.setState({ editingTag: null })}
                    style={styles.cancelBtn}
                  >
                    Cancel
                  </button>
                  <button type="submit" style={styles.saveBtn}>
                    Rename Globally
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
  title: { margin: 0, fontSize: "24px" },

  segmentBtn: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "1px solid var(--border-subtle)",
    color: "var(--color-text-page-secondary)",
    borderRadius: "20px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  segmentBtnActive: {
    backgroundColor: "var(--text-main)",
    color: "var(--color-text-page-inverse-strong)",
    border: "1px solid var(--text-main)",
  },

  addForm: { display: "flex", gap: "12px", marginBottom: "24px" },
  input: {
    flexGrow: 1,
    padding: "12px 16px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "var(--color-bg-page-admin)",
    color: "var(--color-text-page-inverse)",
    fontSize: "14px",
    outline: "none",
  },
  addBtn: {
    backgroundColor: "var(--text-main)",
    color: "var(--color-text-page-inverse-strong)",
    border: "none",
    padding: "0 20px",
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
  td: { padding: "16px", fontSize: "14px" },
  actionTd: {
    padding: "16px 24px 16px 16px",
    textAlign: "right",
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },

  tagPill: {
    backgroundColor: "var(--color-bg-panel-admin-alt)",
    padding: "6px 12px",
    borderRadius: "16px",
    fontSize: "13px",
    color: "var(--color-text-page-tertiary)",
  },
  iconBtn: {
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px",
    borderRadius: "4px",
    transition: "background-color 0.2s",
  },
  icon: { width: "16px", height: "16px", color: "var(--color-text-page-secondary)" },

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
    maxWidth: "400px",
    boxShadow: "0 10px 40px var(--color-bg-overlay-soft)",
  },
  form: { display: "flex", flexDirection: "column", gap: "20px" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  label: {
    color: "var(--color-text-page-secondary)",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase",
  },

  buttonRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "10px",
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

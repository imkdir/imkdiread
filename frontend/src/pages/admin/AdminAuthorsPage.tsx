import React from "react";
import type { Author } from "../../types";
import { request } from "../../utils/APIClient";

import editIcon from "../../assets/imgs/edit.svg";
import searchIcon from "../../assets/imgs/search.svg";

interface EditFormState {
  name: string;
  goodreads_id: string;
}

interface State {
  authors: Author[];
  loading: boolean;
  isModalOpen: boolean;
  isAddingNew: boolean;
  originalEditingName: string | null; // Tracks the target for PUT requests
  editForm: EditFormState;
  filterText: string; // <-- Initialized to empty string
}

export class AdminAuthorsPage extends React.Component<{}, State> {
  state: State = {
    authors: [],
    loading: true,
    isModalOpen: false,
    isAddingNew: false,
    originalEditingName: null,
    editForm: this.getEmptyForm(),
    filterText: "", // <-- Initialized to empty string
  };

  componentDidMount() {
    this.fetchAuthors();
  }

  fetchAuthors = () => {
    request("/api/authors")
      .then((res) => res.json())
      .then((data: Author[]) =>
        this.setState({ authors: data, loading: false }),
      )
      .catch((err) => {
        console.error("Failed to fetch authors", err);
        this.setState({ loading: false });
      });
  };

  getEmptyForm(): EditFormState {
    return {
      name: "",
      goodreads_id: "",
    };
  }

  // --- Modal Handlers ---
  openAddModal = () => {
    this.setState({
      ...this.state,
      isModalOpen: true,
      isAddingNew: true,
      originalEditingName: null,
      editForm: this.getEmptyForm(),
    });
  };

  openEditModal = (author: AdminAuthor) => {
    this.setState({
      ...this.state,
      isModalOpen: true,
      isAddingNew: false,
      originalEditingName: author.name,
      editForm: {
        name: author.name,
        goodreads_id: author.goodreads_id || "",
      },
    });
  };

  closeModal = () => {
    this.setState({
      ...this.state,
      isModalOpen: false,
      editForm: this.getEmptyForm(),
    });
  };

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    this.setState((prevState) => ({
      ...this.state,
      editForm: {
        ...prevState.editForm,
        [name]: type === "checkbox" ? checked : value,
      },
    }));
  };

  saveAuthor = (e: React.FormEvent) => {
    e.preventDefault();
    const { editForm, isAddingNew, originalEditingName, authors } = this.state;

    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      alert("Author name is required.");
      return;
    }

    if (
      isAddingNew &&
      authors.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase())
    ) {
      alert("This author already exists in your database.");
      return;
    }

    const updatedAuthor: AdminAuthor = {
      name: trimmedName,
      goodreads_id: editForm.goodreads_id.trim(),
    };

    if (isAddingNew) {
      // Optimistic Update: Add to top of list
      this.setState((prev) => ({
        ...this.state,
        authors: [updatedAuthor, ...prev.authors],
        isModalOpen: false,
      }));

      request("/api/authors", {
        method: "POST",
        body: JSON.stringify(updatedAuthor),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) alert("Failed to save changes. Check console.");
        })
        .catch(() => alert("Network error."));
    } else {
      if (!originalEditingName) return;

      // Optimistic Update: Replace existing entry
      this.setState((prev) => ({
        ...this.state,
        authors: prev.authors.map((a) =>
          a.name === originalEditingName ? updatedAuthor : a,
        ),
        isModalOpen: false,
      }));

      request(`/api/authors/${encodeURIComponent(originalEditingName)}`, {
        method: "PUT",
        body: JSON.stringify(updatedAuthor),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) alert("Failed to save changes. Check console.");
        })
        .catch(() => alert("Network error."));
    }
  };

  render() {
    const { authors, loading, isModalOpen, isAddingNew, editForm, filterText } =
      this.state;

    // --- NEW: The Filtering Logic ---
    const filteredAuthors = authors.filter((author) => {
      if (!filterText) return true; // Show all if filter is empty

      // Search by ID
      if (author.goodreads_id.includes(filterText)) return true;

      // Search by Title
      if (author.name.includes(filterText)) return true;

      return false;
    });

    return (
      <div>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Manage Authors</h1>
          <div style={styles.toolbar}>
            <div style={styles.searchWrapper}>
              <img src={searchIcon} alt="search" style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Filter by ID or name..."
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
          <p style={{ color: "#888" }}>Loading database...</p>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Goodreads ID</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuthors.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "30px",
                        textAlign: "center",
                        color: "#888",
                      }}
                    >
                      No authors found matching "{filterText}"
                    </td>
                  </tr>
                ) : (
                  filteredAuthors.map((author, idx) => (
                    <tr key={idx} style={styles.tr}>
                      <td style={styles.td}>
                        <b>{author.name}</b>
                      </td>
                      <td style={styles.td}>
                        {author.goodreads_id || (
                          <span style={{ color: "#666" }}>None</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => this.openEditModal(author)}
                          style={styles.iconBtn}
                        >
                          <img src={editIcon} alt="Edit" style={styles.icon} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* --- DUAL-PURPOSE MODAL OVERLAY --- */}
        {isModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
                {isAddingNew ? "Add New Author" : `Edit: ${editForm.name}`}
              </h2>

              <form onSubmit={this.saveAuthor} style={styles.form}>
                <div style={styles.grid2}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Name (ID)</label>
                    <input
                      name="name"
                      value={editForm.name}
                      onChange={this.handleInputChange}
                      readOnly={!isAddingNew}
                      style={{
                        ...styles.input,
                        backgroundColor: isAddingNew ? "#121212" : "#2a2a2a",
                        color: isAddingNew ? "#fff" : "#888",
                      }}
                      autoFocus={isAddingNew}
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
    color: "#888",
    pointerEvents: "none",
  },
  searchInput: {
    width: "250px",
    padding: "10px 32px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "#1e1e1e",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
  },
  clearSearch: {
    position: "absolute",
    right: "12px",
    color: "#888",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
  },
  addBtn: {
    backgroundColor: "var(--text-main)",
    color: "#000",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  },

  tableContainer: {
    backgroundColor: "#1e1e1e",
    borderRadius: "8px",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  th: {
    padding: "16px",
    borderBottom: "1px solid var(--border-subtle)",
    color: "#888",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  tr: {
    transition: "background-color 0.2s",
    borderBottom: "1px solid var(--border-subtle)",
  },
  td: { padding: "16px", fontSize: "14px" },

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
    backgroundColor: "rgba(0,0,0,0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  modalContent: {
    backgroundColor: "#1e1e1e",
    padding: "30px",
    borderRadius: "12px",
    border: "1px solid var(--border-subtle)",
    width: "100%",
    maxWidth: "600px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
  },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  label: {
    color: "#888",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border-subtle)",
    backgroundColor: "#121212",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
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
    color: "#ccc",
    borderRadius: "6px",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "10px 20px",
    backgroundColor: "var(--text-main)",
    border: "none",
    color: "#000",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};

import React from "react";
import editIcon from "../../assets/imgs/edit.svg";
import trashIcon from "../../assets/imgs/trash.svg";
import searchIcon from "../../assets/imgs/search.svg";
import type { Work } from "../../types";
import Papa from "papaparse";

interface EditFormState {
  id: string;
  goodreads_id: string;
  page_count: string;
  dropbox_link: string;
  amazon_asin: string;
  title: string;
  authors: string;
  tags: string;
}

interface State {
  works: Work[];
  loading: boolean;
  isModalOpen: boolean;
  isAddingNew: boolean;
  originalEditingId: string | null;
  editForm: EditFormState;
  filterText: string; // <-- NEW: State for the search filter
}

export class AdminWorksPage extends React.Component<{}, State> {
  state: State = {
    works: [],
    loading: true,
    isModalOpen: false,
    isAddingNew: false,
    originalEditingId: null,
    editForm: this.getEmptyForm(),
    filterText: "", // <-- Initialized to empty string
  };

  componentDidMount() {
    this.fetchWorks();
  }

  fetchWorks = () => {
    fetch("/api/works")
      .then((res) => res.json())
      .then((data: Work[]) =>
        this.setState({ ...this.state, works: data, loading: false }),
      )
      .catch((err) => {
        console.error("Failed to fetch works", err);
        this.setState({ ...this.state, loading: false });
      });
  };

  getEmptyForm(): EditFormState {
    return {
      id: "",
      goodreads_id: "",
      page_count: "",
      title: "",
      dropbox_link: "",
      amazon_asin: "",
      authors: "",
      tags: "",
    };
  }

  // --- Modal Handlers ---
  openAddModal = () => {
    this.setState({
      ...this.state,
      isModalOpen: true,
      isAddingNew: true,
      originalEditingId: null,
      editForm: this.getEmptyForm(),
    });
  };

  openEditModal = (work: Work) => {
    this.setState({
      ...this.state,
      isModalOpen: true,
      isAddingNew: false,
      originalEditingId: work.id,
      editForm: {
        id: work.id,
        goodreads_id: work.goodreads_id || "",
        amazon_asin: work.amazon_asin || "",
        dropbox_link: work.dropbox_link || "",
        page_count: String(work.page_count),
        title: work.title || "",
        authors: (work.authors || []).join(", "),
        tags: (work.tags || []).join(", "),
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

  handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    this.setState((prevState) => ({
      ...this.state,
      editForm: { ...prevState.editForm, [name]: value },
    }));
  };

  handleDelete = (workId: string) => {
    if (
      !window.confirm(`Are you sure you want to completely delete ${workId}?`)
    )
      return;

    fetch(`/api/works/${encodeURIComponent(workId)}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.setState((prev) => ({
            ...this.state,
            works: prev.works.filter((w) => w.id !== workId),
          }));
        }
      });
  };

  // --- CSV EXPORT ---
  handleExportCSV = () => {
    const { works } = this.state;

    // Flatten arrays into pipe-separated strings for the CSV
    const csvData = works.map((work) => ({
      id: work.id,
      goodreads_id: work.goodreads_id || "",
      title: work.title || "",
      authors: (work.authors || []).join(" | "),
      tags: (work.tags || []).join(" | "),
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `works_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  // --- CSV IMPORT ---
  handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedWorks = results.data.map((row: any) => ({
          id: row.id.trim().toUpperCase(),
          goodreads_id: row.goodreads_id?.trim() || "",
          page_count: row.page_count ? parseInt(row.page_count.trim()) : 0,
          title: row.title?.trim() || "",
          authors: row.authors
            ? row.authors
                .split("|")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [],
          tags: row.tags
            ? row.tags
                .split("|")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [],
        }));

        // Send the reconstructed JSON to the backend
        fetch("/api/works/bulk-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(importedWorks),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              alert(data.message);
              this.fetchWorks(); // Reload the UI
            } else {
              alert("Import failed.");
            }
          });
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        alert("Failed to read the CSV file.");
      },
    });
    e.target.value = ""; // Reset input after reading
  };

  saveWork = (e: React.FormEvent) => {
    e.preventDefault();
    const { editForm, isAddingNew, originalEditingId, works } = this.state;

    const trimmedId = editForm.id.trim();
    if (!trimmedId) return alert("Work ID is required.");

    const trimmedTitle = editForm.title.trim();
    if (!trimmedTitle) return alert("Work title is required.");

    if (isAddingNew && works.some((w) => w.id === trimmedId)) {
      return alert("This Work ID already exists.");
    }

    const updatedWork = {
      id: trimmedId,
      goodreads_id: editForm.goodreads_id.trim(),
      page_count: Number(editForm.page_count),
      title: trimmedTitle,
      dropbox_link: editForm.dropbox_link.trim(),
      amazon_asin: editForm.amazon_asin.trim(),
      authors: editForm.authors
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      tags: editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    const method = isAddingNew ? "POST" : "PUT";
    const url = isAddingNew
      ? "/api/works"
      : `/api/works/${encodeURIComponent(originalEditingId!)}`;

    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedWork),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.fetchWorks();
          this.closeModal();
        } else {
          alert(data.error || "Failed to save.");
        }
      })
      .catch(() => alert("Network error."));
  };

  render() {
    const { works, loading, isModalOpen, isAddingNew, editForm, filterText } =
      this.state;

    // --- NEW: The Filtering Logic ---
    const lowerFilter = filterText.toLowerCase();
    const filteredWorks = works.filter((work) => {
      if (!lowerFilter) return true; // Show all if filter is empty

      // Search by Title
      if (work.title && work.title.toLowerCase().includes(lowerFilter))
        return true;

      // Search by Tags
      if (
        work.tags &&
        work.tags.some((tag) => tag.toLowerCase().includes(lowerFilter))
      )
        return true;

      return false;
    });

    return (
      <div>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>Manage Works</h1>

          {/* --- NEW: Toolbar Area --- */}
          <div style={styles.toolbar}>
            <div style={styles.searchWrapper}>
              <img src={searchIcon} alt="search" style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Filter by Title, or Tag..."
                value={filterText}
                onChange={(e) =>
                  this.setState({ ...this.state, filterText: e.target.value })
                }
                style={styles.searchInput}
              />
              {filterText && (
                <span
                  style={styles.clearSearch}
                  onClick={() =>
                    this.setState({ ...this.state, filterText: "" })
                  }
                >
                  ✕
                </span>
              )}
            </div>
            <button onClick={this.openAddModal} style={styles.addBtn}>
              + Add Work
            </button>

            <button onClick={this.handleExportCSV} style={styles.outlineBtn}>
              Export CSV
            </button>

            {/* Hidden file input triggered by a styled label */}
            <label style={styles.outlineBtn}>
              Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={this.handleImportCSV}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#888" }}>Loading database...</p>
        ) : (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cover</th>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Tags</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "30px",
                        textAlign: "center",
                        color: "#888",
                      }}
                    >
                      No works found matching "{filterText}"
                    </td>
                  </tr>
                ) : (
                  filteredWorks.map((work) => (
                    <tr key={work.id} style={styles.tr}>
                      <td style={styles.td}>
                        {!work.cover_img_url || (
                          <img
                            src={work.cover_img_url}
                            style={styles.thumbnail}
                            alt="cover"
                          />
                        )}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.truncateTitle}>
                          {work.title || (
                            <span style={{ color: "#666" }}>No Title</span>
                          )}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.tagsWrapper}>
                          {(work.tags || []).slice(0, 3).map((t) => (
                            <span key={t} style={styles.tagPill}>
                              {t}
                            </span>
                          ))}
                          {work.tags && work.tags.length > 3 && (
                            <span style={styles.tagPill}>
                              +{work.tags.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={styles.actionTd}>
                        <button
                          onClick={() => this.openEditModal(work)}
                          style={styles.iconBtn}
                        >
                          <img src={editIcon} alt="Edit" style={styles.icon} />
                        </button>
                        <button
                          onClick={() => this.handleDelete(work.id)}
                          style={styles.iconBtn}
                        >
                          <img
                            src={trashIcon}
                            alt="Delete"
                            style={styles.icon}
                          />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* --- MODAL OVERLAY (Unchanged) --- */}
        {isModalOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalContent}>
              <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
                {isAddingNew ? "Add New Work" : `Edit: ${editForm.id}`}
              </h2>

              <form onSubmit={this.saveWork} style={styles.form}>
                <div style={styles.grid2}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>
                      ID{isAddingNew ? " (required)" : ""}
                    </label>
                    <input
                      name="id"
                      value={editForm.id}
                      onChange={this.handleInputChange}
                      readOnly={!isAddingNew}
                      style={{
                        ...styles.input,
                        backgroundColor: isAddingNew ? "#121212" : "#2a2a2a",
                        color: isAddingNew ? "#fff" : "#888",
                      }}
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
                <div style={styles.grid2}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Title (required)</label>
                    <input
                      name="title"
                      value={editForm.title}
                      onChange={this.handleInputChange}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Page Count</label>
                    <input
                      name="page_count"
                      value={editForm.page_count}
                      onChange={this.handleInputChange}
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.grid2}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Dropbox Link</label>
                    <input
                      name="dropbox_link"
                      value={editForm.dropbox_link}
                      onChange={this.handleInputChange}
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Amazon ASIN</label>
                    <input
                      name="amazon_asin"
                      value={editForm.amazon_asin}
                      onChange={this.handleInputChange}
                      style={styles.input}
                    />
                  </div>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>authors (Comma Separated)</label>
                  <input
                    name="authors"
                    value={editForm.authors}
                    onChange={this.handleInputChange}
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>Tags (Comma Separated)</label>
                  <input
                    name="tags"
                    value={editForm.tags}
                    onChange={this.handleInputChange}
                    style={styles.input}
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
                    {isAddingNew ? "Add Work" : "Save Changes"}
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

  // --- NEW: Toolbar Styles ---
  toolbar: { display: "flex", gap: "16px", alignItems: "center" },
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
    whiteSpace: "nowrap",
    fontFamily: "inherit", // Forces it to use your sleek system font
    fontSize: "14px", // Locks the size across all browsers
  },
  outlineBtn: {
    display: "inline-block", // Crucial for making the <label> tag behave like a button
    backgroundColor: "transparent",
    color: "var(--text-main)",
    border: "1px solid var(--border-subtle)",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
    whiteSpace: "nowrap",
    fontFamily: "inherit", // Forces it to use your sleek system font
    fontSize: "14px", // Locks the size
    textAlign: "center",
    boxSizing: "border-box",
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
  td: { padding: "12px 16px", fontSize: "14px", verticalAlign: "middle" },

  thumbnail: {
    width: "28px",
    height: "40px",
    objectFit: "cover",
    borderRadius: "4px",
    border: "1px solid var(--border-subtle)",
  },
  truncateTitle: {
    maxWidth: "300px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "#ccc",
  },

  tagsWrapper: { display: "flex", gap: "6px", flexWrap: "wrap" },
  tagPill: {
    backgroundColor: "#2a2a2a",
    padding: "4px 8px",
    borderRadius: "12px",
    fontSize: "11px",
    color: "#8ab4f8",
    border: "1px solid var(--border-subtle)",
  },

  actionTd: {
    padding: "12px 16px",
    textAlign: "right",
    display: "flex",
    justifyContent: "flex-start",
    gap: "8px",
    alignItems: "center",
    height: "100%",
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

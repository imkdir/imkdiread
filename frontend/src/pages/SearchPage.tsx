import React from "react";
import Masonry from "react-masonry-css";
import type { User, Work, Series } from "../types";
import { request } from "../utils/APIClient";
import { useAuth } from "../components/AuthContext";

import { GoodreadsCover } from "../components/GoodreadsImages";
import searchIcon from "../assets/imgs/search.svg";

// --- Custom Debounce Utility ---
function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number,
): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  } as T;
}

// 1. Define Props to include the injected user
interface Props {
  user: User | null;
}

interface State {
  query: string;
  series: Series[];
  searchResults: Work[];
  loading: boolean;
  isEditMode: boolean;
  selectedIds: string[];
  bulkTagInput: string;
}

// 2. Rename to SearchPageClass
class SearchPageClass extends React.Component<Props, State> {
  state: State = {
    query: "",
    series: [],
    searchResults: [],
    loading: false, // We don't load anything until a search happens
    isEditMode: false,
    selectedIds: [],
    bulkTagInput: "",
  };

  componentDidMount() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get("q") || "";

    this.fetchSeries();

    if (initialQuery) {
      this.setState({ query: initialQuery, loading: true });
      this.performSearch(initialQuery);
    }
  }

  // Set the debounce delay to 1000ms (as it was in your code)
  debouncedSearch = debounce((q: string) => {
    this.performSearch(q);
  }, 1000);

  performSearch = (q: string) => {
    if (!q.trim()) {
      this.setState({ searchResults: [], loading: false });
      return;
    }

    request(`/api/search?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => {
        this.setState({
          ...this.state,
          searchResults: data.results || [],
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Search failed", err);
        this.setState({ loading: false });
      });
  };

  fetchSeries() {
    request("/api/series")
      .then((res) => res.json())
      .then((data: Series[]) => {
        this.setState({ series: data });
      })
      .catch((err) => {
        console.error("Failed to load series:", err);
      });
  }

  handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = event.target.value;

    // Instantly update the input field and set loading state, but debounce the actual fetch
    this.setState({ query: newQuery, loading: true });
    window.history.replaceState(null, "", `?q=${newQuery}`);

    this.debouncedSearch(newQuery);
  };

  toggleEditMode = () => {
    this.setState((prevState) => ({
      ...this.state,
      isEditMode: !prevState.isEditMode,
      selectedIds: [],
    }));
  };

  toggleSelection = (workId: string) => {
    this.setState((prevState) => {
      const isSelected = prevState.selectedIds.includes(workId);
      return {
        ...this.state,
        selectedIds: isSelected
          ? prevState.selectedIds.filter((id) => id !== workId)
          : [...prevState.selectedIds, workId],
      };
    });
  };

  handleBulkTagSubmit = () => {
    const { selectedIds, bulkTagInput } = this.state;
    if (selectedIds.length === 0 || !bulkTagInput.trim()) return;

    const newTags = bulkTagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t);

    request("/api/works/bulk-tags", {
      method: "POST",
      body: JSON.stringify({
        workIds: selectedIds,
        tags: newTags,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // Re-trigger the current search to show the updated tags
          this.performSearch(this.state.query);
          this.setState({
            ...this.state,
            bulkTagInput: "",
            selectedIds: [],
            isEditMode: false,
          });
        } else {
          alert("Failed to save tags.");
        }
      })
      .catch(() => alert("Network error."));
  };

  render() {
    const {
      query,
      series,
      searchResults,
      loading,
      isEditMode,
      selectedIds,
      bulkTagInput,
    } = this.state;

    // 3. Determine if the user is an admin
    const isAdmin = this.props.user?.role === "admin";
    const isTagBtnDisabled = selectedIds.length === 0 || !bulkTagInput.trim();

    return (
      <div style={styles.page}>
        <div
          style={{ ...styles.header, top: window.innerWidth <= 768 ? 60 : 0 }}
        >
          {/* Only render Edit Mode UI if they are an Admin and edit mode is active */}
          {isEditMode && isAdmin ? (
            <div style={styles.searchBarWrapper}>
              <input
                type="text"
                placeholder="Enter tags..."
                value={bulkTagInput}
                onChange={(e) =>
                  this.setState({ bulkTagInput: e.target.value })
                }
                style={styles.input}
                onKeyDown={(e) =>
                  e.key === "Enter" && this.handleBulkTagSubmit()
                }
              />
              <div style={styles.iconGroup}>
                {!selectedIds.length || (
                  <span>
                    <b>{selectedIds.length}</b> works selected
                  </span>
                )}
                <span style={styles.divider}>|</span>
                <button
                  onClick={this.handleBulkTagSubmit}
                  style={{
                    ...styles.primaryBtn,
                    opacity: isTagBtnDisabled ? 0.6 : 1.0,
                  }}
                  disabled={isTagBtnDisabled}
                >
                  Apply
                </button>
                {!searchResults.length || (
                  <button
                    onClick={this.toggleEditMode}
                    style={{ ...styles.primaryBtn, ...styles.secondaryBtn }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.searchBarWrapper}>
              <input
                type="text"
                placeholder="Search by title, author, or keyword"
                value={query}
                onChange={this.handleSearch}
                style={styles.input}
                autoFocus
              />
              <div style={styles.iconGroup}>
                {query && (
                  <span
                    style={styles.clearIcon}
                    onClick={() => {
                      this.setState({
                        ...this.state,
                        query: "",
                        searchResults: [],
                      });
                      window.history.replaceState(null, "", "?q=");
                    }}
                  >
                    ✕
                  </span>
                )}
                <span style={styles.divider}>|</span>

                {/* Only show the "Select" button if they are an Admin AND have results */}
                {isAdmin && searchResults.length ? (
                  <button
                    onClick={this.toggleEditMode}
                    style={styles.primaryBtn}
                  >
                    Select
                  </button>
                ) : (
                  <img
                    src={searchIcon}
                    style={styles.searchIcon}
                    alt={"search"}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div style={styles.mainContent}>
          {loading ? (
            <div style={styles.loading}>Searching...</div>
          ) : (
            <div style={styles.resultsContainer}>
              {query !== "" && searchResults.length > 0 && (
                <p style={styles.resultStats}>
                  About {searchResults.length} results (0.04 seconds)
                </p>
              )}

              {searchResults.length > 0 ? (
                <Masonry
                  breakpointCols={{ default: 6, 1100: 5, 700: 4, 500: 3 }}
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
                >
                  {searchResults.map((work) => {
                    const isSelected = selectedIds.includes(work.id);
                    return (
                      <div
                        key={work.id}
                        style={{
                          ...styles.workCard,
                          ...(isSelected && isEditMode
                            ? styles.selectedCard
                            : {}),
                        }}
                      >
                        <div
                          onClick={() =>
                            isEditMode &&
                            isAdmin &&
                            this.toggleSelection(work.id)
                          }
                        >
                          <GoodreadsCover
                            work={work}
                            disabled={isEditMode}
                            in_transition={true}
                            style={{ display: "block", borderRadius: "8px" }}
                          />
                          {/* Only show checkboxes if Admin and Edit Mode is active */}
                          {isEditMode && isAdmin && (
                            <div
                              style={
                                isSelected
                                  ? styles.checkboxActive
                                  : styles.checkboxInactive
                              }
                            >
                              {isSelected && "︎✔︎"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Masonry>
              ) : query !== "" && !loading ? (
                <div style={styles.noResults}>
                  <p style={{ marginTop: "20px" }}>
                    Your search - <b>{query}</b> - did not match any works.
                  </p>
                  <p style={{ marginTop: "10px" }}>Suggestions:</p>
                  <ul style={{ marginTop: "10px", marginLeft: "30px" }}>
                    <li>Make sure all words are spelled correctly.</li>
                    <li>Try more general searches.</li>
                  </ul>
                </div>
              ) : (
                <div style={styles.seriesGrid}>
                  {series.map((s) => (
                    <div
                      key={s.id}
                      style={styles.seriesCard}
                      onClick={() => {
                        this.setState({ query: s.text });
                        this.performSearch(s.text);
                      }}
                    >
                      <img
                        src={s.img_url}
                        style={styles.seriesBackground}
                        alt={s.text}
                      />
                      <span style={styles.seriesText}>{s.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

// 4. Create the Functional Wrapper to export
export const SearchPage = (props: any) => {
  const { user } = useAuth();
  return <SearchPageClass {...props} user={user} />;
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--goodreads-dark)",
    color: "var(--goodreads-light)",
    fontFamily: "-apple-system, system-ui, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 30px",
    position: "sticky",
    zIndex: 100,
  },
  searchBarWrapper: {
    position: "relative",
    width: "100%",
    maxWidth: "600px",
    display: "flex",
    alignItems: "center",
  },
  input: {
    width: "100%",
    height: "48px",
    padding: "0 10px 0 24px",
    fontSize: "16px",
    borderRadius: "34px",
    border: "1px solid #5f6368",
    outline: "none",
    color: "var(--text-main)",
    backgroundColor: "#00000080",
    boxShadow: "none",
  },
  iconGroup: {
    position: "absolute",
    right: "15px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#9aa0a6",
  },
  clearIcon: { cursor: "pointer", fontSize: "18px" },
  divider: { color: "#5f6368" },
  searchIcon: { height: "16px" },
  mainContent: { padding: "0 30px 40px 30px" },
  loading: { marginTop: "30px", color: "#9aa0a6" },
  resultsContainer: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  resultStats: { color: "#9aa0a6", fontSize: "14px", margin: "20px 0" },
  workCard: {
    borderRadius: "8px",
    border: "2px solid transparent",
    transition: "border-color 0.1s, transform 0.1s",
    position: "relative",
  },
  noResults: { color: "var(--text-main)", fontSize: "16px" },
  primaryBtn: {
    padding: "6px 16px",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "var(--logo-red)",
    color: "var(--text-main)",
    cursor: "pointer",
    fontWeight: "bold" as const,
    transition: "all 0.2s",
  },
  secondaryBtn: {
    border: "1px solid var(--border-subtle)",
    backgroundColor: "transparent",
  },
  selectedCard: {
    border: "2px solid var(--logo-red)",
    transform: "scale(0.98)",
  },
  checkboxInactive: {
    position: "absolute",
    top: "8px",
    left: "8px",
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    border: "2px solid rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  checkboxActive: {
    position: "absolute",
    top: "8px",
    left: "8px",
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    backgroundColor: "var(--logo-red)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: "bold" as const,
    zIndex: 10,
    border: "2px solid var(--logo-red)",
  },

  seriesGrid: {
    padding: "40px 20px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(25%, 1fr))",
    gap: "20px",
  },

  seriesCard: {
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  seriesBackground: {
    width: "100%",
    aspectRatio: 1.77,
    objectFit: "cover",
    filter: "blur(1px) brightness(60%)",
    transition: "filter 0.3s ease-in-out",
  },

  seriesText: {
    position: "absolute",
    zIndex: 1,
    fontSize: "2vw",
    color: "var(--text-main)",
    fontWeight: "bold",
  },
};

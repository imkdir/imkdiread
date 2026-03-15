import React from "react";
import Masonry from "react-masonry-css";
import { useNavigate } from "react-router-dom";
import type { User, Work } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";
import { useAuth } from "../components/AuthContext";
import { FloatingDrawer } from "../components/FloatingDrawer";
import { AppIcon } from "../components/AppIcon";

import { GoodreadsCover } from "../components/GoodreadsCover";

import "./SearchPage.css";

// --- Custom Debounce Utility ---
function debounce<TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
  delay: number,
) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: TArgs) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// 1. Define Props to include the injected user
interface Props {
  user: User | null;
  inDrawer?: boolean;
  initialQuery?: string;
  syncQueryToUrl?: boolean;
}

interface State {
  query: string;
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
    searchResults: [],
    loading: false, // We don't load anything until a search happens
    isEditMode: false,
    selectedIds: [],
    bulkTagInput: "",
  };

  componentDidMount() {
    const initialQuery = this.props.initialQuery || "";

    if (initialQuery) {
      this.setState({ query: initialQuery, loading: true });
      this.performSearch(initialQuery);
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.initialQuery === this.props.initialQuery) return;

    const nextQuery = this.props.initialQuery || "";
    this.setState({
      query: nextQuery,
      loading: !!nextQuery,
    });

    if (nextQuery) {
      this.performSearch(nextQuery);
      return;
    }

    this.setState({
      searchResults: [],
      loading: false,
    });
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
      .then(async (res) => {
        const data = await readJsonSafe<{ error?: string; results?: Work[] }>(
          res,
        );
        if (!res.ok) {
          throw new Error(getApiErrorMessage(data, "Search failed."));
        }
        return data;
      })
      .then((data) => {
        this.setState({
          searchResults: data?.results || [],
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Search failed", err);
        this.setState({ loading: false });
        showToast("Search failed.", { tone: "error" });
      });
  };

  handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = event.target.value;

    // Instantly update the input field and set loading state, but debounce the actual fetch
    this.setState({ query: newQuery, loading: true });
    if (this.props.syncQueryToUrl) {
      window.history.replaceState(null, "", `?q=${newQuery}`);
    }

    this.debouncedSearch(newQuery);
  };

  toggleEditMode = () => {
    this.setState((prevState) => ({
      isEditMode: !prevState.isEditMode,
      selectedIds: [],
    }));
  };

  toggleSelection = (workId: string) => {
    this.setState((prevState) => {
      const isSelected = prevState.selectedIds.includes(workId);
      return {
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
      .then(async (res) => {
        const data = await readJsonSafe<{
          success?: boolean;
          error?: string;
        }>(res);
        if (!res.ok || !data?.success) {
          throw new Error(getApiErrorMessage(data, "Failed to save tags."));
        }
        return data;
      })
      .then((data) => {
        void data;
        this.performSearch(this.state.query);
        this.setState({
          bulkTagInput: "",
          selectedIds: [],
          isEditMode: false,
        });
        showToast("Tags updated.", { tone: "success" });
      })
      .catch((error) =>
        showToast(
          error instanceof Error ? error.message : "Network error.",
          {
            tone: "error",
          },
        ),
      );
  };

  render() {
    const {
      query,
      searchResults,
      loading,
      isEditMode,
      selectedIds,
      bulkTagInput,
    } = this.state;

    // 3. Determine if the user is an admin
    const isAdmin = this.props.user?.role === "admin";
    const isTagBtnDisabled = selectedIds.length === 0 || !bulkTagInput.trim();
    const showLoadingOnly = loading && query !== "" && searchResults.length === 0;

    return (
      <div
        className={`search-page ${this.props.inDrawer ? "search-page--drawer" : ""}`}
        style={{
          ...styles.page,
          ...(this.props.inDrawer ? styles.pageInDrawer : {}),
        }}
      >
        <div
          style={{
            ...styles.header,
            top: this.props.inDrawer ? 0 : (window.innerWidth <= 768 ? 60 : 0),
          }}
        >
          {/* Only render Edit Mode UI if they are an Admin and edit mode is active */}
          {isEditMode && isAdmin ? (
            <div style={styles.searchBarWrapper}>
              <input
                id="global-search-input"
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
                id="global-search-input"
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
                        query: "",
                        searchResults: [],
                        loading: false,
                      });
                      if (this.props.syncQueryToUrl) {
                        window.history.replaceState(null, "", "?q=");
                      }
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
                  <AppIcon name="search" title="Search" style={styles.searchIcon} />
                )}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            ...styles.mainContent,
            ...(this.props.inDrawer ? styles.mainContentInDrawer : {}),
          }}
        >
          {showLoadingOnly ? (
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
                            className="search-page__cover"
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
                <div style={styles.emptyPrompt}>
                  Search by title, author, existing tags, or your new
                  <code style={styles.inlineCode}> genre:</code>
                  tags.
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
export const SearchPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initialQuery = new URLSearchParams(window.location.search).get("q") || "";

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <FloatingDrawer
      isOpen
      title="Search"
      onClose={handleClose}
      defaultPlacement="center"
      defaultViewportRatio={{ width: 0.8, height: 0.8 }}
      minSize={{ width: 640, height: 420 }}
      bodyStyle={styles.drawerBody}
    >
      <SearchPageClass
        user={user}
        inDrawer
        initialQuery={initialQuery}
        syncQueryToUrl
      />
    </FloatingDrawer>
  );
};

interface SearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const SearchDrawer: React.FC<SearchDrawerProps> = ({
  isOpen,
  onClose,
  initialQuery,
}) => {
  const { user } = useAuth();

  return (
    <FloatingDrawer
      isOpen={isOpen}
      title="Search"
      onClose={onClose}
      defaultPlacement="center"
      defaultViewportRatio={{ width: 0.8, height: 0.8 }}
      minSize={{ width: 640, height: 420 }}
      bodyStyle={styles.drawerBody}
    >
      <SearchPageClass user={user} inDrawer initialQuery={initialQuery} />
    </FloatingDrawer>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    backgroundColor: "var(--search-page-bg)",
    color: "var(--search-page-text)",
    fontFamily: "-apple-system, system-ui, sans-serif",
  },
  pageInDrawer: {
    minHeight: "100%",
    height: "100%",
    backgroundColor: "transparent",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
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
    border: "1px solid var(--search-page-input-border)",
    outline: "none",
    color: "var(--search-page-input-text)",
    backgroundColor: "var(--search-page-input-bg)",
    boxShadow: "none",
  },
  iconGroup: {
    position: "absolute",
    right: "15px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "var(--search-page-icon)",
  },
  clearIcon: { cursor: "pointer", fontSize: "18px" },
  divider: { color: "var(--search-page-divider)" },
  searchIcon: { width: "16px", height: "16px" },
  mainContent: { padding: "0 30px 40px 30px" },
  mainContentInDrawer: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  },
  drawerBody: {
    minHeight: 0,
    padding: 0,
  },
  loading: { marginTop: "30px", color: "var(--search-page-icon)" },
  resultsContainer: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  resultStats: {
    color: "var(--search-page-icon)",
    fontSize: "14px",
    margin: "20px 0",
  },
  workCard: {
    borderRadius: "8px",
    border: "2px solid transparent",
    transition: "border-color 0.1s, transform 0.1s",
    position: "relative",
  },
  noResults: { color: "var(--search-page-input-text)", fontSize: "16px" },
  primaryBtn: {
    padding: "6px 16px",
    borderRadius: "20px",
    border: "none",
    backgroundColor: "var(--search-page-primary-btn-bg)",
    color: "var(--search-page-primary-btn-text)",
    cursor: "pointer",
    fontWeight: "bold" as const,
    transition: "all 0.2s",
  },
  secondaryBtn: {
    border: "1px solid var(--search-page-secondary-btn-border)",
    backgroundColor: "transparent",
  },
  selectedCard: {
    border: "2px solid var(--search-page-selected-border)",
    transform: "scale(0.98)",
  },
  checkboxInactive: {
    position: "absolute",
    top: "8px",
    left: "8px",
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    border: "2px solid var(--search-page-checkbox-border)",
    backgroundColor: "var(--search-page-checkbox-bg)",
    zIndex: 10,
  },
  checkboxActive: {
    position: "absolute",
    top: "8px",
    left: "8px",
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    backgroundColor: "var(--search-page-primary-btn-bg)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--search-page-primary-btn-text)",
    fontWeight: "bold" as const,
    zIndex: 10,
    border: "2px solid var(--search-page-selected-border)",
  },

  emptyPrompt: {
    padding: "64px 20px",
    textAlign: "center",
    color: "var(--search-page-input-text)",
    fontSize: "16px",
    lineHeight: 1.8,
  },
  inlineCode: {
    marginLeft: "6px",
    marginRight: "6px",
    padding: "2px 8px",
    borderRadius: "999px",
    backgroundColor: "var(--search-page-input-bg)",
    border: "1px solid var(--search-page-input-border)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "14px",
  },
};

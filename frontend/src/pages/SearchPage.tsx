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
  enableSharedLayout?: boolean;
  onResultOpen?: (work: Work) => void;
}

interface State {
  query: string;
  searchResults: Work[];
  loading: boolean;
  isEditMode: boolean;
  selectedIds: string[];
  bulkTagInput: string;
  openingWorkId: string | null;
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
    openingWorkId: null,
  };
  private openWorkTimeout: ReturnType<typeof setTimeout> | null = null;

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

  componentWillUnmount() {
    if (this.openWorkTimeout) {
      clearTimeout(this.openWorkTimeout);
      this.openWorkTimeout = null;
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

  handleWorkCardClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    work: Work,
  ) => {
    const isAdmin = this.props.user?.role === "admin";

    if (this.state.isEditMode && isAdmin) {
      event.preventDefault();
      this.toggleSelection(work.id);
      return;
    }

    if (this.state.openingWorkId) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    this.setState({ openingWorkId: work.id });

    this.openWorkTimeout = setTimeout(() => {
      this.openWorkTimeout = null;
      this.props.onResultOpen?.(work);
    }, 180);
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
        showToast(error instanceof Error ? error.message : "Network error.", {
          tone: "error",
        }),
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
      openingWorkId,
    } = this.state;

    // 3. Determine if the user is an admin
    const isAdmin = this.props.user?.role === "admin";
    const isTagBtnDisabled = selectedIds.length === 0 || !bulkTagInput.trim();
    const showLoadingOnly =
      loading && query !== "" && searchResults.length === 0;

    return (
      <div
        className={[
          "search-page",
          this.props.inDrawer ? "search-page--drawer" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="search-page__header">
          {/* Only render Edit Mode UI if they are an Admin and edit mode is active */}
          {isEditMode && isAdmin ? (
            <div className="search-page__search-bar">
              <input
                id="global-search-input"
                type="text"
                placeholder="Enter tags..."
                value={bulkTagInput}
                onChange={(e) =>
                  this.setState({ bulkTagInput: e.target.value })
                }
                className="search-page__input"
                onKeyDown={(e) =>
                  e.key === "Enter" && this.handleBulkTagSubmit()
                }
              />
              <div className="search-page__icon-group">
                {!selectedIds.length || (
                  <span className="search-page__selection-count">
                    <b>{selectedIds.length}</b> works selected
                  </span>
                )}
                <span className="search-page__divider">|</span>
                <button
                  onClick={this.handleBulkTagSubmit}
                  className="search-page__button"
                  disabled={isTagBtnDisabled}
                >
                  Apply
                </button>
                {!searchResults.length || (
                  <button
                    onClick={this.toggleEditMode}
                    className="search-page__button search-page__button--secondary"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="search-page__search-bar">
              <input
                id="global-search-input"
                type="text"
                placeholder="Search by title, author, or tag"
                value={query}
                onChange={this.handleSearch}
                className="search-page__input"
                autoFocus
              />
              <div className="search-page__icon-group">
                {query && (
                  <button
                    type="button"
                    className="search-page__clear-button"
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
                  </button>
                )}
                <span className="search-page__divider">|</span>

                {/* Only show the "Select" button if they are an Admin AND have results */}
                {isAdmin && searchResults.length ? (
                  <button
                    onClick={this.toggleEditMode}
                    className="search-page__button"
                  >
                    Select
                  </button>
                ) : (
                  <AppIcon
                    name="search"
                    title="Search"
                    className="search-page__search-icon"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className={[
            "search-page__main-content",
            this.props.inDrawer ? "search-page__main-content--drawer" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {showLoadingOnly ? (
            <div className="search-page__loading">Searching...</div>
          ) : (
            <div className="search-page__results">
              {query !== "" && searchResults.length > 0 && (
                <p className="search-page__stats">
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
                        className={[
                          "search-page__work-card",
                          openingWorkId === work.id
                            ? "search-page__work-card--opening"
                            : "",
                          isSelected && isEditMode
                            ? "search-page__work-card--selected"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div
                          className="search-page__work-card-hitbox"
                        >
                          <GoodreadsCover
                            work={work}
                            disabled={isEditMode}
                            enableSharedLayout={this.props.enableSharedLayout}
                            className={[
                              "search-page__cover",
                              openingWorkId === work.id
                                ? "search-page__cover--opening"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onLinkClick={(event) =>
                              this.handleWorkCardClick(event, work)
                            }
                          />
                          {/* Only show checkboxes if Admin and Edit Mode is active */}
                          {isEditMode && isAdmin && (
                            <div
                              className={
                                isSelected
                                  ? "search-page__checkbox search-page__checkbox--active"
                                  : "search-page__checkbox"
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
                <div className="search-page__no-results">
                  <p className="search-page__no-results-copy">
                    Your search - <b>{query}</b> - did not match any works.
                  </p>
                  <p className="search-page__no-results-copy">Suggestions:</p>
                  <ul className="search-page__no-results-list">
                    <li>Make sure all words are spelled correctly.</li>
                    <li>Try more general searches.</li>
                  </ul>
                </div>
              ) : (
                <div className="search-page__empty-prompt">
                  Press ⌘ + K to open Search, and press Esc to close.
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
  const initialQuery =
    new URLSearchParams(window.location.search).get("q") || "";

  const handleClose = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const handleResultOpen = (work: Work) => {
    navigate(`/work/${work.id}`, { state: { work } });
  };

  return (
    <FloatingDrawer
      isOpen
      title="Search"
      onClose={handleClose}
      className="search-page__drawer-shell"
      defaultPlacement="center"
      defaultViewportRatio={{ width: 0.8, height: 0.8 }}
      minSize={{ width: 640, height: 420 }}
      bodyStyle={drawerBodyStyle}
    >
      <SearchPageClass
        user={user}
        inDrawer
        initialQuery={initialQuery}
        syncQueryToUrl
        enableSharedLayout={false}
        onResultOpen={handleResultOpen}
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
  const navigate = useNavigate();

  const handleResultOpen = (work: Work) => {
    onClose();
    navigate(`/work/${work.id}`, {
      state: { work, from: "search-drawer" },
    });
  };

  return (
    <FloatingDrawer
      isOpen={isOpen}
      title="Search"
      onClose={onClose}
      className="search-page__drawer-shell"
      defaultPlacement="center"
      defaultViewportRatio={{ width: 0.8, height: 0.8 }}
      minSize={{ width: 640, height: 420 }}
      bodyStyle={drawerBodyStyle}
    >
      <SearchPageClass
        user={user}
        inDrawer
        initialQuery={initialQuery}
        enableSharedLayout
        onResultOpen={handleResultOpen}
      />
    </FloatingDrawer>
  );
};

const drawerBodyStyle: React.CSSProperties = {
  minHeight: 0,
  padding: 0,
};

import React from "react";

import { useParams } from "react-router-dom";
import { type Work, type Author, type Quote } from "../types";
import { GoodreadsAuthorAvatar } from "../components/GoodreadsAuthorAvatar";
import { GoodreadsCover } from "../components/GoodreadsCover";
import { GoodreadsButton } from "../components/GoodreadsButton";
import { AppIcon } from "../components/AppIcon";
import { Modal } from "../components/Modal";
import { QuoteConversationWorkspace } from "../components/QuoteConversationWorkspace";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./AuthorPage.css";

interface AuthorQuote extends Quote {
  work: Work;
}

interface State {
  works: Work[];
  profile: Author | null;
  loading: boolean;
  activeTab: "works" | "quotes";
  isBioModalOpen: boolean;
  bioDraft: string;
  isSavingBio: boolean;
}

export function AuthorPageWrapper() {
  const { keyword } = useParams<{ keyword: string }>();
  return <AuthorPage keyword={keyword || ""} />;
}

export class AuthorPage extends React.Component<{ keyword: string }, State> {
  state: State = {
    works: [],
    profile: null,
    loading: true,
    activeTab: "works",
    isBioModalOpen: false,
    bioDraft: "",
    isSavingBio: false,
  };

  componentDidMount() {
    this.fetchData();
  }

  componentDidUpdate(prevProps: { keyword: string }) {
    if (prevProps.keyword !== this.props.keyword) {
      this.setState(
        {
          loading: true,
          activeTab: "works",
          works: [],
          profile: null,
          isBioModalOpen: false,
          bioDraft: "",
          isSavingBio: false,
        },
        this.fetchData,
      );
    }
  }

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

  fetchData = () => {
    const keyword = encodeURIComponent(this.props.keyword);

    request(`/api/collection/${keyword}`)
      .then(async (res) => {
        const data = await readJsonSafe<{
          works?: Work[];
          profile?: Author | null;
          error?: string;
        }>(res);
        if (!res.ok) {
          throw new Error(
            getApiErrorMessage(data, "Failed to load author page."),
          );
        }
        return data;
      })
      .then((data) => {
        this.setState({
          works: data?.works || [],
          profile: data?.profile || null,
          loading: false,
        });
      })
      .catch((err) => {
        console.error("Failed to fetch data", err);
        this.setState({ loading: false });
        showToast("Failed to load author page.", { tone: "error" });
      });
  };

  getAuthorQuotesFromWorks = (works: Work[]): AuthorQuote[] => {
    const quotes = works.flatMap((work) =>
      (work.quotes || [])
        .filter((quote) => quote.quote)
        .map((quote) => ({
          ...quote,
          work,
        })),
    );

    return quotes.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  };

  getAuthorQuotes = (): AuthorQuote[] => {
    return this.getAuthorQuotesFromWorks(this.state.works);
  };

  openBioModal = () => {
    const { profile } = this.state;
    if (!profile || !this.getIsAdmin()) return;

    this.setState({
      isBioModalOpen: true,
      bioDraft: profile.bio || "",
    });
  };

  closeBioModal = () => {
    this.setState({
      isBioModalOpen: false,
      bioDraft: "",
      isSavingBio: false,
    });
  };

  saveBio = async (e: React.FormEvent) => {
    e.preventDefault();
    const { profile, bioDraft } = this.state;
    if (!profile) return;

    this.setState({ isSavingBio: true });

    try {
      const res = await request(`/api/authors/${profile.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          bio: bioDraft,
          goodreads_id: profile.goodreads_id || "",
        }),
      });
      const data = await readJsonSafe<{
        success?: boolean;
        error?: string;
        author?: Author;
      }>(res);

      if (!res.ok || !data?.success || !data.author) {
        throw new Error(
          getApiErrorMessage(data, "Failed to update author bio."),
        );
      }

      this.setState({
        profile: data.author,
        isBioModalOpen: false,
        bioDraft: "",
        isSavingBio: false,
      });
      showToast("Author bio updated.", { tone: "success" });
    } catch (error) {
      console.error("Failed to update author bio", error);
      this.setState({ isSavingBio: false });
      showToast(
        error instanceof Error ? error.message : "Failed to update author bio.",
        { tone: "error" },
      );
    }
  };

  render() {
    const {
      works,
      profile,
      loading,
      activeTab,
      isBioModalOpen,
      bioDraft,
      isSavingBio,
    } = this.state;
    const authorQuotes = this.getAuthorQuotes();
    const isAdmin = this.getIsAdmin();

    if (loading) {
      return <div className="author-page__loading" />;
    }

    if (!profile) {
      return (
        <div className="author-page__empty-state">
          <h2 className="author-page__empty-title">Author not found</h2>
          <p className="author-page__empty-text">
            We could not find a matching author profile for this collection.
          </p>
        </div>
      );
    }

    const hasBio = !!profile.bio?.trim();

    return (
      <div className="author-page">
        <div className="author-page__container">
          <div className="author-page__header">
            <div className="author-page__avatar-container">
              <GoodreadsAuthorAvatar
                author={profile}
                className="author-page__avatar"
                disableAdminUpload={true}
              />
              <GoodreadsButton
                category="author"
                goodreadsId={profile.goodreads_id}
                resourceId={profile.id}
                onSavedId={(goodreadsId) =>
                  this.setState((prev) => ({
                    profile: prev.profile
                      ? { ...prev.profile, goodreads_id: goodreadsId }
                      : null,
                  }))
                }
                style={{
                  backgroundColor: "var(--author-page-goodreads-button-bg)",
                }}
                className="author-page__goodreads-button"
              />
            </div>

            <div className="author-page__info">
              <span className="author-page__name">{profile.name}</span>
              <div className="author-page__meta-line">
                <button
                  type="button"
                  className={`author-page__meta-button ${activeTab === "works" ? "author-page__meta-button--active" : ""}`}
                  onClick={() => this.setState({ activeTab: "works" })}
                >
                  {profile.works_count} works
                </button>
                <span>·</span>
                <button
                  type="button"
                  className={`author-page__meta-button ${activeTab === "quotes" ? "author-page__meta-button--active" : ""}`}
                  onClick={() => this.setState({ activeTab: "quotes" })}
                >
                  {authorQuotes.length} quotes
                </button>
              </div>

              <div
                className={`author-page__bio-block ${!hasBio ? "author-page__bio-block--empty" : ""} ${isAdmin ? "author-page__bio-block--editable" : ""}`}
                onClick={isAdmin ? this.openBioModal : undefined}
                role={isAdmin ? "button" : undefined}
                tabIndex={isAdmin ? 0 : undefined}
                onKeyDown={
                  isAdmin
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          this.openBioModal();
                        }
                      }
                    : undefined
                }
              >
                <p className="author-page__bio-text">
                  {hasBio ? profile.bio : "More about..."}
                </p>
                {!isAdmin || (
                  <button
                    type="button"
                    className="author-page__bio-edit"
                    onClick={(event) => {
                      event.stopPropagation();
                      this.openBioModal();
                    }}
                    aria-label="Edit author bio"
                  >
                    <AppIcon name="edit" title="Edit bio" size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="author-page__grid-container">
            {activeTab === "works" ? (
              works.length ? (
                <div className="author-page__works-grid">
                  {works.map((work) => (
                    <GoodreadsCover
                      key={work.id}
                      work={work}
                      className="author-page__cover"
                    />
                  ))}
                </div>
              ) : (
                <div className="author-page__empty-state">
                  <div className="author-page__empty-icon">📚</div>
                  <h2 className="author-page__empty-title">No Works Yet</h2>
                  <p className="author-page__empty-text">
                    This author does not have any works in your library yet.
                  </p>
                </div>
              )
            ) : (
              <div className="author-page__quotes-workspace">
                <QuoteConversationWorkspace
                  key={`author-quote-workspace-${profile.id}`}
                  workId={works[0]?.id || ""}
                  quotes={authorQuotes}
                  onRefresh={this.fetchData}
                />
              </div>
            )}
          </div>
        </div>

        <Modal
          isOpen={isBioModalOpen}
          onClose={this.closeBioModal}
          cardClassName="modal-card--wide"
        >
          <div className="modal-header">
            <AppIcon name="edit" title="Edit bio" size={16} />
            <p className="modal-subtitle">
              Add a short public bio for this author
            </p>
          </div>

          <form onSubmit={this.saveBio} className="author-page__bio-modal-form">
            <textarea
              value={bioDraft}
              onChange={(event) =>
                this.setState({ bioDraft: event.target.value })
              }
              className="modal-input author-page__bio-modal-textarea"
              placeholder="Write a short author bio..."
              rows={8}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                onClick={this.closeBioModal}
                className="modal-btn modal-btn--cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingBio}
                className="modal-btn modal-btn--save"
              >
                {isSavingBio ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }
}

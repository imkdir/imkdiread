import React, { PureComponent } from "react";
import { AppIcon } from "./AppIcon";
import { request } from "../utils/APIClient";
import { Modal } from "./Modal";
import goodreadsIcon from "../assets/imgs/goodreads.png";

interface Props {
  category: "book" | "author";
  goodreadsId?: string | null;
  resourceId?: string | number;
  style?: React.CSSProperties;
  className?: string;
  onSavedId?: (goodreadsId: string) => void;
}

interface State {
  isModalOpen: boolean;
  draftId: string;
  isSaving: boolean;
}

export class GoodreadsButton extends PureComponent<Props, State> {
  state: State = {
    isModalOpen: false,
    draftId: "",
    isSaving: false,
  };

  render() {
    const { isModalOpen, draftId, isSaving } = this.state;

    return (
      <>
        <div
          className={this.props.className}
          style={{ ...styles.root, ...this.props.style }}
          onClick={this.handleButtonClick}
        >
          <AppIcon
            name="goodreads"
            width={64}
            height={16}
            title="Goodreads"
            style={styles.icon}
          />
        </div>

        <Modal isOpen={isModalOpen} onClose={this.closeModal}>
          <div className="modal-header">
            <img
              src={goodreadsIcon}
              alt="Goodreads"
              width={20}
              height={20}
              title="Goodreads"
            />
            <p className="modal-subtitle">
              Enter their Goodreads ID to open its Goodreads page.
            </p>
          </div>
          <form onSubmit={this.handleSubmit}>
            <input
              value={draftId}
              onChange={(event) =>
                this.setState({ draftId: event.target.value })
              }
              placeholder={`Goodreads ${this.props.category} ID`}
              className="modal-input"
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--cancel"
                onClick={this.closeModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="modal-btn modal-btn--save"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Open Goodreads"}
              </button>
            </div>
          </form>
        </Modal>
      </>
    );
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

  getOpenPath = (goodreadsId: string) => {
    const { category } = this.props;
    return `https://www.goodreads.com/${category}/show/${goodreadsId}`;
  };

  getSaveEndpoint = () => {
    const { category, resourceId } = this.props;
    if (!resourceId) return null;

    return category === "author"
      ? `/api/authors/${resourceId}/goodreads-id`
      : `/api/works/${encodeURIComponent(String(resourceId))}/goodreads-id`;
  };

  handleButtonClick = () => {
    const goodreadsId = this.props.goodreadsId?.trim();
    if (goodreadsId) {
      window.open(this.getOpenPath(goodreadsId), "_blank");
      return;
    }

    this.setState({
      isModalOpen: true,
      draftId: "",
      isSaving: false,
    });
  };

  closeModal = () => {
    this.setState({
      isModalOpen: false,
      draftId: "",
      isSaving: false,
    });
  };

  handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const goodreadsId = this.state.draftId.trim();
    if (!goodreadsId) {
      alert("Goodreads ID is required.");
      return;
    }

    const isAdmin = this.getIsAdmin();
    const saveEndpoint = this.getSaveEndpoint();

    this.setState({ isSaving: true });

    try {
      if (isAdmin && saveEndpoint) {
        const res = await request(saveEndpoint, {
          method: "PUT",
          body: JSON.stringify({ goodreads_id: goodreadsId }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to save Goodreads ID.");
        }
      }

      this.props.onSavedId?.(goodreadsId);
      window.open(this.getOpenPath(goodreadsId), "_blank");
      this.closeModal();
    } catch (error) {
      console.error("Failed to save Goodreads ID:", error);
      this.setState({ isSaving: false });
      alert("Failed to save Goodreads ID.");
    }
  };
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    height: "24px",
    border: "none",
    padding: "4px 8px 0px 8px",
    borderRadius: "8px",
    cursor: "pointer",
  },
  icon: {
    height: "16px",
    transform: "translateY(1px)",
  },
};

import React from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useAuth } from "./AuthContext";

// 1. Define the props our wrapper will inject
interface Props {
  navigate: NavigateFunction;
  auth: {
    logout: () => void;
  };
}

export const SignOutButtonWrapper = () => {
  const navigate = useNavigate();
  const auth = useAuth();

  return <SignOutButton navigate={navigate} auth={auth} />;
};

class SignOutButton extends React.Component<Props> {
  handleSignOut = () => {
    const { auth, navigate } = this.props;

    auth.logout();
    navigate("/login");
  };

  render() {
    return (
      <button
        title="Log out"
        onClick={this.handleSignOut}
        className="sidebar-link"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          color: "var(--text-main)", // Subtly red to indicate a destructive action
          display: "flex",
          alignItems: "center",
          padding: "12px",
          fontSize: "16px",
        }}
      >
        {/* Clean SVG Exit Icon */}
        <span
          className="sidebar-icon"
          style={{ display: "flex", alignItems: "center", marginRight: "16px" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </span>
      </button>
    );
  }
}

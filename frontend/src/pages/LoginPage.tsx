import React, { Component } from "react";
import {
  useNavigate,
  useLocation,
  type NavigateFunction,
  type Location,
} from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import type { User } from "../types";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./LoginPage.css";

interface PageProps {
  navigate: NavigateFunction;
  location: Location;
  auth: {
    login: (userData: User, token: string) => void;
  };
}

interface PageState {
  username: string;
  password: string;
  inviteCode: string;
  isSignup: boolean;
  alreadySignedUp: boolean;
  images: string[];
  index: number;
}

export const LoginPageWrapper = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  return <LoginPage navigate={navigate} location={location} auth={auth} />;
};

class LoginPage extends Component<PageProps, PageState> {
  constructor(props: PageProps) {
    super(props);
    this.state = {
      username: "",
      password: "",
      inviteCode: "",
      isSignup: false,
      alreadySignedUp: false,
      images: [],
      index: 0,
    };
  }

  componentDidMount(): void {
    this.loadData();
  }

  handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { username, password, inviteCode, isSignup } = this.state;
    const { auth, navigate, location } = this.props;

    // Figure out where to redirect after login
    const from = location.state?.from?.pathname || "/";

    try {
      const url = isSignup ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, inviteCode }),
      });

      const data = await readJsonSafe<{
        error?: string;
        user?: User;
        token?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(
            data,
            isSignup ? "Sign up failed." : "Login failed.",
          ),
        );
      }

      if (isSignup) {
        this.setState({
          ...this.state,
          isSignup: false,
          alreadySignedUp: true,
        });
        showToast("Account created. You can log in now.", { tone: "success" });
      } else {
        if (!data?.user || !data?.token) {
          throw new Error("Login failed.");
        }
        auth.login(data.user, data.token);
        navigate(from, { replace: true });
      }
    } catch (err: unknown) {
      console.error("Login failed:", err);
      showToast(err instanceof Error ? err.message : "Login failed.", {
        tone: "error",
      });
    }
  };

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "username") {
      this.setState({ username: value });
    } else if (name === "password") {
      this.setState({ password: value });
    } else if (name === "inviteCode") {
      this.setState({ inviteCode: value });
    }
  };

  loadData() {
    fetch(`/api/screensavers`)
      .then(async (res) => {
        const data = await readJsonSafe<{ images?: string[]; index?: number }>(
          res,
        );
        if (!res.ok || !data?.images) {
          throw new Error(getApiErrorMessage(data, "Failed to load imagery."));
        }
        return data;
      })
      .then((data) => {
        this.setState({
          images: data.images || [],
          index: data.index || 0,
        });
      })
      .catch((err) => {
        console.error("Failed to load data:", err);
        showToast("Failed to load login background images.", {
          tone: "error",
        });
      });
  }

  render() {
    const {
      username,
      password,
      inviteCode,
      isSignup,
      alreadySignedUp,
      images,
      index,
    } = this.state;

    return (
      <div className="login-page">
        {!images.length || (
          <img
            src={images[index]}
            alt="screensaver"
            className="login-page__background"
          />
        )}
        <form onSubmit={this.handleSubmit} className="login-page__form">
          <input
            className="simple-input login-page__input"
            type="text"
            name="username"
            placeholder="Username"
            value={username}
            onChange={this.handleInputChange}
            required
          />
          <input
            className="simple-input login-page__input"
            name="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={this.handleInputChange}
            required
          />

          {!isSignup || (
            <input
              className="simple-input login-page__input"
              name="inviteCode"
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={this.handleInputChange}
            />
          )}
          <button type="submit" className="login-page__button">
            {isSignup ? "Sign Up" : "Log In"}
          </button>

          {!isSignup && !alreadySignedUp && (
            <button
              className="login-page__button"
              onClick={() => this.setState({ isSignup: !isSignup })}
            >
              {"I'm Invited"}
            </button>
          )}
        </form>
      </div>
    );
  }
}

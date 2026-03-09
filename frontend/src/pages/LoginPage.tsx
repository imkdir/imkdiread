import React, { Component } from "react";
import {
  useNavigate,
  useLocation,
  type NavigateFunction,
  type Location,
} from "react-router-dom";
import { useAuth } from "../components/AuthContext";

interface PageProps {
  navigate: NavigateFunction;
  location: Location;
  auth: {
    login: (userData: any, token: string) => void;
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

export const LoginPageWrapper = (props: any) => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  return (
    <LoginPage {...props} navigate={navigate} location={location} auth={auth} />
  );
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      if (isSignup) {
        this.setState({
          ...this.state,
          isSignup: false,
          alreadySignedUp: true,
        });
      } else {
        auth.login(data.user, data.token);
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      console.error("Login failed:", err);
    }
  };

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    this.setState({ ...this.state, [name]: value });
  };

  loadData() {
    fetch(`/api/screensavers`)
      .then((res) => res.json())
      .then((data: { images: string[]; index: number }) => {
        this.setState({ ...this.state, ...data });
      })
      .catch((err) => {
        console.error("Failed to load data:", err);
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
      <div style={styles.container}>
        {!images.length || (
          <img
            src={images[index]}
            alt="screensaver"
            style={styles.background}
          />
        )}
        <form onSubmit={this.handleSubmit} style={styles.form}>
          <input
            className="auth-input"
            type="text"
            name="username"
            placeholder="Username"
            value={username}
            onChange={this.handleInputChange}
            style={styles.input}
            required
          />
          <input
            className="auth-input"
            name="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={this.handleInputChange}
            style={styles.input}
            required
          />

          {!isSignup || (
            <input
              className="auth-input"
              name="inviteCode"
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={this.handleInputChange}
              style={styles.input}
            />
          )}
          <button type="submit" style={styles.button}>
            {isSignup ? "Sign Up" : "Log In"}
          </button>

          {!isSignup && !alreadySignedUp && (
            <button
              style={styles.button}
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

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "var(--goodreads-dark)",
  },
  background: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: 0,
  },
  form: {
    position: "fixed",
    top: "20px",
    right: "20px",
    display: "flex",
    gap: "16px",
    alignItems: "center",
    background: "rgba(255, 255, 255, 0.4)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    boxShadow: "2px 6px 15px rgba(0, 0, 0, 0.2)",
    borderRadius: "24px",
    padding: "12px",
    maxWidth: "960px",
    zIndex: 1,
  },
  input: {
    padding: "12px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "rgba(0,0,0,0.15)",
    color: "var(--goodreads-light)",
    fontSize: "16px",
  },
  button: {
    padding: "10px 12px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "rgba(255,255,255,0.6)",
    color: "var(--goodreads-brown)",
    fontSize: "16px",
    fontWeight: "540",
    fontFamily: "Fredoka",
    cursor: "pointer",
  },
};

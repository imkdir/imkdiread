import React from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "./AppIcon";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

interface PageState {
  images: string[];
  index: number;
  isUploading: boolean;
}

export class SplashPage extends React.Component<
  Record<string, never>,
  PageState
> {
  private uploadInputRef = React.createRef<HTMLInputElement>();

  state: PageState = {
    images: [],
    index: 0,
    isUploading: false,
  };

  componentDidMount(): void {
    this.loadData();
  }

  render() {
    const { images, index, isUploading } = this.state;
    const isAdmin = this.getIsAdmin();

    return (
      <div style={styles.root}>
        <div style={styles.container}>
          <Link to={"/explore"} style={{ textDecoration: "none" }}>
            {!images.length || (
              <span
                className="splash-title"
                style={{
                  backgroundImage: `url(${images[index]})`,
                  ...styles.clipText,
                }}
              >
                {"P D F"}
              </span>
            )}
          </Link>
          <div style={styles.actions}>
            {isAdmin && (
              <>
                <button
                  onClick={() => this.uploadInputRef.current?.click()}
                  style={styles.button}
                  type="button"
                  disabled={isUploading}
                  aria-label="Upload screensaver"
                  title="Upload screensaver"
                >
                  <AppIcon name="upload" size={24} style={styles.buttonIcon} />
                </button>
                <input
                  ref={this.uploadInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    void this.handleUpload(event);
                  }}
                />
              </>
            )}
            <button
              onClick={() => this.nextScreenshot()}
              style={styles.button}
              type="button"
              aria-label="Next screensaver"
              title="Next screensaver"
            >
              <AppIcon name="instagram" size={24} style={styles.buttonIcon} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  loadData() {
    request("/api/screensavers")
      .then(async (res) => {
        const data = await readJsonSafe<{
          images?: string[];
          index?: number;
          error?: string;
        }>(res);
        if (!res.ok || !data?.images) {
          throw new Error(
            getApiErrorMessage(data, "Failed to load screensavers."),
          );
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
        showToast("Failed to load screensavers.", { tone: "error" });
      });
  }

  getIsAdmin() {
    try {
      const rawUser = localStorage.getItem("user");
      if (!rawUser) return false;
      const user = JSON.parse(rawUser) as { role?: string };
      return user?.role === "admin";
    } catch {
      return false;
    }
  }

  async handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    this.setState({ isUploading: true });

    try {
      const res = await request("/api/screensavers", {
        method: "POST",
        body: formData,
      });
      const data = await readJsonSafe<{
        success?: boolean;
        error?: string;
      }>(res);

      if (!res.ok || !data?.success) {
        throw new Error(
          getApiErrorMessage(data, "Failed to upload screensaver."),
        );
      }

      await this.loadData();
      showToast("Screensaver uploaded.", { tone: "success" });
    } catch (error) {
      console.error("Failed to upload screensaver:", error);
      showToast(
        error instanceof Error ? error.message : "Failed to upload screensaver.",
        { tone: "error" },
      );
    } finally {
      this.setState({ isUploading: false });
    }
  }

  nextScreenshot() {
    const { index, images } = this.state;

    if (!images.length) return;

    this.setState({
      ...this.state,
      index: (index + 1) % images.length,
    });
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    fontFamily: "arial, sans-serif",
    backgroundColor: "var(--theme-page-background)",
    color: "var(--text-main)",
  },
  container: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  clipText: {
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  button: {
    border: "none",
    color: "var(--text-main)",
    backgroundColor: "transparent",
    padding: "8px 8px",
    cursor: "pointer",
  },
  actions: {
    position: "absolute",
    right: "20px",
    bottom: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  buttonIcon: {
    width: "24px",
    height: "24px",
  },
};

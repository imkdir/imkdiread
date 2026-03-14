import React from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "./AppIcon";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

interface PageState {
  images: string[];
  index: number;
}

export class SplashPage extends React.Component<
  Record<string, never>,
  PageState
> {
  state: PageState = {
    images: [],
    index: 0,
  };

  componentDidMount(): void {
    this.loadData();
  }

  render() {
    const { images, index } = this.state;

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
          <button onClick={() => this.nextScreenshot()} style={styles.button}>
            <AppIcon name="instagram" size={24} style={styles.buttonIcon} />
          </button>
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
    position: "absolute",
    right: "20px",
    bottom: "20px",
    padding: "8px 8px",
    cursor: "pointer",
  },
  buttonIcon: {
    width: "24px",
    height: "24px",
  },
};

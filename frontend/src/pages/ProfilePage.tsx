import React, { Component } from "react";
import { request } from "../utils/APIClient";
import type { Quote, ReadingActivity, User, Work } from "../types";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";
import {
  ProfileAvatar,
  ProfileLayout,
} from "./profilePageShared";

import "./ProfilePage.css";

interface RichQuote extends Quote {
  work?: Work | null;
}

interface PageState {
  user: User | null;
  reading: Work[];
  favorites: Work[];
  shelved: Work[];
  quotes: RichQuote[];
  activities: ReadingActivity[];
  isLoading: boolean;
  email: string;
  isEmailPublic: boolean;
  isEditing: boolean;
}

export class ProfilePage extends Component<Record<string, never>, PageState> {
  private fileInputRef = React.createRef<HTMLInputElement>();
  private emailInputRef = React.createRef<HTMLInputElement>();

  constructor(props: Record<string, never>) {
    super(props);
    this.state = {
      user: null,
      reading: [],
      favorites: [],
      shelved: [],
      quotes: [],
      activities: [],
      isLoading: true,
      email: "",
      isEmailPublic: false,
      isEditing: false,
    };
  }

  componentDidMount() {
    this.fetchProfileData();
  }

  fetchProfileData = async () => {
    try {
      const res = await request("/api/profile/me");
      const data = await readJsonSafe<{
        error?: string;
        userInfo?: User | null;
        reading?: Work[];
        favorites?: Work[];
        shelved?: Work[];
        quotes?: RichQuote[];
        activities?: ReadingActivity[];
      }>(res);
      if (!res.ok || !data?.userInfo) {
        throw new Error(getApiErrorMessage(data, "Failed to load profile."));
      }

      this.setState(
        {
          user: data.userInfo,
          reading: data.reading || [],
          favorites: data.favorites || [],
          shelved: data.shelved || [],
          quotes: data.quotes || [],
          activities: data.activities || [],
          email: data.userInfo?.email || "",
          isEmailPublic: Boolean(data.userInfo?.is_email_public),
          isLoading: false,
        },
        this.adjustTextInputWidth,
      );
    } catch (err: unknown) {
      console.error("Failed to load profile", err);
      this.setState({ isLoading: false });
      showToast("Failed to load profile.", { tone: "error" });
    }
  };

  handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await request("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await readJsonSafe<{
        success?: boolean;
        error?: string;
        avatar_url?: string;
      }>(res);
      if (!res.ok || !data?.success || !data.avatar_url) {
        throw new Error(getApiErrorMessage(data, "Failed to upload avatar."));
      }
      this.setState((prevState) => ({
        user: prevState.user
          ? { ...prevState.user, avatar_url: data.avatar_url }
          : null,
      }));
      showToast("Avatar updated.", { tone: "success" });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to upload avatar.",
        { tone: "error" },
      );
    }
  };

  checkEditingState = () => {
    const { user, email, isEmailPublic } = this.state;
    const isEditing =
      (user?.email || "") !== email ||
      Boolean(user?.is_email_public) !== isEmailPublic;
    this.setState({ isEditing });
  };

  adjustTextInputWidth = () => {
    const el = this.emailInputRef.current;
    if (el) {
      el.style.width = "auto";
      el.style.width = `${el.scrollWidth}px`;
    }
  };

  handleSaveSettings = async () => {
    const { email, isEmailPublic: is_email_public } = this.state;

    try {
      const res = await request("/api/profile/me", {
        method: "PUT",
        body: JSON.stringify({
          email,
          is_email_public,
        }),
      });

      const data = await readJsonSafe<{
        error?: string;
        user?: User;
      }>(res);
      if (!res.ok || !data?.user) {
        throw new Error(getApiErrorMessage(data, "Failed to save settings."));
      }

      showToast("Settings saved successfully.", { tone: "success" });
      this.setState((prevState) => ({
        user: data.user || prevState.user,
        isEditing: false,
        email: data.user?.email ?? email,
        isEmailPublic: data.user?.is_email_public ?? is_email_public,
      }));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save settings.",
        { tone: "error" },
      );
    }
  };

  render() {
    const {
      user,
      reading,
      favorites,
      shelved,
      quotes,
      activities,
      isLoading,
      email,
      isEmailPublic,
      isEditing,
    } = this.state;

    if (isLoading || !user) {
      return (
        <div className="profile-page">
          <div className="profile-page__container">
            <div className="profile-page__loading" />
          </div>
        </div>
      );
    }

    return (
      <>
        <input
          type="file"
          accept="image/jpeg, image/png, image/webp"
          hidden
          ref={this.fileInputRef}
          onChange={this.handleAvatarUpload}
        />

        <ProfileLayout
          reading={reading}
          favorites={favorites}
          shelved={shelved}
          quotes={quotes}
          activities={activities}
          header={
            <header className="profile-page__hero">
              <ProfileAvatar
                user={user}
                clickable
                onClick={() => this.fileInputRef.current?.click()}
                title="Click to change avatar"
              />

              <div className="profile-page__hero-copy">
                <h1 className="profile-page__headline">{user.username}</h1>
                <div className="profile-page__settings-row">
                  <div className="profile-page__email-field">
                    <input
                      ref={this.emailInputRef}
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        this.setState(
                          { email: e.target.value },
                          this.checkEditingState,
                        );
                        this.adjustTextInputWidth();
                      }}
                      className="profile-page__email-input"
                    />
                    <label className="profile-page__public-toggle">
                      <input
                        type="checkbox"
                        checked={isEmailPublic}
                        onChange={(e) =>
                          this.setState(
                            {
                              isEmailPublic: e.target.checked,
                            },
                            this.checkEditingState,
                          )
                        }
                        title="Check for public email"
                      />
                    </label>
                  </div>

                  {isEditing && (
                    <button
                      type="button"
                      className="profile-page__save-button"
                      onClick={this.handleSaveSettings}
                    >
                      Save changes
                    </button>
                  )}
                </div>
              </div>
            </header>
          }
        />
      </>
    );
  }
}

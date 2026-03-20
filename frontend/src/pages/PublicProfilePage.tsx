import { Component } from "react";
import { useParams } from "react-router-dom";
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
  notFound: boolean;
}

export function PublicProfilePageWrapper() {
  const { username } = useParams<{ username: string }>();
  return <PublicProfilePage username={username || ""} />;
}

export class PublicProfilePage extends Component<
  { username: string },
  PageState
> {
  state: PageState = {
    user: null,
    reading: [],
    favorites: [],
    shelved: [],
    quotes: [],
    activities: [],
    isLoading: true,
    notFound: false,
  };

  componentDidMount() {
    this.fetchProfileData();
  }

  componentDidUpdate(prevProps: { username: string }) {
    if (prevProps.username !== this.props.username) {
      this.setState(
        {
          user: null,
          reading: [],
          favorites: [],
          shelved: [],
          quotes: [],
          activities: [],
          isLoading: true,
          notFound: false,
        },
        this.fetchProfileData,
      );
    }
  }

  fetchProfileData = async () => {
    try {
      const res = await request(
        `/api/profiles/${encodeURIComponent(this.props.username)}`,
      );

      const data = await readJsonSafe<{
        error?: string;
        userInfo?: User | null;
        reading?: Work[];
        favorites?: Work[];
        shelved?: Work[];
        quotes?: RichQuote[];
        activities?: ReadingActivity[];
      }>(res);

      if (res.status === 404) {
        this.setState({ isLoading: false, notFound: true });
        return;
      }
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(data, "Failed to load public profile."),
        );
      }

      this.setState({
        user: data?.userInfo || null,
        reading: data?.reading || [],
        favorites: data?.favorites || [],
        shelved: data?.shelved || [],
        quotes: data?.quotes || [],
        activities: data?.activities || [],
        isLoading: false,
        notFound: false,
      });
    } catch (err: unknown) {
      console.error("Failed to load public profile", err);
      this.setState({ isLoading: false, notFound: true });
      showToast("Failed to load public profile.", { tone: "error" });
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
      notFound,
    } = this.state;

    if (isLoading) {
      return (
        <div className="profile-page">
          <div className="profile-page__container">
            <div className="profile-page__loading" />
          </div>
        </div>
      );
    }

    if (notFound || !user) {
      return (
        <ProfileLayout
          reading={[]}
          favorites={[]}
          shelved={[]}
          quotes={[]}
          activities={[]}
          header={null}
          emptyStateTitle="Profile not found"
          emptyStateBody="We could not find a public profile for this user."
        />
      );
    }

    return (
      <ProfileLayout
        reading={reading}
        favorites={favorites}
        shelved={shelved}
        quotes={quotes}
        activities={activities}
        header={
          <header className="profile-page__hero">
            <ProfileAvatar user={user} clickable={false} />

            <div className="profile-page__hero-copy">
              <h1 className="profile-page__headline">{user.username}</h1>
              {!user.email || (
                <p className="profile-page__public-meta">{user.email}</p>
              )}
            </div>
          </header>
        }
      />
    );
  }
}

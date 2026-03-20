import React from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../components/AppIcon";
import type { Quote, ReadingActivity, User, Work } from "../types";

interface RichQuote extends Quote {
  work?: Work | null;
}

type TimelineItem =
  | {
      kind: "quote";
      id: string;
      created_at: string;
      quote: RichQuote;
    }
  | {
      kind: "activity";
      id: string;
      created_at: string;
      activity: ReadingActivity;
    };

interface ShelfSection {
  key: string;
  title: string;
  emptyText: string;
  works: Work[];
}

interface ProfileLayoutProps {
  reading: Work[];
  favorites: Work[];
  shelved: Work[];
  quotes: RichQuote[];
  activities: ReadingActivity[];
  loading?: boolean;
  header: React.ReactNode;
  emptyStateTitle?: string;
  emptyStateBody?: string;
}

function formatTimelineDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildTimelineItems(
  quotes: RichQuote[],
  activities: ReadingActivity[],
): TimelineItem[] {
  const timeline = [
    ...quotes.map(
      (quote): TimelineItem => ({
        kind: "quote",
        id: `quote-${quote.id}`,
        created_at: quote.created_at,
        quote,
      }),
    ),
    ...activities.map(
      (activity, index): TimelineItem => ({
        kind: "activity",
        id: `activity-${activity.work_id}-${activity.created_at}-${index}`,
        created_at: activity.created_at,
        activity,
      }),
    ),
  ];

  return timeline.sort((left, right) => {
    const leftTime = new Date(left.created_at).getTime();
    const rightTime = new Date(right.created_at).getTime();
    return rightTime - leftTime;
  });
}

function renderShelfRow(work: Work, sectionKey: string) {
  const progressPercent =
    work.page_count > 0
      ? Math.max(
          0,
          Math.min(100, ((work.current_page || 0) / work.page_count) * 100),
        )
      : 0;

  return (
    <div key={`${sectionKey}-${work.id}`} className="profile-page__shelf-item">
      <Link
        to={`/work/${work.id}`}
        state={{ work }}
        className="profile-page__shelf-link"
      >
        {work.title}
      </Link>
      {sectionKey === "reading" && (
        <div className="profile-page__shelf-row-side">
          <div className="profile-page__progress-track">
            <div
              className="profile-page__progress-bar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="profile-page__progress-text">
            Pg. {work.current_page || 0} / {work.page_count}
          </span>
        </div>
      )}
    </div>
  );
}

function renderTimelineItem(item: TimelineItem) {
  if (item.kind === "quote") {
    const { quote } = item;

    return (
      <article key={item.id} className="profile-page__timeline-card">
        <div className="profile-page__timeline-icon">
          <AppIcon name="edit" title="Quote" size={15} />
        </div>
        <div className="profile-page__timeline-body">
          <div className="profile-page__timeline-topline">
            <span className="profile-page__timeline-kind">Quote</span>
            <span className="profile-page__timeline-date">
              {formatTimelineDate(quote.created_at)}
            </span>
          </div>
          <p className="profile-page__timeline-copy">{quote.quote}</p>
          {(quote.work || quote.page_number) && (
            <div className="profile-page__timeline-footer">
              {quote.work ? (
                <Link
                  to={`/work/${quote.work.id}`}
                  state={{ work: quote.work }}
                  className="profile-page__timeline-link"
                >
                  {quote.work.title}
                </Link>
              ) : (
                <span className="profile-page__timeline-muted">
                  Unknown work
                </span>
              )}
              {quote.page_number ? (
                <span className="profile-page__timeline-muted">
                  Pg. {quote.page_number}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </article>
    );
  }

  const { activity } = item;
  const activityLabel =
    activity.current_page && activity.page_count
      ? `Reached page ${activity.current_page} of ${activity.page_count}`
      : activity.current_page
        ? `Reached page ${activity.current_page}`
        : "Updated reading progress";

  return (
    <article key={item.id} className="profile-page__timeline-card">
      <div className="profile-page__timeline-icon profile-page__timeline-icon--activity">
        <AppIcon name="clock" title="Activity" size={15} />
      </div>
      <div className="profile-page__timeline-body">
        <div className="profile-page__timeline-topline">
          <span className="profile-page__timeline-kind">Reading activity</span>
          <span className="profile-page__timeline-date">
            {formatTimelineDate(activity.created_at)}
          </span>
        </div>
        <p className="profile-page__timeline-copy">{activityLabel}</p>
        {!activity.notes || (
          <p className="profile-page__timeline-note">{activity.notes}</p>
        )}
        {activity.work && (
          <div className="profile-page__timeline-footer">
            <Link
              to={`/work/${activity.work.id}`}
              state={{ work: activity.work }}
              className="profile-page__timeline-link"
            >
              {activity.work.title}
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

interface ProfileAvatarProps {
  user: User | null;
  clickable?: boolean;
  onClick?: () => void;
  title?: string;
}

export function ProfileAvatar({
  user,
  clickable = true,
  onClick,
  title,
}: ProfileAvatarProps) {
  return (
    <div
      className={`profile-page__avatar-wrapper ${clickable ? "profile-page__avatar-wrapper--clickable" : ""}`}
      onClick={clickable ? onClick : undefined}
      title={title}
    >
      {user?.avatar_url ? (
        <img
          src={user.avatar_url}
          alt="Avatar"
          className="profile-page__avatar"
        />
      ) : (
        <AppIcon
          name="instagram"
          title="Avatar"
          size={60}
          className="profile-page__avatar profile-page__avatar--placeholder"
        />
      )}
    </div>
  );
}

export function ProfileLayout({
  reading,
  favorites,
  shelved,
  quotes,
  activities,
  header,
  emptyStateTitle,
  emptyStateBody,
}: ProfileLayoutProps) {
  const shelves: ShelfSection[] = [
    {
      key: "reading",
      title: `Reading (${reading.length})`,
      emptyText: "Not reading anything right now.",
      works: reading,
    },
    {
      key: "favorites",
      title: `Favorites (${favorites.length})`,
      emptyText: "No favorites yet.",
      works: favorites,
    },
    {
      key: "shelved",
      title: `Shelved (${shelved.length})`,
      emptyText: "Nothing shelved yet.",
      works: shelved,
    },
  ];

  const timeline = buildTimelineItems(quotes, activities);

  if (emptyStateTitle) {
    return (
      <div className="profile-page">
        <div className="profile-page__container">
          <section className="profile-page__panel profile-page__panel--single">
            <h1 className="profile-page__headline">{emptyStateTitle}</h1>
            {!emptyStateBody || (
              <p className="profile-page__empty-text">{emptyStateBody}</p>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-page__container">
        {header}

        <div className="profile-page__columns">
          <div className="profile-page__left-column">
            {shelves.map((section) => (
              <section
                key={section.key}
                className="profile-page__shelf-section"
              >
                <h2 className="profile-page__section-title">{section.title}</h2>
                {section.works.length ? (
                  <div className="profile-page__shelf-list">
                    {section.works.map((work) =>
                      renderShelfRow(work, section.key),
                    )}
                  </div>
                ) : (
                  <p className="profile-page__empty-text">
                    {section.emptyText}
                  </p>
                )}
              </section>
            ))}
          </div>

          <div className="profile-page__right-column">
            <section className="profile-page__panel profile-page__panel--timeline">
              <div className="profile-page__panel-header">
                <h2 className="profile-page__section-title">Timeline</h2>
                <span className="profile-page__panel-count">
                  {timeline.length} entries
                </span>
              </div>
              {timeline.length ? (
                <div className="profile-page__timeline-list">
                  {timeline.map(renderTimelineItem)}
                </div>
              ) : (
                <p className="profile-page__empty-text">
                  No public quotes or activity yet.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

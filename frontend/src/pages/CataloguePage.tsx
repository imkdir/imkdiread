import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import type { ExploreResponse, Work } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./CataloguePage.css";

const emptyExploreData: ExploreResponse = {
  showcase: [],
  catalogue: {
    with_cover: [],
    without_cover: [],
  },
};

function getSectionKey(workId: string): string {
  const initial = (workId || "").trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : "#";
}

function groupWorksBySection(works: Work[]) {
  const groups = new Map<string, Work[]>();

  works.forEach((work) => {
    const key = getSectionKey(work.id);
    const sectionWorks = groups.get(key) || [];
    sectionWorks.push(work);
    groups.set(key, sectionWorks);
  });

  return Array.from(groups.entries()).sort(([left], [right]) => {
    if (left === "#") return 1;
    if (right === "#") return -1;
    return left.localeCompare(right);
  });
}

function CatalogueListItem({ work }: { work: Work }) {
  const authors = work.authors.length ? work.authors.join(", ") : "";

  return (
    <article className="catalogue-page__item">
      <h3 className="catalogue-page__item-title">
        <Link to={`/work/${work.id}`} state={{ work }}>
          {work.title}
        </Link>
      </h3>
      <p className="catalogue-page__item-meta">{authors}</p>
    </article>
  );
}

export function CataloguePage() {
  const { user } = useAuth();
  const [data, setData] = useState<ExploreResponse>(emptyExploreData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    request("/api/explore")
      .then(async (res) => {
        const payload = await readJsonSafe<
          ExploreResponse & { error?: string }
        >(res);

        if (!res.ok) {
          throw new Error(
            getApiErrorMessage(payload, "Failed to fetch catalogue data."),
          );
        }

        return payload;
      })
      .then((payload) => {
        if (!isMounted) return;

        setData(payload || emptyExploreData);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to fetch catalogue data", error);
        if (!isMounted) return;

        setLoading(false);
        showToast("Failed to load catalogue data.", { tone: "error" });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const isAdmin = user?.role === "admin";
  const coveredSections = useMemo(
    () => groupWorksBySection(data.catalogue.with_cover),
    [data.catalogue.with_cover],
  );

  return (
    <div className="catalogue-page">
      <div className="catalogue-page__container">
        <section className="catalogue-page__hero">
          <div>
            <p className="catalogue-page__eyebrow">Browse the</p>
            <h1 className="catalogue-page__title">Catalogue</h1>
          </div>
          <Link to="/explore" className="catalogue-page__back-link">
            back to showcase
          </Link>
        </section>

        <section className="catalogue-page__columns">
          <div className="catalogue-page__column">
            {loading ? (
              <div className="catalogue-page__loading-block">
                Loading books…
              </div>
            ) : coveredSections.length ? (
              coveredSections.map(([section, works]) => (
                <section
                  key={section}
                  className="catalogue-page__letter-section"
                >
                  <div className="catalogue-page__letter-heading">
                    {section}
                  </div>
                  <div className="catalogue-page__list">
                    {works.map((work) => (
                      <CatalogueListItem key={work.id} work={work} />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="catalogue-page__empty-block">
                No covered books in the catalogue yet.
              </div>
            )}
          </div>

          {isAdmin && !!data.catalogue.without_cover.length && (
            <div className="catalogue-page__column catalogue-page__column--drafts">
              <div className="catalogue-page__list">
                {data.catalogue.without_cover.map((work) => (
                  <CatalogueListItem key={work.id} work={work} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GoodreadsCover } from "../components/GoodreadsCover";
import type { ExploreResponse } from "../types";
import { request } from "../utils/APIClient";
import { getApiErrorMessage, readJsonSafe } from "../utils/apiResponse";
import { showToast } from "../utils/toast";

import "./ExplorePage.css";

const emptyExploreData: ExploreResponse = {
  showcase: [],
  catalogue: {
    with_cover: [],
    without_cover: [],
  },
};

export function ExplorePage() {
  const [data, setData] = useState<ExploreResponse>(emptyExploreData);

  useEffect(() => {
    let isMounted = true;

    request("/api/explore")
      .then(async (res) => {
        const payload = await readJsonSafe<
          ExploreResponse & { error?: string }
        >(res);

        if (!res.ok) {
          throw new Error(
            getApiErrorMessage(payload, "Failed to fetch explore data."),
          );
        }

        return payload;
      })
      .then((payload) => {
        if (!isMounted) return;

        setData(payload || emptyExploreData);
      })
      .catch((error) => {
        console.error("Failed to fetch explore data", error);
        if (!isMounted) return;

        showToast("Failed to load explore data.", { tone: "error" });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const showcaseCount = data.showcase.length;

  return (
    <div className="explore-page">
      <div className="explore-page__container">
        <section className="explore-page__section explore-page__section--hero">
          <p className="explore-page__eyebrow">Library spotlight</p>
          <div className="explore-page__heading-row">
            <h1 className="explore-page__title">Showcase</h1>
            <Link
              to="/explore/catalogue"
              className="explore-page__catalogue-link"
            >
              browse the catalogue
            </Link>
          </div>
        </section>

        {showcaseCount && (
          <section className="explore-page__section explore-page__section--grid">
            <div className="explore-page__grid">
              {data.showcase.map((work) => (
                <GoodreadsCover
                  key={work.id}
                  work={work}
                  className="explore-page__cover"
                  linkClassName="explore-page__cover-link"
                  imageClassName="explore-page__cover-image"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

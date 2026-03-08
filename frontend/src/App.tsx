import React from "react";
import { AuthorPageWrapper } from "./pages/AuthorPage";
import { AuthorsPage } from "./pages/AuthorsPage";
import { SearchPage } from "./pages/SearchPage";
import { ExplorePage } from "./pages/ExplorePage";
import { DetailPageWrapper } from "./pages/DetailPage";
import { AdminWorksPage } from "./pages/admin/AdminWorksPage";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SplashPage } from "./components/SplashPage";
import { SidebarLayout } from "./components/SidebarLayout";
import { AdminAuthorsPage } from "./pages/admin/AdminAuthorsPage";
import { AdminLayout } from "./components/AdminLayout";
import { AdminTagsPage } from "./pages/admin/AdminTagsPage";
import { ScrollToTop } from "./components/ScrollToTop";
import { NotFound } from "./components/NotFound";

export default class App extends React.Component<any, any> {
  render() {
    return (
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<SidebarLayout />}>
            <Route path="/" element={<SplashPage />} />

            <Route path="/search" element={<SearchPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route
              path="/collection/:keyword"
              element={<AuthorPageWrapper />}
            />
            <Route path="/work/:id" element={<DetailPageWrapper />} />

            <Route path="/authors" element={<AuthorsPage />} />
          </Route>

          <Route path="/admin" element={<AdminLayout />}>
            <Route path="works" element={<AdminWorksPage />} />
            <Route path="authors" element={<AdminAuthorsPage />} />
            <Route path="tags" element={<AdminTagsPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    );
  }
}

import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthorPageWrapper } from "./pages/AuthorPage";
import { AuthorsPage } from "./pages/AuthorsPage";
import { SearchPage } from "./pages/SearchPage";
import { ExplorePage } from "./pages/ExplorePage";
import { DetailPageWrapper } from "./pages/DetailPage";
import { AdminWorksPage } from "./pages/admin/AdminWorksPage";
import { SplashPage } from "./components/SplashPage";
import { SidebarLayout } from "./components/SidebarLayout";
import { AdminAuthorsPage } from "./pages/admin/AdminAuthorsPage";
import { AdminLayout } from "./components/AdminLayout";
import { AdminTagsPage } from "./pages/admin/AdminTagsPage";
import { ScrollToTop } from "./components/ScrollToTop";
import { NotFound } from "./components/NotFound";

import { AuthProvider } from "./components/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPageWrapper } from "./pages/LoginPage";

export default class App extends React.Component<any, any> {
  render() {
    return (
      // 1. Wrap the entire app so auth state is available everywhere
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* --- PUBLIC ROUTE --- */}
            <Route path="/login" element={<LoginPageWrapper />} />

            {/* --- GENERAL USER ROUTES (Guests & Admins) --- */}
            <Route
              element={
                <ProtectedRoute>
                  <SidebarLayout />
                </ProtectedRoute>
              }
            >
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

            {/* --- ADMIN ONLY ROUTES --- */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="works" element={<AdminWorksPage />} />
              <Route path="authors" element={<AdminAuthorsPage />} />
              <Route path="tags" element={<AdminTagsPage />} />
            </Route>

            {/* --- 404 CATCH-ALL --- */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    );
  }
}

import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthorPageWrapper } from "./pages/AuthorPage";
import { AuthorsPage } from "./pages/AuthorsPage";
import { SearchPage } from "./pages/SearchPage";
import { ExplorePage } from "./pages/ExplorePage";
import { ProfilePage } from "./pages/ProfilePage";
import { PublicProfilePageWrapper } from "./pages/PublicProfilePage";
import { DetailPageWrapper } from "./pages/DetailPage";
import { SplashPage } from "./components/SplashPage";
import { SidebarLayout } from "./components/SidebarLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { NotFound } from "./components/NotFound";
import { ToastViewport } from "./components/ToastViewport";

import { AuthProvider } from "./components/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPageWrapper } from "./pages/LoginPage";

export default class App extends React.Component<Record<string, never>> {
  render() {
    return (
      // 1. Wrap the entire app so auth state is available everywhere
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <ToastViewport />
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
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/users/:username" element={<PublicProfilePageWrapper />} />
              <Route
                path="/collection/:keyword"
                element={<AuthorPageWrapper />}
              />
              <Route path="/work/:id" element={<DetailPageWrapper />} />
              <Route
                path="/authors"
                element={
                  <ProtectedRoute requireAdmin={true}>
                    <AuthorsPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* --- 404 CATCH-ALL --- */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    );
  }
}

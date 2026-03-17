import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { ScrollToTop } from "./components/ScrollToTop";
import { NotFound } from "./components/NotFound";
import { ToastViewport } from "./components/ToastViewport";
import { AuthProvider } from "./components/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const AuthorPageWrapper = lazy(async () => ({
  default: (await import("./pages/AuthorPage")).AuthorPageWrapper,
}));
const AuthorsPage = lazy(async () => ({
  default: (await import("./pages/AuthorsPage")).AuthorsPage,
}));
const SearchPage = lazy(async () => ({
  default: (await import("./pages/SearchPage")).SearchPage,
}));
const ExplorePage = lazy(async () => ({
  default: (await import("./pages/ExplorePage")).ExplorePage,
}));
const ProfilePage = lazy(async () => ({
  default: (await import("./pages/ProfilePage")).ProfilePage,
}));
const PublicProfilePageWrapper = lazy(async () => ({
  default: (await import("./pages/PublicProfilePage")).PublicProfilePageWrapper,
}));
const DetailPageWrapper = lazy(async () => ({
  default: (await import("./pages/DetailPage")).DetailPageWrapper,
}));
const SplashPage = lazy(async () => ({
  default: (await import("./components/SplashPage")).SplashPage,
}));
const SidebarLayout = lazy(async () => ({
  default: (await import("./components/SidebarLayout")).SidebarLayout,
}));
const LoginPageWrapper = lazy(async () => ({
  default: (await import("./pages/LoginPage")).LoginPageWrapper,
}));

const styles: { [key: string]: React.CSSProperties } = {
  routeFallback: {
    minHeight: "100vh",
    width: "100%",
    background: "var(--page-background)",
  },
};

const routeFallback = <div style={styles.routeFallback} />;

export default class App extends React.Component<Record<string, never>> {
  render() {
    return (
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <ToastViewport />
          <Suspense fallback={routeFallback}>
            <Routes>
              <Route path="/login" element={<LoginPageWrapper />} />
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
                <Route
                  path="/users/:username"
                  element={<PublicProfilePageWrapper />}
                />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    );
  }
}

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export const ProtectedRoute = ({
  children,
  requireAdmin = false,
}: {
  children: React.JSX.Element;
  requireAdmin?: boolean;
}) => {
  const { user } = useAuth();
  const location = useLocation();

  // If not logged in, send them to the login page
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the route requires an Admin but they are a Guest, send them to the home page
  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
};

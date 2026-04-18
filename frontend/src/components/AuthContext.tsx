import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "../types";
import { AUTH_LOGOUT_EVENT } from "../utils/APIClient";

type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

function readStoredUser(): User | null {
  try {
    const savedUser = localStorage.getItem("user");
    return savedUser ? (JSON.parse(savedUser) as User) : null;
  } catch (error) {
    console.warn("Failed to parse saved user from localStorage:", error);
    localStorage.removeItem("user");
    return null;
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("token");
  });

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  }, []);

  const login = useCallback((userData: User, newToken: string) => {
    setUser(userData);
    setToken(newToken);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", newToken);
  }, []);

  useEffect(() => {
    const handleForcedLogout = () => {
      logout();
    };

    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    };
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

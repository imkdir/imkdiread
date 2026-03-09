export const request = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 401 = Unauthorized (No token), 403 = Forbidden (Token expired/Invalid)
  if (response.status === 401 || response.status === 403) {
    console.warn("Session expired or unauthorized. Logging out...");

    // Wipe the dead token
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
};

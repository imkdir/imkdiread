export const request = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers || {});
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!isFormData && options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

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

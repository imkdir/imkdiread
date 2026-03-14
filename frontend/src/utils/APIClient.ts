const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const resolveApiUrl = (url: string) => {
  if (!apiBaseUrl || /^https?:\/\//.test(url) || url.startsWith("//")) {
    return url;
  }

  return url.startsWith("/") ? `${apiBaseUrl}${url}` : `${apiBaseUrl}/${url}`;
};

const shouldForceLogout = async (response: Response) => {
  if (response.status === 401) {
    return true;
  }

  if (response.status !== 403) {
    return false;
  }

  try {
    const data = (await response.clone().json()) as { error?: string };
    return data?.error === "Invalid or expired token.";
  } catch {
    return false;
  }
};

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

  const response = await fetch(resolveApiUrl(url), {
    ...options,
    headers,
  });

  if (await shouldForceLogout(response)) {
    console.warn("Session expired or unauthorized. Logging out...");

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
};

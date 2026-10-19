export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  const internal = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
  return `${internal.replace(/\/+$/, "")}/api/v1`;
}

export const API_BASE = typeof window !== "undefined"
  ? "/api/v1"
  : `${(process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000").replace(/\/+$/, "")}/api/v1`;

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("leadgen_access_token");
}

export function getStoredUser(): any | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("leadgen_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function logoutUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("leadgen_access_token");
  localStorage.removeItem("leadgen_user");
  window.dispatchEvent(new Event("auth_change"));
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => ({ ok: false, error: "INVALID_JSON" }));

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "REQUEST_FAILED");
  }

  return data;
}

export function getHealth() {
  return request("/health");
}

export function register(payload) {
  return request("/auth/register", { method: "POST", body: payload });
}

export function login(payload) {
  return request("/auth/login", { method: "POST", body: payload });
}

export function getMe(token) {
  return request("/auth/me", { token });
}

export function getUsers(token) {
  return request("/users", { token });
}

export { API_BASE_URL };
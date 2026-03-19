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

export function uploadDocument(token, file) {
  const formData = new FormData();
  formData.append("file", file);
  return fetch(`${API_BASE_URL}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then((r) => r.json());
}

export function analyseDocument(token, document_id) {
  return request("/documents/analyse", { method: "POST", body: { document_id }, token });
}

export function getDocuments(token) {
  return request("/documents", { token });
}

export function getDocument(token, id) {
  return request(`/documents/${id}`, { token });
}

export function deleteDocument(token, id) {
  return request(`/documents/${id}`, { method: "DELETE", token });
}

export function getAdminStats(token) {
  return request("/admin/stats", { token });
}

export function getAdminUsers(token) {
  return request("/admin/users", { token });
}

export function promoteToAdmin(token, userId) {
  return request(`/admin/users/${userId}/admin`, { method: "POST", token });
}

export function deleteUser(token, userId) {
  return request(`/admin/users/${userId}`, { method: "DELETE", token });
}

export { API_BASE_URL };